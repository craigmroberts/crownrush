import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { iconImage } from './icons.js';

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
  // A THREE.Color stringifies to "[object Object]", so keying on it directly hands every caller the
  // same material whatever colour they asked for -- silently, and it looks like one deliberate colour.
  const key = (color && color.isColor ? color.getHex() : color) + JSON.stringify(opts);
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
  // Same guard, and this one has been exposed the whole time: `matFlat` also makes a flat-shaded
  // MeshStandardMaterial with no vertex colours, so the defines match and the grass could be handed a
  // program compiled for a rock. Roughness and colour are uniforms rather than defines, so they do
  // not separate them. It has evidently been winning the race; it should not have to.
  m.customProgramCacheKey = () => 'sway';
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
// #165: for a colour that is used ONCE. `mat` caches for ever on the assumption that a colour will be
// asked for again, which was true when the palette was a fixed few dozen and stopped being true when
// trees started mixing their own greens (e98bb9f): every tree put four freshly-jittered hexes into
// the cache, every bush two, and `bake` turned all of them into vertex colours a moment later. About
// 1,300 materials created at world build, each used exactly once, retained for the life of the page.
// This one is garbage the moment the tree is baked, which is what it should be.
export function matFlatOnce(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, flatShading: true });
}
// For the perf overlay (#166) and for measuring #165: how big the for-ever caches have got.
export function cacheSizes() {
  return { materials: matCache.size, tags: tagCache.size, popups: popupCache.size };
}
export const GHOST_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false });
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x1b1b24, side: THREE.BackSide });

export const C = {
  skin: 0xf6cfae, hair: 0x2a1e16, white: 0xf7f7f7, blue: 0x2f6fd6, navy: 0x3a3f5c, pants: 0x6b4a32, shoes: 0x2b2b2b,
  red: 0xd8262c, darkRed: 0xa31a1f, steel: 0xb9bec7, steelDark: 0x7d848e, gold: 0xf5b800, goldDark: 0xc98a00,
  horse: 0xe8d5b5, mane: 0x8a5a2b, wood: 0x9a6a3a, darkWood: 0x6b4a2b, roof: 0x7a4f30,
  // Greens rotated toward chartreuse and stone warmed out of grey (the BotW palette note). Hue only:
  // saturation and lightness are untouched, because they were never the problem -- these sat at 38-53%
  // against the reference's 41-46%. What was wrong was the HUE. Grass ran 107-138 (a blue-green) and
  // rock ran 210-213 at 4-6% saturation (a cold slate), in a world whose own roads are hue 36-39.
  //
  // The giveaway that this was an inconsistency rather than a style: `hemi.groundColor` in the day
  // keys was ALREADY hue 90-93. The light bouncing off the ground has been chartreuse all along and
  // the ground itself was not, so these bring the surfaces to the lighting rather than the other way.
  //
  // Stone stops at 18-25% saturation, deliberately below the roads' 47-62%: warm enough to belong to
  // the same world, muted enough that a cliff never reads as a sand dune.
  leaf: 0x498f2f, leafDark: 0x3c7a25, rock: 0xac997f, cliff: 0x70614e, grass: 0x74a34a,
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
  // #62: they are out of the scene graph but their buffers are not, and nothing can traverse to them
  // any more. Hand them to whoever owns this ghost -- disposePad frees them along with the rest, and
  // only when the geometry was made for this ghost in the first place.
  if (drop.length) group.userData.droppedGeometry = drop.map((o) => o.geometry).filter(Boolean);
  return group;
}

// ---- baking: collapse a model's static parts into one vertex-coloured mesh (one draw call) ----
export const BAKED_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, vertexColors: true });
export const BAKED_STD = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05, vertexColors: true });
// Wind for things that are NOT instanced. `swayMaterial` takes its phase from `instanceMatrix`, which
// grass and wheat have and a merged tree does not -- every tree would have swung in unison, which is
// worse than not moving at all.
//
// So the phase is baked per OBJECT into `uv.x`. That attribute exists on every baked geometry, is
// written to zero by `prepGeo`, and nothing has ever read it: these materials carry no map. It cannot
// come from the vertex position, which was the obvious idea and is wrong -- a canopy is two units
// across, so one side would lead the other by radians and the tree would shear rather than sway.
//
// The bend is linear in height, so a three-metre canopy travels about 0.13 and a knee-high bush
// barely moves. That is not a compromise either; it is what the two actually do.
export const BAKED_SWAY = (() => {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05, vertexColors: true });
  m.userData.isSway = true;   // so a test can tell this apart from BAKED_STD, which is otherwise identical
  // A GUARD, not a fix for anything observed. `onBeforeCompile` is not part of Three's program cache
  // key -- that is built from the material's DEFINES, and BAKED_STD is a MeshStandardMaterial with
  // `vertexColors` exactly as this one is. Nothing separates them, so whether this material gets its
  // own program or BAKED_STD's comes down to compile order, and the failure is silent: the injected
  // vertex code is simply not there and the trees stand still. Cheap to make impossible.
  m.customProgramCacheKey = () => 'baked-sway';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSway = swayUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = uv.x;
        float bend = max(transformed.y, 0.0);
        transformed.x += sin(uSway * 1.15 + ph) * 0.038 * bend;
        transformed.z += cos(uSway * 0.9 + ph * 1.3) * 0.022 * bend;`);
  };
  return m;
})();
// Every material `bake` produces. Anything here is skipped on a second bake -- see the note in `bake`.
const BAKED = new Set([BAKED_MAT, BAKED_STD, BAKED_SWAY]);
function prepGeo(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
// The per-object wind phase, written into `uv.x` on every vertex. See BAKED_SWAY for why it lives
// there and why it cannot be derived from the vertex position.
function phaseize(geo, ph) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) arr[i * 2] = ph;
  geo.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
  return geo;
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
  const sways = [];
  const outlines = [];
  // One phase for the whole object, picked here rather than from where it ends up: `bake` runs inside
  // the maker, before the caller has placed it, so there is no world position to read yet. Random is
  // better anyway -- two trees that happen to grow side by side should not lean together.
  const phase = Math.random() * Math.PI * 2;
  g.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSprite || o.userData.face || Array.isArray(o.material)) return;
    if (isKept(o)) return;
    if (o.material === OUTLINE_MAT) {
      outlines.push(o);
      return;
    }
    if (o.userData.sway) {
      sways.push(o);
      return;
    }
    const m = o.material;
    // ALREADY BAKED IS A SET, not three `===` tests, because it has now needed a new member twice and
    // missed it once. e98bb9f added BAKED_SWAY and not this line, so `makeLumberTree` -- which bakes a
    // tree it built from an already-baked `makeTree` -- ran the canopy through `colorize` a second
    // time with the sway material's own colour, which is white. Every choppable tree in the game went
    // white and lost its wind, and nothing crashed (#155). The failure is a valid colour that is
    // simply wrong, so the guard has to be structural rather than remembered.
    if (!(m.isMeshToonMaterial || m.isMeshStandardMaterial) || m.transparent || BAKED.has(m) || m.map) return;
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
  if (sways.length) {
    const m = new THREE.Mesh(mergeGeometries(sways.map((o) => phaseize(toGeo(o, o.material.color), phase)), false), BAKED_SWAY);
    m.castShadow = true;
    m.receiveShadow = true;
    for (const o of sways) o.parent.remove(o);
    g.add(m);
  }
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
// Merge the baked meshes inside a static group, per material and per patch of ground (scenery).
//
// TWO THINGS WERE WRONG AND THE FIRST HID THE SECOND.
//
// It collected meshes whose material is `BAKED_MAT`, and `bake` has always produced `BAKED_STD`.
// So it found nothing, returned the group untouched, and the comment promising one draw call for the
// trees was describing something that never ran. Measured before this: 284 separate meshes sharing
// one vertex-coloured material, every visible one of them its own draw call.
//
// AND MERGING THEM ALL INTO ONE IS NOT THE FIX EITHER, which is why this is a grid rather than the
// one-liner it looks like. A single mesh spanning 190 by 190 cannot be frustum-culled: every tree on
// the map would be drawn every frame to save the draw calls of the dozen actually on screen. The
// camera sees about 35 units, so a 30-unit cell means a handful of meshes in view, each of which is
// most of it, and everything behind the camera culls itself out the way it does now.
export function mergeGroup(group, cell = 30) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts = [];
  group.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && (o.material === BAKED_MAT || o.material === BAKED_STD || o.material === BAKED_SWAY)) parts.push(o);
  });
  if (!parts.length) return group;
  const buckets = new Map();
  const v = new THREE.Vector3();
  for (const o of parts) {
    o.getWorldPosition(v);
    const key = `${o.material.uuid}|${Math.floor(v.x / cell)}|${Math.floor(v.z / cell)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: o.material, geos: [] }));
    const geo = o.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    b.geos.push(geo);
  }
  for (const o of parts) o.parent.remove(o);
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false), b.mat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  // drop now-empty groups
  const empties = [];
  group.traverse((o) => {
    if (o !== group && o.isGroup && o.children.length === 0) empties.push(o);
  });
  for (const o of empties) o.parent.remove(o);
  return group;
}

// ---- faces live in characters.js, and so does the code that draws them ----
// #53: there was a second `faceMaterial` here, with its own 128x128 canvas, its own cache and a
// `face()` that hung it on a plane. Nothing had called either since the characters became smooth
// painted figures with the face on the head itself -- `characters.js` holds the one that is used.
// The linter found it by pulling a thread: `face` was unused, removing it left `faceMaterial`
// unused, and removing that left the cache and fifty lines of canvas drawing with nothing to draw.
// ---- characters live in characters.js (smooth, painted-face figures) ----
export { makeArcher, makeSwordsman, makeVillager, makeKnight, makeElite, makeBrute, makeBoss, makeKing, makeKingFoot, makeQueen } from './characters.js';

// The Royal Keep: a small stone castle with a balcony the Queen stands on.
// #3: one palette per material age. Buildings are rebuilt in the current material when the Keep
// crosses a boundary (see Game.rebuildStructures), so a level-12 village looks nothing like a level-1 one.
export const MATERIALS = {
  wood: { wall: 0x9a6b3f, wallDark: 0x5e3c22, post: 0x5e3c22, plank: 0x9a6b3f, roof: 0x8a4a2b, roofDark: 0x5e3c22, keepWall: 0x9a6b3f, keepDark: 0x5e3c22, keepRoof: 0x2f6fd6, accent: 0xf5b800 },
  stone: { wall: 0x9aa0a8, wallDark: 0x6b6f75, post: 0x6b6f75, plank: 0x9aa0a8, roof: 0x4f6b9a, roofDark: 0x35496b, keepWall: 0x8d9096, keepDark: 0x6b6f75, keepRoof: 0x2f6fd6, accent: 0xf5b800 },
  iron: { wall: 0x5b626c, wallDark: 0x2f343b, post: 0x3a3f47, plank: 0x5b626c, roof: 0x2f3540, roofDark: 0x1f232b, keepWall: 0x555c66, keepDark: 0x2f343b, keepRoof: 0x8a2a2a, accent: 0xb0713a },
  diamond: { wall: 0xdfe8f0, wallDark: 0x9fb8c8, post: 0x9fb8c8, plank: 0xdfe8f0, roof: 0x5fd6ee, roofDark: 0x3aa9c4, keepWall: 0xe6eef5, keepDark: 0x9fb8c8, keepRoof: 0x5fd6ee, accent: 0x8fe8ff },
};
const GEM_MAT = new THREE.MeshStandardMaterial({ color: 0x8fe8ff, roughness: 0.12, metalness: 0.2, emissive: 0x2f7f9a, emissiveIntensity: 0.9 });
// a small material flourish: rust rivets on iron, a glowing crystal on diamond
function materialFlourish(g, material, x, y, z) {
  if (material === 'iron') {
    for (const dx of [-0.35, 0.35]) g.add(box(0.12, 0.12, 0.12, 0xb0713a, x + dx, y, z, matFlat(0xb0713a)));
  } else if (material === 'diamond') {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), GEM_MAT);
    c.scale.set(0.8, 1.6, 0.8);
    c.position.set(x, y + 0.25, z);
    g.add(c);
  }
}

export function makeKeep(material = 'stone') {
  const P = MATERIALS[material] || MATERIALS.stone;
  const g = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(3.4, 2.6, 3.4, 2, 0.18), mat(P.keepWall));
  base.position.y = 1.3;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  for (let y = 0.45; y < 2.6; y += 0.5) {
    g.add(box(3.44, 0.05, 3.44, P.keepDark, 0, y, 0));
    for (let x = -1.2 + ((y * 7) % 2) * 0.5; x < 1.6; x += 1.0) g.add(box(0.05, 0.45, 3.45, P.keepDark, x, y + 0.27, 0));
  }
  // crenellated parapet
  for (let i = 0; i < 4; i++) {
    for (let t = -1.2; t <= 1.2; t += 0.8) {
      const x = i < 2 ? t : (i === 2 ? 1.6 : -1.6);
      const z = i < 2 ? (i === 0 ? 1.6 : -1.6) : t;
      g.add(box(0.4, 0.4, 0.4, P.keepDark, x, 2.8, z, matFlat(P.keepDark)));
    }
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cyl(0.5, 0.55, 3.4, P.keepWall, sx * 1.6, 1.7, sz * 1.6, 8));
  const tower = cyl(1.1, 1.2, 2.2, P.keepWall, 0, 3.6, 0, 10);
  const roof = cone(1.4, 1.6, P.keepRoof, 0, 5.5, 0, 10);
  const pole = box(0.06, 1.0, 0.06, C.darkWood, 0, 6.5, 0);
  const flag = cyl(0.42, 0.36, 0.3, C.gold, 0, 7.15, 0, 8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(box(0.16, 0.34, 0.12, C.gold, Math.cos(a) * 0.38, 7.45, Math.sin(a) * 0.38).rotateY(-a));
  }
  g.add(box(0.16, 0.16, 0.12, C.red, 0, 7.2, 0.42));
  const door = box(0.9, 1.4, 0.12, 0x3a2a1a, 0, 0.7, 1.72);
  const arch = box(1.2, 0.2, 0.14, P.keepDark, 0, 1.5, 1.72);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cone(0.6, 0.8, P.keepRoof, sx * 1.6, 3.8, sz * 1.6, 8));
  const balcony = box(2.0, 0.2, 1.0, P.keepDark, 0, 2.7, 1.9);
  const rail = box(2.0, 0.5, 0.1, C.darkWood, 0, 3.05, 2.35);
  const railL = box(0.1, 0.5, 1.0, C.darkWood, -0.95, 3.05, 1.9);
  const railR = box(0.1, 0.5, 1.0, C.darkWood, 0.95, 3.05, 1.9);
  const window = box(0.6, 0.8, 0.1, 0x9ad4ff, 0, 3.6, 1.1);
  const banner = box(0.6, 1.0, 0.06, 0xf07aa8, -1.75, 1.6, 0.6);
  banner.rotation.y = Math.PI / 2;
  g.add(tower, roof, pole, flag, door, arch, balcony, rail, railL, railR, window, banner);
  materialFlourish(g, material, 0, 2.95, 1.75);
  g.userData.balcony = new THREE.Vector3(0, 2.8, 1.85);
  return bake(g);
}

// ---- items ----
const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14);
const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 14);
// Coins are gold: [face, rim]. They used to change colour with the Keep, which read as four
// currencies when there is only one; what climbs with the Keep now is what a coin is worth.
export const COIN_TIER_COLORS = {
  gold: [new THREE.Color(C.gold), new THREE.Color(C.goldDark)],
};
const coinMats = {};
const rimMats = {};
for (const [tier, [face, rim]] of Object.entries(COIN_TIER_COLORS)) {
  coinMats[tier] = new THREE.MeshStandardMaterial({ color: face, roughness: 0.45, metalness: 0.2, emissive: face.clone().multiplyScalar(0.12) });
  rimMats[tier] = mat(rim.getHex());
}
// The stack of coins carried above the King: two instanced meshes (face + rim), coloured per coin tier.
export function makeCoinStack(n) {
  const outer = new THREE.InstancedMesh(coinGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.2, emissive: 0x1a1408 }), n);
  const inner = new THREE.InstancedMesh(rimGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }), n);
  for (let i = 0; i < n; i++) {
    outer.setColorAt(i, COIN_TIER_COLORS.gold[0]);
    inner.setColorAt(i, COIN_TIER_COLORS.gold[1]);
  }
  outer.castShadow = true;
  outer.frustumCulled = inner.frustumCulled = false;
  outer.count = inner.count = 0;
  return { outer, inner };
}

export function makeCoin(tier = 'gold') {
  const g = new THREE.Group();
  const c = new THREE.Mesh(coinGeo, coinMats[tier] || coinMats.gold);
  c.castShadow = true;
  const inner = new THREE.Mesh(rimGeo, rimMats[tier] || rimMats.gold);
  g.add(c, inner);
  g.userData.tier = tier;
  return g;
}

// Every coin lying on the ground, in two draw calls.
//
// A coin used to be a Group of two meshes, face and rim, so a field of eighty-eight coins — which is
// what a night of raiders leaves behind if the King does not sweep up — cost a hundred and
// seventy-six draws. They are all the same two shapes at different places, which is what instancing
// is for; the per-coin tier colour rides along as an instance colour, the same way the King's carried
// stack has always done it.
//
// The game still moves an ordinary Object3D per coin, so the bouncing, spinning and flying code is
// untouched. This reads those every frame and fills the two meshes from them.
export class CoinField {
  constructor(max = 400) {
    this.faceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.2, emissive: 0x1a1408 });
    this.rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
    this.m = new THREE.Matrix4();
    this.scene = null;
    this.build(max);
  }

  build(max) {
    const old = this.face ? [this.face, this.rim] : null;
    this.face = new THREE.InstancedMesh(coinGeo, this.faceMat, max);
    this.rim = new THREE.InstancedMesh(rimGeo, this.rimMat, max);
    this.face.castShadow = true;              // as the single coin's face did
    this.face.frustumCulled = this.rim.frustumCulled = false;
    this.face.count = this.rim.count = 0;
    this.max = max;
    if (old && this.scene) {
      this.scene.remove(old[0], old[1]);
      old[0].dispose();
      old[1].dispose();
      this.scene.add(this.face, this.rim);
    }
  }

  add(scene) {
    this.scene = scene;
    scene.add(this.face, this.rim);
  }

  // On a restart the coin list is emptied and the old root thrown away, but these two meshes are not:
  // without this they would keep drawing the last frame's coins until the next update.
  clear() {
    this.face.count = this.rim.count = 0;
  }

  // `coins` is the game's own list; anything without a `tier` (the resource cubes that share it) is
  // left alone, because it is not a coin and still carries a mesh of its own.
  update(coins) {
    // Grow rather than silently stop drawing. A coin past the end of the buffer would still be picked
    // up — the game tracks it by position, not by what is on screen — so the player would be walking
    // over money they cannot see, which is worse than a slightly larger buffer.
    let wanted = 0;
    for (const c of coins) if (c.tier) wanted++;
    if (wanted > this.max) this.build(Math.max(wanted, this.max * 2));

    let n = 0;
    for (const c of coins) {
      if (!c.tier) continue;
      const o = c.mesh;
      o.updateMatrixWorld();
      this.m.copy(o.matrixWorld);
      this.face.setMatrixAt(n, this.m);
      this.rim.setMatrixAt(n, this.m);
      const [faceColour, rimColour] = COIN_TIER_COLORS[c.tier] || COIN_TIER_COLORS.gold;
      this.face.setColorAt(n, faceColour);
      this.rim.setColorAt(n, rimColour);
      n++;
    }
    this.face.count = this.rim.count = n;
    this.face.instanceMatrix.needsUpdate = true;
    this.rim.instanceMatrix.needsUpdate = true;
    if (this.face.instanceColor) this.face.instanceColor.needsUpdate = true;
    if (this.rim.instanceColor) this.rim.instanceColor.needsUpdate = true;
  }
}

const arrowGeo = new THREE.BoxGeometry(0.06, 0.06, 0.7);
const arrowMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
const streakMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
const streakGeo = new THREE.BoxGeometry(0.08, 0.08, 1.8);
// THE TIP IS SHARED NOW, like the shaft and the streak beside it always were. It went through
// `cone()`, which makes a fresh ConeGeometry every call, and an arrow that landed was removed from
// the scene and dropped from the array and never disposed -- so every arrow this game had ever fired
// was still holding a GPU buffer (#164). Measured: 60 arrows, +60 geometries, every round, for ever.
// The rotation is baked in here once rather than set on each mesh.
const tipGeo = new THREE.ConeGeometry(0.06, 0.16, 4).rotateX(Math.PI / 2);
export function makeArrow() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(arrowGeo, arrowMat);
  const tip = new THREE.Mesh(tipGeo, mat(C.steel));
  tip.position.z = 0.42;
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
// A little heart, used for the rescue and for the odd quiet moment while she follows the King.
let heartTex = null;
export function makeHeart() {
  if (!heartTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const heart = (scale, fill) => {
      ctx.save();
      ctx.translate(64, 70);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.moveTo(0, 22);
      ctx.bezierCurveTo(-34, -2, -26, -34, 0, -18);
      ctx.bezierCurveTo(26, -34, 34, -2, 0, 22);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
    };
    heart(1.5, '#b3255c');
    heart(1.3, '#ff5d8f');
    ctx.save();
    ctx.translate(52, 48);
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
    ctx.restore();
    heartTex = new THREE.CanvasTexture(c);
    heartTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthTest: false, toneMapped: false });
  const s = new THREE.Sprite(m);
  s.renderOrder = 21;
  return s;
}

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

export function makeHut(material = 'wood') {
  const P = MATERIALS[material] || MATERIALS.wood;
  const g = new THREE.Group();
  // log walls
  const W = 3.4;
  const D = 2.6;
  if (material !== 'wood') {
    // dressed blocks with course lines instead of logs
    const base = new THREE.Mesh(new RoundedBoxGeometry(W + 0.3, 1.75, D + 0.3, 2, 0.12), mat(P.wall));
    base.position.y = 0.87;
    base.castShadow = base.receiveShadow = true;
    g.add(base);
    for (let y = 0.35; y < 1.7; y += 0.42) {
      g.add(box(W + 0.34, 0.05, D + 0.34, P.wallDark, 0, y, 0));
      for (let x = -1.2 + ((y * 7) % 2) * 0.45; x < 1.6; x += 0.9) g.add(box(0.05, 0.37, D + 0.35, P.wallDark, x, y + 0.22, 0));
    }
  }
  for (let i = 0; i < (material === 'wood' ? 5 : 0); i++) {
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
  if (material === 'wood') g.add(box(W - 0.2, 1.7, D - 0.2, C.wood, 0, 0.85, 0));
  const door = box(0.7, 1.1, 0.12, 0x3a2a1a, 0.6, 0.55, D / 2 + 0.1);
  door.add(box(0.8, 0.08, 0.14, C.darkWood, 0, 0.58, 0), new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(C.gold)).translateX(0.25).translateZ(0.08));
  const window = box(0.5, 0.5, 0.12, 0x9ad4ff, -0.7, 1.0, D / 2 + 0.1);
  window.add(box(0.6, 0.6, 0.06, C.darkWood, 0, 0, -0.04), box(0.06, 0.5, 0.14, C.darkWood, 0, 0, 0.01), box(0.5, 0.06, 0.14, C.darkWood, 0, 0, 0.01));
  g.add(door, window);
  g.add(roof(W + 0.9, D + 0.8, 1.35, P.roof, 1.72, P.roofDark));
  g.add(box(0.36, 0.34, D + 0.9, P.roofDark, 0, 3.1, 0));
  materialFlourish(g, material, -1.2, 1.3, D / 2 + 0.16);
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

// The Exchange: a squat stone counting-house with a big coin over the door.
export function makeBank() {
  const g = new THREE.Group();
  g.add(box(3.4, 0.3, 3.0, 0x6b6f75, 0, 0.15, 0));
  g.add(box(3.0, 2.2, 2.6, 0x9aa0a8, 0, 1.4, 0));
  for (let y = 0.7; y < 2.3; y += 0.5) g.add(box(3.04, 0.05, 2.64, 0x7d848e, 0, y, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.45, 1.3, 4), matFlat(0x4f6b9a));
  roof.position.y = 3.1;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);
  g.add(box(0.9, 1.4, 0.12, 0x3a2a1a, 0, 0.95, 1.31), box(1.2, 0.2, 0.16, 0x6b6f75, 0, 1.75, 1.31));
  for (const x of [-1.15, 1.15]) g.add(cyl(0.16, 0.18, 2.2, 0xd9dde3, x, 1.35, 1.36, 8));
  const sign = cyl(0.5, 0.5, 0.12, C.gold, 0, 2.75, 1.42, 16);
  sign.rotation.x = Math.PI / 2;
  const signIn = cyl(0.34, 0.34, 0.14, C.goldDark, 0, 2.75, 1.44, 16);
  signIn.rotation.x = Math.PI / 2;
  g.add(sign, signIn);
  return bake(g);
}

// A short wooden post beside a gate for a gate guard to stand on.
export function makeGatePost() {
  const H = 1.55;
  const g = new THREE.Group();
  for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) g.add(cyl(0.1, 0.13, H, C.darkWood, x, H / 2, z, 6));
  g.add(box(1.5, 0.16, 1.5, C.wood, 0, H, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    g.add(box(i % 2 ? 0.08 : 1.5, 0.3, i % 2 ? 1.5 : 0.08, C.darkWood, Math.cos(a) * 0.72 * (i % 2), H + 0.25, Math.sin(a) * 0.72 * ((i + 1) % 2)));
  }
  g.userData.top = H + 0.08;
  return bake(g);
}

export function makeTower(level = 1, material = 'wood') {
  const P = MATERIALS[material] || MATERIALS.wood;
  const g = new THREE.Group();
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    g.add(cyl(0.14, 0.18, 2.6, P.post, x, 1.3, z, 6));
  }
  for (const [x, z, ry] of [[0, 0.95, 0], [0, -0.95, 0], [0.95, 0, Math.PI / 2], [-0.95, 0, Math.PI / 2]]) {
    const a = box(2.3, 0.12, 0.12, P.plank, x, 1.3, z);
    a.rotation.y = ry;
    a.rotation.z = 0.7;
    const b = box(2.3, 0.12, 0.12, P.plank, x, 1.3, z);
    b.rotation.y = ry;
    b.rotation.z = -0.7;
    g.add(a, b);
  }
  const platform = box(2.5, 0.22, 2.5, P.plank, 0, 2.6, 0);
  g.add(platform);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const r = box(i % 2 ? 0.1 : 2.5, 0.4, i % 2 ? 2.5 : 0.1, P.post, Math.cos(a) * 1.2 * (i % 2), 2.9, Math.sin(a) * 1.2 * ((i + 1) % 2));
    g.add(r);
  }
  // peaked shingle roof on four posts with a pennant
  for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) g.add(box(0.12, 1.6, 0.12, P.post, x, 3.5, z));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.3, 4), matFlat(P.roof));
  roof.position.y = 4.95;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.5) / 3;
    const ring = new THREE.Mesh(new THREE.ConeGeometry(2.1 * (1 - t) + 0.06, 0.09, 4, 1, true), matFlat(P.roofDark));
    ring.position.y = 4.3 + 1.3 * t;
    ring.rotation.y = Math.PI / 4;
    g.add(ring);
  }
  const pole = box(0.06, 1.2, 0.06, C.darkWood, 0, 6.1, 0);
  // one pennant per level: blue, then red, then gold. Higher levels also get braziers on the rail.
  const flagColors = [C.blue, C.red, C.gold];
  for (let i = 0; i < Math.min(level, 3); i++) g.add(box(0.7, 0.4, 0.04, flagColors[i], 0.38 * (i % 2 ? -1 : 1), 6.4 - i * 0.46, 0));
  if (level >= 2) {
    for (const [x, z] of [[-1.15, -1.15], [1.15, -1.15]]) {
      g.add(cyl(0.16, 0.12, 0.3, C.steelDark, x, 3.0, z, 8));
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: level >= 3 ? 0xffd166 : 0xff8a3d }));
      ember.position.set(x, 3.25, z);
      g.add(ember);
    }
  }
  if (level >= 3) for (const [x, z] of [[-1.15, 1.15], [1.15, 1.15], [0, -1.25], [0, 1.25]]) g.add(box(0.26, 0.26, 0.26, C.gold, x, 3.2, z));
  const flag = new THREE.Group();
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
  materialFlourish(g, material, 0, 2.95, 1.28);
  g.userData.top = 2.72;
  return bake(g);
}

export function makeBarracks(material = 'stone') {
  const P = MATERIALS[material] || MATERIALS.stone;
  const g = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(4.2, 2.0, 3.0, 2, 0.16), mat(P.wall));
  base.position.y = 1.0;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  // stone block courses
  for (let y = 0.3; y < 2.0; y += 0.45) {
    g.add(box(4.24, 0.05, 3.04, P.wallDark, 0, y, 0));
    for (let x = -1.6 + ((y * 7) % 2) * 0.45; x < 2.0; x += 0.9) g.add(box(0.05, 0.4, 3.05, P.wallDark, x, y + 0.24, 0));
  }
  g.add(roof(4.9, 3.7, 1.3, P.roof, 1.98, P.roofDark));
  g.add(box(0.3, 0.3, 3.8, P.roofDark, 0, 3.28, 0));
  materialFlourish(g, material, -1.4, 1.4, 1.6);
  const door = box(1.0, 1.4, 0.1, 0x3a2a1a, 0, 0.7, 1.53);
  const arch = box(1.2, 0.2, 0.12, P.wallDark, 0, 1.5, 1.52);
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

// #57: the rally banner the King plants. Blue and gold, the same as the gate's banner and his own
// tunic, because it is his standard and the player has to read it as "ours" from across a field
// without being told. Baked to one mesh like every other structure here: it is on the field for
// eighteen seconds at a time and is not worth four draw calls.
export function makeRallyBanner() {
  const g = new THREE.Group();
  const pole = cyl(0.07, 0.08, 2.7, C.darkWood, 0, 1.35, 0);
  const finial = cone(0.13, 0.32, C.gold, 0, 2.82, 0, 6);
  // Hung off one side of the pole rather than centred on it, the way a real standard hangs.
  const cloth = box(0.86, 1.1, 0.07, C.blue, 0.47, 2.0, 0);
  cloth.add(
    box(0.9, 0.12, 0.1, C.gold, 0, 0.5, 0),
    box(0.16, 0.66, 0.1, C.gold, 0, -0.04, 0.01),
    box(0.5, 0.16, 0.1, C.gold, 0, 0.1, 0.01),
  );
  // A spur, so it reads as driven INTO the ground rather than standing on it.
  const spur = cone(0.09, 0.32, C.steelDark, 0, 0.12, 0, 5);
  spur.rotation.x = Math.PI;
  g.add(pole, finial, cloth, spur);
  return bake(g);
}

// ---- scenery ----
// A WOOD, NOT EIGHTY COPIES OF TWO TREES. Every tree used to be one of two silhouettes wearing the
// same three greens, which at this camera reads as one object stamped across the map.
//
// The variation is free, and that is the whole reason it is worth doing: `bake` turns each tree into
// vertex colours, so a tree with its own greens costs exactly what a shared one costs -- no extra
// material, no extra draw call. `tint` shifts hue and lightness a little per tree, which is what the
// eye reads as "these are different trees" long before it notices the shape.
// TWO TRAPS IN FIVE LINES, both found by looking at the trees rather than at the numbers, because
// both produce a perfectly valid colour that is simply the wrong one.
//
// 1. THE COLOUR SPACES MUST MATCH. `getHSL` reports in the WORKING space (linear) by default and
//    `setHSL` reads the SRGB one, so the obvious round trip moves the colour a long way: it turned
//    every canopy in the game brown. Both calls name their space here.
// 2. IT MUST RETURN A NUMBER. `mat()` caches on `color + JSON.stringify(opts)`, and a THREE.Color
//    stringifies to "[object Object]" -- so every tinted green in the world collapsed onto one cache
//    entry and every tree wore whichever one was built first. (`mat` no longer allows that either.)
function tint(hex, h, l) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL((hsl.h + h + 1) % 1, hsl.s, Math.min(0.92, Math.max(0.06, hsl.l + l)), THREE.SRGBColorSpace);
  return c.getHex(THREE.SRGBColorSpace);
}

export function makeTree(scale = 1) {
  const g = new THREE.Group();
  // one tree's own greens: +/- 5 degrees of hue and a little value either way
  const dh = (Math.random() - 0.5) * 0.028;
  const dl = (Math.random() - 0.5) * 0.1;
  const leaf = tint(C.leaf, dh, dl);
  const dark = tint(C.leafDark, dh, dl);
  const top = tint(0x4fb56a, dh, dl + 0.04);
  const bark = tint(C.mane, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.08);
  const trunkH = 1.1 * (0.85 + Math.random() * 0.4);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, trunkH, 7), matFlatOnce(bark));
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const foliage = (m) => {
    // `sway` is what routes this into BAKED_SWAY at bake time: the canopy moves and the trunk does not
    m.userData.sway = true;
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const kind = Math.random();
  if (kind < 0.42) {
    // round canopy: a cluster of faceted blobs
    const blobs = [[0, 2.0, 0, 1.05, leaf], [-0.55, 1.6, 0.3, 0.7, dark], [0.6, 1.7, -0.25, 0.72, dark], [0.1, 2.6, 0.2, 0.62, top], [-0.2, 1.5, -0.6, 0.6, dark]];
    for (const [x, y, z, r, c] of blobs) {
      const b = foliage(new THREE.Mesh(new THREE.DodecahedronGeometry(r * (0.85 + Math.random() * 0.3), 0), matFlatOnce(c)));
      b.position.set(x, y + trunkH - 1.1, z);
      b.rotation.set(Math.random(), Math.random(), Math.random());
    }
  } else if (kind < 0.8) {
    // pine: faceted tiers, lighter towards the top
    for (const [y, r, h, c] of [[1.4, 1.25, 1.5, dark], [2.2, 0.95, 1.35, leaf], [2.95, 0.62, 1.1, top]]) {
      const t = foliage(new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), matFlatOnce(c)));
      t.position.y = y + trunkH - 1.1;
    }
  } else {
    // #env: the third silhouette, and the one that does the most work -- tall, narrow and open, so a
    // wood made of the other two stops reading as a single repeating mass. Four small tiers up a bare
    // trunk rather than a cone of foliage sitting on a stump.
    const lean = (Math.random() - 0.5) * 0.18;
    for (let i = 0; i < 4; i++) {
      const r = 0.82 - i * 0.16;
      const t = foliage(new THREE.Mesh(new THREE.ConeGeometry(r, 0.95, 6), matFlatOnce(i % 2 ? leaf : dark)));
      t.position.set(lean * i, trunkH + 0.35 + i * 0.62, lean * i * 0.6);
      t.rotation.y = i * 0.9;
    }
  }
  g.scale.setScalar(scale);
  g.rotation.y = Math.random() * Math.PI;
  return bake(g);
}

export function makeBush() {
  const g = new THREE.Group();
  const dh = (Math.random() - 0.5) * 0.03;
  const dl = (Math.random() - 0.5) * 0.12;
  for (let i = 0; i < 3; i++) {
    const r = 0.45 + Math.random() * 0.25;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), matFlatOnce(tint(i === 1 ? C.leaf : C.leafDark, dh, dl)));
    m.position.set((Math.random() - 0.5) * 0.9, r * 0.7, (Math.random() - 0.5) * 0.9);
    m.rotation.set(Math.random(), Math.random(), 0);
    m.castShadow = true;
    m.userData.sway = true;
    g.add(m);
  }
  // a couple of berries
  for (let i = 0; i < 2; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 3), mat(0xe8342a)).translateX((Math.random() - 0.5) * 0.8).translateY(0.6 + Math.random() * 0.3).translateZ(0.3));
  return bake(g);
}

export function makeRock(scale = 1) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), matFlat(C.rock));
  m.scale.set(scale * 1.2, scale * 0.7, scale);
  m.position.y = 0.3 * scale;
  m.castShadow = true;
  m.receiveShadow = true;
  const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), matFlat(0xc3b49f));  // warmed with the rest of the stone
  cap.scale.set(scale * 1.1, scale * 0.45, scale * 0.9);
  cap.position.y = 0.55 * scale;
  g.add(m, cap);
  g.rotation.y = Math.random() * Math.PI;
  return bake(g);
}

// #19: the raider camp. Tents around a fire, a spike ring, and the Warlord's banner.
export function makeCamp(radius = 9) {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(radius + 1, 28), mat(0x5e5340));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.02;
  ground.receiveShadow = true;
  g.add(ground);
  // fire pit
  g.add(cyl(1.3, 1.4, 0.25, 0x4a4a4a, 0, 0.12, 0, 12));
  for (let i = 0; i < 4; i++) {
    const l = cyl(0.14, 0.14, 1.4, C.darkWood, 0, 0.36, 0, 6);
    l.rotation.z = Math.PI / 2;
    l.rotation.y = (i / 4) * Math.PI;
    g.add(l);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 7), new THREE.MeshBasicMaterial({ color: 0xff8a2e }));
  flame.position.y = 1.0;
  const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  flame2.position.y = 1.15;
  g.add(flame, flame2);
  // tents
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * radius * 0.6;
    const z = Math.sin(a) * radius * 0.6;
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.3, 6), matFlat(i % 2 ? 0x6b2a2a : 0x4a3a30));
    tent.position.set(x, 1.15, z);
    tent.rotation.y = a;
    tent.castShadow = tent.receiveShadow = true;
    g.add(tent, box(0.08, 2.8, 0.08, C.darkWood, x, 1.4, z));
  }
  // spike ring, gaps toward the village side
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (a > Math.PI * 0.35 && a < Math.PI * 0.65) continue;
    const s = makeSpikes();
    s.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    s.rotation.y = -a + Math.PI / 2;
    g.add(s);
  }
  // the Warlord's banner
  const pole = box(0.12, 5.2, 0.12, C.darkWood, -2.2, 2.6, -2.2);
  const flag = box(1.6, 1.0, 0.06, 0x24232b, -1.4, 4.6, -2.2);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), matFlat(0xe8e2cf));
  skull.position.set(-1.4, 4.6, -2.14);
  g.add(pole, flag, skull, box(0.25, 0.25, 0.25, C.gold, -2.2, 5.3, -2.2));
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

// Iron: dark rock shot through with rusty metal bands.
export function makeIronSeam() {
  const g = new THREE.Group();
  for (const [x, z, sc] of [[0, 0, 1.5], [1.2, 0.5, 1.0], [-1.0, 0.6, 0.85]]) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), mat(0x4a4f57));
    r.scale.set(sc * 1.2, sc * 0.9, sc);
    r.position.set(x, 0.36 * sc, z);
    r.rotation.y = x * 2 + z;
    r.castShadow = true;
    g.add(r);
  }
  for (const [x, y, z, ry] of [[0.1, 0.85, 0.35, 0.3], [-0.45, 0.6, -0.25, 1.1], [0.95, 0.78, 0.5, -0.6], [-0.9, 0.72, 0.7, 0.8]]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.13, 0.2), new THREE.MeshStandardMaterial({ color: 0xb0713a, roughness: 0.5, metalness: 0.55 }));
    band.position.set(x, y, z);
    band.rotation.set(0.2, ry, 0.35);
    band.castShadow = true;
    g.add(band);
  }
  return bake(g);
}

// Diamond: pale rock with glowing crystals growing out of it.
export function makeGemNode() {
  const g = new THREE.Group();
  for (const [x, z, sc] of [[0, 0, 1.35], [1.0, 0.5, 0.8], [-0.95, 0.5, 0.75]]) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), mat(0x9fa8b8));
    r.scale.set(sc * 1.2, sc * 0.8, sc);
    r.position.set(x, 0.34 * sc, z);
    r.rotation.y = x + z * 2;
    r.castShadow = true;
    g.add(r);
  }
  const gem = new THREE.MeshStandardMaterial({ color: 0x8fe8ff, roughness: 0.12, metalness: 0.2, emissive: 0x2f7f9a, emissiveIntensity: 0.9 });
  for (const [x, y, z, s, tilt] of [[0.05, 1.05, 0.1, 1.2, 0.1], [0.6, 0.9, 0.5, 0.85, -0.4], [-0.5, 0.85, 0.35, 0.75, 0.5], [0.2, 0.8, -0.6, 0.6, 0.25]]) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), gem);
    c.scale.set(s * 0.8, s * 1.6, s * 0.8);
    c.position.set(x, y, z);
    c.rotation.set(tilt, x * 3, tilt * 0.6);
    c.castShadow = true;
    g.add(c);
  }
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
const RES_COLORS = { wood: 0x8a5a2b, stone: 0x8d9096, straw: 0xe0c25a, iron: 0x9aa6b4, diamond: 0x8fe8ff };
export const RES_MATS = { wood: mat(0x8a5a2b), stone: mat(0x8d9096), straw: mat(0xe0c25a), iron: mat(0x9aa6b4), diamond: mat(0x8fe8ff) };
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
  } else if (type === 'iron' || type === 'diamond') {
    const head = box(0.5, 0.14, 0.12, type === 'diamond' ? 0xdfe8f2 : C.steelDark, 0, 0.78, 0);
    g.add(head, cone(0.07, 0.22, C.steel, 0.3, 0.78, 0, 4).rotateZ(-Math.PI / 2));
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
  // #45: the field is cut by lowering the instance count, so the order the stalks are written in is
  // the order they are taken in. Written row by row, a harvested field would peel away from one edge
  // like a bad haircut; shuffled, it thins evenly across the whole plot the way a reaped field does.
  const cells = [];
  for (let r = 0; r < rows; r++) for (let k = 0; k < per; k++) cells.push([r, k]);
  for (let a = cells.length - 1; a > 0; a--) {
    const b = Math.floor(Math.random() * (a + 1));
    [cells[a], cells[b]] = [cells[b], cells[a]];
  }
  let i = 0;
  for (const [r, k] of cells) {
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
  // what the harvest turns down, and how many stalks a full field is
  g.userData.crop = { parts: [stalks, heads, leaves], full: i };
  return bake(g);
}

export function makeCliff(w, h, d) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matFlat(0x88765e));
  body.position.y = h / 2 - 0.05;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // strata bands, light and dark, so the layers read from a distance. They used to alternate warm and
  // cool greys; the cool ones are what made a mesa look like slate, so the contrast is carried by
  // value alone now and every band is the same warm family.
  for (const [f, col, t] of [[0.22, 0xa08562, 0.32], [0.48, 0x70614e, 0.22], [0.7, 0xa89882, 0.28], [0.88, 0x6c5d4a, 0.18]]) {
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

// Pad shapes say what a pad does: SQUARE = builds something (structure, wall, bridge, expansion),
// CIRCLE = everything else (recruit, crew, upgrade, trade, feed), with a coloured rim per kind.
//
// #8: the marker carries IDENTITY ONLY - icon, name, and a level where one applies. Costs used to be
// painted here too, but nobody can read a price off the floor at a sharp angle while running past;
// they live in the panel that appears when you stop on the pad.
export function drawPad(canvas, tex, { icon, label, paid, active = false, sub = null, locked = null, lockIcon = 'keep', shape = 'square', rim = '#ffffff', cost = 0, left = 0, blocker = null, blockerOk = false }) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  const outline = () => {
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(128, 128, 114, 0, Math.PI * 2);
    else ctx.roundRect(14, 14, 228, 228, 26);
  };
  outline();
  ctx.fillStyle = active ? 'rgba(255, 230, 120, 0.45)' : 'rgba(58, 42, 26, 0.5)';
  ctx.fill();
  if (paid > 0 && !cost) {
    ctx.save();
    outline();
    ctx.clip();
    const hgt = 228 * Math.min(1, paid);
    ctx.fillStyle = '#3fd455';
    ctx.fillRect(14, 242 - hgt, 228, hgt);
    ctx.restore();
  }
  ctx.strokeStyle = active ? '#ffd93d' : rim;
  ctx.lineWidth = active ? 14 : 11;
  ctx.lineCap = 'round';
  if (shape === 'circle') {
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(128, 128, 112, i * (Math.PI / 2) + 0.16, (i + 1) * (Math.PI / 2) - 0.16);
      ctx.stroke();
    }
  } else {
    const L = active ? 52 : 40;
    for (const [x, y, sx, sy] of [[14, 14, 1, 1], [242, 14, -1, 1], [14, 242, 1, -1], [242, 242, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x + sx * L, y + sy * 6);
      ctx.lineTo(x + sx * 6, y + sy * 6);
      ctx.lineTo(x + sx * 6, y + sy * L);
      ctx.stroke();
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // one big icon on a soft disc: this is what has to read at a glance
  const img = iconImage(icon);
  const isz = cost ? 88 : 104;
  const iy = cost ? 86 : 100;
  ctx.beginPath();
  ctx.arc(128, iy, isz * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,251,232,0.9)';
  ctx.fill();
  if (img) ctx.drawImage(img, 128 - isz / 2, iy - isz / 2, isz, isz);
  const text = (str, y, size, fill) => {
    ctx.font = `800 ${size}px "Baloo 2", "Trebuchet MS", system-ui, sans-serif`;
    ctx.lineWidth = size * 0.28;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(str, 128, y);
    ctx.fillStyle = fill;
    ctx.fillText(str, 128, y);
  };
  if (cost) {
    text(label, 152, label.length > 15 ? 24 : 28, '#ffffff');
    // Anything standing in the way goes ABOVE the bar, so the bar is always in the same place and
    // always means the same thing: this is what it costs and this is how far in you are.
    if (blocker) {
      const bw = Math.min(228, 26 + blocker.length * 13);
      ctx.beginPath();
      ctx.roundRect(128 - bw / 2, 166, bw, 30, 15);
      // #122: the pill is red because everything that has used it so far is a refusal -- "Needs Lv. 3",
      // "Free Wren first". The post-purchase hold is the first thing to say through it that is GOOD
      // news, and a red pill saying "Bought" reads as a mat that has gone wrong. Same pill, the
      // game's own green.
      ctx.fillStyle = blockerOk ? 'rgba(48, 150, 72, 0.92)' : 'rgba(200, 40, 46, 0.92)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.stroke();
      ctx.font = '800 21px "Baloo 2", "Trebuchet MS", system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(blocker, 128, 182);
    }
    // the cost bar: one shape in one place on every mat, so it is read once and then recognised
    const by = blocker ? 204 : 190;
    const bx = 26;
    const bw2 = 204;
    const bh = 34;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw2, bh, 17);
    ctx.fillStyle = 'rgba(24, 18, 12, 0.72)';
    ctx.fill();
    if (paid > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(bx, by, bw2, bh, 17);
      ctx.clip();
      ctx.fillStyle = '#3fd455';
      ctx.fillRect(bx, by, bw2 * Math.min(1, paid), bh);
      ctx.restore();
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw2, bh, 17);
    ctx.stroke();
    const ci = iconImage('gold');
    if (ci) ctx.drawImage(ci, bx + 5, by + 3, 28, 28);
    ctx.font = '800 24px "Baloo 2", "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(String(left), bx + bw2 / 2 + 14, by + bh / 2 + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(left), bx + bw2 / 2 + 14, by + bh / 2 + 1);
    if (sub) text(sub, 243, 20, '#ffe98a');
  } else {
    text(label, sub ? 186 : 196, label.length > 15 ? 26 : 31, '#ffffff');
    if (sub) text(sub, 220, 25, '#ffe98a');
    if (locked) {
      outline();
      ctx.fillStyle = 'rgba(20, 16, 30, 0.5)';
      ctx.fill();
      const li = iconImage(lockIcon);
      if (li) ctx.drawImage(li, 128 - 29, 78, 58, 58);
      text(locked, 168, locked.length > 13 ? 24 : 29, '#ffd23d');
    }
  }
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

// ---- health bars: every bar in the game is one instance of a single billboard mesh ----
// makeHealthBar() returns an empty Object3D you parent to a character; HealthBars.update() reads each
// bar's world position/scale every frame and fills one InstancedMesh, so 300 bars cost one draw call.
const BAR_LIST = [];
// How far above its owner a bar floats. Bars used to draw over everything, so nothing made it
// obvious that they sat down among the heads; with depth testing on, a bar level with a head is a
// bar the head eats. Applied in the writer rather than at the call sites so the heights already
// tuned per character keep their relation to each other.
const BAR_LIFT = 0.42;
// How much nearer the camera a bar is judged to be than its owner, for depth testing only. It has to
// beat the owner's own head, which sticks out in front of the point the bar hangs from, and stay
// under the gap between ranks in a crowd, or nothing in front would ever hide anything. Measured by
// eye against a press of raiders: 1.15 left too much standing, 0.7 clears a character's own head
// with a lone figure on open ground and still buries the back of a press.
const BAR_BIAS = 0.70;
// `noFade` keeps a bar at full strength however far away it is. The Keep and the walls are the two
// things you are meant to be able to read from across the map -- a wall going down while you are out
// at the iron is the whole reason to turn round -- so they never fade. Everything the crowd is made
// of does.
export function makeHealthBar(width = 1.2, green = false, noFade = false) {
  const b = new THREE.Object3D();
  b.isHealthBar = true;
  b.scale.set(width, width / 6, 1);
  b.visible = false;
  b.userData = { green, frac: 1, noFade };
  BAR_LIST.push(b);
  return b;
}
export function setHealthBar(bar, frac) {
  const f = Math.max(0, Math.min(1, frac));
  bar.userData.frac = f;
  bar.visible = f < 0.999;
}
export function disposeHealthBar(bar) {
  const i = BAR_LIST.indexOf(bar);
  if (i >= 0) BAR_LIST.splice(i, 1);
}
export function clearHealthBars() {
  BAR_LIST.length = 0;
}
const BAR_VS = `
attribute float aFrac;
attribute float aGreen;
attribute float aFade;
varying vec2 vUv;
varying float vFrac;
varying float vGreen;
varying float vFade;
void main() {
  vUv = uv;
  vFrac = aFrac;
  vGreen = aGreen;
  vFade = aFade;
  vec4 center = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
  float sx = length(instanceMatrix[0].xyz);
  float sy = length(instanceMatrix[1].xyz);
  vec3 quad = center.xyz + vec3(position.x * sx, position.y * sy, 0.0);
  gl_Position = projectionMatrix * vec4(quad, 1.0);
  // A bar's depth is its OWNER'S depth, and the owner's head sticks out in front of that, so with
  // depth testing on a character ate its own bar -- the front rank of a press came out bare. The bar
  // is given the depth of a point a little nearer the camera instead, which clears its own body while
  // leaving anything genuinely in front of it, more than BAR_BIAS nearer, still able to hide it.
  //
  // Depth only. Moving the quad itself would put it nearer the camera in earnest and it would be
  // drawn bigger, so x, y and w come from where the bar really is and only z is replaced.
  vec4 biased = projectionMatrix * vec4(quad.x, quad.y, quad.z + ${BAR_BIAS.toFixed(2)}, 1.0);
  gl_Position.z = biased.z / biased.w * gl_Position.w;
}`;
const BAR_FS = `
varying vec2 vUv;
varying float vFrac;
varying float vGreen;
varying float vFade;
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(6.0, 1.0);
  float d = box(p, vec2(3.0, 0.5), 0.38);
  if (d > 0.0) discard;
  vec3 col = vec3(0.106, 0.106, 0.14);
  float x0 = -3.0 + 0.19;
  float x1 = x0 + (6.0 - 0.38) * vFrac;
  float inner = box(vec2(p.x - (x0 + x1) * 0.5, p.y), vec2((x1 - x0) * 0.5, 0.5 - 0.19), 0.2);
  if (vFrac > 0.0 && inner < 0.0) col = vGreen > 0.5 ? vec3(0.29, 0.816, 0.416) : vec3(0.91, 0.204, 0.165);
  if (d > -0.12) col = vec3(0.92);
  gl_FragColor = vec4(pow(col, vec3(2.2)), vFade);
  #include <colorspace_fragment>
}`;
export class HealthBars {
  constructor(max = 600) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.frac = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.green = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    geo.setAttribute('aFrac', this.frac);
    geo.setAttribute('aGreen', this.green);
    geo.setAttribute('aFade', this.fade);
    // depthTest was off, which put every bar in front of the whole world: a raider at the back of a
    // press drew its bar over the raider standing in front of it, and forty of them made a thicket
    // with the characters somewhere underneath. On, a bar is hidden by anything genuinely nearer
    // than its owner, so it belongs to someone you can see. depthWrite stays off -- bars must not
    // occlude each other, only be occluded.
    const mat = new THREE.ShaderMaterial({ vertexShader: BAR_VS, fragmentShader: BAR_FS, transparent: true, depthTest: true, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.count = 0;
    this.max = max;
    this.m = new THREE.Matrix4();
    this.p = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
  }
  // `camera` turns on the distance fade; `from` and `to` are the world distances it runs between.
  // Called with no arguments every bar is drawn at full strength, which is the old behaviour.
  update(camera = null, from = 0, to = 0) {
    const eye = camera ? camera.position : null;
    const span = to - from;
    let n = 0;
    for (let i = BAR_LIST.length - 1; i >= 0; i--) {
      const bar = BAR_LIST[i];
      let top = bar;
      while (top.parent) top = top.parent;
      if (!top.isScene) {
        BAR_LIST.splice(i, 1); // its owner left the scene
        continue;
      }
      if (!bar.visible || n >= this.max) continue;
      bar.updateWorldMatrix(true, false);
      bar.matrixWorld.decompose(this.p, this.q, this.s);
      // Far enough away a bar is a speck that still costs a row and still clutters the picture. It
      // fades out over `from`..`to` and past `to` is not written at all, which also keeps the nearest
      // bars from being the ones dropped when a big night runs the instance budget out.
      let fade = 1;
      if (eye && span > 0 && !bar.userData.noFade) {
        const dist = this.p.distanceTo(eye);
        if (dist >= to) continue;
        if (dist > from) fade = 1 - (dist - from) / span;
      }
      this.m.makeScale(this.s.x, this.s.y, 1).setPosition(this.p.x, this.p.y + BAR_LIFT, this.p.z);
      this.mesh.setMatrixAt(n, this.m);
      this.frac.array[n] = bar.userData.frac;
      this.green.array[n] = bar.userData.green ? 1 : 0;
      this.fade.array[n] = fade;
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.frac.needsUpdate = true;
    this.green.needsUpdate = true;
    this.fade.needsUpdate = true;
  }
}

// ---- damage popup ----
const popupCache = new Map();
// A label for something standing in the world, as opposed to a damage number. makePopup draws into a
// fixed 160px canvas at 54px, which fits "+1" and clips anything with a word in it; this measures the
// text first, sizes the canvas to it, and puts it on a plaque so it reads as a thing you can act on.
const tagCache = new Map();
// #165: keyed on the whole label -- "9 Wood", "10 Wood", "11 Wood" are three entries -- and each one
// holds a canvas, an uploaded texture and a material. It only ever grew. Now it is a small LRU: a
// re-used label moves to the back, the front is dropped and DISPOSED when the map passes the cap.
// 48 is comfortably more labels than are ever live at once and comfortably fewer than a long run
// produces. The sprites handed out hold a clone of the material and the texture by reference, so a
// live sprite whose entry is evicted keeps drawing; only the cache lets go.
const TAG_CACHE_MAX = 48;
// #161: what the heap's label is and is not. It is a READOUT of what is in the heap -- it appears when
// the King is near one and sits there while he is -- so it says "9 Wood", not "+9 Wood": you did not
// just gain nine, the heap in front of you holds nine. The "+" belongs to the floating number that
// `updatePileFlies` puts up as each piece lands, which is a different thing saying a different fact.
//
// It used to shout: a gold stroke round a dark plaque, 40px, and `depthTest: false` so it painted
// over a tree standing in front of it. The stroke is gone (most of the loudness was the ring, not the
// fill), the type is 15% smaller, the number is set heavier than the word so the count reads first,
// the material's own icon sits in front of it, and it is depth-tested, so it is a thing in the world
// rather than a thing on the glass. The fill stays at 82%: it was never the problem, and on the
// chartreuse grass anything lighter loses the parchment text.
export function makeTag(count, name, type) {
  const key = `${type}:${count}`;
  if (tagCache.has(key)) {
    const e = tagCache.get(key);
    tagCache.delete(key);
    tagCache.set(key, e);
  } else {
    const numFont = '800 34px "Baloo 2", "Trebuchet MS", system-ui, sans-serif';
    const nameFont = '700 27px "Nunito", "Trebuchet MS", system-ui, sans-serif';
    const pad = 20;
    const gap = 8;
    const isz = 34;
    const img = iconImage(type);
    const m = document.createElement('canvas').getContext('2d');
    m.font = numFont;
    const numW = Math.ceil(m.measureText(String(count)).width);
    m.font = nameFont;
    const nameW = Math.ceil(m.measureText(name).width);
    const w = pad + (img ? isz + gap : 0) + numW + gap + nameW + pad;
    const h = 64;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.beginPath();
    ctx.roundRect(3, 6, w - 6, h - 12, 20);
    ctx.fillStyle = 'rgba(26,32,17,0.82)';
    ctx.fill();
    let x = pad;
    if (img) {
      ctx.drawImage(img, x, h / 2 - isz / 2, isz, isz);
      x += isz + gap;
    }
    ctx.font = numFont;
    ctx.fillStyle = '#fff2c9';
    ctx.fillText(String(count), x, h / 2 - 1);
    x += numW + gap;
    ctx.font = nameFont;
    ctx.fillStyle = '#e2d7b5';
    ctx.fillText(name, x, h / 2 - 1);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tagCache.set(key, { mat: new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }), aspect: w / h });
    if (tagCache.size > TAG_CACHE_MAX) {
      const oldest = tagCache.keys().next().value;
      const gone = tagCache.get(oldest);
      tagCache.delete(oldest);
      gone.mat.map.dispose();
      gone.mat.dispose();
    }
  }
  const e = tagCache.get(key);
  const s = new THREE.Sprite(e.mat.clone());
  // 64 canvas px to the 0.97 world units the old 76px plaque's 1.15 gave: the same pixels per unit,
  // so "15% smaller type" is 15% smaller on screen and not a coincidence of the canvas
  s.scale.set(0.97 * e.aspect, 0.97, 1);
  s.renderOrder = 20;
  return s;
}

// The level marks for an imported tower. The generated mesh is one model, but a tower's level has to
// be readable across the field, so the things that say it -- a pennant per level, braziers on the
// rail, gold studs at the top level -- are built here and hung on it. Heights are the imported
// tower's own: deck at 2.72, rail to about 3.5, pole from 6.0.
export function makeTowerLevelBits(level) {
  const g = new THREE.Group();
  if (level >= 2) {
    for (const [x, z] of [[-0.92, -0.92], [0.92, -0.92]]) {
      g.add(cyl(0.16, 0.12, 0.3, C.steelDark, x, 2.9, z, 8));
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: level >= 3 ? 0xffd166 : 0xff8a3d }));
      ember.position.set(x, 3.15, z);
      g.add(ember);
    }
  }
  if (level >= 3) for (const [x, z] of [[-0.92, 0.92], [0.92, 0.92]]) g.add(box(0.24, 0.24, 0.24, C.gold, x, 3.05, z));
  // the model carries its own blue pennant, which is level one; the rest hang under it
  const flagColors = [null, C.red, C.gold];
  for (let i = 1; i < Math.min(level, 3); i++) g.add(box(0.6, 0.34, 0.04, flagColors[i], 0.3, 5.95 - (i - 1) * 0.44, 0));
  return g;
}

// A heap of gathered material: a stepped mound in the material's own colour with loose chunks round
// the foot, so it reads as a pile someone made rather than cubes that happen to be near each other.
export function makeHeap(type) {
  const g = new THREE.Group();
  const col = RES_COLORS[type] || 0xffffff;
  const m = matFlat(col);
  const dark = new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, flatShading: true });
  dark.color.multiplyScalar(0.78);
  // three courses, narrowing upward
  const tiers = [[0.92, 0.30, 0.0], [0.64, 0.26, 0.30], [0.34, 0.22, 0.54]];
  for (const [w, h, y] of tiers) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, w, 1, 0.06), y === 0 ? dark : m);
    b.position.y = y + h / 2;
    b.rotation.y = y * 2.1;
    b.castShadow = true;
    b.receiveShadow = true;
    g.add(b);
  }
  // loose chunks at the foot, so the silhouette is not a neat wedding cake
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const c = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.18, 0.2, 1, 0.05), m);
    c.position.set(Math.cos(a) * 0.56, 0.09, Math.sin(a) * 0.56);
    c.rotation.y = a;
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

// #167: the same for-ever shape #165 found in the tag cache, found in this one by measuring a run.
// Keyed on text and colour, so every distinct damage number is an entry -- "-3", "-12", "-40" -- and
// each holds a 160x80 canvas and an uploaded texture. Thirty nights of scaling damage reached 34
// entries and was still climbing. A small LRU, like the tags: a live sprite holds a clone of the
// material and the texture by reference, so evicting its entry does not blank it.
const POPUP_CACHE_MAX = 64;
export function makePopup(text, color = '#ffffff') {
  const key = text + color;
  if (popupCache.has(key)) {
    const e = popupCache.get(key);
    popupCache.delete(key);
    popupCache.set(key, e);
  } else {
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
    if (popupCache.size > POPUP_CACHE_MAX) {
      const oldest = popupCache.keys().next().value;
      const gone = popupCache.get(oldest);
      popupCache.delete(oldest);
      gone.map.dispose();
      gone.dispose();
    }
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
