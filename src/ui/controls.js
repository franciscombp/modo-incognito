/**
 * LOS MANDOS, EN UN SOLO SITIO.
 *
 * Estaban en TRES, y los tres se habían separado:
 *
 *  1. La píldora de bienvenida era HTML fijo en `index.html`, y además se
 *     apaga en cuanto la jugadora se mueve — o sea que a los diez segundos
 *     de partida ya no hay dónde consultar un atajo.
 *  2. «Cómo se juega» (ui/menus.js) enseñaba <kbd>E</kbd> para usar y
 *     <kbd>F</kbd> para fingir. Esas teclas dejaron de existir cuando la
 *     acción se unificó en ESPACIO: quien leyera la ayuda pulsaba E, no
 *     pasaba nada, y concluía que el juego estaba roto.
 *  3. Los atajos 1–3 de la lista de misiones no estaban documentados en
 *     ninguna parte salvo la píldora que se apaga.
 *
 * Ahora la lista vive aquí y la leen los tres. Añadir un atajo es una línea,
 * y es imposible que el rótulo diga una tecla y el juego escuche otra sin que
 * alguien lo vea.
 *
 * Cada entrada dice también DÓNDE se escucha, porque cuando esto se
 * desincroniza lo primero que se busca es quién maneja la tecla.
 */
/**
 * `que` es el rótulo de la leyenda (con sitio de sobra) y `corto` el de la
 * píldora, que va en UNA línea. Sin los dos, la píldora salía diciendo cosas
 * como «V silenciar el sonido · M inspeccionar el plano» y ocupaba el doble.
 */
export const CONTROLES = [
  { teclas: ["WASD", "↑↓←→"], que: "Mover", corto: "WASD mover", tactil: "joystick", donde: "entities/player.js" },
  { teclas: ["Espacio"], que: "Usar / fingir", corto: "Espacio usar/fingir", tactil: "botón USAR", donde: "game/game.js" },
  // El gesto de una tarea usa el MISMO mando de andar: mientras dura la
  // acción no caminas, así que el eje queda libre. Por eso no hay una tecla
  // nueva que aprender — y por eso funciona en el teléfono sin tocar nada.
  { teclas: ["WASD", "↑↓←→"], que: "Ajustar la acción (bajar el volumen…)", corto: "WASD ajustar acción", tactil: "joystick", donde: "game/gestures.js" },
  { teclas: ["1", "2", "3"], que: "Seguir una misión", corto: "1–3 seguir misión", donde: "ui/gamehud.js" },
  // EL CURSOR. Todo lo que se elige —menús, opciones de una charla,
  // respuestas de una tarjeta— se recorre igual, y por el mismo sitio salen
  // la cruceta y la palanca de un mando físico. Un juego que solo se puede
  // terminar con el ratón no está terminado.
  {
    teclas: ["↑↓←→", "Enter"],
    que: "Elegir en un menú o responder una pregunta",
    corto: "↑↓←→/Enter elegir",
    tactil: "toca la opción",
    donde: "ui/focusNav.js",
  },
  { teclas: ["M"], que: "Inspeccionar el plano", corto: "M plano", tactil: "botón MAPA", donde: "main.js" },
  { teclas: ["L"], que: "La libreta (chismes y pistas)", corto: "L libreta", donde: "game/engine.js" },
  { teclas: ["V"], que: "Silenciar el sonido", corto: "V sonido", donde: "main.js" },
  { teclas: ["Esc"], que: "Pausa", corto: "Esc pausa", tactil: "botón de pausa", donde: "game/engine.js" },
];

/** La línea de una sola fila, para la píldora de bienvenida. */
export function controlsLine() {
  return CONTROLES.map((c) => c.corto ?? `${c.teclas[0]} ${c.que.toLowerCase()}`).join(" · ");
}

/**
 * La leyenda de la pausa: una fila por mando, con sus glifos de tecla.
 * `touch` añade el equivalente táctil donde lo haya — en un teléfono, una
 * lista de teclas no sirve de nada.
 */
export function buildControlsLegend(parent, { touch = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "inc-legend";
  for (const c of CONTROLES) {
    const row = document.createElement("div");
    row.className = "inc-legend-row";
    const keys = document.createElement("span");
    keys.className = "inc-legend-keys";
    for (const t of c.teclas) {
      const k = document.createElement("kbd");
      k.textContent = t;
      keys.appendChild(k);
    }
    if (touch && c.tactil) {
      const t = document.createElement("span");
      t.className = "inc-legend-touch";
      t.textContent = c.tactil;
      keys.appendChild(t);
    }
    row.appendChild(keys);
    const what = document.createElement("span");
    what.className = "inc-legend-what";
    what.textContent = c.que;
    row.appendChild(what);
    wrap.appendChild(row);
  }
  parent?.appendChild(wrap);
  return wrap;
}
