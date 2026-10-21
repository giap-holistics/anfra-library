// The governed data layer: one anfra app, its queries and controls, a request queue that applies a
// DataState to the controls and executes, and a snapshot cache keyed by each query's own inputs.
// Every number the scene and sidebar show is read from a Snap here.
import { fmtInt } from './util.js';

/** @typedef {import('@holistics/anfra-sdk/app').App} App */
/** @typedef {import('@holistics/anfra-sdk/app').Query} Query */
/** @typedef {import('@holistics/anfra-sdk/app').Filter} Filter */
/** @typedef {import('@holistics/anfra-sdk/app').Row} Row */
/** @typedef {'category'|'market'|'age'} Axis */
/** @typedef {'day'|'week'|'month'} Grain */
/** @typedef {'12w'|'8w'|'4w'} PeriodId */

/**
 * Everything the controls can say. A query's cache key is the subset of these it depends on.
 * @typedef {{ period: PeriodId, lo: number, hi: number, axis: Axis, room: string|null, genre: string|null, isbn: string|null, factor: number, grain: Grain }} DataState
 */
/** One query result as captured right after the execute that produced it. @typedef {{ rows: Row[], aql: string, n: number, ms: number }} Snap */

export const DATASET = 'library';
/** @type {Record<Axis, string>} */
export const AXF = { category: 'books.category', market: 'books.market', age: 'books.target_age' };
/** Short field names for the path chips. @type {Record<Axis, string>} */
export const AXN = { category: 'category', market: 'market', age: 'target_age' };
/** @type {Record<Axis, string>} */
export const AXL = { category: 'category', market: 'market', age: 'target age' };
/** Display order of the six rooms per axis (stable room indices across axes); unknown values append. @type {Record<Axis, string[]>} */
const ORDER = {
  category: ['Fiction', 'Non-fiction', 'Children & YA', 'Academic', 'Comics & Manga', 'Lifestyle'],
  market: ['Trade', 'Mass market', 'Education', 'Professional', 'Gift', 'Self-published'],
  age: ['0–5', '6–12', '13–17', '18–34', '35–54', '55+'],
};
/** @typedef {{ id: PeriodId, from: string, to: string, label: string, short: string }} Period */
/** Reporting windows ending on the last loaded week; units_prev always compares with the 12 weeks before. @type {Period[]} */
export const PERIODS = [
  { id: '12w', from: '2026-07-27', to: '2026-10-18', label: 'Jul 27 – Oct 18, 2026', short: 'last 12 weeks' },
  { id: '8w', from: '2026-08-24', to: '2026-10-18', label: 'Aug 24 – Oct 18, 2026', short: 'last 8 weeks' },
  { id: '4w', from: '2026-09-21', to: '2026-10-18', label: 'Sep 21 – Oct 18, 2026', short: 'last 4 weeks' },
];
/** @param {PeriodId} id @returns {Period} */
export const periodOf = (id) => PERIODS.find((p) => p.id === id) || PERIODS[0];

/** The 'no price filter' range: a sentinel independent of the catalogue, so cache keys never depend on data-derived bounds. */
export const FULL = { lo: 0, hi: 1e6 };
/** Price slider bounds (whole dollars); set from the catalogue once it loads. */
export const PRICE = { min: 3, max: 63 };
/** Slider position 0..1 for a price: log scale, since prices are long-tailed (median ≈ $14, max > $130). @param {number} v @returns {number} */
export const priceToPos = (v) => Math.log(Math.max(v, PRICE.min) / PRICE.min) / Math.log(PRICE.max / PRICE.min);
/** Inverse of priceToPos, in dollars. @param {number} p @returns {number} */
export const posToPrice = (p) => PRICE.min * Math.pow(PRICE.max / PRICE.min, p);
/** @param {DataState} s @returns {boolean} */
export const priceOn = (s) => s.lo > FULL.lo || s.hi < FULL.hi;

/** @returns {DataState} */
export const defaultState = () => ({ period: '12w', lo: FULL.lo, hi: FULL.hi, axis: 'category', room: null, genre: null, isbn: null, factor: 1, grain: 'week' });

/* ---------- typed reads at the Row boundary (values arrive as digit strings) ---------- */
/** @param {Row} row @param {string} key @returns {number} */
export function num(row, key) {
  const v = row[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new Error(`column "${key}" is not a number: ${JSON.stringify(v)}`);
  return n;
}
/** Like num, but a NaN/null (e.g. growth with no previous units) becomes `dflt`. @param {Row} row @param {string} key @param {number} dflt @returns {number} */
export function numOr(row, key, dflt) { const v = row[key]; if (v == null || v === 'NaN') return dflt; return num(row, key); }
/** @param {Row} row @param {string} key @returns {string} */
export function str(row, key) {
  const v = row[key];
  if (typeof v !== 'string') throw new Error(`column "${key}" is not text: ${JSON.stringify(v)}`);
  return v;
}

/* ---------- AQL (the period, rooms, genre, isbn and price arrive as Query Input from the controls) ---------- */
/** @param {number} f @returns {string} */
export const factorLit = (f) => String(Math.round(f * 100) / 100);
const AQL = {
  allbooks: `explore {
  dimensions {
    isbn: books.isbn, title: books.title, author: books.author,
    category: books.category, genre: books.genre, market: books.market,
    age: books.target_age, format: books.format,
    price: books.price, rating: books.rating, hue: books.hue
  }
  measures { units: units, revenue: revenue, units_prev: units_prev }
  sorts { units desc }
}`,
  /** @param {Axis} a */
  rooms: (a) => `explore {
  dimensions { room: ${AXF[a]} }
  measures {
    revenue: revenue, units: units, units_prev: units_prev,
    units_growth: units_growth, revenue_share: revenue_share,
    titles: titles, avg_price: avg_price, avg_rating: avg_rating
  }
  sorts { revenue desc }
}`,
  /** @param {Axis} a */
  cases: (a) => `explore {
  dimensions { room: ${AXF[a]}, genre: books.genre }
  measures {
    revenue: revenue, units: units, units_growth: units_growth,
    genre_share: genre_share
  }
  sorts { revenue desc }
}`,
  shelves: `explore {
  dimensions { genre: books.genre }
  measures {
    revenue: revenue, units: units, units_prev: units_prev,
    units_growth: units_growth, genre_share: genre_share,
    revenue_rank: revenue_rank, titles: titles,
    avg_price: avg_price, avg_rating: avg_rating
  }
  sorts { revenue desc }
}`,
  topshelf: `explore {
  dimensions { isbn: books.isbn }
  measures {
    units: units, revenue: revenue, units_prev: units_prev,
    units_growth: units_growth, title_share: title_share,
    revenue_rank: revenue_rank
  }
  sorts { units desc }
}`,
  /** @param {number} f */
  series: (f) => `explore {
  dimensions { week: sales.week_start | week() }
  measures {
    units: units, revenue: revenue,
    units_whatif: units_whatif, revenue_whatif: revenue_whatif
  }
  params { books.price_factor == ${factorLit(f)} }
  sorts { week asc }
}`,
  /** @param {number} f */
  book: (f) => `explore {
  measures {
    units: units, revenue: revenue, units_prev: units_prev,
    units_growth: units_growth, avg_price: avg_price, avg_rating: avg_rating,
    units_whatif: units_whatif, revenue_whatif: revenue_whatif
  }
  params { books.price_factor == ${factorLit(f)} }
}`,
};

/** @typedef {'allbooks'|'rooms_category'|'rooms_market'|'rooms_age'|'cases_category'|'cases_market'|'cases_age'|'shelves'|'topshelf'|'series'|'book'} QName */
/** Which state fields each query depends on (its cache key). @type {Record<QName, (s: DataState) => string>} */
const DEPS = {
  allbooks: (s) => `${s.period}|${s.lo}|${s.hi}`,
  rooms_category: (s) => `${s.period}|${s.lo}|${s.hi}`,
  rooms_market: (s) => `${s.period}|${s.lo}|${s.hi}`,
  rooms_age: (s) => `${s.period}|${s.lo}|${s.hi}`,
  cases_category: (s) => s.period,
  cases_market: (s) => s.period,
  cases_age: (s) => s.period,
  shelves: (s) => `${s.period}|${s.lo}|${s.hi}|${s.axis}|${s.room}`,
  topshelf: (s) => `${s.period}|${s.lo}|${s.hi}|${s.axis}|${s.room}|${s.genre}`,
  book: (s) => `${s.period}|${s.axis}|${s.room}|${s.genre}|${s.isbn}|${factorLit(s.factor)}`,
  series: (s) => `${s.period}|${s.axis}|${s.room}|${s.genre}|${s.isbn}|${factorLit(s.factor)}|${s.grain}`,
};
const QNAMES = /** @type {QName[]} */ (Object.keys(DEPS));

/* ---------- the app ---------- */
/**
 * @typedef {{ app: App, q: Record<QName, Query>, period: Filter, price: Filter, room: Record<Axis, Filter>, genre: Filter, isbn: Filter,
 *   drill: import('@holistics/anfra-sdk/app').DateDrillControl }} Wiring
 */
/** @type {Wiring|null} */
let W = null;

/** @returns {Wiring} */
function wiring() {
  if (W) return W;
  const app = Anfra.createApp({ title: 'Library', timezone: 'Etc/UTC' });
  /** @param {string} name @param {string} aql @param {number} [pageSize] @returns {Query} */
  const mk = (name, aql, pageSize) => app.createQuery(name, pageSize ? { dataset: DATASET, aql, pageSize } : { dataset: DATASET, aql });
  /** @type {Record<QName, Query>} */
  const q = {
    allbooks: mk('allbooks', AQL.allbooks),
    rooms_category: mk('rooms_category', AQL.rooms('category')), rooms_market: mk('rooms_market', AQL.rooms('market')), rooms_age: mk('rooms_age', AQL.rooms('age')),
    cases_category: mk('cases_category', AQL.cases('category')), cases_market: mk('cases_market', AQL.cases('market')), cases_age: mk('cases_age', AQL.cases('age')),
    shelves: mk('shelves', AQL.shelves),
    topshelf: mk('topshelf', AQL.topshelf, 40),
    series: mk('series', AQL.series(1)),
    book: mk('book', AQL.book(1)),
  };
  const period = app.createFilter('period', { type: 'date', label: 'Period' });
  const price = app.createFilter('price', { type: 'number', label: 'Price range' });
  /** @type {Record<Axis, Filter>} */
  const room = {
    category: app.createFilter('room_category', { field: AXF.category }),
    market: app.createFilter('room_market', { field: AXF.market }),
    age: app.createFilter('room_age', { field: AXF.age }),
  };
  const genre = app.createFilter('shelf_genre', { field: 'books.genre' });
  const isbn = app.createFilter('book_isbn', { field: 'books.isbn' });
  const drill = app.createDateDrill('grain', { default: 'week' });
  for (const n of QNAMES) app.mapControl(period, q[n], { field: 'sales.week_start' });
  for (const n of /** @type {QName[]} */ (['allbooks', 'rooms_category', 'rooms_market', 'rooms_age', 'shelves', 'topshelf'])) app.mapControl(price, q[n], { field: 'books.price' });
  for (const a of /** @type {Axis[]} */ (['category', 'market', 'age'])) for (const n of /** @type {QName[]} */ (['shelves', 'topshelf', 'series', 'book'])) app.mapControl(room[a], q[n], { field: AXF[a] });
  for (const n of /** @type {QName[]} */ (['topshelf', 'series', 'book'])) app.mapControl(genre, q[n], { field: 'books.genre' });
  for (const n of /** @type {QName[]} */ (['series', 'book'])) app.mapControl(isbn, q[n], { field: 'books.isbn' });
  app.mapControl(drill, q.series, { field: 'sales.week_start' });
  W = { app, q, period, price, room, genre, isbn, drill };
  return W;
}

/* ---------- cache + queue ---------- */
/** @type {Map<string, Snap>} */
const CACHE = new Map();
/** @param {QName} n @param {DataState} s @returns {string} */
const ck = (n, s) => n + '#' + DEPS[n](s);
/** @param {QName} n @param {DataState} s @returns {Snap|undefined} */
export const snap = (n, s) => CACHE.get(ck(n, s));
/** Live status for the sidebar. */
export const status = { pending: 0, errors: /** @type {string[]} */ ([]), cols: 0, measures: 0, adhoc: 0, runs: 0 };

/** @param {DataState} s */
function apply(s) {
  const w = wiring(), p = periodOf(s.period);
  w.period.setCondition({ operator: 'between', values: [p.from, p.to] });
  w.price.setCondition(priceOn(s) ? { operator: 'between', values: [String(s.lo), String(s.hi)] } : { operator: 'none' });
  for (const a of /** @type {Axis[]} */ (['category', 'market', 'age'])) w.room[a].setCondition(s.room != null && s.axis === a ? { operator: 'is', values: [s.room] } : { operator: 'none' });
  w.genre.setCondition(s.genre != null ? { operator: 'is', values: [s.genre] } : { operator: 'none' });
  w.isbn.setCondition(s.isbn != null ? { operator: 'is', values: [s.isbn] } : { operator: 'none' });
  w.drill.setGrain(s.grain);
  // the what-if value is an AQL param, not a Query Input condition: rewrite the params block
  w.q.series.declaration.aql = AQL.series(s.factor);
  w.q.book.declaration.aql = AQL.book(s.factor);
}

/** @param {DataState} s @param {QName[]} need @returns {boolean} */
const have = (s, need) => need.every((n) => CACHE.has(ck(n, s)));

/** @param {DataState} s @returns {Promise<void>} */
async function run(s) {
  const w = wiring();
  apply(s); applied = sigOf(s);
  const t0 = performance.now();
  const res = await w.app.execute();
  const ms = Math.round(performance.now() - t0);
  status.runs++;
  status.errors = res.failed.map((n) => `${n}: ${w.q[/** @type {QName} */ (n)]?.error?.message ?? 'failed'}`);
  for (const e of status.errors) console.warn('[library] query failed', e);
  let cols = 0, meas = 0, adhoc = 0;
  for (const n of QNAMES) {
    const q = w.q[n], r = q.result;
    if (!r) continue;
    cols += r.columns.length; meas += r.columns.filter((c) => c.isMeasure).length; adhoc += r.columns.filter((c) => c.adhoc).length;
    if (q.state !== 'success') continue;
    const k = ck(n, s);
    // a query that was not dirty kept the result of the same inputs: keep its original latency
    const prev = CACHE.get(k);
    CACHE.set(k, { rows: r.rows, aql: r.debug?.executedAql ?? q.declaration.aql, n: r.meta.numRows, ms: res.succeeded.includes(n) ? ms : prev ? prev.ms : ms });
  }
  Object.assign(status, { cols, measures: meas, adhoc });
}

let chain = Promise.resolve();
/** Everything `apply` writes into the controls and AQL, as one string. @param {DataState} s @returns {string} */
const sigOf = (s) => [s.period, s.lo, s.hi, s.axis, s.room, s.genre, s.isbn, factorLit(s.factor), s.grain].join('|');
/** The state the controls were last executed with, and the state the page shows. */
let applied = '';
/** @type {DataState|null} */ let shown = null;
/**
 * Make sure every query in `need` has a snapshot for state `s`. Requests run one at a time (the
 * controls are shared), and a request whose answers are already cached resolves immediately.
 * Once the queue drains, the controls are brought back to the shown state (see `display`), so the
 * host's queries (their conditions, executed AQL and results) always describe what the page shows.
 * @param {DataState} s @param {QName[]} [need] @returns {Promise<void>}
 */
export function request(s, need = QNAMES) {
  const st = { ...s };
  if (have(st, need) && (!shown || applied === sigOf(shown))) return Promise.resolve();
  status.pending++;
  const p = chain.then(() => (have(st, need) && (!shown || applied === sigOf(shown)) ? undefined : run(have(st, need) && shown ? shown : st)))
    .finally(() => { status.pending--; setTimeout(settle, 0); });
  const safe = p.catch((e) => { console.error('[library] execute', e); });
  chain = safe;
  return safe; // never rejects: a failed run shows in status.errors
}
/** With the queue drained (a sequence of prefetches does not count), put the controls back on the shown state. */
function settle() { if (status.pending === 0 && shown && applied !== sigOf(shown)) void request(shown, []); }
/**
 * The page now shows state `s`: fetch what it needs, and keep the controls on it. Cached answers are
 * still read at once; the queries re-run only if their controls had moved to another state.
 * @param {DataState} s @param {QName[]} [need] @returns {Promise<void>}
 */
export function display(s, need = QNAMES) { shown = { ...s }; return request(s, need); }
/** The queries each level needs. @type {Record<'all'|'room'|'sh'|'bk', QName[]>} */
export const NEED = {
  all: ['allbooks', 'rooms_category', 'rooms_market', 'rooms_age', 'cases_category', 'cases_market', 'cases_age'],
  room: ['allbooks', 'rooms_category', 'rooms_market', 'rooms_age', 'shelves'],
  sh: ['allbooks', 'shelves', 'topshelf'],
  bk: ['book', 'series', 'topshelf', 'shelves'],
};

/* ---------- the catalogue and the per-axis room/shelf data ---------- */
/**
 * One title. Static attributes come from allbooks; units/revenue/unitsPrev are the current period's
 * (full price range) and are rewritten when the period changes.
 * @typedef {{ idx: number, isbn: string, title: string, author: string, category: string, genre: string, market: string, age: string,
 *   format: string, price: number, rating: number, hue: number, units: number, revenue: number, unitsPrev: number }} Book
 */
/** @typedef {{ name: string, revenue: number, units: number, unitsPrev: number, delta: number, share: number, books: Book[], shelves: ShelfData[] }} Area */
/** @typedef {{ genre: string, area: string, rank: number, share: number, revenue: number, units: number, delta: number, books: Book[] }} ShelfData */
/** @typedef {{ axis: Axis, areas: Area[] }} AxisData */

/** @type {Book[]} */
export const BOOKS = [];
/** @type {Map<string, Book>} */
export const BY_ISBN = new Map();

/** @param {Book} b @param {Axis} a @returns {string} */
export const axisVal = (b, a) => (a === 'category' ? b.category : a === 'market' ? b.market : b.age);

/** Build (once) or refresh (per period) the catalogue from an allbooks snapshot at full price. @param {Snap} sn */
export function loadCatalogue(sn) {
  if (!BOOKS.length) {
    const rows = [...sn.rows].sort((a, b) => (str(a, 'isbn') < str(b, 'isbn') ? -1 : 1));
    rows.forEach((r, idx) => {
      /** @type {Book} */
      const b = { idx, isbn: str(r, 'isbn'), title: str(r, 'title'), author: str(r, 'author'), category: str(r, 'category'), genre: str(r, 'genre'), market: str(r, 'market'),
        age: str(r, 'age'), format: str(r, 'format'), price: num(r, 'price'), rating: num(r, 'rating'), hue: num(r, 'hue'), units: 0, revenue: 0, unitsPrev: 0 };
      BOOKS.push(b); BY_ISBN.set(b.isbn, b);
    });
    PRICE.min = Math.floor(Math.min(...BOOKS.map((b) => b.price)));
    PRICE.max = Math.ceil(Math.max(...BOOKS.map((b) => b.price)));
  }
  for (const b of BOOKS) { b.units = 0; b.revenue = 0; b.unitsPrev = 0; }
  for (const r of sn.rows) { const b = BY_ISBN.get(str(r, 'isbn')); if (b) { b.units = num(r, 'units'); b.revenue = num(r, 'revenue'); b.unitsPrev = numOr(r, 'units_prev', 0); } }
}

/** Rooms (canonical order) with their top-8 shelves, for one axis at the period's full price range. @param {Axis} axis @param {DataState} s @returns {AxisData} */
export function axisData(axis, s) {
  const full = { ...s, ...FULL };
  const rs = snap(/** @type {QName} */ ('rooms_' + axis), full), cs = snap(/** @type {QName} */ ('cases_' + axis), full);
  if (!rs || !cs) throw new Error(`rooms/cases for ${axis} not loaded`);
  const names = [...ORDER[axis]];
  for (const r of rs.rows) { const n = str(r, 'room'); if (!names.includes(n)) names.push(n); }
  const present = names.filter((n) => rs.rows.some((r) => str(r, 'room') === n));
  if (present.length !== 6) throw new Error(`the library has 6 rooms; axis ${axis} has ${present.length}`);
  const areas = present.map((name) => {
    const r = /** @type {Row} */ (rs.rows.find((x) => str(x, 'room') === name));
    const books = BOOKS.filter((b) => axisVal(b, axis) === name);
    const shelves = cs.rows.filter((x) => str(x, 'room') === name).slice(0, 8).map((x, i) => ({
      genre: str(x, 'genre'), area: name, rank: i + 1, share: num(x, 'genre_share'), revenue: num(x, 'revenue'), units: num(x, 'units'), delta: numOr(x, 'units_growth', 0),
      books: books.filter((b) => b.genre === str(x, 'genre')).sort((a, b) => b.units - a.units),
    }));
    return { name, revenue: num(r, 'revenue'), units: num(r, 'units'), unitsPrev: numOr(r, 'units_prev', 0), delta: numOr(r, 'units_growth', 0), share: num(r, 'revenue_share'), books, shelves };
  });
  return { axis, areas };
}

/** ISBNs present under the state's price range (null = no price filter). @param {DataState} s @returns {Set<string>|null} */
export function priceSet(s) {
  if (!priceOn(s)) return null;
  const sn = snap('allbooks', s);
  return sn ? new Set(sn.rows.map((r) => str(r, 'isbn'))) : null;
}

/* ---------- view model: scope cards and lists for the sidebar ---------- */
/** @typedef {{ name: string, rev: number, u: number, d: number, ap: number, rt: number, sh: number }} Scope */
/** @typedef {'all'|'room'|'sh'|'bk'} Key */
/** @typedef {[string, number, string, boolean]} KidRow label, bar value, value text, highlighted */

/** @param {DataState} s @returns {string} */
const psfx = (s) => (priceOn(s) ? ` · $${s.lo}–$${s.hi}` : '');
/** @param {Snap} sn @param {string} col @param {string} v @returns {Row|undefined} */
const rowBy = (sn, col, v) => sn.rows.find((r) => r[col] === v);

/** The scope card for a level, or null while its query is still running. @param {Key} key @param {DataState} s @returns {Scope|null} */
export function scopeOf(key, s) {
  if (key === 'all') {
    const sn = snap(/** @type {QName} */ ('rooms_' + s.axis), s); if (!sn) return null;
    let rev = 0, u = 0, up = 0, sh = 0, rt = 0, ti = 0;
    for (const r of sn.rows) { rev += num(r, 'revenue'); u += num(r, 'units'); up += numOr(r, 'units_prev', 0); sh += num(r, 'revenue_share'); const t = num(r, 'titles'); rt += num(r, 'avg_rating') * t; ti += t; }
    return { name: 'All books' + psfx(s), rev, u, d: up ? u / up - 1 : 0, ap: u ? rev / u : 0, rt: ti ? rt / ti : 0, sh };
  }
  if (key === 'room') {
    const sn = snap(/** @type {QName} */ ('rooms_' + s.axis), s), r = sn && s.room != null ? rowBy(sn, 'room', s.room) : undefined; if (!r) return null;
    return { name: (s.room ?? '') + psfx(s), rev: num(r, 'revenue'), u: num(r, 'units'), d: numOr(r, 'units_growth', 0), ap: numOr(r, 'avg_price', 0), rt: numOr(r, 'avg_rating', 0), sh: num(r, 'revenue_share') };
  }
  if (key === 'sh') {
    const sn = snap('shelves', s), r = sn && s.genre != null ? rowBy(sn, 'genre', s.genre) : undefined; if (!r) return null;
    return { name: (s.genre ?? '') + psfx(s), rev: num(r, 'revenue'), u: num(r, 'units'), d: numOr(r, 'units_growth', 0), ap: numOr(r, 'avg_price', 0), rt: numOr(r, 'avg_rating', 0), sh: num(r, 'genre_share') };
  }
  const sn = snap('book', s), r = sn && sn.rows[0], ts = snap('topshelf', s), tr = ts && s.isbn != null ? rowBy(ts, 'isbn', s.isbn) : undefined;
  if (!r) return null;
  return { name: 'isbn …' + (s.isbn ?? '').slice(-5), rev: num(r, 'revenue'), u: num(r, 'units'), d: numOr(r, 'units_growth', 0), ap: numOr(r, 'avg_price', 0), rt: numOr(r, 'avg_rating', 0), sh: tr ? num(tr, 'title_share') : 0 };
}

/**
 * The list under the scope card. `hl` names the highlighted row (room name, genre or isbn).
 * @param {Key} key @param {DataState} s @param {string|null} hl
 * @returns {{ h: string, h2: string, rows: KidRow[], n: number }|null}
 */
export function kidsOf(key, s, hl) {
  if (key === 'all') {
    const sn = snap(/** @type {QName} */ ('rooms_' + s.axis), s); if (!sn) return null;
    const order = [...ORDER[s.axis]], rows = [...sn.rows].sort((a, b) => order.indexOf(str(a, 'room')) - order.indexOf(str(b, 'room')));
    return { h: `Rooms · by ${AXL[s.axis]}`, h2: 'share of revenue', n: sn.n, rows: rows.map((r) => [str(r, 'room'), num(r, 'revenue_share'), (num(r, 'revenue_share') * 100).toFixed(1) + '%', str(r, 'room') === hl]) };
  }
  if (key === 'room') {
    const sn = snap('shelves', s); if (!sn) return null;
    return { h: `Shelves in ${s.room}`, h2: 'share of room', n: sn.n, rows: sn.rows.slice(0, 8).map((r) => [str(r, 'genre'), num(r, 'genre_share'), (num(r, 'genre_share') * 100).toFixed(1) + '%', str(r, 'genre') === hl]) };
  }
  const sn = snap('topshelf', s); if (!sn) return null;
  return { h: priceOn(s) ? `Top on shelf · $${s.lo}–$${s.hi}` : `Top on ${s.genre} shelf`, h2: 'units', n: sn.n,
    rows: sn.rows.slice(0, 8).map((r) => { const b = BY_ISBN.get(str(r, 'isbn')); return [b ? b.title : str(r, 'isbn'), num(r, 'units'), fmtInt(num(r, 'units')), str(r, 'isbn') === hl]; }) };
}

/** The topshelf row of one book (tips, rank, share of shelf). @param {DataState} s @param {string} isbn @returns {Row|undefined} */
export function topRow(s, isbn) { const sn = snap('topshelf', s); return sn ? rowBy(sn, 'isbn', isbn) : undefined; }

/** The query whose numbers a level shows (for the Executed AQL footer). @param {Key} key @param {DataState} s @returns {Snap|undefined} */
export function levelSnap(key, s) {
  return key === 'all' ? snap(/** @type {QName} */ ('rooms_' + s.axis), s) : key === 'room' ? snap('shelves', s) : key === 'sh' ? snap('topshelf', s) : snap('book', s);
}

/** The description of a dataset metric when the descriptor carries it; the SDK 0.9 descriptor drops descriptions, so fall back to the AML text. @param {string} metric @returns {string} */
export function metricDescription(metric) {
  const ds = Anfra.datasets[DATASET];
  const m = ds && ds.metrics.find((x) => x.name === metric);
  const d = m && /** @type {{ description?: unknown }} */ (m).description;
  if (typeof d === 'string' && d) return d;
  // copied from datasets/library.dataset.aml (metric units_whatif)
  return 'Projected units under the price_factor param with a constant elasticity of -1.6: units × (1 - 1.6 × (price_factor - 1)).';
}
