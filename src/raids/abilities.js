// #258 (R5): THE ABILITY SLOT, as data. One ability at a time, filled from a draft of three after a
// boss or bought at a muster, used once a castle through the third button. What each one DOES is in
// `useAbility` (src/game-raids.js); this is what it is called and what the draft says about it.
//
// Four, each built on something the game already does: the King's arrows, Wren's hold, a recruit,
// and a wall stood again. A draft of three from four is thin -- the spec's content ticket adds more --
// but each of these changes a different kind of castle, which is what makes the choice a choice.
import { makeRng, mix } from './rand.js';

export const ABILITIES = [
  { id: 'volley', icon: 'arrows', name: 'Rain of Arrows', desc: 'Arrows fall on every raider near the King. Once a castle.' },
  { id: 'hold', icon: 'moon', name: 'Hold Fast', desc: 'Every raider on the field is held where he stands for four seconds. Once a castle.' },
  { id: 'sally', icon: 'swords', name: 'Sally Forth', desc: 'Three swordsmen run out to the King’s side for this castle. Once a castle.' },
  { id: 'mend', icon: 'brick', name: 'Mason’s Call', desc: 'Every wall and gate stands again, whole. Once a castle.' },
];

export const ABILITY = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));

// Three to choose from, never the one already in the slot. Seeded off the run and how far it has come,
// so the same run is offered the same three at the same point.
export function draftAbilities(run, n = 3) {
  const rng = makeRng(mix(run.seed, 9100 + run.path.length));
  const pool = ABILITIES.filter((a) => a.id !== run.ability);
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

export function setAbility(run, id) {
  if (!ABILITY[id]) throw new Error(`no ability ${id}`);
  return { ...run, ability: id };
}
