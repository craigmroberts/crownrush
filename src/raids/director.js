// #256 (R3): THE DIRECTOR. Owns raids mode's loop: map -> castle -> reward -> map, and the end of a
// run. It holds the one reference to the run (src/raids/run.js) and replaces it as things happen; it
// tells the map what to draw and the game which castle to stand; the game tells it back how the
// castle went.
//
// It is glue, deliberately thin. What a castle IS lives in castle.js, what the map IS in map.js, what
// a run IS in run.js, who is in it in allies.js -- all pure, all checked without a browser. This file
// is the part that has to be driven in one.
import { CFG } from '../config.js';
import { pickOffer } from '../upgrades.js';
import { createRun, ride, complete, nodeById } from './run.js';
import { castleSpec } from './castle.js';
import { recruitsFor, recruit, buy, pay, canBuy, price, deploy, defaultPlan, clampPlan, lose, takeCard, seeCards, coinReward, wrenOnOffer, offerWren, recruitWren } from './allies.js';

// The beat between a castle ending and the next screen: long enough to see the last raider fall, or
// the King, and short enough that the next screen is the next thing rather than a wait.
const AFTER_CLEAR_MS = 1400;
const AFTER_FALL_MS = 1600;

export class RaidsDirector {
  constructor(game, map) {
    this.game = game;
    this.map = map;
    this.run = null;
    this.node = null;
    this.plan = null;   // #257: the deploy plan the ride card last showed, kept between castles
    game.director = this;
    map.director = this;
  }

  newSeed() {
    return (Math.random() * 4294967296) >>> 0;
  }

  start(seed = this.newSeed()) {
    this.run = createRun(seed);
    this.node = null;
    this.plan = null;
    this.toMap();
  }

  toMap() {
    this.game.freeze(true);
    this.map.show(this.run, { onRide: (id) => this.ride(id) });
  }

  // #257: what the ride card's deploy row starts on -- last castle's plan if there was one, clamped to
  // who is left, or the default split.
  planFor() {
    return this.plan ? clampPlan(this.run, this.plan) : defaultPlan(this.run);
  }

  setPlan(plan) {
    this.plan = clampPlan(this.run, plan);
    return this.plan;
  }

  // The map's Ride button, or a check. A muster is not a fight: it opens the muster, and leaving it
  // is the node done.
  ride(id) {
    this.run = ride(this.run, id);
    const node = nodeById(this.run, id);
    this.node = node;
    if (node.kind === 'muster') {
      this.openMuster();
      return node;
    }
    this.map.hide();
    this.game.freeze(false);
    this.sent = deploy(this.run, this.planFor());
    this.game.startCastle(castleSpec(this.run.seed, node), this.sent, this.run.cards);
    return node;
  }

  onCastle(type, detail) {
    if (type === 'cleared') setTimeout(() => this.afterClear(detail), AFTER_CLEAR_MS);
    if (type === 'fell') setTimeout(() => this.afterFall(detail), AFTER_FALL_MS);
  }

  // An interim score until R6 builds the real one (spec section 7): kills and coin, times the node's
  // multiplier, halved if the Keep fell. It exists so the map has a number to show; R6 replaces it.
  afterClear(r) {
    const spec = this.game.castle ? this.game.castle.spec : castleSpec(this.run.seed, this.node);
    const score = Math.round((r.kills * 10 + r.coins) * (this.node.multiplier || 1) * (r.keepStood ? 1 : 0.5));
    this.run = lose(this.run, r.fell || []);
    this.run = complete(this.run, { score, chest: r.coins });
    this.lastClear = { ...r, score };
    this.game.endCastle();
    this.game.freeze(true);
    this.reward = this.rewardFor(r, spec);
    this.map.showReward(this.run, this.reward, (pick) => this.takeReward(pick));
  }

  // #257: THE REWARD, one choice of three (spec section 6): men, a card, or coin for the chest. The
  // node's own reward -- the one its map card promised -- pays more when it is the one taken. A boss
  // also offers Wren, once a run, if nobody has yet.
  rewardFor(r, spec) {
    const A = CFG.raids.allies;
    const kind = this.node.reward;
    const men = recruitsFor(r, spec) + (kind === 'allies' ? A.bonus.allies : 0);
    const cards = this.drawCards(kind === 'card' ? 2 : 1);
    const coin = coinReward(this.node.region) * (kind === 'chest' ? A.bonus.chest : 1);
    const out = { kind, men, cards, coin, fell: (r.fell || []).length, sent: r.sent || 0, wren: false };
    if (this.node.kind === 'boss' && wrenOnOffer(this.run)) {
      out.wren = true;
      this.run = offerWren(this.run);
    }
    return out;
  }

  // `pickOffer` with the run's taken cards and its seen-rotation (#235), and the cards a castle cannot
  // use counted as maxed so they never come up.
  drawCards(n) {
    const taken = { ...this.run.cards };
    for (const id of CFG.raids.allies.deckSkip) taken[id] = 99;
    const list = pickOffer(taken, n, this.run.seen);
    this.run = seeCards(this.run, list.map((u) => u.id));
    return list.map((u) => ({ id: u.id, name: u.name, desc: u.desc, icon: u.icon, pool: u.pool }));
  }

  takeReward(pick) {
    const R = this.reward;
    if (!R) return;
    if (pick === 'men') this.run = recruit(this.run, R.men).run;
    else if (pick === 'coin') this.run = { ...this.run, chest: this.run.chest + R.coin };
    else if (pick === 'wren' && R.wren) this.run = recruitWren(this.run);
    else if (R.cards.some((c) => c.id === pick)) this.run = takeCard(this.run, pick);
    else return;
    this.reward = null;
    this.toMap();
  }

  // #257: THE MUSTER. Spend the chest on men, a card, or Wren the first time one is reached. No
  // repairs (decision 1). Leaving is the node done.
  openMuster() {
    this.game.freeze(true);
    this.musterWren = wrenOnOffer(this.run);
    if (this.musterWren) this.run = offerWren(this.run);
    this.musterCards = null;
    this.showMuster();
  }

  showMuster() {
    this.map.showMuster(this.run, this.musterStock(), {
      buy: (item) => this.buyAtMuster(item),
      leave: () => this.leaveMuster(),
    });
  }

  musterStock() {
    const items = ['swordsman', 'archer'].map((t) => ({ item: t, price: price(t), ...canBuy(this.run, t) }));
    const cardOk = this.run.chest >= price('card');
    items.push({ item: 'card', price: price('card'), ok: cardOk && !this.musterCards, why: this.musterCards ? 'Choose one below' : cardOk ? '' : `${price('card') - this.run.chest} more coin` });
    if (this.musterWren) {
      // the offer this muster made stands until the King leaves it, bought or not
      const c = this.run.wren ? { ok: false, why: 'She rides with you' } : this.run.chest >= price('wren') ? { ok: true, why: '' } : { ok: false, why: `${price('wren') - this.run.chest} more coin` };
      items.push({ item: 'wren', price: price('wren'), ...c });
    }
    return { items, cards: this.musterCards };
  }

  buyAtMuster(item) {
    if (item === 'card') {
      if (this.musterCards || this.run.chest < price('card')) return;
      this.run = pay(this.run, price('card'));
      this.musterCards = this.drawCards(3);
    } else if (item === 'wren') {
      if (!this.musterWren || this.run.wren || this.run.chest < price('wren')) return;
      this.run = recruitWren(pay(this.run, price('wren')));
    } else if (this.musterCards && this.musterCards.some((c) => c.id === item)) {
      this.run = takeCard(this.run, item);
      this.musterCards = null;
    } else {
      if (!canBuy(this.run, item).ok) return;
      this.run = buy(this.run, item);
    }
    this.showMuster();
  }

  leaveMuster() {
    // a card paid for and not chosen is chosen for them -- the coin is gone, so the card must not be
    if (this.musterCards) this.run = takeCard(this.run, this.musterCards[0].id);
    this.musterCards = null;
    this.run = complete(this.run);
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

  // #257: a run with men in it, for the board's views of the screens that are about them.
  demoRoster(seed = 20260923) {
    this.demo(seed);
    this.run = recruit({ ...this.run, chest: 64 }, 11).run;
    this.run = takeCard(this.run, 'keen-eye');
  }

  // `?view=deploy`: the ride card with the deploy row, on a run with eleven men
  demoDeploy() {
    this.demoRoster();
    this.toMap();
    const lit = this.map.litOf(this.run);
    this.map.openCard(lit[0]);
  }

  // `?view=reward`: the screen after a fortress clear, with the card it promised
  demoReward() {
    this.demoRoster();
    const lit = this.map.litOf(this.run);
    const node = lit.find((n) => n.kind === 'fortress') || lit[0];
    this.run = ride(this.run, node.id);
    this.node = node;
    const spec = castleSpec(this.run.seed, node);
    const r = { id: node.id, seconds: 58, kills: 24, coins: 26, wallsIntact: 1, keepStood: true, fell: [this.run.roster[0].id, this.run.roster[3].id], sent: 8 };
    this.run = lose(this.run, r.fell);
    this.run = complete(this.run, { score: 480, chest: r.coins });
    this.game.freeze(true);
    this.reward = this.rewardFor(r, spec);
    this.map.showReward(this.run, this.reward, (pick) => this.takeReward(pick));
  }

  // `?view=muster`: a muster with a chest to spend and Wren on offer
  demoMuster() {
    this.demoRoster();
    this.run = { ...this.run, chest: 64 };
    this.node = { kind: 'muster', region: 0, id: 'demo' };
    this.openMuster();
  }
}
