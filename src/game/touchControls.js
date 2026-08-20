// On-screen joystick + action buttons for touch devices. Movement writes
// directly into `player.touchAxis`; the interact/pretend buttons just toggle
// the same `player.keys` Set the keyboard uses, so Game/Player logic doesn't
// need to know the input came from a finger instead of a key.
//
// The stick is "floating": touching anywhere in the left half of the screen
// drops the base under your thumb, which is what makes this playable
// one-handed on a phone instead of forcing you to hunt for a fixed circle.
import { buzz } from "./settings.js";
import { icon as svgIcon, hasIcon } from "../ui/icons.js";

export function createTouchControls(
  player,
  root,
  { onZoom, onInspect, onPause, focusNav = null } = {}
) {
  const isTouch =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    matchMedia("(pointer: coarse)").matches;
  document.body.classList.toggle("touch-device", isTouch);

  const wrap = document.createElement("div");
  wrap.className = "touch-controls";
  root.appendChild(wrap);

  // ---- Movement joystick ----
  const zone = document.createElement("div");
  zone.className = "touch-stick-zone";
  const base = document.createElement("div");
  base.className = "touch-stick-base";
  const thumb = document.createElement("div");
  thumb.className = "touch-stick-thumb";
  base.appendChild(thumb);
  zone.appendChild(base);
  wrap.appendChild(zone);

  const RADIUS = 56;
  let stickPointerId = null;
  let origin = { x: 0, y: 0 };

  function setAxis(x, z) {
    player.touchAxis.x = x;
    player.touchAxis.z = z;
  }

  /**
   * ¿Hay algo que elegir ahora mismo? Entonces el pulgar es del CURSOR, no
   * de los pies. Es la misma regla que ya tenían el teclado y el mando —las
   * flechas caminan en partida y navegan en un menú—, y sin ella un teléfono
   * se quedaba con pantallas a las que no se podía llegar: el stick movía a
   * una jugadora que no está en pantalla y el botón de acción no hacía nada.
   */
  const enMenu = () => !!focusNav?.activo;

  function stickMove(e) {
    let dx = e.clientX - origin.x;
    let dy = e.clientY - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    if (enMenu()) {
      // Por `empujar` y no por `mover`: así el paseo del cursor hereda la
      // zona muerta y la repetición del mando físico. Escrito aparte, el
      // cursor acabaría moviéndose distinto según con qué lo muevas.
      //
      // El reloj se lo pone el propio gesto: aquí no hay bucle por cuadro
      // —`pointermove` solo llega cuando el dedo se mueve—, y con un dedo
      // QUIETO fuera de la zona muerta no llegaría ninguno, así que la
      // repetición se sostiene desde el temporizador de abajo.
      focusNav.empujar(dx / RADIUS, dy / RADIUS, 1 / 60);
      ejeMenu = { x: dx / RADIUS, y: dy / RADIUS };
      setAxis(0, 0);
      return;
    }
    setAxis(dx / RADIUS, dy / RADIUS);
  }

  // EL DEDO QUIETO TAMBIÉN REPITE. Un pulgar sostenido en una dirección no
  // genera un solo `pointermove`, así que sin este latido el cursor daba UN
  // paso por gesto y había que soltar y volver a empujar por cada opción.
  let ejeMenu = null;
  let ultimoTic = performance.now();
  setInterval(() => {
    const ahora = performance.now();
    const dt = Math.min(0.25, (ahora - ultimoTic) / 1000);
    ultimoTic = ahora;
    // EL MANDO SE QUEDA EN PANTALLA cuando hay algo que elegir. Estaba
    // `display: none` con cualquier menú abierto (`body.menu-open
    // .touch-controls`), que es LA otra mitad de por qué en un teléfono no
    // se podía navegar: aunque el pulgar mandara sobre el cursor, no había
    // pulgar — el mando desaparecía justo en la pantalla que había que
    // recorrer.
    //
    // Y no vuelve tal cual: la zona del stick ocupa MEDIA PANTALLA, que es
    // lo correcto para un stick flotante en partida y se comería los toques
    // de los propios botones del menú. En este modo se encoge a una
    // esquina (ver `.inc-nav-touch` en el DS).
    document.body.classList.toggle("inc-nav-touch", enMenu());
    if (!ejeMenu || stickPointerId === null || !enMenu()) return;
    focusNav.empujar(ejeMenu.x, ejeMenu.y, dt);
  }, 1000 / 30);

  function stickEnd(e) {
    if (e.pointerId !== stickPointerId) return;
    stickPointerId = null;
    base.classList.remove("active");
    thumb.style.transform = "translate(0, 0)";
    ejeMenu = null;
    setAxis(0, 0);
  }

  zone.addEventListener("pointerdown", (e) => {
    stickPointerId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    const rect = zone.getBoundingClientRect();
    base.style.left = `${e.clientX - rect.left}px`;
    base.style.top = `${e.clientY - rect.top}px`;
    base.classList.add("active");
    // Capturar puede fallar (un puntero sintético, o uno que se soltó entre
    // el evento y esta línea) y tirar NotFoundError, y ahí se cae el resto
    // del manejador: el stick se quedaría apoyado sin llegar a leerse nunca.
    // La captura es una mejora —sostener el dedo fuera de la zona—, no un
    // requisito para que la palanca funcione.
    try {
      zone.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura: el stick sigue funcionando dentro de su zona */
    }
    stickMove(e);
  });
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId === stickPointerId) stickMove(e);
  });
  zone.addEventListener("pointerup", stickEnd);
  zone.addEventListener("pointercancel", stickEnd);

  // ---- Action buttons ----
  const actions = document.createElement("div");
  actions.className = "touch-actions";
  wrap.appendChild(actions);

  function makeHoldButton(className, icon, label, gameKey) {
    const btn = document.createElement("div");
    btn.className = `touch-btn ${className}`;
    btn.innerHTML = `<span class="touch-btn-icon">${icon}</span><span>${label}</span>`;
    const press = (e) => {
      e.preventDefault();
      btn.classList.add("active");
      buzz(8);
      // CON UN MENÚ DELANTE, ESTE BOTÓN ACEPTA. Es el mismo trato que tienen
      // espacio y el botón A del mando, y sin él la única forma de confirmar
      // en un teléfono era acertarle al botón de la pantalla con el dedo —
      // que en las pantallas de minijuego ni siquiera funciona, porque van
      // con `pointer-events: none`.
      if (enMenu()) {
        focusNav.aceptar();
        return;
      }
      player.keys.add(gameKey);
    };
    const release = () => {
      player.keys.delete(gameKey);
      btn.classList.remove("active");
    };
    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", release);
    actions.appendChild(btn);
    return btn;
  }

  makeHoldButton("touch-btn-interact", svgIcon("hand", { size: 26 }), "USAR / FINGIR", " ");

  // ---- Camera / map utilities, top-right so they never fight the thumbs ----
  const utils = document.createElement("div");
  utils.className = "touch-utils";
  wrap.appendChild(utils);

  function makeTapButton(icon, title, onTap) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "touch-util";
    // innerHTML, no textContent: lo que llega es el markup de un SVG. Con
    // textContent, el botón del plano enseñaba el código fuente del icono
    // como TEXTO gigante en mitad de la pantalla del móvil.
    btn.innerHTML = icon;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      buzz(8);
      onTap();
    });
    utils.appendChild(btn);
    return btn;
  }

  // Iconos SVG propios, nunca glifos de la fuente del sistema: "＋"/"⏸"
  // cambian de dibujo por plataforma y en algunas salen como cuadro vacío.
  if (onZoom) {
    makeTapButton(svgIcon("plus", { size: 22 }), "Acercar", () => onZoom(0.18));
    makeTapButton(svgIcon("minus", { size: 22 }), "Alejar", () => onZoom(-0.18));
  }
  if (onInspect) makeTapButton(svgIcon("map", { size: 22 }), "Inspeccionar plano", onInspect);
  if (onPause) makeTapButton(svgIcon("pause", { size: 22 }), "Pausa", onPause);

  return { isTouch };
}
