// The CCL three-phase rules in js/phases.js, one rule at a time.
//
// Values here are hand-worked from the fixture, not copied out of a run — if a number in an
// assertion looks arbitrary, the comment above it says where it comes from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cycleWindows, analyzeCycle, peakDay, thermalShift, day56Rule, doeringRule, phaseOfDay,
  HTL_OFFSET_F,
} from '../js/phases.js';
import { textbook, jan, historyWithRises, risePattern, addD } from './helpers/fixtures.mjs';

const win0 = (cycles) => cycleWindows(cycles);

test('the Pre-Shift Six, the LTL and the HTL', () => {
  const { cycles, days } = textbook();
  const sh = thermalShift(win0(cycles)[0], days);

  // The rise is Jan 12-14 (97.9, 98.0, 98.05), so the six immediately before it are Jan 6-11.
  assert.deepEqual(sh.preShiftSix, [6, 7, 8, 9, 10, 11].map(jan));
  assert.equal(sh.preShiftSix.length, 6);
  // LTL = the highest of those six. Jan 6 is 97.35, the rest are 97.2-97.3.
  assert.equal(sh.ltl, 97.35);
  assert.equal(sh.htl, 97.75);               // 97.35 + 0.4
  assert.equal(sh.htl, sh.ltl + HTL_OFFSET_F);
  assert.equal(sh.riseStart.date, jan(12));  // first temperature above the LTL
  assert.equal(sh.riseStart.cycleDay, 12);
});

test('Day 5/6 rule — day 5 with no history, day 6 only when every recent cycle ran 26+ days', () => {
  // No prior cycles at all: it stays at day 5, the conservative side.
  const none = day56Rule(win0([{ id: 'a', startDate: '2026-01-01' }]), 0);
  assert.equal(none.day, 5);
  assert.equal(none.basis, 0);
  assert.equal(none.all26, false);

  // Three prior cycles, all 30 days: day 6 is allowed.
  const long = [
    { id: 'a', startDate: '2026-01-01' }, { id: 'b', startDate: '2026-01-31' },
    { id: 'c', startDate: '2026-03-02' }, { id: 'd', startDate: '2026-04-01' },
  ];
  const okWins = win0(long);
  assert.deepEqual(okWins.slice(0, 3).map((w) => w.len), [30, 30, 30]);
  assert.equal(day56Rule(okWins, 3).day, 6);

  // One short cycle (25 days) anywhere in the last 12 pulls it back to day 5.
  const short = [
    { id: 'a', startDate: '2026-01-01' }, { id: 'b', startDate: '2026-01-26' }, // 25 days
    { id: 'c', startDate: '2026-02-25' }, { id: 'd', startDate: '2026-03-27' },
  ];
  const shortWins = win0(short);
  assert.equal(shortWins[0].len, 25);
  assert.equal(day56Rule(shortWins, 3).day, 5);
  assert.equal(day56Rule(shortWins, 3).all26, false);
});

test('Doering rule — gated behind 6 cycles of temperature history', () => {
  // Five cycles with a thermal shift is not enough: the rule is unavailable, and an
  // unavailable rule must not be offered as a Phase 1 candidate at all.
  const five = historyWithRises(5);
  const fiveWins = cycleWindows([...five.cycles, { id: 'now', startDate: five.nextStart }]);
  const d5 = doeringRule(fiveWins, 5, five.days);
  assert.equal(d5.available, false);
  assert.equal(d5.cyclesWithRise, 5);
  assert.equal(d5.day, undefined);
  const a5 = analyzeCycle(fiveWins, 5, five.days);
  assert.equal(a5.phase1.cands.some((c) => c.rule === 'Doering rule'), false);

  // Six is enough.
  const six = historyWithRises(6);
  const sixWins = cycleWindows([...six.cycles, { id: 'now', startDate: six.nextStart }]);
  const d6 = doeringRule(sixWins, 6, six.days);
  assert.equal(d6.available, true);
  assert.equal(d6.cyclesWithRise, 6);
});

test('Doering rule — earliest rise in the last 12 cycles, minus 7', () => {
  // Six cycles of history: five rise on cycle day 13, one on day 11. The earliest wins.
  const h = historyWithRises(6, { riseDays: [13, 13, 11, 13, 13, 13] });
  const wins = cycleWindows([...h.cycles, { id: 'now', startDate: h.nextStart }]);
  const d = doeringRule(wins, 6, h.days);
  assert.equal(d.available, true);
  assert.equal(d.earliestRiseDay, 11);
  assert.equal(d.day, 4);                    // 11 - 7

  // And that arithmetic is what ends Phase 1 here: day 4 beats the Day 5/6 rule's day 6
  // (every prior cycle is 30 days long), and no mucus is logged in the cycle under test.
  const a = analyzeCycle(wins, 6, h.days);
  assert.equal(a.phase1.rule, 'Doering rule');
  assert.equal(a.p1EndDay, 4);
  assert.equal(a.p2StartDay, 5);

  // The floor holds: an early rise cannot push the end of Phase 1 below day 0.
  const early = historyWithRises(6, { riseDays: [7, 13, 13, 13, 13, 13] });
  const eWins = cycleWindows([...early.cycles, { id: 'now', startDate: early.nextStart }]);
  assert.equal(doeringRule(eWins, 6, early.days).day, 0);
});

test('Peak Day — the last peak-quality day before the drying up, with the drying days numbered', () => {
  const { cycles, days } = textbook();
  const p = peakDay(win0(cycles)[0], days);
  // Jan 9, 10, 11 are 'wet'. Jan 11 is the last of them; Jan 12, 13, 14 are 'dry'.
  assert.equal(p.date, jan(11));
  assert.equal(p.cycleDay, 11);
  assert.deepEqual(p.drying, [jan(12), jan(13), jan(14)]);
  assert.equal(p.confirmed, true);
  assert.equal(p.thirdDry, jan(14));
});

test('Peak Day — peak mucus returning DURING the drying days moves it', () => {
  // Same cycle, but Jan 13 (drying day 2) comes back slippery: the drying process restarted,
  // so Peak Day moves to Jan 13 and the count starts again from Jan 14.
  const { cycles, days } = textbook();
  days[jan(13)].mucusSensation = 'slippery';
  days[jan(15)] = { ...days[jan(15)], mucusSensation: 'dry' };
  days[jan(16)] = { mucusSensation: 'dry' };

  const p = peakDay(win0(cycles)[0], days);
  assert.equal(p.date, jan(13));
  assert.deepEqual(p.drying, [jan(14), jan(15), jan(16)]);
  assert.equal(p.confirmed, true);
});

test('a day she did not chart is not a drying-up day', () => {
  // Jan 12 and 14 charted dry, Jan 13 not charted at all, Jan 15 dry. Skipping the unobserved
  // day can only ever DELAY the third drying day, which is the safe direction.
  const { cycles, days } = textbook();
  delete days[jan(13)].mucusSensation;
  days[jan(15)] = { ...days[jan(15)], mucusSensation: 'dry' };

  const p = peakDay(win0(cycles)[0], days);
  assert.equal(p.date, jan(11));
  assert.deepEqual(p.drying, [jan(12), jan(14), jan(15)]);
  assert.equal(p.thirdDry, jan(15));
});

test('Sympto-Thermal Rule — a strong 3rd temperature confirms on the later of the two halves', () => {
  const { cycles, days } = textbook();
  const a = analyzeCycle(win0(cycles), 0, days);
  assert.equal(a.phase3.rule, 'Sympto-Thermal Rule');
  // Temperature half: Jan 12, 13, 14 are all above the LTL (97.35) and the third (98.05)
  // is at or above the HTL (97.75). Mucus half: third drying day is Jan 14. Same day, so
  // Phase 3 opens the evening of Jan 14.
  assert.deepEqual(a.phase3.parts.temps, [jan(12), jan(13), jan(14)]);
  assert.equal(a.phase3.parts.thirdDry, jan(14));
  assert.equal(a.phase3.start, jan(14));
  assert.equal(a.p3StartDay, 14);
  assert.equal(a.phase3.pending, false);
  assert.match(a.phase3.note, /third temperature reached the HTL/);
});

test('Sympto-Thermal Rule — a weak 3rd temperature waits for a 4th above the LTL', () => {
  const { cycles, days } = textbook();
  // Drop the 3rd high to 97.6: still above the LTL (97.35) but short of the HTL (97.75).
  days[jan(14)].tempF = 97.6;
  days[jan(15)].tempF = 97.7;                // the 4th, above the LTL — this is what confirms
  const a = analyzeCycle(win0(cycles), 0, days);

  assert.equal(a.phase3.rule, 'Sympto-Thermal Rule');
  assert.deepEqual(a.phase3.parts.temps, [jan(12), jan(13), jan(14), jan(15)]);
  assert.equal(a.phase3.start, jan(15));     // a day later than the strong-3rd case
  assert.match(a.phase3.note, /fourth above the LTL/);
});

test('Sympto-Thermal Rule — three temps up but no 4th yet stays unconfirmed, and the day stays Phase 2', () => {
  const { cycles, days } = textbook();
  days[jan(14)].tempF = 97.6;                // weak 3rd
  delete days[jan(15)];                      // and nothing after it
  const a = analyzeCycle(win0(cycles), 0, days);

  assert.equal(a.phase3.pending, true);
  assert.equal(a.phase3.start, null);
  assert.equal(a.p3StartDay, null);
  assert.match(a.phase3.note, /did not reach the HTL/);
  // Never guess forward: with nothing confirmed, every day after Phase 1 is still Phase 2.
  assert.equal(phaseOfDay(a.p1EndDay, a), 1);
  assert.equal(phaseOfDay(a.p1EndDay + 1, a), 2);
  assert.equal(phaseOfDay(a.lastDay, a), 2);
});

test('Temperature-Only Rule — no mucus charted, so temperature alone carries it', () => {
  const { cycles } = textbook();
  const days = {};
  // Four temps above the LTL with the last three at or above the HTL. The rise starts on
  // cycle day 8, so the six lows before it are Jan 2-7 ...
  risePattern(8, { highs: [97.8, 97.9, 98.0, 98.0] }).forEach((t, i) => { days[jan(i + 1)] = { tempF: t }; });
  const a = analyzeCycle(win0(cycles), 0, days);

  assert.equal(a.phase3.rule, 'Temperature-Only Rule');
  assert.equal(a.peak, null);                // nothing to read a Peak Day from
  // ... LTL is 97.3 and the HTL 97.7, so all four highs clear both and the 4th confirms.
  assert.equal(a.shift.ltl, 97.3);
  assert.equal(a.shift.htl, 97.7);
  assert.equal(a.shift.riseStart.cycleDay, 8);
  assert.equal(a.phase3.parts.temps.length, 4);
  assert.equal(a.phase3.start, jan(11));     // the 4th day of the rise (days 8, 9, 10, 11)
  assert.match(a.phase3.note, /temperature alone/);
});

test('Mucus-Only Rule — no temperatures, so Phase 3 waits a full four days past Peak Day', () => {
  const { cycles, days } = textbook();
  for (const k of Object.keys(days)) delete days[k].tempF;
  const a = analyzeCycle(win0(cycles), 0, days);

  assert.equal(a.phase3.rule, 'Mucus-Only Rule');
  assert.equal(a.shift.ltl, null);
  assert.equal(a.phase3.start, jan(15));     // Peak Day Jan 11 + 4
  assert.equal(a.phase3.pending, false);
  assert.match(a.phase3.note, /four days past Peak Day/);
});

test('Mucus-Only Rule — an unconfirmed Peak keeps the cycle in Phase 2', () => {
  const { cycles, days } = textbook();
  for (const k of Object.keys(days)) delete days[k].tempF;
  delete days[jan(14)].mucusSensation;       // only two drying days charted, not three
  const a = analyzeCycle(win0(cycles), 0, days);

  assert.equal(a.phase3.rule, 'Mucus-Only Rule');
  assert.equal(a.phase3.pending, true);
  assert.equal(a.phase3.start, null);
  assert.match(a.phase3.note, /2 of 3 charted/);
  assert.equal(phaseOfDay(a.lastDay, a), 2);
});

test('nothing charted at all — no rule can read the cycle, and it does not pretend otherwise', () => {
  const a = analyzeCycle(cycleWindows([
    { id: 'a', startDate: '2026-01-01' }, { id: 'b', startDate: '2026-02-01' },
  ]), 0, {});
  assert.equal(a.phase3.pending, true);
  assert.equal(a.phase3.start, null);
  assert.equal(a.phase3.rule, null);
  assert.equal(a.p1EndDay, 5);               // Day 5/6 with no history
  assert.equal(phaseOfDay(31, a), 2);
});

test('mucus appearing ends Phase 1 the day before, whatever the day', () => {
  const { cycles, days } = textbook();
  const a = analyzeCycle(win0(cycles), 0, days);
  // First non-dry mucus outside the period is Jan 6 (moist), so Phase 1 ends on day 5. That
  // ties with the Day 5/6 rule here, so check the candidate list carries both.
  assert.equal(a.phase1.firstMucus, jan(6));
  assert.equal(a.p1EndDay, 5);
  assert.ok(a.phase1.cands.some((c) => c.rule === 'mucus appeared' && c.day === 5));

  // Move the mucus earlier: Phase 1 must end earlier too, before the Day 5/6 rule would.
  days[jan(3)] = { ...days[jan(3)], mucusSensation: 'moist' };
  const b = analyzeCycle(cycleWindows([
    { id: 'c1', startDate: '2026-01-01' },   // no endDate, and no flow on Jan 3 below
    { id: 'c2', startDate: '2026-02-01' },
  ]), 0, { ...days, [jan(3)]: { mucusSensation: 'moist' } });
  assert.equal(b.phase1.firstMucus, jan(3));
  assert.equal(b.p1EndDay, 2);
  assert.equal(b.phase1.rule, 'mucus appeared');
});

test('phaseOfDay — Phase 3 opens on its start day, and the day before it is still Phase 2', () => {
  const { cycles, days } = textbook();
  const a = analyzeCycle(win0(cycles), 0, days);
  assert.equal(a.p1EndDay, 5);
  assert.equal(a.p3StartDay, 14);
  assert.equal(phaseOfDay(5, a), 1);
  assert.equal(phaseOfDay(6, a), 2);
  assert.equal(phaseOfDay(13, a), 2);
  assert.equal(phaseOfDay(14, a), 3);
  assert.equal(phaseOfDay(31, a), 3);
});

test('cycleWindows — the newest cycle runs to today and is not complete', () => {
  const wins = cycleWindows([
    { id: 'c1', startDate: '2026-01-01', endDate: '2026-01-05' },
    { id: 'c2', startDate: '2026-02-01' },
  ]);
  assert.equal(wins.length, 2);
  assert.equal(wins[0].complete, true);
  assert.equal(wins[0].start, '2026-01-01');
  assert.equal(wins[0].end, '2026-01-31');   // the day before the next start
  assert.equal(wins[0].len, 31);
  assert.equal(wins[0].periodEnd, '2026-01-05');
  assert.equal(wins[1].complete, false);
  assert.equal(wins[1].len, null);
  assert.ok(wins[1].end > '2026-02-01');     // runs to today, whenever today is
});

test('a cycle that is only partly logged does not throw or produce holes', () => {
  // One temperature, one mucus day, no period end. Nothing can be confirmed, and that is
  // the whole expectation: a half-logged cycle has to stay readable.
  const a = analyzeCycle(cycleWindows([
    { id: 'a', startDate: '2026-01-01' }, { id: 'b', startDate: '2026-02-01' },
  ]), 0, { [jan(9)]: { tempF: 97.4, mucusSensation: 'wet' } });

  assert.equal(a.shift.ltl, null);
  assert.equal(a.peak.date, jan(9));
  assert.equal(a.peak.confirmed, false);
  assert.equal(a.phase3.start, null);
  assert.equal(a.phase3.pending, true);
  assert.equal(Number.isFinite(a.p1EndDay), true);
  assert.equal(Number.isFinite(a.lastDay), true);
});
