// Loads rigged GLB characters (built by tools/blender/make_character.py) and hands out animated clones.
//
// Performance notes (see README "Performance"):
//  - Blender exports one primitive per material (8–11 per character). At load we merge them into ONE
//    skinned mesh with vertex colours, so a character costs 1–2 draw calls and one skeleton instead of 11.
//  - Frustum culling is on with a padded bounding sphere, so off-screen characters are skipped entirely.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const draco = new DRACOLoader();
draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
const cache = new Map();

let rigShadows = true;
// Mobile swaps real character shadows for cheap blob shadows (see Game.updateBlobs).
export function setRigShadows(on) {
  rigShadows = on;
}

// One MeshStandardMaterial for every character: roughness / metalness / glow ride along as a
// per-vertex attribute, so a character is a single draw call however many "materials" Blender used.
const RIG_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, name: 'rig' });
RIG_MAT.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 aPBR;\nvarying vec3 vPBR;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPBR = aPBR;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vPBR;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPBR.x;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vPBR.y;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vPBR.z;');
};
RIG_MAT.customProgramCacheKey = () => 'crownrush-rig';

// Collapse every skinned primitive of a loaded character into one SkinnedMesh.
function mergeCharacter(scene) {
  const prims = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) prims.push(o); });
  if (prims.length === 0) return;
  const ref = prims[0];
  const parent = ref.parent;

  const geos = [];
  const parts = {}; // material name -> [{start, count}] vertex ranges (for tinting)
  let vertexOffset = 0;
  const color = new THREE.Color();
  for (const p of prims) {
    const g = p.geometry;
    if (!g.index) {
      const n = g.attributes.position.count;
      const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    g.deleteAttribute('uv'); // untextured; dropping it keeps every geometry's attribute set identical
    const n = g.attributes.position.count;
    const m = p.material;
    color.copy(m.color);
    const glow = m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01 ? m.emissiveIntensity || 1 : 0;
    const col = new Float32Array(n * 3);
    const pbr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
      pbr[i * 3] = m.roughness; pbr[i * 3 + 1] = m.metalness; pbr[i * 3 + 2] = glow;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPBR', new THREE.BufferAttribute(pbr, 3));
    (parts[m.name] ||= []).push({ start: vertexOffset, count: n });
    vertexOffset += n;
    geos.push(g);
  }

  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  merged.clearGroups();
  merged.computeBoundingSphere();

  const mesh = new THREE.SkinnedMesh(merged, RIG_MAT);
  mesh.name = ref.name;
  mesh.bindMode = ref.bindMode;
  mesh.position.copy(ref.position);
  mesh.quaternion.copy(ref.quaternion);
  mesh.scale.copy(ref.scale);
  mesh.bind(ref.skeleton, ref.bindMatrix);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // culling: bind-pose sphere padded for the walk/attack poses (skeleton is never re-evaluated for this)
  mesh.boundingSphere = merged.boundingSphere.clone();
  mesh.boundingSphere.radius *= 1.6;
  mesh.userData.parts = parts;
  for (const p of prims) parent.remove(p);
  parent.add(mesh);
}

export function loadRig(name) {
  if (!cache.has(name)) {
    cache.set(name, new Promise((resolve, reject) => {
      loader.load(`${import.meta.env.BASE_URL}models/${name}.glb`, (gltf) => {
        mergeCharacter(gltf.scene);
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        resolve(gltf);
      }, undefined, reject);
    }));
  }
  return cache.get(name);
}

export function rigReady(name) {
  return cache.has(name) && cache.get(name).loaded;
}

// Preload; call before the game starts so spawns can use the models synchronously.
export async function preloadRigs(names) {
  for (const n of names) {
    try {
      const gltf = await loadRig(n);
      cache.set(n, Object.assign(Promise.resolve(gltf), { loaded: gltf }));
    } catch (e) {
      console.warn('rig failed to load', n, e);
    }
  }
}

// Returns { mesh, mixer, actions, play(name, once), tint(part, hex) } or null if not loaded.
export function makeRigged(name) {
  const entry = cache.get(name);
  const gltf = entry && entry.loaded;
  if (!gltf) return null;
  const mesh = cloneSkeleton(gltf.scene);
  mesh.traverse((o) => { if (o.isSkinnedMesh) o.castShadow = rigShadows; });
  const mixer = new THREE.AnimationMixer(mesh);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  let current = null;
  const play = (n, once = false) => {
    const a = actions[n];
    if (!a) return;
    if (once) {
      a.reset().setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = false;
      a.play();
      return;
    }
    if (current === a) return;
    if (current) current.fadeOut(0.15);
    a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.15).play();
    current = a;
  };
  // Recolour one named part (e.g. 'hair'). Gives this clone its own colour attribute; every other
  // attribute stays shared with the template so no extra GPU memory is used.
  const tint = (part, hex) => {
    let skinned = null;
    mesh.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
    const ranges = skinned && skinned.userData.parts && skinned.userData.parts[part];
    if (!ranges) return;
    const src = skinned.geometry;
    if (!skinned.userData.ownColor) {
      const g = new THREE.BufferGeometry();
      g.setIndex(src.index);
      for (const [k, attr] of Object.entries(src.attributes)) g.setAttribute(k, k === 'color' ? attr.clone() : attr);
      g.groups = src.groups;
      g.boundingSphere = src.boundingSphere;
      skinned.geometry = g;
      skinned.userData.ownColor = true;
    }
    const c = new THREE.Color(hex);
    const col = skinned.geometry.attributes.color;
    for (const r of ranges) for (let i = r.start; i < r.start + r.count; i++) col.setXYZ(i, c.r, c.g, c.b);
    col.needsUpdate = true;
  };
  mesh.userData.rig = { mixer, actions, play, tint };
  return { mesh, mixer, actions, play, tint };
}
