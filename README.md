# Modo Incógnito · Piso 10

Juego web en Three.js: eres una empleada del Piso 10 que intenta **no trabajar**
—café, película, comer— mientras el jefe patrulla la planta.

> **Estado: MVP del día 1.** La campaña publicada es **solo el día 1**, pulido
> de principio a fin: cruzas la avenida Amazonas, subes por el ascensor y
> tienes tres cosas que hacer (tomar café, ver película, comer) en el **ala
> sur**, con Gabo pegado a ti todo el rato. Los días 2 a 5 siguen escritos en
> `pixel-office/public/data/levels/` pero están **fuera de**
> [`manifest.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/manifest.json)
> → `levels`, así que no aparecen. Volver a activarlos es añadir su id a esa
> lista; no hay nada más que tocar.

**Lore, para quien escriba diálogos nuevos:** trabajas en el equipo de
diseño de un corporativo — creativos dentro de una empresa que
no lo es tanto. El meta-chiste, para quien lo encuentre (código secreto
`incognito`, ver `manifest.json` → `codeEggs`, y el cierre del día 5 en
`levels/dia-5.json`): "fingir que trabajas" es, en la ficción, la coartada
del equipo para programar en secreto este mismo juego y mantener viva su
creatividad. La idea original es de C y Manu; con el apoyo de Fran, con Claude Code de copiloto — un guiño real, no solo de
ficción. No lo spoilees en textos nuevos fuera de esos dos momentos — que se
descubra jugando.

Esto es una **sátira de oficina con crítica de verdad**, no solo comedia
ligera. Los personajes mezclan arquetipos típicos (el quejoso, el que
siempre se salva de todo, el jefe inseguro con apodo ridículo) con guiños a
gente real de la oficina — la gracia está en que cualquiera de la Tribu
pueda reconocerse, y reconozca sobre todo lo malo: la microgestión, los
favoritismos, el "banco innovador" que no lo es, la cultura de "familia" que
se usa para pedir más sin dar más. Si escribes diálogo nuevo, que tenga
filo — un chiste sin nada que criticar es solo relleno.

También hay mucho **meme y cultura pop latinoamericana** metidos con calzador
a propósito — Chapulín Colorado ("no contaban con mi astucia"), El Chavo
("fue sin querer queriendo"), audios virales ("vamo a calmarno"), Shakira
("las mujeres ya no lloran, facturan"), fútbol ("no era penal"), reguetón,
telenovela. Están repartidos en `dialogues.json` (encounters, barks,
teamsMessages.gabo). Si escribes diálogo nuevo, mételos con la misma
naturalidad — una referencia sin fuerza ni disfraz, como la soltaría
cualquiera del equipo en el chat.

Se publica en <https://franciscombp.github.io/modo-incognito/> desde `main`.
**El repositorio usa una sola rama.**

El build usa rutas relativas y se copia también a la raíz del repo, así que
funciona con cualquiera de las dos configuraciones de *Settings → Pages*:
**GitHub Actions** (recomendada) o **Deploy from a branch → main / (root)**.
Antes fallaba porque, sin `index.html` en la raíz, Pages renderiza el README.

## Jugar en local sin npm

En una máquina con hardening donde no puedes instalar nada, basta el Python
del sistema:

```bash
python3 serve.py          # http://localhost:8000
python3 serve.py 9000     # otro puerto
```

Sirve la raíz del repo, que ya trae el juego compilado. **Para editar
contenido no hace falta compilar**: toca `data/*.json` o `sprites/*.png` y
recarga el navegador. Solo los cambios en `pixel-office/src/` piden un build.

Abrir `index.html` con doble clic no funciona: el navegador bloquea los
módulos y la carga de los JSON desde `file://`. Por eso el servidor.

## Quiero cambiar X → edito Y

Tabla rápida con enlaces directos a GitHub. Todo el contenido del juego vive
en JSON bajo `pixel-office/public/data/`; el motor (`pixel-office/src/`) solo
lee esos archivos, así que para el 90% de los cambios **no hace falta tocar
código**.

| Quiero cambiar… | Edito este archivo |
| --- | --- |
| Qué personajes/modos puede elegir la jugadora | [`modes.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/modes.json) |
| Estadísticas de la jugadora, el jefe y los NPC (velocidad, visión, sprite) | [`characters.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/characters.json) |
| Cualquier diálogo (compañeros, secuaces, jefe) | [`dialogues.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/dialogues.json) |
| El guion de un día concreto (reglas, prólogo, secuaces de turno) | [`levels/dia-N.json`](https://github.com/franciscombp/modo-incognito/tree/main/pixel-office/public/data/levels) |
| El plano de la oficina (zonas, escondites, distracciones, secretos) | [`scenes/piso7.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/scenes/piso7.json) |
| El balance de IA del jefe / sospecha | [`boss-config.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/boss-config.json) |
| Qué puede hacer una opción de diálogo (`effect`) | [`src/game/effects.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/game/effects.js) |
| Registrar un minijuego nuevo (antes de la jornada) | [`src/game/minigames.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/game/minigames.js) |
| Los efectos de sonido 8-bit (menús, diálogo, acciones) (código) | [`src/game/sfx.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/game/sfx.js) |
| La pista de música y cómo reacciona al juego | [`src/game/soundtrackTrack.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/game/soundtrackTrack.js) + [`public/audio/`](https://github.com/franciscombp/modo-incognito/tree/main/pixel-office/public/audio) |
| El soundtrack procedural de respaldo (notas, tempo, mezcla) | [`src/game/soundtrackThemes.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/game/soundtrackThemes.js) |
| Cómo decide el motor cuándo cambiar de ánimo musical (código) | [`src/game/soundtrack.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/game/soundtrack.js) |
| Qué escenas/niveles/secretos por teclado existen | [`manifest.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/manifest.json) |
| Colocar zonas, tareas, lugares seguros… con el ratón | [`builder/`](https://github.com/franciscombp/modo-incognito/tree/main/builder) — ver «El builder» más abajo |
| Estilos visuales (HUD, menús, diálogo, colores) | [`src/style.css`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/style.css) |
| Sprites de personajes | [`public/sprites/*.png`](https://github.com/franciscombp/modo-incognito/tree/main/pixel-office/public/sprites) |
| Ilustraciones grandes de actividades (opcional, con emoji de respaldo) | [`public/actions/<id>.png`](https://github.com/franciscombp/modo-incognito/tree/main/pixel-office/public/actions) |
| Cómo decide y persigue el jefe/los secuaces (código) | [`src/entities/boss.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/entities/boss.js) |
| Reglas centrales de una jornada (código) | [`src/game/game.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/game/game.js) |
| El flujo de campaña día a día (código) | [`src/game/engine.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/game/engine.js) |
| El HUD (tarjetas, radar, indicadores) (código) | [`src/game/hud.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/game/hud.js) |
| El sistema de diálogo a pantalla completa (código) | [`src/game/dialogue.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/game/dialogue.js) |
| La construcción 3D de la oficina (código) | [`src/scene/builder.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/scene/builder.js) |
| La cámara (código) | [`src/scene/camera.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/scene/camera.js) y [`src/scene/config.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/scene/config.js) |
| Los menús (título, elegir día, ajustes, pausa) (código) | [`src/ui/menus.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/ui/menus.js) |
| Los controles táctiles (código) | [`src/game/touchControls.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/game/touchControls.js) |
| El vestíbulo de ascensores (segunda "escena", antes del piso) (código) | [`src/ui/lobby.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/ui/lobby.js) |
| El minijuego de cruzar la avenida: carriles, tráfico, cámara, coches 3D (código) | [`src/scene/crossing3d.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/scene/crossing3d.js) |
| Qué días forman la campaña (activar/desactivar días) | [`manifest.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/manifest.json) → `levels` |
| El muro que separa las alas y su puerta | [`scenes/piso7.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/scenes/piso7.json) → `barriers` |
| Que el jefe se quede pegado a la jugadora | [`levels/dia-N.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/levels) → `rules.bossTether` |
| Qué pose hace la jugadora en cada actividad | [`scenes/piso7.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/scenes/piso7.json) → `activities[].pose` |
| Meter pliegos de sprites dibujados a mano (los normaliza a la rejilla 4x4) | [`tools/pack-sprites.py`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/tools/pack-sprites.py) |
| Qué hay en cada celda del pliego de un personaje, y su animación de espera | [`data/sprites/<id>.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/sprites) |
| Las plantillas en blanco para dibujar un personaje nuevo | [`art/plantillas/`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/art/plantillas) · las genera [`tools/make-sprite-template.py`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/tools/make-sprite-template.py) |
| Los mensajes de Teams de Gabo | [`dialogues.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/dialogues.json) → `teamsMessages.gabo` |

Cada JSON de `public/data/` trae su propio campo `"$comment"` al principio
explicando su esquema — ábrelo y léelo antes de editarlo a ciegas.

⚠️ **Nunca edites `data/`, `assets/`, `sprites/` ni `index.html` en la raíz
del repo directamente**: son una copia generada del build de
`pixel-office/` (ver «Arquitectura del repo» más abajo). Edita siempre dentro
de `pixel-office/` y luego corre `npm run build:pages`.

¿Vas a usar un agente de IA (Claude Code u otro) para modificar el juego?
Lee primero [`CLAUDE.md`](https://github.com/franciscombp/modo-incognito/blob/main/CLAUDE.md).

## El builder: editar el plano y el día con el ratón

En [`builder/`](https://github.com/franciscombp/modo-incognito/tree/main/builder)
hay un editor 2D del plano (`scenes/*.json`) y del día (`levels/*.json`). No
necesita npm ni build: se sirve el repo y se abre.

```bash
python3 serve.py            # o npm run preview desde pixel-office/
# → http://localhost:8000/builder/
```

Carga los mismos archivos que lee el juego y te deja **arrastrar** zonas,
actividades, lugares seguros, escondites, distracciones, NPC, secretos y
plantas; redimensionar las zonas por sus esquinas; y editar todos sus campos
en el panel de la derecha. La pestaña **Día** monta las reglas de la jornada:
duración, amonestaciones, puntos objetivo, multiplicadores del jefe, su
ronda, la correa, qué actividades son los objetivos (salen marcadas de las
que existan en el plano) y qué secuaces entran y por dónde.

Vigila en vivo la invariante que más se rompe: si dos zonas se solapan las
pinta en rojo y lo dice, porque el motor no lo admite.

El builder **no escribe en el repo a propósito**. Cuando termines, «Copiar
escena JSON» / «Copiar día JSON» (o «Descargar los dos»), pegas en
`pixel-office/public/data/…` y corres `npm run build:pages`. Así nunca te
pisa un archivo por accidente y el diff lo revisas tú.

## Arquitectura del repo

Este repositorio tiene dos partes:

- **`pixel-office/`** — el proyecto fuente real (Vite + Three.js). Aquí es
  donde se edita todo: código en `src/`, contenido en `public/data/`, sprites
  en `public/sprites/`.
- **Raíz del repo** (`assets/`, `data/`, `sprites/`, `index.html`,
  `favicon.png`, `.nojekyll`) — una **copia generada** del build de
  producción, mantenida en sincronía con `npm run sync:root` (que a su vez
  corre `npm run build:pages` y el workflow de GitHub Actions tras cada
  push). Existe para que GitHub Pages funcione tanto si *Settings → Pages*
  está en modo **GitHub Actions** como en **Deploy from a branch →
  main/(root)**.

Por eso cualquier cambio en `pixel-office/src` o `pixel-office/public/data`
necesita `npm run build:pages` antes de hacer commit — si no, la raíz del
repo (lo que sirve Pages en modo "branch") queda desactualizada.

## Desarrollo

```bash
cd pixel-office
npm ci
npm run dev            # servidor local
npm run build          # build de producción a dist/
npm run preview        # sirve dist/ en http://localhost:4173 (lo usan los check:*)
npm run check          # corre TODOS los check:* de abajo, en orden
npm run check:visual   # capturas del juego a shots/
npm run check:menus    # capturas de los menús a shots/
npm run build:pages    # build + copia a la raíz del repo
npm run format:data    # reordena los JSON de data/ para que sigan legibles
```

Los `check:*` son scripts de Playwright que abren el juego de verdad en un
navegador headless y comprueban su estado interno (`window.__game`). **Todos
necesitan que `npm run preview` esté corriendo primero** (o pásales otra URL
como argumento):

```bash
npm run build && npm run preview &   # deja el servidor de preview corriendo
npm run check                        # ahora sí, corre la batería completa
```

| Script | Qué verifica |
| --- | --- |
| `check:reachable` | El navmesh es válido y todo punto del plano es alcanzable |
| `check:chase` | El jefe persigue, pierde y busca correctamente (máquina de estados) |
| `check:modes` | Los modos de personaje elegibles cargan y funcionan |
| `check:charselect` | La pantalla de selección de personaje transiciona bien |
| `check:catch` | Diálogos al ser atrapada (secuaz e interrogatorio del jefe + gracia) |
| `check:minion-proximity` | Un secuaz solo "atrapa" con proximidad física real, no solo con verte |
| `check:suspicion` | La sospecha sube/baja/decae con los valores esperados |
| `check:pursuit` | Que una persecución comprometida no se rinda (ni por perderte de vista ni por atascarse) y que el lugar seguro sea la única salida |
| `check:music` | Que la pista suene de verdad (no solo que cargue) y que el ánimo le abra el filtro y le suba el tempo |
| `check:layout` | Que en 6 tamaños de pantalla (de 1440px a un iPhone SE, y horizontal) ningún panel, botón o marcador se solape con otro, ningún texto se recorte y nada se salga de la pantalla |

`check:layout` es el que conviene correr después de tocar el HUD o el CSS:
estos fallos no se ven leyendo el diff y cuesta pillarlos a ojo en una
captura. Ya ha cazado el botón de pausa debajo de la tarjeta de tarea, el
botón USAR encima de los de utilidades en horizontal, y la flecha que apunta
al jefe metiéndose bajo los controles táctiles.

## Controles

| Acción | Teclado | Móvil |
| --- | --- | --- |
| Mover | WASD / flechas | joystick flotante (mitad izquierda) |
| Interactuar / distraer | E | botón **USAR** |
| Fingir que trabajas | F | botón **FINGIR** |
| Inspeccionar el plano | M | botón 🗺️ |
| Zoom | rueda | pellizco o ＋ / － |
| Orbitar la cámara | clic derecho + arrastrar | dos dedos |
| Hablar con alguien | E | botón **USAR** |
| Pausa | Esc | botón ⏸ |

## Contenido en JSON

Todo el contenido vive en `pixel-office/public/data/` y se carga en tiempo de
ejecución. **Para añadir escenarios, personajes o niveles no hay que tocar el
motor**:

```
public/data/
  manifest.json          qué escenas y niveles existen (+ códigos secretos)
  characters.json        jugador, jefe y NPC: sprite, tamaño, velocidad, visión
  scenes/piso7.json      EL PLANO: perímetro, zonas, pasillos, props, patrulla,
                         actividades, escondites, distracciones, NPC, secretos
  dialogues.json         el reparto y qué dice cada uno al hablarle
  levels/dia-1.json …    reglas del día, prólogo del ascensor, secuaces
                         de turno y diálogos de novela visual
```

Las coordenadas del plano están en **unidades de plano** (≈ un puesto de
trabajo) y el motor las escala. Una zona se declara así y el juego genera sola
la mesa grande con sus sillas, la moqueta de color y el rótulo:

```json
{ "id": "gaps", "name": "Gaps 1 + Gaps 2", "capacity": 9, "wing": "norte",
  "kind": "open-office", "color": "#a9c9f2",
  "x": 38.6, "z": 3.6, "w": 6.6, "d": 4.2, "tableShape": "rect" }
```

`kind` acepta `open-office`, `meeting`, `social`, `auditorium`, `core` y
`elevator`. Un archivo con JSON inválido falla con el nombre del archivo en
pantalla, nunca con una pantalla en negro.

### Muros con puerta (`barriers`)

Un tabique que parte el piso se declara igual de fácil. El del MVP separa el
ala sur (donde pasa el día 1) del ala norte:

```json
{ "id": "muro_alas", "axis": "x", "at": 14.05, "from": -10.4, "to": 12.4,
  "door": { "at": 0.6, "w": 3.4 }, "label": "ALA NORTE" }
```

`axis` es el eje del muro (`"x"` = vertical en el plano), `at` su
coordenada, `from`/`to` el tramo que cubre y `door` un hueco **de verdad**:
se cruza andando y el navmesh lo ve, no es un adorno. Sin `door`, el muro es
macizo. El motor lo dibuja y lo mete en la colisión solo, en
[`src/scene/builder.js`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/src/scene/builder.js).

### Poses de las actividades

Una actividad puede decir qué pose hace la jugadora mientras la ejecuta:

```json
{ "id": "coffee", "label": "Tomar café", "type": "coffee", "pose": "coffee", ... }
```

Las poses salen del pliego `*-acciones.png` del personaje, y **qué pose hay
en cada celda lo decide su rig** (ver abajo). Mientras la haces, el panel
grande de acción deja de enseñar un emoji y dibuja a tu personaje haciéndola,
con sus dos fotogramas alternándose.

### El rig de un personaje

Cada personaje con arte propio tiene un archivo en
[`public/data/sprites/<id>.json`](https://github.com/franciscombp/modo-incognito/blob/main/pixel-office/public/data/sprites) que dice **qué hay
en cada celda de sus dos pliegos**. Antes esto vivía repartido entre
`characters.json` y unas constantes dentro del motor; ahora se edita aquí:

```json
{
  "id": "giuli",
  "walk":    { "sheet": "guili-camina",   "fps": 8,
               "rows": { "south": 0, "west": 1, "east": 2, "north": 3 } },
  "actions": { "sheet": "guili-acciones", "fps": 3,
               "poses": { "work": 0, "sleep": 1, "coffee": 2, "eat": 3,
                          "movie": 4, "phone": 5, "scared": 6, "shrug": 7 } },
  "idle":    { "after": 4.5, "hold": 2.2, "every": 9, "poses": ["phone", "shrug"] }
}
```

`actions.poses` mapea nombre → índice 0..7; la pose `p` ocupa la fila `p>>1` y
**dos columnas seguidas**, que son sus dos fotogramas. Por eso el pliego de
Gabo puede tener `point`, `angry` y `sit` donde el de Giuli tiene `coffee`,
`eat` y `movie`: es el mismo sitio, distinto dibujo.

`idle` es la animación de espera, al estilo del Sonic que se cansa de que no
le pulses nada: si llevas `after` segundos sin moverte, saca el móvil o se
encoge de hombros durante `hold` segundos, y lo repite cada `every`. Quita el
bloque y el personaje simplemente se queda quieto. Una pose de verdad (tomar
café) siempre manda sobre la espera.

Añade el id del rig a `manifest.json` → `sprites` y apúntalo desde el
personaje con `"rig": "<id>"`.

### Dibujar un personaje nuevo

```bash
cd pixel-office
python3 tools/make-sprite-template.py
```

Deja en `art/plantillas/` dos PNG a la resolución exacta del motor (512x704),
con cada celda rotulada —qué dirección, qué pose, qué fotograma— y guías de
suelo, altura de ojos y ancho útil para que todos los personajes salgan a la
misma escala. Se dibuja encima y se borran las guías; con `--sin-guias` salen
los lienzos limpios.

## Personajes

`dialogues.json` define el reparto y sus conversaciones. Cada compañero tiene
varias escenas que se van alternando, con opciones que hacen algo de verdad:

- **Manu de la suerte** — te calma la sospecha o te dice dónde anda el jefe.
- **César** — el malcriadito. Dale la razón y se pone a escribir correos
  (y deja de mirarte); llévale la contraria y grita llamando al jefe.
- **Enriquetta** — chapter del amor. El chisme puntúa; también se ofrece a
  entretener al jefe durante cuarenta minutos.
- **El Parce** — ala norte, sala 4. Siempre anda con una petaca de aguardiente
  ("el amarillo que nos unió") lista para invitar.

Manu, César, Enriquetta y El Parce son **amigos tuyos**. Los secuaces no lo
son, pero también puedes hablarles: según lo que elijas te cubren o te delatan.

A los amigos les hablas tú; **los secuaces te abordan ellos, pero solo cuando
te tocan de verdad** — la suma de los dos radios más un dedo de margen. No
basta con que te vean desde el otro lado del pasillo.

### Sprites dibujados a mano

Los pliegos que dibuja el equipo (`gabo-camina.png`, `guili-acciones.png`…)
llegan en lienzos grandes y **sin rejilla regular** — en `guili-camina.png`
las cuatro filas miden 274, 257, 255 y 275 px, así que cortar por «ancho / 4»
mete la cabeza de una fila en los pies de la anterior. Antes de usarlos hay
que pasarlos por:

```bash
cd pixel-office
python3 tools/pack-sprites.py          # todos
python3 tools/pack-sprites.py guili-camina   # solo uno
```

Detecta las filas y columnas por las franjas transparentes, recorta, escala
todo con una sola escala (para que el personaje no cambie de tamaño entre
fotogramas) y deja el pliego en la rejilla que espera el motor: 4x4 celdas de
128x176. Es idempotente y trabaja sobre `public/sprites/` en el sitio.

El jefe es **Gabo**, alias **Barbie Malibú** (`characters.json` → `boss`,
`dialogues.json` → `cast.jefe`) — su nombre de pila aparece como interlocutor
en los diálogos; "el jefe" sigue usándose como su rol dentro del texto.

Los **secuaces** (`minions` en `characters.json`) no te atrapan: te delatan.
Si te ven haciendo algo prohibido llaman al jefe a ese punto y te suben la
sospecha. Cada uno vigila distinto — **Chispita** corre por todo el piso con
cono corto, **Washo** apenas se mueve pero te ve desde el otro extremo del
ala, y **Crispo** está casi quieta abarcando medio pasillo. Cada día elige
cuáles salen y por qué ronda, en su JSON:

```json
"minions": [{ "id": "chispita", "route": "sur" }, { "id": "washo", "route": "norte" }]
```

## La jornada

Algunos días abren antes con un minijuego aparte: **cruzar la avenida**
(`src/ui/crossing.js`, campo `"crossing": true` en el JSON del día — hoy solo
el día 2). Al estilo Crossy Road: seis carriles de tráfico separados por un
parterre con ciclovía a cada lado, entre la acera y la puerta del edificio.
Si te atropellan no hay reintento silencioso: se lo dices a Gabo, y su
respuesta es la broma recurrente del juego — **"te ascienden a cliente"**,
el eufemismo de toda la oficina para "te despidieron", que se usa en
cualquier otro momento en que te echan (fin de las advertencias, etc.).

Cada día abre en el **vestíbulo de ascensores** — una segunda "escena" propia
(`src/ui/lobby.js`), no el piso: mientras eliges esperar (pierdes minutos de
jornada), subir por las escaleras (llegas entera pero lenta un rato) o
colarte (ganas tiempo, con riesgo de empezar ya con una advertencia), el piso
de verdad no se ve todavía. Se edita en `prologue` dentro del JSON del día.

Al cerrar esa elección, las puertas del ascensor se abren de verdad (una
transición, no un corte) y la cámara hace un breve zoom de presentación a
cada secuaz de turno ese día antes de soltarte a jugar — así Chispita, Washo
o Crispo se presentan como una amenaza propia en vez de aparecer sin más a
mitad de la partida. Después sales al pasillo de ascensores, con el ala sur a
un lado y la norte al otro. El piso es continuo a propósito: el jefe ronda
por todas partes y las persecuciones cruzan la planta entera.

Gabo (el jefe) también te escribe por Teams durante el día — mensajes con
personalidad propia que le llegan sin importar dónde esté él en el mapa,
como cualquier chat de verdad. Se editan en `dialogues.json` →
`teamsMessages.gabo`.

## Saber qué hacer

Tres capas que no compiten entre sí:

- **Sobre el objeto**: al acercarte a una tarea, una distracción o un
  compañero aparece un cartel flotante anclado a él, con la tecla a pulsar y
  una barra que se llena mientras mantienes. Nunca hay que adivinar a cuál de
  las cosas de delante se refiere el texto.
- **Tarjeta de tarea** (abajo a la derecha): dónde estás, cuál es la tarea
  activa, a cuántos metros, y una barra de riesgo que se pone roja según lo
  cerca que ande el jefe **de esa tarea**. Un marcador la sigue: fijado sobre
  ella si está en pantalla, como flecha en el borde si no.
- **Radar** (abajo a la izquierda): plano del piso con tu posición, la del
  jefe —que late cuando te está cazando—, la de sus secuaces, las tareas
  pendientes y los escondites cargados. Con la distancia al jefe en metros,
  así que el zoom nunca te deja a ciegas.

## El halo: de dónde sale y hacia dónde mira

El cono de visión **nace en los ojos**, no en el suelo: el vértice está a la
altura de la mirada y un poco por delante del pecho, y el haz cae hasta el
suelo en la punta. Cuando estaba pegado al suelo, con la cámara oblicua el
cono se dibujaba por encima del propio sprite y parecía salirle de la espalda
o de un costado.

El sprite solo tiene cuatro direcciones y el cono gira de forma continua, así
que nunca coinciden del todo; lo que no puede pasar es que discrepen más de
lo que separa a dos direcciones vecinas. `npm run check:vision` mide las dos
cosas — dónde está el vértice y cuánto se desvía el haz del sprite en
dieciséis direcciones distintas.

El de Washo no es un cono sino un radar: círculo completo con ondas que
salen de él, porque su peligro no depende de hacia dónde mire.

## Persecución: una vez te fichan, no te sueltan

Que un vigilante te meta en su halo **compromete la persecución**: a partir de
ahí va a por ti hasta alcanzarte. Perderle de vista ya no sirve — ni
esconderte, ni doblar la esquina, ni ponerte al otro lado de una mesa. La
**única** salida es llegar a un **lugar seguro** (bebedero, baño, tu propia
mesa): ahí sueltan la presa y vuelven a la ronda.

Los escondites siguen valiendo, pero para lo de antes: que **no te fichen**.
Una vez te tienen, dejan de ser refugio. Esa distinción es la regla más fácil
de romper sin darse cuenta al tocar la IA, así que la cubre entera
`npm run check:pursuit`.

Cada vigilante mira distinto, y el suelo lo dice sin texto:

- **Cono** (jefe, Chispita, Crispo) — un haz con degradado: opaco donde está
  el peligro real, junto a él, y desvanecido en la punta. Gira siguiéndote con
  un barrido suave en vez de saltar de golpe.
- **Radar** (Washo) — no mira, **barre**. Alcance de 360°, así que rodearlo
  por detrás no sirve, y lo anuncia con ondas que salen de él. Dentro de su
  alcance **te pesan las piernas** (te mueves más lento), lo mires como lo
  mires. Es área, no mirada.

La forma se elige por personaje en `characters.json` con
`"visionShape": "cone" | "radar"`.

## Lugares seguros: dónde puedes fingir

**Fingir que trabajas (F) solo funciona en un lugar seguro.** En mitad del
pasillo, en la cafetería o en el baño no engañas a nadie. Hay dos tipos, y
se comportan distinto a propósito:

- **Salas de reuniones** — con entrar basta: se supone que estás reunida. Pero
  cada una tiene un **cupo de segundos al día** que se gasta mientras estás
  dentro y no se recarga, y cada tanto **llega gente a reunirse de verdad** y
  la ocupa. El marcador del suelo se apaga cuando pasa cualquiera de las dos
  cosas.
- **Tu puesto** — nunca se gasta ni se ocupa, pero **solo te cubre mientras
  finges**. Sentarte ahí de brazos cruzados no cuenta.

Un lugar seguro es además lo único que corta una persecución ya comprometida
(ver más abajo). Se declaran en `scenes/*.json` → `safeSpots`, con su `kind`,
su `budget` y su ritmo de ocupación; el bloque `$safeSpots` del propio archivo
documenta el esquema. `npm run check:safespots` comprueba las cinco reglas.

Cuando la sospecha pasa del 90% la pantalla se tiñe de rojo por los bordes: es
el aviso de que el siguiente encontronazo es la amonestación y toca salir
pitando a una sala o a tu puesto.

## Escondites con recarga

Los círculos verdes te ocultan, pero se gastan: unos segundos dentro y el
escondite se quema y tarda en recargarse. Mientras tanto se apaga en el suelo
y en el radar. Quedarse parado en uno no es una estrategia.

## Cámara ajustable

La perspectiva no está fijada: **Ajustes → Cámara** tiene deslizadores para
campo de visión, yaw, pitch, distancia, altura del objetivo y suavizado, con
vista previa en vivo. Orbita con clic derecho (o dos dedos), y cuando te guste
pulsa **Copiar parámetros**: obtienes un bloque `CAMERA_PRESET` listo para
pegar en `src/scene/config.js` y dejarlo como valor por defecto.

## Sonido

Los efectos (menús, diálogo, actividades) son **sintetizados con WebAudio** en
`src/game/sfx.js` — tonos cuadrados/triangulares generados en el momento, sin
un solo archivo de audio que cargar ni que se pueda romper. Para añadir o
tocar un efecto se edita ese archivo; no hace falta ningún asset.

La música de fondo es una **pista compuesta** que suena en bucle:
`public/audio/stapler-sprint.mp3` (16 compases exactos a 136 BPM, en Do menor).
No se limita a sonar de fondo — `src/game/soundtrackTrack.js` le hace
**remezcla vertical ligera**: con el jefe lejos suena filtrada y baja, como
si viniera de otra sala; cuando te caza se abre del todo y acelera un 8%. Así
la música sigue reaccionando a la partida aunque sea una pieza cerrada.

Para cambiar de tema, deja otro mp3 en `public/audio/` y ajusta `TRACK` en
`soundtrackTrack.js` — sobre todo `bpm` y `loopEnd`, que marcan el punto de
bucle; si no cuadran con la pista nueva, el bucle se oye cortado. Los ajustes
por ánimo (volumen, filtro, velocidad) están en `TRACK_MOODS`, en el mismo
archivo.

Si el mp3 falta o no carga, el juego **no se queda mudo**: cae en el
soundtrack procedural con Tone.js de `src/game/soundtrackThemes.js`, que
sintetiza en vivo riffs de bajo + pizzicato + colchón + percusión y los
recombina por ánimo. Los stingers de victoria y derrota son siempre
sintetizados, así que suenan haya pista o no. **Ajustes → Juego** trae
interruptores separados para sonido y música.

## Aspecto

El 3D existe para resolver colisiones, oclusión y navegación; lo que se ve es
2D. La escena se renderiza a un búfer reducido y se reescala con vecino más
cercano, con cuantización de color: el resultado es pixel art con perspectiva.
El grosor del píxel y los niveles de color se ajustan en **Ajustes → Juego**.

Las paredes exteriores son de vidrio: con esta cámara un muro opaco se traga
a quien camina por el borde del piso, y perder de vista al jefe o a la
jugadora ahí era lo más frustrante del build anterior.

## Rendimiento

El piso tiene ~250 sillas y 25 mesas. Construido de forma ingenua eran más de
mil mallas, y eso hacía que las tabletas se arrastraran hasta perder el
contexto WebGL. Ahora el mobiliario repetido va por `InstancedMesh` y la
geometría estática se fusiona por material: la escena queda en unas 40 mallas
y 4 mallas instanciadas.

Encima hay un ajuste de **calidad** (auto/alto/medio/bajo) que controla
sombras, resolución del mapa de sombras y `pixelRatio`. En «auto» arranca en
medio si detecta un dispositivo táctil o con poca memoria, y un vigilante de
fotogramas lo baja solo si no se sostiene la fluidez.

## Arquitectura

```
src/
  scene/
    config.js      WORLD_SCALE y CAMERA_PRESET: los dos únicos mandos globales
    floorplan.js   el plano como datos (zonas, capacidad, color, pasillos…)
    furniture.js   capacidad -> una mesa grande + N sillas (instanciadas)
    builder.js     construye la maqueta y registra los colliders
    camera.js      cámara perspectiva oblicua tipo diorama
    cameraSettings.js  parámetros de cámara en vivo + exportador de preset
    pixelPipeline.js   pase de post-proceso que convierte el 3D en pixel art
    navmesh.js     rejilla de navegación (rutas del jefe + test de alcance)
  data/
    loader.js      carga y valida los JSON de public/data
  ui/
    menus.js       título, elegir día, ajustes, ayuda y pausa
    cameraPanel.js el banco de pruebas de la cámara
    compass.js     tarjeta de tarea activa + marcador de destino
    popups.js      números de puntuación flotantes
  game/
    engine.js      bucle de campaña: menú -> día -> escena -> nivel -> escena
    game.js        reglas de una jornada (sospecha, objetivos, advertencias)
    dialogue.js    novela visual con máquina de escribir y opciones
    hud.js         HUD e indicador de zona actual
    themes.js      ambientación por día
    save.js        progreso en localStorage
    settings.js    opciones de imagen y accesibilidad
```

### Añadir contenido

- **Un día nuevo**: crea `public/data/levels/dia-6.json` y añádelo a `levels`
  en el manifiesto. Sus `rules` controlan duración, advertencias, objetivos,
  velocidad y visión del jefe, y la puntuación objetivo.
- **Un escenario nuevo**: crea `public/data/scenes/<id>.json` y añádelo a
  `scenes`; apunta un nivel a él con `"scene": "<id>"`.
- **Una zona nueva**: añade una fila a `areas` en el JSON de la escena.
- **Un secreto**: añade una entrada a `eggs` (por ubicación, en la escena) o a
  `codeEggs` (por teclado, en el manifiesto).
- **Un personaje o una conversación**: `dialogues.json`. Enlaza el NPC de la
  escena con `"cast": "<id>"`.
- **Un secuaz**: perfil en `characters.json` → `minions`, y súbelo al día que
  quieras con `"minions": [{ "id": "...", "route": "..." }]`.
- **El balance de dificultad del jefe**: `boss-config.json` trae su propio
  `$comment` que separa los campos ya conectados al motor de los reservados
  para una futura mecánica de salida por ascensor (tocar esos últimos hoy no
  cambia nada todavía).

### Los dos puntos de extensión que sí piden código

Casi todo es JSON, pero dos cosas necesitan una línea de JavaScript. Las dos
están aisladas a propósito en su propio archivo, para que añadir no signifique
editar el motor:

- **Un efecto de diálogo nuevo** (`"effect": "..."` en una opción) →
  `src/game/effects.js`. Es un objeto: añade una entrada con `label` (para
  quien escriba contenido) y `run(game)`. El resto del motor no se entera.
  Un nombre que no exista ya no se ignora en silencio: avisa por consola
  diciendo cuáles son válidos, así una errata en `dialogues.json` se ve.

  ```js
  "cafe-doble": {
    label: "Doble de cafeína, doble de nervios",
    run: (game) => { game.applyPerk("caffeine"); game.suspicion += 10; },
  }
  ```

  Lo que un efecto puede tocar es la API pública de `Game`: `toast()`,
  `award()`, `applyPerk()`, `suspicion`, `timeLeft`, `revealBossUntil`…

- **Un minijuego nuevo** (una escena jugable antes de la jornada, como cruzar
  la avenida) → escríbela aparte (mira `src/scene/crossing3d.js`) y regístrala
  en `src/main.js` con una línea:

  ```js
  minigames.register("ascensor", { play, mood: "tense", bodyClass: "lift-open" });
  ```

  A partir de ahí es contenido: el día que lo quiera lo declara en su JSON, y
  **todo el texto de la derrota también es JSON** — el motor no sabe qué dice
  Gabo cuando pierdes:

  ```json
  "minigame": {
    "id": "ascensor",
    "intro":  [ { "speaker": "Steven el Daddy", "narrator": true, "text": "…" } ],
    "onFail": { "icon": "🛗", "title": "Te ascendieron a cliente",
                "body": "…", "dialogue": [ … ] }
  }
  ```

  `play(renderFn)` devuelve una promesa que resuelve `"safe"` o `"hit"`.

## Puntuación

Cada actividad prohibida da puntos. Encadenarlas antes de que expire la ventana
sube el multiplicador hasta ×4, y hacerlas con el jefe cerca —o directamente
dentro de su cono— multiplica todavía más. Terminar antes de tiempo suma el
reloj sobrante. Al cerrar el día recibes un rango de **D** a **S**.
