/**
 * LA APERTURA SE JUEGA, NO SE LEE.
 *
 * ── El problema ──
 *
 * El día 1 abría con DIECISÉIS líneas de diálogo antes de que la jugadora
 * tocara nada: siete en el vestíbulo y nueve más nada más llegar al puesto.
 * Y lo peor no era el número: era que cuatro de esas nueve eran el PASE DE
 * LISTA de los secuaces —Crispo, Chispita, Washo— contado en abstracto por
 * Gabo, treinta segundos antes de que Crispo llegue a presentarse EN PERSONA
 * y diga exactamente lo mismo con su propia voz («nosotros vamos a estar por
 * ahí. Dando vueltas. Mirando»).
 *
 * O sea que la apertura no era larga por generosa: era larga porque contaba
 * dos veces lo mismo, y la primera vez sin que significara nada, porque no
 * habías visto a ninguno de los tres.
 *
 * La regla, y es de guion, no de motor: **a cada quien se le conoce cuando
 * aparece**. El juego ya tiene la maquinaria para eso —`escenas.bienvenida`
 * por personaje, que `_updatePresentacion` dispara cuando el secuaz llega
 * hasta ti— así que no hacía falta escribir nada nuevo. Hacía falta BORRAR.
 *
 * Esto vigila las dos mitades: que la apertura no vuelva a crecer, y que lo
 * que se quitó siga llegando por su camino.
 *
 * Uso: npm run check:apertura-guion   (no necesita servidor)
 */
import { readFileSync } from "node:fs";

const leer = (r) => JSON.parse(readFileSync(new URL(r, import.meta.url), "utf8"));
const dia1 = leer("../public/data/levels/dia-1.json");
const dialogos = leer("../public/data/dialogues.json");

let fallos = 0;
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

// ── 1 · El techo de la apertura ──
// Los dos bloques que caen ANTES de que se pueda jugar: el guion del
// vestíbulo y lo que Gabo suelta al dejarte en tu sitio.
const intro = dia1.intro ?? [];
const puesto = dialogos.encounters?.jefe?.scenes?.[0] ?? [];
const total = intro.length + puesto.length;

// Ocho es lo que hay hoy, y el margen es para que quepa una línea más sin
// que salte la alarma — no para que quepa otra escena.
check("el guion del vestíbulo cabe en cuatro líneas", intro.length <= 5, `${intro.length}`);
check("y lo que Gabo dice en tu puesto, en otras cuatro", puesto.length <= 5, `${puesto.length}`);
check(
  "así que la apertura entera se pasa en ~8 líneas, no en 16",
  total <= 10,
  `${total} líneas antes de poder jugar`
);

// ── 2 · Y lo que se quitó SIGUE LLEGANDO ──
// Un recorte que se limita a borrar deja el juego más corto y más pobre. Lo
// que se cortó de Gabo tiene que seguir contándose donde de verdad se
// entiende: en boca de quien va a hacerlo.
const bienvenidaCrispo = dialogos.encounters?.crispo?.escenas?.bienvenida ?? [];
check(
  "Crispo se presenta EN PERSONA cuando llega a tu puesto",
  bienvenidaCrispo.length > 0,
  "encounters.crispo.escenas.bienvenida está vacía"
);
const textoCrispo = bienvenidaCrispo.map((n) => n.text ?? "").join(" ");
check(
  "y es él quien te dice quiénes son los que miran",
  /washo/i.test(textoCrispo) && /chispita/i.test(textoCrispo),
  textoCrispo.slice(0, 90)
);

// ── 3 · Y GABO YA NO LO CUENTA ANTES ──
// El corazón del arreglo. Si vuelve a nombrarlos en su escena del puesto, el
// pase de lista está contado dos veces otra vez y la apertura vuelve a ser
// una lectura.
const textoPuesto = puesto.map((n) => n.text ?? "").join(" ");
check(
  "y Gabo NO se les adelanta: en tu puesto no pasa lista",
  !/washo/i.test(textoPuesto) && !/chispita/i.test(textoPuesto) && !/crispo/i.test(textoPuesto),
  textoPuesto.slice(0, 120)
);

// ── 4 · Los mandos NO se explican en un diálogo ──
// Salían escritos en la última línea del vestíbulo. Los atajos vienen de UN
// solo sitio (`ui/controls.js`, que además genera el rótulo): contados
// también aquí, se quedan viejos en cuanto cambia una tecla — ya pasó con
// «E para usar» mucho después de que la acción fuera ESPACIO.
const textoIntro = intro.map((n) => n.text ?? "").join(" ");
check(
  "y el guion no explica teclas: para eso está la píldora de mandos",
  !/espacio|barra espaciadora|pulsa .?E.?\b/i.test(textoIntro),
  textoIntro.slice(0, 120)
);

// ── 5 · Pero la apertura sigue CONTANDO algo ──
// El otro extremo: recortar hasta dejarla muda. Tienen que seguir estando
// las tres cosas que la apertura existe para plantar.
check(
  "sigue estando dónde estás",
  /piso 10|ala sur/i.test(textoIntro),
  textoIntro.slice(0, 60)
);
check("sigue estando quién es él", /gabo/i.test(textoIntro));
check(
  "y sigue estando la amenaza: te ve desde su mesa",
  /visibilidad|desde mi mesa|no existo/i.test(textoPuesto),
  textoPuesto.slice(0, 90)
);

console.log(
  fallos === 0
    ? "\nLa apertura planta el sitio, el jefe y la amenaza — y al resto se le conoce cuando aparece"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
