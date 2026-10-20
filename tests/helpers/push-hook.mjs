// A module-resolution hook (node:module, stdlib — no dependency) that swaps js/push.js for
// a stub while the tests import the REAL js/ui.js.
//
// Why a hook instead of copying js/ somewhere and editing the copy: a copy drifts. The point
// of this suite is that it runs against the shipped files, so the only thing it is allowed to
// replace is the one module Node physically cannot load — push.js, which statically imports
// the Firebase messaging SDK over https.
//
// Runs on the loader thread, so it shares nothing with the test process.
const stub = new URL('./push-stub.mjs', import.meta.url).href;

export async function resolve(specifier, context, next) {
  // The parent URL carries a cache-busting query when dom.mjs asks for a fresh ui.js, so
  // match on the path rather than the whole URL.
  if (specifier === './push.js' && (context.parentURL || '').includes('/js/ui.js')) {
    return { url: stub, shortCircuit: true, format: 'module' };
  }
  return next(specifier, context);
}
