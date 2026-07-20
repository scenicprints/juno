// Juno — period prediction. Pure functions over cycle history.
// A "cycle" = { id, startDate:'YYYY-MM-DD', endDate?:'YYYY-MM-DD' }.
import { parse, fmt, addDays, diffDays, today } from './dates.js';

const DEFAULT_LEN = 28;

// sorted ascending list of start-date strings
export function sortedStarts(cycles) {
  return cycles.map(c => c.startDate).filter(Boolean).sort();
}

// gaps between consecutive starts, in days
export function cycleLengths(cycles) {
  const s = sortedStarts(cycles);
  const out = [];
  for (let i = 1; i < s.length; i++) out.push(diffDays(s[i - 1], s[i]));
  // ignore obviously-wrong gaps (double logs / >90d)
  return out.filter(n => n >= 15 && n <= 90);
}

function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map(x => (x - m) ** 2)));
}

// Main prediction. `settings.typicalCycleLen` used before we have data.
export function predict(cycles, settings = {}) {
  const starts = sortedStarts(cycles);
  if (starts.length === 0) {
    return { state: 'none' };
  }
  const lastStart = starts[starts.length - 1];
  const lens = cycleLengths(cycles);
  const recent = lens.slice(-6);

  let avgLen, spread, state;
  if (recent.length >= 2) {
    avgLen = Math.round(mean(recent));
    spread = Math.max(Math.round(stdev(recent)), 2);
    state = 'ready';
  } else {
    avgLen = Number(settings.typicalCycleLen) || DEFAULT_LEN;
    spread = 4; // wider band while we're guessing
    state = 'learning';
  }

  const nextStart = fmt(addDays(lastStart, avgLen));
  const rangeStart = fmt(addDays(nextStart, -spread));
  const rangeEnd = fmt(addDays(nextStart, spread));
  const cycleDay = diffDays(lastStart, today()) + 1; // day 1 = period start day
  const daysUntil = diffDays(today(), nextStart);

  return {
    state, lastStart, avgLen, spread,
    nextStart, rangeStart, rangeEnd,
    cycleDay, daysUntil,
    cyclesLogged: starts.length,
  };
}

// current period (a cycle whose start <= today and no end, within ~10 days)
export function activePeriod(cycles) {
  const t = today();
  const open = (cycles || []).filter(c => c.startDate && !c.endDate &&
    diffDays(c.startDate, t) >= 0 && diffDays(c.startDate, t) <= 12);
  if (!open.length) return null;
  // the MOST RECENT open entry — using the first one meant "end period" could close an older
  // stray entry and leave the current period still open (app kept saying "on her period")
  return open.sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[open.length - 1];
}
