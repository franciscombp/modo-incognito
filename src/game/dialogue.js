// Visual-novel layer: typewriter dialogue boxes with optional branching
// choices. Scenes are plain data (see src/content/), so writing new story
// beats never means touching engine code.
//
// A scene is an array of nodes:
//   { speaker, portrait, text, mood }            -> a line of dialogue
//   { prompt, options: [{ label, reply, flag, then }] } -> a choice
// `then` is a nested array of nodes, so a branch is just another scene.

import { sfxMove, sfxSelect, sfxAdvance, sfxType } from "./sfx.js";
import { createPortrait3D } from "../ui/portrait3d.js";
import { characterShot } from "../ui/charshot.js";
import { icon as svgIcon } from "../ui/icons.js";

const ADVANCE_KEYS = new Set([" ", "enter", "e"]);
const NEXT_KEYS = new Set(["arrowdown", "s", "tab"]);
const PREV_KEYS = new Set(["arrowup", "w"]);

// Cada hoja es una rejilla de 4x4 (128x176 px, marcos de 32x44): fila 0 es la
// cara sur y columna 0 es el fotograma de reposo — el retrato usa justo esa
// esquina, ampliada x4 sin interpolar (ver .vn-portrait-sprite en design-system.css).

export function createDialogue(root, { looks = null } = {}) {
  const layer = document.createElement("div");
  layer.className = "inc-layer inc-layer--overlay inc-dialogue inc-hidden";
  // Full-bleed cinematic box: letterbox bars, an oversized portrait that
  // breaks out of the frame and a name tab sitting on the top edge, so the
  // conversation feels part of the scene instead of a tooltip floating over it.
  layer.innerHTML = `
    <div class="inc-dialogue-scrim"></div>
    <div class="inc-dialogue-bar"></div>
    <div class="inc-dialogue-dock">
      <div class="inc-dialogue-portrait">
      </div>
      <div class="inc-dialogue-box" role="dialog" aria-live="polite">
        <div class="inc-dialogue-speaker"><span class="inc-dialogue-speaker-text"></span></div>
        <div class="inc-dialogue-text"></div>
        <div class="inc-dialogue-options"></div>
        <div class="inc-dialogue-hint">▼</div>
      </div>
    </div>
  `;
  root.appendChild(layer);

  const box = layer.querySelector(".inc-dialogue-box");
  const portrait = layer.querySelector(".inc-dialogue-portrait");
  const speakerEl = layer.querySelector(".inc-dialogue-speaker");
  const speakerText = layer.querySelector(".inc-dialogue-speaker-text");
  const textEl = layer.querySelector(".inc-dialogue-text");
  const optionsEl = layer.querySelector(".inc-dialogue-options");
  const hintEl = layer.querySelector(".inc-dialogue-hint");

  // Steven el Daddy narrator element
  const narratorEl = document.createElement("div");
  narratorEl.className = "inc-dialogue-narrator inc-hidden";
  narratorEl.innerHTML = `
    <div class="inc-dialogue-narrator-title"><span class="inc-dialogue-narrator-icon">${svgIcon("phone", { size: 15 })}</span>Steven el Daddy</div>
    <div class="inc-dialogue-narrator-text"></div>
  `;
  layer.appendChild(narratorEl);
  const narratorText = narratorEl.querySelector(".inc-dialogue-narrator-text");

  // El retrato es el MISMO muñeco 3D que anda por el piso, encuadrado de
  // busto. El pliego de píxeles se queda de reserva por si no hay WebGL o el
  // hablante no está en el reparto 3D.
  const portrait3d = createPortrait3D(portrait);
  let portraitMood = "neutral";

  /**
   * Qué receta 3D le toca a una línea.
   *
   * El hablante llega con nombre de pantalla ("Gabo", "Recepción"), no con id
   * de reparto. El puente es el `sheet` que `withSprites` ya le enganchó:
   * los nombres de pliego están entre los alias de characters3d.json, así que
   * "gabo-camina" resuelve a la receta de Gabo. Se prueban los candidatos en
   * orden y se acepta el primero que NO caiga en la receta genérica; si
   * ninguno acierta, genérica — que tiene cara, a diferencia de la silueta
   * gris de `npc-camina`.
   */
  function lookFor(node) {
    if (!looks) return null;
    const generic = looks.characters?.generic ?? null;
    const speaker = typeof node.speaker === "string" ? node.speaker : null;
    const candidates = [node.lookId, node.sheet, speaker, speaker?.toLowerCase()];
    for (const c of candidates) {
      if (!c) continue;
      const look = looks.get(c);
      if (look && look !== generic) return look;
    }
    // Si no hay modelo específico y el personaje no existe (recepcion, narrador, etc.),
    // devolver null para que se muestre en modo narrador, no con el genérico.
    if (speaker && !looks.get(speaker) && !looks.get(speaker?.toLowerCase())) {
      return null;
    }
    return generic;
  }

  /** Retrato: el muñeco 3D del hablante; si no se puede, su pliego. */
  function setPortrait(node) {
    portraitMood = node.mood ?? "neutral";
    // Un nodo SIN hablante (la pregunta del ascensor, un prompt del
    // sistema) no tiene cara que enseñar: caía al muñeco genérico y salía
    // un desconocido flotando sobre las puertas, presentando tu decisión.
    if (!node.speaker && !node.lookId && !node.look) {
      portrait3d.stop?.();
      portrait.classList.remove("inc-dialogue-portrait-3d");
      portrait.classList.add("inc-dialogue-portrait-off");
      return;
    }
    const look = node.look ?? lookFor(node);
    if (look && portrait3d.show(look, portraitMood)) {
      portrait3d.start();
      portrait.classList.remove("inc-dialogue-portrait-off");
      portrait.classList.add("inc-dialogue-portrait-3d");
      return;
    }

    // Sin 3D no hay retrato. Antes se caía al pliego de píxeles (y antes de
    // eso, a un emoji): quien habla se representa SIEMPRE con su muñeco, y
    // `lookFor` nunca devuelve vacío — el que no tiene receta propia usa la
    // genérica. Si aquí no hay muñeco es que no hay WebGL, y entonces la
    // caja de diálogo se queda sin retrato en vez de enseñar otra cosa.
    portrait.classList.remove("inc-dialogue-portrait-3d");
    portrait.classList.add("inc-dialogue-portrait-off");
  }

  /**
   * Mostrar narrador Steven el Daddy con mensaje.
   *
   * Mientras habla, la caja de diálogo se esconde: el narrador no tiene
   * retrato ni línea que escribir, así que la caja se quedaba vacía debajo —
   * y la primera línea del día 1 es suya, así que el juego abría con un panel
   * en blanco. `vn-narrating` es lo que la aparta.
   */
  function showNarrator(text) {
    // Un mensaje de Steven es una NOTIFICACIÓN de chat: él vive dentro de
    // la burbuja (su avatar en el título), no como retrato gigante detrás —
    // el muñeco del hablante anterior se quedaba plantado presentando el
    // Teams de otro.
    portrait3d.stop?.();
    portrait.classList.remove("inc-dialogue-portrait-3d");
    portrait.classList.add("inc-dialogue-portrait-off");
    ensureNarratorAvatar();
    narratorText.textContent = text;
    narratorEl.classList.remove("inc-hidden");
    layer.classList.add("inc-dialogue-narrating");
  }

  // El avatar de Steven dentro de la burbuja. characterShot devuelve null
  // hasta que su cuerpo está en memoria, así que se reintenta en cada
  // mensaje hasta conseguir la foto (y de ahí en adelante queda puesta).
  let narratorAvatarSet = false;
  function ensureNarratorAvatar() {
    if (narratorAvatarSet || !looks) return;
    const shot = characterShot(looks.get("steven"));
    if (!shot) return;
    const icon = narratorEl.querySelector(".inc-dialogue-narrator-icon");
    if (icon) {
      icon.innerHTML = `<img src="${shot}" alt="" class="inc-dialogue-narrator-avatar" />`;
      narratorAvatarSet = true;
    }
  }

  /** Ocultar narrador. */
  function hideNarrator() {
    narratorEl.classList.add("inc-hidden");
    layer.classList.remove("inc-dialogue-narrating");
  }

  let optionButtons = [];
  let optionIndex = 0;

  function focusOption(i, { silent = false } = {}) {
    if (!optionButtons.length) return;
    const prev = optionIndex;
    optionIndex = ((i % optionButtons.length) + optionButtons.length) % optionButtons.length;
    optionButtons.forEach((b, idx) => b.classList.toggle("focused", idx === optionIndex));
    if (!silent && optionIndex !== prev) sfxMove();
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
      // La boca se abre mientras corre la máquina de escribir y se cierra al
      // acabar la línea: el retrato deja de ser una foto y "dice" el texto.
      portrait3d.setTalking(true, portraitMood);
      // POR TIEMPO, no por tick: cuántas letras van se calcula del reloj
      // (18 ms por letra), y cada disparo del timer PONE AL DÍA el texto.
      // Contando ticks (una letra por setTimeout), cualquier dispositivo
      // que estrangule los timers encadenados —un teléfono con la CPU
      // ocupada, una pestaña a medio gas— dejaba el diálogo goteando a dos
      // letras por segundo: una línea de 80 letras tardaba MEDIO MINUTO y
      // el juego parecía colgado. Así, la línea entera dura siempre
      // text.length × 18 ms de reloj de pared, llegue el timer cuando llegue.
      const t0 = performance.now();
      let shown = 0;
      const step = () => {
        const target = Math.min(text.length, Math.floor((performance.now() - t0) / 18) + 1);
        if (target > shown) {
          shown = target;
          textEl.textContent = text.slice(0, shown);
          // Un tick de sonido por LOTE pintado, no por letra: el efecto se
          // oye igual y no ametralla el oído si el lote vino grande.
          sfxType();
        }
        if (shown >= text.length) {
          typingTimer = null;
          typingResolve = null;
          portrait3d.setTalking(false, portraitMood);
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
    portrait3d.setTalking(false, portraitMood);
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
      sfxAdvance();
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
        // Espacio es también la tecla de las actividades: si te interrumpen
        // (el jefe te aborda) a media pulsación, el navegador sigue
        // repitiendo el keydown mientras el dedo no se levanta, y eso
        // pasaba las opciones sin que nadie las leyera. `repeat` marca
        // justo esas repeticiones automáticas — se ignoran hasta que la
        // tecla se suelta y se vuelve a pulsar de verdad.
        if (e.repeat) return;
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
      // Ver la nota de arriba: una tecla ya sostenida al abrirse el diálogo
      // (por ejemplo, espacio de una actividad interrumpida) no debe avanzar
      // nada hasta que se suelte y se vuelva a pulsar.
      if (e.repeat) return;
      advance();
    }
  };
  window.addEventListener("keydown", onKey);
  layer.addEventListener("pointerdown", (e) => {
    // Clicks on an option button must not double as "advance".
    if (e.target.closest(".inc-dialogue-option")) return;
    advance();
  });

  async function playLine(node, ctx) {
    if (typeof node.effect === "string") ctx.applyEffect?.(node.effect);
    optionsEl.innerHTML = "";
    optionsEl.classList.add("hidden");
    optionButtons = [];

    // Steven el Daddy narrator mode: display in narrator element instead of dialogue box.
    // Also handles characters without visible models (recepcion, narrador, etc.) by showing them as narrator.
    let resolvedSpeaker = resolve(node.speaker, ctx);
    // "Tú" firma con el NOMBRE del personaje elegido (Giuli, Fran…): la
    // charla se lee como dos personajes hablando, no como un formulario en
    // segunda persona. El sheet ya apuntaba al personaje; faltaba el rótulo.
    if (resolvedSpeaker === "Tú") resolvedSpeaker = ctx.getPlayerName?.() ?? resolvedSpeaker;
    const speakerLook = node.look ?? lookFor({ ...node, speaker: resolvedSpeaker });
    const isInvisibleCharacter = resolvedSpeaker && !speakerLook && node.speaker !== "Steven el Daddy";

    if (node.narrator || resolvedSpeaker === "Steven el Daddy" || isInvisibleCharacter) {
      showNarrator(resolve(node.text, ctx));
      await waitForAdvance();
      hideNarrator();
      return;
    }

    const speaker = resolvedSpeaker ?? "";
    speakerText.textContent = speaker;
    speakerEl.classList.toggle("hidden", !speaker);
    setPortrait(node);
    portrait.dataset.mood = node.mood ?? "neutral";
    box.dataset.mood = node.mood ?? "neutral";
    if (node.color) layer.style.setProperty("--inc-dialogue-accent", node.color);
    await type(resolve(node.text, ctx));
    await waitForAdvance();
  }

  function playChoice(node, ctx) {
    return new Promise(async (resolve_) => {
      let choiceSpeaker = resolve(node.speaker, ctx) ?? "";
      if (choiceSpeaker === "Tú") choiceSpeaker = ctx.getPlayerName?.() ?? choiceSpeaker;
      speakerText.textContent = choiceSpeaker;
      // Sobre el TEXTO resuelto, no sobre node.speaker: un speaker que
      // resuelve a vacío dejaba la píldora del nombre visible y vacía —
      // un guioncito flotando sobre la esquina de la caja.
      speakerEl.classList.toggle("hidden", !choiceSpeaker);
      setPortrait(node);
      box.dataset.mood = node.mood ?? "neutral";
      await type(resolve(node.prompt, ctx));

      hintEl.classList.add("hidden");
      optionsEl.innerHTML = "";
      optionsEl.classList.remove("hidden");
      node.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "inc-dialogue-option inc-btn inc-btn--ghost";
        btn.type = "button";
        btn.textContent = opt.label;
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          sfxSelect();
          optionsEl.innerHTML = "";
          optionsEl.classList.add("hidden");
          optionButtons = [];
          if (opt.flag) ctx.setFlag?.(opt.flag, true);
          // Effects arrive from JSON as strings; the engine maps them to
          // gameplay. A function is still accepted for code-defined scenes.
          if (typeof opt.effect === "function") opt.effect(ctx);
          else if (opt.effect) ctx.applyEffect?.(opt.effect);
          if (opt.reply) {
            const isPlayer = !opt.replySpeaker || opt.replySpeaker === "Tú";
            const fallbackSheet = isPlayer ? ctx.getPlayerSheet?.() : null;
            await playLine(
              {
                speaker: opt.replySpeaker ?? "Tú",
                sheet: opt.replySheet ?? fallbackSheet ?? "npc-camina",
                text: opt.reply,
              },
              ctx
            );
          }
          if (opt.then) await playNodes(opt.then, ctx);
          resolve_(opt);
        });
        optionsEl.appendChild(btn);
      });
      optionButtons = [...optionsEl.querySelectorAll(".inc-dialogue-option")];
      focusOption(0, { silent: true });
    });
  }

  function resolve(value, ctx) {
    const text = typeof value === "function" ? value(ctx) : value;
    return genderize(text, ctx);
  }

  /**
   * Concuerda el texto con quien JUEGA. Una línea puede escribir
   * `{ocupado|ocupada}` (masculino|femenino) y aquí se elige la mitad que
   * toca según el personaje elegido — Fran es chico, Giuli y Kiara son
   * chicas, y "hazte la ocupada" fijo delataba que el texto no te miraba.
   * Sin género conocido gana la primera mitad, que en español hace de
   * genérico. El género de quien HABLA ya viaja en su receta
   * (`looks.get(cast).gender`) para quien escriba con él.
   */
  function genderize(text, ctx) {
    if (typeof text !== "string" || text.indexOf("{") === -1) return text;
    const fem = ctx?.getPlayerGender?.() === "f";
    return text.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, m, f) => (fem ? f : m));
  }

  async function playNodes(nodes, ctx) {
    for (const node of nodes) {
      if (node.when && !node.when(ctx)) continue;
      if (node.options) await playChoice(node, ctx);
      else await playLine(node, ctx);
    }
  }

  async function playScene(nodes, ctx) {
    active = true;
    layer.classList.remove("inc-hidden");
    document.body.classList.add("inc-dialogue-open");
    try {
      await playNodes(nodes, ctx);
    } finally {
      active = false;
      layer.classList.add("inc-hidden");
      document.body.classList.remove("inc-dialogue-open");
      // Con el diálogo cerrado el retrato no gasta un fotograma: el bucle del
      // piso ya tiene bastante con lo suyo.
      portrait3d.stop();
      hideNarrator();
      optionsEl.innerHTML = "";
      optionButtons = [];
    }
  }

  // LA COLA: los diálogos se reproducen DE UNO EN UNO, pase lo que pase.
  // Dos `play()` concurrentes comparten la misma caja, el mismo `awaiting`
  // y el mismo typewriter: se pisaban las líneas y la caja quedaba colgada
  // esperando un clic que ya se consumió. Y no es un caso raro — pasa en
  // el juego real cada vez que un secuaz te aborda en el mismo instante en
  // que el jefe te atrapa (su interrogatorio y el regaño llegan a la vez).
  // Encadenarlos hace que el segundo espere al primero, que es exactamente
  // lo que haría una conversación de verdad.
  let queue = Promise.resolve();

  /** Runs a scene to completion. Resolves once the last node is dismissed. */
  function play(nodes, ctx = {}) {
    if (!nodes || !nodes.length) return Promise.resolve();
    const run = queue.then(() => playScene(nodes, ctx));
    queue = run.catch(() => {});
    return run;
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
      portrait3d.dispose();
      layer.remove();
    },
  };
}
