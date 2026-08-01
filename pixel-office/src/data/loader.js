// Loads the game's content from JSON under public/data/. Nothing in here
// knows about Three.js: it fetches, validates and scales plan units into
// world units, and hands plain objects to the rest of the engine.
//
// Adding a scenario, a character or a day means adding a JSON file and
// listing it in manifest.json — no engine file has to change.

import { WORLD_SCALE as S } from "../scene/config.js";

const BASE = import.meta.env.BASE_URL ?? "/";
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
 */
export async function loadGameData() {
  const manifest = await getJSON("manifest.json");

  const [
    charactersRaw,
    looksRaw,
    dialoguesRaw,
    modesRaw,
    bossConfigRaw,
    sceneList,
    levelList,
    rigList,
  ] = await Promise.all([
    getJSON(manifest.characters ?? "characters.json"),
    // Recetas de los muñecos 3D. Si faltan, cada personaje se monta con la
    // receta por defecto de character3d.js: el juego se ve gris, pero arranca.
    getJSON(manifest.characters3d ?? "characters3d.json").catch(() => ({ characters: {} })),
    getJSON(manifest.dialogues ?? "dialogues.json").catch(() => ({ cast: {}, encounters: {}, barks: {} })),
    getJSON(manifest.modes ?? "modes.json").catch(() => ({ characters: {} })),
    getJSON(manifest.bossConfig ?? "boss-config.json").catch(() => null),
    Promise.all((manifest.scenes ?? []).map((id) => getJSON(`scenes/${id}.json`))),
    Promise.all((manifest.levels ?? []).map((id) => getJSON(`levels/${id}.json`))),
    // Rigs de personaje: qué poses usa cada uno y cómo se queda esperando.
    // Ver data/sprites/*.json.
    Promise.all((manifest.sprites ?? []).map((id) => getJSON(`sprites/${id}.json`))),
  ]);

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
    scenes,
    levels,
    rigs: new Map(rigList.map((r) => [r.id, r])),
    looks: prepareLooks(looksRaw),
    codeEggs: manifest.codeEggs ?? [],
  };
}

/**
 * Las recetas de los muñecos 3D, con la búsqueda ya resuelta.
 *
 * El motor pregunta por un personaje de muchas maneras según de dónde venga
 * (id de personaje jugable, id de cast del diálogo, o el nombre del pliego que
 * traía el plano), así que aquí se aplanan los alias y se devuelve un `get()`
 * que responde a todos ellos y nunca deja a nadie sin cara.
 */
function prepareLooks(raw) {
  const characters = raw.characters ?? {};
  const aliases = raw.aliases ?? {};
  const extras = raw.extras ?? [];

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
