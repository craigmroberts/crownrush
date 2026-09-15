// Static imported models — buildings, not characters. Generated elsewhere, remeshed, and baked to
// vertex colours by tools/blender/bake_vertex_colors.py, which also stands them on the floor at the
// size the procedural versions are built at, so they drop in where those stood.
//
// Characters go through rig.js because they need bones and a crowd palette. A building needs neither:
// it is one merged geometry with its colour in the mesh, cloned per use. Which is also why the colour
// is baked rather than painted by material — the detail here is per-face (shingles, log courses, the
// stone around the door), and a flat material per part would throw all of that away.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const PROP_FILE = { hut: 'hut_ai' };

const base = new Map();     // name -> merged BufferGeometry, colours as generated
const tinted = new Map();   // `name|hex|amount` -> a recoloured copy

const PROP_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, name: 'prop' });

// meshopt quantises: positions arrive as normalized int16 with the real size on the node transform,
// and colours as normalized bytes. Both have to become plain floats before anything touches them.
// Folding the node transform into a quantised position attribute writes the result back as integers
// and clamps it, which collapses the building to a unit cube; reading a byte colour as though it
// were a float would be just as wrong in the tint below.
function toFloat(geo, name, size) {
  const a = geo.getAttribute(name);
  if (!a || (a.array instanceof Float32Array && !a.normalized)) return;
  const out = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++) {
    out[i * size] = a.getX(i);
    out[i * size + 1] = a.getY(i);
    out[i * size + 2] = a.getZ(i);
    if (size > 3) out[i * size + 3] = a.getW(i);
  }
  geo.setAttribute(name, new THREE.BufferAttribute(out, size));
}

// Everything in one geometry: the exporter writes a primitive per material, and a building has no
// reason to be more than one draw call.
function merge(scene) {
  const geos = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    toFloat(g, 'position', 3);
    toFloat(g, 'normal', 3);
    toFloat(g, 'color', g.getAttribute('color') ? g.getAttribute('color').itemSize : 3);
    g.applyMatrix4(o.matrixWorld);
    geos.push(g);
  });
  if (!geos.length) return null;
  const m = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  m.computeBoundingSphere();
  return m;
}

export async function preloadProps(names, onProgress = null) {
  let done = 0;
  for (const n of names) {
    try {
      const gltf = await new Promise((res, rej) => loader.load(`${import.meta.env.BASE_URL}models/${PROP_FILE[n] || n}.glb`, res, undefined, rej));
      gltf.scene.updateMatrixWorld(true);
      const g = merge(gltf.scene);
      if (g) base.set(n, g);
    } catch (e) {
      console.warn('prop failed to load', n, e);
    }
    done++;
    if (onProgress) onProgress(done, names.length);
  }
}

// Recolour without flattening. Each vertex keeps its own brightness relative to the building's
// average, so the shingle rows, the log shadows and the dark doorway all survive; only the hue moves.
// Multiplying by a tint instead would just dim it, and a red roof would come out dark red rather than
// stone. This is the stand-in until each village material has its own generated building.
function recolour(g, hex, amount) {
  const out = g.clone();
  const c = out.attributes.color;
  if (!c) return out;
  const a = c.array.slice();
  const t = new THREE.Color(hex);          // sRGB in, linear out, matching COLOR_0
  const lum = (i) => 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
  let mean = 0;
  for (let i = 0; i < a.length; i += c.itemSize) mean += lum(i);
  mean = Math.max(1e-4, mean / (a.length / c.itemSize));
  for (let i = 0; i < a.length; i += c.itemSize) {
    const f = lum(i) / mean;
    a[i] += (Math.min(1, t.r * f) - a[i]) * amount;
    a[i + 1] += (Math.min(1, t.g * f) - a[i + 1]) * amount;
    a[i + 2] += (Math.min(1, t.b * f) - a[i + 2]) * amount;
  }
  out.setAttribute('color', new THREE.BufferAttribute(a, c.itemSize, c.normalized));
  return out;
}

export function propReady(name) {
  return base.has(name);
}

// A Group rather than the bare Mesh, because callers position, rotate and popIn() these the same way
// they do a procedural building, and those all hang things off a group.
export function makeProp(name, tint = null) {
  const g = base.get(name);
  if (!g) return null;
  let geo = g;
  if (tint && tint.amount > 0) {
    const key = `${name}|${tint.color}|${tint.amount}`;
    if (!tinted.has(key)) tinted.set(key, recolour(g, tint.color, tint.amount));
    geo = tinted.get(key);
  }
  const mesh = new THREE.Mesh(geo, PROP_MAT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}
