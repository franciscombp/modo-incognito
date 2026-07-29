# Modo Incógnito · Tribu Canales Piso 7

Juego web en Three.js: eres una empleada del piso 7 que intenta **no trabajar**
—café, chisme, siesta, televisión— mientras el jefe patrulla la planta.

Se publica en <https://franciscombp.github.io/modo-incognito/> desde `main`
mediante GitHub Actions. **El repositorio usa una sola rama.**

> En *Settings → Pages*, el origen debe estar en **GitHub Actions** (no en una
> rama). El workflow `.github/workflows/deploy-pages.yml` construye y publica.

## Desarrollo

```bash
cd pixel-office
npm ci
npm run dev            # servidor local
npm run build          # build de producción a dist/
npm run check          # navmesh + IA del jefe (Playwright)
npm run check:visual   # capturas en escritorio y móvil a shots/
```

## Controles

| Acción | Teclado | Móvil |
| --- | --- | --- |
| Mover | WASD / flechas | joystick flotante (mitad izquierda) |
| Interactuar / distraer | E | botón **USAR** |
| Fingir que trabajas | F | botón **FINGIR** |
| Inspeccionar el plano | M | botón 🗺️ |
| Zoom | rueda | pellizco o ＋ / － |

## Arquitectura

```
src/
  scene/
    config.js      WORLD_SCALE y CAMERA_PRESET: los dos únicos mandos globales
    floorplan.js   el plano como datos (zonas, capacidad, color, pasillos…)
    furniture.js   capacidad -> una mesa grande + N sillas alrededor
    builder.js     construye la maqueta y registra los colliders
    camera.js      cámara perspectiva oblicua tipo diorama
    navmesh.js     rejilla de navegación (rutas del jefe + test de alcance)
  game/
    engine.js      bucle de campaña: día -> escena -> nivel -> escena
    game.js        reglas de una jornada (sospecha, objetivos, advertencias)
    dialogue.js    novela visual con máquina de escribir y opciones
    hud.js         HUD e indicador de zona actual
    themes.js      ambientación por día
    save.js        progreso en localStorage
  content/
    days.js        la campaña: 5 días, cada uno con reglas y diálogos
    easterEggs.js  secretos por ubicación y por código
```

### Añadir contenido

- **Un día nuevo**: añade un objeto a `src/content/days.js`. Sus `rules`
  controlan duración, advertencias, objetivos, velocidad y visión del jefe.
- **Una zona nueva**: añade una fila a `RAW_AREAS` en `floorplan.js`. La
  `capacity` genera sola la mesa grande y sus sillas.
- **Un easter egg**: añade una entrada a `locationEggs` o `codeEggs`.

Ninguna de las tres cosas requiere tocar el motor.
