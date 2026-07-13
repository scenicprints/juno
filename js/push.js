// Juno — client push registration (Firebase Cloud Messaging, web).
// The daily GitHub Action sends notifications to tokens saved here. Background display is
// handled by firebase.messaging() inside sw.js; this module gets the token + foreground display.
import { app } from './firebase.js';
import { getMessaging, getToken, onMessage, isSupported }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
import { saveToken } from './store.js';

// Firebase → Project settings → Cloud Messaging → Web configuration → "Web Push certificates"
// → Generate key pair → paste the public key string here.
export const VAPID_KEY = 'BJo3l1gfeKqiwMgQMbsZYt9ZRm4yaBkXT_VspHrhlxBt68lzsr97MRP88Gqk1tElfhuKwFtJlmCk1kSe4eKD9CI';

export function pushConfigured() { return VAPID_KEY && !VAPID_KEY.startsWith('PASTE'); }
export function permissionState() {
  return (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
}
async function supported() {
  try { return ('Notification' in self) && (await isSupported()); } catch { return false; }
}

// Ensure our service worker is registered AND has an ACTIVE worker before FCM subscribes.
// (Fixes "Subscription failed - no active Service Worker" — the SW can still be installing/
// activating right after an app update.)
async function activeRegistration() {
  let reg = (await navigator.serviceWorker.getRegistration()) || null;
  if (!reg) { try { reg = await navigator.serviceWorker.register('sw.js'); } catch (_) { reg = null; } }
  if (reg && reg.active) return reg;
  const worker = reg && (reg.installing || reg.waiting);
  if (worker) {
    await new Promise((resolve) => {
      const done = () => resolve();
      worker.addEventListener('statechange', () => { if (worker.state === 'activated') done(); });
      setTimeout(done, 6000); // safety timeout
    });
  }
  try { return await navigator.serviceWorker.ready; } catch (_) { return reg; }
}

export async function enableNotifications() {
  if (!pushConfigured()) throw new Error('Notifications aren’t configured yet (the web-push key is missing).');
  if (!(await supported())) throw new Error('This browser can’t do web notifications. On iPhone, install Juno to the Home Screen first, then open it from that icon and try again.');

  // Already blocked → requestPermission won't re-prompt; the user must un-block in settings.
  if (Notification.permission === 'denied') {
    throw new Error('Notifications are blocked for Juno. Open your browser’s site settings for this page (tap the icon left of the address bar → Permissions → Notifications → Allow), then try again.');
  }
  const perm = await Notification.requestPermission();
  if (perm === 'denied') {
    throw new Error('You tapped Block. To turn them on, allow notifications for Juno in your browser’s site settings, then try again.');
  }
  if (perm !== 'granted') {
    throw new Error('The permission prompt was dismissed — tap “Turn on notifications” again and choose Allow.');
  }

  const reg = await activeRegistration();
  if (!reg || !reg.active) {
    throw new Error('The app’s background service isn’t active yet. Fully close Juno (swipe it away), reopen it, and try again.');
  }
  const messaging = getMessaging(app);
  let token;
  try {
    token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  } catch (e) {
    const m = (e && e.message) ? e.message : String(e);
    throw new Error('Couldn’t register for notifications (' + m + '). Fully close Juno and reopen it, then try again.');
  }
  if (!token) throw new Error('Could not obtain a notification token. Fully close Juno and reopen it, then try again.');
  await saveToken(token);

  // if a message arrives while the app is open, show it too
  onMessage(messaging, (payload) => {
    const d = payload.data || {};
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(d.title || 'Juno', { body: d.body || '', icon: './icon.svg' }); } catch (_) {}
    }
  });
  return token;
}
