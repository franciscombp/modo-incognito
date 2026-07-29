# Modo Incógnito · Tribu Canales Piso 7

Juego web en Three.js: eres una empleada del piso 7 que intenta **no trabajar**
—café, chisme, siesta, televisión— mientras el jefe patrulla la planta.

Se publica en <https://franciscombp.github.io/modo-incognito/> desde `main`.
**El repositorio usa una sola rama.**

El build usa rutas relativas y se copia también a la raíz del repo, así que
funciona con cualquiera de las dos configuraciones de *Settings → Pages*:
**GitHub Actions** (recomendada) o **Deploy from a branch → main / (root)**.
Antes fallaba porque, sin `index.html` en la raíz, Pages renderiza el README.

## Desarrollo

```bash
cd pixel-office
npm ci
npm run dev            # servidor local
npm run build          # build de producción a dist/
npm run check          # navmesh + IA del jefe (Playwright)
npm run check:visual   # capturas del juego a shots/
npm run check:menus    # capturas de los menús a shots/
npm run build:pages    # build + copia a la raíz del repo
```

## Controles

| Acción | Teclado | Móvil |
| --- | --- | --- |
| Mover | WASD / flechas | joystick flotante (mitad izquierda) |
| Interactuar / distraer | E | botón **USAR** |
| Fingir que trabajas | F | botón **FINGIR** |
| Inspeccionar el plano | M | botón 🗺️ |
| Zoom | rueda | pellizco o ＋ / － |
| Orbitar la cámara | clic derecho + arrastrar | dos dedos |
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
  levels/dia-1.json …    reglas del día + diálogos de novela visual
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

## Cámara ajustable

La perspectiva no está fijada: **Ajustes → Cámara** tiene deslizadores para
campo de visión, yaw, pitch, distancia, altura del objetivo y suavizado, con
vista previa en vivo. Orbita con clic derecho (o dos dedos), y cuando te guste
pulsa **Copiar parámetros**: obtienes un bloque `CAMERA_PRESET` listo para
pegar en `src/scene/config.js` y dejarlo como valor por defecto.

## Aspecto

El 3D existe para resolver colisiones, oclusión y navegación; lo que se ve es
2D. La escena se renderiza a un búfer reducido y se reescala con vecino más
cercano, con cuantización de color: el resultado es pixel art con perspectiva.
El grosor del píxel y los niveles de color se ajustan en **Ajustes → Juego**.

## Arquitectura

```
src/
  scene/
    config.js      WORLD_SCALE y CAMERA_PRESET: los dos únicos mandos globales
    floorplan.js   el plano como datos (zonas, capacidad, color, pasillos…)
    furniture.js   capacidad -> una mesa grande + N sillas alrededor
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

## Puntuación

Cada actividad prohibida da puntos. Encadenarlas antes de que expire la ventana
sube el multiplicador hasta ×4, y hacerlas con el jefe cerca —o directamente
dentro de su cono— multiplica todavía más. Terminar antes de tiempo suma el
reloj sobrante. Al cerrar el día recibes un rango de **D** a **S**.
