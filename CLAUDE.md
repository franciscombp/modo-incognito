# CLAUDE.md — guía para agentes de IA

Orientación rápida para Claude Code (u otro agente) trabajando en este repo.
Para el mapa completo de "quiero cambiar X → edito Y" con enlaces a GitHub,
usa la tabla del [README.md](https://github.com/franciscombp/modo-incognito/blob/main/README.md#quiero-cambiar-x--edito-y) —
no la dupliques aquí.

**Para verlo funcionando** (publicado desde `main`, se actualiza solo):
[el juego](https://franciscombp.github.io/modo-incognito/) ·
[builder de mapas](https://franciscombp.github.io/modo-incognito/creador/mapas/) ·
[de personajes](https://franciscombp.github.io/modo-incognito/creador/personajes/) ·
[de música](https://franciscombp.github.io/modo-incognito/creador/musica/) ·
[de pantallas](https://franciscombp.github.io/modo-incognito/creador/pantallas/).
La lista completa de enlaces directos —builders, documentos de diseño y los
JSON que más se tocan— está en
[README.md → «Enlaces directos»](https://github.com/franciscombp/modo-incognito/blob/main/README.md#enlaces-directos).

> **El diseño del juego vive en `docs/`, no aquí.** Este archivo es el mapa
> del REPO; aquellos, los del JUEGO:
> - [`docs/MOTOR.md`](docs/MOTOR.md) — reglas y balance del bucle: sospecha,
>   persecución, lugares seguros. El porqué de cada número.
> - [`docs/CAMPANA.md`](docs/CAMPANA.md) — la campaña: misiones encadenadas,
>   Qués y Cómos, temporadas, rangos, jubilación. **Temporada 1 jugable;
>   2–5 sin escribir.**
> - [`docs/HUD.md`](docs/HUD.md) — la interfaz de partida. **Construida,
>   menos la pausa por pestañas.**
> - [`docs/PANTALLAS.md`](docs/PANTALLAS.md) — el LIENZO FIJO (1920×1080
>   apaisado, escalado como un juego de motor) y las pantallas de menú.
>   **El lienzo y RRHH construidos; el expediente de personal y la evaluación,
>   en diseño.**
>
> Cada uno abre con una tabla de qué está construido y qué no. Esa tabla es la
> verdad; si implementas algo de ahí, actualízala en el mismo commit.

## Estado: temporada 1, día 1

La campaña publicada es **la temporada 1 sobre el día 1**: ascensor →
presentarte con Gabo → y de ahí se abre la cadena de misiones (fingir, café,
el chisme de Fran, la película, la comida) en el **ala sur**, con Gabo atado a
la jugadora. El cruce de la avenida existe y funciona, pero está DESACTIVADO
(ver más abajo) para tener el foco en el piso. Los archivos `dia-2`..`dia-5`
siguen en `public/data/levels/` pero **no están en `manifest.json` →
`levels`**, así que el juego no los ve. Si te piden reactivar un día, es
añadir su id a esa lista y nada más — no hay código que tocar.

Si te piden algo del día 1, revisa que no rompas ninguna de sus **cuatro**
piezas: `campaign/temporada-1.json` (qué se te pide y en qué orden),
`levels/dia-1.json` (reloj, guion y correa), `scenes/piso7.json` (plano, muro,
estaciones) y `src/ui/lobby.js` (el ascensor con el que abre).

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

**LA LIBRETA (`public/data/libreta.json`) orbita ese chiste sin tocarlo.**
Es el diario de chismes estilo Sasquatch: charlas, encargos del arco y
secretos del piso escriben páginas (enganches en `engine.js` →
`anotarPista`, guardado por ranura en `save.libreta`), y EL PROYECTO — el
secreto final — se arma con 9 piezas que deletrean el código `incognito`.
La regla: la libreta INSINÚA y deletrea, pero NUNCA cuenta qué es el
proyecto; la revelación sigue viviendo solo en el egg y en el día 5. Si
escribes pistas nuevas, `npm run check:libreta` vigila que toda fuente
exista (una ref con typo compila y esa página no se escribe jamás) y que
las piezas sigan deletreando exactamente las teclas del egg.

**EL CORAZÓN DEL JUEGO, y lo primero que no se puede romper:** evitar
trabajar mientras el jefe y sus secuaces te molestan. Todo lo demás —la
interfaz, la luz, los modelos— está al servicio de eso. Antes de dar por
buena cualquier mejora visual, comprueba que el bucle sigue divirtiendo:
que Gabo te vea y venga a por ti, que Crispo te aborde, que fingir y
esconderse valgan la pena, que el reloj apriete. Si una refactorización
deja eso peor, la refactorización está mal aunque se vea mejor.

**Diálogo, dos reglas nuevas:** Steven el Daddy es AMIGO de la jugadora
(no primo — ese texto ya se corrigió; no lo reintroduzcas). Y los diálogos
NO se agotan: cuando un personaje se queda sin escenas escritas, se
despide en personaje en vez de repetir la primera palabra por palabra
("me encanta el chisme, pero Gabo me encargó una cosa"). Ese pozo de
salidas es dato: `encounters.<id>.exhausted` en `dialogues.json` gana, si
no `dialogues.exhausted`, y si tampoco hay, un trío por defecto en
`engine.js`. Un interrogatorio (te atraparon) SÍ rota para siempre: es
castigo, no charla, y quedarse mudo sería peor.

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
- `src/game/activityGame.js` — el PULSO, minijuego de tarea de TIMING. Un
  marcador barre una tira y tocas espacio en la zona buena. Un solo mecanismo
  parametrizado desde `activities[].pulso`; no hay un módulo por actividad.
- `src/game/gestures.js` — el GESTO, el otro verbo: hay un valor que se te
  escapa solo (el volumen de la peli sube, el café se enfría) y lo sostienes
  en su zona. Se parametriza desde `activities[].gesto` y sale de cuatro
  números —valor, zona, deriva, control—, así que «bájale el volumen», «sirve
  sin que se enfríe» y «habla bajito» son el MISMO mecanismo con distintos
  ajustes. **Una actividad juega a uno de los dos, nunca a los dos**: si
  declara `gesto`, juega al gesto; si no, al pulso. Pedir ritmo y pulso firme
  a la vez con el jefe rondando no es difícil, es ruido.

**EL BUCLE v2 DE UNA ACTIVIDAD: conseguir → activar → aguantar.** El contrato
cambió (decisión de diseño explícita, agosto 2026) y las tres fases se
reparten la exposición:

1. **CONSEGUIR** (`activities[].objeto` en el JSON de escena): la peli pide
   robar el HDMI de una sala (solo si está vacía — una distracción la vacía:
   la gente sale a mirar), el café se le compra al Parce hablándole. El
   inventario es del DÍA (`game.inventario`). Sin el objeto, la estación
   avisa qué falta y el minijuego ni arranca.
2. **ACTIVAR = el minijuego, CON EL PISO VIVO.** Esto congelaba el mundo
   (`worldFrozen`) y fue el fallo que rompía la captura: mantener espacio en
   CUALQUIER estación dejaba a Gabo de estatua a un palmo, en rojo, sin
   llegar a tocarte nunca — y vaciaba el propio minijuego, porque sin nadie
   acercándose no hay nada que apretar. Es literalmente lo que
   `activityGame.js` lleva avisado desde antes del bucle v2: «un minijuego
   que congela al jefe convierte las estaciones en el sitio MÁS SEGURO del
   piso». Lo era. **No lo vuelvas a congelar.** El freno es la cuenta atrás
   (`limite`): agotarla pierde lo hecho y convoca al jefe.
   Y **mantener espacio YA NO TERMINA la tarea**: avanza a paso de tortuga
   (`RITMO_MANTENIENDO`, 0.3) y lo que la enciende son los TOQUES al ritmo.
   El suelo viejo —«mantener la termina igual, lento»— se había comido el
   juego: se podía jugar el día entero sin tocar un minijuego. El suelo ahora
   es otro: fallar toques resta, pero nunca te expulsa de la tarea.
3. **AGUANTAR**: encendida, el mundo VIVE otra vez y cada segundo que la
   sostienes a la vista paga más (`AGUANTE_RATE`/`AGUANTE_MAX` en game.js).
   Soltar, irte o llegar al techo la BANCA: ahí cae la misión.

Lo vigilan `npm run check:pulse`, `npm run check:gesto` y
`npm run check:objetos` — la primera comprobación es el congelado (jefe
quieto, `limite` corriendo, reloj parado) y la última, que el aguante se
paga al bancar.

**Mientras dura un gesto no se camina** (`player.inputLocked`). No es una
restricción caprichosa: es lo que deja libre el eje del mando para el gesto, y
por eso no hay una tecla nueva que aprender ni nada que inventar en táctil —
los mandos siguen saliendo de un solo sitio. Se sale soltando la tecla de
acción, así que nunca te deja atrapada.

**La CUENTA ATRÁS de una tarea** (`activities[].limite`) arranca cuando te
pones y **ya no para**: dejarla a medias para huir del jefe no la congela, y
eso es lo que convierte empezar algo prohibido en una decisión. Si se agota,
pierdes lo hecho y el jefe **viene** — pero no te amonesta a distancia, que
seguiría siendo física. Dos cosas que se rompen solas si se tocan:
- **`limite` SIEMPRE mayor que `time`.** Al revés, mantener espacio dejaría de
  poder terminar la tarea y el suelo se caería sin que nada fallara a la vista.
- **El pico de sospecha tiene que dejarte POR ENCIMA de
  `chaseSuspicionFloor`**, y hay que copiarlo a `boss.suspicion` a mano antes
  de `startChase()` — game.js lo sincroniza más abajo en el frame, así que sin
  eso `_mayChase()` lee el valor del cuadro anterior, se queda corto y la
  cuenta atrás se agota sin que venga nadie.

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
diálogo y la pantalla de selección de personaje (que se rehace entera, ver
`docs/PANTALLAS.md` §2), y son la referencia de la que
salió el color de cada receta. `tools/pack-sprites.py` los normaliza a la
rejilla 4x4 de 128x176 (no vienen regulares: cortarlos por «ancho / 4» mete la
cabeza de una fila en los pies de la anterior). Su sitio es siempre
`public/sprites/`.

### La estética del escenario

⚠️ **Las cuatro `ref-*.png` de `docs/referencias/` son HISTÓRICAS**: fijaron la
etapa sepia/oliva y el decorado ya no es eso — se pasó a la familia marina
para unificarlo con la interfaz (ver «El TEMA» más abajo). De ellas sigue
valiendo **la LUZ**: charcos cálidos, sombras hondas, viñeta, y la saturación
reservada a acentos pequeños. El COLOR sale de los tokens `--w-*`.

Lo que viene ahora en interfaz está en `docs/PANTALLAS.md` y `docs/HUD.md`.

<details><summary>Texto anterior (etapa sepia/oliva)</summary>

**La dirección de arte de entonces estaba en `docs/referencias/`** (cuatro capturas
+ README): dioramas sobre vacío apagado, sepias/olivas/azul acero, la luz
clave mandando con sombras hondas y viñeta. Menos infantil, más *Where Cards
Fall*. Antes de dar por buena una mejora visual, compárala con esas imágenes.

</details>

### Cómo se pinta el decorado

El decorado va **sin textura**; todo el color
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

### El TEMA: tres capas y una sola verdad

Cambiar la estética entera —interfaz **y edificio**— es editar UN bloque de
`src/style/design-system.css`. Toda la estructura existe para poder cumplir eso.

- **Capa 1 · primitivas** (`[data-theme="x"]`): los valores crudos, y el ÚNICO
  sitio del proyecto donde se escribe un color. Un tema = un bloque.
- **Capa 2 · semánticas** (`:root`): roles, sin un solo valor crudo.
  `--surface`, `--text`, `--accent`, `--border`… No cambia entre temas: es el
  contrato.
- **Capa 3 · componentes**: consumen SOLO nombres de la capa 2.

Hay dos temas de verdad: `terminal` (por defecto) y `cozy`. El segundo no es
arqueología — es la PRUEBA de que la arquitectura funciona. Si al cambiar a él
algo se queda marino, ese componente lee un valor crudo.

**Añadir un tema son dos pasos:** su bloque en la capa 1, y su id en `THEMES`
(`src/game/theme.js`). Ni un componente se toca.

**El EDIFICIO sale de los mismos tokens.** Los `--w-*` de la capa 1 los lee
`src/scene/palette.js` del documento al arrancar y se los pasa a `cozy.js`, así
que un tema re-tinta el decorado sin tocar `builder.js` ni `furniture.js`. Se
leen del CSS y no se guardan en JS para que no haya DOS sitios donde vive un
color, que es de donde vino todo esto.

Ojo con el otro eje: `src/game/themes.js` es el TIEMPO (qué hora es), no el
tema (de qué color es el edificio). Por eso no sale de los tokens.

Lo vigila `npm run check:theme`, que a propósito NO mira una captura: comprueba
que al cambiar `data-theme` se mueven los tokens de interfaz Y de edificio, que
volver atrás restaura exacto, y que ningún panel se quedó con un fondo fijo. Un
componente anclado se ve idéntico en una captura pequeña.

**La regla que no se rompe: ningún componente escribe un color.** Ni `white`,
ni `rgba(255,255,255,…)`, ni un hex. Si falta un color, se añade a la capa 1.

Y **no hay fork claro/oscuro**: ni un `@media (prefers-color-scheme)` que toque
color. Así es como esta interfaz acabó con texto BLANCO SOBRE BLANCO — había
cuatro pieles apiladas y cinco medias oscuras peleándose, la de encima
re-tintaba la tinta pero no las superficies, y aclarar más la tinta (el arreglo
que parece obvio) lo empeoraba.

**No se apila una piel nueva al final.** Es lo que se hizo tres veces y es lo
que produjo aquello.

Al escribir CSS nuevo: el texto va en `var(--text)`, los paneles en
`--surface`/`--surface-raised`, los filos en `--border`. `var(--paper)` NO es
papel: es el FONDO. `--glass-light` tampoco es claro: es el vidrio de MENOS
opacidad del par.

**Trampa ya pagada:** una animación cuyos keyframes escriben `text-shadow` GANA
a cualquier regla normal, por muy al final del archivo que esté. Si un override
"no hace nada", busca el `@keyframes`.

### El piso no lleva rótulos: lleva MEDALLAS

Los rótulos de zona (cajas de texto flotando) están apagados por defecto.
Tapaban el escenario, se solapaban entre ellos y obligaban a LEER justo
cuando no se puede leer, con el jefe detrás — y decían lo que ya dice la
barra de tarea. Siguen existiendo para el ajuste «Rótulos de zona» y para el
modo inspección, donde sí estás leyendo el plano a propósito.

Lo que hace falta saber lo dicen las **medallas** (`src/scene/beacons.js`):
un disco flotando sobre cada sitio interactuable con el icono de lo que ahí
se hace. Ámbar = tarea, verde = aquí puedes fingir, azul = escondite. Se
entienden de un vistazo y desde el otro lado del piso.

Son sprites con la textura dibujada en canvas, no geometría, por dos
razones: el icono tiene que ser el MISMO de `ui/icons.js` (modelarlos en 3D
sería mantener dos juegos que se separan al primer cambio), y un disco plano
desaparece al verse de canto. Van con `depthTest: false` a propósito — un
indicador que se esconde tras una mesa no indica nada.

**Trampa ya pagada:** `iconImage()` devuelve un ELEMENTO `Image` con su src
ya puesto, no una URL. Asignarlo a `.src` lo convierte en la cadena
`"[object HTMLImageElement]"`, la carga falla en silencio y la medalla se
queda siendo un disco vacío. Y puede venir ya cargada de la caché: entonces
no hay `onload` nunca, así que hay que comprobar `.complete` antes.

### El decorado: tres trampas de color

- **El efecto píxel va a 0 por defecto** (`pixelSize`), y los niveles de
  color a 256. El pase de `pixelPipeline` sigue corriendo porque además de
  pixelar pone la viñeta y la calidez de los bordes.
- **Las moquetas son PLANOS a ras de suelo, no bloques.** Eran una caja de
  10 cm con la cara superior por encima del pie del personaje: le tapaba los
  pies y la zona se leía como una TARIMA sobre la que la gente estaba
  subida. Llevan `polygonOffset` porque van pegadas al suelo (y `cozyMaterial`
  tuvo que aprender a dejar pasar esa opción: descartaba en silencio todo lo
  que no conocía).
- **El color de vértice MULTIPLICA al del material.** El tinte de zona que
  devuelve `pastel()` no es el color final: si se le baja la luminosidad para
  "apagarlo un poco", parte el material por la mitad y la zona sale casi
  negra, con un borde recto que parece un agujero en el suelo. Lo que se baja
  ahí es la SATURACIÓN; la oscuridad la pone el tema en `--w-rug`.

Y una de luz: **una pantalla grande con emisión alta deja de ser una
pantalla y se vuelve un panel de luz.** La del auditorio iba a 0.9 y desde la
cámara isométrica era un rectángulo azul plano flotando en mitad del piso.
Una pantalla encendida en una sala iluminada apenas ilumina — lo que la
delata es el contraste con su marco oscuro.

### El movimiento también es del DS

Las microinteracciones viven en el bloque «MOVIMIENTO» y salen de las curvas de
la capa 2 (`--ease-pop`, `--dur-*`), así que el TACTO se ajusta desde ahí igual
que el color. Entradas de pantalla en cascada, brillo que barre lo pulsable,
salto de lo elegido, y el feedback del bucle: tarea cumplida, reloj ganado,
sacudida al subir la presión y latido cuando es crítica (`.mi-*`, disparadas
desde `gamehud.js`).

Dos reglas: nada de esto puede tapar el piso ni robar un clic, y TODO respeta
`prefers-reduced-motion` — con mareo vestibular una pantalla que salta es una
barrera, no un adorno.

Dos piezas montan el 3D DENTRO de la interfaz, y son la razón de que los
menús y el diálogo ya no parezcan de otro juego:

- **EL DIÁLOGO NO LLEVA RETRATO: la conversación pasa EN EL ESCENARIO**
  (`src/scene/dialogueCamera.js`). Aquí colgaba un muñeco 3D de 480 px sobre
  el piso; la intención era que la charla «formara parte de la escena» y el
  efecto era el contrario — un personaje gigante tapando el escenario, a otra
  escala que el que hablaba ahí abajo, y duplicado con él. Ahora hay dos
  gramáticas, como en la referencia:
  - **SOLILOQUIO** (habla uno): primer plano y el personaje **se gira A
    CÁMARA**, rompiendo la cuarta pared.
  - **DIÁLOGO** (hablan dos): los dos en cuadro, de frente el uno al otro
    (`faceEachOther`), y la cámara al punto medio.
  **La cámara NO ROTA nunca — el que rota es el personaje.** Girar el ojo
  marea, rompe la lectura isométrica (arriba deja de ser arriba) y obligaría a
  recolocar un HUD pensado sobre un encuadre fijo. Solo se mueven dos cosas: a
  dónde mira (`setFocus`) y cuánto se acerca.
  Dos trampas ya pagadas: **`framing: 1` NO es un primer plano** —es el plano
  de jugar, y pedir 0.94 alejaba en vez de acercar—; el acercamiento de verdad
  es `setActionZoom` (×0,55). Y ese mando lo escribe `main.js` CADA CUADRO, así
  que el diálogo no lo escribe: lo DECLARA (`engine.cinematic`) y main.js lo
  respeta — un solo dueño, en vez de dos peleándose por el mismo valor.

- `src/ui/charshot.js` — la pantalla de selección es estática, así que cada
  personaje sale como una FOTO (`toDataURL`) de un único renderer, no como un
  lienzo vivo por tarjeta.

**La interfaz es un terminal de mentira.** Menús y HUD imitan la consola
interna de una corporación — el lore lo pide: Modo Incógnito es la coartada
del equipo y tiene que parecer la herramienta en la que fingen trabajar. Ya
no es el dashboard blanco de "plataforma" (esa piel se retiró entera al
colapsar las capas): ahora es marino, mono y de filo fino.

**Todo lo pulsable sale de UNA receta** (bloque «BOTÓN ÚNICO», al final de
`design-system.css`) alimentada por los tokens `--btn-*`. Antes había OCHO
familias de botón con radios de 8, 9, 10, 12, 14, 16, 18, 50% y 999px, varias
definidas dos y tres veces en puntos distintos del archivo — y cada pantalla
se leía como una app diferente. Tres formas, una sola piel:

- **rectangular** — el caso normal (menús, días, opciones, pestañas);
- **primaria** — misma geometría, relleno teal, UNA por pantalla: es lo que la
  jugadora va a pulsar;
- **redonda** — solo los controles de pulgar, redondos porque el dedo lo pide.

Cambiar el radio de todos los botones del juego es editar `--btn-radius`. Si
añades un pulsable nuevo, súmalo a esa lista de selectores en vez de darle
su propio borde — que es como se separaron las ocho familias anteriores.

Ese bloque va **al final a propósito**: alinea por cascada las familias
históricas sin tener que perseguirlas por el archivo. Editar cada una "en su
sitio" es justo lo que las volvió a separar las veces anteriores.

### El LIENZO FIJO: dos tamaños y nada más (`src/ui/stage.js`)

**Ya no hay diseño responsive: hay UN diseño.** El juego entero se dibuja
sobre un lienzo apaisado de 16:9 que se ESCALA para caber en la pantalla, con
bandas negras si sobra. Es como escala un juego de Unity. Antes había 19 media
queries peleándose por seis tamaños, y cada elemento nuevo sumaba tres reglas.

**Ese lienzo tiene DOS tamaños, y los elige `pickStage()` al arrancar:**
1920×1080 con puntero fino, **1280×720 en táctil o ventana pequeña**. NO es un
segundo diseño (eso sería volver al responsive): es el mismo, sobre un lienzo
menor. Los dos son 16:9, así que no se recoloca nada — cada elemento ocupa más
fracción de pantalla. Hizo falta porque 1920 lógicos en los 844 físicos de un
teléfono dan escala 0.36, y ahí un botón de 40 px mide 14 de verdad: todo
diminuto y los controles del pulgar por debajo de lo que un dedo acierta.

Se decide UNA vez y no cambia en caliente — cambiarlo obligaría a redimensionar
renderer, cámara y pase de píxeles a mitad de partida. Girar el teléfono no
cruza el umbral: `pointer: coarse` no depende de la orientación. El tamaño lo
escribe JS en `--stage-w`/`--stage-h` y marca `data-stage="compact|wide"`.

Cinco cosas de este montaje que hay que saber, y las cinco costaron:

- **`--ui-scale` la escribe JS, y como NÚMERO PURO** (`ui/stage.js` →
  `applyStageScale`). Un `calc(100vw / 1920)` da una LONGITUD, y `scale()`
  rechaza la transformación ENTERA: no es que escale mal, es que no escala
  nada y no avisa.
- **El `transform` de `#app` lo convierte en el bloque contenedor de todo lo
  `position: fixed` de dentro.** Aquí eso se quiere: un HUD fijo se ancla al
  lienzo, no a la ventana. Pero explica por qué un `fixed` "no llega al borde
  de la pantalla" — llega al borde del lienzo, que es lo correcto.
- **El 3D se renderiza a 1920×1080 lógicos** (`renderer.setSize(STAGE_W,
  STAGE_H, false)`) y la nitidez la pone `stagePixelRatio()`, que multiplica
  el `devicePixelRatio` por la escala. Sin eso, en un móvil se ve borroso y en
  un 4K se ve a media resolución.
- **Los deltas de puntero se dividen por la escala** antes de mover la
  cámara, o el arrastre va desviado. Es el fallo clásico de este montaje.
- **La cortina de orientación NO es un plan B, es obligatoria.** iPhone en
  Safari no tiene Fullscreen API para elementos ni `screen.orientation.lock`:
  en vertical, lo único que hay es pedir que giren el teléfono. Se pide
  pantalla completa y bloqueo apaisado al primer toque, y si no se puede, cae
  la cortina («Rotación de personal en curso») y el juego se pausa detrás.

Los builders de `creador/` **se quedan fuera del lienzo** a propósito: son
herramientas de escritorio y ahí el responsive normal es lo correcto.

`npm run check:layout` ya no comprueba seis viewports: comprueba que cada
dispositivo cae en EL LIENZO QUE LE TOCA, que queda centrado en cinco
relaciones de aspecto, que nada se sale en coordenadas de lienzo, que un clic
en una esquina LLEGA a esa esquina, que la cortina aparece en vertical, y que
los controles del pulgar miden **40 px REALES** o más en un teléfono — que es
la razón por la que existe el lienzo pequeño, así que es lo que hay que medir.

### El HUD de partida (`src/ui/gamehud.js`)

**Lo que se ve mientras juegas tiene que ser el PISO, no la interfaz.**
La barra de menú de macOS **ya no existe** (`src/ui/menubar.js` se borró): era
una barra permanente arriba del todo, y obligaba a ABRIR un panel para ver
tus tareas. Lo que hay ahora sale de `docs/HUD.md`, y va en las cuatro
esquinas:

- **Sup. izq. · la PLACA.** Retrato + amonestaciones + presión fundidos en UNA
  pieza, no tres tarjetas: el ojo lo lee como "yo". El retrato es la cara
  **VIVA** del muñeco 3D de tu personaje (`portrait3d.js` con
  `framing: "face"`), no una foto.
- **Sup. der. · la LISTA DE MISIONES.** Todas a la vez, sin cajas, separadas
  por una línea fina. Cada fila lleva su atajo (`1` `2` `3`) para seguirla sin
  abrir nada, su distancia, su progreso y **la misma medalla que flota sobre
  el sitio en el piso** — la lista y el escenario hablan el mismo idioma. El
  color dice el tipo: ámbar los Qués, cian los Cómos.
- **Centro arriba · el reloj**, que dice por dónde va la jornada. Su
  compañera es la barra de ENERGÍA de la placa: el reloj te guía, la
  energía es lo que te hace falta para llegar a las seis.
- **Inf. der. · el nombre de zona**, texto pelado que sale al entrar y se va
  solo.
- **Inf. centro · LA ACCIÓN EN PRIMER PLANO** (`.inc-action`): la tarjeta del
  gesto y su cuenta atrás. Comparte banda con la tira del pulso (que baja a
  `52px` para no pisarla) y con la píldora de mandos, que **le cede el sitio**
  (`body.inc-acting`) — cuando estás haciendo algo prohibido, la lista de
  teclas no es lo que hay que leer. Va con `pointer-events: none`: nunca puede
  robar un clic.
- **Notificaciones:** caen desde arriba y se van solas. Nunca roban el foco.

**La lista SE REPLIEGA con la presión**, y no es un adorno: es la respuesta al
único reparo serio de meter texto en pantalla. El principio que trajo las
medallas al piso fue «no obligar a leer con el jefe detrás», y una lista de
tres filas es exactamente eso. En calma se ve entera; en alerta se queda en
títulos; en persecución, solo la que sigues. Cuanto más aprieta el juego,
menos hay que leer. Lo vigila `npm run check:fold`.

Los tarjetones viejos (`.inc-hud-objectives`, `.inc-hud-suspicion`,
`.inc-hud-timer`, `.inc-hud-scorepanel`) siguen existiendo porque de ellos
sale el snapshot, pero están ocultos por CSS — no los resucites sin motivo.

`gamehud.js` mantiene **la misma interfaz pública** que tenía la barra
(`render` / `notify` / `resetNotices` / `closePanels` / `setLive`) y lee el
MISMO snapshot por frame (`hud.attachMenuBar`), así que sigue sin haber dos
verdades que se puedan desincronizar.

**El scrim de los menús es SÓLIDO antes de que haya partida** (título, elegir
personaje) y translúcido en pausa, donde sí hay una jornada detrás que vale
la pena entrever. Lo decide la clase `inc-game-active` del `<body>`, no qué
pantalla esté abierta, para que ajustes-desde-pausa herede lo correcto.

Si tocas el HUD o el CSS, corre `npm run check:layout` antes de darlo por
bueno. Este tipo de fallo no se ve en el diff y es fácil que se cuele en una
captura.

### La CAMPAÑA reparte las tareas (`src/game/campaign.js`)

El día ya no te suelta con tres actividades libres: las misiones vienen
**encadenadas** desde `public/data/campaign/temporada-<n>.json`, y el motor
sigue sin saber nada de temporadas — recibe una lista de objetivos como
siempre. El diseño completo está en [`docs/CAMPANA.md`](docs/CAMPANA.md).

- **La cadena tiene HOLGURA a propósito.** `requiere` encadena, pero se
  activan TODAS las misiones elegibles a la vez, no una. La cadena dice QUÉ
  hacer, nunca CÓMO ni CUÁNDO: con una sola misión activa el piso se vuelve un
  pasillo y el sigilo muere.
- **Qués y Cómos.** `tipo: "que"` se hace sola; `tipo: "como"` exige hablar
  con otro personaje. La nota los mira POR SEPARADO — puedes cumplir todo tu
  trabajo y fallar por no hablar con nadie, que es el chiste entero.
- **El guardado es POR TAREAS, no por días.** Una misión `unica` se persiste
  EN EL ACTO. Las `diaria` son la rutina y vuelven cada día.
- **Tres amonestaciones ya no despiden: mandan a RRHH** (`src/ui/hrCourse.js`)
  a un curso de cumplimiento con un botón de saltar que se mueve — y que HUYE
  del cursor a partir de la segunda visita. Siempre se puede terminar: es un
  peaje, no otra derrota.
- **El día cierra con la EVALUACIÓN** (`src/ui/review.js`), y su gracia es que
  enseña los DOS EJES a la vez: objetivos al 4/4 y competencias al 1/2 es
  «cumples pero no eres de equipo», que es el tema del juego. Resumirlo otra
  vez en una letra lo deja sin filo. Las notas malas van APAGADAS, no en rojo:
  el rojo diría que pasó algo grave, y lo grave es que a nadie le importó.
- **Cinco días sin cerrar la temporada → PLAN DE NIVELACIÓN**
  (`src/ui/levelling.js`): una tanda de pruebas del registro de minijuegos,
  pedida por id desde el JSON de la temporada. **Es una red, no otra derrota**
  — fallar una prueba no cuesta nada a propósito, y la tanda no regala reloj
  ni desbloquea nada, porque si saliera a cuenta suspender la gente
  suspendería a propósito. Se comprueba la nota ANTES que B y C: estuvo
  después y la red solo saltaba si fallabas los dos ejes a la vez.
- **Para superar la puerta del día se llama a `game.clearGate()`**, nunca
  `metGabo = true` a pelo. Son dos pasos —la bandera y avisar a la campaña— y
  hacer solo el primero abre el piso con la lista de tareas VACÍA. Media suite
  de `tools/` se rompió justo así.
- **Si no hay temporada cargada, el día vuelve a sus tareas del JSON.** El
  modelo viejo sigue siendo el suelo; no se borró.

## Invariantes que no debes romper

- **DOS MEDIDORES, y la energía NO sustituyó al reloj.** Responden a
  preguntas distintas y hay que servir a los dos:
  - **EL RELOJ te GUÍA**: por dónde va el día (9:00 → 6:00) y cuándo toca
    salir por el ascensor. **LA JORNADA DURA SIEMPRE LO MISMO**: ya NADA la
    alarga (decisión de diseño, agosto 2026). Cuando las misiones pagaban
    reloj había dos medidores de rendimiento y ninguno de tiempo, y era
    imposible saber cuánto te quedaba — que es lo único que un reloj tiene
    que decir. `_grantTime()` sigue existiendo como la única puerta del «bien
    hecho» (el globito y su sonido), pero **no toca `timeLeft`**.
  - **LA ENERGÍA es lo que HACE FALTA** para llegar al final
    (`rules.duration`, dos minutos). Baja sola —y **fingir que trabajas
    cansa MÁS que no hacer nada**, que es el chiste— y solo la reponen los
    escaqueos. Se arranca a 75 de 100 y eso da ~44 s de los 120: **la
    jornada NO se puede terminar sin reponer**, y por eso todos los días
    hay que bajar a por un café.
  Cumplir te compra DÍA, escaquearte te compra AGUANTE, y no se puede vivir
  de una sola de las dos cosas. Ojo con los TRES campos de una actividad,
  que se confunden solos: **`time` es lo que TARDA** en hacerse, **`energy`
  es la ENERGÍA que DA**, y **`reward` es el reloj que daba antes** — se
  queda de suelo por si una escena no declara `energy`. Son campos aparte a
  propósito: en la escala de `reward` el café era el escaqueo más barato
  (17) y en energía tiene que ser **la mejor recarga del piso** (45), que es
  lo que lo vuelve obligatorio.
  - **A cero te DUERMES** unos segundos sin control, plantada donde estabas
    (`SLEEP_SECONDS`). Dormirse no castiga por sí solo: castiga dormirse
    DONDE TE VEN. Con el jefe a la vista es amonestación; en un lugar seguro
    es una cabezada y ya. Echarse una siesta es legítimo, elegir mal el
    sitio no.
  - Al despertar se recupera un mínimo (25%) a propósito: con cero se
    volvería a dormir al cuadro siguiente, en bucle.
  - `_grantTime()` sigue siendo **el único sitio por el que se regala
    reloj** (misiones, secretos, distracciones y el bono de jugar limpio el
    pulso), y es quien mantiene `timeGained` en sincronía con `timeLeft`.
    Lo que ya no pasa por ahí son las actividades, que pagan en energía.
  Lo vigila `npm run check:energia`.
- **NADIE SE TELETRANSPORTA. NUNCA.** Un cuerpo que parpadea de sitio deja
  de ser un cuerpo, y es lo primero que delata que esto es un prototipo.
  Cuando el juego necesita llevar a alguien a un sitio se usa
  `player.walkTo` (en `player.update`, para que pase por las MISMAS
  colisiones, el mismo giro y la misma animación que cuando caminas tú) o se
  le manda con `distract()`. Ya se cazaron tres: sentarte en tu puesto tras
  un regaño, el tirón hasta la silla al fingir, y el codazo antiatasco del
  jefe, que era de MEDIA unidad de plano — medio puesto de trabajo de un
  cuadro al siguiente, y encima justo cuando lo estás mirando. Colocar a
  alguien de golpe solo vale AL MONTAR EL PISO, antes de que nadie mire.
- **El día 1 abre con GABO SENTADO** (`rules.gate.sentadoEn`, un id de
  `safeSpots`). La primera misión no es una persecución: está reunido, se le
  ve desde el otro lado del piso y vas a hablarle. Sentado SIGUE MIRANDO
  —cono, halo y sospecha funcionan igual—; lo único congelado es que ande, y
  el detector de atascos se salta (si no, lo daba por encajado contra un
  mueble y lo iba deslizando por la sala). Hablarle lo levanta y te manda a
  tu puesto; LLEGAR allí es lo que dispara la presentación de Crispo
  (`_updateBienvenida` → `escenas.bienvenida` en `dialogues.json`). Lo
  vigila `npm run check:apertura`.
- **TOCAR A UN VIGILANTE SIEMPRE PASA ALGO.** Con la sospecha alta, el toque
  del jefe es la amonestación de siempre. Por debajo de `chaseSuspicionFloor`
  son DOS TIEMPOS (`_updateBossApproach`): «¿NECESITAS ALGO?» con unos
  segundos de GRACIA —el margen literal para volver a tu sitio— y, si sigues
  suelta al acabar, «¡TE VEO!» y arranca la caza. Antes chocarte con él con
  la sospecha baja no hacía absolutamente nada y se leía como un juego roto.
- **En un LUGAR SEGURO los halos RETROCEDEN.** Cortar la persecución no
  basta: los conos se quedaban rojos encima de ti justo donde no pueden
  tocarte. Entrar enfría la vigilancia de todos deprisa
  (`SAFE_COOLDOWN_MUL`) y baja los `redAlert`, así que el halo se apaga solo
  — que es lo que dice «llegaste».
- **UN ESCONDITE PIDE SOLTAR EL MANDO.** Estar dentro no basta: solo cubre
  si te quedas QUIETA (`_updateHiding` mira `player.readIntent()`, no la
  velocidad — contra una pared la velocidad es cero y el hueco sería «entro
  corriendo y no suelto»). Es la regla del arbusto de Sneaky Sasquatch, y es
  lo que convierte la huida en una decisión y no en una carrera. Moverte
  dentro NO gasta su cupo: lo que se gasta es estar escondida. Lo vigila
  `npm run check:quietud`.
- **LO QUE TE VIGILA SON DOS CASTAS, y no hacen lo mismo** (el reparto de
  Sneaky Sasquatch, que es de donde salió esto). Un secuaz es un SENSOR:
  nunca amonesta (`catches()` devuelve `false` para `role: "minion"`),
  acumula su propia vigilancia (`localHeat`) y, al cruzar su
  `followThreshold`, **DELATA** — un SUCESO de flanco, no un goteo, que
  sube el medidor compartido de golpe (`DELATION_JUMP`) y se calla durante
  `reportingCooldown`. El jefe es la AMENAZA: él sí toca, y el medidor
  compartido no es ambiente, es **lo que Gabo sabe**. Si vuelves a hacer
  que el medidor suba solo mientras alguien sospecha, se pierde el instante
  al que señalar y la barra vuelve a subir «porque sí». Lo vigila
  `npm run check:delacion`.
- **La vigilancia de cada uno SE VE, y se ve LLENARSE.** El globo sobre la
  cabeza (`entities/alertIcon.js`) lleva un aro que es `localHeat` contra el
  umbral de esa persona. No es adorno: es la ventana de reacción, y sin ella
  se pasa de tranquila a delatada sin nada que leer en medio — que en una
  jornada de cuatro minutos significa que la decisión no se puede tomar. Se
  hornea en 12 escalones cacheados; no lo pases a dibujar por cuadro, que
  son siete vigilantes. Lo vigila `npm run check:globo`.
- **LO QUE LLEVAS ENCIMA cambia lo rápido que te fichan** (`_camuflaje()`).
  Las `coartadas` de la escena (factor < 1) enfrían y el botín de una
  actividad (`objeto.sospecha` > 1) delata; se multiplican, con suelo y
  techo. Es la ropa del mapache de Sasquatch: la progresión que hace que el
  piso apriete menos según inviertes. **Solo tapa el PASEO** — que te pillen
  en falta va por `MINION_HEAT_RISE_CAUGHT` y no se disimula. El botín se
  GASTA al bancar su actividad, o robar sería un castigo permanente por
  jugar bien. Y toda coartada necesita MEDALLA en el piso (`alibi` en
  `beacons.js`): un objeto que no se puede encontrar es una mecánica que no
  existe. Lo vigila `npm run check:coartada`.
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
- **El jefe NO persigue con la sospecha baja.** Por debajo de
  `boss.chaseSuspicionFloor` (40, en `boss-config.json`) hace su ronda aunque
  te pille en falta; como mucho se acerca a mirar. Antes bastaba una alerta
  roja para que se lanzara desde el primer minuto y, con Gabo además atado a
  la jugadora el día 1, no dejaba hacer nada. La tensión tiene que SUBIR: sin
  esa rampa no hay sigilo, hay un pasillo con un perro suelto. La puerta está
  en UN sitio, `Boss._mayChase()`, para que no se cuele una caza por una rama
  nueva que olvide comprobarlo. La correa del día 1 se afloja igual por debajo
  del umbral — no basta con no perseguir si su ronda sigue siendo encima de ti.
  Una vez comprometido (`lockedOn`) el umbral ya no aplica.
- **El trayecto se SUAVIZA tirando de la cuerda** (`_steer`): un camino de A*
  sobre rejilla va en escalera, y caminarlo nodo a nodo es lo que le hacía
  rebotar de esquina en esquina rozando todos los muebles. Se busca el nodo
  más lejano al que ya se puede ir en línea recta y se apunta ahí. Mira 6
  nodos como mucho: más allá no se nota y cada traza de línea se paga por
  veinte personajes.
- **«¿Me VE?» y «¿PASO?» son dos preguntas distintas, y confundirlas fue el
  bug de «Gabo se choca con todo».** `world.lineBlocked` es la primera: mira
  solo los colliders que tapan la VISTA y traza una línea de grosor CERO,
  que es lo correcto para un rayo de visión. `world.pathBlocked(a, b, radio)`
  es la segunda: mira TODOS los colliders e infla las cajas por el ancho del
  cuerpo. `_steer` preguntaba la primera para decidir la segunda — veía
  hueco a través de una fila de escritorios (no tapan la vista), se lanzaba
  recto, se estampaba, `resolveCircle` lo frenaba y el anti-atasco le metía
  un empujón aleatorio: la captura se volvía un baile de tropezones. Si
  añades navegación nueva, pregunta la que toca. Lo vigila `check:pursuit`,
  que ahora MIDE la fluidez (fracción de frames de caza en que avanzó de
  verdad) y exige ≥ 80 % — hoy va por el 97 %.
- **Una prueba de IA se mide en CUADROS, no en milisegundos.** `check:chase`
  medía con `sleep()` mientras el juego avanza por frames, o sea que medía la
  MÁQUINA: la ventana se ensanchó dos veces y el umbral se aflojó de 0.3 a
  0.1, y seguía saliendo cara o cruz. La causa no era el frame rate — era que
  **con la sospecha alta salta la alarma de nivel 3 y la partida se PAUSA**:
  medido, la pausa entraba en el cuadro 1 y los otros 89 corrían con el juego
  parado, así que el jefe se movía en UN cuadro de noventa. Avanzando a mano
  un número fijo de `update(1/60)` y reanudando DENTRO del bucle, lo mismo
  pasó de 0.12 a 3.05–3.17 y dejó de bailar. Si escribes una prueba de la IA,
  hazlo así.
- **Los montajes de `tools/` que prueban al jefe necesitan calentar el
  medidor** por encima de ese umbral, o no habrá caza que medir. Y las
  posiciones sácalas de sitios que el juego garantiza caminables (un
  waypoint de `patrolRoute`, una estación), nunca a mano: un jefe colocado
  dentro de un mueble da 0 % de fluidez con el juego intacto, y entonces lo
  que mide la prueba es su propio montaje. Y ojo con dos
  cosas que ya costaron un rato: la alarma de nivel 3 PAUSA la partida desde
  `game.js` (no desde la interfaz) y `_heatAlertShown` se rearma sola, así que
  hay que reanudar dentro del bucle; y una amonestación resetea la sospecha a
  cero, con lo que la prueba siguiente empieza en frío.
- **Persecución comprometida**: desde que un vigilante te mete en el halo,
  `boss.lockedOn` queda en true y NO debe soltarte por perderte de vista ni
  por atascarse contra un mueble; las DOS salidas son un lugar seguro
  (`game._breakAllPursuits()`, que se comprueba cada frame mientras estés
  dentro, no solo al entrar) y enfriar la sospecha a CERO sostenido
  (1.5 s seguidos en 0, sin que te esté viendo en falta) — entonces suelta
  la presa con unos segundos de gracia y vuelve a su ronda, porque quedarse
  plantado a tu lado con el medidor a cero bloqueaba el resto de tareas.
  La amonestación es SIEMPRE física (`boss.catches`, un toque): no existe
  ningún atajo que la dispare a distancia. Y al nivel de búsqueda 3 el juego
  se PAUSA con un aviso a pantalla completa (`onHeatAlert` → engine) que se
  rearma solo al enfriarse por debajo de ese nivel. Si tocas `_advanceState` o `_updateStuck`, corre
  `npm run check:pursuit`: las cuatro reglas se pisan entre sí con facilidad
  y el fallo típico es que el jefe vuelva a rendirse solo.
- **El halo nace en los ojos**, no en el suelo: el vértice del cono va a la
  altura de la mirada y por delante del pecho (ver `EYE_HEIGHT`/`EYE_FORWARD`
  en `boss.js`). Bajarlo al suelo hace que, con la cámara oblicua, se dibuje
  encima del sprite y parezca salirle de la espalda. `npm run check:vision`
  vigila eso y que el haz no se desvíe del sprite más de media dirección.
- **El halo tiene DOS ejes, y no se mezclan**: el COLOR dice qué pasa
  (tranquilo → ámbar → rojo) y la PRESENCIA dice cuánto aprieta
  (`HALO_PRESENCE_*` en `boss.js`, la opacidad global del material). En ronda
  es un susurro y solo se planta cazando. Estuvo clavado al máximo y con siete
  vigilantes el suelo desaparecía bajo las cuñas de color — tapando justo el
  escenario que hay que leer para esconderse. Si lo subes «para que se vea
  mejor», se pierde la escalada: en ronda a tope, la caza solo puede cambiar
  de tono. El degradado a lo largo del haz es OTRA cosa y vive en el alfa por
  vértice (`CONE_ALPHA_CORE`); la opacidad del material es el mando global.
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
- **LOS MANDOS SALEN DE UN SOLO SITIO** (`src/ui/controls.js`). Estuvieron en
  tres, y los tres se separaron: la píldora de bienvenida era HTML fijo en
  `index.html` —y encima se apaga en cuanto te mueves, así que a los diez
  segundos no había dónde consultar un atajo—, «Cómo se juega» enseñaba
  `E` para usar y `F` para fingir mucho después de que la acción se unificara
  en ESPACIO, y las teclas `1`–`3` no estaban documentadas en ninguna parte.
  Quien leía la ayuda pulsaba una tecla muerta y concluía que el juego estaba
  roto. Si añades un atajo, va a esa lista; el rótulo se genera solo.
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
- **El arranque es TÍTULO → HOJA DE VIDA → PERSONAJE → juego**, y en ese
  orden. El título tiene exactamente tres puertas (Jugar, Ajustes, Cómo se
  juega) y no decide nada más: antes ofrecía seis —incluida «Reiniciar
  progreso», que llegó a salir de primera cuando no había nada que borrar— y
  se saltaba solo a elegir personaje si no había ninguno, o sea el título
  haciendo el trabajo de la pantalla siguiente.
- **El guardado son TRES RANURAS NUMERADAS, y el personaje va DENTRO**
  (`src/game/save.js`). Antes la ranura ERA el personaje: había tantas
  carreras como gente en el reparto, no se podían tener dos partidas con
  Giuli, y empezar de cero obligaba a borrar. Ahora `useSlot(n)` abre una
  carrera y `setCharacter()` solo dice con qué cara se juega ESA — cambiarla
  a mitad no reinicia nada. Los dos formatos anteriores (una clave global, y
  una por personaje) los recoge `migrateOnce()` la primera vez, ordenados
  por quién jugó más, y **no se borran**: conservarlos hace la migración
  inocua si algo falla a mitad.
- **Las ranuras son HOJAS DE VIDA que se escriben solas**, no tarjetas de
  «Nueva partida». Cada una lista la experiencia que esa carrera se ha
  ganado —«3 jornadas sobrevividas en el Piso 7», «2 encargos atendidos sin
  supervisión directa»— con el tono de relleno de currículum, que es el
  chiste del juego puesto en la interfaz. La vacía no dice «vacía»: enseña
  el HUECO, con renglones punteados esperando. Ojo con dos cosas: la lista
  de viñetas sale de `cvExperience()` y **nunca queda a cero** (una carrera
  recién empezada trae «Incorporación reciente», porque en un CV el «en
  curso» también ocupa renglón), y **no hay override responsive** para el
  lienzo pequeño — el lienzo es fijo y siempre 16:9, así que las tres hojas
  caben en los dos tamaños; apilarlas en una columna fue el primer intento
  y dejaba la tercera cortada abajo.
- **A LAS SEIS SE SALE POR EL ASCENSOR.** La jornada ya no termina donde
  estés parada: a las 18:00 del reloj de pared (`CLOSING_HOUR` en `game.js`)
  el piso se vacía, se abre la SALIDA y hay que llegar a los ascensores.
  Terminar las tareas antes también la abre — el premio de ir rápido es
  poder irte antes, no ganar en el sitio. Quedarte dentro cuando se acaba el
  reloj es una AMONESTACIÓN («baja el guardia y te saca»), no un despido,
  salvo que sea la que colma el vaso. Tres cosas que no se pueden romper:
  - **La tarea de irse NO va en `this.objectives`**, solo se añade en el
    snapshot (`exitTask`): metida ahí, `objectives.every(o => o.done)` nunca
    sería cierto y la jornada no podría darse por hecha jamás.
  - **Los compañeros que se van NO usan el navmesh.** Caminan derechos a la
    puerta y se retiran al llegar o a los 15 s. Pedía ruta con A* y estaba
    medido: **~3 s por compañero**, porque es un trayecto que cruza el piso
    entero (rejilla de 152×55); con diez saliendo a la vez el juego se
    congelaba **más de treinta segundos** justo al dar las seis. Un figurante
    que se va a casa no necesita ruta — nadie va a comprobar si rozó una mesa
    camino del ascensor, y lo que hay que leer es que la oficina se VACÍA.
  - **El jefe y sus secuaces NO se van.** El último en irse es siempre el que
    vigila, y quedarte sola en un piso vacío CON él es mejor final de jornada
    que quedarte sola a secas.
  Lo vigila `npm run check:cierre`, que corre **un proceso por caso** a
  propósito: dos de los tres terminan el día, y una pestaña que acaba de
  terminarlo deja la evaluación y su bucle de render vivos — encadenar los
  casos en un mismo proceso se colgaba al arrancar el siguiente, con todas
  las variantes probadas (reutilizar, recargar, navegador nuevo, cerrar con
  plazo, `about:blank`). Que el proceso MUERA entre caso y caso es lo único
  que lo corta.
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
- **La vigilancia es individual: cada vigilante lleva SU PROPIO `localHeat`**
  (`boss.js`, 0–1), y es lo que pinta SU halo — antes los siete copiaban el
  mismo `suspicionRatio` del jefe, así que ningún secuaz podía llevar más o
  menos sospechado que otro. Solo el jefe sigue leyendo directamente el
  medidor compartido (`boss.localHeat = suspicion/max`, en `game.js`): él ES
  ese número. Cada secuaz sube el suyo solo mientras `game.js` lo ve
  (`_updateMinionCatch`-style: rápido si `redAlert`, más despacio si solo te
  ve fuera de tu puesto) y decae en cuanto deja de verte — `_decayMinionHeat`
  se llama incluso en gate/explore/lugar seguro, para que fingir dentro de
  una sala no te deje "fichada" con un secuaz que te vio un segundo antes de
  entrar. Por encima de `followThreshold` (0.55 por defecto,
  `boss-config.json` → `boss.followThreshold`) un secuaz rompe la ronda y se
  pone a SEGUIRTE de verdad (reutiliza `INVESTIGATE`, pero con el objetivo
  refrescado a tu posición real cada cuadro en vez del glance de 2.5 s de
  antes) y sigue avisando al jefe (`onSpot`/`distract`) mientras te tiene
  detrás — nunca te atrapa él (`catches()` sigue devolviendo `false` para
  `role: "minion"`, invariante sin tocar). El medidor compartido del HUD
  SIGUE existiendo y sigue siendo quien dispara amonestaciones/evaluación,
  pero ahora sube por el umbral individual de alguien (`m.localHeat >=
  m.followThreshold`), no por verte un instante — así que un vistazo de
  refilón ya no mueve el HUD, hace falta que alguien de verdad lleve un rato
  sospechando.
- **El estado del sonido tiene UNA fuente y avisa a quien lo pinte**
  (`src/game/audioControl.js`). Se cambia desde tres sitios —el menulet de la
  barra, la tecla `V` y el mute automático al perder el foco de la ventana— y
  todos tienen que verse entre sí: `subscribeAudio()` es lo que mantiene el
  icono honesto. Dos trampas ya pagadas: una función que solo PINTA el estado
  no puede además cambiarlo (el redibujado del slider llamaba a `setMuted` y
  deshacía cualquier mute que no viniera de un dedo), y `V` no puede
  bloquearse "porque hay un menú abierto" — el título es justo donde arranca
  la música y donde más se busca silenciarla.
- **La luz del día se FUNDE, no salta** (`createThemeBlender` en
  `game/themes.js`), como el fondo dinámico de un Mac. Cada frame está entre
  dos temas y las luces/niebla/exposición se interpolan; el cielo, que es una
  textura de canvas y no se puede regenerar 60 veces por segundo, avanza en
  12 pasos por par de temas. `getThemeByTime` sigue existiendo para saber en
  qué tramo estás, pero ya nadie aplica un tema de golpe a mitad de partida.
- **Lo que cuelga de un hueso hay que DESESCALARLO** (ver `_loadPoseContext`
  en character3d.js). Un `.glb` viene modelado ~110 veces más grande y se
  encoge entero al montarlo, así que una taza medida en metros acaba midiendo
  1,7 mm colgada de la mano: ahí está, pero no se ve. Se cancela la escala
  del hueso y se pasa el offset a espacio local. El mobiliario tiene el fallo
  espejo: cuelga del grupo del personaje, así que su posición YA es relativa
  — sumarle además la posición de mundo mandaba la silla al otro lado del
  piso, persiguiendo a su dueño.
- **Los NPC de fondo tienen vida propia** (`src/entities/npc.js`): trabajan
  sentados en su puesto, se levantan cada tanto, dan un paseo corto por el
  navmesh y vuelven. Los relojes van desfasados a propósito — con el mismo
  reloj, el piso entero se levanta a la vez y parece un simulacro de
  incendio.
- **Quien se sienta lo hace EN LA SILLA DEL PUESTO, no en una propia.** La
  pose `sitWork` se traía su `office_chair` colgada del personaje, y las
  sillas del piso las genera aparte `placeSeatedTable`: resultado, DOS sillas
  por puesto — la del escenario vacía y la del personaje encima. Medido en el
  día 1, el compañero sentado más cercano estaba a **0,76 unidades** de la
  silla más próxima, casi tres veces el radio de la silla. Ahora
  `createFurnitureRegistry` lleva una lista de **asientos reales**
  (`getSeats()`: la posición ya jittered de cada silla y hacia dónde mira
  quien se sienta), `claimNearestSeat()` reparte uno a cada NPC sentado al
  montar el piso, y `sitWork` ya no crea mueble ninguno. Tres cosas que no se
  pueden romper:
  - **Sin silla no hay sentarse.** Un NPC que no consiga asiento se queda DE
    PIE (`npc.js` fuerza `homePose = null`): mantener la pose sentada sin una
    silla debajo deja a alguien flotando en cuclillas en mitad del pasillo.
    Hoy 7 de 9 encuentran sitio; los otros dos se quedan de pie a propósito.
  - **La silla que rueda es la del puesto.** El gag de empujar a alguien
    sentado sigue existiendo, pero ahora `moveSeatChair()` mueve ESA
    instancia del escenario; vuelve a su sitio cuando su dueño se vuelve a
    sentar, no al terminar el rodaje, para que el salto de la silla coincida
    con el momento en que el ojo está en él.
  - **La jugadora se sienta en el flanco de subida de fingir**, no cada
    cuadro (`Game._updatePretendPose`): fijar la posición todos los frames
    dejaría el movimiento bloqueado mientras mantienes espacio. Y solo vale
    una silla DENTRO del radio del propio lugar seguro — así sentarte nunca
    te saca de él, que sería quitarte la cobertura justo al usarla. Sin silla
    cerca se queda de pie con la pose `work` de siempre, de cara a la cámara.
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

**Se abren con un clic, sin instalar nada** — salen publicados con el juego:

| Builder | En vivo | En local |
|---|---|---|
| Mapas | <https://franciscombp.github.io/modo-incognito/creador/mapas/> | `/creador/mapas/` |
| Personajes | <https://franciscombp.github.io/modo-incognito/creador/personajes/> | `/creador/personajes/` |
| Animaciones | <https://franciscombp.github.io/modo-incognito/creador/animaciones/> | `/creador/animaciones/` |
| Música | <https://franciscombp.github.io/modo-incognito/creador/musica/> | `/creador/musica/` |
| Pantallas | <https://franciscombp.github.io/modo-incognito/creador/pantallas/> | `/creador/pantallas/` |
| Pruebas | <https://franciscombp.github.io/modo-incognito/creador/pruebas/> | `/creador/pruebas/` |

- `creador/mapas/` — editor 2D del plano y del día. Lee los mismos JSON que el 
  juego y devuelve JSON para pegar — **no escribe en el repo a propósito**. Si
  añades un tipo de objeto nuevo a las escenas, añádele su entrada al registro
  `KINDS` de `mapas.js` (cómo se dibuja, qué campos tiene, qué sale al crearlo).
- `creador/personajes/` — visor 3D de personajes en vivo, selectores por pieza,
  poses y visor de texturas.
- `creador/musica/` — constructor de la pista principal con control de ánimo,
  tempo, mezcla y playhead en vivo.
- `creador/animaciones/` — el ESQUELETO y la LÍNEA DE TIEMPO de una pose.
  Importa `POSE_LIBRARY`, `BONE_OF` y `REST` del motor (por eso están
  exportados), así que la lista de huesos no puede quedarse vieja. Devuelve la
  entrada de `POSE_LIBRARY` lista para pegar.
  **La línea tiene DOS LLAVES y no veinte, y eso no es una limitación de la
  herramienta: es el motor.** Una pose del juego son dos posturas (`a`, `b`) y
  una `speed`; el muñeco va de una a otra y vuelve. Una línea con llaves
  libres estaría mintiendo sobre lo que se puede exportar.
  **Y el reparto de manos sobre los huesos, que costó:** manda el MOTOR — la
  pose en edición se le mete en su propia biblioteca (ranura `__builder`) y se
  le pide con `setPose()`, así carga lo que solo él sabe cargar: las manos, la
  altura, los props y el mobiliario del `context` (la taza del café, los
  papeles de teclear). El builder solo le quita las ROTACIONES, y solo porque hace
  falta un cursor que se pare entre A y B.
  ⚠️ **Eso hay que escribirlo DESPUÉS de `muñeco.update(dt)`.** Ese update
  reescribe los mismos huesos (respiración de espera, `_applyPose`, el clip
  del `.glb`), así que aplicando antes se borraba lo editado cada cuadro: un
  hueso a 140° no se movía y cargar `sleep` dejaba a la jugadora de pie con
  los brazos colgando. El último que escribe un hueso es el que se ve.
  Lo vigila `npm run check:animaciones`, y a propósito NO mira una captura:
  mira la rotación REAL del hueso en la escena, porque ese fallo concreto es
  invisible en una imagen.
- `creador/pantallas/` — Storybook y constructor de UI/CSS vivo.
- `creador/pruebas/` — corre las comprobaciones sobre el juego real.

**Las seis comparten una sola tira de pestañas** (`creador/nav.js`): la lista
vive ahí y solo ahí, así que una pestaña no puede apuntar a algo que ya no
existe sin que se vea en las otras cinco. Las rutas son RELATIVAS a propósito
— el sitio cuelga de un subdirectorio en Pages y una absoluta rompe justo ahí.

**Trampa ya pagada, y se repetirá:** los builders cargan el MISMO
`design-system.css` que el juego, así que un `id` genérico choca. Un
`id="hint"` en el builder de animaciones se comió la regla `#hint` del juego
—la píldora de mandos, `position: absolute` y centrada— y el párrafo salía
flotando como un globo en mitad del panel.
- `creador/pruebas/` — **EL BANCO DE PRUEBAS, y es el que ahorra el tiempo.**
  Dispara UNA cosa aislada —una pose con su mobiliario, un globo (Zzz, alerta
  ámbar/roja), un anuncio grande, el HUD en calma/alerta/caza, una caja de
  diálogo, la tira del pulso— sin jugar una partida. Antes, comprobar «¿se ve
  el Zzz?» costaba arrancar el día, saltar el ascensor, superar la puerta,
  vaciar la energía y esperar a que se durmiera: minutos por intento, y la
  mitad de las veces lo que fallaba era el montaje de la prueba.

  **Cada estado tiene URL** (`?cast=giu&pose=doze&globo=zzz&hud=caza`), así que
  una captura es `goto` + `screenshot`: `node tools/shoot-sandbox.mjs` saca la
  tanda entera en ~15 s, y `node tools/shoot-sandbox.mjs "pose=coffee"` una a
  medida. **Si tocas una pose, un globo, un anuncio o el HUD, mira aquí ANTES
  de montar una partida.**

  Dos cosas que costaron y por eso están escritas: el HUD se dibuja con
  `position: fixed`, así que el contenedor lleva un `transform` para ser su
  bloque contenedor (mismo truco que `#app` en el juego) y hay que anular a
  mano el tamaño del lienzo fijo que `#app` trae del design-system; y la
  cámara encuadra CON AIRE ARRIBA, porque los globos viven sobre la cabeza y
  un encuadre pegado al cuerpo los dejaba fuera de plano — que es justo lo
  que se viene a mirar.

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

## Dos frentes a la vez: lee `docs/ARTE.md` antes de tocar nada

Ahora mismo se trabaja en **paralelo** en dos cosas: el motor y el juego por
un lado, el aspecto del escenario por otro.
[`docs/ARTE.md`](docs/ARTE.md) reparte qué archivo abre cada frente, y es lo
primero que hay que mirar para no pisar trabajo ajeno.

Lo que hay que saber sin abrirlo:

- **La luz del mundo NO está en `main.js`**, está en `src/scene/lighting.js`.
  No la vuelvas a declarar allí. `createWorldLighting()` devuelve el objeto
  que el motor derrama en `applyTheme`, así que una luz nueva llega sola a
  `game/themes.js` sin tocar el arranque.
- **El color del edificio son los `--w-*` de `design-system.css`**, que
  `src/scene/palette.js` lee del documento. Es la única costura donde los dos
  frentes escriben en el mismo archivo: si tocas ese bloque, que sea solo ese
  bloque.
- **Pull antes de CADA commit**, no antes de cada día. Y commits de un solo
  tema, que son los que se resuelven solos al mezclar.
- Si un conflicto no está claro, **gana lo que respete lo definido** —los
  invariantes de aquí abajo primero, luego la tabla de `ARTE.md`—, no el
  último que llegó.

## Flujo de git

Una sola rama: `main`. No hay ramas de feature ni PRs internos — se hace
commit y push directo a `main`. No hace falta build local ni sincronizar
nada antes de pushear: el workflow de GitHub Actions compila y publica solo.

> Con dos frentes vivos eso último se queda corto: **sí hace falta
> sincronizar**. `git fetch origin main` y, si hay algo nuevo, `git pull
> --rebase` y volver a compilar ANTES de commitear. Ver `docs/ARTE.md`.
