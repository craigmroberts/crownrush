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
export const gradientMap = new THREE.CanvasTexture(gradCanvas);
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.colorSpace = THREE.NoColorSpace;

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...opts }));
  return matCache.get(key);
}
// vertex-shader sway for grass and crops: bends with height, phase from the instance position
let swayUniform = { value: 0 };
export function setSwayUniform(u) {
  swayUniform = u;
}
export function swayMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSway = swayUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
        #else
          float ph = 0.0;
        #endif
        float bend = max(transformed.y, 0.0);
        transformed.x += sin(uSway * 1.7 + ph) * 0.14 * bend;
        transformed.z += cos(uSway * 1.3 + ph * 1.3) * 0.06 * bend;`);
  };
  return m;
}
// faceted low-poly look for rocks, canopies and cliffs
export function matFlat(color, opts = {}) {
  return mat(color, { flatShading: true, ...opts });
}
export const GHOST_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false });
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x1b1b24, side: THREE.BackSide });

export const C = {
  skin: 0xf6cfae, hair: 0x2a1e16, white: 0xf7f7f7, blue: 0x2f6fd6, navy: 0x3a3f5c, pants: 0x6b4a32, shoes: 0x2b2b2b,
  red: 0xd8262c, darkRed: 0xa31a1f, steel: 0xb9bec7, steelDark: 0x7d848e, gold: 0xf5b800, goldDark: 0xc98a00,
  horse: 0xe8d5b5, mane: 0x8a5a2b, wood: 0x9a6a3a, darkWood: 0x6b4a2b, roof: 0x7a4f30,
  leaf: 0x2f8f4e, leafDark: 0x257a42, rock: 0x8f959c, cliff: 0x5b5f63, grass: 0x4aa364,
  boss: 0xf4e9ec, bossDark: 0xe6cfd6, bow: 0x3b7bff, leather: 0x8a5a3a,
};

export function box(w, h, d, color, x = 0, y = 0, z = 0, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
// rounded box for the soft chibi shapes; `outline` adds a dark inverted hull
export function rbox(w, h, d, color, x = 0, y = 0, z = 0, r = 0.08, outline = 0) {
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
export function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export function cone(r, h, color, x = 0, y = 0, z = 0, seg = 7) {
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
export const BAKED_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, vertexColors: true });
export const BAKED_STD = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05, vertexColors: true });
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
    const m = o.material;
    if (!(m.isMeshToonMaterial || m.isMeshStandardMaterial) || m.transparent || m === BAKED_MAT || m === BAKED_STD || m.map) return;
    if (m.emissive && m.emissive.getHex() !== 0) return;
    parts.push(o);
  });
  const toGeo = (o, color) => {
    const geo = prepGeo(o.geometry);
    if (o.material.flatShading) {
      geo.deleteAttribute('normal');
      geo.computeVertexNormals(); // non-indexed, so this gives crisp per-face normals
    }
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    return color ? colorize(geo, color) : geo;
  };
  if (parts.length) {
    const m = new THREE.Mesh(mergeGeometries(parts.map((o) => toGeo(o, o.material.color)), false), BAKED_STD);
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

// ---- characters live in characters.js (smooth, painted-face figures) ----
export { makeArcher, makeSwordsman, makeKnight, makeElite, makeBrute, makeBoss, makeKing, makeKingFoot, makeQueen } from './characters.js';

// The Royal Keep: a small stone castle with a balcony the Queen stands on.
export function makeKeep() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(3.4, 2.6, 3.4, 2, 0.18), mat(0x8d9096));
  base.position.y = 1.3;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  for (let y = 0.45; y < 2.6; y += 0.5) {
    g.add(box(3.44, 0.05, 3.44, 0x6b6f75, 0, y, 0));
    for (let x = -1.2 + ((y * 7) % 2) * 0.5; x < 1.6; x += 1.0) g.add(box(0.05, 0.45, 3.45, 0x6b6f75, x, y + 0.27, 0));
  }
  // crenellated parapet
  for (let i = 0; i < 4; i++) {
    for (let t = -1.2; t <= 1.2; t += 0.8) {
      const x = i < 2 ? t : (i === 2 ? 1.6 : -1.6);
      const z = i < 2 ? (i === 0 ? 1.6 : -1.6) : t;
      g.add(box(0.4, 0.4, 0.4, 0x7d848e, x, 2.8, z, matFlat(0x7d848e)));
    }
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

// ---- items ----
const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14);
const coinMat = new THREE.MeshStandardMaterial({ color: C.gold, roughness: 0.45, metalness: 0.2, emissive: 0x3a2a00 });
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
// prism roof with overhang: a triangle extruded along z, plus shingle rows
function roof(width, depth, height, color, y, shingle) {
  const g = new THREE.Group();
  const shape = new THREE.Shape([new THREE.Vector2(-width / 2, 0), new THREE.Vector2(width / 2, 0), new THREE.Vector2(0, height)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(geo, matFlat(color));
  m.position.y = y;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  const slope = Math.hypot(width / 2, height);
  const ang = Math.atan2(height, width / 2);
  const rows = Math.max(2, Math.floor(slope / 0.42));
  for (let i = 0; i < rows; i++) {
    const t = (i + 0.5) / rows;
    for (const side of [-1, 1]) {
      const b = box(0.05, 0.06, depth + 0.02, shingle, side * (width / 2) * (1 - t), y + height * t + 0.03, 0, matFlat(shingle));
      b.rotation.z = -side * (Math.PI / 2 - ang);
      g.add(b);
    }
  }
  return g;
}

export function makeHut() {
  const g = new THREE.Group();
  // log walls
  const W = 3.4;
  const D = 2.6;
  for (let i = 0; i < 5; i++) {
    const y = 0.2 + i * 0.32;
    const long = i % 2 === 0;
    const lx = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, W + (long ? 0.4 : 0), 8), mat(C.wood));
    lx.rotation.z = Math.PI / 2;
    lx.position.set(0, y, D / 2);
    const lx2 = lx.clone();
    lx2.position.z = -D / 2;
    const lz = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, D + (long ? 0 : 0.4), 8), mat(C.darkWood));
    lz.rotation.x = Math.PI / 2;
    lz.position.set(W / 2, y, 0);
    const lz2 = lz.clone();
    lz2.position.x = -W / 2;
    for (const l of [lx, lx2, lz, lz2]) l.castShadow = l.receiveShadow = true;
    g.add(lx, lx2, lz, lz2);
  }
  g.add(box(W - 0.2, 1.7, D - 0.2, C.wood, 0, 0.85, 0));
  const door = box(0.7, 1.1, 0.12, 0x3a2a1a, 0.6, 0.55, D / 2 + 0.1);
  door.add(box(0.8, 0.08, 0.14, C.darkWood, 0, 0.58, 0), new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(C.gold)).translateX(0.25).translateZ(0.08));
  const window = box(0.5, 0.5, 0.12, 0x9ad4ff, -0.7, 1.0, D / 2 + 0.1);
  window.add(box(0.6, 0.6, 0.06, C.darkWood, 0, 0, -0.04), box(0.06, 0.5, 0.14, C.darkWood, 0, 0, 0.01), box(0.5, 0.06, 0.14, C.darkWood, 0, 0, 0.01));
  g.add(door, window);
  g.add(roof(W + 0.9, D + 0.8, 1.35, C.roof, 1.72, 0x5e3c22));
  g.add(box(0.36, 0.34, D + 0.9, C.darkWood, 0, 3.1, 0));
  // chimney with a lazy smoke trail
  const chimney = box(0.4, 0.9, 0.4, 0x7d848e, -0.9, 2.6, -0.5, matFlat(0x7d848e));
  g.add(chimney, box(0.5, 0.12, 0.5, 0x6b6f75, -0.9, 3.05, -0.5));
  // archery target and lantern
  const target = cyl(0.45, 0.45, 0.1, C.white, 0, 1.2, -D / 2 - 0.35, 12);
  target.rotation.x = Math.PI / 2;
  const target2 = cyl(0.28, 0.28, 0.12, C.red, 0, 1.2, -D / 2 - 0.37, 12);
  target2.rotation.x = Math.PI / 2;
  const target3 = cyl(0.1, 0.1, 0.14, C.white, 0, 1.2, -D / 2 - 0.39, 12);
  target3.rotation.x = Math.PI / 2;
  const lantern = box(0.12, 1.8, 0.12, C.darkWood, 2.3, 0.9, -1.2);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  lamp.position.set(2.3, 1.85, -1.2);
  const lampCap = box(0.4, 0.08, 0.4, C.darkWood, 2.3, 2.06, -1.2);
  g.add(target, target2, target3, lantern, lamp, lampCap);
  // gold bow sign on the ridge
  const sign = new THREE.Group();
  const bowArc = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.09, 8, 18, Math.PI), mat(C.gold, { roughness: 0.4, metalness: 0.2 }));
  bowArc.rotation.z = -Math.PI / 2;
  const string = box(0.05, 1.5, 0.05, 0xfff2c0, -0.02, 0, 0);
  const arrowShaft = box(0.07, 0.07, 1.6, C.gold, 0.35, 0, 0.1);
  const arrowTip = cone(0.14, 0.3, 0xfff2c0, 0.35, 0, 1.0, 4);
  arrowTip.rotation.x = Math.PI / 2;
  sign.add(bowArc, string, arrowShaft, arrowTip);
  sign.position.set(0, 4.0, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(sign, box(0.1, 0.8, 0.1, C.darkWood, 0, 3.5, 0));
  g.userData.chimney = new THREE.Vector3(-0.9, 3.1, -0.5);
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
  // peaked shingle roof on four posts with a pennant
  for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) g.add(box(0.12, 1.6, 0.12, C.darkWood, x, 3.5, z));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.3, 4), matFlat(C.roof));
  roof.position.y = 4.95;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.5) / 3;
    const ring = new THREE.Mesh(new THREE.ConeGeometry(2.1 * (1 - t) + 0.06, 0.09, 4, 1, true), matFlat(0x5e3c22));
    ring.position.y = 4.3 + 1.3 * t;
    ring.rotation.y = Math.PI / 4;
    g.add(ring);
  }
  const pole = box(0.06, 1.2, 0.06, C.darkWood, 0, 6.1, 0);
  const flag = box(0.7, 0.4, 0.04, C.blue, 0.38, 6.4, 0);
  // ladder up the front, a barrel and a lantern at the base
  const ladder = new THREE.Group();
  ladder.add(box(0.08, 2.6, 0.08, C.wood, -0.3, 1.3, 0), box(0.08, 2.6, 0.08, C.wood, 0.3, 1.3, 0));
  for (let y = 0.3; y < 2.5; y += 0.45) ladder.add(box(0.6, 0.06, 0.06, C.darkWood, 0, y, 0));
  ladder.position.set(0, 0, 1.35);
  ladder.rotation.x = -0.12;
  g.add(ladder);
  const barrel = cyl(0.32, 0.32, 0.7, C.wood, 1.45, 0.35, 0.9, 10);
  barrel.add(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 6, 14), mat(C.steelDark)).rotateX(Math.PI / 2).translateZ(0.2), new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 6, 14), mat(C.steelDark)).rotateX(Math.PI / 2).translateZ(-0.2));
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  lamp.position.set(-1.1, 2.95, 1.25);
  g.add(barrel, lamp);
  // gold arrow sign
  const arrow = box(0.08, 0.08, 1.4, C.gold, 0, 6.7, 0);
  const tip = cone(0.16, 0.34, C.gold, 0, 6.7, 0.85, 4);
  tip.rotation.x = Math.PI / 2;
  const fletch = box(0.3, 0.2, 0.3, 0xfff2c0, 0, 6.7, -0.6);
  g.add(pole, flag, arrow, tip, fletch);
  g.userData.top = 2.72;
  return bake(g);
}

export function makeBarracks() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(4.2, 2.0, 3.0, 2, 0.16), mat(0x8d9096));
  base.position.y = 1.0;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  // stone block courses
  for (let y = 0.3; y < 2.0; y += 0.45) {
    g.add(box(4.24, 0.05, 3.04, 0x6b6f75, 0, y, 0));
    for (let x = -1.6 + ((y * 7) % 2) * 0.45; x < 2.0; x += 0.9) g.add(box(0.05, 0.4, 3.05, 0x6b6f75, x, y + 0.24, 0));
  }
  g.add(roof(4.9, 3.7, 1.3, 0x555a66, 1.98, 0x3f4450));
  g.add(box(0.3, 0.3, 3.8, 0x3f4450, 0, 3.28, 0));
  const door = box(1.0, 1.4, 0.1, 0x3a2a1a, 0, 0.7, 1.53);
  const arch = box(1.2, 0.2, 0.12, 0x6b6f75, 0, 1.5, 1.52);
  const flagPole = cyl(0.05, 0.05, 2.6, C.darkWood, 1.6, 3.8, 0, 5);
  const flag = box(1.0, 0.55, 0.05, C.blue, 2.1, 4.8, 0);
  const shield = rbox(0.9, 1.1, 0.1, C.red, 0, 2.1, 1.86, 0.12);
  const swords = box(0.12, 1.6, 0.08, C.gold, 0, 2.1, 1.94);
  swords.rotation.z = 0.7;
  const swords2 = box(0.12, 1.6, 0.08, C.gold, 0, 2.1, 1.94);
  swords2.rotation.z = -0.7;
  g.add(shield);
  const crate = rbox(0.7, 0.7, 0.7, 0xd6b24a, -2.6, 0.35, 0.9, 0.06);
  const crate2 = rbox(0.55, 0.55, 0.55, 0xd6b24a, -2.5, 0.28, 0.1, 0.06);
  g.add(door, arch, flagPole, flag, swords, swords2, crate, crate2);
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
  for (const x of [-1.85, 1.85]) for (const y of [0.6, 1.7, 2.8]) g.add(box(0.58, 0.14, 0.58, C.steelDark, x, y, 0));
  const top = box(4.4, 0.45, 0.6, beamCol, 0, 3.4, 0);
  const cap = box(4.8, 0.2, 0.8, postCol, 0, 3.7, 0);
  const banner = box(0.9, 1.2, 0.08, C.blue, 0, 2.55, 0.3);
  banner.add(box(0.95, 0.1, 0.1, C.gold, 0, 0.6, 0), box(0.4, 0.2, 0.1, C.gold, 0, 0.05, 0.02), cone(0.06, 0.2, C.gold, -0.12, 0.25, 0.02, 4), cone(0.06, 0.2, C.gold, 0, 0.28, 0.02, 4), cone(0.06, 0.2, C.gold, 0.12, 0.25, 0.02, 4));
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  crest.position.set(-1.85, 2.2, 0.45);
  // doors standing open, swung inward
  const brace = (panel, w) => {
    const b1 = box(0.1, w * 1.3, 0.06, C.steelDark, 0, 1.2, 0.14);
    b1.rotation.z = 0.7;
    const b2 = box(0.1, w * 1.3, 0.06, C.steelDark, 0, 1.2, 0.14);
    b2.rotation.z = -0.7;
    panel.add(b1, b2);
    for (const [x, y] of [[-0.55, 0.4], [0.55, 0.4], [-0.55, 2.0], [0.55, 2.0]]) panel.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(C.steel)).translateX(x).translateY(y).translateZ(0.16));
  };
  const doorL = new THREE.Group();
  const panelL = st.pickets ? makeFence(1.5) : box(1.5, 2.4, 0.2, beamCol, 0, 1.2, 0);
  panelL.position.x = 0.75;
  brace(panelL, 1.5);
  doorL.add(panelL);
  doorL.position.set(-1.6, 0, 0.1);
  doorL.rotation.y = -1.15;
  const doorR = new THREE.Group();
  const panelR = st.pickets ? makeFence(1.5) : box(1.5, 2.4, 0.2, beamCol, 0, 1.2, 0);
  panelR.position.x = -0.75;
  brace(panelR, 1.5);
  doorR.add(panelR);
  doorR.position.set(1.6, 0, 0.1);
  doorR.rotation.y = 1.15;
  g.add(postL, postR, top, cap, banner, crest, doorL, doorR);
  return bake(g);
}

// ---- scenery ----
export function makeTree(scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.1, 7), matFlat(C.mane));
  trunk.position.y = 0.55;
  trunk.castShadow = true;
  g.add(trunk);
  if (Math.random() < 0.55) {
    // round canopy: a cluster of faceted blobs in two greens
    const blobs = [[0, 2.0, 0, 1.05, C.leaf], [-0.55, 1.6, 0.3, 0.7, C.leafDark], [0.6, 1.7, -0.25, 0.72, C.leafDark], [0.1, 2.6, 0.2, 0.62, 0x4fb56a], [-0.2, 1.5, -0.6, 0.6, C.leafDark]];
    for (const [x, y, z, r, c] of blobs) {
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), matFlat(c));
      b.position.set(x, y, z);
      b.rotation.set(Math.random(), Math.random(), Math.random());
      b.castShadow = true;
      g.add(b);
    }
  } else {
    // pine: three faceted tiers, lighter towards the top
    for (const [y, r, h, c] of [[1.4, 1.25, 1.5, C.leafDark], [2.2, 0.95, 1.35, C.leaf], [2.95, 0.62, 1.1, 0x4fb56a]]) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), matFlat(c));
      t.position.y = y;
      t.castShadow = true;
      g.add(t);
    }
  }
  g.scale.setScalar(scale);
  g.rotation.y = Math.random() * Math.PI;
  return bake(g);
}

export function makeBush() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const r = 0.45 + Math.random() * 0.25;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), matFlat(i === 1 ? C.leaf : C.leafDark));
    m.position.set((Math.random() - 0.5) * 0.9, r * 0.7, (Math.random() - 0.5) * 0.9);
    m.rotation.set(Math.random(), Math.random(), 0);
    m.castShadow = true;
    g.add(m);
  }
  // a couple of berries
  for (let i = 0; i < 2; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), mat(0xe8342a)).translateX((Math.random() - 0.5) * 0.8).translateY(0.6 + Math.random() * 0.3).translateZ(0.3));
  return bake(g);
}

export function makeRock(scale = 1) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), matFlat(C.rock));
  m.scale.set(scale * 1.2, scale * 0.7, scale);
  m.position.y = 0.3 * scale;
  m.castShadow = true;
  m.receiveShadow = true;
  const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), matFlat(0xa9aeb5));
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
  const rows = Math.floor(w / 0.7);
  const per = Math.floor(d / 0.5);
  const stalkGeo = new THREE.CylinderGeometry(0.035, 0.05, 1.1, 5);
  stalkGeo.translate(0, 0.55, 0);
  const stalks = new THREE.InstancedMesh(stalkGeo, swayMaterial(0xcdb04a), rows * per);
  const headGeo = new THREE.CapsuleGeometry(0.09, 0.22, 3, 6);
  headGeo.translate(0, 1.2, 0);
  const heads = new THREE.InstancedMesh(headGeo, swayMaterial(0xe9d27a), rows * per);
  const leafGeo = new THREE.ConeGeometry(0.06, 0.5, 3);
  leafGeo.translate(0, 0.6, 0);
  leafGeo.rotateX(0.5);
  const leaves = new THREE.InstancedMesh(leafGeo, swayMaterial(0xb9a83c), rows * per);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < per; k++) {
      const x = -w / 2 + 0.5 + r * 0.7 + (Math.random() - 0.5) * 0.2;
      const z = -d / 2 + 0.4 + k * 0.5 + (Math.random() - 0.5) * 0.2;
      const h = 0.85 + Math.random() * 0.3;
      q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.15));
      sc.set(1, h, 1);
      m.compose(new THREE.Vector3(x, 0, z), q, sc);
      stalks.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
      i++;
    }
  }
  stalks.count = heads.count = leaves.count = i;
  stalks.castShadow = true;
  g.add(stalks, heads, leaves);
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
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matFlat(0x6e7378));
  body.position.y = h / 2 - 0.05;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // strata bands in warm and cool greys so the layers read from a distance
  for (const [f, col, t] of [[0.22, 0x8a8078, 0.32], [0.48, 0x5a5f64, 0.22], [0.7, 0x9a9590, 0.28], [0.88, 0x565b60, 0.18]]) {
    g.add(box(w + 0.08, h * t * 0.35, d + 0.08, col, 0, h * f, 0, matFlat(col)));
  }
  const cap = new THREE.Mesh(new RoundedBoxGeometry(w + 0.2, 0.6, d + 0.2, 2, 0.25), matFlat(C.grass));
  cap.position.y = h - 0.15;
  cap.castShadow = true;
  cap.receiveShadow = true;
  g.add(cap);
  // rubble at the foot
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.4, 0), matFlat(C.rock));
    const a = Math.random() * Math.PI * 2;
    r.position.set(Math.cos(a) * (w / 2 + 0.6), 0.25, Math.sin(a) * (d / 2 + 0.6));
    r.scale.y = 0.6;
    r.castShadow = true;
    g.add(r);
  }
  return bake(g);
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
