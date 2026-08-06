import { iconEl } from "./icons.js";

/**
 * EL PLAN DE NIVELACIÓN (docs/CAMPANA.md §5.1 y §8).
 *
 * Qué es: la red de seguridad. Si se acaban los cinco días de una temporada
 * sin completar sus misiones, RRHH no te echa — te «acompaña» con un plan de
 * mejora, que es una tanda de pruebas. Al terminarla vuelves al día 1 de la
 * misma temporada con lo que ya tenías hecho intacto.
 *
 * ── Las dos reglas, y las dos vienen del documento ──
 *
 * 1. **NO SE PIERDE LA PARTIDA.** La tanda siempre se puede terminar. Es un
 *    peaje, igual que el curso de RRHH: castiga tiempo y orgullo, no
 *    progreso.
 *
 * 2. **NO PUEDE SALIR A CUENTA FALLAR.** Es el riesgo que el propio
 *    documento se marca (§11.4): si los minijuegos son divertidos, la
 *    jugadora empieza a suspender a propósito para jugarlos. Por eso la
 *    tanda NO regala reloj ni desbloquea nada — solo devuelve al día 1 — y
 *    por eso está enmarcada como lo que es: un trámite con vocabulario de
 *    RRHH, no un premio.
 *
 * ── Por qué no trae minijuegos propios ──
 *
 * Las pruebas salen del REGISTRO (`game/minigames.js`), pedidas por id desde
 * el JSON de la temporada. Así el plan de nivelación no es un sitio más
 * donde escribir minijuegos: reaprovecha los que ya existen, y añadir uno
 * nuevo a la tanda es editar una lista en un JSON. El motor nunca tiene un
 * `if` para una prueba concreta.
 */

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent?.appendChild(n);
  return n;
}

/** El papeleo entre prueba y prueba. Resuelve cuando se pulsa continuar. */
function tarjeta(root, { kicker, titulo, cuerpo, boton }) {
  return new Promise((resolve) => {
    const layer = el("div", "inc-level", root);
    const card = el("div", "inc-level-card", layer);
    const ic = el("div", "inc-level-icon", card);
    // `people`, no un icono de documento: el chiste es que esto se vende
    // como "acompañamiento" (ui/icons.js no tiene portapapeles, y tampoco
    // hace falta — ningún icono es un emoji ni se inventa aquí).
    ic.appendChild(iconEl("people"));
    el("div", "inc-level-kicker", card, kicker);
    el("h2", "inc-level-title", card, titulo);
    el("p", "inc-level-body", card, cuerpo);
    const btn = el("button", "inc-level-ok", card, boton);
    btn.type = "button";
    btn.addEventListener("click", () => {
      layer.classList.add("out");
      setTimeout(() => {
        layer.remove();
        resolve();
      }, 240);
    });
    requestAnimationFrame(() => layer.classList.add("on"));
    btn.focus?.();
  });
}

export function createLevelling(root, { minigames, render, setBusy = null }) {
  return {
    /**
     * Corre la tanda entera. `pruebas` son ids del registro de minijuegos.
     * Resuelve siempre: no hay forma de perder aquí.
     */
    async run({ pruebas = [], temporada = 1 } = {}) {
      const lista = pruebas.map((id) => minigames.get(id)).filter(Boolean);

      await tarjeta(root, {
        kicker: "RECURSOS HUMANOS",
        titulo: "Plan de nivelación",
        cuerpo:
          lista.length > 0
            ? `Se activa tu plan de mejora de la temporada ${temporada}. No es un castigo: es acompañamiento. Son ${lista.length} sesión(es) y luego vuelves al día 1.`
            : `Se activa tu plan de mejora de la temporada ${temporada}. No es un castigo: es acompañamiento. Vuelves al día 1 con lo que ya tenías hecho.`,
        boton: "Aceptar el acompañamiento",
      });

      for (let i = 0; i < lista.length; i++) {
        const prueba = lista[i];
        await tarjeta(root, {
          kicker: `SESIÓN ${i + 1} DE ${lista.length}`,
          titulo: "Ejercicio de refuerzo",
          cuerpo:
            "Repetirás una situación que ya dominas, para dejar constancia de que la dominas.",
          boton: "Empezar",
        });
        // El resultado NO se mira a propósito: fallar aquí no añade castigo.
        // Si fallar tuviera coste, la tanda dejaría de ser una red y pasaría
        // a ser una segunda forma de perder.
        try {
          // `setBusy` es lo que hace que main.js DEJE DE DIBUJAR EL PISO
          // mientras corre la prueba. Sin esto el minijuego se pintaba
          // encima del piso, los dos a la vez — el camino del día ya lo
          // hacía (engine.crossingActive) y aquí faltaba.
          setBusy?.(true);
          if (prueba.bodyClass) document.body.classList.add(prueba.bodyClass);
          await prueba.play(render);
        } finally {
          setBusy?.(false);
          if (prueba.bodyClass) document.body.classList.remove(prueba.bodyClass);
        }
      }

      await tarjeta(root, {
        kicker: "CONSTANCIA",
        titulo: "Plan completado",
        cuerpo:
          "Queda registrado tu compromiso con la mejora continua. Vuelves al día 1 con lo que ya habías conseguido.",
        boton: "Volver al piso",
      });
    },
  };
}
