// Cycle data for the tests. Every date is a fixed 2026 (or earlier) date, deliberately in the
// past, so nothing here changes meaning as the real clock moves. The one thing that does move
// is the NEWEST cycle's window, which phases.js runs to today() — so each fixture ends with a
// trailing start date whose only job is to close the cycle under test, and the tests page back
// to that completed cycle rather than asserting on the open one.

export function addD(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

// 'YYYY-MM-DD' for day N of January 2026 — the textbook cycle below runs in that month.
export const jan = (n) => `2026-01-${String(n).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// The textbook cycle: Jan 1-31, period Jan 1-5, one clean mucus patch, one clean
// thermal shift. Hand-worked values (these are the numbers the assertions quote):
//   Pre-Shift Six = Jan 6-11   LTL = 97.35 (the highest of those six)   HTL = 97.75
//   Peak Day      = Jan 11 (last peak-quality day), drying days Jan 12, 13, 14
//   Phase 3       = Jan 14, by the Sympto-Thermal Rule with a strong 3rd temperature
// ---------------------------------------------------------------------------
export const TEXTBOOK_TEMPS = {
  1: 97.2, 2: 97.3, 3: 97.25, 4: 97.3, 5: 97.2, 6: 97.35, 7: 97.3, 8: 97.25,
  9: 97.3, 10: 97.2, 11: 97.3, 12: 97.9, 13: 98.0, 14: 98.05, 15: 98.0,
};

export function textbook({ flow = true, trapMucusDuringPeriod = false } = {}) {
  const days = {};
  for (const n of Object.keys(TEXTBOOK_TEMPS)) days[jan(n)] = { tempF: TEXTBOOK_TEMPS[n] };
  if (flow) ['heavy', 'medium', 'medium', 'light', 'spotting'].forEach((f, i) => { days[jan(i + 1)].flow = f; });
  if (trapMucusDuringPeriod) days[jan(3)].mucusSensation = 'wet'; // peak-quality, but she is bleeding
  [6, 7, 8].forEach((n) => { days[jan(n)].mucusSensation = 'moist'; });
  [9, 10, 11].forEach((n) => { days[jan(n)].mucusSensation = 'wet'; }); // the real peak-quality run
  [12, 13, 14].forEach((n) => { days[jan(n)].mucusSensation = 'dry'; }); // drying days 1 2 3
  return {
    days,
    cycles: [
      { id: 'c1', startDate: '2026-01-01', endDate: '2026-01-05' },
      { id: 'c2', startDate: '2026-02-01' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Temperature series with exactly one thermal shift, whose first high temperature falls on
// cycle day `riseDay`.
//
// The lows are built so no earlier rise can be found by accident: day 1 is the highest low
// (97.35) and every low after it is at most 97.3, so no low ever sits strictly above the
// highest of the six lows before it. That makes LTL = 97.3 for any riseDay >= 8, and the
// first match the scan can find is the real one.
// ---------------------------------------------------------------------------
const LOW_CYCLE = [97.2, 97.3, 97.25, 97.3];
export const lowAt = (i) => (i === 0 ? 97.35 : LOW_CYCLE[(i - 1) % LOW_CYCLE.length]);
export const HIGHS = [97.9, 98.0, 98.05, 98.0];

export function risePattern(riseDay, { highs = HIGHS.slice(0, 3) } = {}) {
  const out = [];
  for (let i = 0; i < riseDay - 1; i++) out.push(lowAt(i));
  return out.concat(highs);
}

// `count` complete 30-day cycles, each with a thermal shift, then a trailing start that closes
// the last one. `riseDays` overrides the rise day per cycle (defaults to 13 for all of them).
export function historyWithRises(count, { riseDays = [], start = '2025-01-01', len = 30 } = {}) {
  const cycles = [];
  const days = {};
  for (let c = 0; c < count; c++) {
    const s = addD(start, c * len);
    cycles.push({ id: `h${c}`, startDate: s, endDate: addD(s, 4) });
    risePattern(riseDays[c] || 13).forEach((t, i) => { days[addD(s, i)] = { tempF: t }; });
  }
  return { cycles, days, nextStart: addD(start, count * len) };
}

// ---------------------------------------------------------------------------
// One cycle of an arbitrary length, logged the way a real cycle gets logged: a period with
// flow, a mucus patch with three drying days, a temperature series with a shift. Used by the
// cycle-length sweep, which is looking for markup that breaks at a density rather than for
// particular rule outcomes.
// ---------------------------------------------------------------------------
export function cycleOfLength(len, { start = '2026-01-01' } = {}) {
  return {
    days: logOneCycle(start, len),
    cycles: [
      { id: 'a', startDate: start, endDate: addD(start, Math.min(4, len - 1)) },
      { id: 'b', startDate: addD(start, len) },
    ],
  };
}

// The same logging, but as the cycle still in progress — its window runs to today, so its
// length is today minus the start. This is the only way to get a window shorter than
// MIN_CYCLE_DAYS: a gap that short between two starts is discarded as a stray entry, so a
// completed 9-day cycle cannot exist (see predict.cycleStarts, v0.8.4).
//
// The start date is computed from today, which is exactly what makes the window that length.
export function cycleInProgress(len, { todayStr }) {
  const start = addD(todayStr, -(len - 1));
  return {
    days: logOneCycle(start, len),
    cycles: [{ id: 'open', startDate: start, endDate: addD(start, Math.min(4, len - 1)) }],
  };
}

// One cycle's worth of real logging: a period with flow, a mucus patch with three drying days,
// and a temperature series with a shift. Nothing is logged past the end of the cycle.
function logOneCycle(start, len) {
  const days = {};
  const put = (offset, patch) => {
    if (offset >= len) return;
    const k = addD(start, offset);
    days[k] = { ...(days[k] || {}), ...patch };
  };
  Object.values(TEXTBOOK_TEMPS).forEach((t, i) => put(i, { tempF: t }));
  ['heavy', 'medium', 'medium', 'light', 'spotting'].forEach((f, i) => put(i, { flow: f }));
  [5, 6, 7].forEach((i) => put(i, { mucusSensation: 'moist' }));
  [8, 9, 10].forEach((i) => put(i, { mucusSensation: 'wet' }));
  [11, 12, 13].forEach((i) => put(i, { mucusSensation: 'dry' }));
  return days;
}

// ---------------------------------------------------------------------------
// Her real logging habit, recorded in ROADMAP v0.8.4: a wet (peak-quality) sensation on most
// days of the cycle, bleeding days included, broken by one short dry patch. This is the shape
// that makes nfp.mucusPeak() and phases.peakDay() disagree, and it is why they must KEEP
// disagreeing — see v0.9.8 and tests/invariants-safety.test.mjs.
//
// The cycle under test is the NEWEST one here, on purpose: mucusPeak() and effectiveWindow()
// both anchor on the latest start. Its window runs to today(), but every logged day sits in
// May 2026, so the Peak Day and "safe again" answers do not move as the clock does.
// Cycle lengths are 30 and 30, so predict() gives nextStart = 2026-05-31.
// ---------------------------------------------------------------------------
export const may = (n) => `2026-05-${String(n).padStart(2, '0')}`;

export function wetMostDays({ dryPatch = [12, 13, 14] } = {}) {
  const days = {};
  for (let n = 1; n <= 28; n++) days[may(n)] = { mucusSensation: 'wet' };
  dryPatch.forEach((n) => { days[may(n)] = { mucusSensation: 'dry' }; });
  [1, 2, 3, 4, 5].forEach((n) => { days[may(n)].flow = 'medium'; });
  return {
    days,
    cycles: [
      { id: 'w0', startDate: '2026-03-02' },
      { id: 'w1', startDate: '2026-04-01' },
      { id: 'w2', startDate: '2026-05-01', endDate: may(5) },
    ],
  };
}

// ---------------------------------------------------------------------------
// Two or three bad nights early in a cycle — poor sleep, a drink, a reading taken late. Waking
// temperatures are genuinely low during a period, so the bump reads as a textbook three-day
// rise sitting on top of the six menstrual lows, and nfp.analyze() confirms a thermal shift
// that never happened. Before v0.9.9 effectiveWindow() ASSIGNED that date, so the fertile
// window closed the day before it opened and the whole thing vanished.
//
// Both fixtures run 2026-05-01 with 30-day history, so predict() gives nextStart 2026-05-31,
// ovulation 2026-05-17, and an Avoid-mode window of 2026-05-10 closing 2026-05-20.
// ---------------------------------------------------------------------------
export const FALSE_RISE_TEMPS = {
  1: 97.00, 2: 97.05, 3: 97.00, 4: 97.05, 5: 97.00, 6: 97.00,
  7: 97.50, 8: 97.55, 9: 97.52,                           // the bad nights
  10: 97.25, 11: 97.30, 12: 97.20, 13: 97.25, 14: 97.30,  // and straight back down again
};

// A real post-ovulatory shift: the rise starts on cycle day 15 and stays up.
export const GENUINE_RISE_TEMPS = {
  1: 97.20, 2: 97.25, 3: 97.20, 4: 97.25, 5: 97.20, 6: 97.30, 7: 97.25,
  8: 97.30, 9: 97.20, 10: 97.25, 11: 97.30, 12: 97.25, 13: 97.30, 14: 97.20,
  15: 97.95, 16: 98.05, 17: 98.10, 18: 98.05, 19: 98.00,
};

export function tempCycle(temps) {
  const days = {};
  for (const n of Object.keys(temps)) days[may(n)] = { tempF: temps[n] };
  return {
    days,
    cycles: [
      { id: 't0', startDate: '2026-03-02' },
      { id: 't1', startDate: '2026-04-01' },
      { id: 't2', startDate: '2026-05-01', endDate: may(5) },
    ],
  };
}
