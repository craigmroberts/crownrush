import * as THREE from 'three';
import { CFG } from './config.js';
import { mat, makeTree, makeBush, makeRock, makeSpikes, makeCliff } from './models.js';

// Deterministic pseudo-random so the map is the same every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Village bounds: scenery is kept out of here so pads & structures have room.
const VILLAGE = { x0: -22, x1: 24, z0: -14, z1: 20 };

export function buildWorld(scene) {
  const size = CFG.world.size;
  const rand = rng(1337);

  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(0x47a262));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // dirt paths: a few long strips crossing the village
  const pathMat = mat(0xd9b27c);
  const addPath = (x, z, len, width, angle) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, width), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = angle;
    p.position.set(x, 0.012, z);
    p.receiveShadow = true;
    scene.add(p);
  };
  addPath(0, 0, size, 4.2, 0.18);
  addPath(2, 0, size, 4.2, Math.PI / 2 + 0.35);
  addPath(-30, 30, 90, 3.5, -0.8);
  addPath(35, -25, 80, 3.5, 0.9);

  // cliffs in the north-west, like the ad's grey mesas
  const cliffs = new THREE.Group();
  const cl = [
    [-30, -30, 18, 6, 14],
    [-22, -38, 14, 9, 12],
    [-38, -20, 12, 4, 12],
    [-46, -34, 16, 7, 18],
    [-28, -46, 20, 5, 10],
    [-14, -46, 10, 3, 8],
  ];
  for (const [x, z, w, h, d] of cl) {
    const c = makeCliff(w, h, d);
    c.position.x = x;
    c.position.z = z;
    cliffs.add(c);
  }
  scene.add(cliffs);

  // scenery scattered outside the village
  const inVillage = (x, z) => x > VILLAGE.x0 && x < VILLAGE.x1 && z > VILLAGE.z0 && z < VILLAGE.z1;
  const inCliffs = (x, z) => x < -8 && z < -14;
  const scenery = new THREE.Group();
  const half = size / 2 - 6;
  const place = (maker, count, minDist = 0) => {
    let tries = 0;
    for (let i = 0; i < count && tries < count * 20; tries++) {
      const x = (rand() * 2 - 1) * half;
      const z = (rand() * 2 - 1) * half;
      if (inVillage(x, z) || inCliffs(x, z)) continue;
      if (Math.hypot(x, z) < minDist) continue;
      const o = maker();
      o.position.x = x;
      o.position.z = z;
      scenery.add(o);
      i++;
    }
  };
  place(() => makeTree(0.9 + rand() * 0.6), 70, 24);
  place(() => makeBush(), 40, 22);
  place(() => makeRock(0.7 + rand() * 0.9), 40, 22);
  place(() => {
    const s = makeSpikes();
    s.rotation.y = rand() * Math.PI;
    return s;
  }, 24, 22);

  // a few decorations inside the village edge for flavour
  for (const [x, z] of [[-20, 18], [22, -12], [22, 18], [-20, -12]]) {
    const t = makeTree(1.1);
    t.position.set(x, 0, z);
    scenery.add(t);
  }
  for (const [x, z, a] of [[-16, -10, 0.4], [20, 2, 1.2], [-2, 19, 0.1]]) {
    const s = makeSpikes();
    s.position.set(x, 0, z);
    s.rotation.y = a;
    scenery.add(s);
  }
  scene.add(scenery);

  return { ground, VILLAGE };
}

export function setupLights(scene) {
  scene.background = new THREE.Color(0x47a262);
  scene.fog = new THREE.Fog(0x47a262, 55, 95);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x3a7a4a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 36;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  return { sun, hemi };
}
