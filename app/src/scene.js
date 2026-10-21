// The three.js build: one low-poly library building in a meadow. Static at import time, except the
// spines (one instance per title) which `initBooks()` makes once the catalogue has loaded.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOOKS } from './data.js';
import { $, clamp, lerp, lcg, sm } from './util.js';
import { W, D, CW, CD, PL, BH, HC, RH, DW, AJ, v3 } from './layout.js';

/** @typedef {import('./layout.js').Layout} Layout */
/** @typedef {import('./layout.js').Shelf} Shelf */
/** @typedef {{ t: THREE.CanvasTexture, cv: HTMLCanvasElement }} CTex */

export const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
/** @param {number|string} w @param {number} px @returns {string} */
const PLX = (w, px) => `${w} ${px}px ${SANS}`;
const er = lcg(5), rnd = lcg(11), wr = lcg(7);

/* ---------- renderer, camera, lights ---------- */
export const canvas = /** @type {HTMLCanvasElement} */ ($('#c'));
export const R = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
R.setPixelRatio(Math.min(2, devicePixelRatio)); R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
R.localClippingEnabled = true; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.04;
export const BG = new THREE.Color('#0b0c10'), HAZE = new THREE.Color('#1c1d24');
export const scene = new THREE.Scene();
export const sceneBg = BG.clone(); scene.background = sceneBg;
export const fog = new THREE.Fog(BG.clone(), 90, 200); scene.fog = fog;
export const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
export const hemi = new THREE.HemisphereLight('#c9d2e6', '#1c2338', 0.42), amb = new THREE.AmbientLight('#27304a', .5); scene.add(hemi, amb);
// cool late-day skylight through the west windows: fills the shadows slate-blue so the lamps read warm
export const sky = new THREE.DirectionalLight('#8fa6d6', .55); sky.position.set(-60, 30, 25); scene.add(sky);
// the only shadow-casting light: late-afternoon sun through the west windows
const sun = new THREE.DirectionalLight('#ffbf78', 2.2); sun.position.set(-70, 46.7, -9.3); sun.target.position.set(0, 0, 0); scene.add(sun.target); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 46, bottom: -46, near: 20, far: 190 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.radius = 3; scene.add(sun);

/** @param {THREE.ColorRepresentation} c @param {THREE.MeshStandardMaterialParameters} [o] @returns {THREE.MeshStandardMaterial} */
export const flat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .82, metalness: 0, flatShading: true, ...o });
export const box = new THREE.BoxGeometry(1, 1, 1);
export const col = new THREE.Color(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), EU = new THREE.Euler(), V = new THREE.Vector3(), SC = new THREE.Vector3();
/**
 * A unit box scaled and placed. @param {THREE.Material} m @param {number} sx @param {number} sy @param {number} sz @param {number} x @param {number} y @param {number} z
 * @param {THREE.Object3D} [p] @param {boolean} [sh] @returns {THREE.Mesh}
 */
export const mk = (m, sx, sy, sz, x, y, z, p = scene, sh = true) => { const o = new THREE.Mesh(box, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = o.receiveShadow = sh; p.add(o); return o; };
/** @param {number} w @param {number} h @param {(g: CanvasRenderingContext2D) => void} draw @returns {CTex} */
export const ctex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(ctx2d(c));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return { t, cv: c };
};
/** @param {HTMLCanvasElement} c @returns {CanvasRenderingContext2D} */
export function ctx2d(c) { const g = c.getContext('2d'); if (!g) throw new Error('2d canvas unavailable'); return g; }
/** @template {THREE.Object3D} T @param {T} o @param {number} [x] @param {number} [y] @param {number} [z] @param {THREE.Object3D} [p] @returns {T} */
export const add = (o, x = 0, y = 0, z = 0, p = scene) => { o.position.set(x, y, z); p.add(o); return o; };

// herringbone parquet, extends past the walls
const hb = ctex(256, 256, (g) => { for (let c = 0; c < 8; c++) for (let r = -2; r < 18; r++) { const x = c * 32, y = r * 16; g.fillStyle = `hsl(${27 + rnd() * 9},${32 + rnd() * 12}%,${16 + rnd() * 11}%)`; g.beginPath();
  if (c % 2) { g.moveTo(x, y + 16); g.lineTo(x + 32, y); g.lineTo(x + 32, y + 16); g.lineTo(x, y + 32); } else { g.moveTo(x, y); g.lineTo(x + 32, y + 16); g.lineTo(x + 32, y + 32); g.lineTo(x, y + 16); }
  g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.stroke(); } }).t;
hb.repeat.set(15, 10.2); hb.anisotropy = 8;
{ const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + .6, D + .6), flat('#fff', { map: hb, flatShading: false, roughness: .6 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor); }
export const WIND = { value: 0 };
/** Wind sway for instanced grass and flowers. @template {THREE.Material} M @param {M} m @param {number} a @returns {M} */
const windy = (m, a) => { m.onBeforeCompile = (sh) => { sh.uniforms.uT = WIND; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
float ph = instanceMatrix[3].x * .37 + instanceMatrix[3].z * .23; transformed.x += sin(uT * 1.8 + ph) * ${a} * position.y; transformed.z += cos(uT * 1.3 + ph) * ${a * .6} * position.y;
#endif`); }; return m; };

/* ---------- exterior: unlit baked colours (Tiny Glade-ish) so nothing outside lights the interior ---------- */
/** Two grazing sheep: the body group and the head that dips. @type {{ g: THREE.Group, head: THREE.Mesh }[]} */
export const SHEEP = [];
/** @type {import('./layout.js').Pose} */
export const PEX = { p: v3(-108, 23, -96), q: v3(0, 0, 4), fn: 300, ff: 400, fov: 50, hz: 0 };
/** @type {import('./layout.js').Pose} */
export const PEX2 = { p: v3(-60, 6.5, 55), q: v3(-14, 3.5, 18), fn: 300, ff: 400, fov: 50, hz: 0 };
/** @type {import('./layout.js').Pose} */
export const PL2 = { p: v3(-34.6, 3.6, -3), q: v3(-30.5, 2.2, -24), fn: 14, ff: 70, fov: 60, hz: 1 };
export const SUN = v3(-70, 46.7, -9.3).normalize();
/** @param {THREE.MeshBasicMaterialParameters} [o] @returns {THREE.MeshBasicMaterial} */
const xb = (o = {}) => new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false, ...o });
/** @param {THREE.ColorRepresentation} h @returns {THREE.Color} */
const C3 = (h) => new THREE.Color(h);
/** @param {number} x @param {number} z @returns {number} */
const hsh = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
/** @param {number} x @param {number} z @returns {number} */
const vn = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), u = sm(x - xi), v = sm(z - zi); return lerp(lerp(hsh(xi, zi), hsh(xi + 1, zi), u), lerp(hsh(xi, zi + 1), hsh(xi + 1, zi + 1), u), v); };
const LIT = C3('#ffefcf'), SHD = C3('#7d8cc8');
/** @param {number} x @param {number} y @param {number} z @returns {number} */
const sunK = (x, y, z) => clamp((x * SUN.x + y * SUN.y + z * SUN.z + .1) / .8);
/** @param {THREE.Color} c @param {number} d @returns {THREE.Color} */
const shadeC = (c, d) => c.multiply(new THREE.Color().copy(SHD).lerp(LIT, d).multiplyScalar(lerp(.92, 1.06, d)));
/** Bake a colour (plus a fake sun term) into vertex colours. @param {THREE.BufferGeometry} g @param {(x: number, y: number, z: number) => THREE.Color} f @param {number} [sh] @returns {THREE.BufferGeometry} */
const bake = (g, f, sh = 1) => { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); const p = g.attributes.position, n = g.attributes.normal, c = [];
  for (let i = 0; i < p.count; i++) { const q = f(p.getX(i), p.getY(i), p.getZ(i)).clone(); if (sh) shadeC(q, sunK(n.getX(i), n.getY(i), n.getZ(i))); c.push(q.r, q.g, q.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g; };
/** Field height outside the walls. @param {number} x @param {number} z @returns {number} */
export const fH = (x, z) => { const d = Math.max(Math.abs(x) - W / 2, Math.abs(z) - D / 2, 0); return (vn(x * .022, z * .022) * 7 + vn(x * .07, z * .07) * 1.6 - 3.5) * sm((d - 5) / 30) - .15; };
/** @param {number} z @returns {number} */
const PATH = (z) => Math.sin((z - D / 2) * .09) * 3 * clamp((z - D / 2 - 3) / 8);
/** @param {number} x @param {number} z @returns {number} */
const dW = (x, z) => Math.max(Math.abs(x) - W / 2, Math.abs(z) - D / 2);
/** @param {number} x @param {number} z @returns {boolean} */
const onPath = (x, z) => z > D / 2 && Math.abs(x - PATH(z)) < 1.6;
{ const g = new THREE.PlaneGeometry(600, 600, 120, 120).rotateX(-Math.PI / 2), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, fH(p.getX(i), p.getZ(i)));
  const M1 = C3('#9cc35f'), M2 = C3('#80ae50'), M3 = C3('#5f8f45'), MW = C3('#b6cf7c'), HZ = C3('#cfd8c0'), t = new THREE.Color();
  const FG = bake(g, (x, y, z) => { const n = vn(x * .05 + 9, z * .05); t.copy(n < .5 ? M3 : M2).lerp(n < .5 ? M2 : M1, (n % .5) * 2); if (dW(x, z) < 4 || onPath(x, z + 1)) t.lerp(MW, .5);
    return t.lerp(HZ, clamp((Math.hypot(x, z) - 160) / 200) * .45); }); scene.add(new THREE.Mesh(FG, xb()));
  /** @param {number} x @param {number} z @param {import('./layout.js').Pose} P */
  const cor = (x, z, P) => { const ax = P.q.x, az = P.q.z, bx = P.p.x - ax, bz = P.p.z - az, u = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz)); return Math.hypot(x - ax - bx * u, z - az - bz * u); };
  /** @param {number} x @param {number} z */
  const ok = (x, z) => dW(x, z) > 12 && !(x < -W / 2 && x > -W / 2 - 34 && Math.abs(z + .133 * (-W / 2 - x)) < D / 2 + 20) && !(z > D / 2 && Math.abs(x - PATH(z)) < 9 && z < D / 2 + 60) && cor(x, z, PEX) > 16 && cor(x, z, PEX2) > 10;
  const TR = /** @type {[number, number, number, number, number, number][]} */ ([]);
  /** @param {number} x @param {number} z @param {number} k @param {number} b */
  const push = (x, z, k, b) => { if (ok(x, z)) TR.push([x, fH(x, z), z, k, er(), b]); };
  for (let i = 0; i < 26; i++) { const a = er() * 6.3, r = 52 + er() * 50; push(Math.cos(a) * r, Math.sin(a) * r * .85, .8 + er() * .5, 0); }
  for (let c = 0; c < 34 && TR.length < 282; c++) { const a = c / 34 * 6.3 + er() * .2, r = 115 + er() * 110, cx = Math.cos(a) * r, cz = Math.sin(a) * r * .9; for (let i = 0; i < 7 + er() * 6; i++) push(cx + (er() - .5) * 34, cz + (er() - .5) * 34, (1.3 + er() * 1.1) * (.8 + r / 300), 0); }
  for (let i = 0; i < 18; i++) { const s = i % 4, u = er() * 2 - 1, x = s < 2 ? u * W / 2 : (s === 2 ? -1 : 1) * (W / 2 + 3 + er() * 2), z = s < 2 ? (s ? -1 : 1) * (D / 2 + 3 + er() * 2) : u * D / 2; if (!onPath(x, z + 2) && !(s === 2)) TR.push([x, fH(x, z), z, .35 + er() * .2, er(), 1]); }
  const blob = bake(new THREE.IcosahedronGeometry(1, 1), () => C3('#fff')), tk = new THREE.InstancedMesh(bake(new THREE.CylinderGeometry(.3, .5, 1, 6), () => C3('#7a5a40')), xb(), TR.length), cr = new THREE.InstancedMesh(blob, xb(), TR.length * 4);
  const L1 = C3('#c4d98a'), L2 = C3('#9fbf7a');
  const L3 = C3('#7fa37a');
  TR.forEach(([x, y, z, k, h, b], i) => { M4.compose(V.set(x, y + (b ? -9 : 1.1 * k), z), Q.identity(), SC.set(k * 1.2, b ? .01 : 2.4 * k, k * 1.2)); tk.setMatrixAt(i, M4);
    [[0, 3.4, 0, 2.3], [1.3, 2.9, .6, 1.7], [-1.2, 3, -.5, 1.8], [.2, 4.6, -.2, 1.6]].forEach(([dx, dy, dz, r], l) => { const kk = b ? k * 1.4 : k; M4.compose(V.set(x + dx * kk, y + (b ? dy * .35 : dy) * kk, z + dz * kk), Q.identity(), SC.set(r * kk, r * kk * .85, r * kk)); cr.setMatrixAt(i * 4 + l, M4);
      cr.setColorAt(i * 4 + l, t.copy(l === 3 ? L1 : h < .5 ? L2 : L3).lerp(HZ, clamp((Math.hypot(x, z) - 150) / 160) * .5)); }); });
  [tk, cr].forEach((m) => { m.castShadow = true; scene.add(m); });
  // meadow tufts, wildflower dots and lupin spikes
  const tuf = /** @type {number[]} */ ([]); const tc = /** @type {number[]} */ ([]);
  for (let b = 0; b < 7; b++) { const a = b * .9 + er(), r = .08 + er() * .1, x = Math.cos(a) * r, z = Math.sin(a) * r, lx = x * 2.2, lz = z * 2.2, w = .045, h = .7 + er() * .5; tuf.push(x - w, 0, z, x + w, 0, z, lx, h, lz, x, 0, z - w, x, 0, z + w, lx, h, lz); tc.push(.55, .6, .5, .55, .6, .5, 1.25, 1.2, .9, .55, .6, .5, .55, .6, .5, 1.25, 1.2, .9); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tuf, 3)); tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  const NT = 2600, gm = new THREE.InstancedMesh(tg, windy(xb({ side: THREE.DoubleSide }), .16), NT), G1 = C3('#7fae52'), G2 = C3('#a7c766'); const FW = /** @type {[number, number][]} */ ([]); const LU = /** @type {[number, number][]} */ ([]); let n = 0;
  while (n < NT) { const x = (er() * 2 - 1) * 90, z = (er() * 2 - 1) * 75, d = dW(x, z); if (d < .8 || er() > Math.exp(-d / 16)) continue; const mown = d < 3.5 || onPath(x, z), k = (mown ? .35 : .8 + er() * .7) * (onPath(x, z) && Math.abs(x - PATH(z)) < 1 ? 0 : 1);
    Q.setFromEuler(EU.set(0, er() * 6.3, 0)); M4.compose(V.set(x, fH(x, z) - .05, z), Q, SC.set(k + .4, k, k + .4)); gm.setMatrixAt(n, M4); gm.setColorAt(n++, t.copy(G1).lerp(G2, er()));
    if (!mown && er() < .35) FW.push([x + er() - .5, z + er() - .5]); if (!mown && vn(x * .12, z * .12) > .66 && er() < .6) LU.push([x, z]); }
  scene.add(gm);
  const fd = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.1, 0).translate(0, .42, 0), windy(new THREE.MeshBasicMaterial({ fog: false, toneMapped: false }), .1), FW.length), FC = ['#fbf6ea', '#e2574c', '#f2c94c', '#a9c8f0'].map(C3);
  FW.forEach(([x, z], i) => { M4.compose(V.set(x, fH(x, z) - .05, z), Q.identity(), SC.setScalar(.8 + er() * .6)); fd.setMatrixAt(i, M4); fd.setColorAt(i, FC[i % 4]); });
  const lp = new THREE.InstancedMesh(bake(new THREE.ConeGeometry(.09, .7, 5).translate(0, .75, 0), (x, y) => C3('#5d47b8').lerp(C3('#b7a2f0'), clamp((y - .4) / .7))), windy(xb(), .12), LU.length);
  LU.forEach(([x, z], i) => { M4.compose(V.set(x, fH(x, z) - .05, z), Q.identity(), SC.setScalar(.8 + er() * .7)); lp.setMatrixAt(i, M4); });
  scene.add(fd, lp);
  // flowerbeds with cream stone borders
  { const BEDS = [[-17, D / 2 + 2.1, 10, 1.8], [17, D / 2 + 2.1, 10, 1.8], [W / 2 + 2.1, -6, 1.8, 11], [-6, -D / 2 - 2.1, 14, 1.8], [W / 2 + 2.1, 12, 1.8, 7]];
    /** @param {number} w @param {number} h @param {number} d */
    const stone = (w, h, d) => bake(new THREE.BoxGeometry(w, h, d), () => C3('#e7dcc2')); const FL = /** @type {[number, number, number][]} */ ([]);
    BEDS.forEach(([x, z, w, d]) => { const y = -.15; [[0, d / 2, w + .3, .26], [0, -d / 2, w + .3, .26], [w / 2, 0, .26, d], [-w / 2, 0, .26, d]].forEach(([dx, dz, a, b]) => add(new THREE.Mesh(stone(a, .34, b), xb()), x + dx, y + .17, z + dz));
      add(new THREE.Mesh(bake(new THREE.BoxGeometry(w, .2, d), () => C3('#5b4331')), xb()), x, y + .14, z); for (let i = 0; i < w * d * 5; i++) FL.push([x + (er() - .5) * (w - .4), y + .2, z + (er() - .5) * (d - .4)]); });
    const st = new THREE.InstancedMesh(new THREE.BoxGeometry(.03, .45, .03).translate(0, .225, 0), windy(new THREE.MeshBasicMaterial({ color: '#5f8f3e', fog: false, toneMapped: false }), .12), FL.length), hd = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.1, 0).translate(0, .47, 0), windy(new THREE.MeshBasicMaterial({ fog: false, toneMapped: false }), .12), FL.length), fc = ['#f2c94c', '#e2574c', '#fbf6ea', '#9b6fd1'].map(C3);
    FL.forEach(([x, y, z], i) => { M4.compose(V.set(x, y, z), Q.identity(), SC.setScalar(.8 + er() * .5)); st.setMatrixAt(i, M4); hd.setMatrixAt(i, M4); hd.setColorAt(i, fc[i % 4]); }); scene.add(st, hd); }
  // stone path from the entrance, two grazing sheep, lanterns by the door
  { const ps = new THREE.InstancedMesh(bake(new THREE.CylinderGeometry(1, 1, .12, 7), () => C3('#e9dfc8')), xb(), 44); for (let i = 0; i < 44; i++) { const z = D / 2 + 1 + i * .95, x = PATH(z) + (i % 2 ? .45 : -.45) + (er() - .5) * .3; M4.compose(V.set(x, fH(x, z) + .02, z), Q.setFromEuler(EU.set(0, er() * 3, 0)), SC.set(.55 + er() * .2, 1, .45 + er() * .15)); ps.setMatrixAt(i, M4); } scene.add(ps);
    const wool = xb(), dk = new THREE.MeshBasicMaterial({ color: '#3a3438', fog: false, toneMapped: false });
    const mkS = () => { const g = new THREE.Group(), b = new THREE.Mesh(bake(new THREE.IcosahedronGeometry(.7, 1), () => C3('#f6f1e6')), wool); b.scale.set(1.35, .9, 1); g.add(b); const head = add(new THREE.Mesh(new THREE.IcosahedronGeometry(.3, 0), dk), .95, .1, 0, g); [[-.5, -.35], [-.5, .35], [.5, -.35], [.5, .35]].forEach(([x, z]) => add(new THREE.Mesh(new THREE.BoxGeometry(.13, .6, .13), dk), x, -.65, z, g)); scene.add(g); g.traverse((m) => (m.castShadow = true)); return { g, head }; };
    SHEEP.push(mkS(), mkS());
    [-2.6, 2.6].forEach((x) => { const z = D / 2 + 1.3, y = fH(x, z); add(new THREE.Mesh(new THREE.BoxGeometry(.14, 2.2, .14), dk), x, y + 1.1, z); add(new THREE.Mesh(new THREE.BoxGeometry(.42, .5, .42), new THREE.MeshBasicMaterial({ color: '#ffd38a', fog: false, toneMapped: false })), x, y + 2.4, z); add(new THREE.Mesh(new THREE.ConeGeometry(.36, .3, 4).rotateY(Math.PI / 4), dk), x, y + 2.8, z); }); }
  // real shadow mapping outdoors: a zero-intensity copy of the sun, read only by a ShadowMaterial over the field
  const sx = new THREE.DirectionalLight('#fff', 0); sx.position.copy(SUN).multiplyScalar(320); sx.castShadow = true; Object.assign(sx.shadow.camera, { left: -230, right: 230, top: 230, bottom: -230, near: 60, far: 700 });
  sx.shadow.mapSize.set(2048, 2048); sx.shadow.bias = -.0015; sx.shadow.radius = 4; scene.add(sx, sx.target);
  const fs = new THREE.Mesh(FG, new THREE.ShadowMaterial({ color: '#3a4a86', opacity: .38, polygonOffset: true, polygonOffsetFactor: -2 })); fs.receiveShadow = true; scene.add(fs); }
// sky: pastel dome, soft cumulus, a sun glow where the shadow light comes from
export const dome = new THREE.Mesh(bake(new THREE.SphereGeometry(300, 24, 12), (x, y, z) => { const k = clamp(y / 300), g = Math.max(0, (x * SUN.x + y * SUN.y + z * SUN.z) / 300); return C3('#f7dcb4').lerp(C3('#6cbde9'), Math.pow(k, .5)).lerp(C3('#ffd9b0'), Math.pow(g, 5) * .8); }, 0), xb({ side: THREE.BackSide, depthWrite: false, toneMapped: false }));
dome.renderOrder = -2; scene.add(dome);
// low-poly clouds: 4–8 flattened, flat-shaded icosahedra per cloud merged into one mesh; white tops, a faint warm underside, the same fake sun term as the field
const cloudM = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false, transparent: true, opacity: .93, depthWrite: true });
/** Clouds with their orbit parameters [angle, radius, height]. @type {{ s: THREE.Object3D, u: [number, number, number] }[]} */
export const CLOUDS = [...Array(10)].map(() => {
  const n = 4 + Math.floor(er() * 5), k = 10 + er() * 8, parts = [];
  for (let i = 0; i < n; i++) {
    const r = k * (.55 + er() * .5) * (i === 0 ? 1.25 : 1), g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1.25, .62, 1); g.translate((i / Math.max(1, n - 1) - .5) * k * 3.2 + (er() - .5) * k * .6, (i === 0 ? .25 : er() * .3) * k, (er() - .5) * k * 1.1);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const geo = mergeGeometries(parts); geo.computeVertexNormals();
  { const p = geo.attributes.position, nn = geo.attributes.normal, cc = [], t = new THREE.Color(), top = C3('#ffffff'), under = C3('#f2dcc6');
    // white tops, a faint warm underside; facets differ only slightly in brightness (sunlit side a touch brighter)
    for (let i = 0; i < p.count; i++) { t.copy(top).lerp(under, clamp((-p.getY(i) + k * .1) / (k * .9)) * .85).multiplyScalar(.9 + .1 * sunK(nn.getX(i), nn.getY(i), nn.getZ(i))); cc.push(t.r, t.g, t.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); }
  const m = new THREE.Mesh(geo, cloudM); m.castShadow = m.receiveShadow = false; m.rotation.y = er() * 6.3; m.renderOrder = -1; scene.add(m);
  return { s: m, u: /** @type {[number, number, number]} */ ([er() * 6.3, 200 + er() * 50, 55 + er() * 60]) };
});
export const sunS = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex(128, 128, (g) => { const q = g.createRadialGradient(64, 64, 0, 64, 64, 64); q.addColorStop(0, '#fff'); q.addColorStop(.16, 'rgba(255,248,226,1)'); q.addColorStop(.3, 'rgba(255,222,170,.5)'); q.addColorStop(1, 'rgba(255,205,150,0)'); g.fillStyle = q; g.fillRect(0, 0, 128, 128); }).t, fog: false, depthWrite: false, toneMapped: false })); sunS.scale.setScalar(110); sunS.renderOrder = -1; scene.add(sunS);

/* ---------- the building ---------- */
/** @param {string} a @param {string} b @param {number} [n] @returns {THREE.CanvasTexture} */
const woodT = (a, b, n = 9) => ctex(64, 128, (g) => { g.fillStyle = a; g.fillRect(0, 0, 64, 128); for (let i = 0; i < n; i++) { const y = wr() * 128, h = 3 + wr() * 10; g.globalAlpha = .35 + wr() * .5; g.fillStyle = b; g.fillRect(0, y, 64, h); }
  g.globalAlpha = .18; g.fillStyle = '#000'; for (let i = 0; i < 26; i++) g.fillRect(0, wr() * 128, 64, 1); g.globalAlpha = 1; }).t;
const plaster = flat('#69635d'), wallM = flat('#4a3b31'), greenM = flat('#2c4339'), caseM = flat('#fff', { map: woodT('#4a2417', '#5e3322') }), shelfM = flat('#3b2a1f'), tableM = flat('#fff', { map: woodT('#6a4528', '#7d5634', 6) }),
  backM = flat('#22140c'), dark = flat('#1c1612'), brass = flat('#c08a3e', { metalness: .6, roughness: .35 });
// outer walls; the east-facing front wall drops for the bird's-eye cut-away
export const frontW = mk(plaster, W + 1, HC, .5, 0, HC / 2, D / 2 + .25); mk(plaster, W + 1, HC, .5, 0, HC / 2, -D / 2 - .25); mk(plaster, .5, HC, D + 1, W / 2 + .25, HC / 2, 0);
// limestone skins on the outside faces, ivy, a door, and a terracotta roof shown only from the exterior cameras
const lime = ctex(512, 256, (g) => { g.fillStyle = '#cfc2a4'; g.fillRect(0, 0, 512, 256); for (let r = 0; r < 8; r++) { let x = -er() * 60; while (x < 512) { const w = 40 + er() * 70, c = 222 + er() * 22 | 0; g.fillStyle = `rgb(${c},${c - 8 - er() * 8 | 0},${c - 30 - er() * 14 | 0})`; g.fillRect(x + 2, r * 32 + 2, w - 4, 28); x += w; } } }).t;
/** @param {number} w @param {number} h @param {number} x @param {number} y @param {number} z @param {number} ry @param {number} lit @returns {THREE.Mesh} */
const skin = (w, h, x, y, z, ry, lit) => { const t = lime.clone(); t.needsUpdate = true; t.repeat.set(w / 4.8, h / 2.4); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, fog: false, toneMapped: false, color: lit ? '#fff3dc' : '#bdb8d2' })); m.rotation.y = ry; add(m, x, y, z); return m; };
export const frontSkin = skin(W + 1, HC, 0, HC / 2, D / 2 + .52, 0, 0); skin(W + 1, HC, 0, HC / 2, -D / 2 - .52, Math.PI, 0); skin(D + 1, HC, W / 2 + .52, HC / 2, 0, Math.PI / 2, 0);
{ const X = -W / 2 - .52, Rr = -Math.PI / 2; skin(D + 1, 1.2, X, .6, 0, Rr, 1); skin(D + 1, HC - 5.8, X, (HC + 5.8) / 2, 0, Rr, 1); let zp = -D / 2 - .5; [-18, -9, 0, 9, 18, D / 2 + .5 + 1.7].forEach((z) => { const a = z - 1.7; skin(a - zp, 4.6, X, 3.5, (a + zp) / 2, Rr, 1); zp = z + 1.7; }); }
export const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.4), new THREE.MeshBasicMaterial({ map: ctex(64, 96, (g) => { g.fillStyle = '#c9b48f'; g.fillRect(0, 0, 64, 96); g.fillStyle = '#5a3a26'; g.beginPath(); g.moveTo(6, 96); g.lineTo(6, 32); g.arc(32, 32, 26, Math.PI, 0); g.lineTo(58, 96); g.fill(); g.fillStyle = '#6d4830'; for (let x = 10; x < 56; x += 9) g.fillRect(x, 30, 2, 66); }).t, fog: false, toneMapped: false, color: '#b9c3d8' })); add(door, 0, 1.7, D / 2 + .54);
{ const lv = /** @type {[number, number, number, number][]} */ ([]); /** @type {[number, number][]} */ const walls = [[-D / 2 - .58, 0], [W / 2 + .58, 1]];
  walls.forEach(([c, ax]) => { for (let k = 0; k < 3; k++) { const u = (er() - .5) * (ax ? D * .7 : W * .7), hgt = 3 + er() * 3.5; for (let i = 0; i < 150; i++) { const y = er() * hgt, sp = 4.5 * (1 - y / hgt * .5); lv.push(ax ? [c, y, u + (er() - .5) * sp, ax] : [u + (er() - .5) * sp, y, c, ax]); } } });
  const iv = new THREE.InstancedMesh(new THREE.PlaneGeometry(.38, .3), new THREE.MeshBasicMaterial({ fog: false, toneMapped: false, side: THREE.DoubleSide }), lv.length); lv.forEach(([x, y, z, ax], i) => { M4.compose(V.set(x, y + .2, z), Q.setFromEuler(EU.set(0, ax ? Math.PI / 2 : 0, er() * 3)), SC.setScalar(.7 + er() * .6)); iv.setMatrixAt(i, M4); iv.setColorAt(i, C3(i % 3 ? '#4f7f4a' : '#6f9a50')); }); scene.add(iv); }
export const roof = new THREE.Group();
{ const tile = ctex(128, 128, (g) => { g.fillStyle = '#8f5a48'; g.fillRect(0, 0, 128, 128); for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const v = 196 + er() * 34 | 0; g.fillStyle = `rgb(${v},${v * .6 | 0},${v * .47 | 0})`; g.beginPath(); g.roundRect(c * 16 + (r % 2) * 8 - 8 + 1, r * 16 + 1, 15, 14, [0, 0, 7, 7]); g.fill(); } }).t;
  const H = 5, ov = 1, Lr = W + 2 * ov, sl = Math.hypot(D / 2 + ov, H);
  /** @type {[number, string][]} */ const sides = [[1, '#d9b8a8'], [-1, '#b8a8bc']];
  sides.forEach(([s, c]) => { const t = tile.clone(); t.needsUpdate = true; t.repeat.set(Lr / 3, sl / 3); const m = new THREE.Mesh(new THREE.PlaneGeometry(Lr, sl), new THREE.MeshBasicMaterial({ map: t, fog: false, toneMapped: false, color: c, side: THREE.DoubleSide })); m.rotation.set(-s * (Math.PI / 2 - Math.atan2(H, D / 2 + ov)), 0, 0); m.position.set(0, HC + H / 2, s * (D / 2 + ov) / 2); roof.add(m); });
  /** @type {[number, string][]} */ const gables = [[-1, '#f3e3c6'], [1, '#aeb8cc']];
  gables.forEach(([s, c]) => { const sh = new THREE.Shape([new THREE.Vector2(-D / 2 - .5, 0), new THREE.Vector2(D / 2 + .5, 0), new THREE.Vector2(0, H)]), t = lime.clone(); t.needsUpdate = true; t.repeat.set(1 / 4.8, 1 / 2.4); const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ map: t, color: c, fog: false, toneMapped: false, side: THREE.DoubleSide })); m.rotation.y = Math.PI / 2; m.position.set(s * (W / 2 + .5), HC, 0); roof.add(m); });
  roof.traverse((m) => (m.castShadow = true)); roof.visible = false; scene.add(roof); }
const WZ = [-18, -9, 0, 9, 18];
export const WW = 3.4, wy0 = 1.2, wy1 = 5.8, lx = -W / 2 - .25;
mk(plaster, .5, wy0, D + 1, lx, wy0 / 2, 0); mk(plaster, .5, HC - wy1, D + 1, lx, (HC + wy1) / 2, 0);
{ let zp = -D / 2 - .5; [...WZ, D / 2 + .5 + WW / 2].forEach((z) => { const a = z - WW / 2; mk(plaster, .5, wy1 - wy0, a - zp, lx, (wy0 + wy1) / 2, (a + zp) / 2); zp = z + WW / 2; }); }
const glass = new THREE.MeshBasicMaterial({ color: '#fff0d6', transparent: true, opacity: .14, depthWrite: false, fog: false }), curtM = flat('#6a231c', { side: THREE.DoubleSide });
/** @type {THREE.Group[]} */
export const curtains = [];
WZ.forEach((z) => { mk(dark, .14, wy1 - wy0, .1, lx + .1, (wy0 + wy1) / 2, z); [2.7, 4.3].forEach((y) => mk(dark, .14, .1, WW, lx + .1, y, z));
  const g = new THREE.Mesh(new THREE.PlaneGeometry(WW, wy1 - wy0), glass); g.rotation.y = Math.PI / 2; add(g, lx + .05, (wy0 + wy1) / 2, z);
  [-1, 1].forEach((sd) => { const pv = add(new THREE.Group(), lx + .45, 6.2, z + sd * (WW / 2 + .35)), c = new THREE.Mesh(new THREE.PlaneGeometry(.8, 5.4, 1, 6), curtM); c.rotation.y = Math.PI / 2; c.position.y = -2.7; c.castShadow = true; pv.add(c); curtains.push(pv); }); });
// light shafts + dust in them (additive, unshadowed); clipped at the first partition: no sun inside a data room
const CLIP = [new THREE.Plane(v3(-1, 0, 0), -W / 2 + 5.85)];
/** @type {THREE.MeshBasicMaterial} */
export let shaftM;
{ const pos = /** @type {number[]} */ ([]); const cl = /** @type {number[]} */ ([]); const uv = /** @type {number[]} */ ([]);
  /** @param {number} y @param {number} z @param {number} [fl] @returns {number[]} */
  const P = (y, z, fl) => { const s = fl ? y / 40 : 0; return [lx + .3 + 60 * s, y - 40 * s, z + 8 * s]; };
  [-18, -9, 0].forEach((zc) => { const z0 = zc - WW / 2, z1 = zc + WW / 2, q = [[P(wy1, z0), P(wy1, z1), P(wy1, z1, 1), P(wy1, z0, 1)], [P(wy0, z0), P(wy0, z1), P(wy0, z1, 1), P(wy0, z0, 1)], [P(wy1, z0), P(wy0, z0), P(wy0, z0, 1), P(wy1, z0, 1)], [P(wy1, z1), P(wy0, z1), P(wy0, z1, 1), P(wy1, z1, 1)]];
    q.forEach(([a, b, c, d]) => [a, b, c, a, c, d].forEach((v, n) => { pos.push(...v); uv.push(...[[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]][n]); const k = [0, 1, 3].includes(n) && v[1] > .1 ? .9 : .15; cl.push(k, k * .8, k * .58); })); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const smt = ctex(64, 64, (x) => { for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) { const v = Math.pow(Math.sin(Math.PI * (i + .5) / 64), 1.6) * Math.pow(1 - j / 64, .7) * 255 | 0; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(i, j, 1, 1); } }).t; smt.colorSpace = THREE.NoColorSpace;
  shaftM = new THREE.MeshBasicMaterial({ map: smt, vertexColors: true, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, clippingPlanes: CLIP });
  scene.add(new THREE.Mesh(g, shaftM)); }
export const sdust = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: '#ffd9a0', size: .03, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, clippingPlanes: CLIP }));
sdust.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(720), 3));
/** @type {[number, number, number, number][]} */
export const sdr = [...Array(240)].map(() => /** @type {[number, number, number, number]} */ ([rnd(), rnd(), rnd(), rnd()])); scene.add(sdust);
// ceiling: coffered beams, invisible from above (cut-away)
export const ceil = new THREE.Group(); scene.add(ceil); mk(backM, W + 1, .3, D + 1, 0, HC + .15, 0, ceil);
for (let x = -35; x <= 35; x += 5) mk(wallM, .35, .5, D, x, HC - .25, 0, ceil, false); for (let z = -22.5; z <= 22.5; z += 5) mk(wallM, W, .4, .3, 0, HC - .2, z, ceil, false);
// floor-to-ceiling wall shelves (static instanced spines) on the back and east walls
{ const rows = 7, pit = .155; const m = /** @type {number[][]} */ ([]); const cs = /** @type {number[]} */ ([]);
  /** @param {number} len @param {(s: number, y: number, h: number) => number[]} put */
  const wall = (len, put) => { for (let r = 0; r < rows; r++) { const y = .32 + r * .93; for (let s = .4; s < len - .4; s += pit) { const h = .62 + rnd() * .2; m.push(put(s, y + h / 2, h)); cs.push(rnd()); } } };
  wall(W, (s, y, h) => [s - W / 2, y, -D / 2 + .25, pit * .8, h, .4]); wall(D, (s, y, h) => [W / 2 - .25, y, s - D / 2, .4, h, pit * .8]);
  const im = new THREE.InstancedMesh(box, flat('#fff'), m.length); m.forEach((a, i) => { M4.compose(V.set(a[0], a[1], a[2]), Q.identity(), SC.set(a[3], a[4], a[5])); im.setMatrixAt(i, M4); im.setColorAt(i, col.setHSL(cs[i], .28, .22 + cs[i] * .14)); });
  im.receiveShadow = true; scene.add(im);
  for (let r = 0; r <= rows; r++) { const y = .3 + r * .93 - .03; mk(shelfM, W, .06, .55, 0, y, -D / 2 + .27, scene, false); mk(shelfM, .55, .06, D, W / 2 - .27, y, 0, scene, false); }
  for (let x = -W / 2; x <= W / 2; x += 6.1) mk(shelfM, .12, HC, .6, x, HC / 2, -D / 2 + .3, scene, false); for (let z = -D / 2; z <= D / 2; z += 6.2) mk(shelfM, .6, HC, .12, W / 2 - .3, HC / 2, z, scene, false);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1, 6), brass); rail.scale.y = W; rail.rotation.z = Math.PI / 2; add(rail, 0, 6.45, -D / 2 + .62); const r2 = rail.clone(); r2.scale.y = D; r2.rotation.set(Math.PI / 2, 0, 0); add(r2, W / 2 - .62, 6.45, 0); }
// mezzanine + spiral stair in the north-east corner
{ const x0 = 4, x1 = W / 2 - .6, cx = (x0 + x1) / 2, zf = -D / 2 + 2.6; mk(shelfM, x1 - x0, .25, 2.1, cx, 3.6, -D / 2 + 1.55); mk(wallM, x1 - x0, .08, .1, cx, 4.65, zf);
  const n = Math.floor((x1 - x0) / .45), bal = new THREE.InstancedMesh(box, dark, n); for (let i = 0; i < n; i++) { M4.compose(V.set(x0 + i * .45, 4.15, zf), Q.identity(), SC.set(.05, 1, .05)); bal.setMatrixAt(i, M4); } scene.add(bal);
  [x0 + .3, cx, x1 - 3].forEach((x) => mk(dark, .2, 3.5, .2, x, 1.75, zf - .1));
  const sx = W / 2 - 2.2, sz = -D / 2 + 3.4, st = new THREE.InstancedMesh(box, shelfM, 18); st.castShadow = true;
  for (let i = 0; i < 18; i++) { const a = i * .4 + 1.2; Q.setFromEuler(EU.set(0, -a, 0)); M4.compose(V.set(sx + Math.cos(a) * .75, .2 * (i + 1), sz + Math.sin(a) * .75), Q, SC.set(1.5, .08, .5)); st.setMatrixAt(i, M4); }
  scene.add(st); mk(dark, .14, 4.6, .14, sx, 2.3, sz); }
// glow sprite + banker's lamp + reading table
/** @param {string} c0 @returns {THREE.SpriteMaterial} */
const gsp = (c0) => new THREE.SpriteMaterial({ map: ctex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, c0); r.addColorStop(.3, 'rgba(255,170,80,.22)'); r.addColorStop(1, 'rgba(255,150,60,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }).t, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
export const glowM = gsp('rgba(255,200,120,.7)');
const greenG = gsp('rgba(200,255,170,.7)'), shadeG = flat('#1f6b3a', { emissive: '#2c8a4a', emissiveIntensity: .6 });
/** @param {THREE.Object3D} p @param {number} x @param {number} z @param {number} [len] @returns {THREE.Group} */
function table(p, x, z, len = 1.7) { const g = add(new THREE.Group(), x, 0, z, p); mk(tableM, len, .08, .9, 0, .76, 0, g); mk(dark, .08, .72, .8, -len / 2 + .12, .36, 0, g); mk(dark, .08, .72, .8, len / 2 - .12, .36, 0, g);
  const l = add(new THREE.Group(), len / 2 - .35, .8, -.15, g); mk(brass, .22, .04, .14, 0, .02, 0, l, false); mk(brass, .03, .32, .03, 0, .18, 0, l, false);
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .42, 8, 1, false, 0, Math.PI), shadeG); sh.rotation.z = Math.PI / 2; add(sh, 0, .36, 0, l);
  const gl = new THREE.Sprite(greenG); gl.scale.setScalar(1.4); add(gl, 0, .25, .1, l); return g; }
/** A chair at each end of a room's reading table, facing in. @param {THREE.Group} g @param {number} len @returns {THREE.Group} */
function chairs(g, len) { [-1, 1].forEach((e) => { const c = add(new THREE.Group(), e * (len / 2 + .38), 0, 0, g); c.rotation.y = -e * Math.PI / 2; mk(tableM, .46, .05, .44, 0, .46, 0, c); mk(tableM, .46, .5, .05, 0, .72, -.2, c);
  [[-.19, -.18], [.19, -.18], [-.19, .18], [.19, .18]].forEach(([x, z]) => mk(dark, .04, .44, .04, x, .22, z, c)); }); return g; }
// west reading gallery: long tables, a sleeping cat, a ceiling fan, a wall clock
table(scene, -34.3, -13.5, 4.2).rotation.y = Math.PI / 2; table(scene, -34.3, 5, 4.2).rotation.y = Math.PI / 2;
const catM = flat('#c98446');
/** @type {{ g: THREE.Group, tail: THREE.Group, ph: number }[]} */
export const CATS = [];
/** @param {THREE.Object3D} p @param {number} x @param {number} y @param {number} z */
function mkCat(p, x, y, z) { const cat = add(new THREE.Group(), x, y, z, p), b = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 1), catM); b.scale.set(1.5, .7, 1); cat.add(b); add(new THREE.Mesh(new THREE.IcosahedronGeometry(.12, 1), catM), .3, .04, .06, cat);
  [-.05, .06].forEach((e) => add(new THREE.Mesh(new THREE.ConeGeometry(.04, .08, 4), catM), .3, .15, .06 + e, cat)); cat.children.forEach((c) => (c.castShadow = true));
  const tail = add(new THREE.Group(), -.3, -.02, 0, cat); mk(catM, .05, .05, .4, 0, 0, .2, tail); CATS.push({ g: cat, tail, ph: CATS.length * 2.1 }); }
mkCat(scene, -34.2, .82, -14.6);
// potted plants
const potM = flat('#b4633b'), soilM = flat('#2a1d14'), lfA = flat('#4f8a3c', { side: THREE.DoubleSide }), lfB = flat('#2f6b3a', { side: THREE.DoubleSide }), lfG = new THREE.PlaneGeometry(.2, .62).translate(0, .31, 0);
/** @param {number} v @returns {THREE.Group} */
function plant(v) { const g = new THREE.Group();
  /** @param {THREE.Mesh} m @param {number} x @param {number} y @param {number} z */
  const add2 = (m, x, y, z) => { m.castShadow = true; return add(m, x, y, z, g); };
  add2(new THREE.Mesh(new THREE.CylinderGeometry(.24, .17, .38, 7), potM), 0, .19, 0); add2(new THREE.Mesh(new THREE.CylinderGeometry(.21, .21, .02, 7), soilM), 0, .37, 0);
  if (v < .55) for (let k = 0; k < 5; k++) { const l = add2(new THREE.Mesh(lfG, k % 2 ? lfA : lfB), 0, .36, 0); l.rotation.order = 'YXZ'; l.rotation.set(-.35 - er() * .45, k * 1.26 + er() * .4, 0); l.scale.setScalar(.9 + er() * .5); }
  else { add2(new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, .5, 5), dark), 0, .6, 0); add2(new THREE.Mesh(new THREE.IcosahedronGeometry(.36, 0), lfB), 0, .92, 0); add2(new THREE.Mesh(new THREE.IcosahedronGeometry(.25, 0), lfA), .08, 1.15, .05); }
  scene.add(g); return g; }
export const fan = add(new THREE.Group(), -33.5, 6.5, -4); mk(brass, .25, .25, .25, 0, 0, 0, fan, false); mk(dark, .04, .5, .04, 0, .3, 0, fan, false); for (let i = 0; i < 4; i++) { const bl = add(new THREE.Group(), 0, 0, 0, fan); bl.rotation.y = i * Math.PI / 2; mk(caseM, 1.5, .03, .28, .85, 0, 0, bl, false); }
const clock3 = add(new THREE.Group(), lx + .32, 4.1, -13.5); { const f = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .08, 24), flat('#efe2c8')); f.rotation.z = Math.PI / 2; clock3.add(f); const rim = new THREE.Mesh(new THREE.TorusGeometry(.56, .05, 6, 24), brass); rim.rotation.y = Math.PI / 2; clock3.add(rim); }
export const hands = [.42, .28].map((l, i) => { const g = add(new THREE.Group(), .06, 0, 0, clock3); mk(dark, .02, l, .04 + i * .02, 0, l / 2, 0, g, false); return g; });
// rolling ladders hooked on the brass rail
const ladM = flat('#c09060', { roughness: .6 }), railM = flat('#d6a24e', { metalness: .55, roughness: .3, emissive: '#3a2408' });
function ladder() { const g = new THREE.Group(), lean = new THREE.Group(), a = Math.atan(1.05 / 6.4), L = 6.4 / Math.cos(a); g.add(lean); lean.position.z = 1.3; lean.rotation.x = -a;
  [-.32, .32].forEach((x) => mk(railM, .07, L, .1, x, L / 2, 0, lean)); for (let y = .45; y < L - .2; y += .42) mk(ladM, .64, .06, .09, 0, y, 0, lean, false);
  [-.32, .32].forEach((x) => { mk(railM, .06, .06, .34, x, L - .05, -.15, lean, false); mk(dark, .1, .14, .14, x, .07, 0, lean, false); }); scene.add(g); return g; }
/** Ladders: wall (0 back, 1 east), centre, amplitude, phase, current position. @type {{ g: THREE.Group, w: number, c: number, a: number, ph: number, u: number }[]} */
export const LAD = [[0, -34.2, .9], [0, 12, 3], [1, -9, 2.6], [1, 11, 2]].map(([w, c, a], i) => ({ g: ladder(), w, c, a, ph: i * 1.7, u: c }));
LAD.forEach((l) => { if (l.w === 0) l.g.position.set(0, 0, -D / 2 + .1); else { l.g.position.set(W / 2 - .1, 0, 0); l.g.rotation.y = -Math.PI / 2; } });
// corridor pendants (unshadowed)
/** @param {number} len @returns {{ g: THREE.Group, bulb: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> }} */
const lampOf = (len) => { const g = new THREE.Group(); mk(dark, .03, len, .03, 0, -len / 2, 0, g, false); const sh = new THREE.Mesh(new THREE.ConeGeometry(.55, .45, 8, 1, true), flat('#b7843f', { side: THREE.DoubleSide, metalness: .5, roughness: .4 })); add(sh, 0, -len, 0, g);
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 0), new THREE.MeshBasicMaterial({ color: '#ffd28a' })); add(b, 0, -len - .2, 0, g); scene.add(g); return { g, bulb: b }; };
export const PEND = [-24, -8, 8, 24].map((x) => { const { g } = lampOf(1.6); g.position.set(x, HC, D / 2 - 1.8); const l = new THREE.PointLight('#ffb766', 22, 0, 1.7); l.position.set(x, 5, D / 2 - 1.8); scene.add(l); const s = new THREE.Sprite(glowM); s.scale.setScalar(4); s.position.set(x, 5.1, D / 2 - 1.8); scene.add(s); return g; });
// carpet runners
const carpetM = new THREE.MeshStandardMaterial({ map: ctex(64, 64, (g) => { g.fillStyle = '#5e1a16'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#b8863c'; g.fillRect(0, 5, 64, 3); g.fillRect(0, 56, 64, 3); g.fillStyle = '#7a2a20'; for (let x = 0; x < 64; x += 16) g.fillRect(x, 26, 8, 12); }).t, roughness: .95, polygonOffset: true, polygonOffsetFactor: -2 });
/** @param {number} rz @returns {THREE.Mesh} */
const runner = (rz) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), carpetM); m.rotation.set(-Math.PI / 2, 0, rz); m.receiveShadow = true; scene.add(m); return m; };
{ const f = runner(0); f.scale.set(W - 6, 1.2, 1); f.position.set(1, .012, D / 2 - 1.8); const w = runner(Math.PI / 2); w.scale.set(D - 4, 1.2, 1); w.position.set(-W / 2 + 4.2, .011, 0); }

/* ---------- rooms: partitions, arched doorway, lintel sign, lamp, reading table, carpet ---------- */
const archG = (() => { const s = new THREE.Shape(); s.moveTo(-AJ, 0); s.lineTo(-DW / 2, 0); s.lineTo(-DW / 2, 2.2); s.absarc(0, 2.2, DW / 2, Math.PI, 0, true); s.lineTo(DW / 2, 0); s.lineTo(AJ, 0); s.lineTo(AJ, RH); s.lineTo(-AJ, RH); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .3, bevelEnabled: false }); g.translate(0, 0, -.15); return g; })();
/**
 * One data room's meshes plus per-frame derived values (centre, rect, share, growth).
 * @typedef {{ walls: THREE.Mesh[], arch: THREE.Mesh, trim: THREE.Mesh, tx: CTex, sign: THREE.Mesh, lamp: THREE.Group, bulb: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
 *   light: THREE.PointLight, glow: THREE.Sprite, div: HTMLDivElement, key: string, tbl: THREE.Group, pl: [THREE.Group, number, number][], runs: THREE.Mesh[],
 *   cx: number, cz: number, tz: number, r: import('./layout.js').Rect, share: number, delta: number }} Room
 */
/** @type {Room[]} */
export const rooms = [];
for (let i = 0; i < 6; i++) {
  const walls = [...Array(5)].map(() => mk(greenM, 1, 1, 1, 0, 0, 0)), arch = new THREE.Mesh(archG, greenM), trim = new THREE.Mesh(new THREE.TorusGeometry(DW / 2 + .07, .08, 6, 20, Math.PI), brass); scene.add(trim); arch.castShadow = arch.receiveShadow = true; scene.add(arch);
  const tx = ctex(2048, 384, () => {}); tx.t.anisotropy = 8; const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, .64), new THREE.MeshBasicMaterial({ map: tx.t, toneMapped: false })); scene.add(sign);
  const lamp = lampOf(1.6), light = new THREE.PointLight('#ffb766', 60, 0, 1.6); scene.add(light);
  const div = document.createElement('div'); div.className = 'sign'; div.dataset.room = String(i); $('#labels').appendChild(div);
  const glow = new THREE.Sprite(glowM); scene.add(glow);
  const tbl = chairs(table(scene, 0, 0, 1.5), 1.5);
  /** @type {[THREE.Group, number, number][]} */
  const pl = [2, ...[0, 1].sort(() => er() - .5).slice(0, 1 + (er() < .5 ? 1 : 0))].map((c) => [plant(er()), c, er() * .25]);
  rooms.push({ walls, arch, trim, tx, sign, lamp: lamp.g, bulb: lamp.bulb, light, glow, div, key: '', tbl, pl, runs: [runner(0), runner(Math.PI / 2)], cx: 0, cz: 0, tz: 0, r: { x: 0, z: 0, w: 1, d: 1 }, share: 0, delta: 0 });
  if (i === 2 || i === 4) mkCat(tbl, -.35, .82, .05); // sleeping cats on two reading tables
}
/** Lintel sign: room name and its share of revenue. @param {Room} o @param {{ name: string, share: number }} a */
export function drawLintel(o, a) { const key = a.name + a.share; if (o.key === key) return; o.key = key; const g = ctx2d(o.tx.cv);
  const gr = g.createLinearGradient(0, 0, 0, 384); gr.addColorStop(0, '#d9ad62'); gr.addColorStop(.55, '#b07c3a'); gr.addColorStop(1, '#7a5222'); g.fillStyle = gr; g.fillRect(0, 0, 2048, 384);
  g.fillStyle = '#2a170a'; g.fillRect(24, 24, 2000, 336); const ig = g.createLinearGradient(0, 24, 0, 360); ig.addColorStop(0, '#3a2414'); ig.addColorStop(1, '#22140b'); g.fillStyle = ig; g.fillRect(28, 28, 1992, 328);
  g.fillStyle = 'rgba(255,226,170,.55)'; g.fillRect(28, 28, 1992, 2); g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = '#f0d9ac';
  g.font = PLX(600, 132); g.letterSpacing = '14px'; g.fillText(a.name.toUpperCase(), 1024, 168); g.fillStyle = '#c99a55'; g.font = PLX(500, 62); g.letterSpacing = '6px'; g.fillText(`${(a.share * 100).toFixed(1)}% OF REVENUE`, 1024, 290); o.tx.t.needsUpdate = true; }

/* ---------- bookcases with a printed shelf edge ---------- */
/** @typedef {{ g: THREE.Group, tx: CTex, key: string, lab: THREE.Mesh }} CaseG */
/** @type {CaseG[]} */
export const caseG = [];
for (let ci = 0; ci < 48; ci++) {
  const g = new THREE.Group(); mk(caseM, CW, PL, CD, 0, PL / 2, 0, g); mk(backM, CW, BH, .08, 0, BH / 2, -CD / 2 + .04, g);
  mk(caseM, .08, BH * .8, CD, -CW / 2 + .04, BH * .4, 0, g); mk(caseM, .08, BH * .8, CD, CW / 2 - .04, BH * .4, 0, g);
  const tx = ctex(2048, 80, () => {}); tx.t.anisotropy = 8;
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(CW - .16, PL * .82), new THREE.MeshBasicMaterial({ map: tx.t, toneMapped: false })); lab.position.set(0, PL / 2, CD / 2 + .003); g.add(lab);
  scene.add(g); caseG.push({ g, tx, key: '', lab });
}
/** @param {number} ci @param {Shelf|null} s */
export function drawEdge(ci, s) {
  const c = caseG[ci], key = s ? s.area + s.genre + s.share + s.cnt : '-'; if (c.key === key) return; c.key = key; const g = ctx2d(c.tx.cv);
  g.textAlign = 'left'; g.letterSpacing = '0px'; const gr = g.createLinearGradient(0, 0, 0, 80); gr.addColorStop(0, '#2c1b10'); gr.addColorStop(1, '#170d07'); g.fillStyle = gr; g.fillRect(0, 0, 2048, 80); if (!s) { c.tx.t.needsUpdate = true; return; }
  g.fillStyle = 'rgba(232,190,120,.6)'; g.fillRect(0, 0, 2048, 2); g.fillStyle = 'rgba(214,162,78,.85)'; g.fillRect(0, 76, 2048 * s.cnt / 40, 4); g.fillStyle = 'rgba(214,162,78,.18)'; g.fillRect(2048 * s.cnt / 40, 77, 2048, 2);
  const bg = g.createLinearGradient(0, 8, 0, 70); bg.addColorStop(0, '#e2b468'); bg.addColorStop(1, '#a8752f'); g.fillStyle = bg; g.beginPath(); g.roundRect(16, 10, 70, 58, 8); g.fill(); g.fillStyle = 'rgba(255,240,205,.7)'; g.fillRect(24, 11, 54, 2);
  g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = '#22140a'; g.font = PLX(700, 42); g.fillText(`${s.rank}`, 51, 41); g.textAlign = 'left';
  g.fillStyle = '#f3e3c3'; g.letterSpacing = '4px'; g.font = PLX(600, 44); g.fillText(s.genre.toUpperCase(), 112, 41);
  const gw = g.measureText(s.genre.toUpperCase()).width; g.letterSpacing = '0px'; g.fillStyle = '#c9a26a'; g.font = PLX(500, 40); g.fillText(`·  ${(s.share * 100).toFixed(1)}% of ${s.area}`, 112 + gw + 22, 41); c.tx.t.needsUpdate = true;
}
/** Forget every printed canvas so they redraw (after fonts settle). */
export function redrawCanvases() { caseG.forEach((c) => (c.key = '')); rooms.forEach((o) => (o.key = '')); }

/* ---------- L2/L3 fading: a transparent clone per material, kept in a WeakMap ---------- */
/** @type {WeakMap<THREE.Mesh, { m0: THREE.Material, mT: THREE.Material, cs: boolean }>} */
const FADE = new WeakMap();
/** @param {THREE.Object3D} G @param {boolean} fc @param {number} op */
export function fadeG(G, fc, op) {
  G.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    let f = FADE.get(o);
    if (!f) { const m0 = /** @type {THREE.Material} */ (o.material), isLab = caseG.some((c) => c.lab === o); const mT = isLab ? m0 : m0.clone(); mT.transparent = true; mT.depthWrite = isLab ? m0.depthWrite : false; f = { m0, mT, cs: o.castShadow }; FADE.set(o, f); }
    o.material = fc ? f.mT : f.m0; if (fc) f.mT.opacity = f.mT === f.m0 ? op * op : op; else if (f.m0.transparent) f.m0.opacity = 1; o.castShadow = !fc && f.cs;
  });
}

/* ---------- spines (data-driven: one instance per title) ---------- */
/** Per-title jitter: thickness, height, lean, colour depth. @typedef {{ th: number, h: number, l: number, d: number }} Jit */
/** @type {Jit[]} */ export const jit = [];
/** @type {THREE.InstancedMesh} */ export let spines;
/** @type {THREE.InstancedMesh} */ export let strk;
/** @type {THREE.InstancedMesh} */ export let ghSp;
/** @type {THREE.Color[]} */ export let spC = [];
/** @type {THREE.Color[]} */ export let spS = [];
export const topGlow = new THREE.Sprite(glowM); scene.add(topGlow);
// L2 spine faces: an atlas of 40 printed spines laid on the focused shelf, plus cream page tops
const SPA = ctex(2560, 512, () => {}); SPA.t.wrapS = SPA.t.wrapT = THREE.ClampToEdgeWrapping; SPA.t.anisotropy = 8;
const lGeo = new THREE.PlaneGeometry(.84, .94).translate(0, 0, .502), tGeo = new THREE.PlaneGeometry(.86, .9).rotateX(-Math.PI / 2).translate(0, .502, 0), tM = flat('#e8dcc4');
/** @type {[THREE.Mesh, THREE.Mesh][]} */
export const LAB = [];
/** @type {THREE.Texture[]} */
const LABT = [];
for (let j = 0; j < 40; j++) { const t = SPA.t.clone(); t.repeat.set(1 / 40, 1); t.offset.set(j / 40, 0); LABT.push(t); const f = new THREE.Mesh(lGeo, new THREE.MeshBasicMaterial({ map: t, transparent: true })), u = new THREE.Mesh(tGeo, tM);
  [f, u].forEach((m) => { m.matrixAutoUpdate = false; m.visible = false; scene.add(m); }); LAB.push([f, u]); }
let spaK = '';
/** Print the titles of shelf `ci` (as laid out in `A`) into the atlas. @param {number} ci @param {Layout} A */
export function drawSPA(ci, A) {
  const k = ci + '|' + A.axis + '|' + A.slot.length + '|' + A.asg.reduce((s, v, i) => (v === ci ? s + i * 7 + A.slot[i] : s), 0); if (spaK === k) return; spaK = k;
  const g = ctx2d(SPA.cv); g.clearRect(0, 0, 2560, 512);
  for (let b = 0; b < BOOKS.length; b++) { const j = A.slot[b]; if (A.asg[b] !== ci || j >= 40) continue; const K = BOOKS[b], x = j * 64; g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 64, 512); g.fillStyle = '#d6ad62';
    [24, 34, 470, 480].forEach((y, n) => g.fillRect(x + 6, y, 52, n % 3 ? 3 : 6)); g.save(); g.translate(x + 32, 52); g.rotate(Math.PI / 2); g.fillStyle = '#f6e9cc'; let fs = 30; g.font = PLX(600, fs);
    while (g.measureText(K.title).width > 400 && fs > 21) g.font = PLX(600, --fs); let tt = K.title; while (g.measureText(tt).width > 400) tt = tt.slice(0, -2) + '…'; g.textBaseline = 'middle'; g.fillText(tt, 0, 0); g.restore();
    g.fillStyle = '#e9cf9a'; g.font = PLX(600, 15); g.textAlign = 'center'; g.fillText((K.author.split(' ').pop() || '').slice(0, 7).toUpperCase(), x + 32, 504); g.textAlign = 'left'; }
  LABT.forEach((t) => (t.needsUpdate = true));
}
/** Build the per-title meshes once the catalogue is known. */
export function initBooks() {
  const NB = BOOKS.length, jr = lcg(11);
  for (let i = 0; i < NB; i++) jit.push({ th: 0.096 + jr() * 0.024, h: 0.78 + jr() * 0.3, l: jr() - .5, d: jr() });
  spines = new THREE.InstancedMesh(box, flat('#ffffff', { roughness: .7 }), NB); spines.castShadow = spines.receiveShadow = true; spines.frustumCulled = false;
  spC = BOOKS.map((b, i) => new THREE.Color().setHSL(b.hue / 360, .34 + jit[i].d * .2, .3 + jit[i].d * .18)); spC.forEach((c, i) => spines.setColorAt(i, c));
  spS = BOOKS.map((b, i) => new THREE.Color().setHSL(b.hue / 360, .52 + jit[i].d * .2, .34 + jit[i].d * .18)); // shelf view: a touch more saturated so the hovered spine reads
  scene.add(spines);
  const st = ctex(4, 64, (g) => { const r = g.createLinearGradient(0, 0, 0, 64); r.addColorStop(0, '#fff'); r.addColorStop(1, '#000'); g.fillStyle = r; g.fillRect(0, 0, 4, 64); }).t;
  strk = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), NB);
  strk.frustumCulled = false; strk.visible = false; spC.forEach((c, i) => { strk.setColorAt(i, col.copy(c).lerp(new THREE.Color('#ffd9a0'), .5)); strk.setMatrixAt(i, M4.makeScale(0, 0, 0)); }); scene.add(strk);
  ghSp = new THREE.InstancedMesh(box, flat('#fff', { roughness: .7, transparent: true, depthWrite: false }), NB); ghSp.frustumCulled = false; ghSp.visible = false; spC.forEach((c, i) => ghSp.setColorAt(i, c)); scene.add(ghSp);
}

/* ---------- readers: instanced coat + trousers + head + carried book ---------- */
const NR = 40;
export const rBody = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.25, .42, 3, 8), flat('#fff'), NR), rLegs = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.17, .5, 3, 6), flat('#262a33'), NR),
  rHead = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.18, 1), flat('#e2c4a0'), NR), rBook = new THREE.InstancedMesh(box, flat('#fff'), NR);
[rBody, rLegs, rHead, rBook].forEach((m) => { m.castShadow = true; m.frustumCulled = false; scene.add(m); });
const COATS = ['#4f86ab', '#c0603e', '#d8c9a6'];
/** @type {{ P: number, ph: number, side: number, h: number, sp: number }[]} */
export const RD = [...Array(NR)].map(() => ({ P: 9 + rnd() * 6, ph: rnd() * 30, side: rnd() - .5, h: rnd(), sp: .9 + rnd() * .5 }));
for (let j = 0; j < NR; j++) { rBody.setColorAt(j, col.set(COATS[j % 3])); rBook.setColorAt(j, col.setHSL(rnd(), .45, .4)); }
export { NR };

/* ---------- the opened book: a hinged 3D book rendered sharp on a second canvas ---------- */
export const R2 = new THREE.WebGLRenderer({ canvas: /** @type {HTMLCanvasElement} */ ($('#c2')), antialias: true, alpha: true, preserveDrawingBuffer: true }); R2.setPixelRatio(R.getPixelRatio()); R2.toneMapping = THREE.ACESFilmicToneMapping; R2.setClearColor(0, 0);
export const scene2 = new THREE.Scene(); scene2.add(new THREE.HemisphereLight('#fff1dc', '#3a2414', 1.1)); { const k = new THREE.DirectionalLight('#ffd7a8', 1.6); k.position.set(-2, 4, 6); scene2.add(k); }
/** Current book proportions (width, height, thickness) and which title is bound. */
export const BK3 = { w: .72, h: 1, t: .1, b: -1 };
const ctx2 = ctex(256, 330, () => {}), bCol = flat('#333'), paper = flat('#efe3cf');
/** @param {string} s @param {number} n @returns {string[]} */
const wrap = (s, n) => s.split(' ').reduce((/** @type {string[]} */ l, w) => { if (l.length && (l[l.length - 1] + ' ' + w).length > n) l.push(w); else if (l.length) l[l.length - 1] += ' ' + w; else l.push(w); return l; }, []);
export const book = new THREE.Group(), hinge = new THREE.Group();
const pages = new THREE.Mesh(box, paper), back = new THREE.Mesh(box, bCol), spineM = new THREE.Mesh(box, bCol);
const cover = new THREE.Mesh(box, [bCol, bCol, bCol, bCol, new THREE.MeshStandardMaterial({ map: ctx2.t, roughness: .7 }), paper]);
hinge.add(cover); book.add(pages, back, spineM, hinge); book.visible = false; scene2.add(book);
/** @param {number} b */
export function setBook3D(b) {
  if (BK3.b === b) return; BK3.b = b; const k = BOOKS[b]; BK3.h = jit[b].h; BK3.t = jit[b].th; bCol.color.setHSL(k.hue / 360, .42, .3);
  const g = ctx2d(ctx2.cv), gr = g.createLinearGradient(0, 0, 256, 330); gr.addColorStop(0, `hsl(${k.hue},42%,40%)`); gr.addColorStop(1, `hsl(${k.hue},40%,20%)`);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 330); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, 0, 12, 330); g.fillStyle = '#fff'; g.font = PLX(700, 28);
  const lines = wrap(k.title, 12); if (lines.length > 7) { lines.length = 7; lines[6] = lines[6].slice(0, 10) + '…'; } lines.forEach((ln, i) => g.fillText(ln.length > 14 ? ln.slice(0, 13) + '…' : ln, 26, 52 + i * 34)); g.font = PLX(500, 14); g.fillText(k.author.toUpperCase(), 26, 300); ctx2.t.needsUpdate = true;
  const { w: bw0, h: bh0, t: bt0 } = BK3;
  pages.scale.set(bw0 * .97, bh0 * .96, bt0 * .8); back.scale.set(bw0, bh0, bt0 * .1); back.position.z = -bt0 * .45; spineM.scale.set(bt0 * .1, bh0, bt0); spineM.position.x = -bw0 / 2;
  cover.scale.set(bw0, bh0, bt0 * .1); cover.position.x = bw0 / 2; hinge.position.set(-bw0 / 2, 0, bt0 * .45);
}
// moths swirling in each room lamp cone
export const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(900), 3));
/** @type {[number, number, number][]} */
export const dp = [...Array(300)].map(() => /** @type {[number, number, number]} */ ([rnd(), rnd(), rnd()]));
scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: '#ffe0b0', size: .07, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending })));
