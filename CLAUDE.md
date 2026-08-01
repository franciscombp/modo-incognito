# CLAUDE.md — guía para agentes de IA

Orientación rápida para Claude Code (u otro agente) trabajando en este repo.
Para el mapa completo de "quiero cambiar X → edito Y" con enlaces a GitHub,
usa la tabla del [README.md](https://github.com/franciscombp/modo-incognito/blob/main/README.md#quiero-cambiar-x--edito-y) —
no la dupliques aquí.

## Estado: MVP del día 1

La campaña publicada es **solo el día 1** y está pulida de punta a punta:
ascensor → tres actividades (café, película, comer) en el **ala sur**, con
Gabo atado a la jugadora. El cruce de la avenida existe y funciona, pero está
DESACTIVADO (ver más abajo) para tener el foco en el piso. Los archivos `dia-2`..`dia-5`
siguen en `public/data/levels/` pero **no están en `manifest.json` →
`levels`**, así que el juego no los ve. Si te piden reactivar un día, es
añadir su id a esa lista y nada más — no hay código que tocar.

Si te piden algo del día 1, revisa que no rompas ninguna de sus tres piezas:
`levels/dia-1.json` (reglas y guion), `scenes/piso7.json` (plano, muro,
actividades) y `src/ui/lobby.js` (el ascensor con el que abre).

## Qué es esto

Juego web isométrico (Vite + Three.js) de sigilo/comedia de oficina. Todo el
contenido (personajes, diálogos, niveles, plano, balance de IA) está en JSON
bajo `public/data/`; el motor en `src/` solo lee
esos datos. Para añadir o cambiar contenido casi nunca hace falta tocar
código — mira primero si hay un JSON para eso.

**Lore, para diálogo nuevo:** la Célula Gris diseña en el Piso 10. Los nombres
son genéricos A PROPÓSITO — nada de identificar al corporativo real ni su
jerga interna, que es lo que quita filo por el lado equivocado. Los nombres de
las personas y los chismes personales sí se quedan. El meta-chiste (código
secreto `incognito`, en `manifest.json` → `codeEggs`, y el cierre de
`levels/dia-5.json`) es que
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

## Estructura del repo

- `src/` — código fuente del juego y tools (motor, UI, scene, etc.)
- `public/data/` — contenido del juego en JSON: personajes, diálogos, niveles, 
  escenas, balance de IA
- `public/` — assets estáticos: sprites, modelos GLB, audio
- `creador/` — herramientas visuales (mapas, personajes, música, pantallas).
  Son **entradas separadas de Vite** (ver `vite.config.js` → `rollupOptions.input`),
  así que se sirven desde el mismo servidor que el juego y salen publicadas con él.
  **Hay UNA sola copia** de cada tool: nunca la duplices a otro sitio.
- `tools/` — scripts de verificación y utilidades (check-*, extract-palette, etc.)

GitHub Pages está configurado en modo "GitHub Actions" (`.github/workflows/deploy-pages.yml`):
cada push a `main` compila todo en CI y publica `dist/` como artefacto. **Nunca** hace
falta correr un build ni commitear nada generado — si tocaste `src/` o `public/data/`,
con el commit y push normales basta; el workflow se encarga del resto.

**Cachés:** Vite hashea el JS y el CSS, pero lo de `public/` se sirve con su nombre
de siempre y el navegador se lo queda en caché. Por eso cada build lleva un sello,
`__BUILD_ID__` (`vite.config.js`, y `BUILD_ID` = id de la ejecución en el workflow),
que se cuelga como `?v=` de esas URLs. Si añades una ruta nueva a algo de `public/`,
cuélgale el sello también o publicarás cambios que nadie verá.

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

### Personajes 3D (ya no son sprites)

El reparto **no son pliegos de dibujo**: son muñecos low-poly que
`src/entities/character3d.js` monta con primitivas de Three.js a partir de una
**receta** en `public/data/characters3d.json` (piel, pelo + estilo, prenda,
pantalón, zapatos, accesorios, complexión). Por eso añadir a alguien al
reparto son ~10 líneas de JSON y **nunca** hace falta tocar código.

**Dos caminos, misma receta.** Si la receta trae `baseModel`, el muñeco NO se
monta con primitivas: se carga ese `.glb` de `public/models/` y se instancia
clonándolo (`_buildFromGLB`). Es lo que usan hoy Giuli y Gabo, esculpidos
fuera. Sin `baseModel`, sigue el camino procedural de siempre
(`_buildProcedural`) — que es el de todo el resto del reparto. Los dos acaban
con el MISMO rig y las MISMAS poses, así que nada de lo que hay por encima
(poses, props, tinte) necesita saber por cuál vino un personaje.

**`baseModel` NO se escribe a mano.** `public/models/` es una carpeta de
subida directa: se deja `<id>.glb` y ese personaje usa ese cuerpo, sin tocar
ningún JSON. Lo hace posible `tools/index-models.mjs`, que lista la carpeta y
escribe `public/data/models.json` — el navegador no puede listar un
directorio, así que alguien tiene que hacerlo antes. Corre solo en `prebuild`
y `predev`, también en CI. `<id>.faces.png` hace lo mismo con las expresiones.
El contrato completo, con lo que debe traer un `.glb`, está en
`public/models/README.md`, que es lo que lee quien vaya a modelar.

**Los gestos de un cuerpo importado van PEGADOS DELANTE** (`faceSheet.js`), al
estilo Animal Crossing: un plano colgado del hueso de la cabeza que enseña una
celda de una tira, y cambiar de expresión es mover el recorte. No se puede
hacer de otra forma — la cara de un `.glb` vive dentro de su textura y
redibujarla le borraría la piel. Sin tira, ese personaje no gesticula y
`setExpression` no le hace nada.

Un `.glb` nuevo tiene que traer el rig con nombres convencionales (`Hips`,
`Spine`, `LeftArm`…): `baseModel.js` los reetiqueta al cargar, y un hueso que
no aparezca deja poses a medias avisando solo por consola.

**Tres trampas de este camino, las tres pagadas ya:**

- **`mergeRecipe` es un FILTRO, no una fusión.** Devuelve un objeto nuevo con
  una lista fija de campos, así que un campo que no esté nombrado ahí se
  pierde en silencio. `baseModel` faltaba, y el resultado fue que todo el
  camino del `.glb` se escribió, se publicó y no llegó a ejecutarse nunca:
  todo el mundo salía por el camino procedural, que se ve igual de bien y por
  eso no cantó.
- **Las poses se aplican como giro RELATIVO al reposo** (`setBoneRotation` +
  `restQuat`). Un rig importado ya viene girado — es lo que lo mantiene de pie
  y mirando al frente — y escribir el ángulo encima lo dejaba tumbado y en
  cruz. En el esqueleto propio los huesos nacen sin rotar, así que ahí da
  igual y el comportamiento no cambia.
- **Los retratos de los menús se sacan en UNA vuelta** (`charshot.js`), y un
  `.glb` no está listo en la primera. Por eso hay `preloadBaseModels()` al
  arrancar y un montaje síncrono si ya está en memoria; y por eso
  `characterShot` devuelve null en vez de fotografiar el vacío, que además
  se cacheaba y dejaba la tarjeta en blanco para siempre.

Un cuerpo importado **no gesticula**: su cara viene dentro de su textura, no
en una aparte que se pueda redibujar, así que `setExpression` no le hace nada.

**La caminata la pone el ARCHIVO, si la trae.** Nuestro paso procedural está
calibrado para el muñeco chibi y apenas dobla la rodilla (28° contra los 52°
de un ciclo de andar de verdad): en un cuerpo humano se lee como marcha
militar. Por eso, si el `.glb` trae un clip de andar, se reproduce con un
`AnimationMixer` y manda él mientras el personaje camina. El clip y
`_applyPose` escriben LOS MISMOS huesos, así que nunca corren a la vez —
en cuanto hay una pose del juego (café, dormir, susto), que ningún `.glb`
trae, el clip se aparta. Los nombres de clip los busca `pickClip()` por trozo,
porque cada exportador los llama de una manera (`Walking`,
`Armature|walking_man|baselayer`, `mixamo.com`…).

Lo vigila `npm run check:basemodel`, y a propósito NO mira una captura: mira
que el `.glb` se pida por red y que la malla en escena sea la del archivo.
Una captura fue justo lo que no delató el fallo la primera vez.

- **Para editarlos**: `builder/personajes.html` — vista previa 3D en vivo,
  selectores por pieza y visor de poses. Importa el módulo REAL del juego con
  un import map, así que no puede desincronizarse del motor. No escribe en el
  repo, igual que el builder del plano.
- **Colores**: salieron de los pliegos que dibujó el equipo, con
  `npm run palette` (`tools/extract-palette.py`, que lee `public/sprites/` y
  saca el color dominante de pelo, piel, prenda, pantalón y zapatos). Si
  alguien redibuja un pliego, se vuelve a correr y se comparan.
- **Para mirarlos**: `npm run check:cast` saca un retrato de grupo del reparto
  entero, y `node tools/shoot-cast.mjs salida.png poses:giuli` saca a uno en
  sus ocho poses. El diff de una receta no dice nada; la imagen sí.
- **Las poses son procedurales y comunes** (`POSE_LIBRARY` en character3d.js):
  todos los personajes pueden hacerlas todas, ya no dependen de que su pliego
  las tenga dibujadas. `data/sprites/<id>.json` sigue existiendo, pero ahora
  solo aporta la **animación de espera** (`idle`).
- La cámara está a **44° de inclinación** (`CAMERA_PRESET`). Con la de antes
  (52°) solo se les veía la coronilla. Si subes el pitch, se pierde la cara —
  que es donde está toda la expresión.

### El esqueleto (`src/entities/skinning.js`)

Los personajes son un **`THREE.SkinnedMesh` con un `THREE.Skeleton` de
verdad**: una sola malla cuyos vértices están pesados a los huesos y se
DEFORMA al moverlos. Antes eran piezas rígidas colgadas unas de otras, y al
doblar un codo se abría un boquete en el pliegue.

- **`SKELETON` es la única fuente de verdad de dónde está cada articulación.**
  La geometría del cuerpo se construye ENTRE esas posiciones (`at("LeftArm")`
  en character3d.js), así que el hueso nunca puede quedarse fuera de la carne
  que lo envuelve. Si mueves una articulación, el cuerpo la sigue solo.
- Los huesos llevan nombres de rig convencional (`Hips`, `Spine`, `LeftArm`…)
  a propósito, y el esqueleto está expuesto en `character.skeleton`: es lo que
  hace falta para engancharle un `AnimationMixer` con clips y mezclarlos.
- **Los pesos se reparten por CANDIDATOS, no por distancia a secas**
  (`skinGeometry(geo, bones, [huesos])`). Con distancia pura, un vértice del
  muslo izquierdo recibe peso del derecho — están a un palmo — y al caminar
  las piernas se pegan. Cada pieza declara a qué huesos puede pertenecer y la
  mezcla suave pasa solo en la articulación.
- Lo que NO debe deformarse (zapatos, credencial, pelo, gafas) va con
  `rigidGeometry()`, pegado a un solo hueso.
- Los miembros se hacen con `limb()`, que mete **segmentos a lo largo del
  eje**: sin vértices intermedios no hay nada que deformar y el codo vuelve a
  doblarse como una pieza rígida.
- Todo acaba en **una sola malla con color por vértice**. Con ~25 personajes
  en el piso, un material por prenda eran seis llamadas de dibujo por cabeza.
  Por eso `setTint()` funciona tocando el color del material: multiplica a
  todos los vértices a la vez.
- El `SkinnedMesh` lleva `frustumCulled = false`: su caja es la de reposo, y
  sin eso un personaje con los brazos en alto desaparece en cuanto esa caja
  sale del encuadre.

Los pliegos de `public/sprites/` **siguen en uso** para los retratos del
diálogo y la pantalla de selección de personaje, y son la referencia de la que
salió el color de cada receta. `tools/pack-sprites.py` los normaliza a la
rejilla 4x4 de 128x176 (no vienen regulares: cortarlos por «ancho / 4» mete la
cabeza de una fila en los pies de la anterior). Su sitio es siempre
`public/sprites/`.

### La estética cozy

El decorado va en tonos cálidos, apagados y **sin textura**; todo el color
saturado se reserva para los personajes. La paleta entera está en
`src/scene/cozy.js` y es el único sitio donde tocarla:

- `texturedMaterial()` (en `textures.js`) ya no devuelve las tramas de píxeles
  que había: delega en `cozyMaterial()` y devuelve color plano. Es el
  embudo por el que pasan builder.js y furniture.js, así que cambiar una
  superficie ahí la cambia en todo el piso. Las recetas de textura se quedan
  por si vuelve a hacer falta una superficie con trama.
- El fondo es un degradado de cielo con niebla del mismo color
  (`skyTexture()` + `scene.fog`, por tema en `game/themes.js`). Con el negro
  de antes el piso flotaba en el vacío y ninguna cantidad de luz cálida
  arreglaba eso.
- `pixelPipeline.js` corre **siempre**, también con `pixelSize` 1: además de
  pixelar es quien pone la viñeta y la calidez de los bordes.
- Si pasas un `color` explícito a `texturedMaterial()`, pisa la paleta. Es lo
  que dejaba los pasillos y los núcleos en gris frío después del cambio.

### La interfaz también es cozy

`src/style.css` **no** es pixel art cyberpunk: papel crema, tinta marrón y
acento terracota. Los NOMBRES de las variables se conservan (`--cyan`,
`--magenta`) aunque ya no describan su color, porque se usan desde ochenta
sitios. Al escribir CSS nuevo:

- El texto va en `var(--ink)` (o `--ink-soft` para lo secundario) y los
  paneles en `--panel`/`--glass`. `var(--paper)` es CREMA: ponerlo como color
  de texto sobre un panel lo deja invisible, que es exactamente lo que pasó
  con medio HUD y con los menús al cambiar la paleta.
- Para transparencias hay `rgba(var(--ink-rgb), a)` y
  `rgba(var(--cyan-rgb), a)`. No metas `rgba(255,255,255,0.06)` (sobre crema
  no se ve) ni `rgba(0,0,0,…)` (un filo negro duro rompe el conjunto).
- Nada de halos de neón. Una sombra baja y cálida basta.

Dos piezas montan el 3D DENTRO de la interfaz, y son la razón de que los
menús y el diálogo ya no parezcan de otro juego:

- `src/ui/portrait3d.js` — el retrato del diálogo es el mismo `Character3D`
  del piso, encuadrado de busto, con la expresión atada al `mood` de la línea
  y la boca abierta mientras corre la máquina de escribir. Solo dibuja con el
  diálogo abierto. El pliego de píxeles se queda de reserva por si no hay
  WebGL.
- `src/ui/charshot.js` — la pantalla de selección es estática, así que cada
  personaje sale como una FOTO (`toDataURL`) de un único renderer, no como un
  lienzo vivo por tarjeta.

**La interfaz es un dashboard de mentira.** Menús y HUD imitan una plataforma
corporativa moderna (tarjetas blancas sobre vidrio, acento verde "sistema
operativo", chips de estado, números tabulares) — el lore lo pide: Modo
Incógnito es la coartada del equipo y tiene que parecer la herramienta en la
que fingen trabajar. Todo ese skin vive en UNA capa de overrides al final de
`src/style.css` («SKIN "PLATAFORMA"»), que re-tematiza los tokens de `:root`
(`--cyan` ya no es cian: es el verde de acento; `--violet` es el primario) y
pisa los componentes por cascada. Los bloques históricos de arriba NO se
editan — documentan de dónde viene cada decisión; si algo se ve del skin
viejo, su override falta en esa capa. La barra de aplicación del menú
(`px-plat-bar`, en `menus.js`) es decorativa a propósito: pointer-events
none, nunca roba clics.

Si tocas el HUD o el CSS, corre `npm run check:layout` antes de darlo por
bueno: comprueba en seis tamaños de pantalla que nada se solape, se recorte
ni se salga. Este tipo de fallo no se ve en el diff y es fácil que se cuele
en una captura.

## Invariantes que no debes romper

- **No hay puntos: la única moneda es el RELOJ.** Todo lo que antes puntuaba
  ahora alarga la jornada, y todo el reloj que se regala pasa por
  `Game._grantTime()` — que es quien mantiene `timeGained` (lo que enseña el
  HUD) en sincronía con `timeLeft`. Si sumas a `timeLeft` por tu cuenta, el
  HUD se queda corto y nadie se entera. Ojo con los dos campos de una
  actividad, que se confunden solos: **`time` es lo que TARDA** en hacerse y
  **`reward` es el reloj que DA**.
- **`scenes/piso7.json` → `areas`**: los rectángulos de zona no deben
  solaparse. Si añades o mueves una zona, revisa `x/z/w/d` contra las
  vecinas antes de dar por bueno el cambio.
- **`scenes/piso7.json` → `safeSpots`**: son los ÚNICOS sitios donde se puede
  fingir que trabajas. `kind: "meeting"` cubre con entrar pero se gasta
  (`budget`) y se ocupa sola (`busyEvery`/`busyFor`); `kind: "desk"` no se
  gasta pero solo cubre mientras finges. Si tocas `_updateSafeSpot` o el
  orden en que `update()` resuelve fingir/lugar seguro, corre
  `npm run check:safespots`: las dos cosas se pisan (fingir exige estar en un
  sitio seguro, y tu puesto exige fingir) y es fácil dejar un ciclo tonto.
  Dos lugares seguros **no pueden solaparse**, ni repetir `id`: si se pisan,
  uno se ocupa o se gasta y el otro te sigue cubriendo desde el mismo metro
  cuadrado, así que la mecánica de "se gasta" deja de existir sin que nada
  falle a la vista. Hubo un duplicado encima de la Sala 1 justo así.
- **`scenes/piso7.json` → `areas[].doorSide`**: qué pared lleva la puerta
  (`frente` = +z, por defecto; `fondo` = -z; `norte` = +x; `sur` = -x). En una
  sala de vidrio es un hueco de VERDAD: puesta contra la fachada o contra el
  bloque del vecino, la sala queda inentrable y el plano se ve idéntico. Es el
  fallo más fácil de cometer y el más difícil de ver. `npm run check:doors`
  comprueba que a cada sala se puede entrar y, si no, **dice qué lado sí
  funciona** (recarga el juego probando los otros tres). También avisa cuando
  la mesa se come la sala entera y no cabe nadie, que ninguna puerta arregla.
  El builder pinta el hueco sobre la pared, así que ahí se ve de un vistazo.
- **`scenes/piso7.json` → `barriers`**: el muro que separa las alas. Su
  `door` es un hueco de verdad, y el navmesh cuenta con él: si lo cierras,
  medio piso deja de ser alcanzable y `npm run check:reachable` lo canta.
- **Las comprobaciones de `tools/` arrancan el día 1 con
  `startDay(0, { skipMinigame: true })`**. No quites esa costura: sin ella
  se quedan esperando a que alguien juegue el cruce de la avenida.
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
- **El halo nace en los ojos**, no en el suelo: el vértice del cono va a la
  altura de la mirada y por delante del pecho (ver `EYE_HEIGHT`/`EYE_FORWARD`
  en `boss.js`). Bajarlo al suelo hace que, con la cámara oblicua, se dibuje
  encima del sprite y parezca salirle de la espalda. `npm run check:vision`
  vigila eso y que el haz no se desvíe del sprite más de media dirección.
- **Una línea de diálogo con `narrator: true` no usa la caja**: se dibuja en
  su propia tarjeta (`.vn-narrator`) y la caja se aparta con `vn-narrating`.
  Estuvo con `bottom: -140px`, o sea entera fuera de pantalla, y como la
  PRIMERA línea del día 1 es del narrador, el juego abría con un panel en
  blanco esperando un clic que nadie sabía que había que dar. Si tocas ese
  bloque, comprueba que la línea de Steven se lee al arrancar el día 1.
- **La flecha de un rastreador esquiva lo que ya ocupa el borde**
  (`src/ui/tracker.js`): la barra de arriba, la columna táctil, las tarjetas
  de abajo, la franja de controles y la OTRA flecha. Cada bloqueo se mide del
  DOM en cada frame porque todos cambian de tamaño con la pantalla; reservar
  una banda fija solo acierta en un tamaño. `npm run check:layout` es lo que
  lo vigila.
- **NINGÚN icono es un emoji.** Un emoji lo dibuja la fuente del sistema: el
  mismo ☕ es una taza blanca en un iPhone, marrón en Android, plana en
  Windows, y en algunas plataformas sale un cuadro vacío. Desde el juego eso
  no se controla, así que TODO icono sale de `src/ui/icons.js` — SVG de trazo
  de 24×24 con `currentColor`, que hereda el color de donde caiga. Los rótulos
  del piso son textura de canvas y no admiten un `<svg>`, así que usan
  `iconImage()`, la misma fuente pasada por imagen. Los datos piden iconos
  POR NOMBRE (`"icon": "coffee"`), nunca por carácter.
  Ojo con una trampa que ya costó un rato: un SVG inline puede omitir `xmlns`,
  pero servido como imagen suelta sin él **no carga y no avisa** — se queda el
  hueco y ya. Lo vigila `npm run check:no-emoji`, que además comprueba que los
  iconos que pide el contenido existan de verdad.
  Lo que SÍ se permite: emojis dentro del texto que escribe un personaje (que
  Gabo ponga 💅 en un Teams es el chiste, y ahí da igual cómo lo pinte cada
  sistema). Lo que no puede llevarlos es la interfaz.
- **Nadie se representa con un emoji ni con un pliego.** Quien habla en un
  diálogo y quien sale en la pantalla de selección son SIEMPRE su muñeco 3D
  (importado o procedural). `looks.get()` nunca devuelve vacío: el que no
  tiene receta propia usa la genérica. Los pliegos de `public/sprites/` ya no
  pintan personajes — se quedan como referencia de color de las recetas. Los
  emojis que quedan son iconos de interfaz y de objeto (botones, actividades),
  que es otra cosa.
- **El día 1 arranca en el ascensor.** El cruce de la avenida está desactivado
  a propósito: en `levels/dia-1.json` su bloque se llama `$minigame`, y
  recuperarlo es devolverle el nombre `minigame`. El piso se monta CON LAS
  PUERTAS CERRADAS (`prepareFloor`, llamado antes de `lobby.hide()`): al
  revés, la animación de apertura enseñaba durante segundo y medio el piso
  como quedó del intento anterior. Y `applyPrologue` va después de montarlo
  porque empieza con `if (!game) return` — llamándolo antes, la elección del
  ascensor no hacía nada en absoluto.
- **Un secuaz te aborda solo cuando te TOCA** (`minionTouches` en `game.js`),
  no cuando te ve. Es un radio de contacto, no de interacción; subirlo
  reintroduce el "Crispo me habla desde el otro lado del pasillo".
- Audio: los efectos (`src/game/sfx.js`) son sintetizados con WebAudio, sin
  archivos. La música también es 100% procedural (`src/game/soundtrack.js` +
  `soundtrackThemes.js`, con Tone.js) — no hay ningún mp3 grabado. Hubo uno
  (`stapler-sprint.mp3` + `soundtrackTrack.js`) que se remezclaba por ánimo
  *además* de los riffs procedurales, y sonaba encima de ellos; se quitó del
  todo, no lo reintroduzcas. Cada capa (bajo/lead/pad/perc) corre en un único
  `Tone.Loop` que vive desde que arranca el audio y nunca se destruye —
  cambiar de ánimo solo cambia qué nota lee cada capa en el paso actual, no
  reconstruye el loop. Si vuelves a construir Sequences/Loops por tema y los
  destruyes al cambiar de ánimo, Tone tira "Start time must be strictly
  greater than previous start time" en cuanto el cambio de ánimo coincide con
  una rampa de tempo, y eso se oye como notas rotas — exactamente el bug que
  arregló este diseño. Corre `npm run check:music` tras tocar esto: comprueba
  que suena de verdad, que el ánimo sube tempo/mezcla, y que no hay errores de
  consola.
- Los personajes jugables usan su sprite real (campo `sheet` en
  `characters.json`/`modes.json`, mismo pliego 4x4 que el retrato de
  diálogo), no un emoji — no reintroduzcas emojis genéricos en la selección
  de personaje.
- **`startDay(index, { skipMinigame: true })` también salta el prólogo** del
  ascensor (`skipPrologue` lo sigue por defecto). Las dos escenas esperan un
  clic, y cuando se añadió el prólogo dejó colgadas a diez comprobaciones de
  `tools/` en el `waitForFunction` del `engine.game`, sin que el fallo dijera
  por qué. Si separas otra vez esas dos banderas, comprueba que la suite
  entera sigue entrando al piso.

## Los builders (`creador/`)

Herramientas visuales para editar el juego sin tocar código. Son **entradas
separadas de Vite** (ver `vite.config.js` → `rollupOptions.input`), así que se
sirven desde el mismo servidor que el juego en `http://localhost:5173/creador/` 
(`npm run dev`) y salen publicadas con él.

- `creador/mapas/` — editor 2D del plano y del día. Lee los mismos JSON que el 
  juego y devuelve JSON para pegar — **no escribe en el repo a propósito**. Si
  añades un tipo de objeto nuevo a las escenas, añádele su entrada al registro
  `KINDS` de `mapas.js` (cómo se dibuja, qué campos tiene, qué sale al crearlo).
- `creador/personajes/` — visor 3D de personajes en vivo, selectores por pieza,
  poses y visor de texturas.
- `creador/musica/` — constructor de la pista principal con control de ánimo,
  tempo, mezcla y playhead en vivo.
- `creador/pantallas/` — Storybook y constructor de UI/CSS vivo.

**Son entrada de Vite, no de `public/`.** Estuvieron en `public/` y no funcionaban:
se copian sin resolver imports, así que hubo que traerse librerías de CDN (viejas,
incompatibles) y colgar bundles con hashes escritos a mano. Como entradas de Vite,
importan el código REAL del motor (`character3d.js`, `main.js`), así que nunca se
desincronzan de lo que sale al jugar.

## Cómo probar cambios

Los tests (`tools/check-*.mjs`) son scripts de Playwright que
abren el juego real en un navegador headless y leen su estado interno vía
`window.__game`. **Necesitan el build servido en `http://localhost:4173/`
antes de correr** — no funcionan contra el servidor de `npm run dev`.

```bash
npm run build && npm run preview &   # deja el preview corriendo en :4173
npm run check                        # corre todos los check:* en orden
```

Si añades un tool nuevo en `tools/`, añádele también su script `check:*` en
`package.json` y súmalo a la cadena del script `check` agregado — si no,
queda invisible y nadie lo vuelve a correr.

## Flujo de git

Una sola rama: `main`. No hay ramas de feature ni PRs internos — se hace
commit y push directo a `main`. No hace falta build local ni sincronizar
nada antes de pushear: el workflow de GitHub Actions compila y publica solo.
