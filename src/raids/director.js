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
import { recruitsFor, recruit, buy, pay, canBuy, price, deploy, defaultPlan, clampPlan, lose, takeCard, seeCards, coinReward, wrenOnOffer, offerWren, recruitWren, committable, commitPick, withoutCommitted } from './allies.js';
import { draftAbilities, setAbility } from './abilities.js';

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
    this.commit = 0;    // #258: how many the boss card's Call to Arms row commits
    this.committed = [];
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
    this.commit = 0;
    this.toMap();
  }

  toMap() {
    this.game.freeze(true);
    this.map.show(this.run, { onRide: (id) => this.ride(id) });
  }

  // #257: what the ride card's deploy row starts on -- last castle's plan if there was one, clamped to
  // who is left, or the default split.
  // At a boss the committed are set aside first, so the deploy row counts only who is left.
  planFor(node = null) {
    const run = node && node.kind === 'boss' ? withoutCommitted(this.run, commitPick(this.run, this.commitFor())) : this.run;
    return this.plan ? clampPlan(run, this.plan) : defaultPlan(run);
  }

  setPlan(plan, node = null) {
    const run = node && node.kind === 'boss' ? withoutCommitted(this.run, commitPick(this.run, this.commitFor())) : this.run;
    this.plan = clampPlan(run, plan);
    return this.plan;
  }

  // #258: the Call to Arms row, clamped to the men there are
  commitFor() {
    return Math.max(0, Math.min(this.commit, committable(this.run)));
  }

  setCommit(n) {
    this.commit = Math.max(0, Math.min(n, committable(this.run)));
    return this.commit;
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
    // #258: at a boss the committed are set aside before the deploy chooses, and go in held back
    this.committed = node.kind === 'boss' ? commitPick(this.run, this.commitFor()) : [];
    this.sent = deploy(withoutCommitted(this.run, this.committed), this.planFor(node));
    this.game.startCastle(castleSpec(this.run.seed, node), this.sent, this.run.cards, { committed: this.committed, ability: this.run.ability });
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
    // #258: a boss held with nobody committed scores `bank` times over -- banking pays too
    const banked = this.node.kind === 'boss' && !this.committed.length;
    const score = Math.round((r.kills * 10 + r.coins) * (this.node.multiplier || 1) * (r.keepStood ? 1 : 0.5) * (banked ? CFG.raids.boss.bank : 1));
    this.run = lose(this.run, r.fell || []);
    // and the committed are spent, whether they came back or not
    this.run = lose(this.run, this.committed.map((u) => u.id));
    this.lastCommit = { committed: this.committed.length, banked };
    this.committed = [];
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
    const out = { kind, men, cards, coin, fell: (r.fell || []).length, sent: r.sent || 0, wren: false, abilities: null, boss: this.node.kind === 'boss', spent: 0, banked: false };
    if (this.node.kind === 'boss') {
      out.spent = this.lastCommit ? this.lastCommit.committed : 0;
      out.banked = !!(this.lastCommit && this.lastCommit.banked);
      // #258: a boss pays an ability -- the choice of three is the whole reward, with Wren beside it
      // if she has not been offered yet
      out.abilities = draftAbilities(this.run);
      if (wrenOnOffer(this.run)) {
        out.wren = true;
        this.run = offerWren(this.run);
      }
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
    if (R.abilities && R.abilities.some((a) => a.id === pick)) this.run = setAbility(this.run, pick);
    else if (pick === 'men') this.run = recruit(this.run, R.men).run;
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
    this.musterAbilities = null;
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
    items.push({ item: 'card', price: price('card'), ok: cardOk && !this.musterCards && !this.musterAbilities, why: this.musterCards ? 'Choose one below' : cardOk ? '' : `${price('card') - this.run.chest} more coin` });
    // #258: the ability slot, swapped here (spec section 6)
    const ap = CFG.raids.abilities.price;
    items.push({ item: 'ability', price: ap, ok: this.run.chest >= ap && !this.musterAbilities && !this.musterCards, why: this.musterAbilities ? 'Choose one below' : this.run.chest >= ap ? '' : `${ap - this.run.chest} more coin` });
    if (this.musterWren) {
      // the offer this muster made stands until the King leaves it, bought or not
      const c = this.run.wren ? { ok: false, why: 'She rides with you' } : this.run.chest >= price('wren') ? { ok: true, why: '' } : { ok: false, why: `${price('wren') - this.run.chest} more coin` };
      items.push({ item: 'wren', price: price('wren'), ...c });
    }
    return { items, cards: this.musterCards, abilities: this.musterAbilities, ability: this.run.ability };
  }

  buyAtMuster(item) {
    if (item === 'ability') {
      const ap = CFG.raids.abilities.price;
      if (this.musterAbilities || this.musterCards || this.run.chest < ap) return;
      this.run = pay(this.run, ap);
      this.musterAbilities = draftAbilities(this.run);
    } else if (this.musterAbilities && this.musterAbilities.some((a) => a.id === item)) {
      this.run = setAbility(this.run, item);
      this.musterAbilities = null;
    } else if (item === 'card') {
      if (this.musterCards || this.musterAbilities || this.run.chest < price('card')) return;
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
    if (this.musterAbilities) this.run = setAbility(this.run, this.musterAbilities[0].id);
    this.musterCards = null;
    this.musterAbilities = null;
    this.run = complete(this.run);
    this.toMap();
  }

  afterFall(r) {
    this.lastFall = r;
    this.committed = [];
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

  // `?view=commit`: the boss's ride card, with eleven men and the Call to Arms row
  demoCommit() {
    this.demoRoster();
    this.run = recruit(this.run, 6).run;
    this.commit = 4;
    const boss = this.map.regionBoss(this.run);
    this.toMap();
    this.map.openCard(boss);
  }

  // `?view=bossreward`: what a boss pays -- an ability, and Wren the first time
  demoBossReward() {
    this.demoRoster();
    this.node = this.map.regionBoss(this.run);
    this.lastCommit = { committed: 0, banked: true };
    this.run = complete({ ...this.run, at: this.node.id, path: [...this.run.path, this.node.id] }, { score: 1800, chest: 40 });
    this.game.freeze(true);
    const spec = castleSpec(this.run.seed, this.node);
    this.reward = this.rewardFor({ seconds: 120, kills: 40, coins: 40, wallsIntact: 1, keepStood: true, fell: [], sent: 8 }, spec);
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
