// What the player sees that is not a character: the fog of war, the minimap, the time of day, the
// camera, and the effects, popups and coins that decorate it. Also the resource nodes, which are
// scenery until they are mined. Everything here is attached to Game.prototype; see game.js.
import * as THREE from 'three';
import { CFG, PADS, TIERS } from './config.js';
import { audio } from './audio.js';
import { UPGRADES } from './upgrades.js';
import { readScores } from './scores.js';
import {
  makeLumberTree, makeOreRock, makeIronSeam, makeGemNode, makeResourceCube, RES_MATS, CHIP_GEO, makeTool, drawPad, disposeHealthBar, makePopup, makeTag, makeHeap, makeSpawnFx, makeBurst, makeHeart, COIN_TIER_COLORS,
} from './models.js';
import { tmp, tmp2, tmpM, cap, rand } from './game-shared.js';

export const ViewMethods = {
  // ---------- fog of war ----------
  buildFog() {
    const size = CFG.world.size;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 14;
    plane.renderOrder = 5;
    plane.frustumCulled = false;
    this.scene.add(plane);
    this.fog = { canvas, tex, plane, scale: 256 / size, half: size / 2 };
    // minimap terrain layer, drawn once
    const mm = document.createElement('canvas');
    mm.width = 256;
    mm.height = 256;
    const ctx = mm.getContext('2d');
    ctx.fillStyle = '#4aa566';
    ctx.fillRect(0, 0, 256, 256);
    const sc = this.fog.scale;
    const tx = (x) => (x + this.fog.half) * sc;
    const tz = (z) => (z + this.fog.half) * sc;
    ctx.fillStyle = '#5b5f63';
    ctx.fillRect(0, 0, tx(CFG.cliffs.x), tz(CFG.cliffs.z));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const poly = (pts, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(tx(p.x), tz(p.z)) : ctx.moveTo(tx(p.x), tz(p.z))));
      ctx.stroke();
    };
    poly(this.world.river.samples, '#d8cc9d', 12);
    poly(this.world.river.samples, '#3d9bd4', 9);
    this.fog.terrain = mm;
    this.fog.poly = poly;
    this.fog.tx = tx;
    this.fog.tz = tz;
  },

  resetFog() {
    const { canvas } = this.fog;
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(38, 42, 48, 0.92)';
    ctx.fillRect(0, 0, 256, 256);
    const b = TIERS[0].bounds;
    this.revealFog((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 26);
  },

  revealFog(x, z, r) {
    const { canvas, tex, tx, tz, scale } = this.fog;
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'destination-out';
    const cx = tx(x);
    const cz = tz(z);
    const rr = r * scale;
    const g = ctx.createRadialGradient(cx, cz, rr * 0.55, cx, cz, rr);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cz, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    tex.needsUpdate = true;
  },

  updateFog(dt) {
    this.fogTimer -= dt;
    if (this.fogTimer > 0) return;
    this.fogTimer = 0.25;
    const kp = this.king.mesh.position;
    if (kp.distanceTo(this.lastFogPos) > 1.5) {
      this.lastFogPos.copy(kp);
      this.revealFog(kp.x, kp.z, 17);
    }
    this.minimapTimer -= 0.25;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.5;
      this.drawMinimap();
    }
  },

  drawMinimap(force) {
    const el = this.hud.minimap;
    if (!el) return;
    const big = el.classList.contains('big');
    const ctx = el.getContext('2d');
    const { canvas: fogCanvas, terrain, tx, tz, poly } = this.fog;
    ctx.clearRect(0, 0, 160, 160);
    ctx.save();
    ctx.scale(160 / 256, 160 / 256);
    ctx.drawImage(terrain, 0, 0);
    for (const r of this.world.roads) if (r.revealed) poly(r.samples, '#d9b27c', 4);
    // village
    const b = TIERS[this.tier].bounds;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(tx(b.x0), tz(b.z0), (b.x1 - b.x0) * this.fog.scale, (b.z1 - b.z0) * this.fog.scale);
    // resource nodes
    for (const n of this.nodes) {
      ctx.fillStyle = n.type === 'wood' ? '#8a5a2b' : n.type === 'stone' ? '#c7d2dc' : '#e0c25a';
      ctx.beginPath();
      ctx.arc(tx(n.pos.x), tz(n.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // fog mask on top
    ctx.drawImage(fogCanvas, 0, 0);
    // enemies (only in explored areas read from the fog alpha)
    const fctx = fogCanvas.getContext('2d');
    ctx.fillStyle = '#e8342a';
    for (const e of this.enemies) {
      const px = tx(e.mesh.position.x);
      const pz = tz(e.mesh.position.z);
      const a = fctx.getImageData(Math.max(0, Math.min(255, px | 0)), Math.max(0, Math.min(255, pz | 0)), 1, 1).data[3];
      if (a > 200) continue;
      ctx.beginPath();
      ctx.arc(px, pz, e.type === 'boss' ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // king
    const kp = this.king.mesh.position;
    ctx.fillStyle = '#f5b800';
    ctx.strokeStyle = '#1b1b24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx(kp.x), tz(kp.z), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },

  // Slow day cycle across waves: morning, noon, golden evening, dusk, then dawn again every 12 waves.
  updateDaylight(dt) {
    // One cycle: dawn, morning, noon, golden evening, then nightfall at CFG.cycle.nightStart (0.6).
    // #27: night stays cool and moonlit, never truly dark. A playtester could not read the field
    // after nightfall, so the night keys carry more light than the scene wants for realism: this is
    // a game you have to fight in at night, and losing sight of the raiders is not a fair difficulty.
    const blood = this.night && this.wave > 0 && this.wave % CFG.waves.bossEvery === 0;
    const keys = blood ? [
      { p: 0.0, sun: 0xfff1d6, sunI: 1.3, sky: 0xfff8ea, ground: 0x8fb86a, fog: 0x6cbd55, exp: 1.22, h: 34, tint: 0xffffff },
      { p: 0.3, sun: 0xffffff, sunI: 1.42, sky: 0xffffff, ground: 0x9ec97a, fog: 0x74c45c, exp: 1.26, h: 42, tint: 0xffffff },
      { p: 0.52, sun: 0xffb36a, sunI: 1.25, sky: 0xffd9b0, ground: 0x7a9a5a, fog: 0x6fae4f, exp: 1.15, h: 20, tint: 0xffe4c8 },
      { p: 0.62, sun: 0xff7a5a, sunI: 1.0, sky: 0xffb0a0, ground: 0x7a4a42, fog: 0x8a4038, exp: 1.06, h: 14, tint: 0xffc8be },
      { p: 0.74, sun: 0xff8a76, sunI: 1.0, sky: 0xe09a90, ground: 0x7a4040, fog: 0x8f3a34, exp: 1.06, h: 11, tint: 0xf5bdb2 },
      { p: 0.94, sun: 0xff8a76, sunI: 1.0, sky: 0xe09a90, ground: 0x7a4040, fog: 0x8f3a34, exp: 1.06, h: 11, tint: 0xf5bdb2 },
      { p: 1.0, sun: 0xfff1d6, sunI: 1.3, sky: 0xfff8ea, ground: 0x8fb86a, fog: 0x6cbd55, exp: 1.22, h: 34, tint: 0xffffff },
    ] : [
      { p: 0.0, sun: 0xfff1d6, sunI: 1.3, sky: 0xfff8ea, ground: 0x8fb86a, fog: 0x6cbd55, exp: 1.22, h: 34, tint: 0xffffff },
      { p: 0.3, sun: 0xffffff, sunI: 1.42, sky: 0xffffff, ground: 0x9ec97a, fog: 0x74c45c, exp: 1.26, h: 42, tint: 0xffffff },
      { p: 0.52, sun: 0xffb36a, sunI: 1.25, sky: 0xffd9b0, ground: 0x7a9a5a, fog: 0x6fae4f, exp: 1.15, h: 20, tint: 0xffe4c8 },
      { p: 0.62, sun: 0xc9b6ff, sunI: 1.06, sky: 0xc3ccf8, ground: 0x5c7686, fog: 0x4e828a, exp: 1.08, h: 14, tint: 0xd8dcf7 },
      { p: 0.74, sun: 0xa8bcff, sunI: 0.92, sky: 0x9fb0e8, ground: 0x44607e, fog: 0x3c6389, exp: 1.02, h: 11, tint: 0xc0ccec },
      { p: 0.94, sun: 0xa8bcff, sunI: 0.92, sky: 0x9fb0e8, ground: 0x44607e, fog: 0x3c6389, exp: 1.02, h: 11, tint: 0xc0ccec },
      { p: 1.0, sun: 0xfff1d6, sunI: 1.3, sky: 0xfff8ea, ground: 0x8fb86a, fog: 0x6cbd55, exp: 1.22, h: 34, tint: 0xffffff },
    ];
    // dayPhase is advanced by updateWaves, which owns the clock; this only paints it
    const ph = this.dayPhase;
    let a = keys[0];
    let b = keys[1];
    for (let i = 0; i < keys.length - 1; i++) if (ph >= keys[i].p && ph <= keys[i + 1].p) {
      a = keys[i];
      b = keys[i + 1];
    }
    const t = (ph - a.p) / Math.max(1e-6, b.p - a.p);
    const lerpC = (c1, c2) => this._dc1.setHex(c1).lerp(this._dc2.setHex(c2), t);
    this._dc1 = this._dc1 || new THREE.Color();
    this._dc2 = this._dc2 || new THREE.Color();
    this.sun.color.copy(lerpC(a.sun, b.sun));
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    this.hemi.color.copy(lerpC(a.sky, b.sky));
    this.hemi.groundColor.copy(lerpC(a.ground, b.ground));
    this.scene.fog.color.copy(lerpC(a.fog, b.fog));
    this.scene.background.copy(this.scene.fog.color);
    this.renderer.toneMappingExposure = a.exp + (b.exp - a.exp) * t;
    this.sunHeight = a.h + (b.h - a.h) * t;
    if (this.world.groundMat) this.world.groundMat.color.copy(lerpC(a.tint, b.tint));
    // #81: rain sits ON TOP of the day rather than beside it. Both want the same lights every frame,
    // so the shower is a blend applied after the day has been painted -- the sun fades toward a flat
    // cold grey, the sky lifts to make up for it (an overcast day is flatter than a clear one, not
    // darker: the light arrives from everywhere instead of from one place), the fog closes in, the
    // hard shadow goes, and the grass goes wet. At level 0 every multiplier is 1 and every lerp is 0,
    // so the day gets back exactly what it asked for with nothing to undo by hand. It composes with
    // the blood moon for free, which is worth seeing.
    //
    // The keys are inline rather than in CFG because the day's own key table is, three lines up: the
    // colour of the sky is this function's business and splitting it across two files would mean
    // reading both to know what any one frame looks like.
    //
    // Four of these the day never writes -- the hemisphere's intensity, both ends of the fog and the
    // shadow -- so they are put back from `this.dry` rather than recomputed, and `wasWet` is what
    // runs this one last time on the frame the rain ends. Without that latch the sky stayed shut in
    // for the rest of the run: the block stopped running the moment there was no rain left to apply.
    //
    // The fog is the load-bearing one and it took a screenshot to see why. A first pass faded the sun
    // by half, lifted the sky and tinted the grass, and the shot came back as a bright green meadow
    // with white sticks falling on it -- because the fog starts at 42 and the camera never sees past
    // about 45, so the ONLY part of the sky the player can see is the ground. Pulling `near` in to 20
    // is what puts grey air between the camera and the far trees, and that is the whole difference
    // between weather and a particle effect. It cannot come much closer: the camera sits about 21
    // from the King, so at 20 he is already picking up the first few per cent of it.
    const w = this.world.rain.level;
    if (w > 0 || this.wasWet) {
      this.wasWet = w > 0;
      const c = this._rc || (this._rc = new THREE.Color());
      this.sun.intensity *= 1 - 0.6 * w;
      this.sun.color.lerp(c.setHex(0xcdd6e0), w * 0.8);
      this.hemi.intensity = this.dry.hemi * (1 + 0.25 * w);
      this.hemi.color.lerp(c.setHex(0xb2bfcb), w * 0.8);
      this.hemi.groundColor.lerp(c.setHex(0x5b6d64), w * 0.6);
      this.scene.fog.color.lerp(c.setHex(0x9aa8ad), w * 0.85);
      this.scene.background.copy(this.scene.fog.color);
      this.scene.fog.near = this.dry.fogNear - (this.dry.fogNear - 20) * w;
      this.scene.fog.far = this.dry.fogFar - (this.dry.fogFar - 58) * w;
      this.renderer.toneMappingExposure *= 1 - 0.16 * w;
      this.sun.shadow.intensity = this.dry.shadow * (1 - 0.8 * w);
      if (this.world.groundMat) this.world.groundMat.color.lerp(c.setHex(0x93a5a8), w * 0.5);
    }
  },

  updateCamera(dt) {
    const kp = this.king.mesh.position;
    const d = this.camDist;
    tmp.set(kp.x, d * 0.92, kp.z + d * 0.8);
    if (this.shake > 0) {
      this.shake -= dt;
      tmp.x += (Math.random() - 0.5) * 0.5;
      tmp.z += (Math.random() - 0.5) * 0.5;
    }
    this.camera.position.lerp(tmp, 1 - Math.exp(-dt * 6));
    tmp2.set(kp.x, 0, kp.z - 2);
    this.camera.lookAt(tmp2);
    this.sun.position.set(kp.x + 18 + (34 - this.sunHeight) * 0.6, this.sunHeight, kp.z + 12 + (34 - this.sunHeight) * 0.4);
    this.sun.target.position.set(kp.x, 0, kp.z);
  },

  // The King gathers wood, stone and straw by standing next to a node.
  updateMining(dt) {
    const kp = this.king.mesh.position;
    this.mineTimer -= dt;
    // #81: rain waters what grows. The bonus is scaled by how hard it is falling rather than switched
    // on, so a shower fading in and out carries it in and out with it and there is no frame where a
    // tree suddenly changes pace. Nothing else moves: setNodeLook already fills a tree back in as it
    // regrows, so the whole visual is the existing one running three times faster.
    const wet = 1 + (CFG.rain.regrow - 1) * this.world.rain.level;
    for (const n of this.nodes) {
      if (n.stock < n.max) {
        n.regrow += n.living ? dt * wet : dt;
        if (n.regrow >= CFG.mining.regrow) {
          n.regrow = 0;
          n.stock++;
          this.setNodeLook(n);
        }
      }
    }
    let best = null;
    let bd = CFG.mining.radius + 1.5;
    for (const n of this.nodes) {
      if (!n.open) continue;
      const d = kp.distanceTo(n.pos) - (n.type === 'straw' ? 4 : 0);
      if (d < bd && n.stock > 0) {
        bd = d;
        best = n;
      }
    }
    // highlight ring around the node in range
    if (best) {
      this.nodeRing.visible = true;
      this.nodeRing.position.set(best.pos.x, 0.05, best.pos.z);
      const r = (best.type === 'straw' ? 2.2 : 1) * (1 + Math.sin(this.time * 5) * 0.04);
      this.nodeRing.scale.setScalar(r);
    } else this.nodeRing.visible = false;
    // tool swing animation
    if (this.swing > 0) {
      this.swing -= dt;
      const t = 1 - Math.max(0, this.swing / CFG.mining.tick);
      if (this.tool) this.tool.rotation.x = -1.3 + Math.sin(t * Math.PI) * 2.0;
      if (this.swing <= 0 && this.tool) this.tool.visible = false;
    }
    if (this.mineTimer > 0 || !best) return;
    // harder rock is slower per swing and pays more per unit: that trade is the only reason to walk
    // out to the iron and the diamonds now that nothing requires them
    this.mineTimer = (CFG.materials[best.type] || CFG.mining).mine / this.mods.mineSpeed;
    best.stock--;
    this.setNodeLook(best);
    audio.mine(best.type);
    if (this.king.mesh.userData.body) this.king.mesh.userData.body.rotation.x = 0.35;
    else if (this.king.mesh.userData.rig) {
      this.king.mesh.userData.rig.play('Attack', true);
      this.king.rigOnce = this.time + 0.5;
    }
    // tool in hand, matching the material
    if (!this.tool || this.toolType !== best.type || this.tool.parent !== this.king.mesh) {
      if (this.tool && this.tool.parent) this.tool.parent.remove(this.tool);
      this.tool = makeTool(best.type);
      this.toolType = best.type;
      this.tool.position.set(0.42, this.mounted ? 1.5 : 0.62, 0.25);
      this.king.mesh.add(this.tool);
    }
    this.tool.visible = true;
    this.swing = CFG.mining.tick;
    this.faceTowards(this.king.mesh, best.pos, 1, 60);
    // the node shakes and throws chips
    if (best.type !== 'straw') best.shake = 0.3;
    this.throwChips(best.type, best.type === 'straw' ? kp : best.pos);
    this.addToPile(best);
  },

  // A handful of the material, thrown off whatever is being worked. Straw comes off the reaper rather
  // than off the field, so the caller says where; #48 gave the villagers the same call.
  throwChips(type, at, n = 5) {
    if (this.chips.length > 90) return;
    const colour = type === 'wood' ? 0x9a6a3a : type === 'stone' ? 0xa9aeb5 : 0xe0c25a;
    for (let i = 0; i < n; i++) {
      const ch = new THREE.Mesh(CHIP_GEO, RES_MATS[type]);
      ch.position.copy(at).setY(0.9);
      ch.position.x += rand(-0.4, 0.4);
      ch.position.z += rand(-0.4, 0.4);
      this.root.add(ch);
      this.chips.push({ mesh: ch, vx: rand(-3, 3), vz: rand(-3, 3), vy: rand(3, 6), t: 0.7, color: colour });
    }
  },

  // ---------- piles ----------
  // What comes out of a node flies into a heap beside it and stays there. The flight is the point:
  // it is what tells you the material went somewhere rather than into a counter, and the heap
  // swelling as each piece lands is what says come and get this.
  addToPile(node) {
    if (!node.pile) {
      const g = makeHeap(node.type);
      g.position.copy(node.pos);
      // On the far side of the node from whoever is working it, and outside the mining radius. Both
      // matter: inside it, the heap is picked up on the frame it appears so it is never seen, and
      // standing on it to collect would start you mining again instead.
      const a = Math.atan2(this.king.mesh.position.z - node.pos.z, this.king.mesh.position.x - node.pos.x) + Math.PI;
      g.position.x += Math.cos(a) * (CFG.mining.radius + 0.9);
      g.position.z += Math.sin(a) * (CFG.mining.radius + 0.9);
      g.scale.setScalar(0.01);
      this.root.add(g);
      node.pile = { mesh: g, count: 0, type: node.type, bump: 0, node };
      this.piles.push(node.pile);
    }
    // one chunk, thrown from the rock to the heap. It lands in updatePileFlies, and only then does
    // the heap count it, so the number and the thing you can see always agree.
    const c = makeResourceCube(node.type);
    c.scale.setScalar(0.5);
    c.position.copy(node.pos).setY(1.1);
    this.root.add(c);
    this.pileFlies.push({ mesh: c, pile: node.pile, t: 0, from: c.position.clone(), spin: rand(-8, 8) });
  },

  updatePileFlies(dt) {
    for (let i = this.pileFlies.length - 1; i >= 0; i--) {
      const f = this.pileFlies[i];
      f.t += dt * 2.6;
      const to = f.pile.mesh.position;
      const k = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, to, k);
      f.mesh.position.y = f.from.y * (1 - k) + 0.5 * k + Math.sin(k * Math.PI) * 1.5;   // a lobbed arc
      f.mesh.rotation.y += f.spin * dt;
      f.mesh.rotation.x += f.spin * 0.6 * dt;
      if (k < 1) continue;
      this.root.remove(f.mesh);
      this.pileFlies.splice(i, 1);
      if (!this.piles.includes(f.pile)) continue;   // the heap was collected while this was in the air
      f.pile.count++;
      f.pile.bump = 0.22;
      audio.mine(f.pile.type);
    }
  },

  // #88: where a point in the world sits on the screen, for a HUD animation that has to start at a
  // thing the player is looking at. The same projection the edge indicators use, in absolute pixels
  // rather than as an offset from the centre -- the canvas is `position: fixed; inset: 0`, so canvas
  // pixels and viewport pixels are the same pixels.
  screenPoint(v) {
    const { w, h } = this.viewSize();
    const p = this._proj || (this._proj = v.clone());
    p.copy(v).project(this.camera);
    if (p.z >= 1) return null;          // behind the camera: nothing on screen to fly from
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
  },

  flyToBag(worldPos, type) {
    const s = this.screenPoint(worldPos);
    if (s) this.hud.flyToBag(s.x, s.y, type);
  },

  // The count only shows when he is close enough to care, which is the whole reason the numbers came
  // off the status bar: the information is at the heap, where you are looking.
  updatePiles(dt) {
    const kp = this.king.mesh.position;
    const cap = this.loadCap();
    for (let i = this.piles.length - 1; i >= 0; i--) {
      const p = this.piles[i];
      // the heap grows with what is in it, and pops each time a piece lands
      p.bump = Math.max(0, p.bump - dt * 3);
      // big enough to be a landmark you walk towards: about waist height on the King when it holds a
      // load, rather than something you step over without noticing
      const grown = 0.78 + Math.min(p.count, 24) * 0.028;
      p.mesh.scale.setScalar(grown * (1 + p.bump));
      const d = Math.hypot(kp.x - p.mesh.position.x, kp.z - p.mesh.position.z);
      const near = d < CFG.pile.showRadius;
      const want = near ? `${p.count} ${CFG.materials[p.type].name}` : null;
      if (want !== p.labelText) {
        if (p.label) {
          this.root.remove(p.label);
          p.label.material.dispose();
          p.label = null;
        }
        p.labelText = want;
        if (want) {
          p.label = makeTag(want);
          p.label.position.copy(p.mesh.position).setY(1.35 + grown);
          this.root.add(p.label);
        }
      } else if (p.label) {
        p.label.position.y = 1.35 + grown + Math.sin(this.time * 2.4) * 0.06;
      }
      // close enough to scoop it up, and only as much as he can still carry
      if (d < CFG.pile.pickRadius && p.count > 0) {
        const room = cap - this.loadTotal();
        if (room <= 0) {
          if (this.time - (this.fullAt || 0) > 4) {
            this.fullAt = this.time;
            this.hud.toast(this.tradePost ? 'Your bag is full. Sell at the trade post.'
              : 'Your bag is full. Build the Trade Post to sell what you have mined.', 2800, 'Bag');
          }
          continue;
        }
        const take = Math.min(room, p.count);
        p.count -= take;
        this.res[p.type] += take;
        audio.coin(0);
        tmp.copy(p.mesh.position).setY(1.1);
        this.popup(`+${take}`, tmp, '#e8d9a0', 0.9, p, take, '+');
        this.flyToBag(tmp, p.type);      // #88: and it visibly goes somewhere
      }
      if (p.count <= 0 && !this.pileFlies.some((f) => f.pile === p)) {
        if (p.label) {
          this.root.remove(p.label);
          p.label.material.dispose();
        }
        this.root.remove(p.mesh);
        if (p.node) p.node.pile = null;
        this.piles.splice(i, 1);
      }
    }
  },

  // ---------- the trade post ----------
  // Walk in with a load and walk out with coin. This is the only place materials become money, so it
  // is the only number the HUD has to carry.
  updateTrade(dt) {
    if (!this.tradePost || !this.tradePos) return;
    const kp = this.king.mesh.position;
    const d = Math.hypot(kp.x - this.tradePos[0], kp.z - this.tradePos[1]);
    if (d > CFG.trade.radius || this.loadTotal() <= 0) return;
    this.tradeTimer = (this.tradeTimer || 0) - dt;
    if (this.tradeTimer > 0) return;
    this.tradeTimer = 0.09;
    // one unit at a time, so it reads as a counter paying out rather than a number jumping
    const type = Object.keys(this.res).find((k) => this.res[k] > 0);
    if (!type) return;
    this.res[type]--;
    const paid = CFG.materials[type].coin;
    this.coinsCarried += paid;
    this.coinsEarned += paid;
    this.addScore(CFG.score.material);
    audio.ching();
    tmp.set(this.tradePos[0], 1.9, this.tradePos[1]);
    this.popup(`+${paid}`, tmp, '#ffd23f', 1.4, null, 0, '+');
  },

  makeNodeMesh(type) {
    if (type === 'wood') return makeLumberTree();
    if (type === 'stone') return makeOreRock();
    if (type === 'iron') return makeIronSeam();
    if (type === 'diamond') return makeGemNode();
    return new THREE.Group();
  },

  // A new material becomes mineable: its nodes appear across the map with a toast saying where.
  // `announce` is off when something else is already telling the player: a level-up puts the same
  // sentence on its modal (#99), and a toast fired in that tick is drawn underneath it.
  revealNodes(announce = true) {
    const opened = new Set();
    for (const n of this.nodes) {
      if (n.open || this.baseLevel < n.from) continue;
      n.open = true;
      opened.add(n.type);
      if (n.type !== 'straw') {
        this.root.add(n.mesh);
        this.popIn(n.mesh, Math.random() * 0.4);
      }
    }
    if (announce) for (const type of opened) {
      const where = CFG.base.nodeName[type] || cap(type);
      this.hud.toast(`${where} are open. Look for them on the map.`, 3200, 'Bag');
    }
    return opened.size > 0;
  },

  setNodeLook(n) {
    // #45: straw has no node mesh -- it is cut off the wheat field it stands on -- so the field
    // thins out instead, and fills back in as the node regrows.
    if (n.type === 'straw') return this.world.cutField(n.pos.x, n.pos.z, n.stock / n.max);
    const f = 0.45 + 0.55 * (n.stock / n.max);
    n.mesh.scale.setScalar(f);
  },

  updateChips(dt) {
    for (const n of this.nodes) {
      if (n.shake > 0) {
        n.shake -= dt;
        n.mesh.rotation.z = Math.sin(n.shake * 40) * 0.08 * n.shake;
        if (n.shake <= 0) n.mesh.rotation.z = 0;
      }
    }
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const c = this.chips[i];
      c.t -= dt;
      c.vy -= 18 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.position.y = Math.max(0.08, c.mesh.position.y + c.vy * dt);
      c.mesh.rotation.x += dt * 9;
      if (c.t <= 0) {
        this.root.remove(c.mesh);
        this.chips.splice(i, 1);
      }
    }
  },

  // Take every loose coin off the field without collecting it. reset() scatters the starting purse
  // along the road west to teach the pickup rule without a word; a run being restored has been
  // taught, and those ten would be a free handful on every reload.
  clearGroundCoins() {
    for (const c of this.coins) this.root.remove(c.mesh);
    this.coins.length = 0;
    if (this.coinField) this.coinField.update(this.coins);
  },

  dropCoin(pos, tier = this.coinTier()) {
    // An empty Object3D, not a coin: CoinField draws every coin on the field in two instanced calls
    // and reads this for where to put each one. Everything below moves it exactly as it moved a mesh.
    const c = new THREE.Object3D();
    c.position.copy(pos);
    c.position.y = 0.6;
    this.root.add(c);
    const a = rand(0, Math.PI * 2);
    const s = rand(1.5, 4.5);
    this.coins.push({ mesh: c, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rand(4, 7), state: 'drop', t: 0, tier });
  },

  // the coin tier (look and score value) climbs with the Keep
  // one currency, one colour; what the Keep changes is what a coin is worth
  coinTier() {
    return 'gold';
  },

  coinValue() {
    let v = CFG.coins.value[0];
    CFG.coins.valueAt.forEach((lv, i) => { if (this.baseLevel >= lv) v = CFG.coins.value[i]; });
    return v;
  },

  stackCount() {
    return Math.min(this.coinsCarried, this.stack.length);
  },

  // Where the first coin sits: just clear of the King's crown. On a horse that crown is most of a
  // body higher, and the old fixed 2.4 put the bottom of the stack inside his head once he mounted.
  // Same two heights the health bar uses in spawnUnit.
  stackBase() {
    return this.mounted ? 3.2 : 2.4;
  },

  updateCoins(dt) {
    const kp = this.king.mesh.position;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      const p = c.mesh.position;
      c.t += dt;
      if (c.state === 'drop') {
        c.vy -= 22 * dt;
        p.x += c.vx * dt;
        p.z += c.vz * dt;
        p.y += c.vy * dt;
        c.mesh.rotation.y += dt * 6;
        if (p.y <= 0.12) {
          p.y = 0.12;
          if (Math.abs(c.vy) > 2) c.vy = -c.vy * 0.35;
          else {
            c.state = 'ground';
            c.vx = c.vz = 0;
          }
          c.vx *= 0.6;
          c.vz *= 0.6;
        }
      } else if (c.state === 'ground') {
        c.mesh.rotation.y += dt * 2;
        p.y = 0.12 + Math.sin(c.t * 4) * 0.04;
        // #103: the circle the player can see, not a second number that happened to be near it
        if (p.distanceTo(kp) < this.ringRadius) c.state = 'fly';
      } else {
        tmp.copy(kp);
        tmp.y = this.stackBase() + this.stackCount() * 0.11;
        p.lerp(tmp, 1 - Math.exp(-dt * 14));
        if (p.distanceTo(tmp) < 0.5) {
          if (c.resType) {
            this.res[c.resType]++;
            this.addScore(CFG.score.material);
          } else {
            this.coinsCarried++;
            this.coinsEarned++;
            this.comboTimer = 0.6;
            this.addScore(this.coinValue());
            audio.coin(this.coinCombo++);
          }
          this.root.remove(c.mesh);
          this.coins.splice(i, 1);
        }
      }
    }
    this.coinField.update(this.coins);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.coinCombo = 0;
    // a sparkle now and then on coins lying about
    this.glintT = (this.glintT || 0) - dt;
    if (this.glintT <= 0) {
      this.glintT = 0.4;
      const ground = this.coins.filter((c) => c.state === 'ground');
      if (ground.length) {
        const c = ground[Math.floor(Math.random() * ground.length)];
        tmp.copy(c.mesh.position).setY(0.45);
        this.burstFx(tmp, '#ffffff', 0.7, 0.35);
      }
    }
    // coins flying from the stack into a pad
    for (let i = this.flyCoins.length - 1; i >= 0; i--) {
      const f = this.flyCoins[i];
      f.t += dt / 0.28;
      const t = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, f.to, t);
      f.mesh.position.y += Math.sin(t * Math.PI) * 1.5;
      f.mesh.rotation.y += dt * 10;
      if (t >= 1) {
        this.root.remove(f.mesh);
        this.flyCoins.splice(i, 1);
        f.pad.paid++;
        this.drawPad(f.pad);
        f.pad.mesh.scale.setScalar(1.08);
        if (this.padPaid(f.pad) && this.pads.includes(f.pad)) this.completePad(f.pad);
      }
    }
    for (let i = this.flyRes.length - 1; i >= 0; i--) {
      const f = this.flyRes[i];
      f.t += dt / 0.3;
      const t = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, f.to, t);
      f.mesh.position.y += Math.sin(t * Math.PI) * 1.4;
      f.mesh.rotation.y += dt * 8;
      if (t >= 1) {
        this.root.remove(f.mesh);
        this.flyRes.splice(i, 1);
        f.row.paid++;
        this.drawPad(f.pad);
        f.pad.mesh.scale.setScalar(1.08);
        if (this.padPaid(f.pad) && this.pads.includes(f.pad)) this.completePad(f.pad);
      }
    }
  },

  updateStack(dt) {
    const kp = this.king.mesh.position;
    const n = this.stackCount();
    const v = this.king.vel;
    const { outer, inner } = this.stackMesh;
    const col = COIN_TIER_COLORS[this.coinTier()];
    const base = this.stackBase();
    for (let i = 0; i < n; i++) {
      const c = this.stack[i];
      outer.setColorAt(i, col[0]);
      inner.setColorAt(i, col[1]);
      // the stack leans against the direction of travel, more the higher it goes
      const lean = 0.004 * Math.min(i, 30);
      tmp.set(kp.x - v.x * lean, base + i * 0.11, kp.z - v.z * lean);
      tmp.x += Math.sin(this.time * 2.5 + i * 0.2) * 0.004 * Math.min(i, 30);
      c.position.lerp(tmp, 1 - Math.exp(-dt * (18 - Math.min(10, i * 0.15))));
      tmpM.makeTranslation(c.position.x, c.position.y, c.position.z);
      outer.setMatrixAt(i, tmpM);
      inner.setMatrixAt(i, tmpM);
    }
    outer.count = inner.count = n;
    outer.instanceMatrix.needsUpdate = inner.instanceMatrix.needsUpdate = true;
    outer.instanceColor.needsUpdate = inner.instanceColor.needsUpdate = true;
  },

  // Mobile blob shadows: one disc per unit / enemy, all in a single instanced draw.
  updateBlobs() {
    const b = this.blobs;
    if (!b) return;
    let i = 0;
    const put = (ent, r) => {
      if (i >= 400 || ent.inKeep) return;
      const p = ent.mesh.position;
      tmpM.makeScale(r, 1, r).setPosition(p.x, 0, p.z);
      b.setMatrixAt(i++, tmpM);
    };
    for (const u of this.units) put(u, 0.5 * (u.scale || 1));
    for (const e of this.enemies) put(e, e.radius * 1.15 + 0.1);
    b.count = i;
    b.instanceMatrix.needsUpdate = true;
  },

  // fiery ring and glowing column when a unit appears
  spawnFx(x, z, color = 0xff9a2e, y = 0) {
    const g = makeSpawnFx(color);
    g.position.set(x, y, z);
    this.root.add(g);
    this.fx.push({ kind: 'spawn', mesh: g, t: 0, life: 1.1 });
  },

  // #10: the rescue gets hearts rather than the generic spawn flourish every purchase uses
  heartFx(pos, n = 10, spread = 1.1) {
    for (let i = 0; i < n; i++) {
      const s = makeHeart();
      s.position.copy(pos);
      s.position.x += rand(-spread, spread);
      s.position.z += rand(-spread, spread);
      s.position.y += rand(0.2, 1.2);
      const size = rand(0.5, 0.95);
      s.scale.setScalar(size);
      this.root.add(s);
      this.fx.push({ kind: 'heart', mesh: s, t: 0, life: rand(1.1, 1.9), size, vy: rand(1.5, 2.8), vx: rand(-0.5, 0.5), vz: rand(-0.5, 0.5), sway: rand(0, 6.3) });
    }
  },

  burstFx(pos, color, size, life) {
    const s = makeBurst(color);
    s.position.copy(pos);
    s.scale.setScalar(size * 0.4);
    this.root.add(s);
    this.fx.push({ kind: 'burst', mesh: s, t: 0, life, size });
  },

  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const p = Math.min(1, f.t / f.life);
      if (f.kind === 'spawn') {
        const { ring, ring2, column, glow, sparks } = f.mesh.userData;
        ring.scale.setScalar(0.4 + p * 1.8);
        ring.material.opacity = 0.95 * (1 - p);
        ring2.scale.setScalar(0.2 + p * 1.1);
        ring2.material.opacity = 0.8 * (1 - p);
        column.scale.set(1 - p * 0.5, 0.2 + Math.sin(p * Math.PI) * 0.9 + 0.1, 1 - p * 0.5);
        column.material.opacity = 0.55 * (1 - p * p);
        glow.material.opacity = 0.45 * (1 - p);
        for (const sp of sparks) {
          sp.position.x += sp.userData.vx * dt;
          sp.position.z += sp.userData.vz * dt;
          sp.position.y += sp.userData.vy * dt;
          sp.userData.vy -= 4 * dt;
          sp.material.opacity = 1 - p;
        }
      } else if (f.kind === 'heart') {
        f.mesh.position.y += f.vy * dt;
        f.mesh.position.x += (f.vx + Math.sin(f.sway + f.t * 3) * 0.5) * dt;
        f.mesh.position.z += f.vz * dt;
        f.vy *= 1 - dt * 0.7;
        f.mesh.scale.setScalar(f.size * (0.4 + Math.min(1, p * 4) * 0.6) * (1 + p * 0.25));
        f.mesh.material.opacity = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75;
      } else {
        f.mesh.scale.setScalar(f.size * (0.4 + p * 0.8));
        f.mesh.material.opacity = 1 - p * p;
      }
      if (p >= 1) {
        this.root.remove(f.mesh);
        this.fx.splice(i, 1);
      }
    }
  },

  // Damage numbers. Hits on the same target within a quarter second merge into one bigger number:
  // a crowd of archers no longer spawns dozens of sprites a second.
  popup(text, pos, color, scale = 1.4, owner = null, value = 0, sign = '-') {
    if (owner) {
      const p = this.popups.find((q) => q.owner === owner && q.t > 0.45);
      if (p) {
        p.value += value;
        const s = makePopup(`${p.sign}${Math.round(p.value)}`, color);
        s.position.copy(p.mesh.position);
        s.scale.copy(p.mesh.scale);
        this.root.remove(p.mesh);
        p.mesh.material.dispose();
        this.root.add(s);
        p.mesh = s;
        p.t = Math.max(p.t, 0.6);
        p.pop = 0.12;   // a fresh squash when it grows, so a merged hit still reads as a hit
        return;
      }
    }
    const s = makePopup(text, color);
    s.position.copy(pos);
    s.position.y += 1.6;
    s.scale.set(scale, scale / 2, 1);
    this.root.add(s);
    // `drift` is seeded per popup so several numbers on one target fan out instead of stacking into
    // a column nobody can read. `base` is what the pop animates around, because the merge path
    // rewrites the mesh and would otherwise lose the size it was born at.
    this.popups.push({ mesh: s, t: 0.7, owner, value, sign, base: scale, drift: rand(-1.1, 1.1), pop: 0.12, rise: 0 });
  },

  // Free GPU resources of a character that left the scene (health-bar texture, skeleton bone texture).
  disposeEntity(mesh) {
    const rig = mesh.userData.rig;
    if (rig) {
      rig.mixer.stopAllAction();
      rig.mixer.uncacheRoot(mesh);
    }
    mesh.traverse((o) => {
      if (o.isHealthBar) disposeHealthBar(o);
      else if (o.isSkinnedMesh) o.skeleton.dispose();
    });
  },

  updateEffects(dt) {
    for (const w of this.walls) if (w.mesh && w.mesh.position.y > 0) w.mesh.position.y = Math.max(0, w.mesh.position.y - dt * 0.4);
    if (this.keep && this.keep.mesh.position.y > 0) this.keep.mesh.position.y = Math.max(0, this.keep.mesh.position.y - dt * 0.4);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t -= dt;
      d.mesh.rotation.x += dt * 4;
      d.mesh.position.y -= dt * 1.5;
      d.mesh.scale.multiplyScalar(1 - dt * 1.5);
      if (d.t <= 0) {
        this.root.remove(d.mesh);
        this.disposeEntity(d.mesh);
        this.dying.splice(i, 1);
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t -= dt;
      // Thrown, not driven: quick off the target and slowing as it goes, which is the shape every
      // other moving thing in this game has.
      const age = 0.7 - p.t;
      const speed = 4.4 * Math.exp(-age * 2.6);
      p.mesh.position.y += dt * speed;
      p.mesh.position.x += dt * p.drift * Math.exp(-age * 2.2);
      // a short squash-and-overshoot on birth, the same curve makeRigged's spawn pop uses
      if (p.pop > 0) {
        p.pop -= dt;
        const s = 1 - Math.max(0, p.pop / 0.12);
        const k = s * (1 + Math.sin(s * Math.PI) * 0.45);
        p.mesh.scale.set(p.base * k, (p.base / 2) * k, 1);
      }
      p.mesh.material.opacity = Math.min(1, p.t * 2.6);
      if (p.t <= 0) {
        this.root.remove(p.mesh);
        p.mesh.material.dispose();
        this.popups.splice(i, 1);
      }
    }
    for (let i = this.popping.length - 1; i >= 0; i--) {
      const o = this.popping[i];
      o.userData.popT -= dt;
      if (o.userData.popT > 0.45) continue;
      o.visible = true;
      const s = 1 - Math.max(0, o.userData.popT / 0.45);
      const base = o.userData.baseScale || 1;
      o.scale.setScalar(Math.max(0.01, base * s * (1 + Math.sin(s * Math.PI) * 0.2)));
      if (o.userData.popT <= 0) {
        o.scale.setScalar(base);
        this.popping.splice(i, 1);
      }
    }
  },

  // Red arrows at the screen edge pointing at off-screen enemies, grouped by direction.
  updateIndicators(dt) {
    this.indicatorTimer -= dt;
    if (this.indicatorTimer > 0) return;
    this.indicatorTimer = 0.1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const bins = new Map();
    const all = [...this.activeEnemies().map((e) => ({ pos: e.mesh.position, boss: e.type === 'boss', thief: e.type === 'thief' })), ...this.spawnQueue.map((s) => ({ pos: { x: s.x, y: 0, z: s.z }, boss: s.type === 'boss' }))];
    for (const it of all) {
      tmp.set(it.pos.x, 1, it.pos.z).project(this.camera);
      const sx = tmp.x * w * 0.5;
      const sy = -tmp.y * h * 0.5;
      if (Math.abs(sx) < w * 0.5 - 30 && Math.abs(sy) < h * 0.5 - 30 && tmp.z < 1) continue;
      const ang = Math.atan2(sy, sx);
      const bin = Math.round((ang / (Math.PI * 2)) * 16);
      const b = bins.get(bin) || { ax: 0, ay: 0, n: 0, boss: false, thief: false };
      b.ax += Math.cos(ang);
      b.ay += Math.sin(ang);
      b.n++;
      b.boss = b.boss || it.boss;
      b.thief = b.thief || it.thief;
      bins.set(bin, b);
    }
    const list = [];
    const margin = 44;
    // a blue arrow home whenever the village is off-screen
    const hb = TIERS[0].bounds;
    tmp.set((hb.x0 + hb.x1) / 2, 1, (hb.z0 + hb.z1) / 2).project(this.camera);
    const hx = tmp.x * w * 0.5;
    const hy = -tmp.y * h * 0.5;
    if (Math.abs(hx) > w * 0.5 - 30 || Math.abs(hy) > h * 0.5 - 30 || tmp.z >= 1) {
      const ang = Math.atan2(hy, hx);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const t = Math.min((w * 0.5 - margin) / Math.max(1e-6, Math.abs(dx)), (h * 0.5 - margin) / Math.max(1e-6, Math.abs(dy)));
      list.push({ x: w * 0.5 + dx * t, y: h * 0.5 + dy * t, angle: ang, count: 0, home: true });
    }
    if (this.finaleOpen && this.enemies.some((e) => e.chief)) {
      const F = CFG.finale;
      tmp.set(F.pos[0], 1, F.pos[1]).project(this.camera);
      const cxs = tmp.x * w * 0.5;
      const cys = -tmp.y * h * 0.5;
      if (Math.abs(cxs) > w * 0.5 - 30 || Math.abs(cys) > h * 0.5 - 30 || tmp.z >= 1) {
        const ang = Math.atan2(cys, cxs);
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const t = Math.min((w * 0.5 - margin) / Math.max(1e-6, Math.abs(dx)), (h * 0.5 - margin) / Math.max(1e-6, Math.abs(dy)));
        list.push({ x: w * 0.5 + dx * t, y: h * 0.5 + dy * t, angle: ang, count: 0, camp: true });
      }
    }
    if (this.queen.captive) {
      const qp = this.queen.mesh.position;
      tmp.set(qp.x, 1, qp.z).project(this.camera);
      const qx = tmp.x * w * 0.5;
      const qy = -tmp.y * h * 0.5;
      if (Math.abs(qx) > w * 0.5 - 30 || Math.abs(qy) > h * 0.5 - 30 || tmp.z >= 1) {
        const ang = Math.atan2(qy, qx);
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const t = Math.min((w * 0.5 - margin) / Math.max(1e-6, Math.abs(dx)), (h * 0.5 - margin) / Math.max(1e-6, Math.abs(dy)));
        list.push({ x: w * 0.5 + dx * t, y: h * 0.5 + dy * t, angle: ang, count: 0, queen: true });
      }
    }
    if (this.alarmT > 0) {
      const target = this.queen.inKeep && this.keep ? this.keep.mesh.position : this.queen.mesh.position;
      tmp.set(target.x, 1, target.z).project(this.camera);
      const kx = tmp.x * w * 0.5;
      const ky = -tmp.y * h * 0.5;
      if (Math.abs(kx) > w * 0.5 - 30 || Math.abs(ky) > h * 0.5 - 30 || tmp.z >= 1) {
        const ang = Math.atan2(ky, kx);
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const t = Math.min((w * 0.5 - margin) / Math.max(1e-6, Math.abs(dx)), (h * 0.5 - margin) / Math.max(1e-6, Math.abs(dy)));
        list.push({ x: w * 0.5 + dx * t, y: h * 0.5 + dy * t, angle: ang, count: 0, alarm: true });
      }
    }
    for (const b of bins.values()) {
      const ang = Math.atan2(b.ay, b.ax);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const t = Math.min((w * 0.5 - margin) / Math.max(1e-6, Math.abs(dx)), (h * 0.5 - margin) / Math.max(1e-6, Math.abs(dy)));
      list.push({ x: w * 0.5 + dx * t, y: h * 0.5 + dy * t, angle: ang, count: b.n, boss: b.boss, thief: b.thief });
    }
    this.hud.setIndicators(list);
  },

  // #104: `voice` is Wren reacting, for the beats that are hers -- null for the ones that are not.
  // It sits INSIDE the alarm's cooldown rather than beside it, so it can never speak more often than
  // the alarm it belongs to, and then keeps a longer gap of its own on top.
  raiseAlarm(text, voice = null) {
    this.alarmT = 3.5;
    this.alarmText = text;
    if (this.time - this.lastAlarm > 6) {
      this.lastAlarm = this.time;
      audio.alarm();
      if (voice && this.time - (this.lastCry || -99) > CFG.voice.gap) {
        this.lastCry = this.time;
        audio.cry(voice);
      }
    }
  },

  // The info screen: pauses the game and explains the next Keep level, the pads on offer and the enemy ranks.
  showInfo() {
    if (this.over || this.won || this.infoOpen || this.offer) return;  // #25: never cover a pending choice
    if (this.paused) this.hud.hidePause();
    else this.pause(true);
    this.infoOpen = true;
    this.hud.showInfo(this.infoData());
  },

  hideInfo() {
    if (!this.infoOpen) return;
    this.infoOpen = false;
    this.unpause();
  },

  // #23: the settings sheet. It holds what the sound, pause and info buttons used to do, and it
  // pauses while it is open, the same way the info screen does.
  showSettings() {
    if (this.over || this.won || this.settingsOpen || this.offer) return;
    this.settingsOpen = true;
    this.settingsPaused = this.running;
    if (this.settingsPaused) this.pause(true);
    this.hud.showSettings();
  },

  hideSettings(keepPaused = false) {
    if (!this.settingsOpen) return;
    this.settingsOpen = false;
    this.hud.hideSettings();
    const wasPaused = this.settingsPaused;
    this.settingsPaused = false;
    // #94: a pause handed to a screen the sheet opens and expects back. Only the scoreboard returns.
    this.sheetPause = keepPaused && wasPaused;
    if (wasPaused && !keepPaused) this.unpause();
  },

  // #94: opened through hideSettings(true), the way How to Play goes, so the sheet's pause survives
  // the handover.
  //
  // Closing it puts the sheet back, and the pause has to go back with it. `showSettings` decides
  // whether the pause is its own with `settingsPaused = this.running`, and by the time the board
  // closes the game is already stopped -- so re-opening the sheet would conclude the pause was not
  // its doing and close without resuming. Measured: the game sat paused with nothing on screen.
  // `sheetPause` is what hideSettings put down when it handed over, picked back up here.
  showScores() {
    if (this.over || this.won || this.scoresOpen || this.offer) return;
    this.scoresOpen = true;
    this.hud.showScores(readScores());
  },
  hideScores() {
    if (!this.scoresOpen) return;
    this.scoresOpen = false;
    this.hud.hideScores();
    this.showSettings();
    this.settingsPaused = this.sheetPause;
  },

  toggleSettings() {
    if (this.settingsOpen) this.hideSettings();
    else this.showSettings();
  },

  toggleInfo() {
    if (this.infoOpen) this.hideInfo();
    else this.showInfo();
  },

  // The Keep sheet, opened by tapping either plaque. It pauses like the info screen: reading what
  // the next level costs is not something to do while raiders are crossing the wall.
  showKeep() {
    if (this.over || this.won || this.keepOpen || this.offer) return;
    if (this.infoOpen) this.hideInfo();
    if (this.paused) this.hud.hidePause();
    else this.pause(true);
    this.keepOpen = true;
    this.hud.showKeep(this.infoData());
  },

  hideKeep() {
    if (!this.keepOpen) return;
    this.keepOpen = false;
    document.getElementById('keep-screen').classList.add('hidden');
    this.unpause();
  },

  toggleKeep() {
    if (this.keepOpen) this.hideKeep();
    else this.showKeep();
  },

  padDesc(def) {
    if (def.desc) return def.desc;
    if (def.feed) return 'Pour in wood, stone and straw to raise the Keep a level.';
    if (def.tower && def.crew) return 'Archers climb the tower and shoot from it (they leave your army).';
    if (def.towerUp) return 'More crew slots, sharper and longer-ranged arrows.';
    if (def.repair) return 'Rebuild this broken wall section.';
    if (def.repairKeep) return 'Repair the Keep so Wren has a door again.';
    return '';
  },

  // #99: what level N changes, as icon-and-text rows. The Keep plaque asks it about the NEXT level
  // and the level-up modal asks it about the one just reached, which is why it takes N rather than
  // reading `baseLevel` -- the same list answered both questions all along, and only one screen was
  // asking. Pure: it must stay safe to ask about a level that has already happened.
  levelGains(N) {
    const out = [];
    const add = (icon, text) => out.push({ icon, text });
    // #29/#99: the levels that open a material are exactly the levels whose `unlocks` line announces
    // it ("Stone quarries open"), so this is one row and not two -- it just uses the material's own
    // icon and the sentence revealNodes would have said, which is where to go and look. That sentence
    // used to arrive as a toast in the same tick as the modal that covers it, which is how the same
    // news ended up being told three times and seen once.
    const material = Object.keys(CFG.base.materialAt).find((m) => CFG.base.materialAt[m] === N);
    if (material) add(material, `${CFG.base.nodeName[material] || material} are open. Look for them on the map.`);
    else if (CFG.base.unlocks[N]) add('star', CFG.base.unlocks[N]);
    add('archer', `Army limit: ${CFG.base.archers[N]} archers, ${CFG.base.swordsmen[N]} swordsmen`);
    add('arrows', `Arrow speed ${CFG.base.fireRate(N).toFixed(1)}x for archers, towers and the King`);
    // walls and buildings both: rebuildStructures goes round the village in the same pass, and the
    // toast that used to say so fired underneath this modal
    if (CFG.base.wallAt.includes(N)) add('wall', `Walls and buildings rebuilt in ${CFG.wallLevels[CFG.base.wallAt.indexOf(N)].name.toLowerCase()}`);
    if (CFG.coins.valueAt.includes(N)) {
      // From the table rather than from coinValue(): asked about a level already reached, coinValue()
      // returns the NEW figure, so the row would have read "worth 3 instead of 3".
      const i = CFG.coins.valueAt.indexOf(N);
      if (i > 0) add('gold', `Every coin is worth ${CFG.coins.value[i]} score instead of ${CFG.coins.value[i - 1]}`);
    }
    const rank = CFG.ranks.find((r) => r.fromLevel === N);
    if (rank) add('skull', `${rank.name}s start raiding: tougher, but they drop more coins`);
    for (const def of PADS) if (def.minLevel === N) add(def.icon, `${def.label} pad appears`);
    if (N === CFG.finale.level) add('swords', 'The march on the raider camp opens: kill the Warlord to end the war');
    add('keep', `Keep health ${CFG.keep.hp + (N - 1) * CFG.keep.hpPerLevel}`);
    return out;
  },

  infoData() {
    const L = this.baseLevel;
    const N = L + 1;
    const req = this.levelReq();
    const feed = this.pads.find((p) => p.def.feed);
    const need = req ? [{ type: 'gold', need: req - (feed ? feed.paid : 0), have: this.coinsCarried }] : [];
    const unlocks = !this.keep
      ? [{ icon: 'keep', text: 'Build the Royal Keep first: feeding it levels up everything else.' }]
      : req ? this.levelGains(N) : [];
    const costText = (def, pad) => def.crew ? `${def.crew} archers` : def.feed ? 'materials' : `${pad ? pad.cost - pad.paid : this.padCost(def)} coins${def.res ? ' + ' + Object.entries(def.res).map(([t, n]) => `${n} ${t}`).join(', ') : ''}`;
    const padsNow = this.pads.map((p) => ({ icon: p.def.icon, label: p.def.label, cost: costText(p.def, p), desc: this.padDesc(p.def), locked: this.padLocked(p.def), kind: this.padKind(p.def) }));
    const later = PADS.filter((def) => def.minLevel && def.minLevel > L && def.tier <= this.tier + 1 && !this.built[def.id])
      .map((def) => ({ icon: def.icon, label: def.label, at: def.minLevel, desc: this.padDesc(def), kind: this.padKind(def) }));
    const ranks = CFG.ranks.map((r) => ({ name: r.name, color: `#${r.tunic.toString(16).padStart(6, '0')}`, at: r.fromLevel, active: r.fromLevel <= L }));
    const towers = Object.values(this.towers).map((t) => t.level);
    const army = {
      archers: this.unitCount('archer'), archerCap: this.unitCap('archer'), swords: this.unitCount('swordsman'), swordCap: this.unitCap('swordsman'),
      towers, fire: this.fireMul(), wall: CFG.wallLevels[this.wallLevel].name, keepHp: this.keep ? `${Math.round(this.keep.hp)} / ${this.keep.maxHp}` : null,
      training: this.archerPower,
    };
    const taken = UPGRADES.filter((u) => this.taken[u.id]).map((u) => ({ icon: u.icon, name: u.name, desc: u.desc, n: this.taken[u.id] }));
    const vi = CFG.coins.valueAt.reduce((acc, lv, i) => (this.baseLevel >= lv ? i : acc), 0);
    const coins = { count: this.coinsCarried, value: this.coinValue(), nextValue: CFG.coins.value[vi + 1] || null, nextAt: CFG.coins.valueAt[vi + 1] || null };
    return { taken, level: L, max: CFG.base.maxLevel, hasKeep: !!this.keep, queenCaptive: !!this.queen.captive, need, unlocks, padsNow, later, ranks, army, coins, wave: this.wave, finaleOpen: this.finaleOpen, finaleLevel: CFG.finale.level };
  },
};
