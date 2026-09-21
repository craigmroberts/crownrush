import * as THREE from 'three';
import { CFG, MAP, TIERS, NODES, NODE_BANDS, PADS } from './config.js';
import {
  mat, matFlat, swayMaterial, setSwayUniform, setFeetUniform, FEET_SLOTS, makeTree, makeBush, makeRock, makeSpikes, makeCliff, makePeak, makeBridge, makeHayBale, makeWheatField, makeLantern, mergeGroup,
  band,
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
  const m = new THREE.Mesh(geo, opts.material || mat(color, { side: THREE.DoubleSide, banded: true }));
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

// #188: THE RIVER, BANDED ACROSS THE CHANNEL AND WITH A LINE AT EACH BANK.
//
// The land's bands (#185) quantise the LIGHT -- `dotNL`, a cosine. A river is flat and level, so
// every fragment of it has the same `dotNL` and banding the light does nothing to it at all; what a
// river has instead is depth, and depth runs across the channel. So this quantises `uv.x` and is a
// different hook that happens to produce the same kind of picture.
//
// THE STEP CONSTANTS ARE ITS OWN, and #188 asked for the land's. They are the same numbers meaning
// different things: 0.20 and 0.48 are thresholds on a cosine, and used here they would put the deep
// water in the middle fifth of the channel and pale shallows across the other four -- a dark stripe
// in a wide light river, which is backwards. A river is deep in the middle. Built both and looked;
// the edges below are where the bands fall in the right proportions.
//
// THE RAW `uv` IS CARRIED AS A VARYING rather than reading `vMapUv`, which is the same attribute
// AFTER the texture transform -- and that transform is exactly what scrolls this material every
// frame (`waterTex.offset.y -= dt * 0.08`). Reading it here would make the bands slide downstream
// with the highlights, and the channel would appear to move sideways.
function riverWater(m, world) {
  world.riverPhase = { value: 0 };
  m.customProgramCacheKey = () => 'river-water';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRiver = world.riverPhase;
    shader.uniforms.uDeep = { value: new THREE.Color(0x2c7cb4) };
    shader.uniforms.uMid = { value: new THREE.Color(0x3d9bd4) };
    shader.uniforms.uShallow = { value: new THREE.Color(0x4fa8d2) };
    shader.uniforms.uFoam = { value: new THREE.Color(0xdff1fa) };
    shader.uniforms.uRiverEdge = { value: new THREE.Vector2(0.52, 0.80) };
    world.riverUniforms = shader.uniforms;   // so a harness can move a band without a rebuild
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRiverUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRiverUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vRiverUv;
uniform float uRiver;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec2 uRiverEdge;`)
      // after the map, because the map is what the scrolling highlights live in and they are kept:
      // the banded colour is multiplied by the map's own luminance, so the streaks still run
      // downstream over the top of the bands instead of being painted out by them.
      .replace('#include <map_fragment>', `#include <map_fragment>
  float shore = abs( vRiverUv.x - 0.5 ) * 2.0;
  float lum = dot( diffuseColor.rgb, vec3( 0.3, 0.5, 0.2 ) );
  vec3 band = mix( mix( uDeep, uMid, step( uRiverEdge.x, shore ) ), uShallow, step( uRiverEdge.y, shore ) );
  // The line at the bank. Two sines of different wavelength, one running each way, so it meanders
  // rather than pulsing -- a single sine reads as the whole river breathing in and out.
  float wob = sin( vRiverUv.y * 2.1 + uRiver * 1.5 ) * 0.075 + sin( vRiverUv.y * 5.3 - uRiver * 0.9 ) * 0.038;
  float edge = 0.905 + wob;
  float foam = smoothstep( edge - 0.042, edge + 0.012, shore );
  diffuseColor.rgb = mix( band * ( 0.80 + 0.40 * lum ), uFoam, foam * 0.85 );`);
  };
  return m;
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
  // #192: the same, with a straight edge -- a small faceted chip rather than an ellipse.
  const chip = (color, count, rmin, rmax) => {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = rmin + r() * (rmax - rmin);
      const n = 5 + Math.floor(r() * 3);
      const ph = r() * 7;
      const pts = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ph;
        const j = rad * (0.6 + r() * 0.8);
        pts.push([Math.cos(a) * j, Math.sin(a) * j * (0.6 + r() * 0.5)]);
      }
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        ctx.beginPath();
        pts.forEach(([px, py], k) => (k ? ctx.lineTo(x + px + ox, y + py + oy) : ctx.moveTo(x + px + ox, y + py + oy)));
        ctx.closePath();
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
  // #192: and grain. Everything above is an ellipse with a soft edge, which is the whole of why the
  // ground reads as a smudge rather than as a material -- the tone varies and nothing in it has a
  // form. These are the same sizes with a STRAIGHT edge: little faceted chips, at a third of a world
  // unit, which is the scale the eye reads as texture rather than as shapes. Big shapes cannot go in
  // this tile at all (it is 11.9 units and a frame holds fifty), which is what `patchTexture` is for.
  chip('rgba(120, 164, 70, 0.26)', 200, 6, 15);
  chip('rgba(186, 220, 130, 0.22)', 170, 5, 12);
  chip('rgba(96, 134, 56, 0.20)', 140, 4, 10);
  chip('rgba(150, 132, 92, 0.16)', 60, 5, 13);
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
// #192: EARTH WITH EDGES. `groundTexture` carries mottling, faint earth and a speckle, and
// `breakTiling` below stops any of it repeating -- which is what they were for, and they work. What
// they leave is a soft smudge: every shape in that tile is a low-alpha ellipse with a gradual edge,
// so the ground has tone but no forms. Wherever the grass does not cover -- #191 closed most of that,
// not all, and a road, a mat and the citadel are bare on purpose -- there is nothing to look at.
//
// This is the layer that gives it shapes you could point at: patches of turned earth and dry worn
// ground, with an EDGE, at the scale of a few metres.
//
// WHY IT IS ITS OWN TEXTURE rather than more passes in the tile. The tile is 11.9 world units and a
// frame holds about fifty, so a shape big enough to read as a patch would be two or three to a tile
// and a dozen copies of itself on screen. That is the trap #162 named, and the reason the earth
// passes in the tile are kept faint and formless. This one tiles every 64 units -- wider than the
// frame -- so a patch is seen once.
//
// WHY IT IS OPAQUE AND WHITE. It is a MULTIPLIER, not a decal: white is "no patch" and multiplies the
// ground by one, and a shape is the tint the earth there should be. The alternative, a transparent
// canvas composited over the ground, has two known traps and this has neither -- canvas alpha is
// premultiplied and the un-premultiply on upload is lossy at the low alphas these shapes want, and
// bilinear filtering between an opaque texel and a transparent one pulls RGB toward black, which
// draws a dark line round every shape at exactly the scale the shape is meant to be read at.
function patchTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  const r = rng(4021);
  // An irregular closed shape rather than an ellipse: a ring of points with the radius jittered and a
  // low-frequency wobble on top, joined by STRAIGHT lines. Straight on purpose -- this world is
  // flat-shaded and low-poly, and a patch of earth with a faceted outline belongs in it where a
  // smooth blob reads as a stain.
  const shape = (cx, cy, rad, fill, rim) => {
    const n = 11 + Math.floor(r() * 5);
    const ph = r() * 7;
    const wob = 0.22 + r() * 0.18;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + wob * Math.sin(a * 2 + ph) + (r() - 0.5) * 0.3;
      pts.push([Math.cos(a) * rad * k, Math.sin(a) * rad * k]);
    }
    // drawn nine times over, so the tile wraps without a seam
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x + ox, cy + y + oy) : ctx.moveTo(cx + x + ox, cy + y + oy)));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (rim) {
          // A darker line just inside the edge, which is what stops a patch reading as a flat sticker:
          // ground that has been turned or walked is deepest where it was cut and dries toward the
          // middle. It is also what survives being seen at a distance, when the fill has gone to haze.
          ctx.strokeStyle = rim;
          ctx.lineWidth = 3 + r() * 3;
          ctx.stroke();
        }
      }
    }
  };
  // Three kinds, and the counts are what keep them apart: few enough and large enough that each one
  // is a place rather than a pattern. Dry worn ground is the commonest -- it is what a field looks
  // like wherever anything walks -- then turned earth, then the dark damp hollows. The numbers are
  // multipliers on the grass under them, which is why none goes far from white: 0.70 is as dark as a
  // patch may be before the ground reads as burnt rather than bare.
  //
  // Opaque, not blended: the colour IS the multiplier, so two patches overlapping give the tint of
  // the one on top rather than the square of both, and the first version's soft alphas -- which read
  // as nothing at all through the grass -- cannot come back by accident.
  //
  // The counts are a third of the first version's and that is the whole of the tuning. Two scales are
  // mixed below, so whatever this covers is very nearly doubled on the ground, and at 7/5/4 the field
  // came out more patch than grass -- a camouflage pattern rather than a field with worn places in it.
  for (let i = 0; i < 4; i++) shape(r() * S, r() * S, 30 + r() * 34, 'rgb(236, 214, 158)', 'rgb(214, 186, 128)');
  for (let i = 0; i < 3; i++) shape(r() * S, r() * S, 22 + r() * 26, 'rgb(212, 178, 126)', 'rgb(184, 148, 100)');
  for (let i = 0; i < 2; i++) shape(r() * S, r() * S, 16 + r() * 20, 'rgb(172, 148, 114)', 'rgb(142, 120, 92)');
  // and a scatter of small hard ones, which is what makes the big ones read as the same material
  // rather than as three shapes somebody placed
  for (let i = 0; i < 18; i++) shape(r() * S, r() * S, 5 + r() * 9, r() < 0.5 ? 'rgb(240, 222, 172)' : 'rgb(204, 176, 132)', null);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function breakTiling(m) {
  const mask = maskTexture();
  const patch = patchTexture();
  m.customProgramCacheKey = () => 'ground-untiled-patched';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMask = { value: mask };
    shader.uniforms.uPatch = { value: patch };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMask;\nuniform sampler2D uPatch;')
      // #192: `vMapUv` spans 0..16 over 190 world units, so one unit of it is 11.875 -- which is the
      // ground tile. 11.875 / 64 puts the patch tile at 64 units, wider than the frame.
      //
      // `earth` rather than `patch`, and that is not a preference. `patch` is a RESERVED WORD in GLSL
      // ES 3.00 -- it is tessellation vocabulary the language keeps whether or not anything uses it --
      // so the fragment shader did not compile, and what a scene does then is keep running: the ground
      // rendered as flat green with no texture at all, there was no page error, and three's own
      // message went to the console where nothing was listening. It cost an hour and a bisect. A
      // harness that drives this game should listen to `console` as well as `pageerror`.
      //
      // TWO SCALES, mixed by the same mask the ground tile uses, and for the same reason: one period
      // of 64 units is wider than a frame at the King's camera but not at the board's map, where the
      // patches came out as a plaid. 64 and 111 against a mask of 135 never line up.
      //
      // `cover` is how far a texel is from white, and the smoothstep on it is what buys the edge back.
      // The patch tile is eight pixels to the world unit against the ground tile's forty-three, so
      // bilinear filtering spreads a shape's outline over about three screen pixels -- readable as a
      // gradient, which is the thing this ticket exists to stop. Re-thresholding the bottom third of
      // that ramp pulls it back under one pixel, and costs a subtract and a smoothstep.
      //
      // MIXED IN RATHER THAN MULTIPLIED, which was the first version and is the thing to know if this
      // is ever revisited. A multiply can only take a colour toward black: warm tints over green
      // ground gave DARKER GREEN, so the patches read as blotches of shadow rather than as earth, and
      // no choice of tint fixes it because raising red is exactly what a multiplier cannot do. So the
      // texel is the colour the earth should be and `lum` carries the ground's own light and shade
      // into it -- the mottling, the speckle and the daylight tint all still show through a patch,
      // which is what keeps it ground rather than paint laid on top.
      .replace('#include <map_fragment>', `
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        vec4 sampledDiffuseColor2 = texture2D( map, vMapUv * 0.37 + vec2( 0.13, 0.41 ) );
        float untile = texture2D( uMask, vMapUv * 0.0875 ).r;
        diffuseColor *= mix( sampledDiffuseColor, sampledDiffuseColor2, untile );
        vec3 earthA = texture2D( uPatch, vMapUv * 0.18555 ).rgb;
        vec3 earthB = texture2D( uPatch, vMapUv * 0.10694 + vec2( 0.37, 0.61 ) ).rgb;
        vec3 earth = mix( earthA, earthB, untile );
        float cover = smoothstep( 0.02, 0.09, 1.0 - min( earth.r, min( earth.g, earth.b ) ) );
        float lum = dot( diffuseColor.rgb, vec3( 0.35, 0.5, 0.15 ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, earth * lum * 1.9, cover * 0.32 );`);
  };
}

// `soleShadows` is true when nothing else casts -- see the contact-shadow block below for what it
// changes and why it has to be told rather than worked out here.
// #219: the hinterland's nodes, seeded per map, inside the bands measured off the hand-placed
// layout (`NODE_BANDS`, config.js).
//
// A SEED THAT PRODUCES AN UNPLAYABLE MAP HAS TO BE IMPOSSIBLE, NOT UNLIKELY, and that is the whole
// shape of this: it generates a candidate, checks it against every hard constraint, and REJECTS it.
// It does not nudge a bad point until it passes, because nudging is how a diamond ends up twelve
// units from the Keep in one seed out of four hundred and nobody finds out for a week.
//
// The rejections are per material and the fallback is per material too: if a band cannot be
// satisfied in `TRIES` attempts, that material keeps its hand-placed nodes. So the worst a seed can
// ever do is give you the map the game has always had.
//
// `seed === 0` is the hand-placed layout untouched, which is what every `?view=` frames -- a board
// that re-rolled its own map would make two screenshots of one page two different pictures (#222).
const TRIES = 60;
function seedNodes(seed, riverSamples, ok, inCliffs) {
  const seeded = {};
  if (!seed) return seeded;                // 0 or undefined: the layout in config.js, unchanged
  const HOME = riverSideOf(riverSamples, 0, 8);   // which bank the village stands on
  const kept = [];
  for (const [type, band] of Object.entries(NODE_BANDS)) {
    const original = NODES.filter((n) => n.type === type);
    let made = null;
    for (let attempt = 0; attempt < TRIES && !made; attempt++) {
      // A fresh stream per material per attempt, so one material's rejections cannot shift another
      // material's layout -- otherwise adding a constraint to iron would silently move the wood.
      const rand = rng(seed * 7919 + hashType(type) * 104729 + attempt);
      const want = band.count[0] + Math.floor(rand() * (band.count[1] - band.count[0] + 1));
      const clumps = band.clumps[0] + Math.floor(rand() * (band.clumps[1] - band.clumps[0] + 1));
      const centres = [];
      for (let c = 0; c < clumps; c++) {
        // `clumpArc` and `clumpDist` give a clump its own bearing and its own ring (see wood in
        // config.js). Without them every clump is drawn from the band's full range, which is right
        // for a material that is one kind of place -- iron is a seam along one cliff foot, diamond
        // is the deep rock across the water -- and wrong for one that is several.
        const sector = band.clumpArc ? band.clumpArc[c % band.clumpArc.length] : band.arc;
        const a = sector
          ? (sector[0] + rand() * (sector[1] - sector[0])) * Math.PI / 180
          : rand() * Math.PI * 2;
        const ring = band.clumpDist ? band.clumpDist[c % band.clumpDist.length] : band.dist;
        const d = ring[0] + rand() * (ring[1] - ring[0]);
        centres.push([Math.cos(a) * d, Math.sin(a) * d]);
      }
      const pts = [];
      for (let i = 0; i < want; i++) {
        let placed = null;
        for (let k = 0; k < 40 && !placed; k++) {
          const [cx, cz] = centres[i % centres.length];
          // Around its clump's centre, and the spread grows with each failed try so a clump that
          // landed somewhere tight can still find room rather than failing the whole attempt.
          const spread = 3 + k * 0.8;
          // ROUNDED BEFORE IT IS TESTED, not after. It used to be `[+x.toFixed(2), +z.toFixed(2)]`
          // at the end, so the point that passed every check was not the point that got stored --
          // and seed 123456 put an iron seam 3.6997 from the `tower-1-nw` mat, which cleared a 3.7
          // test on the unrounded value and failed it on the rounded one. Two decimals is what the
          // layout is written in; test the number you are going to keep.
          const x = +(cx + (rand() * 2 - 1) * spread).toFixed(2);
          const z = +(cz + (rand() * 2 - 1) * spread).toFixed(2);
          const d = Math.hypot(x, z);
          if (d < band.dist[0] || d > band.dist[1]) continue;
          if (inCliffs(x, z)) continue;                       // the box the King cannot mine in
          if (!ok(x, z)) continue;                            // citadel, mats, roads, river, camp, cliffs
          if (band.acrossRiver && riverSideOf(riverSamples, x, z) === HOME) continue;
          if (pts.some((p) => Math.hypot(p[0] - x, p[1] - z) < 5)) continue;   // not on top of each other
          placed = [x, z];
        }
        // NOT `break`. It was, and that is what made wood fall back to the hand-placed list on
        // seven seeds in ten: `want` is 9 to 11 and `count[0]` is 9, so a single point that could not
        // find room -- one clump centred close to the citadel is enough -- discarded every point
        // after it and failed the attempt with three. Skip the point; the length check below is
        // already the thing that decides whether the attempt was good enough.
        if (placed) pts.push(placed);
      }
      if (pts.length < band.count[0]) continue;               // too few: reject the whole attempt
      if (band.near && pts.filter((p) => Math.hypot(p[0], p[1]) <= band.near.within).length < band.near.atLeast) continue;
      // The band's total stock, split over however many nodes this seed made, so a seed with fewer
      // nodes gets richer ones rather than a poorer run. Rounded up, then the last one takes the
      // remainder, so the total is exactly the number the economy was balanced on.
      const each = Math.max(1, Math.round(band.stock / pts.length));
      made = pts.map((p, i) => ({
        type,
        pos: p,
        stock: i === pts.length - 1 ? Math.max(1, band.stock - each * (pts.length - 1)) : each,
      }));
    }
    seeded[type] = !!made;
    for (const n of (made || original)) kept.push(n);
  }
  // In place, because `NODES` is what game.js, world.js and game-save.js all read and threading a
  // second list through three files to say the same thing is how they drift apart.
  NODES.length = 0;
  for (const n of kept) NODES.push(n);
  return seeded;
}

// #218: WHERE THE RAIDER CAMPS STAND.
//
// Three of them, outside the walls, each in its own direction, because the whole mechanic is that
// breaking one takes a side of the village off tonight's raid. Three camps in a cluster would be one
// decision wearing three hats, so `apart` is as load-bearing here as `dist` is.
//
// It runs where `seedNodes` does and for the same reason: the river has been sampled, the roads are
// laid and the cliff box is known, so every constraint can be ASKED rather than re-derived. And it
// runs before the scatter, so `free` can keep trees and rocks out of a camp's clearing -- a camp with
// a solid trunk (#215) standing in the middle of it is a fight against the scenery.
//
// ON THE HOME BANK, always. A camp across the water sends a party every night from raid night 3 and
// cannot be reached until a bridge is bought -- which is a mechanic the player can see working
// against them and cannot act on, the exact opposite of what this ticket is for.
//
// AND CLEAR OF THE MAIN CAMP'S ARC. The finale sits at (-4, -74), and the floor party -- the part of
// the raid that always comes -- is aimed from there. A small camp in the same direction would make
// breaking it look like it did nothing, because the parties would arrive on top of each other.
function seedCamps(seed, riverSamples, ok, homeSide) {
  const C = CFG.camps;
  const rand = rng((seed || C.fixedSeed) * 2246822519 >>> 0);
  const fin = Math.atan2(CFG.finale.pos[1], CFG.finale.pos[0]);
  const out = [];
  // One camp per sector, so they cannot bunch: the circle is cut into `count` equal slices and each
  // camp is placed inside its own, jittered rather than pinned to the middle of it.
  const base = rand() * Math.PI * 2;
  const step = (Math.PI * 2) / C.count;
  for (let i = 0; i < C.count; i++) {
    let placed = null;
    for (let k = 0; k < 90 && !placed; k++) {
      // The spread opens with each failed try -- a sector whose good ground is all at one end can
      // still find it -- and the distance walks out from the near edge, because a camp you can reach
      // is worth more to this mechanic than one placed perfectly.
      const a = base + i * step + (rand() - 0.5) * step * Math.min(1, 0.35 + k * 0.08);
      const d = C.dist[0] + rand() * (C.dist[1] - C.dist[0]);
      const x = +(Math.cos(a) * d).toFixed(2);
      const z = +(Math.sin(a) * d).toFixed(2);
      // a quarter turn either side of the finale is its arc, and nothing else goes in it
      let da = Math.abs(Math.atan2(z, x) - fin) % (Math.PI * 2);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da < 0.55) continue;
      if (!ok(x, z)) continue;
      if (riverSideOf(riverSamples, x, z) !== homeSide) continue;
      if (out.some((c) => Math.hypot(c.x - x, c.z - z) < C.apart)) continue;
      // #218: `out.length`, NOT the sector index `i`, and the difference is a duplicate id.
      //
      // Found while measuring ground for something else: seed 0 had camps `camp-1`, `camp-2` and
      // `camp-2`, with no `camp-0` at all. Sector 0 finds nowhere, sectors 1 and 2 place `camp-1` and
      // `camp-2`, and then the sweep below places the missing third as `camp-${out.length}` -- which
      // is 2, because two are down. Two camps answering to one id is not cosmetic: `campFor`,
      // `campCleared`, the reoccupy timer and the save all key on it, so clearing one of them
      // accounts for both -- the other reads as cleared without anybody going near it, and a save
      // restores the pair as one.
      //
      // Numbering by placement order rather than by which slice happened to work also makes the ids
      // say something true, and means there is always a `camp-0`.
      placed = { id: `camp-${out.length}`, x, z };
    }
    if (placed) out.push(placed);
  }
  // A SECTOR CAN HAVE NO GOOD GROUND IN IT AT ALL, and the sweep found one: seed 42 produced two
  // camps instead of three, silently, because one 120-degree slice was river on one side and the
  // main camp's arc on the other. Two camps is a quieter game than three and nothing anywhere said
  // so -- the same silent fallback that made #219's wood stop varying.
  //
  // So anything the sectors could not place is placed by sweeping the whole circle instead. `apart`
  // still holds, which is what stops the loser bunching against a camp that did find its sector, and
  // it is the constraint that was doing the real work all along -- the sectors are only a cheap way
  // of getting a good spread first.
  for (let i = out.length; i < C.count; i++) {
    let placed = null;
    for (let k = 0; k < 240 && !placed; k++) {
      const a = (k / 240) * Math.PI * 2;
      const d = C.dist[0] + ((k * 7) % 11) / 10 * (C.dist[1] - C.dist[0]);
      const x = +(Math.cos(a) * d).toFixed(2);
      const z = +(Math.sin(a) * d).toFixed(2);
      let da = Math.abs(Math.atan2(z, x) - fin) % (Math.PI * 2);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da < 0.55) continue;
      if (!ok(x, z)) continue;
      if (riverSideOf(riverSamples, x, z) !== homeSide) continue;
      if (out.some((c) => Math.hypot(c.x - x, c.z - z) < C.apart)) continue;
      placed = { id: `camp-${out.length}`, x, z };
    }
    if (!placed) break;        // the map genuinely has nowhere left: fewer camps, and `world.camps` says so
    out.push(placed);
  }
  return out;
}

// #221: WHERE THE CACHES ARE BURIED.
//
// Out past the walls, in the ground the fog is hiding. Anywhere legal -- unlike the camps, which
// want one per direction, a cache wants to be somewhere you were not going, so there is no sector
// rule here and the only spacing is `apart`, to stop two of them turning up on one walk.
//
// It asks the same `ok` the nodes and camps do, plus its own: off the roads. A cache on the castle
// road is not found, it is commuted past -- and the whole reason this exists is to give the player a
// reason to walk somewhere they did not plan to walk.
function seedCaches(seed, ok, camps) {
  const R = CFG.relics;
  const rand = rng((((seed || R.seed) * 2654435761) >>> 0) + 913);
  const out = [];
  for (let i = 0; i < R.count; i++) {
    let placed = null;
    for (let k = 0; k < 200 && !placed; k++) {
      const a = rand() * Math.PI * 2;
      const d = R.dist[0] + rand() * (R.dist[1] - R.dist[0]);
      const x = +(Math.cos(a) * d).toFixed(2);
      const z = +(Math.sin(a) * d).toFixed(2);
      if (!ok(x, z)) continue;
      // Not inside a camp's stockade. A cache a camp is standing ON would be the better game -- the
      // owner asked for exactly that, "small enemy camps that may be protecting it" -- but a chest
      // under a tent is a chest nobody can see to dig, and the fight and the dig would run into each
      // other. Beside a camp is what this gives, and the camp is still the thing in the way.
      if (camps.some((c) => Math.hypot(c.x - x, c.z - z) < CFG.camps.radius + 4)) continue;
      if (out.some((c) => Math.hypot(c.x - x, c.z - z) < R.apart)) continue;
      placed = { id: `cache-${i}`, x, z };
    }
    if (placed) out.push(placed);
  }
  return out;
}

function hashType(t) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return h % 9973;
}

// Which bank a point is on, before the world object exists to ask. `nearestOnPolyline` gives the
// nearest SEGMENT and its distance and no more, so the sign test is done here -- the same cross
// product `world.riverInfo` uses, kept identical on purpose: a node judged to be across the water by
// one rule and walked to by the other is a diamond seam nobody can reach.
function riverSideOf(samples, x, z) {
  const n = nearestOnPolyline(samples, x, z);
  const a = samples[Math.max(0, n.i - 1)];
  const b = samples[Math.min(samples.length - 1, n.i + 1)];
  const q = samples[n.i];
  return Math.sign((b.x - a.x) * (z - q.z) - (b.z - a.z) * (x - q.x)) || 1;
}

export function buildWorld(scene, soleShadows = false, seed = 0) {
  const size = CFG.world.size;
  const rand = rng(1337);
  const world = { seed, river: null, bridges: [], crossings: [], roads: [], paths: [], fields: [], foam: [], time: 0, sway: { value: 0 }, flowerSpots: [], focus: new THREE.Vector3() };
  setSwayUniform(world.sway);
  // #200: the feet the grass parts around, shared the way the sway uniform is. Parked far away so a
  // world with nothing walking in it displaces nothing; the game writes into these vectors in place
  // rather than replacing the array, because the shader holds the same objects.
  world.feet = { value: new Array(FEET_SLOTS).fill(0).map(() => new THREE.Vector3(9999, 0, 9999)) };
  setFeetUniform(world.feet);

  // ---- ground ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: groundTexture(), color: 0xffffff, roughness: 1 }));
  world.groundMat = ground.material;
  breakTiling(ground.material);
  // #185: and banded, AFTER the untile hook rather than instead of it -- `band` chains whatever
  // `onBeforeCompile` is already there and appends to the cache key, so this material compiles as
  // 'ground-untiled-patched+band'. The ground goes first and the tufts follow it: if the ground is
  // banded and the grass is not, the grass reads as stuck on rather than growing out of it.
  band(ground.material);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- river ----
  const riverSamples = spline(MAP.river.points, 160);
  world.river = { samples: riverSamples, halfWidth: MAP.river.halfWidth };
  scene.add(ribbon(riverSamples, MAP.river.halfWidth * 2 + 2.6, 0xd8cc9d, 0.012, { wobble: 0.1 }));
  const waterTex = waterTexture();
  // #186: deliberately not banded by the LAND's hook, which quantises by light angle. The river gets
  // its own, by distance across the channel, in `riverWater` below -- and keeps the key so the band
  // sweep can name it rather than reporting an anonymous white surface.
  const waterMat = new THREE.MeshStandardMaterial({ map: waterTex, color: 0xffffff, roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide });
  riverWater(waterMat, world);
  scene.add(ribbon(riverSamples, MAP.river.halfWidth * 2, 0x3d9bd4, 0.02, { material: waterMat }));
  world.waterTex = waterTex;
  // pebbles along both banks
  const pebbleGeo = new THREE.DodecahedronGeometry(0.22, 0);
  const pebbles = new THREE.InstancedMesh(pebbleGeo, matFlat(0xb0a18d, { banded: true }), 240);
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
  // #186: banded like everything else it runs through. The bands touch the DIFFUSE term only, so the
  // vertex alpha that fades the verge into the grass is untouched, and so is `renderOrder` -- a road
  // still draws under the contact shadows. Its own instance, so nothing else shares this.
  const roadMat = band(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, transparent: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
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
    const stones = new THREE.InstancedMesh(stoneGeo, matFlat(0xc4b49b, { banded: true }), STONES);
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
  // #218: and so does every small camp's, once they are seeded below. `world.camps` does not exist
  // yet when the node generator asks this, which is exactly right -- a node is allowed where a camp
  // has not been put yet, and the camps are placed against the nodes rather than the other way
  // round. By the time the scatter asks, the list is there.
  const inCamp = (x, z) => Math.hypot(x - CFG.finale.pos[0], z - CFG.finale.pos[1]) < CFG.finale.radius + 3
    || (world.camps || []).some((c) => Math.hypot(x - c.x, z - c.z) < CFG.camps.radius + 3)
    // #221: AND A CACHE'S PATCH OF GROUND. Caught by looking at one rather than by reasoning: the
    // first cache rendered had a tree growing out of it. Trunks are solid since #215, so a tree on a
    // cache is a chest you cannot stand on to dig -- and the chest is a small prop in tall grass, so
    // a canopy over it is also a chest you cannot see. 4 is the dig radius plus the King's own room
    // to stand.
    || (world.caches || []).some((c) => Math.hypot(x - c.x, z - c.z) < 4);
  const free = (x, z, m = 1.5) => !inVillage(x, z) && !inCliffs(x, z) && !inCamp(x, z) && !nearRiver(x, z, m + 1.5) && !nearRoad(x, z, m) && !nearNode(x, z);
  world.free = free;
  // The citadel is the ring the Keep and the three service buildings stand in -- packed, paved and
  // walked over all game. Grass is kept out of it (see below) and so is a seam: a node that spawned
  // under the Keep would be unreachable, and one on the ring road would be mined through a wall.
  const citadel = TIERS[0].ring;
  const inCitadel = (x, z) => Math.hypot(x - citadel.x, z - citadel.z) < citadel.r + 2;
  // and off the mats, which carry a name and a price. `spend.padSize` is 3.6 across, so 2.6 keeps a
  // blade of grass out of the lettering. A NODE needs more than a blade does -- see `padClear`.
  const nearPad = (x, z) => PADS.some((p) => Math.abs(p.pos[0] - x) < 2.6 && Math.abs(p.pos[1] - z) < 2.6);

  // #219: THE NODES ARE SEEDED HERE, and here is the only place they can be.
  //
  // The validators this needs all exist at this point and nowhere else: the river has been sampled,
  // the roads are laid, the pads are known, and `inCliffs` is the box the King is pushed out of and
  // cannot mine in. A generator that lived in config.js would have to re-derive every one of them
  // and would drift from the real ones the first time a road moved.
  //
  // It runs BEFORE the scatter on purpose. `free` asks `nearNode`, so trees and rocks are kept off
  // the nodes -- and since #215 made trunks solid, a tree standing on a seam would be a seam nobody
  // can reach. Seeding after the scatter would do exactly that.
  //
  // NOT `free`. `free` opens with `!inVillage`, which is the outer tier's 82-by-70 footprint, and a
  // resource node is allowed inside that -- the shipped wood sits at (-11, 22) and (-15, -15), well
  // within it, because wood is meant to be a few steps from the gate. Asking `free` made the
  // generator reject every wood and stone candidate and fall back to the hand-placed list on all ten
  // test seeds: legal, and completely unseeded. What a NODE has to dodge is the citadel the buildings
  // stand in, the mats, the roads, the river, the camp and the cliff box -- not the whole village.
  //
  // AND NOT `nearPad` EITHER, which is the grass rule: 2.6, sized to keep a blade out of the
  // lettering. A node is not a blade. Measured off the real meshes in a browser, the widest node --
  // wood -- spans 1.93 from its own centre, against a mat's half of 1.8 (`spend.padSize` 3.6), so
  // 3.7 between centres is the first distance at which no part of a seam is over a mat the player
  // has to read and tap. The shipped wood sits 2.5 from the `crown` pad and does overlap it; that is
  // a fact about the hand-placed layout, not a licence for the generator to repeat it.
  const padClear = (x, z) => !PADS.some((p) => Math.abs(p.pos[0] - x) < 3.7 && Math.abs(p.pos[1] - z) < 3.7);
  const nodeOk = (x, z) => !inCliffs(x, z) && !inCamp(x, z) && !nearRiver(x, z, 3)
    && !nearRoad(x, z, 2.5) && padClear(x, z) && !inCitadel(x, z);
  // Which materials this seed actually generated, and which kept their hand-placed nodes. On the
  // world object because a fallback that leaves no trace is one nobody ever notices has become the
  // normal case -- `tools/seeds/seeds.mjs` reads it, and so can a console.
  world.seededNodes = seedNodes(world.seed, riverSamples, nodeOk, inCliffs);

  // #218: and the raider camps, on the same ground rules plus their own. `campOk` is `nodeOk` with
  // the camp's whole clearing given room rather than its centre point: a camp is 5.2 across and a
  // seam or a road through the middle of one is a fight in a corridor.
  const campOk = (x, z) => {
    const R = CFG.camps.radius;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (!nodeOk(x + Math.cos(a) * R, z + Math.sin(a) * R)) return false;
    }
    return nodeOk(x, z);
  };
  world.camps = seedCamps(world.seed, riverSamples, campOk, riverSideOf(riverSamples, 0, 8));

  // #221: and the caches, which want the same clear ground a node does plus a wider berth from the
  // roads. `nearRoad` at 4 rather than `nodeOk`'s 2.5: a seam beside a track is a quarry you pass;
  // a chest beside one is a chest you would have tripped over on your way to work.
  const cacheOk = (x, z) => nodeOk(x, z) && !nearRoad(x, z, 4) && !inVillage(x, z);
  world.caches = seedCaches(world.seed, cacheOk, world.camps);

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
  // -- `inCitadel` and `nearPad` are up with the placement helpers, because #219's node generator
  // asks them too and runs before this.
  // #180: grass creeps into the verge. It used to stop 0.5 short of the road on both sides, which
  // drew a ruled line of bare dirt against a ruled line of grass -- the hard edge the ticket is
  // about. Now a tuft is placed by how far into the verge it would stand: sure of a place a unit out
  // from the edge, thinning to nothing 0.3 inside it. On a trail a few stand on the road itself,
  // which is what "grass growing through" is. The road's own half-width at that spot, not
  // `MAP.roadWidth`, because a trail is narrower and its verge is where the wander is.
  //
  // #191: the roll is the CELL's rng rather than the world's, so a verge is the same verge every time
  // he walks back to it. Everything else `grassFree` asks is a fixed fact about the point -- the
  // roads all exist from the first frame whether or not they have been revealed -- which is what
  // makes a cell's placement cacheable at all.
  const roadOk = (x, z, r) => {
    let best = Infinity;
    let h = MAP.roadWidth / 2;
    let k = 0;
    for (const rd of world.roads) {
      const q = nearestOnPolyline(rd.samples, x, z);
      if (q.d < best) { best = q.d; h = rd.half[q.i]; k = rd.kind[q.i]; }
    }
    if (best >= h + 1.0) return true;
    if (best < h - 0.3) return k > 0.5 && r() < 0.07;
    return r() < (best - (h - 0.3)) / 1.3;
  };
  // #191: and its own margin around a node and a field, for the same reason the roads have one. A
  // tree or a rock needs 4.5 of clearance and a wheat field needs three more than its own size,
  // because the King has to be able to stand at one and swing -- but grass held that far off drew a
  // bald ring round every node and a bald border round every farm, which at this density is the one
  // thing in an open field you cannot help looking at. Grass growing up to a fence is what a farm in
  // a field looks like; 2.2 round a node still leaves the rock standing on bare earth.
  const grassNode = (x, z) => NODES.some((n) => Math.hypot(n.pos[0] - x, n.pos[1] - z) < 2.2)
    || MAP.fields.some((f) => Math.abs(f.pos[0] - x) < f.size[0] / 2 + 0.6 && Math.abs(f.pos[1] - z) < f.size[1] / 2 + 0.6);
  const grassFree = (x, z, r) => !inCitadel(x, z) && !inCliffs(x, z) && !inCamp(x, z)
    && !nearRiver(x, z, 1.2) && roadOk(x, z, r) && !grassNode(x, z) && !nearPad(x, z);
  const half = size / 2 - 6;
  const scenery = new THREE.Group();
  // #215: every solid thing on the map, as {x, z, r}. Filled by the scatter below, bucketed at the
  // end of it -- see the note there for why it has to be captured rather than asked for.
  const solids = [];
  // #219: THE SCATTER GETS ITS OWN STREAM, and at seed 0 that stream IS the world's.
  //
  // The ticket asks for the forests and boulder fields to move with the map, not just the nodes --
  // and everything below this point drew from `rand`, the one stream `buildWorld` runs on from top
  // to bottom. Re-seeding that stream would have moved the roads and the river's wander, which the
  // ticket puts firmly on the "stays exactly where it is" side.
  //
  // So the scatter draws from its own. `seed ? rng(...) : rand` is not a shortcut: at seed 0 this is
  // literally the same generator object, consumed in the same order, so `?seed=0` -- every `?view=`,
  // `?tour`, the checks and the probe -- builds the identical world it always has, down to the
  // number. At any other seed the scatter takes its numbers from here instead, which also means the
  // lanterns and the flowers laid out after it no longer line up with seed 0's. They are decoration
  // and they are allowed to move; the roads, the river and the plot were all laid before this line.
  const srand = seed ? rng(((seed * 2654435761) >>> 0) + 17) : rand;

  // CLUMPED, like the grass and the trees, and for the same reason: uniform random gives every square
  // metre the same amount of everything, which is the one thing real ground never does. `patches` is
  // how many centres to scatter and `spread` how far from one a thing may land; a quarter of them
  // still go loose, so the ground between clumps is not bald.
  const patchSets = new Map();
  const patchesFor = (n) => {
    if (!patchSets.has(n)) {
      const list = [];
      for (let i = 0; i < n; i++) list.push([(srand() * 2 - 1) * half, (srand() * 2 - 1) * half]);
      patchSets.set(n, list);
    }
    return patchSets.get(n);
  };
  const place = (maker, count, margin = 1.5, minDist = 0, clump = null) => {
    let tries = 0;
    for (let i = 0; i < count && tries < count * 40; tries++) {
      let x;
      let z;
      if (clump && srand() < 0.75) {
        const [px, pz] = patchesFor(clump.patches)[(srand() * clump.patches) | 0];
        const a = srand() * Math.PI * 2;
        const d = (srand() ** 0.6) * clump.spread;
        x = px + Math.cos(a) * d;
        z = pz + Math.sin(a) * d;
        if (Math.abs(x) > half || Math.abs(z) > half) continue;
      } else {
        x = (srand() * 2 - 1) * half;
        z = (srand() * 2 - 1) * half;
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
  for (let i = 0; i < 22; i++) clumps.push([(srand() * 2 - 1) * half, (srand() * 2 - 1) * half]);
  let placedTrees = 0;
  for (const [cx, cz] of clumps) {
    for (let k = 0; k < 13; k++) {
      // denser at the heart of a wood than at its edge, so it has a shape rather than a boundary
      const a = srand() * Math.PI * 2;
      const d = (srand() ** 0.65) * 10;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (Math.abs(x) > half || Math.abs(z) > half || !free(x, z, 1.4)) continue;
      const sc = 0.75 + srand() * 0.85;
      const t = makeTree(sc);
      t.position.set(x, 0, z);
      scenery.add(t);
      solids.push({ x, z, r: 0.26 * sc });   // #215: the trunk, same number as below
      placedTrees++;
    }
  }
  // #215: SOLID THINGS ARE RECORDED AS THEY ARE SCATTERED, because in a moment they stop existing.
  //
  // `mergeGroup(scenery)` below collapses every tree, rock and barricade into a handful of meshes
  // per material and per 30-unit cell -- which is exactly why the map can afford 660 of them, and
  // exactly why there is nothing left to ask "where are you" at runtime. So the answer is taken
  // here, where it is still known, and kept in a flat list the game owns.
  //
  // `place` already hands the maker its x and z, so this costs no change to the scatter itself.
  //
  // WHICH ONES ARE SOLID is a feel question and this is the ticket's own reading of it: a trunk and
  // a rock are things you walk into, a bush is something you push through and a hay bale is
  // something you walk round because you can see it. Spikes are a barricade and being stopped is
  // the entire point of them.
  //
  // The radii are measured off the models rather than guessed. A trunk is `CylinderGeometry(0.16,
  // 0.26)` under `g.scale.setScalar(scale)`, so 0.26 at the base times its own scale -- the TRUNK
  // and not the canopy, so a wood is walkable and the trees in it are not. A rock is a
  // dodecahedron of 0.55 scaled by 1.2 across, so 0.66 times its scale. Spikes are a 2.6-long beam
  // rather than a disc at all, and 1.1 is the compromise: it blocks the middle and leaves the last
  // 0.2 of each end passable, which is a barricade somebody can just get round the end of.
  const TRUNK_R = 0.26;
  const ROCK_R = 0.66;
  const SPIKE_R = 1.1;
  place((x, z) => {
    const sc = 0.9 + srand() * 0.5;
    solids.push({ x, z, r: TRUNK_R * sc });
    return makeTree(sc);
  }, Math.max(0, 210 - placedTrees), 1.6);
  place(() => makeBush(), 230, 0.9, 0, { patches: 70, spread: 7 });
  place((x, z) => {
    const sc = 0.55 + srand() * 1.1;
    solids.push({ x, z, r: ROCK_R * sc });
    return makeRock(sc);
  }, 150, 0.9, 0, { patches: 55, spread: 6 });
  place((x, z) => {
    const s = makeSpikes();
    s.rotation.y = srand() * Math.PI;
    solids.push({ x, z, r: SPIKE_R });
    return s;
  }, 55, 1.5, 0, { patches: 26, spread: 5 });
  place(() => makeHayBale(), 16, 1);

  // #212: LANTERNS, ROUND THE VILLAGE, LIT BY THE SKY.
  //
  // Nightfall used to be the same field with the lights turned down. These give it somewhere people
  // live: a ring of posts just inside the tier-0 wall, at the radius the huts and the Keep sit
  // within, so the light is around the part of the map that is a home rather than scattered over
  // the country.
  //
  // They are NOT lights -- see `makeLantern`. Every flame in the game shares one material and
  // `updateDaylight` sets its `emissiveIntensity` once a frame, so the whole village comes up
  // through dusk in a single assignment and costs the phone nothing per lantern.
  //
  // A LANTERN GETS ITS OWN RULE, for the same reason grass does just below -- and this was written
  // asking `free`, which placed exactly ZERO of the fourteen. `free` opens with `!inVillage`, and
  // `inVillage` is the outer tier's footprint: an 82 by 70 rectangle that contains this whole ring.
  // Every post was rejected on the first clause, silently, and nightfall got its lanterns from the
  // torches alone. Measured, not reasoned about: a traverse of the built scene for meshes sharing
  // `LANTERN_FLAME` found one, and it was the torch field.
  //
  // `inCitadel` is no good either, and for a more interesting reason than a bad radius. The citadel
  // is excluded from GRASS because it is "packed, paved and walked over all game" -- which is the
  // argument FOR putting a lamp there. A street light stands on the paved part. So what a post has
  // to dodge is not a kind of ground, it is the things that occupy ground: a build mat, a road, the
  // river, a resource node, and a building's own footprint. That last one `free` never checked,
  // because nothing else placed here stands where a building will.
  //
  // Margins are tight on purpose. 1.0 off a road is a lamp AT the roadside rather than in a field
  // near one, and 0.6 of air around a footprint is close enough to read as the building's own light.
  const onBuild = (x, z) => PADS.some((p) => {
    const f = p.structure && CFG.footprint[p.structure];
    if (!f || !p.buildAt) return false;
    return Math.abs(p.buildAt[0] - x) < f[0] / 2 + 0.6 && Math.abs(p.buildAt[1] - z) < f[1] / 2 + 0.6;
  });
  //
  // And a lamp keeps clear of the lamps already standing. Without that, the sideways search below
  // makes things WORSE than the gaps it is there to close: two neighbours blocked by the same road
  // both step toward the same free ground and end up 0.05 radians apart -- under a unit, at this
  // radius -- while the arc they were meant to cover stays dark. Even spacing is about 7.4 apart, so
  // 4 leaves room to nudge and still forbids a pair.
  const lamps = [];
  const lampClear = (x, z) => !nearRiver(x, z, 1.2) && !nearRoad(x, z, 1.0)
    && !nearNode(x, z) && !nearPad(x, z) && !onBuild(x, z)
    && !lamps.some((l) => Math.hypot(l[0] - x, l[1] - z) < 4);
  // A post that cannot stand at its own angle steps ALONG the ring before it gives up, because the
  // ring is the point: two gaps in a row read as lanterns somebody forgot rather than as a village.
  // Retrying on radius alone was tried first and rescued none of the five gaps, which makes sense
  // once you see what blocks a post -- mostly the road, and the road runs radially, so walking out
  // from a blocked spot walks further down the same road. Stepping sideways leaves it. Radius is
  // still jittered with it so the ring is a ring of lamps rather than a surveyed circle.
  for (let i = 0; i < 14; i++) {
    const a0 = (i / 14) * Math.PI * 2 + 0.22;
    let x = 0, z = 0, ok = false;
    for (let k = 0; k < 9 && !ok; k++) {
      // 0, +0.10, -0.10, +0.20, -0.20 ... radians: a sixth of the gap to the next post at the widest,
      // so a nudged lamp is still plainly at its own station and never crowds its neighbour.
      const a2 = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.10;
      const rr = 15.5 + rand() * 1.6 + (k > 4 ? 1.8 : 0);
      x = Math.cos(a2) * rr;
      z = Math.sin(a2) * rr;
      ok = lampClear(x, z);
    }
    // Nine of the fourteen stations take a lamp, and the five that do not were checked rather than
    // shrugged at: one is a building's footprint, three are build mats, and one is the road leaving
    // the village due north. That is real ground, not a bad margin -- so the ring is broken where the
    // mats and the main road are, which is where a village's lamps would be missing anyway.
    if (!ok) continue;
    lamps.push([x, z]);
    const l = makeLantern();
    l.position.set(x, 0, z);
    l.rotation.y = rand() * Math.PI * 2;
    scenery.add(l);
  }

  // #210: THE EDGE OF THE KINGDOM, NOT THE EDGE OF THE MAP.
  //
  // Reported as "you shouldn't feel like you've come to the edge of the game", and measuring for
  // #211 found what that is: the King is clamped at `world.size / 2 - 3`, so he could walk to +/-92
  // -- fifty units past the tier-3 ring at +/-38, across bare ground, until an invisible wall stopped
  // him. Nothing was out there. The wall was the only thing that said "stop".
  //
  // So the band just past where he stops is filled with rock and wood, thick enough to read as
  // country he cannot go through. `CFG.world.edge` is where he stops now, and the band starts one
  // unit past it, so what he runs into is a wall he can see rather than one he discovers.
  //
  // WHY IT IS A BAND OUTSIDE HIM AND NOT A COLLIDER ROUND HIM: two game rules already live on this
  // line and both would break if the perimeter genuinely stopped everybody.
  //
  //   Wren carried off the map IS the defeat -- `updateTaken` fires `gameOver('taken')` at
  //   `size / 2 - 4`, so the escorts have to be able to reach +/-90.5 and walk out. They are not
  //   clamped, so they still can: they carry her into the trees and out of the world, which reads
  //   better than the bare ground they used to vanish over.
  //   The camp is at (-4, -74) with a radius of 9, so the march on it reaches z = -83. The edge has
  //   to sit outside that or the finale is unreachable -- which is the expensive, quiet way to get
  //   this wrong, since nothing would say so until somebody played to night 30.
  //
  // `free` is what keeps the roads and the river open through it: a road that ends in a cliff face
  // is the same complaint in a different place, and the river is already a way out of the world.
  const edge = CFG.world.edge;
  const bandIn = edge + 1;
  const bandOut = size / 2 - 1;
  const onBand = (fn, count, margin) => {
    for (let i = 0, tries = 0; i < count && tries < count * 30; tries++) {
      // uniform along one of the four sides, then in across the band's depth
      const side = (rand() * 4) | 0;
      const along = (rand() * 2 - 1) * bandOut;
      const into = bandIn + rand() * (bandOut - bandIn);
      const x = side === 0 ? along : side === 1 ? along : side === 2 ? -into : into;
      const z = side === 0 ? -into : side === 1 ? into : along;
      if (!free(x, z, margin)) continue;
      const o = fn();
      o.position.set(x, 0, z);
      scenery.add(o);
      i++;
    }
  };
  // WOOD, NOT ROCK, and that was measured rather than chosen. The band is about four units deep --
  // it cannot start before the line Wren is carried over and cannot end past the ground -- and
  // `makeCliff` is seven to sixteen units WIDE, so a cliff centred in it reaches back to 83 and the
  // King ends up clamped inside a mesa. Driven, and he was: standing in rock at (90, 10).
  //
  // A tree is about a unit across and fits. So the edge is the thick forest the report asks for,
  // packed at roughly six times the density of the open ground, with undergrowth under it so the
  // line reads as one mass rather than a row of separate trunks. Cliffs close the north-west corner
  // already and the river closes the east; this is the rest of it.
  onBand(() => makeTree(1.0 + rand() * 0.9), 420, 1.0);
  onBand(() => makeBush(), 260, 0.7);

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
  // #200: the tufts are the set that notices feet, and the wheat is not. A field is walked past; the
  // lawn the King is standing on is walked THROUGH, and the loop is paid for per vertex on whichever
  // set opts in. The key moves with it -- `bands-hooked` matches on the prefix, so it still finds
  // this material, and the wheat's plain 'sway' can no longer collide with it.
  const tufts = new THREE.InstancedMesh(tuftGeo, swayMaterial(0xffffff, { feet: true }), TUFTS);
  tufts.material.vertexColors = true;   // #162: the root darkening above
  tufts.material.customProgramCacheKey = () => 'sway-tinted-rooted-feet';
  // #185: the same bands as the ground, from the same uniforms, so the two surfaces step together.
  // `band` chains the sway hook rather than replacing it, and the key becomes
  // 'sway-tinted-rooted+band'. The wheat's `swayMaterial` is a different instance and is untouched:
  // that is #186's, along with the trees, rocks and roads.
  band(tufts.material);
  // #191: built rather than grown by `setColorAt`, because the window writes whole cells into the
  // array at once and there is no first call to allocate it.
  tufts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TUFTS * 3), 3);
  // Flowers carry more of the lushness than their number suggests, so there are four times as many
  // and each is cheaper: 5 by 3 segments is 20 triangles against the old 6 by 5's 48, and at this
  // size nobody has ever counted the facets on a daisy.
  const flowerGeo = new THREE.SphereGeometry(0.12, 5, 3);
  const flowerColors = [0xffffff, 0xffd54a, 0xff8aa8];
  const FLOWERS = 300;
  const flowers = flowerColors.map((c) => new THREE.InstancedMesh(flowerGeo, mat(c, { banded: true }), FLOWERS));
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
  const clovers = new THREE.InstancedMesh(cloverGeo, matFlat(0x3f8a34, { banded: true }), CLOVER);
  const fieldStoneGeo = new THREE.IcosahedronGeometry(0.17, 0);
  fieldStoneGeo.scale(1, 0.5, 1);
  const FIELD_STONES = 320;
  const fieldStones = new THREE.InstancedMesh(fieldStoneGeo, matFlat(0xa8987f, { banded: true }), FIELD_STONES);

  // ---- #191: the ground cover follows the King ----
  //
  // THE COUNT WAS NEVER THE WHOLE ANSWER and this is the other half of it. 9,000 three-blade tufts on
  // flat ground read as a lawn with things stuck in it, which is why the ground texture and its
  // speckle carry most of the coverage (#162) and the tufts supply silhouette. But the tufts were
  // spread over the MAP and the player looks at a FRAME: 13,000 over 190 x 190 is one every 1.6
  // units, and an open field came out as countable objects with bare ground between them. Raising the
  // number cannot fix it -- at 21 triangles a clump, the density that closes the gaps map-wide is
  // several times the triangle budget, and it would be spent almost entirely on ground nobody sees.
  //
  // So the same 13,000 live in a window of cells around him (`CFG.ground`), and the far field has
  // none. Same count, same 273k triangles, same one draw call each, about six times the density
  // where he is standing.
  //
  // HOW A CELL STAYS THE SAME FIELD. Every cell is placed from an rng seeded by its own coordinates,
  // so walking away and back finds the same tufts in the same spots; the result is cached, so the
  // work is done once per cell per run. `grassFree` is a pure function of a point -- the roads, the
  // river, the cliffs, the camp, the nodes and the mats are all fixed for the run, and a road being
  // REVEALED does not move it -- which is what makes caching sound.
  //
  // HOW THE EDGE HIDES. Cells are written nearest-first and each takes only a fraction of what it
  // holds, tapering from full inside `full` of the radius to `edge` at the rim, so there is no line
  // where grass stops. Writing nearest-first also gives adaptive quality (#168) the right thing for
  // free: `count` truncates the buffer, so thinning drops the farthest cells rather than a random
  // scatter, and the ground he is standing on keeps its grass at every tier.
  //
  // WHAT IS NOT IN HERE. The ground texture underneath (`groundTexture`, `breakTiling`) is the layer
  // that has to carry the gaps this cannot close, and it is a separate ticket (#192).
  const G = CFG.ground;
  const CELL = G.cell;
  const m4 = new THREE.Matrix4();   // scratch, shared with the river foam below
  // The meshes, in the order a cell writes them. Flowers are three meshes off one placement pass: a
  // tuft rolls for one, so a flower is always standing in grass rather than alone on the dirt.
  const COVER = [
    { mesh: tufts, cap: TUFTS, tint: true },
    { mesh: clovers, cap: CLOVER },
    { mesh: flowers[0], cap: FLOWERS },
    { mesh: flowers[1], cap: FLOWERS },
    { mesh: flowers[2], cap: FLOWERS },
    { mesh: fieldStones, cap: FIELD_STONES },
  ];
  for (const c of COVER) {
    c.mesh.count = 0;
    c.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // #193: the cover RECEIVES, and it did not before. A cast shadow lands on the ground, and since
    // #191 the ground under the King is covered in grass -- so the mesa's shadow fell across a field
    // of blades that were all still in full sun, which reads as a stain rather than as shade. It does
    // not CAST: 13,000 instances through the depth pass is the one shadow cost that would not be
    // affordable, and a tuft's own shadow is noise at this size.
    c.mesh.receiveShadow = true;
    // The window moves with him, so a bounding sphere computed once would be wrong a second later --
    // and these are centred on the camera by construction, so there is never anything to cull.
    c.mesh.frustumCulled = false;
  }
  // full inside `full` of the radius, then a smoothstep down to `edge` at the rim
  const ringWeight = (d, R) => {
    const t = (d - R * G.full) / Math.max(0.001, R * (1 - G.full));
    if (t <= 0) return 1;
    const s = Math.min(1, t);
    return 1 - (1 - G.edge) * (s * s * (3 - 2 * s));
  };
  const windowWeight = (R) => {
    let w = 0;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) w += ringWeight(Math.max(Math.abs(dx), Math.abs(dz)), R);
    return w;
  };
  // What one cell holds at full density: the whole budget divided by the window's weight. Cached
  // cells are always filled to THIS, so a wider window (`setGrassWindow`, for the board's map view)
  // only ever takes a shorter prefix of a cell it already has.
  const fullWeight = windowWeight(G.radius);
  // Clover and stones come in one group per cell and only some cells have one, so a cell that does
  // has to hold the whole budget's share of the cells that do not. Flowers are rolled off the tufts
  // rather than budgeted, so theirs is what that roll produces with room not to clip the tail.
  const perCell = [Math.ceil(TUFTS * G.fill / fullWeight), Math.ceil(CLOVER * G.fill / fullWeight / G.cloverChance), 0, 0, 0, Math.ceil(FIELD_STONES * G.fill / fullWeight / G.stoneChance)];
  perCell[2] = perCell[3] = perCell[4] = Math.ceil(perCell[0] * G.flowerChance) + 3;
  let winR = G.radius;
  let density = 1;
  let order = [];
  const buildOrder = () => {
    order = [];
    for (let dx = -winR; dx <= winR; dx++) {
      for (let dz = -winR; dz <= winR; dz++) order.push([dx, dz, ringWeight(Math.max(Math.abs(dx), Math.abs(dz)), winR), dx * dx + dz * dz]);
    }
    // by distance rather than by ring, so `count` truncation leaves a disc of grass around him
    order.sort((a, b) => a[3] - b[3]);
  };
  buildOrder();

  // One cell's placements, packed as instance matrices ready to memcpy. A cell runs to about 10 kB
  // and the window is 169 of them, so the cap holds the whole of what is on screen with room to spare
  // and the eviction below only throws away country he left. It is least-recently-used -- a hit moves
  // the cell back to the end of the Map, which keeps insertion order meaning what the eviction needs
  // it to mean -- so nothing in view can be dropped however he walks. The board's map view is the one
  // caller that asks for more cells than the cap holds; it pays about 250 ms once, on a frame that
  // then never moves.
  const cells = new Map();
  const CELL_CACHE = 240;
  const cm = new THREE.Matrix4();
  const cv = new THREE.Vector3();
  const cc = new THREE.Color();
  function fillCell(cx, cz) {
    const key = cx * 8192 + cz;
    const had = cells.get(key);
    if (had) {
      cells.delete(key);
      cells.set(key, had);
      return had;
    }
    // deterministic per cell, and its own stream: the world's `rand` must not depend on where anybody
    // has walked, or a run would build a different map every time
    const r = rng((((cx * 73856093) ^ (cz * 19349663)) >>> 0) + 1);
    const x0 = cx * CELL;
    const z0 = cz * CELL;
    const c = { m: COVER.map((v, i) => new Float32Array(perCell[i] * 16)), tint: new Float32Array(perCell[0] * 3), n: [0, 0, 0, 0, 0, 0] };
    const put = (i, x, y, z, rotY, sx, sy, sz) => {
      if (c.n[i] >= perCell[i]) return false;
      cm.makeRotationY(rotY);
      cm.scale(cv.set(sx, sy, sz));
      cm.setPosition(x, y, z);
      cm.toArray(c.m[i], c.n[i] * 16);
      c.n[i]++;
      return true;
    };
    // ---- tufts, clumped around two centres of this cell's own
    const px = [];
    for (let i = 0; i < G.patches; i++) px.push([x0 + r() * CELL, z0 + r() * CELL]);
    for (let tries = 0; tries < perCell[0] * 5 && c.n[0] < perCell[0]; tries++) {
      let x;
      let z;
      if (r() < G.clumped) {
        const [ax, az] = px[(r() * px.length) | 0];
        const a = r() * Math.PI * 2;
        // the 0.55 power pulls them toward the middle, so a patch has a dense heart and a soft edge
        const d = (r() ** 0.55) * G.spread;
        x = ax + Math.cos(a) * d;
        z = az + Math.sin(a) * d;
      } else {
        x = x0 + r() * CELL;
        z = z0 + r() * CELL;
      }
      if (Math.abs(x) > half || Math.abs(z) > half || !grassFree(x, z, r)) continue;
      // Width as well as height. It varied in height alone before, which gives every tuft in the world
      // the same footprint and a different stature -- oddly uniform from above, which is the angle this
      // game is played at. Width and depth move together so a clump stays a clump rather than an oval.
      const wide = 0.82 + r() * 0.42;
      const at = c.n[0];
      if (!put(0, x, 0, z, r() * Math.PI, wide, 0.8 + r() * 0.6, wide)) break;
      // Its own green. Hue is the one that does the work -- 84 to 100 degrees, so a patch reads as
      // several kinds of grass rather than one repeated -- with saturation and lightness widening it
      // enough that no two neighbours match. The base is the old flat 0x88bd5a: hue 92, sat 43, light 55.
      cc.setHSL(
        0.2559 + (r() - 0.5) * 0.044,
        Math.min(1, Math.max(0, 0.429 + (r() - 0.5) * 0.12)),
        Math.min(0.92, Math.max(0.05, 0.547 + (r() - 0.5) * 0.22)),
        THREE.SRGBColorSpace,
      );
      c.tint[at * 3] = cc.r;
      c.tint[at * 3 + 1] = cc.g;
      c.tint[at * 3 + 2] = cc.b;
      if (r() < G.flowerChance) put(2 + ((r() * 3) | 0), x + 0.4, 0.3, z + 0.2, 0, 1, 1, 1);
    }
    // ---- clover: one tight patch, in half the cells
    if (r() < G.cloverChance) {
      const ax = x0 + r() * CELL;
      const az = z0 + r() * CELL;
      for (let tries = 0; tries < perCell[1] * 4 && c.n[1] < perCell[1]; tries++) {
        const a = r() * Math.PI * 2;
        const d = (r() ** 0.5) * G.cloverSpread;
        const x = ax + Math.cos(a) * d;
        const z = az + Math.sin(a) * d;
        if (Math.abs(x) > half || Math.abs(z) > half || !grassFree(x, z, r)) continue;
        const s = 0.8 + r() * 0.5;
        put(1, x, 0, z, r() * Math.PI * 2, s, s, s);
      }
    }
    // ---- field stones: one group, in two cells out of five
    if (r() < G.stoneChance) {
      const ax = x0 + r() * CELL;
      const az = z0 + r() * CELL;
      for (let tries = 0; tries < perCell[5] * 4 && c.n[5] < perCell[5]; tries++) {
        const a = r() * Math.PI * 2;
        const d = (r() ** 0.6) * G.stoneSpread;
        const x = ax + Math.cos(a) * d;
        const z = az + Math.sin(a) * d;
        if (Math.abs(x) > half || Math.abs(z) > half || !grassFree(x, z, r)) continue;
        put(5, x, 0.04, z, r() * Math.PI, 0.6 + r() * 0.9, 0.7 + r() * 0.6, 0.6 + r() * 0.9);
      }
    }
    // trimmed to what it actually holds: a cell in the citadel or under a road keeps almost none, and
    // half of them have no clover patch at all, so the full arrays would be mostly empty
    for (let i = 0; i < 6; i++) c.m[i] = c.m[i].slice(0, c.n[i] * 16);
    c.tint = c.tint.slice(0, c.n[0] * 3);
    cells.set(key, c);
    if (cells.size > CELL_CACHE) cells.delete(cells.keys().next().value);
    return c;
  }

  // What is actually drawn, before adaptive quality thins it. Kept so `setQuality` can re-thin
  // without rewriting the buffers.
  const drawn = [0, 0, 0, 0, 0, 0];
  // hoisted out of the write loop: it runs a thousand times per crossing and a property lookup is not
  // free at that count
  const caps = COVER.map((c) => c.cap);
  const mats = COVER.map((c) => c.mesh.instanceMatrix.array);
  const tint = tufts.instanceColor.array;
  let qGrass = 1;
  let qFlowers = 1;
  let atX = 1e9;
  let atZ = 1e9;
  let pending = false;
  function writeWindow(cx, cz, budget) {
    let toFill = budget;
    pending = false;
    for (let i = 0; i < 6; i++) drawn[i] = 0;
    for (const [dx, dz, w] of order) {
      const key = (cx + dx) * 8192 + (cz + dz);
      let c = cells.get(key);
      if (!c) {
        if (toFill <= 0) { pending = true; continue; }
        c = fillCell(cx + dx, cz + dz);
        toFill--;
      }
      const f = w * density;
      for (let i = 0; i < 6; i++) {
        const n = c.n[i];
        if (!n) continue;
        const take = Math.min(n, Math.round(n * f), caps[i] - drawn[i]);
        if (take <= 0) continue;
        // A cell's arrays are trimmed to exactly what it holds, so the whole of one can go in without
        // a view -- which is the common case, because every cell inside the taper takes all of itself.
        mats[i].set(take === n ? c.m[i] : c.m[i].subarray(0, take * 16), drawn[i] * 16);
        if (i === 0) tint.set(take === n ? c.tint : c.tint.subarray(0, take * 3), drawn[i] * 3);
        drawn[i] += take;
      }
    }
    for (let i = 0; i < 6; i++) {
      const mesh = COVER[i].mesh;
      mesh.instanceMatrix.needsUpdate = true;
      if (COVER[i].tint) mesh.instanceColor.needsUpdate = true;
      mesh.count = Math.round(drawn[i] * (i >= 2 && i <= 4 ? qFlowers : qGrass));
    }
    atX = cx;
    atZ = cz;
  }
  // Called every frame from `world.update`. Nothing happens on the frames he has not crossed a cell,
  // which at 7.5 units a second is about one frame in twenty.
  world.updateCover = (x, z) => {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    if (cx === atX && cz === atZ && !pending) return;
    writeWindow(cx, cz, G.fillPerFrame);
  };
  // #178: the board's map view pulls the camera to 72 and shows the whole board at once, where a
  // window centred on the King would be a patch of grass in a bare field. A wider window at the same
  // budget is what a map should show anyway: everything, thinner. Cells already cached are reused as
  // a prefix, so this is not a second placement pass.
  world.setGrassWindow = (radiusCells) => {
    winR = radiusCells;
    density = fullWeight / windowWeight(winR);
    buildOrder();
    writeWindow(atX === 1e9 ? 0 : atX, atZ === 1e9 ? 0 : atZ, Infinity);
  };
  // #168: the dials adaptive quality turns. `count` on an instanced mesh is how many of the buffer
  // are drawn, and the window is written nearest-first, so thinning takes the FARTHEST cells away and
  // leaves the ground he is standing on alone -- which is the opposite of what it used to do, when
  // the last instances placed were a random scatter over the map. Wind is a flag read by
  // `world.update`; the contact discs are one mesh with a `visible`.
  world.setQuality = (s) => {
    qGrass = s.grass;
    qFlowers = s.flowers;
    for (let i = 0; i < 6; i++) COVER[i].mesh.count = Math.round(drawn[i] * (i >= 2 && i <= 4 ? qFlowers : qGrass));
    world.windOff = !s.wind;
    if (world.shadows) world.shadows.visible = s.shadows;
  };
  // The first window, eagerly: the world is being built, nothing is on screen yet, and this is the
  // same work the old map-wide placement did at the same moment.
  writeWindow(0, 0, Infinity);
  // #191: WHERE THE BUTTERFLIES LIVE, and it is a real decision rather than a detail. They are made
  // once and stay where they were born (#162), and their sixteen homes used to be picked from the
  // flowers -- which were scattered over the whole map, so the butterflies were too. Reading them off
  // the opening window instead put all sixteen in the village: four of them in one frame of the east
  // road against one before, which is fifteen draw calls of insects and a swarm where there was a
  // hint. So the spots are sampled over the map as they effectively were, on grass rather than on a
  // flower -- the flowers have moved into the window and a far-field one has nothing to stand on any
  // more, and at 0.13 units across, beyond the fog, nobody is checking.
  for (let tries = 0; tries < 900 && world.flowerSpots.length < 40; tries++) {
    const x = (rand() * 2 - 1) * half;
    const z = (rand() * 2 - 1) * half;
    if (grassFree(x, z, rand)) world.flowerSpots.push(new THREE.Vector3(x, 0.3, z));
  }
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
      // #193: and the strength is a setting rather than a fact, because the shadow map is now one
      // too (`CFG.shadowMap`). A disc is doing one of two jobs -- the contact darkness under a trunk
      // where the sun already casts, or the whole shadow where nothing else does -- and which of
      // those it is can change between one run and the next.
      world.setSoleShadows = (sole) => { shade.material.opacity = sole ? 0.42 : 0.2; };
    }
  }
  // #191: after the discs, not before. The pass above sizes a disc from each child's bounding box,
  // and the cover meshes are a window a hundred units across -- they were only ever skipped because
  // that is wider than the 2.6 it will draw, which is an accident to depend on.
  for (const c of COVER) scenery.add(c.mesh);

  // #215: bucket the solids before the objects they describe are merged away.
  //
  // A straight loop would be 415 of them against every mover every frame -- and there are a lot of
  // movers at once on a bad night. `updateEnemies` already solves this shape with a cell grid and
  // this is the same trick. 6 units a cell: the biggest solid is 1.1 and the biggest mover about
  // 0.6, so a 3x3 block of cells always contains everything that could possibly be touching, and at
  // 415 objects over 190x190 an average cell holds well under one.
  world.solidCell = 6;
  world.solidGrid = new Map();
  for (const o of solids) {
    const k = `${Math.floor(o.x / 6)},${Math.floor(o.z / 6)}`;
    let a = world.solidGrid.get(k);
    if (!a) world.solidGrid.set(k, (a = []));
    a.push(o);
  }
  world.solids = solids;
  mergeGroup(scenery); // trees, bushes, rocks and barricades, merged per material and per 30-unit cell
  scene.add(scenery);
  mergeGroup(cliffs);

  // ---- ambient life ----
  const life = new THREE.Group();
  scene.add(life);
  const darkMat = band(new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.9, side: THREE.DoubleSide }));
  // #195: BIRDS, and what was wrong with them.
  //
  // Forced over the village and photographed, a flock was five hard BLACK RECTANGLES lying over the
  // grass -- not "bird-shaped and too dark", rectangles. Each wing was a 0.5 x 0.22 PlaneGeometry
  // turned flat, and this camera looks down at about 49 degrees, so it sees the whole rectangle
  // face-on. In `darkMat` (0x2b2b30) that is a black bar with no highlight and nothing to read as a
  // wing. They also fly at 9-12 units with the camera at 21, which puts them BETWEEN the ground and
  // the lens: they parallax against the field instead of sitting in the sky behind it.
  //
  // Three things fix it and all three are about what the camera can actually see:
  //
  // SHAPE. A swept outline with a notch in the trailing edge rather than a rectangle. Five points and
  // three triangles a wing -- fewer than the plane it replaces once the body is trimmed -- and the
  // notch is what stops it reading as a domino at fifteen pixels across.
  //
  // VALUE. The camera sees their BACKS, and a bird's back catches the sky. Vertex-coloured along the
  // span, dark at the shoulder and pale at the tip, so a wing has a gradient across it at the size it
  // is actually seen. The old colour is kept for the body, which is the part that should stay dark.
  //
  // A SHADOW. The thing that says "that is in the air" is a mark on the ground under it, and a flock
  // gets one disc that follows it. It is what makes the parallax read as altitude rather than as a
  // shape sliding over the field.
  const birdBody = band(new THREE.MeshStandardMaterial({ color: 0x585f6a, roughness: 0.9 }));
  const birdWing = band(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true, side: THREE.DoubleSide }));
  const WING_GEO = (() => {
    // x is the span, z is the chord. Root at the shoulder, tip outboard, and the notch is the step
    // in the trailing edge between them.
    const pts = [[0.05, -0.10], [0.05, 0.09], [0.30, 0.05], [0.52, -0.02], [0.26, -0.12]];
    const tri = [[0, 1, 2], [0, 2, 3], [0, 3, 4]];
    const pos = [];
    const col = [];
    const shoulder = new THREE.Color(0x6e7682);
    const tip = new THREE.Color(0xeaeef4);
    const c = new THREE.Color();
    for (const t of tri) {
      for (const i of t) {
        const [x, z] = pts[i];
        pos.push(x, 0, z);
        c.copy(shoulder).lerp(tip, Math.min(1, (x - 0.05) / 0.47));
        col.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  })();
  // #190: ONE BODY FOR EVERY BIRD THERE WILL EVER BE, the way the wings next to it have always
  // shared theirs. This was `new THREE.SphereGeometry(0.11, 5, 4)` per bird, and a flock is removed
  // by unparenting it -- `life.remove(b)` -- which frees nothing. A geometry that has been uploaded
  // and never disposed is held by the renderer's own map for the life of the page, so every bird
  // that had crossed the sky was still resident on the GPU.
  //
  // Named by counting creation stacks up on construction and down on dispose: it is the one site
  // that grew block on block under a churn harness, 4 -> 8 -> 8 -> 12 across sixteen hundred
  // raiders. It had looked like a raider leak for exactly the wrong reason -- raiders were only what
  // was driving the clock, and `birdTimer` is what spawns on it. At a flock every 14 to 26 seconds
  // and three to five birds in each, a half-hour run on a phone leaves a few hundred behind.
  //
  // Sharing rather than disposing, because the body is the same 40-triangle sphere every time and
  // `body.scale` is set on the MESH, so nothing about a bird is in its geometry.
  const BIRD_BODY_GEO = new THREE.SphereGeometry(0.11, 5, 4);
  function makeBird() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BIRD_BODY_GEO, birdBody);
    body.scale.set(0.8, 0.6, 1.9);
    g.add(body);
    const wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const w = new THREE.Mesh(WING_GEO, birdWing);
      w.scale.x = side;          // one geometry, mirrored -- the left wing is the right one negated
      pivot.add(w);
      g.add(pivot);
      wings.push(pivot);
    }
    g.userData.wings = wings;
    return g;
  }
  // One disc a flock, not one a bird: at this height and this size the five of them read as a single
  // mark anyway, and one mesh is one draw call rather than five.
  const birdShadeMat = new THREE.MeshBasicMaterial({ color: 0x24401c, transparent: true, opacity: 0.18, depthWrite: false });
  const BIRD_SHADE_GEO = new THREE.CircleGeometry(1.15, 12);
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
    const shade = new THREE.Mesh(BIRD_SHADE_GEO, birdShadeMat);
    shade.rotation.x = -Math.PI / 2;
    shade.position.y = 0.035;      // above the ground and above the roads, under everything else
    shade.renderOrder = -1;
    life.add(shade);
    world.flocks.push({ birds, pos: start, dir, speed: 5 + rand() * 2, t: 0, shade });
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
  // #186: a key of its own, for the reason the note on `swayMaterial` gives -- without one its cache
  // key is the SOURCE of the hook below, which works but is unreadable and breaks the moment the
  // hook is edited. Not banded on purpose: a smoke puff is a soft volumetric fake and hard steps
  // across one read as a fault rather than as a style.
  smokeMat.customProgramCacheKey = () => 'smoke-alpha';
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
    world.updateCover(world.focus.x, world.focus.z);   // #191
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
        const flap = Math.sin(world.time * 7 + b.userData.phase) * 0.62;   // #195: was 12, which at this size is a blur
        b.userData.wings[0].rotation.z = flap;
        b.userData.wings[1].rotation.z = -flap;
      });
      // The disc tracks the flock on the ground and fades with height, so a flock that climbs loses
      // its mark rather than dragging a hard circle around. Nothing casts from up there -- the shadow
      // camera is a box around the King and a bird at 10 units is outside it half the time.
      fl.shade.position.set(fl.pos.x, 0.035, fl.pos.z);
      fl.shade.material.opacity = 0.2 * Math.max(0, 1 - (fl.pos.y - 8) / 9);
      if (fl.t > 16) {
        for (const b of fl.birds) life.remove(b);
        life.remove(fl.shade);
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
    if (world.riverPhase) world.riverPhase.value += dt;   // #188: the shoreline's own clock
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

  // #166: the instance counts, for the perf overlay. Pebbles and the contact discs are fixed once the
  // world is built and smoke is capped, which is the point of putting them on screen: one of those
  // moving during a run is a bug with its name on it.
  //
  // #191 took the ground cover out of that promise and it is worth saying so here rather than leaving
  // the next person to find it. Grass, clover, flowers and stones are a window around the King now,
  // so they breathe as he walks -- about 9,000 tufts in the village against 11,600 in open country,
  // because `grassFree` turns down whatever falls on a road, a mat, the citadel or the river. What
  // would be the bug is a count that climbs and never comes back down.
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
  // #187: THE RIM. A second directional light, low and behind the camera on the far side, dim and
  // cool against the sun -- it catches the far edge of a tree, a rock or a man and lifts them off the
  // ground they are standing on. One light, no shadow map, and a large part of why a stylised scene
  // reads as having depth rather than as shapes pasted on a field.
  //
  // FIXED IN WORLD SPACE, with its target left at the origin, which is all a directional light needs:
  // the camera is pinned behind the King looking north (`updateCamera`), so a world direction is a
  // camera-relative one and this does not have to follow him the way the sun does.
  //
  // IT IS ON THE FAR SIDE, and #187 suggested the near one -- "low behind the camera", (-14, 12, 30).
  // Built both and looked: a light behind the camera lights the faces TURNED TOWARD THE LENS, which
  // is a cool fill. At 0.9 it lifts the whole frame a little and separates nothing, because the
  // surfaces it brightens are the ones already facing you. An edge needs the light behind the SUBJECT,
  // grazing the faces turned away, so that what the camera catches is the lip where they turn. Same
  // light, same cost, opposite side: (-14, 9, -30). The ticket's goal is the one that was followed.
  //
  // `castShadow` STAYS FALSE, and not only to save the second map. Three sorts lights so that shadow
  // casters come first (`shadowCastingAndTexturingLightsFirst`), so the sun is directional light 0
  // and this is 1, in every mode and whatever order they were added -- which is what lets the band
  // hook in models.js quantise the SUN and leave this one a continuous lip. See the note there.
  const rim = new THREE.DirectionalLight(0x9fc4ff, 0.42);
  rim.position.set(-14, 9, -30);
  rim.castShadow = false;
  scene.add(rim);
  scene.add(rim.target);
  return { sun, hemi, rim };
}
