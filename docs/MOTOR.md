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

> **Estado.** Se publican los días 1 Y 2 (`check:partida` juega el lunes
> entero; `check:dia2`, el arco lunes → martes). Los días 3–5 existen como
> JSON pero no están en `manifest.json → levels`, así que el juego no los ve.
> La foto completa de pendientes vive en [`PENDIENTES.md`](PENDIENTES.md).
>
> **Tres reglas nuevas de agosto 2026, con su porqué en §§ abajo:**
> · **NADA JUEGA AL PULSO.** Toda actividad declara un verbo interactivo
>   (baile, verter, chisme, gesto, microondas); la única excepción es la
>   siesta, porque dormir ES quedarse quieta. El pulso queda en el motor
>   como red, y `check:contenido` impide que el contenido se apoye en él.
> · **SENTADA TRABAJANDO NADIE TE TOCA.** La cobertura del puesto ya lo
>   decía; lo roto era el «fantasma de la silla» (el ciclo de ocupación
>   corría contigo dentro). El toque del jefe espera a que te levantes.
> · **LA ESCOLTA DE APERTURA ES UNA CINEMÁTICA.** Gabo te recibe, TE LLEVA
>   (le sigues sola, por `walkTo`), se aparta al llegar y quedas SENTADA.
>   Con caducidad y telón anti-atasco. Lo vigila `check:escolta`.
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

### 1.1 No hay puntos: hay DOS MEDIDORES

No existe una puntuación. Lo que se lleva la cuenta son dos cosas distintas,
y hay que atender a las dos:

| | Qué pregunta responde | Qué lo mueve |
|---|---|---|
| **El RELOJ** | Por dónde va el día (9:00 → 6:00) y cuándo salir | Lo alarga **cumplir**: misiones, secretos, distracciones, jugar limpio el pulso |
| **La ENERGÍA** | Si vas a poder llegar al final | Baja sola; solo la reponen los **escaqueos** |

Todo el reloj regalado pasa por `Game._grantTime()`, que mantiene el contador
del HUD en sincronía. Si sumas a `timeLeft` por tu cuenta, el HUD miente y
nadie se entera.

La energía se arranca a **75 de 100** y baja a 1,7/s (2,6/s fingiendo): eso
son ~44 s de los 120 de jornada, así que **el día no se puede terminar sin
reponer**. De ahí que todos los días haya que bajar a por un café — el café
es la mejor recarga del piso (45) y es lo que lo vuelve obligatorio. A cero
te DUERMES unos segundos sin control, y si el jefe te ve dormida VIENE A
DESPERTARTE: la sospecha salta al piso de caza y cruza el piso hacia ti —
la amonestación cae cuando llega y te TOCA (dormida no puedes huir, así
que llega), nunca por verte a distancia. Era la última vía que amonestaba
de lejos y rompía la regla de §8. En un lugar seguro es una cabezada y ya.

⚠️ **Tres campos que se confunden solos** en una actividad:
`time` es lo que TARDA en hacerse · `energy` es la ENERGÍA que DA ·
`reward` es el reloj que daba antes, hoy solo el suelo si falta `energy`.

### 1.2 Hacer una tarea: el gesto, el pulso y la cuenta atrás

Una tarea no es «acércate y espera». Hay que hacer algo, se ve en PRIMER PLANO,
y hay un reloj encima.

**El suelo, que no se toca.** Mantener espacio en la estación la termina igual,
solo que lento. Quien no quiera jugar a nada —o esté a la vez huyendo del jefe—
la acaba de todas formas. Los dos minijuegos son ATAJOS con riesgo, nunca
peajes: si fueran obligatorios, alguien se quedaría encallado en la primera
tarea del día 1 sin entender por qué.

**Una actividad juega a UNO de los dos**, según lo que declare su JSON:

| | Qué te pide | Cómo se juega | Qué castiga |
|---|---|---|---|
| **PULSO** (`pulso`) | Timing | Un marcador barre una tira; tocas espacio en la zona buena | Fallar hace RUIDO |
| **GESTO** (`gesto`) | Pulso firme | Un valor se te escapa solo y lo sostienes en su zona con el mando de andar | Dejarlo en el extremo hace RUIDO, por segundo |

El gesto sale de cuatro números (valor, zona, deriva, control) y con eso se
escriben verbos que no se parecen: **bájale el volumen a la peli** (la zona
abajo, la deriva tirando hacia arriba), **sirve el café sin que se enfríe** (la
zona arriba, la deriva hacia abajo), **habla bajito** (la zona además se
mueve). Un mecanismo, no tres minijuegos.

Mientras dura un gesto **no se camina**: el eje del mando queda libre para el
gesto, así que no hay tecla nueva que aprender y funciona igual en el teléfono.
De paso refuerza el bucle — hacer una tarea tiene que exponerte, y estar clavada
en el sitio expone más. Se sale soltando la tecla de acción.

**La cuenta atrás** (`limite`) arranca cuando te pones y ya no para: dejar la
tarea a medias para huir **no la congela**. Si se acaba, pierdes lo hecho, la
sospecha pega un salto **por encima del umbral de caza** y el jefe se pone en
camino. Ojo con lo que eso NO es: no te amonesta a distancia. Viene, y si llegas
antes a un lugar seguro no pasa nada — esa carrera es justo el juego.

`limite` es SIEMPRE mayor que `time`. Al revés, mantener espacio dejaría de
poder terminar la tarea y el suelo se caería sin que nada fallara a la vista.
Lo vigila `npm run check:gesto`.

⚠️ **El contrato del mundo cambió con el bucle v2 (conseguir → activar →
aguantar):** activar una actividad **CONGELA el mundo** (`game.worldFrozen`:
jefe, secuaces, reloj de jornada y sospecha pasiva quietos) y el minijuego
corre como su propio modo con `limite` de temporizador. Lo que impide que la
estación sea «el sitio más seguro de la planta» ya no es el jefe caminando
por detrás: es el temporizador, el **objeto** que hubo que conseguir ANTES
con el piso vivo (`activities[].objeto`: robar el HDMI de una sala vacía —
una distracción la vacía—, comprarle el café al Parce), y el **AGUANTE** de
después — encendida la actividad, el mundo vive y cada segundo sostenida a
la vista paga extra; soltar la banca (`AGUANTE_*` en game.js). Lo vigilan
`check:pulse`, `check:gesto` y `check:objetos`.

### 1.3 Dormirse se cuenta con el ZZZ, nunca con una cama

Hay dos formas de dormirse y las dos se leen igual: la postura `doze` —cabezada
de pie— y el **globo de Zzz** sobre la cabeza.

- **Por agotamiento**: la energía llega a cero y caes donde estés.
- **A propósito**: la actividad «dormir en el escritorio».

⚠️ **Ninguna pose monta mobiliario para esto.** Hubo una pose `sleep` que
traía una CAMA en su `context.furniture`, y las dos actividades que la pedían
eran «dormir en el escritorio» y «estirar cinco minutos»: un colchón
apareciendo de la nada en tu puesto, y otro al desperezarte. Se lee como un
fallo, no como una siesta, así que la pose se retiró del motor entera. Si algún
día vuelve una cama será mobiliario **del plano**, en un sitio concreto, no algo
que la pose invoque donde estés parada.

El Zzz y las caritas del escaqueo son excluyentes: dormida no te lo estás
pasando bien. Lo vigila `npm run check:energia`.

---

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
   al entrar. Y el jefe **SE ALEJA de verdad** (`Boss.retreatFrom`): agarra
   como INVESTIGATE hacia el waypoint de su ronda más lejos de ti — la ronda
   sola no basta, porque deriva hacia los puntos de interés del día y volvía a
   acercarse. El SOPLO del nivel de búsqueda ≥2 (`_updateHeat` → distract a tu
   posición) además **espera unos segundos**: su primer aviso caía justo tras
   soltar y pisaba la retirada en el mismo segundo. Lo vigila
   `npm run check:repel`.
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
- Si se queda atascado 1,4 s, replanifica y **se aparta hacia el costado que
  tiene sitio**. El empujón era en dirección ALEATORIA y tanto podía sacarlo
  como meterlo más adentro; ahora se prueban los dos lados de su rumbo y gana
  el que de verdad esté libre (la moneda al aire se queda solo para el empate
  numérico exacto, que es lo único para lo que servía).

### 3.6bis NADIE SE QUEDA TRABADO ← **NUEVO**

Había **tres formas de caminar** hacia un punto y cada una con su agujero: la
caminata guiada de la jugadora iba en **línea recta** (una maceta la dejaba
empujando el resto de la jornada, con el control bloqueado — que desde fuera
se ve igual que un juego colgado), el paseo de los figurantes no resolvía
colisiones ni medía si avanzaba, y el jefe salía de los atascos a manotazos.

Ahora las tres salen del mismo sitio: **`src/entities/walk.js`**, y la promesa
es una escalada de tres peldaños.

| Peldaño | Cuándo | Qué hace |
|---|---|---|
| Replanificar | 0,45 s sin moverse | Pide ruta otra vez desde donde está. Cubre el caso más común: te empujaron fuera de la ruta. |
| Bordear | 1,1 s sin moverse | Se aparta al costado que tenga sitio y **lo sostiene medio segundo**. Es lo único que vale contra lo que NO está en el navmesh: cuerpos, sillas que rodaron, macetas. |
| Rendirse | 4 s **sin acercarse** | Suelta el destino y **AVISA** (`abandonado`). |

**Los dos relojes son distintos a propósito, y la diferencia costó una
prueba.** Rendirse por «no me he movido» deja fuera el peor caso: el que SÍ se
mueve y no llega. `resolveCircle` desliza a lo largo de las paredes, así que
un cuerpo empujando contra un muro camina de verdad —centímetros por cuadro—
mientras bordea el piso en círculos. Medido con un destino imposible: quince
segundos dando vueltas sin que nada lo viera raro. Por eso el peldaño de
rendirse mira si **se ACERCA**, no si se mueve.

**Y el blanco puede MOVERSE.** Quien pide el paseo puede reescribir el destino
cada cuadro (la escolta lo hace con la posición de Gabo), y los movimientos
pequeños se aceptan sin tocar la ruta — replanificar sesenta veces por segundo
sería gastar el A* entero en volver a trazar lo mismo. Pero **la deriva se
acumula**: sesenta pasitos de nada son una mesa entera, y entonces se está
caminando un plan hecho para donde el otro ESTABA. Por eso el caminante
recuerda **para qué punto trazó** su ruta (`rutaPara`) y la rehace cuando el
blanco se ha ido más de 1,2·S de ahí — el mismo criterio que el `goalMoved` de
`boss._steer`, que es donde se aprendió.

Y esa replanificación **pone a cero el reloj de rendirse**, a diferencia de la
que dispara un atasco: no acercarse a algo que se está yendo no es culpa de
quien camina. Con la vara equivocada, seguir a alguien dos pasos por detrás se
lee como estar atascada y la persecución se soltaba sola a los cuatro
segundos.

Y **rendirse avisando** es la mitad importante: quien pidió el paseo decide
—el figurante adopta el sitio donde está, la escolta baja el telón—. Un
caminante que no puede llegar y no lo dice es exactamente el bug.

Lo vigila `npm run check:atascos`.

> 📌 **Sigue pendiente:** los personajes no se esquivan **entre ellos** al
> planificar. Se apartan por separación de cuerpos y ahora se bordean, pero
> dos que van al mismo sitio siguen negociándolo a empujones.

### 3.6ter LA ESCOLTA: acompasarse, frenar, apartarse ← **NUEVO**

Tres reglas, y las tres salieron de verla fallar:

1. **QUIEN ACOMPAÑA, ESPERA.** El paso del jefe sale de lo lejos que vayas:
   ligero si le sigues (×1.45), afloja si te descuelgas (×0.7), y **se PARA a
   llamarte** si te pierde (más de seis mesas). Iba a ×1.9 fijo, y con la
   cámara puesta en ti eso no se lee como que camina: se lee como que
   **apareció** al fondo. Medido con el acompasamiento: los dos cuerpos nunca
   se separan más de 2,6 unidades en toda la escena.
   ⚠️ Ojo con subirlo «para que sea más ágil»: a ×1.85 el trayecto salió
   **tres veces más lento** (recorrido 5,6 contra 17,3), porque llega a los
   muebles antes de terminar de girar, se los come, y el anti-atasco le borra
   el destino cada segundo. El paseo acompasado es más rápido yendo más
   despacio.
2. **FRENA DONDE ESTÁ, no en un punto calculado.** Al acompasarse llega A LA
   VEZ que tú, y si sigue andando se mete en el hueco del puesto —mesa, silla
   y tú sentada— del que no vuelve a salir (medido: 19 s clavado, con los
   codazos del anti-atasco deshechos por las colisiones en el mismo cuadro).
   En cuanto entra en la zona se le para EN SU SITIO, que es válido por
   construcción porque está de pie en él. Calcularle una parada «a dos mesas
   del puesto» fue peor: un punto elegido por geometría puede caer donde el
   jefe no pisa —su navmesh excluye las salas— y entonces la escolta entera se
   detenía a cinco unidades de la puerta.
   ⚠️ **Y el freno va MÁS ADENTRO que el umbral del relevo** (3·S contra 4·S).
   Frenando en la raya se quedaba justo encima de ella: «está junto a la mesa»
   dejaba de ser cierto al cuadro siguiente, el contador de «lleva un segundo
   aquí» se reseteaba solo, y el relevo no saltaba nunca — la jugadora se
   pasaba la jornada siguiéndole a un paso sin llegar a sentarse.
3. **Y SE APARTA**, a su propio puesto, antes de que la correa del día vuelva
   a engancharlo (`_correaVuelveEn`, 8 s). Devolvérsela en el mismo cuadro en
   que te sientas lo dejaba orbitando tu mesa a dos metros y medio.

Un tropiezo del paseo de la jugadora durante la escena **no la cancela**: se
reintenta, y solo a la tercera cae el telón. Casi siempre el estorbo es el
propio Gabo, y se aparta él solo un segundo después.

### 3.7 El halo

El cono de visión nace **en los ojos**, no en el suelo (`EYE_HEIGHT` /
`EYE_FORWARD`). Con la cámara oblicua, un cono a ras de suelo se dibuja encima
del personaje y parece salirle de la espalda.

El **color del halo dice el nivel de sospecha** (tranquilo → ámbar → rojo), para
leerla del suelo sin mirar el HUD.

Y **su PRESENCIA dice cuánto importa** (`HALO_PRESENCE_*`). Son dos ejes
distintos a propósito: el color dice QUÉ pasa, la opacidad dice CUÁNTO
aprieta. En ronda el halo es un susurro (45%) y solo se planta del todo
cazando o cuando te ve en falta; buscando se queda a medio camino.

Por qué: estaba clavado al máximo, y con siete vigilantes en el piso el suelo
acababa cubierto de cuñas de color — el halo tapaba justo el escenario que
tienes que leer para esconderte. Además se comía su propia escalada: si en
ronda ya está a tope, la persecución solo puede cambiar de tono. El contraste
comunica más que el brillo constante.

Se funde entre los dos valores (`HALO_PRESENCE_EASE`) en vez de saltar:
el salto delata el frame exacto en que cambió el estado interno y se lee como
un parpadeo.

> El radar de Washo (`visionShape: "radar"`) respira con lo mismo. Barre 360°,
> así que es el halo que más suelo tapa de los siete.

### 3.8 La vigilancia es individual ← **NUEVO**

Cada vigilante (jefe y cada secuaz) lleva su propio `localHeat` (0–1), y es
lo que pinta SU halo. Antes los siete copiaban el `suspicionRatio` del jefe
cada cuadro: ningún secuaz podía ir por delante o por detrás de otro, todos
se teñían del mismo calor de oficina. Ahora Crispo puede llevar media
vigilancia acumulada mientras Washo, que no te ha visto en toda la mañana,
sigue a cero.

Solo el jefe sigue leyendo el medidor compartido directamente (`localHeat =
suspicion / max`): él ES ese número, y su persecución de verdad la sigue
gobernando `chaseSuspicionFloor` (§3.1) — esto no lo toca. Cada secuaz, en
cambio, acumula el suyo con las mismas dos velocidades de siempre (rápido si
te pilla en una actividad prohibida, más despacio si solo te ve fuera de tu
puesto) y decae en cuanto deja de verte — incluso con la puerta del día sin
superar, en modo exploración o dentro de un lugar seguro, para que fingir
dentro de una sala no te deje "fichada" por alguien que te vio un segundo
antes de entrar.

Por encima de `followThreshold` (0.55 por defecto, `boss-config.json` →
`boss.followThreshold`) un secuaz rompe la ronda y se pone a **seguirte de
verdad**: reutiliza el estado `INVESTIGATE` de siempre, pero con el objetivo
refrescado a tu posición REAL cada cuadro que te ve, en vez del vistazo de
2.5 s y se acabó de antes. Sigue avisando al jefe (mismo `onSpot` →
`boss.distract()` de siempre) mientras te tiene detrás — y nunca te atrapa
él: `catches()` sigue devolviendo `false` para `role: "minion"`, eso no
cambia (§3.4).

El medidor compartido del HUD **sigue existiendo** y sigue siendo quien
dispara amonestaciones y la nota del día — pero ahora sube cuando ALGÚN
secuaz cruza SU propio umbral, no por verte un instante. Antes bastaba un
vistazo de refilón (`playerVisible` ese cuadro) para mover el HUD; ahora
hace falta que alguien de verdad lleve un rato sospechando.

---

## 4. Cubrirse

### 4.1 Lugares seguros

Son los **únicos** sitios donde se puede fingir. Dos tipos:

| Tipo | Cubre | Se gasta |
|---|---|---|
| `meeting` (sala) | con entrar | sí (`budget`), y se ocupa sola (`busyEvery`/`busyFor`) |
| `desk` (tu puesto) | solo mientras finges | no — pero **también se ocupa** (`busyEvery`): a veces alguien se sienta en tu silla y toca plan B |

**Tu puesto ocupado avisa SIEMPRE** (estés donde estés): es tu plan B el que
se cae, y descubrirlo llegando en plena huida era el peor momento. Las salas
solo avisan si estás dentro — que se ocupen es rutina. Lo vigila
`npm run check:repel`, junto con la retirada del jefe (§3.3).

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

### 5.1 UN MINUTO, y lo alargas tú ← **NUEVO**

`rules.duration` es **60**. Antes era 240 (230/220 los últimos días) y el
reloj no apretaba nunca: con cuatro minutos de partida y las mismas
recompensas, la única moneda del juego no significaba nada hasta el final.

Ahora la jornada **no viene dada, se gana**. Cada actividad prohibida
devuelve entre 17 y 43 segundos (`reward` en el JSON de la escena, ×combo),
así que la primera taza de café casi duplica lo que te queda y encadenar
tres te da una jornada larga de verdad. El día crece con lo que haces.

> Ojo con los dos campos que se confunden solos: **`time` es lo que TARDA**
> una actividad y **`reward` el reloj que DA**.

**El reloj de pared sale de `timeSpent`, no de `duration - timeLeft`.** Es la
trampa que abrió la jornada corta: en cuanto ganas más reloj del que llevas
gastado, esa resta se vuelve NEGATIVA y el HUD marcaba horas imposibles
("-6:00 a.m."). Con 60 segundos y combos de hasta ×4, una sola tarea temprana
ya te mete ahí. `timeSpent` solo sube, y va topado en las dos puntas: alargar
la jornada te deja jugar más, no retroceder el reloj de la oficina.

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

### 6.1 DOS CANALES: la caja y el globo ← **NUEVO**

Hasta aquí solo había UNA forma de hablar, y era **modal**: la caja pausa la
partida (`engine.withPause`). Es la correcta para una conversación —te paras,
escuchas, eliges— y deja fuera todo lo que se dice **en marcha**.

Ahí estaba el fallo de la escolta del día 1: Gabo te decía «camina conmigo»
con el mundo congelado y **después**, con la caja cerrada, echaba a andar. O
sea que la escena de que te lleva no era una escena: eran dos cosas pegadas.

| Canal | Cuándo | Pausa | Dónde |
|---|---|---|---|
| **La caja** | Una conversación: te paras a hablar | Sí | `ui/dialogue.js` + `scene/dialogueCamera.js` |
| **El globo** | Lo que se dice andando | **No** | `ui/speechBubble.js` |

Reglas del globo: nunca pide un clic (si hace falta contestar, eso es un
diálogo y va en la caja), **una frase por persona** (la nueva sustituye a la
vieja; dos apiladas son un muro de texto flotando en el piso, que es lo que
las medallas vinieron a quitar), y **se calla cuando habla la caja** —pero su
reloj sigue, así que al volver no reaparece una frase a destiempo—.

El tiempo en pantalla se calcula **por largo del texto**: uno fijo o corta las
frases largas o deja colgadas las cortas.

El texto sale del JSON como todo el diálogo: `encounters.jefe.escolta`,
`escoltaLlegada` y `escoltaEspera`. El motor pide «la frase n del tramo» y no
sabe qué dice.

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
   sobrevive. Hay que reanudar dentro del bucle. Y no muerde solo a los tests
   del jefe: CUALQUIER prueba que suba la sospecha al 90%+ —aunque sea para
   mirar un aviso de interfaz— deja la partida pausada para todo lo que venga
   después. Así estuvo `check:safespots` años en rojo.
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

1. ~~`check:safespots` tiene un FAIL~~ **RESUELTO**, y la teoría de aquí
   era correcta a medias: el fallo era de la prueba, no del motor, pero la
   causa no era el cupo — era LA ALARMA. El test prueba el aviso rojo al 95%
   de sospecha, ese nivel dispara la alarma de nivel 3, y la alarma PAUSA la
   partida (trampa nº1 de §8) en un test anterior a su existencia: todo lo
   posterior corría contra un juego congelado. El cupo no se gastaba porque
   `update()` sale en seco en pausa, y «la sala deja de cubrirte» pasaba de
   chiripa con `inSafeSpot` helado de antes. Una sonda instrumentada (traza
   cada 100 vueltas) lo enseñó en una pasada: `paused: true` desde el aviso
   en adelante. La mecánica del motor estaba sana — drenaba 26→0 limpia con
   la partida corriendo.
2. ~~Los personajes no se esquivan entre ellos~~ **RESUELTO**
   (`_updateCrowdSeparation` en game.js). La regla que manda es de juego, no
   de física: **quien está de servicio NO CEDE.** El contacto del jefe y de
   los secuaces es mecánica —la amonestación es un toque, la persecución
   cierra distancia— y si un figurante pudiera empujarlos un centímetro, el
   decorado empujaría a las reglas. El jefe y los secuaces son inamovibles;
   el NPC de fondo absorbe el empujón entero, y un sentado tampoco cede
   (nadie resbala de su silla porque pasen a su lado). Sin popups: el
   feedback de choque es de la jugadora (`_updateBumps`), esto es silencio.
   Lo vigila `npm run check:crowd`, y su primera aserción no es «se
   separan» — es «el jefe no se movió».
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
