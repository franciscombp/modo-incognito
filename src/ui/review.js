import { iconEl } from "./icons.js";

/**
 * LA EVALUACIÓN DE DESEMPEÑO (docs/PANTALLAS.md §3.2, CAMPANA.md §5.2).
 *
 * El cierre del día ya calculaba la nota, pero la enseñaba como una línea de
 * texto dentro del panel de resultado — o sea, el chiste central del juego
 * pasando de largo en letra pequeña.
 *
 * Aquí es una pantalla, y su gracia está en un detalle: **los dos ejes se
 * miden POR SEPARADO y se ven a la vez**. Puedes tener los Objetivos al 100%
 * y las Competencias a cero, y entonces la nota es B y el comentario te
 * felicita mientras te hunde. Eso es exactamente lo que hace una evaluación
 * de desempeño de verdad, y es lo que no se leía en una línea de resumen.
 *
 * El tono lo pone el evaluador: pasivo-agresivo, con el vocabulario de RRHH
 * usado en serio. No hay que explicarle el chiste a nadie — quien ha pasado
 * por una lo reconoce en la primera frase.
 */

/** Cómo se llama cada eje en la jerga, que es donde está el filo. */
const EJES = [
  { key: "ques", label: "OBJETIVOS", sub: "el QUÉ · resultados entregados" },
  { key: "comos", label: "COMPETENCIAS", sub: "el CÓMO · trabajo en equipo" },
];

/**
 * El comentario del evaluador. Cada nota tiene varios y se elige al azar:
 * repetir la misma frase cinco días seguidos mata el chiste, y este es un
 * juego donde vas a ver esta pantalla veinticinco veces.
 */
const COMENTARIOS = {
  AAA: [
    "Desempeño sobresaliente. Te adelantamos de temporada. Nadie va a preguntarte cómo lo hiciste.",
    "Excede expectativas. Nos preocupa un poco, la verdad. ¿Todo bien en casa?",
  ],
  AA: [
    "Por encima de lo esperado. Casi. Lo hablamos en el próximo ciclo.",
    "Buen ritmo. Con un poquito más habrías llegado al AAA, pero no te obsesiones. O sí.",
  ],
  A: [
    "Cumple. Asciendes por antigüedad: no había nadie más que durara tanto.",
    "Objetivos alcanzados dentro del plazo máximo. Literalmente el máximo.",
  ],
  B: [
    "Cumples los objetivos, pero hay que trabajar las competencias. Te falta ser más de equipo.",
    "Resultados sólidos. La gente, sin embargo, no sabe quién eres. Eso también cuenta.",
  ],
  C: [
    "Muy buena actitud. Cero resultados. RRHH está «preocupado».",
    "Todo el mundo habla maravillas de ti. Nadie sabe decirme qué entregaste.",
  ],
  Nivelación: [
    "Cinco días sin cerrar objetivos. Entras en plan de nivelación. Es una oportunidad de crecimiento.",
    "Se activa el plan de mejora. No es un castigo: es acompañamiento.",
  ],
};
const POR_DEFECTO = ["Ciclo en curso. Seguimos monitoreando tu evolución."];

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent?.appendChild(n);
  return n;
}

export function createReview(root) {
  return {
    /**
     * Enseña la evaluación y resuelve cuando la jugadora la cierra.
     * `evalRes` es lo que devuelve `campaign.endDay()`.
     */
    show(evalRes) {
      return new Promise((resolve) => {
        const layer = el("div", "inc-review", root);
        const card = el("div", "inc-review-card", layer);

        const head = el("div", "inc-review-head", card);
        el("span", "inc-review-kicker", head, "EVALUACIÓN DE DESEMPEÑO");
        el(
          "span",
          "inc-review-cycle",
          head,
          `Temporada ${evalRes.temporada} · Día ${evalRes.dia} · ${evalRes.rango}`,
        );

        // LA NOTA, grande. Es lo primero que se busca y lo único que se
        // recuerda, así que ocupa lo que ocupa.
        const notaWrap = el("div", `inc-review-nota nota-${String(evalRes.nota).toLowerCase()}`, card);
        el("div", "inc-review-nota-value", notaWrap, evalRes.nota);
        el("div", "inc-review-nota-label", notaWrap, "calificación del ciclo");

        // LOS DOS EJES. Que se vean a la vez es todo el diseño de esta
        // pantalla: es donde se lee "hiciste el trabajo pero caes mal".
        const ejes = el("div", "inc-review-ejes", card);
        for (const eje of EJES) {
          const d = evalRes[eje.key] ?? { hechos: 0, total: 0 };
          const pct = d.total ? Math.round((d.hechos / d.total) * 100) : 100;
          const row = el("div", "inc-review-eje", ejes);
          const top = el("div", "inc-review-eje-top", row);
          el("span", "inc-review-eje-label", top, eje.label);
          el("span", "inc-review-eje-num", top, `${d.hechos}/${d.total}`);
          const bar = el("div", "inc-review-eje-bar", row);
          const fill = el("i", "", bar);
          // Se anima desde cero al entrar: la barra que crece es lo que hace
          // que esto se lea como un veredicto y no como una tabla.
          fill.style.width = "0%";
          requestAnimationFrame(() => {
            fill.style.width = `${pct}%`;
          });
          if (pct < 100) fill.classList.add("corto");
          el("div", "inc-review-eje-sub", row, eje.sub);
        }

        const lista = COMENTARIOS[evalRes.nota] ?? POR_DEFECTO;
        const comentario = lista[Math.floor(Math.random() * lista.length)];
        const quote = el("div", "inc-review-quote", card);
        el("span", "inc-review-quote-mark", quote).appendChild(iconEl("chat"));
        el("p", "inc-review-quote-text", quote, comentario);
        el("span", "inc-review-quote-by", quote, "— Gabo, tu líder de célula");

        if (evalRes.ascenso) {
          const asc = el("div", "inc-review-asc", card);
          asc.appendChild(iconEl("trophy"));
          el(
            "span",
            "",
            asc,
            evalRes.rangoSiguiente
              ? `Ascenso: ${evalRes.rango} → ${evalRes.rangoSiguiente}`
              : "Ascenso concedido",
          );
        }

        const btn = el("button", "inc-review-ok", card, "Firmar y continuar");
        btn.type = "button";
        // «Firmar» porque es lo que te hacen hacer: dar por leída una
        // evaluación que no negociaste.
        btn.addEventListener("click", () => {
          layer.classList.add("out");
          setTimeout(() => {
            layer.remove();
            resolve();
          }, 260);
        });
        requestAnimationFrame(() => layer.classList.add("on"));
        btn.focus?.();
      });
    },
  };
}
