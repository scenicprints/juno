// Juno — cycle statistics. Pure functions over cycle history.
import { diffDays } from './dates.js';
import { sortedStarts, cycleLengths } from './predict.js';

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const stdev = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

export function cycleStats(cycles) {
  const starts = sortedStarts(cycles);
  const lengths = cycleLengths(cycles);
  const periodLens = (cycles || [])
    .filter(c => c.startDate && c.endDate)
    .map(c => diffDays(c.startDate, c.endDate) + 1)
    .filter(n => n >= 1 && n <= 15);

  const out = { cyclesLogged: starts.length, hasData: lengths.length >= 1 };
  if (lengths.length) {
    out.avgCycle = Math.round(mean(lengths));
    out.minCycle = Math.min(...lengths);
    out.maxCycle = Math.max(...lengths);
    const sd = stdev(lengths);
    out.variability = Math.round(sd * 10) / 10;
    out.regularity = lengths.length < 2 ? null : (sd <= 1.5 ? 'Very regular' : sd <= 3 ? 'Fairly regular' : 'Irregular');
  }
  if (periodLens.length) out.avgPeriod = Math.round(mean(periodLens));

  // recent completed cycles (start date + length), newest first
  const recent = [];
  for (let i = 1; i < starts.length; i++) {
    const len = diffDays(starts[i - 1], starts[i]);
    if (len >= 15 && len <= 90) recent.push({ start: starts[i - 1], length: len });
  }
  out.recent = recent.slice(-6).reverse();
  return out;
}
