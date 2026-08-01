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

export function createTouchControls(player, root, { onZoom, onInspect, onPause } = {}) {
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

  function stickMove(e) {
    let dx = e.clientX - origin.x;
    let dy = e.clientY - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    setAxis(dx / RADIUS, dy / RADIUS);
  }

  function stickEnd(e) {
    if (e.pointerId !== stickPointerId) return;
    stickPointerId = null;
    base.classList.remove("active");
    thumb.style.transform = "translate(0, 0)";
    setAxis(0, 0);
  }

  zone.addEventListener("pointerdown", (e) => {
    stickPointerId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    const rect = zone.getBoundingClientRect();
    base.style.left = `${e.clientX - rect.left}px`;
    base.style.top = `${e.clientY - rect.top}px`;
    base.classList.add("active");
    zone.setPointerCapture(e.pointerId);
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
      player.keys.add(gameKey);
      btn.classList.add("active");
      buzz(8);
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
    btn.textContent = icon;
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

  if (onZoom) {
    makeTapButton("＋", "Acercar", () => onZoom(0.18));
    makeTapButton("－", "Alejar", () => onZoom(-0.18));
  }
  if (onInspect) makeTapButton(svgIcon("map", { size: 22 }), "Inspeccionar plano", onInspect);
  if (onPause) makeTapButton("⏸", "Pausa", onPause);

  return { isTouch };
}
