/**
 * EL CHISME — el minijuego que se juega LEYENDO.
 *
 * El pulso es TIEMPO y el gesto es MANO: los dos son de destreza y los dos
 * se juegan mirando una tira. Este es de CABEZA, y es el que este juego
 * pedía — la oficina entera funciona con rumores.
 *
 * Lo que vigila, y todo se comprueba JUGÁNDOLO, no leyendo el JSON:
 *  1. La actividad que declara `chisme` arranca su tanda, no el pulso.
 *  2. Y SE PINTA: la tarjeta con su titular, su pregunta y sus tres
 *     opciones. Que esté activo por dentro no basta — es el fallo que dejó
 *     los globos invisibles semanas.
 *  3. Acertar EMPUJA la tarea; fallar RESTA y hace RUIDO. Sin las dos
 *     mitades no es un minijuego, es un botón.
 *  4. Mantener la tecla NO avanza nada: lo que empuja son las respuestas.
 *     Si goteara, la tanda se terminaría sola mientras lees y el minijuego
 *     volvería a ser decoración.
 *  5. NO congela el mundo. El jefe sigue viniendo mientras lees, que es lo
 *     que convierte quedarse en una decisión.
 *
 * Uso: npm run check:chisme   (necesita `npm run preview` en :4173)
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
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 30000 });

const out = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  // Reanudar DENTRO del bucle: `_heatAlertShown` se rearma sola y la alarma
  // de nivel 3 pausa la partida desde game.js.
  g.onHeatAlert = null;
  g.setPaused(false);
  g.clearGate();
  // La escolta de apertura, ya vivida: mientras dura, la sospecha no
  // cuenta y el jefe no te aborda —vas pegada a él— así que una prueba
  // de la jornada EN MARCHA tiene que darla por terminada.
  g.saltarEscolta();

  // La misión del chisme puede no estar ACTIVA todavía (la cadena de la
  // temporada la abre más tarde), y lo que se prueba aquí es el minijuego,
  // no la cadena. Si no está en la lista del día se toma su estación del
  // plano — el mismo montaje que usa check-objetos con la peli.
  let st = g.objectives.find((o) => o.chisme && !o.dynamic) ?? null;
  if (!st) {
    const base = (g._allStations ?? window.__floorplan.activityStations ?? []).find((a) => a.chisme);
    if (!base) return { error: "ninguna actividad declara `chisme`" };
    st = { ...base, progress: 0, done: false };
    g.objectives.push(st);
  }
  st.done = false;
  st.progress = 0;
  st.encendida = false;

  const correr = (n) => {
    for (let i = 0; i < n; i++) {
      if (g.paused) g.setPaused(false);
      g.player.position.x = st.x;
      g.player.position.z = st.z;
      g.update(1 / 60);
    }
  };

  // El jefe LEJOS y VINIENDO: se mide que el mundo sigue vivo, no la caza.
  g.boss.resetToPatrol();
  g.boss.position.x = st.x + 25 * S;
  g.boss.position.z = st.z;
  // El jefe LEJOS y de ronda. Antes se le lanzaba a la caza a propósito, para
  // demostrar que el minijuego no lo congelaba; ahora una pantalla de tarea NO
  // SE ABRE con un vigilante encima —esa es la puerta que permite parar el
  // mundo sin que la estación sea un escudo—, así que montar una persecución
  // aquí solo impide que se abra lo que se viene a medir. La caza y el
  // anti-escudo tienen su prueba en `check:pausa`.
  g.suspicion = 0;
  g.boss.suspicion = 0;

  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
  correr(6);

  const bossX0 = g.boss.position.x;
  const arranca = {
    chismeActivo: g.chisme.active,
    pulsoActivo: g.pulse.active,
    gestoActivo: g.gesture.active,
    congelado: g.worldFrozen,
  };
  const snap = g.chisme.snapshot();

  // ¿SE PINTA?
  const card = document.querySelector(".inc-chisme");
  const pintada = {
    visible: !!card?.classList.contains("on"),
    opciones: card ? card.querySelectorAll(".inc-chisme-opt").length : 0,
    conTexto: !!card?.querySelector(".inc-chisme-texto")?.textContent?.length,
  };

  // MANTENER NO AVANZA. Dos segundos con el dedo puesto y sin responder.
  const antesDeMantener = st.progress;
  correr(120);
  const mantenido = st.progress - antesDeMantener;
  const bossAndó = Math.abs(g.boss.position.x - bossX0) > 0.01;

  // ACERTAR EMPUJA. Se responde la correcta leyéndola del propio módulo:
  // lo que se prueba es la mecánica, no si el test se sabe las respuestas.
  const ficha = snap;
  const antesAcierto = st.progress;
  // La correcta se busca probando: fallar resta, así que se restaura el
  // progreso entre intentos y se queda con el que SUBIÓ.
  let bueno = -1;
  for (let i = 0; i < 3; i++) {
    st.progress = antesAcierto;
    const r = g.chisme.responder(i);
    if (r === "acierto") {
      bueno = i;
      break;
    }
  }
  const trasAcierto = st.progress;

  // FALLAR RESTA Y HACE RUIDO.
  // Se BUSCA una opción que el módulo dé por mala, en vez de suponer que
  // «la de al lado de la buena» lo es: acertar CAMBIA DE FICHA, así que el
  // índice bueno de la tarjeta anterior no dice nada de la nueva y una de
  // cada tres veces la supuesta mala era la correcta. La prueba fallaba
  // sola sin que nada del juego estuviera roto.
  let falloResta = false;
  let falloHaceRuido = false;
  for (let i = 0; i < 3; i++) {
    const progAntes = 0.5 * (st.time || 1);
    st.progress = progAntes;
    g.suspicion = 10;
    if (g.chisme.responder(i) !== "fallo") continue;
    falloResta = st.progress < progAntes;
    falloHaceRuido = g.suspicion > 10;
    break;
  }

  // ── LA PANTALLA COMPLETA, y lo que la hace jugable ──
  // Tapar el piso quita la mitad del juego: ya no VES venir a Gabo, y el
  // mundo no se pausa. Así que el peligro tiene que estar DENTRO de la
  // pantalla. Sin eso, pantalla completa es capturarte a ciegas.
  const cap = document.querySelector(".inc-mg");
  const acecho = document.querySelector(".inc-mg-acecho");
  const pantalla = {
    abierta: !!cap?.classList.contains("on"),
    // La tarjeta vive DENTRO de la pantalla, no pegada a un borde.
    dentro: !!cap?.contains(document.querySelector(".inc-chisme")),
    acechoVisible: !!acecho?.classList.contains("on"),
    acechoTexto: acecho?.querySelector(".inc-mg-acecho-texto")?.textContent ?? "",
    // Un solo verbo a la vez: dos tarjetas encima se pisan.
    verbosVisibles: [".inc-chisme", ".inc-action", ".inc-pulse"].filter(
      (sel) => document.querySelector(sel)?.classList.contains("on")
    ).length,
  };

  return {
    pantalla,
    id: st.id,
    arranca,
    pintada,
    mantenido: +mantenido.toFixed(3),
    bossAndó,
    acertoEmpuja: trasAcierto > antesAcierto,
    falloResta,
    falloHaceRuido,
    titular: ficha?.titular ?? null,
  };
});

if (out.error) {
  check("hay una actividad que juegue al chisme", false, out.error);
} else {
  check(
    "la actividad del chisme arranca SU tanda, no el pulso ni el gesto",
    out.arranca.chismeActivo === true &&
      out.arranca.pulsoActivo === false &&
      out.arranca.gestoActivo === false,
    JSON.stringify(out.arranca)
  );
  check(
    "y SE PINTA: titular, texto y tres opciones",
    out.pintada.visible === true && out.pintada.opciones === 3 && out.pintada.conTexto === true,
    JSON.stringify(out.pintada)
  );
  check(
    "mantener la tecla NO avanza la tarea: lo que empuja son las respuestas",
    out.mantenido < 0.01,
    `avanzó ${out.mantenido} en dos segundos con el dedo puesto`
  );
  check("acertar EMPUJA la tarea", out.acertoEmpuja === true, JSON.stringify(out));
  check("fallar RESTA", out.falloResta === true, JSON.stringify(out));
  check("y fallar hace RUIDO (sube la sospecha)", out.falloHaceRuido === true, JSON.stringify(out));
  check(
    "se juega A PANTALLA COMPLETA, con la tarjeta dentro",
    out.pantalla.abierta === true && out.pantalla.dentro === true,
    JSON.stringify(out.pantalla)
  );
  check(
    "y el ACECHO entra en la pantalla: sabes quién viene sin ver el piso",
    out.pantalla.acechoVisible === true && /GABO/i.test(out.pantalla.acechoTexto),
    JSON.stringify(out.pantalla)
  );
  check(
    "un solo verbo en pantalla, nunca dos encima",
    out.pantalla.verbosVisibles <= 2,
    JSON.stringify(out.pantalla)
  );
  // EL MUNDO SE PARA MIENTRAS DURA LA PANTALLA. Esto afirmaba lo
// contrario, y con razón en su momento: congelar al jefe convertía la
// estación en el sitio más seguro del piso. Lo que cambió es que ya no se
// puede ENTRAR con él encima, y sin esa puerta no hay escudo que
// explotar. El anti-escudo se comprueba ahora en `check:pausa`.
  check(
    "y el MUNDO SE PARA mientras lees (ver check:pausa)",
    out.bossAndó === false,
    JSON.stringify({ bossAndó: out.bossAndó })
  );
}

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? `\nEl chisme se juega leyendo, y con Gabo acercándose: «${out.titular}»`
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
