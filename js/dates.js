// Juno — date helpers. Dates are stored as local 'YYYY-MM-DD' strings.

export function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function today() { return fmt(new Date()); }
export function addDays(dateOrStr, n) {
  const d = typeof dateOrStr === 'string' ? parse(dateOrStr) : new Date(dateOrStr);
  d.setDate(d.getDate() + n);
  return d;
}
export function addDaysStr(s, n) { return fmt(addDays(s, n)); }
// whole-day difference b - a (in days)
export function diffDays(aStr, bStr) {
  const a = parse(aStr), b = parse(bStr);
  return Math.round((b - a) / 86400000);
}
export function monthLabel(d) {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
export function prettyDate(s) {
  return parse(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
