# Modo Incógnito · Tribu Canales Piso 7

Juego web en Three.js: eres una empleada del piso 7 que intenta **no trabajar**
—café, chisme, siesta, televisión— mientras el jefe patrulla la planta.

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
npm run format:data    # reordena los JSON de data/ para que sigan legibles
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

## Personajes

`dialogues.json` define el reparto y sus conversaciones. Cada compañero tiene
varias escenas que se van alternando, con opciones que hacen algo de verdad:

- **Manu de la suerte** — te calma la sospecha o te dice dónde anda el jefe.
- **César** — el malcriadito. Dale la razón y se pone a escribir correos
  (y deja de mirarte); llévale la contraria y grita llamando al jefe.
- **Enriquetta** — chapter del amor. El chisme puntúa; también se ofrece a
  entretener al jefe durante cuarenta minutos.

Manu, César y Enriquetta son **amigos tuyos**. Los secuaces no lo son, pero
también puedes hablarles: según lo que elijas te cubren o te delatan.

Los **secuaces** (`minions` en `characters.json`) no te atrapan: te delatan.
Si te ven haciendo algo prohibido llaman al jefe a ese punto y te suben la
sospecha. Cada uno vigila distinto — **Chispita** corre por todo el piso con
cono corto, **Washo** apenas se mueve pero te ve desde el otro extremo del
ala, y **Crispo** está casi quieto abarcando medio pasillo. Cada día elige
cuáles salen y por qué ronda, en su JSON:

```json
"minions": [{ "id": "chispita", "route": "sur" }, { "id": "washo", "route": "norte" }]
```

## La jornada

Cada día abre en la **fila del ascensor**, en planta baja. Puedes esperar
(pierdes minutos de jornada), subir por las escaleras (llegas entera pero
lenta un rato) o colarte (ganas tiempo, con riesgo de empezar ya con una
advertencia). Se edita en `prologue` dentro del JSON del día.

Después sales al pasillo de ascensores, con el ala sur a un lado y la norte
al otro. El piso es continuo a propósito: el jefe ronda por todas partes y
las persecuciones cruzan la planta entera.

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

## Puntuación

Cada actividad prohibida da puntos. Encadenarlas antes de que expire la ventana
sube el multiplicador hasta ×4, y hacerlas con el jefe cerca —o directamente
dentro de su cono— multiplica todavía más. Terminar antes de tiempo suma el
reloj sobrante. Al cerrar el día recibes un rango de **D** a **S**.
