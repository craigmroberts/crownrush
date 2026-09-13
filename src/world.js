import * as THREE from 'three';
import { CFG, MAP, TIERS, NODES } from './config.js';
import {
  mat, makeTree, makeBush, makeRock, makeSpikes, makeCliff, makePeak, makeBridge, makeHayBale, makeWheatField,
} from './models.js';

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
  const idx = [];
  const half = width / 2;
  for (let i = 0; i < n; i++) {
    const p = samples[i];
    const q = samples[Math.min(n - 1, i + 1)];
    const r = samples[Math.max(0, i - 1)];
    let tx = q.x - r.x;
    let tz = q.z - r.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const w = opts.taper ? half * Math.min(1, Math.min(i, n - 1 - i) / 12 + 0.15) : half;
    // normal = (-tz, tx)
    pos.set([p.x - tz * w, y, p.z + tx * w, p.x + tz * w, y, p.z - tx * w], i * 6);
    uv.set([0, i / 6, 1, i / 6], i * 4);
    if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
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

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4aa566';
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(99);
  const blob = (color, count, rmin, rmax) => {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const x = r() * 256;
      const y = r() * 256;
      const rx = rmin + r() * (rmax - rmin);
      const ry = rx * (0.45 + r() * 0.3);
      // draw wrapped so the tile repeats seamlessly
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rx, ry, r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  blob('rgba(90, 178, 112, 0.28)', 22, 10, 26);
  blob('rgba(63, 154, 91, 0.22)', 18, 8, 22);
  blob('rgba(104, 192, 124, 0.18)', 16, 4, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene) {
  const size = CFG.world.size;
  const rand = rng(1337);
  const world = { river: null, bridges: [], crossings: [], roads: [], foam: [], time: 0 };

  // ---- ground ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshToonMaterial({ map: groundTexture(), color: 0xffffff }));
  ground.material.gradientMap = mat(0xffffff).gradientMap;
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- river ----
  const riverSamples = spline(MAP.river.points, 160);
  world.river = { samples: riverSamples, halfWidth: MAP.river.halfWidth };
  scene.add(ribbon(riverSamples, MAP.river.halfWidth * 2 + 2.6, 0xd8cc9d, 0.012));
  scene.add(ribbon(riverSamples, MAP.river.halfWidth * 2, 0x3d9bd4, 0.02));
  const highlight = ribbon(riverSamples, MAP.river.halfWidth * 1.1, 0x63bdea, 0.028);
  scene.add(highlight);
  // foam flecks drifting downstream
  const foamGeo = new THREE.PlaneGeometry(1.1, 0.22);
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const foam = new THREE.InstancedMesh(foamGeo, foamMat, 70);
  foam.frustumCulled = false;
  scene.add(foam);
  world.foamMesh = foam;
  for (let i = 0; i < 70; i++) world.foam.push({ t: rand(), side: (rand() - 0.5) * MAP.river.halfWidth * 1.4, speed: 0.012 + rand() * 0.01 });

  // ---- roads (spline ribbons with a darker shoulder and wheel ruts); hidden until revealed ----
  const rutMat = mat(0xc9a066, { side: THREE.DoubleSide });
  for (const road of MAP.roads) {
    const samples = spline(road.points, 90);
    const entry = { id: road.id, samples, meshes: [], revealed: false, progress: 0 };
    entry.meshes.push(ribbon(samples, MAP.roadWidth + 1.2, 0xc9a066, 0.014, { taper: true }));
    entry.meshes.push(ribbon(samples, MAP.roadWidth, 0xd9b27c, 0.018, { taper: true }));
    for (const off of [-0.9, 0.9]) {
      const shifted = samples.map((p, i) => {
        const q = samples[Math.min(samples.length - 1, i + 1)];
        const r = samples[Math.max(0, i - 1)];
        const tx = q.x - r.x;
        const tz = q.z - r.z;
        const l = Math.hypot(tx, tz) || 1;
        return new THREE.Vector3(p.x - (tz / l) * off, 0, p.z + (tx / l) * off);
      });
      entry.meshes.push(ribbon(shifted, 0.14, 0xc9a066, 0.022, { material: rutMat }));
    }
    for (const m of entry.meshes) {
      m.visible = false;
      m.geometry.setDrawRange(0, 0);
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
  }
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
  const free = (x, z, m = 1.5) => !inVillage(x, z) && !inCliffs(x, z) && !nearRiver(x, z, m + 1.5) && !nearRoad(x, z, m) && !nearNode(x, z);
  world.free = free;
  const half = size / 2 - 6;
  const scenery = new THREE.Group();
  const place = (maker, count, margin = 1.5, minDist = 0) => {
    let tries = 0;
    for (let i = 0; i < count && tries < count * 30; tries++) {
      const x = (rand() * 2 - 1) * half;
      const z = (rand() * 2 - 1) * half;
      if (!free(x, z, margin) || Math.hypot(x, z) < minDist) continue;
      const o = maker(x, z);
      o.position.x = x;
      o.position.z = z;
      scenery.add(o);
      i++;
    }
  };
  // forests come in clumps
  const clumps = [];
  for (let i = 0; i < 14; i++) clumps.push([(rand() * 2 - 1) * half, (rand() * 2 - 1) * half]);
  let placedTrees = 0;
  for (const [cx, cz] of clumps) {
    for (let k = 0; k < 9; k++) {
      const x = cx + (rand() * 2 - 1) * 9;
      const z = cz + (rand() * 2 - 1) * 9;
      if (Math.abs(x) > half || Math.abs(z) > half || !free(x, z, 2)) continue;
      const t = makeTree(0.8 + rand() * 0.7);
      t.position.set(x, 0, z);
      scenery.add(t);
      placedTrees++;
    }
  }
  place(() => makeTree(0.9 + rand() * 0.5), Math.max(0, 50 - placedTrees), 2);
  place(() => makeBush(), 45, 1);
  place(() => makeRock(0.7 + rand() * 1.0), 40, 1);
  place(() => {
    const s = makeSpikes();
    s.rotation.y = rand() * Math.PI;
    return s;
  }, 22, 1.5);
  place(() => makeHayBale(), 10, 1);

  // wheat fields with fences (straw comes from these)
  for (const f of MAP.fields) {
    const field = makeWheatField(f.size[0], f.size[1]);
    field.position.set(f.pos[0], 0, f.pos[1]);
    scenery.add(field);
    for (let i = 0; i < 2; i++) {
      const h = makeHayBale();
      h.position.set(f.pos[0] + f.size[0] / 2 + 2 + i * 1.6, 0, f.pos[1] - 1 + (i % 2) * 1.4);
      scenery.add(h);
    }
  }

  // grass tufts and flowers, instanced
  const tuftGeo = new THREE.ConeGeometry(0.16, 0.55, 4);
  const tufts = new THREE.InstancedMesh(tuftGeo, mat(0x3aa25c), 700);
  const flowerGeo = new THREE.SphereGeometry(0.14, 6, 5);
  const flowerColors = [0xffffff, 0xffd54a, 0xff8aa8];
  const flowers = flowerColors.map((c) => new THREE.InstancedMesh(flowerGeo, mat(c), 70));
  const m4 = new THREE.Matrix4();
  let ti = 0;
  const fi = [0, 0, 0];
  for (let tries = 0; tries < 6000 && ti < 700; tries++) {
    const x = (rand() * 2 - 1) * half;
    const z = (rand() * 2 - 1) * half;
    if (!free(x, z, 0.5)) continue;
    m4.makeRotationY(rand() * Math.PI);
    m4.setPosition(x, 0.2, z);
    tufts.setMatrixAt(ti++, m4);
    if (rand() < 0.28) {
      const k = Math.floor(rand() * 3);
      if (fi[k] < 70) {
        m4.makeTranslation(x + 0.4, 0.3, z + 0.2);
        flowers[k].setMatrixAt(fi[k]++, m4);
      }
    }
  }
  tufts.count = ti;
  flowers.forEach((f, k) => {
    f.count = fi[k];
    scenery.add(f);
  });
  scenery.add(tufts);
  scene.add(scenery);

  // ---- per-frame animation ----
  world.update = (dt) => {
    world.time += dt;
    for (const r of world.roads) {
      if (!r.revealed || r.progress >= 1) continue;
      r.progress = Math.min(1, r.progress + dt / 2.2);
      const count = Math.floor(r.progress * (r.samples.length - 1)) * 6;
      for (const m of r.meshes) m.geometry.setDrawRange(0, count);
    }
    const s = riverSamples;
    world.foam.forEach((f, i) => {
      f.t += f.speed * dt;
      if (f.t > 1) f.t -= 1;
      const fi2 = f.t * (s.length - 1);
      const a = s[Math.floor(fi2)];
      const b = s[Math.min(s.length - 1, Math.floor(fi2) + 1)];
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

  return world;
}

export function setupLights(scene) {
  scene.background = new THREE.Color(0x47a262);
  scene.fog = new THREE.Fog(0x47a262, 40, 85);
  const hemi = new THREE.HemisphereLight(0xfff6e8, 0x4a8a5a, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
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
  sun.shadow.radius = 4;
  scene.add(sun);
  scene.add(sun.target);
  return { sun, hemi };
}
