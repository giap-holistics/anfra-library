// Pure geometry over the governed data: the treemap of rooms (footprint = share of revenue), eight
// bookcases per room, spine slots per shelf, small-room expansion, the price filter, camera poses.
import * as THREE from 'three';
import { BOOKS } from './data.js';
import { lerp, sm } from './util.js';

/** @typedef {import('./data.js').Axis} Axis */
/** @typedef {import('./data.js').Area} Area */
/** @typedef {import('./data.js').ShelfData} ShelfData */
/** @typedef {import('./data.js').AxisData} AxisData */
/** @typedef {{ x: number, z: number, w: number, d: number }} Rect */
/** @typedef {{ x: number, z: number, s: number, cw: number }} Case */
/** @typedef {ShelfData & { cnt: number }} Shelf */
/** @typedef {{ axis: Axis, ar: Area[], rects: Rect[], cases: Case[], meta: (Shelf|null)[], asg: Int16Array, slot: Int16Array }} Layout */
/** A camera pose: eye, target, fog near/far, fov, interior haze 0..1; `late` delays the rise when entering through an arch. @typedef {{ p: THREE.Vector3, q: THREE.Vector3, fn: number, ff: number, fov: number, hz: number, late?: number }} Pose */

export const W = 74,
  D = 50,
  CW = 5.6,
  PITCH = 0.13,
  CD = 1.0,
  PL = 0.26,
  BH = 1.45,
  HC = 7,
  RH = 4,
  DW = 3.2,
  AJ = DW / 2 + 0.4;

/** @typedef {{ i: number, v: number }} TmItem */
/** Binary-split treemap with 1.4-unit insets (2.8-unit corridors). @param {TmItem[]} items @param {number} x @param {number} z @param {number} w @param {number} d @param {Rect[]} out */
export function tm(items, x, z, w, d, out) {
  if (items.length === 1) {
    out[items[0].i] = { x: x + 1.4, z: z + 1.4, w: w - 2.8, d: d - 2.8 };
    return;
  }
  const tot = items.reduce((a, b) => a + b.v, 0);
  let acc = 0,
    k = 1,
    best = 1e9,
    ka = 0;
  for (let i = 1; i < items.length; i++) {
    acc += items[i - 1].v;
    const df = Math.abs(acc - tot / 2);
    if (df < best) {
      best = df;
      k = i;
      ka = acc;
    }
  }
  const f = ka / tot,
    A = items.slice(0, k),
    Bb = items.slice(k);
  if (w >= d) {
    tm(A, x, z, w * f, d, out);
    tm(Bb, x + w * f, z, w * (1 - f), d, out);
  } else {
    tm(A, x, z, w, d * f, out);
    tm(Bb, x, z + d * f, w, d * (1 - f), out);
  }
}
/** Eight bookcases in the best grid for the room. @param {Rect} r @returns {Case[]} */
export function casesIn(r) {
  const m = 1.0,
    fr = 2.4;
  /** @type {{ cols: number, rows: number, s: number }|null} */
  let best = null;
  for (const cols of [4, 2, 8, 1]) {
    const rows = 8 / cols,
      s0 = Math.min(9, (r.w - 2 * m) / (cols * CW * 1.12), (r.d - m - fr) / (rows * 3.1)),
      s = Math.min(1.45, s0);
    if (!best || s > best.s + 0.02) best = { cols, rows, s };
  }
  const { cols, rows, s } = /** @type {{ cols: number, rows: number, s: number }} */ (best),
    cw = (r.w - 2 * m) / cols,
    rh = (r.d - m - fr) / rows,
    out = [];
  for (let k = 0; k < 8; k++) {
    const c = k % cols,
      rw = Math.floor(k / cols);
    out.push({ x: r.x + m + (c + 0.5) * cw, z: r.z + r.d - fr - (rw + 0.5) * rh, s, cw });
  }
  return out;
}
const TMX = -W / 2 + 4.6,
  TMZ = -D / 2 + 2.6,
  TMW = W - 6.6,
  TMD = D - 5.2;

/** @param {AxisData} A @returns {Layout} */
export function layout(A) {
  const NB = BOOKS.length,
    ar = A.areas,
    /** @type {Rect[]} */ rects = [],
    /** @type {Case[]} */ cases = [],
    /** @type {(Shelf|null)[]} */ meta = [],
    asg = new Int16Array(NB).fill(-1),
    slot = new Int16Array(NB);
  tm(
    ar.map((a, i) => ({ i, v: a.share })),
    TMX,
    TMZ,
    TMW,
    TMD,
    rects,
  );
  ar.forEach((a, i) => {
    const cs = casesIn(rects[i]),
      mx = a.shelves.length ? a.shelves[0].share : 1;
    for (let k = 0; k < 8; k++) {
      const ci = i * 8 + k,
        s = a.shelves[k];
      cases[ci] = cs[k];
      if (!s) {
        meta[ci] = null;
        continue;
      }
      const sh = { ...s, cnt: Math.min(s.books.length, 40, Math.max(3, Math.round((40 * s.share) / mx))) };
      meta[ci] = sh;
      sh.books.slice(0, sh.cnt).forEach((b, j) => {
        asg[b.idx] = ci;
        slot[b.idx] = j;
      });
    }
  });
  return { axis: A.axis, ar, rects, cases, meta, asg, slot };
}

/** Small rooms grow on the way in: re-run the treemap with room i at >= 26% of the floor until its cases fit at normal scale. @type {Map<Layout, Map<number, Layout>>} */
const EXC = new Map();
/** @param {Layout} G @param {number} i @returns {Layout} */
export function expand(G, i) {
  let m = EXC.get(G);
  if (!m) {
    m = new Map();
    EXC.set(G, m);
  }
  const hit = m.get(i);
  if (hit) return hit;
  let r = G;
  if (G.cases[i * 8].s < 0.75) {
    const sh = G.ar.map((a) => a.share),
      tot = sh.reduce((a, b) => a + b, 0);
    for (let f = 0.26; f < 0.62; f += 0.04) {
      const rects = /** @type {Rect[]} */ ([]);
      const cases = /** @type {Case[]} */ ([]);
      tm(
        sh.map((v, j) => ({ i: j, v: j === i ? f * tot : (v * (1 - f) * tot) / (tot - sh[i]) })),
        TMX,
        TMZ,
        TMW,
        TMD,
        rects,
      );
      rects.forEach((q, j) => casesIn(q).forEach((c, n) => (cases[j * 8 + n] = c)));
      r = { ...G, rects, cases };
      if (cases[i * 8].s >= 1) break;
    }
  }
  m.set(i, r);
  return r;
}
/** Keep only the spines whose ISBN survived the price filter, re-packed left. @param {Layout} G @param {Set<string>|null} keep @returns {Layout} */
export function priceLayout(G, keep) {
  if (!keep) return G;
  const NB = BOOKS.length,
    asg = new Int16Array(NB).fill(-1),
    slot = new Int16Array(NB);
  G.meta.forEach((s, ci) => {
    if (!s) return;
    let j = 0;
    s.books.slice(0, s.cnt).forEach((b) => {
      if (keep.has(b.isbn)) {
        asg[b.idx] = ci;
        slot[b.idx] = j++;
      }
    });
  });
  return { ...G, asg, slot };
}

/* ---------- camera poses ---------- */
/** @param {number} x @param {number} y @param {number} z @returns {THREE.Vector3} */
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
/** Bird's-eye L0 pose. @param {number} az @param {number} [dp] @param {number} [zm] @returns {Pose} */
export function P0az(az, dp = 0, zm = 1) {
  const el = (55 * Math.PI) / 180 + dp,
    d = 112 * zm,
    q = v3(0, 0, 2.2);
  return {
    p: v3(q.x + d * Math.sin(az) * Math.cos(el), d * Math.sin(el), q.z + d * Math.cos(az) * Math.cos(el)),
    q,
    fn: 160,
    ff: 330,
    fov: 38,
    hz: 0,
  };
}
/** @typedef {{ Pa: Pose, Pc: Pose, P1: Pose, P2?: Pose }} Poses */
/** Approach (above the corridor), arch, L1 corner, and (for a case) the L2 shelf pose. @param {Layout} G @param {number} i @param {number} ci @returns {Poses} */
export function poses(G, i, ci) {
  const r = G.rects[i],
    fT = r.z + r.d,
    dX = r.x + r.w / 2;
  /** @type {Poses} */
  const o = {
    Pa: { p: v3(dX, 10, fT + 2.4), q: v3(dX, 0, fT - 4), fn: 30, ff: 120, fov: 50, hz: 0.4 },
    Pc: { p: v3(dX, 1.8, fT + 2.55), q: v3(dX, 1.6, fT - 6), fn: 9, ff: 50, fov: 66, hz: 1 },
    P1: {
      p: v3(r.x + r.w * 0.9, 5.8, fT - 0.3),
      q: v3(r.x + r.w * 0.35, 0, r.z + r.d * 0.5),
      fn: 10,
      ff: 52,
      fov: 66,
      hz: 1,
      late: 1,
    },
  };
  if (ci >= 0) {
    const c = G.cases[ci],
      m = G.meta[ci],
      fw = (m ? m.cnt : 40) * PITCH * c.s,
      dist = Math.min((fw + 2.2 * c.s) / (2 * Math.tan((19 * Math.PI) / 180) * 1.2), fT + 2.5 - c.z),
      x = c.x - (CW * c.s) / 2 + 0.22 * c.s + fw / 2;
    o.P2 = {
      p: v3(x, (PL + 0.75) * c.s, c.z + dist),
      q: v3(x, (PL + 0.42) * c.s, c.z),
      fn: 6,
      ff: 34,
      fov: 38,
      hz: 1,
    };
  }
  return o;
}
/** @param {Pose} P @returns {THREE.Vector3} */
export const fwdOf = (P) => v3(P.q.x - P.p.x, 0, P.q.z - P.p.z).normalize();
/** @param {Pose} P @param {THREE.Vector3} o @returns {Pose} */
export const panP = (P, o) => ({ ...P, p: P.p.clone().add(o), q: P.q.clone().add(o) });
/** Pose blend; a `late` target rises and slides only after clearing the arch. @param {Pose} A @param {Pose} Bp @param {number} f @returns {Pose} */
export function mixP(A, Bp, f) {
  const base = {
    q: A.q.clone().lerp(Bp.q, f),
    fn: lerp(A.fn, Bp.fn, f),
    ff: lerp(A.ff, Bp.ff, f),
    fov: lerp(A.fov, Bp.fov, f),
    hz: lerp(A.hz, Bp.hz, f),
  };
  if (!Bp.late) return { ...base, p: A.p.clone().lerp(Bp.p, f) };
  const g = sm((f - 0.45) / 0.55);
  return { ...base, p: v3(lerp(A.p.x, Bp.p.x, g), lerp(A.p.y, Bp.p.y, g), lerp(A.p.z, Bp.p.z, sm(f / 0.6))) };
}
