# Juno — Backlog (short version)

`ROADMAP.md` is the detailed continuity guide and the law. This is the quick list of what is
actually open. **Rewritten 2026-10-20 (v0.9.7).** The previous version of this file was written at
v0.0 and still listed v0.1–v0.5 as upcoming work; it was deleted in `5fb79b3` and, had it been
restored verbatim, would have told the next agent to go build features that shipped a year ago.

**Three pillars (all live since v0.1):** predict next period · forecast cycle-linked mood ·
conservative "can / cannot" fertility window. Default mode = **Avoid**. Web app / PWA on GitHub
Pages, Firebase sync, no build step. The user considers the app **feature-complete** (v0.7.8).

## Open — correctness
- [ ] **`nfp.mucusPeak()` never got v0.9.5's fixes.** The Peak Day lock and the bleeding exclusion
      landed in `phases.js:peakDay()` only. `nfp.mucusPeak()` drives the Today banner, the calendar
      shading and the notifier, so the Phases tab and the Today banner can disagree about which day
      Peak Day was. It errs **safe** (a late stray peak only holds the window open longer), so it is
      not a false-safe — but fixing it **moves the safety window**. Re-read ROADMAP §2 first and
      decide deliberately. See §8 v0.9.6.
- [ ] **Committed tests — check `tests/` before assuming there are none.** A suite was being added
      in a parallel session on 2026-10-20; if `tests/` and a root `package.json` exist, this item is
      **done** and the open question is only coverage. Background: the "40-test suite" §4 refers to
      was always scratch-only, and every bug in v0.9.2–v0.9.5 got through because the scratch
      harnesses only held tidy textbook cycles. A committed suite needs a **root** `package.json`
      with `"type": "module"` so Node loads `js/*.js` as ES modules. Whatever exists, make sure it
      covers the degenerate shapes: 9, 74 and 121-day cycles, mucus logged during a period, a late
      stray peak, a noisy temperature series.

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
- [ ] **Only one phone is registered for push.** There were two; on 2026-10-20 the second one's
      token was stale (test send `1/2`), the notifier auto-pruned it, and the next run was a clean
      `1/1`. Whichever phone stopped getting notifications has to re-enable under Settings →
      Notifications → Turn on notifications (iPhone must be installed to the Home Screen first).
      Nothing in the app surfaces "this device is no longer registered", which is worth fixing.

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
