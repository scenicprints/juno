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
**TESTS — the repo has a committed test suite as of 2026-10-20.** `node --test` from the repo
root runs **73 tests** over the safety-critical pure modules *and* the rendered chart, with no npm
dependencies and no build step (`node:test` + `node:assert` + a small DOM shim). It is wired to CI
in `.github/workflows/tests.yml`. **Every "N-test suite" figure in the entries below was a
SCRATCH-ONLY harness that was thrown away** — they are corrected in place now. See §8 "Tests".
The shipped app is **v0.9.9**. Note v0.9.7 never had a shell version of its own: it was a
notifier and documentation batch that touched no `js/` file, so there was nothing for the phones
to re-download and no `APP_VERSION` bump. The app therefore went 0.9.6 → 0.9.8.

**v0.9.9 (2026-10-20)** — **a false SAFE in the LIVE safety path, found and fixed.** Two or three
bad nights early in a cycle (poor sleep, a drink, a reading taken late) produce a textbook-looking
three-day rise sitting on top of the six **menstrual** lows — waking temperature is genuinely low
during a period, so "six lows then three higher" is satisfiable almost anywhere early on.
`nfp.analyze()` confirmed it as a thermal shift, and `effectiveWindow()` **assigned** that date to
`safeAgain` instead of taking a maximum, so the fertile window closed the day **before it opened**.
Measured with no mucus logged: **ten days, predicted ovulation among them, flipped from "not safe"
to "lower risk".** Logging "moist" helped not at all (only peak-quality mucus moves the backstop);
her habitual wet-logging masked all but 2–3 days. The fix is a coherence guard — a shift that would
close the window before it opens is an artifact, not evidence, so it is ignored and the calendar
closes the window instead. A genuine mid-cycle shift still closes the window early, which is the
entire payoff for taking temperatures. See §8 v0.9.9.

**v0.9.8 (2026-10-20)** — settled the `nfp.mucusPeak()` / `phases.peakDay()` divergence that v0.9.6
left open, and the answer was **do not unify them**. Measured first: porting v0.9.5's Peak Day lock
into `mucusPeak()` moves Peak from May 28 to May 11 on a realistic "wet on most days" cycle and
collapses "safe again" from Jun 1 to May 15 — **17 not-safe days turned safe, in Avoid mode.** That
is a false SAFE, so the logic is unchanged and now carries a comment saying why. What WAS wrong was
the display: the Temperature card printed `mucusPeak()`'s date while the Phases tab charted
`peakDay()`'s, so the app showed two different Peak Days for one cycle. Both now read the locked
rule. 5 new tests in `tests/invariants-safety.test.mjs` fail if anyone unifies them. See §8 v0.9.8.

**v0.9.7 (2026-10-20)** — **the three-month push-notification outage is over.** The notifier had
been dead since 2026-07-20 and nobody noticed: `scripts/notify/package.json` was deleted as
collateral damage in `5fb79b3` (v0.7.9, a commit whose message is entirely about period logging),
which also took `CLAUDE.md`, `BACKLOG.md` and `README.md`. `notify.yml` runs `npm install` with
`working-directory: scripts/notify`, so every run since died with `ENOENT ... package.json`,
exit 254, **before node ever started** — 100 of the last 100 runs failed and not one notification
was delivered in three months. The file is restored, the workflow is **green again**, and a
`test=true` run reports `users found: 1` and a clean **`1/1`** send — **delivery is proven, a real
push went to a real phone.** Two things are now true and were not before: the `*/15` cron is a
fiction (it really runs ~5x a day, which breaks the temperature reminder specifically), and **only
one of the two phones is still registered** — the second device's token was stale and the notifier
auto-pruned it, so that phone has to re-enable. Both written up in §8 v0.9.7 and `BACKLOG.md`.

**v0.9.6 (2026-10-20)** — audited the Phases tab against the CCL "15 Steps of Paper Charting at a
Glance" sheet. Steps 4–8, 10, 11, 13 and 14 already matched exactly. Closed the three that did not:
**menstrual flow is now recordable** (step 1 — which also makes `isBleeding()`'s `days.flow` branch
live for the first time), the **Pre-Shift Six are numbered right to left** (step 9), and the
**confirming temperatures are circled** (step 12). See §8 v0.9.6, including the deliberate step-5
divergence and the `nfp.mucusPeak()` gap that is still open.


**v0.9.5 (2026-09-09)** — two real correctness bugs in `peakDay()`, both spotted by him on his own
data ("why in aug 10 to sep 4 is sep 3rd the peak day"). **(1) Peak Day never locked:** the scan
reassigned it on every peak-type day, so the LAST one in the cycle won, and one late wet/slippery
log dragged Peak Day to the end of the cycle. The ST Rule then waited on drying days and
temperatures that were never coming, so Phase 3 never opened — which is also why cycles were
missing a complete Phase 1/2/3. **(2) A period reads as peak mucus:** `wet` is a peak-quality
sensation and bleeding is wet, so a period day registered as the most fertile mucus of the cycle
and put Peak Day on day 1. Both fixed; the 9 regression tests written then were
scratch-only and were lost. Both bugs are now covered by committed tests
(`tests/regressions-v0.9.5.test.mjs`), re-verified failing against the reverted fix.

**v0.9.4 (2026-09-09)** — the fit-to-width math broke down on long cycles, which is where his real
data lives. v0.9.3 clamped the rotated label font at a 5.5 floor, so below ~5.6 units per day the
labels were wider than their columns again and a 74- or 121-day cycle smeared. Labels are now
**thinned** (every Nth day) instead of shrunk past legibility, so the entire cycle always sits in
one view. Verified 0 overlap and 0 clipping on 9, 26, 28, 29, 31, 34, 45, 58, 74 and 121-day cycles.
Also added **Settings > Reload the app**, which drops the cached shell and every service worker and
reloads with a cache-busting query, plus the version on the Phases tab — an installed PWA sitting on
an old shell is otherwise invisible and un-debuggable from this side.

**v0.9.3 (2026-09-09)** — past cycles were unreadable. v0.9.2 made the chart *geometrically* fit
the width but the header labels did not: at 34 days the DATE row collapsed into one run of digits
("2526272829303 1 1 2 3..."). The DAY and DATE labels now turn **upright** when a column is under
13 units wide, so their horizontal footprint is the cap height instead of the string width.
Measured worst-case overlap is 0 on 26-, 28-, 30-, 31-, 34-, 45- and 58-day cycles.

**v0.9.2 (2026-09-08)** — Phases chart reworked on his feedback. **One CYCLE per page, all three
phases on the one chart**, sized to fit the width so no phase is ever split across a scroll (the
first cut scrolled sideways, which split a phase in half). Header rows now carry the **day of the
phase** (restarting at 1 in each phase, coloured by phase) and the **date**, plus a weekday row,
mirroring the paper chart's three header rows. Mucus symbols are **drawn SVG geometry**, not font
glyphs, which were off by a pixel or two from their column. Chart got the room: viewBox matched to
the card width so 1 unit is 1 CSS px on a phone (a 340-wide viewBox had been scaling everything
down to 0.9), taller plot, and a per-phase summary table with dates underneath. Verified: a 30-day
cycle fits 30 columns with zero label overlap and no document overflow.

**v0.9.0 (2026-09-08)** — adds the **Phases tab**: the three-phase model as the CCL course
actually teaches it, on one chart per cycle. New `js/phases.js` implements the real rules (Day 5/6,
Doering, Sympto-Thermal, Temperature-Only, Mucus-Only) instead of relabelling the existing window.
It is a READ-ONLY addition: nothing in `fertility.js` / `nfp.js` changed, so the Today banner,
calendar shading and notifications behave exactly as they did in v0.8.4. See §8 v0.9.0.

**v0.8.4 (2026-08-17)** — fixed the "safe/not-safe flipped after ending her period" bug: a phantom
period start (double-tap) had become the prediction anchor. Starts are now validated (`cycleStarts`),
the Today period button is split in two, the predicted-period false-safe is closed, the ring reads the
effective window, and noisy temperatures can no longer confirm ovulation. See §8 v0.8.4.

**v0.7.0 — adds a Notifications-preferences screen, a daily temperature reminder, and an NFP
temperature chart (coverline/shift/ovulation/infertile phase) on its own Today card.** Also v0.6.3
fixed the "no active Service Worker" enable bug + actionable permission errors. Notifier is *scheduled*
every 15 min (per-type toggles, timezone-aware temp reminder, once-daily de-duped digest) — but
see v0.9.7: GitHub actually runs it about **5 times a day**, which the digest tolerates and the
temperature reminder does not. Below is the prior
status line (still accurate for the core):

**v0.6.1 — everything built, incl. real push notifications (setup complete, verified at the time
— but see v0.9.7 above: push was then dead from 2026-07-20 to 2026-10-20).** All three
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
- `js/nfp.js` — coverline / thermal-shift analysis shared by the banner and the temp chart. **Pure.**
- `js/phases.js` — the CCL three-phase rules, one cycle at a time. **Pure functions.**
  Read-only: nothing else in the app imports its output, so it cannot move the safety banner.
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
### ⚠️ GOTCHA that silently killed ALL push (fixed 2026-07-17)
`users/{uid}` has **no fields of its own** — every bit of data lives in its SUBcollections
(`cycles`, `days`, `meta`). In Firestore that makes it a **"missing" document**, and
**`db.collection('users').get()` does NOT return missing documents.** The notifier looped over an
empty list and reported `done — 0 notification(s) sent` no matter how many devices were registered,
so **no notification ever fired for anyone** (the iPhone/Android were both registered fine all along).
**Fix:** use `db.collection('users').listDocuments()` (Admin SDK — includes missing docs). Verified:
`users found: 1`, `2 registered device token(s)`, test send `2/2`. Never use `collection('users').get()`
here. The notifier now logs users-found + per-user token counts — use `-f test=true` to diagnose.

### Tests — the first committed test suite  ✅ BUILT (2026-10-20)
There had never been a committed test in this repo. `git log --all --diff-filter=A` returned zero
test files, while §4 and §8 cited a "40-test suite" and "31 hand-checked assertions" — every one of
those ran in a scratch dir and was thrown away with it. That is exactly how v0.9.5's two Peak Day
bugs survived a green suite, and the lesson had already been written down twice (v0.9.4, v0.9.5)
without being acted on.

**Run it:** `node --test` from the repo root (or `npm test`). 65 tests, about half a second, no
install step. CI: `.github/workflows/tests.yml`, on push and PR, kept separate from `notify.yml`
because that one needs a secret and an `npm install` and this one must stay a clean signal.

**What made it possible:** a root `package.json` with `{ "private": true, "type": "module" }`, so
Node will load `js/*.js` as ES modules. It adds **no dependency and no build step** — §3 still
holds, any Claude account can still edit a file and push with zero toolchain. There is no
`engines`-enforcement or install step anywhere; `"scripts": { "test": "node --test" }` is a
convenience, not a toolchain.

**The live site is unaffected, checked after the push** (not assumed): `scenicprints.github.io/juno/`
loads and renders the sign-in screen with no console errors. Note that **Pages does serve the new
files** — `/package.json` and `/tests/*.test.mjs` both return 200, so Jekyll's default exclude list
is not in play here. That is harmless: the repo is public and code-only, nothing requests those
paths, and `sw.js`'s `SHELL` list names its assets explicitly, so the cached app shell did not
change. Do not put anything in the repo you would not publish.

**Files:**
- `tests/phases-rules.test.mjs` — the CCL rules: Pre-Shift Six/LTL/HTL, Day 5/6 with and without a
  short cycle in history, Doering gating (6 cycles of temperature history) and its minus-7
  arithmetic, Peak Day including a peak returning during the drying days, Sympto-Thermal with a
  strong and a weak 3rd temperature, Temperature-Only, Mucus-Only, and an unconfirmed cycle
  staying Phase 2.
- `tests/regressions-v0.9.5.test.mjs` — Peak Day locks once three drying days complete (swept
  across every later day of the cycle, not just one); a bleeding day is never peak mucus, by the
  period end date AND by a logged `flow`, as an A/B on that one field.
- `tests/regressions-v0.8.4.test.mjs` — the stray-start anchor, `fertilityClass` evaluating risk
  before the predicted-period label, and the temperature noise guard.
- `tests/chart.test.mjs` — mounts the real `js/ui.js` and asserts on the SVG string it builds.
- `tests/chart-lengths.test.mjs` — the degenerate lengths: 26, 28, 31, 34, 39, 40, 45, 58, 74, 121
  completed, plus 3, 9 and 15-day cycles in progress. No NaN, no `undefined`, no font under 6
  units, plot never wider than the 284 available, and the guards pinned at their exact crossovers.
- `tests/helpers/` — the DOM shim, the fixtures, and the push stub.

**A suite that passes against the bug is worthless, so each fix was reverted and re-run.** All
seven reverts are caught:

| reverted | tests that fail |
|---|---|
| v0.9.5 Peak Day lock (`forEach`, last one wins) | 3 |
| v0.9.5 `isBleeding()` → `false` | 4 |
| v0.8.4 `cycleStarts()` → unvalidated `sortedStarts` | 4 |
| v0.8.4 `fertilityClass` label-before-risk | 2 |
| v0.8.4 noise guard (`if (unreliable) return res`) | 2 |
| v0.9.4 label thinning (`step = 1`) + 5.5 font floor | 5 |
| v0.9.6 step-9 density guard (`showPreNums = true`) | 6 |

**Conventions and gotchas worth not rediscovering:**
- **`js/push.js` is stubbed through a loader hook**, not by copying `js/` somewhere and editing the
  copy — a copy drifts, and the point of the suite is that it runs against the shipped files.
  `push.js` statically imports the Firebase messaging SDK over https, which Node cannot resolve, so
  `tests/helpers/push-hook.mjs` (stdlib `node:module`, needs Node **20.6+**) redirects that one
  specifier. Nothing else in `js/` is substituted.
- **`ui.js` keeps the open tab and the selected cycle in module-level `view` state**, so a second
  mount in the same process would inherit the first one's picker position. `mountPhases()` imports
  `ui.js` under a cache-busting URL per mount to keep the tests order-independent.
- **The cycle picker opens on the NEWEST cycle, which is the one still in progress** (its window
  runs to `today()` and grows daily). Tests page back with the ‹ button to reach a completed one,
  and every fixture date is fixed and in the past so nothing changes meaning as the clock moves.
- **A 9-day *completed* cycle cannot exist.** Two starts 9 days apart are not a cycle: `cycleStarts`
  drops the second as a stray (v0.8.4, `MIN_CYCLE_DAYS` 15). The only window shorter than 15 days
  is a cycle in progress, so that is how the short lengths are tested. The old sweep "verified" a
  9-day cycle that was really one 293-day open window.
- **The chart's column count is floored at 6 days**, so a 3-day cycle draws 6 columns.
- **`node --test tests/` does not work on Node 24** (it reads the path as a file). The command is
  `node --test` from the repo root.
- **What this suite cannot catch:** it asserts on the SVG *string*, with no layout and no CSS. It
  catches a missing mark, a NaN coordinate, a label that should have been thinned. It cannot tell
  you the chart *looks* right on a phone — that still needs a phone. And the UI interactions from
  v0.8.4 (the two Today buttons, the start-guard toast) are not covered yet.

### v0.9.7 — push notifications work again (dead for three months)  ✅ BUILT (2026-10-20)
`scripts/notify/package.json` was deleted in `5fb79b3` (v0.7.9) — a commit whose message is
entirely about period logging, and which also deleted `CLAUDE.md`, `BACKLOG.md` and `README.md`.
Nothing in the app or the repo referenced it, so nothing broke visibly. What broke was CI:
`notify.yml` runs `npm install` with `working-directory: scripts/notify`, which from that commit
on exited `ENOENT ... scripts/notify/package.json`, **exit 254, before node ever started**.

- **100 of the last 100 runs failed.** From 2026-07-20 to 2026-10-20 not one notification was
  delivered, and the only green runs in the Actions history were `pages-build-deployment`.
- **Restored verbatim from `ee60302`.** `"type": "module"` is the load-bearing line — `index.js` is
  ESM and would otherwise be parsed as CommonJS. `firebase-admin ^12.7.0` still resolves to 12.7.0
  and installs clean on Node 20 (`engines: node >=14`, 167 packages, only a `uuid` deprecation
  warning), so it is **deliberately left unbumped** — nothing here needed a version bump.
- **`node_modules/` added to `.gitignore`.** It was never there. Any `npm install` inside the repo
  would have committed the whole dependency tree.
- **Verified green, and delivery proven.** `gh workflow run notify.yml -R scenicprints/juno
  -f test=true` → `users found: 1` · `2 registered device token(s)` · send `1/2`. The dead token
  was auto-pruned, and a second run returned `1 registered device token(s)` · send **`1/1`** ·
  `done — 1 notification(s) sent.` A real push reached a real phone — this is not inferred.
- **Careful what a green run actually proves.** `test=true` returns early (index.js line ~107), so
  it never touches `digestTriggers()`; and a non-test run before 8:00am local skips the digest
  block on the `DIGEST_LOCAL_MIN` gate, so it prints `done — 0 notification(s) sent.` and proves
  nothing about the triggers either. A plain dispatch at 14:40 UTC did exactly that. What the
  GitHub runs do prove: the static ESM imports of `js/predict|fertility|mood|dates.js` load (the
  process would die at startup otherwise), `listDocuments()` finds the user, and FCM delivery
  works. The trigger logic itself was then replayed **locally** — the exact expression sequence of
  `digestTriggers()` against the real pure modules over seven cycle shapes plus no-history and
  neutral-mode, nothing thrown, and the period trigger firing precisely at `daysUntil === 5`.

**⚠️ The `*/15` cron is a fiction — it runs about 5 times a day.** Measured over the last 100 runs:
3–8 runs per day, hours apart, not the 96 the cron asks for. GitHub drops the overwhelming majority
of scheduled runs on a free public repo. Consequences, which differ per trigger:
- **The daily digest is fine.** It is gated to "at/after 8:00am local" and de-duped by local date,
  so some run each day still catches it — it just arrives later than 8am, not at 8am.
- **The temperature reminder is effectively broken.** It only fires inside a 20-minute window
  (`REMINDER_WINDOW`) around the chosen time, and ~5 randomly-placed runs/day hit a given
  20-minute window about **7% of the time** — roughly once a fortnight.
- **Deliberately NOT changed here.** The obvious fix (widen the window) means a "take a temperature
  right after waking" push can land at 2pm, which is worse than silence. That is a product call,
  not a bug fix. Options in `BACKLOG.md`: widen to ~90 min and accept late-but-plausible, drop the
  feature, or move the notifier off GitHub cron. **Do not quietly widen it — ask first.**

**One of the two registered devices was dead, and is now gone.** The first test send was `1/2`;
`send()` pruned the stale token, and the next run was `1/1` against the one remaining device.
So **one phone is live and one is unregistered** — whichever phone stopped getting pushes has to
re-enable under Settings → Notifications (iPhone must be installed to the Home Screen first).
`send()` had pruned dead tokens all along but **logged nothing about which device failed or why**,
so `1/2` read as success at a glance. It now logs the per-device FCM error code and says when it
prunes. Tokens themselves are never logged — Actions logs are public.

**`CLAUDE.md` and `README.md` restored; `BACKLOG.md` rewritten, not restored.** §0 tells every
incoming agent to read `CLAUDE.md` and `BACKLOG.md` and both had been missing for three months.
`CLAUDE.md` and `README.md` were still accurate and went back nearly verbatim (`CLAUDE.md` gains
one hard rule: don't delete a support file you aren't working on). **`BACKLOG.md` was not restored
as-is on purpose** — the deleted version was written at v0.0 and still listed v0.1–v0.5 as upcoming
work, so restoring it would have told the next agent to go build features that shipped a year ago.
It is rewritten as the real open list.

**The lesson worth keeping: a scheduled job that fails is silent.** Three months of daily failures
produced no signal anyone acted on, because nothing in the app changes when push stops — the app
itself was fine the whole time. If you touch the notifier, run it with `-f test=true` and **read
the log**, and when you delete files, run `git status` and look at what you are actually staging.

### v0.9.9 — a shift that closes the window before it opens is an artifact  ✅ BUILT (2026-10-20)
Found while chasing what looked like a cosmetic charting gap (paper-chart step 8, "close to Peak
Day"). It was not cosmetic. It was a **false SAFE in the live path** — the Today banner, the
calendar shading and the notifier's green light, not the read-only Phases tab.

**The failure.** Waking temperature is genuinely low during a period, so the six readings at the
start of a cycle are a *depressed* baseline and any two or three slightly-off mornings after them
clear it by the required margin. `nfp.analyze()` scans from the start of the cycle and takes the
FIRST qualifying rise, so it accepted the artifact. `effectiveWindow()` then did
`if (tc) safeAgain = tc.infertileFrom;` — an **assignment**, not a maximum — and the window's close
date jumped backwards past its own open date.

| logging pattern | "safe again" | days flipped to SAFE |
|---|---|---|
| temperatures, no mucus | May 20 → May 8 | **10 — the whole window** |
| temperatures + "moist" only | May 20 → May 8 | **10** |
| temperatures + peak mucus | May 20 → May 16 | 3 |
| temperatures + wet most days (her habit) | May 20 → May 17 | 2 |

Note the second row: logging *some* mucus bought nothing, because `mucusPeak()` reacts only to
**peak-quality** mucus. And note that the backstop v0.9.8 refused to lock is the only reason rows 3
and 4 are not rows 1 and 2 — locking it would have made this strictly worse.

**The fix.** `effectiveWindow()` accepts a temperature close only when it lands **after** the
window opens. Anything earlier is an artifact, so it is ignored and the calendar closes the window
— always the conservative direction. `tempConfirmed` now reports whether the shift was ACCEPTED
rather than merely detected, and the Today card's "✓ Ovulation confirmed by temperature" note reads
that flag, because saying "confirmed" under a "Not safe" banner is a lie.

**A genuine shift still closes the window early.** That is the payoff for temping, and it is
asserted rather than assumed: a real rise on cycle day 15 still moves "safe again" May 20 → May 17.

**The first attempt at this fix was WRONG, and the suite caught it.** It excluded bleeding days
from the Pre-Shift Six, by analogy with v0.9.5's "you cannot read mucus through blood". Four tests
went red and they were right: the method genuinely **does** count menstrual temperatures in the
Pre-Shift Six — the Temperature-Only test says so in as many words ("the rise starts on cycle day
8, so the six lows before it are Jan 2-7"), and Doering needs them too. Excluding them also left
fewer than six readings before any early rise, so legitimate shifts stopped confirming at all. If
that approach tempts you again: it is not the method, and it breaks Doering.

**Still open, deliberately** (see `BACKLOG.md`): the partial exposure (with peak mucus logged the
window still shortens 2-3 days on this pattern); `phases.js:thermalShift()` has the same first-match
scan so the **chart** can still ring the Pre-Shift Six on menstrual days; and whether a confirmed
shift should be allowed to close the window earlier than the calendar at all is a product call that
remains unanswered. §8 v0.7.2's claim that "signs can only make it safer, never less safe" was
never true of the temperature branch, only the mucus one.

### v0.9.8 — why mucusPeak() and peakDay() must stay different  ✅ BUILT (2026-10-20)
v0.9.6 flagged that `nfp.mucusPeak()` never got v0.9.5's Peak Day lock or bleeding exclusion, while
`phases.js:peakDay()` did, and left the call open. **The call is: leave the logic alone.** Do not
"fix the inconsistency" — it is load-bearing.

**Why, measured before deciding** (on `wetMostDays()` in `tests/helpers/fixtures.mjs`, which is her
real logging habit from v0.8.4 — a wet sensation on most days, bleeding included):

| | Peak Day | "safe again" |
|---|---|---|
| `nfp.mucusPeak()` as shipped | May 28 | **Jun 1** |
| if v0.9.5's lock were ported | May 11 | May 15 |

That is **17 not-safe days turned safe in Avoid mode** — a false SAFE, the one direction §2 says we
never move in. The reason is structural, not a detail of this fixture: `effectiveWindow()` lets
mucus push "safe again" **later only**, and it has no way to express "a new mucus patch reopened
the window". Taking the LAST peak-type day is how that reopening gets represented at all. Lock it
and a fresh patch of fertile mucus after the drying days silently stops counting.

So the two functions answer different questions and both are right:
- `phases.peakDay()` charts ONE cycle's three phases → its Peak **locks** after three drying days,
  and a later patch is a new patch (v0.9.5). This is the one the method teaches, and the one shown.
- `nfp.mucusPeak()` is a **safety backstop** for `effectiveWindow()` → last peak-type day, no lock,
  deliberately wide. Never displayed.

**What actually was broken: the display.** The Temperature card printed `mucusPeak()`'s date
("Mucus peak day May 28 — likely infertile from Jun 1") while the Phases tab charted May 11. Two
Peak Days for one cycle, plus a second "infertile from" claim competing with the banner. The card
now reads the same locked `analyzeCycle(...).peak` the Phases tab does, shows the drying-day
progress, and drops the rival infertile claim. When peak-quality mucus has been logged SINCE Peak
Day it adds one line saying the window is still being held open — otherwise the banner looks like
it contradicts the Peak Day printed directly above it.

**Locked by tests** (`tests/invariants-safety.test.mjs`, 5 tests): mucus may only push "safe again"
later or equal, never earlier; the two functions are asserted to disagree on this fixture with the
exact dates; `safeAgain` is asserted to stay past the locked peak + 4; and the Phases tab and the
Temperature card are asserted to quote the same Peak Day. **Verified these fail when the lock is
ported** — mutating `mucusPeak()` to lock turns 2 of them red, with the measured cost in the
failure message. Do not fix the test; revert the change.

### v0.9.6 — the paper chart's steps 1, 9 and 12  ✅ BUILT (2026-10-20)
Checked the Phases tab line by line against the CCL "15 Steps of Paper Charting at a Glance" sheet.
The rule engine already matched steps 4–8, 10, 11, 13 and 14 exactly. Three steps were missing from
what gets DRAWN — and one of them had no way to record its data at all.

- **Step 1 — menstrual flow is recordable now.** A single-select chip row in the daily check-in
  (Spotting / Light / Medium / Heavy → `days/{date}.flow`), drawn on the chart's menstruation row as
  geometry, never glyphs: heavy a solid block, medium the cross that was always there, light one
  stroke, spotting a dot. **This makes a dead branch live.** `isBleeding()` in `phases.js` has read
  `days.flow` since v0.9.5, but nothing in the app ever wrote it, so bleeding was only ever detected
  from the cycle's `endDate`. A day with a logged flow is now excluded from Peak Day detection, the
  drying count and `firstMucusDay` — the same conservative direction v0.9.5 established.
- **Step 9 — the Pre-Shift Six are numbered right to left** (rightmost = 1), above their dots. Six
  adjacent one-digit labels do not fit at every density, so they are drawn only when
  `dayW >= fPre * 1.2`; below that the existing ring still marks the six. Same discipline as
  v0.9.4's header labels — never shrink below legible, drop labels instead. Crossover measured at
  39 days (shown) / 40 days (hidden).
- **Step 12 — the confirming temperatures are circled**, in the HTL's pink, so the chart shows its
  work instead of only asserting the conclusion in the text readout. `phase3.parts.temps` has held
  exactly these dates since v0.9.0 and `ui.js` simply never read it. Covers the four-temperature
  case (a weak 3rd) too, which is step 13's fallback.

**Deliberate divergence, do not re-litigate (step 5).** The sheet says to pick ONE rule for the end
of Phase 1 — Day 5/6, Doering, or Last Dry Day — depending on how long you have been charting. Juno
takes the EARLIEST of all applicable rules instead (see v0.9.0); its "mucus appeared" candidate is
the Last Dry Day Rule under another name, same arithmetic. The practical effect is that **Phase 1
often ends earlier in Juno than on a hand-drawn chart.** That is the conservative side and it needs
no new setting, but it is the discrepancy to expect when the two are compared side by side.

**Still divergent, NOT changed here:** `nfp.mucusPeak()` — which drives the Today banner, calendar
shading and the notifier — never got v0.9.5's Peak Day lock or its bleeding exclusion. Only
`phases.js:peakDay()` did. It errs SAFE (a late stray peak only holds the window open longer, never
shorter), so this is not a false-safe, but the Phases tab and the Today banner can now disagree
about which day Peak Day was. Changing it moves the safety window — decide deliberately, re-read §2.

**Verified** with a Node harness that mounts the real `ui.js` against a minimal DOM shim and reads
the rendered SVG back out (the v0.8.4 approach): assertions on the `phases.js` rules including an
A/B proving the new `flow` field is what excludes a bleeding-day mucus log, assertions on the
rendered chart including the step-9 numbers reading 6,5,4,3,2,1 left to right, and a sweep over
degenerate cycle lengths. **That harness was scratch-only and has since been rewritten as the
committed suite** — see §8 "Tests". The A/B on `flow`, the step-9 numbering and the length sweep
all survive in `tests/`.

### v0.9.5 — Peak Day locks, and a period is not peak mucus  ✅ BUILT (2026-09-09)
He read the charts against his own data and found both of these. Neither was a display bug.

- **Peak Day never locked.** `peakDay()` did `ds.forEach(d => { if (isPeakMucus) peak = d })`, so
  whichever peak-type day came LAST in the cycle won. A single slippery log three weeks after the
  real peak became Peak Day. The rule is: peak-quality mucus returning *during* the drying days
  moves Peak Day (drying restarted), but once three drying days have completed the Peak is
  **confirmed and final** and a later patch is a NEW patch. Now a forward scan that resets the
  drying count on a peak day and `break`s the moment three drying days accumulate.
- **Knock-on:** with Peak Day dragged to day 25, the ST Rule needed three drying days plus three
  post-Peak temperatures that never arrived, so Phase 3 never opened and no cycle had all three
  phases. Fixing Peak Day fixed that too.
- **A period is wet.** `PEAK_SENSATIONS` in `nfp.js` includes `wet`, and nothing excluded bleeding,
  so period days read as the most fertile mucus of the cycle and Peak Day landed on day 1 during
  menstruation. `isBleeding()` now excludes bleeding days (by the cycle's `endDate`, or any
  `flow` value) from Peak detection, the drying count, and `firstMucusDay`.
  This is safe in the Phase 1 direction because its end is still capped by Day 5/6 and Doering:
  ignoring a period-day mucus log can never push Phase 1 past those.
- **Do not "fix" `nfp.js` by removing `wet` from `PEAK_SENSATIONS`.** Wet IS peak-quality mucus.
  The problem was never the sensation list, it was reading mucus through blood.
- **The 31-assertion scratch harness passed through both bugs.** Every case in it was a tidy
  textbook cycle with no late mucus patch and no mucus logged during the period. Test the messy
  shapes real logging produces, not the ones the rules are illustrated with. (That harness was
  never committed and no longer exists; both bugs are pinned now in
  `tests/regressions-v0.9.5.test.mjs`.)

### v0.9.4 — thin the labels, and make a stale cached app recoverable  ✅ BUILT (2026-09-09)
"I cannot scroll through to see an entire cycle." Third attempt at this.

- **The real defect:** v0.9.3's `fRot` had a `Math.max(..., 5.5)` floor. Rotating fixed 26-58 day
  cycles but a floor means that below ~5.6 units per day the label is wider than its column again.
  Long cycles (a missed period start makes a 74- or 121-day "cycle", and `cycleWindows` does not
  filter those the way `cycleLengths` does) went straight back to a smear.
- **Fix:** never shrink a label below font 6. When it will not fit, label **every Nth day**
  (`step = ceil(footprint / dayW)`, `labelled = (d) => (d - 1) % step === 0`, which is evenly
  spaced and always includes day 1) and add a tick at each labelled column. The whole cycle stays
  in one view, which is the requirement; the axis just gets sparser.
- Marks scale without a floor too (`dotR`, `mucR`), so they do not pile up at extreme density.
- **Settings > Reload the app** (`forceUpdate()`): deletes every cache, unregisters every service
  worker, reloads with `?fresh=<ts>` to defeat the HTTP cache as well. The version now also shows
  on the Phases tab. Three rounds were spent unable to tell "my layout is wrong" apart from "he is
  running an old cached shell", and that ambiguity was expensive.
- **Lesson: test the degenerate lengths, not just the textbook ones.** Every round of this bug was
  a floor or a clamp that held for 28 days and failed past 40, and the harness only had tidy
  cycles in it.

### v0.9.3 — upright header labels so long cycles stay readable  ✅ BUILT (2026-09-09)
"Past cycles dont fit on one page." They fitted the *width*, but the labels did not fit their
columns, which amounts to the same thing on screen.

- A horizontal 2-digit label needs roughly 1.2x its font size in width. Under about 13 units per
  day the DAY and DATE rows collide, and a 34-day cycle is 9.4 units per day. Measured, not
  guessed: 24 overlapping date labels at 34 days, 39 at 58 days.
- Fix: **turn the DAY and DATE labels upright** (rotate -90) whenever `dayW < 13`. Rotated, a
  label's horizontal footprint is its cap height (~0.72x font size), which fits any density a real
  cycle produces. Font scales with the column, `clamp(dayW * 1.15, 5.5, 9)`.
- Weekday stays horizontal, it is one character.
- **When checking density, measure the label footprint, not just the column count.** "It fits the
  viewBox" and "you can read it" are different questions, and only the second one matters.
- Deliberately NOT done: projecting an in-progress cycle out to its predicted length. It was built,
  then dropped — he said the current cycle was not the problem.

### v0.9.2 — Phases chart rework  ✅ BUILT (2026-09-08)
His feedback on v0.9.0, in his words: more emphasis on the chart, easier to read; one phase must not
span multiple pages; the bottom symbols did not line up with the days on top; the date and day of
phase belong at the top. He liked how the phases themselves are shown, so that stayed.

- **A "page" is a CYCLE, not a phase.** All three phases sit on one chart and the ‹ › picker moves
  to the next cycle. An intermediate build read this as one phase per page with a segmented control
  — wrong reading, reverted. Do not re-split the phases.
- **Nothing scrolls sideways.** `dayW = avail / L`, so the cycle always fits. This is what "a phase
  should not span multiple pages" actually meant: the old chart was 468px inside a 305px box.
- **Header rows** = day of the phase (restarts at 1 per phase, coloured by phase), day of the month,
  weekday. Bare day-of-month numbers, like the paper chart; the month lives in the card header.
- **Mucus symbols are drawn geometry** (`mucusMark()`), never font glyphs. ○ ⊖ ⊕ carry their own
  side bearings and sat visibly off-centre from their column. Verified aligned to <0.05 units.
- **viewBox is 310, close to the real card width**, so 1 unit renders as ~1 CSS px on a phone and
  scales up on a wider layout. A larger viewBox silently shrinks every font and mark.
- At 30 columns the date row is dense but does not overlap. Checked, not assumed.

### v0.9.0 — Phases tab (the three-phase model, real CCL rules)  ✅ BUILT (2026-09-08)
A fifth nav tab. One chart per cycle showing all three phases, plus a plain readout of which
rule decided each boundary and what is still missing. Cycle picker walks back through history.

**Why a separate module.** Juno already had a four-phase vocabulary (Menstrual / Follicular /
Fertile / Luteal on the Today ring) driven by `fertility.js`, whose fertile window comes from
calendar rhythm (`minLen - 19`) pulled earlier by first mucus. That is conservative but it is NOT
the Day 5/6 or Doering rule, so a box labelled "Phase 1" off that math would disagree with the
chart she works by hand. `js/phases.js` implements the taught rules instead, and deliberately
feeds nothing back: **the Today banner, calendar shading and push notifications still run entirely
on `fertility.js` / `nfp.js`.** Do not wire `phases.js` into them without re-reading §2.

**Rules implemented** (all in `js/phases.js`, all pure):
- **End of Phase 1** = the EARLIEST applicable of:
  - *Day 5/6 rule* — days 1–5; days 1–6 only if every one of the last 12 cycles ran ≥26 days.
    No history at all holds it at day 5.
  - *Doering rule* — earliest "first day of temperature rise" across the last 12 cycles, minus 7.
    Gated behind 6 cycles of temperature history, as the course requires.
  - *Mucus appeared* — mucus ends Phase 1 whatever the day, so Phase 1 stops the day before.
- **LTL** = highest normal temperature of the **Pre-Shift Six**; **HTL** = LTL + 0.4°F.
  Disturbed readings are excluded (reuses `markDisturbed` from `nfp.js`, now exported).
- **Peak Day** = the last day of more-fertile mucus. Taking the *last* peak-type day in the cycle
  handles peak mucus returning during the drying days on its own: that later day becomes Peak Day.
- **Start of Phase 3**, by whichever signs are charted:
  - *Sympto-Thermal Rule* (mucus + temps) — the LATER of the 3rd drying-up day after Peak and the
    3rd post-Peak temp above the LTL with that 3rd at/above the HTL. Weak 3rd → wait for a 4th
    above the LTL.
  - *Temperature-Only Rule* — 4th temp above the LTL with the last three at/above the HTL.
  - *Mucus-Only Rule* — a full four days past Peak Day.
  - Nothing confirmed → the day stays **Phase 2**. Never guess forward.

**Conventions worth not re-deciding:**
- A drying-up day must be a day she actually charted a mucus observation ("dry" counts). An
  unobserved day is skipped, which can only ever DELAY Phase 3 — the safe direction.
- Phase 3 opens in the **EVENING** of the confirming day, matching the paper chart's vertical line,
  so that whole day is drawn as Phase 3 but is not a full Phase 3 day. Said plainly in the UI.
- Phase 1 end takes the earliest rule rather than exposing the paper chart's rule checkbox as a
  setting. Earliest is always the conservative side, and it needs no new setting to get wrong.
- Colours follow the course booklet: Phase 1 blue, Phase 3 green, Phase 2 pink (the fertile one,
  the one they act on).

Chart carries: phase band with the menstruation bar under it, cycle-day numbers, temperature curve
with LTL/HTL lines and the Pre-Shift Six ringed, the mucus symbol row (○ ⊖ ⊕), Peak Day marked **P**
with the drying days numbered 1 2 3, the two vertical phase lines, and a today marker. Wider than
the phone on purpose — it scrolls inside `.phase-scroll`.

31 hand-checked assertions covered the rules at the time (Pre-Shift Six/LTL/HTL, Day 5/6 with and
without a short cycle, Doering gating and arithmetic, Peak Day incl. a returning peak, ST with a
strong and a weak 3rd temp, Temperature-Only, Mucus-Only, and unconfirmed staying Phase 2) — but
they were run in a scratch dir and thrown away, which is how v0.9.5's two bugs stayed hidden. All
of that ground is now covered by committed tests in `tests/phases-rules.test.mjs`.

### v0.8.4 — the "safe/not-safe flipped when we ended her period" bug  ✅ BUILT (2026-08-17)
Diagnosed from the real export (Settings → Download my data — always ask for it first; it's the ground
truth). **Root cause: a phantom period entry** `Aug 15 → Aug 15` sat five days after the real one
(`Aug 10 → Aug 15`). It was created by tapping the Today period button twice: the ONE button flipped
from "Period ended today" to "Period started today" in place, and `startPeriodGuarded` only blocked
a duplicate on the *same date*. `predict()` anchored on the newest start with zero validation, so the
whole cycle — next period, ovulation, fertile window — slid 5 days later: Aug 16 flipped to "safe",
Aug 28–Sep 1 flipped to "not safe" (exactly his report). Fixes:
- **`cycleStarts()` in `js/predict.js`** = the validated anchor list: a start < `MIN_CYCLE_DAYS` (15)
  after the previous kept start is a stray, not a cycle. EVERY "current cycle" consumer now uses it —
  predict, `nfp.currentCycleTemps`/`mucusPeak`, `fertility.firstMucusDay`, mood, stats. A stray entry
  can no longer become the anchor (verified: with the phantom still present the anchor is Aug 10 again).
- **Start guard** (`startBlockReason()` in ui.js): refuses a new start within 15 days of any existing
  start, toast explains + points to Stats › Logged periods to fix a wrong date. Applies to the Today
  button and the day sheet. **Today now has TWO buttons** ("started" / "ended") that never trade
  places — the inactive one is disabled — so a double tap can't log a phantom.
- **False-safe fixed:** `fertilityClass()` returned `predictedPeriod` BEFORE checking the fertile
  window, so days inside the predicted-period range read "Lower-risk window" even while the (mucus/
  temp-extended) window said not safe — his data showed that Aug 7–13. Risk is now evaluated first;
  the predicted-period shading only applies when the window is closed.
- **Phase ring** now reads the same effective window as the banner/calendar (`ctx.eff`; `ctx.fert`
  removed) and its fertile arc may overlap the period (short cycles open the window while bleeding);
  risk colour wins over period colour, like the banner. Previously it clamped fertile to start after
  the period and used the raw calendar window → said "Luteal" while the banner said "Not safe".
- **Temperature noise guard** (`js/nfp.js`): readings > 0.7°F off their neighbour-median are
  Sensiplan "disturbed values" — drawn hollow, excluded from coverline/shift; if > ⅓ of a cycle's
  readings are disturbed the series is `unreliable` and NO shift is confirmed (a shift "found" in
  noise is a false SAFE). Her real July series (95.5–98.8°F swings) had "confirmed" ovulation from
  that noise; it now shows "too erratic to confirm — take it at the same time each morning". A clean
  textbook series is untouched; a single fever spike is now excluded instead of jamming the coverline.
- **NOT changed (user's call):** the mucus model. `wet` stays peak-quality and the peak-rule +
  temperature "later wins" double-check stays — that's the NFP method their church teaches. Note her
  logging habit: "wet" nearly every day (12 peak-quality days in one cycle, incl. day 1 of bleeding)
  means the mucus rule holds the window open right up to the next period. That's data, not a bug.
- **Still to do by hand:** delete the phantom `Aug 15 – Aug 15` entry under Stats › Logged periods
  (harmless to predictions now, but it's clutter). Old-version phones need a reload for the sw cache
  bump (`juno-v0.8.4`).
- **Verified** with a Node replay of the real pure modules against his export (fake `today()`), and
  a browser harness that mounts `ui.js` with in-memory handlers: end-then-tap creates no entry, guard
  toasts, banner "Not safe" on both false-safe repros, ring arcs contiguous. Both were scratch-only.
  The three logic fixes (stray anchor, risk-before-label, temperature noise) are now committed as
  `tests/regressions-v0.8.4.test.mjs`; the UI-interaction parts (the two Today buttons, the guard
  toast) are still uncovered — they need the day sheet and toasts, not just the chart.

### v0.7.5–0.7.8 — PWA polish + data export  ✅ BUILT
- v0.7.5: Android **Back** closes the day sheet / notifications sub-screen (history trap) instead of
  exiting; **pull-to-refresh disabled** (overscroll-behavior).
- v0.7.6–0.7.7: swipe-down-to-dismiss on the sheet via a `touch-action:none` drag header. **NOTE: the
  swipe still doesn't work on the user's device** — user is fine leaving it (Back/Close/tap-dim all work).
  If revisited, try Pointer Events. Back-button + no-refresh DO work.
- v0.7.8: **Settings → Your data → "Download my data"** exports everything (cycles/days/settings) as a
  JSON backup file `juno-export-<date>.json`. `downloadData()` in ui.js.
- Product decision: user considers the app **feature-complete**. Declined intercourse logging,
  late-period panel, sharper mood forecast, privacy lock, and a mood-in-temp-chart strip. Keep mood
  input minimal (single 1–5 face). Don't re-pitch these unless asked.

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
  `FIREBASE_SERVICE_ACCOUNT` is set. ✅ Sender pipeline verified — but **this "verified" was true in
  v0.6 and then false for three months**, see §8 v0.9.7. Re-verified green 2026-10-20:
  `users found: 1`, first run `2 registered device token(s)` / send `1/2`, the dead token
  auto-pruned, second run `1 registered device token(s)` / send **`1/1`**.
  **A green `notify.yml` run is not proof of delivery** — read the log's `users found:` and
  `registered device token(s)` lines, and note that `1/2` is a partial failure, not a success.
- **Console note:** the redesigned Firebase console has NO "Cloud Messaging" tab under Settings. Reach
  Web Push certs by direct URL: `console.firebase.google.com/project/juno-a6adc/settings/cloudmessaging`.
- **REMAINING to see a notification land:** enable it on a phone (Settings → Turn on notifications;
  iPhone must be installed to Home Screen first) → that stores a token → then delivery works.
  As of 2026-10-20 **only one phone is registered** — there were two, the second one's token was
  stale and the notifier pruned it, so that phone has to re-enable. The notifier prunes dead
  tokens itself and now logs the per-device failure reason.
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
- **Tests are committed, and dependency-free** — `node:test` + `node:assert` only, run with
  `node --test`. A root `package.json` (`type: module`) is what lets Node import `js/*.js`; it adds
  no dependency and no build step, so §3 is intact. Scratch-dir harnesses are not tests: three
  separate ones were written, cited in this file as if they were a suite, and thrown away.
- **Roadmap-as-law** — the "live online / switch Claude accounts" requirement; the repo is the memory.
