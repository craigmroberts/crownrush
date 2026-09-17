#!/usr/bin/env node
// Re-encodes the character GLBs with EXT_meshopt_compression.
//
// Blender cannot export meshopt, so `make_character.py` writes a plain GLB and this runs afterwards.
// It is idempotent: a file that is already meshopt-encoded is decoded and re-encoded to the same
// thing, so running it twice is harmless and running it on a mixed directory is fine.
//
//     node tools/models/compress.mjs                    # re-encode public/models in place
//     node tools/models/compress.mjs --check            # report sizes, write nothing
//     node tools/models/compress.mjs --in a --out b      # somewhere else
//
// Why meshopt and not Draco, which this repository used before: measured over the nine characters,
// brotli'd as a static host serves them, Draco was 341 kB of models behind a 57 kB decoder, and
// meshopt is 308 kB behind a 7 kB one. Uncompressed was 439 kB with no decoder at all. Meshopt wins
// on both halves of the sum, and decodes faster besides.
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdtempSync, rmSync, copyFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const CHECK = args.includes('--check');
const IN = resolve(ROOT, flag('in', 'public/models'));
const OUT = resolve(ROOT, flag('out', flag('in', 'public/models')));

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

const files = readdirSync(IN).filter((f) => f.endsWith('.glb')).sort();
if (files.length === 0) {
  console.error(`no .glb files in ${IN}`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'crownrush-models-'));
let before = { raw: 0, gzip: 0, brotli: 0 };
let after = { raw: 0, gzip: 0, brotli: 0 };

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
    const enc = spawnSync(cli, ['meshopt', plain, packed], { encoding: 'utf8' });
    if (enc.status !== 0) {
      console.error(`meshopt failed for ${f}:\n${enc.stderr || enc.stdout}`);
      process.exit(1);
    }

    const a = sizes(packed);
    for (const k of Object.keys(after)) after[k] += a[k];
    console.log(`  ${f.padEnd(20)} ${kb(b.raw).padStart(8)} -> ${kb(a.raw).padStart(8)}   (brotli ${kb(b.brotli)} -> ${kb(a.brotli)})`);

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
console.log(CHECK ? '\n  --check: nothing written.\n' : `\n  written to ${OUT}\n`);
