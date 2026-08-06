# Las pantallas y el lienzo

**Estado: DISEÑO. Nada implementado.** Guía para desarrollarlo, como
`MOTOR.md` (reglas), `CAMPANA.md` (progresión) y `HUD.md` (interfaz de
partida). Aquí va todo lo que NO es la partida: el lienzo sobre el que se
dibuja todo, y las pantallas de menú.

> Referencia pendiente de subir a `docs/referencias/pantallas/`:
> `seleccion-personaje.jpg`.

---

# §1 · EL LIENZO FIJO

Es la decisión más profunda de este documento, porque cambia **cómo se
construye todo lo demás**.

## 1.1 La decisión

> **El juego se dibuja siempre sobre un lienzo de 1920×1080, apaisado, y ese
> lienzo se ESCALA entero para caber en la pantalla. Con bandas negras si
> hace falta.**

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

---

# §2 · SELECCIÓN DE PERSONAJE

## 2.1 Qué hace bien la referencia

**Tres columnas, y cada una responde a una pregunta distinta:**

| Columna | Pregunta | Cómo |
|---|---|---|
| Izquierda | ¿A quién puedo elegir? | Rejilla de retratos 3×N |
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

## 3.2 Evaluación de fin de día *(nueva, la pide `CAMPANA.md`)*
La calificación AAA/AA/A/B/C con los dos ejes (Qués y Cómos) por separado.
Debería parecer **una evaluación de desempeño real**: la nota, el gráfico de
los dos ejes, y un comentario del evaluador con el tono pasivo-agresivo de
una de verdad.

## 3.3 Curso de RRHH *(nueva, `CAMPANA.md` §7.2)*
El vídeo y el botón de saltar que huye. Pantalla completa, sin HUD.

## 3.4 Ascenso / jubilación *(nueva)*
El momento de recompensa de cada temporada. Es el único sitio donde el juego
puede ser sincero un segundo.

---

# §4 · Preguntas para ti

**El lienzo**
- [ ] ¿1920×1080 como resolución de diseño, o prefieres 1600×900?
- [ ] La cortina de «gira el teléfono»: ¿con chiste de empresa o seca?
- [ ] ¿Empujamos la instalación como PWA desde el menú?

**Selección de personaje**
- [ ] ¿El reencuadre «Expediente de personal» te convence?
- [ ] La tercera barra: ¿**Coartada** (`pretendAlways`), **Velocidad**, u otra?
- [ ] ¿Etiquetas en jerga de RRHH o nombres directos (Sigilo, Aguante)?
- [ ] ¿El rango de la campaña sale aquí, o la pantalla es solo del personaje?

---

# §5 · Plan por fases

El lienzo va primero **porque todo lo demás se construye encima**; hacerlo
después obligaría a rehacer cada pantalla.

1. **`#stage` y la escala** + arreglar coordenadas de puntero.
2. **Cortina de orientación** + pantalla completa + PWA.
3. **Limpiar** las 19 media queries (cuidado con las de `creador/`).
4. **`check:layout` nuevo** (§1.7).
5. **Selección de personaje** con las tres columnas.
6. Las pantallas de `CAMPANA.md` (evaluación, RRHH, ascenso).

Del 1 al 4 no cambia nada visible: es infraestructura. Conviene hacerlo de
una tacada y verificar que el juego sigue igual antes de seguir.

---

# §6 · Notas sueltas

```
(escribe aquí)
```
