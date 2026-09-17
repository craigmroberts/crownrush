#!/usr/bin/env node
// #55: authors the animation clips that Blender was going to, and writes them into the character GLBs.
//
//     node tools/models/clips.mjs            # add the clips to public/models
//     node tools/models/clips.mjs --check    # say what would change, write nothing
//
// WHY THIS EXISTS AND IS NOT A .blend FILE. The ticket says to add clips in
// `tools/blender/make_character.py` and re-run `npm run models`. That is the right home for anything
// an artist would pose by hand -- but `make_character.py` is a `bpy` script and there is no Blender
// in the environment this was written in, so the choice was between no clips at all and clips
// authored as numbers.
//
// Numbers turn out to be reasonable here, and that is a fact about this rig rather than about
// animation in general. It is SEVEN bones:
//
//     root -> leg.L, leg.R, spine
//     spine -> arm.L, arm.R, head
//
// with the arms and legs bound at 180 degrees about X so they hang downward. There is no elbow, no
// knee, no finger and no jaw. A death on a rig like this is four or five angles over half a second,
// which is writable and, more to the point, checkable. `tools/models/README.md` has how to look at
// one, the trap in looking at one, and what the frames changed.
//
// If Blender ever is available, a hand-posed clip of the same name should simply replace what this
// writes: `bakeBones` takes whatever clips it finds and this adds nothing to the format.
import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { Quaternion, Euler } from 'three';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MODELS = join(ROOT, 'public/models');
const CHECK = process.argv.includes('--check');
const FPS = 24;                      // what the existing three clips are keyed at

// The buildings have no skeleton and are skipped on that alone -- `addClips` returns null for them.
// The mounted King is skipped by NAME: it is a different rig carrying the horse's bones as well, and
// a man dying in the saddle is not the same motion as a man dying on his feet. He is also never in
// the crowd, so nothing instanced needs it.
const SKIP = ['king_mounted', 'king_mounted_ai'];

// ---------------------------------------------------------------- posing helpers

// A rotation to COMPOSE with the bone's bind rotation, rather than replace it: the arms and legs are
// bound at 180 degrees about X, so an absolute quaternion would have to carry that around and every
// angle below would be written upside down.
const _e = new Euler();
const _q = new Quaternion();
const rot = (bind, x, y, z) => {
  _q.setFromEuler(_e.set(x, y, z, 'XYZ'));
  return new Quaternion(bind[0], bind[1], bind[2], bind[3]).multiply(_q);
};

// Ease so the body accelerates into the fall and settles rather than arriving at a constant rate.
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// ---------------------------------------------------------------- the clips
//
// Each one is a function of `t` in 0..1 returning, per bone, the Euler offsets from the bind pose.
// Bones left out of a frame keep their bind pose, which is what makes these short to write.

// DEATH. Body-local throes only -- the BIG topple is still done in code (`Game.fell`), because which
// way a body falls depends on where the blow came from and that cannot be baked into a clip. So this
// is what the body does to itself while the code carries it over, and the two compose.
//
// Three beats:
//
//   1. THE HIT (to t=0.14). A snap BACK -- spine and head go negative, arms fly up and out. Short:
//      any longer and it reads as a stagger the body recovers from.
//   2. THE COLLAPSE (0.12 to 0.80). Everything reverses through neutral into the slump below.
//   3. THE SLUMP (held from 0.80). Where the body is when it lands, and the frame that matters most,
//      because `fell` leaves it lying there for the rest of the half second and the crowd shader
//      CLAMPS a one-shot on its last frame.
//
// THE SLUMP IS A TWIST, NOT A CURL, and that is the one thing here that had to be measured rather
// than guessed. The obvious death pose doubles the body forward -- and a forward curl composed with
// `fell`'s forward topple puts the head through the floor. Rendered at topple=+1 the second half of
// the clip was a pair of legs and no man: 63 degrees of spine on top of 90 of topple is 153 from
// upright, which is face-down with the torso under the grass. Curling BACK just moves the problem to
// everyone shot from the front.
//
// So the spine barely bends (0.18 rad) and the deadness is carried by things that read the same
// whichever way the body goes over: a twist about Y, a side-bend about Z, the head lolled onto a
// shoulder, and above all the arms dropped WIDE. It is also deliberately asymmetric -- left arm
// further out than right, one knee up. A symmetric body with straight limbs lands as a plank, and a
// plank reads as a prop falling over rather than a man dying.
const DEATH = (t) => {
  const hit = Math.min(1, t / 0.14);                                 // struck
  const fall = ease(clamp01((t - 0.12) / 0.68));                     // and going down
  const mix = (a, b) => lerp(0, a, hit) + lerp(0, b, fall);          // out on the hit, then into the slump
  return {
    spine: [mix(-0.5, 0.68), mix(0, 0.4), mix(0, 0.34)],
    head: [mix(-0.62, 0.92), mix(0, 0.55), mix(0, -0.35)],
    // up and out as it is struck, then dropped wide -- a limp arm lies away from the body
    'arm.L': [mix(-1.3, 1.15), 0, mix(0.55, 0.45)],
    'arm.R': [mix(-1.0, 0.9), 0, mix(-0.4, -0.35)],
    // the knees give, unevenly: one folds and splays, the other only buckles
    'leg.L': [mix(0, 0.35), 0, mix(0, 0.38)],
    'leg.R': [mix(0, 0.12), 0, mix(0, -0.2)],
  };
};

// HIT. A flinch: rocked back and half turned by the blow, then back to where it started.
//
// `sin(pi*t)` is the envelope, so the clip BEGINS AND ENDS at the bind pose. That is not a stylistic
// choice, it is what makes it safe to one-shot over anything else: the crowd path has no blending --
// a one-shot clip REPLACES the looping one for its duration rather than mixing with it -- so a clip
// that ended anywhere but the bind pose would leave the body there until the next clip snapped it
// back. It is also why `hitAnim` only plays this on a character that is standing still; see there.
//
// The legs are in it, and they were not in the first pass. Without them the crowd path stood a
// staggering man's legs bolt upright for a fifth of a second. With them it is a brace -- one foot
// back, one forward -- which is what a man knocked out of his stance actually does.
const HIT = (t) => {
  const a = Math.sin(t * Math.PI);              // out and back
  return {
    spine: [-0.45 * a, 0.2 * a, 0.12 * a],
    head: [-0.5 * a, 0.28 * a, 0],
    'arm.L': [-0.65 * a, 0, 0.3 * a],
    'arm.R': [-0.45 * a, 0, -0.22 * a],
    'leg.L': [-0.28 * a, 0, 0.1 * a],
    'leg.R': [0.22 * a, 0, -0.08 * a],
  };
};

const CLIPS = [
  { name: 'Death', seconds: 0.5, pose: DEATH },   // exactly `fell`'s half second: see below
  { name: 'Hit', seconds: 0.22, pose: HIT },
];

// ---------------------------------------------------------------- writing

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

async function addClips(file) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  if (!skin) return null;
  const joints = new Map(skin.listJoints().map((j) => [j.getName(), j]));
  const buffer = root.listBuffers()[0];
  const added = [];
  for (const spec of CLIPS) {
    // Idempotent: running this twice must not leave two clips of the same name, because `bakeBones`
    // would then bake both and the second would be unreachable dead rows in the bone texture.
    const old = root.listAnimations().find((a) => a.getName() === spec.name);
    if (old) old.dispose();
    // frames INCLUSIVE of both ends, keyed from zero: the first key has to be at t=0 or the bind
    // pose is held for a frame before the clip starts, and `bakeBones` samples from zero.
    const frames = Math.max(2, Math.round(spec.seconds * FPS) + 1);
    const times = new Float32Array(frames);
    for (let i = 0; i < frames; i++) times[i] = i / FPS;
    const input = doc.createAccessor(`${spec.name}-t`).setArray(times).setType('SCALAR').setBuffer(buffer);
    const anim = doc.createAnimation(spec.name);
    // Which bones this clip touches at all -- the union over its frames, so a bone that only moves
    // late still gets a track from frame zero.
    const touched = new Set();
    for (let i = 0; i < frames; i++) for (const k of Object.keys(spec.pose(i / (frames - 1)))) touched.add(k);
    for (const name of touched) {
      const joint = joints.get(name);
      if (!joint) continue;
      const bind = joint.getRotation();
      const out = new Float32Array(frames * 4);
      for (let i = 0; i < frames; i++) {
        const p = spec.pose(i / (frames - 1))[name] || [0, 0, 0];
        const q = rot(bind, p[0], p[1], p[2]);
        out.set([q.x, q.y, q.z, q.w], i * 4);
      }
      const output = doc.createAccessor(`${spec.name}-${name}`).setArray(out).setType('VEC4').setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      anim.addSampler(sampler);
      anim.addChannel(doc.createAnimationChannel().setTargetNode(joint).setTargetPath('rotation').setSampler(sampler));
    }
    added.push(`${spec.name} (${frames}f, ${touched.size} bones)`);
  }
  if (!CHECK) await io.write(file, doc);
  return added;
}

const files = readdirSync(MODELS).filter((f) => f.endsWith('.glb') && !SKIP.includes(f.replace('.glb', '')));
if (!existsSync(MODELS)) {
  console.error(`no models directory at ${MODELS}`);
  process.exit(1);
}
let touched = 0;
for (const f of files.sort()) {
  const added = await addClips(join(MODELS, f));
  if (!added) continue;
  touched++;
  console.log(`  ${f.padEnd(22)} ${added.join('  ')}`);
}
console.log(`\n  ${touched} skinned model${touched === 1 ? '' : 's'}${CHECK ? ' would gain' : ' gained'} ${CLIPS.map((c) => c.name).join(' and ')}.`);
console.log(CHECK ? '  --check: nothing written.\n' : '  Run `npm run models` afterwards to re-compress.\n');
