/* A tiny stand-in for the browser, just enough to run js/game (the browser shell) in Node. Not a test file itself. */
const noop = () => {};
export function installFakeDom() {
  const made = [], byId = {}, docHandlers = {};
  /* Like a real canvas, drawImage needs a canvas or image, and drawing calls reject undefined coordinates. */
  const ctx2d = () => new Proxy({}, {
    get: (t, k) => {
      if (k === 'drawImage') return (img, ...nums) => {
        if (!img || typeof img !== 'object' || !('width' in img)) throw new TypeError("Failed to execute 'drawImage': the image argument is not a canvas or image");
        if (nums.some(n => typeof n !== 'number' || Number.isNaN(n))) throw new TypeError('drawImage: bad coordinates');
      };
      if (['arc', 'moveTo', 'lineTo', 'fillRect', 'strokeRect', 'setTransform'].includes(k)) return (...nums) => {
        if (nums.slice(0, 4).some(n => typeof n !== 'number')) throw new TypeError(k + ': coordinates must be numbers');
      };
      return noop;
    },
    set: () => true
  });
  function el(tag) {
    const e = {
      tag, style: {}, attrs: {}, children: [], hs: {}, hidden: false, disabled: false, value: '', className: '', _text: '', _cls: new Set(),
      classList: { toggle: (c, on) => { const want = on === undefined ? !e._cls.has(c) : !!on; if (want) e._cls.add(c); else e._cls.delete(c); return want; }, add: c => e._cls.add(c), remove: c => e._cls.delete(c), contains: c => e._cls.has(c) },
      append(...a) { for (const x of a) if (typeof x === 'object') e.children.push(x); },
      addEventListener(ev, fn) { (e.hs[ev] ||= []).push(fn); },
      fire(ev, data = {}) { for (const fn of e.hs[ev] || []) fn(data); },
      setAttribute(k, v) { e.attrs[k] = v; }, getAttribute: k => e.attrs[k] ?? null, closest: () => null, focus: noop,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 400, bottom: 400 }), getContext: ctx2d,
      set textContent(v) { e._text = String(v); if (v === '') e.children.length = 0; }, get textContent() { return e._text; }
    };
    made.push(e); return e;
  }
  let clock = 0, rafCb = null;
  globalThis.document = {
    hidden: false, body: el('body'), head: el('head'),
    getElementById: id => byId[id] || (byId[id] = Object.assign(el('div'), { id })),
    createElement: el, createElementNS: (ns, t) => el(t), querySelectorAll: () => [],
    addEventListener: (ev, fn) => { docHandlers[ev] = fn; }
  };
  globalThis.window = { innerWidth: 1280, innerHeight: 800 };
  globalThis.addEventListener = noop;
  globalThis.requestAnimationFrame = cb => { rafCb = cb; return 1; };
  globalThis.cancelAnimationFrame = noop;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
  const frame = (ms = 1000 / 60) => { clock += ms; const cb = rafCb; rafCb = null; if (cb) cb(clock); };
  return {
    byId, made, docHandlers, frame,
    frames: (n, ms) => { for (let i = 0; i < n; i++) frame(ms); },
    advanceClock: ms => { clock += ms; },
    button: text => [...made].reverse().find(e => e.tag === 'button' && e._text.startsWith(text)),
    heroButton: i => made.find(e => e.id === 't' + i)
  };
}
