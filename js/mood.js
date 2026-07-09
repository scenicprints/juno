// Juno — mood / PMS forecast. Pure functions over mood + symptom logs vs cycle timing.
// Aligns each logged mood to "days before that cycle's next period" (PMS clusters at the END
// of the cycle, so this is more accurate than aligning to the start), finds where mood dips,
// and projects that window onto the predicted next period. Correlation from her own logs — not a rule.
import { fmt, addDays, diffDays, prettyDate } from './dates.js';

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

export function moodForecast(cycles, days, prediction) {
  const starts = (cycles || []).map(c => c.startDate).filter(Boolean).sort();
  if (starts.length < 2 || !days) return { ready: false };

  // observations from COMPLETED cycles (a period start exists after the logged day)
  const obs = [];
  for (const d of Object.keys(days)) {
    const day = days[d];
    if (typeof day.mood !== 'number') continue;
    const nextStart = starts.find(s => s > d);
    if (!nextStart) continue;
    const dbp = diffDays(d, nextStart); // days before that cycle's next period
    if (dbp < 1 || dbp > 40) continue;
    obs.push({ dbp, mood: day.mood, symptoms: day.symptoms || [], nextStart });
  }
  if (obs.length < 5) return { ready: false };

  const overall = mean(obs.map(o => o.mood));
  const sampleCycles = new Set(obs.map(o => o.nextStart)).size;

  // find the late-luteal days (1–7 before period) where mood runs below her overall average
  const lowDbps = [];
  for (let k = 1; k <= 7; k++) {
    const bucket = obs.filter(o => o.dbp === k);
    if (bucket.length >= 2 && mean(bucket.map(o => o.mood)) <= overall - 0.3) lowDbps.push(k);
  }
  if (!lowDbps.length) return { ready: true, signal: false };

  const lowFrom = Math.min(...lowDbps); // closest to the period
  const lowTo = Math.max(...lowDbps);   // furthest before the period
  const inWindow = obs.filter(o => o.dbp >= lowFrom && o.dbp <= lowTo);
  const drop = +(overall - mean(inWindow.map(o => o.mood))).toFixed(1);

  // most common symptoms in that window
  const counts = {};
  inWindow.forEach(o => o.symptoms.forEach(s => { counts[s] = (counts[s] || 0) + 1; }));
  const topSymptoms = Object.entries(counts)
    .filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);

  // project onto the predicted next period
  let forecastStart = null, forecastEnd = null;
  if (prediction && prediction.nextStart) {
    forecastStart = fmt(addDays(prediction.nextStart, -lowTo));
    forecastEnd = fmt(addDays(prediction.nextStart, -lowFrom));
  }

  return {
    ready: true, signal: true,
    lowFrom, lowTo, drop, sampleCycles, topSymptoms,
    forecastStart, forecastEnd,
    forecastText: forecastStart ? (forecastStart === forecastEnd
      ? `around ${prettyDate(forecastStart)}`
      : `around ${prettyDate(forecastStart)} – ${prettyDate(forecastEnd)}`) : '',
  };
}
