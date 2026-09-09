// Juno - the three-phase model as it is actually taught (Couple to Couple League,
// sympto-thermal). Pure functions, one cycle at a time.
//
// This module is READ-ONLY with respect to the rest of the app. The Today banner, the
// calendar shading and the notifications all keep running on fertility.js / nfp.js.
// Nothing here feeds them, so nothing here can change how the app already behaves.
//
//  Phase 1  Pre-ovulatory infertile. Day 1 is the first day of menstruation. Ends on
//           whichever applicable rule lands EARLIEST: Day 5/6, Doering, or the day
//           mucus appears (mucus ends Phase 1 whatever the day).
//  Phase 2  Fertile. From the end of Phase 1 until Phase 3 is confirmed.
//  Phase 3  Post-ovulatory infertile. Begins the EVENING of the day the applicable rule
//           confirms: Sympto-Thermal (mucus + temperature), Temperature-Only, or
//           Mucus-Only. Until a rule confirms, the day is still Phase 2.
import { addDaysStr, diffDays, today } from './dates.js';
import { cycleStarts } from './predict.js';
import { isPeakMucus, hasMucus, markDisturbed } from './nfp.js';

export const HTL_OFFSET_F = 0.4;   // HTL = LTL + 0.4 F  (0.2 C)
const PRE_SHIFT = 6;               // the "Pre-Shift Six"
const DRY_DAYS = 3;                // 3 days of drying up after Peak Day
const DOERING_SUBTRACT = 7;        // earliest first day of temperature rise, minus 7
const DOERING_MIN_CYCLES = 6;      // Doering needs 6 cycles of temperature history
const RULE_WINDOW = 12;            // "in the last 12 cycles"
const DAY56_MIN_LEN = 26;          // all of the last 12 cycles 26 days or more -> day 6

const r2 = (n) => Math.round(n * 100) / 100;

// ---------- cycles ----------

// One window per cycle. The newest one runs to today and is not complete.
export function cycleWindows(cycles) {
  const starts = cycleStarts(cycles || []);
  const t = today();
  return starts.map((s, i) => {
    const next = starts[i + 1] || null;
    return {
      index: i,
      start: s,
      end: next ? addDaysStr(next, -1) : (t > s ? t : s),
      len: next ? diffDays(s, next) : null,
      complete: !!next,
    };
  });
}

function daysIn(win, days) {
  return Object.keys(days || {}).filter((d) => d >= win.start && d <= win.end).sort();
}
function cycleDay(win, dateStr) { return diffDays(win.start, dateStr) + 1; }

// A day she actually charted a mucus observation on. "Dry" counts, it is an observation.
// An unobserved day is not a drying-up day, which can only ever DELAY Phase 3.
function mucusObserved(day) {
  return !!(day && (day.mucusSensation || day.mucusChar || day.mucus));
}

// ---------- temperature: Pre-Shift Six, LTL, HTL, first day of the rise ----------

function seriesFor(win, days) {
  const out = daysIn(win, days)
    .filter((d) => typeof days[d].tempF === 'number' && days[d].tempF > 90 && days[d].tempF < 105)
    .map((d) => ({ date: d, t: days[d].tempF, cycleDay: cycleDay(win, d) }));
  markDisturbed(out); // a reading far off its neighbours is excluded from the rules
  return out;
}

// LTL = the highest normal temperature of the six immediately before the rise.
// HTL = LTL + 0.4 F. The rise starts on the first of three temperatures above the LTL.
export function thermalShift(win, days) {
  const series = seriesFor(win, days);
  const clean = series.filter((s) => !s.disturbed);
  const res = { series, clean, ltl: null, htl: null, riseStart: null, preShiftSix: [], riseIdx: -1 };
  for (let i = PRE_SHIFT; i + 2 < clean.length; i++) {
    const six = clean.slice(i - PRE_SHIFT, i);
    const ltl = Math.max(...six.map((s) => s.t));
    if (clean[i].t > ltl && clean[i + 1].t > ltl && clean[i + 2].t > ltl) {
      res.ltl = r2(ltl);
      res.htl = r2(ltl + HTL_OFFSET_F);
      res.riseStart = clean[i];
      res.riseIdx = i;
      res.preShiftSix = six.map((s) => s.date);
      return res;
    }
  }
  return res;
}

// ---------- mucus: Peak Day and the three days of drying up ----------

// Peak Day = the LAST day of more-fertile mucus before the drying-up process begins.
// Taking the last peak-type day in the cycle gives that answer on its own: if peak mucus
// comes back during the drying days, that later day simply becomes Peak Day.
export function peakDay(win, days) {
  const ds = daysIn(win, days);
  let peak = null;
  ds.forEach((d) => { if (isPeakMucus(days[d])) peak = d; });
  if (!peak) return null;
  const drying = [];
  for (const d of ds) {
    if (d <= peak) continue;
    if (!mucusObserved(days[d])) continue;
    drying.push(d);
    if (drying.length >= DRY_DAYS) break;
  }
  return {
    date: peak,
    cycleDay: cycleDay(win, peak),
    drying,
    confirmed: drying.length >= DRY_DAYS,
    thirdDry: drying.length >= DRY_DAYS ? drying[DRY_DAYS - 1] : null,
  };
}

function firstMucusDay(win, days) {
  const ds = daysIn(win, days).filter((d) => hasMucus(days[d]));
  return ds.length ? ds[0] : null;
}

// ---------- end of Phase 1 ----------

function priorWindows(wins, index) {
  return wins.slice(Math.max(0, index - RULE_WINDOW), index);
}

// Days 1 to 5 of the cycle. Days 1 to 6 if every one of the last 12 cycles ran 26 days
// or more. With no history at all it stays at day 5, the conservative side.
export function day56Rule(wins, index) {
  const lens = priorWindows(wins, index).filter((w) => w.complete).map((w) => w.len);
  const all26 = lens.length > 0 && lens.every((l) => l >= DAY56_MIN_LEN);
  return { rule: 'Day 5/6', day: all26 ? 6 : 5, basis: lens.length, all26 };
}

// Earliest "first day of temperature rise" across the last 12 cycles, minus 7.
// Needs 6 cycles of temperature history before it can be used at all.
export function doeringRule(wins, index, days) {
  const rises = [];
  for (const w of priorWindows(wins, index)) {
    const sh = thermalShift(w, days);
    if (sh.riseStart) rises.push(sh.riseStart.cycleDay);
  }
  if (rises.length < DOERING_MIN_CYCLES) {
    return { rule: 'Doering', available: false, cyclesWithRise: rises.length };
  }
  const earliest = Math.min(...rises);
  return {
    rule: 'Doering', available: true, cyclesWithRise: rises.length,
    earliestRiseDay: earliest, day: Math.max(0, earliest - DOERING_SUBTRACT),
  };
}

// ---------- start of Phase 3 ----------

// Sympto-Thermal, temperature half: three temperatures after Peak Day all above the LTL,
// the third at or above the HTL. If the third is not that high, one more day above the LTL.
function stTemps(series, ltl, htl, peakDate) {
  const after = series.filter((s) => !s.disturbed && s.date > peakDate);
  for (let i = 0; i + 2 < after.length; i++) {
    const a = after[i], b = after[i + 1], c = after[i + 2];
    if (!(a.t > ltl && b.t > ltl && c.t > ltl)) continue;
    if (c.t >= htl) return { date: c.date, count: 3, temps: [a.date, b.date, c.date] };
    if (i + 3 >= after.length) return { pending: true, temps: [a.date, b.date, c.date] };
    if (after[i + 3].t > ltl) {
      const d4 = after[i + 3];
      return { date: d4.date, count: 4, temps: [a.date, b.date, c.date, d4.date] };
    }
    // the fourth fell back below the LTL, so that was not the shift. Keep looking.
  }
  return null;
}

// Temperature-Only: the fourth day of temperatures above the LTL, where the last three
// are consecutive and at or above the HTL.
function tempOnly(clean, riseIdx, ltl, htl) {
  for (let i = Math.max(0, riseIdx); i + 3 < clean.length; i++) {
    const q = clean.slice(i, i + 4);
    if (!q.every((s) => s.t > ltl)) continue;
    if (q.slice(1).every((s) => s.t >= htl)) return { date: q[3].date, temps: q.map((s) => s.date) };
  }
  return null;
}

// ---------- the whole cycle ----------

export function analyzeCycle(wins, index, days) {
  const win = wins[index];
  const shift = thermalShift(win, days);
  const peak = peakDay(win, days);
  const d56 = day56Rule(wins, index);
  const doer = doeringRule(wins, index, days);
  const fm = firstMucusDay(win, days);

  // End of Phase 1: the earliest applicable rule wins.
  const cands = [{ rule: 'Day 5/6 rule', day: d56.day }];
  if (doer.available) cands.push({ rule: 'Doering rule', day: doer.day });
  if (fm) cands.push({ rule: 'mucus appeared', day: cycleDay(win, fm) - 1 });
  cands.sort((a, b) => a.day - b.day);
  const phase1 = {
    endDay: cands[0].day, rule: cands[0].rule, cands,
    day56: d56, doering: doer, firstMucus: fm,
  };

  // Start of Phase 3: whichever rule the logged signs support.
  const haveTemps = shift.ltl != null;
  const phase3 = { start: null, rule: null, pending: false, note: '', parts: {} };
  if (haveTemps && peak) {
    const st = stTemps(shift.series, shift.ltl, shift.htl, peak.date);
    phase3.rule = 'Sympto-Thermal Rule';
    phase3.parts = { thirdDry: peak.thirdDry, temps: st && st.temps };
    if (st && st.date && peak.thirdDry) {
      // both halves must be met, so Phase 3 opens on the later of the two
      phase3.start = st.date > peak.thirdDry ? st.date : peak.thirdDry;
      phase3.note = st.count === 4
        ? 'The third temperature was below the HTL, so a fourth above the LTL confirmed it.'
        : 'The third temperature reached the HTL.';
    } else {
      phase3.pending = true;
      phase3.note = !peak.thirdDry
        ? `Waiting on the drying-up days after Peak Day (${peak.drying.length} of ${DRY_DAYS} charted).`
        : (st && st.pending)
          ? 'Three temperatures are above the LTL but the third did not reach the HTL. Waiting for one more.'
          : 'Waiting for three temperatures after Peak Day above the LTL.';
    }
  } else if (haveTemps) {
    const to = tempOnly(shift.clean, shift.riseIdx, shift.ltl, shift.htl);
    phase3.rule = 'Temperature-Only Rule';
    phase3.parts = { temps: to && to.temps };
    if (to) {
      phase3.start = to.date;
      phase3.note = 'No Peak Day charted this cycle, so temperature alone had to carry it.';
    } else {
      phase3.pending = true;
      phase3.note = 'Waiting for four temperatures above the LTL with the last three at or above the HTL.';
    }
  } else if (peak && peak.confirmed) {
    phase3.rule = 'Mucus-Only Rule';
    phase3.start = addDaysStr(peak.date, 4);
    phase3.note = 'No temperatures charted this cycle, so Phase 3 waits a full four days past Peak Day.';
  } else if (peak) {
    phase3.rule = 'Mucus-Only Rule';
    phase3.pending = true;
    phase3.note = `Waiting on the drying-up days after Peak Day (${peak.drying.length} of ${DRY_DAYS} charted).`;
  } else {
    phase3.pending = true;
    phase3.note = 'Nothing charted yet this cycle that any rule can read.';
  }

  const p3Day = phase3.start ? cycleDay(win, phase3.start) : null;
  return {
    win, shift, peak, phase1, phase3,
    p1EndDay: phase1.endDay,
    p2StartDay: phase1.endDay + 1,
    p3StartDay: p3Day,
    lastDay: Math.max(cycleDay(win, win.end), 1),
  };
}

// Which phase a cycle day sits in. Phase 3 opens the EVENING of p3StartDay, so that day
// is drawn as Phase 3 but is not a full Phase 3 day.
export function phaseOfDay(day, a) {
  if (day <= a.p1EndDay) return 1;
  if (a.p3StartDay != null && day >= a.p3StartDay) return 3;
  return 2;
}
