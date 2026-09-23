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
import { iconSvg } from './icons.js';

const ICON = { castle: 'castle', fortress: 'tower', muster: 'banner', boss: 'skull' };
const RIDE_MS = 650;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Overworld {
  constructor(el) {
    this.el = el;
    this.nodesEl = el.querySelector('#ow-nodes');
    this.paths = el.querySelector('#ow-paths');
    this.king = el.querySelector('#ow-king');
    this.card = el.querySelector('#ow-card');
    this.fallen = el.querySelector('#ow-fallen');
    this.king.innerHTML = iconSvg('crown', 30);
    this.lit = new Set();
    this.riding = false;
    this.nodesEl.addEventListener('click', (e) => {
      const b = e.target.closest('.ow-node');
      if (b) this.tap(b.dataset.id);
    });
    this.card.addEventListener('click', (e) => {
      if (e.target.closest('#ow-ride')) this.rideTo(this.cardNode);
      else if (e.target.closest('#ow-card-x')) this.closeCard();
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
    this.el.querySelector('#ow-sub').textContent = `${run.cleared} cleared · ${run.score.toLocaleString()} score`;
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
      <button id="ow-ride" class="primary">Ride</button>`;
    // Away from the node: a card at the bottom covered the very node it was about.
    const b = this.nodesEl.querySelector(`[data-id="${node.id}"]`);
    this.card.classList.toggle('top', !!b && parseFloat(b.style.top) > 50);
    this.card.classList.remove('hidden');
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
