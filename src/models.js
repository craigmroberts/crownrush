import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---- shared materials: cel-shaded for the soft cartoon look ----
const gradCanvas = document.createElement('canvas');
gradCanvas.width = 4;
gradCanvas.height = 1;
{
  const ctx = gradCanvas.getContext('2d');
  [[0, '#6e6e6e'], [1, '#a8a8a8'], [2, '#e2e2e2'], [3, '#ffffff']].forEach(([x, c]) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, 0, 1, 1);
  });
}
const gradientMap = new THREE.CanvasTexture(gradCanvas);
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.colorSpace = THREE.NoColorSpace;

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshToonMaterial({ color, gradientMap, ...opts }));
  return matCache.get(key);
}
export const GHOST_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false });
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x1b1b24, side: THREE.BackSide });

const C = {
  skin: 0xf6cfae, hair: 0x2a1e16, white: 0xf7f7f7, blue: 0x2f6fd6, navy: 0x3a3f5c, pants: 0x6b4a32, shoes: 0x2b2b2b,
  red: 0xd8262c, darkRed: 0xa31a1f, steel: 0xb9bec7, steelDark: 0x7d848e, gold: 0xf5b800, goldDark: 0xc98a00,
  horse: 0xe8d5b5, mane: 0x8a5a2b, wood: 0x9a6a3a, darkWood: 0x6b4a2b, roof: 0x7a4f30,
  leaf: 0x2f8f4e, leafDark: 0x257a42, rock: 0x8f959c, cliff: 0x5b5f63, grass: 0x4aa364,
  boss: 0xf4e9ec, bossDark: 0xe6cfd6, bow: 0x3b7bff, leather: 0x8a5a3a,
};

function box(w, h, d, color, x = 0, y = 0, z = 0, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
// rounded box for the soft chibi shapes; `outline` adds a dark inverted hull
function rbox(w, h, d, color, x = 0, y = 0, z = 0, r = 0.08, outline = 0) {
  const geo = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2));
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline) {
    const o = new THREE.Mesh(geo, OUTLINE_MAT);
    o.scale.setScalar(1 + outline);
    m.add(o);
  }
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
  const drop = [];
  group.traverse((o) => {
    if (o.isMesh) {
      if (o.material === OUTLINE_MAT || o.userData.face) drop.push(o);
      else {
        o.material = GHOST_MAT;
        o.castShadow = false;
      }
    }
  });
  for (const o of drop) o.parent.remove(o);
  return group;
}

// ---- baking: collapse a model's static parts into one vertex-coloured mesh (one draw call) ----
export const BAKED_MAT = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap, vertexColors: true });
function prepGeo(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
function colorize(geo, color) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
// `keep` lists meshes that must stay separate (animated parts); their children stay with them.
export function bake(g, keep = []) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const isKept = (o) => {
    for (let p = o; p && p !== g; p = p.parent) if (keep.includes(p)) return true;
    return false;
  };
  const parts = [];
  const outlines = [];
  g.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSprite || o.userData.face || Array.isArray(o.material)) return;
    if (isKept(o)) return;
    if (o.material === OUTLINE_MAT) {
      outlines.push(o);
      return;
    }
    if (!o.material.isMeshToonMaterial || o.material.transparent || o.material === BAKED_MAT) return;
    if (o.material.emissive && o.material.emissive.getHex() !== 0) return;
    parts.push(o);
  });
  const toGeo = (o, color) => {
    const geo = prepGeo(o.geometry);
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    return color ? colorize(geo, color) : geo;
  };
  if (parts.length) {
    const m = new THREE.Mesh(mergeGeometries(parts.map((o) => toGeo(o, o.material.color)), false), BAKED_MAT);
    m.castShadow = true;
    m.receiveShadow = true;
    for (const o of parts) o.parent.remove(o);
    g.add(m);
  }
  if (outlines.length) {
    const m = new THREE.Mesh(mergeGeometries(outlines.map((o) => toGeo(o, null)), false), OUTLINE_MAT);
    for (const o of outlines) if (o.parent) o.parent.remove(o);
    g.add(m);
  }
  return g;
}
// Merge every baked mesh inside a static group into one mesh (scenery).
export function mergeGroup(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts = [];
  group.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && o.material === BAKED_MAT) parts.push(o);
  });
  if (!parts.length) return group;
  const geos = parts.map((o) => {
    const geo = o.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    return geo;
  });
  const m = new THREE.Mesh(mergeGeometries(geos, false), BAKED_MAT);
  m.castShadow = true;
  m.receiveShadow = true;
  for (const o of parts) o.parent.remove(o);
  // drop now-empty groups
  const empties = [];
  group.traverse((o) => {
    if (o !== group && o.isGroup && o.children.length === 0) empties.push(o);
  });
  for (const o of empties) o.parent.remove(o);
  group.add(m);
  return group;
}

// ---- faces (drawn once per style, shared) ----
const faceCache = new Map();
function faceMaterial(style = 'normal') {
  if (faceCache.has(style)) return faceCache.get(style);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const angry = style === 'angry';
  const eye = (x) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, 66, 13, angry ? 12 : 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#23232b';
    ctx.beginPath();
    ctx.ellipse(x + 2, 68, 7, angry ? 8 : 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x + 5, 63, 2.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  eye(42);
  eye(86);
  // heavy determined brows
  ctx.strokeStyle = '#1c1c22';
  ctx.lineCap = 'round';
  ctx.lineWidth = angry ? 10 : 8;
  ctx.beginPath();
  ctx.moveTo(24, angry ? 36 : 42);
  ctx.lineTo(54, angry ? 50 : 48);
  ctx.moveTo(104, angry ? 36 : 42);
  ctx.lineTo(74, angry ? 50 : 48);
  ctx.stroke();
  // mouth
  ctx.strokeStyle = '#7a4a3a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (angry) {
    ctx.moveTo(52, 100);
    ctx.lineTo(76, 100);
  } else {
    ctx.moveTo(54, 96);
    ctx.quadraticCurveTo(64, 104, 74, 96);
  }
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  faceCache.set(style, m);
  return m;
}
function face(w, h, x, y, z, style) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMaterial(style));
  m.position.set(x, y, z);
  m.userData.face = true;
  m.renderOrder = 2;
  return m;
}

// ---- characters (all face +Z; chibi proportions: the head is about half the height) ----
function humanoid({ shirt, pantsColor = C.pants, hairColor = C.hair, scale = 1, style = 'normal', hair = true }) {
  const g = new THREE.Group();
  // each leg is one baked piece (leg + shoe) that swings as a unit
  const leg = (x) => {
    const lg = new THREE.Group();
    lg.add(rbox(0.22, 0.34, 0.22, pantsColor, 0, 0, 0, 0.06), box(0.24, 0.1, 0.28, C.shoes, 0, -0.14, 0.03));
    lg.position.set(x, 0.19, 0);
    return bake(lg);
  };
  const legL = leg(-0.13);
  const legR = leg(0.13);
  const body = rbox(0.6, 0.56, 0.4, shirt, 0, 0.62, 0, 0.12, 0.05);
  const belt = box(0.62, 0.08, 0.42, C.leather, 0, 0.38, 0);
  const armL = rbox(0.17, 0.42, 0.17, C.skin, -0.38, 0.62, 0.02, 0.07);
  const armR = rbox(0.17, 0.42, 0.17, C.skin, 0.38, 0.62, 0.02, 0.07);
  const head = rbox(0.68, 0.6, 0.64, C.skin, 0, 1.22, 0, 0.24, 0.04);
  g.add(legL, legR, body, belt, armL, armR, head);
  if (hair) {
    // a tight rounded cap of hair with a fringe and short sideburns
    const cap = rbox(0.72, 0.28, 0.68, hairColor, 0, 1.43, -0.02, 0.22, 0.04);
    const fringe = rbox(0.64, 0.12, 0.14, hairColor, 0, 1.33, 0.28, 0.05);
    const sideL = rbox(0.08, 0.22, 0.4, hairColor, -0.34, 1.3, -0.1, 0.04);
    const sideR = rbox(0.08, 0.22, 0.4, hairColor, 0.34, 1.3, -0.1, 0.04);
    g.add(cap, fringe, sideL, sideR);
  }
  g.add(face(0.5, 0.44, 0, 1.15, 0.325, style));
  g.userData.legs = [legL, legR];
  g.userData.body = body;
  g.userData.arms = [armL, armR];
  g.scale.setScalar(scale);
  return g;
}

function bow(color = C.bow, r = 0.42) {
  const g = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 6, 14, Math.PI), mat(color));
  arc.rotation.y = Math.PI / 2;
  arc.rotation.z = -Math.PI / 2;
  arc.castShadow = true;
  g.add(arc);
  const string = new THREE.Mesh(new THREE.BoxGeometry(0.02, r * 2, 0.02), mat(0xf0f0f0));
  g.add(string);
  return g;
}

function quiver(g) {
  const q = cyl(0.09, 0.09, 0.5, C.leather, -0.2, 0.85, -0.24, 6);
  q.rotation.x = -0.25;
  q.rotation.z = 0.35;
  g.add(q);
  for (let i = 0; i < 3; i++) {
    const a = box(0.03, 0.3, 0.03, 0x8a6a3a, -0.2 + (i - 1) * 0.05, 1.12, -0.28 + (i % 2) * 0.03);
    a.rotation.z = 0.35;
    a.rotation.x = -0.25;
    g.add(a);
    g.add(cone(0.05, 0.1, C.white, -0.24 + (i - 1) * 0.05, 1.27, -0.32 + (i % 2) * 0.03, 4));
  }
}

const HAIR = [0x2a1e16, 0x2a1e16, 0x4a2f1c, 0x1c1c22, 0x6b4a2b];
export function makeArcher() {
  const g = humanoid({ shirt: C.white, hairColor: HAIR[Math.floor(Math.random() * HAIR.length)] });
  // blue strap across the chest
  const strap = box(0.14, 0.8, 0.44, C.blue, 0, 0.62, 0);
  strap.rotation.z = 0.7;
  g.add(strap);
  const b = bow(C.bow, 0.5);
  b.position.set(-0.44, 0.78, 0.18);
  b.rotation.y = 0.5;
  b.rotation.z = 0.15;
  g.add(b);
  quiver(g);
  return bake(g, [...g.userData.legs, g.userData.body]);
}

export function makeSwordsman() {
  const g = humanoid({ shirt: C.navy });
  const helm = rbox(0.76, 0.3, 0.72, C.steel, 0, 1.46, -0.02, 0.16, 0.04);
  const brim = box(0.8, 0.06, 0.76, C.steelDark, 0, 1.34, 0);
  g.add(helm, brim);
  const sword = box(0.09, 0.85, 0.05, C.steel, 0.42, 0.95, 0.18);
  sword.rotation.z = -0.35;
  sword.add(box(0.26, 0.06, 0.1, C.goldDark, 0, -0.34, 0));
  g.add(sword);
  const shield = rbox(0.1, 0.55, 0.48, C.blue, -0.42, 0.7, 0.08, 0.06);
  shield.add(box(0.03, 0.2, 0.2, C.gold, 0.06, 0, 0));
  g.add(shield);
  return bake(g, [...g.userData.legs, g.userData.body]);
}

function roundShield(color, x, y, z) {
  const g = new THREE.Group();
  const disc = cyl(0.3, 0.3, 0.08, color, 0, 0, 0, 12);
  disc.rotation.z = Math.PI / 2;
  const boss = cyl(0.1, 0.1, 0.12, C.steel, 0, 0, 0, 8);
  boss.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 14), mat(C.steelDark));
  rim.rotation.y = Math.PI / 2;
  g.add(disc, boss, rim);
  g.position.set(x, y, z);
  return g;
}

// The common raider: round red kettle helmet, nose guard and plume, small round shield, short sword.
export function makeKnight({ scale = 1, color = C.red, dark = C.darkRed } = {}) {
  const g = humanoid({ shirt: color, pantsColor: dark, hairColor: dark, scale, style: 'angry', hair: false });
  const sash = box(0.62, 0.1, 0.42, dark, 0, 0.5, 0);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(color));
  helm.position.set(0, 1.3, -0.02);
  helm.castShadow = true;
  const brim = cyl(0.46, 0.46, 0.08, dark, 0, 1.3, -0.02, 14);
  const nose = box(0.08, 0.28, 0.06, dark, 0, 1.16, 0.34);
  const plume = cone(0.12, 0.5, dark, 0, 1.9, -0.05, 5);
  const plume2 = cone(0.08, 0.3, color, 0, 2.1, -0.05, 5);
  g.add(sash, helm, brim, nose, plume, plume2);
  g.add(roundShield(dark, -0.5, 0.66, 0.05));
  const sword = box(0.08, 0.7, 0.05, C.steel, 0.42, 0.9, 0.16);
  sword.rotation.z = -0.4;
  sword.add(box(0.24, 0.06, 0.1, C.leather, 0, -0.3, 0));
  g.add(sword);
  return bake(g, [...g.userData.legs, g.userData.body]);
}

// Elite: black plate, steel pauldrons, tall great helm with a glowing visor slit, red crest, longsword.
export function makeElite() {
  const g = humanoid({ shirt: 0x2b2b33, pantsColor: 0x1f1f26, hairColor: 0x1f1f26, scale: 1.1, style: 'angry', hair: false });
  const plate = rbox(0.48, 0.4, 0.14, 0x3d3d47, 0, 0.64, 0.18, 0.05);
  const crossA = box(0.34, 0.05, 0.03, 0x8a1a22, 0, 0.64, 0.27);
  crossA.rotation.z = 0.78;
  const crossB = box(0.34, 0.05, 0.03, 0x8a1a22, 0, 0.64, 0.27);
  crossB.rotation.z = -0.78;
  const pauL = rbox(0.34, 0.2, 0.36, C.steel, -0.38, 0.9, 0, 0.1);
  const pauR = rbox(0.34, 0.2, 0.36, C.steel, 0.38, 0.9, 0, 0.1);
  const helm = rbox(0.74, 0.86, 0.7, 0x2b2b33, 0, 1.3, -0.02, 0.2, 0.04);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
  visor.position.set(0, 1.26, 0.35);
  const crest = box(0.1, 0.34, 0.5, 0x8a1a22, 0, 1.85, -0.1);
  g.add(plate, crossA, crossB, pauL, pauR, helm, visor, crest);
  // remove the drawn face: the helm covers it
  g.children.filter((o) => o.userData.face).forEach((o) => g.remove(o));
  const sword = box(0.09, 1.15, 0.05, C.steel, 0.44, 1.0, 0.16);
  sword.rotation.z = -0.3;
  sword.add(box(0.3, 0.07, 0.1, 0x8a1a22, 0, -0.5, 0));
  g.add(sword);
  return bake(g, [...g.userData.legs, g.userData.body]);
}

// Brute: barrel body, bare arms, horned cap, studded club.
export function makeBrute() {
  const g = new THREE.Group();
  const s = 1.45;
  const legL = rbox(0.26, 0.36, 0.26, 0x5a0d10, -0.17, 0.2, 0, 0.08);
  const legR = rbox(0.26, 0.36, 0.26, 0x5a0d10, 0.17, 0.2, 0, 0.08);
  const body = rbox(0.86, 0.66, 0.56, C.darkRed, 0, 0.7, 0, 0.2, 0.05);
  const strap = box(0.16, 0.9, 0.6, C.leather, 0, 0.7, 0);
  strap.rotation.z = 0.7;
  const belt = box(0.9, 0.1, 0.6, C.leather, 0, 0.42, 0);
  const armL = rbox(0.24, 0.5, 0.24, C.skin, -0.55, 0.68, 0.04, 0.1);
  const armR = rbox(0.24, 0.5, 0.24, C.skin, 0.55, 0.68, 0.04, 0.1);
  const head = rbox(0.66, 0.56, 0.62, C.skin, 0, 1.32, 0, 0.22, 0.04);
  const cap = rbox(0.7, 0.24, 0.66, 0x5a0d10, 0, 1.52, -0.02, 0.2, 0.04);
  const hornL = cone(0.09, 0.4, 0xf4f4f4, -0.42, 1.6, 0, 5);
  hornL.rotation.z = 0.9;
  const hornR = cone(0.09, 0.4, 0xf4f4f4, 0.42, 1.6, 0, 5);
  hornR.rotation.z = -0.9;
  g.add(legL, legR, body, strap, belt, armL, armR, head, cap, hornL, hornR);
  g.add(face(0.5, 0.42, 0, 1.26, 0.315, 'angry'));
  // club
  const handle = cyl(0.05, 0.05, 0.9, C.darkWood, 0.62, 1.15, 0.1, 6);
  const clubHead = rbox(0.3, 0.42, 0.3, C.steelDark, 0.62, 1.7, 0.1, 0.08);
  for (const [x, z] of [[0.14, 0], [-0.14, 0], [0, 0.14], [0, -0.14]]) clubHead.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), mat(C.steel)).translateX(x).translateZ(z));
  g.add(handle, clubHead);
  g.userData.legs = [legL, legR];
  g.userData.body = body;
  g.scale.setScalar(s * 0.9);
  return bake(g, [...g.userData.legs, g.userData.body]);
}

// Giant boss: bone-white colossus, horned helm, chest strap, greatsword.
export function makeBoss() {
  const g = new THREE.Group();
  const body = rbox(1.9, 2.3, 1.5, C.boss, 0, 1.6, 0, 0.3, 0.03);
  const belly = rbox(1.5, 1.2, 0.5, C.bossDark, 0, 1.3, 0.55, 0.2);
  const strap = box(0.3, 2.4, 1.6, C.leather, 0, 1.6, 0.02);
  strap.rotation.z = 0.7;
  const head = rbox(1.2, 1.05, 1.15, C.boss, 0, 3.3, 0, 0.3, 0.03);
  const helm = rbox(1.3, 0.5, 1.25, C.bossDark, 0, 3.7, -0.02, 0.3);
  const hornL = cone(0.16, 0.9, 0xf4f4f4, -0.8, 3.95, 0, 6);
  hornL.rotation.z = 1.0;
  const hornR = cone(0.16, 0.9, 0xf4f4f4, 0.8, 3.95, 0, 6);
  hornR.rotation.z = -1.0;
  const legL = rbox(0.6, 0.9, 0.6, C.bossDark, -0.5, 0.45, 0, 0.1);
  const legR = rbox(0.6, 0.9, 0.6, C.bossDark, 0.5, 0.45, 0, 0.1);
  const armR = rbox(0.5, 1.6, 0.5, C.boss, 1.25, 1.9, 0.2, 0.15);
  const armL = rbox(0.5, 1.4, 0.5, C.boss, -1.25, 1.8, 0.1, 0.15);
  const sword = box(0.34, 3.6, 0.14, C.white, 1.3, 3.0, 0.9);
  sword.rotation.x = 0.35;
  const guard = box(1.0, 0.18, 0.2, C.steel, 1.3, 1.5, 0.5);
  guard.rotation.x = 0.35;
  g.add(body, belly, strap, head, helm, hornL, hornR, legL, legR, armR, armL, sword, guard);
  g.add(face(0.9, 0.8, 0, 3.2, 0.59, 'angry'));
  g.userData.legs = [legL, legR];
  g.userData.body = body;
  return bake(g, [...g.userData.legs, g.userData.body]);
}

// The King before he earns his horse.
export function makeKingFoot() {
  const g = humanoid({ shirt: C.blue });
  const plate = rbox(0.48, 0.4, 0.14, C.steel, 0, 0.66, 0.2, 0.06);
  const cape = rbox(0.62, 0.8, 0.1, C.blue, 0, 0.55, -0.24, 0.05);
  const beard = rbox(0.5, 0.2, 0.16, 0x5a3a20, 0, 0.98, 0.26, 0.06);
  const crown = cyl(0.36, 0.32, 0.26, C.gold, 0, 1.62, -0.02, 8);
  g.add(plate, cape, beard, crown);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(box(0.14, 0.28, 0.1, C.gold, Math.cos(a) * 0.32, 1.87, -0.02 + Math.sin(a) * 0.32).rotateY(-a));
  }
  g.add(box(0.14, 0.14, 0.1, C.red, 0, 1.72, 0.33));
  const b = bow(C.gold, 0.4);
  b.position.set(0.44, 0.7, 0.24);
  b.rotation.y = -0.4;
  g.add(b);
  return bake(g, [...g.userData.legs, g.userData.body]);
}

// The Queen: long dress, tiara, long hair. She never fights.
export function makeQueen() {
  const g = new THREE.Group();
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 10), mat(0xf07aa8));
  skirt.position.y = 0.35;
  skirt.castShadow = true;
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 14), mat(0xd85a8c));
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.05;
  const bodice = rbox(0.5, 0.5, 0.34, 0xf07aa8, 0, 0.82, 0, 0.12, 0.05);
  const sash = box(0.52, 0.08, 0.36, C.gold, 0, 0.62, 0);
  const collar = box(0.36, 0.1, 0.3, 0xfff1f5, 0, 1.03, 0.04);
  const armL = rbox(0.15, 0.4, 0.15, C.skin, -0.32, 0.8, 0.02, 0.06);
  const armR = rbox(0.15, 0.4, 0.15, C.skin, 0.32, 0.8, 0.02, 0.06);
  const head = rbox(0.66, 0.58, 0.62, C.skin, 0, 1.4, 0, 0.24, 0.04);
  const hairColor = 0x7a3b12;
  const cap = rbox(0.7, 0.28, 0.66, hairColor, 0, 1.6, -0.02, 0.22, 0.04);
  const fringe = rbox(0.6, 0.12, 0.14, hairColor, 0, 1.5, 0.27, 0.05);
  const back = rbox(0.56, 0.9, 0.2, hairColor, 0, 1.15, -0.3, 0.1);
  const sideL = rbox(0.12, 0.5, 0.3, hairColor, -0.34, 1.3, -0.1, 0.05);
  const sideR = rbox(0.12, 0.5, 0.3, hairColor, 0.34, 1.3, -0.1, 0.05);
  const tiara = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 16, Math.PI), mat(C.gold));
  tiara.position.set(0, 1.72, 0);
  tiara.rotation.x = -Math.PI / 2;
  tiara.rotation.z = Math.PI;
  const jewel = box(0.1, 0.14, 0.08, 0x9ad4ff, 0, 1.78, 0.3);
  g.add(skirt, hem, bodice, sash, collar, armL, armR, head, cap, fringe, back, sideL, sideR, tiara, jewel);
  g.add(face(0.48, 0.42, 0, 1.34, 0.315, 'normal'));
  g.userData.legs = [];
  g.userData.body = bodice;
  return bake(g, [...g.userData.legs, g.userData.body]);
}

// The Royal Keep: a small stone castle with a balcony the Queen stands on.
export function makeKeep() {
  const g = new THREE.Group();
  const base = box(3.4, 2.6, 3.4, 0x8d9096, 0, 1.3, 0);
  g.add(base);
  for (let y = 0.45; y < 2.6; y += 0.5) {
    g.add(box(3.44, 0.05, 3.44, 0x6b6f75, 0, y, 0));
    for (let x = -1.2 + ((y * 7) % 2) * 0.5; x < 1.6; x += 1.0) g.add(box(0.05, 0.45, 3.45, 0x6b6f75, x, y + 0.27, 0));
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cyl(0.5, 0.55, 3.4, 0x7d848e, sx * 1.6, 1.7, sz * 1.6, 8));
  const tower = cyl(1.1, 1.2, 2.2, 0x8d9096, 0, 3.6, 0, 10);
  const roof = cone(1.4, 1.6, 0x2f6fd6, 0, 5.5, 0, 10);
  const pole = box(0.06, 1.0, 0.06, C.darkWood, 0, 6.5, 0);
  const flag = cyl(0.42, 0.36, 0.3, C.gold, 0, 7.15, 0, 8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(box(0.16, 0.34, 0.12, C.gold, Math.cos(a) * 0.38, 7.45, Math.sin(a) * 0.38).rotateY(-a));
  }
  g.add(box(0.16, 0.16, 0.12, C.red, 0, 7.2, 0.42));
  const door = box(0.9, 1.4, 0.12, 0x3a2a1a, 0, 0.7, 1.72);
  const arch = box(1.2, 0.2, 0.14, 0x6b6f75, 0, 1.5, 1.72);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cone(0.6, 0.8, 0x2f6fd6, sx * 1.6, 3.8, sz * 1.6, 8));
  // balcony on the front of the tower
  const balcony = box(2.0, 0.2, 1.0, 0x6b6f75, 0, 2.7, 1.9);
  const rail = box(2.0, 0.5, 0.1, C.darkWood, 0, 3.05, 2.35);
  const railL = box(0.1, 0.5, 1.0, C.darkWood, -0.95, 3.05, 1.9);
  const railR = box(0.1, 0.5, 1.0, C.darkWood, 0.95, 3.05, 1.9);
  const window = box(0.6, 0.8, 0.1, 0x9ad4ff, 0, 3.6, 1.1);
  const banner = box(0.6, 1.0, 0.06, 0xf07aa8, -1.75, 1.6, 0.6);
  banner.rotation.y = Math.PI / 2;
  g.add(tower, roof, pole, flag, door, arch, balcony, rail, railL, railR, window, banner);
  g.userData.balcony = new THREE.Vector3(0, 2.8, 1.85);
  return bake(g);
}

export function makeKing() {
  const g = new THREE.Group();
  // horse (long axis along z)
  const hb = rbox(0.66, 0.62, 1.3, C.horse, 0, 0.85, 0, 0.18, 0.04);
  const neck = rbox(0.36, 0.62, 0.36, C.horse, 0, 1.25, 0.62, 0.1);
  neck.rotation.x = -0.4;
  const head = rbox(0.38, 0.36, 0.6, C.horse, 0, 1.55, 0.86, 0.1, 0.04);
  head.add(face(0.3, 0.2, 0, 0.06, 0.31, 'normal'));
  const earL = cone(0.06, 0.16, C.horse, -0.12, 1.78, 0.7, 4);
  const earR = cone(0.06, 0.16, C.horse, 0.12, 1.78, 0.7, 4);
  const mane = rbox(0.16, 0.5, 0.55, C.mane, 0, 1.48, 0.5, 0.06);
  const tail = rbox(0.16, 0.6, 0.16, C.mane, 0, 0.72, -0.72, 0.06);
  tail.rotation.x = 0.4;
  const bridle = box(0.42, 0.06, 0.06, C.leather, 0, 1.5, 0.98);
  const legs = [];
  for (const [x, z] of [[-0.22, 0.45], [0.22, 0.45], [-0.22, -0.45], [0.22, -0.45]]) {
    const l = rbox(0.2, 0.55, 0.2, C.horse, x, 0.28, z, 0.06);
    l.add(box(0.22, 0.1, 0.22, C.shoes, 0, -0.25, 0));
    legs.push(l);
    g.add(l);
  }
  const saddle = rbox(0.74, 0.16, 0.6, C.leather, 0, 1.17, -0.05, 0.05);
  const blanket = box(0.8, 0.1, 0.8, C.blue, 0, 1.12, -0.05);
  g.add(hb, neck, head, earL, earR, mane, tail, bridle, blanket, saddle);
  // rider
  const body = rbox(0.6, 0.6, 0.42, C.blue, 0, 1.55, -0.05, 0.12, 0.05);
  const plate = rbox(0.5, 0.42, 0.14, C.steel, 0, 1.6, 0.19, 0.06);
  const cape = rbox(0.66, 0.9, 0.1, C.blue, 0, 1.35, -0.3, 0.05);
  const armL = rbox(0.17, 0.42, 0.17, C.skin, -0.4, 1.5, 0.05, 0.07);
  const armR = rbox(0.17, 0.42, 0.17, C.skin, 0.4, 1.5, 0.05, 0.07);
  const rhead = rbox(0.68, 0.6, 0.64, C.skin, 0, 2.15, -0.05, 0.24, 0.04);
  const rhair = rbox(0.72, 0.26, 0.68, C.hair, 0, 2.35, -0.07, 0.22, 0.04);
  const beard = rbox(0.5, 0.2, 0.16, 0x5a3a20, 0, 1.92, 0.24, 0.06);
  g.add(body, plate, cape, armL, armR, rhead, rhair, beard);
  g.add(face(0.52, 0.46, 0, 2.08, 0.285, 'normal'));
  // crown: gold band with tall points
  const crown = cyl(0.36, 0.32, 0.26, C.gold, 0, 2.6, -0.05, 8);
  g.add(crown);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(box(0.14, 0.28, 0.1, C.gold, Math.cos(a) * 0.32, 2.85, -0.05 + Math.sin(a) * 0.32).rotateY(-a));
  }
  g.add(box(0.14, 0.14, 0.1, C.red, 0, 2.7, 0.3));
  const b = bow(C.gold, 0.4);
  b.position.set(0.44, 1.6, 0.3);
  b.rotation.y = -0.4;
  g.add(b);
  g.userData.legs = legs;
  g.userData.body = hb;
  return bake(g, [...g.userData.legs, g.userData.body]);
}

// ---- items ----
const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14);
const coinMat = new THREE.MeshToonMaterial({ color: C.gold, gradientMap, emissive: 0x3a2a00 });
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
const streakMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
const streakGeo = new THREE.BoxGeometry(0.08, 0.08, 1.8);
export function makeArrow() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(arrowGeo, arrowMat);
  const tip = cone(0.06, 0.16, C.steel, 0, 0, 0.42, 4);
  tip.rotation.x = Math.PI / 2;
  const streak = new THREE.Mesh(streakGeo, streakMat);
  streak.position.z = -1.1;
  g.add(shaft, tip, streak);
  return g;
}

// ---- effects ----
const ringGeo = new THREE.RingGeometry(0.7, 1.15, 32);
const columnGeo = new THREE.CylinderGeometry(0.8, 1.1, 3.0, 18, 1, true);
export function makeSpawnFx(color = 0xff9a2e) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  const ring2 = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.08;
  ring2.scale.setScalar(0.5);
  const column = new THREE.Mesh(columnGeo, new THREE.MeshBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  column.position.y = 1.3;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.04;
  g.add(glow, ring, ring2, column);
  g.userData = { ring, ring2, column, glow };
  const sparks = [];
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffd166 : 0xff8a3a, transparent: true, opacity: 1 }));
    const a = (i / 8) * Math.PI * 2;
    sp.position.set(Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5);
    sp.userData = { vx: Math.cos(a) * 1.4, vz: Math.sin(a) * 1.4, vy: 3 + Math.random() * 2 };
    g.add(sp);
    sparks.push(sp);
  }
  g.userData.sparks = sparks;
  return g;
}

const burstCache = {};
export function makeBurst(color = '#ffffff') {
  if (!burstCache[color]) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.translate(64, 64);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? 22 : 60;
      const a = (i / 16) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    burstCache[color] = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstCache[color], transparent: true, depthTest: false }));
  s.renderOrder = 15;
  return s;
}

// ---- structures ----
export function makeHut() {
  const g = new THREE.Group();
  const base = box(3.4, 1.7, 2.6, C.wood, 0, 0.85, 0);
  g.add(base);
  for (let y = 0.35; y < 1.7; y += 0.42) g.add(box(3.44, 0.04, 2.64, C.darkWood, 0, y, 0));
  const door = box(0.7, 1.1, 0.1, 0x3a2a1a, 0.6, 0.55, 1.33);
  const window = box(0.5, 0.5, 0.1, 0x9ad4ff, -0.7, 1.0, 1.33);
  const frame = box(0.6, 0.6, 0.06, C.darkWood, -0.7, 1.0, 1.31);
  const roofL = box(2.1, 0.22, 3.2, C.roof, -0.95, 2.15, 0);
  roofL.rotation.z = 0.6;
  const roofR = box(2.1, 0.22, 3.2, C.roof, 0.95, 2.15, 0);
  roofR.rotation.z = -0.6;
  for (let i = 0; i < 4; i++) {
    const sl = box(0.06, 0.05, 3.24, 0x5e3c22, -0.35 - i * 0.42, 1.73 + i * 0.29, 0);
    sl.rotation.z = 0.6;
    const sr = box(0.06, 0.05, 3.24, 0x5e3c22, 0.35 + i * 0.42, 1.73 + i * 0.29, 0);
    sr.rotation.z = -0.6;
    g.add(sl, sr);
  }
  const ridge = box(0.3, 0.3, 3.3, C.darkWood, 0, 2.7, 0);
  const target = cyl(0.45, 0.45, 0.1, C.white, 0, 1.2, -1.36, 12);
  target.rotation.x = Math.PI / 2;
  const target2 = cyl(0.28, 0.28, 0.12, C.red, 0, 1.2, -1.38, 12);
  target2.rotation.x = Math.PI / 2;
  const target3 = cyl(0.1, 0.1, 0.14, C.white, 0, 1.2, -1.4, 12);
  target3.rotation.x = Math.PI / 2;
  const post = box(0.16, 1.0, 0.16, C.darkWood, 1.9, 0.5, 1.5);
  const post2 = box(0.16, 1.0, 0.16, C.darkWood, -1.9, 0.5, 1.5);
  const lantern = box(0.12, 1.8, 0.12, C.darkWood, 2.3, 0.9, -1.2);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  lamp.position.set(2.3, 1.85, -1.2);
  const lampCap = box(0.4, 0.08, 0.4, C.darkWood, 2.3, 2.06, -1.2);
  g.add(door, window, frame, roofL, roofR, ridge, target, target2, target3, post, post2, lantern, lamp, lampCap);
  // gold bow sign on the ridge
  const sign = new THREE.Group();
  const bowArc = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.09, 8, 18, Math.PI), mat(C.gold));
  bowArc.rotation.z = -Math.PI / 2;
  const string = box(0.05, 1.5, 0.05, 0xfff2c0, -0.02, 0, 0);
  const arrowShaft = box(0.07, 0.07, 1.6, C.gold, 0.35, 0, 0.1);
  const arrowTip = cone(0.14, 0.3, 0xfff2c0, 0.35, 0, 1.0, 4);
  arrowTip.rotation.x = Math.PI / 2;
  sign.add(bowArc, string, arrowShaft, arrowTip);
  sign.position.set(0, 3.7, 0);
  sign.rotation.y = Math.PI / 2;
  const signPost = box(0.1, 1.0, 0.1, C.darkWood, 0, 3.2, 0);
  g.add(sign, signPost);
  return bake(g);
}

export function makeTower() {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    g.add(cyl(0.14, 0.18, 2.6, C.darkWood, x, 1.3, z, 6));
  }
  for (const [x, z, ry] of [[0, 0.95, 0], [0, -0.95, 0], [0.95, 0, Math.PI / 2], [-0.95, 0, Math.PI / 2]]) {
    const a = box(2.3, 0.12, 0.12, C.wood, x, 1.3, z);
    a.rotation.y = ry;
    a.rotation.z = 0.7;
    const b = box(2.3, 0.12, 0.12, C.wood, x, 1.3, z);
    b.rotation.y = ry;
    b.rotation.z = -0.7;
    g.add(a, b);
  }
  const platform = box(2.5, 0.22, 2.5, C.wood, 0, 2.6, 0);
  g.add(platform);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const r = box(i % 2 ? 0.1 : 2.5, 0.4, i % 2 ? 2.5 : 0.1, C.darkWood, Math.cos(a) * 1.2 * (i % 2), 2.9, Math.sin(a) * 1.2 * ((i + 1) % 2));
    g.add(r);
  }
  // peaked roof on four posts with a pennant
  for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) g.add(box(0.12, 1.6, 0.12, C.darkWood, x, 3.5, z));
  const roof = cone(2.0, 1.2, C.roof, 0, 4.9, 0, 4);
  roof.rotation.y = Math.PI / 4;
  const pole = box(0.06, 1.2, 0.06, C.darkWood, 0, 5.9, 0);
  const flag = box(0.7, 0.4, 0.04, C.blue, 0.38, 6.2, 0);
  // gold arrow sign
  const arrow = box(0.08, 0.08, 1.4, C.gold, 0, 6.7, 0);
  const tip = cone(0.16, 0.34, C.gold, 0, 6.7, 0.85, 4);
  tip.rotation.x = Math.PI / 2;
  const fletch = box(0.3, 0.2, 0.3, 0xfff2c0, 0, 6.7, -0.6);
  g.add(roof, pole, flag, arrow, tip, fletch);
  g.userData.top = 2.72;
  return bake(g);
}

export function makeBarracks() {
  const g = new THREE.Group();
  const base = box(4.2, 2.0, 3.0, 0x8d9096, 0, 1.0, 0);
  g.add(base);
  // stone block courses
  for (let y = 0.3; y < 2.0; y += 0.45) {
    g.add(box(4.24, 0.05, 3.04, 0x6b6f75, 0, y, 0));
    for (let x = -1.6 + ((y * 7) % 2) * 0.45; x < 2.0; x += 0.9) g.add(box(0.05, 0.4, 3.05, 0x6b6f75, x, y + 0.24, 0));
  }
  const roofL = box(2.5, 0.22, 3.5, 0x555a66, -1.15, 2.5, 0);
  roofL.rotation.z = 0.55;
  const roofR = box(2.5, 0.22, 3.5, 0x555a66, 1.15, 2.5, 0);
  roofR.rotation.z = -0.55;
  for (let i = 0; i < 4; i++) {
    const sl = box(0.06, 0.05, 3.54, 0x3f4450, -0.4 - i * 0.5, 2.05 + i * 0.3, 0);
    sl.rotation.z = 0.55;
    const sr = box(0.06, 0.05, 3.54, 0x3f4450, 0.4 + i * 0.5, 2.05 + i * 0.3, 0);
    sr.rotation.z = -0.55;
    g.add(sl, sr);
  }
  const door = box(1.0, 1.4, 0.1, 0x3a2a1a, 0, 0.7, 1.53);
  const arch = box(1.2, 0.2, 0.12, 0x6b6f75, 0, 1.5, 1.52);
  const flagPole = cyl(0.05, 0.05, 2.6, C.darkWood, 1.6, 3.8, 0, 5);
  const flag = box(1.0, 0.55, 0.05, C.blue, 2.1, 4.8, 0);
  const shield = rbox(0.9, 1.1, 0.1, C.red, 0, 2.1, 1.56, 0.12);
  const swords = box(0.12, 1.6, 0.08, C.gold, 0, 2.1, 1.64);
  swords.rotation.z = 0.7;
  const swords2 = box(0.12, 1.6, 0.08, C.gold, 0, 2.1, 1.64);
  swords2.rotation.z = -0.7;
  g.add(shield);
  const crate = rbox(0.7, 0.7, 0.7, 0xd6b24a, -2.6, 0.35, 0.9, 0.06);
  const crate2 = rbox(0.55, 0.55, 0.55, 0xd6b24a, -2.5, 0.28, 0.1, 0.06);
  g.add(roofL, roofR, door, arch, flagPole, flag, swords, swords2, crate, crate2);
  return bake(g);
}

// Wall materials: index matches CFG.wallLevels (wood, brick, stone, iron).
const WALL_STYLE = [
  { pickets: true },
  { color: 0xb5583f, trim: 0x8a3f2c, mortar: 0xd9a48c, h: 2.3, thick: 0.7 },
  { color: 0x8d9096, trim: 0x686c73, mortar: 0xb4b8be, h: 2.7, thick: 0.9 },
  { color: 0x59636e, trim: 0x3d454d, mortar: 0x9fb0bd, h: 3.0, thick: 0.9, spikes: true },
];

export function makeFence(length) {
  const g = new THREE.Group();
  const rail = box(length, 0.2, 0.14, C.wood, 0, 1.35, 0.2);
  const rail2 = box(length, 0.2, 0.14, C.wood, 0, 0.55, 0.2);
  g.add(rail, rail2);
  const n = Math.max(2, Math.round(length / 0.48));
  const picketGeo = new THREE.BoxGeometry(0.34, 2.1, 0.34);
  const pickets = new THREE.InstancedMesh(picketGeo, mat(C.darkWood), n);
  const tipGeo = new THREE.ConeGeometry(0.24, 0.35, 4);
  const tips = new THREE.InstancedMesh(tipGeo, mat(C.wood), n);
  pickets.castShadow = tips.castShadow = true;
  pickets.receiveShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + 0.2 + (i / (n - 1)) * (length - 0.4);
    const h = 1.05 + ((i * 7) % 3) * 0.06;
    m.makeTranslation(x, h, 0);
    pickets.setMatrixAt(i, m);
    m.makeRotationY(Math.PI / 4);
    m.setPosition(x, h + 1.22, 0);
    tips.setMatrixAt(i, m);
  }
  g.add(pickets, tips);
  return bake(g);
}

export function makeWallSegment(length, level = 0) {
  const st = WALL_STYLE[Math.min(level, WALL_STYLE.length - 1)];
  if (st.pickets) return makeFence(length);
  const g = new THREE.Group();
  const body = box(length, st.h, st.thick, st.color, 0, st.h / 2, 0);
  const base = box(length, 0.35, st.thick + 0.25, st.trim, 0, 0.17, 0);
  g.add(body, base);
  // mortar / plate lines
  for (let y = 0.7; y < st.h - 0.2; y += 0.55) {
    g.add(box(length + 0.02, 0.05, st.thick + 0.03, st.mortar, 0, y, 0));
  }
  // crenellations
  const n = Math.max(2, Math.floor(length / 1.2));
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + 0.6 + (i / Math.max(1, n - 1)) * (length - 1.2);
    g.add(box(0.6, 0.5, st.thick + 0.05, st.trim, x, st.h + 0.25, 0));
    if (st.spikes) {
      const sp = cone(0.14, 0.5, st.mortar, x, st.h + 0.75, 0, 4);
      g.add(sp);
    }
  }
  return bake(g);
}

export function makeRubble(length, level = 0) {
  const g = new THREE.Group();
  const st = WALL_STYLE[Math.min(level, WALL_STYLE.length - 1)];
  const col = st.pickets ? C.darkWood : st.color;
  const col2 = st.pickets ? C.wood : st.trim;
  const n = Math.max(3, Math.round(length / 1.4));
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + 0.6 + (i / Math.max(1, n - 1)) * (length - 1.2);
    const b = st.pickets
      ? box(0.22, 0.4 + Math.random() * 0.5, 0.22, col, x, 0.2, (Math.random() - 0.5) * 0.4)
      : box(0.5 + Math.random() * 0.4, 0.35 + Math.random() * 0.3, 0.5, i % 2 ? col : col2, x, 0.2, (Math.random() - 0.5) * 0.8);
    b.rotation.z = (Math.random() - 0.5) * 0.9;
    b.rotation.x = (Math.random() - 0.5) * 0.9;
    g.add(b);
  }
  const plank = box(1.4, 0.12, 0.3, col2, 0, 0.08, 0.3);
  plank.rotation.y = 0.5;
  g.add(plank);
  return bake(g);
}

export function makeGate(level = 0) {
  const st = WALL_STYLE[Math.min(level, WALL_STYLE.length - 1)];
  const postCol = st.pickets ? C.darkWood : st.trim;
  const beamCol = st.pickets ? C.wood : st.color;
  const g = new THREE.Group();
  const postL = box(0.5, 3.2, 0.5, postCol, -1.85, 1.6, 0);
  const postR = box(0.5, 3.2, 0.5, postCol, 1.85, 1.6, 0);
  const top = box(4.4, 0.45, 0.6, beamCol, 0, 3.4, 0);
  const cap = box(4.8, 0.2, 0.8, postCol, 0, 3.7, 0);
  const banner = box(0.9, 1.1, 0.08, C.blue, 0, 2.6, 0.3);
  const crest = cyl(0.22, 0.22, 0.1, C.gold, 0, 2.65, 0.36, 6);
  crest.rotation.x = Math.PI / 2;
  // doors standing open, swung inward
  const doorL = new THREE.Group();
  const panelL = st.pickets ? makeFence(1.5) : box(1.5, 2.4, 0.2, beamCol, 0, 1.2, 0);
  panelL.position.x = 0.75;
  doorL.add(panelL);
  doorL.position.set(-1.6, 0, 0.1);
  doorL.rotation.y = -1.15;
  const doorR = new THREE.Group();
  const panelR = st.pickets ? makeFence(1.5) : box(1.5, 2.4, 0.2, beamCol, 0, 1.2, 0);
  panelR.position.x = -0.75;
  doorR.add(panelR);
  doorR.position.set(1.6, 0, 0.1);
  doorR.rotation.y = 1.15;
  g.add(postL, postR, top, cap, banner, crest, doorL, doorR);
  return bake(g);
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
  return bake(g);
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
  return bake(g);
}

export function makeRock(scale = 1) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), mat(C.rock));
  m.scale.set(scale * 1.2, scale * 0.7, scale);
  m.position.y = 0.3 * scale;
  m.castShadow = true;
  m.receiveShadow = true;
  const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), mat(0xa9aeb5));
  cap.scale.set(scale * 1.1, scale * 0.45, scale * 0.9);
  cap.position.y = 0.55 * scale;
  g.add(m, cap);
  g.rotation.y = Math.random() * Math.PI;
  return bake(g);
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
  return bake(g);
}

export function makePeak(r, h) {
  const g = new THREE.Group();
  const body = cone(r, h, C.cliff, 0, h / 2, 0, 7);
  const snow = cone(r * 0.32, h * 0.32, 0xf4f4f4, 0, h - h * 0.16 + 0.02, 0, 7);
  g.add(body, snow);
  g.rotation.y = Math.random() * Math.PI;
  return bake(g);
}

// Plank bridge, long axis along z (rotated to the road direction by the caller).
export function makeBridge(length, width) {
  const g = new THREE.Group();
  const deck = box(width, 0.25, length, C.wood, 0, 0.32, 0);
  g.add(deck);
  const n = Math.floor(length / 0.55);
  for (let i = 0; i < n; i++) g.add(box(width + 0.02, 0.06, 0.08, C.darkWood, 0, 0.47, -length / 2 + 0.3 + i * 0.55));
  for (const sx of [-1, 1]) {
    g.add(box(0.14, 0.12, length, C.darkWood, sx * (width / 2 - 0.1), 1.0, 0));
    for (let z = -length / 2 + 0.4; z < length / 2; z += 1.4) g.add(box(0.14, 0.75, 0.14, C.darkWood, sx * (width / 2 - 0.1), 0.7, z));
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.26, 1.3, 0.26, C.darkWood, sx * (width / 2 - 0.1), 0.65, sz * (length / 2 - 0.2)));
  return bake(g);
}

// ---- resource nodes ----
export function makeLumberTree() {
  const g = makeTree(1.15);
  const logs = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const l = cyl(0.16, 0.16, 1.0, C.mane, 0.9 + i * 0.1, 0.16 + i * 0.3, 0.6 - i * 0.2, 6);
    l.rotation.z = Math.PI / 2;
    l.rotation.y = 0.4;
    logs.add(l);
  }
  const stump = cyl(0.22, 0.26, 0.3, C.mane, -0.9, 0.15, -0.5, 7);
  g.add(logs, stump);
  return bake(g);
}

export function makeOreRock() {
  const g = new THREE.Group();
  for (const [x, z, sc] of [[0, 0, 1.4], [1.1, 0.4, 0.9], [-0.9, 0.7, 0.8], [0.3, -1.0, 0.7]]) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), mat(0x6f747a));
    r.scale.set(sc * 1.2, sc * 0.8, sc);
    r.position.set(x, 0.35 * sc, z);
    r.rotation.y = x + z;
    r.castShadow = true;
    g.add(r);
  }
  for (const [x, y, z] of [[0.2, 0.9, 0.3], [-0.4, 0.7, -0.2], [0.9, 0.7, 0.6]]) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshToonMaterial({ color: 0xbfe6ff, gradientMap, emissive: 0x3a5a70 }));
    c.position.set(x, y, z);
    c.rotation.set(0.4, x, 0.3);
    g.add(c);
  }
  const pick = box(0.08, 1.1, 0.08, C.darkWood, -1.3, 0.55, 0.8);
  pick.rotation.z = 0.5;
  pick.add(box(0.5, 0.12, 0.1, C.steel, 0, 0.5, 0));
  g.add(pick);
  return bake(g);
}

const cubeGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
const RES_COLORS = { wood: 0x8a5a2b, stone: 0x8d9096, straw: 0xe0c25a };
export const RES_MATS = { wood: mat(0x8a5a2b), stone: mat(0x8d9096), straw: mat(0xe0c25a) };
export const CHIP_GEO = new THREE.BoxGeometry(0.16, 0.16, 0.16);
export function makeResourceCube(type) {
  const m = new THREE.Mesh(cubeGeo, mat(RES_COLORS[type] || 0xffffff));
  m.castShadow = true;
  return m;
}

// hand tools the King swings while gathering
export function makeTool(type) {
  const g = new THREE.Group();
  const handle = box(0.07, 0.9, 0.07, C.darkWood, 0, 0.35, 0);
  g.add(handle);
  if (type === 'wood') {
    g.add(box(0.28, 0.3, 0.06, C.steel, 0.14, 0.72, 0));
  } else if (type === 'stone') {
    const head = box(0.6, 0.1, 0.08, C.steel, 0, 0.78, 0);
    g.add(head, cone(0.05, 0.16, C.steel, 0.36, 0.78, 0, 4).rotateZ(-Math.PI / 2), cone(0.05, 0.16, C.steel, -0.36, 0.78, 0, 4).rotateZ(Math.PI / 2));
  } else {
    const blade = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 5, 10, Math.PI * 1.2), mat(C.steel));
    blade.position.set(0.12, 0.8, 0);
    g.add(blade);
  }
  return g;
}

export function makeHayBale() {
  const g = new THREE.Group();
  const bale = cyl(0.55, 0.55, 0.9, 0xe0c25a, 0, 0.55, 0, 12);
  bale.rotation.z = Math.PI / 2;
  const band1 = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.03, 5, 14), mat(C.leather));
  band1.rotation.y = Math.PI / 2;
  band1.position.set(-0.25, 0.55, 0);
  const band2 = band1.clone();
  band2.position.x = 0.25;
  g.add(bale, band1, band2);
  g.rotation.y = Math.random() * Math.PI;
  return bake(g);
}

export function makeWheatField(w, d) {
  const g = new THREE.Group();
  const soil = box(w, 0.1, d, 0xb8922e, 0, 0.05, 0);
  g.add(soil);
  const rows = Math.floor(w / 0.9);
  const stalkGeo = new THREE.BoxGeometry(0.16, 0.9, 0.16);
  const stalks = new THREE.InstancedMesh(stalkGeo, mat(0xd6b24a), rows * Math.floor(d / 0.6));
  const headGeo = new THREE.SphereGeometry(0.13, 5, 4);
  const heads = new THREE.InstancedMesh(headGeo, mat(0xe8d17a), stalks.count);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let z = -d / 2 + 0.4; z < d / 2 - 0.2; z += 0.6) {
      const x = -w / 2 + 0.6 + r * 0.9;
      m.makeTranslation(x, 0.55, z);
      stalks.setMatrixAt(i, m);
      m.makeTranslation(x, 1.05, z);
      heads.setMatrixAt(i, m);
      i++;
    }
  }
  stalks.count = heads.count = i;
  stalks.castShadow = true;
  g.add(stalks, heads);
  // low fence
  for (const [x, z, len, ry] of [[0, -d / 2 - 0.3, w + 0.6, 0], [0, d / 2 + 0.3, w + 0.6, 0], [-w / 2 - 0.3, 0, d + 0.6, Math.PI / 2], [w / 2 + 0.3, 0, d + 0.6, Math.PI / 2]]) {
    const rail = box(len, 0.08, 0.08, C.darkWood, x, 0.5, z);
    rail.rotation.y = ry;
    g.add(rail);
    for (let t = -len / 2 + 0.3; t < len / 2; t += 1.5) {
      const post = box(0.12, 0.7, 0.12, C.darkWood, ry ? x : x + t, 0.35, ry ? z + t : z);
      g.add(post);
    }
  }
  return bake(g);
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

const RES_ICON = { wood: '🪵', stone: '🪨', straw: '🌾' };
export function drawPad(canvas, tex, { icon, remaining, label, paid, currency = 'coins', res = [], active = false }) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  const r = 26;
  ctx.beginPath();
  ctx.roundRect(14, 14, 228, 228, r);
  ctx.fillStyle = active ? 'rgba(255, 230, 120, 0.42)' : 'rgba(70, 60, 45, 0.55)';
  ctx.fill();
  if (paid > 0) {
    ctx.save();
    ctx.clip();
    const hgt = 228 * Math.min(1, paid);
    ctx.fillStyle = '#3fd455';
    ctx.fillRect(14, 242 - hgt, 228, hgt);
    ctx.restore();
  }
  ctx.strokeStyle = active ? '#ffd93d' : 'rgba(255,255,255,0.95)';
  ctx.lineWidth = active ? 14 : 11;
  ctx.lineCap = 'round';
  const L = active ? 52 : 40;
  for (const [x, y, sx, sy] of [[14, 14, 1, 1], [242, 14, -1, 1], [14, 242, 1, -1], [242, 242, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * L, y + sy * 6);
    ctx.lineTo(x + sx * 6, y + sy * 6);
    ctx.lineTo(x + sx * 6, y + sy * L);
    ctx.stroke();
  }
  const hasRes = res.length > 0;
  ctx.font = (hasRes ? '50px' : '62px') + ' system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, 128, hasRes ? 54 : 64);
  ctx.font = 'bold 24px "Trebuchet MS", system-ui, sans-serif';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.strokeText(label, 128, hasRes ? 96 : 112);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 128, hasRes ? 96 : 112);
  const priceY = hasRes ? 150 : 186;
  if (currency === 'archers') {
    ctx.beginPath();
    ctx.arc(70, priceY, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#2f6fd6';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1d4a99';
    ctx.stroke();
    ctx.font = '26px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.fillText('🧍', 70, priceY + 2);
  } else {
    ctx.beginPath();
    ctx.arc(70, priceY, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#f5b800';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#b07a00';
    ctx.stroke();
    ctx.font = 'bold 22px system-ui';
    ctx.fillStyle = '#b07a00';
    ctx.fillText('♛', 70, priceY + 2);
  }
  const bigNum = (n, x, y, size) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.font = `italic 900 ${size}px "Trebuchet MS", "Arial Black", system-ui, sans-serif`;
    ctx.lineWidth = size * 0.13;
    ctx.strokeStyle = '#1b1b24';
    ctx.strokeText(String(n), 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  };
  bigNum(remaining, 160, priceY, hasRes ? 64 : 78);
  // material rows
  const cols = res.length;
  res.forEach((row, i) => {
    const x = 128 + (i - (cols - 1) / 2) * 96;
    ctx.font = '30px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(RES_ICON[row.type], x - 26, 208);
    bigNum(row.remaining, x + 26, 208, 40);
  });
  tex.needsUpdate = true;
}

export function makePad() {
  const { canvas, tex } = makePadTexture();
  const geo = new THREE.PlaneGeometry(3.6, 3.6);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  mesh.receiveShadow = false;
  return { mesh, canvas, tex };
}

// ---- health bar: one sprite drawn on a canvas, so background and fill always line up ----
function drawBar(bar) {
  const { canvas, tex, green, frac } = bar.userData;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1b1b24';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 6);
  ctx.fill();
  ctx.fillStyle = green ? '#4ad06a' : '#e8342a';
  const w = Math.max(0, (canvas.width - 6) * Math.min(1, frac));
  if (w > 0) {
    ctx.beginPath();
    ctx.roundRect(3, 3, w, canvas.height - 6, 4);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(1, 1, canvas.width - 2, canvas.height - 2, 6);
  ctx.stroke();
  tex.needsUpdate = true;
}
export function makeHealthBar(width = 1.2, green = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 16;
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const s = new THREE.Sprite(m);
  s.scale.set(width, width / 6, 1);
  s.renderOrder = 10;
  s.visible = false;
  s.userData = { canvas, tex, green, frac: 1 };
  drawBar(s);
  return s;
}
export function setHealthBar(bar, frac) {
  const f = Math.max(0, Math.min(1, frac));
  if (Math.abs(f - bar.userData.frac) > 0.004) {
    bar.userData.frac = f;
    drawBar(bar);
  }
  bar.visible = f < 0.999;
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
