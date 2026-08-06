# El HUD — conceptualización

**Estado: NADA DE ESTO ESTÁ IMPLEMENTADO.** Es el documento para pensarlo
antes de tocar código. Sirve igual que `MOTOR.md`: escribe encima, tacha,
contesta las preguntas del final, y lo que quede aprobado se construye.

> **Falta meter las capturas de referencia en `docs/referencias/hud/`.** Están
> en el chat pero no en el repo, y sin ellas este documento se queda cojo
> dentro de tres semanas.

---

## 1. Qué hace bien la referencia

Desmontada en piezas, no "se ve bonito".

### 1.1 El HUD de partida

| Esquina | Qué hay | Por qué funciona |
|---|---|---|
| Sup. izq. | Retrato + vida + energía, **fundidos en una sola pieza** | Es UN objeto, no tres tarjetas. El ojo lo lee como "yo" |
| Sup. der. | Moneda: icono + cifra | Lo secundario ocupa lo mínimo |
| Inf. izq. | Botón (`Y`) + icono de habilidad | Contextual: dice qué puedes hacer AHORA |
| Inf. der. | Nombre de zona, texto pelado | Transitorio, sin caja, se va solo |
| **Centro** | **Nada** | Todo el escenario libre |

Lo que más me interesa de ahí:

**a) El cluster fundido.** Retrato, vida y energía comparten cuerpo: el
retrato está DENTRO de la barra, no al lado. Cero márgenes internos. Eso es
lo que hace que se lea como una placa de identidad y no como un panel.

**b) La vida es DISCRETA, no continua.** Rombos que se apagan de uno en uno.
Se cuenta de un vistazo periférico — «me quedan dos» — sin leer un número ni
estimar un porcentaje. Una barra continua obliga a comparar longitudes.

**c) Geometría sesgada y borde roto.** Todo son paralelogramos con el filo
deshecho a pincel. Ni un rectángulo recto, ni un radio redondo. Eso es TODA
la personalidad: la misma información en cajas rectas se vuelve un formulario.

**d) Jerarquía por tamaño, no por caja.** El nombre de zona es enorme y no
lleva fondo. La moneda es diminuta. Nada compite.

### 1.2 El menú de pausa

- **Pestañas arriba** (Inventario / Habilidades / Sistema) con los gatillos
  `LB`/`RB` dibujados a los lados. Se entiende que se cambia con el hombro
  sin explicarlo.
- La pestaña activa es la ÚNICA en color, y le sale una **colita** hacia
  abajo que la ata al contenido. Ese pico es lo que dice "esto de abajo
  pertenece a esto de arriba".
- **Un solo acento** (cian) para todo lo seleccionado. Lo no elegido es negro.
  Cero ambigüedad sobre dónde estás.
- **Leyenda de botones abajo**: `Y` borrar · `A` confirmar · `B` volver, con
  los glifos en su color de mando.
- **El fondo sigue siendo el juego**, oscurecido pero legible. No hay
  desenfoque que lo convierta en puré: conservas dónde estabas.
- Título con adorno (las ondas junto a «PAUSED»). Detalle gratuito que hace
  que la pantalla se sienta *hecha*.

---

## 2. Lo que tenemos hoy

Honestamente, para comparar:

| Pieza | Hoy | Comentario |
|---|---|---|
| Estado | Barra de menú tipo macOS arriba del todo | Fina, permanente, con menulets |
| Reloj | Widget de vidrio colgando del centro | Es lo más "de juego" que tenemos |
| Tareas / Presión | Menulets que abren un panel | Requieren ABRIR para ver el detalle |
| Objetivo activo | Tarjeta abajo a la derecha + flecha | Funciona |
| Acción | Botón redondo «USAR / FINGIR» | Táctil |
| Zona | (nada) | La referencia sí lo tiene y se echa en falta |
| Pausa | Lista de botones sobre velo | Sin pestañas, sin leyenda de mandos |

**El diagnóstico:** nuestro HUD está *ordenado* pero es **plano de
información**. Todo son etiquetas y porcentajes en una barra de sistema. La
referencia convierte cada dato en un OBJETO con forma propia.

---

## 3. La tensión de verdad, y mi recomendación

Aquí hay una decisión que no puedo tomar por ti.

`CLAUDE.md` dice, con razón de lore: *«la interfaz es un terminal de mentira…
Modo Incógnito es la coartada del equipo y tiene que parecer la herramienta
en la que fingen trabajar»*. La referencia es **lo contrario**: un HUD que se
declara videojuego sin disimulo, pintado a mano.

Copiarla entera **contradice el porqué de nuestra estética**. Y no copiarla
deja el HUD donde está, que es lo que no te convence.

**Lo que recomiendo: quedarnos con su GRAMÁTICA, no con su piel.**

- De la referencia: la **estructura** (clusters en esquinas, centro libre),
  el **lenguaje de formas** (losa sesgada), la **información discreta**
  (pips en vez de porcentajes), las **pestañas con acento único**, la
  **leyenda de mandos**.
- De lo nuestro: los materiales. Marino, fósforo, mono, filo fino. Donde la
  referencia pone borde roto a pincel, nosotros ponemos **esquina cortada en
  bisel** — que ya existe en el proyecto (`--cut`, el `clip-path` de los
  paneles) y dice "consola", no "acuarela".

Así el HUD gana carácter de juego **sin** romper la coartada, y —lo que más
me importa— **sigue saliendo de los tokens**, así que un cambio de tema lo
sigue re-tintando entero. Si adoptamos la piel pintada, la arquitectura de
temas que acabamos de montar se queda sin sentido.

> Si prefieres irte a la piel pintada del todo, se puede: sería **un tema
> nuevo** en la capa 1, no un parche. Pero entonces hay que decidir qué pasa
> con el lore.

---

## 4. Traducción, pieza por pieza

Propuestas concretas. Ninguna implementada.

### 4.1 La placa de identidad (sup. izq.) — **la pieza nueva grande**

Hoy no existe: la jugadora no se ve a sí misma en pantalla.

```
┌────────────────────────────────────┐
│ ╱‾‾‾‾╲                             │
│ │retra│  ◆ ◆ ◆ ◇   ← amonestaciones │
│ ╲____╱  ▓▓▓▓▓▓░░░  ← presión        │
└────────────────────────────────────┘
```

- **Retrato: VIVO, y solo la CARA** ✅ *decidido*. No de busto: encuadre
  cerrado a la cabeza, como en la referencia. Sale de `portrait3d.js`, que ya
  monta el `Character3D` real dentro de la interfaz — hay que darle un
  encuadre nuevo (más cerca, centrado en el hueso de la cabeza) y dejarlo
  dibujando siempre, no solo con el diálogo abierto.
  **Coste a vigilar:** hoy ese lienzo solo corre mientras hay diálogo. Uno
  permanente es un render extra por frame durante toda la partida. Se mide
  antes de darlo por bueno; si pesa, se baja su resolución o se dibuja a
  media tasa — pero NO se cambia por una foto, porque el gesto reactivo es
  justo lo que se quiere.
- **Los rombos son las AMONESTACIONES**, no vida. Es nuestro equivalente
  exacto: recurso discreto, pocas unidades, se pierden de una en una y
  al agotarse te despiden. Encaja como un guante.
- **La barra de debajo es la PRESIÓN** (sospecha). Continua porque sube y
  baja constantemente; un pip que parpadea sería ruido.
- El retrato **reacciona**: sereno / de reojo / pánico según la presión. Es
  el gesto que más carácter da por menos trabajo — ya tenemos expresiones.

### 4.2 El reloj

Es nuestro recurso principal, así que **se queda en el centro** y grande.
Ya está resuelto y es lo mejor que tenemos; no lo tocaría salvo para
alinearlo con el bisel del resto.

### 4.3 Nombre de zona (inf. der.)

**Lo copiaría tal cual**: texto grande, sin caja, al entrar en una zona
nueva, y se va solo en 2 s. Tenemos las zonas definidas en `piso7.json` y
hoy esa información se desperdicia. Es barato y da muchísimo sitio.

### 4.4 Prompt de acción (inf. izq.)

Hoy tenemos el botón táctil. Falta el equivalente de teclado: **glifo de
tecla + icono de lo que hace**, contextual. La referencia lo pone abajo a la
izquierda y ahí es donde no estorba.

### 4.5 Menú de pausa

Aquí la referencia nos gana claramente:

- **Pestañas** (hoy: Ajustes / Cómo se juega / Días están en pantallas
  sueltas). Con `Q`/`E` o los gatillos.
- **Colita** de la pestaña activa hacia el contenido.
- **Leyenda de mandos abajo**, que además resuelve algo real: hoy los atajos
  (`Q`, `V`, `M`, `Esc`) solo están en la píldora de bienvenida, que se apaga.
- **El fondo sigue siendo el piso**, oscurecido. Ya lo hacemos así en pausa
  (el scrim sólido es solo antes de que haya partida) — eso ya está bien.

### 4.6 Lenguaje de formas: el bisel

Una sola regla nueva que afectaría a todo:

> Las losas de HUD llevan **una esquina cortada en diagonal**, siempre la
> misma (sup. der. e inf. izq.), tamaño `--cut`. Ni radio, ni recta.

Es lo que la referencia consigue con el sesgo, y ya tenemos la pieza. Sale de
un token, así que se ajusta en un sitio.

---

## 4bis. Las tareas — la segunda referencia

> Captura pendiente en `docs/referencias/hud/tareas.png`.

Esta es la que más nos sirve, porque ataca **el punto flojo que ya tenemos
identificado**: hoy las tareas viven en un menulet que hay que ABRIR, y en
una tarjeta abajo que solo enseña UNA. La referencia enseña la lista entera,
siempre, sin ocupar apenas.

### 4bis.1 Cómo está montada

```
 Alt + 1
 MAIN QUEST                         50m    ◈
 Quest desc quest desc            13 / 200

 ─────────────────────────────────────────

 Alt + 2
 SUB QUEST 1                        50m    ◇
 Quest desc quest desc            13 / 200
```

Siete decisiones, todas robables:

1. **No hay cajas.** Filas separadas por una línea fina. Una lista de tres
   tarjetas con borde pesaría el triple en pantalla y taparía el escenario.
2. **Atajo por tarea** (`Alt + 1`, `Alt + 2`…) en micro-texto encima del
   título. No es decoración: **cambias la tarea seguida sin abrir nada**.
3. **Rejilla de dos líneas** fija: arriba título + métrica grande, abajo
   descripción + progreso. Todas las filas iguales, el ojo aprende el sitio
   de cada dato una vez.
4. **El color dice la categoría**: principal en dorado, secundarias en azul.
   Sin etiquetas del tipo «(opcional)».
5. **Números alineados a la derecha** en columna: distancia sobre progreso.
   Se comparan de un vistazo entre filas.
6. **Insignia a la derecha**, con forma distinta por categoría — la principal
   más ornamentada. Refuerza la jerarquía sin repetir el color.
7. **La fila activa lleva un lavado** de fondo que se desvanece hacia la
   derecha. No cambia el color del texto ni pone borde: solo se ilumina.

### 4bis.2 Cómo se traduce a Modo Incógnito

Encaja casi sin forzar, porque ya tenemos todos los datos:

| Referencia | Nosotros | ¿Existe ya? |
|---|---|---|
| MAIN QUEST | La tarea obligatoria del día | sí, `objectives` |
| SUB QUEST | Café, película, comer | sí |
| `50m` | Distancia a la estación | sí, la pinta el rastreador |
| `13 / 200` | Progreso de la actividad | sí, `progress` / `time` |
| `Alt + 1` | Teclas `1` `2` `3` para seguir esa tarea | **no** — habría que añadirlo |
| Insignia ◈ | **Nuestra MEDALLA**, la misma del piso | sí, `beacons.js` |

Ese último punto es el que más me gusta: **la lista y el piso hablarían el
mismo idioma**. La medalla ámbar que ves flotando sobre la cafetera es el
mismo icono que sale en su fila de la lista. Uno dice *dónde*, el otro dice
*qué y cuánto falta*. Hoy son dos sistemas sin relación.

### 4bis.3 Dónde va, y la pega

La referencia la pone arriba a la izquierda. **Ahí no nos cabe**: es justo
donde propuse la placa de identidad (§4.1), y son las dos piezas más densas.

Opciones:

- **A · Placa arriba-izq, tareas arriba-der.** Simétrico. La moneda/contador
  se va abajo. Es lo que haría.
- **B · Placa arriba-izq, tareas debajo de ella**, en la misma columna. Se
  lee como un bloque de "mi estado + mis pendientes", pero es mucha carga en
  una esquina.
- **C · Tareas arriba-izq y la placa se queda pequeña** dentro de la barra.

**La pega de verdad, y hay que decirla:** esto es TEXTO, y el principio que
seguimos al meter las medallas fue *«no obligar a leer con el jefe detrás»*.
Una lista de tres filas con descripción es exactamente eso.

Mi propuesta para resolverlo — y creo que además mejora el juego:

> **La lista se REPLIEGA cuando sube la presión.** Con el medidor tranquilo
> se ve entera (título + descripción + progreso). Al entrar en alerta se
> queda solo en títulos y distancia; en persecución, solo la tarea seguida.
> Cuanto más apreta el juego, menos hay que leer.

No es un adorno: convierte el HUD en parte del bucle de tensión, que es lo
que dice `CLAUDE.md` que tiene que pasar con todo.

### 4bis.4 Qué NO copiaría de aquí

- **La descripción por tarea.** Nuestras tareas son «Café con Gabo», no una
  cadena de misiones: la descripción sería relleno. Fila de UNA línea, y la
  segunda solo para la barra de progreso cuando está en curso.
- **El dorado ornamental** de la principal. El color sale de `--warn` /
  `--accent`, o el tema deja de mandar.

---

## 5. Lo que NO copiaría

- **El borde roto a pincel.** Es precioso y es de otro juego. Con nuestros
  tipos mono y el marino de tubo, quedaría disfraz.
- **Los rombos para la vida en degradado rosa.** El color de estado tiene que
  salir de `--danger` / `--warn` / `--ok`, o el tema deja de mandar.
- **El desenfoque fuerte de fondo**, si algún día se plantea: perder de vista
  el piso en pausa quita contexto justo cuando lo necesitas.

---

## 6. Preguntas para ti

Contéstalas aquí y con eso hago el plan de implementación.

**Estética**
- [ ] ¿Gramática de la referencia + piel terminal (mi recomendación), o piel
      pintada entera como tema nuevo?
- [ ] El bisel en esquina: ¿en todo el HUD, o solo en las piezas nuevas?

**La placa de identidad**
- [ ] ¿Rombos = amonestaciones? ¿O prefieres que sean otra cosa?
- [ ] ¿Sustituye a los menulets de la barra, o convive con ellos?

**La barra de menú** — ✅ *decidido: SE VA*
La barra tipo macOS **desaparece**. Eran dos sistemas de estado a la vez, y
el equipo creativo va por otro camino. Lo que llevaba se reparte:
- Presión y amonestaciones → a la **placa** (§4.1).
- Reloj → se queda, pero suelto en el centro, sin barra de la que colgar.
- Sonido y pausa → a la **pausa** y a su leyenda de mandos (§4.5).
- Tareas → a la **lista** (§4bis).
**Ojo al retirarla:** `hud.attachMenuBar` es hoy quien alimenta la barra con
el snapshot por frame, y las microinteracciones del bucle (`.mi-shake`,
`.mi-critical`, el tic del reloj) se disparan desde `menubar.js`. Al quitarla
hay que mudar esos disparos a las piezas nuevas o el feedback desaparece con
ella.

**Tareas (§4bis)**
- [ ] ¿Colocación A, B o C?
- [ ] ¿Te convence que la lista se repliegue al subir la presión?
- [ ] ¿Teclas `1`/`2`/`3` para cambiar de tarea seguida?
- [ ] ¿Fila de una línea (mi propuesta) o dos como la referencia?
- [ ] Si entra la lista, **¿sobra la tarjeta de «Tarea actual» de abajo?**

**Pausa**
- [ ] ¿Qué pestañas? Propongo: Tareas · Personaje · Sistema.
- [ ] ¿Leyenda de mandos siempre visible, o solo en menús?

---

## 7. Plan por fases (cuando esté aprobado)

Ordenado por relación valor/riesgo:

1. **Nombre de zona** — aislado, cero riesgo, se nota mucho.
2. **Bisel como token** — una regla, re-tinta todo el HUD.
3. **Lista de tareas** (§4bis) — es lo que más gana el juego: hoy hay que
   abrir un panel para saber qué te queda. Y reutiliza los iconos de las
   medallas, así que ata el HUD con el piso.
4. **Placa de identidad** — la pieza gorda. Con foto primero.
5. **Repliegue por presión** — solo tiene sentido con 3 y 4 puestas.
6. **Prompt de acción contextual**.
7. **Pausa con pestañas y leyenda**.
8. **Decidir el destino de la barra** — la última, porque depende de cómo
   sienten la placa y la lista una vez puestas.

Cada fase con `check:layout` en los seis tamaños y `check:theme`, que la
placa nueva no se ancle a un color.

---

## 8. Notas sueltas

```
(escribe aquí lo que se te ocurra)
```
