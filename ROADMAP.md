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
**v0.9.5 (2026-09-09)** — two real correctness bugs in `peakDay()`, both spotted by him on his own
data ("why in aug 10 to sep 4 is sep 3rd the peak day"). **(1) Peak Day never locked:** the scan
reassigned it on every peak-type day, so the LAST one in the cycle won, and one late wet/slippery
log dragged Peak Day to the end of the cycle. The ST Rule then waited on drying days and
temperatures that were never coming, so Phase 3 never opened — which is also why cycles were
missing a complete Phase 1/2/3. **(2) A period reads as peak mucus:** `wet` is a peak-quality
sensation and bleeding is wet, so a period day registered as the most fertile mucus of the cycle
and put Peak Day on day 1. Both fixed; 9 new regression tests, all 8 of the relevant ones verified
failing against v0.9.4 first. Suite now 40.

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
- **The 31-test suite passed through both bugs.** Every case in it was a tidy textbook cycle with
  no late mucus patch and no mucus logged during the period. Test the messy shapes real logging
  produces, not the ones the rules are illustrated with.

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

31 hand-checked assertions cover the rules (Pre-Shift Six/LTL/HTL, Day 5/6 with and without a short
cycle, Doering gating and arithmetic, Peak Day incl. a returning peak, ST with a strong and a weak
3rd temp, Temperature-Only, Mucus-Only, and unconfirmed staying Phase 2).

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
  toasts, banner "Not safe" on both false-safe repros, ring arcs contiguous.

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
