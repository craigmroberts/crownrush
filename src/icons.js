// Hand-drawn icon set in the game's art style: flat fills, dark rounded outlines, a highlight.
// Used inline in the HUD (SVG) and rasterised for the build-pad canvases.
const O = '#3a2a1a';
const S = `stroke="${O}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
export const ICONS = {
  coin: `<circle cx="12" cy="12" r="10" fill="#f5b800" ${S}/><circle cx="12" cy="12" r="6.5" fill="#ffd23f" stroke="#c98a00" stroke-width="1.2"/><path d="M8.5 14.5l.6-4.2 2.2 2.2 .7-3 .7 3 2.2-2.2 .6 4.2z" fill="#c98a00"/>`,
  iron: `<path d="M4 15l3-8h10l3 8-8 5z" fill="#9aa6b4" ${S}/><path d="M7 7h10l-1.6 4H8.6z" fill="#c3ccd8"/><path d="M8 16.5l4 2.2 4-2.2" fill="none" stroke="#5d6773" stroke-width="1.4"/>`,
  diamond: `<path d="M12 3l6 5.5-6 12.5-6-12.5z" fill="#8fe8ff" ${S}/><path d="M12 3l6 5.5H6z" fill="#d8f7ff"/><path d="M6 8.5h12l-6 12.5z" fill="#5fc8e8" opacity="0.65"/>`,
  bronze: `<circle cx="12" cy="12" r="10" fill="#b87333" ${S}/><circle cx="12" cy="12" r="6.5" fill="#d9925a" stroke="#7a4a1e" stroke-width="1.2"/><path d="M8.5 14.5l.6-4.2 2.2 2.2 .7-3 .7 3 2.2-2.2 .6 4.2z" fill="#7a4a1e"/>`,
  silver: `<circle cx="12" cy="12" r="10" fill="#b9c2cc" ${S}/><circle cx="12" cy="12" r="6.5" fill="#e6ecf2" stroke="#7d8892" stroke-width="1.2"/><path d="M8.5 14.5l.6-4.2 2.2 2.2 .7-3 .7 3 2.2-2.2 .6 4.2z" fill="#7d8892"/>`,
  gold: `<circle cx="12" cy="12" r="10" fill="#f5b800" ${S}/><circle cx="12" cy="12" r="6.5" fill="#ffd23f" stroke="#c98a00" stroke-width="1.2"/><path d="M8.5 14.5l.6-4.2 2.2 2.2 .7-3 .7 3 2.2-2.2 .6 4.2z" fill="#c98a00"/>`,
  platinum: `<circle cx="12" cy="12" r="10" fill="#8fd3e8" ${S}/><circle cx="12" cy="12" r="6.5" fill="#e9fbff" stroke="#4d9fb8" stroke-width="1.2"/><path d="M8.5 14.5l.6-4.2 2.2 2.2 .7-3 .7 3 2.2-2.2 .6 4.2z" fill="#4d9fb8"/>`,
  wood: `<rect x="3" y="8" width="16" height="8" rx="4" fill="#8a5a2b" ${S}/><ellipse cx="19" cy="12" rx="3" ry="4" fill="#d9a86c" ${S}/><ellipse cx="19" cy="12" rx="1.2" ry="1.7" fill="none" stroke="#a97a4a" stroke-width="1"/><path d="M6 10.5h8M6 13.5h6" stroke="#6b4a2b" stroke-width="1" stroke-linecap="round"/>`,
  stone: `<path d="M4 15l3-7 6-3 7 4-1 7-5 3-7-1z" fill="#9a9ea3" ${S}/><path d="M7 8l6-3 7 4-5 2-7 1z" fill="#c7cbd0" stroke="none"/>`,
  straw: `<path d="M8 20c1-5 2-9 4-13M12 20c0-5 1-9 2-13M16 20c-1-5-1-9-1-13" fill="none" stroke="#b8922e" stroke-width="2" stroke-linecap="round"/><ellipse cx="11.5" cy="6" rx="2" ry="3" fill="#e9d27a" ${S}/><ellipse cx="14.5" cy="6.5" rx="2" ry="3" fill="#e9d27a" ${S}/><ellipse cx="9" cy="8" rx="2" ry="3" fill="#e9d27a" ${S}/><rect x="8" y="14" width="8" height="3" rx="1.5" fill="#8a5a2b" ${S}/>`,
  bow: `<path d="M7 3c6 3 6 15 0 18" fill="none" stroke="#3b7bff" stroke-width="2.6" stroke-linecap="round"/><path d="M7 3v18" stroke="#f4f4f4" stroke-width="1.2"/><path d="M8 12h11" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round"/><path d="M17 9l4 3-4 3z" fill="#c3c8cf" ${S}/><path d="M8 10l-2 2 2 2" fill="#f7f7f7" ${S}/>`,
  archer: `<path d="M5 10c0-3 3-4 2-2v6H5z" fill="none"/><rect x="7" y="12" width="10" height="8" rx="3" fill="#f7f7f7" ${S}/><path d="M9 13l6 6" stroke="#2f6fd6" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="7" r="4.5" fill="#f6cfae" ${S}/><path d="M7.6 6.2c.6-3 8.2-3 8.8 0-1 .4-2 .6-4.4.6S8.6 6.6 7.6 6.2z" fill="#4a2f1c" stroke="${O}" stroke-width="1.2"/><path d="M19 9c2.5 2 2.5 6 0 8" fill="none" stroke="#3b7bff" stroke-width="2" stroke-linecap="round"/>`,
  swordsman: `<rect x="7" y="12" width="10" height="8" rx="3" fill="#3a3f5c" ${S}/><circle cx="12" cy="7" r="4.5" fill="#f6cfae" ${S}/><path d="M7.5 6.4c0-3 9-3 9 0z" fill="#c3c8cf" stroke="${O}" stroke-width="1.2"/><path d="M18 19l3-10" stroke="#c3c8cf" stroke-width="2.4" stroke-linecap="round"/><path d="M17 18l3 1" stroke="#c98a00" stroke-width="2" stroke-linecap="round"/>`,
  tower: `<path d="M8 21l1-11h6l1 11" fill="#9a6a3a" ${S}/><path d="M6 10h12l-1 3H7z" fill="#6b4a2b" ${S}/><path d="M5 10l7-6 7 6z" fill="#7a4f30" ${S}/><path d="M10 15l4 4M14 15l-4 4" stroke="#6b4a2b" stroke-width="1.4"/>`,
  wall: `<path d="M4 20V9l3-4 3 4v11M10 20V9l3-4 3 4v11M16 20V9l2.5-4 2.5 4v11" fill="#9a6a3a" ${S}/><path d="M3 13h18M3 17h18" stroke="#6b4a2b" stroke-width="1.6"/>`,
  brick: `<rect x="3" y="6" width="18" height="14" rx="1.5" fill="#b5583f" ${S}/><path d="M3 10.5h18M3 15.5h18M8 6v4.5M14 6v4.5M11 10.5v5M17 10.5v5M8 15.5V20M14 15.5V20" stroke="#d9a48c" stroke-width="1.2"/>`,
  stonewall: `<rect x="3" y="6" width="18" height="14" rx="1.5" fill="#8d9096" ${S}/><path d="M3 10.5h18M3 15.5h18M9 6v4.5M15 6v4.5M6 10.5v5M12 10.5v5M18 10.5v5M9 15.5V20M15 15.5V20" stroke="#b4b8be" stroke-width="1.2"/><path d="M6 6v4.5M12 6v4.5M18 6v4.5" stroke="none"/>`,
  keep: `<path d="M5 21V10h14v11z" fill="#8d9096" ${S}/><path d="M5 10V7h2.5v2h3V7h3v2h3V7H19v3" fill="#7d848e" ${S}/><path d="M12 3l4 5H8z" fill="#2f6fd6" ${S}/><rect x="10" y="15" width="4" height="6" rx="2" fill="#3a2a1a"/>`,
  arrows: `<path d="M5 19L17 7" stroke="#8a5a2b" stroke-width="2.2" stroke-linecap="round"/><path d="M14 5l6-1-1 6z" fill="#f5b800" ${S}/><path d="M5 19l2-4 2 2z" fill="#f7f7f7" ${S}/><path d="M4 8l3-3 3 3" fill="none" stroke="#3fd455" stroke-width="2" stroke-linecap="round"/>`,
  horse: `<path d="M6 20v-6c0-4 3-7 7-7l2-3 2 4c2 1 3 3 3 5v7h-4v-4H10v4z" fill="#e8d5b5" ${S}/><path d="M13 7c1-1 2-1 3 0" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="10" r="1" fill="#222"/>`,
  bridge: `<path d="M2 17c4-8 16-8 20 0" fill="none" stroke="#8a5a2b" stroke-width="3.5" stroke-linecap="round"/><path d="M4 19c4-6 12-6 16 0" fill="none" stroke="#3d9bd4" stroke-width="2.5" stroke-linecap="round"/><path d="M6 8v9M12 6v10M18 8v9" stroke="#6b4a2b" stroke-width="1.6" stroke-linecap="round"/>`,
  swords: `<path d="M5 5l10 10M19 5L9 15" stroke="#c3c8cf" stroke-width="2.6" stroke-linecap="round"/><path d="M5 5l3 .5.5 3M19 5l-3 .5-.5 3" stroke="${O}" stroke-width="1.2"/><path d="M13 15l3 3M11 15l-3 3" stroke="#c98a00" stroke-width="2.4" stroke-linecap="round"/><path d="M14 16l4 4M10 16l-4 4" stroke="#8a5a2b" stroke-width="2.4" stroke-linecap="round"/>`,
  shield: `<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" fill="#2f6fd6" ${S}/><path d="M12 6v12M7 11h10" stroke="#f5b800" stroke-width="2.2" stroke-linecap="round"/>`,
  gear: `<path d="M12 8.2A3.8 3.8 0 1 0 12 15.8 3.8 3.8 0 0 0 12 8.2z" fill="#f6ecc8" ${S}/><path d="M10.4 2.6h3.2l.5 2.4 2 .9 2.1-1.3 2.2 2.2-1.3 2.1.9 2 2.4.5v3.2l-2.4.5-.9 2 1.3 2.1-2.2 2.2-2.1-1.3-2 .9-.5 2.4h-3.2l-.5-2.4-2-.9-2.1 1.3-2.2-2.2 1.3-2.1-.9-2-2.4-.5v-3.2l2.4-.5.9-2-1.3-2.1 2.2-2.2 2.1 1.3 2-.9z" fill="#f5b800" ${S}/><circle cx="12" cy="12" r="3.6" fill="#f6ecc8" ${S}/>`,
  crown: `<path d="M4 18l-1-10 5 4 4-7 4 7 5-4-1 10z" fill="#f5b800" ${S}/><rect x="4" y="16" width="16" height="4" rx="1.5" fill="#c98a00" ${S}/><circle cx="12" cy="13" r="1.6" fill="#e8342a"/>`,
  tiara: `<path d="M4 16c2-3 3-8 4-8s1 3 4 3 3-3 4-3 2 5 4 8z" fill="#f5b800" ${S}/><rect x="4" y="15" width="16" height="3" rx="1.5" fill="#c98a00" ${S}/><circle cx="12" cy="10.5" r="1.6" fill="#9ad4ff"/>`,
  hammer: `<path d="M13 9l-8 8 2 2 8-8z" fill="#8a5a2b" ${S}/><path d="M11 4h7l2 2-1 5-4 1-3-3z" fill="#7d848e" ${S}/>`,
  expand: `<path d="M4 21v-8h9v8z" fill="#8d9096" ${S}/><path d="M4 13V10h2v2h2v-2h2v2h3v-2" fill="#7d848e" ${S}/><path d="M15 9l5-5M20 4h-4M20 4v4" fill="none" stroke="#3fd455" stroke-width="2.2" stroke-linecap="round"/>`,
  // #68: the HUD's own three. A crescent for the night counter, and a heart in two states -- the
  // empty one keeps the full one's outline so a row of five never shifts or changes weight as it
  // drains, which is the whole reason hearts read faster than a bar.
  hourglass: `<path d="M6.5 3.4h11v2.2l-4 6.4 4 6.4v2.2h-11v-2.2l4-6.4-4-6.4z" fill="#f6ecc8" ${S}/><path d="M8.6 5.6h6.8l-3.4 5.4z" fill="#f5b800"/><path d="M12 13.4l3 4.4H9z" fill="#ffd23f"/><path d="M5.6 2.6h12.8M5.6 21.4h12.8" stroke="${O}" stroke-width="2" stroke-linecap="round"/>`,
  castle: `<path d="M6 20.5V8.4h12v12.1z" fill="#f5b800" ${S}/><path d="M5 8.4V4.5h2.6v2.1h2.1V4.5h4.6v2.1h2.1V4.5H19v3.9z" fill="#ffd23f" ${S}/><path d="M10.4 20.5v-3.9a1.6 1.6 0 0 1 3.2 0v3.9z" fill="#7a4a1e"/><path d="M8.2 11.4h2.1v2.1H8.2zM13.7 11.4h2.1v2.1h-2.1z" fill="#c98a00"/>`,
  moon: `<path d="M20.5 15.2A8.6 8.6 0 0 1 9.2 3.9a8.6 8.6 0 1 0 11.3 11.3z" fill="#f5b800" ${S}/><path d="M18.4 13.6A6.6 6.6 0 0 1 10.8 6a6.6 6.6 0 1 0 7.6 7.6z" fill="#ffd23f" stroke="none"/>`,
  heart: `<path d="M12 20.4l-1.5-1.3C5.6 14.7 3 12.3 3 9.2 3 6.7 5 4.7 7.5 4.7c1.5 0 2.9.7 3.8 1.8l.7.9.7-.9c.9-1.1 2.3-1.8 3.8-1.8C19 4.7 21 6.7 21 9.2c0 3.1-2.6 5.5-7.5 9.9z" fill="#e8342a" ${S}/><path d="M7.7 7c-1 0-1.9.8-1.9 1.9 0 .5.1 1 .4 1.4" fill="none" stroke="#ff9a8f" stroke-width="1.8" stroke-linecap="round"/>`,
  heartEmpty: `<path d="M12 20.4l-1.5-1.3C5.6 14.7 3 12.3 3 9.2 3 6.7 5 4.7 7.5 4.7c1.5 0 2.9.7 3.8 1.8l.7.9.7-.9c.9-1.1 2.3-1.8 3.8-1.8C19 4.7 21 6.7 21 9.2c0 3.1-2.6 5.5-7.5 9.9z" fill="rgba(0,0,0,0.30)" ${S}/>`,
  info: `<circle cx="12" cy="12" r="10" fill="#5aa0ff" ${S}/><circle cx="12" cy="7.6" r="1.6" fill="#fff"/><path d="M10.2 10.6h3.2v6.4h1.4v1.8H9.4V17h1.4v-4.6h-.6z" fill="#fff"/>`,
  horn: `<path d="M3 11l10-5v12L3 13z" fill="#f5b800" ${S}/><path d="M13 7c4 0 7 2 7 5s-3 5-7 5" fill="none" stroke="#c98a00" stroke-width="2.4"/><circle cx="20" cy="12" r="2.2" fill="#ffd23f" stroke="#c98a00" stroke-width="1.2"/><path d="M4 12h4" stroke="#8a5a00" stroke-width="1.4"/>`,
  sack: `<path d="M9.3 3.9h5.4l-.8 4.6h-3.8z" fill="#a9763c" ${S}/><path d="M7.3 8.5h9.4c1.8 1.9 2.8 4.2 2.8 6.4 0 3.6-2.8 5.8-7.5 5.8s-7.5-2.2-7.5-5.8c0-2.2 1-4.5 2.8-6.4z" fill="#c69a5e" ${S}/><path d="M9.6 11.2c-1.1 1.3-1.7 2.9-1.7 4.4" fill="none" stroke="#ecd4a8" stroke-width="1.9" stroke-linecap="round"/><rect x="6.7" y="7.2" width="10.6" height="2.9" rx="1.45" fill="#8a5a2b" stroke="${O}" stroke-width="1.5"/>`,
  chev: `<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  star: `<path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1L3.2 9.4l6.1-.8z" fill="#ffd23f" ${S}/>`,
  speaker: `<path d="M4 9h4l5-4v14l-5-4H4z" fill="#fff" ${S}/><path d="M16 9c1.5 1.5 1.5 4.5 0 6M19 6.5c3 3 3 8 0 11" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`,
  speakerOff: `<path d="M4 9h4l5-4v14l-5-4H4z" fill="#fff" ${S}/><path d="M16 9l5 6M21 9l-5 6" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round"/>`,
  pause: `<rect x="6" y="5" width="4.5" height="14" rx="1.5" fill="#fff" ${S}/><rect x="13.5" y="5" width="4.5" height="14" rx="1.5" fill="#fff" ${S}/>`,
  home: `<path d="M5 21V10h14v11z" fill="#fff" ${S}/><path d="M5 10V7h2.5v2h3V7h3v2h3V7H19v3" fill="#fff" ${S}/><rect x="10" y="15" width="4" height="6" rx="2" fill="#2f6fd6"/>`,
  alert: `<path d="M12 3l10 17H2z" fill="#ffd23f" ${S}/><path d="M12 9v5" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17" r="1.4" fill="${O}"/>`,
  skull: `<path d="M12 3a8 8 0 0 0-8 8c0 3 2 5 4 6v3h8v-3c2-1 4-3 4-6a8 8 0 0 0-8-8z" fill="#fff" ${S}/><circle cx="9" cy="11" r="2" fill="${O}"/><circle cx="15" cy="11" r="2" fill="${O}"/><path d="M10.5 17v2M13.5 17v2" stroke="${O}" stroke-width="1.6"/>`,
  next: `<path d="M5 5l10 10M19 5L9 15" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M13 15l3 3M11 15l-3 3" stroke="#ffd23f" stroke-width="2.4" stroke-linecap="round"/>`,
  person: `<circle cx="12" cy="7" r="4" fill="#f6cfae" ${S}/><path d="M5 21c0-5 3-8 7-8s7 3 7 8z" fill="#2f6fd6" ${S}/>`,
  // An arrow round three quarters of a circle. Drawn as a dark arc with a gold one laid over it,
  // because a stroked path takes no outline of its own and the sheet rows it sits on are near-white.
  restart: `<path d="M12 4.5a7.5 7.5 0 1 0 7.5 7.5" fill="none" stroke="${O}" stroke-width="5.2" stroke-linecap="round"/><path d="M12 4.5a7.5 7.5 0 1 0 7.5 7.5" fill="none" stroke="#f5b800" stroke-width="2.6" stroke-linecap="round"/><path d="M10.6 0.4l5.2 4.1-5.2 4.1z" fill="#f5b800" ${S}/>`,
  download: `<path d="M3.5 14.5V20h17v-5.5" fill="#8a5a2b" ${S}/><path d="M12 3v9" fill="none" stroke="${O}" stroke-width="5.4" stroke-linecap="round"/><path d="M12 3.4v8.2" fill="none" stroke="#3fd455" stroke-width="2.6" stroke-linecap="round"/><path d="M6.8 10.2L12 16l5.2-5.8z" fill="#3fd455" ${S}/>`,
};

export function iconSvg(name, size = 20, cls = '') {
  const body = ICONS[name] || ICONS.star;
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}

const images = new Map();
// Rasterise an icon for canvas use (build pads). Resolves once loaded.
export function iconImage(name) {
  return images.get(name) || null;
}
export function preloadIcons() {
  return Promise.all(Object.keys(ICONS).map((name) => new Promise((resolve) => {
    const img = new Image();
    const svg = `<svg width="128" height="128" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${ICONS[name]}</svg>`;
    img.onload = () => {
      images.set(name, img);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  })));
}

// Swap every element carrying data-icon for its inline SVG.
export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = iconSvg(el.dataset.icon, Number(el.dataset.size || 20));
  });
}
