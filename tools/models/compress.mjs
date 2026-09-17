#!/usr/bin/env node
// Re-encodes the model GLBs: meshes with EXT_meshopt_compression, base colour maps as KTX2/ETC1S.
//
// Blender cannot export either, so `make_character.py` and `bake_vertex_colors.py` write a plain GLB
// and this runs afterwards. It is idempotent: a file that is already meshopt-encoded is decoded and
// re-encoded to the same thing, and a texture that is already KTX2 is left exactly as it is, so
// running it twice is harmless and running it on a mixed directory is fine.
//
//     node tools/models/compress.mjs                    # re-encode public/models in place
//     node tools/models/compress.mjs --check            # report sizes, write nothing
//     node tools/models/compress.mjs --in a --out b      # somewhere else
//
// Why meshopt and not Draco, which this repository used before: measured over the nine characters,
// brotli'd as a static host serves them, Draco was 341 kB of models behind a 57 kB decoder, and
// meshopt is 308 kB behind a 7 kB one. Uncompressed was 439 kB with no decoder at all. Meshopt wins
// on both halves of the sum, and decodes faster besides.
//
// Textures are the other half, and they are a different trade (#51). Only the five imported buildings
// have one, a 1024x1024 JPEG each, and a JPEG is fully decompressed the moment it reaches the GPU:
// 5.59 MB of RGBA apiece, 7.5 MB once three.js has built the mipmaps it needs, ~37 MB resident for
// five buildings that never move. ETC1S stays compressed in video memory -- half a byte per texel
// against four -- so the same five cost 3.3 MB with their mips included. On the wire it is a wash
// (196 kB of KTX2 against 194 kB of JPEG for the Archery Range at quality 128), and the transcoder
// that reads it is 584 kB, 262 kB gzipped. So this is bought with download and paid back in GPU
// memory, which is the budget a mid-range Android tab actually runs out of.
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdtempSync, rmSync, copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const CHECK = args.includes('--check');
const IN = resolve(ROOT, flag('in', 'public/models'));
const OUT = resolve(ROOT, flag('out', flag('in', 'public/models')));

// ETC1S quality, 1-255. The knob only moves the file on the wire and the artefacts in the texture:
// what the GPU holds is half a byte per texel whatever this says. Measured on the Archery Range, the
// building whose painted detail is the finest in the game -- the bullseye beside the door, four rings
// on a disc of twenty triangles: q60 162 kB, q128 196 kB, q192 253 kB, q255 281 kB, against 194 kB of
// JPEG. 128 is where the rings still read at play distance and the file is the size of the JPEG it
// replaces. Compression level is encoder effort only, and 5 bought 1.7% more bytes for 5x the time.
const QUALITY = 128;
const EFFORT = 2;

const cli = resolve(ROOT, 'node_modules/.bin/gltf-transform');
if (!existsSync(cli)) {
  console.error('gltf-transform is not installed. Run `npm install` first.');
  process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
const sizes = (file) => {
  const b = readFileSync(file);
  return { raw: b.length, gzip: gzipSync(b, { level: 9 }).length, brotli: brotliCompressSync(b).length };
};

// The encoder wants raw RGBA and there is no image decoder in Node, so sharp -- already here as part
// of @gltf-transform/cli -- opens the JPEG.
const decodeImage = async (buffer) => {
  const { data, info } = await sharp(Buffer.from(buffer)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
};

// The average brightness of the texture, in the 0-255 sRGB space the pixels are stored in. props.js
// recolours a building by pushing every texel towards the village's tint *in proportion to how bright
// it is against this average*, which is what keeps the shingle rows and the dark doorway from
// flattening into one colour. It used to read the pixels back through a canvas to work it out; a
// compressed texture cannot be read back at all, so the number is measured here, once, and travels
// with the model in the material's extras.
const meanLuminance = (image) => {
  let sum = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    sum += 0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2];
  }
  return sum / (image.data.length / 4) / 255;
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// The Basis encoder is a wasm build that prints a page of slice tables through console.log on every
// call, and nothing in its API turns that off. Borrow the console for the duration rather than let it
// bury the report this tool exists to print.
async function encodeQuietly(image, options) {
  const log = console.log;
  console.log = () => {};
  try {
    return await encodeToKTX2(image, options);
  } finally {
    console.log = log;
  }
}

// Compresses every base colour map in one GLB, in place. Returns the texture bytes before and after,
// so the caller can say what the step cost. A model with no textures -- every character, because the
// crowd bakes its palette down to vertex colours -- is left untouched, file and all.
async function compressTextures(file) {
  const doc = await io.read(file);
  const textures = doc.getRoot().listTextures();
  let before = 0;
  let after = 0;
  let changed = false;
  for (const texture of textures) {
    const image = texture.getImage();
    if (!image) continue;
    before += image.byteLength;
    if (texture.getMimeType() === 'image/ktx2') {
      // Already done on an earlier run. Re-encoding would be ETC1S on top of ETC1S, and the mean
      // below cannot be recomputed from blocks, so leave both alone.
      after += image.byteLength;
      continue;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(texture.getMimeType())) {
      after += image.byteLength;
      continue;
    }
    const decoded = await decodeImage(image);
    const ktx2 = await encodeQuietly(image, {
      isUASTC: false,          // UASTC is the same picture at 8 bpp: 1.3 MB on the wire per building
      qualityLevel: QUALITY,
      compressionLevel: EFFORT,
      generateMipmap: true,    // the GPU needs them; built here they cost a third and are filtered better
      isPerceptual: true,      // sRGB source
      isSetKTX2SRGBTransferFunc: true,
      isKTX2File: true,
      needSupercompression: false, // ETC1S carries its own entropy coder; zstd on top gains nothing
      imageDecoder: decodeImage,
    });
    texture.setImage(ktx2).setMimeType('image/ktx2');
    after += ktx2.byteLength;
    changed = true;
    const mean = meanLuminance(decoded);
    for (const material of doc.getRoot().listMaterials()) {
      if (material.getBaseColorTexture() === texture) {
        material.setExtras({ ...material.getExtras(), meanLuminance: Number(mean.toFixed(4)) });
      }
    }
  }
  if (!changed) return { before, after };
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  writeFileSync(file, await io.writeBinary(doc));
  return { before, after };
}

// #51: the models on the critical path, whose textures stay JPEG. Mirrors `PROPS` in src/main.js --
// the three buildings the opening needs in hand before Play is live.
const KTX2_SKIP = new Set(['hut_ai.glb', 'keep_ai.glb', 'tower_ai.glb']);

const files = readdirSync(IN).filter((f) => f.endsWith('.glb')).sort();
if (files.length === 0) {
  console.error(`no .glb files in ${IN}`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'crownrush-models-'));
let before = { raw: 0, gzip: 0, brotli: 0 };
let after = { raw: 0, gzip: 0, brotli: 0 };
let tex = { before: 0, after: 0 };

try {
  if (!CHECK) mkdirSync(OUT, { recursive: true });
  for (const f of files) {
    const src = join(IN, f);
    const b = sizes(src);
    for (const k of Object.keys(before)) before[k] += b[k];

    // Decode first. Re-encoding an already-compressed mesh on top of its own quantisation is how a
    // model drifts a little further from the sculpt every time the tool is run.
    const plain = join(tmp, `plain-${f}`);
    const packed = join(tmp, `packed-${f}`);
    const copy = spawnSync(cli, ['copy', src, plain], { encoding: 'utf8' });
    if (copy.status !== 0) {
      console.error(`decode failed for ${f}:\n${copy.stderr || copy.stdout}`);
      process.exit(1);
    }
    // Textures before meshopt: the mesh encoder does not touch images, and running it first would
    // mean decoding the vertex streams again to get at them.
    //
    // #51: and only the models that load BEHIND the title screen. A KTX2 texture needs the Basis
    // transcoder, which is 577 kB on the wire (527 wasm + 57 js) and is fetched the first time one is
    // decoded. Compressing `hut`, `keep` or `tower` would pull that download onto the critical path
    // and put bytes-to-a-clickable-Play 445 kB OVER a budget it currently clears by 124 -- trading a
    // number a player feels on mobile data for one they do not. `barracks` and `house` are fetched
    // after Play goes live (`LATER_PROPS` in main.js), so the transcoder lands in the same wave they
    // do and the critical path never sees it. That is ~11 MB of the ~24 MB available, for nothing.
    //
    // The rule, not the list: what the opening needs stays JPEG, everything else is ETC1S. If a
    // building moves between the two waves in main.js, it moves here too.
    const t = KTX2_SKIP.has(f) ? { before: 0, after: 0 } : await compressTextures(plain);
    tex.before += t.before;
    tex.after += t.after;
    const enc = spawnSync(cli, ['meshopt', plain, packed], { encoding: 'utf8' });
    if (enc.status !== 0) {
      console.error(`meshopt failed for ${f}:\n${enc.stderr || enc.stdout}`);
      process.exit(1);
    }

    const a = sizes(packed);
    for (const k of Object.keys(after)) after[k] += a[k];
    const texNote = t.before ? `   texture ${kb(t.before)} -> ${kb(t.after)}` : '';
    console.log(`  ${f.padEnd(20)} ${kb(b.raw).padStart(8)} -> ${kb(a.raw).padStart(8)}   (brotli ${kb(b.brotli)} -> ${kb(a.brotli)})${texNote}`);

    if (!CHECK) {
      copyFileSync(packed, join(OUT, f));
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('');
console.log(`  ${files.length} files  raw ${kb(before.raw)} -> ${kb(after.raw)}`);
console.log(`              gzip ${kb(before.gzip)} -> ${kb(after.gzip)}`);
console.log(`            brotli ${kb(before.brotli)} -> ${kb(after.brotli)}`);
if (tex.before) console.log(`          textures ${kb(tex.before)} -> ${kb(tex.after)} on the wire, 4 bytes/texel -> 0.5 on the GPU`);
console.log(CHECK ? '\n  --check: nothing written.\n' : `\n  written to ${OUT}\n`);
