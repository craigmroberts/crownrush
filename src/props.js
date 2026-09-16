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
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

// #51: the base colour maps are KTX2/ETC1S, which stays compressed in video memory instead of being
// unpacked to RGBA on upload. A 1024 JPEG costs 5.59 MB there, 7.5 MB once three.js has built its
// mipmaps; the same picture as ETC1S costs 0.7 MB with the mips in the file. Five buildings: 37 MB
// down to 3.3 MB, and they are the only textures in the game that are not a few hundred pixels wide.
//
// It is bought with download, and the price is stated rather than hidden: the transcoder is 584 kB
// of wasm and wrapper, 262 kB gzipped, against models that came out 3 kB larger than the JPEGs they
// replaced. The Draco decoder was rejected for exactly this shape of trade (docs/performance-backlog
// .md), and the difference is what the two bought -- Draco saved a fraction of its own size on the
// wire and nothing at all afterwards, this pays once at load and gives back 34 MB for the whole run.
let transcoder = null;
let gl = null;

// KTX2Loader cannot transcode until it knows which compressed formats the device has, and the only
// thing that can answer is a renderer. main.js hands over the game's own before the first building is
// fetched: standing up a second WebGL context to ask would spend one of the handful a browser allows,
// and this game already carries a recovery path for losing the one it needs.
export function usePropRenderer(renderer) {
  gl = renderer;
}

// No setTranscoderPath. KTX2Loader reaches for its own copy with `new URL('../libs/basis/...',
// import.meta.url)`, which Vite resolves at build time into a hashed asset of the bundle -- so the
// transcoder is versioned with the three it came from, listed in the service worker's precache, and
// fetched from this origin. Pointing at a copy under public/ instead emitted BOTH: Vite emits those
// URLs whether or not the default branch ever runs, which is the same duplicate-decoder trap r186
// sprang with Draco (docs/performance-backlog.md), caught this time by reading the build output.
function ktx2() {
  if (!transcoder && gl) {
    transcoder = new KTX2Loader().detectSupport(gl);
    loader.setKTX2Loader(transcoder);
  }
  return transcoder;
}

// The transcoder holds a worker with a copy of the wasm in it. Every building is in hand once the
// deferred props have landed, so main.js hands it back there, the way it hands back the portrait
// renderer. Nothing breaks if a load comes later: the next preloadProps stands a fresh one up.
export function releasePropTranscoder() {
  if (!transcoder) return;
  transcoder.dispose();
  transcoder = null;
  loader.setKTX2Loader(null);
}

const PROP_FILE = { hut: 'hut_ai', keep: 'keep_ai', tower: 'tower_ai', barracks: 'barracks_ai', house: 'house_ai' };

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

// All at once, for the same reason preloadRigs is. A building that fails or has not arrived yet is
// not fatal: makeStructure falls back to the built version of every one of these.
export async function preloadProps(names, onProgress = null) {
  let done = 0;
  ktx2();
  await Promise.all(names.map(async (n) => {
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
  }));
}

// Recolour without flattening. Every texel keeps its brightness relative to the building's average,
// so the shingle rows, the log shadows and the dark doorway all survive and only the hue moves.
// Multiplying by a tint instead would just dim it, and the red roof would come out dark red rather
// than stone. This is the stand-in until each village material has its own generated building.
//
// The arithmetic is the same arithmetic it always was, moved from a canvas into the fragment shader.
// Two reasons, and the second is the one that matters. A compressed texture has no pixels to read
// back: `getImageData` on a KTX2 map gets nothing, because what arrived is ETC1S blocks the GPU
// understands and the CPU does not. And the canvas version wrote its result into a 1024x1024
// CanvasTexture *per tint*, which is another 7.5 MB of RGBA on the GPU each time the village crosses
// a material boundary -- so a run that reached diamond walls was paying the very cost #51 is about,
// four times over per building. Tinting in the shader adds no texture at all.
//
// The shader wants the texel in the 0-255 sRGB space the canvas worked in, and gets it in linear,
// because the map is uploaded as sRGB and the hardware decodes on the sample. sRGBTransferOETF and
// its inverse are always in scope: WebGLProgram puts colorspace_pars_fragment in every fragment
// prefix. The mean is measured when the texture is compressed and travels in the material's extras
// (tools/models/compress.mjs) -- there is nowhere else left to get it from.
const TINT_PARS = `
uniform vec3 tintColor;
uniform float tintAmount;
uniform float tintMean;
`;
const TINT_MAP = `
vec4 sampledDiffuseColor = texture2D( map, vMapUv );
vec3 tintSrgb = sRGBTransferOETF( sampledDiffuseColor ).rgb;
float tintF = dot( tintSrgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / tintMean;
tintSrgb = mix( tintSrgb, min( vec3( 1.0 ), tintColor * tintF ), tintAmount );
diffuseColor *= sRGBTransferEOTF( vec4( tintSrgb, sampledDiffuseColor.a ) );
`;

function tintedMaterial(name, src, tint) {
  const key = `${name}|${tint.color}|${tint.amount}`;
  if (tints.has(key)) return tints.get(key);
  const m = src.clone();
  if (src.map) {
    // 0.3 is about where the five buildings sit, and is only ever used by a model that has not been
    // through the compress step -- which is also the only way a building can still be carrying a JPEG.
    const mean = Number(src.userData && src.userData.meanLuminance) || 0.3;
    const rgb = new THREE.Vector3(((tint.color >> 16) & 255) / 255, ((tint.color >> 8) & 255) / 255, (tint.color & 255) / 255);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.tintColor = { value: rgb };
      shader.uniforms.tintAmount = { value: tint.amount };
      shader.uniforms.tintMean = { value: mean };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>${TINT_PARS}`)
        .replace('#include <map_fragment>', TINT_MAP);
    };
    // Without a key of its own this material shares a compiled program with the untinted one it was
    // cloned from -- same type, same defines -- and whichever compiled first decides what both draw.
    // One key for every tint, not one each: the shader is identical and only the three uniforms
    // differ, and three.js hands each material its own uniforms while sharing the compiled program.
    m.customProgramCacheKey = () => 'crownrush-prop-tint';
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
  // #62: this borrows the prop's buffers rather than making its own, and a ghost built from it must
  // never free them. Said here because here is the only place that knows.
  group.userData.sharedGeometry = true;
  return group;
}
