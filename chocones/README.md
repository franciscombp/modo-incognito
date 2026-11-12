# Los Chocones · el team building de Gabo

Spin-off de Modo Incógnito, al estilo de los minijuegos de Mario Party. Gabo
organizó un «team building obligatorio» en el parqueadero: carritos
chocones en una pista redonda que se va encogiendo. Echa a los demás a
golpes; el último que queda dentro se lleva la **estrella** de la ronda.
Gana quien junte **tres**, o quien tenga más al acabar la quinta ronda (a
igualdad, más monedas).

- **Jugar:** <https://franciscombp.github.io/modo-incognito/chocones/> (en local, `npm run dev` → `/chocones/`)
- **Mandos:** WASD o flechas para conducir, **espacio** (o Mayús) para el turbo. En el teléfono, palanca a la izquierda y botón de turbo a la derecha.
- **Monedas:** las que aparecen en la pista, y dos por cada carro que eches (cuenta quien te dio el último golpe en los últimos tres segundos).
- **El turbo** es un empujón hacia donde mira el morro; mientras dura, tu carro pesa casi el doble. Se recarga en unos segundos.
- A partir del segundo 12 la pista se encoge (el aro rojo parpadea). Si a los 48 s queda más de uno, gana quien esté más al centro.

## Multijugador sin servidor

Igual que El Soplón: el **anfitrión es el servidor**. Su navegador corre la
partida y los bots y le manda a cada invitado su vista 20 veces por
segundo; los invitados solo mandan su mando.

| Modo | Cómo |
|---|---|
| **Solo contra bots** | «Solo, contra bots» |
| **Internet / wifi (WebRTC)** | Anfitrión: «Crear sala» → «Nueva invitación» → manda el ENLACE. Invitado: lo abre, pulsa «Unirme» y devuelve el CÓDIGO. El anfitrión lo pega en «Conectar». Una invitación por persona |
| **Pestañas** | Otra pestaña → «Unirme desde otra pestaña» con el código de sala |

Hasta ocho carros; los huecos los rellenan bots. Si alguien se desconecta,
un bot sigue con su carro.

## Piezas

| Archivo | Qué hace |
|---|---|
| `sim.js` | La partida, pura y autoritativa: física de los carros, choques, filo, monedas, rondas, estrellas y podio. Sin DOM — se prueba desde node |
| `bots.js` | Los bots: no caerse, entrarle al rival desde dentro para sacarlo, turbo cuando están alineados, monedas de paso. Cada uno con su carácter |
| `escena3d.js` | La pista, los carros y el podio en 3D. Los personajes son los muñecos del juego grande (`Character3D`), sentados en su carro |
| `main.js` | Sala, invitaciones, mandos, HUD y lo que comenta Gabo |
| `../impostor/net.js` | La red, compartida con El Soplón (WebRTC con señalización a mano y BroadcastChannel) |

## Pruebas

- `npm run check:chocones` — partidas enteras entre bots en node: terminan, se deciden a golpes, gana gente distinta, nada se vuelve NaN, y quedarse quieta no sirve.
- `npm run check:chocones-red` — tres navegadores, dos transportes: sala, conducir con teclas, turbo, vista del invitado idéntica a la del anfitrión tic a tic, podio, revancha y desconexión. Necesita el preview en `:4173`.
