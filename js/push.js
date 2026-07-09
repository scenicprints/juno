// Juno — client push registration (Firebase Cloud Messaging, web).
// The daily GitHub Action sends notifications to tokens saved here. Background display is
// handled by firebase.messaging() inside sw.js; this module gets the token + foreground display.
import { app } from './firebase.js';
import { getMessaging, getToken, onMessage, isSupported }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
import { saveToken } from './store.js';

// Firebase → Project settings → Cloud Messaging → Web configuration → "Web Push certificates"
// → Generate key pair → paste the public key string here.
export const VAPID_KEY = 'PASTE_WEB_PUSH_PUBLIC_KEY_HERE';

export function pushConfigured() { return VAPID_KEY && !VAPID_KEY.startsWith('PASTE'); }
export function permissionState() {
  return (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
}
async function supported() {
  try { return ('Notification' in self) && (await isSupported()); } catch { return false; }
}

export async function enableNotifications() {
  if (!pushConfigured()) throw new Error('Notifications aren’t configured yet (the web-push key is missing).');
  if (!(await supported())) throw new Error('This browser can’t do web notifications. On iPhone, install Juno to the Home Screen first, then open it and try again.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission was not granted.');

  const reg = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) throw new Error('Could not obtain a notification token.');
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
