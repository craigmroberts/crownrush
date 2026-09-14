// Small shared pieces of src/game.js, split out so the modules that were cut from it can reach the
// same ones. `tmp`, `tmp2` and `tmpM` in particular are scratch values that must stay single
// instances: importing them here hands every module the same objects the one big file used.
import * as THREE from 'three';

export const V3 = THREE.Vector3;
export const tmp = new V3();
export const tmp2 = new V3();
export const tmpM = new THREE.Matrix4();
export const HAIR = [0x5a3416, 0x2a1e16, 0x8a5a2b, 0x1c1c22, 0x6b3f1d];
export const cap = (t) => t[0].toUpperCase() + t.slice(1);
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// pad look by what it does (see drawPad in models.js)
export const PAD_STYLE = {
  build: { shape: 'square', rim: '#ffffff', tag: 'BUILD' },
  recruit: { shape: 'circle', rim: '#7fc8ff', tag: 'RECRUIT' },
  crew: { shape: 'circle', rim: '#7fc8ff', tag: 'CREW' },
  trade: { shape: 'circle', rim: '#ffd23f', tag: 'TRADE' },
  feed: { shape: 'circle', rim: '#9cf07a', tag: 'FEED' },
  upgrade: { shape: 'circle', rim: '#d59bff', tag: 'UPGRADE' },
};
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
