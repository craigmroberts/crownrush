// #256 (R3): THE DIRECTOR. Owns raids mode's loop: map -> castle -> map, and the end of a run. It holds
// the one reference to the run (src/raids/run.js) and replaces it as things happen; it tells the map
// what to draw and the game which castle to stand; the game tells it back how the castle went.
//
// It is glue, deliberately thin. What a castle IS lives in castle.js, what the map IS in map.js, what
// a run IS in run.js -- all pure, all checked without a browser. This file is the part that has to be
// driven in one.
import { createRun, ride, complete, nodeById } from './run.js';
import { castleSpec } from './castle.js';

// The beat between a castle ending and the map coming up: long enough to see the last raider fall, or
// the King, and short enough that the map is the next thing rather than a wait.
const AFTER_CLEAR_MS = 1400;
const AFTER_FALL_MS = 1600;

export class RaidsDirector {
  constructor(game, map) {
    this.game = game;
    this.map = map;
    this.run = null;
    this.node = null;
    game.director = this;
  }

  newSeed() {
    return (Math.random() * 4294967296) >>> 0;
  }

  start(seed = this.newSeed()) {
    this.run = createRun(seed);
    this.node = null;
    this.toMap();
  }

  toMap() {
    this.game.freeze(true);
    this.map.show(this.run, { onRide: (id) => this.ride(id) });
  }

  // The map's Ride button, or a check. A muster is not a fight: until R4 builds its shop it is passed
  // through, and the map comes straight back.
  ride(id) {
    this.run = ride(this.run, id);
    const node = nodeById(this.run, id);
    this.node = node;
    if (node.kind === 'muster') {
      this.run = complete(this.run);
      this.toMap();
      return node;
    }
    this.map.hide();
    this.game.freeze(false);
    this.game.startCastle(castleSpec(this.run.seed, node), []);
    return node;
  }

  onCastle(type, detail) {
    if (type === 'cleared') setTimeout(() => this.afterClear(detail), AFTER_CLEAR_MS);
    if (type === 'fell') setTimeout(() => this.afterFall(detail), AFTER_FALL_MS);
  }

  // An interim score until R6 builds the real one (spec section 7): kills and coin, times the node's
  // multiplier, halved if the Keep fell. It exists so the map has a number to show; R6 replaces it.
  afterClear(r) {
    const score = Math.round((r.kills * 10 + r.coins) * (this.node.multiplier || 1) * (r.keepStood ? 1 : 0.5));
    this.run = complete(this.run, { score, chest: r.coins });
    this.lastClear = { ...r, score };
    this.game.endCastle();
    this.toMap();
  }

  afterFall(r) {
    this.lastFall = r;
    this.game.endCastle();
    this.game.freeze(true);
    this.map.showFallen(this.run, this.node, () => this.start());
  }

  // `?view=overworld`: a run part-way through its first region, drawn without playing any castles --
  // the starter and one fork taken -- so the board frames a map with a path on it.
  demo(seed = 20260923) {
    this.run = createRun(seed);
    for (let i = 0; i < 2; i++) {
      const lit = this.map.litOf(this.run);
      this.run = complete(ride(this.run, lit[lit.length - 1].id), { score: 120 });
    }
    this.toMap();
  }
}
