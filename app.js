// Juno — app entry. Auth gate → live-synced app. No build step (ES modules on GitHub Pages).
import {
  onAuth, subscribe, signIn, signUp, logout,
  startPeriod, endPeriod, deleteCycle, setDay, setSettings,
} from './js/store.js';
import { renderAuth, mountApp, updateData } from './js/ui.js';

const root = document.getElementById('app');
let unsub = null, mounted = false;

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
const wrap = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e?.message || 'Something went wrong'); } };
const handlers = {
  startPeriod: wrap(startPeriod), endPeriod: wrap(endPeriod), deleteCycle: wrap(deleteCycle),
  setDay: wrap(setDay), setSettings: wrap(setSettings), logout: wrap(logout),
};

onAuth((user) => {
  if (unsub) { unsub(); unsub = null; }
  mounted = false;
  root.innerHTML = '';
  if (!user) {
    renderAuth(root, {
      onSubmit: (email, pw, creating) => creating ? signUp(email, pw) : signIn(email, pw),
    });
    return;
  }
  unsub = subscribe((data) => {
    if (!mounted) { mountApp(root, data, handlers); mounted = true; }
    else updateData(data);
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
