# CLAUDE.md — guía para agentes de IA

Orientación rápida para Claude Code (u otro agente) trabajando en este repo.
Para el mapa completo de "quiero cambiar X → edito Y" con enlaces a GitHub,
usa la tabla del [README.md](https://github.com/franciscombp/modo-incognito/blob/main/README.md#quiero-cambiar-x--edito-y) —
no la dupliques aquí.

## Qué es esto

Juego web isométrico (Vite + Three.js) de sigilo/comedia de oficina. Todo el
contenido (personajes, diálogos, niveles, plano, balance de IA) está en JSON
bajo `pixel-office/public/data/`; el motor en `pixel-office/src/` solo lee
esos datos. Para añadir o cambiar contenido casi nunca hace falta tocar
código — mira primero si hay un JSON para eso.

**Lore, para diálogo nuevo:** la Tribu Canales diseña en el Centro Digital de
un banco. El meta-chiste (código secreto `incognito`, en
`manifest.json` → `codeEggs`, y el cierre de `levels/dia-5.json`) es que
"fingir que trabajas" es la coartada del equipo para programar en secreto
este mismo juego — idea original de César y Manu, programado de verdad por
Fran con Claude Code de copiloto. No reveles el chiste fuera de esos dos
momentos.

Es sátira de oficina con crítica real, no comedia inofensiva: arquetipos de
oficina (el quejoso, el intocable, el jefe inseguro) cruzados con guiños a
gente real, pensados para que el equipo se reconozca — sobre todo en lo
malo (microgestión, favoritismos, "cultura de familia" hueca). Si generas
diálogo nuevo, dale filo real; no lo suavices por defecto.

Usa mucho meme y cultura pop latinoamericana a propósito (Chapulín
Colorado, El Chavo, audios virales tipo "vamo a calmarno", Shakira, fútbol,
reguetón, telenovela) — ver ejemplos ya metidos en `dialogues.json`
(encounters, barks, teamsMessages.gabo). Si generas diálogo nuevo, sigue esa
línea con naturalidad, no como referencia forzada.

## Estructura del repo (dos partes, no la confundas)

- `pixel-office/` — el proyecto fuente real. **Edita siempre aquí.**
- Raíz del repo (`assets/`, `data/`, `sprites/`, `index.html`, `favicon.png`,
  `.nojekyll`) — copia generada del build, para que GitHub Pages funcione en
  modo "Deploy from branch". **Nunca la edites a mano.**

Regla dura: si tocaste algo en `pixel-office/src/` o
`pixel-office/public/data/`, corre `npm run build:pages` (dentro de
`pixel-office/`) antes de hacer commit, y añade también los archivos
regenerados de la raíz (`assets/`, `data/`, `index.html`) al commit. Si no,
la versión servida por Pages (o por `serve.py`) queda desincronizada del
código fuente.

## Dónde se extiende el juego (no metas esto en el motor)

Dos registros aislados a propósito. Si te piden "añade un efecto" o "añade un
minijuego", el cambio va **ahí**, no en `game.js` ni en `engine.js`:

- `src/game/effects.js` — lo que puede hacer un `"effect"` de diálogo. Una
  entrada `{ label, run(game) }` por efecto. Un nombre desconocido avisa por
  consola (antes se ignoraba en silencio y parecía que el diálogo no hacía
  nada). Los efectos usan la API pública de `Game`: `toast()`, `award()`,
  `applyPerk()`, `chispitaReport()`, `suspicion`, `timeLeft`,
  `revealBossUntil`. Si necesitas algo más, expón un método público con
  nombre claro — no llames a `_privados` desde un efecto.
- `src/game/minigames.js` — escenas jugables antes de la jornada. Se
  registran en `main.js`; el día las pide por id en su JSON, y **el texto de
  la derrota es JSON** (`minigame.onFail`), no código. El motor nunca debe
  volver a tener un `if (day.loQueSea)` para un minijuego concreto.

Si tocas el HUD o el CSS, corre `npm run check:layout` antes de darlo por
bueno: comprueba en seis tamaños de pantalla que nada se solape, se recorte
ni se salga. Este tipo de fallo no se ve en el diff y es fácil que se cuele
en una captura.

## Invariantes que no debes romper

- **`scenes/piso7.json` → `areas`**: los rectángulos de zona no deben
  solaparse. Si añades o mueves una zona, revisa `x/z/w/d` contra las
  vecinas antes de dar por bueno el cambio.
- **Unidades del plano vs. mundo**: las coordenadas en los JSON de escena
  están en "unidades de plano" (≈ un puesto de trabajo); el motor las
  multiplica por `WORLD_SCALE` (en `src/scene/config.js`). No mezcles
  unidades ya escaladas en el JSON.
- **`boss-config.json`** trae campos activos y campos reservados (para una
  futura mecánica de salida por ascensor) — su propio `$comment` dice cuáles
  son cuáles. Cambiar un campo reservado no tiene efecto todavía; no asumas
  que sí.
- Cada JSON de `public/data/` documenta su propio esquema en un array
  `"$comment"` al principio del archivo. Léelo antes de asumir la forma de
  los datos.
- Un JSON de contenido inválido debe fallar con el nombre del archivo en
  pantalla (ver `src/data/loader.js`), nunca con una pantalla en negro
  silenciosa. Si tocas el loader, no rompas esa garantía.
- **Persecución comprometida**: desde que un vigilante te mete en el halo,
  `boss.lockedOn` queda en true y NO debe soltarte por perderte de vista ni
  por atascarse contra un mueble; la única salida es un lugar seguro
  (`game._breakAllPursuits()`, que se comprueba cada frame mientras estés
  dentro, no solo al entrar). Si tocas `_advanceState` o `_updateStuck`, corre
  `npm run check:pursuit`: las cuatro reglas se pisan entre sí con facilidad
  y el fallo típico es que el jefe vuelva a rendirse solo.
- Audio: los efectos (`src/game/sfx.js`) son sintetizados con WebAudio, sin
  archivos. La música sí es una pista real
  (`public/audio/*.mp3` + `src/game/soundtrackTrack.js`) a la que se le hace
  remezcla por ánimo (filtro/volumen/velocidad), con el soundtrack procedural
  de `soundtrackThemes.js` como respaldo si el mp3 no carga — no rompas ese
  respaldo. Al cambiar de pista hay que recalcular `TRACK.bpm` y
  `TRACK.loopEnd` o el bucle se oye cortado; luego corre `npm run check:music`,
  que comprueba que suena de verdad y no solo que el archivo exista.
- Los personajes jugables usan su sprite real (campo `sheet` en
  `characters.json`/`modes.json`, mismo pliego 4x4 que el retrato de
  diálogo), no un emoji — no reintroduzcas emojis genéricos en la selección
  de personaje.

## Cómo probar cambios

Los tests (`pixel-office/tools/check-*.mjs`) son scripts de Playwright que
abren el juego real en un navegador headless y leen su estado interno vía
`window.__game`. **Necesitan el build servido en `http://localhost:4173/`
antes de correr** — no funcionan contra el servidor de `npm run dev`.

```bash
cd pixel-office
npm run build && npm run preview &   # deja el preview corriendo en :4173
npm run check                        # corre todos los check:* en orden
```

Si añades un tool nuevo en `tools/`, añádele también su script `check:*` en
`package.json` y súmalo a la cadena del script `check` agregado — si no,
queda invisible y nadie lo vuelve a correr.

## Flujo de git

Una sola rama: `main`. No hay ramas de feature ni PRs internos — se hace
commit y push directo a `main`. Antes de un push, confirma que
`npm run build:pages` corrió si tocaste `pixel-office/src` o
`pixel-office/public/data`, y que `git status` no deja la copia de la raíz
desactualizada respecto al build nuevo.
