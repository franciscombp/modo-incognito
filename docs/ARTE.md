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

## Qué hacer si aun así choca

No hay ramas de feature: los dos vamos a `main`. Así que:

1. `git pull --rebase` antes de empezar cada tanda.
2. Commits pequeños y de un solo tema. Un commit que toca luz Y reglas es
   imposible de resolver a mano; dos commits se resuelven solos.
3. Si el conflicto cae en `design-system.css`, mira si es dentro del bloque
   `--w-*`. Si lo es, gana Arte. Si no, gana Motor.
