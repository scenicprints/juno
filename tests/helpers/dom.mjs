// A DOM small enough to read in one sitting, so the real js/ui.js can be mounted in Node and
// the SVG it builds can be read back out of the tree.
//
// ui.js builds the chart as a plain SVG string and hands it to el('div', { html }), so the
// assertions only need a node that remembers setAttribute / className / textContent /
// innerHTML / appendChild and the click handlers. There is no layout and no CSS here: this
// catches "the markup is wrong" (a NaN coordinate, a missing mark, a label that should have
// been thinned away), which is where the chart regressions actually lived. It cannot catch
// "the pixels look wrong" — that still needs a phone.
import { register } from 'node:module';

export class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this.handlers = {};
    this.style = {};
    this._text = '';
    this._html = '';
    this.classList = { contains: () => false, add() {}, remove() {} };
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(ev, fn) { this.handlers[ev] = fn; }
  removeEventListener() {}
  remove() {}
  appendChild(c) { this.children.push(c); return c; }
  set className(v) { this.attrs.class = v; }
  get className() { return this.attrs.class || ''; }
  set textContent(v) { this._text = v; }
  get textContent() { return this._text; }
  set innerHTML(v) { this._html = v; if (v === '') this.children = []; }
  get innerHTML() { return this._html; }
}

let installed = false;

// Install the globals ui.js touches, and the push.js stub, once per test process.
export function installDom() {
  if (installed) return;
  installed = true;
  register('./push-hook.mjs', import.meta.url);
  globalThis.document = {
    createElement: (t) => new Node(t),
    createTextNode: (t) => { const n = new Node('#text'); n._text = t; return n; },
    body: new Node('body'),
  };
  globalThis.window = { addEventListener() {}, confirm: () => false };
  globalThis.history = { pushState() {}, back() {} };
}

// Every node in the tree, parents before children.
export function walk(node, out = []) {
  out.push(node);
  for (const c of node.children || []) walk(c, out);
  return out;
}

const noop = async () => {};
export const HANDLERS = {
  startPeriod: noop, endPeriod: noop, deleteCycle: noop,
  setDay: noop, setSettings: noop, logout: noop,
};

// Mount the app, tap the Phases tab, and page back to the cycle under test.
//
// `back` is how many times to click the ‹ button. The picker opens on the NEWEST cycle, which
// is the one still in progress (its window runs to today), so a completed cycle is always at
// least one click back.
let mounts = 0;

export async function mountPhases(data, { back = 1 } = {}) {
  installDom();
  // ui.js keeps the open tab and the selected cycle in module-level `view` state, so a second
  // mount in the same process would inherit the first one's picker position. Importing it
  // under a fresh URL gives each mount a clean app, which keeps the tests order-independent.
  const { mountApp } = await import(`../../js/ui.js?mount=${++mounts}`);
  const root = new Node('div');
  mountApp(root, { settings: { mode: 'avoid' }, ready: true, ...data }, HANDLERS);

  const tabs = walk(root).filter((n) => n.tag === 'button' && n.className.includes('nav-item'));
  if (tabs.length !== 5) throw new Error(`expected 5 nav tabs, found ${tabs.length}`);
  tabs[2].handlers.click(); // Today, Calendar, Phases, Stats, Settings

  for (let i = 0; i < back; i++) {
    const prev = walk(root).find((n) => n.tag === 'button'
      && n.className.includes('linkbtn')
      && (n.children[0] || {})._text === '‹');
    if (!prev) throw new Error('no cycle-picker ‹ button on the Phases view');
    if (prev.attrs.disabled != null) break; // already on the oldest cycle
    prev.handlers.click();
  }

  const chart = walk(root).find((n) => n.className === 'phase-chart');
  if (!chart) throw new Error('no .phase-chart rendered');
  return { root, svg: chart.innerHTML, text: walk(root).map((n) => n._text).filter(Boolean) };
}

// All matches of a pattern in the rendered markup.
export function all(svg, re) { return [...svg.matchAll(re)]; }
