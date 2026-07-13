# Juno — Roadmap & Continuity Guide

> **THE LAW — read this first.**
> This repository **is** the entire project. There is no local copy and no memory outside
> these files. Any Claude agent — on any account — continues Juno like this:
> 1. Read this file top-to-bottom (then `BACKLOG.md`).
> 2. Do the work for the current batch.
> 3. **Before you stop, update this file** — current status, what you changed, any decision or
>    gotcha — then commit and push to `main`. **If you didn't update ROADMAP.md, the work isn't done.**
> The next agent starts from whatever you leave here. Leave it true.

---

## 0. How another Claude agent picks this up (the "switch accounts" workflow)
- **Repo (code only, no personal data):** https://github.com/scenicprints/juno
- **Live app:** https://scenicprints.github.io/juno/
- To continue: clone the repo into a **temporary/scratch dir** (we keep nothing permanently
  local), read this file + `BACKLOG.md`, make changes, `git push origin main`. **GitHub Pages
  redeploys automatically** on every push to `main` — no build step.
- `git`/`gh` auth is **machine-level** (authed as `scenicprints`), so switching Claude
  *accounts* on the same machine just works. On a new machine: `gh auth login` as `scenicprints` first.
- Entry point for agents is `CLAUDE.md` (auto-loaded by Claude Code).

## 1. What Juno is
A private period & cycle tracker for a couple who both use it (he's on **Android**, she's on
**iPhone**). Three **co-equal** pillars — all present from v0.1:
1. **Period prediction** — when her next period will start.
2. **Mood forecast** — predict cycle-linked mood dips (PMS) so both can plan around them.
3. **Can / cannot window** — conservative fertility-awareness guidance for unprotected sex.

Default posture is **avoiding pregnancy**; a mode toggle switches to **Conceive** (or Neutral) later.
This is **her first tracker** — keep onboarding gentle and predictions honest while data is thin.

## 2. Safety posture (baked into the product — do NOT soften)
- Fertility awareness is **awareness, not contraception.** Real-world calendar/temperature methods
  are far less reliable than actual birth control. In **Avoid** mode, shade the fertile ("cannot")
  window **conservatively/wide**, show a plain disclaimer, and **err toward "cannot" whenever unsure.**
- **First 1–2 cycles:** show *"still learning your cycle — don't rely on this yet."*
- Never present a prediction as certainty — always show the **confidence range**.

## 3. Stack & why (settled — do NOT re-pitch Flutter)
- **Web app / PWA**, hosted free on **GitHub Pages**. Installable via *Add to Home Screen* on both
  iPhone (Safari) and Android (Chrome). Chosen over the user's usual Flutter + APK-OTA stack because
  she's on **iPhone** and iOS blocks the sideload/self-update trick. The user chose web explicitly.
- **No build step.** Plain HTML + ES-module JavaScript + CSS, served straight from Pages. Firebase
  loaded via CDN ESM import. Deliberate: **any Claude account can edit a file and push, no toolchain.**
- **Firebase (Firestore + Auth)** for cross-device sync between the two of them. Client-only, no
  server. The Firebase web config in the code is **not a secret** (security is enforced by Firebase
  Auth + Firestore rules) — safe to ship in a public repo.
- Personal logs live in **Firestore**, locked to their two accounts. The public repo is **code only**.

## 4. Current status
**v0.7.0 — adds a Notifications-preferences screen, a daily temperature reminder, and an NFP
temperature chart (coverline/shift/ovulation/infertile phase) on its own Today card.** Also v0.6.3
fixed the "no active Service Worker" enable bug + actionable permission errors. Notifier now runs every
15 min (per-type toggles, timezone-aware temp reminder, once-daily de-duped digest). Below is the prior
status line (still accurate for the core):

**v0.6.1 — everything built, incl. real push notifications (setup complete, verified).** All three
pillars + in-app reminders + Stats tab + phase ring + **FCM push (scheduled GitHub Action)**. VAPID key
in, `FIREBASE_SERVICE_ACCOUNT` secret set, notifier run verified green. **Only remaining:** enable
notifications on each phone (stores a token) → then delivery works; test on demand with `notify.yml`
`test=true`. Live on Pages. Sign-in (shared account), period logging,
prominent **daily check-in** (mood 1–5 + tappable preset symptom chips + optional **morning
temperature** + note), calendar with prediction + can/cannot shading, Today can/cannot banner,
**temperature-confirmed ovulation** ("safe again" signal), **mood/PMS forecast** on Today, mode
toggle, live Firestore sync, installable PWA. Firebase project = `juno-a6adc`, config in
`js/firebase.js`.
- Symptom chips = flat `SYMPTOMS` array in `js/ui.js`.
- Temp logic = `confirmedOvulation()` in `js/fertility.js` (3 logged temps ≥0.3°F over prior-6 avg).
- Mood forecast = `moodForecast()` in `js/mood.js` (aligns mood to days-before-period; needs
  ≥5 logs across ≥1 completed cycle before it surfaces anything; shows a "keep logging" hint otherwise).
- Heads-up alerts = `alerts()` in `js/alerts.js` (in-app reminders at top of Today). v0.4.0.
  True OS push is deliberately NOT built — see §8 v0.4 for the free-but-heavy path if ever wanted.

**⚠️ Still needs the user's console steps to actually work:** (1) enable **Email/Password**
auth, (2) create the **Firestore database**, (3) paste the **security rules** (see §7). Until
those are done, sign-in fails and reads/writes are permission-denied (handled gracefully).

**Auth model decided: ONE shared login** ("two people in one account"). Not per-user accounts.
Data lives under `users/{uid}/...`; both phones use the same account so they share one dataset.

Next: user finishes the 3 console steps → test on both phones → then v0.2 (temperature).

## 5. Architecture / planned file layout
- `index.html` — app shell.
- `app.js` — entry (ES module); wires screens together.
- `js/store.js` — Firebase (Auth + Firestore) read/write + live sync.
- `js/predict.js` — cycle math (period prediction). **Pure functions.**
- `js/fertility.js` — can/cannot window + temperature ovulation confirmation. **Pure functions.**
- `js/mood.js` — mood logging + PMS pattern. **Pure functions.**
- `js/ui.js` — calendar + screens.
- `styles.css`, `manifest.webmanifest`, `sw.js` (service worker — added in v0.1 for offline/push), `icon.svg`.

**Firestore model (as built — shared single account):**
- `users/{uid}/cycles/{autoId}` → `{ startDate, endDate? }`  (endDate absent = period ongoing)
- `users/{uid}/days/{yyyy-mm-dd}` → `{ mood?(1–5), symptoms?[label strings], note?, flow?, tempF? }`  (tempF/flow land in v0.2)
- `users/{uid}/meta/settings` → `{ mode: 'avoid'|'conceive'|'neutral', typicalCycleLen }`
- **Rules (paste in Firebase console):** each account can read/write only its own `users/{uid}` tree:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{uid}/{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
  ```
- **Auth:** one shared email/password login (Email/Password provider). The app creates it on
  first run (the "Create the shared account" toggle on the sign-in screen); both phones sign in with it.

## 6. The math (implement as pure, testable functions)
### Period prediction (`predict.js`)
- `cycleLengths` = day-diffs between consecutive cycle `startDate`s.
- **< 2 cycles → "learning":** use her stated typical length (asked at setup, default 28), low confidence.
- `avg` = mean of the last ≤6 cycle lengths; `spread` = `max(stdev, 2 days)`.
- `nextStart` = `lastStart + round(avg)`; **predicted range** = `nextStart ± spread` (wider = more irregular).

### Fertility — can/cannot (`fertility.js`) — Avoid mode = conservative
- **Ovulation estimate** = `nextStart − 14` (luteal phase ≈ 14 days — the stable part of the cycle).
- **Base fertile window** = `ovulation − 5 … ovulation + 1` (sperm ~5 days, egg ~1 day).
- **Avoid-mode buffer:** widen to `ovulation − 7 … ovulation + 2`, and treat the early cycle cautiously
  (short cycles can ovulate early). This widened span = **"CANNOT."**
- **Temperature (v0.2):** a **sustained rise** (3 morning temps ≥ ~0.3°F above the prior 6-day average)
  **confirms ovulation has passed** → after 3 high temps, flip to **"CAN"** (post-ovulatory infertile phase).
  Temperature is the only signal that reliably confirms the window has *closed*.
- If cycles are **irregular** (large `spread`), state plainly that the calendar method is unreliable for avoiding.

### Mood forecast (`mood.js`)
- Log a **quick daily mood from day one** (e.g. 1–5 + optional tag) — required to learn the pattern.
- Align logged moods by **cycle-day**; after ≥1–2 cycles, find where dips cluster (usually **late luteal,
  ~2–5 days pre-period**) → forecast *"rougher days likely X–Y."* Frame as correlation; require a min sample.

## 7. Setup checklist to reach v0.1 (do in order)
1. [ ] Create a **Firebase project** → enable **Firestore** + **Email/Password auth**.
2. [ ] Create **two accounts** (his + hers); record both **UIDs**; seed one `households` doc with `members`.
3. [ ] Write **Firestore security rules** restricting the household + subcollections to `members`.
4. [ ] Paste the **Firebase web config** into `js/store.js` (public config is fine).
5. [ ] Build the v0.1 screens (§8).
6. [ ] Push → verify on Pages on **both phones** → *Add to Home Screen*.

## 8. Batch roadmap
### v0.1 — Core (all three pillars, minimal)  ✅ BUILT (pending user's Firebase console steps)
*Built: shared-account sign-in, period start/end logging, daily mood (1–5 + note), month calendar
with prediction + can/cannot shading, Today banner, Avoid/Conceive/Neutral toggle, typical-cycle-length
setting, live Firestore sync, PWA service worker. Mood **forecast** stays in v0.3 (logging is live now).*
- Sign-in; first-run setup asks her **typical cycle length** + **last period start date**.
- **Log** period start/end + a **quick daily mood**.
- **Calendar** with past periods marked and predicted next-period + can/cannot shaded.
- **Next-period prediction** with confidence range; "still learning" for the first cycles.
- **Can/cannot window**, Avoid-mode default, disclaimer.
- **Mode toggle** (Avoid / Conceive / Neutral) in settings.
- **Firebase sync** between both accounts; **installable PWA** (manifest + service worker).
### v0.2 — Temperature  ✅ BUILT
- Optional morning temp field in the daily check-in (`days/{date}.tempF`). `confirmedOvulation()`
  detects the sustained thermal shift → Today shows a "✓ Ovulation confirmed by temperature" note
  and the calendar keeps "not safe" until confirmation, then flips to safe. **Still TODO in a later
  pass:** use temps to *narrow the next-period prediction* (currently temps only gate the safe-again
  call, not the prediction), and handle a delayed/ambiguous shift more explicitly.
### v0.3 — Mood forecast  ✅ BUILT
- `moodForecast()` (`js/mood.js`) surfaces a "Mood outlook" card on Today: "her mood tends to dip
  in the N days before her period — this cycle that's around <dates>", plus the common symptoms then.
  Honest about sample size (1 cycle = tentative). Needs real logged data to show — until then a hint.
  **Later:** shade the forecast low-mood days on the calendar; per-symptom (not just mood) forecasting.
### v0.4 — Reminders  ✅ BUILT (in-app) · true push = future opt-in
- **Built (free, both phones):** in-app **heads-up alerts** at the top of Today — period-soon (≤3 days),
  expected-today, N-days-late, "not-safe window opens tomorrow" (avoid) / fertile starts (conceive),
  and mood-dip incoming. Pure logic in `js/alerts.js`. Works because she opens the app daily to log.
- **True OS push — BUILT in v0.6** (user opted in). See §8 v0.6.
### v0.7.2 — Sympto-thermal combine + bounded reads  ✅ BUILT
- `effectiveWindow()` in `js/fertility.js` is the single source of truth for the fertile window,
  used by classify (calendar shading), Today banner, in-app alerts, and the notifier. It starts from
  the calendar window and makes it **safer** with whatever's logged: mucus first-appearance moves the
  fertile START earlier; a confirmed temp shift and/or the mucus peak-rule push "safe again" LATER
  (whichever confirms latest). **No temp + no mucus → exactly the calendar estimate (still works).**
  Verified all 4 cases. Signs can only make it safer, never less safe (conservative for Avoid).
- **Firestore read bound:** notifier now queries only the last 120 days of `days` (was the whole
  collection every 15 min) → caps reads at ~12k/day and never grows. Free tier is 50k/day. No AI/token
  cost anywhere (no LLM at runtime). GitHub Actions free on public repo. Told the user: **zero phone
  battery/data cost** — the cron runs on GitHub's servers, phones only wake on an actual push.

### v0.7.4 — NFP two-part mucus  ✅ BUILT
- Mucus is now **sensation** (`days.mucusSensation`: dry/moist/wet/slippery/wetslippery) + **characteristic**
  (`days.mucusChar`: tacky/stretchy; none=default), two single-select chip rows in the check-in.
  `isPeakMucus()`/`hasMucus()` in `js/nfp.js`: peak-quality = wet/slippery sensation OR stretchy char;
  fertile-start = any non-dry sensation or any char. Legacy `days.mucus` (v0.7.1–0.7.3) still honored.

### v0.7.1 — Mucus tracking + neutral wording  ✅ BUILT (superseded by v0.7.4 for the mucus model)
- Was a single chip row `days.mucus` (Dry/Sticky/Creamy/Egg-white/Watery). Neutral-wording pass here (kept).
- **Wording neutralized everywhere** (no "her"/"she") — reads fine on either partner's phone. Verified
  zero leftover pronouns in the rendered DOM. Check-in title is now "Daily check-in".
- **Note (data/battery):** the `*/15` notifier runs on GitHub's servers, NOT the phones — zero phone
  battery/data cost; phones only wake on an actual push. Confirmed to the user.

### v0.7 — Notification prefs + NFP temperature chart  ✅ BUILT
- **Notifications screen** (Settings → Notifications → `viewNotifications()`): per-type on/off toggles
  (period / redlight / greenlight / mooddip) stored in `settings.notifPrefs`; device enable lives here now.
- **Daily temperature reminder** (new): opt-in toggle + time picker (`settings.tempReminder.time`), sent at
  the user's local time. Needs `settings.tz` (captured from the phone). Notifier now runs **every 15 min**
  (`notify.yml` cron `*/15`); digest is gated to local morning + de-duped via `meta/push.sent`; temp
  reminder fires within ~15 min of the set time. Timezone via `Intl` in `scripts/notify/index.js`.
- **Temperature moved to its own card** on Today (between check-in and Period). Enter temp → **Submit** →
  card shows the **NFP chart** (`temperatureChart()` in ui.js) built from `js/nfp.js` `analyze()`:
  coverline (LTL = highest of the 6 lows before the rise), 3-day thermal shift (Sensiplan; 3rd must clear
  LTL by ~0.36°F/0.2°C else a 4th confirms), est. ovulation (last low before rise), shaded post-ovulation
  infertile phase. `confirmedOvulation()` now delegates to `nfp.analyze()` so chart + green-light agree.
  Unit is **°F** (user choice). Past-day temp backfill stays inline in the check-in sheet.
  - **NOT built (offered):** real mucus-based "peak day" (needs a mucus-tracking feature).

### v0.6 — Push notifications  ✅ BUILT · needs 2 setup inputs to go live
Real OS push (user's 3 requested triggers), free, via a scheduled GitHub Action + FCM.
- **Client:** `js/push.js` (`enableNotifications()` → permission → `getToken` with VAPID → `saveToken`),
  Settings → Notifications card, foreground `onMessage`. Token stored at `users/{uid}/meta/push.tokens[]`.
- **Service worker:** `sw.js` now importScripts the FCM compat SDK, `onBackgroundMessage` shows the
  notification, `notificationclick` focuses/opens the app.
- **Sender:** `.github/workflows/notify.yml` (cron `0 13 * * *` + manual dispatch) runs
  `scripts/notify/index.js` (firebase-admin), which reuses `js/predict|fertility|mood|dates` to decide
  triggers and sends FCM. **Triggers:** period in 5 days · **Red light** = fertile window opens (can't
  have sex) · **Green light** = day after fertile end / temp-confirmed (can have sex again) · mood-dip
  starts (forecast, not on log). (Reworded v0.6.2 from "not-safe window opens/ends" — same logic, clearer
  wording. Mapping: fertile window = CAN'T; before/after = CAN.)
- **SETUP DONE:** ✅ VAPID key is in `js/push.js` (`pushConfigured()` true). ✅ GitHub secret
  `FIREBASE_SERVICE_ACCOUNT` is set. ✅ Sender pipeline verified — manual run of `notify.yml` succeeded
  (`done — 0 notification(s) sent`, 0 only because no device tokens registered yet).
- **Console note:** the redesigned Firebase console has NO "Cloud Messaging" tab under Settings. Reach
  Web Push certs by direct URL: `console.firebase.google.com/project/juno-a6adc/settings/cloudmessaging`.
- **REMAINING to see a notification land:** enable it on a phone (Settings → Turn on notifications;
  iPhone must be installed to Home Screen first) → that stores a token → then delivery works.
- **Test delivery on demand:** `notify.yml` has a `workflow_dispatch` input `test` — run with test=true
  (`gh workflow run notify.yml -R scenicprints/juno -f test=true`) to push a one-off "it works" to all
  registered devices without waiting for a real trigger day.
- **iOS:** push only works if the PWA is installed to the Home Screen (16.4+) and enabled from inside it.
- **Caveats/TODO:** cron is UTC (13:00 ≈ US morning); no per-message de-dupe (fine — daily run + date-equality
  triggers each fire on one day); timezone is server-side, could drift a day near midnight.

### v0.5 — Stats & polish  ✅ BUILT
- **Stats tab** (`js/stats.js` → `cycleStats()`): avg cycle length + range, avg period length, cycles
  tracked, regularity (Very/Fairly/Irregular from cycle-length stdev), recent-cycles list.
- **"Today" phase ring** (`phaseRing()` in `js/ui.js`): SVG donut with menstrual/follicular/fertile/
  luteal arcs and a marker at today, replacing the plain cycle-day number on the Today summary.
### Later / optional
- Birth-control or pill reminders, a lighter partner-view layout, data export, PIN/biometric lock.

## 9. Decisions log (why things are the way they are)
- **Web/PWA, not Flutter** — she's on iPhone; iOS blocks the APK-OTA self-update trick. User chose web.
- **No build step** — so any Claude account can edit + push with zero toolchain.
- **Firebase for sync** — no server to run; public config is safe; Firestore rules enforce privacy.
- **Avoid mode default + conservative shading** — the stated main purpose is avoiding pregnancy.
- **Mood logging is in v0.1** (not later) — mood *prediction* needs history recorded from day one.
- **Roadmap-as-law** — the "live online / switch Claude accounts" requirement; the repo is the memory.
