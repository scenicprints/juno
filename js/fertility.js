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
    const tc = ctx.tempConfirm; // temperature-confirmed ovulation for the current cycle (or null)
    if (mode === 'avoid') {
      if (tc) {
        // temps confirm ovulation: fertile from window-open until confirmation, then safe
        if (dateStr >= tc.infertileFrom) return 'can';
        if (dateStr >= fert.fertileStart) return 'cannot';
        return 'can';
      }
      if (dateStr >= fert.fertileStart && dateStr <= fert.fertileEnd) return 'cannot';
    } else { // conceive / neutral
      if (dateStr >= fert.peakStart && dateStr <= fert.peakEnd) return 'peak';
      if (dateStr >= fert.fertileStart && dateStr <= fert.fertileEnd) return 'fertile';
    }
  }
  return 'can';
}

// Temperature-confirmed ovulation for the CURRENT cycle (after the last period start).
// Basal body temperature rises ~0.3°F+ after ovulation and stays up. Rule: 3 consecutive
// logged temps at least 0.3°F above the average of the previous 6 logged temps → ovulation
// has passed; the infertile luteal phase begins on that 3rd high temp.
// NOTE (v0.2 simplification): uses consecutive *logged* temps, tolerant of a missed day here
// or there rather than requiring calendar-consecutive days. Refine later if needed.
export function confirmedOvulation(cycles, days) {
  const starts = (cycles || []).map(c => c.startDate).filter(Boolean).sort();
  if (!starts.length || !days) return null;
  const cycleStart = starts[starts.length - 1];
  const series = Object.keys(days)
    .filter(d => d >= cycleStart && typeof days[d].tempF === 'number' && days[d].tempF > 90)
    .sort()
    .map(d => ({ date: d, t: days[d].tempF }));
  if (series.length < 9) return null; // need 6 baseline + 3 elevated
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  for (let i = 6; i + 2 < series.length; i++) {
    const base = avg(series.slice(i - 6, i).map(e => e.t)) + 0.3;
    if (series[i].t >= base && series[i + 1].t >= base && series[i + 2].t >= base) {
      return { ovulation: series[i - 1].date, shiftStart: series[i].date, infertileFrom: series[i + 2].date };
    }
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
