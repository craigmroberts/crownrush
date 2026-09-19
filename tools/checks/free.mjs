// #179: the checks that need nothing but the source. No browser, no server, no tokens, milliseconds.
import { CFG, PADS, TIERS } from '../../src/config.js';
import { MODS, UPGRADES } from '../../src/upgrades.js';
import { ICONS } from '../../src/icons.js';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(join(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), 'src', 'style.css'), 'utf8');

const ok = () => ({ pass: true });
const no = (...why) => ({ pass: false, detail: why.flat() });

const structurePads = () => PADS.filter((d) => d.structure && d.buildAt);
// does `d` depend on `id`, directly or through a chain of requires?
const byId = Object.fromEntries(PADS.map((d) => [d.id, d]));
function needs(d, id, seen = new Set()) {
  for (const r of d.requires || []) {
    if (r === id) return true;
    if (seen.has(r)) continue;
    seen.add(r);
    if (byId[r] && needs(byId[r], id, seen)) return true;
  }
  return false;
}
const foot = (kind) => CFG.footprint[kind] || null;

export const FREE = {
  'tokens-resolve'() {
    // Every `--x` in `:root` has to resolve to something and be read by something.
    //
    // This exists because `--figure: var(--figure)` shipped and nothing noticed. A self-referencing
    // custom property is a cycle, invalid at computed-value time, so all six `color: var(--figure)`
    // rules silently fell back to inherit -- every number the game meant to single out was the same
    // colour as the sentence around it. No screenshot showed it, no assertion about state could see
    // it, and it was only found by reading the token block out loud. A dead token is decoration; a
    // cyclic one is worse, because it looks wired up.
    const root = /:root\s*\{([\s\S]*?)\n\}/.exec(CSS);
    if (!root) return no('there is no `:root` block in src/style.css');
    // Comments FIRST. The reasoning beside each token quotes declarations -- this one's does -- so a
    // scan that does not strip them reads the explanation of the bug as the bug.
    const body = root[1].replace(/\/\*[\s\S]*?\*\//g, '');
    //
    // TWO SEVERITIES, deliberately. A cycle silently breaks rendering and fails. A token nothing
    // reads is design debt -- #135's whole finding was thirteen of them -- and it reports as a note
    // instead, because a check that is permanently red for something already known and already
    // ticketed is a check everyone learns to scroll past. The board shows the list either way.
    const bad = [];
    const dead = [];
    const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let m;
    while ((m = re.exec(body))) {
      const [, name, raw] = m;
      const value = raw.trim();
      if (new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(value)) {
        bad.push(`${name} is defined as itself (${value}) -- a cycle, so everything reading it inherits instead`);
        continue;
      }
      if (!(CSS.match(new RegExp(`var\\(\\s*${name}\\s*[,)]`, 'g')) || []).length) dead.push(name);
    }
    if (bad.length) return no(bad);
    return { pass: true, note: dead.length
      ? `no cycles; ${dead.length} token${dead.length > 1 ? 's' : ''} nothing reads -- ${dead.join(', ')} (#135)`
      : 'every token resolves and is read' };
  },

  'pads-requires-exist'() {
    const ids = new Set(PADS.map((d) => d.id));
    const bad = [];
    for (const d of PADS) for (const r of d.requires || []) if (!ids.has(r)) bad.push(`${d.id} requires "${r}", which is not a pad`);
    return bad.length ? no(bad) : ok();
  },

  'pads-buildat-in-bounds'() {
    const bad = [];
    for (const d of structurePads()) {
      const b = TIERS[d.tier ?? 0].bounds;
      const [x, z] = d.buildAt;
      // The CENTRE, not the footprint. Watchtowers stand ON the wall line by design -- every one of
      // the twelve straddles it -- so a footprint test flagged all twelve and was measuring the
      // design rather than a fault. What is actually wrong is a building whose middle is outside the
      // ground it belongs to.
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) {
        bad.push(`${d.id} centre [${x}, ${z}] is outside tier ${d.tier ?? 0}`);
      }
    }
    return bad.length ? no(bad) : ok();
  },

  'pads-no-overlap'() {
    const s = CFG.spend.padSize;
    const bad = [];
    const withPos = PADS.filter((d) => d.pos);
    for (let i = 0; i < withPos.length; i++) {
      for (let j = i + 1; j < withPos.length; j++) {
        const a = withPos[i];
        const b = withPos[j];
        // Two pads on one spot is the DESIGN when one unlocks the other: the Archery Range's mat
        // becomes the recruit mat, the Barracks' becomes the swordsman mat. They are never on the
        // field together, because `refreshPads` drops a built pad before adding what it required.
        if ((a.tier ?? 0) !== (b.tier ?? 0)) continue;
        if (needs(a, b.id) || needs(b, a.id)) continue;
        if (Math.abs(a.pos[0] - b.pos[0]) < s && Math.abs(a.pos[1] - b.pos[1]) < s) {
          bad.push(`${a.id} and ${b.id} overlap at [${a.pos}] / [${b.pos}]`);
        }
      }
    }
    return bad.length ? no(bad) : ok();
  },

  'opening-homes-legal'() {
    const b = TIERS[CFG.opening.tier].bounds;
    const [w, h] = foot('house') || [4, 4];
    const bad = [];
    const homes = CFG.opening.homes;
    for (const [id, x, z] of homes) {
      if (x - w / 2 < b.x0 || x + w / 2 > b.x1 || z - h / 2 < b.z0 || z + h / 2 > b.z1) {
        bad.push(`${id} at [${x}, ${z}] is outside the opening plot`);
      }
    }
    for (let i = 0; i < homes.length; i++) {
      for (let j = i + 1; j < homes.length; j++) {
        if (Math.abs(homes[i][1] - homes[j][1]) < w && Math.abs(homes[i][2] - homes[j][2]) < h) {
          bad.push(`${homes[i][0]} and ${homes[j][0]} overlap`);
        }
      }
    }
    return bad.length ? no(bad) : ok();
  },

  'icons-unique'() {
    // An object literal with the same key twice is legal JavaScript and the last one silently wins.
    // `ICONS.iron` was declared twice -- an ingot, then a riveted wall panel -- so the iron RESOURCE
    // chip showed a wall for as long as nobody looked. It is fixed; this is what stops it coming
    // back, because no assertion about the game's behaviour can see it: the icon set still has an
    // entry for every name anything asks for, and the wrong picture is still a picture.
    const src = readFileSync(join(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), 'src', 'icons.js'), 'utf8');
    const keys = [...src.matchAll(/^\s{2}([a-zA-Z]\w*):\s*`/gm)].map((m) => m[1]);
    const seen = new Set();
    const dupes = [...new Set(keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false))))];
    return dupes.length
      ? no(dupes.map((k) => `ICONS.${k} is declared twice -- the later one silently wins`))
      : { pass: true, note: `${keys.length} icons, no key declared twice` };
  },

  'icons-exist'() {
    const bad = [];
    for (const d of PADS) if (d.icon && !ICONS[d.icon]) bad.push(`pad ${d.id} wants icon "${d.icon}"`);
    for (const u of UPGRADES) if (u.icon && !ICONS[u.icon]) bad.push(`upgrade ${u.id} wants icon "${u.icon}"`);
    return bad.length ? no(bad) : ok();
  },

  // #203: the ring of places on a tower's deck has to seat the biggest crew the game can ever send
  // to it. For a long time it did not -- seven places against a roster of nine -- and a ring asked to
  // seat more than it has wraps silently: replaying the arithmetic, archer #8 landed on #1 and #9 on
  // #2, both 0.000 apart. Nothing in the game counts that as anything; the crew tallies were right.
  //
  // The roster is derived rather than written down, because writing it down is how the two drifted.
  'deck-seats-the-crew'() {
    const lv = CFG.tower.levels;
    const top = lv[lv.length - 1].slots;
    const adders = UPGRADES.filter((u) => u.apply && u.apply.key === 'towerSlots');
    const odd = adders.filter((u) => u.apply.op !== 'add');
    if (odd.length) return no(`${odd.map((u) => u.id).join(', ')} changes towerSlots by something other than adding, and this check only knows how to add`);
    const extra = adders.reduce((n, u) => n + (u.max || 1) * (u.apply.by || 0), 0);
    const want = top + extra;
    const have = CFG.tower.deck.slots;
    return have >= want
      ? ok()
      : no(`a deck can be asked to hold ${want} archers (${top} at tower level ${lv.length}, ${extra} from ${adders.map((u) => u.name).join(' and ')}) and the ring has ${have} places`);
  },

  'upgrade-mods-exist'() {
    // This was blocked, and is not any more. `mul`/`add` used to return a bare closure over `key`,
    // so `apply.toString()` showed the helper's body -- `g.mods[key] *= by` -- with the key nowhere
    // in it. The first version read that literal `key` and reported all sixteen upgrades as broken,
    // which is a check failing rather than a game failing, and the worse of the two; it said so
    // rather than guessing. #177 now hangs `{ key, by, op }` on the function for its own reasons,
    // and that is all this ever needed.
    const keys = new Set(Object.keys(MODS));
    const bad = [];
    for (const u of UPGRADES) {
      const a = u.apply;
      if (typeof a !== 'function') { bad.push(`${u.id}: no apply`); continue; }
      // A hand-written apply is allowed and is not a typo risk -- only the declared ones are checked.
      if (a.key === undefined) continue;
      if (!keys.has(a.key)) bad.push(`${u.id} (${u.name}) writes \`mods.${a.key}\`, which does not exist`);
      if (typeof a.by !== 'number') bad.push(`${u.id}: \`by\` is ${typeof a.by}, not a number`);
    }
    const declared = UPGRADES.filter((u) => u.apply && u.apply.key !== undefined).length;
    return bad.length ? no(bad)
      : { pass: true, note: `${declared} of ${UPGRADES.length} upgrades declare a mod key, all ${keys.size} resolve` };
  },

  'footprints-cover-kinds'() {
    const kinds = new Set(structurePads().map((d) => d.structure));
    const bad = [...kinds].filter((k) => !foot(k)).map((k) => `no footprint for "${k}"`);
    return bad.length ? no(bad) : ok();
  },
};
