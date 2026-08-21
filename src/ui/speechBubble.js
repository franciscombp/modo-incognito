/**
 * EL GLOBO DE HABLA — hablar SIN parar el juego.
 *
 * ── Por qué hacía falta ───────────────────────────────────────────────────
 *
 * Hasta aquí este juego solo sabía hablar de UNA manera: la caja de diálogo,
 * que es MODAL y PAUSA la partida (`engine.withPause`). Sirve para una
 * conversación —te paras, escuchas, eliges— y es la correcta para eso.
 *
 * Pero deja sin contar todo lo que se dice EN MARCHA, y ahí estaba el fallo
 * de la escolta del día 1: Gabo te decía «ven, que te enseño tu puesto» en una
 * caja con el mundo congelado, y solo DESPUÉS, con la caja cerrada, echaba a
 * andar. O sea que la escena de que te lleva no era una escena: eran dos
 * cosas pegadas, hablar y luego caminar. Lo natural —y lo que pidió el
 * equipo— es que CAMINEN MIENTRAS HABLAN.
 *
 * Esto es el otro canal: una frase corta colgada sobre la cabeza de quien la
 * dice, que se lee de un vistazo, se va sola y no interrumpe nada. La caja se
 * queda para las conversaciones de verdad.
 *
 * ── Tres reglas ───────────────────────────────────────────────────────────
 *
 *  1. NUNCA PAUSA Y NUNCA PIDE UN CLIC. Si hace falta que la jugadora
 *     conteste, eso es un diálogo y va en la caja. Aquí solo se dice.
 *  2. UNA FRASE POR PERSONA, y la nueva sustituye a la vieja. Dos globos del
 *     mismo apilados es un muro de texto flotando en mitad del piso — que es
 *     justo lo que las medallas vinieron a quitar (`scene/beacons.js`).
 *  3. SE CALLA CUANDO HABLA LA CAJA. Con el diálogo modal abierto la cámara
 *     se cierra sobre los dos hablantes; un globo del HUD encima sería la
 *     tercera capa de texto en la misma cara.
 *
 * El tiempo en pantalla se calcula por LARGO: leer «¡Camina, camina!» y leer
 * una frase de veinte palabras no cuesta lo mismo, y un tiempo fijo o corta
 * la segunda o deja la primera colgada.
 */
import * as THREE from "three";
import { WORLD_SCALE as S } from "../scene/config.js";

/** Sobre la cabeza: por encima del globo de alerta, que vive a ~2.1. */
const ALTURA = 2.45 * S;

/** Lectura: base + por carácter. Sale de ~200 palabras por minuto, con aire. */
const BASE_MS = 900;
const POR_CARACTER_MS = 42;
const TOPE_MS = 5200;

export function createSpeechBubbles(root, camera) {
  const capa = document.createElement("div");
  capa.className = "inc-globos";
  root.appendChild(capa);

  /** Quién está diciendo qué: clave → { nodo, anchor, hasta, tone } */
  const vivos = new Map();
  const v = new THREE.Vector3();

  function nuevo(tone) {
    const n = document.createElement("div");
    n.className = "inc-globo";
    n.dataset.tone = tone;
    n.innerHTML = `<span class="inc-globo-texto"></span><span class="inc-globo-pico"></span>`;
    capa.appendChild(n);
    return n;
  }

  function quitar(clave) {
    const g = vivos.get(clave);
    if (!g) return;
    g.nodo.classList.remove("on");
    // Se le deja terminar el desvanecido antes de sacarlo del DOM: quitarlo en
    // el acto es un parpadeo, y un globo que desaparece de golpe se lee como
    // un fallo de dibujado.
    const nodo = g.nodo;
    setTimeout(() => nodo.remove(), 400);
    vivos.delete(clave);
  }

  return {
    /**
     * Decir una frase sobre la cabeza de alguien.
     *
     * @param {object} quien  cualquiera con `.position {x,z}` (jugadora, jefe,
     *   secuaz, figurante) — o `{x,z}` a secas para un sitio del piso.
     * @param {string} texto  una frase. Corta: esto no es la caja.
     * @param {object} [opts]
     * @param {string} [opts.clave]  con qué identidad habla (por defecto, el
     *   propio objeto). Es lo que hace que la frase nueva SUSTITUYA a la vieja
     *   del mismo personaje en vez de apilarse.
     * @param {"normal"|"jefe"|"aviso"} [opts.tone]
     * @param {number} [opts.segundos]  forzar duración; por defecto, por largo.
     */
    decir(quien, texto, { clave = quien, tone = "normal", segundos = null } = {}) {
      if (!quien || !texto) return;
      quitar(clave);
      const nodo = nuevo(tone);
      nodo.querySelector(".inc-globo-texto").textContent = texto;
      // Un cuadro para que el navegador vea el estado inicial: sin esto la
      // transición de entrada no corre y el globo aparece de golpe.
      requestAnimationFrame(() => nodo.classList.add("on"));
      const ms = segundos != null
        ? segundos * 1000
        : Math.min(TOPE_MS, BASE_MS + texto.length * POR_CARACTER_MS);
      vivos.set(clave, { nodo, anchor: quien, hasta: performance.now() + ms, tone });
    },

    /** ¿Está esta persona diciendo algo ahora mismo? */
    hablando(clave) {
      return vivos.has(clave);
    },

    /** Un cuadro: recolocar los globos vivos y retirar los que ya caducaron. */
    update({ oculto = false } = {}) {
      if (!vivos.size) return;
      const ahora = performance.now();
      const w = capa.parentElement?.clientWidth ?? 0;
      const h = capa.parentElement?.clientHeight ?? 0;
      for (const [clave, g] of vivos) {
        if (ahora > g.hasta) {
          quitar(clave);
          continue;
        }
        // SE CALLA CUANDO HABLA LA CAJA (o cuando no hay nada que mirar): se
        // esconde, pero su reloj sigue corriendo — al volver, la frase no
        // reaparece a destiempo como si se hubiera dicho ahora.
        if (oculto) {
          g.nodo.classList.remove("on");
          continue;
        }
        const p = g.anchor.position ?? g.anchor;
        v.set(p.x, ALTURA, p.z).project(camera);
        if (v.z >= 1) {
          g.nodo.classList.remove("on");
          continue;
        }
        g.nodo.classList.add("on");
        g.nodo.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${
          ((1 - v.y) / 2) * h
        }px)`;
      }
    },

    /** Vaciar (cambio de día, fin de partida). */
    reset() {
      for (const clave of [...vivos.keys()]) quitar(clave);
    },

    nodes: { capa },
  };
}
