// window.__lib: the demo-driver surface (video/DRIVER-CONTRACT.md). The page owns its clock; `tick`
// advances it and renders one frame synchronously, so a renderer gets deterministic frames.
import * as A from './anim.js';
import { BOOKS } from './data.js';
import { screenRectOf } from './hover.js';
import { clamp, clock } from './util.js';

/** @typedef {import('./data.js').Axis} Axis */
/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */
/**
 * @typedef {{ ready: boolean, setCam(cam: 'default'|'exterior'|'ladder'): void,
 *   orbit(dYawDeg: number, dPitchDeg: number): void, zoom(factor: number): void, setAxis(axis: Axis): void, hover(x: number, y: number): void, click(x: number, y: number): void,
 *   goRoom(indexOrName: number|string): void, panBy(dx: number, dz: number): void, goShelf(indexInRoom: number): void, openBook(indexOnShelf: number): void,
 *   setWhatIf(priceFactor: number): void, setGrain(g: 'day'|'week'|'month'): void, setPrice(lo: number, hi: number): void, goLevel(n: 0|1|2|3): void,
 *   state(): { level: number, room: string|null, shelf: string|null, book: string|null, axis: string },
 *   screenRectOf(kind: 'room'|'shelf'|'spine'|'signpost'|'book', index: number): Rect|null, tick(dtSeconds: number): void }} LibDriver
 */
/**
 * The engine hooks main.js hands over.
 * @typedef {{ frame: () => void, setCam: (c: 'default'|'exterior'|'ladder') => void,
 *   hoverAt: (x: number, y: number) => void, clickAt: (x: number, y: number) => void }} Engine
 */
/** @param {Engine} en @returns {LibDriver} */
export function installDriver(en) {
  const D2R = Math.PI / 180;
  /** @type {LibDriver} */
  const lib = {
    ready: false,
    setCam: (c) => en.setCam(c),
    orbit(dy, dp) {
      const S = A.IS;
      if (!S) return;
      const ext = A.isExt();
      S.orbit = ext ? S.orbit + dy * D2R : clamp(S.orbit + dy * D2R, -0.9, 0.9);
      S.pitchT = ext ? clamp(S.pitchT + dp * D2R, -0.25, 1.07) : clamp(S.pitchT + dp * D2R, -0.21, 0.21);
    },
    zoom(f) {
      const S = A.IS;
      if (!S) return;
      S.zoomT = A.isExt() ? clamp(S.zoomT * f, 0.6, 1) : clamp(S.zoomT * f, 0.72, 1);
    },
    setAxis: (a) => {
      if (A.IS) A.setAxis(a);
    },
    hover: (x, y) => en.hoverAt(x, y),
    click: (x, y) => {
      en.hoverAt(x, y);
      en.clickAt(x, y);
    },
    goRoom(r) {
      const S = A.IS;
      if (!S) return;
      const i = typeof r === 'number' ? r : S.G.ar.findIndex((a) => a.name === r);
      A.goRoom(i);
    },
    panBy: (dx, dz) => {
      if (A.IS) A.panBy(dx, dz);
    },
    goShelf(k) {
      const S = A.IS;
      if (S && S.room >= 0) A.goShelf(S.room * 8 + k);
    },
    openBook(j) {
      const S = A.IS;
      if (!S || S.ci < 0) return;
      for (let b = 0; b < BOOKS.length; b++)
        if (S.asg.asg[b] === S.ci && S.asg.slot[b] === j) {
          A.openBook(b);
          return;
        }
    },
    setWhatIf: (f) => {
      if (A.IS) A.setWhatIf(f);
    },
    setGrain: (g) => {
      if (A.IS) A.setGrain(g);
    },
    setPrice: (lo, hi) => {
      if (A.IS) A.setPrice(lo, hi);
    },
    goLevel: (n) => {
      if (A.IS) A.goLevel(n);
    },
    state() {
      const S = A.IS;
      if (!S) return { level: 0, room: null, shelf: null, book: null, axis: 'category' };
      return {
        level: S.lv,
        room: S.room >= 0 ? S.G.ar[S.room].name : null,
        shelf: S.ci >= 0 ? (S.G.meta[S.ci]?.genre ?? null) : null,
        book: S.bk >= 0 ? BOOKS[S.bk].title : null,
        axis: S.ds.axis,
      };
    },
    screenRectOf,
    tick(dt) {
      clock.manual = true;
      clock.t += Math.max(0, dt);
      en.frame();
    },
  };
  /** @type {Window & { __lib?: LibDriver }} */ (window).__lib = lib;
  return lib;
}
