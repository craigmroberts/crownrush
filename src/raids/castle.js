// #256 (R3): A MAP NODE, AS A CASTLE TO DEFEND. Pure: the same run seed and node always give the same
// castle, which is what lets a saved run (R8) resume into the castle it left, and what lets a check
// ask for "castle 2.3.1 of run 42" and get it.
//
// The castle is the village the story edition stands at its opening -- the tier-0 plot, its palisade
// ring, Keep, range, four watchtowers and homes -- with the owner's decision 1 applied: defense only.
// No trade post, no mats, no mining, no camps, no caches. What varies between castles is what this
// file decides: which towers stand, the wall material, the time of day, and the raids.
import { CFG } from '../config.js';
import { makeRng, mix } from './rand.js';

const TOWERS = ['tower-0-ne', 'tower-0-nw', 'tower-0-se', 'tower-0-sw'];
const MOD_NAMES = { night: 'Night', fog: 'Fog', 'no-towers': 'No towers', 'double-raid': 'Double raid' };
export const modifierName = (m) => MOD_NAMES[m] || m;

function nodeSeed(runSeed, node) {
  return mix(mix(runSeed ^ 0x5eed, node.region), node.layer * 8 + node.lane);
}

export function castleSpec(runSeed, node) {
  const C = CFG.raids.castle;
  const rng = makeRng(nodeSeed(runSeed, node));
  const mods = node.modifiers || [];
  const boss = node.kind === 'boss';
  const d = node.difficulty;

  const level = node.starter ? C.level.starter : Math.min(C.level.max, C.level.base + C.level.perRegion * node.region);
  const phase = boss ? C.phase.boss
    : mods.includes('night') ? C.phase.night
      : node.region === 0 ? C.phase.region1
        : node.region === 1 ? C.phase.region2
          : rng.pick(C.phase.later);

  // Raids. Knights, with the heavier types joining by region; ranks climb with the region and a
  // fortress fights one rank up. Bearings: region 1 comes from one side at a time, later castles from
  // two, a fortress from three -- sides, not numbers, are what a player defends.
  const times = node.starter ? C.at.starter : boss ? C.at.boss : node.region === 0 ? C.at.region1 : C.at.later;
  const rank = Math.min(CFG.ranks.length - 1, node.starter ? 0 : node.region + (node.kind === 'fortress' ? 1 : 0));
  const sides = node.region === 0 ? 1 : node.kind === 'fortress' ? 3 : 2;
  const raids = times.map((at, i) => {
    let n = node.starter ? C.size.starter[i] : Math.round((C.size.base + C.size.perD * d) * (1 + C.size.growth * i));
    if (mods.includes('double-raid')) n *= 2;
    const types = [];
    for (const m of C.mix) if (node.region >= m.from) for (let k = 0; k < Math.round(n * m.share); k++) types.push(m.type);
    while (types.length < n) types.push('knight');
    // #258: the chief LEADS the last raid, and it comes in around him as his guard (`guard`, read by
    // `queueCastleRaid`). Pushed last, he spawned 0.35 s behind the man before him with every man on
    // his own bearing, so the "guard" was strung out along the edge and a charge landing on the chief
    // struck him alone -- measured: 1 raider hit.
    const guard = boss && i === times.length - 1;
    if (guard) types.unshift('boss');
    const base = rng() * Math.PI * 2;
    const bearings = [];
    for (let k = 0; k < sides; k++) bearings.push(+(base + (k * Math.PI * 2) / sides + (rng() - 0.5) * 0.6).toFixed(3));
    return guard ? { at, types, rank, bearings: [bearings[0]], guard: true } : { at, types, rank, bearings };
  });

  return {
    id: node.id,
    kind: node.kind,
    starter: !!node.starter,
    region: node.region,
    layer: node.layer,
    difficulty: d,
    multiplier: node.multiplier,
    reward: node.reward,
    modifiers: [...mods],
    level,
    towers: mods.includes('no-towers') ? [] : [...TOWERS],
    phase,
    blood: boss,
    // `fog` is on the map card and in the score already; its effect in the castle (thick weather) is
    // not built yet. Said here rather than left for someone to find.
    // The raid-night the enemy stats scale from. x3 per point of difficulty puts a region-3 boss at
    // night 13 -- x6 put it at 25, twice the hit points of the same rank on night 1. R7 tunes this.
    night: Math.max(1, Math.round(1 + (d - 1) * 3)),
    raids,
  };
}
