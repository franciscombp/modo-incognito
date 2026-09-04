/**
 * CAPTURAR EL PUNTERO SIN QUE UN FALLO SE LLEVE EL GESTO POR DELANTE.
 *
 * `setPointerCapture` es lo que hace que un arrastre siga funcionando cuando
 * el dedo se sale del elemento — sin él, sacar el dedo un milímetro suelta el
 * plato del microondas justo en el peor momento, y la cámara se queda a medio
 * giro. O sea que se quiere.
 *
 * Pero LANZA. Si el puntero ya no está activo cuando llega el handler —el
 * dedo se levantó entre el evento y su manejo, el navegador ya lo liberó, un
 * evento sintético— tira `NotFoundError`. Y como la captura se pedía en la
 * PRIMERA línea del `pointerdown`, la excepción se llevaba por delante el
 * resto del manejador: el plato ni siquiera se colocaba en el primer punto.
 * Desde fuera eso no se ve como un error, se ve como que el minijuego no
 * responde al primer toque.
 *
 * La captura es una MEJORA del gesto, no un requisito suyo. Si no se puede,
 * el arrastre sigue funcionando dentro del elemento, que es la mayoría de las
 * veces. Así que se intenta y, si no, se sigue.
 *
 * Vive aquí y no repetida en tres archivos porque son tres sitios con el
 * mismo peligro exacto (el microondas, la palanca y la cámara) y el que se
 * quede sin el `try` es el que fallará.
 */
export function capturarPuntero(elemento, pointerId) {
  try {
    elemento.setPointerCapture(pointerId);
    return true;
  } catch {
    // Sin captura se puede jugar; con una excepción por aquí, no.
    return false;
  }
}
