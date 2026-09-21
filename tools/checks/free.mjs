// #179: the checks that need nothing but the source. No browser, no server, no tokens, milliseconds.
import { CFG, PADS, TIERS } from '../../src/config.js';
import { MODS, UPGRADES } from '../../src/upgrades.js';
import { ICONS } from '../../src/icons.js';
import { verdict } from '../churn/verdict.mjs';
import { simulate } from '../deck/reheat.mjs';
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

  // #235: THE DECK ROTATES. See `tools/deck/reheat.mjs` for what is measured and `pickOffer` for
  // why level 15 is not held to a number: fifteen offers of three from twenty-three cards run out
  // under any draw, and the honest measure there is whether the same three cards come round again.
  'deck-rotates'() {
    const r = simulate(2000, 15, true);
    const bad = [];
    if (r.broken > 0) bad.push(`${r.broken} offers were all cards already shown while an unseen card was available -- the rule pickOffer exists for`);
    if (r.reheated[10] > 0.2) bad.push(`${(r.reheated[10] * 100).toFixed(0)}% of level-10 offers had nothing new on them (limit 20%)`);
    if (r.reheated[12] > 0.2) bad.push(`${(r.reheated[12] * 100).toFixed(0)}% of level-12 offers had nothing new on them (limit 20%)`);
    if (r.identical[15] > 0.1) bad.push(`${(r.identical[15] * 100).toFixed(0)}% of level-15 offers were the same three cards as an earlier offer (limit 10%)`);
    return bad.length ? no(bad) : { pass: true, note: `2000 runs: nothing new at level 10 ${(r.reheated[10] * 100).toFixed(0)}%, at 12 ${(r.reheated[12] * 100).toFixed(0)}%, at 15 ${(r.reheated[15] * 100).toFixed(0)}% (the deck runs out by level ${r.allSeenBy}); an offer repeated whole at 15: ${(r.identical[15] * 100).toFixed(0)}%` };
  },

  // #236: NO SEAM IS WORTH MORE THAN TWICE ANY OTHER ONCE IT IS GLUTTED. Coin per second of
  // swinging, straight off `CFG.materials`: each material at three tranches of its own glut
  // against every other material fresh. Diamond fresh is 3.2x wood, which is the schedule this
  // ticket exists to break; at three tranches it is 1.4x, and this is what keeps somebody from
  // putting the ladder back by nudging one price.
  'glut-levels-the-seams'() {
    const M = CFG.materials;
    const bad = [];
    const rate = (t, tranches = 0) => {
      const m = M[t];
      if (!m.glut) { bad.push(`${t} has no glut`); return m.coin / m.mine; }
      return Math.max(1, Math.round(m.coin * Math.pow(m.glut.pay, tranches))) / m.mine;
    };
    const rows = [];
    for (const a of Object.keys(M)) {
      const glutted = rate(a, 3);
      for (const b of Object.keys(M)) {
        if (a === b) continue;
        const fresh = rate(b);
        if (glutted > 2 * fresh) bad.push(`${a} at three tranches is ${glutted.toFixed(1)} coin/s, more than twice fresh ${b} at ${fresh.toFixed(1)}`);
      }
      rows.push(`${a} ${rate(a).toFixed(1)}->${glutted.toFixed(1)}`);
    }
    return bad.length ? no(bad) : { pass: true, note: `coin/s fresh -> at three tranches: ${rows.join(', ')}` };
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

  // #220: A LEGACY UNLOCK IS A HEAD START, NOT A SHORTCUT.
  //
  // The ticket's second rule, and the one that decides whether the tree is longevity or a difficulty
  // slide: "each unlock is a head start on something the run already gives you, not a thing the run
  // cannot otherwise have." Twenty-four of these are chosen three at a time before the first mat, so
  // one that is stronger than the card it shadows is a run that starts past its own upgrade path.
  //
  // The rule is checkable because both sides write to the same `mods` key: an unlock may be worth AT
  // MOST one buy of the equivalent upgrade card. Not the card's stacked maximum -- one buy. A player
  // with three picks has had a head start on three cards, and can still go and buy all three.
  //
  // An unlock with no equivalent card is not a failure and is not silently allowed either: it is
  // counted and named in the note, because "this one has nothing to measure it against" is a fact
  // somebody adding the twenty-fifth should have to read.
  // #190: the churn harness's own verdict, held to the three shapes it has actually produced.
  //
  // It is here rather than left to a browser run because it is arithmetic, and because the harness
  // was confidently wrong with it: `raiders` sat at 227 for six rounds, stepped to 232 when a camp
  // woke and the first damage number was drawn, and the average reported "+0.7/round -- CLIMB". An
  // instrument that cries wolf is worse than one that says nothing, because the next real finding
  // arrives beside it and gets the same shrug (#179 is the ticket that bought that lesson).
  //
  // The series below are measured, not invented -- each one is a row this harness printed.
  'churn-verdict-tells-a-step-from-a-leak'() {
    const CASES = [
      // block/counter                      the settled rounds (the first is dropped by the caller)
      ['raiders/geometries, a camp waking', [227, 227, 227, 227, 227, 227, 232, 232], 'step'],
      ['rain/geometries, nothing at all', [226, 226, 226, 226, 226, 226, 226, 226], 'flat'],
      ['restore/geometries, handing it back', [223, 222, 222, 222, 222, 221, 221, 221], 'flat'],
      // the leak this harness was built to find: nine geometries a spawn flourish
      ['crowd/geometries, the spawn fx leak', [252, 795, 1338, 1881], 'climb'],
      // and the one it nearly buried: three megabytes a round, every round
      ['pads/heapMB', [82, 85, 88, 91, 94, 98, 101, 104], 'climb'],
      // a slow leak is still a leak: half the intervals move and it must not read as a step
      ['a leak that only moves every other round', [100, 101, 101, 102, 102, 103, 103, 104], 'climb'],
    ];
    const bad = [];
    for (const [what, series, want] of CASES) {
      const got = verdict(series).kind;
      if (got !== want) bad.push(`${what}: read as "${got}", should be "${want}" -- ${series.join(' -> ')}`);
    }
    return bad.length ? no(bad) : { pass: true, note: `${CASES.length} measured series, each read as what it is` };
  },

  'legacy-is-a-head-start'() {
    const card = {};
    for (const u of UPGRADES) {
      const a = u.apply;
      if (!a || a.key === undefined) continue;
      // the strongest single buy of any card writing this key
      if (!card[a.key] || a.by > card[a.key].by) card[a.key] = { by: a.by, op: a.op, name: u.name };
    }
    const bad = [];
    const unmatched = [];
    let compared = 0;
    for (const u of CFG.legacy) {
      if (typeof u.apply !== 'function') { bad.push(`${u.id}: no apply`); continue; }
      if (typeof u.at !== 'number' || u.at <= 0) bad.push(`${u.id}: threshold is ${u.at}`);
      if (!u.pool) bad.push(`${u.id} (${u.name}) has no pool, so the chooser cannot group it`);
      // Run the unlock against a fresh copy of MODS and see what moved. Reading the source would be
      // guessing at it; this is what the game will actually do.
      const before = { ...MODS, startBuilt: [] };
      const after = { ...MODS, startBuilt: [] };
      try { u.apply({ mods: after }); } catch (e) { bad.push(`${u.id}: apply threw -- ${e.message}`); continue; }
      const moved = Object.keys(after).filter((k) => !Array.isArray(after[k]) && after[k] !== before[k]);
      const grew = after.startBuilt.length > 0;
      if (!moved.length && !grew) { bad.push(`${u.id} (${u.name}) changes nothing`); continue; }
      for (const key of moved) {
        const c = card[key];
        if (!c) { unmatched.push(`${u.id}->${key}`); continue; }
        compared++;
        const by = c.op === 'mul' ? after[key] / before[key] : after[key] - before[key];
        if (by > c.by + 1e-9) {
          bad.push(`${u.id} (${u.name}) moves \`${key}\` by ${by.toFixed(2)}, more than one ${c.name} card at ${c.by}`);
        }
      }
    }
    const ids = CFG.legacy.map((u) => u.id);
    if (new Set(ids).size !== ids.length) bad.push('two unlocks share an id, so the chooser cannot tell them apart');
    const rising = CFG.legacy.every((u, i) => i === 0 || u.at >= CFG.legacy[i - 1].at);
    if (!rising) bad.push('the thresholds do not rise in order, so the ladder reads out of sequence');
    if (CFG.legacy.filter((u) => u.at <= 13000).length < CFG.legacyPicks + 1)
      bad.push('fewer than four unlocks inside one finished short run, so the choosing does not start in run one');
    return bad.length ? no(bad)
      : { pass: true, note: `${CFG.legacy.length} unlocks, ${compared} measured against their card and none stronger`
        + `${unmatched.length ? `, ${unmatched.length} with no card to compare (${unmatched.join(', ')})` : ''}` };
  },

  'footprints-cover-kinds'() {
    const kinds = new Set(structurePads().map((d) => d.structure));
    const bad = [...kinds].filter((k) => !foot(k)).map((k) => `no footprint for "${k}"`);
    return bad.length ? no(bad) : ok();
  },
};
