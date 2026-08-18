import { chromium } from "playwright";
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium", args:["--no-sandbox","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport:{width:1280,height:720} });
await p.goto("http://localhost:4173/",{waitUntil:"domcontentloaded",timeout:60000});
await p.waitForFunction(()=>!!window.__game,null,{timeout:30000});
await p.waitForTimeout(1500);
// Jugar -> hoja de vida
const jugar = p.locator(".inc-menu button", {hasText:"JUGAR"}).first();
await jugar.click().catch(()=>{});
await p.waitForTimeout(900);
await p.screenshot({path:"/tmp/shot-cv.png"});
// entrar a una ranura -> selección de personaje
const slot = p.locator(".inc-cv-card, .inc-cv-grid > *").first();
await slot.click().catch(()=>{});
await p.waitForTimeout(1200);
await p.screenshot({path:"/tmp/shot-personaje.png"});
console.log(await p.evaluate(()=>[...document.querySelectorAll(".inc-menu-pane:not(.inc-hidden)")].map(e=>e.className)));
await b.close();
