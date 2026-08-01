// Registro de minijuegos: escenas jugables que ocurren ANTES de la jornada
// (cruzar la avenida, y lo que venga después).
//
// Añadir uno nuevo son dos pasos, ninguno dentro del motor:
//   1. Escribe la escena (como scene/crossing3d.js) y regístrala aquí desde
//      main.js con `registry.register(id, { play, mood })`.
//   2. En el JSON del día, declara qué minijuego corre y qué se dice si lo
//      pierdes — todo el texto es contenido, no código:
//
//      "minigame": {
//        "id": "crossing",
//        "intro":  [ ...nodos de diálogo... ],
//        "onFail": {
//          "dialogue": [ ...nodos... ],
//          "icon":  "door",   // nombre de ui/icons.js, nunca un emoji
//          "title": "Te ascendieron a cliente",
//          "body":  "Nunca llegaste a cruzar la avenida."
//        }
//      }
//
// `play(renderFn)` debe devolver una promesa que resuelva "safe" (sigues a la
// jornada) o "hit" (se dispara onFail). Cualquier otro valor cuenta como
// "safe", para que un minijuego sin condición de derrota no tenga que fingir
// una.

export function createMinigameRegistry() {
  const games = new Map();

  return {
    /**
     * @param {string} id            el que se usa en el JSON del día
     * @param {object} opts
     * @param {Function} opts.play   (renderFn) => Promise<"safe"|"hit">
     * @param {string} [opts.mood]   ánimo del soundtrack mientras dura
     * @param {string} [opts.bodyClass] clase en <body> mientras dura, para
     *                                  que el CSS pueda esconder el HUD
     */
    register(id, { play, mood = null, bodyClass = null }) {
      if (typeof play !== "function") {
        throw new Error(`[minigames] "${id}" necesita una función play()`);
      }
      games.set(id, { id, play, mood, bodyClass });
    },

    get(id) {
      return games.get(id) ?? null;
    },

    /** Lee la declaración del día y devuelve el minijuego, o null si no hay. */
    forDay(day) {
      const spec = day?.minigame;
      if (!spec) return null;
      const id = typeof spec === "string" ? spec : spec.id;
      const entry = games.get(id);
      if (!entry) {
        console.warn(
          `[modo-incognito] El día "${day.id}" pide el minijuego "${id}", que no está registrado. ` +
            `Registrados: ${[...games.keys()].join(", ") || "(ninguno)"}. Se salta.`
        );
        return null;
      }
      return { ...entry, spec: typeof spec === "string" ? { id } : spec };
    },
  };
}
