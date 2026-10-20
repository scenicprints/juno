// Juno — UI rendering (vanilla DOM, no framework).
import { predict, activePeriod, MIN_CYCLE_DAYS } from './predict.js';
import { classify, todayStatus, confirmedOvulation, effectiveWindow } from './fertility.js';
import { moodForecast } from './mood.js';
import { alerts } from './alerts.js';
import { cycleStats } from './stats.js';
import { analyze as nfpAnalyze, mucusPeak, isPeakMucus, hasMucus } from './nfp.js';
import { cycleWindows, analyzeCycle, phaseOfDay } from './phases.js';
import { enableNotifications, pushConfigured, permissionState } from './push.js';
import { today, fmt, parse, addDays, addDaysStr, diffDays, prettyDate, monthLabel } from './dates.js';

export const APP_VERSION = '0.9.6';
const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];
// Flat, tappable preset conditions (no typing). Stored in days/{date}.symptoms as label strings.
const SYMPTOMS = [
  'Cramps', 'Headache', 'Bloating', 'Tender breasts', 'Fatigue', 'Nausea',
  'Backache', 'Acne', 'Cravings', 'Irritable', 'Anxious', 'Insomnia',
];
// NFP mucus = two observations: sensation (felt) + characteristic (seen). Both single-select.
const MUCUS_SENSATION = [
  { key: 'dry', label: 'Dry' }, { key: 'moist', label: 'Moist' }, { key: 'wet', label: 'Wet' },
  { key: 'slippery', label: 'Slippery' }, { key: 'wetslippery', label: 'Wet/slippery' },
];
const MUCUS_CHAR = [{ key: 'tacky', label: 'Tacky' }, { key: 'stretchy', label: 'Stretchy' }]; // none = default
// Menstrual flow - step 1 of the paper chart. Stored in days/{date}.flow. `isBleeding()` in
// phases.js has always read this field; until now nothing ever wrote it, so that branch was dead.
const FLOW = [
  { key: 'spotting', label: 'Spotting' }, { key: 'light', label: 'Light' },
  { key: 'medium', label: 'Medium' }, { key: 'heavy', label: 'Heavy' },
];
function hasLog(d) { return !!(d && (d.mood || (d.symptoms && d.symptoms.length) || d.note || d.tempF || d.mucus || d.mucusSensation || d.mucusChar || d.flow)); }

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

// Drop the cached app shell and every service worker, then reload from the network.
// Data is in Firestore, so there is nothing here to lose.
async function forceUpdate() {
  toast('Fetching a fresh copy...');
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (_) { /* keep going, the reload still helps */ }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (_) { /* same */ }
  // a changing query string defeats the browser's own HTTP cache too
  location.replace(location.pathname + '?fresh=' + Date.now());
}

function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  t.addEventListener('click', () => t.remove());
  document.body.appendChild(t);
  setTimeout(() => t.remove(), Math.min(10000, 3500 + msg.length * 45)); // longer for long messages; tap to dismiss
}

// ---------- module render state ----------
let _root, _data, _handlers;
let view = { tab: 'today', calMonth: null, sheetDate: null, tempEditing: false, phaseCycle: null };
function tzName() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { return ''; } }
function setNotifPref(key, val) { _handlers.setSettings({ notifPrefs: { [key]: val }, tz: tzName() }); }

// Why a new period start can't be logged on `dateStr` (null = it can). A start within
// MIN_CYCLE_DAYS of another start isn't a new cycle — it's a stray entry, and a stray entry
// becomes the anchor for every prediction (one such tap slid the fertile window 5 days).
function startBlockReason(dateStr) {
  const near = (_data.cycles || []).find((c) => c.startDate && Math.abs(diffDays(c.startDate, dateStr)) < MIN_CYCLE_DAYS);
  if (!near) return null;
  if (near.startDate === dateStr) return 'A period is already logged as starting that day.';
  return `A period already starts ${prettyDate(near.startDate)} — too close to be a new one. To fix a wrong date, delete that entry under Stats › Logged periods.`;
}
function startPeriodGuarded(dateStr) {
  const why = startBlockReason(dateStr);
  if (why) { toast(why); return; }
  _handlers.startPeriod(dateStr);
}

// download all of the account's data as a JSON backup file
function downloadData() {
  try {
    const payload = {
      app: 'Juno', version: APP_VERSION, exportedAt: new Date().toISOString(),
      cycles: _data.cycles || [], days: _data.days || {}, settings: _data.settings || {},
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `juno-export-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Downloaded your Juno data.');
  } catch (e) { toast('Could not export: ' + (e?.message || e)); }
}

// --- Android back-button handling: overlays (day sheet, notifications sub-screen) push a
// history entry so the hardware/gesture Back closes the overlay instead of exiting the app. ---
let _historyBound = false;
function bindBack() {
  if (_historyBound) return;
  _historyBound = true;
  window.addEventListener('popstate', () => {
    if (view.sheetDate) { view.sheetDate = null; if (_root) rerender(); }
    else if (view.tab === 'notifications') { view.tab = 'settings'; if (_root) rerender(); }
  });
}
function pushBackTrap() { try { history.pushState({ juno: 1 }, ''); } catch (_) {} }
function overlayBack() { try { history.back(); } catch (_) { view.sheetDate = null; if (_root) rerender(); } }
function openSheet(ds) { view.sheetDate = ds; pushBackTrap(); rerender(); }

// swipe-down-to-dismiss: drag the sheet's header (grab bar + title). The header has
// touch-action:none so the browser hands us the gesture instead of treating it as a scroll.
function attachSwipeDismiss(sheetEl, handle) {
  let startY = 0, dragging = false, delta = 0;
  handle.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY; dragging = true; delta = 0;
    sheetEl.style.transition = 'none';
  }, { passive: true });
  handle.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    delta = Math.max(0, e.touches[0].clientY - startY);
    if (delta > 0) e.preventDefault();
    sheetEl.style.transform = delta ? `translateY(${delta}px)` : '';
  }, { passive: false });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheetEl.style.transition = 'transform .2s ease';
    if (delta > 90) { sheetEl.style.transform = 'translateY(100%)'; setTimeout(overlayBack, 180); }
    else { sheetEl.style.transform = ''; }
  };
  handle.addEventListener('touchend', end, { passive: true });
  handle.addEventListener('touchcancel', end, { passive: true });
}

function mode() { return _data?.settings?.mode || 'avoid'; }
function ctx() {
  const p = predict(_data.cycles, _data.settings);
  const eff = effectiveWindow(_data.cycles, _data.days, p, mode()); // the ONE window everything reads
  const tempConfirm = confirmedOvulation(_data.cycles, _data.days);
  const moodF = moodForecast(_data.cycles, _data.days, p);
  const activePeriodFlag = !!activePeriod(_data.cycles);
  return { cycles: _data.cycles, prediction: p, eff, mode: mode(), tempConfirm, moodF, activePeriod: activePeriodFlag };
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
  bindBack();
  rerender();
}
export function updateData(data) { _data = data; if (_root) rerender(); }

function rerender() {
  _root.innerHTML = '';
  const shell = el('div', { class: 'app' });
  shell.appendChild(el('main', { class: 'content' }, [
    view.tab === 'today' ? viewToday() :
    view.tab === 'calendar' ? viewCalendar() :
    view.tab === 'phases' ? viewPhases() :
    view.tab === 'stats' ? viewStats() :
    view.tab === 'notifications' ? viewNotifications() : viewSettings(),
  ]));
  shell.appendChild(nav());
  _root.appendChild(shell);
  if (view.sheetDate) shell.appendChild(daySheet(view.sheetDate));
}

function nav() {
  const item = (id, label, icon) => el('button',
    { class: 'nav-item' + ((view.tab === id || (id === 'settings' && view.tab === 'notifications')) ? ' active' : ''), onclick: () => { view.tab = id; rerender(); } },
    [el('span', { class: 'nav-icon', text: icon }), el('span', { text: label })]);
  return el('nav', { class: 'bottomnav' }, [
    item('today', 'Today', '●'),
    item('calendar', 'Calendar', '▦'),
    item('phases', 'Phases', '◧'),
    item('stats', 'Stats', '▤'),
    item('settings', 'Settings', '⚙'),
  ]);
}

function phaseColor(phase) {
  return { Menstrual: '#e0567f', Follicular: '#4fbf9f', Fertile: '#f4b8d0', Luteal: '#c9a7ff' }[phase] || '#a99fc4';
}

// phase ring (SVG) — shows the cycle as a donut with menstrual/follicular/fertile/luteal arcs
// and a marker at today. Built as an SVG string (createElement doesn't do SVG namespaces).
function phaseRing(c) {
  const p = c.prediction;
  const L = Math.max(p.avgLen || 28, 20);
  const day = Math.min(Math.max(p.cycleDay, 1), L);
  const periodLen = cycleStats(_data.cycles).avgPeriod || 5;

  // The ring reads the SAME effective window as the banner/calendar (calendar + temp + mucus),
  // and the fertile arc is allowed to overlap the period — short cycles open the window while
  // she's still bleeding, and the ring must not paint those days as merely "menstrual".
  let fS = null, fE = null;
  if (c.eff && p.lastStart) {
    fS = diffDays(p.lastStart, c.eff.fertileStart) + 1;
    fE = c.mode === 'avoid'
      ? diffDays(p.lastStart, c.eff.safeAgain)         // last NOT-safe day
      : diffDays(p.lastStart, c.eff.fertileEnd) + 1;
    fE = Math.min(fE, L);
    if (fS > fE) { fS = null; fE = null; }
  }
  const menEnd = Math.min(periodLen, L);
  const COL = { men: '#e0567f', fol: '#4fbf9f', fer: '#f4b8d0', lut: '#6b5a8f' };
  const phaseOf = (d) => {
    if (fS != null && d >= fS && d <= fE) return 'fer'; // risk wins over the period colour, like the banner
    if (d <= menEnd) return 'men';
    if (fS == null || d < fS) return 'fol';
    return 'lut';
  };
  const segs = [];
  for (let d = 1; d <= L; d++) {
    const k = phaseOf(d);
    if (segs.length && segs[segs.length - 1].k === k) segs[segs.length - 1].d1 = d;
    else segs.push({ k, d0: d, d1: d, c: COL[k] });
  }

  const cx = 90, cy = 90, r = 72, sw = 15;
  const polar = (ang) => { const a = (ang - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const arc = (a0, a1, col) => {
    if (a1 - a0 >= 359.9) a1 = a0 + 359.9;
    const [x0, y0] = polar(a0), [x1, y1] = polar(a1);
    const large = (a1 - a0) <= 180 ? 0 : 1;
    return `<path d="M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}" stroke="${col}" stroke-width="${sw}" fill="none"/>`;
  };
  const paths = segs.filter(s => s.d1 >= s.d0)
    .map(s => arc((s.d0 - 1) / L * 360, s.d1 / L * 360, s.c)).join('');
  const [mx, my] = polar((day - 0.5) / L * 360);

  const inFertile = fS != null && day >= fS && day <= fE;
  let phase = 'Luteal';
  if (inFertile) phase = 'Fertile';
  else if (c.activePeriod || day <= menEnd) phase = 'Menstrual';
  else if (fS == null || day < fS) phase = 'Follicular';

  const svg = `<svg viewBox="0 0 180 180" width="150" height="150" role="img" aria-label="Cycle phase">
    <circle cx="90" cy="90" r="72" stroke="#2a2140" stroke-width="15" fill="none"/>
    ${paths}
    <circle cx="${mx}" cy="${my}" r="8" fill="#ffffff" stroke="#171225" stroke-width="3"/>
    <text x="90" y="82" text-anchor="middle" fill="#ece7f7" font-size="34" font-weight="700">${day}</text>
    <text x="90" y="99" text-anchor="middle" fill="#a99fc4" font-size="11" letter-spacing="1">CYCLE DAY</text>
    <text x="90" y="116" text-anchor="middle" fill="${phaseColor(phase)}" font-size="12" font-weight="600" letter-spacing="1">${phase.toUpperCase()}</text>
  </svg>`;
  return el('div', { class: 'ring', html: svg });
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
      el('p', { text: 'Welcome. Log the first day of the most recent period to start predictions.' }),
    ]));
  } else {
    // prediction summary
    const summary = el('div', { class: 'card summary' });
    summary.appendChild(phaseRing(c));
    const untilTxt = p.daysUntil <= 0
      ? `Period expected around now (${prettyDate(p.nextStart)})`
      : `Next period in ~${p.daysUntil} days · around ${prettyDate(p.nextStart)}`;
    summary.appendChild(el('p', { class: 'muted', text: untilTxt }));
    summary.appendChild(el('p', { class: 'range', text: `Likely window: ${prettyDate(p.rangeStart)} – ${prettyDate(p.rangeEnd)}` }));
    if (p.state === 'learning')
      summary.appendChild(el('p', { class: 'learning', text: 'Still learning this cycle — predictions get sharper after a couple of periods. Don’t rely on this yet.' }));
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

  // temperature (own box) + NFP chart
  wrap.appendChild(temperatureCard(today()));

  // period action
  // Two separate buttons that never trade places — the old single button flipped from
  // "ended" to "started" under the thumb, and a second tap logged a phantom new period.
  const active = activePeriod(_data.cycles);
  const startWhy = startBlockReason(today());
  const startBtn = el('button', { class: 'btn' + (active || startWhy ? '' : ' primary'), onclick: () => startPeriodGuarded(today()) }, ['Period started today']);
  if (active || startWhy) startBtn.disabled = true;
  const endBtn = el('button', { class: 'btn' + (active ? ' primary' : ''), onclick: () => active && _handlers.endPeriod(active.id, today()) }, ['Period ended today']);
  if (!active) endBtn.disabled = true;
  const periodBtn = el('div', { class: 'period-btns' }, [startBtn, endBtn]);
  const picker = el('input', { class: 'daypick', type: 'date', value: today(), max: today() });
  picker.addEventListener('change', () => { if (picker.value) openSheet(picker.value); });
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
    el('h3', { class: 'card-h', text: isToday ? 'Daily check-in' : 'Check-in · ' + prettyDate(dateStr) }),
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

  // menstrual flow (step 1) — single-select, left blank on non-period days
  card.appendChild(el('div', { class: 'field-label', text: 'Menstrual flow' }));
  const frow = el('div', { class: 'chips' });
  FLOW.forEach((f) => {
    const on = day.flow === f.key;
    frow.appendChild(el('button', { class: 'chip' + (on ? ' on' : ''),
      onclick: () => _handlers.setDay(dateStr, { flow: on ? null : f.key }) }, [f.label]));
  });
  card.appendChild(frow);

  // cervical mucus — sensation (felt) + characteristic (seen), for the NFP peak-day sign
  card.appendChild(el('div', { class: 'field-label', text: 'Mucus sensation' }));
  const srow = el('div', { class: 'chips' });
  MUCUS_SENSATION.forEach((m) => {
    const on = day.mucusSensation === m.key;
    srow.appendChild(el('button', { class: 'chip' + (on ? ' on' : ''),
      onclick: () => _handlers.setDay(dateStr, { mucusSensation: on ? null : m.key }) }, [m.label]));
  });
  card.appendChild(srow);
  card.appendChild(el('div', { class: 'field-label', text: 'Mucus characteristic' }));
  const crow = el('div', { class: 'chips' });
  MUCUS_CHAR.forEach((m) => {
    const on = day.mucusChar === m.key;
    crow.appendChild(el('button', { class: 'chip' + (on ? ' on' : ''),
      onclick: () => _handlers.setDay(dateStr, { mucusChar: on ? null : m.key }) }, [m.label]));
  });
  card.appendChild(crow);

  // temperature: for TODAY it lives in its own Temperature card; here (backfilling a past day) keep an inline field
  if (dateStr !== today()) {
    card.appendChild(el('div', { class: 'field-label', text: 'Morning temperature (optional)' }));
    const tempIn = el('input', { class: 'temp-in', type: 'number', step: '0.05', inputmode: 'decimal',
      placeholder: '°F  (right after waking)', value: day.tempF != null ? String(day.tempF) : '' });
    tempIn.addEventListener('change', () => {
      const v = parseFloat(tempIn.value);
      _handlers.setDay(dateStr, { tempF: Number.isFinite(v) ? Math.round(v * 100) / 100 : null });
    });
    card.appendChild(tempIn);
  }

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
    return el('p', { class: 'mood-hint', text: 'No clear mood pattern yet — moods look fairly even across the cycle so far. Keep logging.' });
  }
  const daysTxt = f.lowFrom === f.lowTo ? `${f.lowFrom} day` : `${f.lowFrom}–${f.lowTo} days`;
  const card = el('div', { class: 'card outlook' }, [el('h3', { class: 'card-h', text: 'Mood outlook' })]);
  card.appendChild(el('p', {
    text: `Mood tends to dip in the ${daysTxt} before the period` + (f.forecastText ? ` — this cycle around ${f.forecastText}.` : '.'),
  }));
  if (f.topSymptoms.length)
    card.appendChild(el('p', { class: 'muted small', text: `Often with: ${f.topSymptoms.join(', ')}.` }));
  card.appendChild(el('p', { class: 'muted small', text: f.sampleCycles < 2
    ? 'Early read from ~1 cycle — it sharpens with more logs. A pattern, not a certainty.'
    : `From ${f.sampleCycles} cycles of logs. A pattern, not a certainty.` }));
  return card;
}

// temperature card (own box) — enter temp → Submit → morphs into the NFP chart
function temperatureCard(dateStr) {
  const day = _data.days[dateStr] || {};
  const has = typeof day.tempF === 'number';
  const a = nfpAnalyze(_data.cycles, _data.days);
  const card = el('div', { class: 'card temp-card' }, [el('h3', { class: 'card-h', text: 'Temperature' })]);

  if (!has || view.tempEditing) {
    const input = el('input', { class: 'temp-in', type: 'number', step: '0.05', inputmode: 'decimal',
      placeholder: '°F  (right after waking)', value: has ? String(day.tempF) : '' });
    const submit = el('button', { class: 'btn primary', onclick: () => {
      const v = parseFloat(input.value);
      if (!Number.isFinite(v) || v < 90 || v > 105) { toast('Enter a temperature like 97.80'); return; }
      _handlers.setDay(dateStr, { tempF: Math.round(v * 100) / 100 });
      view.tempEditing = false;
      rerender();
    } }, ['Submit']);
    card.appendChild(el('div', { class: 'temp-entry' }, [input, submit]));
  } else {
    card.appendChild(el('div', { class: 'temp-today' }, [
      el('span', { text: `Today: ${day.tempF.toFixed(2)}°F` }),
      el('button', { class: 'linkbtn inline-edit', onclick: () => { view.tempEditing = true; rerender(); } }, ['edit']),
    ]));
  }

  if (a.series.length >= 3) {
    card.appendChild(temperatureChart(a));
    card.appendChild(nfpSummary(a));
  } else if (a.series.length >= 1) {
    card.appendChild(el('p', { class: 'muted small', text: `${a.series.length} temp${a.series.length > 1 ? 's' : ''} logged this cycle — a few more and the thermal-shift chart appears.` }));
  } else {
    card.appendChild(el('p', { class: 'muted small', text: 'Log a morning temperature each day to build the chart and confirm ovulation.' }));
  }

  // cervical-mucus peak day (compact) — logged in the check-in above
  const mp = mucusPeak(_data.cycles, _data.days);
  if (mp) {
    card.appendChild(el('p', { class: 'mucus-line', text: `Mucus peak day ${prettyDate(mp.peakDate)} — by the peak rule, likely infertile from ${prettyDate(mp.infertileFrom)}.` }));
  }
  return card;
}

function nfpSummary(a) {
  const box = el('div', { class: 'nfp-summary' });
  if (a.unreliable) {
    box.appendChild(el('p', { class: 'learning', text: `Temperatures are too erratic to confirm ovulation this cycle (${a.disturbedCount} of ${a.series.length} readings out of line). Take it at the same time each morning, before getting up.` }));
  } else if (a.hasShift && a.infertileFrom) {
    box.appendChild(el('p', { class: 'confirm-note', text: `✓ Thermal shift confirmed. Est. ovulation ${prettyDate(a.ovulationEst)}; post-ovulation (infertile) phase since ${prettyDate(a.infertileFrom)}.` }));
  } else if (a.hasShift && a.tentative) {
    box.appendChild(el('p', { class: 'learning', text: `A temperature rise has begun (est. ovulation ~${prettyDate(a.ovulationEst)}) — waiting for one more high reading to confirm.` }));
  } else {
    box.appendChild(el('p', { class: 'muted small', text: 'No thermal shift detected yet this cycle.' }));
  }
  return box;
}

// SVG BBT chart with coverline (LTL), thermal-shift points, est. ovulation, infertile-phase shading
function temperatureChart(a) {
  const s = a.series, n = s.length;
  const W = 320, H = 176, padL = 6, padR = 6, padT = 16, padB = 18;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const temps = s.map((p) => p.t).concat(a.coverline != null ? [a.coverline] : []);
  let tmin = Math.min(...temps), tmax = Math.max(...temps);
  if (tmax - tmin < 0.6) { const mid = (tmax + tmin) / 2; tmin = mid - 0.4; tmax = mid + 0.4; }
  tmin -= 0.15; tmax += 0.15;
  const x = (i) => n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
  const y = (t) => padT + (tmax - t) / (tmax - tmin) * plotH;

  const infertileIdx = a.infertileFrom ? s.findIndex((p) => p.date === a.infertileFrom) : -1;
  const ovIdx = a.ovulationEst ? s.findIndex((p) => p.date === a.ovulationEst) : -1;
  const shiftSet = new Set(a.shiftDays);

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Temperature chart">`;
  if (infertileIdx >= 0) {
    const x0 = x(infertileIdx);
    svg += `<rect x="${x0.toFixed(1)}" y="${padT}" width="${(W - padR - x0).toFixed(1)}" height="${plotH}" fill="rgba(79,191,159,0.13)"/>`;
  }
  if (a.coverline != null) {
    const cy = y(a.coverline);
    svg += `<line x1="${padL}" y1="${cy.toFixed(1)}" x2="${W - padR}" y2="${cy.toFixed(1)}" stroke="#c9a7ff" stroke-width="1.4" stroke-dasharray="4 3"/>`;
    svg += `<text x="${W - padR}" y="${(cy - 4).toFixed(1)}" text-anchor="end" fill="#c9a7ff" font-size="10">LTL ${a.coverline.toFixed(2)}</text>`;
  }
  if (ovIdx >= 0) {
    const ox = x(ovIdx);
    svg += `<line x1="${ox.toFixed(1)}" y1="${padT}" x2="${ox.toFixed(1)}" y2="${padT + plotH}" stroke="#f4b8d0" stroke-width="1" stroke-dasharray="2 2"/>`;
    svg += `<text x="${ox.toFixed(1)}" y="${(padT - 4).toFixed(1)}" text-anchor="middle" fill="#f4b8d0" font-size="9">ovul?</text>`;
  }
  const line = s.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.t).toFixed(1)}`).join(' ');
  svg += `<path d="${line}" fill="none" stroke="#7c6fa8" stroke-width="1.5"/>`;
  s.forEach((p, i) => {
    let fill = '#a99fc4';
    if (shiftSet.has(p.date)) fill = '#c9a7ff';
    if (infertileIdx >= 0 && i >= infertileIdx) fill = '#4fbf9f';
    if (p.disturbed) { // disturbed value — hollow, excluded from the rules
      svg += `<circle cx="${x(i).toFixed(1)}" cy="${y(p.t).toFixed(1)}" r="3.2" fill="none" stroke="#a99fc4" stroke-width="1.2"/>`;
      return;
    }
    svg += `<circle cx="${x(i).toFixed(1)}" cy="${y(p.t).toFixed(1)}" r="3.2" fill="${fill}"/>`;
  });
  const labels = n <= 1 ? [0] : [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  labels.forEach((i) => {
    svg += `<text x="${x(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" fill="#a99fc4" font-size="9">d${s[i].cycleDay}</text>`;
  });
  svg += `</svg>`;
  return el('div', { class: 'temp-chart', html: svg });
}

// =================== PHASES (the three phases, read the way the paper chart reads them) ===================
// One CYCLE per page: all three phases on the one chart, sized to fit the width so no phase
// is ever split across a scroll. The picker at the top pages to the next cycle.
// Phase 1 blue, Phase 2 pink (the fertile one, the one they act on), Phase 3 green.
const PHASE_COL = { 1: '#6fb3d6', 2: '#e5679a', 3: '#4fbf9f' };
const PHASE_SUB = { 1: 'Non-fertile', 2: 'Fertile', 3: 'Non-fertile' };
const DOW = ['s', 'm', 't', 'w', 't', 'f', 's'];

// The day span of each phase within the cycle.
function phaseSpans(a) {
  const p2End = a.p3StartDay != null ? a.p3StartDay - 1 : a.lastDay;
  return {
    1: { d0: 1, d1: a.p1EndDay, open: a.p1EndDay >= 1 },
    2: { d0: a.p2StartDay, d1: p2End, open: p2End >= a.p2StartDay },
    3: { d0: a.p3StartDay, d1: a.lastDay, open: a.p3StartDay != null },
  };
}

// A mucus symbol drawn as real geometry, so it centres exactly on its column.
// Font glyphs for these carry their own side bearings and sat off by a pixel or two.
function mucusMark(cx, cy, kind, r) {
  const col = kind === 'peak' ? '#f4b8d0' : kind === 'some' ? '#d6a8c8' : '#8d84a8';
  const w = r < 3.4 ? 1.1 : 1.4;
  let s = `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
  if (kind === 'some' || kind === 'peak') {
    s += `<line x1="${(cx - r).toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + r).toFixed(1)}" y2="${cy.toFixed(1)}" stroke="${col}" stroke-width="${w}"/>`;
  }
  if (kind === 'peak') {
    s += `<line x1="${cx.toFixed(1)}" y1="${(cy - r).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(cy + r).toFixed(1)}" stroke="${col}" stroke-width="${w}"/>`;
  }
  return s;
}
// Menstrual flow as drawn geometry (step 1), same reasoning as mucusMark: a font glyph
// carries its own side bearings and sits off-centre from its column. Heavy is solid,
// medium the cross the chart has always drawn, light one stroke, spotting a dot.
function flowMark(cx, cy, flow, r) {
  const col = '#e0567f', w = 1.5;
  const f = (n) => n.toFixed(1);
  if (flow === 'heavy')
    return `<rect x="${f(cx - r)}" y="${f(cy - r)}" width="${f(r * 2)}" height="${f(r * 2)}" fill="${col}"/>`;
  if (flow === 'light')
    return `<line x1="${f(cx - r)}" y1="${f(cy + r)}" x2="${f(cx + r)}" y2="${f(cy - r)}" stroke="${col}" stroke-width="${w}"/>`;
  if (flow === 'spotting')
    return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(Math.max(r * 0.45, 0.8))}" fill="${col}"/>`;
  return `<line x1="${f(cx - r)}" y1="${f(cy - r)}" x2="${f(cx + r)}" y2="${f(cy + r)}" stroke="${col}" stroke-width="${w}"/>`
       + `<line x1="${f(cx + r)}" y1="${f(cy - r)}" x2="${f(cx - r)}" y2="${f(cy + r)}" stroke="${col}" stroke-width="${w}"/>`;
}
function mucusKind(day) {
  if (!day) return null;
  if (isPeakMucus(day)) return 'peak';
  if (hasMucus(day)) return 'some';
  if (day.mucusSensation || day.mucusChar || day.mucus) return 'none';
  return null;
}

// The whole cycle on one chart, fitted to the width.
// Header rows carry the day OF THE PHASE, the date and the weekday.
function phaseChart(a, spans, cycle) {
  const L = Math.max(a.lastDay, 6);
  const VB = 310, gut = 22, padR = 4;
  const avail = VB - gut - padR;
  const dayW = avail / L;
  const xl = (d) => gut + (d - 1) * dayW;      // left edge of cycle day d
  const xc = (d) => gut + (d - 0.5) * dayW;    // centre of cycle day d
  // A horizontal 2-digit label needs about 1.2x its font size in width, so below ~13 units
  // per day the DAY and DATE rows run together. Turned upright their footprint is only the
  // cap height, which fits any density a real cycle produces.
  const rot = dayW < 13;
  const fRot = Math.min(Math.max(dayW * 1.15, 6), 9);   // never shrink below legible
  const fDay = rot ? fRot : 10, fDate = rot ? fRot : 9.5;
  const fDow = Math.min(Math.max(dayW * 0.85, 6), 8);
  const tight = rot;
  // A rotated label takes its cap height sideways, an upright one its whole string width.
  // When even that will not fit the column, label every Nth day rather than every day. The
  // whole cycle still sits in one view, which is the point, just with a sparser axis.
  const footprint = rot ? fRot * 0.8 : fDate * 1.35;
  const step = Math.max(1, Math.ceil(footprint / dayW));
  const labelled = (d) => (d - 1) % step === 0;
  const dotR = Math.min(Math.max(dayW * 0.2, 0.9), 4);
  const mucR = Math.min(Math.max(dayW * 0.3, 1.1), 6);
  // Step 9 numbers the Pre-Shift Six right to left, so the rightmost is 1. Six adjacent
  // one-digit labels only fit when the column is wide enough; below that the ring alone
  // marks them rather than smearing six numbers together (same rule as the header rows).
  const fPre = Math.min(Math.max(dayW * 0.75, 6), 8.5);
  const showPreNums = dayW >= fPre * 1.2;

  const hBand = 21, hDay = rot ? 19 : 13, hDate = rot ? 19 : 12, hDow = 11, hBleed = 9, hPlot = 178, hMuc = 20, hPeak = 16;
  const yBand = 2, yDay = yBand + hBand, yDate = yDay + hDay, yDow = yDate + hDate;
  const yBleed = yDow + hDow, yPlot = yBleed + hBleed, yMuc = yPlot + hPlot, yPeak = yMuc + hMuc;
  const H = yPeak + hPeak;

  const all = a.shift.series;
  const hasLtl = a.shift.ltl != null;
  let tmin, tmax;
  const temps = all.map((q) => q.t).concat(hasLtl ? [a.shift.ltl, a.shift.htl] : []);
  if (temps.length) { tmin = Math.min(...temps); tmax = Math.max(...temps); }
  else { tmin = 97.0; tmax = 98.6; }
  if (tmax - tmin < 0.8) { const mid = (tmax + tmin) / 2; tmin = mid - 0.5; tmax = mid + 0.5; }
  tmin -= 0.14; tmax += 0.14;
  const y = (t) => yPlot + (tmax - t) / (tmax - tmin) * hPlot;

  const byDay = {};
  all.forEach((q) => { byDay[q.cycleDay] = q; });
  const days = _data.days || {};
  const periodEnd = cycle && cycle.endDate ? cycle.endDate : null;
  // Step 12: the three (or, on a weak third, four) post-Peak temperatures above the LTL
  // that carried Phase 3. The rule engine already picks them; the paper chart circles them.
  const confirmSet = new Set((a.phase3.parts && a.phase3.parts.temps) || []);

  let g = `<svg viewBox="0 0 ${VB} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" `
        + `role="img" aria-label="Cycle chart, all three phases">`;

  // phase band across the top
  [1, 2, 3].forEach((p) => {
    const sp = spans[p];
    if (!sp.open) return;
    const x = xl(sp.d0), w = (sp.d1 - sp.d0 + 1) * dayW;
    g += `<rect x="${x.toFixed(1)}" y="${yBand}" width="${w.toFixed(1)}" height="${hBand - 4}" fill="${PHASE_COL[p]}" rx="2.5"/>`;
    const label = w >= 62 ? `PHASE ${p}` : w >= 26 ? `P${p}` : '';
    if (label) g += `<text x="${(x + w / 2).toFixed(1)}" y="${yBand + 11}" text-anchor="middle" fill="#141020" font-size="10.5" font-weight="700">${label}</text>`;
  });

  // plot ground, then the phase divider lines carried down through every row
  g += `<rect x="${gut}" y="${yPlot}" width="${(dayW * L).toFixed(1)}" height="${hPlot}" fill="#1b1430" rx="3"/>`;
  [2, 3].forEach((p) => {
    if (!spans[p].open) return;
    const x = xl(spans[p].d0);
    g += `<line x1="${x.toFixed(1)}" y1="${yDay}" x2="${x.toFixed(1)}" y2="${(yPeak + 12).toFixed(1)}" stroke="${PHASE_COL[p]}" stroke-width="1.3" opacity="0.75"/>`;
  });

  // LTL / HTL
  if (hasLtl) {
    const yL = y(a.shift.ltl), yH = y(a.shift.htl);
    g += `<rect x="${gut}" y="${yH.toFixed(1)}" width="${(dayW * L).toFixed(1)}" height="${(yL - yH).toFixed(1)}" fill="rgba(201,167,255,0.09)"/>`;
    g += `<line x1="${gut}" y1="${yL.toFixed(1)}" x2="${(gut + dayW * L).toFixed(1)}" y2="${yL.toFixed(1)}" stroke="#c9a7ff" stroke-width="1.3" stroke-dasharray="5 3"/>`;
    g += `<line x1="${gut}" y1="${yH.toFixed(1)}" x2="${(gut + dayW * L).toFixed(1)}" y2="${yH.toFixed(1)}" stroke="#f4b8d0" stroke-width="1.3" stroke-dasharray="5 3"/>`;
    g += `<text x="1" y="${(yL + 3).toFixed(1)}" fill="#c9a7ff" font-size="8.5" font-weight="700">LTL</text>`;
    g += `<text x="1" y="${(yL + 11).toFixed(1)}" fill="#c9a7ff" font-size="8">${a.shift.ltl.toFixed(2)}</text>`;
    g += `<text x="1" y="${(yH - 5).toFixed(1)}" fill="#f4b8d0" font-size="8.5" font-weight="700">HTL</text>`;
    g += `<text x="1" y="${(yH - 13).toFixed(1)}" fill="#f4b8d0" font-size="8">${a.shift.htl.toFixed(2)}</text>`;
  }

  // header rows: day of the phase, day of the month, weekday. Row labels sit in the gutter.
  const tick = (x, yc, txt, fill, size, weight) => {
    const w = weight ? ` font-weight="${weight}"` : '';
    return rot
      ? `<text x="${x.toFixed(1)}" y="${yc.toFixed(1)}" transform="rotate(-90 ${x.toFixed(1)} ${yc.toFixed(1)})" text-anchor="middle" dominant-baseline="central" fill="${fill}" font-size="${size}"${w}>${txt}</text>`
      : `<text x="${x.toFixed(1)}" y="${(yc + size * 0.36).toFixed(1)}" text-anchor="middle" fill="${fill}" font-size="${size}"${w}>${txt}</text>`;
  };
  g += `<text x="1" y="${(yDay + hDay / 2 + 2).toFixed(1)}" fill="#6f6790" font-size="6.5">DAY</text>`;
  g += `<text x="1" y="${(yDate + hDate / 2 + 2).toFixed(1)}" fill="#6f6790" font-size="6.5">DATE</text>`;
  for (let d = 1; d <= L; d++) {
    const p = phaseOfDay(d, a);
    const sp = spans[p];
    const date = addDaysStr(a.win.start, d - 1);
    const dt = parse(date);
    if (labelled(d)) {
      g += tick(xc(d), yDay + hDay / 2, d - sp.d0 + 1, PHASE_COL[p], fDay, 700);
      g += tick(xc(d), yDate + hDate / 2, dt.getDate(), '#ece7f7', fDate);
      g += `<text x="${xc(d).toFixed(1)}" y="${(yDow + 7).toFixed(1)}" text-anchor="middle" fill="#7a7296" font-size="${fDow}">${DOW[dt.getDay()]}</text>`;
      if (step > 1) g += `<line x1="${xc(d).toFixed(1)}" y1="${yPlot}" x2="${xc(d).toFixed(1)}" y2="${(yPlot + hPlot).toFixed(1)}" stroke="#2a2140" stroke-width="0.6"/>`;
    }
    // menstruation row (step 1): the logged flow when there is one, otherwise the cross the
    // period's own date range implies. A logged flow also makes isBleeding() true over in
    // phases.js, which keeps that day's mucus out of the Peak Day rules.
    const flow = (days[date] || {}).flow;
    const bleeding = flow ? flow !== 'none' : (periodEnd ? date <= periodEnd : d === 1);
    if (bleeding) g += flowMark(xc(d), yBleed + 4, flow, Math.min(dayW * 0.22, 3.2));
  }

  // temperature: unbroken runs only, so a day she did not chart leaves a real gap
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const dd = run.map((q, k) => `${k === 0 ? 'M' : 'L'} ${xc(q.cycleDay).toFixed(1)} ${y(q.t).toFixed(1)}`).join(' ');
      g += `<path d="${dd}" fill="none" stroke="#a294d4" stroke-width="1.8"/>`;
    }
    run = [];
  };
  for (let d = 1; d <= L; d++) { if (byDay[d]) run.push(byDay[d]); else flush(); }
  flush();
  for (let d = 1; d <= L; d++) {
    const q = byDay[d];
    if (!q) continue;
    const cx = xc(d), cy = y(q.t);
    if (q.disturbed) {
      g += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${dotR.toFixed(1)}" fill="#1b1430" stroke="#a99fc4" stroke-width="1.3"/>`;
      continue;
    }
    const preIdx = a.shift.preShiftSix.indexOf(q.date);
    const inPre = preIdx >= 0;
    if (inPre) g += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(dotR + 2.4).toFixed(1)}" fill="none" stroke="#c9a7ff" stroke-width="1.1"/>`;
    // step 12 — the temperatures that carried Phase 3, ringed in the HTL's colour
    if (confirmSet.has(q.date)) g += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(dotR + 2.4).toFixed(1)}" fill="none" stroke="#f4b8d0" stroke-width="1.3"/>`;
    const fill = inPre ? '#c9a7ff' : (a.p3StartDay != null && d >= a.p3StartDay ? '#4fbf9f' : '#ffffff');
    g += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${dotR.toFixed(1)}" fill="${fill}"/>`;
    // step 9 — number the Pre-Shift Six right to left, so the rightmost is 1
    if (inPre && showPreNums)
      g += `<text x="${cx.toFixed(1)}" y="${(cy - dotR - 5).toFixed(1)}" text-anchor="middle" fill="#c9a7ff" font-size="${fPre}" font-weight="700">${6 - preIdx}</text>`;
  }

  // mucus row, then Peak Day and the numbered drying-up days
  for (let d = 1; d <= L; d++) {
    const kind = mucusKind(days[addDaysStr(a.win.start, d - 1)]);
    if (kind) g += mucusMark(xc(d), yMuc + hMuc / 2, kind, mucR);
  }
  if (a.peak) {
    if (a.peak.cycleDay <= L) {
      g += `<text x="${xc(a.peak.cycleDay).toFixed(1)}" y="${(yPeak + 11).toFixed(1)}" text-anchor="middle" fill="#ffd76e" font-size="${tight ? 9.5 : 11}" font-weight="700">P</text>`;
    }
    a.peak.drying.forEach((date, k) => {
      const d = diffDays(a.win.start, date) + 1;
      if (d <= L) g += `<text x="${xc(d).toFixed(1)}" y="${(yPeak + 10).toFixed(1)}" text-anchor="middle" fill="#ffd76e" font-size="${tight ? 8 : 9.5}">${k + 1}</text>`;
    });
  }

  // today
  const td = diffDays(a.win.start, today()) + 1;
  if (td >= 1 && td <= L) {
    g += `<rect x="${xl(td).toFixed(1)}" y="${yPlot}" width="${dayW.toFixed(1)}" height="${hPlot}" fill="rgba(255,255,255,0.07)"/>`;
    g += `<line x1="${xc(td).toFixed(1)}" y1="${yDay}" x2="${xc(td).toFixed(1)}" y2="${(yPeak + 13).toFixed(1)}" stroke="#ffffff" stroke-width="1" stroke-dasharray="2 3" opacity="0.6"/>`;
  }

  g += `</svg>`;
  return el('div', { class: 'phase-chart', html: g });
}

function ruleRow(label, value, note) {
  return el('div', { class: 'rule-row' }, [
    el('div', { class: 'rule-label', text: label }),
    el('div', { class: 'rule-value', text: value }),
    note ? el('div', { class: 'rule-note', text: note }) : null,
  ]);
}

function viewPhases() {
  const wrap = el('div', {});
  wrap.appendChild(el('h2', { class: 'view-title', text: 'Phases' }));

  const wins = cycleWindows(_data.cycles);
  if (!wins.length) {
    wrap.appendChild(el('div', { class: 'card' }, [
      el('p', { class: 'muted', text: 'Log a period start and the three phases will chart themselves from there.' }),
    ]));
    return wrap;
  }
  const idx = Math.min(Math.max(view.phaseCycle == null ? wins.length - 1 : view.phaseCycle, 0), wins.length - 1);
  const a = analyzeCycle(wins, idx, _data.days);
  const win = wins[idx];
  const cycle = (_data.cycles || []).find((c) => c.startDate === win.start);
  const spans = phaseSpans(a);
  const todayDay = diffDays(win.start, today()) + 1;
  const isNow = todayDay >= 1 && todayDay <= a.lastDay;

  // one cycle per page
  wrap.appendChild(el('div', { class: 'cal-head' }, [
    el('button', { class: 'linkbtn', disabled: idx === 0 ? '' : null,
      onclick: () => { view.phaseCycle = idx - 1; rerender(); } }, ['‹']),
    el('div', { class: 'phase-head' }, [
      el('div', { class: 'phase-head-t', text: win.complete
        ? `${prettyDate(win.start)} to ${prettyDate(win.end)}`
        : `${prettyDate(win.start)}, in progress` }),
      el('div', { class: 'phase-head-s', text: win.complete
        ? `${win.len}-day cycle`
        : `cycle day ${a.lastDay}` }),
    ]),
    el('button', { class: 'linkbtn', disabled: idx === wins.length - 1 ? '' : null,
      onclick: () => { view.phaseCycle = idx + 1; rerender(); } }, ['›']),
  ]));

  const card = el('div', { class: 'card phase-card' });

  // where she is right now, said plainly, in phase terms
  if (isNow) {
    const p = phaseOfDay(todayDay, a);
    const sp = spans[p];
    card.appendChild(el('div', { class: 'phase-now', style: `border-color:${PHASE_COL[p]}` }, [
      el('span', { class: 'phase-dot', style: `background:${PHASE_COL[p]}` }),
      el('span', { class: 'phase-now-t', text: `Phase ${p}` }),
      el('span', { class: 'phase-now-s', text: `day ${todayDay - sp.d0 + 1}${sp.d1 >= sp.d0 && (p !== 2 || a.p3StartDay != null) ? ` of ${sp.d1 - sp.d0 + 1}` : ''}` }),
      el('span', { class: 'phase-now-d', text: prettyDate(today()) }),
    ]));
  }

  card.appendChild(phaseChart(a, spans, cycle));

  // one row per phase: dates and the day span
  const tbl = el('div', { class: 'phase-rows' });
  [1, 2, 3].forEach((p) => {
    const sp = spans[p];
    const open = sp.open;
    const from = open ? addDaysStr(win.start, sp.d0 - 1) : null;
    const to = open ? addDaysStr(win.start, sp.d1 - 1) : null;
    const n = open ? sp.d1 - sp.d0 + 1 : 0;
    tbl.appendChild(el('div', { class: 'phase-row' + (open ? '' : ' off') }, [
      el('span', { class: 'phase-dot', style: `background:${PHASE_COL[p]}` }),
      el('span', { class: 'pr-n', text: `Phase ${p}` }),
      el('span', { class: 'pr-sub', text: PHASE_SUB[p] }),
      el('span', { class: 'pr-when', text: open
        ? (n === 1 ? prettyDate(from) : `${prettyDate(from)} to ${prettyDate(to)}`)
        : (p === 3 ? 'not open yet' : 'no days') }),
      el('span', { class: 'pr-len', text: open ? plural(n, 'day') : '' }),
    ]));
  });
  card.appendChild(tbl);

  const key = el('div', { class: 'legend chart-key' });
  const keySvg = (inner) => el('span', { class: 'key-svg', html: `<svg viewBox="0 0 14 14" width="14" height="14">${inner}</svg>` });
  [['flow', 'Menstrual flow', '#e0567f'], ['mucus-none', 'No mucus', '#8d84a8'],
   ['mucus-some', 'Less fertile', '#d6a8c8'], ['mucus-peak', 'More fertile', '#f4b8d0'],
   ['P', 'Peak Day, then drying days 1 2 3', '#ffd76e'],
   ['ring', 'Pre-Shift Six, numbered 6 to 1', '#c9a7ff'],
   ['ring', 'The temperatures that confirmed Phase 3', '#f4b8d0']].forEach(([sym, label, c]) => {
    const mark = sym.startsWith('mucus-') ? keySvg(mucusMark(7, 7, sym.slice(6), 5))
      : sym === 'flow' ? keySvg(flowMark(7, 7, 'medium', 4.5))
      : sym === 'ring' ? keySvg(`<circle cx="7" cy="7" r="5" fill="none" stroke="${c}" stroke-width="1.3"/><circle cx="7" cy="7" r="2" fill="#ffffff"/>`)
      : el('span', { class: 'key-sym', style: `color:${c}`, text: sym });
    key.appendChild(el('div', { class: 'leg' }, [mark, el('span', { text: label })]));
  });
  card.appendChild(key);
  wrap.appendChild(card);

  // how this cycle was read
  const rules = el('div', { class: 'card' });
  rules.appendChild(el('p', { class: 'card-h', text: 'How this cycle was read' }));
  const d56 = a.phase1.day56, doer = a.phase1.doering;
  rules.appendChild(ruleRow(
    'End of Phase 1',
    a.p1EndDay >= 1 ? `Day ${a.p1EndDay}` : 'No infertile days',
    `By the ${a.phase1.rule}, the earliest of the rules that applied.`,
  ));
  rules.appendChild(ruleRow(
    'Day 5/6 rule', `Day ${d56.day}`,
    d56.basis === 0
      ? 'No completed cycles yet, so it holds at day 5.'
      : d56.all26
        ? `All ${d56.basis} prior ${d56.basis === 1 ? 'cycle' : 'cycles'} ran 26 days or longer, so day 6.`
        : `Not every one of the last ${d56.basis} cycles reached 26 days, so day 5.`,
  ));
  rules.appendChild(ruleRow(
    'Doering rule',
    doer.available ? `Day ${doer.day}` : 'Not available',
    doer.available
      ? `Earliest first day of temperature rise was day ${doer.earliestRiseDay}, minus 7.`
      : `Needs 6 cycles of temperature history. ${doer.cyclesWithRise} so far.`,
  ));
  rules.appendChild(ruleRow(
    'Mucus appeared',
    a.phase1.firstMucus ? `${prettyDate(a.phase1.firstMucus)}, day ${diffDays(win.start, a.phase1.firstMucus) + 1}` : 'Not charted',
    a.phase1.firstMucus ? 'Mucus ends Phase 1 whatever the day.' : null,
  ));
  rules.appendChild(ruleRow(
    'Peak Day',
    a.peak ? `${prettyDate(a.peak.date)}, day ${a.peak.cycleDay}` : 'Not charted',
    a.peak
      ? (a.peak.confirmed
        ? `Drying-up days 1, 2, 3 on ${a.peak.drying.map(prettyDate).join(', ')}.`
        : `${a.peak.drying.length} of 3 drying-up days charted so far.`)
      : 'The last day of more-fertile mucus. Without it the temperature rules carry the cycle.',
  ));
  rules.appendChild(ruleRow(
    'LTL and HTL',
    a.shift.ltl != null ? `${a.shift.ltl.toFixed(2)} and ${a.shift.htl.toFixed(2)} °F` : 'No shift found',
    a.shift.ltl != null
      ? `Highest of the Pre-Shift Six (${prettyDate(a.shift.preShiftSix[0])} to ${prettyDate(a.shift.preShiftSix[5])}), plus 0.4. Rise began ${prettyDate(a.shift.riseStart.date)}, day ${a.shift.riseStart.cycleDay}.`
      : 'Six low readings then three above them are what set the LTL.',
  ));
  rules.appendChild(ruleRow(
    'Start of Phase 3',
    a.phase3.start ? `Evening of ${prettyDate(a.phase3.start)}, day ${a.p3StartDay}` : 'Not confirmed',
    `${a.phase3.rule ? a.phase3.rule + '. ' : ''}${a.phase3.note}`,
  ));
  wrap.appendChild(rules);

  wrap.appendChild(el('p', { class: 'disclaimer',
    text: `Juno v${APP_VERSION} · Phase 3 opens in the EVENING of the day it is confirmed, so that whole day is not a Phase 3 day. Fertility awareness, not contraception.` }));
  return wrap;
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
      onclick: () => openSheet(ds),
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
  const onCloseBg = (e) => { if (e.target.classList.contains('sheet-bg')) overlayBack(); };
  const close = () => overlayBack();

  const actions = el('div', { class: 'sheet-actions' });
  actions.appendChild(el('button', { class: 'btn primary', onclick: () => { startPeriodGuarded(dateStr); close(); } }, ['Mark period start']));
  if (active)
    actions.appendChild(el('button', { class: 'btn', onclick: () => { _handlers.endPeriod(active.id, dateStr); close(); } }, ['Mark period end']));

  // delete a cycle that starts on this day
  const c = _data.cycles.find(x => x.startDate === dateStr);
  if (c)
    actions.appendChild(el('button', { class: 'btn danger', onclick: () => { _handlers.deleteCycle(c.id); close(); } }, ['Remove this period entry']));

  const handle = el('div', { class: 'sheet-drag' }, [
    el('div', { class: 'sheet-grab' }),
    el('h3', { text: parse(dateStr).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) }),
  ]);
  const body = el('div', { class: 'sheet-body' }, [
    actions,
    checkInCard(dateStr),
    el('button', { class: 'linkbtn', onclick: close }, ['Close']),
  ]);
  const sheetEl = el('div', { class: 'sheet' }, [handle, body]);
  attachSwipeDismiss(sheetEl, handle);
  return el('div', { class: 'sheet-bg', onclick: onCloseBg }, [sheetEl]);
}

// =================== STATS ===================
function viewStats() {
  const s = cycleStats(_data.cycles);
  const wrap = el('div', {});
  wrap.appendChild(el('h2', { class: 'view-title', text: 'Stats' }));

  if (!s.hasData) {
    wrap.appendChild(el('div', { class: 'card' }, [
      el('p', { class: 'muted', text: 'Once a couple of periods are logged, cycle stats show up here — average length, range, and how regular the cycle is.' }),
    ]));
  } else {
    const stat = (label, val, sub) => el('div', { class: 'statcard' }, [
      el('div', { class: 'statval', text: val }),
      el('div', { class: 'statlabel', text: label }),
      sub ? el('div', { class: 'muted small', text: sub }) : null,
    ]);
    const grid = el('div', { class: 'stat-grid' });
    grid.appendChild(stat('Avg cycle', s.avgCycle + ' d', `range ${s.minCycle}–${s.maxCycle} d`));
    if (s.avgPeriod) grid.appendChild(stat('Avg period', s.avgPeriod + ' d'));
    grid.appendChild(stat('Cycles tracked', String(s.cyclesLogged)));
    if (s.regularity) grid.appendChild(stat('Regularity', s.regularity, `±${s.variability} d`));
    wrap.appendChild(grid);

    if (s.recent.length) {
      const list = el('div', { class: 'card' }, [el('h3', { class: 'card-h', text: 'Recent cycles' })]);
      s.recent.forEach(r => list.appendChild(el('div', { class: 'cyc-row' }, [
        el('span', { text: prettyDate(r.start) }),
        el('span', { class: 'muted', text: r.length + ' days' }),
      ])));
      wrap.appendChild(list);
    }
  }

  // every logged period — view + repair (end one that's still open, delete a duplicate)
  const periods = (_data.cycles || []).filter((c) => c.startDate)
    .slice().sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  if (periods.length) {
    const card = el('div', { class: 'card' }, [el('h3', { class: 'card-h', text: 'Logged periods' })]);
    periods.forEach((c) => {
      const block = el('div', { class: 'per-row' });
      block.appendChild(el('div', { class: 'cyc-row' }, [
        el('span', { text: prettyDate(c.startDate) + ' – ' + (c.endDate ? prettyDate(c.endDate) : 'ongoing') }),
        el('button', { class: 'linkbtn tiny danger-link', onclick: () => { if (window.confirm('Delete this period entry?')) _handlers.deleteCycle(c.id); } }, ['Delete']),
      ]));
      if (!c.endDate) {
        // pick the real end date — never assume "today" (an old unfinished entry would
        // otherwise become a months-long period)
        const endIn = el('input', { class: 'end-date', type: 'date', value: today(), min: c.startDate, max: today() });
        endIn.addEventListener('change', () => { if (endIn.value) _handlers.endPeriod(c.id, endIn.value); });
        block.appendChild(el('label', { class: 'end-line' }, [
          el('span', { class: 'muted small', text: 'Set end date' }), endIn,
        ]));
      }
      card.appendChild(block);
    });
    card.appendChild(el('p', { class: 'muted small', text: 'Fix a mis-logged period here — set the end date on one that’s still open, or delete a duplicate.' }));
    wrap.appendChild(card);
  }

  wrap.appendChild(el('p', { class: 'disclaimer', text: `Juno v${APP_VERSION}` }));
  return wrap;
}

// =================== NOTIFICATIONS ===================
function viewNotifications() {
  const s = _data.settings || {};
  const prefs = s.notifPrefs || {};
  const wrap = el('div', {});
  wrap.appendChild(el('div', { class: 'subhead' }, [
    el('button', { class: 'linkbtn back', onclick: () => overlayBack() }, ['‹ Settings']),
    el('h2', { class: 'view-title', text: 'Notifications' }),
  ]));

  // this device (permission + enable)
  const perm = permissionState();
  const enableCard = el('div', { class: 'card' }, [el('h3', { class: 'card-h', text: 'This device' })]);
  if (!pushConfigured()) {
    enableCard.appendChild(el('p', { class: 'muted small', text: 'Push isn’t configured for this app yet.' }));
  } else if (perm === 'granted') {
    enableCard.appendChild(el('p', { class: 'confirm-note', text: '✓ Notifications are on for this phone.' }));
    enableCard.appendChild(el('button', { class: 'btn', onclick: async () => {
      try { await enableNotifications(); toast('Refreshed on this phone.'); } catch (e) { toast(e?.message || 'Error'); }
    } }, ['Refresh this phone']));
  } else {
    enableCard.appendChild(el('p', { class: 'muted small', text: 'Turn notifications on for this phone (do it on each of your phones). iPhone: install to the Home Screen first.' }));
    enableCard.appendChild(el('button', { class: 'btn primary', onclick: async () => {
      try { await enableNotifications(); _handlers.setSettings({ tz: tzName() }); toast('Enabled on this phone.'); rerender(); }
      catch (e) { toast(e?.message || 'Could not enable notifications.'); }
    } }, ['Turn on notifications']));
  }
  wrap.appendChild(enableCard);

  // which notifications (digest toggles; default on)
  const toggle = (key, label) => el('div', { class: 'toggle-row' }, [
    el('div', { text: label }),
    el('button', { class: 'switch' + (prefs[key] !== false ? ' on' : ''), onclick: () => setNotifPref(key, prefs[key] === false) }, [el('span', { class: 'knob' })]),
  ]);
  wrap.appendChild(el('div', { class: 'card' }, [
    el('h3', { class: 'card-h', text: 'Which notifications' }),
    toggle('period', 'Period in ~5 days'),
    toggle('redlight', 'Red light — fertile window opens'),
    toggle('greenlight', 'Green light — safe again'),
    toggle('mooddip', 'Incoming mood dip'),
  ]));

  // daily temperature reminder (off by default; has a time)
  const tempOn = prefs.temp === true;
  const tr = s.tempReminder || {};
  const trCard = el('div', { class: 'card' }, [
    el('h3', { class: 'card-h', text: 'Temperature reminder' }),
    el('div', { class: 'toggle-row' }, [
      el('div', {}, [el('div', { text: 'Daily temperature reminder' }), el('div', { class: 'muted small', text: 'A morning nudge at the time you pick.' })]),
      el('button', { class: 'switch' + (tempOn ? ' on' : ''), onclick: () => setNotifPref('temp', !tempOn) }, [el('span', { class: 'knob' })]),
    ]),
  ]);
  if (tempOn) {
    const timeIn = el('input', { class: 'time-in', type: 'time', value: tr.time || '06:30' });
    timeIn.addEventListener('change', () => { if (timeIn.value) _handlers.setSettings({ tempReminder: { time: timeIn.value }, tz: tzName() }); });
    trCard.appendChild(el('div', { class: 'inline' }, [el('span', { class: 'muted small', text: 'Remind at' }), timeIn]));
    trCard.appendChild(el('p', { class: 'muted small', text: 'Fires within ~15 min of this time. Needs notifications on for this phone.' }));
  }
  wrap.appendChild(trCard);

  wrap.appendChild(el('p', { class: 'disclaimer', text: 'Notifications come from a daily cloud check of the logged data.' }));
  return wrap;
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
    el('p', { class: 'muted small', text: 'Used for predictions until Juno has logged a couple of cycles.' }),
    el('div', { class: 'inline' }, [lenIn, el('span', { class: 'muted', text: 'days' })]),
  ]));

  // notifications → its own screen
  wrap.appendChild(el('div', { class: 'card' }, [
    el('button', { class: 'btn row-btn', onclick: () => { view.tab = 'notifications'; pushBackTrap(); rerender(); } }, ['Notifications  ›']),
  ]));

  wrap.appendChild(el('div', { class: 'card' }, [
    el('h3', { class: 'card-h', text: 'Your data' }),
    el('p', { class: 'muted small', text: 'Download everything (periods, temperatures, mucus, moods, settings) as a backup file.' }),
    el('button', { class: 'btn', onclick: () => downloadData() }, ['Download my data']),
  ]));

  wrap.appendChild(el('div', { class: 'card' }, [
    el('h3', { class: 'card-h', text: 'App version' }),
    el('p', { class: 'muted small', text: `Running v${APP_VERSION}. If the app looks out of date, this throws away the stored copy and reloads a fresh one. Your logs live in the cloud and are not touched.` }),
    el('button', { class: 'btn', onclick: () => forceUpdate() }, ['Reload the app']),
  ]));

  wrap.appendChild(el('div', { class: 'card' }, [
    el('button', { class: 'btn', onclick: () => _handlers.logout() }, ['Sign out']),
  ]));

  wrap.appendChild(el('p', { class: 'disclaimer', text: `Juno v${APP_VERSION} · Not medical advice. Fertility guidance is awareness, not contraception.` }));
  return wrap;
}
