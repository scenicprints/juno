// Stands in for js/push.js under test. The real module statically imports the Firebase
// messaging SDK from the gstatic CDN, which Node cannot load (https: is not a resolvable
// module scheme), so importing js/ui.js for real would fail on that line alone.
// tests/helpers/push-hook.mjs redirects ui.js's './push.js' specifier here.
//
// Nothing under test reads these beyond deciding whether to draw the notifications card,
// so "not configured / unsupported" is the quiet answer.
export const VAPID_KEY = '';
export function pushConfigured() { return false; }
export function permissionState() { return 'unsupported'; }
export async function enableNotifications() { throw new Error('push is stubbed in tests'); }
export function onForegroundMessage() {}
