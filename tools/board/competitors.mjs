// What players say about the games next door, carried onto the board from `docs/competitors.md`.
//
// There is nothing here to measure -- a reading of a few hundred App Store reviews is an opinion
// about which complaints matter, not a count of them -- so this tool does the one job the other
// board tools do as a side effect: it moves a prose file into `public/board/`, which is the only
// directory the page can fetch from. `docs/` is not served.
//
// The doc stays the only copy, the same way `docs/brand.md` is. Editing it IS editing the board,
// and the board cannot drift from it because it does not hold its own version.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DOC = join(ROOT, 'docs', 'competitors.md');
const OUT = join(ROOT, 'public', 'board', 'competitors.json');

let prose = null;
try { prose = readFileSync(DOC, 'utf8'); } catch (e) { /* not written yet, and the page says so */ }

if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), prose }) + '\n');
console.log(prose ? `competitors.json <- docs/competitors.md (${prose.length} chars)` : 'competitors.json <- nothing: docs/competitors.md is missing');
