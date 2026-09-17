import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT='/home/user/crownrush', PORT=4492;
const OUT='/tmp/claude-0/-home-user-crownrush/947efa91-0c66-5421-af7d-8d27fc2bd204/scratchpad/wind';
mkdirSync(OUT,{recursive:true});
function findChromium(){const b=process.env.PLAYWRIGHT_BROWSERS_PATH;
  for(const d of readdirSync(b).filter(x=>x.startsWith('chromium')).sort().reverse())
    for(const r of ['chrome-linux/chrome','chrome-linux/headless_shell']){const p=join(b,d,r); if(existsSync(p))return p;}}
const srv=spawn('npx',['vite','preview','--port',String(PORT),'--strictPort'],{cwd:ROOT,stdio:['ignore','pipe','pipe'],detached:true});
const stop=()=>{try{process.kill(-srv.pid,'SIGKILL');}catch{}}; process.on('exit',stop);
await new Promise((ok,f)=>{const t=setTimeout(()=>f(new Error('no preview')),30000);
  srv.stdout.on('data',d=>{if(/localhost:/.test(String(d))){clearTimeout(t);ok();}});});
const browser=await chromium.launch({executablePath:findChromium(),
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page = await (await browser.newContext({viewport:{width:1100,height:680}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await page.goto(`http://localhost:${PORT}/?tour`,{waitUntil:'load'});
await page.waitForFunction(()=>window.game&&window.game.hud,null,{timeout:60000});
await page.evaluate(()=>window.game.start());
const step=async(n)=>{const f=await page.evaluate(()=>window.game.frames||0);
  await page.waitForFunction(t=>(window.game.frames||0)>=t,f+n,{timeout:180000});};
await step(14);

const mech = await page.evaluate(() => {
  const g = window.game;
  const sway = [], std = [];
  g.scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (o.material.userData && o.material.userData.isSway) sway.push(o);
    else if (o.material.vertexColors && o.material.type === 'MeshStandardMaterial') std.push(o);
  });
  const tris = (a) => a.reduce((s, o) => s + (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3, 0);
  // how many distinct phases inside one merged cell? one per tree, if phaseize worked
  let phases = 0, sample = null;
  if (sway.length) {
    const biggest = sway.slice().sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
    const uv = biggest.geometry.attributes.uv;
    const set = new Set();
    for (let i = 0; i < uv.count; i++) set.add(Math.round(uv.getX(i) * 1000));
    phases = set.size;
    sample = [...set].slice(0, 4).map((v) => v / 1000);
  }
  // find a wood near the middle of the map to look at
  let best = null;
  for (const o of sway) {
    o.geometry.computeBoundingSphere();
    const b = o.geometry.boundingSphere;
    if (!b) continue;
    const t = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    if (t < 400) continue;                       // skip cells holding one bush
    if (!best || t > best.t) best = { x: Math.round(b.center.x), z: Math.round(b.center.z), t };
  }
  return { swayMeshes: sway.length, swayTris: Math.round(tris(sway)),
           stdMeshes: std.length, stdTris: Math.round(tris(std)),
           distinctPhasesInBiggestCell: phases, samplePhases: sample, wood: best };
});

await page.evaluate(([x, z]) => {
  const g = window.game;
  g.king.mesh.position.set(x, 0, z + 16);
  g.queen.mesh.position.set(x + 2, 0, z + 13);
  g.dayPhase = 0.30;
}, [mech.wood.x, mech.wood.z]);
await step(22);
// freeze everything except the wind, and take the extremes of one cycle
for (const [name, v] of [['calm', 0], ['gust', Math.PI]]) {
  await page.evaluate((val) => { window.game.running = false; window.game.world.sway.value = val; }, v);
  await page.waitForTimeout(1500);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
}
console.log(JSON.stringify(mech, null, 1));
console.log(errs.length ? errs.slice(0, 3) : 'no errors');
await browser.close(); stop(); process.exit(0);
