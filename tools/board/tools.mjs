// #178: what has been built to build the game with, read off the directory rather than listed.
//
// Ten tools now exist and none of them is discoverable: you find out `tools/layout/plan.mjs` is there
// by grepping, or by someone remembering. A list kept by hand would be missing the eleventh within a
// week, so this walks `tools/`, takes each one's own header comment as its description -- house style
// puts the reason at the top of the file, so the description already exists and is already maintained
// -- and pairs it with the npm script that runs it.
//
// A tool with no npm script and no README is reported as exactly that. That is the useful half.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'public', 'board', 'tools.json');
const TOOLS = join(ROOT, 'tools');
const SCRIPTS = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts || {};

// The leading comment block of a source file, which is where this repo keeps the why.
function header(text, kind) {
  const lines = text.split('\n');
  const out = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (kind === 'py') {
      if (l.startsWith('#!')) continue;
      if (!l.startsWith('#')) break;
      out.push(l.replace(/^#\s?/, ''));
    } else {
      // #190: a shebang is not the end of the header. The `py` branch above has always skipped one
      // and this branch did not, so a `.mjs` tool starting `#!/usr/bin/env node` broke the scan on
      // its first line and reached the board with no description at all. `probe` looked fine only
      // because it has a README to fall back on; `churn`, `blender` and `icons` did not, and
      // CLAUDE.md says the header comment IS the description on /board/#/tools.
      if (!out.length && l.startsWith('#!')) continue;
      if (!l.startsWith('//')) break;
      out.push(l.replace(/^\/\/\s?/, ''));
    }
  }
  return out.join(' ').replace(/\s+/g, ' ').trim() || null;
}

// The first paragraph of a README, for the tools that have one.
function readmeLede(text) {
  const body = text.replace(/^#.*$/m, '').trim();
  const para = body.split(/\n\s*\n/).find((p) => p.trim() && !p.startsWith('#') && !p.startsWith('```'));
  return para ? para.replace(/\s+/g, ' ').trim() : null;
}

const tools = [];
for (const name of readdirSync(TOOLS).sort()) {
  const dir = join(TOOLS, name);
  if (!statSync(dir).isDirectory()) continue;
  const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile());

  // The entry point, by the conventions actually in use here: a file named after the directory, a
  // lone script, or the one the npm script points at.
  const scripts = Object.entries(SCRIPTS).filter(([, cmd]) => cmd.includes(`tools/${name}/`));
  const fromScript = scripts.flatMap(([, cmd]) =>
    [...cmd.matchAll(new RegExp(`tools/${name}/([\\w.-]+)`, 'g'))].map((m) => m[1]));
  const code = files.filter((f) => ['.mjs', '.js', '.py', '.sh'].includes(extname(f)));
  const entry = fromScript[0] || code.find((f) => f.startsWith(name)) || (code.length === 1 ? code[0] : null);

  // A directory of several scripts with no obvious entry -- tools/blender and tools/layout are both
  // like this -- still has a header somewhere. Take the first one that has written down why it
  // exists rather than reporting the whole tool as undocumented.
  let why = null;
  for (const f of [entry, ...code].filter(Boolean)) {
    if (!files.includes(f)) continue;
    why = header(readFileSync(join(dir, f), 'utf8'), extname(f) === '.py' ? 'py' : 'js');
    if (why) break;
  }
  const readme = files.includes('README.md');
  if (!why && readme) why = readmeLede(readFileSync(join(dir, 'README.md'), 'utf8'));

  tools.push({
    name,
    path: `tools/${name}/`,
    entry: entry || null,
    // Every npm script that reaches into this directory, and what it runs. `npm run board` chains
    // four of them, so a tool can be listed under a script it does not own.
    scripts: scripts.map(([k, cmd]) => ({ name: k, cmd })),
    readme,
    files: files.length,
    code,
    why: why ? (why.length > 420 ? why.slice(0, 419).replace(/\s\S*$/, '') + '…' : why) : null,
  });
}

const out = {
  at: new Date().toISOString(),
  tools,
  orphans: tools.filter((t) => !t.scripts.length && !t.readme).map((t) => t.name),
};

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(out);
writeFileSync(OUT, json);
const dist = join(ROOT, 'dist', 'board', 'tools.json');
if (existsSync(join(ROOT, 'dist', 'board'))) writeFileSync(dist, json);

console.log(`board tools: ${tools.length} tools, ${tools.filter((t) => t.scripts.length).length} with an npm script, `
  + `${tools.filter((t) => t.readme).length} with a README`
  + (out.orphans.length ? ` -- ${out.orphans.length} with neither: ${out.orphans.join(', ')}` : ''));
