// Accesorios pequeños que se adjuntan a huesos del personaje.
// Cada prop es una geometría + material que se monta en la mano u otra parte.
// Después se reemplazan estos con GLBs reales.

import * as THREE from "three";

const propCache = new Map();

/** Crear una taza de café simple (cilindro + mango). */
function createCoffee() {
  const group = new THREE.Group();

  // Cuerpo de la taza
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.1, 16),
    new THREE.MeshStandardMaterial({ color: 0xcccccc })
  );
  body.position.y = 0.05;
  group.add(body);

  // Mango
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.02, 8, 16, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xcccccc })
  );
  handle.position.set(0.1, 0.05, 0);
  handle.rotation.z = Math.PI / 2;
  group.add(handle);

  return group;
}

/** Plato con comida. */
function createFood() {
  const group = new THREE.Group();

  // Plato
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.02, 32),
    new THREE.MeshStandardMaterial({ color: 0xf4efe6 })
  );
  plate.position.y = 0.01;
  group.add(plate);

  // Comida (pequeñas esferas)
  const foodMaterial = new THREE.MeshStandardMaterial({ color: 0xff9800 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const food = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 8),
      foodMaterial
    );
    food.position.set(
      Math.cos(angle) * 0.06,
      0.04,
      Math.sin(angle) * 0.06
    );
    group.add(food);
  }

  // Comida central
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xd2691e })
  );
  center.position.y = 0.04;
  group.add(center);

  return group;
}

/** Palomitas de maíz. */
function createPopcorn() {
  const group = new THREE.Group();

  // Contenedor (cono)
  const container = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.15, 16),
    new THREE.MeshStandardMaterial({ color: 0xd2691e })
  );
  container.position.y = 0.075;
  group.add(container);

  // Palomitas (esferas pequeñas esparcidas)
  const popcornMat = new THREE.MeshStandardMaterial({ color: 0xffc107 });
  for (let i = 0; i < 12; i++) {
    const x = (Math.random() - 0.5) * 0.15;
    const y = 0.1 + Math.random() * 0.1;
    const z = (Math.random() - 0.5) * 0.15;
    const pop = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 6, 6),
      popcornMat
    );
    pop.position.set(x, y, z);
    group.add(pop);
  }

  return group;
}

/** Teléfono. */
function createPhone() {
  const group = new THREE.Group();

  const phone = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.1, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x1a1a2e })
  );
  group.add(phone);

  // Pantalla
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.08, 0.012),
    new THREE.MeshStandardMaterial({ color: 0x22252e })
  );
  screen.position.z = 0.005;
  group.add(screen);

  return group;
}

/** Documentos/papeles. */
function createDocuments() {
  const group = new THREE.Group();

  const docMat = new THREE.MeshStandardMaterial({ color: 0xf4efe6 });

  // Pila de papeles
  for (let i = 0; i < 3; i++) {
    const doc = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.11, 0.001),
      docMat
    );
    doc.position.y = i * 0.002;
    doc.rotation.z = (Math.random() - 0.5) * 0.1;
    group.add(doc);
  }

  return group;
}

/** Obtener o crear un prop. */
export function getProp(name) {
  if (propCache.has(name)) {
    return propCache.get(name).clone();
  }

  let prop;
  switch (name) {
    case "coffee":
      prop = createCoffee();
      break;
    case "food":
      prop = createFood();
      break;
    case "popcorn":
      prop = createPopcorn();
      break;
    case "phone":
      prop = createPhone();
      break;
    case "documents":
      prop = createDocuments();
      break;
    default:
      return null;
  }

  propCache.set(name, prop);
  return prop.clone();
}

/** Limpiar caché. */
export function clearPropCache() {
  propCache.forEach((prop) => {
    prop.traverse((obj) => {
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
  propCache.clear();
}
