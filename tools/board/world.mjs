// #178: every structure the game can put on the field, and the numbers attached to it.
//
// This replaces a page of 37 PNG plates. They were shot by `tools/shots/buildings.mjs` -- a tool
// that is no longer in the repo, so the pictures could not have been retaken even if somebody had
// wanted to. A picture nothing can regenerate is the worst kind of copy: it goes stale and there is
// no way back. The board frames `?view=build&id=…` instead, which is the real builder out of
// `src/models.js` at the age the game would call it with.
//
// What IS measured here is the data around them -- what each age is worth in hit points, what the
// footprint is, which pad puts it on the field -- all of it read out of `src/config.js`.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG, PADS } from '../../src/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'public', 'board', 'world.json');

const MODELS = readFileSync(join(ROOT, 'src', 'models.js'), 'utf8');
// A builder exists or it does not; asking the file is how this stays true when one is renamed.
const has = (fn) => new RegExp(`export function ${fn}\\b`).test(MODELS);

// WHICH ONES ARE IMPORTS. `makeStructureMesh` reaches for `makeProp` first and only falls back to the
// built mesh, so five of these are Meshy models and the rest are code. Worth saying on the page:
// "the Keep" means a different object depending on whether its prop loaded, and the board should not
// pretend otherwise. Read from game-build.js so it cannot drift from what the game actually does.
const BUILD = readFileSync(join(ROOT, 'src', 'game-build.js'), 'utf8');
// #82: reaching for a prop is not the same as having one. The Stable's slot was cut before its
// model existed, so "imported" also asks whether the file the code would load is actually in
// public/models -- read off `PROP_FILE` in props.js, the same map the loader uses.
const PROPS = readFileSync(join(ROOT, 'src', 'props.js'), 'utf8');
const propFile = Object.fromEntries([...(/const PROP_FILE = \{([^}]*)\}/.exec(PROPS) || ['', ''])[1].matchAll(/(\w+): '(\w+)'/g)].map((m) => [m[1], m[2]]));
const imported = new Set([...BUILD.matchAll(/makeProp\('(\w+)'/g)].map((m) => m[1])
  .filter((k) => propFile[k] && existsSync(join(ROOT, 'public', 'models', `${propFile[k]}.glb`))));

// The ages, in the order the Keep unlocks them, straight off `CFG.wallLevels`.
const ages = CFG.wallLevels.map((w, i) => ({ i, name: w.name.toLowerCase(), label: w.name, hp: w.hp, gateHp: w.gateHp, repair: w.repair }));

// `id` is what `?view=build&id=` takes; `builder` is checked so the board never offers a frame for
// something `showStructure` cannot build.
const GROUPS = [
  {
    name: 'The Keep and its village', note: 'These change with the Keep’s age — one building drawn four ways, not four buildings.',
    items: [
      { id: 'keep', name: 'The Keep', builder: 'makeKeep', ages: true, why: 'The heart of it. Feeding it raises every other building’s age.' },
      { id: 'hut', name: 'Archery range', builder: 'makeHut', ages: true, why: 'Where archers are trained.' },
      { id: 'house', name: 'Villager home', builder: 'makeHut', ages: true, why: 'Six of them. What the village is for.' },
      { id: 'barracks', name: 'Barracks', builder: 'makeBarracks', ages: true, why: 'Where swordsmen come from.' },
      { id: 'stable', name: 'Stable', builder: 'makeStable', ages: true, why: 'Where the horse comes from, and the yard whose horses the army rides (#82, #117). Built placeholder until the generated one lands.' },
      { id: 'bank', name: 'Trade post', builder: 'makeBank', ages: false, why: 'Where a full bag turns into coin.' },
    ],
  },
  {
    name: 'Towers', note: 'These climb by their own upgrade rather than the Keep’s age: each level adds a storey and a crew.',
    items: [
      { id: 'tower', name: 'Watchtower', builder: 'makeTower', ages: true, levels: [1, 2, 3], why: 'The only building that shoots back on its own.' },
    ],
  },
  {
    name: 'Walls and gates', note: 'Seven world units of wall per segment, and what is left when one comes down.',
    items: [
      { id: 'wall', name: 'Wall', builder: 'makeWallSegment', ages: true, hp: (a) => a.hp, why: 'The thing the whole game is about holding.' },
      { id: 'gate', name: 'Gate', builder: 'makeGate', ages: true, hp: (a) => a.gateHp, why: 'The way in, and the way the raiders prefer.' },
      { id: 'rubble', name: 'Rubble', builder: 'makeRubble', ages: true, why: 'What a breach leaves behind.' },
      { id: 'gatepost', name: 'Gate post', builder: 'makeGatePost', ages: false },
      { id: 'fence', name: 'Fence', builder: 'makeFence', ages: false },
      { id: 'spikes', name: 'Spikes', builder: 'makeSpikes', ages: false },
    ],
  },
  {
    name: 'Built into the ground', note: 'The two things the map has rather than the village.',
    items: [
      { id: 'bridge', name: 'Bridge', builder: 'makeBridge', ages: false, why: 'The one way over the river.' },
      { id: 'camp', name: 'Raider camp', builder: 'makeCamp', ages: false, why: 'Where the war ends.' },
    ],
  },
  {
    name: 'Resource nodes', note: 'Scenery until the King stops on one, then a place to mine.',
    items: [
      { id: 'lumber', name: 'Lumber tree', builder: 'makeLumberTree', ages: false, gives: 'Wood' },
      { id: 'ore', name: 'Ore rock', builder: 'makeOreRock', ages: false, gives: 'Stone' },
      { id: 'iron', name: 'Iron seam', builder: 'makeIronSeam', ages: false, gives: 'Iron' },
      { id: 'gem', name: 'Gem node', builder: 'makeGemNode', ages: false, gives: 'Diamond' },
      { id: 'hay', name: 'Hay bale', builder: 'makeHayBale', ages: false, gives: 'Straw' },
      { id: 'wheat', name: 'Wheat field', builder: 'makeWheatField', ages: false, note: 'instanced, and sways' },
    ],
  },
];

// Which pad puts each one on the field, and how many of them a full plot holds. Counted rather than
// written down: the twelve watchtowers are twelve rows in PADS, and if a tier gains one this moves.
const padsFor = {};
for (const p of PADS) if (p.structure) (padsFor[p.structure] ||= []).push({ id: p.id, tier: p.tier ?? 0 });

const groups = GROUPS.map((g) => ({
  ...g,
  items: g.items
    .filter((it) => has(it.builder))
    .map((it) => ({
      id: it.id,
      name: it.name,
      why: it.why || null,
      note: it.note || null,
      gives: it.gives || null,
      levels: it.levels || null,
      builder: it.builder,
      imported: imported.has(it.id),
      footprint: CFG.footprint[it.id] || null,
      pads: padsFor[it.id] || [],
      ages: it.ages
        ? ages.map((a) => ({ ...a, hp: it.hp ? it.hp(a) : null }))
        : null,
    })),
}));

const missing = GROUPS.flatMap((g) => g.items).filter((it) => !has(it.builder)).map((it) => it.builder);

// The art pass's written half. A proposal, not a record -- kept beside the live frames so the two
// can be read against each other, which is the only way to see that brick never arrived and the
// watchtower's visible crew never got built.
let prose = null;
try { prose = readFileSync(join(ROOT, 'docs', 'art-pass.md'), 'utf8'); } catch (e) { /* not written */ }

const out = { at: new Date().toISOString(), ages, groups, missing, prose };
mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(out);
writeFileSync(OUT, json);
const dist = join(ROOT, 'dist', 'board', 'world.json');
if (existsSync(join(ROOT, 'dist', 'board'))) writeFileSync(dist, json);

const n = groups.reduce((a, g) => a + g.items.length, 0);
console.log(`board world: ${n} structures across ${groups.length} groups, ${ages.length} ages`
  + (missing.length ? ` -- ${missing.length} builder(s) missing: ${missing.join(', ')}` : ''));
