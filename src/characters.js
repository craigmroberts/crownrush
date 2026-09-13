// Smooth, toy-figure characters: round painted heads, rounded bodies, capsule limbs.
// All face +Z. Each returns a Group with userData.legs / userData.arms / userData.body for animation.
import * as THREE from 'three';
import { bake, box, cyl, cone } from './models.js';

const smatCache = new Map();
function smat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!smatCache.has(key)) smatCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, ...opts }));
  return smatCache.get(key);
}
const P = {
  skin: 0xf7d2b4, gold: 0xf2b632, goldDark: 0xc98d1a, leather: 0x7a4a2a, boot: 0x5a3a22, red: 0xd8262c, darkRed: 0x8f171c,
  blue: 0x2f6fd6, blueDark: 0x1f4fa8, navy: 0x3a3f5c, white: 0xf7f7f7, steel: 0xc3c8cf, steelDark: 0x7d848e,
  pink: 0xf07aa8, pinkDark: 0xd85a8c, hair: 0x5a3416, hairDark: 0x2a1e16, beard: 0x6b3f1d, bone: 0xf1e6e8, boneDark: 0xd9c3c8,
};
const GOLD = () => smat(P.gold, { roughness: 0.5, metalness: 0.08 });

function sphere(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), material || smat(color));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}
function capsule(r, len, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), smat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function lathe(pts, color, x = 0, y = 0, z = 0, seg = 20, phiStart = 0, phiLen = Math.PI * 2, material) {
  // profiles must run bottom-to-top or the surface faces inward and gets culled once baked
  if (pts[0][1] > pts[pts.length - 1][1]) pts = [...pts].reverse();
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg, phiStart, phiLen), material || smat(color, { side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function ring(r, tube, color, x, y, z, material) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 24), material || smat(color));
  m.position.set(x, y, z);
  m.rotation.x = Math.PI / 2;
  m.castShadow = true;
  return m;
}
function sbox(w, h, d, color, x, y, z, material) {
  return box(w, h, d, color, x, y, z, material || smat(color));
}

// ---- painted faces on the head sphere (front of the sphere is u = 0.25) ----
const faceCache = new Map();
function faceMaterial(style) {
  if (faceCache.has(style)) return faceCache.get(style);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = style === 'boss' ? '#f1e6e8' : '#f7d2b4';
  ctx.fillRect(0, 0, 256, 256);
  const queen = style === 'queen';
  const angry = style === 'angry' || style === 'boss';
  // vertical is stretched 2x on the sphere, so circles are drawn twice as tall
  const eyeY = 124;
  const eyeX = [50, 78];
  if (queen || style === 'king') {
    ctx.fillStyle = 'rgba(240, 120, 140, 0.35)';
    for (const x of [36, 92]) {
      ctx.beginPath();
      ctx.ellipse(x, 150, 7, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const x of eyeX) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, eyeY, queen ? 8 : 7, queen ? 20 : angry ? 12 : 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = queen ? '#4a7fd6' : angry ? '#5a1a1a' : '#3b2a1e';
    ctx.beginPath();
    ctx.ellipse(x + 1, eyeY + 2, 5, queen ? 13 : angry ? 8 : 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(x + 1, eyeY + 3, 2.6, queen ? 7 : 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x - 1, eyeY - 4, 1.8, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (queen) {
      ctx.strokeStyle = '#2a1e16';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 8, eyeY - 18);
      ctx.lineTo(x - 12, eyeY - 26);
      ctx.moveTo(x, eyeY - 21);
      ctx.lineTo(x - 1, eyeY - 30);
      ctx.stroke();
    }
  }
  // brows
  ctx.strokeStyle = style === 'queen' ? '#4a2e14' : angry ? '#3a1010' : '#3a2a1e';
  ctx.lineCap = 'round';
  ctx.lineWidth = angry ? 7 : style === 'king' ? 6 : 4.5;
  ctx.beginPath();
  if (angry) {
    ctx.moveTo(40, 92);
    ctx.lineTo(58, 104);
    ctx.moveTo(88, 92);
    ctx.lineTo(70, 104);
  } else {
    ctx.moveTo(40, 98);
    ctx.quadraticCurveTo(50, 92, 60, 98);
    ctx.moveTo(68, 98);
    ctx.quadraticCurveTo(78, 92, 88, 98);
  }
  ctx.stroke();
  // mouth
  ctx.strokeStyle = angry ? '#4a1a1a' : '#b0604a';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  if (angry) {
    ctx.moveTo(54, 160);
    ctx.quadraticCurveTo(64, 152, 74, 160);
  } else if (queen) {
    ctx.moveTo(56, 154);
    ctx.quadraticCurveTo(64, 164, 72, 154);
  } else {
    ctx.moveTo(57, 156);
    ctx.quadraticCurveTo(64, 161, 71, 156);
  }
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 });
  faceCache.set(style, m);
  return m;
}

function head(style, y, r = 0.36) {
  const h = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), faceMaterial(style));
  h.position.set(0, y, 0);
  h.scale.set(1.04, 0.97, 0.98);
  h.castShadow = true;
  return h;
}

// hair cap: a dome over the top half of the head plus a fringe of bumps
function hairCap(color, y, r = 0.36, fringe = true) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.44), smat(color));
  dome.position.y = y + 0.04;
  dome.castShadow = true;
  g.add(dome);
  if (fringe) {
    for (const [x, dy, dz, s] of [[-0.21, 0.15, 0.27, 0.09], [-0.07, 0.19, 0.31, 0.1], [0.08, 0.18, 0.31, 0.1], [0.23, 0.14, 0.26, 0.09]]) {
      g.add(sphere(s, color, x, y + dy, dz, 1, 0.8, 0.9));
    }
    g.add(sphere(0.09, color, -0.35, y + 0.02, 0.0, 0.7, 1.4, 0.9));
    g.add(sphere(0.09, color, 0.35, y + 0.02, 0.0, 0.7, 1.4, 0.9));
  }
  return g;
}

// ---- the shared body ----
function figure({ style = 'archer', tunic, trim, pants = P.leather, boots = P.boot, sleeves = true, skinArms = false, scale = 1 }) {
  const g = new THREE.Group();
  // legs (pivot at the hip so they swing)
  const leg = (x) => {
    const lg = new THREE.Group();
    lg.add(capsule(0.11, 0.16, pants, 0, -0.12, 0));
    const boot = sphere(0.14, boots, 0, -0.3, 0.04, 1.0, 0.6, 1.3);
    lg.add(boot);
    lg.position.set(x, 0.44, 0);
    return bake(lg);
  };
  const legL = leg(-0.14);
  const legR = leg(0.14);
  // torso: a smooth lathe from hips to neck
  const torso = lathe([[0.26, 0.0], [0.31, 0.12], [0.34, 0.3], [0.32, 0.46], [0.25, 0.54], [0.12, 0.58]], tunic, 0, 0.42, 0);
  const belt = ring(0.315, 0.035, P.leather, 0, 0.54, 0);
  const buckle = sbox(0.14, 0.12, 0.05, P.gold, 0, 0.54, 0.3, GOLD());
  const collar = ring(0.14, 0.035, trim, 0, 0.99, 0, trim === P.gold ? GOLD() : undefined);
  const neck = cyl(0.11, 0.12, 0.1, P.skin, 0, 1.0, 0, 12);
  neck.material = smat(P.skin);
  torso.add(belt, buckle);
  const bodyGroup = new THREE.Group();
  bodyGroup.add(torso, collar, neck);
  // arms (pivot at the shoulder)
  const arm = (x) => {
    const ag = new THREE.Group();
    const col = skinArms ? P.skin : tunic;
    ag.add(capsule(0.09, 0.2, col, 0, -0.14, 0));
    if (sleeves && !skinArms) ag.add(ring(0.095, 0.03, trim, 0, -0.26, 0, trim === P.gold ? GOLD() : undefined));
    ag.add(sphere(0.095, P.skin, 0, -0.34, 0));
    ag.position.set(x, 0.9, 0);
    ag.rotation.z = x < 0 ? 0.18 : -0.18;
    return bake(ag);
  };
  const armL = arm(-0.4);
  const armR = arm(0.4);
  const hd = head(style === 'raider' || style === 'elite' || style === 'brute' ? 'angry' : style, 1.4);
  const earL = sphere(0.07, P.skin, -0.36, 1.38, 0.02, 0.6, 1, 1);
  const earR = sphere(0.07, P.skin, 0.36, 1.38, 0.02, 0.6, 1, 1);
  g.add(legL, legR, bodyGroup, armL, armR, hd, earL, earR);
  g.userData.legs = [legL, legR];
  g.userData.arms = [armL, armR];
  g.userData.body = bodyGroup;
  g.userData.head = hd;
  g.scale.setScalar(scale);
  return g;
}

function finish(g) {
  return bake(g, [...g.userData.legs, ...g.userData.arms, g.userData.body, g.userData.head]);
}

function bow(color, r = 0.46) {
  const g = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 18, Math.PI), smat(color));
  arc.rotation.y = Math.PI / 2;
  arc.rotation.z = -Math.PI / 2;
  arc.castShadow = true;
  const string = sbox(0.018, r * 2, 0.018, 0xf4f4f4, 0, 0, 0);
  g.add(arc, string);
  return g;
}

// ---- cast ----
const HAIR = [P.hairDark, P.hair, P.hairDark, 0x1c1c22, 0x8a5a2b];
export function makeArcher() {
  const g = figure({ style: 'archer', tunic: P.white, trim: P.blue });
  g.add(hairCap(HAIR[Math.floor(Math.random() * HAIR.length)], 1.4));
  const strap = sbox(0.12, 0.72, 0.5, P.blue, 0, 0.72, 0);
  strap.rotation.z = 0.7;
  g.add(strap);
  const b = bow(0x3b7bff);
  b.position.set(-0.46, 0.75, 0.16);
  b.rotation.y = 0.4;
  g.add(b);
  const quiver = cyl(0.09, 0.09, 0.5, P.leather, 0.22, 0.95, -0.28, 8);
  quiver.material = smat(P.leather);
  quiver.rotation.x = -0.2;
  quiver.rotation.z = -0.35;
  g.add(quiver);
  for (let i = 0; i < 3; i++) g.add(cone(0.05, 0.12, P.white, 0.26 + (i - 1) * 0.05, 1.28, -0.34 + (i % 2) * 0.03, 5));
  return finish(g);
}

export function makeSwordsman() {
  const g = figure({ style: 'archer', tunic: P.navy, trim: P.steel });
  g.add(hairCap(P.hairDark, 1.4, 0.36, false));
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.46), smat(P.steel, { roughness: 0.5, metalness: 0.3 }));
  helm.position.y = 1.5;
  const brim = ring(0.41, 0.04, P.steelDark, 0, 1.49, 0);
  g.add(helm, brim);
  const sword = sbox(0.07, 0.8, 0.04, P.steel, 0.44, 0.9, 0.2, smat(P.steel, { roughness: 0.4, metalness: 0.4 }));
  sword.rotation.z = -0.35;
  sword.add(sbox(0.26, 0.06, 0.08, P.gold, 0, -0.32, 0, GOLD()));
  g.add(sword);
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20), smat(P.blue));
  shield.rotation.z = Math.PI / 2;
  shield.position.set(-0.52, 0.66, 0.06);
  shield.add(sbox(0.08, 0.2, 0.2, P.gold, 0.04, 0, 0, GOLD()));
  g.add(shield);
  return finish(g);
}

export function makeKnight({ scale = 1, tunic = P.red, trim = P.darkRed } = {}) {
  const g = figure({ style: 'raider', tunic, trim, pants: trim, scale });
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.41, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.46), smat(tunic));
  helm.position.y = 1.5;
  const brim = ring(0.43, 0.045, trim, 0, 1.49, 0);
  const nose = sbox(0.06, 0.22, 0.05, trim, 0, 1.38, 0.37);
  const plume = cone(0.11, 0.5, trim, 0, 2.06, -0.04, 8);
  plume.material = smat(trim);
  g.add(helm, brim, nose, plume);
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 20), smat(trim));
  shield.rotation.z = Math.PI / 2;
  shield.position.set(-0.52, 0.66, 0.06);
  shield.add(sphere(0.08, P.steel, 0.04, 0, 0));
  g.add(shield);
  const sword = sbox(0.07, 0.7, 0.04, P.steel, 0.44, 0.9, 0.2, smat(P.steel, { roughness: 0.4, metalness: 0.4 }));
  sword.rotation.z = -0.4;
  sword.add(sbox(0.22, 0.06, 0.08, P.leather, 0, -0.28, 0));
  g.add(sword);
  return finish(g);
}

export function makeElite() {
  const g = figure({ style: 'elite', tunic: 0x2b2b33, trim: 0x8a1a22, pants: 0x1f1f26, scale: 1.1 });
  const plate = lathe([[0.3, 0.0], [0.34, 0.15], [0.33, 0.35], [0.26, 0.5]], 0x3d3d47, 0, 0.5, 0);
  const pauL = sphere(0.17, P.steel, -0.4, 0.92, 0, 1, 0.7, 1, smat(P.steel, { roughness: 0.45, metalness: 0.35 }));
  const pauR = sphere(0.17, P.steel, 0.4, 0.92, 0, 1, 0.7, 1, smat(P.steel, { roughness: 0.45, metalness: 0.35 }));
  const helm = cyl(0.37, 0.39, 0.62, 0x2b2b33, 0, 1.44, 0, 20);
  helm.material = smat(0x2b2b33, { roughness: 0.5, metalness: 0.3 });
  const top = sphere(0.37, 0x2b2b33, 0, 1.74, 0, 1, 0.5, 1, smat(0x2b2b33, { roughness: 0.5, metalness: 0.3 }));
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.06), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
  visor.position.set(0, 1.4, 0.37);
  const crest = sbox(0.08, 0.32, 0.5, 0x8a1a22, 0, 1.95, -0.08);
  g.add(plate, pauL, pauR, helm, top, visor, crest);
  const sword = sbox(0.08, 1.1, 0.04, P.steel, 0.46, 1.0, 0.2, smat(P.steel, { roughness: 0.4, metalness: 0.4 }));
  sword.rotation.z = -0.3;
  sword.add(sbox(0.28, 0.07, 0.08, 0x8a1a22, 0, -0.48, 0));
  g.add(sword);
  return finish(g);
}

export function makeBrute() {
  const g = figure({ style: 'brute', tunic: P.darkRed, trim: P.leather, pants: 0x5a0d10, skinArms: true, scale: 1.4 });
  g.userData.body.children[0].scale.set(1.25, 1, 1.15);
  const strap = sbox(0.14, 0.8, 0.62, P.leather, 0, 0.7, 0);
  strap.rotation.z = 0.7;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.44), smat(0x5a0d10));
  cap.position.y = 1.5;
  const hornL = cone(0.09, 0.42, P.bone, -0.42, 1.66, 0, 8);
  hornL.material = smat(P.bone);
  hornL.rotation.z = 0.9;
  const hornR = cone(0.09, 0.42, P.bone, 0.42, 1.62, 0, 8);
  hornR.material = smat(P.bone);
  hornR.rotation.z = -0.9;
  hornR.position.y = 1.66;
  g.add(strap, cap, hornL, hornR);
  const handle = cyl(0.05, 0.05, 0.9, P.leather, 0.62, 1.15, 0.12, 8);
  handle.material = smat(P.leather);
  const clubHead = sphere(0.2, P.steelDark, 0.62, 1.68, 0.12, 1, 1.2, 1, smat(P.steelDark, { roughness: 0.5, metalness: 0.3 }));
  for (const [x, z] of [[0.16, 0], [-0.16, 0], [0, 0.16], [0, -0.16]]) clubHead.add(sphere(0.05, P.steel, x, 0.05, z));
  g.add(handle, clubHead);
  return finish(g);
}

export function makeBoss() {
  const g = figure({ style: 'boss', tunic: P.bone, trim: P.boneDark, pants: P.boneDark, skinArms: false, scale: 2.7 });
  g.userData.body.children[0].scale.set(1.3, 1.05, 1.2);
  const strap = sbox(0.16, 0.85, 0.66, P.leather, 0, 0.7, 0);
  strap.rotation.z = 0.7;
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.41, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.44), smat(P.boneDark));
  helm.position.y = 1.5;
  const hornL = cone(0.1, 0.55, P.white, -0.44, 1.66, 0, 8);
  hornL.material = smat(P.white);
  hornL.rotation.z = 1.0;
  const hornR = cone(0.1, 0.55, P.white, 0.44, 1.66, 0, 8);
  hornR.material = smat(P.white);
  hornR.rotation.z = -1.0;
  g.add(strap, helm, hornL, hornR);
  const sword = sbox(0.12, 1.5, 0.05, P.white, 0.5, 1.15, 0.3, smat(P.white, { roughness: 0.4, metalness: 0.3 }));
  sword.rotation.z = -0.25;
  sword.add(sbox(0.4, 0.08, 0.1, P.steel, 0, -0.62, 0));
  g.add(sword);
  return finish(g);
}

function crown(y) {
  const g = new THREE.Group();
  const band = cyl(0.3, 0.28, 0.16, P.gold, 0, y, 0, 24);
  band.material = GOLD();
  g.add(band, ring(0.3, 0.03, P.gold, 0, y + 0.08, 0, GOLD()), ring(0.29, 0.03, P.gold, 0, y - 0.08, 0, GOLD()));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    const pt = cone(0.07, 0.24, P.gold, Math.cos(a) * 0.27, y + 0.2, Math.sin(a) * 0.27, 8);
    pt.material = GOLD();
    g.add(pt, sphere(0.035, P.gold, Math.cos(a) * 0.27, y + 0.33, Math.sin(a) * 0.27, 1, 1, 1, GOLD()));
  }
  g.add(sphere(0.06, P.red, 0, y, 0.29, 1, 1.2, 0.7, smat(P.red, { roughness: 0.3 })));
  return g;
}

function kingRider() {
  const g = figure({ style: 'king', tunic: P.blue, trim: P.gold });
  g.add(hairCap(P.hair, 1.4, 0.36, true));
  // gold chest clasp (an X of trim) and centre stripe
  const clasp1 = sbox(0.05, 0.3, 0.03, P.gold, 0, 0.78, 0.33, GOLD());
  clasp1.rotation.z = 0.6;
  const clasp2 = sbox(0.05, 0.3, 0.03, P.gold, 0, 0.78, 0.33, GOLD());
  clasp2.rotation.z = -0.6;
  const stripe = sbox(0.06, 0.34, 0.03, P.gold, 0, 0.5, 0.33, GOLD());
  g.userData.body.add(clasp1, clasp2, stripe);
  // beard and moustache
  const beard = sphere(0.3, P.beard, 0, 1.12, 0.1, 1.0, 0.5, 0.8);
  const mo1 = sphere(0.08, P.beard, -0.09, 1.25, 0.31, 1.2, 0.45, 0.7);
  const mo2 = sphere(0.08, P.beard, 0.09, 1.25, 0.31, 1.2, 0.45, 0.7);
  g.add(beard, mo1, mo2);
  g.add(crown(1.74));
  return g;
}

export function makeKingFoot() {
  const g = kingRider();
  const b = bow(P.gold, 0.4);
  b.position.set(0.46, 0.7, 0.2);
  b.rotation.y = -0.4;
  g.add(b);
  return finish(g);
}

export function makeKing() {
  const g = new THREE.Group();
  // horse
  const hb = sphere(0.36, 0xe8d5b5, 0, 0.9, 0, 0.95, 0.9, 1.9);
  const chest = sphere(0.3, 0xe8d5b5, 0, 0.95, 0.55, 1, 1, 1);
  const neck = capsule(0.17, 0.4, 0xe8d5b5, 0, 1.25, 0.72);
  neck.rotation.x = -0.6;
  const hhead = sphere(0.2, 0xe8d5b5, 0, 1.6, 1.0, 0.9, 0.85, 1.5);
  const muzzle = sphere(0.14, 0xd9c19c, 0, 1.52, 1.28, 1, 0.8, 1);
  const earL = cone(0.05, 0.16, 0xe8d5b5, -0.12, 1.8, 0.88, 6);
  earL.material = smat(0xe8d5b5);
  const earR = cone(0.05, 0.16, 0xe8d5b5, 0.12, 1.8, 0.88, 6);
  earR.material = smat(0xe8d5b5);
  const mane = lathe([[0.02, 0.3], [0.12, 0.15], [0.14, 0], [0.1, -0.3], [0.02, -0.4]], 0x8a5a2b, 0, 1.52, 0.6, 12);
  mane.rotation.x = -0.6;
  const tail = capsule(0.07, 0.4, 0x8a5a2b, 0, 0.75, -0.72);
  tail.rotation.x = 0.5;
  const eyeL = sphere(0.035, 0x222222, -0.14, 1.66, 1.16);
  const eyeR = sphere(0.035, 0x222222, 0.14, 1.66, 1.16);
  const legs = [];
  for (const [x, z] of [[-0.2, 0.45], [0.2, 0.45], [-0.2, -0.45], [0.2, -0.45]]) {
    const lg = new THREE.Group();
    lg.add(capsule(0.09, 0.32, 0xe8d5b5, 0, -0.25, 0), sphere(0.1, 0x5a3a22, 0, -0.5, 0.02, 1, 0.6, 1.2));
    lg.position.set(x, 0.6, z);
    legs.push(bake(lg));
  }
  const blanket = sbox(0.8, 0.12, 0.8, P.blue, 0, 1.1, -0.05);
  const saddle = sphere(0.3, P.leather, 0, 1.2, -0.05, 1.1, 0.35, 1.2);
  const reins = sbox(0.5, 0.03, 0.03, P.leather, 0, 1.55, 1.0);
  g.add(hb, chest, neck, hhead, muzzle, earL, earR, mane, tail, eyeL, eyeR, blanket, saddle, reins, ...legs);
  // rider sits on top
  const rider = kingRider();
  rider.position.set(0, 0.95, -0.05);
  rider.scale.setScalar(0.92);
  rider.userData.legs.forEach((l) => (l.rotation.x = -0.9));
  const b = bow(P.gold, 0.4);
  b.position.set(0.46, 0.7, 0.2);
  b.rotation.y = -0.4;
  rider.add(b);
  g.add(rider);
  g.userData.legs = legs;
  g.userData.arms = rider.userData.arms;
  g.userData.body = hb;
  return bake(g, [...legs, ...rider.userData.arms, rider.userData.head, hb]);
}

export function makeQueen() {
  const g = new THREE.Group();
  const dress = lathe([[0.2, 0.62], [0.27, 0.5], [0.34, 0.34], [0.46, 0.16], [0.6, 0.02], [0.6, 0.0]], P.pink, 0, 0, 0, 28);
  const hem = ring(0.6, 0.035, P.gold, 0, 0.02, 0, GOLD());
  const waist = ring(0.21, 0.03, P.gold, 0, 0.62, 0, GOLD());
  const bodice = lathe([[0.2, 0.0], [0.26, 0.12], [0.28, 0.28], [0.22, 0.4], [0.12, 0.44]], P.pink, 0, 0.6, 0, 20);
  const stripe = sbox(0.05, 0.38, 0.03, P.gold, 0, 0.8, 0.25, GOLD());
  const collar = ring(0.13, 0.03, P.gold, 0, 1.03, 0, GOLD());
  const neck = cyl(0.1, 0.11, 0.1, P.skin, 0, 1.04, 0, 12);
  neck.material = smat(P.skin);
  const bodyGroup = new THREE.Group();
  bodyGroup.add(bodice, stripe, collar, neck);
  const arm = (x) => {
    const ag = new THREE.Group();
    ag.add(sphere(0.14, P.pink, 0, 0, 0), capsule(0.07, 0.16, P.pink, 0, -0.18, 0), ring(0.075, 0.025, P.gold, 0, -0.28, 0, GOLD()), sphere(0.08, P.skin, 0, -0.35, 0));
    ag.position.set(x, 0.94, 0);
    ag.rotation.z = x < 0 ? 0.2 : -0.2;
    return bake(ag);
  };
  const armL = arm(-0.34);
  const armR = arm(0.34);
  const hd = head('queen', 1.44, 0.35);
  const hair = new THREE.Group();
  hair.add(hairCap(P.hair, 1.44, 0.35, true));
  const back = lathe([[0.06, 0.35], [0.34, 0.2], [0.42, -0.05], [0.44, -0.35], [0.38, -0.6], [0.2, -0.7]], P.hair, 0, 1.44, -0.02, 18, Math.PI / 2, Math.PI);
  hair.add(back);
  hair.add(sphere(0.12, P.hair, -0.36, 1.2, 0.08, 0.8, 1.6, 0.9), sphere(0.12, P.hair, 0.36, 1.2, 0.08, 0.8, 1.6, 0.9));
  const tiara = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.03, 8, 24, Math.PI), GOLD());
  tiara.position.set(0, 1.74, 0);
  tiara.rotation.x = -Math.PI / 2;
  tiara.rotation.z = Math.PI;
  const jewel = sphere(0.05, 0x9ad4ff, 0, 1.78, 0.3, 1, 1.3, 0.8, smat(0x9ad4ff, { roughness: 0.3 }));
  const peak = cone(0.04, 0.12, P.gold, 0, 1.84, 0.3, 6);
  peak.material = GOLD();
  g.add(dress, hem, waist, bodyGroup, armL, armR, hd, hair, tiara, jewel, peak);
  g.userData.legs = [];
  g.userData.arms = [armL, armR];
  g.userData.body = bodyGroup;
  g.userData.head = hd;
  return finish(g);
}
