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
**v0.3.0 — all three pillars live, pushed to Pages.** Sign-in (shared account), period logging,
prominent **daily check-in** (mood 1–5 + tappable preset symptom chips + optional **morning
temperature** + note), calendar with prediction + can/cannot shading, Today can/cannot banner,
**temperature-confirmed ovulation** ("safe again" signal), **mood/PMS forecast** on Today, mode
toggle, live Firestore sync, installable PWA. Firebase project = `juno-a6adc`, config in
`js/firebase.js`.
- Symptom chips = flat `SYMPTOMS` array in `js/ui.js`.
- Temp logic = `confirmedOvulation()` in `js/fertility.js` (3 logged temps ≥0.3°F over prior-6 avg).
- Mood forecast = `moodForecast()` in `js/mood.js` (aligns mood to days-before-period; needs
  ≥5 logs across ≥1 completed cycle before it surfaces anything; shows a "keep logging" hint otherwise).

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
### v0.4 — Notifications
- Period-soon, entering/leaving the "cannot" window, late-period alert (web push; iOS needs the installed PWA).
### v0.5 — Stats & polish
- Cycle regularity, averages (avg/shortest/longest), a "today" phase ring.
### Later / optional
- Birth-control or pill reminders, a lighter partner-view layout, data export, PIN/biometric lock.

## 9. Decisions log (why things are the way they are)
- **Web/PWA, not Flutter** — she's on iPhone; iOS blocks the APK-OTA self-update trick. User chose web.
- **No build step** — so any Claude account can edit + push with zero toolchain.
- **Firebase for sync** — no server to run; public config is safe; Firestore rules enforce privacy.
- **Avoid mode default + conservative shading** — the stated main purpose is avoiding pregnancy.
- **Mood logging is in v0.1** (not later) — mood *prediction* needs history recorded from day one.
- **Roadmap-as-law** — the "live online / switch Claude accounts" requirement; the repo is the memory.
