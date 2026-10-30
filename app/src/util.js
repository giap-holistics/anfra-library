// Small shared helpers: math, easing, formatting, DOM lookup, and the page-owned clock.

/** @param {number} x @param {number} [a] @param {number} [b] @returns {number} */
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
/** @param {number} a @param {number} b @param {number} f @returns {number} */
export const lerp = (a, b, f) => a + (b - a) * f;
/** In-out cubic, used for every dolly. @param {number} x @returns {number} */
export const ease = (x) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** Arrival with overshoot. @param {number} x @param {number} [k] @returns {number} */
export const outBack = (x, k = 1.6) => {
  x = clamp(x) - 1;
  return 1 + (k + 1) * x * x * x + k * x * x;
};
/** Damped overshoot for shelves refilling. @param {number} x @returns {number} */
export const settle = (x) => {
  x = clamp(x);
  return x >= 1 ? 1 : 1 - Math.cos(x * Math.PI * 2.5) * Math.exp(-5.5 * x) * (1 - x);
};
/** Smoothstep. @param {number} x @returns {number} */
export const sm = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};

/** A seeded LCG; each call site keeps its own so sequences stay independent. @param {number} seed @returns {() => number} */
export function lcg(seed) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** @param {number} v @returns {string} */
export const fmtMoney = (v) =>
  v >= 1e6
    ? '$' + (v / 1e6).toFixed(2) + 'M'
    : v >= 1e3
      ? '$' + (v / 1e3).toFixed(1) + 'k'
      : '$' + v.toFixed(0);
/** @param {number} v @returns {string} */
export const fmtInt = (v) => Math.round(v).toLocaleString('en-US');
/** Signed percentage. @param {number} v @returns {string} */
export const fmtPct = (v) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
/** @param {number} v @returns {string} */
export const pct = (v) => (v * 100).toFixed(1) + '%';
/** @param {number} d @returns {'up'|'dn'} */
export const dcls = (d) => (d >= 0 ? 'up' : 'dn');
/** @param {string} s @returns {string} */
export const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c);

/** Required element lookup: throws instead of handing back null. @param {string} sel @returns {HTMLElement} */
export function $(sel) {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`missing element ${sel}`);
  return el;
}
/** innerHTML only when it changed (keeps hover/animation state). @param {HTMLElement} el @param {string} s */
export function html(el, s) {
  if (el.dataset.h !== s) {
    el.dataset.h = s;
    el.innerHTML = s;
  }
}
/** @param {Element} el @returns {HTMLElement[]} */
export const kids = (el) => /** @type {HTMLElement[]} */ ([...el.children]);

/**
 * The page owns its clock. Normally requestAnimationFrame advances it by real elapsed time; once a
 * driver calls `tick(dt)` the clock goes manual and only `tick` moves it, so frames are deterministic.
 */
export const clock = {
  /** seconds since start, page time */
  t: 0,
  /** true once a driver has taken over */
  manual: false,
};
