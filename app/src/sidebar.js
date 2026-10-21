// The right sidebar (styled as the book spread's paper), the two-page spread with the governed
// what-if and series, the flying 3D book, and the in-scene labels (signposts, tips, caption).
import * as THREE from 'three';
import { BOOKS, AXN, PRICE, priceToPos, kidsOf, levelSnap, metricDescription, num, numOr, periodOf, priceOn, scopeOf, snap, status, str, topRow, factorLit } from './data.js';
import { RUN, cur, sPos, pa, isExt } from './anim.js';
import { RH } from './layout.js';
import * as S from './scene.js';
import { $, clamp, clock, dcls, ease, esc, fmtInt, fmtMoney, fmtPct, html, kids, lerp } from './util.js';

/** @typedef {import('./anim.js').Frame} Frame */
/** @typedef {import('./anim.js').Seg} Seg */
/** @typedef {import('./data.js').Scope} Scope */
/** @typedef {import('./data.js').Snap} Snap */
/** @typedef {import('./data.js').DataState} DataState */

/* ---------- screen helpers ---------- */
export const VP = { w: 1, h: 1 };
const PV = new THREE.Vector3();
/** World point to viewport px, null behind the camera. @param {number} x @param {number} y @param {number} z @returns {[number, number] | null} */
export function proj(x, y, z) { PV.set(x, y, z).project(S.cam); return PV.z > 1 ? null : [(PV.x + 1) / 2 * VP.w, (1 - PV.y) / 2 * VP.h]; }
/** @param {HTMLElement} el @param {[number, number] | null} p @param {number} [op] */
function place(el, p, op = 1) {
  if (!p || op <= .01) { el.style.opacity = '0'; el.style.visibility = 'hidden'; return; }
  el.style.visibility = ''; el.style.opacity = String(op); const hw = el.offsetWidth / 2 + 8; el.style.left = clamp(p[0], hw, VP.w - hw) + 'px'; el.style.top = p[1] + 'px';
}

/* ---------- scope card with a short count-up between scopes ---------- */
/** @type {Scope} */ const disp = { name: '', rev: 0, u: 0, d: 0, ap: 0, rt: 0, sh: 0 };
/** @type {Scope} */ let from = { ...disp };
/** @type {Scope|null} */ let target = null;
let tgtSig = '', tgtT = -9;
const NUMK = /** @type {const} */ (['rev', 'u', 'd', 'ap', 'rt', 'sh']);
/** @param {Scope} sc */
function setTarget(sc) {
  const sig = sc.name + '|' + NUMK.map((k) => sc[k]).join('|'); if (sig === tgtSig) return;
  tgtSig = sig; from = { ...disp }; target = sc; tgtT = clock.t;
  for (const id of ['rev', 'a_u', 'a_p', 'a_r', 'a_s']) { const el = $('#' + id); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}
/** @type {ReturnType<typeof kidsOf>} */ let lastKids = null;
/** @type {Snap|undefined} */ let lastSnap;
const KEYS = ['all', 'room', 'sh', 'bk'];
/** @param {string} f @param {string} v @param {number} lv @param {string} [a] */
const chipF = (f, v, lv, a = '') => `<span class="sep">›</span><span class="chip ${a}" data-lv="${lv}"><code>${f}</code> is <q>${esc(v)}</q></span>`;

const kl = $('#kl'); for (let i = 0; i < 8; i++) kl.insertAdjacentHTML('beforeend', '<div class="r"><span></span><i></i><em></em></div>');

/** @param {Frame} E */
export function sidebar(E) {
  const ds = E.ds, sc = scopeOf(E.key, ds); if (sc) { setTarget(sc); checkScope(E.key, ds, sc); }
  const t = target || disp;
  if (E.tween && sc) { // scripted loop: the count-up is a function of loop time
    const f0 = scopeOf(E.tween.key, E.tween.ds) || sc; for (const k of NUMK) disp[k] = lerp(f0[k], sc[k], E.tween.e);
  } else { const e = ease((clock.t - tgtT) / .7); for (const k of NUMK) disp[k] = lerp(from[k], t[k], e); }
  $('#rev').textContent = fmtMoney(disp.rev); html($('#revd'), `<span class="${dcls(disp.d)}">${fmtPct(disp.d)} units</span>`);
  $('#a_u').textContent = fmtInt(disp.u); $('#a_p').textContent = '$' + disp.ap.toFixed(2); $('#a_r').textContent = disp.rt.toFixed(2) + '★'; $('#a_s').textContent = (disp.sh * 100).toFixed(1) + '%';
  html($('#scn'), 'Scope · ' + esc(t.name)); html($('#per'), periodOf(ds.period).short);
  const lk = KEYS.indexOf(E.key); let c = '<span class="chip root" data-lv="0">▤ All books</span>';
  if (lk >= 1 && ds.room != null) c += chipF(AXN[ds.axis], ds.room, 1); if (lk >= 2 && ds.genre != null) c += chipF('genre', ds.genre, 2); if (lk >= 3 && ds.isbn != null) c += chipF('isbn', ds.isbn.slice(0, 7) + '…', 3);
  if (priceOn(ds)) c += `<span class="sep">›</span><span class="chip acc"><code>price</code> ${ds.lo} – ${ds.hi}</span>`;
  html($('#crumbs'), c);
  kids($('#axis')).forEach((s) => s.classList.toggle('on', s.dataset.v === E.axis));
  kids($('#period')).forEach((s) => s.classList.toggle('on', s.dataset.v === ds.period));
  // the list under the card
  const G = E.G, hl = E.key === 'all' ? (E.hRoom >= 0 ? G.ar[E.hRoom].name : null) : E.key === 'room' ? (E.hc >= 0 && E.caseLift > .3 ? G.meta[E.hc]?.genre ?? null : null)
    : E.bk >= 0 ? BOOKS[E.bk].isbn : E.hb >= 0 && E.bookLift > .3 ? BOOKS[E.hb].isbn : null;
  const kd = kidsOf(E.key === 'bk' ? 'sh' : E.key, ds, hl); if (kd) lastKids = kd;
  if (lastKids) {
    const k = lastKids; html($('#kh'), esc(k.h)); html($('#kh2'), k.h2); const mx = Math.max(1e-9, ...k.rows.map((r) => r[1]));
    kids(kl).forEach((r, i) => { const d = k.rows[i]; r.style.display = d ? '' : 'none'; if (!d) return; html(kids(r)[0], esc(d[0])); kids(r)[1].style.width = (d[1] / mx * 100).toFixed(1) + '%'; html(kids(r)[2], d[2]); r.classList.toggle('hl', d[3]); });
  }
  // Inspect markers follow the queries feeding this level
  const rq = 'rooms_' + ds.axis, mq = { all: [rq, rq], room: [rq, 'shelves'], sh: ['shelves', 'topshelf'], bk: ['book', 'topshelf'] }[E.key];
  setAttr($('#scope'), 'data-anfra-query', mq[0]); setAttr($('#kids'), 'data-anfra-query', mq[1]);
  setAttr($('footer'), 'data-anfra-query', { all: rq, room: 'shelves', sh: 'topshelf', bk: 'book' }[E.key]);
  // size and latency of the query behind this level's numbers
  const sn = levelSnap(E.key, ds); if (sn) lastSnap = sn;
  if (lastSnap) html($('#rows'), `${lastSnap.n} row${lastSnap.n === 1 ? '' : 's'} · ${lastSnap.ms} ms`);
  html($('#lat'), status.pending > 0 ? '<span class="run">running…</span>' : status.errors.length ? `<span class="err" title="${esc(status.errors.join('\n'))}">${status.errors.length} failed</span>` : '');
  // price range
  const X = (/** @type {number} */ v) => (priceToPos(v) * 100) + '%', ppf = E.plo > PRICE.min + .01 || E.phi < PRICE.max - .01;
  $('#hlo').style.left = X(E.plo); $('#hhi').style.left = X(E.phi); const rg = $('#pr2 .rg'); rg.style.left = X(E.plo); rg.style.width = ((priceToPos(E.phi) - priceToPos(E.plo)) * 100) + '%';
  html($('#prv'), ppf ? `<b>$${E.plo.toFixed(0)} – $${E.phi.toFixed(0)}</b>` : `$${PRICE.min} – $${PRICE.max}`);
}

/** @param {HTMLElement} el @param {string} k @param {string} v */
function setAttr(el, k, v) { if (el.getAttribute(k) !== v) el.setAttribute(k, v); }

/* ---------- invariant: the card's numbers belong to the breadcrumb's filters ---------- */
/** @type {Set<string>} */ const CHECKED = new Set();
/**
 * The scope revenue must equal (a) the row for the same room/shelf/title in the parent level's query
 * and (b) the sum of its breakdown (every genre of the room; every title of the shelf). Logs once per state.
 * @param {import('./data.js').Key} key @param {DataState} ds @param {Scope} sc
 */
function checkScope(key, ds, sc) {
  const id = key + JSON.stringify(ds); if (key === 'all' || CHECKED.has(id)) return;
  /** @type {[string, number][]} */ const checks = [];
  const rooms = snap(/** @type {import('./data.js').QName} */ ('rooms_' + ds.axis), ds), shelves = snap('shelves', ds), top = snap('topshelf', ds);
  /** @param {Snap|undefined} sn @param {string} col @param {string|null} v */
  const rowRev = (sn, col, v) => { const r = sn && v != null ? sn.rows.find((x) => x[col] === v) : undefined; return r ? num(r, 'revenue') : NaN; };
  /** @param {Snap|undefined} sn */
  const sum = (sn) => (sn ? sn.rows.reduce((a, r) => a + num(r, 'revenue'), 0) : NaN);
  if (key === 'room') checks.push(['rooms row', rowRev(rooms, 'room', ds.room)], ['Σ shelves', sum(shelves)]);
  if (key === 'sh') checks.push(['shelves row', rowRev(shelves, 'genre', ds.genre)], ['Σ titles', top && top.n < 40 ? sum(top) : NaN]);
  if (key === 'bk') checks.push(['topshelf row', rowRev(top, 'isbn', ds.isbn)]);
  const ready = checks.filter(([, v]) => !Number.isNaN(v)); if (ready.length < checks.length && key !== 'sh') return;
  CHECKED.add(id);
  for (const [what, v] of ready) if (Math.abs(v - sc.rev) > Math.max(.01, Math.abs(v) * 1e-9)) console.error(`[library] scope invariant: ${key} revenue ${sc.rev} ≠ ${what} ${v}`, ds);
}

/* ---------- the two-page spread ---------- */
let spreadK = '', spreadB = -1;
/** @type {Snap|undefined} */ let lastBook;
/** @type {Snap|undefined} */ let lastSeries;
/** @type {Snap|undefined} */ let drawnSeries;
/** Left page and the static parts of the right page. @param {number} b @param {DataState} ds */
function fillSpread(b, ds) {
  if (b !== spreadB) { spreadB = b; lastBook = undefined; lastSeries = undefined; }
  const bs = snap('book', ds) || lastBook;
  const K = BOOKS[b], br = bs && bs.rows[0], tr = topRow(ds, K.isbn), sh = snap('shelves', ds), shr = sh && ds.genre != null ? sh.rows.find((r) => r.genre === ds.genre) : undefined;
  const key = [b, ds.period, br ? 1 : 0, tr ? 1 : 0, shr ? 1 : 0].join('|'); if (key === spreadK) return; spreadK = key; drawnSeries = undefined;
  const c = `hsl(${K.hue},42%,38%)`, rr = Math.round(K.rating), st = '★★★★★'.slice(0, rr) + '☆☆☆☆☆'.slice(0, 5 - rr), per = periodOf(ds.period);
  const units = br ? fmtInt(num(br, 'units')) : '…', d = br ? numOr(br, 'units_growth', 0) : 0;
  // the metric box shows the formula once; the description stops before the formula it repeats
  const desc = metricDescription('units_whatif').split(':')[0].replace(/\.?$/, '.');
  $('#pl').innerHTML = `<div class="cap">L3 · ${esc(K.genre)} · ${esc(K.age)}</div>
  <div class="head"><div class="cov" style="background:linear-gradient(160deg,${c},hsl(${K.hue},40%,22%))"><span class="ct">${esc(K.title)}</span><small>${esc(K.author.toUpperCase())}</small></div>
   <div class="hx"><h2 title="${esc(K.title)}">${esc(K.title)}</h2><div class="by">by ${esc(K.author)}</div><div class="by meta2">ISBN ${K.isbn}<br>${esc(K.category)} · ${esc(K.market)}</div></div></div>
  <div class="kv"><div>Price<b>$${K.price.toFixed(2)}</b></div><div>Rating<b><span class="stars">${st}</span> ${K.rating.toFixed(1)}</b></div><div>Format<b>${esc(K.format)}</b></div><div>Units · ${per.short.replace('last ', '')}<b>${units}</b></div></div>
  <div class="def"><span class="cap">Metric · units_whatif</span><code>units * (1 - 1.6 * (price_factor - 1))</code><span>${esc(desc)}</span><span class="src">library.dataset.aml · books.price_factor param</span></div>`;
  $('#pr').innerHTML = `<div class="cap hrow"><span>Units <i style="color:#c9a77c">■</i> · what-if <i style="color:#a85d12">□</i> · revenue <i style="color:#a85d12">●</i></span><span class="seg sm" id="grain" data-anfra-control="grain" data-anfra-label="Grain (date drill)" data-anfra-render="skip"><span data-v="day">Day</span><span data-v="week">Week</span><span data-v="month">Month</span></span></div>
  <svg id="ch" width="370" height="168" viewBox="0 0 370 168"></svg>
  <div class="kv st3"><div>Rank in shelf<b>${tr ? '#' + num(tr, 'revenue_rank') : '…'}${shr ? ` of ${fmtInt(num(shr, 'titles'))}` : ''}</b></div><div>vs prev period<b style="color:${d >= 0 ? '#3d7a22' : '#b4492c'}">${br ? fmtPct(d) : '…'}</b></div><div>Share of shelf<b>${tr ? (num(tr, 'title_share') * 100).toFixed(1) + '%' : '…'}</b></div></div>
  <div class="wi"><div class="wrow"><span class="cap">Price what-if</span><span id="wp" style="font-weight:600"></span></div>
  <div class="track"><div class="z"></div><div class="fl" id="wf"></div><div class="kn" id="wk"></div></div>
  <div class="wrow"><span class="lb">Projected units</span><span><b id="wu" class="big"></b> <span id="wd" style="font-weight:600"></span></span></div>
  <div class="wrow"><span class="lb">Projected revenue</span><span><b id="wr" style="font-size:17px"></b></span></div>
  <code><em>params { books.price_factor == <span id="wv">1</span> }</em></code></div>`;
}
/** Weekly (or day/month) bars from the governed series query; outlined bars are units_whatif. @param {Snap} sn */
function drawSeries(sn) {
  const ch = document.querySelector('#ch'); if (!ch) return;
  if (drawnSeries === sn) return; drawnSeries = sn; const rows = sn.rows, n = rows.length; if (!n) { ch.innerHTML = ''; return; }
  const u = rows.map((r) => num(r, 'units')), w = rows.map((r) => num(r, 'units_whatif')), rv = rows.map((r) => num(r, 'revenue'));
  const mx = Math.max(...u, ...w) * 1.15 || 1, mr = Math.max(...rv) || 1, H = 150, step = 358 / n, bw = Math.max(4, step - 4), X = (/** @type {number} */ i) => 6 + i * step;
  let s = u.map((v, i) => `<rect x="${X(i).toFixed(1)}" y="${(H - v / mx * H).toFixed(1)}" width="${bw.toFixed(1)}" height="${(v / mx * H).toFixed(1)}" rx="2" fill="#c9a77c"/>`).join('');
  if (w.some((v, i) => Math.abs(v - u[i]) > .5)) s += w.map((v, i) => `<rect x="${(X(i) + 1).toFixed(1)}" y="${(H - v / mx * H).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(v / mx * H).toFixed(1)}" rx="2" fill="none" stroke="#a85d12" stroke-width="1.4" stroke-dasharray="3 2"/>`).join('');
  const pts = rv.map((v, i) => [X(i) + bw / 2, H - v / mr * H * .82 - 6]);
  s += `<polyline points="${pts.map((p) => p.map((q) => q.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#a85d12" stroke-width="2.4"/>` + pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="#a85d12"/>`).join('');
  let pm = ''; rows.forEach((r, i) => { const dt = new Date(str(r, 'week') + 'T00:00:00Z'), m = dt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }); if (m !== pm) { pm = m; s += `<text x="${X(i).toFixed(1)}" y="${H + 15}" font-size="11" fill="#8a7458">${m}</text>`; } });
  ch.innerHTML = s;
}
const bp = new THREE.Vector3(), bq = new THREE.Vector3(), bc = new THREE.Vector3();
/** Fly the 3D book out, open it, align the HTML spread to it; fill the governed what-if. @param {Frame} E @returns {void} */
export function bookAnim(E) {
  const b = E.bk, bkEl = $('#book');
  if (b < 0 || !E.P2) { S.book.visible = false; S.canvas.style.filter = ''; bkEl.style.opacity = '0'; bkEl.style.pointerEvents = 'none'; return; }
  S.setBook3D(b); fillSpread(b, E.ds);
  // fly out 0-.9 s, cover opens .9-1.4, spread fades in on the open book; closing reverses (c1 = seconds since close)
  const o1 = E.o1, c1 = E.c1, cl = c1 >= 0, xo = clamp(o1 / .9), x = cl && c1 >= .55 ? 1 - clamp((c1 - .55) / .7) : xo;
  const f = ease(x), ov = cl ? 0 : .08 * Math.sin(Math.PI * clamp((xo - .6) / .4));
  const open = ease((o1 - .9) / .5) * (cl ? 1 - ease((c1 - .15) / .4) : 1), o = ease((o1 - 1.3) / .4) * (cl ? 1 - ease(c1 / .2) : 1);
  const blur = ease(o1 / .6) * (cl ? 1 - ease((c1 - .65) / .6) : 1), show = o1 > 0 && (!cl || c1 < 1.25);
  S.canvas.style.filter = blur > .01 ? `blur(${(blur * 7).toFixed(1)}px) brightness(${(1 - blur * .5).toFixed(2)})` : '';
  bkEl.style.opacity = String(o); bkEl.style.pointerEvents = RUN.mode === 'int' && o > .5 ? 'auto' : 'none'; S.book.visible = show;
  if (!show) return;
  const A = E.st.aT; if (A.asg[b] < 0) return;
  sPos(A.asg[b], A.slot[b], b, pa); const s = pa.s, P2 = E.P2, dir = P2.q.clone().sub(P2.p).normalize(), { w: bw0, h: bh0, t: bt0 } = S.BK3;
  const KK = (2 * .6 * Math.tan(19 * Math.PI / 180) * .6) / (bh0 * s), k = Math.exp(Math.log(KK) * f) * s * (1 + ov);
  bq.copy(P2.p).addScaledVector(dir, .6); bq.x += bw0 * KK * s / 2;
  bp.set(pa.x, pa.y + .2 * s, pa.z); bc.copy(bp).lerp(bq, .5); bc.y += .9 * s; bc.x -= .5 * s;
  const u = f, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
  S.book.position.set(bp.x * w0 + bc.x * w1 + bq.x * w2, bp.y * w0 + bc.y * w1 + bq.y * w2, bp.z * w0 + bc.z * w1 + bq.z * w2);
  const r = ease(x); S.book.rotation.set(Math.asin(dir.y) * r, Math.PI / 2 * (1 - r), Math.sin(Math.PI * x) * .25);
  S.book.scale.setScalar(k); S.hinge.rotation.y = -Math.PI * .985 * open;
  S.book.updateMatrixWorld(); S.R2.render(S.scene2, S.cam);
  const a = S.book.localToWorld(new THREE.Vector3(-1.5 * bw0, bh0 / 2, bt0 * .5)), cc = S.book.localToWorld(new THREE.Vector3(bw0 / 2, -bh0 / 2, bt0 * .5));
  const pA = proj(a.x, a.y, a.z), pC = proj(cc.x, cc.y, cc.z);
  if (pA && pC) bkEl.style.transform = `translate(${pA[0]}px,${pA[1]}px) scale(${((pC[0] - pA[0]) / 860).toFixed(4)},${((pC[1] - pA[1]) / 540).toFixed(4)})`;
  // the knob follows the reader; the numbers are the book query's at the factor last answered
  const K = BOOKS[b], kn = E.knob, kp = (kn - .7) / .6 * 100, wf = $('#wf');
  $('#wk').style.left = kp + '%'; wf.style.left = Math.min(kp, 50) + '%'; wf.style.right = (100 - Math.max(kp, 50)) + '%';
  html($('#wp'), `${kn < .996 ? '−' : kn > 1.004 ? '+' : ''}${Math.abs((kn - 1) * 100).toFixed(0)}%  ·  $${(K.price * kn).toFixed(2)}`);
  const bs = snap('book', E.ds); if (bs && bs.rows[0] && E.ds.isbn === K.isbn) lastBook = bs;
  const ss = snap('series', E.ds); if (ss && E.ds.isbn === K.isbn) lastSeries = ss;
  if (lastSeries) drawSeries(lastSeries);
  const lb = lastBook && lastBook.rows[0];
  if (lb) {
    const U = num(lb, 'units_whatif'), up = U / Math.max(1e-9, num(lb, 'units')), wd = $('#wd'), fl = /params \{ books\.price_factor == ([0-9.]+)/.exec(lastBook ? lastBook.aql : '');
    $('#wu').textContent = fmtInt(U); html(wd, Math.abs(up - 1) > .0005 ? fmtPct(up - 1) : ''); wd.style.color = up >= 1 ? '#3d7a22' : '#b4492c';
    $('#wr').textContent = fmtMoney(num(lb, 'revenue_whatif')); $('#wv').textContent = fl ? fl[1] : factorLit(E.ds.factor);
  }
  const gs = document.querySelector('#grain'); if (gs) kids(gs).forEach((s) => s.classList.toggle('on', s.dataset.v === E.grain));
}

/* ---------- signposts, tips, caption ---------- */
const tip = document.createElement('div'); tip.className = 'tip'; $('#labels').appendChild(tip);
/** @param {Seg} st @param {number} lv0 @param {Frame} E */
export function labels(st, lv0, E) {
  const ax = st.m > .5 ? st.gT : st.gF, dip = st.m > 0 && st.m < 1 ? Math.abs(st.m - .5) * 2 : 1;
  S.rooms.forEach((o, i) => {
    const a = ax.ar[i], rev = lerp(st.gF.ar[i].revenue, st.gT.ar[i].revenue, st.m); o.div.classList.toggle('hl', i === E.hRoom);
    html(o.div, `<b>${esc(a.name)}</b><span>${(o.share * 100).toFixed(1)}% · ${fmtMoney(rev)} · <em class="${dcls(o.delta)}">${fmtPct(o.delta)}</em></span>`);
    place(o.div, proj(o.cx, RH + 1.0, o.r.z + o.r.d), lv0 * (.35 + .65 * dip));
  });
  // nudge colliding signposts apart (lower one moves down)
  const bx = S.rooms.map((o) => o.div).filter((d) => d.style.visibility !== 'hidden').map((d) => ({ d, x: parseFloat(d.style.left), y: parseFloat(d.style.top), w: d.offsetWidth, h: d.offsetHeight })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < bx.length; i++) for (let j = 0; j < i; j++) { const a = bx[j], b = bx[i]; if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 6 && b.y - b.h < a.y + 4) { b.y = a.y + b.h + 4; b.d.style.top = b.y + 'px'; } }
  const tp = E.tipF && E.tipOp > .01 ? E.tipF() : null; if (tp) html(tip, tp.h); place(tip, tp && tp.p, E.tipOp);
  html($('#say'), `<span class="t">${esc(E.say[0])}</span><small>${esc(E.say[1])}</small>`);
  $('#say').style.display = clock.manual ? 'none' : ''; // under the video driver the renderer draws its own captions
  void cur; void isExt;
}
