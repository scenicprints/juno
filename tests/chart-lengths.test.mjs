// The chart at the cycle lengths real logging actually produces.
//
// ROADMAP's own repeated lesson (v0.9.3, v0.9.4): every round of the chart bugs was a floor or
// a clamp that held at 28 days and failed past 40, and the harness only ever had tidy textbook
// cycles in it. A missed period start makes a 74- or 121-day "cycle", and cycleWindows() does
// not filter those out the way cycleLengths() does, so the chart has to survive them.
//
// The geometry these assertions are derived from, all in phaseChart() in js/ui.js:
//   viewBox 310, gutter 22, right pad 4  ->  284 units of plot
//   dayW      = 284 / L
//   rot       = dayW < 13                       (labels turn upright below that)
//   fRot      = clamp(dayW * 1.15, 6, 9)        (never shrunk below 6)
//   footprint = rot ? fRot * 0.8 : 9.5 * 1.35
//   step      = ceil(footprint / dayW)          (label every Nth day)
//   fPre      = clamp(dayW * 0.75, 6, 8.5)
//   showPreNums = dayW >= fPre * 1.2
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountPhases, all } from './helpers/dom.mjs';
import { cycleOfLength, cycleInProgress } from './helpers/fixtures.mjs';
import { today } from '../js/dates.js';

// A 9-day cycle is covered separately, below: a 9-day gap between two starts is discarded as a
// stray entry, so the only 9-day window that can exist is a cycle still in progress.
const LENGTHS = [26, 28, 31, 34, 39, 40, 45, 58, 74, 121];

// The same arithmetic as phaseChart(), kept here deliberately rather than imported: if a guard
// in ui.js changes, these numbers should stop matching and the test should say so.
function geometry(L) {
  const cols = Math.max(L, 6);   // the column count is floored at six days
  const dayW = 284 / cols;
  const rot = dayW < 13;
  const fRot = Math.min(Math.max(dayW * 1.15, 6), 9);
  const footprint = rot ? fRot * 0.8 : 9.5 * 1.35;
  const step = Math.max(1, Math.ceil(footprint / dayW));
  const fPre = Math.min(Math.max(dayW * 0.75, 6), 8.5);
  let labelled = 0;
  for (let d = 1; d <= cols; d++) if ((d - 1) % step === 0) labelled++;
  return { cols, dayW, rot, step, labelled, showPreNums: dayW >= fPre * 1.2 };
}

const dowLabels = (svg) => all(svg, /fill="#7a7296" font-size="[\d.]+">[smtwf]<\/text>/g).length;
const preNums = (svg) => all(svg, /<text[^>]*fill="#c9a7ff"[^>]*font-weight="700">(\d)<\/text>/g).map((m) => m[1]);

for (const L of LENGTHS) {
  test(`a ${L}-day cycle charts cleanly`, async () => {
    const { svg } = await mountPhases(cycleOfLength(L));
    const g = geometry(L);

    assert.ok(svg.length > 500, 'chart is empty');
    // The two failure modes that shipped: a coordinate that came out NaN, and a value that
    // was never computed at all.
    assert.ok(!/undefined/.test(svg), `"undefined" in the markup at ${L} days`);
    assert.ok(!/NaN/.test(svg), `NaN coordinate at ${L} days`);

    // The whole cycle sits in one view: the plot is never wider than the viewBox.
    const width = Number(svg.match(/<rect x="22" y="\d+" width="([\d.]+)"/)[1]);
    assert.ok(width <= 284.1, `plot is ${width} units wide at ${L} days, past the 284 available`);

    // Labels are thinned, never shrunk past legibility (v0.9.4). Every label that IS drawn
    // sits on an evenly spaced day, and day 1 always carries one.
    assert.equal(dowLabels(svg), g.labelled, `label count at ${L} days (step ${g.step})`);
    const ticks = all(svg, /stroke="#2a2140" stroke-width="0.6"/g).length;
    assert.equal(ticks, g.step > 1 ? g.labelled : 0, `thinning ticks at ${L} days`);

    // No font anywhere in the chart is below 6 units.
    const fonts = all(svg, /font-size="([\d.]+)"/g).map((m) => Number(m[1]));
    assert.ok(Math.min(...fonts) >= 6, `font ${Math.min(...fonts)} at ${L} days is below the floor`);

    // Step 9's numbers appear only where six one-digit labels actually fit.
    assert.deepEqual(
      preNums(svg),
      g.showPreNums ? ['6', '5', '4', '3', '2', '1'] : [],
      `Pre-Shift Six numbering at ${L} days (${g.dayW.toFixed(2)} units per day)`,
    );
    // Shown or not, the six are always ringed.
    assert.equal(all(svg, /stroke="#c9a7ff" stroke-width="1.1"/g).length, 6);
  });
}

test('the Pre-Shift Six numbering guard flips between 39 and 40 days', async () => {
  // 284/39 = 7.28 units per day, which clears the 7.2 the six numbers need; 284/40 = 7.10,
  // which does not. This is the crossover v0.9.6 measured, pinned so it cannot drift.
  assert.equal(geometry(39).showPreNums, true);
  assert.equal(geometry(40).showPreNums, false);
  const at39 = await mountPhases(cycleOfLength(39));
  const at40 = await mountPhases(cycleOfLength(40));
  assert.deepEqual(preNums(at39.svg), ['6', '5', '4', '3', '2', '1']);
  assert.deepEqual(preNums(at40.svg), []);
});

test('label thinning switches on between 59 and 60 days', async () => {
  // Down to 59 days every day still gets a label (the rotated footprint fits the column);
  // from 60 the labels go every other day. v0.9.3's floor is what used to break here — it
  // kept the font at 5.5 and let the labels overrun their columns instead of thinning.
  assert.equal(geometry(59).step, 1);
  assert.equal(geometry(60).step, 2);
  const at59 = await mountPhases(cycleOfLength(59));
  const at60 = await mountPhases(cycleOfLength(60));
  assert.equal(dowLabels(at59.svg), 59);
  assert.equal(dowLabels(at60.svg), 30);
  assert.equal(all(at59.svg, /stroke="#2a2140" stroke-width="0.6"/g).length, 0);
  assert.equal(all(at60.svg, /stroke="#2a2140" stroke-width="0.6"/g).length, 30);
});

test('the header labels turn upright between 21 and 22 days', async () => {
  // Above 13 units per day they stay horizontal; at 22 days (12.9 units) they rotate (v0.9.3).
  assert.equal(geometry(21).rot, false);
  assert.equal(geometry(22).rot, true);
  const at21 = await mountPhases(cycleOfLength(21));
  const at22 = await mountPhases(cycleOfLength(22));
  assert.equal(all(at21.svg, /transform="rotate\(-90 /g).length, 0);
  assert.equal(all(at22.svg, /transform="rotate\(-90 /g).length, 44); // DAY + DATE on 22 days
});

test('a 121-day cycle is still one page, with a readable sparse axis', async () => {
  // The worst real case: two missed period starts. 2.35 units per day.
  const { svg } = await mountPhases(cycleOfLength(121));
  const g = geometry(121);
  assert.equal(g.step, 3);
  assert.equal(dowLabels(svg), 41);                       // days 1, 4, 7, ... 121
  assert.ok(!/NaN|undefined/.test(svg));
  // Marks scale down without a floor, so they do not pile up on top of each other.
  const radii = all(svg, /<circle[^>]*r="([\d.]+)" fill="(?:#c9a7ff|#ffffff|#4fbf9f)"/g).map((m) => Number(m[1]));
  assert.ok(radii.length > 0);
  assert.ok(Math.max(...radii) <= g.dayW, `dot radius ${Math.max(...radii)} exceeds the ${g.dayW.toFixed(2)}-unit column`);
});

test('a 9-day gap is a stray entry, not a 9-day cycle', async () => {
  // Worth stating because it is the reason the sweep above starts at 26: two starts 9 days
  // apart are not a cycle at all. cycleStarts() drops the second one (v0.8.4), so the chart
  // only ever sees the one window, which runs from the kept start to today.
  const { cycles, days } = cycleOfLength(9);
  const { svg, text } = await mountPhases({ cycles, days }, { back: 0 });
  assert.ok(text.some((t) => /in progress$/.test(t)), 'the stray start left one open cycle');
  assert.ok(!/NaN|undefined/.test(svg));
});

// The short lengths that CAN occur: a cycle still in progress, whose window runs to today.
for (const L of [3, 9, 15]) {
  test(`a ${L}-day cycle in progress charts cleanly`, async () => {
    const { svg } = await mountPhases(cycleInProgress(L, { todayStr: today() }), { back: 0 });
    const g = geometry(L);

    assert.ok(!/NaN|undefined/.test(svg), `NaN or undefined in the markup at ${L} days`);
    // Below six days the column count is floored at six, so a 3-day cycle draws 6 columns.
    // That floor is what stops dayW blowing up and the plot collapsing to nothing.
    assert.equal(g.cols, Math.max(L, 6));
    assert.equal(dowLabels(svg), g.labelled);
    const width = Number(svg.match(/<rect x="22" y="\d+" width="([\d.]+)"/)[1]);
    assert.ok(width > 0 && width <= 284.1, `plot width ${width} at ${L} days`);
    const fonts = all(svg, /font-size="([\d.]+)"/g).map((m) => Number(m[1]));
    assert.ok(Math.min(...fonts) >= 6);
  });
}
