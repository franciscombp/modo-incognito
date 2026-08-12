// Loads the game's content from JSON under public/data/. Nothing in here
// knows about Three.js: it fetches, validates and scales plan units into
// world units, and hands plain objects to the rest of the engine.
//
// Adding a scenario, a character or a day means adding a JSON file and
// listing it in manifest.json — no engine file has to change.

import { WORLD_SCALE as S } from "../scene/config.js";
import { loadBaseModel, modelUrlFor } from "../entities/baseModel.js";
import { baseFileFor } from "../entities/character3d.js";
import { siteRoot } from "./siteRoot.js";
import { applyCharacterModels } from "./characterRecipes.js";

const BASE = siteRoot();
// Sello del build (ver vite.config.js). El contenido vive en `public/` y se
// sirve con su nombre de siempre: sin esto, publicar un cambio de plano no
// basta para que la jugadora lo vea.
const V = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

async function getJSON(path) {
  const res = await fetch(`${BASE}data/${path}?v=${V}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`No se pudo cargar data/${path} (${res.status})`);
  try {
    return await res.json();
  } catch (err) {
    throw new Error(`data/${path} no es JSON válido: ${err.message}`);
  }
}

const pt = (p) => ({ ...p, x: p.x * S, z: p.z * S });
const rect = (r) => ({ ...r, x: r.x * S, z: r.z * S, w: r.w * S, d: r.d * S });

function required(obj, field, where) {
  if (obj[field] == null) throw new Error(`${where}: falta el campo "${field}"`);
  return obj[field];
}

/** Turns a scene JSON (plan units) into the world-unit scene the engine uses. */
export function prepareScene(raw) {
  const where = `escena "${raw.id ?? "?"}"`;
  const areas = required(raw, "areas", where).map((a) => {
    if (a.capacity == null) a.capacity = 0;
    return rect(a);
  });

  return {
    id: raw.id,
    name: raw.name,
    areas,
    areaById: new Map(areas.map((a) => [a.id, a])),
    footprint: required(raw, "footprint", where).map(([x, z]) => [x * S, z * S]),
    spawn: pt(required(raw, "spawn", where)),
    entrance: { ...raw.entrance, x: raw.entrance.x * S, z: raw.entrance.z * S, w: raw.entrance.w * S },
    corridors: (raw.corridors ?? []).map(rect),
    plants: (raw.props ?? []).filter((p) => p.type === "plant").map(pt),
    props: (raw.props ?? []).map(pt),
    patrolRoute: (raw.routes?.jefe ?? required(raw, "patrol", where)).map(pt),
    routes: Object.fromEntries(
      Object.entries(raw.routes ?? { jefe: raw.patrol ?? [] }).map(([name, points]) => [
        name,
        points.map(pt),
      ])
    ),
    // Tabiques rectos que parten el piso, con su hueco de puerta. Ver el
    // bloque "$barriers" del propio JSON de escena.
    barriers: (raw.barriers ?? []).map((b) => ({
      ...b,
      at: b.at * S,
      from: b.from * S,
      to: b.to * S,
      door: b.door ? { at: b.door.at * S, w: b.door.w * S } : null,
    })),
    activityStations: (raw.activities ?? []).map(pt),
    hidingSpots: (raw.hidingSpots ?? []).map((h) => ({ ...pt(h), r: (h.r ?? 1.3) * S })),
    // LAS COARTADAS: objetos del piso que, mientras los llevas, enfrían lo
    // que un secuaz acumula al verte pasar (ver `$coartadas` en la escena).
    coartadas: (raw.coartadas ?? []).map(pt),
    safeSpots: (raw.safeSpots ?? []).map((s) => ({ ...pt(s), radius: (s.radius ?? 1.3) * S })),
    distractions: (raw.distractions ?? []).map((d) => ({ ...pt(d), radius: (d.radius ?? 1.2) * S })),
    npcs: (raw.npcs ?? []).map(pt),
    locationEggs: (raw.eggs ?? []).map((e) => ({ ...pt(e), radius: (e.radius ?? 2) * S })),
  };
}

/** Character stats are authored in plan units too. */
function prepareCharacters(raw) {
  const scaleChar = (c) => ({
    ...c,
    height: (c.height ?? 1.45) * S,
    radius: (c.radius ?? 0.28) * S,
    speed: c.speed != null ? c.speed * S : undefined,
    visionRange: c.visionRange != null ? c.visionRange * S : undefined,
    speeds: c.speeds
      ? Object.fromEntries(Object.entries(c.speeds).map(([k, v]) => [k, v * S]))
      : undefined,
  });
  return {
    player: scaleChar(raw.player),
    boss: scaleChar(raw.boss),
    minions: Object.fromEntries(
      Object.entries(raw.minions ?? {}).map(([k, v]) => [k, scaleChar(v)])
    ),
    npcs: Object.fromEntries(Object.entries(raw.npcs ?? {}).map(([k, v]) => [k, scaleChar(v)])),
  };
}

/**
 * Loads everything the game needs to start. Scenes and levels are fetched in
 * parallel; a broken file fails loudly with the filename in the message so a
 * typo in content never shows up as a blank screen.
 *
 * Optional onProgress callback receives updates: { phase, progress, message }
 * - phase: "manifest" | "core" | "looks" | "complete"
 * - progress: 0-100
 * - message: human-readable status
 */
export async function loadGameData(onProgress) {
  const report = (phase, progress, message) => {
    if (onProgress) onProgress({ phase, progress, message });
  };

  const manifest = await getJSON("manifest.json");
  report("manifest", 10, "Cargando datos del juego");

  const [
    charactersRaw,
    looksRaw,
    modelsRaw,
    dialoguesRaw,
    modesRaw,
    bossConfigRaw,
    campaignRaw,
    libretaRaw,
    sceneList,
    levelList,
    rigList,
  ] = await Promise.all([
    getJSON(manifest.characters ?? "characters.json"),
    // Recetas de los muñecos 3D. Si faltan, cada personaje se monta con la
    // receta por defecto de character3d.js: el juego se ve gris, pero arranca.
    getJSON(manifest.characters3d ?? "characters3d.json").catch(() => ({ characters: {} })),
    // Índice de public/models/, generado por tools/index-models.mjs. Si falta,
    // el reparto entero se monta con primitivas: se ve, pero sin los cuerpos.
    getJSON("models.json").catch(() => ({ bodies: {}, faces: {} })),
    getJSON(manifest.dialogues ?? "dialogues.json").catch(() => ({ cast: {}, encounters: {}, barks: {} })),
    getJSON(manifest.modes ?? "modes.json").catch(() => ({ characters: {} })),
    getJSON(manifest.bossConfig ?? "boss-config.json").catch(() => null),
    // La temporada de campaña (docs/CAMPANA.md). Sin archivo, el juego cae
    // al modelo de días sueltos de siempre: la campaña es opt-in por datos.
    getJSON(manifest.campaign ?? "campaign/temporada-1.json").catch(() => null),
    // La libreta de chismes y pistas. Sin archivo, sencillamente no hay
    // libreta: ningún enganche escribe páginas y la tecla no abre nada.
    getJSON(manifest.libreta ?? "libreta.json").catch(() => null),
    Promise.all((manifest.scenes ?? []).map((id) => getJSON(`scenes/${id}.json`))),
    Promise.all((manifest.levels ?? []).map((id) => getJSON(`levels/${id}.json`))),
    // Rigs de personaje: qué poses usa cada uno y cómo se queda esperando.
    // Ver data/sprites/*.json.
    Promise.all((manifest.sprites ?? []).map((id) => getJSON(`sprites/${id}.json`))),
  ]);

  report("core", 50, "Datos del juego listos");

  const scenes = new Map(sceneList.map((raw) => [raw.id, prepareScene(raw)]));
  if (!scenes.size) throw new Error("manifest.json no declara ninguna escena");

  const levels = levelList.map((lvl, i) => ({
    ...lvl,
    number: lvl.number ?? i + 1,
    scene: lvl.scene ?? sceneList[0].id,
    rules: lvl.rules ?? {},
  }));
  if (!levels.length) throw new Error("manifest.json no declara ningún nivel");

  for (const lvl of levels) {
    if (!scenes.has(lvl.scene)) {
      throw new Error(`El nivel "${lvl.id}" apunta a la escena "${lvl.scene}", que no existe`);
    }
  }

  const looks = prepareLooks(looksRaw, modelsRaw);
  report("looks", 90, "Personajes listos");

  return {
    manifest,
    dialogues: {
      cast: dialoguesRaw.cast ?? {},
      encounters: dialoguesRaw.encounters ?? {},
      barks: dialoguesRaw.barks ?? {},
    },
    characters: prepareCharacters(charactersRaw),
    modes: modesRaw.characters ?? {},
    bossConfig: bossConfigRaw,
    campaign: campaignRaw,
    libreta: libretaRaw,
    scenes,
    levels,
    rigs: new Map(rigList.map((r) => [r.id, r])),
    looks,
    codeEggs: manifest.codeEggs ?? [],
  };
}

/**
 * Descarga los cuerpos esculpidos que pide el reparto.
 *
 * Va aparte del resto de la carga y NO bloquea el arranque: un .glb pesa lo
 * que pesa y el juego tiene que poder empezar mientras llega. Lo que sí gana
 * es que, cuando el jugador llega a la pantalla de selección, los modelos ya
 * están en memoria y los retratos se pueden montar de una vez — que es lo que
 * antes dejaba la tarjeta en blanco.
 */
export function preloadBaseModels(looks, onProgress) {
  // `baseFileFor` y no `recipe.baseModel` a secas: quien no tiene .glb propio
  // usa un cuerpo base según su género, y ese archivo también hay que
  // precargarlo o los retratos de esos personajes salen en blanco.
  const files = new Set();
  for (const recipe of Object.values(looks?.characters ?? {})) {
    if (recipe) files.add(baseFileFor(recipe));
  }
  for (const recipe of looks?.extras ?? []) {
    if (recipe) files.add(baseFileFor(recipe));
  }
  const fileArray = [...files];
  // El progreso cuenta COMPLETADOS, no índices: con `(i+1)/N` el valor final
  // era el del archivo que terminara último — si ese era el índice 0, el
  // progreso se quedaba clavado en 10% con todo ya cargado, y el ascensor
  // esperaba su techo de 30 segundos mirando a la nada.
  let done = 0;
  return Promise.all(
    fileArray.map((f) =>
      loadBaseModel(modelUrlFor(f))
        .catch((e) => {
          console.error(`No se pudo precargar ${f}:`, e);
        })
        .finally(() => {
          done += 1;
          if (onProgress) {
            const progress = Math.round((done / fileArray.length) * 100);
            onProgress({ phase: "models", progress, message: `Cargando modelos 3D...` });
          }
        })
    )
  );
}

/**
 * Preload only specific character looks (e.g., the selected one).
 * Used for lazy loading to reduce initial load time.
 */
export function preloadCharacterLooks(characterIds, looks, onProgress) {
  const files = new Set();
  for (const id of characterIds) {
    const recipe = looks?.characters?.[id];
    if (recipe) files.add(baseFileFor(recipe));
  }
  const fileArray = [...files];
  if (fileArray.length === 0) {
    if (onProgress) onProgress({ phase: "selected-models", progress: 100, message: "Personaje listo" });
    return Promise.resolve();
  }
  // Mismo arreglo que preloadBaseModels: el progreso cuenta completados.
  let done = 0;
  return Promise.all(
    fileArray.map((f) =>
      loadBaseModel(modelUrlFor(f))
        .catch((e) => {
          console.error(`No se pudo precargar ${f}:`, e);
        })
        .finally(() => {
          done += 1;
          if (onProgress) {
            const progress = Math.round((done / fileArray.length) * 100);
            onProgress({ phase: "selected-models", progress, message: "Cargando personaje..." });
          }
        })
    )
  );
}

/**
 * Las recetas de los muñecos 3D, con la búsqueda ya resuelta.
 *
 * El motor pregunta por un personaje de muchas maneras según de dónde venga
 * (id de personaje jugable, id de cast del diálogo, o el nombre del pliego que
 * traía el plano), así que aquí se aplanan los alias y se devuelve un `get()`
 * que responde a todos ellos y nunca deja a nadie sin cara.
 */
export function prepareLooks(raw, models = { bodies: {}, faces: {} }) {
  const characters = raw.characters ?? {};
  const aliases = raw.aliases ?? {};
  const extras = raw.extras ?? [];

  // EL ARCHIVO MANDA. Si en public/models/ hay un `<id>.glb`, ese personaje
  // usa ese cuerpo — no hace falta declararlo en characters3d.json, que es lo
  // que hace que meter un personaje sea dejar el archivo y nada más. Un
  // `baseModel` escrito a mano sigue valiendo, para apuntar a otro nombre.
  applyCharacterModels(characters, models);

  const get = (name) => {
    if (!name) return characters.generic ?? null;
    return characters[name] ?? characters[aliases[name]] ?? characters.generic ?? null;
  };

  return {
    characters,
    extras,
    get,
    /** Variante de relleno, para que los NPC sin nombre no salgan clonados. */
    extra: (i) => (extras.length ? extras[i % extras.length] : get(null)),
  };
}
