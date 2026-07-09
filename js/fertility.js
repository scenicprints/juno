// Juno — fertility "can / cannot" window. Pure functions.
// SAFETY: this is fertility AWARENESS, not contraception. In 'avoid' mode we shade
// the fertile window CONSERVATIVELY (wide) and err toward "cannot" whenever unsure.
import { fmt, addDays, diffDays } from './dates.js';

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

// Classify a single date string for calendar shading + the Today banner.
// Returns one of: 'period' | 'predictedPeriod' | 'cannot' | 'fertile' | 'peak' | 'can'
export function classify(dateStr, ctx) {
  const { cycles = [], prediction, fert, mode = 'avoid' } = ctx;

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
  if (fert) {
    if (mode === 'avoid') {
      if (dateStr >= fert.fertileStart && dateStr <= fert.fertileEnd) return 'cannot';
    } else { // conceive / neutral
      if (dateStr >= fert.peakStart && dateStr <= fert.peakEnd) return 'peak';
      if (dateStr >= fert.fertileStart && dateStr <= fert.fertileEnd) return 'fertile';
    }
  }
  return mode === 'avoid' ? 'can' : 'can';
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
