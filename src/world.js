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
  const world = { river: null, bridges: [], crossings: [], roads: [], fields: [], foam: [], time: 0, sway: { value: 0 }, flowerSpots: [], focus: new THREE.Vector3() };
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

  // ---- roads (spline ribbons with a darker shoulder and wheel ruts); hidden until revealed ----
  const rutMat = mat(0xd2ae74, { side: THREE.DoubleSide });
  MAP.roads.forEach((road, ri) => {
    const samples = spline(road.points, 90);
    const entry = { id: road.id, samples, meshes: [], revealed: false, progress: 0 };
    // All four roads start at the castle and overlap in the square where they cross. Lifting each
    // one a hair above the last keeps that square from z-fighting; dirt over dirt reads the same.
    const ry = ri * 0.0012;
    entry.meshes.push(ribbon(samples, MAP.roadWidth + 1.4, 0xcaa46c, 0.014 + ry, { taper: 'end', wobble: 0.12 }));
    entry.meshes.push(ribbon(samples, MAP.roadWidth, 0xdfc08a, 0.018 + ry, { taper: 'end', wobble: 0.06 }));
    entry.meshes.push(ribbon(samples, MAP.roadWidth * 0.55, 0xe8cd9c, 0.02 + ry, { taper: 'end', wobble: 0.08 }));
    // stones scattered along the verge, revealed with the road
    const stoneGeo = new THREE.DodecahedronGeometry(0.16, 0);
    const stones = new THREE.InstancedMesh(stoneGeo, matFlat(0xb7a58d), 40);
    const sm = new THREE.Matrix4();
    for (let k = 0; k < 40; k++) {
      const i = 4 + Math.floor(rand() * (samples.length - 8));
      const p = samples[i];
      const q = samples[i + 1];
      const tx = q.x - p.x;
      const tz = q.z - p.z;
      const l = Math.hypot(tx, tz) || 1;
      const off = (MAP.roadWidth / 2 + 0.4 + rand() * 0.6) * (k % 2 ? 1 : -1);
      sm.makeRotationY(rand() * Math.PI);
      sm.scale(new THREE.Vector3(0.7 + rand() * 0.8, 0.5, 0.7 + rand() * 0.8));
      sm.setPosition(p.x - (tz / l) * off, 0.05, p.z + (tx / l) * off);
      stones.setMatrixAt(k, sm);
    }
    stones.userData.noDrawRange = true;
    entry.meshes.push(stones);
    for (const off of [-0.9, 0.9]) {
      const shifted = samples.map((p, i) => {
        const q = samples[Math.min(samples.length - 1, i + 1)];
        const r = samples[Math.max(0, i - 1)];
        const tx = q.x - r.x;
        const tz = q.z - r.z;
        const l = Math.hypot(tx, tz) || 1;
        return new THREE.Vector3(p.x - (tz / l) * off, 0, p.z + (tx / l) * off);
      });
      entry.meshes.push(ribbon(shifted, 0.14, 0xc9a066, 0.022 + ry, { material: rutMat }));
    }
    for (const m of entry.meshes) {
      m.visible = false;
      if (!m.userData.noDrawRange) m.geometry.setDrawRange(0, 0);
      scene.add(m);
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

  // roads grow out from the village when revealed
  world.revealRoad = (id) => {
    const r = world.roads.find((r) => r.id === id);
    if (!r || r.revealed) return;
    r.revealed = true;
    for (const m of r.meshes) m.visible = true;
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
  const grassFree = (x, z) => !inCitadel(x, z) && !inCliffs(x, z) && !inCamp(x, z)
    && !nearRiver(x, z, 1.2) && !nearRoad(x, z, 0.5) && !nearNode(x, z) && !nearPad(x, z);
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
    world.sway.value = world.time;
    for (const r of world.roads) {
      if (!r.revealed || r.progress >= 1) continue;
      r.progress = Math.min(1, r.progress + dt / 2.2);
      const count = Math.floor(r.progress * (r.samples.length - 1)) * 6;
      for (const m of r.meshes) if (!m.userData.noDrawRange) m.geometry.setDrawRange(0, count);
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
