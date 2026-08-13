import { getCameraSettings } from "./cameraSettings.js";

/**
 * LA CÁMARA DE DIÁLOGO — la conversación pasa EN EL ESCENARIO.
 *
 * ── Lo que sustituye ──
 *
 * Antes, hablar abría un retrato 3D de 480 px colgado sobre el piso: un
 * personaje gigante, a otra escala que el que estaba hablando ahí abajo, y
 * duplicado con él. La referencia (Sneaky Sasquatch) no hace nada de eso —
 * los dos están en el mundo, de frente, y abajo hay una caja de texto y ya.
 *
 * ── Las dos gramáticas ──
 *
 * SOLILOQUIO (habla uno). Primer plano, y el personaje SE GIRA A CÁMARA:
 * está rompiendo la cuarta pared, hablándole a quien juega. Es el recurso
 * que el juego ya usa en el ascensor y en los pensamientos de Giuli.
 *
 * DIÁLOGO (hablan dos). Los dos en cuadro, puestos de frente el uno al otro,
 * y la cámara al punto medio con el encuadre justo para que quepan.
 *
 * ── La regla que NO se rompe: la cámara NO ROTA ──
 *
 * El que rota es el PERSONAJE. Girar la cámara para «mirar de frente» a
 * alguien marea, rompe la lectura isométrica del piso —arriba deja de ser
 * arriba— y obliga a recolocar el HUD, que está pensado sobre un encuadre
 * fijo. Aquí solo se mueven DOS cosas: a dónde mira la cámara (`setFocus`) y
 * cuánto se acerca (`setFraming`). El ángulo se queda donde estaba.
 *
 * Al cerrar, todo vuelve exactamente a como estaba — incluido el encuadre que
 * la jugadora hubiera elegido con la rueda.
 */

/**
 * EL ENCUADRE, y por qué son dos mandos y no uno.
 *
 * `framing` va de 0 (todo el piso) a 1 (lo más cerca que llega el seguimiento
 * normal), y 1 SIGUE SIENDO UN PLANO ABIERTO — es el de jugar. El primer
 * plano de verdad vive en el otro mando, `setActionZoom`, que multiplica la
 * distancia por 0,55: el mismo acercamiento que usa una actividad.
 *
 * Primer intento: `framing = 0.94` para el soliloquio. Como el juego ya
 * estaba en 1, eso alejaba un poco en vez de acercar — un «primer plano» que
 * se veía igual de lejos.
 */
const FRAMING_CERCA = 1;

/** Lo que tarda en llegar y en volver, en segundos. */
const ENTRADA = 0.45;

export function createDialogueCamera(camera, { onDrama = null } = {}) {
  let activo = false;
  let cerrado = false; // ¿primer plano? solo en soliloquio
  let framingPrevio = null;
  let focoPrevio = null;

  /** El objetivo de mundo al que apuntar, ya resuelto a {x,z}. */
  function punto(a, b) {
    if (a && b) return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    return a ? { x: a.x, z: a.z } : null;
  }

  return {
    get active() {
      return activo;
    },

    /**
     * ¿Toca el acercamiento de primer plano? Lo pregunta el bucle de render
     * (`main.js`), que es quien llama a `setActionZoom` — así ese mando tiene
     * UN dueño y no dos peleándose cuadro a cuadro.
     */
    get cinematic() {
      return activo && cerrado;
    },

    /**
     * Entrar en modo conversación.
     *
     * @param {{x:number,z:number}} quien  posición del que habla.
     * @param {{x:number,z:number}|null} conQuien  el otro, si son dos.
     */
    enter(quien, conQuien = null) {
      if (!camera) return;
      if (!activo) {
        // Se guarda UNA vez: si `enter` se vuelve a llamar al cambiar de
        // hablante dentro de la misma charla, no puede pisar el estado
        // original con el que ya es de diálogo.
        framingPrevio = camera.framing;
        focoPrevio = camera._focus ? { ...camera._focus } : null;
        activo = true;
      }
      const foco = punto(quien, conQuien);
      if (foco) camera.setFocus(foco);
      camera.setFraming(FRAMING_CERCA);
      // El acercamiento NO se escribe aquí: `main.js` llama a
      // `setActionZoom` cada cuadro y lo pisaría. Se declara, y allí se
      // respeta — un solo dueño de ese mando (ver `cinematic`).
      cerrado = !conQuien;
      onDrama?.(true, { duo: !!conQuien });
    },

    /** Volver a como estaba, incluido el zoom que la jugadora tuviera puesto. */
    exit() {
      if (!activo || !camera) return;
      activo = false;
      cerrado = false;
      camera.setFocus(focoPrevio);
      if (framingPrevio != null) camera.setFraming(framingPrevio);
      framingPrevio = null;
      focoPrevio = null;
      onDrama?.(false, {});
    },

    /**
     * Girar a un personaje HACIA LA CÁMARA. Es lo que hace el soliloquio:
     * la cuarta pared se rompe girando al muñeco, nunca moviendo el ojo.
     *
     * El rumbo sale del yaw de la cámara, el mismo que usa el juego para
     * poner a la jugadora de cara cuando hace una actividad — así «de frente»
     * significa lo mismo en los dos sitios.
     */
    faceCamera(personaje) {
      if (!personaje?.sprite?.setHeading) return;
      const yaw = (getCameraSettings().yawDeg * Math.PI) / 180;
      const dx = Math.sin(yaw);
      const dz = Math.cos(yaw);
      personaje.sprite.setHeading(dx, dz);
      // El jefe y los secuaces reimponen su propio rumbo en el siguiente
      // cuadro a partir de `facingDir`: sin esto, el giro dura un frame.
      if (personaje.facingDir) personaje.facingDir = { x: dx, z: dz };
    },

    duracionEntrada: ENTRADA,
  };
}
