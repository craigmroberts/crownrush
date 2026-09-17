import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const ROOT='/home/user/crownrush', PORT=4493;
function findChromium(){const b=process.env.PLAYWRIGHT_BROWSERS_PATH;
  for(const d of readdirSync(b).filter(x=>x.startsWith('chromium')).sort().reverse())
    for(const r of ['chrome-linux/chrome','chrome-linux/headless_shell']){const p=join(b,d,r); if(existsSync(p))return p;}}
const srv=spawn('npx',['vite','preview','--port',String(PORT),'--strictPort'],{cwd:ROOT,stdio:['ignore','pipe','pipe'],detached:true});
const stop=()=>{try{process.kill(-srv.pid,'SIGKILL');}catch{}}; process.on('exit',stop);
await new Promise((ok,f)=>{const t=setTimeout(()=>f(new Error('no preview')),30000);
  srv.stdout.on('data',d=>{if(/localhost:/.test(String(d))){clearTimeout(t);ok();}});});
const browser=await chromium.launch({executablePath:findChromium(),
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page = await (await browser.newContext({viewport:{width:900,height:600}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(`http://localhost:${PORT}/?tour`,{waitUntil:'load'});
await page.waitForFunction(()=>window.game&&window.game.hud,null,{timeout:60000});
await page.evaluate(()=>window.game.start());
const step=async(n)=>{const f=await page.evaluate(()=>window.game.frames||0);
  await page.waitForFunction(t=>(window.game.frames||0)>=t,f+n,{timeout:180000});};
await step(12);
const out = await page.evaluate(async () => {
  const g = window.game;
  // stand in the biggest wood
  let best = null;
  g.scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !(o.material.userData && o.material.userData.isSway)) return;
    o.geometry.computeBoundingSphere();
    const b = o.geometry.boundingSphere;
    const t = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    if (t < 400) return;
    if (!best || t > best.t) best = { x: b.center.x, z: b.center.z, t };
  });
  g.king.mesh.position.set(best.x, 0, best.z + 16);
  g.queen.mesh.position.set(best.x + 2, 0, best.z + 17);
  g.dayPhase = 0.30;
  g.running = false;                         // freeze everything but the wind
  // settle the camera FIRST: it eases toward the King, so calling it between shots moves the whole
  // frame and every pixel reads as "changed"
  for (let i = 0; i < 60; i++) g.updateCamera(0.5);
  const shot = (v) => {
    g.world.sway.value = v;
    g.renderer.render(g.scene, g.camera);
    const c = document.createElement('canvas');
    c.width = g.renderer.domElement.width; c.height = g.renderer.domElement.height;
    c.getContext('2d').drawImage(g.renderer.domElement, 0, 0);
    return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  };
  const a = shot(0);
  const b2 = shot(Math.PI);
  const c3 = shot(0);            // back to where we started: should match `a` exactly
  const big = shot(37.0);        // a value no tuning could hide: if this is identical, the uniform is not wired
  let movedBig = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - big[i]) > 6 || Math.abs(a[i+1] - big[i+1]) > 6) movedBig++;
  const held = (() => { g.world.sway.value = 12.5; return g.world.sway.value; })();
  let movedAB = 0, movedAC = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b2[i]) > 6 || Math.abs(a[i+1] - b2[i+1]) > 6) movedAB++;
    if (Math.abs(a[i] - c3[i]) > 6 || Math.abs(a[i+1] - c3[i+1]) > 6) movedAC++;
  }
  return { wood: { x: Math.round(best.x), z: Math.round(best.z), tris: best.t },
           pixels: a.length / 4,
           changedByWind: movedAB, changedWhenWindReturns: movedAC, changedByHugeWind: movedBig,
           writeHeld: held,
           swayIsWorldSway: g.world && g.world.sway ? typeof g.world.sway.value : 'missing' };
});
console.log(JSON.stringify(out, null, 1));
console.log(errs.length ? errs.slice(0,3) : 'no errors');
await browser.close(); stop(); process.exit(0);
