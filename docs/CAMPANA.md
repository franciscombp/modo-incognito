# La campaña — temporadas, misiones y carrera

**Estado: EL ESQUELETO ESTÁ CONSTRUIDO Y LA TEMPORADA 1 SE JUEGA.** Es la
guía para desarrollarlo y pulirlo, igual que [`MOTOR.md`](MOTOR.md) (reglas
del motor), [`HUD.md`](HUD.md) (interfaz de partida) y
[`PANTALLAS.md`](PANTALLAS.md) (el lienzo y las pantallas de menú). Escribe
encima, tacha, contesta las preguntas.

| Sección | Estado | Dónde vive |
|---|---|---|
| §3.1 Cadena de misiones (con holgura: TODAS las elegibles a la vez) | ✅ | `src/game/campaign.js` → `startDay()` / `complete()` |
| §3.2 Qués y Cómos | ✅ | campo `tipo` en el JSON; el HUD los pinta ámbar / cian |
| §3.3 Recurrencia `unica` / `diaria` | ✅ | `campaign.js`; `por-temporada` sigue sin existir |
| §3.4 Forma del dato | ✅ | `public/data/campaign/temporada-1.json` (tal cual la propuesta) |
| §5.2 Calificación AAA/AA/A/B/C/Nivelación | ✅ | `campaign.js` → `endDay()`; la nota sale en el panel de resultado |
| §7.2 Tres amonestaciones → RRHH | ✅ | `src/ui/hrCourse.js`, enganchado en `engine.js` → `finishDay` |
| §9 Guardado por progreso de TAREAS | ✅ | una `unica` se persiste en el ACTO, no al cerrar el día |
| §5.1 Salto de temporada con AAA | ✅ lógica | no hay temporadas 2–5 que escribir todavía |
| §6 Rangos y jubilación | ◻︎ parcial | El rango y el ascenso ya salen en la evaluación; falta la temporada 5 y el final (es CONTENIDO: hay que escribir las temporadas 2–5) |
| §8 Plan de nivelación | ✅ | `src/ui/levelling.js`; la tanda sale de `nivelacion.pruebas` en el JSON de la temporada |
| Pantalla de evaluación (PANTALLAS §3) | ✅ | `src/ui/review.js`: los dos ejes por separado, con barra y comentario del evaluador |

> ⚠️ **Esto reemplaza el modelo de juego actual.** El día 1 era una jornada
> suelta con tres actividades libres; ahora esas tres actividades son
> misiones de la temporada 1 y llegan encadenadas. `levels/dia-1.json` sigue
> mandando en el guion, el reloj y el jefe: la campaña solo decide **qué se
> te pide**. Si `public/data/campaign/` no trae temporada, el juego cae al
> modelo viejo sin romperse.

---

## 1. La idea en una frase

> **Sobrevivir veinticinco años en la misma empresa fingiendo que trabajas,
> hasta jubilarte.**

El chiste de fondo: el juego mide tu carrera con **el vocabulario real de
Recursos Humanos** — objetivos, competencias, calificación de desempeño,
planes de nivelación, ascensos por antigüedad. Todo lo que en una oficina
suena a proceso serio, aquí es literalmente la mecánica.

---

## 2. La estructura

```
CARRERA (25 años)
└── TEMPORADA ×5  (un lustro cada una · un rango)
    └── DÍA ×5    (una jornada · el bucle de sigilo de siempre)
        └── MISIÓN ×N  (encadenadas, no sueltas)
```

| Capa | Qué es | Cuántas |
|---|---|---|
| Carrera | La partida entera. Objetivo: jubilarte | 1 |
| Temporada | Un lustro en la empresa. Un rango | 5 |
| Día | Una jornada de 9:00 a 19:00 | 5 por temporada |
| Misión | Una tarea concreta | N por temporada |

---

## 3. Las misiones

### 3.1 Ya no son libres: van ENCADENADAS

El cambio grande. Hoy el día te suelta con tres actividades y tú eliges; el
resultado es que **te pierdes**. Ahora hay un hilo:

```
1. Preséntate con Gabo                    (cómo)
        ↓ al terminar se activa
2. Aprende a fingir que trabajas          (qué)
        ↓
3. Fran tiene un chisme para ti           (cómo)   ← al otro lado del edificio
        ↓
4. …
```

Cada misión **desbloquea la siguiente**. Siempre sabes qué toca, y la
distancia entre una y otra es lo que te obliga a cruzar el piso —que es
donde vive el juego de sigilo.

> **Lo que hay que cuidar, y es lo único que me preocupa de este cambio:** una
> cadena estricta convierte el piso en un pasillo. El bucle (esquivar al jefe,
> fingir, esconderse) vive de que haya ELECCIÓN de ruta y de momento. La
> cadena debe decir **QUÉ** hacer, nunca **CÓMO ni CUÁNDO** llegar.
> Recomendación: **2–3 misiones activas a la vez**, no una. Sigues teniendo
> hilo, pero eliges a cuál vas primero según dónde esté el jefe. Ver §12.

### 3.2 Los Qués y los Cómos

La clasificación es el chiste central, y es exactamente cómo evalúa RRHH:

| Tipo | Qué es | En el juego | Ejemplos |
|---|---|---|---|
| **QUÉ** | El resultado. Lo que lograste | Cosas que haces **sola** | Tomar café · Calentar la comida · Fingir que trabajas · Cruzar la avenida |
| **CÓMO** | La competencia. La forma en que lo lograste | Cosas que exigen **otro personaje** | Chismear con Fran · Presentarte con Gabo · Aguantar a Crispo · Que Steven te cubra |

Por qué funciona como sátira: en una evaluación real te dicen *«cumpliste los
qués pero tenemos que trabajar los cómos»* — o sea, hiciste el trabajo pero
caes mal. Aquí es literal: puedes acabar todas tus tareas y aun así fallar la
temporada por no haber hablado con nadie.

**Consecuencia de diseño:** la calificación debería mirar los dos ejes por
separado. Ver §5.2.

### 3.3 Recurrencia: lo que vuelve y lo que no

| Recurrencia | Qué significa | Ejemplos |
|---|---|---|
| `diaria` | Reaparece cada día. Es la rutina | Tomar café · Comer · Fichar |
| `unica` | Se hace una vez en toda la carrera | Chismear con Fran sobre X · Presentarte con Gabo |

Es lo que hace que un día 3 se sienta distinto de un día 1: la rutina se
repite, la historia no. **La rutina es el suelo, las únicas son el avance.**

> 📌 **Tercera opción a considerar:** `por-temporada` — se repite cada
> temporada pero no cada día (ej. «la evaluación de desempeño»). ¿Hace falta?

### 3.4 Forma del dato (propuesta)

```jsonc
{
  "id": "chisme-fran",
  "tipo": "como",              // "que" | "como"
  "titulo": "Fran tiene un chisme",
  "recurrencia": "unica",      // "unica" | "diaria"
  "requiere": ["fingir-101"],  // ids que deben estar hechos antes
  "personaje": "fran",         // solo en los "cómo"
  "lugar": "portales",         // zona o estación de scenes/piso7.json
  "icono": "chat",             // el MISMO icono de la medalla del piso
  "tiempo": 8,                 // lo que TARDA
  "recompensa": { "reloj": 30 }
}
```

Nota: `icono` ata la misión con su medalla flotante en el piso y con su fila
en la lista del HUD. Un solo icono, tres sitios (ver `HUD.md` §4bis.2).

---

## 4. El día

Sin cambios respecto a `MOTOR.md`: jornada de 9:00 a 19:00, sospecha,
jefe, lugares seguros, escondites. **El bucle de sigilo se queda tal cual.**

Lo que cambia es qué te piden dentro.

---

## 5. La temporada

### 5.1 Cinco días, o uno

```
                  ┌── TODO en el día 1 ──→ AAA · Alto desempeño
TEMPORADA ────────┤                        ↳ saltas directo a la siguiente
                  │                          temporada, ascendida
                  └── no ──→ días 2,3,4,5 ──→ ¿completaste?
                                              ├── sí → ascenso POR ANTIGÜEDAD
                                              └── no → PLAN DE NIVELACIÓN
```

- **Todas las misiones en el día 1** → calificación **AAA**, «alto
  desempeño», y saltas la temporada entera. Es el modo experto y el que
  premia jugar bien.
- **Si no**, sigues jugando días hasta completarlas. Al terminar te ascienden
  igual, pero **por antigüedad** — *«porque no había nadie más que hubiera
  durado tanto»*. Mismo rango, cero gloria.
- **Si acaban los 5 días sin completar** → **plan de nivelación**: una tanda
  de minijuegos. Es la red de seguridad; no se pierde la partida.

### 5.2 La calificación

Propuesta, para que el AAA no sea binario:

| Nota | Cómo se saca |
|---|---|
| **AAA** | Todos los Qués **y** todos los Cómos, en el día 1 |
| **AA** | Todo, en 2–3 días |
| **A** | Todo, en 4–5 días (el ascenso por antigüedad) |
| **B** | Solo los Qués — cumpliste pero no hablas con nadie |
| **C** | Solo los Cómos — muy simpática, cero trabajo |
| **Nivelación** | Ni una cosa ni la otra |

Las notas B y C son donde el chiste de RRHH aterriza: la evaluación te
señala exactamente el eje que descuidaste.

> 📌 ¿Te cuadran las letras, o prefieres solo AAA / normal / nivelación?

---

## 6. La carrera: cinco temporadas

| # | Años | Empiezas como | Al terminar |
|---|---|---|---|
| 1 | 1–5 | Aprendiz | Junior |
| 2 | 6–10 | Junior | Especialista |
| 3 | 11–15 | Especialista | Senior |
| 4 | 16–20 | Senior | Coordinador |
| 5 | 21–25 | Octogenaria | **Jubilación** |

> Los nombres de rango son propuesta — cámbialos por los que suenen a la
> empresa real (sin identificarla, ver la nota de lore de `CLAUDE.md`).

**La última temporada es distinta:** ya no hay ascenso que ganar. Solo
**sobrevivir** hasta la jubilación. Sugerencia de diseño: en la temporada 5
las misiones bajan y lo que sube es la presión — el jefe es más agresivo, el
cuerpo aguanta menos, y lo único que se pide es aguantar los cinco días.
Cierra el arco: empezaste esquivando trabajo por diversión y acabas
esquivándolo por supervivencia.

> **Sobre la edad:** que empieces de aprendiz y acabes octogenaria en 25 años
> no cuadra, y **está bien que no cuadre** — la broma es que la empresa te
> envejece más rápido que el calendario. Yo lo dejaría explícito en algún
> diálogo en vez de arreglar la aritmética.

---

## 7. Las amonestaciones y RRHH

### 7.1 Tres strikes

A la **tercera amonestación** pierdes el progreso y te mandan a Recursos
Humanos.

> ⚠️ **Esto hay que acotarlo antes de construirlo.** «Todo tu progreso» puede
> significar tres cosas muy distintas, y una de ellas hace el juego
> injugable:
>
> | Alcance | Qué se pierde | Veredicto |
> |---|---|---|
> | El día | Las misiones de hoy | Justo. Duele y se recupera |
> | La temporada | Los 5 días | Muy duro: puedes perder una hora |
> | La carrera | Todo | Roguelike. Es otro juego |
>
> **Mi recomendación: el DÍA.** Vuelves a empezar la jornada, las misiones
> únicas ya hechas siguen hechas. Castiga de verdad sin borrar una tarde de
> juego. Y encaja con el guardado por tareas (§9).

### 7.2 El curso de RRHH — el minijuego invertido

El castigo es **un curso de cumplimiento**: horas de vídeo corporativo.

**La mecánica:** hay un botón de *Saltar*. Y **el botón se mueve**. El reto
es cazarlo para acabar rápido y volver al juego.

Por qué me parece la mejor idea del lote:

- Es el único minijuego donde **quieres saltarte el contenido**, y el juego
  te lo pone difícil. Eso ES la sátira, no un chiste encima de la sátira.
- Todo el mundo reconoce el patrón: el *skip* que aparece tarde, el aviso de
  «no puedes adelantar el vídeo», el cuestionario final.
- Es fácil de hacer y difícil de agotar: se le pueden ir añadiendo
  crueldades sin tocar el motor.

Escalado sugerido (la primera vez es leve, reincidir cansa):

| Vez | El botón |
|---|---|
| 1.ª | Se mueve despacio, cada 2 s |
| 2.ª | Más rápido, y a veces es falso |
| 3.ª+ | Huye del cursor, y sale un cuestionario |

Detalles que valen la pena: barra de progreso del vídeo que **avanza más
lento de lo que debería**, un «¿sigues ahí?» si te quedas quieto, y música de
stock corporativa.

> 📌 ¿El curso tiene salida garantizada (siempre se puede acabar) o se puede
> fallar? Yo lo haría **siempre superable** — es un peaje, no otra derrota.

---

## 8. Los minijuegos

Dos usos distintos, y conviene no mezclarlos:

1. **De tránsito** — puentean el mundo. Cruzar la avenida, cambiar de
   edificio, subir en ascensor. Van *entre* escenas.
2. **De tarea** — SON una misión. Calentar la comida, la fotocopiadora, la
   videollamada.
3. **De castigo** — el curso de RRHH (§7.2) y el plan de nivelación (§5.1).

### Catálogo inicial

| Minijuego | Tipo | Qué se hace | Estado |
|---|---|---|---|
| Cruzar la avenida | tránsito | Esquivar tráfico | **Ya existe**, hoy desactivado |
| Cruzar a otro edificio | tránsito | Variante de lo anterior | por hacer |
| **El pulso** (todas las tareas) | tarea (qué) | Acertar la zona sin hacer ruido | ✅ **hecho** |
| Curso de RRHH | castigo | El *skip* que huye | ✅ hecho |
| Plan de nivelación | castigo | Tanda de los anteriores | por hacer |

### El PULSO — cómo quedaron los minijuegos de tarea

> ⚠️ **La regla que decidió el diseño entero: un minijuego de tarea NO PUEDE
> PAUSAR EL MUNDO.** Era lo tentador (pantalla completa, el microondas, la
> cola) y habría roto justo lo que el juego es. Hacer una tarea tiene que
> EXPONERTE — estás parada, a la vista, haciendo algo que no es trabajar. Si
> mientras juegas el jefe se congela, las estaciones pasan a ser el sitio más
> seguro del piso, que es exactamente lo contrario de su función, y el bucle
> de [`MOTOR.md`](MOTOR.md) §1 se queda sin el intercambio que lo sostiene.

Así que el minijuego de tarea corre **en el piso, sin pausa y sin tapar el
escenario**: una tira fina abajo, por debajo de los pies de la jugadora.

- **Mantener espacio la termina igual, lento.** Ese es el SUELO y no se toca:
  quien no quiera jugar a nada, o esté a la vez huyendo, la acaba de todas
  formas. Un minijuego obligatorio dejaría a alguien encallado en la primera
  tarea del día 1.
- **Encima va el pulso:** un marcador barre la tira y hay una zona buena.
  Tocar espacio dentro da un pellizco de progreso; fuera, resta y **hace
  RUIDO**, que sube la sospecha. No es «menos puntos»: es que alguien te oyó.
- **Es la MISMA tecla**, en dos niveles: mantenida avanza lento, soltar y
  volver a pulsar al ritmo avanza rápido.
- **Lo limpio paga en reloj**, que es la única moneda.
- **No son tres minijuegos, es uno parametrizado.** El carácter sale del JSON
  (`activities[].pulso` en `scenes/piso7.json`): el café es amable, el
  microondas va nervioso y con la zona estrecha, la película lenta y ancha.
  Tres sensaciones, un solo sistema que mantener.

Vive en `src/game/activityGame.js` y lo vigila `npm run check:pulse`, cuya
primera comprobación —la que de verdad importa— es que **el jefe sigue
caminando** mientras se juega.

**Buena noticia:** el registro ya existe y está aislado a propósito
(`src/game/minigames.js`). Se registran por id, el día los pide desde su
JSON y el texto de la derrota es dato, no código. El motor **nunca** debe
volver a tener un `if` para un minijuego concreto.

Y el de la avenida ya está hecho: hoy está apagado en `levels/dia-1.json`
(su bloque se llama `$minigame`); reactivarlo es devolverle el nombre.

---

## 9. El guardado

> **Se guarda por PROGRESO DE TAREAS, no por días.** Puedes parar en
> cualquier momento.

Implicaciones que hay que tener claras antes de implementarlo:

- El estado guardado es **la lista de misiones cumplidas** (las únicas para
  siempre; las diarias, solo las de hoy), más temporada, día y rango.
- Al volver, **reanudas la jornada en curso**, no la empiezas de cero.
- Hay que decidir qué pasa con el **reloj de la jornada**: ¿se guarda el
  tiempo restante, o vuelves con la jornada entera? Guardarlo es más honesto;
  no guardarlo se puede explotar para farmear tiempo.
- Ya existe `save.js` con banderas (`talk:`, `caught:`) y su
  `resetTalkFlags()`. La estructura de misiones se apoyaría ahí.

> 📌 **Pregunta:** ¿el reloj se guarda o se reinicia al reanudar?

---

## 10. Cómo encaja con lo que hay hoy

Honestamente, qué se aprovecha y qué hay que construir:

| Pieza | Estado |
|---|---|
| Bucle de sigilo (jefe, sospecha, fingir, esconderse) | ✅ hecho, no se toca |
| Actividades en el piso | ✅ existen — pasan a ser misiones `qué` |
| Diálogos con personajes | ✅ existen — son la base de los `cómo` |
| Medallas en el piso | ✅ hechas — ya sirven de marcador de misión |
| Registro de minijuegos | ✅ existe y está aislado |
| Minijuego de la avenida | ✅ hecho, apagado |
| Guardado con banderas | ✅ base suficiente |
| **Cadena de misiones (`requiere`)** | ❌ por hacer |
| **Qués / Cómos y su calificación** | ❌ por hacer |
| **Temporadas, días, rangos** | ❌ por hacer |
| **Curso de RRHH** | ❌ por hacer |
| **Plan de nivelación** | ❌ por hacer |

**Lo que NO existe y es el corazón de todo esto: un director de campaña.** Un
módulo que sepa en qué temporada y día vas, qué misiones están activas, cuál
se acaba de desbloquear y qué nota llevas. Hoy `engine.js` sabe de días
sueltos, nada más. Sería la pieza nueva grande — propongo
`src/game/campaign.js`, leyendo de `public/data/campaign/*.json`.

---

## 11. Riesgos que veo

Los digo ahora porque son más baratos de resolver en el documento:

1. **La cadena puede matar el sigilo** (§3.1). Es el riesgo grande. Mitigación:
   varias misiones activas a la vez.
2. **Perder «todo el progreso» puede ser brutal** (§7.1). Acotarlo al día.
3. **25 días de juego es mucho contenido.** Cinco temporadas × cinco días con
   misiones distintas es un guion largo. Mitigación: las diarias rellenan, y
   el AAA permite terminar la carrera en 5 días si juegas bien — pero hay que
   asegurarse de que la ruta lenta no sea repetir lo mismo cinco veces.
4. **El plan de nivelación puede sentirse premio en vez de castigo.** Si los
   minijuegos son divertidos, fallar sale a cuenta. Ojo con eso.
5. **Dos ejes de fallo a la vez** (amonestaciones y reloj) más un tercero
   (misiones) puede ser mucho. Vigilar en pruebas.

---

## 12. Preguntas para ti

**La cadena**
- [ ] ¿Una misión activa a la vez, o 2–3 (mi recomendación)?
- [ ] ¿Puede haber misiones opcionales fuera de la cadena?

**Calificación**
- [ ] ¿Las letras de §5.2, o solo AAA / normal / nivelación?
- [ ] ¿Los Cómos son obligatorios para el AAA, o suman aparte?

**Castigo**
- [ ] Alcance de las 3 amonestaciones: ¿día (mi recomendación), temporada o
      carrera?
- [ ] ¿El curso de RRHH siempre se puede terminar?

**Temporadas**
- [ ] ¿Los nombres de rango de §6?
- [ ] ¿La temporada 5 es «solo sobrevivir» como propongo?

**Guardado**
- [ ] ¿El reloj de la jornada se guarda o se reinicia?

---

## 13. Plan por fases

Ordenado para que se pueda jugar algo desde pronto. **Del 1 al 6 está
hecho; la temporada 1 se juega de punta a punta.**

1. ✅ **Modelo de misión** (`tipo`, `recurrencia`, `requiere`) + el JSON de la
   temporada 1 → `public/data/campaign/temporada-1.json`.
2. ✅ **`campaign.js`**: activar, completar, encadenar.
3. ✅ **Lista de tareas en el HUD** (`HUD.md` §4bis) → `src/ui/gamehud.js`.
4. ✅ **Cierre de día y calificación** → `src/ui/review.js`.
5. ✅ **Temporadas y rangos**: el salto por AAA y el ascenso por antigüedad
   están en `endDay()`. Falta ESCRIBIR las temporadas 2–5.
6. ✅ **Curso de RRHH** → `src/ui/hrCourse.js`.
7. ◻︎ parcial — **los minijuegos de tarea están** (el pulso); reactivar la avenida sigue pendiente.
8. ✅ **Plan de nivelación** → `src/ui/levelling.js`.
9. ◻︎ **Temporada 5 y jubilación** — el final.

Cada fase con su comprobación en `tools/`. `MOTOR.md` ya está actualizado:
dejó de ser cierto lo que decía del día suelto en cuanto entró la fase 2.

**Lo que se decidió al construirlo** (§12 sigue abierto para cambiarlo, y
cambiarlo es editar un número, no una arquitectura):

| Pregunta | Se hizo así | Por qué |
|---|---|---|
| ¿Una misión activa o 2–3? | **Todas las elegibles a la vez** | Es la mitigación del §11.1: con una sola, el piso es un pasillo |
| ¿Las letras de §5.2? | **Las seis** (AAA/AA/A/B/C/Nivelación) | B y C son las que señalan el eje que descuidaste, que es el chiste |
| ¿Los Cómos cuentan para el AAA? | **Sí, obligatorios** | Si suman aparte, «no hablar con nadie» deja de costar |
| Alcance de las 3 amonestaciones | **El día** | La recomendación de §7.1: perder la carrera entera es brutal |
| ¿RRHH siempre se puede terminar? | **Sí** | Es un peaje, no otra derrota. Cazar el botón N veces, o aguantar el vídeo |

---

## 14. Notas sueltas

```
(escribe aquí)
```
