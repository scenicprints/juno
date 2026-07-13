// Juno — fertility "can / cannot" window. Pure functions.
// SAFETY: this is fertility AWARENESS, not contraception. In 'avoid' mode we shade
// the fertile window CONSERVATIVELY (wide) and err toward "cannot" whenever unsure.
import { fmt, addDays, diffDays } from './dates.js';
import { analyze as nfpAnalyze, mucusPeak } from './nfp.js';

// Given a prediction (from predict.js) and mode, return key fertility dates.
// Ovulation ~14 days before the next period (luteal phase is the stable part).
export function window(prediction, mode = 'avoid') {
  if (!prediction || (prediction.state !== 'ready' && prediction.state !== 'learning')) {
    return null;
  }
  const ovulation = fmt(addDays(prediction.nextStart, -14));

  // base biological window: sperm ~5d before, egg ~1d after
  let openOffset = -5, closeOffset = 1;
  if (mode === 'avoid') { openOffset = -7; closeOffset = 2; } // conservative buffer

  return {
    ovulation,
    fertileStart: fmt(addDays(ovulation, openOffset)),
    fertileEnd: fmt(addDays(ovulation, closeOffset)),
    peakStart: fmt(addDays(ovulation, -1)),
    peakEnd: fmt(addDays(ovulation, 1)),
    mode,
  };
}

// first day of any (non-dry) cervical mucus this cycle — where the fertile phase starts by the mucus sign
function firstMucusDay(cycles, days) {
  const starts = (cycles || []).map((c) => c.startDate).filter(Boolean).sort();
  if (!starts.length || !days) return null;
  const cs = starts[starts.length - 1];
  const ds = Object.keys(days).filter((x) => x >= cs && days[x].mucus && days[x].mucus !== 'dry').sort();
  return ds.length ? ds[0] : null;
}

// Effective fertile window = calendar estimate, made SAFER by whatever signs are logged:
//  - mucus first-appearance can move the fertile START earlier;
//  - a confirmed temperature shift and/or the mucus peak-rule can push "safe again" LATER
//    (whichever confirms latest — the conservative sympto-thermal double-check).
// With NO temperature and NO mucus logged, it's exactly the calendar estimate — still works.
export function effectiveWindow(cycles, days, prediction, mode = 'avoid') {
  const base = window(prediction, mode);
  if (!base) return null;
  const tc = confirmedOvulation(cycles, days);
  const mp = mucusPeak(cycles, days);
  let fertileStart = base.fertileStart;
  let safeAgain = fmt(addDays(base.fertileEnd, 1)); // calendar baseline
  if (mode === 'avoid') {
    const fm = firstMucusDay(cycles, days);
    if (fm && fm < fertileStart) fertileStart = fm;
    if (tc && tc.infertileFrom > safeAgain) safeAgain = tc.infertileFrom;
    if (mp && mp.infertileFrom > safeAgain) safeAgain = mp.infertileFrom;
  } else if (tc && tc.infertileFrom > safeAgain) {
    safeAgain = tc.infertileFrom;
  }
  return { ...base, fertileStart, safeAgain, tempConfirmed: !!tc, mucusPeakDate: mp ? mp.peakDate : null };
}

// Classify a single date string for calendar shading + the Today banner.
// Returns one of: 'period' | 'predictedPeriod' | 'cannot' | 'fertile' | 'peak' | 'can'
export function classify(dateStr, ctx) {
  const { cycles = [], prediction, mode = 'avoid' } = ctx;
  const eff = ctx.eff || ctx.fert; // effective window (calendar + temp + mucus)

  // actual logged period days
  for (const c of cycles) {
    if (!c.startDate) continue;
    const end = c.endDate || c.startDate;
    if (dateStr >= c.startDate && dateStr <= end) return 'period';
  }
  if (!prediction || prediction.state === 'none') return 'can';

  // predicted next period band
  if (prediction.rangeStart && dateStr >= prediction.rangeStart && dateStr <= prediction.rangeEnd) {
    return 'predictedPeriod';
  }
  if (eff) {
    if (mode === 'avoid') {
      // fertile ("cannot") from the (possibly-earlier) start until confirmed safe again
      if (dateStr >= eff.safeAgain) return 'can';
      if (dateStr >= eff.fertileStart) return 'cannot';
      return 'can';
    }
    // conceive / neutral
    if (dateStr >= eff.peakStart && dateStr <= eff.peakEnd) return 'peak';
    if (dateStr >= eff.fertileStart && dateStr <= eff.fertileEnd) return 'fertile';
  }
  return 'can';
}

// Temperature-confirmed ovulation for the CURRENT cycle — delegates to the shared NFP
// coverline/thermal-shift analysis (js/nfp.js) so the "green light" and the chart agree.
// Returns { ovulation, shiftStart, infertileFrom } only once the shift is CONFIRMED (not tentative).
export function confirmedOvulation(cycles, days) {
  const a = nfpAnalyze(cycles, days);
  if (a.hasShift && a.infertileFrom) {
    return { ovulation: a.ovulationEst, shiftStart: a.shiftDays[0], infertileFrom: a.infertileFrom };
  }
  return null;
}

// Human-facing status for TODAY.
export function todayStatus(dateStr, ctx) {
  const cls = classify(dateStr, ctx);
  const mode = ctx.mode || 'avoid';
  if (cls === 'period') return { key: 'period', label: 'Period', tone: 'period' };
  if (ctx.prediction?.state === 'learning')
    return { key: 'learning', label: 'Still learning your cycle', tone: 'muted' };
  if (mode === 'avoid') {
    if (cls === 'cannot') return { key: 'cannot', label: 'Not safe — fertile window', tone: 'cannot' };
    return { key: 'can', label: 'Lower-risk window', tone: 'can' };
  }
  if (cls === 'peak') return { key: 'peak', label: 'Peak fertility', tone: 'peak' };
  if (cls === 'fertile') return { key: 'fertile', label: 'Fertile window', tone: 'fertile' };
  return { key: 'low', label: 'Low fertility', tone: 'muted' };
}
