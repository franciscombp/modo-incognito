/**
 * NADIE PIRUETEA. El cuerpo gira hacia donde VA, y eso no da vueltas.
 *
 * ── El fallo ──
 *
 * Reportado como «cuando se sienta empieza a dar vueltas». No era al sentarse:
 * era TODO el trayecto de la escolta del día 1. Medido, la jugadora acumulaba
 * **3,6 vueltas sobre sí misma en catorce segundos**, con SEIS inversiones de
 * rumbo de más de 90° — cuatro de ellas de 180° clavados.
 *
 * Y no era una sola causa:
 *
 *  · SEGUIR A UN CUERPO A CORTA DISTANCIA. La escolta apuntaba al CENTRO de
 *    Gabo. La jugadora lo rebasaba, el paseo se cancelaba al cruzar el radio
 *    de seguimiento, él seguía andando — y el rumbo hacia él se daba la
 *    vuelta. Las cuatro inversiones de 180° caían justo en ese radio (1,3-2,7
 *    unidades). Ahora se camina por su ESTELA, un paso por detrás sobre la
 *    línea que él mismo recorre: no hay nada que rebasar.
 *  · UN SOLO VECTOR PARA ANDAR Y PARA MIRAR. Al bordear un obstáculo, el
 *    caminante mezcla costado (0.9) con rumbo (0.45), así que un cambio de
 *    lado es casi media vuelta — y el cuerpo la hacía. Ahora `paso()` devuelve
 *    `dir` (por dónde se anda) y `mirar` (hacia dónde se mira), que no son lo
 *    mismo: esquivar es andar de lado sin dejar de mirar a donde vas.
 *  · Y LOS VOLANTAZOS DE UN CUADRO, que son ruido y no intención.
 *
 * ── Por qué una prueba, y por qué mide ÁNGULO ACUMULADO ──
 *
 * Una captura no lo ve: en una imagen fija un muñeco girado se ve igual de
 * bien que uno derecho. Y mirar «el rumbo final» tampoco sirve — al terminar
 * queda perfecto, porque el problema es el CAMINO, no el destino. Lo único que
 * distingue caminar de piruetear es cuánto giro se acumula por el camino.
 *
 * Uso: npm run check:giros   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));

let fallos = 0;
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });

// LA CÁMARA SE ORBITA A PROPÓSITO ANTES DE EMPEZAR. Su yaw por defecto es 0,
// y el de un muñeco recién montado también: con los dos a cero, «la jugadora
// mira a cámara» se cumple sola y la comprobación del soliloquio pasaría en
// verde con el giro roto. Con la cámara a 35° el ángulo es uno concreto que
// nadie acierta por casualidad. Se devuelve a su sitio antes de medir el
// paseo. (`camera.settings` ES el objeto de cameraSettings.js, no una copia,
// así que `getCameraSettings()` ve el cambio — que es lo que se quiere.)
const YAW_PRUEBA = 35;
await p.evaluate((deg) => {
  window.__game.camera.settings.yawDeg = deg;
}, YAW_PRUEBA);

await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 60000 });

// ── LAS CINEMÁTICAS SE VEN MIENTRAS DURAN ───────────────────────────────
//
// El guion de apertura pasa CON LA PARTIDA EN PAUSA, y ahí está la trampa de
// toda esta familia: el giro normal de un cuerpo es un TWEEN que avanza en
// `update()`, y en pausa ese update no corre. O sea que una escena que pida
// «gírate» con el giro normal no gira a nadie mientras dura — y se cobra el
// giro de golpe AL REANUDAR, con la escena ya terminada. Desde fuera eso es
// exactamente el reporte original: alguien que se da la vuelta solo.
//
// Por eso las escenas COLOCAN (`setHeading(..., {snap:true})`) y el juego
// tuenea. Se mide línea a línea, con la caja abierta, que las tres escenas de
// la apertura cumplan lo que dicen.
const AJUSTE = 0.02; // rad; snap escribe el ángulo exacto, no se aproxima
// El guion abre unos cuadros DESPUÉS de que exista `game` (engine.js lo juega
// al final de `startDay`). Sin esperarlo, el bucle de abajo no ve la caja
// abierta, sale a la primera y las tres comprobaciones se quedan sin muestras
// — o sea, pasando por no haber mirado.
await p
  .waitForFunction(() => window.__game.engine.dialogue.isOpen, null, { timeout: 30000 })
  .catch(() => {});
const escena = [];
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  escena.push(
    await p.evaluate(() => {
      const g = window.__game.engine.game;
      const b = g.boss;
      const yaw = (o) => o?.sprite?.object?.rotation?.y ?? null;
      const entre = Math.atan2(b.position.x - g.player.position.x, b.position.z - g.player.position.z);
      return {
        quien: document.querySelector(".inc-dialogue-speaker-text")?.textContent?.trim() ?? "",
        jugadora: yaw(g.player),
        jefe: yaw(b),
        camara: (window.__game.camera.settings.yawDeg * Math.PI) / 180,
        jefeDeclarado: b.facingDir ? Math.atan2(b.facingDir.x, b.facingDir.z) : null,
        entre,
        // El motor encuadra a dos si están a menos de 8·S (engine.js). Aquí se
        // usa un listón MÁS CORTO a propósito: no se trata de replicar su
        // umbral —copiar una constante del motor en la prueba es tenerla dos
        // veces— sino de quedarse con las líneas en las que los dos cuerpos
        // están juntos sin discusión. En la apertura están a ~1,5.
        dist: Math.hypot(b.position.x - g.player.position.x, b.position.z - g.player.position.z),
      };
    })
  );
  await p.keyboard.press("Space");
  await p.waitForTimeout(120);
}

/** Diferencia de dos ángulos, envuelta a [0, π]. */
function dif(a, b) {
  if (a == null || b == null) return Infinity;
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

// 1. GABO MIRA AL ASCENSOR ANTES DE QUE NADIE REANUDE. `waitAt` lo PLANTA en
//    la puerta (posición al instante, que eso ya estaba) pero el rumbo iba con
//    el giro normal: aparecía mirando al punto 0 de su ronda y se destorcía al
//    empezar a jugar. Se mide en la primera línea, con el guion en pantalla.
const puerta = escena[0];
check(
  "el jefe que te recibe en la puerta MIRA hacia donde dice que mira",
  puerta != null && dif(puerta.jefe, puerta.jefeDeclarado) < AJUSTE,
  puerta ? `malla en ${puerta.jefe?.toFixed(2)} rad, rumbo declarado ${puerta.jefeDeclarado?.toFixed(2)}` : "no hubo guion"
);

// 2. EL SOLILOQUIO ROMPE LA CUARTA PARED **DURANTE** LA ESCENA. Las líneas de
//    la jugadora («Tú») son soliloquio: `faceCamera` la gira a cámara. Iba sin
//    snap, así que no giraba nada mientras hablaba y se giraba después.
const soliloquios = escena.filter((s) => s.quien === "Tú");
const soliloquiosOk = soliloquios.filter((s) => dif(s.jugadora, s.camara) < AJUSTE);
check(
  "en un soliloquio la jugadora está de cara a cámara MIENTRAS habla",
  soliloquios.length > 0 && soliloquiosOk.length === soliloquios.length,
  soliloquios.length === 0
    ? "el guion de apertura no trajo ninguna línea de la jugadora"
    : `${soliloquiosOk.length}/${soliloquios.length}; ej. cuerpo ${soliloquios[0].jugadora?.toFixed(2)} vs cámara ${soliloquios[0].camara.toFixed(2)}`
);

// 3. Y HABLANDO DE A DOS, SE MIRAN. Es lo mismo por la otra puerta
//    (`faceEachOther`): sin snap, Gabo le hablaba a la nuca toda la escena.
const duos = escena.filter((s) => s.quien && s.quien !== "Tú" && s.dist < 5);
const duosOk = duos.filter(
  (s) => dif(s.jugadora, s.entre) < AJUSTE && dif(s.jefe, s.entre + Math.PI) < AJUSTE
);
check(
  "y hablando de a dos, los dos cuerpos se miran de frente",
  duos.length > 0 && duosOk.length === duos.length,
  duos.length === 0
    ? "el guion de apertura no trajo ninguna línea del jefe"
    : `${duosOk.length}/${duos.length}`
);

// La cámara vuelve a su sitio: lo que viene mide un PASEO, y no tiene por qué
// heredar un encuadre girado a mano.
await p.evaluate(() => {
  window.__game.camera.settings.yawDeg = 0;
});

// Se espía `setHeading`, que es LA puerta por la que se le dice al muñeco
// hacia dónde mirar. Medir la rotación del objeto en su lugar mezclaría el
// tween (que suaviza) con la orden, y lo que se viene a juzgar es la orden.
await p.evaluate(() => {
  const g = window.__game.engine.game;
  const sp = g.player.sprite;
  window.__H = [];
  const original = sp.setHeading.bind(sp);
  sp.setHeading = (dx, dz, opt) => {
    window.__H.push([dx, dz]);
    return original(dx, dz, opt);
  };
  g.setPaused(false);
  g.clearGate();
});

// La escolta entera, en tiempo real: es una cinemática y dura lo que dura.
await p.waitForTimeout(14000);

const giros = await p.evaluate(() => {
  const H = window.__H;
  let bruscos = 0;
  let acumulado = 0;
  for (let i = 1; i < H.length; i++) {
    const a = H[i - 1];
    const c = H[i];
    const cos = Math.max(-1, Math.min(1, a[0] * c[0] + a[1] * c[1]));
    const ang = Math.acos(cos);
    acumulado += ang;
    if (ang > Math.PI / 2) bruscos++;
  }
  return {
    muestras: H.length,
    bruscos,
    vueltas: +(acumulado / (2 * Math.PI)).toFixed(2),
  };
});

check(
  "la escolta llega a mover a la jugadora (si no, no hay nada que medir)",
  giros.muestras >= 15,
  JSON.stringify(giros)
);

// EL UMBRAL ES GENEROSO A PROPÓSITO. La ronda del jefe tiene azar, así que
// exigir un número fino sería una prueba a cara o cruz — la lección de
// `check:chase`. Lo que se caza aquí es la PIRUETA: medido, el fallo daba 3,6
// vueltas y seis inversiones; arreglado da entre 1,0 y 1,5 vueltas y dos o
// tres. Un tope de 2,4 deja pasar la variación y suspende si vuelve aquello.
check(
  "y no pirueta por el camino (giro acumulado bajo control)",
  giros.vueltas <= 2.4,
  `${giros.vueltas} vueltas acumuladas en 14 s`
);
check(
  "sin inversiones de rumbo en cadena",
  giros.bruscos <= 4,
  `${giros.bruscos} cambios de más de 90°`
);

// ── Y AL SENTARSE, QUIETA ──
// El remate de la cinemática: sentada mirando a su mesa y sin moverse más. Es
// donde el reporte decía que empezaba el baile, así que se mide expresamente.
const sentada = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sp = g.player.sprite;
  const yaw = () => sp.object?.rotation?.y ?? 0;
  // Se la deja terminar de sentarse.
  for (let i = 0; i < 60 && g._esperandoPuesto; i++) await new Promise((r) => setTimeout(r, 250));

  // SE ESPERA A QUE EL GIRO SE ASIENTE, no a un reloj. Sentarse termina con
  // una vuelta legítima —ponerse de cara a la mesa— que el motor TUENEA, no
  // teletransporta. Midiendo a un plazo fijo se le pilla a mitad de ese giro
  // y se informa como si estuviera pirueteando: la primera versión de esto
  // reportaba 62° «sin tocar nada» que eran, sencillamente, la jugadora
  // acabando de girarse hacia su escritorio.
  let quieto = 0;
  let previo = yaw();
  let esperado = 0;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 100));
    esperado += 0.1;
    const ahora = yaw();
    quieto = Math.abs(ahora - previo) < 0.004 ? quieto + 1 : 0;
    previo = ahora;
    if (quieto >= 5) break;
  }

  // Y AHORA SÍ: asentada, tiene que quedarse quieta.
  const yaws = [];
  for (let i = 0; i < 20; i++) {
    yaws.push(yaw());
    await new Promise((r) => setTimeout(r, 120));
  }
  let mov = 0;
  for (let i = 1; i < yaws.length; i++) {
    let d = yaws[i] - yaws[i - 1];
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    mov += Math.abs(d);
  }
  return {
    grados: +((mov * 180) / Math.PI).toFixed(1),
    tardoEnAsentarse: +esperado.toFixed(1),
    seAsento: quieto >= 5,
  };
});
check(
  "el giro de sentarse SE ASIENTA (no se queda girando)",
  sentada.seAsento === true,
  `seguía girando tras ${sentada.tardoEnAsentarse}s`
);
check(
  "y ya asentada el cuerpo se queda QUIETO",
  sentada.grados < 5,
  `${sentada.grados}° de giro en 2,4 s sin tocar nada`
);

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nSe camina y se sienta sin dar vueltas"
    : `\n${fallos} fallo(s): alguien pirueta`
);
process.exit(fallos === 0 ? 0 : 1);
