import * as THREE from "three";
import { WORLD_SCALE as S } from "./config.js";

/**
 * LOS CHARCOS DE LUZ DE VENTANA.
 *
 * Es la pieza que hace que la hora se VEA, y sale directamente de
 * `docs/referencias/ref-noche-azul.png`: en esa imagen lo que dice qué hora
 * es no es el tinte de la escena, son los RECTÁNGULOS de luz que las
 * ventanas dibujan en el suelo. El sol moviéndose (ver `lighting.js`) ya da
 * la sombra; esto da la otra mitad, que es la luz.
 *
 * ── POR QUÉ NO SON SOMBRAS DE VERDAD ─────────────────────────────────
 *
 * Lo natural sería que los montantes de la fachada proyectaran sombra y las
 * franjas salieran solas. No sirve: el sol es UNA luz direccional con un
 * mapa de sombras que cubre el piso entero, y a esa resolución un montante
 * de 10 cm no deja franja, deja un borrón. Subir el mapa para que sí las
 * dejara es pagar memoria y relleno por todo el piso para un detalle del
 * borde.
 *
 * Así que se dibujan: una tira por tramo de fachada, cortada en bandas a la
 * misma separación que los montantes.
 *
 * ── CÓMO SE DEFORMAN SIN RECONSTRUIR GEOMETRÍA ───────────────────────
 *
 * La geometría se crea UNA vez, en el espacio local de su tramo: la x corre
 * a lo largo de la fachada y la z va de 0 (al pie del vidrio) a 1 (el fondo
 * del charco). Mover el sol solo cambia la MATRIZ del objeto, con un
 * cizallamiento que estira esa z hasta la profundidad real y desplaza la x
 * según lo oblicuo que entre el sol.
 *
 * Se hace así porque reconstruir vértices cada frame —trece tramos por
 * varias bandas cada uno— es justo el trabajo que no hay que hacer sesenta
 * veces por segundo. `Object3D` no sabe cizallar con posición/rotación/
 * escala, pero sí acepta una matriz escrita a mano.
 */

/** Separación entre montantes, la MISMA de `buildPerimeterWalls`. */
const MULLION_SPACING = 2.6 * S;

/** Parte de cada vano que deja pasar luz; el resto es el montante. */
const BAY_FILL = 0.8;

/**
 * Hasta dónde puede entrar un charco.
 *
 * Con el sol bajo, `alto / tan(elevación)` se va a decenas de metros y el
 * charco cruzaría el piso entero y se saldría por el otro lado, al vacío.
 * Se recorta, y a cambio se le baja la opacidad: un charco larguísimo
 * también es un charco tenue, así que el recorte se lee como atenuación en
 * vez de como un corte.
 */
const MAX_DEPTH = 11 * S;

/** A ras de suelo, por encima de las moquetas para no pelearse con ellas. */
const POOL_Y = 0.045 * S;

/**
 * Cuánto piso queda desde (ox,oz) siguiendo la dirección (dx,dz) hasta salir
 * del contorno. Es un lanzamiento de rayo contra cada arista, quedándose con
 * el corte positivo más cercano.
 *
 * Se calcula UNA vez por tramo al montar el piso, no por frame: el contorno
 * no se mueve.
 */
function distanceToBoundary(footprint, ox, oz, dx, dz) {
  let best = Infinity;
  for (let i = 0; i < footprint.length; i++) {
    const [x1, z1] = footprint[i];
    const [x2, z2] = footprint[(i + 1) % footprint.length];
    const ex = x2 - x1;
    const ez = z2 - z1;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue; // paralelos
    const t = ((x1 - ox) * ez - (z1 - oz) * ex) / den;
    const u = ((x1 - ox) * dz - (z1 - oz) * dx) / den;
    // t = distancia a lo largo del rayo, u = posición dentro de la arista.
    // El 0.01 evita quedarse con la propia arista de la que sale el rayo.
    if (t > 0.01 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return Number.isFinite(best) ? best : MAX_DEPTH;
}

function poolGeometry(length) {
  // Una banda por vano, con hueco donde va el montante. En local: x a lo
  // largo del muro, z de 0 (pie del vidrio) a 1 (fondo del charco).
  const count = Math.max(1, Math.round(length / MULLION_SPACING));
  const bay = length / count;
  const positions = [];
  const uvs = [];
  for (let i = 0; i < count; i++) {
    const cx = -length / 2 + bay * (i + 0.5);
    const half = (bay * BAY_FILL) / 2;
    const x0 = cx - half;
    const x1 = cx + half;
    // Dos triángulos por banda. La v de la UV lleva la profundidad, que es
    // lo que usa el shader de opacidad para desvanecer el borde de dentro.
    positions.push(x0, 0, 0, x1, 0, 0, x1, 0, 1, x0, 0, 0, x1, 0, 1, x0, 0, 1);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Monta los charcos sobre el contorno del piso.
 *
 * `windowH` llega por parámetro en vez de importarse: el alto de fachada se
 * define en `builder.js`, que es quien construye el muro, y duplicarlo aquí
 * sería el clásico segundo sitio donde vive un número que luego se separa.
 *
 * @param {Array<[number,number]>} footprint Contorno, en orden.
 * @param {number} windowH Alto del vidrio de fachada.
 * @returns objeto con `group` (para añadir a la escena) y `update(sun)`.
 */
export function createSunPools(footprint, windowH) {
  const group = new THREE.Group();
  group.name = "sunPools";
  // No proyecta ni recibe sombra: es luz, no un objeto.
  group.castShadow = false;
  group.receiveShadow = false;

  const material = new THREE.MeshBasicMaterial({
    color: 0xffe6bd,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    // Sin escribir en el buffer de profundidad: son manchas de luz apiladas
    // sobre el suelo, y escribiendo se recortan entre ellas.
    depthWrite: false,
    // Pero SÍ se comprueban contra la escena, para que un escritorio tape su
    // charco. Una luz que atraviesa los muebles no se lee como luz.
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  // ── DE QUÉ LADO ESTÁ "DENTRO" ────────────────────────────────────────
  //
  // La normal interior es un giro de 90° de la tangente, pero HACIA QUÉ LADO
  // depende del sentido en que esté escrito el contorno. Darlo por supuesto
  // fue el primer fallo de esto: la mitad de los charcos salían hacia FUERA
  // del edificio y se dibujaban flotando sobre el vacío.
  //
  // El área con signo lo dice sin tener que suponer nada, y aguanta que
  // alguien reordene los puntos del contorno en el JSON.
  let area2 = 0;
  for (let i = 0; i < footprint.length; i++) {
    const [x1, z1] = footprint[i];
    const [x2, z2] = footprint[(i + 1) % footprint.length];
    area2 += x1 * z2 - x2 * z1;
  }
  const inwardSign = area2 > 0 ? 1 : -1;

  const segments = [];
  for (let i = 0; i < footprint.length; i++) {
    const [x1, z1] = footprint[i];
    const [x2, z2] = footprint[(i + 1) % footprint.length];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    if (length < 0.5) continue;

    const tx = dx / length;
    const tz = dz / length;
    const nx = tz * inwardSign;
    const nz = -tx * inwardSign;

    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;

    // La tira se acorta un pelin por los extremos: tiene ANCHO, y sus
    // esquinas se salen por la esquina del edificio antes que su centro,
    // que es de donde se lanza el rayo de recorte.
    const mesh = new THREE.Mesh(poolGeometry(length * 0.9), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    group.add(mesh);

    // Los extremos del tramo se meten un poco hacia dentro: la tira tiene
    // ANCHO, así que sus esquinas se salen por la esquina del edificio antes
    // que su centro. Recortarla un pelín es más barato que recortar contra el
    // contorno cuatro veces por tira.
    segments.push({ mesh, cx, cz, tx, tz, nx, nz, x1, z1, x2, z2 });
  }

  const _m = new THREE.Matrix4();
  const _shear = new THREE.Matrix4();

  return {
    group,

    /**
     * Recoloca los charcos para la posición actual del sol.
     *
     * @param {THREE.DirectionalLight} sun La luz con sombra.
     * @param {number} strength 0..1, cuánto pega el sol ahora mismo.
     */
    update(sun, strength = 1) {
      const p = sun.position;
      const horiz = Math.hypot(p.x, p.z);
      // Con el sol en el cenit no hay charco que dibujar: la luz entra por
      // el techo, que en un diorama no existe.
      if (horiz < 1e-3 || strength <= 0.001) {
        segments.forEach((s) => (s.mesh.visible = false));
        return;
      }

      // Dirección en la que VIAJA la luz, en horizontal (del sol al piso).
      const dx = -p.x / horiz;
      const dz = -p.z / horiz;
      // Cuánto se desplaza en horizontal la luz que entra por lo alto de la
      // ventana: alto / tan(elevación).
      const tanElev = p.y / horiz;
      const reach = windowH / Math.max(tanElev, 0.08);
      const wanted = Math.min(reach, MAX_DEPTH);

      material.color.copy(sun.color);

      let fadeSum = 0;
      let shown = 0;
      for (const s of segments) {
        // Cuánto entra de frente por este tramo. Negativo = el sol le da por
        // detrás, así que ese tramo está a la sombra y no dibuja nada.
        const facing = dx * s.nx + dz * s.nz;
        if (facing <= 0.02) {
          s.mesh.visible = false;
          continue;
        }
        // ── Y NO MÁS ALLÁ DE DONDE HAY PISO ──────────────────────────
        //
        // El rayo se lanza en la dirección REAL de la luz, no a lo largo de
        // la normal. Fue el segundo fallo de esto: recortando solo la
        // profundidad hacia dentro, con el sol rasante el charco se
        // deslizaba de lado trece metros, se pasaba de largo la esquina del
        // edificio y quedaba flotando sobre el vacío.
        //
        // Se mide desde los DOS extremos del tramo y manda el más corto,
        // porque la tira tiene ancho y basta con que se salga una punta.
        const room = Math.min(
          distanceToBoundary(footprint, s.x1, s.z1, dx, dz),
          distanceToBoundary(footprint, s.x2, s.z2, dx, dz)
        );
        const depthWanted = Math.min(wanted, room * 0.82);
        if (depthWanted < 0.4) {
          s.mesh.visible = false;
          continue;
        }
        // El desplazamiento lateral se mide sobre el eje X LOCAL de la tira,
        // que tras la rotación es (nz, -nx) — NO la tangente del muro. Es el
        // tercer fallo que tuvo esto: usando la tangente, el charco se
        // deslizaba al lado contrario, se pasaba de largo la esquina del
        // edificio y salía flotando sobre el vacío. Derivarlo de la base real
        // en vez de adivinar el signo lo cierra para siempre.
        const lateral = (dx * s.nz - dz * s.nx) * depthWanted;
        const depth = facing * depthWanted;
        fadeSum += depthWanted / Math.max(reach, 1e-3);
        shown++;

        _shear.set(1, 0, lateral, 0, 0, 1, 0, 0, 0, 0, depth, 0, 0, 0, 0, 1);
        _m.makeRotationY(Math.atan2(s.nx, s.nz));
        _m.setPosition(s.cx, POOL_Y, s.cz);
        s.mesh.matrix.multiplyMatrices(_m, _shear);
        s.mesh.visible = true;
      }

      // Un sol rasante da luz muy oblicua y pobre; uno alto, charcos cortos
      // y marcados. La curva es suave para que amanecer y anochecer no
      // enciendan los charcos de golpe.
      //
      // `clipFade` es cuánto se ha tenido que recortar de media: un charco al
      // que le falta la mitad del recorrido también es un charco tenue, así
      // que el recorte se paga en opacidad y se lee como atenuación en vez de
      // como un corte seco contra el borde del piso.
      const clipFade = shown ? fadeSum / shown : 0;
      const elevFade = Math.min(1, Math.max(0, tanElev * 1.6));
      material.opacity = 0.3 * strength * clipFade * (0.35 + 0.65 * elevFade);
    },

    dispose() {
      segments.forEach((s) => s.mesh.geometry.dispose());
      material.dispose();
    },
  };
}
