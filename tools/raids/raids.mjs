#!/usr/bin/env node
// #218: WHAT A NIGHT'S RAID WEIGHS, with the camps standing and with them broken.
//
// The ticket asks for "a run where no camp is ever touched and a run where one is broken every day,
// both to about night 10, comparing the size and direction count of each night's raid". This does
// the comparison without playing the runs, and the reason is written in CLAUDE.md: wall clock is not
// game time here -- a frame is about a second under SwiftShader and `dt` is capped -- so ten nights
// of real play is hours, and a bot crude enough to survive them would not be playing the game the
// question is about.
//
// So it drives the wave assembler directly at each raid night and reads what comes out. That is the
// thing this ticket changes, and it is the thing a run would have been used to measure anyway.
//
// EVERY CELL IS THE MEAN OF NINE. The raid rolls ranks, shuffles its list and jitters every bearing,
// so a single assembly says almost nothing -- the first version of this table moved by 15% between
// runs on numbers that had not changed.
//
//     node tools/raids/raids.mjs
//
// What to look for: `all/standing` should sit near the floor the config predicts (1 - count * share,
// so 40% with three camps at 0.2), the opening nights should read 100% because no camp is active
// yet, and `sides` should fall when camps are broken -- a night from fewer directions is most of
// what the player actually feels.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const TYPES={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.glb':'model/gltf-binary','.ico':'image/x-icon'};
const ROOT='/home/user/crownrush/dist';
const srv=createServer(async(req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';
 try{const b=await readFile(join(ROOT,normalize(p)));res.writeHead(200,{'content-type':TYPES[extname(p)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end('no');}});
await new Promise(r=>srv.listen(8171,r));
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page=await br.newPage({viewport:{width:500,height:400}});
page.on('pageerror',e=>console.log('  PAGEERROR',e.message));
await page.goto('http://localhost:8171/?tour&seed=0',{waitUntil:'load',timeout:220000});
await page.waitForFunction(()=>window.game&&window.game.camps,null,{timeout:220000});
console.log(await page.evaluate(()=>{
  const g=window.game;
  // Assemble night N with a given set of camps cleared, and read the queue. Everything that makes
  // the raid random is left alone -- ranks roll, angles jitter -- so each cell is the mean of 9.
  const measure=(night, clearedCount)=>{
    let n=0, dirs=0;
    const RUNS=9;
    for (let r=0;r<RUNS;r++){
      g.spawnQueue.length=0;
      g.enemies.length=0;
      g.wave=night-1;
      g.baseLevel=Math.min(13, 1+Math.floor(night*0.9));
      g.camps.forEach((c,i)=>{ c.cleared = i < clearedCount; c.clearedOn = night; });
      g.hud.toast=()=>{};
      g.startWave();
      n += g.spawnQueue.length;
      // how many distinct bearings the queue actually arrived on, binned at 30 degrees
      // Binned at 90 degrees -- SIDES, not bearings. The assembler jitters every raider by up to
      // +/-0.5 rad (29 degrees) around its party's angle, so a 30-degree bin spread one party over
      // two or three of them and reported "2.3 directions" for a night that has exactly one. What a
      // player defends is a side of the village, so that is the unit.
      const bins=new Set();
      for (const q of g.spawnQueue) bins.add(((Math.round(Math.atan2(q.z,q.x)*180/Math.PI/90) % 4) + 4) % 4);
      dirs += bins.size;
    }
    return {n:+(n/RUNS).toFixed(1), dirs:+(dirs/RUNS).toFixed(1)};
  };
  const rows=[];
  for (const night of [1,2,3,5,6,8,9,12,15,20]) {
    const a=measure(night,0), b=measure(night,1), c=measure(night,3);
    rows.push(`night ${String(night).padEnd(3)} standing: ${String(a.n).padEnd(6)} (${a.dirs} sides)`
      + ` | one broken: ${String(b.n).padEnd(6)} (${b.dirs})`
      + ` | all broken: ${String(c.n).padEnd(6)} (${c.dirs})`
      + ` | all/standing ${(c.n/a.n*100).toFixed(0)}%`);
  }
  return rows.join('\n');
}));
await br.close();srv.close();
