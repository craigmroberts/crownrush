// Draws the crowd as one instanced mesh per character model, skinned on the GPU.
//
// The problem this solves. Every character used to be its own SkinnedMesh with its own skeleton and
// its own AnimationMixer. At 183 characters the probe measured 1048 draw calls, 193 textures and a
// mixer update, a skeleton evaluation and a bone-texture upload per character per frame. The draw
// calls are the visible half; the per-character CPU work is the half that decides how many raiders a
// phone can hold.
//
// What replaces it. Each model's animation is sampled once at load into a texture — bones across,
// frames down — and every character of that model is then one instance of one mesh. The vertex shader
// does the same four-bone blend three.js would, reading the bone matrices out of that texture at a row
// picked per instance. Nothing about a character's pose costs CPU time after load: the only per-frame
// work is writing one matrix and four floats per character.
//
// Colour is per instance too. The rank tints and the archers' hair used to mean a recoloured copy of
// the geometry per variant, which would have meant a draw call per variant here. Instead each vertex
// carries which part of the body it belongs to, each instance owns a row of a palette texture, and the
// shader looks the colour up. One draw call per model, whatever the tints.
//
// What stays on the old path. The King, the Queen and anything that needs a bone to hang something
// off, or blending between clips, is still a real SkinnedMesh — see rig.js. This is for the crowd,
// where there are hundreds and they all do the same three things.
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Sampling rate for the bake. The clips are 0.83 s to 2 s, so this is 25 to 60 frames each: small
// enough that all three fit in a texture a few tens of kilobytes, dense enough that the snap between
// frames is invisible at the size a raider occupies on screen. There is deliberately no interpolation
// between frames in the shader; it would double the texture reads to smooth something nobody can see.
const FPS = 30;
// Widest part list across the models is twelve (see the `parts` map rig.js builds); sixteen leaves room.
const MAX_PARTS = 16;
// Palette rows, so the ceiling on live characters of one model. The game's own caps are far below this.
const MAX_ROWS = 256;
// Starting instance capacity per model; it grows if a night ever exceeds it.
const START_CAPACITY = 64;
// How far off screen a character is still drawn for. The tallest character is about 3 units, and the
// rest of the margin is for the shadow it throws towards the camera from just outside the view.
const CULL_RADIUS = 8;

const _sphere = new THREE.Sphere();
const _frustum = new THREE.Frustum();
const _viewProjection = new THREE.Matrix4();

// ---------------------------------------------------------------- baking

// Samples every clip of a rig into a bone-matrix texture.
//
// The layout is one row per frame, and four RGBA texels per bone across, which is one mat4. Rows are
// laid out clip after clip, and `clips` records where each one starts and how many frames it has.
//
// The matrices are exactly what three.js would have uploaded: Skeleton.update writes
// `bone.matrixWorld * boneInverse` per bone, and the rigs all have an identity bind matrix and an
// identity local matrix (checked against the real models, not assumed), so the shader needs no
// bindMatrix correction and a vertex is just the weighted sum of its four bone matrices.
function bakeBones(gltf) {
  let source = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !source) source = o; });
  if (!source) return null;

  // Bake off a full clone of the character, not a hand-built copy of its skeleton. The bones do not
  // hang off the character's root directly — Blender leaves an armature node in between, and that
  // node has a transform of its own. Rebuilding the bone hierarchy by hand drops it, and every baked
  // matrix comes out in the wrong space: the characters render squashed into the ground.
  // SkeletonUtils.clone copies the whole graph and rebinds the skin to the copied bones, so the only
  // thing that changes is that this copy is at the origin and nothing on screen points at it.
  const root = cloneSkeleton(gltf.scene);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  let skinned = null;
  root.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
  if (!skinned) return null;
  const skeleton = skinned.skeleton;

  const mixer = new THREE.AnimationMixer(root);
  const names = ['Idle', 'Walk', 'Attack'].filter((n) => gltf.animations.some((c) => c.name === n));
  for (const c of gltf.animations) if (!names.includes(c.name)) names.push(c.name);

  const clips = {};
  let totalRows = 0;
  for (const name of names) {
    const clip = gltf.animations.find((c) => c.name === name);
    const frames = Math.max(1, Math.round(clip.duration * FPS));
    clips[name] = { row: totalRows, frames };
    totalRows += frames;
  }

  const boneCount = skeleton.bones.length;
  const width = boneCount * 4;
  const data = new Float32Array(width * totalRows * 4);

  for (const name of names) {
    const clip = gltf.animations.find((c) => c.name === name);
    const { row, frames } = clips[name];
    const action = mixer.clipAction(clip);
    action.reset();
    action.play();
    for (let f = 0; f < frames; f++) {
      mixer.setTime(f / FPS);
      root.updateMatrixWorld(true);
      skeleton.update();
      data.set(skeleton.boneMatrices, (row + f) * width * 4);
    }
    action.stop();
    mixer.uncacheAction(clip);
  }
  mixer.uncacheRoot(root);

  const texture = new THREE.DataTexture(data, width, totalRows, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  return { texture, width, height: totalRows, boneCount, clips, skinned: source };
}

// Adds the per-vertex "which part of the body is this" attribute the palette lookup needs, and reads
// off each part's colour as it came out of Blender so an untinted instance looks like the model does.
function addPartAttribute(geometry, parts) {
  const count = geometry.attributes.position.count;
  const aPart = new Float32Array(count);
  const names = Object.keys(parts || {});
  const base = new Float32Array(MAX_PARTS * 4);
  const colour = geometry.attributes.color;
  names.forEach((name, i) => {
    if (i >= MAX_PARTS) return;
    for (const r of parts[name]) {
      for (let v = r.start; v < r.start + r.count; v++) aPart[v] = i;
    }
    // every vertex of a part shares its colour, so the first one is the part's colour
    const first = parts[name][0].start;
    base[i * 4] = colour.getX(first);
    base[i * 4 + 1] = colour.getY(first);
    base[i * 4 + 2] = colour.getZ(first);
    base[i * 4 + 3] = 1;
  });
  geometry.setAttribute('aPart', new THREE.BufferAttribute(aPart, 1));
  return { names, base };
}

// ---------------------------------------------------------------- shader

// The skinning the vertex shader does, shared by the lit material and the depth material used for
// shadows, so a character's shadow can never drift out of step with the character.
const SKIN_CHUNK = /* glsl */`
attribute vec4 aAnim;    // x: first row of the clip, y: frames in it, z: when it started, w: 1 loop / 0 clamp
attribute float aRate;   // #55: playback speed, 1 = the rate the clip was baked at
attribute float aRow;    // this instance's row in the palette
attribute float aPart;   // which part of the body this vertex belongs to
uniform sampler2D uBones;
uniform vec2 uBoneTexel;
uniform float uTime;
uniform float uFps;

mat4 crowdBone(float index, float row) {
  float x = index * 4.0;
  float v = (row + 0.5) * uBoneTexel.y;
  return mat4(
    texture2D(uBones, vec2((x + 0.5) * uBoneTexel.x, v)),
    texture2D(uBones, vec2((x + 1.5) * uBoneTexel.x, v)),
    texture2D(uBones, vec2((x + 2.5) * uBoneTexel.x, v)),
    texture2D(uBones, vec2((x + 3.5) * uBoneTexel.x, v))
  );
}

mat4 crowdSkinMatrix() {
  // #55: uFps is the bake rate and is the same for every character of a model; aRate is this one's
  // own. A boss moves at 2.3 and an army archer at 9.0 -- 3.9x apart, and both used to play the same
  // walk cycle at the same speed, so one moonwalked and the other paddled. The stride is baked into
  // the clip, so matching the rate to the speed is what stops the feet sliding.
  // (No backticks in here: this whole chunk is a template literal, and one would end it.)
  float elapsed = (uTime - aAnim.z) * uFps * aRate;
  float frame = aAnim.w > 0.5 ? mod(elapsed, aAnim.y) : clamp(elapsed, 0.0, aAnim.y - 1.0);
  float row = aAnim.x + floor(max(frame, 0.0));
  return crowdBone(skinIndex.x, row) * skinWeight.x
       + crowdBone(skinIndex.y, row) * skinWeight.y
       + crowdBone(skinIndex.z, row) * skinWeight.z
       + crowdBone(skinIndex.w, row) * skinWeight.w;
}
`;

// three only declares skinIndex/skinWeight when it believes it is drawing a SkinnedMesh, which an
// InstancedMesh is not, so they are declared here.
const SKIN_ATTRS = /* glsl */`
attribute vec4 skinIndex;
attribute vec4 skinWeight;
`;

function patchVertex(shader, uniforms, { colour }) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${SKIN_ATTRS}\n${SKIN_CHUNK}\nmat4 crowdSkin;${colour ? '\nuniform sampler2D uPalette;\nuniform vec2 uPaletteSize;\nvarying vec3 vPBR;\nattribute vec3 aPBR;' : ''}`)
    // Built at the top of main, not at the first chunk that needs it. The depth shader's
    // beginnormal_vertex sits inside `#ifdef USE_DISPLACEMENTMAP`, so building it there would leave
    // the matrix unassigned in the shadow pass and every character would cast a bind-pose shadow.
    .replace('void main() {', 'void main() {\n\tcrowdSkin = crowdSkinMatrix();')
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mat3(crowdSkin) * normal);')
    .replace('#include <begin_vertex>', 'vec3 transformed = (crowdSkin * vec4(position, 1.0)).xyz;');
  if (colour) {
    // vColor is a vec4 in three's colour chunks (it has been since the batching work), so the palette
    // lookup is widened rather than assigned straight to it.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      `vColor = vec4(texture2D(uPalette, vec2((aPart + 0.5) / uPaletteSize.x, (aRow + 0.5) / uPaletteSize.y)).rgb, 1.0);\nvPBR = aPBR;`,
    );
  }
}

// ---------------------------------------------------------------- one model's crowd

class CrowdModel {
  constructor(name, gltf, scene) {
    this.name = name;
    this.baked = bakeBones(gltf);
    if (!this.baked) throw new Error(`crowd: ${name} has no skinned mesh`);

    const source = this.baked.skinned;
    const geometry = source.geometry.clone();
    const { names, base } = addPartAttribute(geometry, source.userData.parts);
    this.partIndex = new Map(names.map((n, i) => [n, i]));
    this.basePalette = base;

    // Palette: one row per live character, MAX_PARTS colours across.
    this.paletteData = new Float32Array(MAX_PARTS * MAX_ROWS * 4);
    this.palette = new THREE.DataTexture(this.paletteData, MAX_PARTS, MAX_ROWS, THREE.RGBAFormat, THREE.FloatType);
    this.palette.minFilter = THREE.NearestFilter;
    this.palette.magFilter = THREE.NearestFilter;
    this.palette.generateMipmaps = false;
    this.palette.needsUpdate = true;
    this.freeRows = Array.from({ length: MAX_ROWS }, (_, i) => MAX_ROWS - 1 - i);

    this.uniforms = {
      uBones: { value: this.baked.texture },
      uBoneTexel: { value: new THREE.Vector2(1 / this.baked.width, 1 / this.baked.height) },
      uTime: { value: 0 },
      uFps: { value: FPS },
      uPalette: { value: this.palette },
      uPaletteSize: { value: new THREE.Vector2(MAX_PARTS, MAX_ROWS) },
    };

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, name: `crowd-${name}` });
    material.onBeforeCompile = (shader) => patchVertex(shader, this.uniforms, { colour: true });
    material.customProgramCacheKey = () => `crowd-lit-${name}`;
    // The same per-vertex roughness/metalness/glow trick rig.js uses, so an instanced character and a
    // skinned one shade identically.
    const inject = material.onBeforeCompile;
    material.onBeforeCompile = (shader) => {
      inject(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPBR;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPBR.x;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vPBR.y;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vPBR.z;');
    };

    this.geometry = geometry;
    this.material = material;
    this.scene = scene;
    this.entries = [];
    this.capacity = 0;
    this.mesh = null;
    this.grow(START_CAPACITY);
  }

  // Rebuilds the instanced mesh at a larger capacity. Only ever called when a night puts more of one
  // model on the field than the last one did, so at most a handful of times in a run.
  grow(capacity) {
    const old = this.mesh;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.frustumCulled = false; // one draw for the whole crowd; there is nothing to gain by testing it
    mesh.castShadow = old ? old.castShadow : true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    const row = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    const rate = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1);
    anim.setUsage(THREE.DynamicDrawUsage);
    row.setUsage(THREE.DynamicDrawUsage);
    rate.setUsage(THREE.DynamicDrawUsage);
    mesh.geometry.setAttribute('aAnim', anim);
    mesh.geometry.setAttribute('aRow', row);
    mesh.geometry.setAttribute('aRate', rate);

    // Shadows: the depth pass has to run the same skinning, or the shadow is of the bind pose.
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (shader) => patchVertex(shader, this.uniforms, { colour: false });
    depth.customProgramCacheKey = () => `crowd-depth-${this.name}`;
    mesh.customDepthMaterial = depth;

    if (old) {
      this.scene.remove(old);
      old.dispose();
    }
    this.scene.add(mesh);
    this.mesh = mesh;
    this.anim = anim;
    this.row = row;
    this.rate = rate;
    this.capacity = capacity;
  }

  setShadows(on) {
    if (this.mesh) this.mesh.castShadow = on;
  }

  // Gives a character a palette row of its own and fills it with the model's own colours.
  takeRow(tints) {
    const row = this.freeRows.pop();
    if (row === undefined) return -1;
    this.paletteData.set(this.basePalette, row * MAX_PARTS * 4);
    if (tints) for (const [part, hex] of tints) this.writeTint(row, part, hex);
    this.palette.needsUpdate = true;
    return row;
  }

  writeTint(row, part, hex) {
    const i = this.partIndex.get(part);
    if (i === undefined || i >= MAX_PARTS) return;
    const c = new THREE.Color(hex);
    const at = (row * MAX_PARTS + i) * 4;
    this.paletteData[at] = c.r;
    this.paletteData[at + 1] = c.g;
    this.paletteData[at + 2] = c.b;
    this.paletteData[at + 3] = 1;
    this.palette.needsUpdate = true;
  }

  giveBackRow(row) {
    if (row >= 0) this.freeRows.push(row);
  }

  // Writes one frame's worth of instance data: a matrix and four floats per character that is worth
  // drawing, and drops any whose proxy has left the scene.
  //
  // The culling is done here because instancing gives it up otherwise. A SkinnedMesh per character
  // let three test each one against the camera and skip it; one instanced mesh is one object to the
  // renderer, so without this every raider on the map is drawn whether or not it is on screen, and
  // twice over when there are shadows. The test is one sphere against the view frustum per character,
  // which is nothing next to the skeleton evaluation it replaced.
  //
  // The sphere is deliberately generous. A character just off the edge of the screen can still cast a
  // shadow onto it, and the shadow pass draws whatever this leaves in the buffer, so the margin is
  // what keeps shadows from popping in at the edge of the view.
  update(time, frustum) {
    this.uniforms.uTime.value = time;
    const live = [];
    for (const e of this.entries) {
      if (e.proxy.parent === null) {
        this.giveBackRow(e.row);
        continue;
      }
      live.push(e);
    }
    this.entries = live;
    if (live.length > this.capacity) this.grow(Math.max(live.length, this.capacity * 2));

    const matrix = this.mesh.instanceMatrix.array;
    const anim = this.anim.array;
    const row = this.row.array;
    const rate = this.rate.array;
    let n = 0;
    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      e.proxy.updateMatrixWorld();
      if (frustum) {
        _sphere.center.setFromMatrixPosition(e.proxy.matrixWorld);
        _sphere.center.y += 1;
        _sphere.radius = CULL_RADIUS;
        if (!frustum.intersectsSphere(_sphere)) continue;
      }
      e.proxy.matrixWorld.toArray(matrix, n * 16);
      const clip = e.clip;
      anim[n * 4] = clip.row;
      anim[n * 4 + 1] = clip.frames;
      anim[n * 4 + 2] = e.startedAt;
      anim[n * 4 + 3] = e.loop ? 1 : 0;
      row[n] = e.row;
      rate[n] = e.rate;
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.anim.needsUpdate = true;
    this.row.needsUpdate = true;
    this.rate.needsUpdate = true;
    return n;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.baked.texture.dispose();
    this.palette.dispose();
  }
}

// A mixer that does nothing, so game.js can keep calling the three methods it calls on a rig's mixer
// without knowing whether the character is skinned on the CPU or on the GPU.
const NULL_MIXER = { update() {}, stopAllAction() {}, uncacheRoot() {} };

// ---------------------------------------------------------------- the crowd

export class Crowd {
  constructor(scene) {
    this.scene = scene;
    this.models = new Map();
    this.time = 0;
    // Whether characters cast into the shadow map. The game decides this before the models have
    // finished loading, so it is remembered here and applied to each model as it is baked.
    this.shadows = true;
  }

  // Prepares a model for instancing. Safe to call more than once; the bake happens on the first call.
  add(name, gltf) {
    if (this.models.has(name)) return true;
    try {
      const model = new CrowdModel(name, gltf, this.scene);
      model.setShadows(this.shadows);
      this.models.set(name, model);
      return true;
    } catch (e) {
      console.warn('crowd: could not bake', name, e);
      return false;
    }
  }

  has(name) {
    return this.models.has(name);
  }

  setShadows(on) {
    this.shadows = on;
    for (const m of this.models.values()) m.setShadows(on);
  }

  // Hands back the same shape rig.js's makeRigged does — { mesh, mixer, actions, play, tint } — so
  // nothing that drives a character needs to know which path it is on. `mesh` is an empty Object3D
  // that costs no draw call: the game moves it about as usual and the instanced mesh follows.
  make(name, tints = null) {
    const model = this.models.get(name);
    if (!model) return null;
    const row = model.takeRow(tints);
    if (row < 0) return null; // out of palette rows: fall back to a real skinned character

    const proxy = new THREE.Object3D();
    const idle = model.baked.clips.Idle || Object.values(model.baked.clips)[0];
    const entry = {
      proxy,
      row,
      clip: idle,
      loop: true,
      // Stagger the loop so a night's worth of raiders are not all on the same footfall.
      startedAt: this.time - Math.random() * (idle.frames / FPS),
      current: 'Idle',
      until: 0,
      rate: 1,
    };
    model.entries.push(entry);

    const play = (clipName, once = false, hold = false) => {
      const clip = model.baked.clips[clipName];
      if (!clip) return;
      if (once) {
        entry.clip = clip;
        entry.loop = false;
        entry.startedAt = this.time;
        entry.current = clipName;
        // The shader already clamps a non-looping clip on its last row (aAnim.w), so `hold` is only
        // ever "and never let anything choose another clip": the corpse keeps its last pose for as
        // long as the body exists, which on this path costs nothing at all.
        entry.until = hold ? Infinity : this.time + clip.frames / FPS;
        return;
      }
      if (entry.current === clipName || this.time < entry.until) return;
      entry.clip = clip;
      entry.loop = true;
      entry.startedAt = this.time - Math.random() * (clip.frames / FPS);
      entry.current = clipName;
    };

    const tint = (part, hex) => model.writeTint(entry.row, part, hex);

    // #55: one number, written every frame by the same loop that picks the clip. A one-shot keeps its
    // own rate -- an Attack does not get faster because its owner is running.
    const setRate = (r) => { entry.rate = entry.loop ? r : 1; };

    const rig = { mesh: proxy, mixer: NULL_MIXER, actions: model.baked.clips, play, tint, setRate };
    proxy.userData.rig = rig;
    proxy.userData.crowd = true;
    return rig;
  }

  update(dt, camera) {
    this.time += dt;
    let frustum = null;
    if (camera) {
      camera.updateMatrixWorld();
      _viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_viewProjection);
      frustum = _frustum;
    }
    this.drawn = 0;
    for (const m of this.models.values()) this.drawn += m.update(this.time, frustum);
  }

  // Called when a run restarts: every proxy is about to be thrown away with the old scene root.
  clear() {
    for (const m of this.models.values()) {
      for (const e of m.entries) m.giveBackRow(e.row);
      m.entries = [];
      m.mesh.count = 0;
    }
  }

  stats() {
    let characters = 0;
    for (const m of this.models.values()) characters += m.entries.length;
    return { models: this.models.size, characters, drawn: this.drawn || 0 };
  }
}
