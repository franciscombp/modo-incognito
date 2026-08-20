/**
 * EL REGISTRO DE VERBOS — la lista de qué se puede hacer en una estación.
 *
 * ── Por qué existe ──
 *
 * Añadir un verbo costaba tocar OCHO sitios, y ninguno se parecía al
 * anterior: la cadena `if/else` del bucle de actividad (donde cada rama tenía
 * que acordarse de apagar las OTRAS cinco, a mano), la lista del pestillo, la
 * de `enMinijuego`, el snapshot, el HUD, y un par de comprobaciones de
 * `tools/` que preguntaban por dos verbos cuando ya había seis.
 *
 * Nada de eso fallaba a la vista. Fallaba en silencio: al pasar estirarse al
 * baile, `check:minijuego` dejó de ver la única actividad jugable del día y
 * `check:pulse` se puso a medir el pulso en una estación que ya no lo juega.
 * Los dos «funcionaban» — preguntaban por un juego que ya no existía.
 *
 * Así que la lista vive AQUÍ, una vez. Quien la necesite la lee.
 *
 * ── Cómo añadir un verbo ──
 *
 * 1. Escribe su módulo en `src/game/` con el contrato de siempre:
 *    `begin(st)`, `end()`, `update(dt)`, `snapshot()` y `get active`.
 * 2. Créalo en `game.js` (junto a los otros) y añade su fila aquí.
 * 3. Píntalo en `ui/gamehud.js`.
 * Y ya. El apagado de los demás, el pestillo, la bandera de pantalla abierta
 * y el orden de prioridad salen solos de esta tabla.
 *
 * ── Los campos ──
 *
 * · `id`       cómo se llama la INSTANCIA en `game` (`game.verter`, …).
 * · `campo`    la clave que la actividad declara en el JSON DE ESCENA para
 *              pedir este verbo. `null` = EL SUELO: se juega cuando no se
 *              pidió ningún otro.
 *
 * Son dos campos y no uno a propósito: no siempre coinciden. El módulo del
 * gesto se llama `gesture` y su clave en el JSON es `gesto`; el del pulso es
 * `pulse` y en el JSON no tiene clave, porque es el suelo. Colapsarlos en un
 * nombre obligaría a renombrar la mitad de `tools/`, que lee `game.pulse` y
 * `game.gesture` por su nombre.
 * · `pestillo` se queda abierto solo, sin sostener la tecla. Lo llevan los
 *              verbos que no se juegan con esa misma tecla — un puzle de
 *              ratón con el pulgar clavado en espacio es absurdo.
 * · `bloqueaPaso` mientras dura, no se camina: deja libre el eje del mando
 *              para el propio verbo, y por eso no hace falta tecla nueva.
 * · `ritmo`    cuánto avanza la tarea por SEGUNDO SOSTENIDO. 0 = solo avanza
 *              con lo que hagas (responder, resolver, acertar el paso).
 *
 * ── El ORDEN es la prioridad ──
 *
 * Una actividad juega a UNO y nunca a dos: pedir ritmo y pulso firme a la vez
 * con el jefe rondando no es difícil, es ruido. Si un JSON declara dos, gana
 * el primero de esta lista — y `check:contenido` avisa de que hay dos.
 */

export const VERBOS = [
  { id: "baile", campo: "baile", pestillo: true, ritmo: 0 },
  { id: "microondas", campo: "microondas", pestillo: true, bloqueaPaso: true, ritmo: 0 },
  { id: "verter", campo: "verter", pestillo: true, ritmo: 0 },
  { id: "chisme", campo: "chisme", pestillo: true, ritmo: 0 },
  { id: "gesture", campo: "gesto", bloqueaPaso: true, ritmo: null },
  // EL SUELO. Sin `campo`: lo juega la actividad que no pidió otra cosa, y
  // por eso va al final. Su ritmo lo pone el propio módulo
  // (`ritmoMantenido`), que es lo que deja que mantener avance a paso de
  // tortuga sin llegar a terminar la tarea.
  { id: "pulse", campo: null, ritmo: null },
];

/** Las claves de JSON que piden un verbo. Para validar contenido. */
export const CAMPOS = VERBOS.map((v) => v.campo).filter(Boolean);

/**
 * Qué verbo juega esta actividad. Devuelve la fila del registro, nunca null:
 * sin nada declarado cae al suelo, que es el pulso.
 */
export function verboDe(st) {
  if (!st) return null;
  return VERBOS.find((v) => v.campo && st[v.campo]) ?? VERBOS[VERBOS.length - 1];
}

/** ¿Cuántos verbos declara esta actividad? Más de uno es un aviso. */
export function verbosDeclarados(st) {
  return VERBOS.filter((v) => v.campo && st?.[v.campo]).map((v) => v.campo);
}
