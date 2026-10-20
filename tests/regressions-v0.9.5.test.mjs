// The two correctness bugs v0.9.5 fixed, as tests that FAIL if the fix is reverted.
//
// Both were found by him reading the chart against his own data ("why in aug 10 to sep 4 is
// sep 3rd the peak day"), not by the 31-test suite that was passing at the time. Every case in
// that suite was a tidy textbook cycle, so neither bug had anything to trip over.
//
// Each test below says, in its comment, what the pre-v0.9.5 code returned instead. If you
// change peakDay() and these still pass, check that first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycleWindows, analyzeCycle, peakDay } from '../js/phases.js';
import { isPeakMucus } from '../js/nfp.js';
import { textbook, jan } from './helpers/fixtures.mjs';

test('BUG 1 — Peak Day LOCKS once three drying days complete', () => {
  const { cycles, days } = textbook();
  // The real peak patch is Jan 9-11, dried up Jan 12-14. Then, two weeks later, one stray
  // slippery log — a new mucus patch, not a new Peak Day.
  days[jan(26)] = { mucusSensation: 'slippery' };

  const p = peakDay(cycleWindows(cycles)[0], days);
  // Pre-v0.9.5 this scanned the whole cycle with `if (isPeakMucus) peak = d`, so the LAST
  // peak-type day won and this returned 2026-01-26.
  assert.equal(p.date, jan(11));
  assert.equal(p.confirmed, true);
  assert.deepEqual(p.drying, [jan(12), jan(13), jan(14)]);
  assert.equal(p.thirdDry, jan(14));
});

test('BUG 1 — the knock-on: a dragged Peak Day stopped Phase 3 from ever opening', () => {
  const { cycles, days } = textbook();
  days[jan(26)] = { mucusSensation: 'slippery' };
  const a = analyzeCycle(cycleWindows(cycles), 0, days);

  // This is what the bug actually cost: with Peak Day dragged to Jan 26, the ST Rule wanted
  // three drying days and three post-Peak temperatures after that date, none of which were
  // coming, so the cycle never got a Phase 3 at all and no cycle showed all three phases.
  assert.equal(a.phase3.pending, false);
  assert.equal(a.phase3.start, jan(14));
  assert.equal(a.p3StartDay, 14);
  assert.equal(a.phase3.rule, 'Sympto-Thermal Rule');
});

test('BUG 1 — a stray peak log weeks later does not reopen a locked Peak, at any distance', () => {
  // Same shape, swept across the rest of the cycle: day 16 through day 31. The lock either
  // holds everywhere or it is not a lock.
  for (let d = 16; d <= 31; d++) {
    const { cycles, days } = textbook();
    days[jan(d)] = { ...(days[jan(d)] || {}), mucusSensation: 'slippery' };
    const p = peakDay(cycleWindows(cycles)[0], days);
    assert.equal(p.date, jan(11), `a stray slippery log on Jan ${d} moved Peak Day`);
    assert.equal(p.confirmed, true);
  }
});

test('BUG 2 — a bleeding day never registers as peak mucus (read by the period end date)', () => {
  // Jan 3 is inside the period (Jan 1-5) and logged 'wet'. "Wet" IS peak-quality mucus — that
  // is not the bug and must not be "fixed" by taking wet out of PEAK_SENSATIONS. The bug was
  // reading mucus through blood.
  const { cycles, days } = textbook({ trapMucusDuringPeriod: true, flow: false });
  assert.equal(isPeakMucus(days[jan(3)]), true, 'wet is still peak-quality in nfp.js');

  const p = peakDay(cycleWindows(cycles)[0], days);
  // Pre-v0.9.5 nothing excluded bleeding, so a period day read as the most fertile mucus of
  // the cycle and Peak Day landed on day 1 of menstruation.
  assert.equal(p.date, jan(11));
  assert.notEqual(p.date, jan(3));
});

test('BUG 2 — and read by a logged flow, when there is no period end date yet', () => {
  // The other half of isBleeding(): a cycle still open (no endDate) where the only evidence of
  // bleeding is days/{date}.flow. That branch existed from v0.9.5 but nothing in the app wrote
  // `flow` until v0.9.6, so it was dead code for a release. A/B on that one field:
  const cycles = [{ id: 'x', startDate: '2026-03-01' }, { id: 'y', startDate: '2026-04-01' }];
  const build = (withFlow) => {
    const d = { '2026-03-02': { mucusSensation: 'wet' } };            // bleeding-day mucus
    for (const k of ['2026-03-07', '2026-03-08', '2026-03-09']) d[k] = { mucusSensation: 'wet' };
    for (const k of ['2026-03-10', '2026-03-11', '2026-03-12']) d[k] = { mucusSensation: 'dry' };
    if (withFlow) for (const k of ['2026-03-01', '2026-03-02', '2026-03-03']) d[k] = { ...(d[k] || {}), flow: 'medium' };
    return d;
  };
  const wins = cycleWindows(cycles);

  const without = analyzeCycle(wins, 0, build(false));
  const with_ = analyzeCycle(wins, 0, build(true));

  // Without a flow logged there is nothing to tell phases.js she was bleeding, so the Mar 2
  // mucus counts and it becomes the first mucus of the cycle.
  assert.equal(without.phase1.firstMucus, '2026-03-02');
  // With the flow logged, that day is excluded from firstMucusDay and from Peak detection.
  assert.equal(with_.phase1.firstMucus, '2026-03-07');
  assert.equal(with_.peak.date, '2026-03-09');
});

test('BUG 2 — excluding bleeding-day mucus cannot push Phase 1 past Day 5/6 or Doering', () => {
  // The safety argument for ignoring a period-day mucus log: Phase 1's end is the EARLIEST of
  // the applicable rules, and the two calendar rules do not read mucus at all, so dropping a
  // mucus observation can never extend Phase 1 beyond them.
  const { cycles, days } = textbook({ trapMucusDuringPeriod: true, flow: false });
  const a = analyzeCycle(cycleWindows(cycles), 0, days);
  assert.equal(a.p1EndDay, 5);
  assert.ok(a.p1EndDay <= a.phase1.day56.day, 'Day 5/6 still caps the end of Phase 1');
});

test('a period day with flow but no endDate is still kept out of the drying count', () => {
  // A cycle where bleeding overlaps what would otherwise be drying days. Charting 'dry' while
  // bleeding is not a drying-up day, so the count must not include it.
  const cycles = [{ id: 'x', startDate: '2026-05-01' }, { id: 'y', startDate: '2026-06-01' }];
  const days = {
    '2026-05-09': { mucusSensation: 'wet' },
    '2026-05-10': { mucusSensation: 'dry', flow: 'spotting' },   // bleeding, so not a drying day
    '2026-05-11': { mucusSensation: 'dry' },
    '2026-05-12': { mucusSensation: 'dry' },
    '2026-05-13': { mucusSensation: 'dry' },
  };
  const p = peakDay(cycleWindows(cycles)[0], days);
  assert.equal(p.date, '2026-05-09');
  assert.deepEqual(p.drying, ['2026-05-11', '2026-05-12', '2026-05-13']);
  assert.equal(p.thirdDry, '2026-05-13');
});
