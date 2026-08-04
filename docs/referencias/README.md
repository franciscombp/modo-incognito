# Referencias de dirección de arte — nostálgico, tecnológico, maduro

Cuatro capturas guardadas por Fran (agosto 2026) que fijan el norte visual
del escenario. Menos infantil, más *Where Cards Fall*: dioramas serenos con
luz de verdad.

| Archivo | Qué copiar de ella |
| --- | --- |
| `ref-interior-sepia.png` | Interior en sepias y maderas; UN charco de luz sobre la mesa y el resto se hunde en penumbra. La viñeta come los bordes. |
| `ref-noche-azul.png` | Noche azul acero: luna por las ventanas, sombras largas de cristalera, el diorama flota en un vacío casi negro. |
| `ref-cabana-lamparas.png` | Lámparas colgantes con halo cálido sobre vacío verde oliva. Sillas verde salvia, maderas ricas, acentos mínimos. |
| `ref-calle-olivo.png` | Exterior de día: luz suave, paleta oliva/acero desaturada, la saturación reservada a acentos pequeños (sombrillas, delantal). |

## Cómo está aplicado

- **`src/game/themes.js`** — la jornada recorre estas cuatro láminas: amanecer
  sepia → mañana oliva (cabaña) → mediodía calle → tarde ámbar de lámpara →
  anochecer azul acero → noche de luna. Cada tema trae su vacío (cielo/niebla),
  y el contraste llave/ambiente está subido a propósito: la luz clave manda.
- **`src/scene/cozy.js`** — superficies maduras: maderas de cabaña, greige
  cálido en paredes, sillas salvia, metal envejecido. La saturación vive en
  los acentos (pantallas encendidas, ropa de personajes).
- **`src/scene/pixelPipeline.js`** — viñeta más honda: el diorama se apaga
  hacia los bordes, como en las referencias.

Si un cambio de escena "se ve alegre de juguete", está fuera de esta
dirección: compáralo contra estas cuatro imágenes antes de darlo por bueno.
