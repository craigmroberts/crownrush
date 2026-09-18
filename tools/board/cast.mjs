// #178: the character sheet's data -- which models exist, who the story says they are, and how far
// apart those two answers are.
//
// Three sources, none of them restated here:
//   public/models/*.glb   what the game actually ships, and what each weighs
//   src/story.js CAST     who the story says is in it, in the game's own words
//   docs/cast-review.md   the authored judgement: what the gap is, and a score out of five
//
// The review is prose because it is an opinion, and opinions are written rather than measured. The
// roster is measured because a model file either exists or does not, and a page that says a
// character has a model when the file was deleted is the kind of lie this board exists to not tell.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAST } from '../../src/story.js';
import { CFG } from '../../src/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'public', 'board', 'cast.json');
const MODELS = join(ROOT, 'public', 'models');

// The rigs the game preloads, read out of main.js rather than listed again here -- this is the
// difference between "every character" and "every .glb", and `_ai.glb` files are source art.
const MAIN = readFileSync(join(ROOT, 'src', 'main.js'), 'utf8');
const listed = (name) => {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(MAIN);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
};
const rigs = [...listed('RIGS'), ...listed('LATER_RIGS')];

// What `spawnEnemy` dresses each rig in. Read from game-enemies.js so the sheet asks for the same
// tints the raid does -- the boss looked cream on the sheet until this was wired, because the raw
// GLB is untinted and every enemy is recoloured on the way to the field.
const ENEMIES = readFileSync(join(ROOT, 'src', 'game-enemies.js'), 'utf8');
const ENEMY_TYPES = CFG.enemy;
const rigFor = /const rigName = \{([^}]*)\}/.exec(ENEMIES);
const plays = {};
if (rigFor) for (const [, type, rig] of rigFor[1].matchAll(/(\w+):\s*'(\w+)'/g)) (plays[rig] ||= []).push(type);
// `spawnEnemy` ends that lookup with `|| type`: an enemy whose rig is not named in the map uses one
// of its own name. Reading only the map left the boss, the brute and the elite with no tints at all
// on the sheet, which is exactly how the boss came out cream.
for (const t of Object.keys(ENEMY_TYPES)) if (!(plays[t] || []).includes(t)) (plays[t] ||= []).unshift(t);

// ---------------------------------------------------------------- the review
const review = {};
let prose = null;
try {
  prose = readFileSync(join(ROOT, 'docs', 'cast-review.md'), 'utf8');
  // `## <id> — <name>` opens an entry; `**Key** value` and `**Key.** value` fill it.
  const parts = prose.split(/\n## /).slice(1);
  for (const part of parts) {
    const head = /^([a-z_]+)\s+[—-]\s+(.+)/.exec(part);
    if (!head) continue;
    const [, id, name] = head;
    // Stops at a blank line, at a `**Key**` starting a line, AND at ` · **`, because the short
    // fields are written inline on one line -- `**Story id** rust · **Model** ...`. Without the last
    // of those, `storyId` came back as the whole rest of the line and every model looked unmatched.
    const field = (label) => {
      const m = new RegExp(`\\*\\*${label}[.]?\\*\\*\\s*([\\s\\S]*?)(?=\\n\\n|\\n\\*\\*|\\s·\\s\\*\\*|$)`).exec(part);
      return m ? m[1].trim().replace(/\s*\n\s*/g, ' ') : null;
    };
    const fit = field('Fit');
    review[id] = {
      name,
      story: field('Story says'),
      // The art pass is a SECOND brief, older than the bible, and where a model looks wrong it is
      // often following this one faithfully. Kept apart from the gap for exactly that reason.
      art: field('Art pass says'),
      model: field('Model is'),
      gap: field('Gap'),
      close: field('Would close it'),
      wears: field('Wears') || field('Model'),
      // which entry in story.js CAST this model plays, so `unbuilt` does not claim The Rust has no
      // model when what it has is a model under a different name (`boss.glb`)
      storyId: field('Story id'),
      // `unjudged` is a real answer and stays one. Filling this column with a guess is the failure
      // mode the whole file warns about.
      fit: fit && /^(\d)\s*\/\s*5/.test(fit) ? Number(/^(\d)/.exec(fit)[1]) : null,
      fitRaw: fit,
    };
  }
} catch (e) { /* not written yet */ }

// ---------------------------------------------------------------- the roster
const files = existsSync(MODELS) ? readdirSync(MODELS).filter((f) => f.endsWith('.glb')) : [];
const characters = rigs.map((id) => {
  const file = `${id}.glb`;
  const has = files.includes(file);
  const r = review[id] || {};
  return {
    id,
    file: has ? file : null,
    bytes: has ? statSync(join(MODELS, file)).size : 0,
    plays: plays[id] || [],
    // the enemy type whose tints to wear on the sheet; friendlies stay as authored
    as: (plays[id] || [])[0] || '',
    ...r,
  };
});

// Story characters with no model at all. `src/story.js` already knows -- it gives them a coloured
// medallion instead of a face -- so this asks it rather than keeping a second list.
const faces = new Set(characters.flatMap((c) => [c.id, c.storyId]).filter(Boolean));
const unbuilt = CAST.filter((c) => !faces.has(c.id) && !c.face).map((c) => ({
  id: c.id, name: c.name, role: c.role, colour: c.colour,
  text: c.stages[0] && c.stages[0].text,
}));

const out = {
  at: new Date().toISOString(),
  characters,
  unbuilt,
  prose,
  clips: ['Idle', 'Walk', 'Attack'],
};

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(out);
writeFileSync(OUT, json);
const dist = join(ROOT, 'dist', 'board', 'cast.json');
if (existsSync(join(ROOT, 'dist', 'board'))) writeFileSync(dist, json);

const judged = characters.filter((c) => c.fit != null).length;
console.log(`board cast: ${characters.length} models (${judged} judged, ${characters.length - judged} not), `
  + `${unbuilt.length} story characters with no model`);
