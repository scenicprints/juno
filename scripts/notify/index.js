// Juno — daily notifier. Runs in GitHub Actions (see .github/workflows/notify.yml).
// Reads each user's data from Firestore and sends FCM push for the three triggers the user
// asked for. Reuses the EXACT app logic (../../js/*) so notifications never disagree with the app.
import admin from 'firebase-admin';
import { predict, activePeriod } from '../../js/predict.js';
import { window as fertWindow, confirmedOvulation } from '../../js/fertility.js';
import { moodForecast } from '../../js/mood.js';
import { today, prettyDate, fmt, addDays, diffDays } from '../../js/dates.js';

const APP_URL = 'https://scenicprints.github.io/juno/';

const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!svc.project_id) { console.error('Missing/invalid FIREBASE_SERVICE_ACCOUNT secret.'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

// TEST=true (manual workflow dispatch) → send a one-off "it works" push to every registered device.
const TEST = process.env.TEST === 'true';

// Decide which messages (if any) to send today for one user.
function triggersFor(cycles, days, settings) {
  const mode = settings.mode || 'avoid';
  const p = predict(cycles, settings);
  if (p.state === 'none') return [];
  const fert = fertWindow(p, mode);
  const tc = confirmedOvulation(cycles, days);
  const mf = moodForecast(cycles, days, p);
  const t = today();
  const out = [];

  // 1) period in ~5 days
  if (!activePeriod(cycles) && p.daysUntil === 5) {
    out.push(`Heads up — her period is expected in about 5 days (around ${prettyDate(p.nextStart)}).`);
  }

  // 2) safe-sex window opens / ends (avoid mode)
  if (mode === 'avoid' && fert) {
    if (diffDays(t, fert.fertileStart) === 0) {
      out.push(`Red light — no unprotected sex starting today. She's fertile through ${prettyDate(fert.fertileEnd)}.`);
    }
    const safeAgain = tc ? tc.infertileFrom : fmt(addDays(fert.fertileEnd, 1));
    if (t === safeAgain) {
      out.push(`Green light — you can have sex again as of today (past her fertile window). Not 100% — it's awareness, not birth control.`);
    }
  }

  // 3) incoming mood dip (the forecast, not a log)
  if (mf && mf.signal && mf.forecastStart && t === mf.forecastStart) {
    out.push(`Heads up — she may have a rougher few days ahead${mf.forecastEnd ? `, through ${prettyDate(mf.forecastEnd)}` : ''}.`);
  }

  return out;
}

async function main() {
  const users = await db.collection('users').get();
  let sent = 0;
  for (const u of users.docs) {
    const uid = u.id;
    const [cycSnap, daySnap, setSnap, pushSnap] = await Promise.all([
      db.collection(`users/${uid}/cycles`).get(),
      db.collection(`users/${uid}/days`).get(),
      db.doc(`users/${uid}/meta/settings`).get(),
      db.doc(`users/${uid}/meta/push`).get(),
    ]);
    const cycles = cycSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const days = {};
    daySnap.forEach((d) => { days[d.id] = d.data(); });
    const settings = setSnap.exists ? setSnap.data() : {};
    const tokens = (pushSnap.exists && Array.isArray(pushSnap.data().tokens)) ? pushSnap.data().tokens : [];
    if (!tokens.length) continue;

    const msgs = TEST ? ['Test notification from Juno — push is working.'] : triggersFor(cycles, days, settings);
    for (const body of msgs) {
      const res = await admin.messaging().sendEachForMulticast({
        tokens,
        data: { title: 'Juno', body, url: APP_URL },
        webpush: { headers: { Urgency: 'high' } },
      });
      sent += res.successCount;
      console.log(`user ${uid}: "${body}" → ${res.successCount}/${tokens.length}`);

      // prune tokens that are no longer valid
      const dead = [];
      res.responses.forEach((r, i) => {
        const code = r.error && r.error.code;
        if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument')) {
          dead.push(tokens[i]);
        }
      });
      if (dead.length) {
        await db.doc(`users/${uid}/meta/push`)
          .update({ tokens: admin.firestore.FieldValue.arrayRemove(...dead) })
          .catch(() => {});
      }
    }
  }
  console.log(`done — ${sent} notification(s) sent.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
