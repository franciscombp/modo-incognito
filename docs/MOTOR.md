# El motor de Modo Incógnito

**Para qué es este documento.** Es el sitio donde se discute cómo funciona el
juego, para no tener que ir dando instrucciones sueltas. Cada regla lleva su
número, dónde vive y —lo importante— **por qué es así**. Si algo no te cuadra,
corrígelo aquí mismo: tacha, escribe al lado, cambia el número. Esto es la
fuente, el código va detrás.

Lo que NO es: documentación de la arquitectura del repo (eso es `CLAUDE.md`) ni
un mapa de "quiero cambiar X → edito Y" (eso es el `README.md`).

**Convención:** los valores en `código` son editables sin tocar el motor —
están en `public/data/`. Los que llevan 🔒 están en el código y cambiarlos es
una edición de verdad.

> **Estado.** El día 1 es lo único publicado. Los días 2–5 existen como JSON
> pero no están en `manifest.json → levels`, así que el juego no los ve.
>
> ⚠️ **Las tareas del día YA NO SALEN DE AQUÍ: las reparte la campaña.**
> `public/data/campaign/temporada-1.json` manda sobre qué se te pide y en qué
> orden (misiones encadenadas, Qués y Cómos, temporadas y rangos:
> [`CAMPANA.md`](CAMPANA.md)). **El bucle de sigilo de este documento —
> secciones 1 a 5— se conserva entero y sin un solo cambio**: sospecha, jefe,
> lugares seguros, escondites y reloj funcionan igual, porque la campaña
> decide QUÉ, nunca CÓMO.
>
> En la práctica: donde este documento dice «la lista de tareas del día», hoy
> hay que leer «la lista que la campaña dejó hoy». `levels/dia-1.json` sigue
> mandando en el reloj, el guion, el jefe y su correa. Si no hay temporada
> cargada, el día vuelve solo a sus tareas del JSON — el modelo viejo sigue
> siendo el suelo, no se borró.

---

## 1. El bucle

> **La frase que manda:** *evitar trabajar mientras el jefe y sus secuaces te
> molestan.* Todo lo demás está al servicio de eso. Si un cambio hace la
> imagen más bonita y el bucle más aburrido, el cambio está mal.

La jornada es:

1. **Sales del ascensor** con una lista de tareas y un reloj corriendo.
2. **Haces las tareas** (café, película, comer). Hacerlas te expone: estás
   parada, a la vista, haciendo algo que no es trabajar.
3. **Te ven.** Sube la sospecha. Si sube demasiado, te persiguen.
4. **Te escondes o finges** que trabajas. La sospecha baja.
5. Vuelta al 2, hasta que se acaben las tareas o el reloj.

La tensión sale de que **2 y 4 se excluyen**: el tiempo que pasas cubriéndote
no lo pasas avanzando. Ese es todo el juego. Cualquier regla que rompa ese
intercambio —que fingir sea gratis, o que esconderse no cueste tiempo— vacía
el bucle aunque cada pieza por separado funcione.

### 1.1 No hay puntos: la moneda es el RELOJ

No existe una puntuación. Todo lo que "premia" **alarga la jornada**, y todo
el reloj regalado pasa por `Game._grantTime()`, que mantiene el contador del
HUD en sincronía. Si sumas a `timeLeft` por tu cuenta, el HUD miente y nadie
se entera.

⚠️ **Dos campos que se confunden solos** en una actividad:
`time` es lo que TARDA en hacerse · `reward` es el reloj que DA.

---

## 2. La sospecha

El medidor central. Va de 0 a `suspicion.max` (100).

### 2.1 Qué la sube

| Situación | Dato | Ahora |
|---|---|---|
| Te ven fuera de sitio | `seenOutOfPlaceRate` | 10 /s |
| Te ven fuera de sitio, con búsqueda alta | `seenOutOfPlaceHighHeatRate` | 22 /s |
| Te ven haciendo una actividad | `seenDoingActivityRate` | 20 /s |
| Un secuaz te pilla | 🔒 `MINION_CAUGHT_RATE` | en `game.js` |

### 2.2 Qué la baja

| Situación | Dato | Ahora |
|---|---|---|
| Escondida o fingiendo | `decayHiddenOrPretending` | 45 /s |
| Sin hacer nada sospechoso | `decayIdle` | 12 /s |

Fíjate en el desequilibrio: **bajar es más rápido que subir**. Es a propósito
— si cubrirse costara tanto como te cuesta que te vean, el juego sería una
carrera perdida. Pero cubrirse cuesta TIEMPO, y el tiempo es la moneda.

### 2.3 Los niveles de búsqueda

La sospecha se traduce en un "nivel de búsqueda" de 0 a 3 (🔒 `HEAT_THRESHOLDS`
en `game.js`). Al llegar a **3 el juego se PAUSA** con un aviso a pantalla
completa y no sigue hasta que pulses "Entendido".

- La alarma salta **una vez por subida** y se rearma sola al bajar del nivel 3.
- El aviso lo pinta `engine.js` (`onHeatAlert`), pero **la pausa la hace
  `game.js`**. Es la distinción que importa si tocas esto: desconectar el aviso
  no quita la pausa.

> 📌 **Para discutir:** ¿el aviso a pantalla completa interrumpe demasiado?
> Alternativa: un aviso grande pero sin pausar, y reservar la pausa para la
> amonestación.

### 2.4 Fingir es intocable por debajo de un umbral

Por debajo de `pretendImmuneThreshold` (30), fingir te cubre del todo. Por
encima, ya sospechan demasiado y fingir solo frena la subida.

---

## 3. El jefe y los secuaces

Viven en `src/entities/boss.js`. Cuatro estados:

```
PATROL ──ve algo raro──> CHASE ──te pierde──> SEARCH ──se cansa──> PATROL
   │                                              
   └──ruido/distracción──> INVESTIGATE ──se cansa──> PATROL
```

### 3.1 El respiro: no persigue con la sospecha baja ← **NUEVO**

**Por debajo de `boss.chaseSuspicionFloor` (40) el jefe NO te persigue.** Hace
su ronda de siempre aunque te pille en falta.

Por qué: antes bastaba una alerta roja para que se lanzara desde el primer
minuto y, con Gabo además atado a la jugadora en el día 1, el resultado era
que no dejaba hacer nada — te veía, venía, te alcanzaba, vuelta a empezar.

La tensión tiene que **subir**: primero te miran raro, luego te vigilan, y solo
cuando ya has acumulado sospecha se convierte en persecución. Sin esa rampa no
hay sigilo, hay un pasillo con un perro suelto.

Lo que sí hace por debajo del umbral: **se acerca a mirar** (`INVESTIGATE`).
Se nota que sospecha sin que sea una cacería.

La puerta está en un solo sitio, `Boss._mayChase()`, y la llama `startChase()`
— para que no se cuele una persecución nueva por una rama que alguien añada
mañana y olvide comprobar el umbral.

> 📌 **Para calibrar:** 40 es un punto de partida. Si sigue agobiando, sube a
> 55–60. Si se queda soso, baja a 30. Es un número en `boss-config.json`.

### 3.2 La correa (día 1)

Gabo va **atado a la jugadora**: su ronda no es el piso, es "donde estés tú".
Se acerca hasta la banda `near` y ahí te suelta.

**La correa se AFLOJA (×1.9) con la sospecha baja** ← **NUEVO**. No bastaba con
no perseguir: si su ronda sigue siendo encima de ti, te lo encuentras igual. Al
aflojarla se queda en la misma zona —sigue estando ahí, sigue dando miedo— pero
te deja sitio. En cuanto subes de sospecha se cierra sola.

> 📌 **Para discutir:** ¿debería la correa desaparecer del todo con sospecha
> muy baja, en vez de solo aflojarse? Hoy: se afloja.

### 3.3 La persecución comprometida

Desde que un vigilante te mete en el halo, `lockedOn` queda en `true` y **no te
suelta** por perderte de vista ni por atascarse contra un mueble. Solo hay dos
salidas:

1. **Un lugar seguro** — se comprueba cada frame mientras estés dentro, no solo
   al entrar.
2. **Enfriar la sospecha a CERO sostenido** — 1,5 s seguidos en 0 sin que te
   esté viendo en falta. Entonces suelta la presa con unos segundos de gracia.

La segunda existe porque quedarse plantado a tu lado con el medidor a cero
bloqueaba el resto de tareas.

⚠️ Una vez comprometido, el umbral de 3.1 **ya no aplica**: bajar la sospecha a
mitad de carrera no lo despista. Para eso están estas dos salidas.

### 3.4 La amonestación es SIEMPRE física

Solo te amonesta si **te toca**. No existe ningún atajo que la dispare a
distancia. Un secuaz te aborda por radio de CONTACTO (`minionTouches`), no de
visión — subirlo reintroduce el "Crispo me habla desde el otro lado del
pasillo".

Las amonestaciones se acumulan; al llegar al tope del personaje, despido.

### 3.5 La velocidad va en dos fases

| Fase | Dato | Ahora |
|---|---|---|
| Tanteo (sospecha < umbral) | `approachSpeedSlow` | 2 |
| A por todas | `approachSpeedFast` | 5.5 |
| El umbral | `suspicionThresholdFastApproach` | 90 |

La fase lenta es el margen para escapar.

### 3.6 El trayecto ← **NUEVO**

El camino sale de un A* sobre rejilla, que va en **escalera**: nodo arriba,
nodo a la derecha, nodo arriba… Caminarlo tal cual es lo que le hacía ir
rebotando de esquina en esquina y rozando todos los muebles.

Ahora se **tira de la cuerda**: se busca el nodo más lejano al que ya se puede
ir en línea recta y se apunta directamente a él. La escalera se convierte en
tramos rectos.

- Se miran como mucho **6 nodos por delante** 🔒. Más allá no se nota: lo que
  ve el ojo es el quiebro de al lado, no el de dentro de diez metros. Y con
  ~20 personajes a la vez, cada traza de línea se paga.
- Si se queda atascado 1,4 s, replanifica y se da un empujón lateral.

> 📌 **Sigue pendiente:** los personajes no se esquivan **entre ellos**. Dos
> que van al mismo sitio se empujan. Se arregla con un radio de separación,
> pero es trabajo aparte.

### 3.7 El halo

El cono de visión nace **en los ojos**, no en el suelo (`EYE_HEIGHT` /
`EYE_FORWARD`). Con la cámara oblicua, un cono a ras de suelo se dibuja encima
del personaje y parece salirle de la espalda.

El **color del halo dice el nivel de sospecha** (tranquilo → ámbar → rojo), para
leerla del suelo sin mirar el HUD.

---

## 4. Cubrirse

### 4.1 Lugares seguros

Son los **únicos** sitios donde se puede fingir. Dos tipos:

| Tipo | Cubre | Se gasta |
|---|---|---|
| `meeting` (sala) | con entrar | sí (`budget`), y se ocupa sola (`busyEvery`/`busyFor`) |
| `desk` (tu puesto) | solo mientras finges | no |

⚠️ **Dos lugares seguros no pueden solaparse ni repetir `id`.** Si se pisan, uno
se gasta y el otro te sigue cubriendo desde el mismo metro cuadrado: la mecánica
de "se gasta" deja de existir sin que nada falle a la vista. Ya pasó, encima de
la Sala 1.

### 4.2 Esconderse

Los escondites son sitios del plano. `isHiding` **se recalcula cada frame** desde
el plano — no es un flag que puedas poner a mano y que sobreviva.

Esconderse baja la sospecha, pero **no rompe una persecución comprometida**.

---

## 5. El reloj

- La jornada va de `dayStartHour` (9) a `dayEndHour` (19) en el HUD.
- El tiempo real de partida es `timeLeft`; lo que ves arriba es la hora del
  piso, que es el mundo en el que finges vivir.
- Todo el tiempo regalado pasa por `_grantTime()` (ver 1.1).

---

## 6. Los diálogos

- Un personaje sin escenas escritas **se despide en personaje**, no repite la
  primera línea. El pozo de salidas es dato: `encounters.<id>.exhausted` gana,
  si no `dialogues.exhausted`, y si tampoco hay, un trío por defecto en
  `engine.js`.
- **Un interrogatorio SÍ rota para siempre**: es castigo, no charla, y quedarse
  mudo sería peor.
- Una línea con `narrator: true` no usa la caja: va en su propia tarjeta.
- Los efectos de diálogo se registran en `src/game/effects.js`, nunca en el
  motor. Un nombre desconocido avisa por consola.

---

## 7. Qué se toca dónde

| Quiero cambiar… | Edito |
|---|---|
| Balance de sospecha y jefe | `public/data/boss-config.json` |
| **Qué tareas te piden, y en qué orden** | `public/data/campaign/temporada-1.json` |
| Reloj, guion y correa del día | `public/data/levels/dia-1.json` |
| Plano, muro, actividades, lugares seguros | `public/data/scenes/piso7.json` |
| Diálogos | `public/data/dialogues.json` |
| Aspecto de un personaje | `public/data/characters3d.json` |
| **Colores de interfaz Y edificio** | `src/style/design-system.css`, capa 1 |
| Un efecto de diálogo nuevo | `src/game/effects.js` |
| Un minijuego nuevo | `src/game/minigames.js` |

---

## 8. Cómo se comprueba

Los `tools/check-*.mjs` abren el juego real en un navegador headless y leen su
estado por `window.__game`. **Necesitan el build servido en `:4173`**.

```bash
npm run build && npm run preview &
npm run check
```

Tres trampas al escribir uno, las tres pagadas ya:

1. **La alarma de nivel 3 pausa la partida**, y pausada `update()` no mueve
   nada — el jefe se queda clavado y parece que la IA está rota. `_heatAlertShown`
   **se rearma sola** al bajar del nivel 3, así que ponerla en el montaje no
   sobrevive. Hay que reanudar dentro del bucle.
2. **Una amonestación resetea la sospecha a cero**, así que la prueba siguiente
   empieza en frío — y en frío el jefe ya no persigue (regla 3.1).
3. El jefe lleva **su propia copia** de la sospecha, que `game.js` sincroniza
   una vez por cuadro. En un montaje hay que poner las dos. Es la trampa que
   más veces ha mordido: `check:music` decía que la música no reaccionaba a
   la persecución, y lo que pasaba es que `startChase()` encontraba al jefe
   todavía en frío y la puerta del respiro (regla 3.1) le denegaba la caza.
   La música estaba perfecta.
4. **Para saltarse la puerta del día 1 se llama a `game.clearGate()`**, nunca
   `game.metGabo = true` a pelo. La bandera sola abre el piso pero deja la
   lista de tareas VACÍA, porque quien reparte el plan del día es la campaña
   al enterarse de que la misión de la puerta cayó. Media suite se rompió
   justo así el día que entró la campaña, y el error que salía —«no se puede
   leer x de undefined»— no apuntaba a nada parecido a la causa.

---

## 9. Lo que sé que está flojo

Honestidad por delante, para que decidas tú:

1. **`check:safespots` tiene un FAIL** ("y su marcador lo refleja"). Es
   anterior a la campaña y sigue ahí. Lo que se sabe hasta ahora: la prueba
   mete a la jugadora en una sala y da vueltas de `update()` hasta agotarle
   el cupo (26 s de juego en 1200 vueltas de 1/30 s, o sea 40 s de margen);
   al salir, `inSafeSpot` es `false` —eso pasa— pero el marcador no llega a
   0. **Sospecha, sin confirmar:** el cupo no se agota del todo y la
   comprobación hermana ("una sala se gasta y deja de cubrirte") estaría
   pasando por el motivo equivocado. Un intento de aislarlo con una sonda
   dejó el navegador colgado sin devolver dato, así que la causa NO está
   confirmada y no conviene "arreglarlo" a ciegas: si la teoría es cierta,
   el fallo real es de la prueba, no del motor.
2. **Los personajes no se esquivan entre ellos** (ver 3.6).
3. **El umbral de 40 está sin jugar de verdad.** Está probado que funciona,
   pero el número correcto sale de jugarlo, no de razonarlo.
4. **La correa del día 1 sigue siendo el factor más agobiante.** Aflojarla
   ayuda; puede que haya que quitarla del todo con sospecha baja.
5. **Campos reservados en `boss-config.json`** (`alertDistance`, `alertDuration`,
   `dayDuration`, todo lo del ascensor de salida) **no hacen nada todavía**.
   Su propio `$comment` dice cuáles son.

---

## 10. Para rellenar tú

Espacio para lo que quieras cambiar. Escribe aquí y lo aplico.

### Dificultad
- [ ] ¿El umbral de persecución en 40 está bien?
- [ ] ¿Cuántas amonestaciones antes del despido?
- [ ] ¿La jornada dura lo que debe?

### El jefe
- [ ] ¿La correa del día 1 se queda, se afloja o se va?
- [ ] ¿Debería rendirse alguna vez sin lugar seguro?

### Ritmo
- [ ] ¿Cuántas tareas por día?
- [ ] ¿La alarma de nivel 3 debe pausar?

### Notas sueltas
```
(escribe aquí)
```
