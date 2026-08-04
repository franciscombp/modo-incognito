// Muebles y objetos del entorno que se posicionan relativo al personaje.
// Geometrías procedurales para pruebas, reemplazables con GLBs reales.

import * as THREE from "three";

const furnitureCache = new Map();

/** Cama simple. */
function createBed() {
  const group = new THREE.Group();

  // Marco
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.08, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x8b4513 })
  );
  frame.position.y = 0.04;
  frame.castShadow = true;
  group.add(frame);

  // Colchón
  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.05, 0.45),
    new THREE.MeshStandardMaterial({ color: 0xd4a574 })
  );
  mattress.position.y = 0.075;
  mattress.castShadow = true;
  group.add(mattress);

  // Almohada
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.04, 0.15),
    new THREE.MeshStandardMaterial({ color: 0xf4efe6 })
  );
  pillow.position.set(-0.08, 0.12, -0.15);
  pillow.castShadow = true;
  group.add(pillow);

  return group;
}

/** Puff/asiento suave. */
function createPuff() {
  const group = new THREE.Group();

  // Cuerpo principal (cilindro achatado)
  const puff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.22, 0.25, 32),
    new THREE.MeshStandardMaterial({ color: 0xa8a8a8 })
  );
  puff.position.y = 0.125;
  puff.castShadow = true;
  group.add(puff);

  // Asiento superior (ligera concavidad con esfera)
  const seat = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x969696 })
  );
  seat.scale.z = 0.5;
  seat.position.y = 0.24;
  group.add(seat);

  return group;
}

/** Silla de oficina. */
function createOfficeChair() {
  const group = new THREE.Group();

  // Asiento
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.08, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  seat.position.y = 0.3;
  seat.castShadow = true;
  group.add(seat);

  // Respaldo
  const backrest = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.4, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  backrest.position.set(0, 0.5, -0.15);
  backrest.castShadow = true;
  group.add(backrest);

  // Columna central
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.3, 16),
    new THREE.MeshStandardMaterial({ color: 0x555555 })
  );
  column.position.y = 0.15;
  group.add(column);

  // Base de estrella con RUEDITAS: cinco brazos y una bolita al final de
  // cada uno. Es lo que vende que la silla ruede cuando el empujón se
  // lleva a su dueño (ver npc.rollAway) — un disco plano parecía un taburete.
  const armGeo = new THREE.BoxGeometry(0.2, 0.02, 0.04);
  const armMat = new THREE.MeshStandardMaterial({ color: 0x44485a });
  const wheelGeo = new THREE.SphereGeometry(0.028, 10, 8);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x23263a });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(Math.cos(a) * 0.1, 0.035, Math.sin(a) * 0.1);
    arm.rotation.y = -a;
    arm.castShadow = true;
    group.add(arm);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(Math.cos(a) * 0.18, 0.028, Math.sin(a) * 0.18);
    group.add(wheel);
  }

  return group;
}

/**
 * La computadora del puesto: monitor con pie + teclado. Va anclada al MUNDO
 * (ver anchor en character3d.js): el trabajo no se mueve aunque a su dueño
 * se lo lleve la silla. La pantalla mira a -z, hacia quien se sienta.
 */
function createComputer() {
  const group = new THREE.Group();

  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.05, 0.08, 10),
    new THREE.MeshStandardMaterial({ color: 0x44485a })
  );
  stand.position.y = 0.04;
  group.add(stand);

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x23263a })
  );
  screen.position.set(0, 0.19, 0.01);
  screen.castShadow = true;
  group.add(screen);

  // El "brillo" de la pantalla: un plano emisivo por delante, mirando al
  // asiento. Emissive para que se lea encendida con cualquier luz del día.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x9fd8e8, emissive: 0x77b8d0, emissiveIntensity: 0.65 })
  );
  glow.position.set(0, 0.19, -0.001);
  glow.rotation.y = Math.PI;
  group.add(glow);

  const keyboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.015, 0.09),
    new THREE.MeshStandardMaterial({ color: 0xd8dbe6 })
  );
  keyboard.position.set(0, 0.01, -0.14);
  group.add(keyboard);

  return group;
}

/** Escritorio. */
function createDesk() {
  const group = new THREE.Group();

  // Superficie
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.04, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x8b7355 })
  );
  top.position.y = 0.35;
  top.castShadow = true;
  group.add(top);

  // Patas (4 cilindros)
  const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.35, 12);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x654321 });

  const positions = [
    [-0.35, 0.175, -0.15],
    [0.35, 0.175, -0.15],
    [-0.35, 0.175, 0.15],
    [0.35, 0.175, 0.15],
  ];

  positions.forEach((pos) => {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(...pos);
    leg.castShadow = true;
    group.add(leg);
  });

  // Panel trasero (para tener una silueta)
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x696969 })
  );
  back.position.set(0, 0.4, -0.2);
  back.castShadow = true;
  group.add(back);

  return group;
}

/** TV/Monitor (para la pose de película). */
function createTV() {
  const group = new THREE.Group();

  // Soporte
  const stand = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.4, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  stand.position.y = 0.2;
  stand.castShadow = true;
  group.add(stand);

  // Pantalla
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.35, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x000000 })
  );
  screen.position.y = 0.55;
  screen.castShadow = true;
  group.add(screen);

  // Borde/Marco
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.37, 0.055),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
  );
  frame.position.y = 0.55;
  group.add(frame);

  return group;
}

/** Obtener o crear un mueble. */
export function getFurniture(name) {
  if (furnitureCache.has(name)) {
    return furnitureCache.get(name).clone();
  }

  let furniture;
  switch (name) {
    case "bed":
      furniture = createBed();
      break;
    case "puff":
      furniture = createPuff();
      break;
    case "office_chair":
      furniture = createOfficeChair();
      break;
    case "desk":
      furniture = createDesk();
      break;
    case "tv":
      furniture = createTV();
      break;
    case "computer":
      furniture = createComputer();
      break;
    default:
      return null;
  }

  furnitureCache.set(name, furniture);
  return furniture.clone();
}

/** Limpiar caché. */
export function clearFurnitureCache() {
  furnitureCache.forEach((furniture) => {
    furniture.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  });
  furnitureCache.clear();
}
