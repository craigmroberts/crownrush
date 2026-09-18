// #135: the brand guide's measurements, taken from the source rather than written down.
//
// This replaces the figures that used to live in a separate published page. That page counted 361
// colours and 85 near-identical pairs, and it was right on the day it was written -- but it was a
// COPY, so the day the palette moved it began lying, and nothing on it could say so. Everything here
// is recounted from `src/` on every run: the board shows what the code is, not what somebody
// measured once.
//
//     npm run board      (runs alongside stats.mjs)
//
// The authored half of the guide -- the direction, the reasoning, the open questions -- is prose and
// lives in `docs/brand.md`, because prose is not a measurement and pretending otherwise would mean
// regenerating opinions.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS } from '../../src/icons.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'public', 'board', 'brand.json');
const CSS = readFileSync(join(ROOT, 'src', 'style.css'), 'utf8');

// Every file a colour or a token could be written in. The old guide said "seven files"; this asks
// the directory instead, so a new one joins the count on its own.
const SRC = readdirSync(join(ROOT, 'src')).filter((f) => /\.(js|css)$/.test(f)).map((f) => join('src', f));
const FILES = [...SRC, 'index.html'].filter((f) => existsSync(join(ROOT, f)));
const TEXT = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
const ALL = Object.values(TEXT).join('\n');

// ---------------------------------------------------------------- tokens
// The `:root` block, each property with the comment written above it -- house style puts the reason
// there, and the reason is the most useful thing on the page.
const root = /:root\s*\{([\s\S]*?)\n\}/.exec(CSS);
const tokens = [];
if (root) {
  // Walk the block once, carrying the comment that precedes each property. Splitting on lines and
  // trying to track "am I inside a comment" got this wrong twice -- the comments here are long,
  // multi-line and sometimes sit between two properties -- so the comment is simply whatever text
  // was last seen inside /* */ before a declaration.
  const body = root[1];
  const re = /\/\*([\s\S]*?)\*\/|(--[\w-]+)\s*:\s*([^;]+);/g;
  let comment = null, m;
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) { comment = m[1].replace(/\s+/g, ' ').trim(); continue; }
    const name = m[2];
    const value = m[3].trim();
    // A read is `var(--name)` anywhere BUT this declaration. The old guide's headline finding was
    // thirteen tokens with zero readers; counting it here is what stops that happening again quietly.
    const self = new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(value);
    const reads = (ALL.match(new RegExp(`var\\(\\s*${name}\\s*[,)]`, 'g')) || []).length - (self ? 1 : 0);
    tokens.push({
      name, value, reads,
      // `--figure: var(--figure)` is a cycle: invalid at computed-value time, so every
      // `color: var(--figure)` falls back to inherit and the number is not gold at all. A dead token
      // is decoration; a self-referential one is worse, because it looks wired up.
      cycle: self,
      why: comment,
    });
    comment = null;
  }
}

// ---------------------------------------------------------------- colour
const hexes = [...ALL.matchAll(/(?:#|0x)([0-9a-fA-F]{6})\b/g)].map((m) => '#' + m[1].toLowerCase());
const unique = [...new Set(hexes)];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function hsl(h) {
  const [r, g, b] = rgb(h).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hue = 0;
  if (d) hue = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: hue * 60, s: d ? d / (1 - Math.abs(mx + mn - 1)) : 0, l: (mx + mn) / 2 };
}
// Named by hue, because "the gold family has 30 members" is the sentence that made the point.
function family(hex) {
  const { h, s, l } = hsl(hex);
  if (s < 0.14) return 'Neutral / grey';
  if (h < 16 || h >= 345) return 'Red';
  if (h < 40) return l > 0.5 ? 'Orange / tan' : 'Brown';
  if (h < 66) return 'Gold / yellow';
  if (h < 165) return 'Green';
  if (h < 200) return 'Cyan / teal';
  if (h < 260) return 'Blue';
  if (h < 300) return 'Purple';
  return 'Pink / magenta';
}
const families = {};
for (const hex of unique) (families[family(hex)] ||= []).push(hex);
const byFamily = Object.entries(families)
  .map(([name, list]) => ({ name, list: list.sort((a, b) => hsl(a).l - hsl(b).l) }))
  .sort((a, b) => b.list.length - a.list.length);

// Pairs nobody could tell apart. Kept at the old guide's threshold so the number is comparable.
const near = [];
for (let i = 0; i < unique.length; i++) {
  for (let j = i + 1; j < unique.length; j++) {
    const a = rgb(unique[i]), b = rgb(unique[j]);
    const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    if (d <= 6) near.push({ a: unique[i], b: unique[j], d });
  }
}
near.sort((x, y) => x.d - y.d);

// Where each colour is written, so a duplicate can actually be chased down.
const where = {};
for (const hex of unique) {
  where[hex] = FILES.filter((f) => new RegExp(`(#|0x)${hex.slice(1)}\\b`, 'i').test(TEXT[f]));
}

// ---------------------------------------------------------------- type and shape
const sizes = [...new Set([...CSS.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => +m[1]))].sort((a, b) => a - b);
const radii = [...new Set([...CSS.matchAll(/border-radius:\s*([\d.]+(?:px|%)|\d+px)/g)].map((m) => m[1]))];

// The 900 bug: both faces declare `font-weight: 600 800`, and the stylesheet asks for 900 anyway.
// A variable font clamps rather than failing, so 800 and 900 render identically and nothing says so.
const declared = [...new Set([...CSS.matchAll(/@font-face[\s\S]*?font-weight:\s*([\d\s]+);/g)].map((m) => m[1].trim()))];
const noFaces = CSS.replace(/@font-face\s*\{[\s\S]*?\}/g, '');
const asked = [...new Set([...noFaces.matchAll(/font-weight:\s*(\d{3})\b/g)].map((m) => +m[1]))].sort((a, b) => a - b);
const ceiling = Math.max(...declared.flatMap((d) => d.split(/\s+/).map(Number)).filter(Number.isFinite), 0);
const overweight = asked.filter((w) => ceiling && w > ceiling);

// The authored half, carried through rather than copied. `docs/brand.md` is the only place this
// prose exists; the board renders what this run read out of it, so editing the doc IS editing the
// board and there is no second version to keep in step.
let prose = null;
try { prose = readFileSync(join(ROOT, 'docs', 'brand.md'), 'utf8'); } catch (e) { /* not written yet */ }

const brand = {
  at: new Date().toISOString(),
  files: FILES.length,
  prose,
  tokens,
  colour: {
    total: unique.length,
    literals: hexes.length,
    families: byFamily,
    near: near.slice(0, 40),
    nearTotal: near.length,
    where,
  },
  type: { sizes, radii, declaredWeights: declared, askedWeights: asked, overweight },
  icons: Object.entries(ICONS).map(([name, svg]) => ({ name, svg })),
};

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(brand);
writeFileSync(OUT, json);
const dist = join(ROOT, 'dist', 'board', 'brand.json');
if (existsSync(join(ROOT, 'dist', 'board'))) writeFileSync(dist, json);

const dead = tokens.filter((t) => !t.reads && !t.cycle).length;
const cyc = tokens.filter((t) => t.cycle).length;
console.log(`board brand: ${unique.length} colours (${near.length} near-identical pairs), `
  + `${tokens.length} tokens (${dead} dead, ${cyc} self-referential), ${brand.icons.length} icons`);
