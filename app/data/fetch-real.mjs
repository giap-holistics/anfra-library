// Real-ish catalogue: 1,920 real books from the public Amazon Reviews 2023 "Books" item metadata
// (McAuley Lab, UCSD; see data/SOURCES.md), mapped onto the app's fixed taxonomy
// (6 categories × 8 genres × 40 titles). Sales stay synthetic, anchored on each title's real
// ratings count. Writes books.csv and sales.csv with the same columns as before (load.sql is
// unchanged) plus books-provenance.csv (which fields are real vs derived, per title).
//
//   node data/fetch-real.mjs            # downloads ~4.9 GB once into data/raw/, then caches candidates
//   rm -f data/library.new.duckdb && duckdb data/library.new.duckdb < data/load.sql && mv data/library.new.duckdb data/library.duckdb
//
// data/raw/ holds untrusted downloads only: it is parsed as JSON text, never executed.
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';

const URL_META =
  'https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw/meta_categories/meta_Books.jsonl.gz';
const here = (p) => new URL(p, import.meta.url).pathname;
const RAW = here('./raw/');
const RAW_GZ = RAW + 'meta_Books.jsonl.gz';
const CANDIDATES = RAW + 'candidates.jsonl';

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
const AGES = ['0–5', '6–12', 'Teen', '18–34', '35–54', '55+'];
const PER_GENRE = 40;
const MIN_RATINGS = 5;

// ---------- 1. download (resumable) ----------
function download() {
  mkdirSync(RAW, { recursive: true });
  if (existsSync(RAW_GZ)) return;
  console.log('downloading', URL_META, '(~4.9 GB)');
  execFileSync('curl', ['-fL', '-C', '-', '--retry', '5', '-o', RAW_GZ + '.part', URL_META], {
    stdio: 'inherit',
  });
  renameSync(RAW_GZ + '.part', RAW_GZ);
}

// ---------- 2. classify each source record into candidate genres ----------
const has = (s, re) => re.test(s);
const SUPERHERO =
  /\b(batman|superman|spider-man|spiderman|x-men|avengers|wonder woman|justice league|marvel|dc comics|captain america|iron man|deadpool|wolverine|green lantern|the flash|hulk|thor\b|daredevil|fantastic four|aquaman|harley quinn|joker|guardians of the galaxy|teen titans|superhero)/i;
const STRIPS =
  /\b(calvin and hobbes|peanuts|garfield|the far side|doonesbury|dilbert|pearls before swine|zits|foxtrot|bloom county|baby blues|non sequitur|get fuzzy|mutts|for better or for worse|sherman's lagoon|liō|frazz|big nate|cul de sac|comic strip|sunday strips|daily strips)/i;
const FRANCO =
  /\b(tintin|ast[eé]rix|lucky luke|blake (and|&) mortimer|spirou|smurfs|moebius|valerian|thorgal|largo winch|blacksad|cinebook|humanoids|europe comics|dargaud|casterman|dupuis|lombard|franco-belgian|bande dessin[ée]e|incal|yoko tsuno|iznogoud|marsupilami|gaston lagaffe|the scorpion|xiii\b|jodorowsky|bilal|tardi|sfar|trondheim|blutch|magnetic press|lion forge)\b/i;
const WEBTOON =
  /\b(webtoon|manhwa|webcomic|web comic|tapas media|lore olympus|solo leveling|tower of god|true beauty|unordinary|castle swimmer|omniscient reader|the remarried empress|seasons of blossom|cursed princess club|my dear cold-blooded king|suitor armor|siren'?s lament|heartstopper|check, please|nimona|noblesse|the god of high school|kakao)\b/i;
const SHONEN =
  /\b(sh[oō]nen|shonen jump|weekly sh[oō]nen|naruto|one piece|dragon ball|my hero academia|demon slayer|jujutsu kaisen|bleach|hunter x hunter|attack on titan|fullmetal alchemist|haikyu|black clover|chainsaw man|spy x family|the promised neverland|death note|fire force|blue exorcist|fairy tail|yu-gi-oh|one-punch man|mob psycho|dr\. stone|boruto|soul eater|yu yu hakusho|rurouni kenshin|jojo'?s bizarre|tokyo revengers|mashle|sakamoto days|kaiju no\. 8|blue lock)\b/i;
const SHOJO =
  /\b(sh[oō]jo|shoujo|shojo beat|fruits basket|sailor moon|ouran high school|kamisama kiss|yona of the dawn|skip beat|vampire knight|cardcaptor|nana\b|kimi ni todoke|maid-sama|snow white with the red hair|my love story|horimiya|kiss him, not me|cardcaptor sakura|ao haru ride|orange\b|fushigi y[uū]gi|banana fish|princess jellyfish|wotakoi|my happy marriage|the apothecary diaries|josei)\b/i;
const SEINEN =
  /\b(seinen|viz signature|berserk|vagabond|vinland saga|monster\b|20th century boys|pluto\b|goodnight punpun|tokyo ghoul|parasyte|akira\b|ghost in the shell|gantz|dorohedoro|blame!|homunculus|uzumaki|junji ito|tomie|gyo\b|lone wolf and cub|golden kamuy|ajin|inio asano|naoki urasawa|kentaro miura|made in abyss|frieren|dungeon meshi|delicious in dungeon|blade of the immortal|oyasumi punpun|devilman|real\b|planetes|mushishi|blood on the tracks)\b/i;
const HORROR =
  /\b(horror|haunted|ghost story|ghost stories|zombie|vampire|stephen king|lovecraft|terrifying|supernatural thriller|demonic|possession|poltergeist)\b/i;
const HISTFIC =
  /\b(historical fiction|historical novel|historical saga|world war ii novel|tudor|regency|victorian england|civil war novel|medieval)\b/i;
const MINDFUL =
  /\b(mindful|mindfulness|meditat|zen\b|buddhis|calm|stillness|present moment|breath|yoga|tao\b|stoic|anxiety relief|inner peace)/i;
const FASHION =
  /\b(fashion|style|wardrobe|dress|clothing|vogue|couture|beauty|makeup|skincare|hair\b|grooming|chanel|dior)/i;
const EARLY =
  /\b(i can read|step into reading|ready-to-read|ready to read|level 1|level 2|level 3|early reader|beginning reader|first reader|learn to read|elephant & piggie|elephant and piggie|bob books|phonics|scholastic reader|green light reader|penguin young readers)/i;
const RETOLD =
  /\b(retold|retelling|adapted|abridged|classic starts|graphic classics|stepping stones classics|fairy tale|fairy tales|folk tale|folktales|myths|mythology|aesop|grimm|andersen|greek gods|odyssey|shakespeare for kids|illustrated classic)/i;
const JUNK =
  /\b(cd|audio ?cd|mp3|dvd|unabridged|audiobook|summary of|study guide|sparknotes|cliffsnotes|box(ed)? set|books? set|collection set|\d+ books|journal\b|notebook|calendar|workbook for|analysis of|quicklet|book \d+-\d+|trivia|coloring book)\b/i;
const TEXTBOOKISH = /\b(edition|textbook|introduction|principles|fundamentals|handbook|guide)\b/i;

function pathOf(o) {
  return o.categories || [];
}

function classify(o, text) {
  const c = pathOf(o);
  const c2 = c[1] || '',
    c3 = c[2] || '';
  const p = (a, b) => c2 === a && (b === undefined || c3 === b || (Array.isArray(b) && b.includes(c3)));
  const t = o.title || ''; // subtitle is format noise ("Paperback – Illustrated, ...")
  const pub = (o.details && o.details.Publisher) || '';
  const all = t + ' ' + pub + ' ' + text;
  const out = [];
  const add = (cat, g) => out.push([cat, g]);
  const pages = o._pages;
  // Fiction
  if (
    p('Literature & Fiction', [
      'Literary',
      'Contemporary',
      'Classics',
      'United States',
      'World Literature',
      'British & Irish',
      "Women's Fiction",
    ])
  )
    add('Fiction', 'Literary');
  if (p('Mystery, Thriller & Suspense')) add('Fiction', 'Crime & Thriller');
  if (p('Science Fiction & Fantasy', 'Fantasy')) add('Fiction', 'Fantasy');
  if (p('Science Fiction & Fantasy', 'Science Fiction')) add('Fiction', 'Science Fiction');
  if (p('Romance')) add('Fiction', 'Romance');
  if ((p('Literature & Fiction') || p('Romance', 'Historical')) && has(all, HISTFIC))
    add('Fiction', 'Historical');
  if (
    (p('Literature & Fiction') || p('Mystery, Thriller & Suspense') || p('Science Fiction & Fantasy')) &&
    has(t + ' ' + text.slice(0, 600), HORROR)
  )
    add('Fiction', 'Horror');
  if (p('Literature & Fiction', 'Short Stories & Anthologies')) add('Fiction', 'Short Stories');
  // Non-fiction
  if (p('History') && c3 !== 'Historical Study & Educational Resources') add('Non-fiction', 'History');
  if (p('Biographies & Memoirs') && c3 !== 'True Crime') add('Non-fiction', 'Biography');
  if (
    p('Science & Math', [
      'Biological Sciences',
      'Nature & Ecology',
      'Earth Sciences',
      'Astronomy & Space Science',
      'Physics',
      'Evolution',
      'Chemistry',
      'History & Philosophy',
    ])
  )
    add('Non-fiction', 'Science');
  if (p('Politics & Social Sciences', 'Politics & Government')) add('Non-fiction', 'Politics');
  if (p('Business & Money') && c3 !== 'Economics') add('Non-fiction', 'Business');
  if (
    p('Health, Fitness & Dieting', ['Psychology & Counseling', 'Mental Health']) ||
    p('Self-Help', ['Happiness', 'Personal Transformation', 'Self-Esteem', 'Motivational'])
  )
    add('Non-fiction', 'Psychology');
  if (p('Biographies & Memoirs', 'True Crime')) add('Non-fiction', 'True Crime');
  if (p('Literature & Fiction', 'Essays & Correspondence') || p('Humor & Entertainment', 'Humor'))
    add('Non-fiction', 'Essays');
  // Children & YA
  const kids = p("Children's Books");
  if (kids && ['Activities, Crafts & Games'].includes(c3)) add('Children & YA', 'Activity');
  if (kids && has(t + ' ' + pub + ' ' + text.slice(0, 400), EARLY)) add('Children & YA', 'Early Readers');
  if (
    kids &&
    !['Activities, Crafts & Games', 'Comics & Graphic Novels', 'Education & Reference'].includes(c3) &&
    (o._format === 'Board book' || (pages && pages <= 48))
  )
    add('Children & YA', 'Picture Books');
  if (
    kids &&
    [
      'Literature & Fiction',
      'Science Fiction & Fantasy',
      'Action & Adventure',
      'Mysteries & Detectives',
      'Humor',
      'Growing Up & Facts of Life',
      'Animals',
    ].includes(c3) &&
    pages &&
    pages >= 120
  )
    add('Children & YA', 'Middle Grade');
  const yaFantasy =
    /fantasy|magic|\bfae|faerie|kingdom|dragon|witch|throne|sorcer|wizard|vampire|realm|curse|prophecy|demigod|chosen one/i.test(
      t + ' ' + text.slice(0, 600),
    );
  if (
    p('Teen & Young Adult', 'Science Fiction & Fantasy') ||
    (p('Teen & Young Adult', 'Literature & Fiction') && yaFantasy)
  )
    add('Children & YA', 'YA Fantasy');
  else if (
    p('Teen & Young Adult', ['Literature & Fiction', 'Romance', 'Social Issues', 'Mysteries & Thrillers'])
  )
    add('Children & YA', 'YA Contemporary');
  if ((kids && ['Classics', 'Fairy Tales, Folk Tales & Myths'].includes(c3)) || (kids && has(t, RETOLD)))
    add('Children & YA', 'Classics Retold');
  if (kids && c3 === 'Comics & Graphic Novels') add('Children & YA', 'Graphic Novels');
  // Academic
  const textbook = c2 === 'New, Used & Rental Textbooks';
  if (
    p('Science & Math', 'Mathematics') ||
    (textbook &&
      c3 === 'Science & Mathematics' &&
      /math|calculus|algebra|statistic|geometry|probability/i.test(t))
  )
    add('Academic', 'Mathematics');
  if (
    p('Computers & Technology', [
      'Computer Science',
      'Programming',
      'Programming Languages',
      'Databases & Big Data',
      'Software',
      'Networking & Cloud Computing',
    ]) ||
    (textbook && c3 === 'Computer Science')
  )
    add('Academic', 'Computer Science');
  if (p('Medical Books') || (textbook && c3 === 'Medicine & Health Sciences')) add('Academic', 'Medicine');
  if (p('Law') || (textbook && c3 === 'Law')) add('Academic', 'Law');
  if (p('Business & Money', 'Economics') || (textbook && c3 === 'Business & Finance' && /econom/i.test(t)))
    add('Academic', 'Economics');
  if (p('Engineering & Transportation', 'Engineering')) add('Academic', 'Engineering');
  if (
    p('Politics & Social Sciences', 'Philosophy') ||
    (textbook && c3 === 'Humanities' && /philosoph|ethic|logic/i.test(t))
  )
    add('Academic', 'Philosophy');
  if (
    p('Reference', ['Words, Language & Grammar', 'Foreign Language Study & Reference']) ||
    (textbook && /linguistic|grammar|language/i.test(t))
  )
    add('Academic', 'Linguistics');
  // Comics & Manga
  const comics = c2 === 'Comics & Graphic Novels';
  const manga = comics && c3 === 'Manga';
  if ((comics || ((kids || p('Teen & Young Adult')) && /Comics|Graphic/.test(c3))) && has(all, WEBTOON))
    add('Comics & Manga', 'Webtoon Print');
  if (manga && has(all, SHOJO)) add('Comics & Manga', 'Shojo');
  if (manga && has(all, SEINEN)) add('Comics & Manga', 'Seinen');
  if (manga && has(all, SHONEN)) add('Comics & Manga', 'Shonen');
  if (comics && has(all, FRANCO) && !has(t, SUPERHERO)) add('Comics & Manga', 'Franco-Belgian');
  if (comics || (p('Humor & Entertainment', 'Humor') && has(t, STRIPS)))
    add('Comics & Manga', 'Collected Strips'); // NEED: a strip name
  if (comics && c3 !== 'Manga' && has(t + ' ' + pub, SUPERHERO)) add('Comics & Manga', 'Superhero');
  if (comics && c3 === 'Graphic Novels' && !has(t + ' ' + pub, SUPERHERO)) add('Comics & Manga', 'Indie');
  // Lifestyle
  if (p('Cookbooks, Food & Wine')) add('Lifestyle', 'Cookery');
  if (p('Travel') && c3 !== 'Travel Writing') add('Lifestyle', 'Travel');
  if (p('Crafts, Hobbies & Home', ['Home Improvement & Design', 'Gardening & Landscape Design']))
    add('Lifestyle', 'Home & Garden');
  if (
    p('Health, Fitness & Dieting', ['Exercise & Fitness', 'Diets & Weight Loss', 'Nutrition']) ||
    p('Sports & Outdoors', 'Individual Sports')
  )
    add('Lifestyle', 'Fitness');
  if (p('Crafts, Hobbies & Home', 'Crafts & Hobbies')) add('Lifestyle', 'Crafts');
  if (p('Parenting & Relationships', ['Parenting', 'Family Relationships'])) add('Lifestyle', 'Parenting');
  if (
    (p('Self-Help') ||
      p('Religion & Spirituality', ['Buddhism', 'New Age & Spirituality']) ||
      p('Health, Fitness & Dieting', ['Alternative Medicine', 'Mental Health'])) &&
    has(t, MINDFUL)
  )
    add('Lifestyle', 'Mindfulness');
  if (
    p('Health, Fitness & Dieting', 'Beauty, Grooming, & Style') ||
    (p('Arts & Photography') && has(t, FASHION))
  )
    add('Lifestyle', 'Fashion');
  // Amazon's browse categories are noisy (a Steinbeck novel under Politics), so shelves that attract
  // strays also need a supporting word in the title or the first lines of the description.
  const blurb = t + ' ' + text.slice(0, 800);
  return out.filter(([, g]) => !NEED[g] || NEED[g].test(g in TITLE_ONLY ? t : blurb));
}
const NEED = {
  'Computer Science':
    /program|comput|algorithm|software|data\b|database|coding|\bcode\b|machine learning|artificial intelligence|python|java|network|security|linux|unix|operating system|compiler|deep learning/i,
  Engineering:
    /engineer|mechanic|electr|structur|circuit|thermo|fluid|materials|civil|signal|control system|machin|robot|aerodynam|hydraul|manufactur|welding|construction|arduino|raspberry|maker|solder|motor|bridge|design of|power system|statics|dynamics/i,
  Politics:
    /politic|government|democra|president|election|congress|policy|parliament|vote|liberal|conservative|leftist|socialis|communis|senate|white house|dictator|regime|activis|campaign/i,
  History:
    /^(?!.*\bbible\b).*(histor|war\b|wars\b|empire|revolution|ancient|century|civil|battle|nazi|holocaust|slave|killing|kings?\b|queens?\b|dynasty|medieval|lincoln|president|soldier|army|navy|spy|reich|rome|roman|greek|viking|colonial|1[0-9]{3}|20[0-2][0-9])/i,
  Activity:
    /activit|sticker|puzzle|maze|colou?r|craft|origami|mad libs|waldo|lift-the-flap|search and find|seek|workbook|games|draw|dot-to-dot|wipe clean|joke|riddle|press-out|make|build|scratch|doodle|quiz|cut|fold|learn/i,
  Crafts:
    /knit|crochet|sew|quilt|craft|paper|draw|paint|woodwork|embroider|origami|bead|jewel|pattern|stitch|calligraph|lego|hobby|model|watercolo|pottery|macram|scrapbook|handmade|diy|art of/i,
  Essays: /essay|letters|observations|reflections|musings|pieces|columns|humou?r/i,
  Parenting:
    /^(?!.*(true story|chilling|abuse|tortur|murder|kill|cut\b|hidden|abducted)).*(parent|child|kid|baby|babies|toddler|mom\b|mother|father|dad\b|family|teen|son\b|daughter|boys|girls|pregnan)/i,
  Science:
    /scien|biolog|evolution|physics|universe|nature|species|planet|brain|chemist|dinosaur|cosmos|gene|quantum|space|climate|earth|ocean|cell|animal|bird|astronom|ecolog/i,
  'True Crime':
    /murder|crime|killer|true story|investigat|criminal|serial|fbi|police|kill|mafia|mob\b|heist|trial|prison|cartel|detective/i,
  Travel:
    /guide|travel|lonely planet|rick steves|fodor|frommer|eyewitness|journey|walk|road|trip|explor|atlas|maps?\b|itinerar|abroad|tour/i,
  Cookery:
    /cook|recipe|kitchen|food|bak|\beat|meal|chef|dish|grill|bread|vegan|vegetarian|diet|wine|cocktail|flavou?r|cuisine|table|pie|cake|soup|bbq|barbecue|instant pot|air fryer/i,
  Economics:
    /econom|market|money|financ|capital|trade|wealth|invest|trader|inequality|debt|bank|price|growth/i,
  Mathematics:
    /math|algebra|calculus|geometry|number|statistic|probability|equation|proof|theorem|topology|arithmetic|trigonometr/i,
  Medicine:
    /medic|clinic|disease|health|nurs|anatomy|physiolog|surg|patient|doctor|pharmac|patholog|diagnos|cancer|neuro|cardio|emergency|psychiatr|therap/i,
  Law: /\blaw|legal|court|justice|constitution|contract|attorney|lawyer|tort|crimin|evidence|litigat|rights|supreme/i,
  Linguistics:
    /language|grammar|word|linguist|english|vocabular|writing|speech|dictionar|etymolog|punctuation|spelling|phrase|idiom|semantic|phonet/i,
  'Short Stories': /stories|tales|collection|anthology|short story|novellas/i,
  Psychology:
    /psycholog|mind|brain|behavio|emotion|anxiety|habit|think|mental|happi|therapy|trauma|persua|self|depress|personality|relationship|stress|confidence|fear|influence/i,
  'Classics Retold':
    /retold|classic|fairy|tale|myth|adapt|abridged|wonderland|\boz\b|peter pan|grimm|aesop|jungle book|treasure island|secret garden|little women|black beauty|heidi|pinocchio|robin hood|king arthur|gods|legend|nursery|rhymes|fables|odyssey|shakespeare|dickens|austen/i,
  'Collected Strips': STRIPS,
  Horror: HORROR,
};
const TITLE_ONLY = {
  Crafts: 1,
  Parenting: 1,
  Travel: 1,
  Engineering: 1,
  'Computer Science': 1,
  History: 1,
  Activity: 1,
};

const FORMAT_KEYS = [
  ['Paperback', 'Paperback'],
  ['Mass Market Paperback', 'Paperback'],
  ['Hardcover', 'Hardcover'],
  ['Board book', 'Hardcover'],
  ['Library Binding', 'Hardcover'],
  ['Spiral-bound', 'Paperback'],
  ['Kindle', 'Ebook'],
  ['Kindle Edition', 'Ebook'],
  ['Audible Audiobook', 'Audiobook'],
  ['Audio CD', 'Audiobook'],
];

// Amazon's "author" block is sometimes another contributor or a brand; the store line
// ("Solomon Northup (Author), Henry Louis Gates (Introduction)") names roles, so prefer its Author.
function authorOf(o) {
  const m = /(?:^|,\s*)([^,(]+?)\s*\((?:[^)]*\b)?Author\b[^)]*\)/.exec(o.store || '');
  const name = (m ? m[1] : (o.author && o.author.name) || '').replace(/\s+/g, ' ').trim();
  return /\b(books|publishing|press|editors?|staff|scholastic|warrior|inc|ltd|llc|company|art of war)\b|^-/i.test(
    name,
  )
    ? ''
    : name;
}

async function extractCandidates() {
  if (existsSync(CANDIDATES))
    return readFileSync(CANDIDATES, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
  const rl = createInterface({ input: createReadStream(RAW_GZ).pipe(createGunzip()), crlfDelay: Infinity });
  const out = [];
  let n = 0;
  for await (const line of rl) {
    if (++n % 500000 === 0) console.log(n, 'records scanned,', out.length, 'candidates');
    if (!line.includes('"Language": "English"')) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!o.title || !o.rating_number || o.rating_number < MIN_RATINGS || o.average_rating == null) continue;
    const d = o.details || {};
    const fk = FORMAT_KEYS.find(([k]) => d[k]);
    o._format = fk ? fk[0] : '';
    const pg = fk && /(\d+) pages/.exec(String(d[fk[0]]));
    o._pages = pg ? +pg[1] : d['Print length'] ? parseInt(d['Print length'], 10) : null;
    const text = [...(o.features || []), ...(o.description || [])].join(' ').slice(0, 1500);
    const genres = classify(o, text);
    if (!genres.length) continue;
    const priceNum =
      typeof o.price === 'number' ? o.price : parseFloat(String(o.price ?? '').replace(/[^0-9.]/g, ''));
    const yr = /(\d{4})\)\s*$/.exec(d.Publisher || '') || /(\d{4})/.exec(d['Publication date'] || '');
    out.push({
      asin: o.parent_asin,
      title: o.title,
      author: authorOf(o),
      rating: o.average_rating,
      ratings: o.rating_number,
      price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : null,
      isbn13: (d['ISBN 13'] || '').replace(/[^0-9]/g, '') || null,
      format: o._format,
      pages: o._pages,
      publisher: d.Publisher || '',
      year: yr ? +yr[1] : null,
      readingAge: d['Reading age'] || '',
      path: (o.categories || []).join(' > '),
      genres,
    });
  }
  writeFileSync(CANDIDATES, out.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(n, 'records scanned,', out.length, 'candidates cached in', CANDIDATES);
  return out;
}

// ---------- 3. pick 40 per genre ----------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fnv(s) {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const cleanTitle = (s) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s*[([][^)\]]*[)\]]\s*$/g, '')
    .replace(/\s*[([][^)\]]*[)\]]\s*$/g, '')
    .trim();
// one edition per work (Amazon lists hardcover, paperback, tie-in and collector's editions separately)
const EDITION_WORDS =
  /\b(the|a|an|movie tie-?in|tie-?in|collector'?s|anniversary|special|deluxe|illustrated|limited|revised|expanded|updated|edition|ed|edn|reprint|anglais|book club|novel|paperback|hardcover|\d+(st|nd|rd|th))\b/g;
const mainTitle = (r) =>
  cleanTitle(r.title)
    .toLowerCase()
    .split(/[:(\[]| - | – | — |, vol| vol\.| volume /)[0];
const titleKey = (r) =>
  cleanTitle(r.title)
    .toLowerCase()
    .replace(EDITION_WORDS, '')
    .replace(/[^a-z0-9]+/g, '');
const seriesKey = (r) =>
  mainTitle(r)
    .replace(EDITION_WORDS, '')
    .replace(/[^a-z0-9]+/g, '') || titleKey(r);
const authorKey = (r) =>
  (r.author || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z]+/g, '');
const validIsbn13 = (s) =>
  s && /^97[89]\d{10}$/.test(s) && [...s].reduce((a, ch, i) => a + +ch * (i % 2 ? 3 : 1), 0) % 10 === 0;

const AGE_GATE = {
  'Picture Books': [0, 6],
  'Early Readers': [3, 8],
  Activity: [0, 12],
  'Middle Grade': [7, 12],
  'Classics Retold': [3, 12],
  'Graphic Novels': [5, 12],
  'YA Fantasy': [12, 18],
  'YA Contemporary': [12, 18],
};
function select(cands) {
  const byGenre = new Map();
  for (const r of cands) {
    if (JUNK.test(r.title) || !r.author || r.author.length < 4 || r.title.length > 140) continue;
    const minAge = /(\d+)/.exec(r.readingAge || '');
    for (const [cat, g] of r.genres) {
      // Amazon's "Reading age" (when given) vetoes a children's shelf it contradicts, e.g. Wimpy Kid as a picture book
      const gate = AGE_GATE[g];
      if (gate && minAge && (+minAge[1] < gate[0] || +minAge[1] > gate[1])) continue;
      const k = cat + '|' + g;
      if (!byGenre.has(k)) byGenre.set(k, []);
      byGenre.get(k).push(r);
    }
  }
  // scarcest genres choose first, so a title that fits several shelves lands on the thinnest one
  const order = Object.entries(CATEGORIES)
    .flatMap(([cat, gs]) => gs.map((g) => [cat, g]))
    .sort((a, b) => (byGenre.get(a.join('|'))?.length || 0) - (byGenre.get(b.join('|'))?.length || 0));
  const usedSeries = new Set(),
    usedTitle = new Set(),
    usedAsin = new Set(),
    picked = [];
  for (const [cat, g] of order) {
    const pool = (byGenre.get(cat + '|' + g) || [])
      .slice()
      .sort(
        (a, b) =>
          (b.price != null) - (a.price != null) || b.ratings - a.ratings || (a.asin < b.asin ? -1 : 1),
      );
    const take = [];
    // pass 1: one title per series and at most 3 per author; pass 2 (thin shelves only): further volumes, up to 6 per author
    for (const [strict, cap] of [
      [true, 3],
      [false, 6],
    ]) {
      const perAuthor = new Map(take.map((r) => [authorKey(r), 0]));
      for (const r of take) perAuthor.set(authorKey(r), perAuthor.get(authorKey(r)) + 1);
      for (const r of pool) {
        if (take.length === PER_GENRE) break;
        const sk = seriesKey(r),
          tk = titleKey(r),
          ak = authorKey(r);
        if (
          usedAsin.has(r.asin) ||
          usedTitle.has(tk) ||
          (strict && usedSeries.has(sk)) ||
          (perAuthor.get(ak) || 0) >= cap
        )
          continue;
        usedSeries.add(sk);
        usedTitle.add(tk);
        usedAsin.add(r.asin);
        perAuthor.set(ak, (perAuthor.get(ak) || 0) + 1);
        take.push(r);
      }
    }
    console.log(`${cat} / ${g}: ${pool.length} candidates, picked ${take.length}`);
    if (take.length < PER_GENRE) throw new Error(`not enough real titles for ${cat} / ${g}`);
    for (const r of take) picked.push({ ...r, category: cat, genre: g });
  }
  return picked;
}

// ---------- 4. rules for the derived fields ----------
const BASE_AGE = {
  Literary: '55+',
  'Crime & Thriller': '55+',
  Fantasy: '18–34',
  'Science Fiction': '35–54',
  Romance: '35–54',
  Historical: '55+',
  Horror: '18–34',
  'Short Stories': '35–54',
  History: '55+',
  Biography: '55+',
  Science: '35–54',
  Politics: '55+',
  Business: '35–54',
  Psychology: '35–54',
  'True Crime': '35–54',
  Essays: '35–54',
  Mathematics: '18–34',
  'Computer Science': '18–34',
  Medicine: '35–54',
  Law: '35–54',
  Economics: '18–34',
  Engineering: '35–54',
  Philosophy: '18–34',
  Linguistics: '18–34',
  Shonen: 'Teen',
  Shojo: 'Teen',
  Seinen: '18–34',
  Superhero: '18–34',
  Indie: '18–34',
  'Webtoon Print': 'Teen',
  'Franco-Belgian': '35–54',
  'Collected Strips': '55+',
  Cookery: '35–54',
  Travel: '55+',
  'Home & Garden': '55+',
  Fitness: '18–34',
  Crafts: '55+',
  Parenting: '18–34',
  Mindfulness: '35–54',
  Fashion: '18–34',
  'Picture Books': '0–5',
  'Early Readers': '6–12',
  'Middle Grade': '6–12',
  'YA Fantasy': 'Teen',
  'YA Contemporary': 'Teen',
  Activity: '6–12',
  'Classics Retold': '6–12',
  'Graphic Novels': '6–12',
};
function audienceAge(b) {
  if (b.category === 'Children & YA') {
    const m = /(\d+)/.exec(b.readingAge); // Amazon "Reading age", e.g. "3 - 5 years"
    if (m) {
      const a = +m[1];
      return a <= 5 ? '0–5' : a <= 11 ? '6–12' : 'Teen';
    }
    return BASE_AGE[b.genre];
  }
  // adult shelves: base band per genre, shifted one band younger for recent titles and older for old ones
  let i = AGES.indexOf(BASE_AGE[b.genre]);
  if (b.year && b.year >= 2016) i -= 1;
  else if (b.year && b.year < 1995) i += 1;
  const lo = b.category === 'Comics & Manga' ? 2 : 3;
  return AGES[Math.max(lo, Math.min(5, i))];
}
const PROFESSIONAL = new Set(['Medicine', 'Law', 'Engineering', 'Computer Science']);
const GIFTY = new Set([
  'Cookery',
  'Travel',
  'Home & Garden',
  'Fashion',
  'Crafts',
  'Collected Strips',
  'Picture Books',
  'Franco-Belgian',
]);
function market(b) {
  if (/independently published|createspace|kindle direct|lulu\.com/i.test(b.publisher))
    return 'Self-published';
  if (b.category === 'Academic')
    return PROFESSIONAL.has(b.genre) && !/textbook/i.test(b.path) ? 'Professional' : 'Education';
  if (b.format === 'Mass Market Paperback') return 'Mass market';
  if (b.genre === 'Business') return 'Professional';
  if (['Early Readers', 'Activity'].includes(b.genre)) return 'Education';
  if (GIFTY.has(b.genre) && /Hardcover|Board book/.test(b.format)) return 'Gift';
  if (
    ['Crime & Thriller', 'Romance', 'Shonen', 'Shojo', 'Superhero'].includes(b.genre) &&
    b.format !== 'Hardcover'
  )
    return 'Mass market';
  return 'Trade';
}
const FMT = {
  Paperback: 'Paperback',
  'Mass Market Paperback': 'Paperback',
  'Spiral-bound': 'Paperback',
  Hardcover: 'Hardcover',
  'Board book': 'Hardcover',
  'Library Binding': 'Hardcover',
  Kindle: 'Ebook',
  'Kindle Edition': 'Ebook',
  'Audible Audiobook': 'Audiobook',
  'Audio CD': 'Audiobook',
};

// ---------- 5. write CSVs ----------
const PERIOD_START = new Date(Date.UTC(2026, 6, 27)); // Monday 2026-07-27; period ends Sunday 2026-10-18
const day = (d, n) => new Date(d.getTime() + n * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const quantile = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

function write(picked) {
  const R = mulberry32(7);
  const fmtR = mulberry32(11);
  // genre price distributions (real prices) for titles the source has no price for
  const genrePrices = new Map();
  // Amazon's offer price is occasionally a marketplace oddity ($0.99 or $1,000 for a paperback): outside
  // [¼, 6×] of the genre median (and $2–$400) it counts as missing and is resampled like a missing one.
  const med = new Map();
  for (const b of picked)
    if (b.price != null) {
      if (!med.has(b.genre)) med.set(b.genre, []);
      med.get(b.genre).push(b.price);
    }
  for (const [g, ps] of med) med.set(g, quantile(ps, 0.5));
  for (const b of picked) {
    const m = med.get(b.genre);
    if (b.price != null && (b.price < Math.max(2, m / 4) || b.price > Math.min(400, m * 6))) {
      b.outlierPrice = b.price;
      b.price = null;
    }
  }
  for (const b of picked)
    if (b.price != null) {
      const k = b.genre;
      if (!genrePrices.has(k)) genrePrices.set(k, []);
      genrePrices.get(k).push(b.price);
    }
  // popularity → units: scale so the catalogue sells about as much as the fake one did (~2.5M units per 12 weeks)
  const pop = (b) => Math.pow(b.ratings, 0.7);
  const scale = 2_500_000 / picked.reduce((a, b) => a + pop(b), 0);
  const genreTrend = new Map(
    Object.values(CATEGORIES)
      .flat()
      .map((g) => [g, (R() - 0.45) * 0.3]),
  );
  const usedIsbn = new Set();
  const bookRows = ['isbn,title,author,category,genre,market,audience_age,format,price,rating,hue'];
  const provRows = [
    'isbn,amazon_parent_asin,ratings_count,price_source,format_source,isbn_source,source_category_path,publisher',
  ];
  const saleRows = ['isbn,week_start,units,revenue'];
  for (const b of picked) {
    let isbn = validIsbn13(b.isbn13) && !usedIsbn.has(b.isbn13) ? b.isbn13 : null;
    const isbnSource = isbn ? 'source' : 'synthetic';
    if (!isbn) {
      let h = fnv(b.asin);
      do {
        isbn = '9789999' + String(h % 1_000_000).padStart(6, '0');
        h = fnv(isbn);
      } while (usedIsbn.has(isbn));
    }
    usedIsbn.add(isbn);
    let price = b.price,
      priceSource = 'source';
    if (price == null) {
      const ps = genrePrices.get(b.genre);
      price = quantile(ps, mulberry32(fnv(b.asin))());
      priceSource = b.outlierPrice ? 'resampled_outlier' : 'sampled_genre_distribution';
    }
    price = +price.toFixed(2);
    let format = FMT[b.format],
      formatSource = 'source';
    if (!format) {
      format = ['Paperback', 'Paperback', 'Hardcover', 'Ebook', 'Audiobook'][Math.floor(fmtR() * 5)];
      formatSource = 'sampled';
    }
    const title = cleanTitle(b.title) || b.title;
    const hue = fnv(title) % 360;
    bookRows.push(
      [
        q(isbn),
        q(title),
        q(b.author),
        q(b.category),
        q(b.genre),
        q(market(b)),
        q(audienceAge(b)),
        q(format),
        price,
        (+b.rating).toFixed(1),
        hue,
      ].join(','),
    );
    provRows.push(
      [q(isbn), q(b.asin), b.ratings, priceSource, formatSource, isbnSource, q(b.path), q(b.publisher)].join(
        ',',
      ),
    );
    // synthetic sales, same shape as generate-fake.mjs but anchored on the real ratings count
    const units = Math.max(4, Math.round(pop(b) * scale * (0.75 + 0.5 * R())));
    const delta = genreTrend.get(b.genre) + (R() - 0.5) * 0.3;
    const unitsPrev = Math.max(1, Math.round(units / (1 + delta)));
    const base = units / 12;
    const cur = Array.from({ length: 12 }, (_, w) =>
      Math.max(0, Math.round(base * (0.7 + 0.6 * R()) * (1 + delta * (w / 11)))),
    );
    const curSum = cur.reduce((a, c) => a + c, 0) || 1;
    for (let w = 0; w < 12; w++) {
      const u = Math.max(0, Math.round((cur[(w * 5) % 12] / curSum) * unitsPrev * (0.8 + 0.4 * R())));
      saleRows.push([q(isbn), iso(day(PERIOD_START, (w - 12) * 7)), u, (u * price).toFixed(2)].join(','));
    }
    for (let w = 0; w < 12; w++)
      saleRows.push([q(isbn), iso(day(PERIOD_START, w * 7)), cur[w], (cur[w] * price).toFixed(2)].join(','));
  }
  writeFileSync(here('./books.csv'), bookRows.join('\n') + '\n');
  writeFileSync(here('./books-provenance.csv'), provRows.join('\n') + '\n');
  writeFileSync(here('./sales.csv'), saleRows.join('\n') + '\n');
  console.log(bookRows.length - 1, 'books,', saleRows.length - 1, 'sales rows');
}

download();
const cands = await extractCandidates();
write(select(cands));
