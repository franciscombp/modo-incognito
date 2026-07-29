// Visual-novel layer: typewriter dialogue boxes with optional branching
// choices. Scenes are plain data (see src/content/), so writing new story
// beats never means touching engine code.
//
// A scene is an array of nodes:
//   { speaker, portrait, text, mood }            -> a line of dialogue
//   { prompt, options: [{ label, reply, flag, then }] } -> a choice
// `then` is a nested array of nodes, so a branch is just another scene.

const ADVANCE_KEYS = new Set([" ", "enter", "e"]);
const NEXT_KEYS = new Set(["arrowdown", "s", "tab"]);
const PREV_KEYS = new Set(["arrowup", "w"]);

const BASE = import.meta.env.BASE_URL ?? "/";
const spriteUrl = (name) => `${BASE}sprites/${name}.png`;
// Cada hoja es una rejilla de 4x4 (128x176 px, marcos de 32x44): fila 0 es la
// cara sur y columna 0 es el fotograma de reposo — el retrato usa justo esa
// esquina, ampliada x4 sin interpolar (ver .vn-portrait-sprite en style.css).

export function createDialogue(root) {
  const layer = document.createElement("div");
  layer.className = "vn-layer hidden";
  // Full-bleed cinematic box: letterbox bars, an oversized portrait that
  // breaks out of the frame and a name tab sitting on the top edge, so the
  // conversation feels part of the scene instead of a tooltip floating over it.
  layer.innerHTML = `
    <div class="vn-scrim"></div>
    <div class="vn-bar vn-bar-top"></div>
    <div class="vn-dock">
      <div class="vn-portrait">
        <span class="vn-portrait-emoji"></span>
        <span class="vn-portrait-sprite hidden"></span>
      </div>
      <div class="vn-box" role="dialog" aria-live="polite">
        <div class="vn-speaker"><span class="vn-speaker-text"></span></div>
        <div class="vn-text"></div>
        <div class="vn-options"></div>
        <div class="vn-hint">▼</div>
      </div>
    </div>
  `;
  root.appendChild(layer);

  const box = layer.querySelector(".vn-box");
  const portrait = layer.querySelector(".vn-portrait");
  const portraitEmoji = layer.querySelector(".vn-portrait-emoji");
  const portraitSprite = layer.querySelector(".vn-portrait-sprite");
  const speakerEl = layer.querySelector(".vn-speaker");
  const speakerText = layer.querySelector(".vn-speaker-text");
  const textEl = layer.querySelector(".vn-text");
  const optionsEl = layer.querySelector(".vn-options");
  const hintEl = layer.querySelector(".vn-hint");

  // Steven el Daddy narrator element
  const narratorEl = document.createElement("div");
  narratorEl.className = "vn-narrator hidden";
  narratorEl.innerHTML = `
    <div class="vn-narrator-title"><span class="vn-narrator-icon">📞</span>Steven el Daddy</div>
    <div class="vn-narrator-text"></div>
  `;
  layer.appendChild(narratorEl);
  const narratorText = narratorEl.querySelector(".vn-narrator-text");

  /** Retrato: sprite del personaje si lo tenemos, si no el emoji de siempre. */
  function setPortrait(node) {
    if (node.sheet) {
      portraitSprite.style.backgroundImage = `url(${spriteUrl(node.sheet)})`;
      portraitSprite.style.backgroundPosition = "0 0";
      portraitSprite.classList.remove("hidden");
      portraitEmoji.classList.add("hidden");
    } else {
      portraitSprite.classList.add("hidden");
      portraitEmoji.classList.remove("hidden");
      portraitEmoji.textContent = node.portrait ?? "🗨️";
    }
  }

  /** Mostrar narrador Steven el Daddy con mensaje. */
  function showNarrator(text) {
    narratorText.textContent = text;
    narratorEl.classList.remove("hidden");
  }

  /** Ocultar narrador. */
  function hideNarrator() {
    narratorEl.classList.add("hidden");
  }

  let optionButtons = [];
  let optionIndex = 0;

  function focusOption(i) {
    if (!optionButtons.length) return;
    optionIndex = ((i % optionButtons.length) + optionButtons.length) % optionButtons.length;
    optionButtons.forEach((b, idx) => b.classList.toggle("focused", idx === optionIndex));
  }

  let typingTimer = null;
  let typingResolve = null;
  let typingFull = "";
  let awaiting = null; // resolve fn for "advance"
  let active = false;

  function type(text) {
    return new Promise((resolve) => {
      typingFull = text;
      typingResolve = resolve;
      textEl.textContent = "";
      let i = 0;
      const step = () => {
        i += 1;
        textEl.textContent = text.slice(0, i);
        if (i >= text.length) {
          typingTimer = null;
          typingResolve = null;
          resolve();
          return;
        }
        typingTimer = setTimeout(step, 18);
      };
      typingTimer = setTimeout(step, 18);
    });
  }

  /** First tap skips the typewriter; the second one advances the line. */
  function finishTyping() {
    if (!typingTimer) return false;
    clearTimeout(typingTimer);
    typingTimer = null;
    textEl.textContent = typingFull;
    const resolve = typingResolve;
    typingResolve = null;
    resolve?.();
    return true;
  }

  function waitForAdvance() {
    hintEl.classList.remove("hidden");
    return new Promise((resolve) => {
      awaiting = resolve;
    });
  }

  function advance() {
    if (!active) return;
    if (finishTyping()) return;
    if (awaiting) {
      const resolve = awaiting;
      awaiting = null;
      hintEl.classList.add("hidden");
      resolve();
    }
  }

  const onKey = (e) => {
    if (!active) return;
    const key = e.key.toLowerCase();
    // Con opciones en pantalla el teclado navega entre ellas en vez de
    // avanzar la línea: flechas (o W/S) mueven el foco, espacio/enter/E elige.
    if (optionButtons.length) {
      if (NEXT_KEYS.has(key)) {
        e.preventDefault();
        focusOption(optionIndex + 1);
        return;
      }
      if (PREV_KEYS.has(key)) {
        e.preventDefault();
        focusOption(optionIndex - 1);
        return;
      }
      if (ADVANCE_KEYS.has(key)) {
        e.preventDefault();
        optionButtons[optionIndex]?.click();
        return;
      }
      const asDigit = Number(key);
      if (Number.isInteger(asDigit) && asDigit >= 1 && asDigit <= optionButtons.length) {
        e.preventDefault();
        optionButtons[asDigit - 1]?.click();
      }
      return;
    }
    if (ADVANCE_KEYS.has(key)) {
      e.preventDefault();
      advance();
    }
  };
  window.addEventListener("keydown", onKey);
  layer.addEventListener("pointerdown", (e) => {
    // Clicks on an option button must not double as "advance".
    if (e.target.closest(".vn-option")) return;
    advance();
  });

  async function playLine(node, ctx) {
    if (typeof node.effect === "string") ctx.applyEffect?.(node.effect);
    optionsEl.innerHTML = "";
    optionsEl.classList.add("hidden");
    optionButtons = [];

    // Steven el Daddy narrator mode: display in narrator element instead of dialogue box
    if (node.narrator || node.speaker === "Steven el Daddy") {
      showNarrator(resolve(node.text, ctx));
      await waitForAdvance();
      hideNarrator();
      return;
    }

    const speaker = resolve(node.speaker, ctx) ?? "";
    speakerText.textContent = speaker;
    speakerEl.classList.toggle("hidden", !speaker);
    setPortrait(node);
    portrait.dataset.mood = node.mood ?? "neutral";
    box.dataset.mood = node.mood ?? "neutral";
    if (node.color) layer.style.setProperty("--vn-accent", node.color);
    await type(resolve(node.text, ctx));
    await waitForAdvance();
  }

  function playChoice(node, ctx) {
    return new Promise(async (resolve_) => {
      speakerText.textContent = resolve(node.speaker, ctx) ?? "";
      speakerEl.classList.toggle("hidden", !node.speaker);
      setPortrait(node);
      box.dataset.mood = node.mood ?? "neutral";
      await type(resolve(node.prompt, ctx));

      hintEl.classList.add("hidden");
      optionsEl.innerHTML = "";
      optionsEl.classList.remove("hidden");
      node.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "vn-option";
        btn.type = "button";
        btn.textContent = opt.label;
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          optionsEl.innerHTML = "";
          optionsEl.classList.add("hidden");
          optionButtons = [];
          if (opt.flag) ctx.setFlag?.(opt.flag, true);
          // Effects arrive from JSON as strings; the engine maps them to
          // gameplay. A function is still accepted for code-defined scenes.
          if (typeof opt.effect === "function") opt.effect(ctx);
          else if (opt.effect) ctx.applyEffect?.(opt.effect);
          if (opt.reply) {
            await playLine(
              { speaker: opt.replySpeaker ?? "Tú", portrait: "🙂", sheet: opt.replySheet ?? "employee", text: opt.reply },
              ctx
            );
          }
          if (opt.then) await playNodes(opt.then, ctx);
          resolve_(opt);
        });
        optionsEl.appendChild(btn);
      });
      optionButtons = [...optionsEl.querySelectorAll(".vn-option")];
      focusOption(0);
    });
  }

  function resolve(value, ctx) {
    return typeof value === "function" ? value(ctx) : value;
  }

  async function playNodes(nodes, ctx) {
    for (const node of nodes) {
      if (node.when && !node.when(ctx)) continue;
      if (node.options) await playChoice(node, ctx);
      else await playLine(node, ctx);
    }
  }

  /** Runs a scene to completion. Resolves once the last node is dismissed. */
  async function play(nodes, ctx = {}) {
    if (!nodes || !nodes.length) return;
    active = true;
    layer.classList.remove("hidden");
    document.body.classList.add("vn-open");
    try {
      await playNodes(nodes, ctx);
    } finally {
      active = false;
      layer.classList.add("hidden");
      document.body.classList.remove("vn-open");
      optionsEl.innerHTML = "";
      optionButtons = [];
    }
  }

  return {
    play,
    showNarrator,
    hideNarrator,
    get isOpen() {
      return active;
    },
    dispose() {
      window.removeEventListener("keydown", onKey);
      layer.remove();
    },
  };
}
