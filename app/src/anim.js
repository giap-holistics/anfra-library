// Time: the per-frame scene update (rooms, spines, readers) and the interactive state machine, which
// produces the Frame context that the renderer, sidebar and labels read.
import * as THREE from 'three';
import {
  BOOKS,
  FULL,
  NEED,
  PRICE,
  axisData,
  defaultState,
  display,
  loadCatalogue,
  priceOn,
  priceSet,
  request,
  snap,
} from './data.js';
import {
  layout,
  expand,
  priceLayout,
  poses,
  P0az,
  mixP,
  panP,
  fwdOf,
  v3,
  CW,
  PITCH,
  PL,
  HC,
  RH,
  AJ,
  W,
  D,
} from './layout.js';
import * as S from './scene.js';
import { clamp, lerp, ease, outBack, settle } from './util.js';

/** @typedef {import('./data.js').Axis} Axis */
/** @typedef {import('./data.js').DataState} DataState */
/** @typedef {import('./data.js').Key} Key */
/** @typedef {import('./data.js').Grain} Grain */
/** @typedef {import('./layout.js').Layout} Layout */
/** @typedef {import('./layout.js').Pose} Pose */
/** @typedef {import('./layout.js').Poses} Poses */
/** A geometry/assignment segment: rooms morph gF→gT by m; spines move aF→aT with per-title progress f. @typedef {{ gF: Layout, gT: Layout, m: number, aF: Layout, aT: Layout, arc?: number, slide?: number, f: (b: number) => number }} Seg */
/** @typedef {{ p: [number, number] | null, h: string }} Tip */
/**
 * Everything one frame needs.
 * @typedef {{ st: Seg, P: Pose, lv: number, amb: number, G: Layout, axis: Axis, room: number, ci: number, hb: number, bk: number, hRoom: number,
 *   focus: boolean, fci: number, fade: number, refill: number, slide: number, hc: number, caseLift: number, bookLift: number,
 *   o1: number, c1: number, knob: number, P2: Pose|null, key: Key, ds: DataState, plo: number, phi: number,
 *   tipF: (() => Tip|null)|null, tipOp: number, say: [string, string], grain: Grain }} Frame
 */

/** Camera: the building's interior, the exterior orbit, or the driver's ladder close-up. */
export const VIEW = { cam: /** @type {'default'|'exterior'|'ladder'} */ ('default') };
export const isExt = () => VIEW.cam === 'exterior';

/* ---------- layouts built from the governed rooms/cases/allbooks results ---------- */
/** @type {{ C: Layout, A: Layout, M: Layout }} */
export const LY = /** @type {any} */ ({});
/** @param {Axis} a @returns {Layout} */
export const GL = (a) => (a === 'category' ? LY.C : a === 'age' ? LY.A : LY.M);
/** Rebuild the three axis layouts for a period (after its queries are cached). @param {DataState} s */
export function buildLayouts(s) {
  const full = { ...s, ...FULL },
    sn = snap('allbooks', full);
  if (!sn) throw new Error('allbooks not loaded');
  loadCatalogue(sn);
  LY.C = layout(axisData('category', s));
  LY.A = layout(axisData('age', s));
  LY.M = layout(axisData('market', s));
}

/* ---------- geometry over time ---------- */
/** Current (blended) room rects and case placements. */
export const cur = {
  rects: [...Array(6)].map(() => ({ x: 0, z: 0, w: 1, d: 1 })),
  cases: [...Array(48)].map(() => ({ x: 0, z: 0, s: 1, cw: CW })),
};
/** @param {Layout} A @param {Layout} Bg @param {number} m */
export function mixGeom(A, Bg, m) {
  for (let i = 0; i < 6; i++) {
    const a = A.rects[i],
      b = Bg.rects[i],
      r = cur.rects[i];
    r.x = lerp(a.x, b.x, m);
    r.z = lerp(a.z, b.z, m);
    r.w = lerp(a.w, b.w, m);
    r.d = lerp(a.d, b.d, m);
  }
  for (let i = 0; i < 48; i++) {
    const a = A.cases[i],
      b = Bg.cases[i],
      c = cur.cases[i];
    c.x = lerp(a.x, b.x, m);
    c.z = lerp(a.z, b.z, m);
    c.s = lerp(a.s, b.s, m);
    c.cw = lerp(a.cw, b.cw, m);
  }
}
/** @typedef {{ x: number, y: number, z: number, s: number }} SP */
/** Spine slot position (centre of the spine at rest). @param {number} ci @param {number} j @param {number} b @param {SP} o @returns {SP} */
export const sPos = (ci, j, b, o) => {
  const c = cur.cases[ci],
    s = c.s,
    J = S.jit[b];
  o.x = c.x - (CW * s) / 2 + 0.22 * s + (j + 0.5) * PITCH * s;
  o.y = (PL + J.h / 2) * s;
  o.z = c.z + 0.06 * s;
  o.s = s;
  return o;
};
/** @param {number} i @returns {[number, number, number]} */
const doorOf = (i) => {
  const r = cur.rects[i];
  return [r.x + r.w / 2, 1.6, r.z + r.d + 1.4];
};
/** @type {SP} */ export const pa = { x: 0, y: 0, z: 0, s: 1 };
/** @type {SP} */ const pb = { x: 0, y: 0, z: 0, s: 1 };
/** @typedef {{ pts: number[][], cum: number[] }} Route */
/** @type {Map<number, Route>} */
const RC = new Map();
const FP = [0, 0, 0],
  FQ = [0, 0, 0],
  YA = v3(0, 1, 0),
  Z0 = new THREE.Matrix4().makeScale(0, 0, 0);
/** Door → corridor midline → (one gap) → corridor midline → door, just above partition height. @param {number} ia @param {number} ib @returns {Route} */
function route(ia, ib) {
  const key = ia * 6 + ib;
  let r = RC.get(key);
  if (r) return r;
  const da = doorOf(ia),
    db = doorOf(ib),
    H = 4.7,
    rs = cur.rects,
    cand = [da[0], db[0]];
  rs.forEach((q) => cand.push(q.x - 1.4, q.x + q.w + 1.4));
  /** @param {number} x0 @param {number} z0 @param {number} x1 @param {number} z1 */
  const hit = (x0, z0, x1, z1) =>
    rs.some(
      (q) =>
        Math.max(x0, x1) > q.x + 0.3 &&
        Math.min(x0, x1) < q.x + q.w - 0.3 &&
        Math.max(z0, z1) > q.z + 0.3 &&
        Math.min(z0, z1) < q.z + q.d - 0.3,
    );
  /** @type {number|null} */ let xm = null;
  let bl = 1e9;
  for (const c of cand) {
    if (hit(da[0], da[2], c, da[2]) || hit(c, da[2], c, db[2]) || hit(c, db[2], db[0], db[2])) continue;
    const l = Math.abs(c - da[0]) + Math.abs(db[2] - da[2]) + Math.abs(db[0] - c);
    if (l < bl) {
      bl = l;
      xm = c;
    }
  }
  const pts = [
    [0, 0, 0],
    [da[0], 1.6, da[2] - 1.2],
    [da[0], H, da[2]],
    ...(xm == null
      ? []
      : [
          [xm, H, da[2]],
          [xm, H, db[2]],
        ]),
    [db[0], H, db[2]],
    [db[0], 1.6, db[2] - 1.2],
    [0, 0, 0],
  ];
  r = { pts, cum: [] };
  RC.set(key, r);
  return r;
}
/** Position along the route by arc length, with a short settle past the slot. @param {Route} rt @param {number} f @param {number[]} o @returns {number[]} */
function fly(rt, f, o) {
  const P = rt.pts,
    c = rt.cum;
  P[0][0] = pa.x;
  P[0][1] = pa.y;
  P[0][2] = pa.z;
  const e = P[P.length - 1];
  e[0] = pb.x;
  e[1] = pb.y;
  e[2] = pb.z;
  c[0] = 0;
  for (let i = 1; i < P.length; i++)
    c[i] = c[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]);
  const Lt = c[P.length - 1],
    d = clamp(Lt * ease(f) + 0.3 * Math.sin(Math.PI * clamp((f - 0.82) / 0.18)), 0, Lt + 0.3);
  let i = 1;
  while (i < P.length - 1 && c[i] < d) i++;
  const a = P[i - 1],
    b = P[i],
    u = (d - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
  o[0] = lerp(a[0], b[0], u);
  o[1] = lerp(a[1], b[1], u);
  o[2] = lerp(a[2], b[2], u);
  return o;
}
/** The spine marked as the catalogue's best seller (it breathes). */
export const TOP = { b: -1 };
/** @param {Seg} st @param {Frame} E */
export function updSpines(st, E) {
  const NB = BOOKS.length,
    r0 = E.room * 8,
    sl = E.focus && E.ci >= 0,
    { spines, strk, ghSp, LAB, M4, Q, EU, V, SC, col, spC, spS, jit, topGlow } = S;
  LAB.forEach((l) => (l[0].visible = l[1].visible = false));
  if (sl) S.drawSPA(E.ci, st.aT);
  RC.clear();
  strk.visible = !!st.arc;
  let gOn = (ghSp.visible = E.fade > 0 && E.fci >= 0);
  /** @type {THREE.MeshStandardMaterial} */
  (ghSp.material).opacity = 1 - E.fade;
  if (E.fade >= 1) gOn = ghSp.visible = false;
  let topSeen = false;
  for (let b = 0; b < NB; b++) {
    const ca = st.aF.asg[b],
      cb = st.aT.asg[b],
      J = jit[b];
    const f = st.f(b);
    let x = 0,
      y = 0,
      z = 0,
      s = 1,
      k = 1,
      rot = 0;
    if (st.arc) strk.setMatrixAt(b, Z0);
    if (gOn) ghSp.setMatrixAt(b, Z0);
    if (ca < 0 && cb < 0) {
      spines.setMatrixAt(b, Z0);
      continue;
    }
    if (ca >= 0) sPos(ca, st.aF.slot[b], b, pa);
    if (cb >= 0) sPos(cb, st.aT.slot[b], b, pb);
    if (ca >= 0 && cb >= 0) {
      if (st.arc && f > 0 && f < 1) {
        // out of the old room's arch, along the corridor midlines, in through the new arch
        const rt = route(ca >> 3, cb >> 3);
        fly(rt, f, FP);
        [x, y, z] = FP;
        s = lerp(pa.s, pb.s, f);
        rot = Math.sin(Math.PI * f) * J.l * 1.4;
        fly(rt, Math.max(0, f - 0.05), FQ);
        const dx0 = x - FQ[0],
          dy0 = y - FQ[1],
          dz0 = z - FQ[2],
          ln = Math.hypot(dx0, dy0, dz0);
        if (ln > 0.2) {
          Q.setFromUnitVectors(YA, V.set(dx0 / ln, dy0 / ln, dz0 / ln));
          M4.compose(V.set(x - dx0 / 2, y - dy0 / 2, z - dz0 / 2), Q, SC.set(0.16 * s, ln, 0.16 * s));
          strk.setMatrixAt(b, M4);
        }
      } else {
        x = lerp(pa.x, pb.x, f);
        y = lerp(pa.y, pb.y, f);
        z = lerp(pa.z, pb.z, f);
        s = lerp(pa.s, pb.s, f);
      }
    } else if (ca >= 0) {
      ({ x, y, z, s } = pa);
      k = 1 - f;
      if (st.slide) {
        z -= f * 0.9 * s;
        k = 1 - ease((f - 0.4) / 0.6);
      }
    } else {
      ({ x, y, z, s } = pb);
      k = f;
      if (st.slide) {
        z -= (1 - f) * 0.9 * s;
        k = ease(f / 0.6);
      }
    }
    const cn = cb >= 0 ? cb : ca,
      inR = cn >= r0 && cn < r0 + 8;
    let sy = 1,
      dx = 0;
    if (E.focus && !inR) {
      spines.setMatrixAt(b, Z0);
      continue;
    } // the L2 camera can stand in a neighbouring room: other rooms stay hidden
    const gh = E.fade > 0 && E.fci >= 0 && inR && cn !== E.fci;
    if (inR && E.refill >= 0 && E.refill < 2) {
      const kk = cn - r0,
        j = st.aT.slot[b],
        r = E.refill;
      sy = r < 0.45 ? 1 - ease(r / 0.3) : settle((r - 0.6 - kk * 0.1 - j * 0.006) / 0.5);
    }
    if (cn === E.ci && E.slide >= 0 && E.slide < 1.4) {
      const j = st.aT.slot[b],
        r = E.slide;
      if (r < 0.35) sy = 1 - ease(r / 0.25);
      else {
        const u = (r - 0.5 - j * 0.012) / 0.4,
          e = outBack(u, 1.2);
        sy = u > 0 ? 1 : 0;
        dx = (1 - e) * CW * s * 0.7;
      }
    }
    spines.setColorAt(
      b,
      b === E.hb && E.bookLift > 0
        ? col.copy(spS[b]).multiplyScalar(1 + E.bookLift * 0.5)
        : E.focus && inR
          ? spS[b]
          : spC[b],
    );
    if (b === E.hb) y += E.bookLift * 0.2 * s;
    if (b === E.bk) k = 0;
    if (b === TOP.b && !st.arc) {
      topSeen = !gh || !gOn;
      const n = Math.pow(Math.max(0, Math.sin(E.amb * 1.9)), 12);
      z += n * 0.07 * s;
      spines.setColorAt(b, col.copy(spC[b]).multiplyScalar(1.4 + n));
      topGlow.position.set(x, y + 0.2 * s, z + 0.4 * s);
      topGlow.scale.setScalar((0.9 + n * 0.5) * s * k);
    }
    if (cn === E.hc) y += E.caseLift * 0.06 * s;
    const h = J.h * s * sy;
    EU.set(0, 0, rot);
    Q.setFromEuler(EU);
    V.set(x + dx, y - (J.h * s) / 2 + h / 2, z);
    SC.set(J.th * s * k, Math.max(h * k, 1e-4), 0.72 * s * k);
    M4.compose(V, Q, SC);
    spines.setMatrixAt(b, gh ? Z0 : M4);
    if (gh && gOn) ghSp.setMatrixAt(b, M4);
    if (sl && cb === E.ci && st.aT.slot[b] < 40 && k > 0)
      LAB[st.aT.slot[b]].forEach((m) => {
        m.matrix.copy(M4);
        m.visible = true;
      });
  }
  topGlow.visible = topSeen && st.m === 0 && (!gOn || st.aT.asg[TOP.b] === E.fci);
  spines.instanceMatrix.needsUpdate = true;
  if (gOn) ghSp.instanceMatrix.needsUpdate = true;
  if (st.arc) strk.instanceMatrix.needsUpdate = true;
  if (spines.instanceColor) spines.instanceColor.needsUpdate = true;
}
/** Pointer sway [x, y] in -1..1, lamp intensity scale, reader scale, and the camera eye/target readers must keep clear of. */
export const FX = { sway: [0, 0], LK: 1, RSC: 1, cam: v3(0, 100, 0), look: v3(0, 0, 0) };
/** @param {number} t @param {Seg} st @param {Frame} E */
export function updRooms(t, st, E) {
  const ax = st.m > 0.5 ? st.gT : st.gF,
    focus = E.focus,
    sway = FX.sway;
  for (let i = 0; i < 6; i++) {
    const r = cur.rects[i],
      o = S.rooms[i],
      cx = r.x + r.w / 2,
      cz = r.z + r.d / 2,
      fz = r.z + r.d,
      T = 0.3,
      sw = Math.max(0.01, (r.w - 2 * AJ) / 2),
      vis = !focus || i === E.room;
    const [bw, lw, rw, fl, fr] = o.walls;
    bw.position.set(cx, RH / 2, r.z);
    bw.scale.set(r.w + T, RH, T);
    lw.position.set(r.x, RH / 2, cz);
    lw.scale.set(T, RH, r.d);
    rw.position.set(r.x + r.w, RH / 2, cz);
    rw.scale.set(T, RH, r.d);
    fl.position.set(r.x + sw / 2, RH / 2, fz);
    fl.scale.set(sw, RH, T);
    fr.position.set(r.x + r.w - sw / 2, RH / 2, fz);
    fr.scale.set(sw, RH, T);
    o.arch.position.set(cx, 0, fz);
    o.walls.forEach((w, j) => (w.visible = !focus || (i === E.room && j < 3)));
    o.arch.visible = fl.visible;
    o.sign.visible = fl.visible;
    o.sign.position.set(cx, RH + 0.32, fz + 0.17);
    o.trim.position.set(cx, 2.2, fz + 0.16);
    o.trim.visible = o.arch.visible;
    S.drawLintel(o, ax.ar[i]);
    const dl = lerp(st.gF.ar[i].delta, st.gT.ar[i].delta, st.m),
      heat = clamp(0.55 + dl * 22, 0.25, 1.6),
      lz = cz - r.d * 0.08;
    o.lamp.position.set(cx, HC, lz);
    o.lamp.rotation.set(sway[1] * 0.1, 0, -sway[0] * 0.14 + Math.sin(t * 0.9 + i) * 0.02);
    o.lamp.visible = o.glow.visible = vis;
    o.light.position.set(cx, 5.1, lz);
    o.light.intensity = 70 * FX.LK * heat * Math.sqrt((r.w * r.d) / 300);
    o.bulb.material.color.setHSL(0.09, 0.9, 0.45 + heat * 0.2);
    o.glow.position.set(cx, 5.1, lz);
    o.glow.scale.setScalar(4 + heat * 5);
    const pf = E.fade > 0 && i === E.fci >> 3,
      pop = 1 - E.fade;
    // reading table where the centre aisle crosses the gap behind the first row
    const cs = cur.cases.slice(i * 8, i * 8 + 8),
      c0 = cs[0],
      nc = cs.filter((c) => Math.abs(c.z - c0.z) < 0.1).length,
      k1 = cs[nc],
      tz = k1 ? (c0.z + k1.z) / 2 : c0.z;
    const h2 = nc >> 1,
      sx = nc > 1 ? (cs[h2 - 1].x + cs[h2].x) / 2 : (c0.x - (CW * c0.s) / 2 + r.x + 0.15) / 2;
    o.tbl.position.set(sx, 0, tz);
    o.tbl.rotation.y = Math.PI / 2;
    o.tz = tz;
    o.tbl.visible = vis && !(pf && pop <= 0);
    S.fadeG(o.tbl, pf, pop);
    o.pl.forEach(([g, c, j]) => {
      if (c === 2) g.position.set(r.x + 0.55, 0, Math.min(fz - 0.6, o.tz + j));
      else g.position.set(c === 1 ? r.x + r.w - 0.55 - j : r.x + 0.55, 0, r.z + 0.55 + j);
      g.visible = o.tbl.visible;
      S.fadeG(g, pf, pop);
    });
    const [rf, rr] = o.runs;
    rf.scale.set(r.w + 2.8, 1.1, 1);
    rf.position.set(cx, 0.014 + i * 0.001, fz + 1.4);
    rr.scale.set(r.d + 2.8, 1.1, 1);
    rr.position.set(r.x + r.w + 1.4, 0.013 + i * 0.001, cz);
    o.cx = cx;
    o.cz = cz;
    o.r = r;
    o.share = lerp(st.gF.ar[i].share, st.gT.ar[i].share, st.m);
    o.delta = dl;
  }
  for (let ci = 0; ci < 48; ci++) {
    const c = cur.cases[ci],
      G = S.caseG[ci].g;
    let lift = 0;
    const fc = E.fade > 0 && ci >> 3 === E.fci >> 3 && ci !== E.fci,
      op = 1 - E.fade;
    G.visible = (!focus || ci >> 3 === E.room) && !(fc && op <= 0);
    S.fadeG(G, fc, op);
    if (ci === E.hc) lift = E.caseLift * 0.06 * c.s;
    G.position.set(c.x, lift, c.z);
    G.scale.setScalar(c.s);
    S.drawEdge(ci, ax.meta[ci]);
  }
  // moths, shaft dust, pendants, curtains, fan, clock, cat, ladders
  const p = /** @type {Float32Array} */ (S.dg.attributes.position.array);
  for (let n = 0; n < 300; n++) {
    const o = S.rooms[n % 6],
      [a, b, c] = S.dp[n],
      th = t * (0.6 + a) + n,
      rr = 0.3 + b * 1.4;
    p[n * 3] = o.cx + Math.cos(th) * rr;
    p[n * 3 + 1] = 4.6 - c * 2.6 + Math.sin(t * 2 + n) * 0.1;
    p[n * 3 + 2] = o.cz - o.r.d * 0.08 + Math.sin(th) * rr;
  }
  S.dg.attributes.position.needsUpdate = true;
  const q = /** @type {Float32Array} */ (S.sdust.geometry.attributes.position.array);
  S.sdr.forEach(([a, b, c, d], n) => {
    const zc = [-18, -9, 0][n % 3],
      y = S.wy0 + c * (S.wy1 - S.wy0),
      s = (((a + t * 0.015 * (d + 0.3)) % 1) * y) / 40;
    q[n * 3] = S.lx + 0.3 + 60 * s;
    q[n * 3 + 1] = y - 40 * s + Math.sin(t * 0.7 + n) * 0.08;
    q[n * 3 + 2] = zc - S.WW / 2 + b * S.WW + 8 * s;
  });
  S.sdust.geometry.attributes.position.needsUpdate = true;
  S.PEND.forEach((g, i) =>
    g.rotation.set(sway[1] * 0.1, 0, -sway[0] * 0.14 + Math.sin(t * 0.8 + i * 2) * 0.025),
  );
  S.curtains.forEach(
    (c, i) => (c.rotation.z = clamp(0.035 + 0.04 * Math.sin(t * 0.9 + i * 0.7), -0.03, 0.09)),
  ); // swing into the room only
  S.fan.rotation.y = t * 2.2;
  S.hands[0].rotation.x = (-t / 22) * Math.PI * 2; // the wall clock: one turn of the second hand per 22 s
  S.hands[1].rotation.x = ((-t / 22) * Math.PI) / 6 - 1.2;
  S.CATS.forEach((c) => {
    const u = t + c.ph;
    c.tail.rotation.y = Math.sin(u * 3) * 0.25 * Math.pow(Math.max(0, Math.sin(u * 0.9)), 3) + 0.4;
    c.g.scale.y = 1 + Math.sin(u * 1.6) * 0.03;
  });
  S.LAD.forEach((l) => {
    const u = l.c + Math.sin(t * 0.11 + l.ph) * l.a;
    if (l.w === 0) l.g.position.x = u;
    else l.g.position.z = u;
    l.u = u;
  });
  updReaders(t, ax, focus);
}

/* ---------- readers: corridors, mezzanine and ladders only; never inside a data room ---------- */
/** @param {number} j */
const hide = (j) => {
  [S.rBody, S.rLegs, S.rHead, S.rBook].forEach((m) => m.setMatrixAt(j, Z0));
};
const REU = new THREE.Euler(0, 0, 0, 'YXZ');
/**
 * True when a reader at (x, y, z) would stand within 3 units of the camera or on the camera's line
 * of sight to what it looks at (inside 1.2 units of that segment); such readers step out of view.
 * @param {number} x @param {number} y @param {number} z @returns {boolean}
 */
function blocks(x, y, z) {
  const c = FX.cam,
    q = FX.look;
  if (c.y > 25) return false; // bird's-eye: nobody is in the way
  if (Math.hypot(x - c.x, y - c.y, z - c.z) < 3) return true;
  const dx = q.x - c.x,
    dz = q.z - c.z,
    L2 = dx * dx + dz * dz;
  if (L2 < 1e-6) return false;
  const u = clamp(((x - c.x) * dx + (z - c.z) * dz) / L2);
  return Math.hypot(x - (c.x + dx * u), z - (c.z + dz * u)) < 1.2 && u * Math.sqrt(L2) < 14;
}
/** @param {number} j @param {number} x @param {number} z @param {number} ry @param {number} y0 @param {number} bob @param {number[]|null} bk @param {number} [sw] */
function putR(j, x, z, ry, y0, bob, bk, sw = 0) {
  if (blocks(x, y0 + 1, z)) {
    hide(j);
    return;
  }
  const { M4, Q, V, SC } = S,
    k = FX.RSC;
  Q.setFromEuler(REU.set(0, ry, sw));
  SC.set(k, k, k);
  const lx = -Math.sin(sw) * k,
    ly = Math.cos(sw) * k;
  M4.compose(V.set(x + lx * 0.4 * Math.cos(ry), y0 + 0.4 * k + bob, z - lx * 0.4 * Math.sin(ry)), Q, SC);
  S.rLegs.setMatrixAt(j, M4);
  M4.compose(V.set(x + lx * 0.92 * Math.cos(ry), y0 + 0.92 * ly + bob, z - lx * 0.92 * Math.sin(ry)), Q, SC);
  S.rBody.setMatrixAt(j, M4);
  M4.compose(
    V.set(x + lx * 1.42 * Math.cos(ry), y0 + 1.42 * ly + bob * 1.2, z - lx * 1.42 * Math.sin(ry)),
    Q,
    SC,
  );
  S.rHead.setMatrixAt(j, M4);
  SC.set(1, 1, 1);
  if (bk) {
    M4.compose(V.set(bk[0], bk[1], bk[2]), Q, SC.set(0.24, 0.32, 0.05));
    S.rBook.setMatrixAt(j, M4);
  } else S.rBook.setMatrixAt(j, Z0);
}
/** @param {number} u @param {number} w @returns {[number, number]} */
const pingpong = (u, w) => {
  u %= 2 * w;
  return u < w ? [u, 1] : [2 * w - u, -1];
};
/** @param {number} t @param {Layout} ax @param {boolean} focus */
function updReaders(t, ax, focus) {
  const units = ax.ar.map((a) => a.units),
    tot = units.reduce((a, b) => a + b, 0) || 1;
  for (let j = 0; j < S.NR; j++) {
    const d = S.RD[j],
      bob = Math.abs(Math.sin(t * 7 * d.sp + j)) * 0.06,
      sw = Math.sin(t * 3.5 * d.sp + j * 0.5) * 0.09;
    if (j >= 20) {
      hide(j);
      continue;
    }
    if (j < 14) {
      // corridor segment in front of each room; head count ∝ units sold in that room
      let acc = 0,
        i = 0;
      for (; i < 5; i++) {
        acc += units[i] / tot;
        if ((j + 0.5) / 14 < acc) break;
      }
      if (focus) {
        hide(j);
        continue;
      }
      const r = cur.rects[i],
        [u, dir] = pingpong(t * 1.1 * d.sp + d.ph * 5, r.w + 1.4);
      putR(j, r.x - 0.7 + u, r.z + r.d + 0.75 + (j % 2 ? 0.3 : -0.3), (dir * Math.PI) / 2, 0, bob, null, sw);
    } else if (j < 17) {
      // front runner and window gallery
      if (focus) {
        hide(j);
        continue;
      }
      if (j < 16) {
        const [u, dir] = pingpong(t * 1.1 * d.sp + d.ph * 3, 62);
        putR(j, u - 31, D / 2 - 1.8 + (j % 2 ? 0.35 : -0.35), (dir * Math.PI) / 2, 0, bob, null, sw);
      } else {
        const [u, dir] = pingpong(t * 0.8 * d.sp + d.ph, 40);
        putR(j, -W / 2 + 4.2, u - 20, dir > 0 ? 0 : Math.PI, 0, bob, null, sw);
      }
    } else if (j < 19) {
      // mezzanine strollers
      const [u, dir] = pingpong(t * 0.7 * d.sp + d.ph * 4, 28);
      putR(j, 5.5 + u, -D / 2 + 1.4 + (j % 2) * 0.5, (dir * Math.PI) / 2, 3.73, bob, null, sw);
    } else {
      // the reader up a ladder, reaching for a book
      const l = S.LAD[0],
        y0 = 2.5,
        zf = -D / 2 + 0.1 + 1.3 - (y0 * 1.05) / 6.4 + 0.25,
        reach = Math.pow(Math.max(0, Math.sin(t * 0.8)), 2);
      putR(j, l.u + 0.05, zf, Math.PI, y0, 0, [
        l.u + 0.35,
        y0 + 1.3 + reach * 0.4,
        -D / 2 + 0.5 + (1 - reach) * 0.3,
      ]);
    }
  }
  [S.rBody, S.rLegs, S.rHead, S.rBook].forEach((m) => (m.instanceMatrix.needsUpdate = true));
}

/* ---------- exterior orbit ---------- */
/** Elevation -5..70 deg, distance × zoom, never below the field. @param {number} az @param {number} dp @param {number} [zm] @returns {Pose} */
export function orbX(az, dp, zm = 1) {
  const X = S.PEX,
    v = X.p.clone().sub(X.q),
    r = v.length() * zm,
    a = Math.atan2(v.x, v.z) + az,
    e = clamp(Math.asin(v.y / v.length()) + dp, -0.087, 1.22);
  const p = v3(
    X.q.x + r * Math.sin(a) * Math.cos(e),
    X.q.y + r * Math.sin(e),
    X.q.z + r * Math.cos(a) * Math.cos(e),
  );
  p.y = Math.max(p.y, S.fH(p.x, p.z) + 1.2);
  return { ...X, p };
}

/* ---------- tips (numbers from the governed results) ---------- */
/** Screen projection, set by main. @type {{ proj: (x: number, y: number, z: number) => [number, number] | null }} */
export const PROJ = { proj: () => null };
/** @param {Layout} G @param {number} ci @returns {Tip|null} */
export function caseTip(G, ci) {
  const s = G.meta[ci],
    c = cur.cases[ci];
  if (!s) return null;
  const d = s.delta;
  return {
    p: PROJ.proj(c.x, (1.45 + 0.25) * c.s, c.z),
    h: `<b>#${s.rank} ${s.genre}</b> · ${(s.share * 100).toFixed(1)}% of ${s.area} · ${fmtM(s.revenue)} · <span class="d ${d >= 0 ? 'up' : 'dn'}">${(d >= 0 ? '+' : '') + (d * 100).toFixed(1)}%</span>`,
  };
}
/** @param {number} v */
const fmtM = (v) =>
  v >= 1e6
    ? '$' + (v / 1e6).toFixed(2) + 'M'
    : v >= 1e3
      ? '$' + (v / 1e3).toFixed(1) + 'k'
      : '$' + v.toFixed(0);
/** Units and growth come from the topshelf query for the shelf (allbooks as a fallback while it runs). @param {number} b @param {Layout} A @param {DataState} ds @returns {Tip|null} */
export function bookTip(b, A, ds) {
  if (A.asg[b] < 0) return null;
  sPos(A.asg[b], A.slot[b], b, pa);
  const k = BOOKS[b],
    ts = snap('topshelf', ds),
    r = ts && ts.rows.find((x) => x.isbn === k.isbn);
  const units = r ? Number(r.units) : k.units,
    d = r ? Number(r.units_growth) || 0 : k.unitsPrev ? k.units / k.unitsPrev - 1 : 0;
  return {
    p: PROJ.proj(pa.x, pa.y + (S.jit[b].h * 0.5 + 0.3) * pa.s, pa.z),
    h: `<b>${k.title}</b> · ${Math.round(units).toLocaleString('en-US')} units · <span class="d ${d >= 0 ? 'up' : 'dn'}">${(d >= 0 ? '+' : '') + (d * 100).toFixed(1)}%</span>`,
  };
}

/* ---------- Interactive: the user drives ---------- */
/**
 * @typedef {{ lv: number, G: Layout, asg: Layout, room: number, ci: number, bk: number, ds: DataState, knob: number,
 *   orbit: number, pitch: number, pitchT: number, zoom: number, zoomT: number,
 *   mo: { gF: Layout, aF: Layout, t0: number } | null, pt: { aF: Layout, t0: number } | null, ex: { from: Layout, to: Layout, t0: number, d: number } | null, base: Layout | null,
 *   pend: { axis: Axis, at: number } | null, lvAt: { n: number, at: number } | null, path: { pts: (Pose | (() => Pose))[], durs: number[], t0: number } | null, restP: () => Pose, lastP: Pose,
 *   hRoom: number, hCase: number, hBook: number, fd: number, fci: number, pan: THREE.Vector3, hcL: number, hbL: number, cl: number, bl: number,
 *   tL1: number, tL2: number, tOpen: number, tClose: number | null, ps: Poses | null, P2: Pose | null, wT: number, last: number, gen: number, wiAt: number }} IState
 */
/** @type {IState} */
export let IS = /** @type {any} */ (null);
/** Interactive clock, set by main each frame. */
export const NOWR = { t: 0 };
/** @param {number} now */
export function initIS(now) {
  const ds = defaultState(),
    G = GL(ds.axis);
  IS = {
    lv: 0,
    G,
    asg: G,
    room: -1,
    ci: -1,
    bk: -1,
    ds,
    knob: 1,
    orbit: 0,
    pitch: 0,
    pitchT: 0,
    zoom: 1,
    zoomT: 1,
    mo: null,
    pt: null,
    ex: null,
    base: null,
    pend: null,
    lvAt: null,
    path: null,
    restP: () => (isExt() ? orbX(IS.orbit, IS.pitch, IS.zoom) : P0az(IS.orbit, IS.pitch, IS.zoom)),
    lastP: P0az(0),
    hRoom: -1,
    hCase: -1,
    hBook: -1,
    fd: 0,
    fci: -1,
    pan: v3(0, 0, 0),
    hcL: -2,
    hbL: -2,
    cl: 0,
    bl: 0,
    tL1: -99,
    tL2: -99,
    tOpen: -99,
    tClose: null,
    ps: null,
    P2: null,
    wT: -9,
    last: now,
    gen: 0,
    wiAt: -1,
  };
  void display(IS.ds, NEED.all);
}
/** Ask for the current level's numbers. */
const want = () => {
  const k = keyOf();
  void display(IS.ds, NEED[k]);
};
/** @returns {Key} */
const keyOf = () =>
  /** @type {Key[]} */ (['all', 'room', 'sh', 'bk'])[
    IS.bk >= 0 && IS.tClose == null ? 3 : Math.min(IS.lv, 2)
  ];
/** @param {Pose | (() => Pose)} p @returns {Pose} */
const pv = (p) => (typeof p === 'function' ? p() : p);
/** @param {(Pose | (() => Pose))[]} pts @param {number[]} durs @param {() => Pose} rest */
function go(pts, durs, rest) {
  IS.path = { pts: [IS.lastP, ...pts], durs, t0: NOWR.t };
  IS.restP = rest;
}
/** @param {number} now @returns {Pose} */
function camNow(now) {
  const P = IS.path;
  if (!P) return IS.restP();
  let el = now - P.t0;
  for (let i = 0; i < P.durs.length; i++) {
    if (el < P.durs[i]) return mixP(pv(P.pts[i]), pv(P.pts[i + 1]), ease(el / P.durs[i]));
    el -= P.durs[i];
  }
  IS.path = null;
  return IS.restP();
}
const P1p = () => panP(/** @type {Poses} */ (IS.ps).P1, IS.pan);
/** L1 pan: offset eye and target, clamped to the room. @param {number} dx @param {number} dz @param {THREE.Vector3} [o0] */
export function panBy(dx, dz, o0 = IS.pan) {
  if (IS.lv !== 1 || !IS.ps) return;
  const P = IS.ps.P1,
    r = IS.G.rects[IS.room],
    f = fwdOf(P),
    o = o0.clone();
  o.x += -f.z * dx + f.x * dz;
  o.z += f.x * dx + f.z * dz;
  o.x = clamp(o.x, r.x + 0.8 - P.p.x, r.x + r.w - 0.8 - P.p.x);
  o.z = clamp(o.z, r.z + 1.5 - P.p.z, 0);
  IS.pan.copy(o);
}
/** @param {number} i */
export function goRoom(i) {
  if (IS.lv !== 0 || IS.mo || IS.pend || isExt() || i < 0 || i > 5) return;
  const Gx = expand(IS.G, i);
  if (Gx !== IS.G) {
    IS.ex = { from: IS.G, to: Gx, t0: NOWR.t, d: 1.5 };
    IS.base = IS.G;
    IS.G = Gx;
  }
  const ps = (IS.ps = poses(IS.G, i, -1));
  IS.room = i;
  IS.lv = 1;
  IS.tL1 = NOWR.t;
  IS.hRoom = -1;
  IS.pan.set(0, 0, 0);
  go([ps.Pa, ps.Pc, ps.P1], [0.6, 0.5, 0.7], P1p);
  IS.ds = { ...IS.ds, room: IS.G.ar[i].name, genre: null, isbn: null, factor: 1 };
  IS.knob = 1;
  want();
}
/** @param {number} ci */
export function goShelf(ci) {
  const m = IS.G.meta[ci];
  if (IS.lv !== 1 || !m || ci >> 3 !== IS.room) return;
  IS.ci = ci;
  IS.lv = 2;
  IS.P2 = poses(IS.G, IS.room, ci).P2 || null;
  IS.tL2 = NOWR.t;
  IS.hCase = -1;
  if (IS.P2) {
    const P2 = IS.P2;
    go([P2], [0.9], () => P2);
  }
  IS.ds = { ...IS.ds, genre: m.genre, isbn: null, factor: 1 };
  want();
}
/** @param {number} b */
export function openBook(b) {
  if (IS.lv !== 2 || IS.bk >= 0 || IS.path || b < 0 || IS.asg.asg[b] !== IS.ci) return;
  IS.bk = b;
  IS.lv = 3;
  IS.tOpen = NOWR.t;
  IS.tClose = null;
  IS.knob = 1;
  IS.hBook = -1;
  IS.ds = { ...IS.ds, isbn: BOOKS[b].isbn, factor: 1 };
  want();
}
/** @param {number} n */
export function goLevel(n) {
  if (n < 0 || n >= IS.lv || IS.lvAt) return;
  if (IS.lv === 3) {
    IS.tClose = NOWR.t;
    IS.lv = 2;
    IS.ds = { ...IS.ds, isbn: null, factor: 1 };
    if (n < 2) IS.lvAt = { n, at: NOWR.t + 1.3 };
    return;
  } // the book flies home before the camera leaves
  if (n === 2) {
    IS.lv = 2;
    return;
  }
  if (n === 1) {
    IS.lv = 1;
    IS.ci = -1;
    IS.hBook = -1;
    go([P1p], [0.7], P1p);
    IS.ds = { ...IS.ds, genre: null, isbn: null };
    want();
    return;
  }
  const ps = IS.ps;
  IS.lv = 0;
  IS.room = -1;
  IS.ci = -1;
  IS.hCase = -1;
  const rest = () => P0az(IS.orbit, IS.pitch, IS.zoom);
  go(ps ? [ps.Pa, rest] : [rest], ps ? [0.5, 0.8] : [0.8], rest);
  if (IS.base) {
    IS.ex = { from: IS.G, to: IS.base, t0: NOWR.t, d: 1.1 };
    IS.G = IS.base;
    IS.base = null;
  } // small room shrinks back to its true share
  IS.ds = { ...IS.ds, room: null, genre: null, isbn: null };
  want();
}
/** @param {Axis} axis */
function startMorph(axis) {
  const G = GL(axis);
  IS.ds = { ...IS.ds, axis };
  if (G === IS.G) return;
  IS.mo = { gF: IS.G, aF: IS.asg, t0: NOWR.t };
  IS.G = G;
  IS.asg = priceLayout(G, priceSet(IS.ds));
  IS.pt = null;
  want();
}
/** @param {Axis} axis */
export function setAxis(axis) {
  if (IS.pend) return;
  if (IS.lv > 0) {
    const w = IS.lv === 3 ? 1.3 : 0;
    goLevel(0);
    IS.pend = { axis, at: NOWR.t + 1.35 + w };
  } else startMorph(axis);
}
/** Price range from the sidebar: re-run allbooks (and the level's numbers), then slide the spines. @param {number} lo @param {number} hi */
export function setPrice(lo, hi) {
  lo = Math.round(clamp(lo, PRICE.min, PRICE.max));
  hi = Math.round(clamp(hi, lo + 2, PRICE.max));
  if (lo <= PRICE.min && hi >= PRICE.max) {
    lo = FULL.lo;
    hi = FULL.hi;
  } // the whole range is no filter at all
  IS.ds = { ...IS.ds, lo, hi };
  const ds = IS.ds,
    gen = ++IS.gen;
  void display(
    ds,
    /** @type {import('./data.js').QName[]} */ ([
      ...new Set([...NEED[keyOf()], 'allbooks', 'rooms_' + ds.axis]),
    ]),
  ).then(() => {
    if (gen !== IS.gen) return;
    const aF = IS.asg;
    IS.asg = priceLayout(IS.G, priceSet(ds));
    if (!IS.mo) IS.pt = { aF, t0: NOWR.t };
  });
}
/** @param {Grain} g */
export function setGrain(g) {
  IS.ds = { ...IS.ds, grain: g };
  want();
}
/** What-if slider: the knob follows at once; the governed query re-runs with the new params block once the knob rests 0.12 s (page clock). @param {number} f */
export function setWhatIf(f) {
  if (IS.lv !== 3) return;
  IS.knob = Math.round(clamp(f, 0.7, 1.3) * 100) / 100;
  IS.wiAt = NOWR.t;
}
/** Change the reporting period: re-run everything, rebuild the building, morph. @param {import('./data.js').PeriodId} p */
export function setPeriod(p) {
  if (IS.lv > 0) goLevel(0);
  const ds = { ...IS.ds, period: p, room: null, genre: null, isbn: null },
    gen = ++IS.gen;
  IS.ds = ds;
  void display(ds, NEED.all)
    .then(() => request({ ...ds, ...FULL }, NEED.all))
    .then(() => {
      if (gen !== IS.gen) return;
      const gF = IS.G,
        aF = IS.asg;
      buildLayouts(ds);
      IS.G = GL(ds.axis);
      IS.asg = priceLayout(IS.G, priceSet(ds));
      IS.base = null;
      IS.mo = { gF, aF, t0: NOWR.t };
    });
}
/** @param {number} now @returns {Frame} */
export function interE(now) {
  const dt = Math.min(0.1, Math.max(0, now - (IS.last || now)));
  IS.last = now;
  if (IS.pend && now >= IS.pend.at) {
    const a = IS.pend.axis;
    IS.pend = null;
    startMorph(a);
  }
  if (IS.tClose != null && now - IS.tClose > 1.3) {
    IS.bk = -1;
    IS.tClose = null;
  }
  if (IS.lvAt && now >= IS.lvAt.at) {
    const n = IS.lvAt.n;
    IS.lvAt = null;
    goLevel(n);
  }
  if (IS.wiAt >= 0 && now - IS.wiAt > 0.12) {
    IS.wiAt = -1;
    if (IS.lv === 3 && IS.ds.factor !== IS.knob) {
      IS.ds = { ...IS.ds, factor: IS.knob };
      want();
    }
  }
  /** @type {Seg|null} */ let st = null;
  const J = S.jit;
  if (IS.mo) {
    const el = now - IS.mo.t0,
      mo = IS.mo;
    if (el > 3.2) IS.mo = null;
    else
      st = {
        gF: mo.gF,
        gT: IS.G,
        m: ease(el / 1.7),
        aF: mo.aF,
        aT: IS.asg,
        arc: 5.5,
        f: (b) => clamp((el - 0.2 - J[b].d * 1.3) / 1.1),
      };
  }
  if (!st && IS.pt) {
    const el = now - IS.pt.t0,
      aF = IS.pt.aF;
    if (el > 1.4) IS.pt = null;
    else
      st = {
        gF: IS.G,
        gT: IS.G,
        m: 0,
        aF,
        aT: IS.asg,
        slide: 1,
        f: (b) => ease((el - (IS.asg.asg[b] >= 0 ? IS.asg : aF).slot[b] * 0.012) / 0.4),
      };
  }
  if (!st && IS.ex) {
    const el = (now - IS.ex.t0) / IS.ex.d,
      ex = IS.ex;
    if (el > 1) IS.ex = null;
    else st = { gF: ex.from, gT: ex.to, m: ease(el), aF: IS.asg, aT: IS.asg, f: () => 0 };
  }
  if (!st) st = { gF: IS.G, gT: IS.G, m: 0, aF: IS.asg, aT: IS.asg, f: () => 0 };
  IS.pitch += (IS.pitchT - IS.pitch) * Math.min(1, dt * 8);
  IS.zoom += (IS.zoomT - IS.zoom) * Math.min(1, dt * 7);
  const P = VIEW.cam === 'ladder' ? S.PL2 : isExt() ? orbX(IS.orbit, IS.pitch, IS.zoom) : camNow(now);
  if (IS.hCase !== IS.hcL) {
    IS.hcL = IS.hCase;
    IS.cl = 0;
  }
  IS.cl = Math.min(1, IS.cl + dt * 5);
  IS.fd = clamp(IS.fd + (IS.lv >= 2 ? dt : -dt) / 0.4);
  if (IS.lv >= 2) IS.fci = IS.ci;
  else if (!IS.fd) IS.fci = -1;
  if (IS.hBook !== IS.hbL) {
    IS.hbL = IS.hBook;
    IS.bl = 0;
  }
  IS.bl = Math.min(1, IS.bl + dt * 5);
  const key = keyOf(),
    G = IS.G,
    ds = IS.ds;
  /** @type {(() => Tip|null)|null} */ let tipF = null;
  let tipOp = 0;
  if (IS.lv === 1 && IS.hCase >= 0) {
    const hc = IS.hCase;
    tipF = () => caseTip(G, hc);
    tipOp = IS.cl;
  }
  if (IS.lv === 2 && IS.hBook >= 0) {
    const hb = IS.hBook,
      A = IS.asg;
    tipF = () => bookTip(hb, A, ds);
    tipOp = IS.bl;
  }
  const m = IS.ci >= 0 ? G.meta[IS.ci] : null;
  /** @type {[string, string]} */
  const say = isExt()
    ? ['The library', 'Drag to orbit · scroll to zoom · Inside to go back in.']
    : IS.lv === 0
      ? [
          `Six rooms, ${BOOKS.length.toLocaleString('en-US')} books.`,
          'Click a doorway or signpost to enter · drag to orbit · switch the area axis in the sidebar.',
        ]
      : IS.lv === 1
        ? [
            `${G.ar[IS.room].name} · ${(G.ar[IS.room].share * 100).toFixed(1)}% of revenue`,
            'Click a shelf · drag to pan · Esc or scroll to go back.',
          ]
        : IS.lv === 2
          ? [`Shelf: ${m ? m.genre : ''}`, 'Click a spine to open the book · Esc or scroll to go back.']
          : [IS.bk >= 0 ? BOOKS[IS.bk].title : '', 'Drag the price what-if · Esc to put it back.'];
  return {
    st,
    P,
    lv: IS.lv,
    amb: now,
    G,
    axis: IS.pend ? IS.pend.axis : G.axis,
    room: IS.room,
    ci: IS.ci,
    hb: IS.hBook,
    bk: IS.bk,
    hRoom: IS.hRoom,
    focus: IS.lv >= 2,
    fci: IS.fci,
    fade: IS.fd,
    refill: IS.lv >= 1 ? now - IS.tL1 : -1,
    slide: IS.lv >= 2 ? now - IS.tL2 : -1,
    hc: IS.hCase,
    caseLift: IS.cl,
    bookLift: IS.bl,
    o1: now - IS.tOpen,
    c1: IS.tClose != null ? now - IS.tClose : -1,
    knob: IS.knob,
    P2: IS.P2,
    key,
    ds,
    plo: clamp(ds.lo, PRICE.min, PRICE.max),
    phi: clamp(ds.hi, PRICE.min, PRICE.max),
    tipF,
    tipOp,
    say,
    grain: ds.grain,
  };
}
export { priceOn };
