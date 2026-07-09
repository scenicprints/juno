// Juno — in-app heads-up alerts. Pure function. Surfaces time-sensitive reminders at the top
// of the app when she opens it (the free, cross-platform stand-in for OS push — see ROADMAP §8 v0.4).
import { diffDays, today, prettyDate } from './dates.js';

// ctx: { prediction, fert, mode, tempConfirm, moodF, activePeriod }
export function alerts(ctx) {
  const out = [];
  const t = today();
  const { prediction: p, fert, mode, tempConfirm, moodF, activePeriod } = ctx;

  // --- period timing ---
  if (p && p.state !== 'none' && !activePeriod) {
    const du = p.daysUntil; // diffDays(today, nextStart)
    if (du <= -2) out.push({ level: 'warn', text: `Her period is about ${Math.abs(du)} days late.` });
    else if (du === 0) out.push({ level: 'info', text: 'Her period is expected today.' });
    else if (du >= 1 && du <= 3) out.push({ level: 'info', text: `Her period is likely in ~${du} day${du > 1 ? 's' : ''} (around ${prettyDate(p.nextStart)}).` });
  }

  // --- fertility window ---
  if (fert && mode === 'avoid' && !tempConfirm) {
    const toOpen = diffDays(t, fert.fertileStart);
    if (toOpen === 1) out.push({ level: 'warn', text: `Not-safe window opens tomorrow (through ${prettyDate(fert.fertileEnd)}). Plan protection.` });
  }
  if (fert && mode === 'conceive') {
    const toOpen = diffDays(t, fert.fertileStart);
    if (toOpen === 1) out.push({ level: 'info', text: `Fertile window starts tomorrow — peak around ${prettyDate(fert.peakStart)}–${prettyDate(fert.peakEnd)}.` });
    else if (toOpen === 0) out.push({ level: 'info', text: 'Fertile window starts today.' });
  }

  // --- mood dip ---
  if (moodF && moodF.signal && moodF.forecastStart) {
    const toDip = diffDays(t, moodF.forecastStart);
    if (toDip === 1) out.push({ level: 'info', text: `Heads up: her mood may dip over the next few days (through ${prettyDate(moodF.forecastEnd)}).` });
    else if (toDip <= 0 && diffDays(t, moodF.forecastEnd) >= 0) out.push({ level: 'info', text: `She may be in a lower-mood stretch now (through ${prettyDate(moodF.forecastEnd)}).` });
  }

  return out;
}
