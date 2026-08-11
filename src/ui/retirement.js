import { iconEl } from "./icons.js";

/**
 * LA JUBILACIÓN (el final del juego, y el único que hay).
 *
 * La carrera sube por RANGOS (campaign.js) y el último peldaño se llama
 * literalmente "Jubilación": esta pantalla es ese peldaño. Solo se llega
 * con TODO desbloqueado — el último ascenso se retiene mientras queden
 * chismes en la libreta (ver campaign.endDay) — así que quien la ve lo
 * hizo todo, y la pantalla lo dice con todas las letras.
 *
 * Mismo idioma que la evaluación (review.js): tarjeta centrada, el dato
 * grande al centro, y UNA acción primaria. Aquí la primaria es "Volver a
 * comenzar" porque es lo que pidió el diseño: el final invita a rejugar,
 * no a quedarse mirando el trofeo.
 */

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent?.appendChild(n);
  return n;
}

export function createRetirement(root) {
  return {
    /**
     * Enseña la jubilación. Resuelve `{ restart }`: true si la jugadora
     * eligió empezar de cero (el llamador hace el reset — una pantalla
     * nunca escribe progreso), false si prefiere quedarse de visita.
     */
    show({ jornadas = 0, chismes = 0, chismesTotal = 0, secretos = 0, rango = "Jubilación" } = {}) {
      return new Promise((resolve) => {
        const layer = el("div", "inc-retire", root);
        const card = el("div", "inc-retire-card", layer);

        const trophy = el("div", "inc-retire-trophy", card);
        trophy.appendChild(iconEl("trophy"));

        el("div", "inc-retire-kicker", card, "COMUNICADO DE RECURSOS HUMANOS");
        el("div", "inc-retire-title", card, "¡FELICIDADES!");
        el("div", "inc-retire-sub", card, "Lograste la JUBILACIÓN");
        el(
          "p",
          "inc-retire-body",
          card,
          "Toda una carrera fingiendo que trabajas, y nadie se enteró nunca. " +
            "La libreta está completa, el proyecto tiene nombre y el piso 7 " +
            "queda en manos de la siguiente generación de improductivos.",
        );

        const stats = el("div", "inc-retire-stats", card);
        const stat = (valor, etiqueta) => {
          const s = el("div", "inc-retire-stat", stats);
          el("b", null, s, String(valor));
          el("span", null, s, etiqueta);
        };
        stat(jornadas, jornadas === 1 ? "jornada sobrevivida" : "jornadas sobrevividas");
        stat(chismesTotal ? `${chismes}/${chismesTotal}` : chismes, "chismes en la libreta");
        if (secretos > 0) stat(secretos, "secretos del piso");

        const actions = el("div", "inc-retire-actions", card);
        const again = el("button", "inc-retire-again", actions, "Volver a comenzar");
        again.type = "button";
        const stay = el("button", "inc-retire-stay", actions, "Quedarme de visita");
        stay.type = "button";

        const close = (restart) => {
          layer.classList.add("out");
          setTimeout(() => {
            layer.remove();
            resolve({ restart });
          }, 260);
        };
        again.addEventListener("click", () => close(true));
        stay.addEventListener("click", () => close(false));

        requestAnimationFrame(() => layer.classList.add("on"));
        again.focus?.();
      });
    },
  };
}
