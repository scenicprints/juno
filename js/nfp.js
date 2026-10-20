// Juno — Natural Family Planning temperature analysis (sympto-thermal, temperature-only).
// Detects the coverline (LTL = Lower Temperature Level), the thermal shift, estimated ovulation,
// and the start of the post-ovulatory infertile phase, for the CURRENT cycle. Pure functions.
//
// Rules (Sensiplan-style, in °F):
//  - Coverline (LTL) = the highest of the 6 low temperatures immediately before the rise.
//  - Thermal shift = 3 consecutive temps above the coverline; the 3rd must be at least
//    ~0.4°F (0.2°C) above it — otherwise wait for a 4th temp that is simply above the coverline.
//  - Post-ovulatory infertile phase begins on that confirming (3rd or 4th) high temp.
//  - Estimated ovulation ≈ the last low day before the rise (temperature can't pinpoint it;
//    the true NFP "peak day" is a cervical-mucus sign, not temperature).
import { diffDays, fmt, addDays } from './dates.js';
import { cycleStarts } from './predict.js';

const SHIFT_MIN_F = 0.36; // °F ≈ 0.2°C
// A reading this far off the neighbouring readings is a "disturbed value" (fever, bad night,
// alcohol, taken late) — Sensiplan says exclude it. Real BBT moves ~0.1–0.3°F day to day; a
// genuine shift is ~0.4–0.8°F, so at the shift boundary the neighbour median sits in between
// and a real rise is NOT flagged.
const DISTURBED_F = 0.7;
// If more than this share of a cycle's readings are disturbed, the series is too erratic to
// confirm anything — a shift "found" in noise is a false SAFE, the dangerous direction.
const MAX_DISTURBED_SHARE = 1 / 3;

// Mucus is logged in two parts: sensation (felt) + characteristic (seen).
// Peak-quality (most fertile) = a wet/slippery sensation OR stretchy characteristic.
const PEAK_SENSATIONS = new Set(['wet', 'slippery', 'wetslippery']);
export function isPeakMucus(day) {
  if (!day) return false;
  if (PEAK_SENSATIONS.has(day.mucusSensation)) return true;
  if (day.mucusChar === 'stretchy') return true;
  if (day.mucus === 'eggwhite' || day.mucus === 'watery') return true; // legacy single field
  return false;
}
export function hasMucus(day) {
  if (!day) return false;
  if (day.mucusSensation && day.mucusSensation !== 'dry') return true;
  if (day.mucusChar) return true;
  if (day.mucus && day.mucus !== 'dry') return true; // legacy
  return false;
}

export function currentCycleTemps(cycles, days) {
  const starts = cycleStarts(cycles || []);
  if (!starts.length || !days) return { cycleStart: null, series: [] };
  const cycleStart = starts[starts.length - 1];
  const series = Object.keys(days)
    .filter((d) => d >= cycleStart && typeof days[d].tempF === 'number' && days[d].tempF > 90 && days[d].tempF < 105)
    .sort()
    .map((d) => ({ date: d, t: days[d].tempF, cycleDay: diffDays(cycleStart, d) + 1 }));
  markDisturbed(series);
  return { cycleStart, series };
}

// flag readings that sit far off the median of their (up to 4) nearest neighbours
export function markDisturbed(series) {
  const n = series.length;
  for (let i = 0; i < n; i++) {
    const nb = [];
    for (let k = 1; k <= 2; k++) { if (i - k >= 0) nb.push(series[i - k].t); if (i + k < n) nb.push(series[i + k].t); }
    if (nb.length < 2) { series[i].disturbed = false; continue; }
    nb.sort((a, b) => a - b);
    const med = nb.length % 2 ? nb[(nb.length - 1) / 2] : (nb[nb.length / 2 - 1] + nb[nb.length / 2]) / 2;
    series[i].disturbed = Math.abs(series[i].t - med) > DISTURBED_F;
  }
}

// Cervical-mucus "Peak Day" for the current cycle = the LAST day of peak-type mucus in the
// whole cycle. By the NFP peak rule, the infertile phase begins the evening of the 3rd day
// after Peak, so we report the 4th day as the first fully-infertile day (conservative).
//
// This is DELIBERATELY NOT the locked Peak Day that phases.js:peakDay() computes, and the two
// must NOT be unified. They answer different questions:
//   - phases.peakDay() charts ONE cycle's three phases, so its Peak locks once three drying
//     days complete and a later patch is a new patch (v0.9.5).
//   - this one feeds effectiveWindow(), where mucus may only ever push "safe again" LATER.
//     Taking the last peak-type day means a fresh patch of fertile mucus after the drying
//     days keeps the window open - which is what the method requires, because a new patch is
//     a new fertile phase, and effectiveWindow() has no way to express "reopened".
//
// Measured against a real "wet on most days" logging pattern (2026-10-20): porting the lock
// here moves Peak from May 28 to May 11 and collapses "safe again" from Jun 1 to May 15 -
// 17 not-safe days turned safe, in Avoid mode. That is a false SAFE, the dangerous
// direction. Locked by tests/invariants-safety.test.mjs. See ROADMAP SS2 and SS8 v0.9.8.
export function mucusPeak(cycles, days) {
  const starts = cycleStarts(cycles || []);
  if (!starts.length || !days) return null;
  const cycleStart = starts[starts.length - 1];
  let peak = null;
  Object.keys(days).filter((d) => d >= cycleStart).sort()
    .forEach((d) => { if (isPeakMucus(days[d])) peak = d; });
  if (!peak) return null;
  return { peakDate: peak, infertileFrom: fmt(addDays(peak, 4)) };
}

export function analyze(cycles, days) {
  const { cycleStart, series } = currentCycleTemps(cycles, days);
  const disturbedCount = series.filter((s) => s.disturbed).length;
  // `series` keeps every reading (for the chart); the rules run on the undisturbed ones only
  const clean = series.filter((s) => !s.disturbed);
  const unreliable = series.length >= 6 && disturbedCount > series.length * MAX_DISTURBED_SHARE;
  const res = {
    cycleStart, series, disturbedCount, unreliable,
    coverline: null, shiftDays: [], infertileFrom: null, ovulationEst: null,
    hasShift: false, tentative: false,
  };
  if (unreliable) return res; // too noisy to confirm — err toward "not confirmed"
  for (let i = 6; i + 2 < clean.length; i++) {
    const ltl = Math.max(...clean.slice(i - 6, i).map((s) => s.t));
    const t1 = clean[i], t2 = clean[i + 1], t3 = clean[i + 2];
    if (t1.t > ltl && t2.t > ltl && t3.t > ltl) {
      res.coverline = Math.round(ltl * 100) / 100;
      res.ovulationEst = clean[i - 1].date;
      res.hasShift = true;
      const shift = [t1.date, t2.date, t3.date];
      if (t3.t >= ltl + SHIFT_MIN_F) {
        res.infertileFrom = t3.date;                 // strong 3rd temp → confirmed
      } else if (i + 3 < clean.length && clean[i + 3].t > ltl) {
        shift.push(clean[i + 3].date);
        res.infertileFrom = clean[i + 3].date;       // weak 3rd → confirmed by a 4th
      } else {
        res.tentative = true;                         // rise seen, not yet confirmed
      }
      res.shiftDays = shift;
      return res;
    }
  }
  return res;
}
