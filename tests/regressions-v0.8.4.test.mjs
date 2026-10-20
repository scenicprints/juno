// The three v0.8.4 fixes, as tests that FAIL if the fix is reverted.
//
// All three came out of one real bug report — "safe/not-safe flipped after we ended her
// period" — diagnosed from his actual data export. Two of them are FALSE SAFES: the app
// telling them a fertile day was lower-risk. That is the dangerous direction (ROADMAP §2),
// so these are the tests to be most suspicious of.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycleStarts, cycleLengths, predict, MIN_CYCLE_DAYS } from '../js/predict.js';
import { window as fertileWindow, effectiveWindow, fertilityClass, todayStatus, confirmedOvulation } from '../js/fertility.js';
import { analyze } from '../js/nfp.js';

// ---------------------------------------------------------------------------
// 1. A stray period start cannot become the prediction anchor.
//
// His data: a real period Aug 10-15, and a phantom "Aug 15 -> Aug 15" entry five days later,
// created by tapping the one Today period button twice. predict() anchored on the newest start
// with no validation, so the whole cycle slid five days late.
// ---------------------------------------------------------------------------
const REAL = [
  { id: 'a', startDate: '2026-06-11', endDate: '2026-06-16' },
  { id: 'b', startDate: '2026-07-11', endDate: '2026-07-16' },
  { id: 'c', startDate: '2026-08-10', endDate: '2026-08-15' },
];
const PHANTOM = { id: 'phantom', startDate: '2026-08-15', endDate: '2026-08-15' };

test('a stray start within 15 days is not a cycle start', () => {
  assert.equal(MIN_CYCLE_DAYS, 15);
  const starts = cycleStarts([...REAL, PHANTOM]);
  assert.deepEqual(starts, ['2026-06-11', '2026-07-11', '2026-08-10']);
  assert.equal(starts.includes('2026-08-15'), false);
  // and the 5-day gap must not be read as a cycle length either
  assert.deepEqual(cycleLengths([...REAL, PHANTOM]), [30, 30]);
});

test('the stray start does not become the prediction anchor', () => {
  const clean = predict(REAL, {});
  const withPhantom = predict([...REAL, PHANTOM], {});

  // Pre-v0.8.4 the anchor was the newest raw start, so this was 2026-08-15 and every date
  // downstream of it slid five days later.
  assert.equal(withPhantom.lastStart, '2026-08-10');
  assert.equal(withPhantom.nextStart, clean.nextStart);
  assert.equal(withPhantom.cyclesLogged, 3);
  assert.deepEqual(
    [withPhantom.nextStart, withPhantom.rangeStart, withPhantom.rangeEnd],
    [clean.nextStart, clean.rangeStart, clean.rangeEnd],
  );
});

test('the fertile window does not slide, so the days either side keep their answer', () => {
  const prediction = predict([...REAL, PHANTOM], {});
  const w = fertileWindow(prediction, 'avoid');
  // Anchored on Aug 10 with a 30-day average: next period Sep 9, ovulation Aug 26, and the
  // avoid-mode window Aug 19 - Aug 28. Anchored on the phantom it would have been Aug 24 -
  // Sep 2, which is exactly the flip he reported.
  assert.equal(prediction.avgLen, 30);
  assert.equal(w.ovulation, '2026-08-26');
  assert.equal(w.fertileStart, '2026-08-19');
  assert.equal(w.fertileEnd, '2026-08-28');

  const ctx = { prediction, cycles: [...REAL, PHANTOM], mode: 'avoid', eff: effectiveWindow([...REAL, PHANTOM], {}, prediction, 'avoid') };
  assert.equal(fertilityClass('2026-08-20', ctx), 'cannot'); // was 'can' with the phantom anchor
  assert.equal(fertilityClass('2026-09-01', ctx), 'can');    // was 'cannot'
});

test('a start exactly MIN_CYCLE_DAYS later IS a real cycle, 14 days is not', () => {
  // The guard has to be a boundary, not a blanket. A genuinely short cycle must survive it.
  const at15 = cycleStarts([{ id: 'a', startDate: '2026-03-01' }, { id: 'b', startDate: '2026-03-16' }]);
  assert.deepEqual(at15, ['2026-03-01', '2026-03-16']);
  const at14 = cycleStarts([{ id: 'a', startDate: '2026-03-01' }, { id: 'b', startDate: '2026-03-15' }]);
  assert.deepEqual(at14, ['2026-03-01']);
});

// ---------------------------------------------------------------------------
// 2. Risk is evaluated BEFORE the predicted-period label.
//
// fertilityClass() used to return 'predictedPeriod' as soon as the date fell in the predicted
// range, before looking at the fertile window at all. A predicted period is a forecast, not a
// safe day — and the window can reach into that range once mucus or temperature pushes "safe
// again" later. His data showed it on Aug 7-13.
// ---------------------------------------------------------------------------
test('a day inside the predicted-period range still reads "cannot" when the window is open', () => {
  const prediction = { state: 'ready', rangeStart: '2026-08-05', rangeEnd: '2026-08-13' };
  const eff = {
    fertileStart: '2026-08-01', fertileEnd: '2026-08-09', safeAgain: '2026-08-12',
    peakStart: '2026-08-07', peakEnd: '2026-08-09',
  };
  const ctx = { prediction, eff, mode: 'avoid', cycles: [] };

  // Aug 7 is in BOTH the predicted-period range and the open fertile window. Pre-v0.8.4 this
  // returned 'predictedPeriod', which the Today banner reports as "Lower-risk window".
  assert.equal(fertilityClass('2026-08-07', ctx), 'cannot');
  assert.equal(todayStatus('2026-08-07', ctx).label, 'Not safe — fertile window');

  // Once the window has closed, the predicted-period shading is free to apply again.
  assert.equal(fertilityClass('2026-08-12', ctx), 'predictedPeriod');
  assert.equal(fertilityClass('2026-08-13', ctx), 'predictedPeriod');
  assert.equal(fertilityClass('2026-08-14', ctx), 'can');
});

test('the same false safe, end to end from logged mucus', () => {
  // Not a hand-built ctx this time: real cycles, real logged mucus, the real effectiveWindow.
  // Four 28-day cycles put the next period at Aug 21 (range Aug 19-23). A peak-quality mucus
  // log on Aug 18 pushes "safe again" out to Aug 22 by the peak rule, which lands inside that
  // predicted range.
  const cycles = ['2026-05-01', '2026-05-29', '2026-06-26', '2026-07-24']
    .map((d, i) => ({ id: `c${i}`, startDate: d, endDate: null }));
  const days = { '2026-08-18': { mucusSensation: 'slippery' } };
  const prediction = predict(cycles, {});
  const eff = effectiveWindow(cycles, days, prediction, 'avoid');

  assert.equal(prediction.nextStart, '2026-08-21');
  assert.equal(prediction.rangeStart, '2026-08-19');
  assert.equal(eff.safeAgain, '2026-08-22');

  const ctx = { prediction, cycles, days, mode: 'avoid', eff };
  for (const d of ['2026-08-19', '2026-08-20', '2026-08-21']) {
    assert.equal(fertilityClass(d, ctx), 'cannot', `${d} read as lower-risk inside the fertile window`);
  }
  assert.equal(fertilityClass('2026-08-22', ctx), 'predictedPeriod'); // window closed, still predicted
});

// ---------------------------------------------------------------------------
// 3. A noisy temperature series refuses to confirm ovulation.
//
// Her real July series swung between 95.5 and 98.8°F and "confirmed" ovulation out of that
// noise. A shift found in noise is a false SAFE. Sensiplan calls a reading far off its
// neighbours a "disturbed value"; if more than a third of the cycle's readings are disturbed,
// nothing is confirmed at all.
// ---------------------------------------------------------------------------

// 22 readings in one cycle: nine quiet lows (Jul 1-9), three days that look like a thermal
// shift (Jul 10-12), then ten days swinging between 98.8 and 95.5 — the shape her real July
// series had. Ten of the 22 readings are disturbed, and the threshold is more than 7.33.
//
// The construction is the point. Strip the ten spikes out and the twelve readings that remain
// are a textbook shift that WOULD confirm "safe again" from Jul 12 — eight days earlier than
// the calendar says, which is eight days of false "lower risk". So the noise guard is the only
// thing standing between this series and a false safe, which is what makes this a regression
// test rather than a tautology.
function erratic() {
  const LOW = [97.2, 97.3, 97.25, 97.3];
  const lowAt = (i) => (i === 0 ? 97.35 : LOW[(i - 1) % LOW.length]);
  const temps = [];
  for (let i = 0; i < 9; i++) temps.push(lowAt(i));          // Jul 1-9, quiet lows
  [97.9, 98.0, 98.05].forEach((t) => temps.push(t));         // Jul 10-12, the apparent rise
  for (let d = 13; d <= 22; d++) temps.push(d % 2 ? 98.8 : 95.5); // Jul 13-22, noise
  const days = {};
  temps.forEach((t, i) => { days[`2026-07-${String(i + 1).padStart(2, '0')}`] = { tempF: t }; });
  return { cycles: [{ id: 'a', startDate: '2026-06-01' }, { id: 'b', startDate: '2026-07-01' }], days };
}

test('an erratic series is flagged unreliable and confirms nothing', () => {
  const { cycles, days } = erratic();
  const a = analyze(cycles, days);

  assert.equal(a.series.length, 22);
  assert.equal(a.disturbedCount, 10);
  assert.ok(a.disturbedCount > a.series.length / 3, 'more than a third disturbed');
  assert.equal(a.unreliable, true);
  // Pre-v0.8.4 this series confirmed, with infertileFrom = 2026-07-12.
  assert.equal(a.hasShift, false);
  assert.equal(a.infertileFrom, null);
  assert.equal(a.coverline, null);
  assert.equal(confirmedOvulation(cycles, days), null);
});

test('an unreliable series does not pull "safe again" earlier', () => {
  // The practical consequence: with no confirmation, the window closes on the calendar
  // estimate instead of on a shift invented from noise.
  const { cycles, days } = erratic();
  const prediction = predict(cycles, { typicalCycleLen: 30 });
  const eff = effectiveWindow(cycles, days, prediction, 'avoid');
  assert.equal(eff.tempConfirmed, false);
  // The calendar estimate, not a date invented from noise. Revert the guard and this becomes
  // 2026-07-12 — eight days of the fertile window wrongly reported as lower-risk.
  assert.equal(eff.safeAgain, '2026-07-20');
});

test('a clean series still confirms — the guard is not just refusing everything', () => {
  // Same shape with the spikes removed. If this one stops confirming, the noise guard has
  // been made too strict and the app has stopped doing the thing temperatures are for.
  const { cycles, days } = erratic();
  for (const d of Object.keys(days)) if (Number(d.slice(-2)) >= 13) delete days[d];
  const a = analyze(cycles, days);
  assert.equal(a.unreliable, false);
  assert.equal(a.disturbedCount, 0);
  assert.equal(a.hasShift, true);
  assert.equal(a.coverline, 97.3);
  assert.equal(a.infertileFrom, '2026-07-12');
  assert.ok(confirmedOvulation(cycles, days));
});

test('a single fever spike is excluded without condemning the whole series', () => {
  // One disturbed reading out of 13 is well under a third, so it is dropped from the rules and
  // everything else still works. Before v0.8.4 a spike like this jammed the coverline instead.
  const cycles = [{ id: 'a', startDate: '2026-06-01' }, { id: 'b', startDate: '2026-07-01' }];
  const temps = [97.35, 97.2, 97.3, 97.25, 97.3, 97.2, 97.3, 97.25, 97.9, 98.0, 98.05, 98.0, 98.0];
  const days = {};
  temps.forEach((t, i) => { days[`2026-07-${String(i + 1).padStart(2, '0')}`] = { tempF: t }; });
  const control = analyze(cycles, days);
  assert.equal(control.disturbedCount, 0);
  assert.equal(control.hasShift, true);

  days['2026-07-04'] = { tempF: 99.6 };    // a fever on cycle day 4
  const a = analyze(cycles, days);
  assert.equal(a.disturbedCount, 1);
  assert.equal(a.unreliable, false);
  assert.equal(a.hasShift, true);
  assert.equal(a.coverline, control.coverline, 'the fever did not jam the coverline');
  assert.equal(a.series.length, 13, 'the reading is kept for the chart');
  assert.equal(a.series.find((s) => s.date === '2026-07-04').disturbed, true);
});
