// #255 (R2): THE RAIDS MAP. A 2D board in the Mario Wonder manner -- nodes on painted paths, the King as
// a token, the nodes he can ride to lit -- drawn as DOM and SVG over a frozen game, so it costs no draw
// calls and a phone gets its breath between castles. The director (src/raids/director.js) shows it
// and hides it; everything it draws comes from the run (src/raids/run.js) and the map (map.js).
//
// LAYOUT. A phone is portrait, so the region climbs the screen: the first layer at the bottom, the boss
// at the top, the King's token below the first layer until he rides. Positions are percentages of the
// board, so it is the same map at any size; the paths are one SVG in the same percentages.
//
// Tapping a lit node raises a card -- what it is, its modifiers, its score multiplier, what clearing it
// pays -- with one Ride button. A node that is not lit does nothing: `isLit` is the one question, asked
// by the render and by the tap, so they cannot disagree.
import { region, choices, nodeById } from './raids/run.js';
import { nodePreview } from './raids/map.js';
import { modifierName } from './raids/castle.js';
import { counts } from './raids/allies.js';
import { CFG } from './config.js';
import { iconSvg } from './icons.js';

const ICON = { castle: 'castle', fortress: 'tower', muster: 'banner', boss: 'skull' };
const RIDE_MS = 650;
// #257: the roster's kinds as the screens name them, in the order the deploy row lists them
const KIND = {
  wren: { icon: 'tiara', one: 'Wren', many: 'Wren' },
  swordsman: { icon: 'swordsman', one: 'swordsman', many: 'swordsmen' },
  archer: { icon: 'archer', one: 'archer', many: 'archers' },
};
const menWord = (n) => `${n} ${n === 1 ? 'man' : 'men'}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Overworld {
  constructor(el) {
    this.el = el;
    this.nodesEl = el.querySelector('#ow-nodes');
    this.paths = el.querySelector('#ow-paths');
    this.king = el.querySelector('#ow-king');
    this.card = el.querySelector('#ow-card');
    this.fallen = el.querySelector('#ow-fallen');
    this.rewardEl = el.querySelector('#ow-reward');
    this.musterEl = el.querySelector('#ow-muster');
    this.king.innerHTML = iconSvg('crown', 30);
    this.lit = new Set();
    this.riding = false;
    this.nodesEl.addEventListener('click', (e) => {
      const b = e.target.closest('.ow-node');
      if (b) this.tap(b.dataset.id);
    });
    this.card.addEventListener('click', (e) => {
      const step = e.target.closest('[data-step]');
      if (step) return this.stepPlan(step.dataset.kind, +step.dataset.step);
      if (e.target.closest('#ow-ride')) this.rideTo(this.cardNode);
      else if (e.target.closest('#ow-card-x')) this.closeCard();
    });
    this.rewardEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (b && this.onPick) this.onPick(b.dataset.pick);
    });
    this.musterEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-buy]');
      if (b && !b.disabled && this.muster) this.muster.buy(b.dataset.buy);
      else if (e.target.closest('#ow-leave') && this.muster) this.muster.leave();
    });
    el.querySelector('#ow-board').addEventListener('click', (e) => {
      if (!e.target.closest('.ow-node')) this.closeCard();
    });
    this.fallen.addEventListener('click', (e) => {
      if (e.target.closest('#ow-again') && this.onAgain) this.onAgain();
    });
  }

  litOf(run) {
    return choices(run);
  }

  // The region on screen: the one the King is in, or the next one once he has beaten its boss.
  regionOf(run) {
    if (run.at == null) return 0;
    const here = nodeById(run, run.at);
    return here.kind === 'boss' ? here.region + 1 : here.region;
  }

  isLit(node) {
    return this.lit.has(node.id);
  }

  show(run, { onRide } = {}) {
    this.run = run;
    if (onRide) this.onRide = onRide;
    this.riding = false;
    this.fallen.classList.add('hidden');
    this.rewardEl.classList.add('hidden');
    this.musterEl.classList.add('hidden');
    this.closeCard();
    this.render();
    this.el.classList.remove('hidden');
  }

  hide() {
    this.closeCard();
    this.el.classList.add('hidden');
  }

  render() {
    const run = this.run;
    const index = this.regionOf(run);
    const reg = region(run, index);
    this.lit = new Set(this.litOf(run).map((n) => n.id));
    const layers = reg.layers;
    // y: layer 0 at 82%, the boss at 8%; the start marker at 94%
    const y = (L) => 82 - (L * 74) / (layers.length - 1);
    const x = (lane, n) => 14 + ((lane + 0.5) / n) * 72;
    const at = new Map();
    for (const row of layers) for (const n of row) at.set(n.id, { x: x(n.lane, row.length), y: y(n.layer) });
    const start = { x: 50, y: 94 };
    const visited = new Set(run.path);
    // paths: from the start marker to the first layer, then along every link
    const lines = [];
    const line = (a, b, cls) => lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${cls}"/>`);
    const from = run.at == null || nodeById(run, run.at).region !== index ? null : run.at;
    for (const n of layers[0]) line(start, at.get(n.id), from == null && this.lit.has(n.id) ? 'ow-p lit' : visited.has(n.id) ? 'ow-p taken' : 'ow-p');
    for (const row of layers) for (const n of row) for (const id of n.next) {
      const cls = visited.has(n.id) && visited.has(id) ? 'ow-p taken' : n.id === from && this.lit.has(id) ? 'ow-p lit' : 'ow-p';
      line(at.get(n.id), at.get(id), cls);
    }
    this.paths.innerHTML = lines.join('');
    this.nodesEl.innerHTML = layers.flat().map((n) => {
      const p = at.get(n.id);
      const state = this.lit.has(n.id) ? 'lit' : n.id === run.at ? 'here' : visited.has(n.id) ? 'done' : 'dim';
      const icon = n.starter ? 'keep' : ICON[n.kind];
      const label = `${nodePreview(n).title}${n.modifiers.length ? `, ${n.modifiers.map(modifierName).join(', ')}` : ''}`;
      // The badge is the score multiplier, not the modifier count: a red "1" said nothing, and the
      // multiplier is the half of the fork a player is weighing. The modifiers are on the card.
      const badge = n.multiplier > 1 ? `<i class="ow-mult">\u00d7${+n.multiplier.toFixed(1)}</i>` : '';
      return `<button class="ow-node k-${n.kind} ${state}" data-id="${n.id}" aria-label="${esc(label)}" aria-disabled="${!this.lit.has(n.id)}" style="left:${p.x}%;top:${p.y}%">${iconSvg(icon, 28)}${badge}</button>`;
    }).join('');
    const k = from ? at.get(from) : start;
    this.placeKing(k, false);
    const castle = Math.min(5, layers.flat().filter((n) => visited.has(n.id) && n.kind !== 'muster' && n.kind !== 'boss').length + 1);
    this.el.querySelector('#ow-title').textContent = `Region ${index + 1}`;
    this.el.querySelector('#ow-sub').textContent = `${run.cleared} cleared · ${run.score.toLocaleString()} score · ${run.chest} coin · ${menWord(run.roster.filter((u) => u.type !== 'wren').length)}${run.wren && !run.wrenLost ? ' and Wren' : ''}`;
    this.el.querySelector('#ow-hint').textContent = run.at == null ? 'Tap the lit castle to ride' : this.lit.size > 1 ? 'Choose where to ride' : 'Ride on';
    this.el.dataset.castle = String(castle);
  }

  placeKing(p, animate) {
    this.king.style.transition = animate ? `left ${RIDE_MS}ms ease-in-out, top ${RIDE_MS}ms ease-in-out` : 'none';
    this.king.style.left = `${p.x}%`;
    this.king.style.top = `${p.y}%`;
  }

  tap(id) {
    if (this.riding) return;
    const node = nodeById(this.run, id);
    if (!node || !this.isLit(node)) return;
    this.openCard(node);
  }

  openCard(node) {
    const p = nodePreview(node);
    this.cardNode = node;
    const mods = node.modifiers.map((m) => `<span class="chip">${esc(modifierName(m))}</span>`).join('');
    const mult = node.multiplier > 1 ? `<span class="chip ok">×${node.multiplier.toFixed(1)} score</span>` : '';
    const blurb = node.starter ? 'Two gentle raids. Learn the walls, the towers and the horn.'
      : node.kind === 'fortress' ? 'More raiders, a harder rank, and more score for holding it.'
        : node.kind === 'muster' ? 'No fight. Rest your men and spend the war chest.'
          : node.kind === 'boss' ? 'Their captain comes with the last raid.'
            : 'Three raids. Hold the Keep.';
    this.card.innerHTML = `
      <button id="ow-card-x" class="panel-x" aria-label="Close">×</button>
      <div class="ow-card-head">${iconSvg(node.starter ? 'keep' : ICON[node.kind], 30)}<b>${esc(p.title)}</b></div>
      <p>${esc(blurb)}</p>
      <div class="ow-chips">${mods}${mult}</div>
      <p class="ow-reward">${esc(p.reward)}</p>
      ${node.kind === 'muster' ? '' : '<div id="ow-deploy"></div>'}
      <button id="ow-ride" class="primary">Ride</button>`;
    this.renderDeploy();
    // Away from the node: a card at the bottom covered the very node it was about.
    const b = this.nodesEl.querySelector(`[data-id="${node.id}"]`);
    this.card.classList.toggle('top', !!b && parseFloat(b.style.top) > 50);
    this.card.classList.remove('hidden');
  }

  // #257: WHO GOES IN. A row per kind the roster holds, with the count going and a step either side,
  // eight at most (CFG.raids.allies.deploy). It starts on the last castle's choice, so a player who
  // never touches it is sent the same way every time and one who does is not asked twice.
  renderDeploy() {
    const box = this.card.querySelector('#ow-deploy');
    if (!box || !this.director) return;
    const run = this.run;
    const have = counts(run);
    if (!run.roster.length) { box.innerHTML = ''; return; }
    const plan = this.director.planFor();
    const cap = CFG.raids.allies.deploy;
    const going = plan.wren + plan.swordsman + plan.archer;
    const rows = ['wren', 'swordsman', 'archer'].filter((k) => have[k]).map((k) => {
      const K = KIND[k];
      return `<div class="ow-row"><span class="ow-kind">${iconSvg(K.icon, 22)}${k === 'wren' ? 'Wren' : `${have[k]} ${have[k] === 1 ? K.one : K.many}`}</span>
        <span class="ow-step"><button data-kind="${k}" data-step="-1" aria-label="Fewer ${K.many}" ${plan[k] ? '' : 'disabled'}>−</button><b>${plan[k]}</b><button data-kind="${k}" data-step="1" aria-label="More ${K.many}" ${plan[k] < have[k] && going < cap ? '' : 'disabled'}>+</button></span></div>`;
    }).join('');
    box.innerHTML = `<p class="ow-deploy-head">Into the castle: <b>${going} of ${cap}</b></p>${rows}<p class="ow-note">Anyone who falls there is gone for the run.</p>`;
  }

  stepPlan(kind, by) {
    const plan = { ...this.director.planFor() };
    plan[kind] = (plan[kind] || 0) + by;
    this.director.setPlan(plan);
    this.renderDeploy();
  }

  // #257: THE REWARD. One choice, one tap, then the map (spec section 6). The option the node's map
  // card promised is marked, because it is the one that pays more.
  showReward(run, R, onPick) {
    this.run = run;
    this.onPick = onPick;
    this.render();
    this.closeCard();
    const promised = '<span class="chip ok">Promised</span>';
    const opt = (pick, icon, title, sub, mark) => `<button class="ow-opt" data-pick="${pick}">${iconSvg(icon, 30)}<span><b>${esc(title)}</b><small>${esc(sub)}</small></span>${mark ? promised : ''}</button>`;
    const opts = [
      opt('men', 'person', `${menWord(R.men)}`, 'Swordsmen and archers join the roster', R.kind === 'allies'),
      ...R.cards.map((c) => opt(c.id, c.icon, c.name, c.desc, R.kind === 'card')),
      opt('coin', 'coin', `${R.coin} coin`, 'Into the war chest, for the next muster', R.kind === 'chest'),
    ];
    if (R.wren) opts.push(opt('wren', 'tiara', 'Wren', 'She rides with you. When they close on her, she can hold them fast.', false));
    const lost = R.fell ? `${R.fell} of ${R.sent} who went in fell, and are gone for the run.` : R.sent ? `All ${R.sent} who went in came back.` : '';
    this.rewardEl.innerHTML = `<h1>The castle holds</h1>${lost ? `<p class="ow-note">${esc(lost)}</p>` : ''}<p>Choose one.</p><div class="ow-opts">${opts.join('')}</div>`;
    this.el.querySelector('#ow-hint').textContent = '';
    this.rewardEl.classList.remove('hidden');
    this.el.classList.remove('hidden');
  }

  // #257: THE MUSTER. The chest, what it buys, and one way out. Nothing is repaired here (decision 1).
  showMuster(run, stock, handlers) {
    this.run = run;
    this.muster = handlers;
    this.render();
    this.closeCard();
    const label = { swordsman: ['swordsman', 'A swordsman', 'Holds a gap in the wall'], archer: ['archer', 'An archer', 'Kills from behind it'], card: ['star', 'A reward card', 'Choose one of three'], wren: ['tiara', 'Wren', 'Once a run. Her release holds raiders fast'] };
    const rows = stock.items.map((s) => {
      const [icon, title, sub] = label[s.item];
      return `<div class="ow-buy">${iconSvg(icon, 28)}<span><b>${esc(title)}</b><small>${esc(s.ok ? sub : s.why || sub)}</small></span><button data-buy="${s.item}" ${s.ok ? '' : 'disabled'}>${iconSvg('coin', 16)}${s.price}</button></div>`;
    }).join('');
    const cards = stock.cards ? `<p class="ow-deploy-head">Choose one</p><div class="ow-opts">${stock.cards.map((c) => `<button class="ow-opt" data-buy="${c.id}">${iconSvg(c.icon, 30)}<span><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></span></button>`).join('')}</div>` : '';
    const have = counts(run);
    const roster = `${menWord(have.swordsman + have.archer)}${have.wren ? ' and Wren' : ''} of ${CFG.raids.allies.cap}`;
    this.musterEl.innerHTML = `<h1>Muster</h1><p class="ow-stats">${iconSvg('coin', 18)} ${run.chest} in the chest · ${esc(roster)}</p>${rows}${cards}<button id="ow-leave" class="primary">Ride on</button>`;
    this.el.querySelector('#ow-hint').textContent = '';
    this.musterEl.classList.remove('hidden');
    this.el.classList.remove('hidden');
  }

  closeCard() {
    this.cardNode = null;
    if (this.card) this.card.classList.add('hidden');
  }

  // The token walks the path, then the director stands the castle. Under a second, and never twice.
  rideTo(node) {
    if (!node || this.riding || !this.isLit(node)) return;
    this.riding = true;
    this.closeCard();
    const b = this.nodesEl.querySelector(`[data-id="${node.id}"]`);
    if (b) this.placeKing({ x: parseFloat(b.style.left), y: parseFloat(b.style.top) }, true);
    setTimeout(() => {
      this.riding = false;
      if (this.onRide) this.onRide(node.id);
    }, RIDE_MS);
  }

  // The run is over. R6 builds the full death screen (score by castle, the gap to your best); this is
  // the minimum that says what happened and puts the next run one tap away.
  showFallen(run, node, onAgain) {
    this.run = run;
    this.onAgain = onAgain;
    this.render();
    const where = node ? nodePreview(node).title.toLowerCase() : 'the road';
    this.fallen.querySelector('#ow-fallen-where').textContent = `at the ${where} in region ${(node ? node.region : 0) + 1}`;
    this.el.querySelector('#ow-hint').textContent = '';
    this.fallen.querySelector('#ow-fallen-stats').textContent = `${run.cleared} castle${run.cleared === 1 ? '' : 's'} cleared · ${run.score.toLocaleString()} score`;
    this.fallen.classList.remove('hidden');
    this.el.classList.remove('hidden');
  }
}
