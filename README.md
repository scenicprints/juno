# Juno

A private period & cycle tracker for two people, as an installable **web app (PWA)**. It predicts
her next period, forecasts cycle-linked mood, and gives **conservative "can / cannot"
fertility-awareness guidance**.

- **Live app:** https://scenicprints.github.io/juno/ — open on the phone → Share → **Add to Home Screen**.
- ⚠️ **Not medical advice, and not contraception.** Fertility awareness is awareness, not birth control.

## How it's built
Plain HTML + JavaScript (ES modules) + CSS — **no build step**. Hosted free on **GitHub Pages**;
any push to `main` goes live automatically. Cross-device sync via **Firebase** (Firestore + Auth).
Personal data lives in Firebase, locked to the two users — this repo is **code only**.

## Continuing the project
This repo is the whole project. Read **`CLAUDE.md`** first, then **`ROADMAP.md`** (detailed) and
**`BACKLOG.md`** (short). Every work session ends by updating `ROADMAP.md` and pushing.
