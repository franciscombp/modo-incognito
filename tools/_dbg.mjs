import { chromium } from "playwright";
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium", args:["--no-sandbox","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport:{width:1280,height:720} });
await p.goto("http://localhost:4173/",{waitUntil:"domcontentloaded",timeout:60000});
await p.waitForFunction(()=>!!window.__game,null,{timeout:30000});
await p.evaluate(()=>{window.__game.engine.startDay(0,{skipMinigame:true});});
await p.waitForFunction(()=>!!window.__game.engine.game,null,{timeout:90000});
console.log(JSON.stringify(await p.evaluate(()=>{
  const g=window.__game.engine.game;
  window.__game.engine.dialogue.close?.();
  g.setPaused(false); g.clearGate();
  const m=g.minions[0];
  for(const o of g.minions) if(o!==m) o.setActive(false);
  g.boss.resetToPatrol(); g.boss.position.x=g.player.position.x+80;
  g.suspicion=0; g.boss.suspicion=0;
  const sitio=window.__floorplan.safeSpots.find(s=>s.kind==="desk");
  g.player.position.x=sitio.x; g.player.position.z=sitio.z;
  m.position.x=sitio.x+1.5; m.position.z=sitio.z; m.localHeat=1;
  g.player.keys.add(" ");
  const t=[];
  for(let i=0;i<180;i++){ if(g.paused)g.setPaused(false); g.update(1/60);
    if(i%20===0||i===179) t.push({i, st:m.state, heat:+m.localHeat.toFixed(2),
      d:+Math.hypot(m.position.x-sitio.x,m.position.z-sitio.z).toFixed(2),
      tgt:m.investigateTarget?`${m.investigateTarget.x.toFixed(1)},${m.investigateTarget.z.toFixed(1)}`:null,
      timer:+(m.investigateTimer??0).toFixed(1), mov:m._actuallyMoving, doing:g.player.isDoingActivity});}
  return {sitio:`${sitio.x.toFixed(1)},${sitio.z.toFixed(1)}`, t};
})));
await b.close();
