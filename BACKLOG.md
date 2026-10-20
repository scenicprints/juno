# Juno — Backlog (short version)

`ROADMAP.md` is the detailed continuity guide and the law. This is the quick list of what is
actually open. **Rewritten 2026-10-20 (v0.9.7).** The previous version of this file was written at
v0.0 and still listed v0.1–v0.5 as upcoming work; it was deleted in `5fb79b3` and, had it been
restored verbatim, would have told the next agent to go build features that shipped a year ago.

**Three pillars (all live since v0.1):** predict next period · forecast cycle-linked mood ·
conservative "can / cannot" fertility window. Default mode = **Avoid**. Web app / PWA on GitHub
Pages, Firebase sync, no build step. The user considers the app **feature-complete** (v0.7.8).

## Closed 2026-10-20 (kept briefly so the next agent does not reopen them)
- [x] **`nfp.mucusPeak()` vs `phases.peakDay()` — settled in v0.9.8: do NOT unify them.** Measured
      first: porting v0.9.5's lock into `mucusPeak()` collapses "safe again" by 17 days on a
      realistic "wet most days" cycle — a false SAFE. `effectiveWindow()` cannot express "a new
      mucus patch reopened the window", and the last-peak-day scan is how that gets represented.
      The *display* was the real bug and is fixed: the Temperature card now quotes the same locked
      Peak Day the Phases tab charts. Locked by `tests/invariants-safety.test.mjs`. See §8 v0.9.8.
- [x] **Committed tests — done.** `tests/`, 70 tests, `node --test` from the repo root, no
      dependencies, wired to CI in `.github/workflows/tests.yml`. Covers the degenerate shapes
      (9/74/121-day cycles, mucus during a period, a late stray peak, a noisy series) and the
      rendered chart via a DOM shim. Verified to FAIL when the v0.8.4/v0.9.5/v0.9.8 fixes are
      reverted — keep that property when adding to it.

## Open — correctness
- [ ] **Paper chart step 3: the mucus LETTER is not drawn.** The chart draws the symbol (○ ⊖ ⊕)
      but not the letter code beside it, which the CCL chart wants for sensation and
      characteristic. Cosmetic, finishes the step-by-step match. See §8 v0.9.6.
- [ ] **Paper chart step 8: the rise is still not anchored near Peak Day.** Both `nfp.analyze()`
      and `phases.js:thermalShift()` take the FIRST qualifying rise in the cycle; the sheet says to
      look *close to Peak Day*. v0.9.9 fixed the dangerous consequence in the live path (a shift
      that would close the window before it opens is now ignored) but NOT the cause. Two residues:
      **(a)** with peak-quality mucus logged, an early artifact still shortens the window by 2-3
      days; **(b)** `phases.js` is untouched, so the **chart** can still ring the Pre-Shift Six on
      menstrual days and open Phase 3 early. Read-only, so it cannot move the banner, but she reads
      that chart. The real fix is to require the rise to begin near Peak Day when mucus is charted.
      **Do NOT "fix" this by excluding menstrual readings from the Pre-Shift Six** - that was tried
      in v0.9.9, four tests went red, and they were right: the method counts them, and Doering
      breaks without them. See ROADMAP v0.9.9.
- [ ] **Product call, unanswered: may a confirmed shift close the window EARLIER than the
      calendar?** Today it may, and that is the payoff for taking temperatures at all. ROADMAP
      v0.7.2 claims "signs can only make it safer, never less safe", which was only ever true of
      the mucus branch - the temperature branch always superseded. Making it a maximum would be
      strictly safer and would remove most of the reason to temp. Needs a decision, not a guess.

## Open — notifications
- [ ] **The `*/15` cron does not run every 15 minutes.** Measured 2026-10-20: ~5 runs/day, hours
      apart (GitHub drops most scheduled runs on a free public repo). The once-daily digest
      survives this — it is gated to "at/after 8:00am local" and de-duped by local date, so it
      still lands, just later than 8am. The **temperature reminder does not**: it only fires inside
      a 20-minute window (`REMINDER_WINDOW`) around the chosen time, and ~5 random runs/day hit a
      given 20-minute window about 7% of the time. Deliberately **not** changed in v0.9.7, because
      the honest fix is a product call: widening the window means a "take your temperature right
      after waking" push can arrive at 2pm, which is worse than silence. Options: widen to ~90 min
      and accept late-but-plausible; drop the feature; or move the notifier off GitHub cron.
      **A fourth option, probably the best:** fire on the FIRST run at/after the target local time
      each day, de-duped by local date — exactly the mechanism the daily digest already uses
      successfully — but skip it entirely if that run lands more than ~2-3h late. That turns "must
      hit a 20-minute window" into "most mornings, or not at all", with no 2pm nonsense. Re-measure
      the real cadence first: `gh run list -R scenicprints/juno -w "Juno notifications" -L 100`
      grouped by day. Measured 2026-10-20: **4-6 runs/day.**
- [ ] **Only one phone is registered for push.** There were two; on 2026-10-20 the second one's
      token was stale (test send `1/2`), the notifier auto-pruned it, and the next run was a clean
      `1/1`. Whichever phone stopped getting notifications has to re-enable under Settings →
      Notifications → Turn on notifications (iPhone must be installed to the Home Screen first).
      Nothing in the app surfaces "this device is no longer registered", which is worth fixing.
      **Concrete fix:** on app load, when `Notification.permission === 'granted'` and
      `pushConfigured()`, silently re-run `getToken` + `saveToken` (idempotent, `arrayUnion`).
      That would have re-registered the pruned phone by itself the next time it was opened.
      `push.js:enableNotifications()` already does all of this — it just needs a quiet path that
      skips the permission prompt and the toasts.

## Open — small / later
- [ ] Use temperatures to **narrow the next-period prediction** (today they only gate the
      safe-again call), and handle a delayed or ambiguous thermal shift explicitly. (§8 v0.2)
- [ ] Shade the forecast low-mood days on the **calendar**; per-symptom forecasting. (§8 v0.3)
- [ ] Check whether the phantom `Aug 15 – Aug 15` period entry was ever deleted under
      Stats → Logged periods. Harmless to predictions since v0.8.4, but it is clutter. (§8 v0.8.4)
- [ ] Optional, never requested: pill / birth-control reminders · partner-lite view ·
      PIN/biometric lock.

## Declined — do NOT re-pitch (user's call, v0.7.8)
Intercourse logging · a late-period panel · a sharper mood forecast · a privacy lock · a
mood strip in the temperature chart. Keep mood input minimal (a single 1–5 face). Also settled:
**web/PWA, not Flutter**, and **no build step** (ROADMAP §3, §9) — do not re-pitch either.

## Rule
Every session ends by updating `ROADMAP.md` and pushing to `main`. The repo is the only memory.
