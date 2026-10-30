// Shared fake catalogue for the Library mockups. Classic script: defines window.LIBRARY.
// 6 categories × 8 genres × 40 books = 1,920 books. Every book also has a market and an
// audience age band, so the library can be regrouped by any of the three area axes.
(function () {
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = mulberry32(20261020);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const CATEGORIES = {
    Fiction: [
      'Literary',
      'Crime & Thriller',
      'Fantasy',
      'Science Fiction',
      'Romance',
      'Historical',
      'Horror',
      'Short Stories',
    ],
    'Non-fiction': [
      'History',
      'Biography',
      'Science',
      'Politics',
      'Business',
      'Psychology',
      'True Crime',
      'Essays',
    ],
    'Children & YA': [
      'Picture Books',
      'Early Readers',
      'Middle Grade',
      'YA Fantasy',
      'YA Contemporary',
      'Activity',
      'Classics Retold',
      'Graphic Novels',
    ],
    Academic: [
      'Mathematics',
      'Computer Science',
      'Medicine',
      'Law',
      'Economics',
      'Engineering',
      'Philosophy',
      'Linguistics',
    ],
    'Comics & Manga': [
      'Shonen',
      'Shojo',
      'Seinen',
      'Superhero',
      'Indie',
      'Webtoon Print',
      'Franco-Belgian',
      'Collected Strips',
    ],
    Lifestyle: [
      'Cookery',
      'Travel',
      'Home & Garden',
      'Fitness',
      'Crafts',
      'Parenting',
      'Mindfulness',
      'Fashion',
    ],
  };
  const MARKETS = ['Trade', 'Mass market', 'Education', 'Professional', 'Gift', 'Self-published'];
  const AGES = ['0–5', '6–12', 'Teen', '18–34', '35–54', '55+'];
  const FORMATS = ['Paperback', 'Hardcover', 'Ebook', 'Audiobook'];
  const W1 = [
    'The',
    'A',
    'Last',
    'Silent',
    'Hidden',
    'Little',
    'Burning',
    'Quiet',
    'Glass',
    'Iron',
    'Paper',
    'Winter',
    'Salt',
    'Blue',
    'Hollow',
    'Night',
  ];
  const W2 = [
    'Orchard',
    'Cartographer',
    'Lighthouse',
    'Equation',
    'Garden',
    'Harbour',
    'Archive',
    'Kingdom',
    'Protocol',
    'Kitchen',
    'Atlas',
    'Thief',
    'Tide',
    'Engine',
    'Letter',
    'River',
  ];
  const W3 = [
    'of Ash',
    'of Small Hours',
    'in Winter',
    'and Other Stories',
    'for Beginners',
    'of the North',
    'Explained',
    'at Dawn',
    'of Lost Things',
    'Revisited',
    '',
    '',
    '',
    '',
  ];
  const FIRST = [
    'Mara',
    'Tomas',
    'Ada',
    'Kenji',
    'Leila',
    'Owen',
    'Priya',
    'Hugo',
    'Nia',
    'Felix',
    'Sana',
    'Ivo',
    'Rosa',
    'Elias',
    'Wen',
    'Zara',
  ];
  const LAST = [
    'Okafor',
    'Lindqvist',
    'Haddad',
    'Moreau',
    'Tanaka',
    'Baptiste',
    'Novak',
    'Reyes',
    'Achebe',
    'Kowalski',
    'Brennan',
    'Sato',
    'Varga',
    'Mensah',
    'Duarte',
    'Holm',
  ];
  const ageWeights = {
    Fiction: [0, 0, 1, 4, 4, 3],
    'Non-fiction': [0, 0, 1, 3, 4, 4],
    'Children & YA': [4, 5, 4, 1, 0, 0],
    Academic: [0, 0, 1, 5, 3, 1],
    'Comics & Manga': [0, 2, 5, 4, 1, 0],
    Lifestyle: [0, 0, 1, 3, 4, 3],
  };
  const marketWeights = {
    Fiction: [5, 4, 0, 0, 2, 3],
    'Non-fiction': [5, 2, 1, 2, 2, 2],
    'Children & YA': [4, 3, 3, 0, 3, 1],
    Academic: [1, 0, 5, 5, 0, 1],
    'Comics & Manga': [3, 4, 0, 0, 2, 3],
    Lifestyle: [4, 2, 0, 1, 5, 2],
  };
  function weighted(list, w) {
    const t = w.reduce((a, b) => a + b, 0);
    let r = R() * t;
    for (let i = 0; i < list.length; i++) {
      r -= w[i];
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }
  const books = [];
  let n = 0;
  for (const [category, genres] of Object.entries(CATEGORIES)) {
    for (const genre of genres) {
      const genreHeat = 0.4 + R() * 1.2; // some genres simply sell more
      for (let i = 0; i < 40; i++) {
        const price = +(3 + Math.pow(R(), 1.6) * 60).toFixed(2);
        const units = Math.round(Math.pow(R(), 2.2) * 4200 * genreHeat + 8); // long tail
        const delta = (R() - 0.45) * 0.6; // period-over-period, biased slightly up
        const unitsPrev = Math.max(1, Math.round(units / (1 + delta)));
        const base = units / 12;
        const weekly = Array.from({ length: 12 }, (_, w) =>
          Math.max(0, Math.round(base * (0.7 + 0.6 * R()) * (1 + delta * (w / 11)))),
        );
        books.push({
          isbn: '978' + String(1000000000 + n++).slice(0, 10),
          title: [pick(W1), pick(W2), pick(W3)].filter(Boolean).join(' '),
          author: pick(FIRST) + ' ' + pick(LAST),
          category,
          genre,
          market: weighted(MARKETS, marketWeights[category]),
          age: weighted(AGES, ageWeights[category]),
          format: pick(FORMATS),
          price,
          units,
          unitsPrev,
          revenue: +(units * price).toFixed(2),
          rating: +(3.2 + R() * 1.75).toFixed(1),
          weekly,
          hue: Math.floor(R() * 360), // spine colour
        });
      }
    }
  }
  // Group helpers used by both mockups.
  function groupBy(list, key) {
    const m = new Map();
    for (const b of list) {
      const k = b[key];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(b);
    }
    return m;
  }
  function sum(list, key) {
    return list.reduce((a, b) => a + b[key], 0);
  }
  function areas(axis /* 'category' | 'market' | 'age' */, filter = () => true) {
    const pool = books.filter(filter);
    const total = sum(pool, 'revenue');
    const order = axis === 'category' ? Object.keys(CATEGORIES) : axis === 'market' ? MARKETS : AGES;
    return order.map((name) => {
      const bs = pool.filter((b) => b[axis] === name);
      const revenue = sum(bs, 'revenue'),
        units = sum(bs, 'units'),
        unitsPrev = sum(bs, 'unitsPrev');
      return {
        name,
        books: bs,
        revenue,
        units,
        unitsPrev,
        share: revenue / total,
        delta: units / Math.max(1, unitsPrev) - 1,
      };
    });
  }
  function shelves(areaBooks, topN = 8) {
    const total = sum(areaBooks, 'revenue');
    const out = [...groupBy(areaBooks, 'genre')]
      .map(([genre, bs]) => {
        const revenue = sum(bs, 'revenue'),
          units = sum(bs, 'units'),
          unitsPrev = sum(bs, 'unitsPrev');
        return {
          genre,
          books: [...bs].sort((a, b) => b.units - a.units),
          revenue,
          units,
          unitsPrev,
          share: revenue / total,
          delta: units / Math.max(1, unitsPrev) - 1,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
    out.forEach((s, i) => (s.rank = i + 1));
    return { shown: out.slice(0, topN), more: out.slice(topN) };
  }
  window.LIBRARY = {
    books,
    CATEGORIES,
    MARKETS,
    AGES,
    FORMATS,
    areas,
    shelves,
    groupBy,
    sum,
    fmtMoney: (v) =>
      v >= 1e6
        ? '$' + (v / 1e6).toFixed(2) + 'M'
        : v >= 1e3
          ? '$' + (v / 1e3).toFixed(1) + 'k'
          : '$' + v.toFixed(0),
    fmtInt: (v) => v.toLocaleString('en-US'),
    fmtPct: (v) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%',
  };
})();
