// Screen-space picking. Instead of raycasting thin meshes, every hoverable's 3D footprint (room floor
// and doorway at L0, bookcase front at L1, spine front at L2) is projected with the current camera
// into a 2D polygon; the pointer is tested against those, nearest by depth wins. Clicks use the same hulls.
import * as THREE from 'three';
import { BOOKS } from './data.js';
import { IS, cur, sPos, pa, isExt } from './anim.js';
import { AJ, BH, CD, CW, PL, RH } from './layout.js';
import * as S from './scene.js';
import { VP } from './sidebar.js';

/** @typedef {{ pts: [number, number][], z: number }} Hull */
/** @typedef {{ id: number, hulls: Hull[] }} Target */

const PV = new THREE.Vector3();
/** Project a 3D polygon; null if any corner is behind the camera. @param {number[][]} c @returns {Hull|null} */
function hull(c) {
  /** @type {[number, number][]} */ const pts = [];
  let z = 0;
  for (const [x, y, w] of c) {
    PV.set(x, y, w).project(S.cam);
    if (PV.z > 1 || PV.z < -1) return null;
    pts.push([((PV.x + 1) / 2) * VP.w, ((1 - PV.y) / 2) * VP.h]);
    z += PV.z;
  }
  return { pts, z: z / c.length };
}
/** Even-odd point-in-polygon. @param {number} x @param {number} y @param {[number, number][]} p @returns {boolean} */
function inside(x, y, p) {
  let r = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i],
      [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}
/** Room floor rect and the doorway in its front partition. @param {number} i @returns {Hull[]} */
function roomHulls(i) {
  const r = cur.rects[i],
    fz = r.z + r.d,
    cx = r.x + r.w / 2,
    out = [];
  const fl = hull([
    [r.x, 0, r.z],
    [r.x + r.w, 0, r.z],
    [r.x + r.w, 0, fz],
    [r.x, 0, fz],
  ]);
  if (fl) out.push(fl);
  const dr = hull([
    [cx - AJ, 0, fz],
    [cx + AJ, 0, fz],
    [cx + AJ, RH, fz],
    [cx - AJ, RH, fz],
  ]);
  if (dr) out.push(dr);
  return out;
}
/** Front face of a bookcase. @param {number} ci @returns {Hull[]} */
function caseHulls(ci) {
  const c = cur.cases[ci],
    s = c.s,
    z = c.z + (CD * s) / 2,
    x0 = c.x - (CW * s) / 2,
    x1 = c.x + (CW * s) / 2;
  const h = hull([
    [x0, 0, z],
    [x1, 0, z],
    [x1, BH * s, z],
    [x0, BH * s, z],
  ]);
  return h ? [h] : [];
}
/** Front face of a spine at rest on its slot. @param {number} b @returns {Hull[]} */
function spineHulls(b) {
  const A = IS.asg;
  if (A.asg[b] < 0) return [];
  sPos(A.asg[b], A.slot[b], b, pa);
  const J = S.jit[b],
    s = pa.s,
    hw = (J.th * s) / 2 + 0.01,
    z = pa.z + 0.36 * s,
    y0 = PL * s,
    y1 = (PL + J.h) * s;
  const h = hull([
    [pa.x - hw, y0, z],
    [pa.x + hw, y0, z],
    [pa.x + hw, y1, z],
    [pa.x - hw, y1, z],
  ]);
  return h ? [h] : [];
}
/** Everything hoverable at the current interactive level. @returns {{ kind: 'room'|'case'|'spine', list: Target[] }} */
function targets() {
  if (IS.lv === 0)
    return {
      kind: 'room',
      list: isExt() ? [] : [0, 1, 2, 3, 4, 5].map((i) => ({ id: i, hulls: roomHulls(i) })),
    };
  if (IS.lv === 1)
    return {
      kind: 'case',
      list: [0, 1, 2, 3, 4, 5, 6, 7]
        .map((k) => IS.room * 8 + k)
        .filter((ci) => IS.G.meta[ci])
        .map((ci) => ({ id: ci, hulls: caseHulls(ci) })),
    };
  if (IS.lv === 2 && !IS.path) {
    /** @type {Target[]} */ const list = [];
    for (let b = 0; b < BOOKS.length; b++)
      if (IS.asg.asg[b] === IS.ci && b !== IS.bk) list.push({ id: b, hulls: spineHulls(b) });
    return { kind: 'spine', list };
  }
  return { kind: 'room', list: [] };
}
/** Nearest target under the point. @param {number} x @param {number} y @returns {{ room: number, ci: number, b: number }} */
export function pick(x, y) {
  const { kind, list } = targets();
  let best = -1,
    bz = Infinity;
  for (const t of list)
    for (const h of t.hulls)
      if (h.z < bz && inside(x, y, h.pts)) {
        bz = h.z;
        best = t.id;
      }
  return {
    room: kind === 'room' ? best : -1,
    ci: kind === 'case' ? best : -1,
    b: kind === 'spine' ? best : -1,
  };
}
/** Bounding box of hulls (viewport px). @param {Hull[]} hs @returns {{ x: number, y: number, w: number, h: number }|null} */
function bbox(hs) {
  if (!hs.length) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const h of hs)
    for (const [x, y] of h.pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/**
 * Screen rect of a hoverable for a driver to aim at. Rooms and signposts by room index; shelves by
 * index within the current room (0..7, rank order; a global case index at L0); spines by slot on the focused shelf;
 * 'book' is the opened 3D book (index ignored).
 * @param {'room'|'shelf'|'spine'|'signpost'|'book'} kind @param {number} index @returns {{ x: number, y: number, w: number, h: number }|null}
 */
export function screenRectOf(kind, index) {
  if (kind === 'book') return IS && IS.bk >= 0 ? bookRect() : null;
  if (kind === 'room') return index >= 0 && index < 6 ? bbox(roomHulls(index)) : null;
  if (kind === 'signpost') {
    const o = S.rooms[index];
    if (!o || o.div.style.visibility === 'hidden') return null;
    const r = o.div.getBoundingClientRect(),
      v = /** @type {HTMLElement} */ (document.querySelector('#view')).getBoundingClientRect();
    return { x: r.left - v.left, y: r.top - v.top, w: r.width, h: r.height };
  }
  if (kind === 'shelf') {
    const ci = IS.lv >= 1 && IS.room >= 0 ? IS.room * 8 + index : index;
    return ci >= 0 && ci < 48 ? bbox(caseHulls(ci)) : null;
  }
  if (IS.ci < 0) return null;
  for (let b = 0; b < BOOKS.length; b++)
    if (IS.asg.asg[b] === IS.ci && IS.asg.slot[b] === index) return bbox(spineHulls(b));
  return null;
}

const BB = new THREE.Box3(),
  BC = new THREE.Vector3();
/** Bounding box of the opened 3D book's projected corners, null while it is hidden. @returns {{ x: number, y: number, w: number, h: number }|null} */
function bookRect() {
  if (!S.book.visible) return null;
  BB.setFromObject(S.book);
  if (BB.isEmpty()) return null;
  /** @type {Hull[]} */ const hs = [];
  for (let i = 0; i < 8; i++) {
    const h = hull([[i & 1 ? BB.max.x : BB.min.x, i & 2 ? BB.max.y : BB.min.y, i & 4 ? BB.max.z : BB.min.z]]);
    if (!h) return null;
    hs.push(h);
  }
  return bbox(hs);
}
/** @param {string} s @returns {string} */
const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'x';
/** One data object on screen, for the structure layer. @typedef {{ id: string, label: string, query: string, rect: { x: number, y: number, w: number, h: number } }} SceneObject */
/**
 * The data objects of the current interactive level with their screen rects, in a stable order:
 * rooms (L0, inside view only), the current room's bookcases (L1), the focused shelf's spines (L2),
 * the opened book (L3). Off-screen objects are left out. Call after the frame's camera is final.
 * @returns {{ sig: string, list: SceneObject[] }} `sig` changes only when the set or its queries/labels change
 */
export function sceneObjects() {
  /** @type {SceneObject[]} */ const list = [];
  if (!IS) return { sig: '', list };
  /** @param {string} id @param {string} label @param {string} query @param {{ x: number, y: number, w: number, h: number }|null} r */
  const add = (id, label, query, r) => {
    if (r && r.x < VP.w && r.y < VP.h && r.x + r.w > 0 && r.y + r.h > 0 && r.w > 0.5 && r.h > 0.5)
      list.push({ id, label, query, rect: r });
  };
  if (IS.lv === 0 && !isExt()) {
    const q = 'rooms_' + IS.ds.axis,
      seen = new Set();
    for (let i = 0; i < 6; i++) {
      const a = IS.G.ar[i];
      if (!a) continue;
      let id = 'room-' + slug(a.name);
      while (seen.has(id)) id += '-';
      seen.add(id);
      add(id, a.name, q, bbox(roomHulls(i)));
    }
  } else if (IS.lv === 1 && IS.room >= 0) {
    for (let k = 0; k < 8; k++) {
      const ci = IS.room * 8 + k,
        m = IS.G.meta[ci];
      if (m) add('shelf-' + slug(m.genre), m.genre, 'shelves', bbox(caseHulls(ci)));
    }
  } else if (IS.lv === 2 && IS.ci >= 0) {
    /** @type {[number, number][]} */ const on = [];
    for (let b = 0; b < BOOKS.length; b++)
      if (IS.asg.asg[b] === IS.ci && b !== IS.bk) on.push([IS.asg.slot[b], b]);
    on.sort((p, q) => p[0] - q[0]);
    for (const [, b] of on) add('book-' + BOOKS[b].isbn, BOOKS[b].title, 'topshelf', bbox(spineHulls(b)));
  } else if (IS.lv === 3 && IS.bk >= 0)
    add('book-' + BOOKS[IS.bk].isbn, BOOKS[IS.bk].title, 'book', bookRect());
  list.length = Math.min(list.length, 60);
  return { sig: list.map((o) => `${o.id}\t${o.label}\t${o.query}`).join('\n'), list };
}
