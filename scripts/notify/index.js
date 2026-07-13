// Juno — daily notifier. Runs every ~15 min in GitHub Actions (see .github/workflows/notify.yml).
// Reuses the app's own logic (../../js/*) so notifications never disagree with the app.
//
// - Digest notifications (period / red-light / green-light / mood-dip): once per day, at/after the
//   user's local morning time, respecting each per-type toggle, de-duplicated via meta/push.sent.
// - Temperature reminder: opt-in, fired within ~15 min of the local time the user set.
// Timezone comes from settings.tz (the phone's IANA zone). Note: the prediction date-equality
// triggers use UTC "today" internally, which equals the user's local date at a morning send time
// for US timezones — fine for this app.
import admin from 'firebase-admin';
import { predict, activePeriod } from '../../js/predict.js';
import { window as fertWindow, confirmedOvulation } from '../../js/fertility.js';
import { moodForecast } from '../../js/mood.js';
import { today, prettyDate, fmt, addDays, diffDays } from '../../js/dates.js';

const APP_URL = 'https://scenicprints.github.io/juno/';
const DIGEST_LOCAL_MIN = 8 * 60;  // send the daily digest at/after 8:00am local
const REMINDER_WINDOW = 20;       // minutes past the set time a run still counts (covers cron jitter)

const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!svc.project_id) { console.error('Missing/invalid FIREBASE_SERVICE_ACCOUNT secret.'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();
const TEST = process.env.TEST === 'true';

function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: (+parts.hour) * 60 + (+parts.minute) };
}
function hhmmToMin(s) { const [h, m] = String(s || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); }

// keyed once-daily digest triggers
function digestTriggers(cycles, days, settings) {
  const mode = settings.mode || 'avoid';
  const p = predict(cycles, settings);
  if (p.state === 'none') return [];
  const fert = fertWindow(p, mode);
  const tc = confirmedOvulation(cycles, days);
  const mf = moodForecast(cycles, days, p);
  const t = today();
  const out = [];
  if (!activePeriod(cycles) && p.daysUntil === 5) {
    out.push({ key: 'period', body: `Heads up — her period is expected in about 5 days (around ${prettyDate(p.nextStart)}).` });
  }
  if (mode === 'avoid' && fert) {
    if (diffDays(t, fert.fertileStart) === 0) {
      out.push({ key: 'redlight', body: `Red light — no unprotected sex starting today. She's fertile through ${prettyDate(fert.fertileEnd)}.` });
    }
    const safeAgain = tc ? tc.infertileFrom : fmt(addDays(fert.fertileEnd, 1));
    if (t === safeAgain) {
      out.push({ key: 'greenlight', body: `Green light — you can have sex again as of today (past her fertile window). Not 100% — it's awareness, not birth control.` });
    }
  }
  if (mf && mf.signal && mf.forecastStart && t === mf.forecastStart) {
    out.push({ key: 'mooddip', body: `Heads up — she may have a rougher few days ahead${mf.forecastEnd ? `, through ${prettyDate(mf.forecastEnd)}` : ''}.` });
  }
  return out;
}

async function send(uid, tokens, body, sentKey, localDate) {
  const res = await admin.messaging().sendEachForMulticast({
    tokens, data: { title: 'Juno', body, url: APP_URL }, webpush: { headers: { Urgency: 'high' } },
  });
  console.log(`user ${uid}: [${sentKey || 'test'}] "${body}" → ${res.successCount}/${tokens.length}`);
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument')) dead.push(tokens[i]);
  });
  const update = {};
  if (sentKey) update.sent = { [sentKey]: localDate };
  if (dead.length) update.tokens = admin.firestore.FieldValue.arrayRemove(...dead);
  if (Object.keys(update).length) await db.doc(`users/${uid}/meta/push`).set(update, { merge: true }).catch(() => {});
  return res.successCount;
}

async function main() {
  const users = await db.collection('users').get();
  let total = 0;
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
    const pushDoc = pushSnap.exists ? pushSnap.data() : {};
    const tokens = Array.isArray(pushDoc.tokens) ? pushDoc.tokens : [];
    if (!tokens.length) continue;

    const prefs = settings.notifPrefs || {};
    const sent = pushDoc.sent || {};
    const { date: localDate, minutes: localMin } = localNow(settings.tz);

    if (TEST) { total += await send(uid, tokens, 'Test notification from Juno — push is working.', null, localDate); continue; }

    // once-daily digest (respect per-type toggle + dedup + morning window)
    if (localMin >= DIGEST_LOCAL_MIN) {
      for (const trig of digestTriggers(cycles, days, settings)) {
        if (prefs[trig.key] === false) continue;
        if (sent[trig.key] === localDate) continue;
        total += await send(uid, tokens, trig.body, trig.key, localDate);
      }
    }

    // daily temperature reminder (opt-in; at the user's chosen local time)
    if (prefs.temp === true && settings.tempReminder && settings.tempReminder.time) {
      const target = hhmmToMin(settings.tempReminder.time);
      if (localMin >= target && localMin < target + REMINDER_WINDOW && sent.temp !== localDate) {
        total += await send(uid, tokens, 'Time to take her temperature 🌡️ — right after waking, before getting up.', 'temp', localDate);
      }
    }
  }
  console.log(`done — ${total} notification(s) sent.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
