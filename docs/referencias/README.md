# Referencias visuales

Dos grupos, y conviene no mezclarlos: las del **escenario** (cómo se ve el
Piso 10) y las de **interfaz** (cómo se ven HUD y menús).

---

## Escenario — `ref-*.png`

⚠️ **Estas cuatro son HISTÓRICAS.** Fijaron el norte del escenario en la etapa
sepia/oliva y **ya no describen el juego**: la paleta se pasó a la familia
marina para unificarla con la interfaz (ver `CLAUDE.md` → «El TEMA»). Se
quedan porque siguen valiendo para lo que de verdad importaba de ellas —**la
LUZ, no el color**.

| Archivo | Qué sigue valiendo |
| --- | --- |
| `ref-interior-sepia.png` | UN charco de luz sobre la mesa y el resto hundido en penumbra. La viñeta come los bordes |
| `ref-noche-azul.png` | Sombras largas de cristalera; el diorama flotando en un vacío casi negro |
| `ref-cabana-lamparas.png` | Lámparas colgantes con halo, cada mesa con su charco de luz implícito |
| `ref-calle-olivo.png` | Saturación reservada a acentos pequeños, nunca al fondo |

**Lo que ya NO se copia de ellas:** los sepias, los verdes oliva y las maderas
cálidas. El decorado es marino y sale de los tokens `--w-*` del tema.

---

## Interfaz — `pantallas/` y `hud/`

Las que fijan el rumbo NUEVO. Ver [`../PANTALLAS.md`](../PANTALLAS.md) y
[`../HUD.md`](../HUD.md), donde están desmontadas pieza a pieza.

| Archivo | Qué es | Qué copiar |
| --- | --- | --- |
| `pantallas/seleccion-escuadron.jpg` | Selección de agente de escuadrón | La estructura de tres columnas, el personaje 3D como protagonista, lo bloqueado en silueta, y los paneles **sesgados** que inspiran los menús 3D |
| `pantallas/seleccion-agentes.webp` | Selección de agente competitiva | Las **cartas a sangre** y sus estados (elegida / bloqueada / de otro), el botón de acción DENTRO de la carta, y el personaje **saliéndose del marco** |

### Faltan tres

Se pegaron en el chat sin adjuntar y no llegaron al repo. Están descritas en
`HUD.md` pero sin imagen, así que dentro de unos meses nadie va a saber de
qué se hablaba:

- **HUD de partida** («Lime Street») — placa retrato+vida arriba-izq, moneda
  arriba-der, prompt de botón abajo-izq, nombre de zona abajo-der.
- **Menú de pausa** — pestañas con gatillos, acento único, leyenda de mandos
  abajo, el juego visible por detrás.
- **Lista de misiones** — filas sin caja, atajo por tarea, distancia y
  progreso alineados a la derecha, insignia por categoría.
