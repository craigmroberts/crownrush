// Loads rigged GLB characters (built by tools/blender/make_character.py) and hands out animated clones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const draco = new DRACOLoader();
draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
const cache = new Map();

export function loadRig(name) {
  if (!cache.has(name)) {
    cache.set(name, new Promise((resolve, reject) => {
      loader.load(`${import.meta.env.BASE_URL}models/${name}.glb`, (gltf) => {
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
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

// Returns { mesh, mixer, actions, play(name, once) } or null if not loaded.
export function makeRigged(name) {
  const entry = cache.get(name);
  const gltf = entry && entry.loaded;
  if (!gltf) return null;
  const mesh = cloneSkeleton(gltf.scene);
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
  mesh.userData.rig = { mixer, actions, play };
  return { mesh, mixer, actions, play };
}
