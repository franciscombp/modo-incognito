# Las pantallas y el lienzo

**Estado: §1 CONSTRUIDO, el resto en diseño.** Guía para desarrollarlo, como
[`MOTOR.md`](MOTOR.md) (reglas), [`CAMPANA.md`](CAMPANA.md) (progresión) y
[`HUD.md`](HUD.md) (interfaz de partida). Aquí va todo lo que NO es la partida: el lienzo sobre el que se
dibuja todo, y las pantallas de menú.

| Sección | Estado | Dónde vive |
|---|---|---|
| §1 El lienzo fijo (1920×1080 y 1280×720 en móvil) | ✅ construido | `src/ui/stage.js`, bloque «EL LIENZO FIJO» del DS, `src/main.js` |
| §1.4 Cortina de orientación + pantalla completa | ✅ construido | `src/ui/stage.js` → `createStage()` |
| §1.7 `check:layout` reescrito | ✅ construido | `tools/check-layout.mjs` (5 relaciones de aspecto + área táctil real) |
| §1.8 Paneles con CSS 3D | ◻︎ la `perspective` está puesta en `#app`; ningún panel la usa aún |
| §2 Selección de personaje como expediente | ◻︎ sin construir — sigue la pantalla de login anterior |
| §3.2 Evaluación de desempeño | ✅ construido | `src/ui/review.js` |
| §4 RRHH | ✅ construido | `src/ui/hrCourse.js`, bloque «CURSO DE RRHH» del DS |
| §1.8bis El escenario ES el menú (ascensor, escritorio, espejo) | ◻︎ **en diseño** | Dirección nueva: sin cajas ni contenedores; la transición son las puertas del ascensor |

**Referencias en el repo** (`docs/referencias/pantallas/`):

| Archivo | Qué es | Para qué |
|---|---|---|
| `seleccion-escuadron.jpg` | Selección de agente de escuadrón | La ESTRUCTURA de tres columnas y el panel biselado |
| `seleccion-agentes.webp` | Selección de agente competitiva | Las CARTAS, sus estados y el personaje saliéndose del marco |

Las tres del HUD (partida, pausa y lista de misiones) están en
`docs/referencias/hud/` y se desmontan en [`HUD.md`](HUD.md).

---

# §1 · EL LIENZO FIJO

Es la decisión más profunda de este documento, porque cambia **cómo se
construye todo lo demás**.

## 1.1 La decisión

> **El juego se dibuja siempre sobre un lienzo apaisado de 16:9, y ese lienzo
> se ESCALA entero para caber en la pantalla. Con bandas negras si hace
> falta.**

**Hay DOS tamaños de ese lienzo** (añadido después de probarlo en un
teléfono): **1920×1080** con puntero fino y **1280×720** en táctil o ventana
pequeña. No es un segundo diseño — eso sería volver al responsive que tanto
costó quitar — es **el mismo diseño sobre un lienzo más chico**.

Por qué hizo falta: 1920 lógicos en los ~844 físicos de un teléfono dan una
escala de 0.36, y ahí un botón de 40 px acaba midiendo 14 de verdad. Estaba
todo diminuto y los controles del pulgar quedaban por debajo de lo que un
dedo acierta. Al ser los dos 16:9 no se recoloca nada: cada elemento pasa a
ocupar más fracción de pantalla y ya. El botón de usar pasó de 31 px reales
a 46, y el joystick de 46 a 69.

**Se elige UNA vez, al arrancar.** Cambiarlo en caliente obligaría a
redimensionar renderer, cámara y pase de píxeles a mitad de partida. Girar el
teléfono no cruza el umbral: `pointer: coarse` no depende de la orientación.
`check:layout` comprueba que cada dispositivo cae en el suyo, y —lo que de
verdad importa— que los controles táctiles midan 40 px REALES o más.

Igual que un juego de Unity o Unreal: se diseña a una resolución y el motor
lo escala. No hay diseño responsive, hay **un** diseño.

## 1.2 Por qué

Hoy cada pieza de interfaz se ha peleado por su cuenta con seis tamaños de
pantalla, y hay **19 media queries** en el design system solo para eso. Cada
elemento nuevo son tres reglas más y una comprobación más. Con lienzo fijo:

- Se diseña **una vez**, a 1920×1080.
- Un botón de 40 px mide 40 px **siempre**, proporcionalmente.
- Desaparecen las 19 media queries y los apaños de móvil apaisado.
- `--ui-scale` **ya existe** en los tokens (`min(100vw/1920, 100vh/1080)`) y
  hoy no lo usa nadie. La base está puesta.

## 1.3 Cómo

Un contenedor `#stage` de 1920×1080 exactos, centrado, con
`transform: scale(var(--ui-scale))`. Todo —canvas 3D, HUD, menús— vive
dentro. Fuera, negro.

Tres cosas que hay que hacer bien o esto sale mal:

1. **El canvas 3D se renderiza a la resolución REAL**, no a 1920×1080
   escalado — si no, en un móvil 2× se ve borroso y en un monitor 4K se ve a
   media resolución. El lienzo fijo es para la INTERFAZ; el 3D usa el
   `devicePixelRatio` de siempre y solo respeta el encuadre.
2. **Los eventos de puntero llegan en coordenadas de pantalla**, no de
   lienzo. Hay que dividir por la escala o los toques caen desviados. Es el
   fallo clásico de este montaje.
3. **`transform: scale` sobre texto** puede verse blando. Alternativa a
   probar: escalar por `font-size` en `rem` con el `html` escalado. Se decide
   comparando en pantalla, no en teoría.

> ### Cómo quedó, y las dos trampas que faltaban en esta lista
>
> Vive en `src/ui/stage.js` (`STAGE_W`/`STAGE_H`, `stageScale`,
> `applyStageScale`, `createStage`) y en el bloque «EL LIENZO FIJO» del design
> system. Los tres puntos de arriba se resolvieron así:
>
> 1. El 3D se renderiza a 1920×1080 lógicos (`setSize(STAGE_W, STAGE_H,
>    false)`) y la nitidez la pone `stagePixelRatio()`, que multiplica el
>    `devicePixelRatio` por la escala. La cámara usa siempre
>    `STAGE_W / STAGE_H` de aspecto, así que el encuadre no depende de la
>    ventana.
> 2. Los deltas de puntero se dividen por la escala antes de mover la cámara.
>    `check:layout` lo verifica con un clic en cada esquina.
> 3. `scale` sobre texto: se probó y **no se ve blando** a las escalas reales
>    (0.5–1.0). No hizo falta la alternativa del `rem`.
>
> Y dos que no estaban previstas y costaron:
>
> - **`--ui-scale` tiene que ser un NÚMERO, y por eso la escribe JS.** El
>   `calc(min(100vw / 1920, 100vh / 1080))` que había en los tokens da una
>   LONGITUD, y `scale()` con una longitud dentro rechaza la transformación
>   ENTERA. No escalaba mal: no escalaba, y sin un solo aviso en consola.
> - **Un `transform` convierte al elemento en el bloque contenedor de todo lo
>   `position: fixed` de dentro.** Aquí se quiere —un HUD fijo se ancla al
>   lienzo, no a la ventana—, pero explica por qué un `fixed` deja de llegar
>   al borde de la pantalla en cuanto entra el lienzo.

## 1.4 Orientación y pantalla completa — la parte incómoda

Pediste **obligar** a apaisado y pantalla completa. Se puede pedir; **no se
puede obligar en todas partes**, y conviene saberlo antes de construirlo:

| Contexto | Pantalla completa | Bloqueo apaisado |
|---|---|---|
| Android · Chrome | Sí (con gesto) | Sí, dentro de pantalla completa |
| iPhone · Safari | **No** para elementos (solo vídeo) | **No** — la API no existe |
| iPad · Safari | Sí | No |
| PWA instalada | Vía manifest | Vía manifest `orientation` |
| Escritorio | Sí | No aplica |

Nuestro `manifest.webmanifest` **ya declara** `"orientation": "landscape"` y
`"display": "standalone"`. Eso cubre la app instalada.

**Conclusión: el aviso de «gira el teléfono» no es un plan B, es
obligatorio.** En iPhone en navegador es la única herramienta que hay.

Lo que propongo, en este orden:

1. Al primer toque, pedir pantalla completa y bloqueo apaisado. Si funciona,
   perfecto.
2. Si no, o si el teléfono está en vertical: **cortina a pantalla completa**
   con un icono de móvil girando y «Gira el teléfono». El juego se pausa
   detrás. Sale sola al girar.
3. Empujar la **instalación como PWA** desde el menú: instalada es donde de
   verdad se comporta como un juego.

> La cortina es además una oportunidad: puede ser un chiste de la empresa
> («Rotación de personal en curso»).

## 1.5 Qué muere con esto

- Las **19 media queries** del design system y todos los apaños de móvil.
- Los bloques `@media (max-height: 480px)` del reloj y del rastreador.
- **`check:layout` como está hoy**: comprobar seis tamaños deja de tener
  sentido. Pasa a comprobar otra cosa (§1.7).

## 1.6 Lo que NO entra en el lienzo

**Los builders (`creador/`) se quedan como están.** Son herramientas de
escritorio, no el juego: ahí el responsive normal es lo correcto y meterlas
en un lienzo apaisado fijo sería absurdo. Comparten el design system pero no
el `#stage`.

Hay que tenerlo presente al borrar media queries: algunas son suyas.

## 1.7 Qué comprueba `check:layout` a partir de ahora

En vez de seis tamaños:

1. Que el `#stage` mide 1920×1080 **siempre**, pase lo que pase.
2. Que la escala se calcula bien y **queda centrado** en varias relaciones de
   aspecto (16:9, 20:9, 4:3, ultrapanorámico).
3. Que **nada se sale** del lienzo (que es lo que hoy se comprueba, pero
   contra un canvas fijo en vez de contra seis viewports).
4. Que un clic en una esquina **llega a la esquina** — la trampa de §1.3.2.

## 1.8bis EL ESCENARIO **ES** EL MENÚ — ◻︎ por construir

> **Decisión de dirección (supera a §1.8 para los menús).** §1.8 quería
> paneles inclinados flotando *delante* del escenario. La dirección nueva va
> un paso más allá: **no hay panel.** La caja, el contenedor y el borde
> desaparecen, y lo que queda es un SITIO del edificio que además funciona
> como menú. §1.8 sigue valiendo para lo que sí es interfaz (pausa, ajustes).

**La estructura de los menús NO cambia** — mismas pantallas, mismo orden,
mismos datos. Lo que cambia es el DECORADO y la estética de cada una:

| Pantalla | Hoy | El sitio que la sustituye |
|---|---|---|
| Título | Tres botones en una caja | **La botonera del ascensor**: cada planta es una opción |
| Elegir partida (ranuras) | Tres tarjetas de «hoja de vida» | **Un escritorio con los CV encima**: coges una carpeta |
| Elegir personaje | Rejilla de tarjetas | **El espejo del baño**: te miras y te retocas |
| Pausa / ajustes | Panel | Sigue siendo interfaz (§1.8): no todo tiene que ser diegético |

**La transición ES la ficción, no un fundido.** Entre pantallas se CIERRAN y
se ABREN las puertas del ascensor. Eso resuelve tres cosas de golpe: tapa el
cambio de decorado (que es lo que un fundido hace mal), explica el salto
—estás yendo a otro sitio del edificio— y da el tiempo de carga que el 3D
necesita sin que parezca una espera.

### Lo que hay que respetar al construirlo

- **El lienzo fijo no se toca** (§1). Estas pantallas se dibujan dentro de
  1920×1080 como todo lo demás.
- **Lo pulsable sigue saliendo de la receta única de botón** aunque parezca un
  botón de ascensor: la piel cambia, la geometría y los estados no. Un botón
  diegético que no se nota pulsable es un menú roto.
- **Legibilidad primero.** Un CV sobre una mesa en perspectiva se lee peor que
  una tarjeta recta. Si hay que elegir, gana leerlo: se acerca la cámara al
  papel en vez de dejarlo tumbado a lo lejos.
- **Accesibilidad.** Con `prefers-reduced-motion` las puertas no se animan:
  cortan. Y todo lo pulsable sigue siendo alcanzable por teclado, aunque su
  aspecto sea un botón de latón.
- **Una sola escena 3D.** Ascensor, escritorio y espejo son ENCUADRES de la
  misma escena y el mismo `Character3D`, no tres montajes: es lo que evita
  que cada pantalla cargue lo suyo y tarde.

### El orden en que conviene hacerlo

1. **El armazón compartido**: una pantalla = un decorado + una lista de
   opciones. Si esto no es común a las cuatro, se acaban escribiendo cuatro
   menús distintos y volvemos a donde estábamos.
2. **La transición de puertas**, que es la pieza que las une.
3. **La botonera del ascensor** (título), que es la entrada.
4. El escritorio con los CV, y el espejo del baño.

---

## 1.8 Los menús son PLANOS EN EL ESPACIO, no capas planas

De `seleccion-escuadron.jpg`: el panel no es un rectángulo pegado a la
pantalla. Está **sesgado**, con el filo izquierdo en diagonal, y se lee como
una placa flotando delante del escenario. Eso es lo que hace que parezca un
juego y no una web.

**Decisión: los paneles de menú se construyen con CSS 3D**, no con formas
dibujadas a mano. Un `perspective` en el `#stage` y un `rotateY` de pocos
grados en cada panel.

```css
#stage        { perspective: 1600px; }
.pantalla     { transform-style: preserve-3d; }
.panel--izq   { transform: rotateY(3deg)  translateZ(20px); }
.panel--der   { transform: rotateY(-3deg) translateZ(20px); }
```

Por qué así y no con `clip-path` o imágenes:

- **Es un plano de verdad**, así que la perspectiva es coherente entre
  paneles y se puede animar: entrar girando, apartarse al abrir otro.
- **Sale de tokens** (`--persp`, `--tilt`), así que un tema puede tener sus
  menús más o menos inclinados. Una imagen sesgada no.
- Se combina con el bisel de `HUD.md` §4.6: el bisel es la SILUETA, la
  inclinación es la POSTURA. Dos cosas distintas que suman.

**Cuatro trampas de CSS 3D, que hay que saber antes:**

1. **El texto sobre un plano girado se ve blando.** Con pocos grados (2–4°)
   apenas se nota; a partir de 8° hay que rendirse o rasterizar más grande.
   Es la razón de que la inclinación sea sutil, no una decisión tímida.
2. **`backdrop-filter` y `transform: rotate3d` se llevan mal**: en varios
   navegadores el desenfoque se calcula antes del giro y el vidrio queda
   desalineado. Nuestros paneles usan `backdrop-filter`. Hay que probarlo
   pieza por pieza y, si falla, elegir: o vidrio o inclinación.
3. **Un `transform` en un ancestro rompe `position: fixed`** de los
   descendientes. Con el `#stage` ya escalado, esto ya pasa — hay que
   revisar TODO lo que hoy es `fixed` (la barra, los avisos, el diálogo).
   Es trabajo real, no un detalle.
4. **La perspectiva se mide desde el `#stage`**, que está escalado. El valor
   de `perspective` hay que darlo en unidades del lienzo, no de pantalla, o
   la inclinación cambia según el monitor.

> Con `prefers-reduced-motion`, la inclinación se queda quieta pero NO se
> quita: es composición, no movimiento.

---

# §2 · SELECCIÓN DE PERSONAJE

## 2.1 Qué hace bien la referencia

**Tres columnas, y cada una responde a una pregunta distinta:**

| Columna | Pregunta | Cómo |
|---|---|---|
| Izquierda | ¿A quién puedo elegir? | Rejilla de retratos 3×N *(la cambiamos por una tira de cartas, ver §2.1bis)* |
| Centro | ¿Cómo es? | El personaje en **3D, cuerpo entero**, iluminado |
| Derecha | ¿Qué sabe hacer? | Nombre enorme, nivel, barras y habilidades |

Y siete decisiones que copiaría:

1. **El personaje es el protagonista de la pantalla.** Grande, en 3D, de pie
   sobre una tarima, con el escenario real detrás desenfocado. No es una
   tarjeta: es él.
2. **Lo bloqueado SE VE**: silueta negra + candado. Sabes exactamente cuánto
   te falta por desbloquear. Una rejilla con huecos vacíos no motiva; una
   con siluetas, sí.
3. **La seleccionada tiene marco dorado** y sobresale un poco. Un solo
   acento, cero ambigüedad.
4. **Estadísticas como barras**: se comparan entre personajes de un vistazo,
   sin leer números.
5. **Habilidades con icono, título y descripción**, y las **palabras clave
   coloreadas** dentro del texto (verde lo que te da, rojo lo que te falta).
6. **Una habilidad bloqueada se muestra igual**, con el requisito en rojo
   («Requires Agent Lv.10»). Otra vez: enseñar lo que no tienes.
7. **Leyenda de mandos abajo**, como en la pausa.

## 2.1bis Las CARTAS — la segunda referencia

`seleccion-agentes.webp` resuelve mejor la parte que la otra deja floja: la
rejilla de retratos pequeños es funcional pero fría. Aquí las cartas son el
plato fuerte.

**La tira de abajo**, carta a carta:

- **Arte a sangre**: el personaje llena la carta hasta los bordes, sin
  márgenes ni marco interior. Nombre en mayúsculas abajo, sobre el arte.
- **La elegida lleva borde de acento** y —esto es lo importante— **el botón
  de acción DENTRO de la carta**: «LOCK IN» va en la propia carta, no en una
  barra aparte. Eliges y confirmas en el mismo sitio.
- **La bloqueada va en gris con candado** y la palabra «LOCKED» escrita en
  VERTICAL en el canto. Se lee como una carta que existe pero no es tuya.
- **La que ya cogió otro** lleva borde verde y el nombre de quien la tiene.

**Y el truco que más aporta: el personaje SE SALE DEL MARCO.** La coleta de
la agente sobresale por encima del borde superior del panel. Eso rompe la
caja y da profundidad de golpe — es lo que separa «una imagen dentro de un
recuadro» de «un personaje que está ahí delante».

Otras dos cosas de esta referencia:

- **El ROL va encima del nombre**, en pequeño y espaciado («DUELIST»). Lo
  tenemos: `role` en `modes.json` («Diseñador», «Diseñadora»).
- **Fila de iconos de habilidad + tooltip debajo**: cuatro iconos, el
  seleccionado con borde de acento, y el detalle en un panel bajo la fila.
  Más compacto que la lista de la otra referencia.

### Cómo lo montaría, juntando las dos

De `seleccion-escuadron` la ESTRUCTURA; de `seleccion-agentes` las CARTAS.

```
┌──────────────────────────────────────────────────────────┐
│                                    DISEÑADORA            │
│                                    GIULI                 │
│           ██ el personaje 3D,      ─────────────────     │
│           ██ cuerpo entero,        Aguante    ▓▓▓░░      │
│           ██ SALIÉNDOSE            Discreción ▓░░░░      │
│           ██ del marco             Coartada   ▓▓▓▓░      │
│                                                          │
│                                    ◆ FORTALEZAS          │
│                                    [ico][ico][ico]       │
│                                    ┌───────────────┐     │
│                                    │ el detalle    │     │
│                                    └───────────────┘     │
│  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐                    │
│  │FRAN││GIU ││KIA ││MANU││GABO││ ?  │  ← cartas a sangre │
│  │    ││FICHAR   ││ 🔒 ││ 🔒 ││🔒  │                     │
│  └────┘└────┘└────┘└────┘└────┘└────┘                    │
│   A Fichar    B Volver          X Ver fortalezas         │
└──────────────────────────────────────────────────────────┘
```

**Cambio respecto a lo que escribí antes:** la rejilla 3×N de la izquierda se
sustituye por **una tira horizontal de cartas abajo**, y el espacio de la
izquierda se lo queda el personaje. Con cinco personajes (y no veinte) una
tira cabe de sobra y se ve mucho mejor.

**El botón «FICHAR» va dentro de la carta elegida.** Eso choca con la regla
de `HUD.md` de «un primario por pantalla» — y creo que la regla gana matiz:
sigue habiendo UNO, solo que vive dentro de la carta en vez de en una barra.
Lo apunto para no descubrirlo al implementar.

## 2.2 El reencuadre: no es un selector, es TU EXPEDIENTE

Aquí es donde esto se vuelve nuestro y no una copia.

En la referencia eliges un agente de un escuadrón. En Modo Incógnito no eres
un escuadrón: eres **una persona con una ficha en Recursos Humanos**. Así
que la pantalla no es «elige personaje», es:

> **EXPEDIENTE DE PERSONAL**

Y con eso, cada pieza de la referencia tiene una traducción que además se ata
a `CAMPANA.md`:

| Referencia | Nosotros |
|---|---|
| Nombre + `LV. 6` | Nombre + **RANGO** (Aprendiz, Junior, Especialista…) |
| Barras de Range/Damage | **Competencias** evaluadas por RRHH |
| Habilidades | **Fortalezas** de tu evaluación |
| Habilidad bloqueada | «Requiere rango Especialista» |
| Personajes bloqueados | Compañeros que aún no conoces |
| Fondo del nivel | El Piso 10, desenfocado |

Es el mismo chiste de los Qués y los Cómos: el juego te evalúa con el
vocabulario que usa una empresa de verdad.

## 2.3 Las barras: de dónde salen

**Importante: dos de las tres ya existen como dato.** No hay que inventarse
estadísticas — están en `modes.json` y hoy solo se resumen en una frase.

| Competencia | Sale de | Hoy |
|---|---|---|
| **Aguante** | `rules.maxWarnings` | Fran 3 · Giuli 2 · Manu 2 |
| **Discreción** | `rules.minionSuspicionMul` (inverso) | Manu 0.5 · Fran 0.7 · Giuli 1.4 |
| **Coartada** | `rules.pretendAlways` | ⚠️ el campo **existe** pero nadie lo usa |

La tercera necesita que se le dé valor por personaje. Alternativas si no
convence: **Velocidad** (`bossSpeedMul`) o una nueva.

Nota de diseño: las barras deben leerse como **evaluación de desempeño**, no
como ficha de RPG. Etiquetas en jerga de RRHH — «Tolerancia a la presión»,
«Manejo de interlocutores»— dicen lo mismo y son el chiste.

## 2.4 Las fortalezas (habilidades)

Salen de las reglas especiales que ya existen:

- **Kiara · `explore: true`** — «Modo exploración: sin sospecha ni despido».
  Es literalmente una habilidad y hoy solo se menciona de pasada.
- **Fran · antigüedad** — aguanta una amonestación más.
- **Bloqueadas por rango**, atadas a la campaña: una fortaleza que se
  desbloquea al llegar a Especialista es un motivo real para seguir jugando.

## 2.5 Los bloqueados

Ya tenemos el dato: `playable: false` + `lockedReason` («Se desbloquea
jugando…», «Llega el próximo Q»). Hoy se muestran atenuados; con la
referencia pasan a **silueta negra con candado**, que comunica mucho mejor.

## 2.6 Qué muere

**La pantalla de login estilo sistema operativo** —el muelle de avatares
redondos con «Iniciar sesión»— se retira entera. Fue una buena idea con la
piel de «terminal de mentira», pero:

- No enseña al personaje: un círculo de 48 px no es un protagonista.
- No hay sitio para competencias ni fortalezas.
- No admite bloqueados con gracia.

**Lo que se aprovecha:** `charshot.js` (las fotos) sirve para la **rejilla**
de la izquierda, y `portrait3d.js` para el **héroe 3D** del centro. Las dos
piezas existen; cambia el montaje.

---

# §3 · Las demás pantallas

Esbozos, para ir llenando.

## 3.1 Pausa
Ver `HUD.md` §4.5 — pestañas, acento único, leyenda de mandos, el juego
visible detrás.

## 3.2 Evaluación de fin de día — ✅ **construida**
La calificación AAA/AA/A/B/C con los dos ejes (Qués y Cómos) por separado.
Debería parecer **una evaluación de desempeño real**: la nota, el gráfico de
los dos ejes, y un comentario del evaluador con el tono pasivo-agresivo de
una de verdad.

Vive en `src/ui/review.js`, y sale ANTES del panel de resultado. Lo que la
hace funcionar es que **los dos ejes se ven a la vez**: OBJETIVOS al 4/4 con
la barra llena y COMPETENCIAS al 1/2 a media asta, y debajo un comentario que
te felicita mientras te hunde. En una línea de texto —que es como estaba— eso
no se leía.

Dos detalles que importan más de lo que parecen:
- **Las notas malas no se pintan de rojo**, sino apagadas. Un rojo de alarma
  diría «te pasó algo grave»; lo que pasó es peor: nadie se alteró.
- **El comentario rota** entre varios por nota. Vas a ver esta pantalla
  veinticinco veces y la misma frase cinco días seguidos mata el chiste.

Lo vigila `npm run check:review`.

## 3.2bis Plan de nivelación *(CAMPANA §5.1)* — ✅ **construido**
`src/ui/levelling.js`. El papeleo entre prueba y prueba, y las pruebas salen
del registro de minijuegos por id desde el JSON de la temporada. Sobrio a
propósito: si se viera celebratorio, suspender empezaría a salir a cuenta.

## 3.3 Curso de RRHH *(nueva, `CAMPANA.md` §7.2)* — ✅ **construida**
El vídeo y el botón de saltar que huye. Pantalla completa, sin HUD.

Vive en `src/ui/hrCourse.js`. Cómo quedó:
- El "vídeo" es un **canvas procedural**, cero archivos — como todo el audio.
  Frases de cumplimiento corporativo que van rotando.
- La barra de progreso avanza al **70% de la velocidad real**: el chiste del
  reproductor que no adelanta. Aguantarla entera también libera.
- El botón de saltar **pasea solo** la primera visita; desde la segunda,
  además **huye del cursor**. Cazarlo `min(3 + reincidencias, 6)` veces
  termina el curso.
- **Siempre se puede terminar.** Es un peaje, no otra derrota. Y siempre
  dentro de la tarjeta: inalcanzable no es gracioso.
- Cierra con un certificado: «Válido hasta tu próxima amonestación».

## 3.4 Ascenso / jubilación *(nueva)*
El momento de recompensa de cada temporada. Es el único sitio donde el juego
puede ser sincero un segundo.

---

# §4 · Preguntas para ti

**El lienzo**
- [x] ~~¿1920×1080 o 1600×900?~~ → **1920×1080** ✅
- [x] ~~La cortina de «gira el teléfono»: ¿con chiste de empresa o seca?~~ →
      **con chiste**: «ROTACIÓN DE PERSONAL EN CURSO / Gira el teléfono: el
      Piso 10 solo atiende en horizontal». Cambiarlo es una línea de
      `src/ui/stage.js`.
- [ ] ¿Empujamos la instalación como PWA desde el menú?

**Menús 3D**
- [ ] ¿Cuántos grados de inclinación? Propongo 3°, que es donde el texto
      aguanta nítido.
- [ ] Si `backdrop-filter` y la inclinación no se llevan bien: ¿vidrio o
      inclinación?

**Selección de personaje**
- [ ] ¿Tira de cartas abajo (mi propuesta) o rejilla lateral?
- [ ] ¿El personaje se sale del marco? Es el detalle que más aporta y el que
      más puede pelearse con el recorte del panel.
- [ ] ¿El reencuadre «Expediente de personal» te convence?
- [ ] La tercera barra: ¿**Coartada** (`pretendAlways`), **Velocidad**, u otra?
- [ ] ¿Etiquetas en jerga de RRHH o nombres directos (Sigilo, Aguante)?
- [ ] ¿El rango de la campaña sale aquí, o la pantalla es solo del personaje?

---

# §5 · Plan por fases

El lienzo va primero **porque todo lo demás se construye encima**; hacerlo
después obligaría a rehacer cada pantalla.

1. ✅ **`#stage` y la escala** + arreglar coordenadas de puntero.
2. ✅ **Cortina de orientación** + pantalla completa. (La PWA ya declaraba
   `orientation: landscape` en el manifest; empujar la instalación desde el
   menú sigue sin hacerse.)
3. ✅ **Limpiar** las media queries de tamaño: se fueron 14. Las que quedan
   son de `creador/` y de `prefers-reduced-motion`, que no son de tamaño.
4. ✅ **`check:layout` nuevo** (§1.7): 5 relaciones de aspecto, coordenadas de
   lienzo, clic en las esquinas y cortina en vertical.
5. ◻︎ **Menús 3D** con las tres columnas. La `perspective` ya está puesta en
   `#app`; falta que algún panel la use.
6. ◻︎ Las pantallas de `CAMPANA.md` — de las tres, **RRHH está hecha**
   (`src/ui/hrCourse.js`); faltan evaluación y ascenso.

Del 1 al 4 no cambiaba nada visible: era infraestructura. Se hizo de una
tacada y la suite entera de `tools/` se corrió antes de seguir, que es lo que
cazó que media suite daba por hecho el modelo de día anterior.

---

# §6 · Notas sueltas

```
(escribe aquí)
```
