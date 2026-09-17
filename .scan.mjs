import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const ROOT='/home/user/crownrush', PORT=4482;
const OUT='/tmp/claude-0/-home-user-crownrush/947efa91-0c66-5421-af7d-8d27fc2bd204/scratchpad/scenery';
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
const tag = process.argv[2] || 'x';
const page = await (await browser.newContext({viewport:{width:1100,height:680}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await page.goto(`http://localhost:${PORT}/?tour`,{waitUntil:'load'});
await page.waitForFunction(()=>window.game&&window.game.hud,null,{timeout:60000});
await page.evaluate(()=>window.game.start());
const step=async(n)=>{const f=await page.evaluate(()=>window.game.frames||0);
  await page.waitForFunction(t=>(window.game.frames||0)>=t,f+n,{timeout:180000});};
await step(14);
const shots = [['village',0,8],['forest',30,34],['edge',-40,40]];
const res = [];
for (const [name,x,z] of shots) {
  await page.evaluate(([xx,zz])=>{ const g=window.game;
    g.king.mesh.position.set(xx,0,zz); g.queen.mesh.position.set(xx+2,0,zz+1); g.dayPhase=0.30; }, [x,z]);
  await step(20);
  const r = await page.evaluate(() => {
    const g = window.game, i = g.renderer.info.render;
    let baked = 0;
    g.scene.traverse((o)=>{ if(o.isMesh && !o.isInstancedMesh && o.material.vertexColors && o.material.type==='MeshStandardMaterial') baked++; });
    return { calls: i.calls, triangles: i.triangles, bakedMeshes: baked };
  });
  res.push([name, r]);
  await page.screenshot({path:`${OUT}/${tag}-${name}.png`});
}
for (const [n,r] of res) console.log(`${tag} ${n.padEnd(8)} calls ${String(r.calls).padStart(4)}  tris ${String(r.triangles).padStart(8)}  baked meshes in scene ${r.bakedMeshes}`);
console.log(errs.length ? errs.slice(0,3) : 'no errors');
await browser.close(); stop(); process.exit(0);
