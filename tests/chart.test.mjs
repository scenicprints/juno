// The Phases chart, rendered by the real js/ui.js against the DOM shim in helpers/dom.mjs.
//
// This is where the recent regressions actually lived — v0.9.2, v0.9.3 and v0.9.4 were all
// drawing bugs, and v0.9.6 added marks that nothing was checking. The chart is built as an SVG
// string, so the string is what gets asserted: a mark that vanished, a label that should have
// been thinned away, a coordinate that came out NaN.
//
// The fixture is the textbook 31-day cycle (Jan 1-31), whose hand-worked values are documented
// in helpers/fixtures.mjs. dayW here is 284/31 = 9.16 units per day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountPhases, all } from './helpers/dom.mjs';
import { textbook, jan } from './helpers/fixtures.mjs';

const chart = () => mountPhases(textbook());

test('the chart renders, and renders the cycle under test', async () => {
  const { svg } = await chart();
  assert.ok(svg.length > 2000, `chart looks truncated (${svg.length} chars)`);
  assert.match(svg, /^<svg viewBox="0 0 310 /);
  assert.match(svg, /aria-label="Cycle chart, all three phases"/);
  assert.ok(!/undefined|NaN/.test(svg), `markup contains undefined/NaN: ${(svg.match(/.{0,40}(undefined|NaN).{0,40}/) || [])[0]}`);
});

test('all three phases are on the one chart', async () => {
  const { svg } = await chart();
  // One band rect per open phase, in the course booklet's colours: 1 blue, 2 pink, 3 green.
  for (const [p, col] of [[1, '#6fb3d6'], [2, '#e5679a'], [3, '#4fbf9f']]) {
    assert.ok(svg.includes(`fill="${col}" rx="2.5"`), `no phase ${p} band`);
  }
  // A cycle must not be split across pages — that was the v0.9.2 complaint — so the band
  // labels all belong to this one chart.
  assert.deepEqual(all(svg, />PHASE (\d)<\/text>|>P(\d)<\/text>/g).map((m) => m[1] || m[2]).sort(), ['1', '2', '3']);
  // and the two phase dividers are carried down through the rows
  assert.equal(all(svg, /stroke="#(?:e5679a|4fbf9f)" stroke-width="1.3" opacity="0.75"/g).length, 2);
});

test('the temperature curve, the LTL and the HTL', async () => {
  const { svg } = await chart();
  assert.match(svg, /<text x="1"[^>]*>LTL<\/text>/);
  assert.match(svg, /<text x="1"[^>]*>HTL<\/text>/);
  // The hand-worked values from the fixture, printed to two decimals under their labels.
  assert.ok(svg.includes('>97.35</text>'), 'LTL value 97.35 not printed');
  assert.ok(svg.includes('>97.75</text>'), 'HTL value 97.75 not printed');
  // The curve is drawn as unbroken runs, so an unlogged day leaves a real gap. The fixture
  // logs Jan 1-15 with no gaps, so there is exactly one path.
  assert.equal(all(svg, /<path d="M [^"]+" fill="none" stroke="#a294d4"/g).length, 1);
  assert.equal(all(svg, /<circle[^>]*fill="(?:#c9a7ff|#ffffff|#4fbf9f)"\/>/g).length, 15);
});

test('step 9 — the Pre-Shift Six are ringed and numbered right to left', async () => {
  const { svg } = await chart();
  assert.equal(all(svg, /stroke="#c9a7ff" stroke-width="1.1"/g).length, 6, 'six rings');
  const nums = all(svg, /<text[^>]*fill="#c9a7ff"[^>]*font-weight="700">(\d)<\/text>/g).map((m) => m[1]);
  // Drawn in date order, so the rightmost (latest) reads 1.
  assert.deepEqual(nums, ['6', '5', '4', '3', '2', '1']);
});

test('step 12 — the confirming temperatures are circled in the HTL colour', async () => {
  const { svg } = await chart();
  // Phase 3 was carried by a strong 3rd temperature, so there are exactly three.
  assert.equal(all(svg, /<circle[^>]*fill="none" stroke="#f4b8d0" stroke-width="1.3"\/>/g).length, 3);
});

test('step 12 — a weak 3rd temperature circles four', async () => {
  const { days, cycles } = textbook();
  days[jan(14)].tempF = 97.6;   // above the LTL but short of the HTL
  days[jan(15)].tempF = 97.7;   // the 4th that confirms instead
  const { svg } = await mountPhases({ cycles, days });
  assert.equal(all(svg, /<circle[^>]*fill="none" stroke="#f4b8d0" stroke-width="1.3"\/>/g).length, 4);
});

test('step 1 — menstrual flow is drawn as geometry, one mark per logged day', async () => {
  const { svg } = await chart();
  // heavy, medium, medium, light, spotting on Jan 1-5.
  assert.equal(all(svg, /<rect[^>]*fill="#e0567f"\/>/g).length, 1, 'heavy = one solid block');
  assert.equal(all(svg, /<line[^>]*stroke="#e0567f" stroke-width="1.5"\/>/g).length, 5, 'two crosses (2 strokes each) + one light stroke');
  assert.equal(all(svg, /<circle[^>]*fill="#e0567f"\/>/g).length, 1, 'spotting = one dot');
});

test('the mucus row, Peak Day and the numbered drying days', async () => {
  const { svg } = await chart();
  // Peak-quality marks (circle + two strokes) on Jan 9, 10, 11.
  assert.equal(all(svg, /<circle[^>]*stroke="#f4b8d0" stroke-width="1\.1"\/>/g).length, 3);
  // Less-fertile marks on Jan 6, 7, 8; dry marks on Jan 12, 13, 14.
  assert.equal(all(svg, /<circle[^>]*stroke="#d6a8c8"/g).length, 3);
  assert.equal(all(svg, /<circle[^>]*stroke="#8d84a8"/g).length, 3);
  assert.match(svg, />P<\/text>/);
  assert.deepEqual(all(svg, /fill="#ffd76e" font-size="[\d.]+">([123])<\/text>/g).map((m) => m[1]), ['1', '2', '3']);
});

test('one column per cycle day, and every day labelled at this density', async () => {
  const { svg } = await chart();
  // The weekday row draws one label per LABELLED day, so counting it counts the labelling.
  // At 9.16 units per day the rotated labels still fit, so all 31 days are labelled.
  assert.equal(all(svg, /fill="#7a7296" font-size="[\d.]+">[smtwf]<\/text>/g).length, 31);
  // Nothing was thinned, so no thinning ticks were added.
  assert.equal(all(svg, /stroke="#2a2140" stroke-width="0.6"/g).length, 0);
  // Below 13 units per day the DAY and DATE labels turn upright (v0.9.3).
  assert.ok(all(svg, /transform="rotate\(-90 /g).length >= 62, 'DAY and DATE rows should be rotated');
});

test('an in-progress cycle charts too, and says so', async () => {
  // Page zero clicks back, so this is the newest cycle: the one whose window runs to today and
  // grows every day. It must chart cleanly at whatever length today happens to make it, and
  // say "in progress" rather than quote a cycle length it does not have yet.
  const { svg, text } = await mountPhases(textbook(), { back: 0 });
  assert.ok(text.some((t) => /in progress$/.test(t)), 'header should say the cycle is in progress');
  assert.ok(text.some((t) => /^cycle day \d+$/.test(t)), 'header should show the current cycle day');
  assert.ok(!text.some((t) => /-day cycle$/.test(t)), 'an open cycle has no length to quote');
  assert.ok(svg.length > 1000);
  assert.ok(!/undefined|NaN/.test(svg));
});

test('a cycle with nothing logged still draws without holes', async () => {
  const { svg } = await mountPhases({
    cycles: [{ id: 'a', startDate: '2026-01-01' }, { id: 'b', startDate: '2026-02-01' }],
    days: {},
  });
  assert.ok(!/undefined|NaN/.test(svg));
  // No temperatures, so no LTL line and no rings — but the day columns are still drawn.
  assert.ok(!svg.includes('>LTL</text>'));
  assert.equal(all(svg, /fill="#7a7296" font-size="[\d.]+">[smtwf]<\/text>/g).length, 31);
  // Nothing confirmed, so Phase 2 runs to the end of the cycle and there is no Phase 3 band.
  assert.ok(!svg.includes('fill="#4fbf9f" rx="2.5"'));
});

test('the cycle picker walks back through history', async () => {
  // Three completed cycles plus the open one. Clicking ‹ twice lands on the middle cycle,
  // whose own length (29 days) is what gets drawn.
  const cycles = [
    { id: 'a', startDate: '2026-01-01', endDate: '2026-01-05' },
    { id: 'b', startDate: '2026-02-01', endDate: '2026-02-05' },
    { id: 'c', startDate: '2026-03-02', endDate: '2026-03-06' },
    { id: 'd', startDate: '2026-04-01' },
  ];
  const back2 = await mountPhases({ cycles, days: {} }, { back: 2 });
  assert.equal(all(back2.svg, /fill="#7a7296" font-size="[\d.]+">[smtwf]<\/text>/g).length, 29);
  const back3 = await mountPhases({ cycles, days: {} }, { back: 3 });
  assert.equal(all(back3.svg, /fill="#7a7296" font-size="[\d.]+">[smtwf]<\/text>/g).length, 31);
});
