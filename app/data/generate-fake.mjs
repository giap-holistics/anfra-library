// Turns the seeded fake catalogue (catalogue.js, the same generator the mockups used) into CSVs
// for DuckDB: books.csv (1,920 rows) and sales.csv (24 weekly rows per book: the 12 weeks before
// the period and the 12 weeks of the period, so period-over-period metrics have data to compare).
//   node data/generate-fake.mjs && duckdb data/library.duckdb < data/load.sql
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
globalThis.window = {};
createRequire(import.meta.url)('./catalogue.js');
const { books } = globalThis.window.LIBRARY;
const PERIOD_START = new Date(Date.UTC(2026, 6, 27)); // Monday 2026-07-27; period ends Sunday 2026-10-18
const day = (d, n) => new Date(d.getTime() + n * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = mulberry32(7);
const bookRows = ['isbn,title,author,category,genre,market,audience_age,format,price,rating,hue'];
const saleRows = ['isbn,week_start,units,revenue'];
for (const b of books) {
  bookRows.push(
    [
      q(b.isbn),
      q(b.title),
      q(b.author),
      q(b.category),
      q(b.genre),
      q(b.market),
      q(b.age),
      q(b.format),
      b.price,
      b.rating,
      b.hue,
    ].join(','),
  );
  // previous 12 weeks: same shape as the current series, scaled so they sum to unitsPrev
  const cur = b.weekly,
    curSum = cur.reduce((a, c) => a + c, 0) || 1;
  for (let w = 0; w < 12; w++) {
    const u = Math.max(0, Math.round((cur[(w * 5) % 12] / curSum) * b.unitsPrev * (0.8 + 0.4 * R())));
    saleRows.push([q(b.isbn), iso(day(PERIOD_START, (w - 12) * 7)), u, (u * b.price).toFixed(2)].join(','));
  }
  for (let w = 0; w < 12; w++)
    saleRows.push(
      [q(b.isbn), iso(day(PERIOD_START, w * 7)), cur[w], (cur[w] * b.price).toFixed(2)].join(','),
    );
}
writeFileSync(new URL('./books.csv', import.meta.url), bookRows.join('\n') + '\n');
writeFileSync(new URL('./sales.csv', import.meta.url), saleRows.join('\n') + '\n');
console.log(
  bookRows.length - 1,
  'books,',
  saleRows.length - 1,
  'sales rows, period',
  iso(PERIOD_START),
  'to',
  iso(day(PERIOD_START, 83)),
);
