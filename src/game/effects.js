// Efectos que una opción de diálogo puede disparar desde el JSON.
//
// Añadir uno nuevo es añadir una entrada aquí — no hay que tocar game.js ni
// ningún otro archivo del motor. Cada efecto recibe la partida en curso y
// hace lo suyo; `label` es solo documentación para quien escriba contenido.
//
// En dialogues.json se usan por su nombre:
//   { "label": "«Dame de esa suerte.»", "effect": "suspicion-" }

export const EFFECTS = {
  "suspicion-": {
    label: "Baja la sospecha de golpe",
    run: (game) => {
      game.suspicion = Math.max(0, game.suspicion - 45);
      game.toast("La sospecha baja");
    },
  },

  "suspicion+": {
    label: "Alguien te delata: sube la sospecha",
    run: (game) => {
      game.suspicion = Math.min(game.suspicionConfig.max, game.suspicion + 30);
      game.toast("Alguien levantó la voz…");
    },
  },

  "speed+": {
    label: "Cafeína: te mueves más rápido un rato",
    run: (game) => game.applyPerk("caffeine"),
  },

  "reveal-boss": {
    label: "Te marca dónde está el jefe unos segundos",
    run: (game) => {
      game.revealBossUntil = 12;
      game.toast("Sabes dónde está el jefe");
    },
  },

  // Había DOS entradas "time+" en este objeto: la primera («gana 2 minutos»)
  // la pisaba esta en silencio, así que el nombre prometía un premio y hacía
  // lo contrario. Queda una sola, y es la que usa el contenido (Giuli:
  // «fingir bien hace que el día vuele»).
  "time+": {
    label: "El reloj de la jornada avanza de golpe",
    run: (game) => {
      // Farmear con Giuli finge tan bien que hasta el reloj se lo cree.
      game.timeLeft = Math.max(0, game.timeLeft - 45);
      game.toast("El reloj corre más rápido…");
    },
  },

  // LAS ELECCIONES DE LA INTRO TIENEN EFECTO. Las opciones del día 2 («laptop
  // como escudo» / «prefiero improvisar») guardaban un `flag` que no leía
  // nadie: una elección sin consecuencia es un botón de «siguiente» con dos
  // textos. Ahora cada una compra algo distinto para ESA jornada.
  "laptop-escudo": {
    label: "La laptop abierta como coartada: te fichan más despacio todo el día",
    run: (game) => game.ponerCoartada("laptop", 0.8, "Laptop abierta: pareces ocupada"),
  },

  improvisar: {
    label: "Sin plan pero fresca: arrancas con más energía",
    run: (game) => {
      game.grantEnergy(15, game.player.position);
      game.toast("Sin plan, pero fresca: +15 de energía");
    },
  },

  "chispita-report": {
    label: "Chispita corre a delatarte (con posible efecto rebote)",
    run: (game) => {
      game.suspicion = Math.min(game.suspicionConfig.max, game.suspicion + 30);
      game.chispitaReport();
    },
  },
};

/**
 * Ejecuta un efecto por nombre. Un nombre desconocido avisa en consola en vez
 * de no hacer nada en silencio: una errata en dialogues.json antes se tragaba
 * el efecto sin dejar rastro, y parecía que el diálogo simplemente "no hacía
 * nada".
 */
export function runEffect(name, game) {
  const effect = EFFECTS[name];
  if (!effect) {
    console.warn(
      `[modo-incognito] Efecto desconocido "${name}". ` +
        `Los válidos son: ${Object.keys(EFFECTS).join(", ")}. ` +
        `Revisa dialogues.json o añádelo en src/game/effects.js.`
    );
    return false;
  }
  effect.run(game);
  return true;
}
