import * as THREE from 'three';
import { CFG, MAP, TIERS, NODES, PADS } from './config.js';
import {
  mat, matFlat, swayMaterial, setSwayUniform, makeTree, makeBush, makeRock, makeSpikes, makeCliff, makePeak, makeBridge, makeHayBale, makeWheatField, mergeGroup,
} from './models.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Deterministic pseudo-random so the map is the same every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const outer = TIERS[TIERS.length - 1].bounds;
const VILLAGE = { x0: outer.x0 - 3, x1: outer.x1 + 3, z0: outer.z0 - 3, z1: outer.z1 + 3 };

function spline(points, n) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  return curve.getSpacedPoints(n);
}

// Flat ribbon along a polyline of Vector3 samples.
function ribbon(samples, width, color, y, opts = {}) {
  const n = samples.length;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const col = new Float32Array(n * 2 * 3);
  const idx = [];
  const half = width / 2;
  const base = new THREE.Color(color);
  const edge = base.clone().multiplyScalar(opts.edgeShade ?? 1);
  for (let i = 0; i < n; i++) {
    const p = samples[i];
    const q = samples[Math.min(n - 1, i + 1)];
    const r = samples[Math.max(0, i - 1)];
    let tx = q.x - r.x;
    let tz = q.z - r.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    // taper: true narrows both tips; 'end' narrows only the far one, so a road can start at full
    // width where it meets another road instead of coming to a point.
    const near = opts.taper === 'end' ? n - 1 - i : Math.min(i, n - 1 - i);
    let w = opts.taper ? half * Math.min(1, near / 12 + 0.15) : half;
    // slightly irregular edges so roads and banks don't look ruled
    const wob = opts.wobble ? 1 + opts.wobble * (Math.sin(i * 0.31) * 0.7 + Math.sin(i * 0.77 + 1.7) * 0.3) : 1;
    const wl = w * wob;
    const wr = w * (opts.wobble ? 2 - wob : 1);
    // normal = (-tz, tx)
    pos.set([p.x - tz * wl, y, p.z + tx * wl, p.x + tz * wr, y, p.z - tx * wr], i * 6);
    uv.set([0, i / 6, 1, i / 6], i * 4);
    col.set([edge.r, edge.g, edge.b, edge.r, edge.g, edge.b], i * 6);
    if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (opts.centerShade) {
    // a third strip down the middle would need more verts; instead tint edges darker via colour attribute
    for (let i = 0; i < n; i++) {
      const l = i * 6;
      col.set([edge.r, edge.g, edge.b], l);
      col.set([edge.r, edge.g, edge.b], l + 3);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // make sure the strip faces up whichever way the curve runs
  if (geo.attributes.normal.getY(0) < 0) {
    const flipped = [];
    for (let i = 0; i < idx.length; i += 3) flipped.push(idx[i], idx[i + 2], idx[i + 1]);
    geo.setIndex(flipped);
    geo.computeVertexNormals();
  }
  const m = new THREE.Mesh(geo, opts.material || mat(color, { side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}

function nearestOnPolyline(samples, x, z) {
  let bd = Infinity;
  let bi = 0;
  for (let i = 0; i < samples.length; i++) {
    const dx = samples[i].x - x;
    const dz = samples[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return { i: bi, d: Math.sqrt(bd) };
}

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3d9bd4';
  ctx.fillRect(0, 0, 256, 256);
  // lighter mid-channel
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(99,189,234,0)');
  grad.addColorStop(0.5, 'rgba(99,189,234,0.9)');
  grad.addColorStop(1, 'rgba(99,189,234,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  // wavy highlight lines, tiled vertically so they can scroll
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const r = rng(7);
  for (let i = 0; i < 9; i++) {
    const y = (i / 9) * 256;
    const x0 = 30 + r() * 150;
    const len = 30 + r() * 50;
    for (const oy of [-256, 0, 256]) {
      ctx.beginPath();
      ctx.moveTo(x0, y + oy);
      ctx.quadraticCurveTo(x0 + len / 2, y + oy + 6, x0 + len, y + oy);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function foamTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 32, 4, 64, 32, 40);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture() {
  // The ground carries most of the coverage, and that is the point rather than a saving. A field does
  // not read as lush because of how many grass models stand on it -- it reads that way because the
  // ground BETWEEN them is not one flat colour. Three flat blob passes over a single green was what
  // made 9000 tufts still look like decoration scattered on a lawn.
  //
  // 512 rather than 256, at the same 16x repeat: the tile is still 11.9 world units, so nothing about
  // how often it repeats has changed -- there is just twice the detail inside it, which is what lets
  // the speckle pass be fine enough to read as texture instead of as spots.
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#89bd55';
  ctx.fillRect(0, 0, S, S);
  const r = rng(99);
  const blob = (color, count, rmin, rmax) => {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const x = r() * S;
      const y = r() * S;
      const rx = rmin + r() * (rmax - rmin);
      const ry = rx * (0.45 + r() * 0.3);
      // drawn wrapped so the tile repeats seamlessly
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rx, ry, r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  // Broad mottling: the patches you read as "this field is not flat", at the scale of a few metres.
  blob('rgba(163, 212, 104, 0.42)', 26, 20, 56);
  blob('rgba(118, 166, 70, 0.36)', 24, 16, 48);
  blob('rgba(178, 226, 122, 0.28)', 20, 8, 22);
  // Earth through the grass. Kept very low in opacity and few in number, because this tiles every
  // 11.9 units and anything with an edge on it announces the repeat.
  blob('rgba(152, 130, 88, 0.20)', 11, 12, 32);
  blob('rgba(122, 102, 68, 0.10)', 7, 6, 15);
  // And the speckle, which is what the eye reads as vegetation rather than paint. Small enough to
  // mip away at distance, which is exactly what should happen to it.
  blob('rgba(106, 150, 62, 0.30)', 320, 2.5, 7);
  blob('rgba(180, 214, 122, 0.24)', 260, 2, 5.5);
  blob('rgba(88, 126, 52, 0.22)', 190, 1.5, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  // The ground is looked at across, at 45 degrees, which is the case mipmapping handles worst: the
  // far half of every frame is ground seen edge-on, and without this the speckle above turns to
  // porridge about fifteen units out. Three clamps this to whatever the device actually offers.
  tex.anisotropy = 4;
  return tex;
}

// #162: the ground texture's remaining limit was not detail, it was TILING. At repeat 16 over 190
// units the tile is 11.9 world units and the camera sees about 35, so every frame held three copies
// of the same tile, which is where the eye starts reading a field as wallpaper -- and it is why the
// earth patches in `groundTexture` are kept faint, because anything with an edge announces the
// repeat. This is the standard cure: the same tile sampled a second time at a different scale, and
// the two mixed by a mask sampled at a third, much larger one. The three periods never line up, so
// within any 35-unit frame the ground is unique.
//
// The mask is 128px of soft blobs at repeat 1.4 -- a period of about 135 units, four times the frame
// -- so the mixing itself never repeats in view. The second sample is the tile at repeat 5.9 (a
// 32-unit period). Both are the same texture: no second image to download, no second upload.
//
// A hook on the standard material rather than a ShaderMaterial, so lighting, fog, shadows and the
// daylight tint on `groundMat.color` all keep working untouched. Its own program cache key, because
// this is the difference between two shaders that three.js cannot see (#155 was that mistake).
function maskTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  const r = rng(7);
  for (let i = 0; i < 14; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 18 + r() * 30;
    // radial falloff, drawn wrapped so the mask tiles without a seam
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
function breakTiling(m) {
  const mask = maskTexture();
  m.customProgramCacheKey = () => 'ground-untiled';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMask = { value: mask };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMask;')
      .replace('#include <map_fragment>', `
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        vec4 sampledDiffuseColor2 = texture2D( map, vMapUv * 0.37 + vec2( 0.13, 0.41 ) );
        float untile = texture2D( uMask, vMapUv * 0.0875 ).r;
        diffuseColor *= mix( sampledDiffuseColor, sampledDiffuseColor2, untile );`);
  };
}

// `soleShadows` is true when nothing else casts -- see the contact-shadow block below for what it
// changes and why it has to be told rather than worked out here.
export function buildWorld(scene, soleShadows = false) {
  const size = CFG.world.size;
  const rand = rng(1337);
  const world = { river: null, bridges: [], crossings: [], roads: [], paths: [], fields: [], foam: [], time: 0, sway: { value: 0 }, flowerSpots: [], focus: new THREE.Vector3() };
  setSwayUniform(world.sway);

  // ---- ground ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: groundTexture(), color: 0xffffff, roughness: 1 }));
  world.groundMat = ground.material;
  breakTiling(ground.material);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- river ----
  const riverSamples = spline(MAP.river.points, 160);
  world.river = { samples: riverSamples, halfWidth: MAP.river.halfWidth };
  scene.add(ribbon(riverSamples, MAP.river.halfWidth * 2 + 2.6, 0xd8cc9d, 0.012, { wobble: 0.1 }));
  const waterTex = waterTexture();
  const waterMat = new THREE.MeshStandardMaterial({ map: waterTex, color: 0xffffff, roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide });
  scene.add(ribbon(riverSamples, MAP.river.halfWidth * 2, 0x3d9bd4, 0.02, { material: waterMat }));
  world.waterTex = waterTex;
  // pebbles along both banks
  const pebbleGeo = new THREE.DodecahedronGeometry(0.22, 0);
  const pebbles = new THREE.InstancedMesh(pebbleGeo, matFlat(0xb0a18d), 240);
  const pm = new THREE.Matrix4();
  for (let i = 0; i < 240; i++) {
    const t = rand();
    const idx = Math.floor(t * (riverSamples.length - 1));
    const a = riverSamples[idx];
    const b = riverSamples[Math.min(riverSamples.length - 1, idx + 1)];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    const off = (MAP.river.halfWidth + 0.5 + rand() * 1.0) * (i % 2 ? 1 : -1);
    pm.makeRotationY(rand() * Math.PI);
    pm.scale(new THREE.Vector3(0.7 + rand() * 0.8, 0.5, 0.7 + rand() * 0.8));
    pm.setPosition(a.x - (tz / l) * off, 0.08, a.z + (tx / l) * off);
    pebbles.setMatrixAt(i, pm);
  }
  pebbles.castShadow = true;
  scene.add(pebbles);
  // soft foam flecks drifting downstream
  const foamGeo = new THREE.PlaneGeometry(1.3, 0.5);
  const foamMat = new THREE.MeshBasicMaterial({ map: foamTexture(), color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
  const foam = new THREE.InstancedMesh(foamGeo, foamMat, 70);
  foam.frustumCulled = false;
  scene.add(foam);
  world.foamMesh = foam;
  for (let i = 0; i < 70; i++) world.foam.push({ t: rand(), side: (rand() - 0.5) * MAP.river.halfWidth * 1.4, speed: 0.012 + rand() * 0.01 });

  // ---- roads ----
  // #180: one mesh per road, nine vertices across each sample, coloured per vertex. It replaced three
  // stacked flat ribbons and two rut lines -- six draw calls a road -- and the colour attribute those
  // ribbons carried was never read: `mat()` does not turn vertex colours on, so every shade in them
  // was a flat material colour and the road was a smooth ribbon with almost no material definition.
  // What a road needs is variation ALONG it and ACROSS it, and both are cheaper as vertex colour
  // than as a texture: nine verts a sample is 1,424 triangles a road against the old 900 across five
  // meshes, and one draw call against six.
  //
  // Across, from the left verge in: the verge (alpha 0, so the dirt fades into whatever ground is
  // there -- no green to match, and it stays matched when the daylight tints the ground), a darker
  // seam where dirt meets grass, the road's edge, the left rut, the crown between the ruts, the
  // right rut, edge, seam, verge. Along: the two edges wander on their own (the old wobble was
  // mirrored, `wr = w * (2 - wob)`, so the ribbon snaked at a constant width and never looked
  // handmade), the ruts wander, sit unevenly and break, and the tone drifts between light dirt,
  // dark dirt and the odd patch of mud, with a different phase per lane so a patch is a patch and
  // not a band.
  //
  // `kind` is read off where a sample IS. Inside the settlement's outer plot (the last box in TIERS)
  // the road is the castle road: full width, a firm edge, ruts, chips of stone. Past it the same road
  // is a trail: narrower, a ragged verge, more mud, ruts fading out, and grass growing in it, which
  // `roadOk` below tells the grass placer. A path is what runs from a home's door to the road
  // (`world.addPath`): narrow, worn dark down the middle, and no ruts at all, because nothing with
  // wheels goes to a front door.
  //
  // Transparent, for the verge, and drawn first among transparent things (`renderOrder` below the
  // contact shadows' -1) so everything else blends over dirt that has already blended over grass.
  // Not the cheaper trick of colouring the verge green to match: the ground is a mottled, untiled
  // texture (#162) and any one green is wrong somewhere along 90 units of road.
  const ROAD = {
    castle: { width: MAP.roadWidth, shoulder: 0.75, edge: 0.05, verge: 0.35, rut: 1.0, mud: 0.64, chips: 34 },
    trail: { width: 3.3, shoulder: 1.15, edge: 0.14, verge: 0.6, rut: 0.45, mud: 0.42, chips: 0 },
    path: { width: 1.5, shoulder: 0.55, edge: 0.14, verge: 0.5, rut: 0, mud: 0.55, chips: 0 },
  };
  // Warm beige at the crown, darker in the ruts, darker again at the seam; the mud is the shoulder's
  // hue pulled down and greyed rather than a brown of its own, so a patch reads as the same dirt wet.
  const TONE = {
    shoulder: new THREE.Color(0xc4a06a), seam: new THREE.Color(0xa07a4a), edge: new THREE.Color(0xd8b884),
    rut: new THREE.Color(0xbb955d), crown: new THREE.Color(0xe7cf9f), mud: new THREE.Color(0xa6845c), worn: new THREE.Color(0xc6a271),
  };
  const roadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, transparent: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  // three sines at unrelated frequencies: not noise, but it never repeats inside a road and it is
  // continuous, which is what keeps a patch from having an edge
  const drift = (i, ph) => 0.5 * Math.sin(i * 0.21 + ph) + 0.3 * Math.sin(i * 0.53 + ph * 1.7) + 0.2 * Math.sin(i * 1.31 + ph * 0.6);
  // 0 inside the settlement's outer plot, 1 eight units past it: castle road to trail
  const outerPlot = TIERS[TIERS.length - 1].bounds;
  const kindAt = (x, z) => {
    const dx = Math.max(outerPlot.x0 - x, x - outerPlot.x1, 0);
    const dz = Math.max(outerPlot.z0 - z, z - outerPlot.z1, 0);
    return smooth(1, 8, Math.hypot(dx, dz));
  };
  const LANES = 9;
  const STRIDE = (LANES - 1) * 6;   // indices per sample: eight quads
  const c1 = new THREE.Color();
  const c2 = new THREE.Color();
  function roadMesh(samples, opts) {
    const n = samples.length;
    const r = rng(opts.seed);
    const ph = [];
    for (let k = 0; k < 8; k++) ph.push(r() * Math.PI * 2);
    const pos = new Float32Array(n * LANES * 3);
    const nrm = new Float32Array(n * LANES * 3);
    const col = new Float32Array(n * LANES * 4);
    const idx = new Uint32Array((n - 1) * STRIDE);
    const half = new Float32Array(n);
    const kind = new Float32Array(n);
    const isPath = opts.kind === 'path';
    for (let i = 0; i < n; i++) {
      const p = samples[i];
      const q = samples[Math.min(n - 1, i + 1)];
      const b = samples[Math.max(0, i - 1)];
      let tx = q.x - b.x;
      let tz = q.z - b.z;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      const k = isPath ? 0 : kindAt(p.x, p.z);
      const K = isPath ? ROAD.path : {
        width: lerp(ROAD.castle.width, ROAD.trail.width, k), shoulder: lerp(ROAD.castle.shoulder, ROAD.trail.shoulder, k),
        edge: lerp(ROAD.castle.edge, ROAD.trail.edge, k), verge: lerp(ROAD.castle.verge, ROAD.trail.verge, k),
        rut: lerp(ROAD.castle.rut, ROAD.trail.rut, k), mud: lerp(ROAD.castle.mud, ROAD.trail.mud, k),
      };
      // the far end of a road narrows to nothing over its last twelve samples, as before
      const tap = opts.taper ? Math.min(1, (n - 1 - i) / 12 + 0.15) : 1;
      const h = (K.width / 2) * tap;
      half[i] = h;
      kind[i] = k;
      // each edge on its own: the same two frequencies, different phases
      const eL = 1 + K.edge * (0.6 * Math.sin(i * 0.19 + ph[0]) + 0.4 * Math.sin(i * 0.47 + ph[1]));
      const eR = 1 + K.edge * (0.6 * Math.sin(i * 0.19 + ph[2]) + 0.4 * Math.sin(i * 0.47 + ph[3]));
      const hl = h * eL;
      const hr = h * eR;
      const sL = Math.max(0.25, K.shoulder * tap * (1 + K.verge * (0.5 * Math.sin(i * 0.33 + ph[4]) + 0.5 * Math.sin(i * 0.9 + ph[5]))));
      const sR = Math.max(0.25, K.shoulder * tap * (1 + K.verge * (0.5 * Math.sin(i * 0.33 + ph[6]) + 0.5 * Math.sin(i * 0.9 + ph[7]))));
      // the ruts: about 0.9 out, wandering, and never so far out they cross the edge lane
      const rl = Math.min(hl - 0.45, tap * (0.9 + 0.28 * Math.sin(i * 0.17 + ph[1] * 2) + 0.12 * Math.sin(i * 0.41 + ph[3])));
      const rr = Math.min(hr - 0.45, tap * (0.9 + 0.28 * Math.sin(i * 0.17 + ph[5] * 2) + 0.12 * Math.sin(i * 0.41 + ph[7])));
      const off = [-(hl + sL), -hl, -(hl - 0.35), -Math.max(0.1, rl), 0, Math.max(0.1, rr), hr - 0.35, hr, hr + sR];
      // the colour of this stretch: a drift in tone, a mud patch where a slower drift runs high, and
      // the ruts fading out where a third one does
      const mud = smooth(K.mud, K.mud + 0.22, 0.5 + 0.5 * drift(i * 0.7, ph[2]));
      const brk = smooth(0.35, 0.65, 0.5 + 0.5 * drift(i * 0.9, ph[6]));
      const rutMix = K.rut * (1 - brk);
      for (let ln = 0; ln < LANES; ln++) {
        const v = i * LANES + ln;
        const nx = -tz;
        const nz = tx;
        pos[v * 3] = p.x + nx * off[ln];
        pos[v * 3 + 1] = opts.y;
        pos[v * 3 + 2] = p.z + nz * off[ln];
        nrm[v * 3 + 1] = 1;
        let base;
        let alpha = 1;
        if (ln === 0 || ln === 8) { base = TONE.shoulder; alpha = 0; }
        else if (ln === 1 || ln === 7) base = TONE.seam;
        else if (ln === 2 || ln === 6) base = TONE.edge;
        else if (ln === 4) base = isPath ? TONE.worn : TONE.crown;
        else base = isPath ? TONE.edge : c2.copy(TONE.edge).lerp(TONE.rut, rutMix);
        c1.copy(base);
        if (ln !== 0 && ln !== 8) c1.lerp(TONE.mud, mud * (isPath ? 0.5 : 0.85));
        const tone = 1 + 0.07 * drift(i + ln * 2.3, ph[4] + ln);
        col[v * 4] = c1.r * tone;
        col[v * 4 + 1] = c1.g * tone;
        col[v * 4 + 2] = c1.b * tone;
        col[v * 4 + 3] = alpha;
      }
      if (i < n - 1) {
        for (let ln = 0; ln < LANES - 1; ln++) {
          const a = i * LANES + ln;
          const o = i * STRIDE + ln * 6;
          // wound so the face is the top: the lanes run along the left-hand normal and the samples
          // along the tangent, and the other order made every road a back face lit from below --
          // dark and green under the hemisphere's ground colour. `ribbon` above guards the same
          // thing by recomputing normals and flipping; here the winding is simply right.
          idx.set([a, a + 1, a + LANES, a + 1, a + LANES + 1, a + LANES], o);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.Mesh(geo, roadMat);
    m.receiveShadow = true;
    m.renderOrder = -2;
    m.userData.half = half;
    m.userData.kind = kind;
    return m;
  }
  MAP.roads.forEach((road, ri) => {
    const samples = spline(road.points, 90);
    const entry = { id: road.id, samples, meshes: [], revealed: false, progress: 0, stride: STRIDE };
    // All four roads start at the castle and overlap in the square where they cross. Lifting each
    // one a hair above the last keeps that square from z-fighting; dirt over dirt reads the same.
    const ry = ri * 0.0012;
    const m = roadMesh(samples, { seed: 400 + ri * 17, y: 0.014 + ry, taper: true });
    entry.half = m.userData.half;
    entry.kind = m.userData.kind;
    entry.meshes.push(m);
    // stones scattered along the verge, and chips of stone on the castle road's own surface -- the
    // "more stone" a maintained road has over a trail. One instanced draw for both.
    const stoneGeo = new THREE.DodecahedronGeometry(0.16, 0);
    const STONES = 40 + ROAD.castle.chips;
    // a shade lighter than the field stones, so a chip shows on the beige rather than hiding in it
    const stones = new THREE.InstancedMesh(stoneGeo, matFlat(0xc4b49b), STONES);
    const sm = new THREE.Matrix4();
    let sn = 0;
    for (let k = 0; k < STONES * 3 && sn < STONES; k++) {
      const chip = sn >= 40;
      const i = 4 + Math.floor(rand() * (samples.length - 8));
      if (chip && entry.kind[i] > 0.3) continue;
      const p = samples[i];
      const q = samples[i + 1];
      const tx = q.x - p.x;
      const tz = q.z - p.z;
      const l = Math.hypot(tx, tz) || 1;
      const off = chip ? (rand() * 2 - 1) * (entry.half[i] - 0.5) : (entry.half[i] + 0.4 + rand() * 0.6) * (k % 2 ? 1 : -1);
      sm.makeRotationY(rand() * Math.PI);
      const sc = chip ? 0.75 : 1;
      sm.scale(new THREE.Vector3((0.7 + rand() * 0.8) * sc, chip ? 0.3 : 0.5, (0.7 + rand() * 0.8) * sc));
      sm.setPosition(p.x - (tz / l) * off, chip ? 0.03 : 0.05, p.z + (tx / l) * off);
      stones.setMatrixAt(sn++, sm);
    }
    stones.count = sn;
    stones.userData.noDrawRange = true;
    entry.meshes.push(stones);
    for (const mesh of entry.meshes) {
      mesh.visible = false;
      if (!mesh.userData.noDrawRange) mesh.geometry.setDrawRange(0, 0);
      scene.add(mesh);
    }
    world.roads.push(entry);
    // where this road crosses the river a bridge can be built
    let best = { d: Infinity, i: 0 };
    samples.forEach((p, i) => {
      const n = nearestOnPolyline(riverSamples, p.x, p.z);
      if (n.d < best.d) best = { d: n.d, i };
    });
    if (best.d < 2.5) {
      const p = samples[best.i];
      const q = samples[Math.min(samples.length - 1, best.i + 2)];
      const r = samples[Math.max(0, best.i - 2)];
      const dir = new THREE.Vector2(q.x - r.x, q.z - r.z).normalize();
      world.crossings.push({ roadId: road.id, x: p.x, z: p.z, dx: dir.x, dz: dir.y });
    }
  });
  // #45: straw is cut off a field rather than off a node mesh, so the field is what has to show the
  // work. Turning the instance count down takes stalks out from all over the plot -- they are written
  // in shuffled order for exactly this -- and turning it back up puts them back as the node regrows.
  // A cut field keeps a tenth of its crop so the plot still reads as a field rather than as bare soil.
  world.cutField = (x, z, frac) => {
    let best = null;
    let bd = 8;
    for (const f of world.fields) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best || !best.crop) return;
    const k = 0.1 + 0.9 * Math.max(0, Math.min(1, frac));
    if (Math.abs(k - best.cut) < 0.01) return;
    best.cut = k;
    const n = Math.round(best.crop.full * k);
    for (const part of best.crop.parts) part.count = n;
  };

  // roads grow out from the village when revealed; `instant` is for a village that was already
  // there -- a restored run, the opening -- where growing them would be a road being built in
  // front of a wall that is already standing
  world.revealRoad = (id, instant = false) => {
    const r = world.roads.find((r) => r.id === id);
    if (!r || r.revealed) return;
    r.revealed = true;
    for (const m of r.meshes) m.visible = true;
    if (instant) {
      r.progress = 1;
      for (const m of r.meshes) if (!m.userData.noDrawRange) m.geometry.setDrawRange(0, Infinity);
    }
  };
  // #180: a path from a home's door to the nearest road. It grows out from the house the way a road
  // grows out from a gate, and it goes under the road rather than meeting it (0.011 against the
  // roads' 0.014 and up), so the join is the road's own edge. Its own rng, seeded by its position,
  // so the world's stream is not disturbed by a house going up mid-run.
  world.addPath = (hx, hz, instant = false) => {
    let best = null;
    let bd = Infinity;
    for (const r of world.roads) {
      const q = nearestOnPolyline(r.samples, hx, hz);
      if (q.d < bd) { bd = q.d; best = r.samples[q.i]; }
    }
    if (!best || bd < 3) return null;
    const dx = best.x - hx;
    const dz = best.z - hz;
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l;
    const uz = dz / l;
    const p0 = [hx + ux * 2.2, hz + uz * 2.2];
    const bend = ((Math.round(hx * 10) + Math.round(hz * 10)) % 2 ? 1 : -1) * 0.7;
    const mid = [(p0[0] + best.x) / 2 - uz * bend, (p0[1] + best.z) / 2 + ux * bend];
    const samples = spline([p0, mid, [best.x, best.z]], 16);
    const m = roadMesh(samples, { kind: 'path', seed: 9000 + Math.round(hx * 13 + hz * 7), y: 0.011 });
    m.visible = true;
    m.geometry.setDrawRange(0, instant ? Infinity : 0);
    scene.add(m);
    const entry = { id: 'path', samples, meshes: [m], revealed: true, progress: instant ? 1 : 0, stride: STRIDE };
    world.paths.push(entry);
    return entry;
  };
  world.clearPaths = () => {
    for (const p of world.paths) for (const m of p.meshes) { scene.remove(m); m.geometry.dispose(); }
    world.paths = [];
  };
  world.buildBridge = (roadId) => {
    const c = world.crossings.find((c) => c.roadId === roadId);
    if (!c || world.bridges.some((b) => b.roadId === roadId)) return null;
    const b = makeBridge(MAP.river.halfWidth * 2 + 5, MAP.roadWidth + 0.6);
    b.position.set(c.x, 0, c.z);
    b.rotation.y = Math.atan2(c.dx, c.dz);
    scene.add(b);
    world.bridges.push({ ...c, mesh: b });
    return b;
  };

  // ---- mesas and snow peaks (north-west) ----
  const cliffs = new THREE.Group();
  const cl = [
    [-36, -40, 18, 6, 14],
    [-28, -48, 14, 9, 12],
    [-46, -38, 12, 4, 12],
    [-52, -44, 16, 7, 18],
    [-34, -56, 20, 5, 10],
    [-20, -56, 10, 3, 8],
    [-44, -52, 12, 11, 10],
  ];
  for (const [x, z, w, h, d] of cl) {
    const c = makeCliff(w, h, d);
    c.position.x = x;
    c.position.z = z;
    cliffs.add(c);
  }
  for (const [x, z, r, h] of [[-62, -72, 16, 30], [-44, -84, 14, 26], [-80, -56, 13, 24], [-30, -80, 10, 18], [-70, -90, 18, 34]]) {
    const p = makePeak(r, h);
    p.position.set(x, 0, z);
    cliffs.add(p);
  }
  scene.add(cliffs);

  // ---- placement helpers ----
  const inVillage = (x, z) => x > VILLAGE.x0 && x < VILLAGE.x1 && z > VILLAGE.z0 && z < VILLAGE.z1;
  const inCliffs = (x, z) => x < CFG.cliffs.x && z < CFG.cliffs.z;
  const nearRiver = (x, z, m) => nearestOnPolyline(riverSamples, x, z).d < MAP.river.halfWidth + m;
  const nearRoad = (x, z, m) => world.roads.some((r) => nearestOnPolyline(r.samples, x, z).d < MAP.roadWidth / 2 + m);
  const nearNode = (x, z) => NODES.some((n) => Math.hypot(n.pos[0] - x, n.pos[1] - z) < 4.5) || MAP.fields.some((f) => Math.abs(f.pos[0] - x) < f.size[0] / 2 + 3 && Math.abs(f.pos[1] - z) < f.size[1] / 2 + 3);
  // #19: the raider camp's clearing stays free of trees and rocks
  const inCamp = (x, z) => Math.hypot(x - CFG.finale.pos[0], z - CFG.finale.pos[1]) < CFG.finale.radius + 3;
  const free = (x, z, m = 1.5) => !inVillage(x, z) && !inCliffs(x, z) && !inCamp(x, z) && !nearRiver(x, z, m + 1.5) && !nearRoad(x, z, m) && !nearNode(x, z);
  world.free = free;

  // GRASS GETS ITS OWN RULE, and the reason is that `free` was answering the wrong question for it.
  //
  // `inVillage` is the OUTER tier's footprint padded by 3 -- a rectangle 82 by 70 -- and keeping trees
  // and rocks out of it is right, because the player will eventually build over all of it. Applied to
  // grass it meant the one part of the map that had none was the part a run is actually played in: at
  // tier 0 the walls are a ring of radius 19 and everything out to 41 by 35 was bare ground for no
  // reason the player can see.
  //
  // What should be bare is the CITADEL -- the ring the Keep and the three service buildings stand in,
  // which is packed, paved and walked over all game. Everything outside it is countryside, and the
  // outer walls enclose "farmland, workshops, homes and all" (see TIERS), so grass inside THOSE is
  // what a village's own fields look like rather than something that escaped.
  //
  // The margins are tighter than `free`'s too. A tree needs 1.5 of clearance from a track; grass
  // growing up to the edge of one is what a track through a field looks like.
  const citadel = TIERS[0].ring;
  const inCitadel = (x, z) => Math.hypot(x - citadel.x, z - citadel.z) < citadel.r + 2;
  // and off the mats, which carry a name and a price. `spend.padSize` is 3.6 across, so 2.6 keeps a
  // blade out of the lettering without drawing a bald circle around every pad.
  const nearPad = (x, z) => PADS.some((p) => Math.abs(p.pos[0] - x) < 2.6 && Math.abs(p.pos[1] - z) < 2.6);
  // #180: grass creeps into the verge. It used to stop 0.5 short of the road on both sides, which
  // drew a ruled line of bare dirt against a ruled line of grass -- the hard edge the ticket is
  // about. Now a tuft is placed by how far into the verge it would stand: sure of a place a unit out
  // from the edge, thinning to nothing 0.3 inside it. On a trail a few stand on the road itself,
  // which is what "grass growing through" is. The road's own half-width at that spot, not
  // `MAP.roadWidth`, because a trail is narrower and its verge is where the wander is.
  const roadOk = (x, z) => {
    let best = Infinity;
    let h = MAP.roadWidth / 2;
    let k = 0;
    for (const r of world.roads) {
      const q = nearestOnPolyline(r.samples, x, z);
      if (q.d < best) { best = q.d; h = r.half[q.i]; k = r.kind[q.i]; }
    }
    if (best >= h + 1.0) return true;
    if (best < h - 0.3) return k > 0.5 && rand() < 0.07;
    return rand() < (best - (h - 0.3)) / 1.3;
  };
  const grassFree = (x, z) => !inCitadel(x, z) && !inCliffs(x, z) && !inCamp(x, z)
    && !nearRiver(x, z, 1.2) && roadOk(x, z) && !nearNode(x, z) && !nearPad(x, z);
  const half = size / 2 - 6;
  const scenery = new THREE.Group();
  // CLUMPED, like the grass and the trees, and for the same reason: uniform random gives every square
  // metre the same amount of everything, which is the one thing real ground never does. `patches` is
  // how many centres to scatter and `spread` how far from one a thing may land; a quarter of them
  // still go loose, so the ground between clumps is not bald.
  const patchSets = new Map();
  const patchesFor = (n) => {
    if (!patchSets.has(n)) {
      const list = [];
      for (let i = 0; i < n; i++) list.push([(rand() * 2 - 1) * half, (rand() * 2 - 1) * half]);
      patchSets.set(n, list);
    }
    return patchSets.get(n);
  };
  const place = (maker, count, margin = 1.5, minDist = 0, clump = null) => {
    let tries = 0;
    for (let i = 0; i < count && tries < count * 40; tries++) {
      let x;
      let z;
      if (clump && rand() < 0.75) {
        const [px, pz] = patchesFor(clump.patches)[(rand() * clump.patches) | 0];
        const a = rand() * Math.PI * 2;
        const d = (rand() ** 0.6) * clump.spread;
        x = px + Math.cos(a) * d;
        z = pz + Math.sin(a) * d;
        if (Math.abs(x) > half || Math.abs(z) > half) continue;
      } else {
        x = (rand() * 2 - 1) * half;
        z = (rand() * 2 - 1) * half;
      }
      if (!free(x, z, margin) || Math.hypot(x, z) < minDist) continue;
      const o = maker(x, z);
      o.position.x = x;
      o.position.z = z;
      scenery.add(o);
      i++;
    }
  };
  // Forests come in clumps, and there are more of them with more in each. The old map held about 90
  // trees, 45 bushes and 40 rocks across 36,100 square metres -- one bush per 800 -- which is why the
  // ground between the features has always been empty. These are the same numbers the grass was
  // taught: instanced or merged, the cost is triangles, and the draw calls were the thing that used
  // to make density expensive (see `mergeGroup`, which now makes it not).
  const clumps = [];
  for (let i = 0; i < 22; i++) clumps.push([(rand() * 2 - 1) * half, (rand() * 2 - 1) * half]);
  let placedTrees = 0;
  for (const [cx, cz] of clumps) {
    for (let k = 0; k < 13; k++) {
      // denser at the heart of a wood than at its edge, so it has a shape rather than a boundary
      const a = rand() * Math.PI * 2;
      const d = (rand() ** 0.65) * 10;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (Math.abs(x) > half || Math.abs(z) > half || !free(x, z, 1.4)) continue;
      const t = makeTree(0.75 + rand() * 0.85);
      t.position.set(x, 0, z);
      scenery.add(t);
      placedTrees++;
    }
  }
  place(() => makeTree(0.9 + rand() * 0.5), Math.max(0, 210 - placedTrees), 1.6);
  place(() => makeBush(), 230, 0.9, 0, { patches: 70, spread: 7 });
  place(() => makeRock(0.55 + rand() * 1.1), 150, 0.9, 0, { patches: 55, spread: 6 });
  place(() => {
    const s = makeSpikes();
    s.rotation.y = rand() * Math.PI;
    return s;
  }, 55, 1.5, 0, { patches: 26, spread: 5 });
  place(() => makeHayBale(), 16, 1);

  // wheat fields with fences (straw comes from these)
  for (const f of MAP.fields) {
    const field = makeWheatField(f.size[0], f.size[1]);
    field.position.set(f.pos[0], 0, f.pos[1]);
    world.fields.push({ x: f.pos[0], z: f.pos[1], crop: field.userData.crop, cut: 1 });
    scenery.add(field);
    for (let i = 0; i < 2; i++) {
      const h = makeHayBale();
      h.position.set(f.pos[0] + f.size[0] / 2 + 2 + i * 1.6, 0, f.pos[1] - 1 + (i % 2) * 1.4);
      scenery.add(h);
    }
  }

  // grass tufts and flowers, instanced
  // SEVEN BLADES FOR THE PRICE OF THREE, and it is worth writing down because it looks like a
  // trade-off and is not one. These cones were closed, and a cone's base cap faces straight DOWN --
  // at ground level, under the tuft, back-facing from every angle the camera can reach. It was three
  // triangles a blade that nothing has ever seen. Open-ended, a blade is 3 triangles instead of 6, so
  // a seven-blade clump costs 21 where the old three-blade one cost 18.
  //
  // And the clump has WIDTH now. The old three sat on one spot and leaned, which reads as a spike at
  // this camera; these are spread over a 0.13 disc on a golden angle so no two line up, which is what
  // makes each one cover ground instead of marking it.
  const blades = [];
  for (let i = 0; i < 7; i++) {
    const h = 0.42 + (i % 3) * 0.16;
    const b = new THREE.ConeGeometry(0.055, h, 3, 1, true);
    b.translate(0, h * 0.5, 0);
    // #162: dark at the root, full colour at the tip, written into the vertices. The contact-shadow
    // pass skips the grass (its bounding box is the whole map), so a tuft met the ground with no
    // contact at all -- a bright stalk standing on a bright lawn. A disc per tuft would have been
    // 13,000 more instances; this is a colour attribute the shader already multiplies by, and costs
    // nothing per frame. Read off `y` here, before the lean below tilts the blade, so the root is the
    // root whichever way it leans. 0.5 at the base: measured against 0.35 (mud) and 0.65 (nothing).
    {
      const pos = b.attributes.position;
      const col = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        const k = 0.5 + 0.5 * Math.min(1, pos.getY(v) / h);
        col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = k;
      }
      b.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    b.rotateX(((i % 3) - 1) * 0.42);       // lean, pivoting on the root rather than the middle
    b.rotateY(i * 1.63);
    const a = i * 2.39996;                 // golden angle
    b.translate(Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13);
    blades.push(b);
  }
  const tuftGeo = mergeGeometries(blades, false);
  // 700 over the whole map was one clump every 43 square metres -- scattered dots on a flat plane.
  // 13000 is about one every 1.6, and with seven blades apiece that is 91,000 blades of grass where
  // there were 27,000.
  //
  // THE COUNT WAS NEVER THE WHOLE ANSWER, though, and 9000 three-blade tufts on the old flat ground
  // proved it: at a density close to the reference it still read as a lawn with things stuck in it.
  // Coverage is three layers and the models are only the top one -- the ground texture does the most
  // work, the speckle in it does the rest, and the tufts supply silhouette.
  //
  // IT IS STILL ONE DRAW CALL, because they are instanced: the count costs triangles and nothing
  // else. 21 a tuft, so 273k measured, in a scene that measures 981k -- so this is the largest single
  // instanced cost in the world, and worth knowing beside the second largest, which is 28 characters
  // at 8,576 triangles each for 240k (#52's models, already over their stated budget). Grass is the
  // one of those two that is a dial: `TUFTS` is the number to move if a device ever struggles.
  //
  // THE THING IT COULD BREAK IS COINS. They rest at about y 0.25 and a blade stands 0.42 to 0.74, so
  // the grass is taller than the thing the player walks over to collect. Checked on screen every time
  // this number moves, with coins dropped in open field. That is the first thing to look at if it
  // ever goes higher again.
  const TUFTS = 13000;
  // WHITE, because the green moves to the instances. 13,000 tufts sharing one flat colour is what made
  // a field read as one enormous object rather than as grass -- density was never the thing missing.
  // `instanceColor` is per-instance data: a buffer, no extra draw call, no extra material.
  //
  // Its own cache key, for the reason the note on `swayMaterial` gives: this material now compiles
  // with `USE_INSTANCING_COLOR` and the wheat's does not, and the difference between two shaders
  // being handed the same program is silent.
  const tufts = new THREE.InstancedMesh(tuftGeo, swayMaterial(0xffffff), TUFTS);
  tufts.material.vertexColors = true;   // #162: the root darkening above
  tufts.material.customProgramCacheKey = () => 'sway-tinted-rooted';
  // Flowers carry more of the lushness than their number suggests, so there are four times as many
  // and each is cheaper: 5 by 3 segments is 20 triangles against the old 6 by 5's 48, and at this
  // size nobody has ever counted the facets on a daisy.
  const flowerGeo = new THREE.SphereGeometry(0.12, 5, 3);
  const flowerColors = [0xffffff, 0xffd54a, 0xff8aa8];
  const FLOWERS = 300;
  const flowers = flowerColors.map((c) => new THREE.InstancedMesh(flowerGeo, mat(c), FLOWERS));
  const m4 = new THREE.Matrix4();
  const tuftScale = new THREE.Vector3();
  const tuftColor = new THREE.Color();
  let ti = 0;
  const fi = [0, 0, 0];
  // CLUMPED, NOT SPRINKLED, and this is free -- it is where the tufts go, not how many there are.
  // Uniform random gives every square metre the same amount of grass, which is the one thing real
  // ground never does: it grows in patches with thinner ground between them, and that variation is
  // most of what makes a field look grown rather than applied. The trees already do this (`clumps`
  // above, for the same reason); the grass was the only scattered thing left.
  //
  // 78% into a patch and the rest loose, so the thin ground between them is not bald either. The 0.55
  // power pulls them toward the middle of a patch, which gives each one a dense heart and a soft edge
  // instead of a disc with a rim.
  const patches = [];
  for (let i = 0; i < 240; i++) patches.push([(rand() * 2 - 1) * half, (rand() * 2 - 1) * half]);
  for (let tries = 0; tries < TUFTS * 8 && ti < TUFTS; tries++) {
    let x;
    let z;
    if (rand() < 0.78) {
      const [px, pz] = patches[(rand() * patches.length) | 0];
      const a = rand() * Math.PI * 2;
      const d = (rand() ** 0.55) * 5;
      x = px + Math.cos(a) * d;
      z = pz + Math.sin(a) * d;
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
    } else {
      x = (rand() * 2 - 1) * half;
      z = (rand() * 2 - 1) * half;
    }
    if (!grassFree(x, z)) continue;
    m4.makeRotationY(rand() * Math.PI);
    // Width as well as height. It varied in height alone before, which gives every tuft in the world
    // the same footprint and a different stature -- oddly uniform from above, which is the angle this
    // game is played at. Width and depth move together so a clump stays a clump rather than an oval.
    const wide = 0.82 + rand() * 0.42;
    m4.scale(tuftScale.set(wide, 0.8 + rand() * 0.6, wide));
    m4.setPosition(x, 0, z);
    // Its own green. Hue is the one that does the work -- 84 to 100 degrees, so a patch reads as
    // several kinds of grass rather than one repeated -- with saturation and lightness widening it
    // enough that no two neighbours match. The base is the old flat 0x88bd5a: hue 92, sat 43, light 55.
    tuftColor.setHSL(
      0.2559 + (rand() - 0.5) * 0.044,
      Math.min(1, Math.max(0, 0.429 + (rand() - 0.5) * 0.12)),
      Math.min(0.92, Math.max(0.05, 0.547 + (rand() - 0.5) * 0.22)),
      THREE.SRGBColorSpace,
    );
    tufts.setColorAt(ti, tuftColor);
    tufts.setMatrixAt(ti++, m4);
    if (rand() < 0.28) {
      const k = Math.floor(rand() * 3);
      if (fi[k] < FLOWERS) {
        m4.makeTranslation(x + 0.4, 0.3, z + 0.2);
        flowers[k].setMatrixAt(fi[k]++, m4);
        world.flowerSpots.push(new THREE.Vector3(x + 0.4, 0.3, z + 0.2));
      }
    }
  }
  tufts.count = ti;
  if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
  flowers.forEach((f, k) => {
    f.count = fi[k];
    scenery.add(f);
  });
  // #162 (item 3): clover, and stones in the open ground -- the small things a field has that a lawn
  // does not. Clover is three flat lobes, 9 triangles, lying on the ground in tight patches of its
  // own (a metre and a half across, dense at the heart) so it reads as a plant that spreads rather
  // than as confetti; a darker, bluer green than the grass so the patch shows as a patch from the
  // camera's height. The stones are flattened icosahedra in small groups, the same shape the river's
  // pebbles have and a shade greyer than the rock nodes, so they are not mistaken for something you
  // can mine. Both are one instanced draw each, and both thin with the grass under adaptive quality.
  const cloverLobe = new THREE.CircleGeometry(0.075, 5);
  const cloverGeo = mergeGeometries([0, 1, 2].map((i) => {
    const g = cloverLobe.clone();
    const a = i * 2.094;
    g.translate(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0);
    return g;
  }), false);
  cloverGeo.rotateX(-Math.PI / 2);
  cloverGeo.translate(0, 0.045, 0);   // just proud of the ground, under the grass
  const CLOVER = 3600;
  const clovers = new THREE.InstancedMesh(cloverGeo, matFlat(0x3f8a34), CLOVER);
  const cloverPatches = [];
  for (let i = 0; i < 110; i++) cloverPatches.push([(rand() * 2 - 1) * half, (rand() * 2 - 1) * half]);
  let ci = 0;
  for (let tries = 0; tries < CLOVER * 6 && ci < CLOVER; tries++) {
    const [px, pz] = cloverPatches[(rand() * cloverPatches.length) | 0];
    const a = rand() * Math.PI * 2;
    const d = (rand() ** 0.5) * 1.6;
    const x = px + Math.cos(a) * d;
    const z = pz + Math.sin(a) * d;
    if (Math.abs(x) > half || Math.abs(z) > half || !grassFree(x, z)) continue;
    m4.makeRotationY(rand() * Math.PI * 2);
    m4.scale(tuftScale.setScalar(0.8 + rand() * 0.5));
    m4.setPosition(x, 0, z);
    clovers.setMatrixAt(ci++, m4);
  }
  clovers.count = ci;
  scenery.add(clovers);
  const fieldStoneGeo = new THREE.IcosahedronGeometry(0.17, 0);
  fieldStoneGeo.scale(1, 0.5, 1);
  const FIELD_STONES = 320;
  const fieldStones = new THREE.InstancedMesh(fieldStoneGeo, matFlat(0xa8987f), FIELD_STONES);
  const stoneSpots = [];
  for (let i = 0; i < 80; i++) stoneSpots.push([(rand() * 2 - 1) * half, (rand() * 2 - 1) * half]);
  let si = 0;
  for (let tries = 0; tries < FIELD_STONES * 6 && si < FIELD_STONES; tries++) {
    let x;
    let z;
    if (rand() < 0.7) {
      const [px, pz] = stoneSpots[(rand() * stoneSpots.length) | 0];
      const a = rand() * Math.PI * 2;
      const d = (rand() ** 0.6) * 1.2;
      x = px + Math.cos(a) * d;
      z = pz + Math.sin(a) * d;
    } else {
      x = (rand() * 2 - 1) * half;
      z = (rand() * 2 - 1) * half;
    }
    if (Math.abs(x) > half || Math.abs(z) > half || !grassFree(x, z)) continue;
    m4.makeRotationY(rand() * Math.PI);
    m4.scale(tuftScale.set(0.6 + rand() * 0.9, 0.7 + rand() * 0.6, 0.6 + rand() * 0.9));
    m4.setPosition(x, 0.04, z);
    fieldStones.setMatrixAt(si++, m4);
  }
  fieldStones.count = si;
  scenery.add(fieldStones);
  // #168: the dials adaptive quality turns. `count` on an instanced mesh is how many of the buffer
  // are drawn, so thinning is free -- the last instances placed simply stop being drawn, and since
  // every patch was placed at a random spot, the ones that go are random patches. Wind is a flag
  // read by `world.update`; the contact discs are one mesh with a `visible`.
  world.setQuality = (s) => {
    tufts.count = Math.round(ti * s.grass);
    clovers.count = Math.round(ci * s.grass);
    flowers.forEach((f, k) => { f.count = Math.round(fi[k] * s.flowers); });
    world.windOff = !s.wind;
    if (world.shadows) world.shadows.visible = s.shadows;
  };
  scenery.add(tufts);
  // CONTACT SHADOWS, and on a phone they are the only ones there are. `shadowMap.enabled` is
  // `!(safe || (mobile && !hq))`, so on an ordinary phone -- the device this game is played on --
  // nothing casts at all: characters get their instanced blob and every tree, rock, bush and bale
  // floats. A soft dark disc under each one puts it on the ground.
  //
  // They are drawn either way, at two strengths, because they are doing two different jobs. Where the
  // sun casts they are ambient occlusion -- the darkness in the contact between a trunk and the grass,
  // which is a real thing and not the same shadow twice, so it stays faint. Where nothing else casts
  // they ARE the shadow and have to carry it alone, so they go heavier.
  //
  // Sized from what is actually there rather than passed in at each call site. Every scenery object
  // is a group at its own position, so its bounding box IS its footprint, and one pass over them at
  // the end catches anything anyone adds later without a second place to remember.
  {
    const box = new THREE.Box3();
    const spots = [];
    for (const o of scenery.children) {
      if (!o.isGroup && !o.isMesh) continue;
      box.setFromObject(o);
      if (!Number.isFinite(box.min.x)) continue;
      const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.42;
      // wheat fields and their fences are metres across; a disc that size is a stain, not a shadow
      if (r < 0.25 || r > 2.6) continue;
      spots.push([(box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2, r]);
    }
    if (spots.length) {
      const geo = new THREE.CircleGeometry(1, 12);
      geo.rotateX(-Math.PI / 2);
      const shade = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
        color: 0x24401c, transparent: true, opacity: soleShadows ? 0.42 : 0.2, depthWrite: false,
      }), spots.length);
      const m4 = new THREE.Matrix4();
      spots.forEach(([x, z, r], i) => {
        m4.makeScale(r, 1, r * 0.92);
        m4.setPosition(x, 0.03, z);
        shade.setMatrixAt(i, m4);
      });
      shade.renderOrder = -1;   // under the grass, which is also transparent-adjacent and drawn after
      scenery.add(shade);
      world.shadows = shade;
    }
  }

  mergeGroup(scenery); // trees, bushes, rocks and barricades, merged per material and per 30-unit cell
  scene.add(scenery);
  mergeGroup(cliffs);

  // ---- ambient life ----
  const life = new THREE.Group();
  scene.add(life);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.9, side: THREE.DoubleSide });
  function makeBird() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), darkMat);
    body.scale.set(0.8, 0.6, 1.8);
    g.add(body);
    const wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), darkMat);
      w.position.x = side * 0.3;
      w.rotation.x = -Math.PI / 2;
      pivot.add(w);
      g.add(pivot);
      wings.push(pivot);
    }
    g.userData.wings = wings;
    return g;
  }
  world.flocks = [];
  world.birdTimer = 6 + rand() * 6;
  function spawnFlock() {
    const f = world.focus;
    const ang = rand() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const start = f.clone().addScaledVector(dir, -36);
    start.y = 9 + rand() * 3;
    const count = 3 + Math.floor(rand() * 3);
    const birds = [];
    for (let i = 0; i < count; i++) {
      const b = makeBird();
      const row = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      b.userData.offset = new THREE.Vector3(-dir.z * side * row * 1.1, -row * 0.3, dir.x * side * row * 1.1).addScaledVector(dir, -row * 1.2);
      b.userData.phase = rand() * Math.PI * 2;
      b.rotation.y = Math.atan2(dir.x, dir.z);
      life.add(b);
      birds.push(b);
    }
    world.flocks.push({ birds, pos: start, dir, speed: 5 + rand() * 2, t: 0 });
  }
  // butterflies around the flower patches
  const wingColors = [0xffd54a, 0xffffff, 0xff9a3a, 0x9ad4ff];
  world.butterflies = [];
  const spots = [...world.flowerSpots].sort(() => rand() - 0.5).slice(0, 16);
  for (const sp of spots) {
    const g = new THREE.Group();
    const col = wingColors[Math.floor(rand() * wingColors.length)];
    const wm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, side: THREE.DoubleSide });
    const wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.13, 10), wm);
      w.scale.set(1.15, 0.85, 1);
      w.position.x = side * 0.13;
      w.rotation.x = -Math.PI / 2;
      pivot.add(w);
      const w2 = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8), wm);
      w2.position.set(side * 0.1, 0, 0.12);
      w2.rotation.x = -Math.PI / 2;
      pivot.add(w2);
      g.add(pivot);
      wings.push(pivot);
    }
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), darkMat);
    body.scale.set(1, 1, 3);
    g.add(body);
    g.position.copy(sp).setY(0.9);
    life.add(g);
    world.butterflies.push({ mesh: g, home: sp.clone(), wings, phase: rand() * 10, speed: 0.6 + rand() * 0.5 });
  }
  // Chimney smoke. Every puff on every chimney is one instance of one mesh, the way the health bars
  // are: a puff used to be its own Mesh with its own geometry and its own material, which was seven
  // draw calls for the Archery Range alone. Six villager homes would have made it forty-nine, which
  // is more than the village spends on the village.
  //
  // What instancing costs is per-puff opacity, since one material serves them all. A float attribute
  // carries it and the standard material's own alpha is multiplied by it before anything else uses
  // it, so the puffs still fade in and out exactly as they did.
  const PUFFS = 7;              // alive at once: 3.6 s of life at one every 0.55 s
  const SMOKE_MAX = 90;
  const smokeGeo = new THREE.SphereGeometry(1, 7, 6);
  const smokeAlpha = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_MAX), 1);
  smokeGeo.setAttribute('aAlpha', smokeAlpha);
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 1, transparent: true, depthWrite: false });
  smokeMat.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float aAlpha;\nvarying float vAlpha;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvAlpha = aAlpha;');
    shader.fragmentShader = `varying float vAlpha;\n${shader.fragmentShader}`
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );');
  };
  const smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, SMOKE_MAX);
  smoke.frustumCulled = false;   // the matrices are written straight in, so there is no bounds to cull by
  smoke.count = 0;
  life.add(smoke);
  const smokeM = new THREE.Matrix4();
  world.smokers = [];
  world.addSmoker = (x, y, z) => {
    // A restart rebuilds every structure, and this group is scene-level and outlives it; without this
    // the same chimney would collect a second smoker every time the game was restarted.
    if (world.smokers.some((s) => Math.abs(s.x - x) < 0.1 && Math.abs(s.z - z) < 0.1)) return;
    world.smokers.push({ x, y, z, next: 0, puffs: Array.from({ length: PUFFS }, () => ({ t: 99, life: 3.6, ox: 0 })) });
  };
  // #43: a chimney that moved. The smoker was given an absolute position when its building went up,
  // so a building that is picked up and put down elsewhere would otherwise leave its smoke behind --
  // the ticket names this. Matched on where it was, the same tolerance `addSmoker` dedupes with.
  world.moveSmoker = (fromX, fromZ, toX, toZ) => {
    const s = world.smokers.find((o) => Math.abs(o.x - fromX) < 0.1 && Math.abs(o.z - fromZ) < 0.1);
    if (!s) return;
    s.x = toX;
    s.z = toZ;
  };
  world.clearSmokers = () => {
    world.smokers.length = 0;
    smoke.count = 0;
  };

  // ---- #81: rain ----
  //
  // One instanced mesh of streaks cycling inside a column that rides with the King. A drop that
  // reaches the ground goes back to the top somewhere else in the column, and a drop he has walked
  // past wraps to the far side of it, so the fall stays vertical in WORLD space: a column glued to
  // his position dragged every drop sideways with him, and at a run of 7.5 against a fall of 20 that
  // read as the rain being afraid of him. Raining on the whole map instead would be a hundred
  // thousand drops to show the forty metres of it that are ever on screen.
  //
  // The camera never turns -- updateCamera only ever moves it, always to the same offset from the
  // King -- so every drop can share one orientation baked into the geometry, and a frame's work is
  // three floats a drop rather than a matrix compose. Which is also why the streak is tipped back:
  // the camera looks down at about 45 degrees, and a world-vertical quad loses a third of its length
  // to that and reads as drizzle. The lean off vertical is wind; dead-vertical rain looked like an
  // overlay laid on the screen rather than something falling in the scene.
  //
  // No splashes on the ground and no second light: the ticket's own order of what to drop first, and
  // neither is missed once the sky itself goes grey (updateDaylight).
  const RAIN_DROPS = 520;   // 1040 triangles in one draw call, and only while it is actually raining
  const RAIN_BOX = 40;      // how wide the column is: the view is about 40m across at camDist 16.5
  const RAIN_TOP = 16;      // and how tall. 16 over 20 a second is 0.8s of fall, so it is always full
  const RAIN_AHEAD = 4;     // pushed toward what the camera looks at rather than centred on the King
  const dropGeo = new THREE.PlaneGeometry(0.05, 0.9);
  dropGeo.rotateX(-0.45);
  dropGeo.rotateZ(0.12);
  // FrontSide, and the rotations above are what point it at the camera. Not DoubleSide: three.js
  // draws a transparent double-sided material TWICE, back faces then front, and measured here that
  // was 2 draw calls and 2080 triangles for one mesh of rain instead of 1 and 1040.
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xdfeefb, transparent: true, opacity: 0, depthWrite: false });
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, RAIN_DROPS);
  drops.frustumCulled = false;   // the matrices are written straight in, so there is no bounds to cull by
  drops.visible = false;
  life.add(drops);
  const dropP = new Float32Array(RAIN_DROPS * 3);
  const dropV = new Float32Array(RAIN_DROPS);
  {
    // Three.js leaves instanceMatrix as zeros, and only the translation of each is ever written from
    // here, so the rest of every matrix is laid down once: scale 1, no rotation, nothing per frame.
    const arr = drops.instanceMatrix.array;
    for (let i = 0; i < RAIN_DROPS; i++) {
      const o = i * 16;
      arr[o] = arr[o + 5] = arr[o + 10] = arr[o + 15] = 1;
      dropP[i * 3] = (Math.random() - 0.5) * RAIN_BOX;
      dropP[i * 3 + 1] = Math.random() * RAIN_TOP;
      dropP[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX;
      dropV[i] = 18 + Math.random() * 8;
    }
  }
  // Math.random throughout the weather, never the seeded `rand` the map is laid out with: the map is
  // meant to be the same every run and the weather is meant not to be, and drawing from the seeded
  // stream here would also shift everything downstream of it by 1680 numbers.
  const span = ([lo, hi]) => lo + Math.random() * (hi - lo);
  world.rain = { level: 0, on: false, t: span(CFG.rain.gap), run: false };
  // A restart keeps this world -- buildWorld runs once, in the constructor -- so without this a run
  // begun while it was raining would open mid-downpour with a timer left over from the last one.
  world.clearRain = () => {
    world.rain.on = false;
    world.rain.level = 0;
    world.rain.t = span(CFG.rain.gap);
    drops.visible = false;
  };

  // ---- per-frame animation ----
  world.update = (dt) => {
    world.time += dt;
    // birds
    world.birdTimer -= dt;
    if (world.birdTimer <= 0 && world.flocks.length < 2 && world.rain.level < 0.5) {
      world.birdTimer = 14 + rand() * 12;
      spawnFlock();
    }
    for (let i = world.flocks.length - 1; i >= 0; i--) {
      const fl = world.flocks[i];
      fl.t += dt;
      fl.pos.addScaledVector(fl.dir, fl.speed * dt);
      fl.birds.forEach((b, k) => {
        b.position.copy(fl.pos).add(b.userData.offset);
        b.position.y += Math.sin(world.time * 2 + b.userData.phase) * 0.15;
        const flap = Math.sin(world.time * 12 + b.userData.phase) * 0.7;
        b.userData.wings[0].rotation.z = flap;
        b.userData.wings[1].rotation.z = -flap;
      });
      if (fl.t > 16) {
        for (const b of fl.birds) life.remove(b);
        world.flocks.splice(i, 1);
      }
    }
    // butterflies
    for (const bf of world.butterflies) {
      const t = world.time * bf.speed + bf.phase;
      bf.mesh.position.set(bf.home.x + Math.sin(t) * 1.2 + Math.sin(t * 2.3) * 0.4, 0.7 + Math.sin(t * 1.7) * 0.25 + 0.2, bf.home.z + Math.cos(t * 0.8) * 1.2);
      bf.mesh.rotation.y = Math.atan2(Math.cos(t) * 1.2, -Math.sin(t * 0.8) * 0.96) ;
      const flap = 0.35 + Math.abs(Math.sin(world.time * 14 + bf.phase)) * 0.9;
      bf.wings[0].rotation.z = flap;
      bf.wings[1].rotation.z = -flap;
    }
    // #81: the weather clock, which turns only while the game does and only once the Queen is home
    // -- the opening holds a fixed sky (updateWaves stops the day while she is captive) and it is
    // already the busiest screen in the game. The drops carry on falling whatever the clock is doing,
    // the way the birds carry on flying behind a pause screen.
    const rn = world.rain;
    if (rn.run) {
      rn.t -= dt;
      if (rn.t <= 0) {
        rn.on = !rn.on;
        rn.t = span(rn.on ? CFG.rain.dur : CFG.rain.gap);
      }
      const step = dt / CFG.rain.fade;
      rn.level = rn.on ? Math.min(1, rn.level + step) : Math.max(0, rn.level - step);
      // Nothing that lives on a flower is out in this. Sixteen visibility flags, written on the two
      // frames it changes rather than on every frame it is true.
      const out = rn.level < 0.5;
      if (out !== world.bugsOut) {
        world.bugsOut = out;
        for (const bf of world.butterflies) bf.mesh.visible = out;
      }
    }
    if (rn.level > 0.002) {
      drops.visible = true;
      dropMat.opacity = 0.55 * rn.level;
      const f = world.focus;
      const cz = f.z - RAIN_AHEAD;
      const half = RAIN_BOX / 2;
      const arr = drops.instanceMatrix.array;
      for (let i = 0; i < RAIN_DROPS; i++) {
        const j = i * 3;
        let y = dropP[j + 1] - dropV[i] * dt;
        // #54's lesson, cheaply: one frame of negative dt would push a drop out of the top of the
        // box, and nothing below would ever bring it back down.
        if (y > RAIN_TOP) y = Math.random() * RAIN_TOP;
        if (y <= 0) {
          y += RAIN_TOP;
          dropP[j] = f.x + (Math.random() - 0.5) * RAIN_BOX;
          dropP[j + 2] = cz + (Math.random() - 0.5) * RAIN_BOX;
        } else {
          const dx = dropP[j] - f.x;
          if (dx > half) dropP[j] -= RAIN_BOX;
          else if (dx < -half) dropP[j] += RAIN_BOX;
          const dz = dropP[j + 2] - cz;
          if (dz > half) dropP[j + 2] -= RAIN_BOX;
          else if (dz < -half) dropP[j + 2] += RAIN_BOX;
        }
        dropP[j + 1] = y;
        const o = i * 16;
        arr[o + 12] = dropP[j];
        arr[o + 13] = y;
        arr[o + 14] = dropP[j + 2];
      }
      drops.instanceMatrix.needsUpdate = true;
    } else drops.visible = false;
    // smoke: every live puff on every chimney packs into the front of one instanced mesh
    let sn = 0;
    for (const sm of world.smokers) {
      sm.next -= dt;
      if (sm.next <= 0) {
        sm.next = 0.55;
        const p = sm.puffs.find((q) => q.t >= q.life);
        if (p) {
          p.t = 0;
          p.ox = rand() * Math.PI * 2;
        }
      }
      for (const p of sm.puffs) {
        if (p.t >= p.life) continue;
        p.t += dt;
        if (p.t >= p.life || sn >= SMOKE_MAX) continue;
        const k = p.t / p.life;
        const sc = 0.14 + k * 0.55;
        smokeM.makeScale(sc, sc, sc).setPosition(
          sm.x + Math.sin(k * 4 + p.ox) * 0.25 + k * 0.6,
          sm.y + k * 2.6,
          sm.z + Math.cos(k * 3 + p.ox) * 0.2,
        );
        smoke.setMatrixAt(sn, smokeM);
        smokeAlpha.array[sn] = 0.55 * (1 - k) * Math.min(1, k * 6);
        sn++;
      }
    }
    smoke.count = sn;
    smoke.instanceMatrix.needsUpdate = true;
    smokeAlpha.needsUpdate = true;
    if (world.waterTex) world.waterTex.offset.y -= dt * 0.08;
    if (!world.windOff) world.sway.value = world.time;   // #168: a quality tier can still the air
    for (const r of world.roads) {
      if (!r.revealed || r.progress >= 1) continue;
      r.progress = Math.min(1, r.progress + dt / 2.2);
      const count = Math.floor(r.progress * (r.samples.length - 1)) * r.stride;
      for (const m of r.meshes) if (!m.userData.noDrawRange) m.geometry.setDrawRange(0, count);
    }
    for (const r of world.paths) {
      if (r.progress >= 1) continue;
      r.progress = Math.min(1, r.progress + dt / 1.2);
      const count = Math.floor(r.progress * (r.samples.length - 1)) * r.stride;
      for (const m of r.meshes) m.geometry.setDrawRange(0, count);
    }
    const s = riverSamples;
    // #54: `TypeError: Cannot read properties of undefined (reading 'x')`, about one headless run in
    // six. `b` was clamped at the top and `a` was not clamped at all -- and the end that actually bit
    // was the BOTTOM, which neither of them guarded.
    //
    // What drove it there: a negative dt (see main.js), one frame of it, against a fleck whose `t` had
    // just wrapped and was sitting a hair above zero. `f.t -= 1` leaves a fleck at something like
    // 0.0002, and with seventy of them going round about once a minute there is nearly always one in
    // that window. One step backwards from there is negative, `Math.floor` of a negative is negative,
    // and `s[-1]` is undefined. Reproduced exactly: t = 0.0004, one update at dt = -0.05, same error.
    //
    // main.js now stops the negative dt at source, which is the cause. This is the second lock: `t` is
    // wrapped rather than decremented once, so no value of it can leave the range, and both ends are
    // clamped so no value of `t` could index off the array even if one did. The whole frame's update
    // is skipped when this throws -- camera, effects, HUD, render -- so it is worth two locks.
    if (s.length > 1) world.foam.forEach((f, i) => {
      f.t += f.speed * dt;
      f.t -= Math.floor(f.t);          // wraps from anywhere, including below zero and above two
      const fi2 = f.t * (s.length - 1);
      const lo = Math.min(s.length - 1, Math.max(0, Math.floor(fi2)));
      const a = s[lo];
      const b = s[Math.min(s.length - 1, lo + 1)];
      const tx = b.x - a.x;
      const tz = b.z - a.z;
      const l = Math.hypot(tx, tz) || 1;
      const x = a.x - (tz / l) * f.side;
      const z = a.z + (tx / l) * f.side;
      m4.makeRotationY(Math.atan2(tx, tz) + Math.PI / 2);
      m4.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
      m4.setPosition(x, 0.035, z);
      foam.setMatrixAt(i, m4);
    });
    foam.instanceMatrix.needsUpdate = true;
  };
  world.update(0);

  // ---- queries used by the game ----
  world.riverInfo = (x, z) => {
    const n = nearestOnPolyline(riverSamples, x, z);
    const a = riverSamples[Math.max(0, n.i - 1)];
    const b = riverSamples[Math.min(riverSamples.length - 1, n.i + 1)];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const q = riverSamples[n.i];
    const side = Math.sign(tx * (z - q.z) - tz * (x - q.x)) || 1;
    return { dist: n.d, side, qx: q.x, qz: q.z };
  };
  world.nearBridge = (x, z) => world.bridges.some((b) => Math.hypot(b.x - x, b.z - z) < MAP.river.bridgeRadius);
  world.crossingFor = (roadId) => world.crossings.find((c) => c.roadId === roadId);

  // #166: the instance counts, for the perf overlay. Every one of these is fixed once the world is
  // built (smoke is the exception and is capped), which is the point of putting them on screen: a
  // number here that moves during a run is a bug with its name on it.
  world.counts = () => ({
    tufts: tufts.count,
    flowers: flowers.reduce((n, f) => n + f.count, 0),
    shadows: world.shadows ? world.shadows.count : 0,
    pebbles: pebbles.count,
    clover: clovers.count,
    stones: fieldStones.count,
    smoke: smoke.count,
  });
  return world;
}

export function setupLights(scene) {
  // The fog colour IS the background (`updateDaylight` copies one onto the other every frame), so it
  // has to travel with the ground texture or the far distance goes a different green from the grass
  // under your feet -- which is the one place a flat-shaded world cannot hide a mismatch.
  scene.background = new THREE.Color(0x89bd55);
  scene.fog = new THREE.Fog(0x89bd55, 42, 90);
  const hemi = new THREE.HemisphereLight(0xfff8ea, 0x8fb86a, 1.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.3);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  const s = 36;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  sun.shadow.radius = 4;
  sun.shadow.intensity = 0.55; // soft, light shadows like the reference
  scene.add(sun);
  scene.add(sun.target);
  return { sun, hemi };
}
