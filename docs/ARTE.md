# El reparto: arte y motor en paralelo

Ahora mismo hay **dos frentes abiertos a la vez**: uno en el motor y el juego,
otro en el aspecto del escenario. Este documento existe para que no se pisen.

No es burocracia: es la lista de qué archivo abre cada uno. Si respetas la
tabla, los dos podéis trabajar todo el día sin un solo conflicto.

## La regla en una línea

> **Arte toca cómo se VE el piso. Motor toca cómo FUNCIONA.**
> Si un archivo aparece en las dos columnas, es que hay que partirlo.

## La tabla

### Arte — el aspecto del escenario

| Archivo | Qué manda |
|---|---|
| `src/scene/lighting.js` | Las luces del piso: sol, relleno, sombras |
| `src/game/themes.js` | El arco del día: color y ángulo de la luz a cada hora |
| `src/scene/cozy.js` | Materiales y cielo |
| `src/scene/textures.js` | Recetas de superficie |
| `src/scene/furniture.js` | Qué mobiliario se coloca y dónde |
| `src/game/furnitureModels.js` | La geometría de cada mueble |
| `src/scene/builder.js` | El decorado: suelos, muros, vidrio, plantas |
| `src/scene/palette.js` | El puente entre los tokens y el edificio |
| `src/scene/config.js` → `CAMERA_PRESET` | El encuadre de juego |
| `src/entities/character3d.js` → `POSE_LIBRARY` | Las poses y su ritmo |

> Los dos últimos son **archivos compartidos**: `config.js` lleva además
> `WORLD_SCALE` y la paleta de zonas, y `character3d.js` es medio motor. Arte
> entra SOLO a `CAMERA_PRESET` y a `POSE_LIBRARY` (más `_applyPose`, que es
> quien las reproduce). Del resto de esos dos archivos, no.

### Motor — cómo funciona el juego

| Archivo | Qué manda |
|---|---|
| `src/main.js` | Arranque, bucle, renderer, entrada |
| `src/game/engine.js` · `game.js` · `campaign.js` | Reglas y jornada |
| `src/entities/boss.js` · `player.js` · `npc.js` | Comportamiento |
| `src/ui/**` | HUD, menús, diálogo |
| `src/style/design-system.css` | Interfaz y **tokens** (ver aviso abajo) |

## Las tres costuras, y cómo se cruzan sin romper nada

Hay exactamente tres sitios donde los dos frentes se tocan. Conviene
conocerlos porque son los únicos que pueden dar un conflicto de verdad.

### 1 · Las luces — resuelta

`main.js` monta las luces llamando a `createWorldLighting()` y le pasa el
objeto que devuelve al motor. El motor lo derrama en `applyTheme()`:

```js
applyTheme(day.theme, { renderer, scene, ...lights });
```

**Consecuencia útil:** añadir una luz nueva en `lighting.js` la hace llegar
sola a `themes.js`. Arte puede meter luces sin abrir `main.js`.

**Lo único que Motor no debe hacer:** volver a declarar luces en `main.js`.
Si hace falta una, va en `lighting.js`.

### 2 · Los tokens `--w-*` — la que hay que vigilar

Aquí está el roce real, y hay que decirlo claro:

> El color del EDIFICIO vive en `src/style/design-system.css`, que es el
> archivo que más toca Motor (9 de los últimos 20 commits).

`src/scene/palette.js` lee del documento los `--w-floor`, `--w-wall`,
`--w-desk`… y con eso pinta el piso. Es un diseño bueno —un tema re-tinta la
interfaz Y la oficina a la vez— pero significa que **Arte tiene que editar un
archivo de Motor** para cambiar el color de una pared.

**Cómo convivir mientras siga así:** Arte toca ÚNICAMENTE el bloque `--w-*`
dentro de `[data-theme="…"]`, nunca nada más de ese archivo. Son líneas
contiguas y no se mezclan con el resto, así que git suele resolverlo solo.

**Si empieza a doler**, la salida es sacar los `--w-*` a su propio
`src/style/world.css` que `design-system.css` importe. No se ha hecho todavía
porque toca el archivo caliente del otro y conviene acordarlo antes.

### 3 · Los datos de escena

`public/data/scenes/piso7.json` dice **dónde** va cada zona y cada mueble.
Es de los dos: Arte mueve mobiliario, Motor toca zonas y lugares seguros.

Los invariantes de ese archivo —zonas que no se solapan, puertas que se
pueden cruzar, lugares seguros únicos— están en `CLAUDE.md` y los vigilan
`npm run check:doors`, `check:reachable` y `check:safespots`. **Córrelos
después de mover cualquier cosa ahí**, vengas del lado que vengas.

## El ritual: pull ANTES de cada commit

No es opcional y no es "antes de empezar el día": es **antes de cada commit**.
Con dos frentes vivos, media hora de trabajo basta para que el otro haya
tocado algo.

```bash
git fetch origin main
git log --oneline HEAD..origin/main     # ¿hay algo nuevo?
git pull --rebase origin main           # si lo hay
npm run build                           # que siga compilando DESPUÉS de mezclar
```

Y luego commits **pequeños y de un solo tema**. Un commit que toca luz Y
reglas es imposible de resolver a mano; tres commits de un tema cada uno se
resuelven solos.

### Cómo se decide un conflicto

La regla no es "gana el último" ni "gana el mío". Es:

> **Gana lo que tenga más sentido según lo que está DEFINIDO**, y lo definido
> son estos documentos, `CLAUDE.md` y los comentarios del propio código.

En la práctica, por orden:

1. **¿Contradice un invariante documentado?** Entonces pierde, venga de quien
   venga. Los invariantes están en `CLAUDE.md` ("Invariantes que no debes
   romper") y son la autoridad más alta.
2. **¿Cae dentro del territorio del otro según la tabla de arriba?** Gana su
   dueño. Si el conflicto es en `design-system.css`, mira si está dentro del
   bloque `--w-*`: si lo es, gana Arte; si no, gana Motor.
3. **¿Empatan?** Gana lo que tenga comprobación automática detrás. Un cambio
   que hace pasar un `check:*` pesa más que uno que solo se ve bonito.
4. **Si sigue sin estar claro, no lo resuelvas a solas.** Deja las dos
   versiones y pregunta. Resolver mal un conflicto de diseño cuesta más caro
   que esperar media hora.

Ojo con un caso concreto que ya pasó: **el comentario de un archivo puede
estar mintiendo**. `addAuditorium` decía "pegada a la pared norte" para una
pantalla que estaba en `-z`, que es el *fondo* según `doorSide`. Cuando el
código y el comentario no coinciden, manda la convención escrita en
`CLAUDE.md`, no el comentario suelto.

---

# El estado del frente de arte

Todo lo que sigue estaba en una conversación y ahora está aquí. Si retomas
esto dentro de un mes, con esta parte y el `git log` tienes el hilo entero.

## Lo que ya está hecho, y por qué

### La luz del día (`lighting.js` + `themes.js`)

**El problema era que la hora no se leía.** La luz con sombra estaba clavada
en la misma esquina de las 7am a las 7pm: lo único que cambiaba a lo largo de
la jornada era el TINTE, y un tinte sin sombra que lo acompañe se lee como un
filtro de foto, no como que ha pasado el día.

- Cada tema trae `sun: { azimuth, elevation }` en radianes y el sol se coloca
  con esos ángulos, interpolados en el fundido continuo que ya existía. La
  sombra de cada bloque barre el suelo de este a oeste.
- El relleno bajó de 0.66–0.80 (ambiente) y 0.64–0.78 (hemisférico) a ~0.3 y
  ~0.4, y la key subió a ~2.2. **Sumados, ambiente y hemisférico pisaban a la
  key** y no había sombra que se viera.
- El hemisférico separa por orientación: cielo frío arriba, rebote cálido
  abajo. Eso hace que el suelo no sea el mismo color que la pared **sin tocar
  un solo token del edificio**, que es territorio del otro frente.

`overcast` es la excepción a propósito: nublado es sin sol marcado, así que
ahí manda el relleno y la key va floja y muy alta.

### El puesto de trabajo (`furniture.js`)

El monitor era **una geometría fundida** (pie + cuello + pantalla) pintada
entera con el material emisivo: el pie brillaba igual que el panel y el
conjunto se leía como una paleta luminosa clavada en la mesa. Ahora el chasis
va mate y oscuro y **solo la cara del panel emite** — un monitor se reconoce
por el contraste del cristal contra su propio marco.

Las dos piezas se instancian con la MISMA lista de transformaciones, así que
no pueden desalinearse. Lo mismo para la laptop.

También: cuello de columna plana (un cilindro de seis lados se lee a lápiz
desde la cámara oblicua), teclado con escalón de teclas, y **ratón**, que sale
de la matriz de su teclado con el desplazamiento aplicado en espacio local —
queda a la derecha de quien se sienta gire como gire la mesa, y aparece solo
sin que nadie lo pida desde el plano.

### El auditorio (`builder.js`)

Dos fallos en el mismo sitio, los dos arreglados:

- La pantalla estaba en el borde `-z`, la **medianera con la cafetería**, y la
  tapaba entera. Ahora va contra `+x` (el norte de verdad según `doorSide`).
- El reparto de pods **no repartía**: usaba `cos(a - π/2)` para la x y `sin(a)`
  para la z, que con `a = π/2 + t·span` son la misma función par, así que los
  pods simétricos caían en el mismo punto. Siete sillones ocupaban cuatro
  sitios.

### Las poses (`character3d.js`)

**No se entendía qué hacía nadie**, por dos causas sumadas:

- **El ritmo.** La onda era `(1 - cos t) / 2` a secas: simétrica y sin pausa.
  Toda pose se leía igual. Ahora una pose puede pedir `hold`, que es cuánto se
  queda quieta en cada extremo — el acento que hace reconocible una acción
  (llegar, pararse, volver). Por defecto es 0: una pose que no lo pida se
  mueve exactamente como antes.
- **La amplitud.** En `coffee` el brazo recorría 0.43 rad (~25°) y en `eat`
  0.30. A la distancia a la que se juega, dos píxeles.

**`work` va al revés a propósito** y conviene no "arreglarlo": a teclear NO se
le sube la amplitud, porque un mecanógrafo mueve las manos y no los hombros.
Lo que le faltaba era alternancia entre los dos codos.

### El encuadre (`config.js` → `CAMERA_PRESET`)

`lookAtYOffset` estaba en 2.1, que por `WORLD_SCALE` son 2.52 de mundo: **por
encima de la cabeza** de un personaje, que mide 1.74. Apuntar por encima de
alguien lo empuja abajo del cuadro y deja medio encuadre de techo vacío.

Ahora mira al pecho (1.3), el pitch baja de 44 a 40 y la distancia de 14 a
12.5.

> **No subas el pitch por encima de 44.** Estuvo en 52 y solo se veía la
> coronilla. Cuanto más alto, menos cara — y la cara es donde está todo el
> carácter del reparto.

> **Al probar cambios de cámara**: `cameraSettings.js` guarda en
> `localStorage`. Quien haya tocado el panel de cámara alguna vez no verá los
> valores nuevos hasta darle a restablecer. Si un cambio "no hace nada",
> empieza por ahí.

## Lo que está pendiente, por orden de lo que más se nota

### 1 · Los charcos de luz de ventana ← lo siguiente

Es lo que más acerca el piso a `docs/referencias/ref-noche-azul.png`, que es
la referencia de la que sale todo esto: **la hora se lee por los rectángulos
de luz que las ventanas dibujan en el suelo**. El edificio ya tiene muro
cortina de vidrio en todo el perímetro (`buildPerimeterWalls`), así que la
geometría está; falta proyectar esa luz al interior y que siga al sol.

### 2 · El rango de valor del edificio

Medido sobre el tema `terminal`: suelo, pared y mesa —el 90% de los píxeles—
caben en un rango de **0.13 de luz**. Todo el edificio se lee como una masa y
las mesas no se despegan del suelo.

Esto **no se arregla desde arte solo**: los `--w-*` viven en
`design-system.css`, el archivo más caliente del otro frente. Hay que
acordarlo. La propuesta es abrir el rango a ~0.05–0.35 (suelo hundido, mesa a
media altura, pared alta).

### 3 · Textura de superficie

Todo es color plano y la luz no tiene dónde agarrarse. `textures.js` conserva
las recetas de trama, pero **quitarlas fue una decisión deliberada**
(documentada en `CLAUDE.md`): con personajes 3D delante, la trama de píxeles
peleaba con ellos. Si se recupera, tiene que ser a un contraste mucho más bajo
que el de entonces, y hay que actualizar ese párrafo de `CLAUDE.md` en el
mismo commit.

### 4 · El resto de poses

Solo llevan `hold` y amplitud revisada `coffee`, `eat` y `work`. Faltan
`sleep`, `movie`, `phone`, `scared`, `sit`, `sitWork` y `shrug`.

## Cómo se mira lo que haces

El diff de una receta de luz o de una pose **no dice nada**. Hay que ver la
imagen. Y para verla hay dos trampas que cuestan un rato cada una:

- **Espera a `engine.inLevel`, no a un tiempo fijo.** `startDay` se para en un
  `Promise.race([baseModelsReady, wait(30000)])`, así que con una espera corta
  fotografías un día que aún no ha empezado — y la luz sale siempre la del
  arranque, idéntica a cualquier hora que le pidas.
- **El diálogo hay que PASARLO, no esconderlo con CSS.**
  `updateDynamicTheme` solo corre con `dialogue.isOpen` en `false`. Ocultando
  la capa, la hora se queda congelada y todas las capturas salen iguales.

Para forzar una hora concreta, `game.timeLeft` (la jornada va de 240 a 0, de
las 7am a las 7pm).

## Dos cosas rotas que no son de este frente

Comprobadas contra `main` limpio, para que nadie las persiga en balde:

- **`check:safespots` falla** en *"y su marcador lo refleja"*. Falla igual sin
  ningún cambio de arte.
- **El build revienta en un checkout nuevo** si no corres `npm install`:
  `@phosphor-icons/core` está declarado en `package.json` pero no se instala
  solo.
