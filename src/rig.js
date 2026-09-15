// Loads rigged GLB characters (built by tools/blender/make_character.py) and hands out animated clones.
//
// Performance notes (see README "Performance"):
//  - Blender exports one primitive per material (8–11 per character). At load we merge them into ONE
//    skinned mesh with vertex colours, so a character costs 1–2 draw calls and one skeleton instead of 11.
//  - Frustum culling is on with a padded bounding sphere, so off-screen characters are skipped entirely.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Crowd } from './crowd.js';

// The characters are meshopt-compressed (tools/models/compress.mjs). Draco was here before and cost
// more on both halves of the sum: brotli'd, Draco was 341 kB of models behind a 57 kB decoder, and
// meshopt is 308 kB behind a 7 kB one. The decoder is also a module we bundle rather than three files
// fetched from public/ at run time, so there is no decoder path to get wrong on a subpath deploy.
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

// The models there are hundreds of. These go through crowd.js, which draws all of one model in a
// single instanced call and animates them on the GPU. The King, the Queen and the mounted King stay
// on the skinned path below: there are one or two of them and they need real bones.
const CROWD_RIGS = new Set(['raider', 'archer', 'elite', 'brute', 'boss', 'swordsman']);
let crowd = null;

// Turns the instanced path on for this run. Off leaves every character a SkinnedMesh, which is the
// path that was here before and the one to fall back to if the instanced one misbehaves on a device.
export function enableCrowd(scene) {
  crowd = new Crowd(scene);
  return crowd;
}

export function crowdActive() {
  return !!crowd;
}

export function updateCrowd(dt, camera) {
  if (crowd) crowd.update(dt, camera);
}

export function clearCrowd() {
  if (crowd) crowd.clear();
}

export function crowdStats() {
  return crowd ? crowd.stats() : { models: 0, characters: 0 };
}

let rigShadows = true;
// Mobile swaps real character shadows for cheap blob shadows (see Game.updateBlobs).
export function setRigShadows(on) {
  rigShadows = on;
  if (crowd) crowd.setShadows(on);
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
    const pbr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pbr[i * 3] = m.roughness; pbr[i * 3 + 1] = m.metalness; pbr[i * 3 + 2] = glow;
    }
    // Our own characters carry one flat material per part, so the colour is painted on from the
    // material. A model built elsewhere arrives as a single material with its colour already baked
    // into the mesh, and repainting it here would flatten the whole character to one shade, so a
    // geometry that already has colours keeps them.
    if (!g.attributes.color) {
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
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

// Characters whose model does not come from make_character.py. The King is a generated mesh that was
// remeshed, baked to vertex colours and fitted to our skeleton (tools/blender/rig_imported.py); it
// keeps its own filename so rebuilding the parametric King cannot quietly overwrite him.
const MODEL_FILE = { king: 'king_ai', queen: 'queen_ai', raider: 'raider_ai' };

export function loadRig(name) {
  if (!cache.has(name)) {
    cache.set(name, new Promise((resolve, reject) => {
      loader.load(`${import.meta.env.BASE_URL}models/${MODEL_FILE[name] || name}.glb`, (gltf) => {
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
export async function preloadRigs(names, onProgress = null) {
  let done = 0;
  for (const n of names) {
    try {
      const gltf = await loadRig(n);
      cache.set(n, Object.assign(Promise.resolve(gltf), { loaded: gltf }));
      // Bake the crowd models now rather than on the first spawn: it is a few milliseconds of
      // sampling per model, and the loading bar is the right place to spend it.
      if (crowd && CROWD_RIGS.has(n)) crowd.add(n, gltf);
    } catch (e) {
      console.warn('rig failed to load', n, e);
    }
    done++;
    if (onProgress) onProgress(done, names.length);
  }
}

// #5: a portrait of a character for the title screen, rendered from the real rig in a second
// renderer so the art always matches the game and costs nothing extra to download.
//
// That renderer needs its own WebGL context, and a browser only allows a handful of live ones per
// page. `dispose()` frees three.js's objects but leaves the context alive until the garbage
// collector gets to it, so a renderer per portrait quietly stacks them up; when the limit is hit the
// browser drops the OLDEST context, which is the game's own canvas. The HUD and the minimap are DOM
// and 2D canvas, so they carry on drawing while the world goes blank: a white screen with a working
// interface. One shared portrait renderer, released the moment the title screen is built, instead.
let portraitRenderer = null;
export function releasePortraitRenderer() {
  if (!portraitRenderer) return;
  portraitRenderer.dispose();
  portraitRenderer.forceContextLoss();  // dispose() alone keeps the context; this hands it back now
  portraitRenderer = null;
}

export function renderPortrait(name, w = 300, h = 380, tints = null) {
  const rig = makeRigged(name, tints);
  if (!rig) return null;
  if (!portraitRenderer) {
    portraitRenderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: true });
    portraitRenderer.outputColorSpace = THREE.SRGBColorSpace;
    portraitRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    portraitRenderer.toneMappingExposure = 1.15;
  }
  const r = portraitRenderer;
  const canvas = r.domElement;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.setSize(w, h, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff8ea, 0x8fb86a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  rig.mesh.rotation.y = name === 'queen' ? 0.35 : -0.35;
  scene.add(rig.mesh);
  rig.play('Idle');
  rig.mixer.update(0.4);
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 20);
  cam.position.set(0, 1.35, 4.6);
  cam.lookAt(0, 1.05, 0);
  r.render(scene, cam);
  const url = canvas.toDataURL('image/png');
  scene.clear();
  return url;
}

// Recoloured variants (enemy ranks, hair colours) share one geometry per variant, so a hundred
// bandits cost the GPU one colour buffer, not a hundred.
const variants = new Map();
function variantScene(gltf, name, tints) {
  const key = `${name}|${tints.map(([p, h]) => `${p}:${h}`).join(',')}`;
  if (variants.has(key)) return variants.get(key);
  const scene = cloneSkeleton(gltf.scene);
  let skinned = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
  if (skinned) {
    const src = skinned.geometry;
    const g = new THREE.BufferGeometry();
    g.setIndex(src.index);
    for (const [k, attr] of Object.entries(src.attributes)) g.setAttribute(k, k === 'color' ? attr.clone() : attr);
    g.boundingSphere = src.boundingSphere;
    skinned.geometry = g;
    const col = g.attributes.color;
    const c = new THREE.Color();
    for (const [part, hex] of tints) {
      const ranges = skinned.userData.parts && skinned.userData.parts[part];
      if (!ranges) continue;
      c.set(hex);
      for (const r of ranges) for (let i = r.start; i < r.start + r.count; i++) col.setXYZ(i, c.r, c.g, c.b);
    }
  }
  variants.set(key, scene);
  return scene;
}

// Returns { mesh, mixer, actions, play(name, once), tint(part, hex) } or null if not loaded.
// `tints` = [[partName, hex], ...] picks a shared recoloured variant of the character.
export function makeRigged(name, tints = null) {
  const entry = cache.get(name);
  const gltf = entry && entry.loaded;
  if (!gltf) return null;
  // One of the models there are hundreds of, and the instanced path is up: hand back an instance.
  // It returns null if the model ran out of palette rows, and then this falls through to a real
  // skinned character, so the ceiling is a slower character rather than a missing one.
  if (crowd && crowd.has(name)) {
    const instanced = crowd.make(name, tints);
    if (instanced) return instanced;
  }
  const mesh = cloneSkeleton(tints && tints.length ? variantScene(gltf, name, tints) : gltf.scene);
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
