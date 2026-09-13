import * as THREE from 'three';

// ---- shared materials (flat, cartoony low-poly look) ----
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}
export const GHOST_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false });

const C = {
  skin: 0xf3c9a0, hair: 0x1d1d1d, white: 0xf6f6f6, blue: 0x2f6fd6, navy: 0x3a3f5c, pants: 0x4b4034,
  red: 0xd8262c, darkRed: 0xa31a1f, steel: 0xb9bec7, gold: 0xf5b800, goldDark: 0xc98a00,
  horse: 0xe8d5b5, mane: 0x8a5a2b, wood: 0x9a6a3a, darkWood: 0x6b4a2b, roof: 0x7a4f30,
  leaf: 0x2f8f4e, leafDark: 0x257a42, rock: 0x8f959c, cliff: 0x5b5f63, grass: 0x4aa364,
  boss: 0xf4e9ec, bossDark: 0xe6cfd6, bow: 0x3b7bff,
};

function box(w, h, d, color, x = 0, y = 0, z = 0, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cone(r, h, color, x = 0, y = 0, z = 0, seg = 7) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Convert a model into a translucent white "ghost" preview.
export function ghostify(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.material = GHOST_MAT;
      o.castShadow = false;
    }
  });
  return group;
}

// ---- characters (all face +Z) ----
function humanoid({ shirt, pantsColor = C.pants, hairColor = C.hair, scale = 1 }) {
  const g = new THREE.Group();
  const legL = box(0.18, 0.36, 0.18, pantsColor, -0.12, 0.18, 0);
  const legR = box(0.18, 0.36, 0.18, pantsColor, 0.12, 0.18, 0);
  const body = box(0.5, 0.5, 0.32, shirt, 0, 0.6, 0);
  const head = box(0.42, 0.4, 0.42, C.skin, 0, 1.08, 0);
  const hair = box(0.46, 0.16, 0.46, hairColor, 0, 1.32, 0);
  const fringe = box(0.46, 0.14, 0.1, hairColor, 0, 1.2, 0.2);
  g.add(legL, legR, body, head, hair, fringe);
  g.userData.legs = [legL, legR];
  g.userData.body = body;
  g.scale.setScalar(scale);
  return g;
}

function bow(color = C.bow) {
  const g = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 6, 12, Math.PI), mat(color));
  arc.rotation.y = Math.PI / 2;
  arc.rotation.z = -Math.PI / 2;
  arc.castShadow = true;
  g.add(arc);
  const string = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.72, 0.015), mat(0xe8e8e8));
  g.add(string);
  return g;
}

export function makeArcher() {
  const g = humanoid({ shirt: C.white });
  const strap = box(0.52, 0.1, 0.34, C.blue, 0, 0.72, 0);
  g.add(strap);
  const b = bow();
  b.position.set(0.34, 0.68, 0.22);
  b.rotation.x = 0;
  g.add(b);
  return g;
}

export function makeSwordsman() {
  const g = humanoid({ shirt: C.navy });
  const helm = box(0.46, 0.2, 0.46, C.steel, 0, 1.3, 0);
  g.add(helm);
  const sword = box(0.08, 0.8, 0.05, C.steel, 0.34, 0.85, 0.15);
  sword.rotation.z = -0.35;
  g.add(sword);
  const shield = box(0.08, 0.5, 0.42, C.blue, -0.34, 0.65, 0.05);
  g.add(shield);
  return g;
}

export function makeKnight({ scale = 1, color = C.red, dark = C.darkRed } = {}) {
  const g = humanoid({ shirt: color, pantsColor: dark, hairColor: dark, scale });
  // helmet with plume
  const helm = box(0.48, 0.24, 0.48, color, 0, 1.3, 0);
  const visor = box(0.5, 0.12, 0.06, dark, 0, 1.08, 0.22);
  const plume = cone(0.12, 0.5, color, 0, 1.6, -0.05, 5);
  g.add(helm, visor, plume);
  const sword = box(0.08, 0.85, 0.05, C.steel, 0.36, 0.9, 0.12);
  sword.rotation.z = -0.4;
  g.add(sword);
  return g;
}

export function makeBrute() {
  return makeKnight({ scale: 1.45, color: C.darkRed, dark: 0x5a0d10 });
}

export function makeBoss() {
  const g = new THREE.Group();
  const body = box(1.9, 2.3, 1.5, C.boss, 0, 1.6, 0);
  const belly = box(1.5, 1.2, 0.5, C.bossDark, 0, 1.3, 0.55);
  const head = box(1.1, 1.0, 1.1, C.boss, 0, 3.3, 0);
  const eyeL = box(0.14, 0.16, 0.1, 0x222222, -0.28, 3.4, 0.55);
  const eyeR = box(0.14, 0.16, 0.1, 0x222222, 0.28, 3.4, 0.55);
  const legL = box(0.6, 0.9, 0.6, C.bossDark, -0.5, 0.45, 0);
  const legR = box(0.6, 0.9, 0.6, C.bossDark, 0.5, 0.45, 0);
  const armR = box(0.5, 1.6, 0.5, C.boss, 1.25, 1.9, 0.2);
  const sword = box(0.3, 3.4, 0.14, C.white, 1.3, 3.0, 0.9);
  sword.rotation.x = 0.35;
  const guard = box(0.9, 0.18, 0.2, C.steel, 1.3, 1.5, 0.5);
  guard.rotation.x = 0.35;
  g.add(body, belly, head, eyeL, eyeR, legL, legR, armR, sword, guard);
  g.userData.legs = [legL, legR];
  g.userData.body = body;
  return g;
}

export function makeKing() {
  const g = new THREE.Group();
  // horse (long axis along z)
  const hb = box(0.62, 0.6, 1.25, C.horse, 0, 0.85, 0);
  const neck = box(0.34, 0.6, 0.34, C.horse, 0, 1.25, 0.62);
  neck.rotation.x = -0.4;
  const head = box(0.34, 0.32, 0.55, C.horse, 0, 1.55, 0.85);
  const mane = box(0.14, 0.5, 0.5, C.mane, 0, 1.45, 0.5);
  const tail = box(0.14, 0.55, 0.14, C.mane, 0, 0.75, -0.7);
  tail.rotation.x = 0.4;
  const legs = [];
  for (const [x, z] of [[-0.22, 0.45], [0.22, 0.45], [-0.22, -0.45], [0.22, -0.45]]) {
    const l = box(0.18, 0.55, 0.18, C.horse, x, 0.28, z);
    legs.push(l);
    g.add(l);
  }
  const saddle = box(0.7, 0.14, 0.55, C.darkWood, 0, 1.15, -0.05);
  g.add(hb, neck, head, mane, tail, saddle);
  // rider
  const body = box(0.5, 0.55, 0.36, C.blue, 0, 1.5, -0.05);
  const cape = box(0.56, 0.7, 0.08, C.blue, 0, 1.4, -0.28);
  const rhead = box(0.44, 0.42, 0.44, C.skin, 0, 2.02, -0.05);
  const rhair = box(0.48, 0.14, 0.48, C.hair, 0, 2.28, -0.05);
  const beard = box(0.44, 0.14, 0.12, 0x5a3a20, 0, 1.86, 0.18);
  const crown = cyl(0.26, 0.24, 0.2, C.gold, 0, 2.42, -0.05, 6);
  g.add(body, cape, rhead, rhair, beard, crown);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = cone(0.07, 0.16, C.gold, Math.cos(a) * 0.22, 2.58, -0.05 + Math.sin(a) * 0.22, 4);
    g.add(sp);
  }
  const b = bow(C.gold);
  b.position.set(0.38, 1.6, 0.25);
  g.add(b);
  g.userData.legs = legs;
  g.userData.body = hb;
  return g;
}

// ---- items ----
const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14);
const coinMat = new THREE.MeshLambertMaterial({ color: C.gold, emissive: 0x3a2a00 });
export function makeCoin() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(coinGeo, coinMat);
  c.castShadow = true;
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 14), mat(C.goldDark));
  g.add(c, inner);
  return g;
}

const arrowGeo = new THREE.BoxGeometry(0.06, 0.06, 0.7);
const arrowMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
export function makeArrow() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(arrowGeo, arrowMat);
  const tip = cone(0.06, 0.16, C.steel, 0, 0, 0.42, 4);
  tip.rotation.x = Math.PI / 2;
  g.add(shaft, tip);
  return g;
}

// ---- structures ----
export function makeHut() {
  const g = new THREE.Group();
  const base = box(3.4, 1.7, 2.6, C.wood, 0, 0.85, 0);
  const door = box(0.7, 1.1, 0.1, 0x3a2a1a, 0.6, 0.55, 1.33);
  const window = box(0.5, 0.5, 0.1, 0x9ad4ff, -0.7, 1.0, 1.33);
  const roofL = box(2.1, 0.22, 3.1, C.roof, -0.95, 2.15, 0);
  roofL.rotation.z = 0.6;
  const roofR = box(2.1, 0.22, 3.1, C.roof, 0.95, 2.15, 0);
  roofR.rotation.z = -0.6;
  const ridge = box(0.3, 0.3, 3.2, C.darkWood, 0, 2.7, 0);
  const target = cyl(0.45, 0.45, 0.1, C.white, 0, 1.2, -1.36, 12);
  target.rotation.x = Math.PI / 2;
  const target2 = cyl(0.28, 0.28, 0.12, C.red, 0, 1.2, -1.38, 12);
  target2.rotation.x = Math.PI / 2;
  const post = box(0.16, 1.0, 0.16, C.darkWood, 1.9, 0.5, 1.5);
  const post2 = box(0.16, 1.0, 0.16, C.darkWood, -1.9, 0.5, 1.5);
  g.add(base, door, window, roofL, roofR, ridge, target, target2, post, post2);
  return g;
}

export function makeTower() {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    g.add(cyl(0.14, 0.18, 2.6, C.darkWood, x, 1.3, z, 6));
  }
  const brace1 = box(2.2, 0.14, 0.14, C.wood, 0, 0.9, 0.9);
  const brace2 = box(2.2, 0.14, 0.14, C.wood, 0, 0.9, -0.9);
  const brace3 = box(0.14, 0.14, 2.2, C.wood, 0.9, 1.5, 0);
  const brace4 = box(0.14, 0.14, 2.2, C.wood, -0.9, 1.5, 0);
  const platform = box(2.5, 0.22, 2.5, C.wood, 0, 2.6, 0);
  g.add(brace1, brace2, brace3, brace4, platform);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const r = box(i % 2 ? 0.1 : 2.5, 0.4, i % 2 ? 2.5 : 0.1, C.darkWood, Math.cos(a) * 1.2 * (i % 2), 2.9, Math.sin(a) * 1.2 * ((i + 1) % 2));
    g.add(r);
  }
  g.userData.top = 2.72;
  return g;
}

export function makeBarracks() {
  const g = new THREE.Group();
  const base = box(4.2, 2.0, 3.0, 0x8a7a6a, 0, 1.0, 0);
  const roofL = box(2.5, 0.22, 3.5, 0x555a66, -1.15, 2.5, 0);
  roofL.rotation.z = 0.55;
  const roofR = box(2.5, 0.22, 3.5, 0x555a66, 1.15, 2.5, 0);
  roofR.rotation.z = -0.55;
  const door = box(1.0, 1.4, 0.1, 0x3a2a1a, 0, 0.7, 1.53);
  const flagPole = cyl(0.05, 0.05, 2.2, C.darkWood, 1.6, 3.6, 0, 5);
  const flag = box(0.9, 0.5, 0.05, C.blue, 2.05, 4.4, 0);
  const swords = box(0.1, 1.2, 0.08, C.steel, 0, 2.0, 1.55);
  swords.rotation.z = 0.7;
  const swords2 = box(0.1, 1.2, 0.08, C.steel, 0, 2.0, 1.55);
  swords2.rotation.z = -0.7;
  g.add(base, roofL, roofR, door, flagPole, flag, swords, swords2);
  return g;
}

export function makeFence(length) {
  const g = new THREE.Group();
  const rail = box(length, 0.16, 0.12, C.wood, 0, 0.9, 0);
  const rail2 = box(length, 0.16, 0.12, C.wood, 0, 0.4, 0);
  g.add(rail, rail2);
  const n = Math.max(2, Math.round(length / 0.45));
  const picketGeo = new THREE.BoxGeometry(0.22, 1.5, 0.22);
  const pickets = new THREE.InstancedMesh(picketGeo, mat(C.darkWood), n);
  pickets.castShadow = true;
  pickets.receiveShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + (i / (n - 1)) * length;
    m.makeTranslation(x, 0.75, 0);
    pickets.setMatrixAt(i, m);
  }
  g.add(pickets);
  return g;
}

export function makeGate() {
  const g = new THREE.Group();
  const postL = box(0.4, 2.6, 0.4, C.darkWood, -1.6, 1.3, 0);
  const postR = box(0.4, 2.6, 0.4, C.darkWood, 1.6, 1.3, 0);
  const top = box(3.8, 0.4, 0.5, C.wood, 0, 2.7, 0);
  const banner = box(0.7, 0.9, 0.06, C.blue, 0, 2.1, 0);
  g.add(postL, postR, top, banner);
  return g;
}

// ---- scenery ----
export function makeTree(scale = 1) {
  const g = new THREE.Group();
  const trunk = cyl(0.18, 0.24, 0.8, C.mane, 0, 0.4, 0, 6);
  const l1 = cone(1.2, 1.4, C.leafDark, 0, 1.3, 0, 7);
  const l2 = cone(0.95, 1.3, C.leaf, 0, 2.1, 0, 7);
  const l3 = cone(0.65, 1.1, C.leaf, 0, 2.85, 0, 7);
  g.add(trunk, l1, l2, l3);
  g.scale.setScalar(scale);
  g.rotation.y = Math.random() * Math.PI;
  return g;
}

export function makeBush() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const r = 0.45 + Math.random() * 0.25;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(i === 1 ? C.leaf : C.leafDark));
    m.position.set((Math.random() - 0.5) * 0.9, r * 0.7, (Math.random() - 0.5) * 0.9);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

export function makeRock(scale = 1) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), mat(C.rock));
  m.scale.set(scale * 1.2, scale * 0.7, scale);
  m.position.y = 0.3 * scale;
  m.rotation.y = Math.random() * Math.PI;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function makeSpikes() {
  const g = new THREE.Group();
  const beam = box(2.6, 0.16, 0.16, C.darkWood, 0, 0.35, 0);
  g.add(beam);
  for (let i = 0; i < 4; i++) {
    const x = -1.0 + i * 0.66;
    const a = box(0.12, 1.3, 0.12, C.wood, x, 0.5, 0);
    a.rotation.x = 0.7;
    const b = box(0.12, 1.3, 0.12, C.wood, x, 0.5, 0);
    b.rotation.x = -0.7;
    g.add(a, b);
  }
  return g;
}

export function makeCliff(w, h, d) {
  const side = mat(C.cliff);
  const top = mat(C.grass);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, side, side, side]);
  m.castShadow = true;
  m.receiveShadow = true;
  m.position.y = h / 2 - 0.05;
  return m;
}

// ---- build pad (canvas-textured plane) ----
export function makePadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return { canvas, tex };
}

export function drawPad(canvas, tex, { icon, remaining, label, paid }) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  // fill: progress shows as green rising from the bottom
  const r = 28;
  ctx.beginPath();
  ctx.roundRect(10, 10, 236, 236, r);
  ctx.fillStyle = 'rgba(25, 55, 40, 0.62)';
  ctx.fill();
  if (paid > 0) {
    ctx.save();
    ctx.clip();
    const hgt = 236 * Math.min(1, paid);
    ctx.fillStyle = 'rgba(70, 210, 90, 0.85)';
    ctx.fillRect(10, 246 - hgt, 236, hgt);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.roundRect(10, 10, 236, 236, r);
  ctx.setLineDash([42, 22]);
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  ctx.setLineDash([]);
  // icon
  ctx.font = '84px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, 128, 78);
  // label
  ctx.font = 'bold 22px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 128, 140);
  // coin + cost
  ctx.beginPath();
  ctx.arc(78, 200, 22, 0, Math.PI * 2);
  ctx.fillStyle = '#f5b800';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#b07a00';
  ctx.stroke();
  ctx.font = 'bold 20px system-ui';
  ctx.fillStyle = '#b07a00';
  ctx.fillText('♛', 78, 202);
  ctx.font = 'bold 52px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.textAlign = 'left';
  ctx.strokeText(String(remaining), 112, 202);
  ctx.fillText(String(remaining), 112, 202);
  tex.needsUpdate = true;
}

export function makePad() {
  const { canvas, tex } = makePadTexture();
  const geo = new THREE.PlaneGeometry(3.2, 3.2);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  mesh.receiveShadow = false;
  return { mesh, canvas, tex };
}

// ---- health bar (sprites always face camera) ----
const barBg = new THREE.SpriteMaterial({ color: 0x222222, depthTest: false });
const barFg = new THREE.SpriteMaterial({ color: 0xe8342a, depthTest: false });
const barFgGreen = new THREE.SpriteMaterial({ color: 0x4ad06a, depthTest: false });
export function makeHealthBar(width = 1.2, green = false) {
  const g = new THREE.Group();
  const bg = new THREE.Sprite(barBg);
  bg.scale.set(width, 0.16, 1);
  const fg = new THREE.Sprite(green ? barFgGreen : barFg);
  fg.center.set(0, 0.5);
  fg.position.x = -width / 2 + 0.03;
  fg.scale.set(width - 0.06, 0.1, 1);
  g.add(bg, fg);
  g.userData.fg = fg;
  g.userData.width = width - 0.06;
  g.renderOrder = 10;
  g.visible = false;
  return g;
}
export function setHealthBar(bar, frac) {
  bar.userData.fg.scale.x = Math.max(0.001, bar.userData.width * frac);
  bar.visible = frac < 0.999;
}

// ---- damage popup ----
const popupCache = new Map();
export function makePopup(text, color = '#ffffff') {
  const key = text + color;
  if (!popupCache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 54px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(text, 80, 42);
    ctx.fillStyle = color;
    ctx.fillText(text, 80, 42);
    const tex = new THREE.CanvasTexture(canvas);
    popupCache.set(key, new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  }
  const s = new THREE.Sprite(popupCache.get(key).clone());
  s.scale.set(2.0, 1.0, 1);
  s.renderOrder = 20;
  return s;
}

export function makeRing(radius) {
  const geo = new THREE.RingGeometry(radius - 0.08, radius, 48);
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  const mesh = new THREE.Mesh(geo, m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  return mesh;
}
