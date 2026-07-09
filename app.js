// Juno — entry point (ES module). Placeholder for v0.0.
// v0.1 will wire up: js/store.js (Firebase), js/predict.js, js/fertility.js, js/mood.js, js/ui.js.
// See ROADMAP.md for the plan. No build step — this file is served as-is by GitHub Pages.

const status = document.getElementById('status');
if (status) status.textContent = 'v0.0 · online home · ready for v0.1';
