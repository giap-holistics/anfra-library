// Bootstrap and the frame loop: load the governed data, build the layouts and spines, then render
// one frame per clock step. Interactive is the product; the scripted loop is reachable by the driver.
import { NEED, PRICE, defaultState, posToPrice, priceToPos, request, status } from './data.js';
import * as A from './anim.js';
import { cur, sPos, pa, IS, RUN, VIEW, LOOP, NOWR, FX, LY } from './anim.js';
import * as THREE from 'three';
import { BH, HC, P0az, mixP } from './layout.js';
import * as S from './scene.js';
import { VP, bookAnim, labels, proj, sidebar } from './sidebar.js';
import { pick } from './hover.js';
import { installDriver } from './debug.js';
import { syncLayer } from './layer.js';
import { $, clamp, clock, ease, kids, lerp } from './util.js';

/** @typedef {import('./data.js').Axis} Axis */
/** @typedef {import('./data.js').Grain} Grain */
/** @typedef {import('./data.js').PeriodId} PeriodId */

const view = $('#view');
A.PROJ.proj = proj;

/* ---------- clock + Animated loop time ---------- */
const AN = { T0: 0, frozen: false, start: 0 };
/** @returns {number} */
const animT = () => ((AN.T0 + (AN.frozen ? 0 : clock.t - AN.start)) % LOOP + LOOP) % LOOP;
/** @param {'anim'|'int'} m */
export function setMode(m) {
  if (m === 'anim' && !A.AS) return;
  RUN.mode = m; document.body.classList.toggle('int', m === 'int');
  if (m === 'anim') { AN.T0 = 0; AN.frozen = false; AN.start = clock.t; } else A.initIS(clock.t);
  S.redrawCanvases();
}
/** Freeze the scripted loop at second t. @param {number} t */
export function seek(t) { if (RUN.mode !== 'anim') setMode('anim'); AN.T0 = t; AN.frozen = true; }
/** @param {'default'|'exterior'|'ladder'} c */
export function setCam(c) {
  if (c !== VIEW.cam && built) TW.tw = { from: lastPose, t0: clock.t }; // Inside ⇄ Outside is a camera move, not a cut
  VIEW.cam = c; document.body.classList.toggle('ext', c === 'exterior');
  kids($('#viewsel')).forEach((s) => s.classList.toggle('on', s.dataset.v === (c === 'exterior' ? 'out' : 'in')));
  if (IS) { if (c === 'exterior' && IS.lv > 0) A.goLevel(0); if (c !== 'exterior') { IS.orbit = clamp(IS.orbit, -.9, .9); IS.pitchT = clamp(IS.pitchT, -.21, .21); IS.zoomT = clamp(IS.zoomT, .72, 1); } }
}

/* ---------- Inside ⇄ Outside tween ---------- */
/** @typedef {import('./layout.js').Pose} Pose */
/** The camera move between cameras (1.2 s, in-out), and the last pose rendered. @type {{ tw: { from: Pose, t0: number } | null }} */
const TW = { tw: null };
/** @type {Pose} */ let lastPose = P0az(0);
const roofMats = /** @type {import('three').MeshBasicMaterial[]} */ ([]);
S.roof.traverse((o) => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) roofMats.push(o.material); });
/**
 * Roof opacity from where the camera is, not from a timer: opaque at a low exterior elevation,
 * gone by the bird's-eye cut-away angle, so the interior is never seen through a half roof from a steep angle.
 * @param {Pose} P @returns {number}
 */
const roofFromAltitude = (P) => { const el = Math.atan2(P.p.y - 3, Math.hypot(P.p.x, P.p.z)) * 180 / Math.PI; return 1 - clamp((el - 22) / 18); };
/** @param {number} op */
function setRoof(op) {
  S.roof.visible = op > .01;
  for (const m of roofMats) { const tr = op < .99; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = op; m.depthWrite = !tr; }
}

/* ---------- ghost cursor (scripted loop only) ---------- */
/** @param {Element|null|undefined} el @returns {[number, number]|null} */
const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
/** @param {number} x @param {number} y @returns {() => [number, number]} */
const vpt = (x, y) => () => [x, y];
/** @type {[number, () => [number, number]|null][]} */
let GK = [];
const clicks = [3.2, 5.75, 8.85, 11.95, 20.1, 20.7];
function buildGhost() {
  const Sc = /** @type {import('./anim.js').Script} */ (A.AS), rT = LY.A.rects[Sc.room], cT = LY.A.cases[Sc.C0];
  const bookTop = () => { const b = Sc.BK; if (LY.A.asg[b] < 0) return null; sPos(LY.A.asg[b], LY.A.slot[b], b, pa); return proj(pa.x, pa.y + S.jit[b].h * pa.s * .3, pa.z + .3 * pa.s); };
  const roomPt = () => proj(rT.x + rT.w / 2, 0, rT.z + rT.d / 2), caseTop = () => proj(cT.x, (BH + .1) * cT.s, cT.z), axisAge = () => rectOf(document.querySelector('#axis [data-v="age"]')), axisCat = () => rectOf(document.querySelector('#axis [data-v="category"]'));
  GK = [[0, vpt(420, 430)], [2.3, vpt(640, 500)], [3.0, axisAge], [3.5, axisAge], [4.6, vpt(640, 520)],
    [5.4, roomPt], [6.0, roomPt], [7.6, vpt(560, 560)], [8.35, caseTop], [9.0, caseTop], [9.9, vpt(560, 300)],
    [10.4, bookTop], [12.1, bookTop], [13.6, () => rectOf($('#book').querySelector('#wk'))], [17.2, () => rectOf($('#book').querySelector('#wk'))], [18.0, () => rectOf($('#hhi'))], [19.0, () => rectOf($('#hhi'))],
    [19.8, vpt(760, 760)], [20.0, () => rectOf(document.querySelector('#crumbs .root'))], [20.15, () => rectOf(document.querySelector('#crumbs .root'))], [20.6, axisCat], [20.9, axisCat], [22, vpt(420, 430)]];
}
/** @param {number} t @returns {[number, number]} */
function ghost(t) {
  if (!GK.length) return [VP.w / 2, VP.h / 2];
  let i = 0; while (i < GK.length - 2 && t >= GK[i + 1][0]) i++;
  const [ta, fa] = GK[i], [tb, fb] = GK[i + 1], a = fa() || [540, 450], b = fb() || a, f = ease((t - ta) / (tb - ta));
  const x = lerp(a[0], b[0], f), y = lerp(a[1], b[1], f); $('#ghost').style.transform = `translate(${x - 3}px,${y - 2}px)`;
  let rk = 0; for (const c of clicks) if (t >= c && t < c + .5) rk = (t - c) / .5;
  const ring = $('#ring'); ring.style.opacity = String(rk ? 1 - rk : 0); ring.style.transform = `scale(${.4 + rk * 1.3})`;
  const v = view.getBoundingClientRect(); return [x - v.left, y - v.top];
}

/* ---------- one frame ---------- */
/** @type {[number, number]|null} */ let mouse = null; let mouseT = -1e9;
let built = false;
export function frame() {
  if (!built) return;
  const now = clock.t; NOWR.t = now;
  const anim = RUN.mode === 'anim' && !!A.AS, t = anim ? animT() : 0, E = anim ? A.animE(t) : A.interE(now), st = E.st, EXT = A.isExt(); A.LASTF.lv = E.lv;
  let P = E.P, roofOp = EXT ? 1 : 0, mid = 0;
  if (TW.tw) {
    const f = (now - TW.tw.t0) / 1.2;
    if (f >= 1) TW.tw = null;
    else { const e = ease(f); mid = Math.sin(Math.PI * e); P = mixP(TW.tw.from, P, e); P = { ...P, p: P.p.clone().setY(P.p.y + mid * 14) }; roofOp = roofFromAltitude(P); }
  }
  lastPose = P; setRoof(roofOp);
  FX.LK = 1 + .45 * P.hz; FX.RSC = 1 + .45 * clamp((P.p.y - 25) / 30);
  S.hemi.intensity = lerp(.7, .2, P.hz); S.amb.intensity = lerp(.62, .26, P.hz); S.R.toneMappingExposure = lerp(lerp(1.32, 1.04, P.hz), 1.12, roofOp); S.sky.intensity = lerp(.55, .4, P.hz);
  FX.cam.copy(P.p); FX.look.copy(P.q);
  A.mixGeom(st.gF, st.gT, st.m); A.updRooms(E.amb, st, E); A.updSpines(st, E);
  const cam = S.cam; cam.position.copy(P.p); cam.lookAt(P.q); S.fog.near = P.fn; S.fog.far = P.ff; cam.fov = P.fov; cam.updateProjectionMatrix();
  S.fog.color.copy(S.BG).lerp(S.HAZE, P.hz); S.sceneBg.copy(S.fog.color); S.ceil.visible = P.p.y < HC - .2; S.shaftM.opacity = .05 + .16 * P.hz;
  $('#vig').style.opacity = String(lerp(.15, 1, P.hz)); S.WIND.value = E.amb; S.dome.position.copy(P.p); S.sunS.position.copy(P.p).addScaledVector(S.SUN, 260);
  S.CLOUDS.forEach((c) => { const a = c.u[0] + E.amb * .004; c.s.position.set(Math.cos(a) * c.u[1], c.u[2], Math.sin(a) * c.u[1]); });
  const fh = lerp(lerp(HC, .9, clamp((P.p.y - 9) / 12)) * (E.focus && VIEW.cam === 'default' ? .01 : 1), HC, roofOp); // the cut-away front wall closes as the roof fades in
  S.frontW.scale.y = fh; S.frontW.position.y = fh / 2; S.frontSkin.scale.y = fh / HC; S.frontSkin.position.y = fh / 2; S.door.visible = fh > 3.6;
  S.SHEEP.forEach((s, i) => { const a = E.amb * .05 + i * 2.4, x = 22 + i * 14 + Math.sin(a) * 6, z = 25 + 26 + i * 6 + Math.cos(a * .7) * 5; s.g.position.set(x, S.fH(x, z) + 1.1, z); s.g.rotation.y = -a + Math.PI / 2; s.head.position.y = .1 - .25 * Math.max(0, Math.sin(E.amb * .6 + i)); });
  kids($('#steps')).forEach((s, i) => s.classList.toggle('on', i === E.lv));
  cam.updateMatrixWorld();
  const src = anim ? (now - mouseT < 2.5 && mouse ? mouse : ghost(t)) : mouse || [VP.w / 2, VP.h / 2];
  // pointer parallax only inside the building (rooms, shelf, book): none at the bird's-eye L0 or outside; it eases in with the interior haze
  const sw = clamp(P.hz) * (1 - roofOp) * (E.lv > 0 ? 1 : 0);
  const gx = sw * clamp((src[0] - VP.w / 2) / (VP.w / 2), -1, 1), gy = sw * clamp((src[1] - VP.h / 2) / (VP.h / 2), -1, 1), k = Math.PI / 180; FX.sway = [gx, gy];
  cam.rotateY(-gx * 2 * k); cam.rotateX(-gy * 2 * k); cam.updateMatrixWorld();
  if (!anim) IS.lastP = P;
  S.R2.clear(); bookAnim(E); sidebar(E); labels(st, (1 - roofOp) * (1 - mid) * clamp((P.p.y - 25) / 30), E); // signposts fade out during the move
  S.R.render(S.scene, cam);
  syncLayer(); // after the sway: the layer follows the camera that drew this frame
}
function resize() { VP.w = view.clientWidth; VP.h = view.clientHeight; S.R.setSize(VP.w, VP.h, false); S.R2.setSize(VP.w, VP.h, false); S.cam.aspect = VP.w / VP.h; S.cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let lastTs = -1;
/** Real-time driver: advances the page clock unless a driver has taken it over. @param {number} ts */
let failed = 0;
/** @param {number} ts */
function loop(ts) {
  if (!clock.manual) {
    if (lastTs >= 0) clock.t += Math.min(2.5, Math.max(0, (ts - lastTs) / 1000));
    try { frame(); } catch (e) { if (failed++ < 3) console.error('[library] frame', e); } // keep the loop alive; the error is reported once
  }
  lastTs = ts; requestAnimationFrame(loop);
}

/* ---------- interaction (Interactive mode) ---------- */
/** Hover at viewport px; `sign` is a signpost under the pointer, if any. @param {number} x @param {number} y @param {number} [sign] */
export function hoverAt(x, y, sign = -1) {
  mouse = [x, y]; mouseT = clock.t; if (RUN.mode !== 'int' || !IS) return;
  const p = sign >= 0 ? { room: sign, ci: -1, b: -1 } : pick(x, y);
  if (IS.lv === 0) IS.hRoom = p.room; if (IS.lv === 1) IS.hCase = p.ci; if (IS.lv === 2) IS.hBook = p.b;
  view.style.cursor = (IS.lv === 0 && IS.hRoom >= 0) || (IS.lv === 1 && IS.hCase >= 0) || (IS.lv === 2 && IS.hBook >= 0) ? 'pointer' : IS.lv === 0 ? 'grab' : '';
}
/** Click at viewport px. @param {number} x @param {number} y @param {number} [sign] */
export function clickAt(x, y, sign = -1) {
  if (RUN.mode !== 'int' || !IS) return; const p = sign >= 0 ? { room: sign, ci: -1, b: -1 } : pick(x, y);
  if (IS.lv === 0 && p.room >= 0) A.goRoom(p.room); else if (IS.lv === 1 && p.ci >= 0) A.goShelf(p.ci); else if (IS.lv === 2 && p.b >= 0) A.openBook(p.b);
}
/** @param {MouseEvent} e @returns {[number, number]} */
const vxy = (e) => { const r = view.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
/** @param {EventTarget|null} t @returns {number} */
const signOf = (t) => { const el = t instanceof Element ? t.closest('.sign') : null; return el instanceof HTMLElement && el.dataset.room ? +el.dataset.room : -1; };
/** @type {{ x: number, y: number, o: number, pt: number, pan: import('three').Vector3, moved: boolean }|null} */ let drag = null;
let dragged = false;
/** @type {'hlo'|'hhi'|null} */ let hDrag = null; let wDrag = false;
view.addEventListener('pointermove', (e) => {
  if (RUN.mode === 'int' && drag && IS) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true; const EXT = A.isExt();
    if (drag.moved && IS.lv === 0 && !IS.path) { IS.orbit = EXT ? drag.o - (e.clientX - drag.x) * .005 : clamp(drag.o - (e.clientX - drag.x) * .005, -.9, .9); IS.pitchT = EXT ? clamp(drag.pt + (e.clientY - drag.y) * .004, -.25, 1.07) : clamp(drag.pt + (e.clientY - drag.y) * .003, -.21, .21); }
    if (drag.moved && IS.lv === 1 && !IS.path) A.panBy(-(e.clientX - drag.x) * .03, (e.clientY - drag.y) * .03, drag.pan);
  }
  const [x, y] = vxy(e); hoverAt(x, y, signOf(e.target));
});
view.addEventListener('pointerdown', (e) => { if (RUN.mode === 'int' && IS && !(e.target instanceof Element && e.target.closest('#book'))) drag = { x: e.clientX, y: e.clientY, o: IS.orbit, pt: IS.pitchT, pan: IS.pan.clone(), moved: false }; });
view.addEventListener('dblclick', () => { if (RUN.mode === 'int' && IS && IS.lv === 1 && !IS.path) { IS.pan.set(0, 0, 0); } });
view.addEventListener('pointerup', () => { if (drag) { dragged = drag.moved; drag = null; } });
// the action is on 'click', not 'pointerup': anfra's Inspect Pick mode swallows clicks (capture phase), so picking a
// layer element over the scene selects it in the panel without also drilling in
view.addEventListener('click', (e) => { if (RUN.mode !== 'int' || dragged) { dragged = false; return; } const [x, y] = vxy(e); clickAt(x, y, signOf(e.target)); });
view.addEventListener('wheel', (e) => {
  if (RUN.mode !== 'int' || !IS) return; const EXT = A.isExt();
  if (IS.lv === 0 && !IS.path) { const z = IS.zoomT * Math.exp(clamp(e.deltaY * (e.ctrlKey ? .01 : .0015), -.3, .3)); IS.zoomT = EXT ? clamp(z, .6, 1) : clamp(z, .72, 1); return; }
  if (IS.lv === 1 && !IS.path && (e.deltaY < 0 || IS.pan.lengthSq() > .01)) { A.panBy(0, -Math.sign(e.deltaY) * Math.min(1.5, Math.abs(e.deltaY) * .01 + .3)); IS.wT = clock.t; return; }
  if ((IS.lv === 1 || IS.lv === 2) && clock.t - IS.wT > .8) { IS.wT = clock.t; A.goLevel(IS.lv - 1); }
}, { passive: true });
addEventListener('keydown', (e) => { if (RUN.mode === 'int' && IS && e.key === 'Escape') A.goLevel(IS.lv - 1); });
$('#steps').addEventListener('click', (e) => { if (RUN.mode === 'int' && IS && e.target instanceof HTMLElement && e.target.parentElement?.id === 'steps') A.goLevel(kids($('#steps')).indexOf(e.target)); });
$('#crumbs').addEventListener('click', (e) => { const c = e.target instanceof Element ? e.target.closest('.chip') : null; if (RUN.mode === 'int' && IS && c instanceof HTMLElement && c.dataset.lv) A.goLevel(+c.dataset.lv); });
/** @param {string} id @param {(v: string) => void} fn */
const seg = (id, fn) => $(id).addEventListener('click', (e) => { const s = e.target instanceof HTMLElement ? e.target.closest('[data-v]') : null; if (RUN.mode === 'int' && IS && s instanceof HTMLElement && s.dataset.v) fn(s.dataset.v); });
seg('#axis', (v) => A.setAxis(/** @type {Axis} */ (v)));
seg('#period', (v) => A.setPeriod(/** @type {PeriodId} */ (v)));
$('#viewsel').addEventListener('click', (e) => { const s = e.target instanceof HTMLElement ? e.target.closest('[data-v]') : null; if (s instanceof HTMLElement && RUN.mode === 'int') setCam(s.dataset.v === 'out' ? 'exterior' : 'default'); });
for (const id of /** @type {const} */ (['hlo', 'hhi'])) $('#' + id).addEventListener('pointerdown', (e) => { if (RUN.mode === 'int') { hDrag = id; e.preventDefault(); } });
$('#book').addEventListener('pointerdown', (e) => {
  if (RUN.mode !== 'int' || !(e.target instanceof Element)) return;
  const g = e.target.closest('#grain [data-v]'); if (g instanceof HTMLElement && g.dataset.v) { A.setGrain(/** @type {Grain} */ (g.dataset.v)); return; }
  if (e.target.closest('.wi')) { wDrag = true; whatIf(e); }
});
/** @param {PointerEvent} e */
function whatIf(e) { const tr = $('#book').querySelector('.track'); if (!tr) return; const r = tr.getBoundingClientRect(); A.setWhatIf(.7 + clamp((e.clientX - r.left) / r.width) * .6); }
/** @type {[number, number]} */ let pDrag = [0, 0];
addEventListener('pointermove', (e) => {
  if (RUN.mode !== 'int' || !IS) return; if (wDrag) whatIf(e);
  if (hDrag) { const r = $('#pr2').getBoundingClientRect(), v = Math.round(posToPrice(clamp((e.clientX - r.left) / r.width))); const lo0 = clamp(IS.ds.lo, PRICE.min, PRICE.max), hi0 = clamp(IS.ds.hi, PRICE.min, PRICE.max); pDrag = hDrag === 'hlo' ? [Math.min(v, hi0 - 2), hi0] : [lo0, Math.max(v, lo0 + 2)];
    const X = (/** @type {number} */ q) => (priceToPos(q) * 100) + '%'; $('#' + hDrag).style.left = X(hDrag === 'hlo' ? pDrag[0] : pDrag[1]); }
});
addEventListener('pointerup', () => { if (hDrag) { hDrag = null; if (IS && (pDrag[0] !== IS.ds.lo || pDrag[1] !== IS.ds.hi) && pDrag[1] > 0) A.setPrice(pDrag[0], pDrag[1]); pDrag = [0, 0]; } wDrag = false; });

/* ---------- boot ---------- */
const driver = installDriver({ frame, setMode, seek, setCam, hoverAt, clickAt });
async function boot() {
  const boot = $('#boot');
  try {
    const s0 = defaultState();
    await request(s0, NEED.all);
    if (status.errors.length) throw new Error(status.errors.join('; '));
    A.buildLayouts(s0); S.initBooks(); A.initIS(clock.t);
    built = true; boot.textContent = 'Preparing the tour…'; boot.classList.add('soft');
    requestAnimationFrame(loop);
    await A.prepareScript();
    const Sc = /** @type {import('./anim.js').Script} */ (A.AS), shelf = LY.A.meta[Sc.C0]; A.TOP.b = shelf ? shelf.books[0].idx : -1;
    buildGhost(); boot.remove();
    await document.fonts.ready; S.redrawCanvases();
    frame(); driver.ready = true;
  } catch (e) {
    console.error('[library] boot', e); boot.classList.remove('soft'); boot.textContent = 'Could not load the library: ' + (e instanceof Error ? e.message : String(e));
  }
}
document.body.classList.add('int');
void boot();
void cur;
