#!/usr/bin/env node
// Renders the app icons a phone home screen needs, from the game's own crown.
//
//     node tools/icons/make-app-icons.mjs
//
// They are drawn here rather than by hand so they stay the game's crown and the game's green: the
// same path from src/icons.js, on the same #3f9a5b the title screen and the theme colour use.
//
// Four files land in public/icons/:
//   icon-192.png, icon-512.png   the two sizes a web app manifest is expected to offer
//   icon-maskable-512.png        the crown inside the safe circle Android crops every icon to
//   apple-touch-icon.png         180px, which is what iOS reads when it adds to the home screen
//
// A maskable icon is a different drawing, not a resized one. Android may crop an icon to a circle, a
// squircle or a rounded square depending on the launcher, and only the middle 80% is guaranteed to
// survive, so the crown is drawn smaller inside a full-bleed background.
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'public/icons');

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return undefined;
  for (const d of readdirSync(base).filter((x) => x.startsWith('chromium')).sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = join(base, d, rel);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

// The crown from src/icons.js, on a 24-unit grid. Kept as a copy rather than imported: that module
// pulls in the whole icon set and the DOM, and this runs in node.
const OUTLINE = '#3a2a1a';
const CROWN = `
  <path d="M4 18l-1-10 5 4 4-7 4 7 5-4-1 10z" fill="#f5b800" stroke="${OUTLINE}" stroke-width="1.15" stroke-linejoin="round" stroke-linecap="round"/>
  <rect x="4" y="16" width="16" height="4" rx="1.5" fill="#c98a00" stroke="${OUTLINE}" stroke-width="1.15" stroke-linejoin="round"/>
  <circle cx="12" cy="13" r="1.6" fill="#e8342a"/>
`;

// `inset` is how much of the tile the crown leaves alone, as a fraction. The plain icons fill more of
// the tile; the maskable one keeps well inside the circle Android may crop to.
const page = (size, inset, rounded) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${size}px; height: ${size}px; }
  .tile {
    width: ${size}px; height: ${size}px; display: grid; place-items: center;
    background: radial-gradient(circle at 50% 38%, #56b473 0%, #3f9a5b 62%, #2f7a46 100%);
    ${rounded ? `border-radius: ${Math.round(size * 0.22)}px;` : ''}
  }
  svg { width: ${Math.round(size * (1 - inset * 2))}px; height: auto; display: block;
        filter: drop-shadow(0 ${Math.max(1, Math.round(size * 0.012))}px ${Math.max(1, Math.round(size * 0.02))}px rgba(0,0,0,0.35)); }
</style></head>
<body><div class="tile"><svg viewBox="2 4 20 17" xmlns="http://www.w3.org/2000/svg">${CROWN}</svg></div></body></html>`;

const TARGETS = [
  { file: 'icon-192.png', size: 192, inset: 0.12, rounded: false },
  { file: 'icon-512.png', size: 512, inset: 0.12, rounded: false },
  // the crown at 60% of the tile, so the middle 80% a launcher guarantees still holds all of it
  { file: 'icon-maskable-512.png', size: 512, inset: 0.2, rounded: false },
  // iOS applies its own rounding, so this one is square-edged too
  { file: 'apple-touch-icon.png', size: 180, inset: 0.1, rounded: false },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
try {
  for (const t of TARGETS) {
    const p = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    await p.setContent(page(t.size, t.inset, t.rounded), { waitUntil: 'load' });
    await p.screenshot({ path: join(OUT, t.file), omitBackground: false });
    await p.close();
    console.log(`  ${t.file.padEnd(24)} ${t.size}x${t.size}`);
  }
} finally {
  await browser.close();
}
console.log(`\n  written to ${OUT}\n`);
