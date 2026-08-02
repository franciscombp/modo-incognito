import { footprint, hidingSpots } from "../scene/floorplan.js";

// Boss radar.
//
// The camera can be zoomed anywhere, and the one thing you always need to
// know is where the boss is. This is a small top-down plan of the floor with
// live blips: you, the boss (who pulses when hunting), his sidekicks, the
// tasks you still owe and the cover that is currently charged.
//
// Drawn on a 2D canvas rather than DOM nodes — a dozen blips redrawn every
// frame as elements would churn layout on exactly the devices we are trying
// to keep smooth.

const COLORS = {
  floor: "rgba(69, 224, 208, 0.10)",
  outline: "rgba(69, 224, 208, 0.65)",
  player: "#a8e05f",
  boss: "#ff4d5e",
  minion: "#f2c744",
  task: "#45e0d0",
  hide: "rgba(120, 220, 150, 0.85)",
  hideSpent: "rgba(120, 130, 150, 0.35)",
};

export function createRadar(root) {
  const wrap = document.createElement("div");
  wrap.className = "inc-radar";
  wrap.innerHTML = `
    <div class="inc-radar-head"><span>RADAR</span><span class="inc-radar-dist"></span></div>
    <canvas class="inc-radar-canvas"></canvas>
  `;
  root.appendChild(wrap);

  const canvas = wrap.querySelector(".inc-radar-canvas");
  const distEl = wrap.querySelector(".inc-radar-dist");
  const ctx = canvas.getContext("2d");

  // Floor bounds in world space, so the plan can be mapped into the canvas.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of footprint) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const worldW = maxX - minX;
  const worldH = maxZ - minZ;

  let dpr = 1;
  let w = 0;
  let h = 0;
  let pad = 6;
  let scale = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min((w - pad * 2) / worldW, (h - pad * 2) / worldH);
    return true;
  }

  const toX = (x) => pad + (x - minX) * scale + (w - pad * 2 - worldW * scale) / 2;
  const toY = (z) => pad + (z - minZ) * scale + (h - pad * 2 - worldH * scale) / 2;

  function blip(x, z, r, color, glow = 0) {
    ctx.beginPath();
    ctx.arc(toX(x), toY(z), r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  let t = 0;

  function update(state, dt = 0) {
    if (!state) {
      wrap.classList.remove("inc-radar-visible");
      return;
    }
    wrap.classList.add("inc-radar-visible");
    if (!w && !resize()) return;
    t += dt;

    ctx.clearRect(0, 0, w, h);

    // Floor silhouette.
    ctx.beginPath();
    footprint.forEach(([x, z], i) => {
      const px = toX(x);
      const py = toY(z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = COLORS.floor;
    ctx.fill();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Cover, dimmed while recharging.
    hidingSpots.forEach((spot, i) => {
      const charge = state.hidingCharge ? state.hidingCharge(i) : 1;
      blip(spot.x, spot.z, 1.6, charge > 0.05 ? COLORS.hide : COLORS.hideSpent);
    });

    // Tasks still owed.
    (state.objectives ?? []).forEach((o) => {
      if (o.done) return;
      ctx.beginPath();
      ctx.rect(toX(o.x) - 2.5, toY(o.z) - 2.5, 5, 5);
      ctx.fillStyle = COLORS.task;
      ctx.fill();
    });

    // Sidekicks.
    (state.minionPositions ?? []).forEach((m) => blip(m.x, m.z, 2.6, COLORS.minion, 4));

    // The boss: a pulsing ring when he is actively hunting you.
    if (state.bossPos) {
      const hunting = state.bossState === "CHASE" || state.bossState === "SEARCH";
      if (hunting) {
        const pulse = 4 + (Math.sin(t * 6) * 0.5 + 0.5) * 5;
        ctx.beginPath();
        ctx.arc(toX(state.bossPos.x), toY(state.bossPos.z), pulse, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.boss;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      blip(state.bossPos.x, state.bossPos.z, 3.4, COLORS.boss, 8);
    }

    if (state.playerPos) blip(state.playerPos.x, state.playerPos.z, 3, COLORS.player, 8);

    // A number is easier to act on than a dot: how far the boss actually is.
    if (state.bossDistance != null) {
      const metres = Math.round(state.bossDistance / (state.worldScale ?? 1));
      distEl.textContent = `${metres} m`;
      distEl.classList.toggle("inc-radar-dist-near", metres < 10);
    }
  }

  window.addEventListener("resize", () => {
    w = 0;
  });

  return { update, root: wrap };
}
