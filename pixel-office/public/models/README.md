# Modelos importados

## base.gltf — cuerpo base de los personajes

"P2u Base Modifiers", de **Shedletsky_2**, bajo **CC BY 4.0**.
Fuente y atribución completa en [`CREDITS.md`](../../../CREDITS.md).

> **FALTA LA GEOMETRÍA.** Un `.gltf` solo describe dónde está cada cosa; los
> vértices viven en el binario que declara en `"buffers"`. Este pide
> `scene.bin` (220 KB) y no está, así que hoy el modelo NO carga.
>
> Para completarlo, cualquiera de las dos:
>
> - dejar el `scene.bin` del ZIP de Sketchfab **en esta carpeta y con ese
>   mismo nombre** (el `.gltf` lo busca así, no hay que renombrar nada), o
> - sustituir los dos por un único `base.glb`, que empaqueta geometría y
>   descriptor juntos y es lo que menos se rompe al moverlo de sitio.

El adaptador que lo enchufa al juego es
[`src/entities/baseModel.js`](../../src/entities/baseModel.js): reescala el
modelo midiendo su caja, renombra sus huesos a los nuestros (para que las
poses que ya existen sigan valiendo tal cual) y ajusta las proporciones
escalando huesos.

### Lo que este modelo NO trae

- **Sin morph targets.** Se llama "Modifiers", pero se quedaron en Blender.
  Gordo, flaco y alto salen de escalar huesos (`applyBuild`).
- **Sin huesos de pie.** La pierna acaba en el tobillo; los zapatos cuelgan
  de ahí.
- **Sin cara.** Los ojos, el rubor y la boca los seguimos poniendo nosotros.
- **Un solo material.** El color por zonas solo puede ir por malla (brazos /
  cuerpo / cabeza / cuello).
