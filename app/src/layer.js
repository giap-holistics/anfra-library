// The structure layer: invisible elements over the viewport, one per data object
// on screen (room, bookcase, spine, opened book), so anfra's Inspect panel can list, outline and pick them. They take pointer
// events (for Pick); the app's hover/click/drag/wheel listeners sit on #view and hit-test by coordinates,
// so events that land on a layer element bubble there unchanged.
// The set is rebuilt only when it changes (level, selection, axis, an object entering or leaving the
// screen); every frame only moves and sizes each element with a transform, which the structure ignores.
import { sceneObjects } from './hover.js';
import { VP } from './sidebar.js';
import { $ } from './util.js';

const layer = $('#objs');
/** Live elements by block id. @type {Map<string, HTMLElement>} */
const live = new Map();
let lastSig = '';
const BASE = 100; // each element is BASE px square, scaled to the object's rect

/** Sync the layer with the current frame. Call after the frame's camera is final. */
export function syncLayer() {
  const { sig, list } = sceneObjects();
  if (sig !== lastSig) {
    lastSig = sig;
    /** @type {HTMLElement[]} */ const next = [];
    for (const o of list) {
      let el = live.get(o.id);
      if (!el) { el = document.createElement('div'); el.dataset.anfraBlock = o.id; }
      if (el.dataset.anfraLabel !== o.label) el.dataset.anfraLabel = o.label;
      if (el.dataset.anfraQuery !== o.query) el.dataset.anfraQuery = o.query;
      next.push(el);
    }
    live.clear(); for (const el of next) live.set(/** @type {string} */ (el.dataset.anfraBlock), el);
    layer.replaceChildren(...next); // keeps DOM order = object order, so the Inspect keys stay put
  }
  for (const o of list) {
    const el = /** @type {HTMLElement} */ (live.get(o.id)), r = o.rect;
    // clipped to the viewport, so an outline never spills over the sidebar
    const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(VP.w, r.x + r.w), y1 = Math.min(VP.h, r.y + r.h);
    el.style.transform = `translate(${x0.toFixed(1)}px,${y0.toFixed(1)}px) scale(${((x1 - x0) / BASE).toFixed(4)},${((y1 - y0) / BASE).toFixed(4)})`;
  }
}
