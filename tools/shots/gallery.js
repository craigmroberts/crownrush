// The stage the structure shots are taken on.
//
// Everything here is the game's own: the builders out of src/models.js, the lighting out of
// src/world.js. Nothing is redrawn for the photograph, so what comes out is what a player sees.
//
// tools/shots/buildings.mjs drives this — it calls window.shoot(spec) once per structure and saves
// what comes back.
import * as THREE from 'three';
import { setupLights } from '../../src/world.js';
import {
  makeKeep, makeHut, makeTower, makeBarracks, makeBank, makeGatePost,
  makeWallSegment, makeGate, makeRubble, makeFence, makeBridge, makeCamp, makeSpikes,
  makeLumberTree, makeOreRock, makeIronSeam, makeGemNode, makeHayBale, makeWheatField,
} from '../../src/models.js';

// Overridable from the driver: ?size=640&scale=1 keeps a shot small enough to embed in a page,
// while the default is dense enough to crop into.
const params = new URLSearchParams(location.search);
const SIZE = Number(params.get('size') || 640);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Number(params.get('scale') || 2));
renderer.setSize(SIZE, SIZE, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;   // the game's noon exposure
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
setupLights(scene);
// The stage is lit like the game's noon, but without its fog: a structure photographed against a flat
// ground reads better than one fading into the distance.
scene.fog = null;

// A round of grass for the structure to stand on, so its shadow lands on something.
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(30, 64),
  new THREE.MeshStandardMaterial({ color: 0x5fb45c, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);

// Every builder in one place, with the arguments each one wants. `label` is what the shot is called.
const BUILDERS = {
  keep: (m) => makeKeep(m),
  hut: (m) => makeHut(m),
  tower: (m, level) => makeTower(level ?? 1, m),
  barracks: (m) => makeBarracks(m),
  bank: () => makeBank(),
  gatepost: () => makeGatePost(),
  wall: (m, level) => makeWallSegment(7, level ?? 0),
  gate: (m, level) => makeGate(level ?? 0),
  rubble: (m, level) => makeRubble(7, level ?? 0),
  fence: () => makeFence(7),
  bridge: () => makeBridge(9, 4),
  camp: () => makeCamp(9),
  spikes: () => makeSpikes(),
  lumber: () => makeLumberTree(),
  ore: () => makeOreRock(),
  iron: () => makeIronSeam(),
  gem: () => makeGemNode(),
  hay: () => makeHayBale(),
  wheat: () => makeWheatField(8, 6),
};

// Frames the camera on whatever was built, from the three-quarter angle the game's own camera uses,
// so a structure is seen the way it is seen in play rather than head-on.
function frame(object, { azimuth = -0.75, elevation = 0.42, zoom = 1 } = {}) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.5 * zoom;
  camera.position.set(
    centre.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
    centre.y + Math.sin(elevation) * distance,
    centre.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
  );
  // look a little below the middle, so a tall thing does not sit at the very top of the frame
  camera.lookAt(centre.x, centre.y - size.y * 0.06, centre.z);
  camera.updateProjectionMatrix();
  return { size, centre };
}

let current = null;

// spec: { kind, material, level, zoom }
window.shoot = (spec) => {
  if (current) {
    scene.remove(current);
    current.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
  }
  const build = BUILDERS[spec.kind];
  if (!build) return { error: `no builder for ${spec.kind}` };

  const object = build(spec.material || 'wood', spec.level);
  object.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(object);
  current = object;

  // The ground plate follows the structure, so a long wall is not standing on a small disc.
  const { size, centre } = frame(object, spec);
  ground.position.set(centre.x, 0, centre.z);

  renderer.render(scene, camera);
  let triangles = 0;
  let meshes = 0;
  object.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    triangles += n * (o.isInstancedMesh ? o.count : 1);
  });
  return {
    png: renderer.domElement.toDataURL('image/png'),
    meshes,
    triangles: Math.round(triangles),
    size: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)],
  };
};

window.galleryReady = true;
