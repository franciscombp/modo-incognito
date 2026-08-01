# Personajes esculpidos fuera

Esta carpeta es **de subida directa**: dejas aquí el archivo con el nombre
correcto y el personaje aparece en el juego. No hay que tocar ningún JSON ni
escribir una línea de código.

## Qué se deja aquí

```
<id>.glb          el cuerpo, con su rig y su textura
<id>.faces.png    sus expresiones (opcional)
```

`<id>` es el del personaje en
[`public/data/characters3d.json`](../data/characters3d.json) — hoy: `giuli`,
`gabo`, `fran`, `manu`, `crispo`, `chispita`, `washo`, `cesar`, `enriquetta`,
`parce`, `kiara`. Quien no tenga `.glb` se sigue montando con primitivas, así
que se puede ir uno a uno sin romper nada.

Lo indexa `tools/index-models.mjs`, que corre **solo antes de cada build**
(también en CI). Para verlo sin compilar: `npm run index:models`.

## El cuerpo — `.glb`, no `.gltf` ni `.bin`

**GLB, siempre.** Un `.gltf` deja la geometría en un `.bin` aparte y la
textura en un PNG suelto: en cuanto uno de los tres se mueve de sitio, el
modelo deja de cargar sin decir por qué. El `.glb` empaqueta los tres.

Qué tiene que traer:

- **Rig con nombres convencionales** — `Hips`, `Spine`, `LeftArm`,
  `LeftForeArm`, `LeftHand`, `LeftUpLeg`, `LeftLeg`, `LeftFoot` y sus
  simétricos. Es lo que permite que las poses del juego (café, dormir, susto)
  funcionen sin tocar nada. Un `Spine02` hace de `Chest` y un `neck` de
  `Neck`, que es como los exporta casi todo el mundo.
- **Un ciclo de andar**, si puede ser. Si el archivo trae un clip con "walk" o
  "walking" en el nombre, **el juego usa ese** en vez de su paso propio, que
  está calibrado para muñecos de proporciones de dibujo y en un cuerpo humano
  se lee como marcha militar.
- **Escala y orientación**: da igual el tamaño con que exportes — el motor
  mide la caja y lo ajusta a la altura del personaje, apoyado en el suelo.

Lo que **no** hace falta: morph targets, huesos de dedos, ni materiales
separados por prenda.

### Cuánto debe pesar

La geometría no es el problema — los modelos de hoy rondan los 2.000
triángulos y eso está de sobra bien. Lo que pesa es **la textura**: a 2048×2048
cada personaje se va a ~6 MB, y a esta cámara no se distingue de **512×512**,
que lo deja por debajo de 1 MB. Exporta a 512 salvo que el personaje vaya a
salir en primer plano.

## Las expresiones — `<id>.faces.png`

Al estilo Animal Crossing: la cara no se modela, se **pega delante**. Un plano
pequeño colgado del hueso de la cabeza enseña una celda de una tira, y cambiar
de gesto es mover el recorte — no toca ni el modelo ni la geometría.

- **Una fila de celdas cuadradas**, en este orden:
  `neutral · blink · happy · sad · surprised · annoyed · talk`
- **Fondo transparente** (PNG con alfa): solo se dibujan los rasgos, y lo que
  quede transparente deja ver la piel del modelo.
- Vale una tira **más corta** — lo que falte cae en la primera celda. Una
  imagen de una sola cara ya sirve para empezar.
- Se dibuja **sin suavizado**, así que un trazo de pocos píxeles se ve nítido.

Como los gestos van encima, **conviene exportar el cuerpo con la cara lisa**
(sin ojos ni boca en la textura del modelo). Si el `.glb` ya trae cara
dibujada, se verá por debajo de la nuestra.

¿No cuadra dónde cae la cara? Se afina por personaje en `characters3d.json`,
sin tocar código:

```json
"giuli": { "face": { "y": 0.075, "z": 0.058, "size": 0.15 } }
```

Son fracciones de la altura del personaje, medidas desde el hueso de la
cabeza: `y` sube o baja, `z` la separa del cráneo, `size` la agranda.

## Comprobar que ha entrado

```bash
npm run build && npm run preview &
npm run check:basemodel
```

Comprueba lo que una captura no delata: que el `.glb` se pide de verdad por
red, que la malla en escena es la del archivo, que el rig conserva su postura
de reposo y que el ciclo de andar toma y suelta el mando cuando toca.

---

## `base.gltf` — cuerpo base genérico (heredado)

"P2u Base Modifiers", de **Shedletsky_2**, bajo **CC BY 4.0**. Atribución
completa en [`CREDITS.md`](../../../CREDITS.md). Le falta su `scene.bin`, así
que hoy no carga, y no lo usa ningún personaje. Se queda como base neutra por
si alguna vez hace falta una.
