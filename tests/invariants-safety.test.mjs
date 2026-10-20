// The safety invariants that must hold whatever else changes in the fertility code.
//
// ROADMAP SS2: in Avoid mode the fertile ("cannot") window is shaded conservatively and we err
// toward "cannot" whenever unsure. Every test here fails in the direction that MATTERS: a
// false SAFE, i.e. a day the app calls lower-risk when the signs do not support it. A test
// here going red is never a formatting problem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveWindow } from '../js/fertility.js';
import { predict } from '../js/predict.js';
import { mucusPeak } from '../js/nfp.js';
import { cycleWindows, analyzeCycle, peakDay } from '../js/phases.js';
import { wetMostDays, may, addD } from './helpers/fixtures.mjs';

const effFor = (cycles, days) => effectiveWindow(cycles, days, predict(cycles, {}), 'avoid');

test('mucus may only ever push "safe again" LATER, never earlier', () => {
  const { cycles, days } = wetMostDays();
  const withMucus = effFor(cycles, days);
  const withNone = effFor(cycles, {});           // same cycles, nothing charted
  assert.ok(
    withMucus.safeAgain >= withNone.safeAgain,
    `mucus moved "safe again" EARLIER: ${withNone.safeAgain} -> ${withMucus.safeAgain}`,
  );
});

test('nfp.mucusPeak() and phases.peakDay() disagree here, and that is the design', () => {
  const { cycles, days } = wetMostDays();
  const backstop = mucusPeak(cycles, days);
  const wins = cycleWindows(cycles);
  const locked = peakDay(wins[wins.length - 1], days);

  // the backstop tracks the LAST peak-quality day in the cycle
  assert.equal(backstop.peakDate, may(28));
  // the locked rule stops at the first patch that completed three drying days
  assert.equal(locked.date, may(11));
  assert.equal(locked.confirmed, true);
  assert.ok(backstop.peakDate > locked.date);
});

test('REGRESSION — porting the v0.9.5 lock into mucusPeak() would be a false SAFE', () => {
  // If this fails, someone has "unified" nfp.mucusPeak() with phases.peakDay(). Do not fix
  // the test. Measured cost of that change on this very fixture: "safe again" collapses from
  // 2026-06-01 to 2026-05-15, turning 17 not-safe days into safe ones in Avoid mode.
  // phases.peakDay() locks because it charts one cycle's phases; mucusPeak() must not,
  // because effectiveWindow() cannot express "a new mucus patch reopened the window".
  const { cycles, days } = wetMostDays();
  const eff = effFor(cycles, days);
  const wins = cycleWindows(cycles);
  const locked = peakDay(wins[wins.length - 1], days);

  assert.equal(eff.safeAgain, '2026-06-01');
  assert.ok(
    eff.safeAgain > addD(locked.date, 4),
    `the window is no longer held open past the locked peak+4 (${addD(locked.date, 4)}) — ` +
    'mucusPeak() has probably been given the lock, which shortens the not-safe window',
  );
});

test('a confirmed thermal shift still closes the window, mucus notwithstanding', () => {
  // The payoff for taking temperatures: a CONFIRMED shift supersedes the calendar guess.
  // Mucus may then only push the date later, so "safe again" is never earlier than the
  // temperature said. Guards the ordering in effectiveWindow().
  const { cycles, days } = wetMostDays();
  const eff = effFor(cycles, days);
  assert.ok(eff.safeAgain >= eff.fertileStart, 'the window closed before it opened');
  assert.equal(typeof eff.tempConfirmed, 'boolean');
});

test('the Phases tab and the Temperature card quote the SAME Peak Day', () => {
  // v0.9.8: the Temperature card used to print nfp.mucusPeak()'s date while the Phases tab
  // charted phases.peakDay()'s, so the app showed two different Peak Days for one cycle.
  // Both now read analyzeCycle(...).peak. This asserts the source they share.
  const { cycles, days } = wetMostDays();
  const wins = cycleWindows(cycles);
  const fromPhasesTab = analyzeCycle(wins, wins.length - 1, days).peak;
  const fromTempCard = peakDay(wins[wins.length - 1], days);
  assert.equal(fromPhasesTab.date, fromTempCard.date);
  assert.equal(fromPhasesTab.date, may(11));
});
