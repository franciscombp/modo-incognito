// On-screen joystick + action buttons for touch devices. Movement writes
// directly into `player.touchAxis`; the interact/pretend buttons just
// toggle the same `player.keys` Set the keyboard uses, so Game/Player logic
// doesn't need to know input came from a finger instead of a key.
export function createTouchControls(player, root) {
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
  document.body.classList.toggle("touch-device", isTouch);

  const wrap = document.createElement("div");
  wrap.className = "touch-controls";
  root.appendChild(wrap);

  // ---- Movement joystick ----
  const base = document.createElement("div");
  base.className = "touch-stick-base";
  const thumb = document.createElement("div");
  thumb.className = "touch-stick-thumb";
  base.appendChild(thumb);
  wrap.appendChild(base);

  let stickPointerId = null;
  let baseRect = null;

  function setAxis(x, z) {
    player.touchAxis.x = x;
    player.touchAxis.z = z;
  }

  function stickMove(e) {
    const maxR = baseRect.width / 2;
    let dx = e.clientX - (baseRect.left + baseRect.width / 2);
    let dy = e.clientY - (baseRect.top + baseRect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    setAxis(dx / maxR, dy / maxR);
  }

  function stickEnd(e) {
    if (e.pointerId !== stickPointerId) return;
    stickPointerId = null;
    thumb.style.transform = "translate(0, 0)";
    setAxis(0, 0);
  }

  base.addEventListener("pointerdown", (e) => {
    stickPointerId = e.pointerId;
    baseRect = base.getBoundingClientRect();
    base.setPointerCapture(e.pointerId);
    stickMove(e);
  });
  base.addEventListener("pointermove", (e) => {
    if (e.pointerId === stickPointerId) stickMove(e);
  });
  base.addEventListener("pointerup", stickEnd);
  base.addEventListener("pointercancel", stickEnd);

  // ---- Action buttons ----
  const actions = document.createElement("div");
  actions.className = "touch-actions";
  wrap.appendChild(actions);

  function makeButton(className, icon, label, key) {
    const btn = document.createElement("div");
    btn.className = `touch-btn ${className}`;
    btn.innerHTML = `<span class="touch-btn-icon">${icon}</span><span>${label}</span>`;
    const press = (e) => {
      e.preventDefault();
      player.keys.add(key);
      btn.classList.add("active");
    };
    const release = () => {
      player.keys.delete(key);
      btn.classList.remove("active");
    };
    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", release);
    actions.appendChild(btn);
    return btn;
  }

  makeButton("touch-btn-pretend", "⌨️", "FINGIR", "f");
  makeButton("touch-btn-interact", "✋", "USAR", "e");

  return { isTouch };
}
