import { iconEl } from "./icons.js";

/**
 * LA LIBRETA (data/libreta.json) — el diario de chismes, al estilo del
 * cuaderno de Sneaky Sasquatch.
 *
 * Cada charla real, cada encargo del arco y cada secreto del piso ESCRIBE
 * una página (los enganches viven en engine.js → anotarPista). Aquí solo se
 * LEE: qué páginas hay, cuáles faltan (en blanco, con su fuente insinuada) y
 * cómo va EL PROYECTO — el secreto final que se arma por piezas, cada una
 * con su letra.
 *
 * Reglas:
 * · Una pantalla nunca escribe progreso: la libreta pinta `save.libreta` y
 *   nada más.
 * · La página del proyecto INSINÚA y deletrea, pero jamás dice qué es: la
 *   revelación vive en su egg y en el cierre del día 5 (regla de lore de
 *   CLAUDE.md).
 * · Página en blanco ≠ página invisible: se ve QUE FALTA algo (renglones
 *   vacíos), porque saber cuánto te falta es lo que da ganas de buscarlo.
 */

const SECCIONES = [
  { tipo: "mision", titulo: "Encargos" },
  { tipo: "charla", titulo: "La gente" },
  { tipo: "secreto", titulo: "Hallazgos del piso" },
];

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent?.appendChild(n);
  return n;
}

export function createLibreta(root, { save, data = null } = {}) {
  return {
    get disponible() {
      return !!data?.pistas?.length;
    },

    /** Cuántas piezas del proyecto ya están anotadas. */
    piezasProyecto() {
      const tengo = new Set(save.libreta);
      const piezas = data?.proyecto?.piezas ?? [];
      return { hechas: piezas.filter((p) => tengo.has(p.pista)).length, total: piezas.length };
    },

    /** Enseña la libreta y resuelve al cerrarla. */
    show() {
      if (!data?.pistas?.length) return Promise.resolve();
      return new Promise((resolve) => {
        const tengo = new Set(save.libreta);
        const layer = el("div", "inc-lib", root);
        const card = el("div", "inc-lib-card", layer);

        const head = el("div", "inc-lib-head", card);
        el("span", "inc-lib-kicker", head, "LIBRETA PERSONAL · NO OFICIAL");
        el("h2", "inc-lib-title", head, data.titulo ?? "La libreta");
        el("span", "inc-lib-sub", head, data.sub ?? "");

        // ── EL PROYECTO: el secreto final, armándose por piezas ──
        const proyecto = data.proyecto;
        if (proyecto?.piezas?.length) {
          const box = el("div", "inc-lib-proyecto", card);
          const ptop = el("div", "inc-lib-proyecto-top", box);
          el("span", "inc-lib-proyecto-title", ptop, proyecto.titulo ?? "EL PROYECTO");
          const hechas = proyecto.piezas.filter((p) => tengo.has(p.pista)).length;
          el("span", "inc-lib-proyecto-count", ptop, `${hechas}/${proyecto.piezas.length} piezas`);
          el("p", "inc-lib-proyecto-sub", box, proyecto.sub ?? "");
          // Las letras: un hueco por pieza, la letra solo si su pista está
          // anotada. Deletrea sin decir — el momento de entender es tuyo.
          const letras = el("div", "inc-lib-letras", box);
          for (const pieza of proyecto.piezas) {
            const have = tengo.has(pieza.pista);
            el("span", `inc-lib-letra${have ? " on" : ""}`, letras, have ? pieza.letra : "·");
          }
          if (hechas === proyecto.piezas.length && proyecto.cierre) {
            el("p", "inc-lib-cierre", box, proyecto.cierre);
          }
        }

        // ── Las páginas, por fuente ──
        for (const sec of SECCIONES) {
          const pistas = (data.pistas ?? []).filter((p) => p.fuente?.tipo === sec.tipo);
          if (!pistas.length) continue;
          const found = pistas.filter((p) => tengo.has(p.id)).length;
          const h = el("div", "inc-lib-sec", card);
          el("span", "inc-lib-sec-title", h, sec.titulo);
          el("span", "inc-lib-sec-count", h, `${found}/${pistas.length}`);
          const list = el("div", "inc-lib-list", card);
          for (const p of pistas) {
            const have = tengo.has(p.id);
            const row = el("div", `inc-lib-pista${have ? "" : " blank"}`, list);
            const mark = el("span", "inc-lib-pista-mark", row);
            mark.appendChild(iconEl(have ? "check" : "question"));
            const body = el("div", "inc-lib-pista-body", row);
            if (have) {
              el("div", "inc-lib-pista-title", body, p.titulo);
              el("p", "inc-lib-pista-text", body, p.texto);
            } else {
              // En blanco pero PRESENTE: renglones vacíos, como una página
              // que espera. Saber cuánto falta es la zanahoria.
              el("div", "inc-lib-pista-title inc-lib-pista-title--blank", body, "Página en blanco");
              const rules = el("div", "inc-lib-rules", body);
              el("span", "inc-lib-rule", rules);
              el("span", "inc-lib-rule", rules);
            }
          }
        }

        const btn = el("button", "inc-lib-ok", card, "Guardar la libreta");
        btn.type = "button";
        const close = () => {
          // El flag de captura tiene que coincidir con el del alta, o el
          // listener se queda vivo para siempre.
          window.removeEventListener("keydown", onKey, { capture: true });
          layer.classList.add("out");
          setTimeout(() => {
            layer.remove();
            resolve();
          }, 240);
        };
        const onKey = (e) => {
          const k = e.key.toLowerCase();
          if (k === "escape" || k === "l") {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        };
        btn.addEventListener("click", close);
        layer.addEventListener("click", (e) => {
          if (e.target === layer) close();
        });
        // Captura, para ganarle al listener global de pausa con Esc.
        window.addEventListener("keydown", onKey, { capture: true });
        requestAnimationFrame(() => layer.classList.add("on"));
        btn.focus?.();
      });
    },
  };
}
