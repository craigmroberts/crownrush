#!/usr/bin/env node
// Crown Rush scout: an offline pass that studies the game, proposes improvements, files them as
// GitHub issues, and ranks the backlog once it is big enough to need ranking.
//
//   node tools/scout/scout.mjs --dry-run        see what it would file, file nothing
//   node tools/scout/scout.mjs                  one run: two rounds, at most 5 issues
//   node tools/scout/scout.mjs --prioritise     rank the open scout issues now
//
// It runs headless Claude Code processes as its agents (one per role, in parallel) and talks to
// GitHub through `gh`. Nothing here edits the game: the only thing it writes is issues.
//
// Read tools/scout/README.md before turning it loose.

import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES, jsonContract } from './roles.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const STATE = join(HERE, 'state');
mkdirSync(STATE, { recursive: true });

// ---------- options ----------
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const OPT = {
  dryRun: !!flag('dry-run', false),
  rounds: Number(flag('rounds', 2)),
  maxIssues: Number(flag('max-issues', 5)),
  prioritiseAt: Number(flag('prioritise-at', 8)),
  prioritiseOnly: !!flag('prioritise', false),
  model: flag('model', null),
  roles: String(flag('roles', '')).split(',').filter(Boolean),
  timeout: Number(flag('timeout', 600)) * 1000,
};

const say = (...a) => console.log(...a);
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts }).trim();

// ---------- what the game is, today ----------
// Deterministic: files, numbers, commits and the issue list. The agents get this instead of being
// told to go and read everything, which keeps each of them cheap and pointed at the same facts.
function buildDigest() {
  const src = readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.js'));
  const sizes = src.map((f) => `${f} (${readFileSync(join(ROOT, 'src', f), 'utf8').split('\n').length} lines)`);
  const cfg = readFileSync(join(ROOT, 'src', 'config.js'), 'utf8');
  const cfgKeys = [...cfg.matchAll(/^\s{2}([a-zA-Z]+):\s*[{[]/gm)].map((m) => m[1]);
  const readme = existsSync(join(ROOT, 'README.md')) ? readFileSync(join(ROOT, 'README.md'), 'utf8') : '';
  const headings = [...readme.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1]).slice(0, 40);
  const commits = sh('git', ['log', '--oneline', '-25']);
  return [
    '# Crown Rush, as it stands',
    '',
    'A single-page Three.js browser game: rescue the Queen, build and feed a Keep, hold off nightly',
    'raids, then march on the raider camp. No accounts, no server, no monetisation. Phone and desktop.',
    '',
    '## Source',
    sizes.map((s) => `- src/${s}`).join('\n'),
    '',
    '## Balance and build tree (src/config.js top-level keys)',
    cfgKeys.map((k) => `- CFG.${k}`).join('\n'),
    '',
    '## What the README documents',
    headings.map((h) => `- ${h}`).join('\n'),
    '',
    '## Recent work',
    commits,
  ].join('\n');
}

function issueList(state) {
  try {
    return JSON.parse(sh('gh', ['issue', 'list', '--state', state, '--limit', '200', '--json', 'number,title,labels,body']));
  } catch (e) {
    say(`! could not read ${state} issues from GitHub: ${e.message.split('\n')[0]}`);
    return [];
  }
}

// ---------- duplicate detection ----------
// Two titles for the same idea rarely share their words: "thieves never appear" and "thief never
// spawns in a normal run" are the same ticket. Word containment catches restatements, character
// trigrams catch the morphology, and the stronger of the two decides. This is only a backstop:
// the agents are given every existing title and told not to repeat them, which is the real defence.
const STOP = new Set('the a an and or of to for in on at is are be it its with when while that this into from you your not no more less than as by'.split(' '));
const stem = (w) => w.replace(/ies$/, 'y').replace(/(ves)$/, 'f').replace(/(es|s)$/, '');
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);
function containment(a, b) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);   // so a short title inside a long one still counts
}
function trigrams(s) {
  const t = ' ' + String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  const out = new Set();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}
function triSim(a, b) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / Math.min(A.size, B.size);
}
const similarity = (a, b) => Math.max(containment(a, b), triSim(a, b));
const DUPE_AT = 0.6;

// ---------- the agents ----------
// SCOUT_FAKE=<dir> answers every agent from <dir>/<role>.json instead of spawning one. It exists so
// the pipeline around the agents (parsing, deduplication, ranking, filing) can be exercised for
// nothing, and so a change here can be tested without waiting on five model calls.
function runAgent(role, prompt) {
  if (process.env.SCOUT_FAKE) {
    const f = join(process.env.SCOUT_FAKE, `${role.id}.json`);
    if (!existsSync(f)) return Promise.resolve({ role: role.id, error: `no fixture at ${f}`, ideas: [], cost: 0 });
    const raw = readFileSync(f, 'utf8');
    return Promise.resolve({ role: role.id, ideas: parseIdeas(raw), cost: 0, raw });
  }
  const args = ['-p', prompt, '--output-format', 'json', '--allowed-tools', ...role.tools];
  if (OPT.model) args.push('--model', OPT.model);
  return new Promise((resolve) => {
    execFile('claude', args, { cwd: ROOT, timeout: OPT.timeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (!stdout) return resolve({ role: role.id, error: err ? err.message.split('\n')[0] : 'no output', ideas: [], cost: 0 });
      let env;
      try { env = JSON.parse(stdout); } catch { return resolve({ role: role.id, error: 'unreadable agent output', ideas: [], cost: 0 }); }
      const cost = env.total_cost_usd || 0;
      if (env.is_error) return resolve({ role: role.id, error: env.result || env.terminal_reason || 'agent error', ideas: [], cost });
      resolve({ role: role.id, ideas: parseIdeas(env.result), cost, raw: env.result });
    });
  });
}

// Agents are asked for bare JSON and mostly give it; this forgives a code fence or a sentence before it.
function parseIdeas(text) {
  if (!text) return [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const list = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(list) ? list.filter((x) => x && x.title && x.body) : [];
  } catch { return []; }
}

const clamp = (n) => Math.max(1, Math.min(5, Number(n) || 3));
const score = (i) => (clamp(i.impact) * clamp(i.confidence)) / clamp(i.effort);

function promptFor(role, digest, known, earlier) {
  return [
    role.brief,
    '',
    '---',
    digest,
    '',
    '## Issues that already exist, open and closed. Do not propose these again.',
    known.map((t) => `- ${t}`).join('\n') || '- none',
    earlier.length ? ['', '## Proposed earlier in this same run, by other agents or an earlier round',
      earlier.map((t) => `- ${t}`).join('\n'),
      '',
      'Go further than these: either take the most promising one apart into concrete pieces, or find',
      'what they all missed. Repeating them in other words is the one useless answer.'].join('\n') : '',
    '',
    jsonContract(),
  ].join('\n');
}

// ---------- filing ----------
function ensureLabels() {
  for (const [name, colour, desc] of [
    ['scout', 'BFD4F2', 'Raised by the offline scout'],
    ['p1', 'B60205', 'Do next'], ['p2', 'FBCA04', 'Worth doing'], ['p3', 'C2E0C6', 'Someday'],
  ]) {
    try { sh('gh', ['label', 'create', name, '--color', colour, '--description', desc]); } catch { /* already there */ }
  }
}

function fileIssue(idea) {
  const body = [
    idea.body,
    '',
    '---',
    `*Raised by the offline scout (${idea.role}). Impact ${clamp(idea.impact)}/5, effort ${clamp(idea.effort)}/5, confidence ${clamp(idea.confidence)}/5.*`,
    `*What prompted it: ${idea.why || 'not stated'}*`,
  ].join('\n');
  const out = sh('gh', ['issue', 'create', '--title', idea.title, '--body', body, '--label', 'scout']);
  return out.split('\n').pop();
}

// ---------- prioritising ----------
async function prioritise() {
  const open = issueList('open').filter((i) => (i.labels || []).some((l) => l.name === 'scout'));
  if (open.length < 2) { say(`nothing to rank: ${open.length} open scout issues`); return 0; }
  say(`ranking ${open.length} open scout issues…`);
  const lines = open.map((i) => `#${i.number} ${i.title}\n    ${String(i.body || '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');
  const prompt = [
    'You are ordering a small game\'s backlog. Below are the open suggestions raised by an automated',
    'scout. Rank them for a solo developer working in evenings on a browser game with real players',
    'giving feedback: what would a player notice first, what is cheap, what unblocks other work.',
    '',
    lines,
    '',
    'Answer with JSON and nothing else:',
    '[{"number": 12, "priority": "p1", "rank": 1, "because": "one line"}]',
    '',
    'priority is p1 (do next), p2 (worth doing) or p3 (someday). Be selective: at most a third can be p1.',
    'rank is the overall order, 1 first. Include every issue given to you exactly once.',
  ].join('\n');
  const res = await runAgent({ id: 'prioritiser', tools: ['Read'] }, prompt);
  if (res.error) { say(`! prioritiser failed: ${res.error}`); return res.cost; }
  let ranked = [];
  try {
    const t = res.raw || '';
    ranked = JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
  } catch { say('! prioritiser did not return readable JSON'); return res.cost; }
  ranked.sort((a, b) => (a.rank || 99) - (b.rank || 99));
  if (OPT.dryRun) {
    say('would rank:');
    for (const r of ranked) say(`  ${r.rank}. #${r.number} ${r.priority} — ${r.because}`);
    return res.cost;
  }
  ensureLabels();
  for (const r of ranked) {
    if (!open.some((i) => i.number === r.number)) continue;
    try {
      sh('gh', ['issue', 'edit', String(r.number), '--add-label', r.priority, '--remove-label', ['p1', 'p2', 'p3'].filter((p) => p !== r.priority).join(',')]);
    } catch (e) { say(`  ! could not label #${r.number}: ${e.message.split('\n')[0]}`); }
  }
  const table = ['| # | Issue | Priority | Why |', '| --- | --- | --- | --- |',
    ...ranked.map((r) => `| ${r.rank} | #${r.number} | ${r.priority} | ${String(r.because || '').replace(/\|/g, '/')} |`)].join('\n');
  writeFileSync(join(STATE, 'order.md'), `# Scout backlog order\n\nRanked ${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n\n${table}\n`);
  say(`ranked ${ranked.length} issues; order written to tools/scout/state/order.md`);
  return res.cost;
}

// ---------- a run ----------
async function main() {
  let cost = 0;
  if (OPT.prioritiseOnly) { cost += await prioritise(); return done(cost); }

  const digest = buildDigest();
  writeFileSync(join(STATE, 'digest.md'), digest);
  const existing = [...issueList('open'), ...issueList('closed')];
  const known = existing.map((i) => i.title);
  say(`${known.length} issues already exist; scouting with ${OPT.roles.length || ROLES.length} agents over ${OPT.rounds} round(s)`);

  const accepted = [];
  const proposedTitles = [];
  let authHint = false;
  for (let round = 1; round <= OPT.rounds; round++) {
    const roles = ROLES.filter((r) => !OPT.roles.length || OPT.roles.includes(r.id));
    say(`\nround ${round}: ${roles.map((r) => r.label).join(', ')}`);
    const results = await Promise.all(roles.map((r) => runAgent(r, promptFor(r, digest, known, proposedTitles))));
    for (const res of results) {
      cost += res.cost;
      if (res.error) { say(`  ${res.role}: ${res.error}`); if (/authenticate|OAuth|login/i.test(res.error)) authHint = true; continue; }
      say(`  ${res.role}: ${res.ideas.length} idea(s)`);
      for (const idea of res.ideas) {
        idea.role = res.role;
        const clash = [...known, ...proposedTitles].find((t) => similarity(idea.title, t) >= DUPE_AT);
        if (clash) { say(`    - skipped as a near-duplicate of "${clash}": ${idea.title}`); continue; }
        proposedTitles.push(idea.title);
        accepted.push(idea);
      }
    }
    if (results.every((r) => r.error)) {
      say('\nevery agent failed; stopping');
      if (authHint) say('The agents sign in as you do. Run `claude` once, interactively, to refresh that session, then run the scout again.');
      break;
    }
  }

  accepted.sort((a, b) => score(b) - score(a));
  const picked = accepted.slice(0, OPT.maxIssues);
  say(`\n${accepted.length} idea(s) survived deduplication; filing the best ${picked.length}`);

  const report = [`# Scout run ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, ''];
  for (const i of picked) report.push(`## ${i.title}`, `*${i.area} · ${i.role} · impact ${clamp(i.impact)} effort ${clamp(i.effort)} confidence ${clamp(i.confidence)}*`, '', i.why || '', '', i.body, '');
  writeFileSync(join(STATE, 'last-run.md'), report.join('\n'));

  if (OPT.dryRun) {
    for (const i of picked) say(`  would file: ${i.title}`);
    say('\ndry run: nothing filed. The full text is in tools/scout/state/last-run.md');
    return done(cost);
  }

  ensureLabels();
  const filed = [];
  for (const i of picked) {
    try { const url = fileIssue(i); filed.push(url); say(`  filed ${url}  ${i.title}`); }
    catch (e) { say(`  ! could not file "${i.title}": ${e.message.split('\n')[0]}`); }
  }
  const log = existsSync(join(STATE, 'filed.json')) ? JSON.parse(readFileSync(join(STATE, 'filed.json'), 'utf8')) : [];
  log.push({ at: new Date().toISOString(), filed, titles: picked.map((p) => p.title) });
  writeFileSync(join(STATE, 'filed.json'), JSON.stringify(log, null, 2));

  const openScout = issueList('open').filter((i) => (i.labels || []).some((l) => l.name === 'scout'));
  if (openScout.length >= OPT.prioritiseAt) {
    say(`\n${openScout.length} open scout issues, at or past the ${OPT.prioritiseAt} threshold`);
    cost += await prioritise();
  } else {
    say(`\n${openScout.length} open scout issues; ranking starts at ${OPT.prioritiseAt}`);
  }
  return done(cost);
}

function done(cost) {
  say(`\ncost this run: $${cost.toFixed(4)}`);
  return 0;
}

main().catch((e) => { console.error('scout failed:', e.message); process.exit(1); });
