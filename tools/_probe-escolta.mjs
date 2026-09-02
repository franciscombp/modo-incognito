import { chromium } from "playwright";
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium", args:["--no-sandbox","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport:{width:1280,height:720} });
p.on("pageerror", e=>console.log("PAGEERROR:", String(e).slice(0,160)));
await p.goto("http://localhost:4173/", { waitUntil:"domcontentloaded", timeout:60000 });
await p.waitForFunction(()=>!!window.__game,null,{timeout:30000});
await p.evaluate(()=>{ window.__game.engine.startDay(0,{skipMinigame:true}); });
await p.waitForFunction(()=>!!window.__game.engine.game,null,{timeout:30000});
for(let i=0;i<40;i++){ if(!(await p.evaluate(()=>window.__game.engine.dialogue.isOpen))) break; await p.keyboard.press("Space"); await p.waitForTimeout(120); }
await p.evaluate(()=>{ const g=window.__game.engine.game; g.setPaused(false); g.clearGate(); });
// Muestrear TODA la escolta y lo que viene después
const serie = await p.evaluate(async ()=>{
  const g=window.__game.engine.game; const sp=g.player.sprite; const out=[];
  for(let i=0;i<110;i++){
    out.push({t:+(i*0.25).toFixed(2),
      yaw:+(sp.object?.rotation?.y??0).toFixed(2),
      tgt:+(sp._targetYaw??0).toFixed(2),
      esc:!!g._esperandoPuesto, walk:!!g.player.walkTo,
      mov:!!sp._moving, pose:g.player.pose??null});
    await new Promise(r=>setTimeout(r,250));
  }
  return out;
});
// Contar VUELTAS: suma de |delta| normalizado
let giro=0; for(let i=1;i<serie.length;i++){ let d=serie[i].yaw-serie[i-1].yaw; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI; giro+=Math.abs(d); }
console.log(serie.filter((_,i)=>i%4===0).map(m=>`t${m.t} yaw=${m.yaw} tgt=${m.tgt} esc=${m.esc?1:0} walk=${m.walk?1:0} mov=${m.mov?1:0} pose=${m.pose}`).join("\n"));
console.log("\nGIRO TOTAL acumulado:", (giro/(2*Math.PI)).toFixed(2), "vueltas en", (serie.length*0.25).toFixed(0)+"s");
// ¿sigue girando al final?
const fin=serie.slice(-20); let g2=0; for(let i=1;i<fin.length;i++){let d=fin[i].yaw-fin[i-1].yaw; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI; g2+=Math.abs(d);}
console.log("GIRO en los ultimos 5s:", (g2/(2*Math.PI)).toFixed(2), "vueltas");
await b.close();
