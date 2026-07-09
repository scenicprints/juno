// Juno — UI rendering (vanilla DOM, no framework).
import { predict, activePeriod } from './predict.js';
import { window as fertWindow, classify, todayStatus, confirmedOvulation } from './fertility.js';
import { moodForecast } from './mood.js';
import { alerts } from './alerts.js';
import { today, fmt, parse, addDays, diffDays, prettyDate, monthLabel } from './dates.js';

export const APP_VERSION = '0.4.1';
const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];
// Flat, tappable preset conditions (no typing). Stored in days/{date}.symptoms as label strings.
const SYMPTOMS = [
  'Cramps', 'Headache', 'Bloating', 'Tender breasts', 'Fatigue', 'Nausea',
  'Backache', 'Acne', 'Cravings', 'Irritable', 'Anxious', 'Insomnia',
];
function hasLog(d) { return !!(d && (d.mood || (d.symptoms && d.symptoms.length) || d.note)); }

// tiny DOM helper
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  (Array.isArray(kids) ? kids : [kids]).forEach(c => {
    if (c == null) return;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return n;
}

// ---------- module render state ----------
let _root, _data, _handlers;
let view = { tab: 'today', calMonth: null, sheetDate: null };

function mode() { return _data?.settings?.mode || 'avoid'; }
function ctx() {
  const p = predict(_data.cycles, _data.settings);
  const f = fertWindow(p, mode());
  const tempConfirm = confirmedOvulation(_data.cycles, _data.days);
  const moodF = moodForecast(_data.cycles, _data.days, p);
  const activePeriodFlag = !!activePeriod(_data.cycles);
  return { cycles: _data.cycles, prediction: p, fert: f, mode: mode(), tempConfirm, moodF, activePeriod: activePeriodFlag };
}

// =================== AUTH VIEW ===================
export function renderAuth(root, { onSubmit }) {
  root.innerHTML = '';
  let creating = false, err = '';
  const emailIn = el('input', { type: 'email', placeholder: 'Email', autocomplete: 'username' });
  const pwIn = el('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
  const errBox = el('p', { class: 'err' });
  const primary = el('button', { class: 'btn primary' });
  const toggle = el('button', { class: 'linkbtn' });

  function paint() {
    primary.textContent = creating ? 'Create shared account' : 'Sign in';
    toggle.textContent = creating ? 'Have an account? Sign in' : 'First time? Create the shared account';
    errBox.textContent = err;
  }
  primary.addEventListener('click', async () => {
    err = ''; paint();
    try { await onSubmit(emailIn.value.trim(), pwIn.value, creating); }
    catch (e) { err = friendlyAuthErr(e); paint(); }
  });
  toggle.addEventListener('click', () => { creating = !creating; err = ''; paint(); });

  root.appendChild(el('div', { class: 'auth' }, [
    el('img', { class: 'auth-logo', src: 'icon.svg', alt: 'Juno' }),
    el('h1', { text: 'Juno' }),
    el('p', { class: 'tag', text: 'One shared login for both of you' }),
    el('div', { class: 'card' }, [emailIn, pwIn, primary, errBox, toggle]),
    el('p', { class: 'disclaimer', text: 'Not medical advice. Fertility guidance is awareness, not contraception.' }),
  ]));
  paint();
}
function friendlyAuthErr(e) {
  const c = (e && e.code) || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found'))
    return 'Wrong email or password.';
  if (c.includes('email-already-in-use')) return 'That account already exists — sign in instead.';
  if (c.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (c.includes('invalid-email')) return 'That email looks off.';
  if (c.includes('network')) return 'Network error — check your connection.';
  return (e && e.message) || 'Something went wrong.';
}

// =================== APP SHELL ===================
export function mountApp(root, data, handlers) {
  _root = root; _data = data; _handlers = handlers;
  if (!view.calMonth) { const t = parse(today()); view.calMonth = new Date(t.getFullYear(), t.getMonth(), 1); }
  rerender();
}
export function updateData(data) { _data = data; if (_root) rerender(); }

function rerender() {
  _root.innerHTML = '';
  const shell = el('div', { class: 'app' });
  shell.appendChild(el('main', { class: 'content' }, [
    view.tab === 'today' ? viewToday() :
    view.tab === 'calendar' ? viewCalendar() : viewSettings(),
  ]));
  shell.appendChild(nav());
  _root.appendChild(shell);
  if (view.sheetDate) shell.appendChild(daySheet(view.sheetDate));
}

function nav() {
  const item = (id, label, icon) => el('button',
    { class: 'nav-item' + (view.tab === id ? ' active' : ''), onclick: () => { view.tab = id; rerender(); } },
    [el('span', { class: 'nav-icon', text: icon }), el('span', { text: label })]);
  return el('nav', { class: 'bottomnav' }, [
    item('today', 'Today', '●'),
    item('calendar', 'Calendar', '▦'),
    item('settings', 'Settings', '⚙'),
  ]);
}

// =================== TODAY ===================
function viewToday() {
  const c = ctx();
  const p = c.prediction;
  const wrap = el('div', {});

  wrap.appendChild(el('h2', { class: 'view-title', text: 'Today' }));

  // heads-up alerts (imminent period / fertile window / mood dip)
  const alertList = alerts(c);
  alertList.forEach(a => wrap.appendChild(el('div', { class: 'alert alert-' + a.level }, [
    el('span', { class: 'alert-dot', text: a.level === 'warn' ? '⚠' : '•' }),
    el('span', { text: a.text }),
  ])));

  if (p.state === 'none') {
    wrap.appendChild(el('div', { class: 'card' }, [
      el('p', { text: 'Welcome. Log the first day of her most recent period to start predictions.' }),
    ]));
  } else {
    // prediction summary
    const summary = el('div', { class: 'card' });
    summary.appendChild(el('div', { class: 'big-num' }, [
      el('span', { class: 'n', text: String(Math.max(p.cycleDay, 1)) }),
      el('span', { class: 'lbl', text: 'cycle day' }),
    ]));
    const untilTxt = p.daysUntil <= 0
      ? `Period expected around now (${prettyDate(p.nextStart)})`
      : `Next period in ~${p.daysUntil} days · around ${prettyDate(p.nextStart)}`;
    summary.appendChild(el('p', { class: 'muted', text: untilTxt }));
    summary.appendChild(el('p', { class: 'range', text: `Likely window: ${prettyDate(p.rangeStart)} – ${prettyDate(p.rangeEnd)}` }));
    if (p.state === 'learning')
      summary.appendChild(el('p', { class: 'learning', text: 'Still learning her cycle — predictions get sharper after a couple of periods. Don’t rely on this yet.' }));
    wrap.appendChild(summary);

    // can / cannot banner
    const st = todayStatus(today(), c);
    const banner = el('div', { class: 'banner banner-' + st.tone }, [el('strong', { text: st.label })]);
    if (mode() === 'avoid' && (st.key === 'cannot' || st.key === 'can'))
      banner.appendChild(el('div', { class: 'banner-sub', text: st.key === 'cannot'
        ? 'Use protection. Calendar timing is not reliable birth control.'
        : 'Lower risk — but not zero, and this is not contraception.' }));
    wrap.appendChild(banner);

    // temperature-confirmed ovulation note
    const tc = c.tempConfirm;
    if (tc && today() >= tc.infertileFrom) {
      wrap.appendChild(el('p', { class: 'confirm-note',
        text: `✓ Ovulation confirmed by temperature (${prettyDate(tc.ovulation)}). The fertile window has closed for this cycle.` }));
    }

    // mood / PMS outlook
    const outlook = moodOutlookCard(c);
    if (outlook) wrap.appendChild(outlook);
  }

  // daily check-in — prominent (mood + preset symptom chips)
  wrap.appendChild(checkInCard(today()));

  // period action
  const active = activePeriod(_data.cycles);
  const periodBtn = active
    ? el('button', { class: 'btn', onclick: () => _handlers.endPeriod(active.id, today()) }, ['Period ended today'])
    : el('button', { class: 'btn primary', onclick: () => _handlers.startPeriod(today()) }, ['Period started today']);
  const picker = el('input', { class: 'daypick', type: 'date', value: today(), max: today() });
  picker.addEventListener('change', () => { if (picker.value) { view.sheetDate = picker.value; rerender(); } });
  const pickRow = el('label', { class: 'daypick-row' }, [
    el('span', { class: 'muted small', text: 'Log another day' }),
    picker,
  ]);
  wrap.appendChild(el('div', { class: 'card' }, [
    el('h3', { class: 'card-h', text: 'Period' }),
    periodBtn, pickRow,
    el('p', { class: 'muted small', text: 'Tip: you can also tap any day on the Calendar to log it.' }),
  ]));

  wrap.appendChild(el('p', { class: 'disclaimer', text: 'Not medical advice. Fertility guidance is awareness, not contraception.' }));
  return wrap;
}

function checkInCard(dateStr) {
  const day = _data.days[dateStr] || {};
  const isToday = dateStr === today();
  const card = el('div', { class: 'card checkin' }, [
    el('h3', { class: 'card-h', text: isToday ? 'How is she feeling today?' : 'Check-in · ' + prettyDate(dateStr) }),
  ]);

  // mood faces
  card.appendChild(el('div', { class: 'field-label', text: 'Mood' }));
  const row = el('div', { class: 'mood-row' });
  MOODS.forEach((m, i) => {
    const val = i + 1;
    row.appendChild(el('button', {
      class: 'mood' + (day.mood === val ? ' sel' : ''),
      onclick: () => _handlers.setDay(dateStr, { mood: day.mood === val ? null : val }),
    }, [m]));
  });
  card.appendChild(row);

  // preset symptom chips (tap to toggle, multi-select — no typing)
  card.appendChild(el('div', { class: 'field-label', text: 'Symptoms & conditions' }));
  const current = new Set(day.symptoms || []);
  const chips = el('div', { class: 'chips' });
  SYMPTOMS.forEach((s) => {
    const on = current.has(s);
    chips.appendChild(el('button', {
      class: 'chip' + (on ? ' on' : ''),
      onclick: () => {
        const next = new Set(current);
        on ? next.delete(s) : next.add(s);
        _handlers.setDay(dateStr, { symptoms: [...next] });
      },
    }, [s]));
  });
  card.appendChild(chips);

  // optional morning temperature (BBT) — confirms ovulation once a sustained rise appears
  card.appendChild(el('div', { class: 'field-label', text: 'Morning temperature (optional)' }));
  const tempIn = el('input', { class: 'temp-in', type: 'number', step: '0.05', inputmode: 'decimal',
    placeholder: '°F  (take it right after waking)', value: day.tempF != null ? String(day.tempF) : '' });
  tempIn.addEventListener('change', () => {
    const v = parseFloat(tempIn.value);
    _handlers.setDay(dateStr, { tempF: Number.isFinite(v) ? Math.round(v * 100) / 100 : null });
  });
  card.appendChild(tempIn);

  // optional free-text note (secondary)
  const note = el('input', { type: 'text', placeholder: 'Add a note (optional)', value: day.note || '' });
  note.addEventListener('change', () => _handlers.setDay(dateStr, { note: note.value }));
  card.appendChild(note);
  return card;
}

function moodOutlookCard(c) {
  const f = moodForecast(_data.cycles, _data.days, c.prediction);
  if (!f.ready) return null;
  if (!f.signal) {
    return el('p', { class: 'mood-hint', text: 'No clear mood pattern yet — her moods look fairly even across the cycle so far. Keep logging.' });
  }
  const daysTxt = f.lowFrom === f.lowTo ? `${f.lowFrom} day` : `${f.lowFrom}–${f.lowTo} days`;
  const card = el('div', { class: 'card outlook' }, [el('h3', { class: 'card-h', text: 'Mood outlook' })]);
  card.appendChild(el('p', {
    text: `Her mood tends to dip in the ${daysTxt} before her period` + (f.forecastText ? ` — this cycle that's ${f.forecastText}.` : '.'),
  }));
  if (f.topSymptoms.length)
    card.appendChild(el('p', { class: 'muted small', text: `Often with: ${f.topSymptoms.join(', ')}.` }));
  card.appendChild(el('p', { class: 'muted small', text: f.sampleCycles < 2
    ? 'Early read from ~1 cycle — it sharpens as she logs more. A pattern, not a certainty.'
    : `From ${f.sampleCycles} cycles of her logs. A pattern, not a certainty.` }));
  return card;
}

// =================== CALENDAR ===================
function viewCalendar() {
  const c = ctx();
  const wrap = el('div', {});
  const m = view.calMonth;
  const header = el('div', { class: 'cal-head' }, [
    el('button', { class: 'linkbtn', onclick: () => { view.calMonth = new Date(m.getFullYear(), m.getMonth() - 1, 1); rerender(); } }, ['‹']),
    el('span', { class: 'cal-title', text: monthLabel(m) }),
    el('button', { class: 'linkbtn', onclick: () => { view.calMonth = new Date(m.getFullYear(), m.getMonth() + 1, 1); rerender(); } }, ['›']),
  ]);
  wrap.appendChild(header);

  const grid = el('div', { class: 'cal-grid' });
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => grid.appendChild(el('div', { class: 'cal-dow', text: d })));
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  for (let i = 0; i < startPad; i++) grid.appendChild(el('div', { class: 'cal-cell empty' }));
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = fmt(new Date(m.getFullYear(), m.getMonth(), d));
    const cls = classify(ds, c);
    const cell = el('button', {
      class: `cal-cell k-${cls}` + (ds === today() ? ' istoday' : ''),
      onclick: () => { view.sheetDate = ds; rerender(); },
    }, [String(d)]);
    if (hasLog(_data.days[ds])) cell.appendChild(el('span', { class: 'dot' }));
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  wrap.appendChild(legend());
  return wrap;
}

function legend() {
  const items = mode() === 'avoid'
    ? [['k-period', 'Period'], ['k-predictedPeriod', 'Predicted period'], ['k-cannot', 'Not safe'], ['k-can', 'Lower risk']]
    : [['k-period', 'Period'], ['k-predictedPeriod', 'Predicted period'], ['k-peak', 'Peak'], ['k-fertile', 'Fertile']];
  return el('div', { class: 'legend' }, items.map(([k, t]) =>
    el('span', { class: 'leg' }, [el('span', { class: 'swatch ' + k }), t])));
}

// =================== DAY SHEET ===================
function daySheet(dateStr) {
  const active = activePeriod(_data.cycles);
  const onCloseBg = (e) => { if (e.target.classList.contains('sheet-bg')) { view.sheetDate = null; rerender(); } };
  const close = () => { view.sheetDate = null; rerender(); };

  const actions = el('div', { class: 'sheet-actions' });
  actions.appendChild(el('button', { class: 'btn primary', onclick: () => { _handlers.startPeriod(dateStr); close(); } }, ['Mark period start']));
  if (active)
    actions.appendChild(el('button', { class: 'btn', onclick: () => { _handlers.endPeriod(active.id, dateStr); close(); } }, ['Mark period end']));

  // delete a cycle that starts on this day
  const c = _data.cycles.find(x => x.startDate === dateStr);
  if (c)
    actions.appendChild(el('button', { class: 'btn danger', onclick: () => { _handlers.deleteCycle(c.id); close(); } }, ['Remove this period entry']));

  return el('div', { class: 'sheet-bg', onclick: onCloseBg }, [
    el('div', { class: 'sheet' }, [
      el('div', { class: 'sheet-grab' }),
      el('h3', { text: parse(dateStr).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) }),
      actions,
      checkInCard(dateStr),
      el('button', { class: 'linkbtn', onclick: close }, ['Close']),
    ]),
  ]);
}

// =================== SETTINGS ===================
function viewSettings() {
  const wrap = el('div', {});
  wrap.appendChild(el('h2', { class: 'view-title', text: 'Settings' }));

  // mode
  const modeCard = el('div', { class: 'card' }, [el('h3', { class: 'card-h', text: 'Mode' })]);
  const seg = el('div', { class: 'seg' });
  [['avoid', 'Avoid'], ['conceive', 'Conceive'], ['neutral', 'Neutral']].forEach(([k, l]) => {
    seg.appendChild(el('button', {
      class: 'seg-btn' + (mode() === k ? ' on' : ''),
      onclick: () => _handlers.setSettings({ mode: k }),
    }, [l]));
  });
  modeCard.appendChild(seg);
  modeCard.appendChild(el('p', { class: 'muted small', text: mode() === 'avoid'
    ? 'Avoid: the fertile window is shaded wide and conservatively. This is not birth control.'
    : mode() === 'conceive' ? 'Conceive: peak-fertility days are highlighted.'
    : 'Neutral: shows the fertile window without a conceive/avoid slant.' }));
  wrap.appendChild(modeCard);

  // typical cycle length
  const len = _data.settings.typicalCycleLen || 28;
  const lenIn = el('input', { type: 'number', min: '20', max: '45', value: String(len) });
  lenIn.addEventListener('change', () => {
    const v = Math.max(20, Math.min(45, Number(lenIn.value) || 28));
    _handlers.setSettings({ typicalCycleLen: v });
  });
  wrap.appendChild(el('div', { class: 'card' }, [
    el('h3', { class: 'card-h', text: 'Typical cycle length' }),
    el('p', { class: 'muted small', text: 'Used for predictions until Juno has logged a couple of her cycles.' }),
    el('div', { class: 'inline' }, [lenIn, el('span', { class: 'muted', text: 'days' })]),
  ]));

  wrap.appendChild(el('div', { class: 'card' }, [
    el('button', { class: 'btn', onclick: () => _handlers.logout() }, ['Sign out']),
  ]));

  wrap.appendChild(el('p', { class: 'disclaimer', text: `Juno v${APP_VERSION} · Not medical advice. Fertility guidance is awareness, not contraception.` }));
  return wrap;
}
