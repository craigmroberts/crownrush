// Static imported models — buildings, not characters. Generated elsewhere, remeshed, and stood on
// the floor at the size our own are built at by tools/blender/bake_vertex_colors.py, so they drop in
// where the procedural versions stood.
//
// Characters bake their texture down to vertex colours, because the crowd draws a hundred of them
// from one palette and a texture cannot be tinted per instance. A building is one object drawn once,
// so it keeps its texture: the detail worth importing is painted, not modelled. The Archery Range's
// bullseye is four rings on a disc of twenty triangles, and there is nowhere in the mesh to put them.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const PROP_FILE = { hut: 'hut_ai', keep: 'keep_ai' };

const base = new Map();     // name -> { geometry, material } as generated
const tints = new Map();    // `name|hex|amount` -> a recoloured material

// meshopt quantises: positions arrive as normalized int16 with the real size on the node transform,
// UVs and colours as normalized bytes. Folding the node transform into a quantised position attribute
// writes the result back as integers and clamps it, which collapses a building to a unit cube.
function toFloat(geo, name) {
  const a = geo.getAttribute(name);
  if (!a || (a.array instanceof Float32Array && !a.normalized)) return;
  const size = a.itemSize;
  const out = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++) {
    out[i * size] = a.getX(i);
    if (size > 1) out[i * size + 1] = a.getY(i);
    if (size > 2) out[i * size + 2] = a.getZ(i);
    if (size > 3) out[i * size + 3] = a.getW(i);
  }
  geo.setAttribute(name, new THREE.BufferAttribute(out, size));
}

// Everything in one geometry: a building has no reason to be more than one draw call.
function merge(scene) {
  const geos = [];
  let material = null;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (!material) material = o.material;
    const g = o.geometry.clone();
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      else toFloat(g, k);
    }
    g.applyMatrix4(o.matrixWorld);
    geos.push(g);
  });
  if (!geos.length) return null;
  const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  geometry.computeBoundingSphere();
  return { geometry, material };
}

export async function preloadProps(names, onProgress = null) {
  let done = 0;
  for (const n of names) {
    try {
      const gltf = await new Promise((res, rej) => loader.load(`${import.meta.env.BASE_URL}models/${PROP_FILE[n] || n}.glb`, res, undefined, rej));
      gltf.scene.updateMatrixWorld(true);
      const p = merge(gltf.scene);
      if (p) base.set(n, p);
    } catch (e) {
      console.warn('prop failed to load', n, e);
    }
    done++;
    if (onProgress) onProgress(done, names.length);
  }
}

// Recolour without flattening. Every texel keeps its brightness relative to the building's average,
// so the shingle rows, the log shadows and the dark doorway all survive and only the hue moves.
// Multiplying by a tint instead would just dim it, and the red roof would come out dark red rather
// than stone. This is the stand-in until each village material has its own generated building.
function recolour(img, hex, amount) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  const tr = (hex >> 16) & 255;
  const tg = (hex >> 8) & 255;
  const tb = hex & 255;
  const lum = (i) => 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
  let mean = 0;
  for (let i = 0; i < a.length; i += 4) mean += lum(i);
  mean = Math.max(1, mean / (a.length / 4));
  for (let i = 0; i < a.length; i += 4) {
    const f = lum(i) / mean;
    a[i] += (Math.min(255, tr * f) - a[i]) * amount;
    a[i + 1] += (Math.min(255, tg * f) - a[i + 1]) * amount;
    a[i + 2] += (Math.min(255, tb * f) - a[i + 2]) * amount;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

function tintedMaterial(name, src, tint) {
  const key = `${name}|${tint.color}|${tint.amount}`;
  if (tints.has(key)) return tints.get(key);
  const m = src.clone();
  if (src.map && src.map.image) {
    const tex = new THREE.CanvasTexture(recolour(src.map.image, tint.color, tint.amount));
    // glTF textures are not flipped; a CanvasTexture is by default, and getting this wrong turns the
    // building inside out rather than failing.
    tex.flipY = src.map.flipY;
    tex.colorSpace = src.map.colorSpace;
    tex.wrapS = src.map.wrapS;
    tex.wrapT = src.map.wrapT;
    tex.anisotropy = src.map.anisotropy;
    m.map = tex;
  } else {
    m.color = new THREE.Color(tint.color);
  }
  m.needsUpdate = true;
  tints.set(key, m);
  return m;
}

export function propReady(name) {
  return base.has(name);
}

// A Group rather than the bare Mesh, because callers position, rotate and popIn() these the same way
// they do a procedural building, and those all hang things off a group.
export function makeProp(name, tint = null) {
  const p = base.get(name);
  if (!p) return null;
  const mesh = new THREE.Mesh(p.geometry, tint && tint.amount > 0 ? tintedMaterial(name, p.material, tint) : p.material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}
