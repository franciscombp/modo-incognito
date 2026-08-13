# Herramientas de Creación · Modo Incógnito

Suite de editores especializados para crear y modificar contenido del juego sin necesidad de tocar código. Todos los editores leen los mismos datos que el juego y devuelven JSON o CSS para copiar y pegar — **no escriben en el repo a propósito**.

## Builders

### [Personajes](personajes/)

Editor 3D de personajes. Monta cada muñeco con los componentes visuales que lo forman (piel, pelo, prenda, pantalón, zapatos, accesorios, complexión) y te permite ajustar colores y poses en vivo.

- **Lee:** `public/data/characters3d.json`
- **Devuelve:** receta JSON de un personaje para copiar a `public/data/characters3d.json`
- **Funciones:** selector de pose, preview de las ocho direcciones, cambio de color en cada componente, visor de poses

### [Mapas](mapas/)

Editor 2D del plano y de la mecánica del día. Crea y edita salas, pasillos, actividades, zonas seguras, rutas de IA, puntos de spawn, y todo lo que vive en el espacio del piso.

- **Lee:** `public/data/scenes/piso7.json` y `public/data/levels/dia-1.json`
- **Devuelve:** escena completa o día completo para copiar a `public/data/`
- **Funciones:** herramientas para spawn, rutas, perímetro, paredes con puertas, edición de propiedades por objeto, validaciones (áreas solapadas, puertas inaccesibles, puntos inalcanzables)

### [Música](musica/)

Secuenciador de temas musicales. Toca proceduralmente con Tone.js: bajo, melodía, colchón, percusión y trompetas. Cada nota es editable, y puedes escuchar en bucle mientras ajustas.

- **Lee:** `public/data/soundtrack-themes.json`
- **Devuelve:** tema completo en JSON para copiar a `public/data/soundtrack-themes.json`
- **Funciones:** selector de tema, BPM y pasos por compás, control de capas, mixer de volumen, editor de notas por paso, reproducción en vivo

### [Pantallas](pantallas/)

Storybook de componentes UI y constructor de interfaces. Visualiza el catálogo completo de botones, inputs, paneles, diálogos, HUD y menús con editor de CSS en vivo.

- **Lee:** componentes desde `src/style/design-system.css`
- **Devuelve:** CSS personalizado para componentes específicos
- **Funciones:** navegación por tipo de componente, editor de CSS con preview en vivo, exportación de estilos personalizados

## Cómo usarlos

1. Abre el builder que necesites en tu navegador (cada uno en su propia URL)
2. Carga los datos existentes o empieza de cero
3. Edita en vivo — la interfaz te muestra cambios al instante
4. Copia el JSON o CSS que genera
5. Pégalo en el archivo correspondiente en `public/data/` (o `src/style/`)
6. **El builder no escribe en el repo,** así que el git status sigue limpio hasta que hagas commit

## Ubicación

Todos los builders están integrados en Vite como entradas separadas. En desarrollo local (`npm run dev`):

- [personajes](http://localhost:5173/creador/personajes/)
- [mapas](http://localhost:5173/creador/mapas/)
- [música](http://localhost:5173/creador/musica/)
- [pantallas](http://localhost:5173/creador/pantallas/)

En producción se publican bajo `/creador/` en el dominio del juego.

## Paleta y diseño

Los builders heredan el **design system** completo del juego:
- Colores cozy (papel crema, tinta marrón, acento terracota)
- Tipografía y espaciado
- Componentes de interfaz consistentes

Editar `src/style/design-system.css` actualiza todos los builders de inmediato.

## Las seis herramientas, una sola tira de pestañas

Eran páginas sueltas: para pasar del plano a los personajes había que saber
la URL. Ahora cada una monta la misma tira (`creador/nav.js`) y se salta a la
de al lado con un clic. **La lista vive en ese archivo y solo ahí**, así que
añadir una herramienta es una línea y es imposible que una pestaña apunte a
algo que ya no existe sin que se vea en las otras cinco.

| Herramienta | Para qué |
|---|---|
| `mapas/` | El plano: zonas, tareas, escondites, distracciones |
| `personajes/` | Las recetas 3D del reparto y sus poses |
| `animaciones/` | El esqueleto hueso por hueso y la línea de tiempo de una pose |
| `musica/` | Ánimo, tempo, mezcla y playhead |
| `pantallas/` | Storybook de la interfaz y CSS en vivo |
| `pruebas/` | Correr las comprobaciones sobre el juego real |

### Dos cosas que costaron, y volverán a costar

- **Los builders cargan el MISMO `design-system.css` que el juego**, así que
  un `id` genérico choca. Un `id="hint"` heredó la regla `#hint` del juego —la
  píldora de mandos, `position: absolute` y centrada— y el párrafo salió
  flotando como un globo en mitad del panel. Usa clases con prefijo.
- **La altura no se adivina, se reparte.** `main` estaba en
  `calc(100vh - 53px)`, con la altura de la barra escrita a mano; la barra
  mide otra cosa y cambió otra vez al meterle las pestañas, así que el último
  bloque de cada panel se salía por debajo del viewport. Hoy `body` es una
  columna flex y `main` se queda con lo que sobre, mida lo que mida la barra.
