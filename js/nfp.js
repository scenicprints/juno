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

const SHIFT_MIN_F = 0.36; // °F ≈ 0.2°C

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
  const starts = (cycles || []).map((c) => c.startDate).filter(Boolean).sort();
  if (!starts.length || !days) return { cycleStart: null, series: [] };
  const cycleStart = starts[starts.length - 1];
  const series = Object.keys(days)
    .filter((d) => d >= cycleStart && typeof days[d].tempF === 'number' && days[d].tempF > 90 && days[d].tempF < 105)
    .sort()
    .map((d) => ({ date: d, t: days[d].tempF, cycleDay: diffDays(cycleStart, d) + 1 }));
  return { cycleStart, series };
}

// Cervical-mucus "Peak Day" for the current cycle = the LAST day of peak-type mucus.
// By the NFP peak rule, the infertile phase begins the evening of the 3rd day after Peak,
// so we report the 4th day as the first fully-infertile day (conservative).
export function mucusPeak(cycles, days) {
  const starts = (cycles || []).map((c) => c.startDate).filter(Boolean).sort();
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
  const res = {
    cycleStart, series,
    coverline: null, shiftDays: [], infertileFrom: null, ovulationEst: null,
    hasShift: false, tentative: false,
  };
  for (let i = 6; i + 2 < series.length; i++) {
    const ltl = Math.max(...series.slice(i - 6, i).map((s) => s.t));
    const t1 = series[i], t2 = series[i + 1], t3 = series[i + 2];
    if (t1.t > ltl && t2.t > ltl && t3.t > ltl) {
      res.coverline = Math.round(ltl * 100) / 100;
      res.ovulationEst = series[i - 1].date;
      res.hasShift = true;
      const shift = [t1.date, t2.date, t3.date];
      if (t3.t >= ltl + SHIFT_MIN_F) {
        res.infertileFrom = t3.date;                 // strong 3rd temp → confirmed
      } else if (i + 3 < series.length && series[i + 3].t > ltl) {
        shift.push(series[i + 3].date);
        res.infertileFrom = series[i + 3].date;       // weak 3rd → confirmed by a 4th
      } else {
        res.tentative = true;                         // rise seen, not yet confirmed
      }
      res.shiftDays = shift;
      return res;
    }
  }
  return res;
}
