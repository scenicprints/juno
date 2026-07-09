# Juno — start here (for any Claude agent)

You are continuing **Juno**, a private period/cycle-tracker **web app (PWA)**. This repository is
the **entire** project — there is no local copy and no memory outside these files.

## Do this, in order
1. Read **`ROADMAP.md`** top-to-bottom (then **`BACKLOG.md`**). It has the stack, the math, the
   safety rules, and the current batch.
2. Do the work for the current batch.
3. **Before you stop: update `ROADMAP.md`** (status / what changed / decisions / gotchas), then
   commit and push to `main`. GitHub Pages redeploys automatically. **If you didn't update the
   roadmap, you're not done.**

## Hard rules
- **Web app, no build step:** plain HTML + ES-module JS + CSS. Do **not** add a bundler, framework
  toolchain, or Flutter. GitHub Pages serves the repo files directly.
- **Fertility guidance is awareness, not contraception.** Keep Avoid mode conservative and the
  disclaimer visible. Never state a prediction as certainty — always show the confidence range.
- **Personal data lives in Firebase, never in this repo.** Keep the repo code-only.

Repo: https://github.com/scenicprints/juno · Live: https://scenicprints.github.io/juno/
