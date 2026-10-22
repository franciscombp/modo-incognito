# El Soplón · Among Us en el Piso 10

Spin-off de Modo Incógnito, **prueba de concepto**. Alguien de la Célula le
pasa todo a Gabo: la Célula hace sus escaqueos y busca al soplón; el soplón
manda a la Célula a RRHH uno a uno sin que lo pillen.

- **Jugar:** <https://franciscombp.github.io/modo-incognito/impostor/> (en local, `npm run dev` → `/impostor/`)
- **Mandos:** WASD/flechas para andar · mantener **E** en una estación para hacer la tarea · **E** junto a un gafete tirado para reportar o junto a la campana (el «!» rojo de la cafetería) para una junta · **Q** para mandar a alguien a RRHH si eres el soplón. En el teléfono: palanca a la izquierda, botones a la derecha.

## Cómo se juega en red SIN servidor

El **anfitrión es el servidor**: su navegador corre la partida y los bots, y
reparte a cada invitado su vista. Nadie más necesita nada instalado.

| Modo | Cómo | Para qué |
|---|---|---|
| **Solo contra bots** | «Solo, contra bots» | Probar en un minuto |
| **Wifi / internet (WebRTC)** | Anfitrión: «Crear sala» → «Nueva invitación» → manda el ENLACE por chat. Invitado: lo abre, pulsa «Unirme» y devuelve el CÓDIGO que le sale. El anfitrión lo pega en «Conectar». Una invitación por persona. | Varios teléfonos/portátiles. En la misma wifi la partida va directa de aparato a aparato |
| **Pestañas** | Otra pestaña del mismo navegador → «Unirme desde otra pestaña» con el código de sala | Probar sin dos aparatos (y las pruebas automáticas) |

Los huecos de la mesa los rellenan **bots** (± bot en la sala). Si un
invitado se cae a mitad de partida, un bot sigue con su personaje.

**¿Por qué no Bluetooth?** Web Bluetooth solo deja a una página conectarse a
un periférico, nunca anunciarse, así que dos navegadores no se pueden
descubrir por ahí. Lo que cubre ese caso es la wifi local — o el punto de
acceso de un teléfono: con la página ya cargada, WebRTC conecta por la red
local aunque no haya internet (el STUN público solo hace falta si estáis en
redes distintas).

## Piezas

| Archivo | Qué hace |
|---|---|
| `escena3d.js` | **El piso 3D y el reparto del juego, sin copias**: importa `buildOffice`, `Character3D`, `DioramaCamera`, la luz y las medallas del motor. Cada jugador lleva un muñeco de `characters3d.json` (con su `.glb` si lo tiene); a quien mandan a RRHH se queda tirado boca abajo junto a su gafete; los fantasmas, a media opacidad. También le presta a la partida la FÍSICA del piso (navmesh y colisiones) |
| `reparto.js` | Quién se puede llevar (todo el reparto menos Gabo) |
| `mapa.js` | Lee `public/data/scenes/piso7.json` (el MISMO plano del juego): suelo, bloques, tareas (las estaciones + «fingir en» cada zona de puestos) y rutas. En el navegador usa el navmesh del juego; en node, una rejilla propia |
| `sim.js` | La partida, pura y autoritativa: roles, tareas, matar, reportar, juntas, votos, fin. Sin DOM — se prueba desde node |
| `bots.js` | Los bots. Solo saben lo que ven; el soplón mata cuando nadie mira; la Célula reporta, acusa con lo que vio, defiende y vota |
| `net.js` | WebRTC con señalización a mano (oferta en el `#` de la URL, respuesta comprimida) y BroadcastChannel para pestañas |
| `main.js` | Interfaz, niebla de visión, HUD, junta, sala |

## Pruebas

- `npm run check:impostor` — juega N partidas solo entre bots en node (sin navegador): tareas alcanzables, nadie fuera del suelo, las partidas terminan y ganan los dos bandos.
- `npm run check:impostor-red` — tres navegadores, dos transportes: sala, pestaña, WebRTC con enlace + código, andar, campana, chat y voto de la junta. Y diez partidas de bots **con los muebles del 3D**, que es donde se atascaban. Necesita el preview en `:4173`.

## Lo siguiente, si la prueba gusta

- QR en vez de copiar/pegar el enlace y el código (la señalización ya cabe en ~600 caracteres).
- Minijuegos de verdad en las tareas (los verbos de `src/game/` ya existen).
- Bots que hablan con un LLM en la junta (hoy son reglas: no necesitan clave ni red).
