/**
 * EL ESCENARIO **ES** EL MENÚ — el armazón compartido.
 *
 * (Diseño: `docs/PANTALLAS.md` §1.8bis. Aquí va el paso 1 de su orden: «una
 * pantalla = un decorado + una lista de opciones».)
 *
 * ── Por qué existe este archivo, que es una tabla de siete líneas ──
 *
 * Porque el propio §1.8bis avisa de cómo se tuerce esto: «Si esto no es común
 * a las cuatro, se acaban escribiendo cuatro menús distintos y volvemos a
 * donde estábamos». Un decorado por pantalla, decidido en la pantalla, es
 * exactamente eso — cada una acaba con su fondo, su ambiente y su manera, y
 * al año se leen como cuatro juegos.
 *
 * Así que el decorado no lo elige la pantalla: lo dice ESTA tabla, y el
 * armazón lo escribe en `data-decorado` del `.inc-menu`. La pantalla solo
 * pone sus opciones, que siguen siendo la MISMA lista de filas con hilo de
 * siempre (`design-system.css` → bloque «EL HOLOGRAMA»). El decorado cambia
 * dónde estás; nunca cómo se pulsa.
 *
 * Es el mismo reparto que el REGISTRO DE VERBOS (`game/verbos.js`): la lista
 * de lo que hay vive en un sitio, y quien la consume la lee de ahí en vez de
 * repetirla.
 *
 * ── Qué NO es diegético, a propósito ──
 *
 * Pausa y ajustes se quedan como interfaz (§1.8bis lo dice: «no todo tiene
 * que ser diegético»). Se abren ENCIMA de una jornada en curso: mandarlas a
 * otro sitio del edificio contaría una mentira —no te has movido— y encima
 * taparía el piso justo cuando lo que quieres es volver a él.
 */

/** Los sitios del edificio que hacen de menú. `interfaz` = no es un sitio. */
export const DECORADOS = {
  ASCENSOR: "ascensor",
  ESCRITORIO: "escritorio",
  ESPEJO: "espejo",
  INTERFAZ: "interfaz",
};

/**
 * QUÉ SITIO ES CADA PANTALLA.
 *
 * La clave es el nombre que usa `menus.js` en `show(name)`, para que no haya
 * que traducir nada entre los dos.
 */
export const DECORADO_DE = {
  // La botonera del ascensor: cada opción es una planta a la que ir.
  title: DECORADOS.ASCENSOR,
  // Un escritorio con los CV encima: coger una carpeta es elegir carrera.
  slots: DECORADOS.ESCRITORIO,
  // Elegir día sigue siendo papeleo sobre la misma mesa.
  days: DECORADOS.ESCRITORIO,
  // El espejo del baño: te miras y te retocas.
  characters: DECORADOS.ESPEJO,
  // Y lo que es interfaz y no un sitio.
  settings: DECORADOS.INTERFAZ,
  help: DECORADOS.INTERFAZ,
  pause: DECORADOS.INTERFAZ,
};

/**
 * El decorado de una pantalla. Una que no esté en la tabla NO revienta ni se
 * queda sin fondo: cae en `interfaz`, que es el comportamiento de siempre.
 * Añadir una pantalla nueva sin decorado tiene que ser inofensivo — si costara
 * un fallo, el atajo sería inventarse el decorado en la propia pantalla, que
 * es justo lo que esta tabla existe para impedir.
 */
export function decoradoDe(pantalla) {
  return DECORADO_DE[pantalla] ?? DECORADOS.INTERFAZ;
}

/**
 * ¿Se viaja entre estas dos pantallas? Solo si CAMBIA el sitio.
 *
 * Es lo que decide si la transición son las puertas del ascensor o nada. Ir de
 * las hojas de vida a elegir día es girar la cabeza sobre la misma mesa: meter
 * ahí un viaje en ascensor sería contar que te fuiste y volviste, y además
 * pondría una espera de segundo y medio en mitad de un menú. Del título a las
 * hojas de vida sí: ahí cambias de planta.
 */
export function hayViaje(desde, hasta) {
  if (!desde || !hasta || desde === hasta) return false;
  const a = decoradoDe(desde);
  const b = decoradoDe(hasta);
  if (a === b) return false;
  // Abrir ajustes o la pausa NO es viajar: es levantar la vista de donde ya
  // estabas. Y volver de ellas, tampoco.
  if (a === DECORADOS.INTERFAZ || b === DECORADOS.INTERFAZ) return false;
  return true;
}
