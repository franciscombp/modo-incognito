import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WORLD_SCALE as S } from "./config.js";
import { texturedMaterial } from "./textures.js";

// Every work zone on the blueprint prints a seat count (7, 10, 12, 14...).
// This module turns that single number into ONE big white table with that
// many chairs around it — never a scatter of separate little desks.
//
// PERFORMANCE: the floor holds ~250 chairs and ~25 tables. Built naively that
// is well over a thousand meshes, which is what made mid-range tablets crawl
// and then drop the WebGL context. So nothing here creates meshes directly:
// it records transforms into a registry, and the registry emits a handful of
// InstancedMeshes plus one merged geometry per material at the end. Draw calls
// end up in the dozens instead of the thousands.

const TABLE_H = 0.74 * S;
const TOP_T = 0.07 * S;
const CHAIR_GAP = 0.5 * S; // clear distance from the table edge to a chair
const CHAIR_R = 0.22 * S;

// ---------------------------------------------------------------- geometry
// One geometry per repeated part, built once and reused by every instance.

function chairBodyGeometry() {
  const seat = new THREE.CylinderGeometry(CHAIR_R, CHAIR_R * 0.92, 0.1 * S, 8);
  seat.translate(0, 0.44 * S, 0);
  const back = new THREE.BoxGeometry(CHAIR_R * 1.8, 0.34 * S, 0.07 * S);
  back.translate(0, 0.66 * S, CHAIR_R * 0.85);
  return mergeGeometries([seat, back], false);
}

function chairStandGeometry() {
  const column = new THREE.CylinderGeometry(0.045 * S, 0.045 * S, 0.36 * S, 6);
  column.translate(0, 0.22 * S, 0);
  const base = new THREE.CylinderGeometry(CHAIR_R * 0.95, CHAIR_R * 0.95, 0.05 * S, 8);
  base.translate(0, 0.04 * S, 0);
  return mergeGeometries([column, base], false);
}

let shared = null;
function sharedAssets() {
  if (!shared) {
    shared = {
      chairBody: chairBodyGeometry(),
      chairStand: chairStandGeometry(),
      monitor: new THREE.BoxGeometry(0.34 * S, 0.24 * S, 0.04 * S),
      stool: new THREE.CylinderGeometry(0.17 * S, 0.17 * S, 0.45 * S, 8),
      materials: {
        top: new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.45, metalness: 0.02 }),
        edge: new THREE.MeshStandardMaterial({ color: 0xdad6cc, roughness: 0.6 }),
        leg: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.5 }),
        seat: texturedMaterial("fabricDark", { roughness: 0.8 }),
        screen: new THREE.MeshStandardMaterial({
          color: 0x1b1e24,
          emissive: 0x2f6f96,
          emissiveIntensity: 0.75,
        }),
      },
    };
  }
  return shared;
}

// ---------------------------------------------------------------- registry

const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();

function transform(x, y, z, rotY = 0) {
  _pos.set(x, y, z);
  _euler.set(0, rotY, 0);
  _quat.setFromEuler(_euler);
  return _m.compose(_pos, _quat, _scale).clone();
}

/**
 * Collects furniture placements across the whole floor, then emits them as a
 * few instanced/merged meshes. Everything is in world space, so a zone just
 * passes its own origin in.
 */
export function createFurnitureRegistry() {
  const chairs = [];
  const monitors = [];
  const stools = [];
  const slabs = { top: [], edge: [], leg: [] };

  return {
    addChair(x, z, rotY) {
      chairs.push(transform(x, 0, z, rotY));
    },
    addMonitor(x, y, z, rotY) {
      monitors.push(transform(x, y, z, rotY));
    },
    addStool(x, z) {
      stools.push(transform(x, 0.23 * S, z));
    },
    /** A static box that will be merged into the shared slab geometry. */
    addSlab(kind, geometry, x, y, z, rotY = 0) {
      geometry.applyMatrix4(transform(x, y, z, rotY));
      slabs[kind].push(geometry);
    },

    build() {
      const group = new THREE.Group();
      group.name = "furniture";
      const a = sharedAssets();

      const instanced = (geometry, material, list) => {
        if (!list.length) return;
        const mesh = new THREE.InstancedMesh(geometry, material, list.length);
        list.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Instanced meshes share one bounding volume, and this one spans the
        // whole floor — culling it per-instance is not possible, so skip the
        // test entirely rather than pay for a useless check.
        mesh.frustumCulled = false;
        group.add(mesh);
      };

      instanced(a.chairBody, a.materials.seat, chairs);
      instanced(a.chairStand, a.materials.leg, chairs);
      instanced(a.monitor, a.materials.screen, monitors);
      instanced(a.stool, a.materials.seat, stools);

      for (const [kind, list] of Object.entries(slabs)) {
        if (!list.length) continue;
        const merged = mergeGeometries(list, false);
        const mesh = new THREE.Mesh(merged, a.materials[kind]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        list.forEach((g) => g.dispose());
      }

      return group;
    },
  };
}

/**
 * Split `capacity` seats between the two long sides and the two short sides
 * of a rectangle, proportionally to their length. Long sides always get the
 * bulk of the seats; the short sides only pick up the remainder.
 */
export function seatDistribution(capacity, longLen, shortLen) {
  if (capacity <= 0) return { long: 0, short: 0, extra: 0 };
  const share = longLen / (longLen + shortLen);
  const perLong = Math.max(1, Math.round((capacity * share) / 2));
  const perShort = Math.max(0, Math.floor((capacity - perLong * 2) / 2));
  // Any leftover (odd counts) goes to a long side so the table never looks
  // lopsided across its short ends.
  return { long: perLong, short: perShort, extra: capacity - (perLong * 2 + perShort * 2) };
}

/**
 * Places one big table with `capacity` chairs around it, centred on
 * (originX, originZ). Returns the footprint the collision world should use.
 */
export function placeSeatedTable(
  registry,
  { originX, originZ, width, depth, capacity, shape = "rect", monitors = true }
) {
  // Leave room for the chair ring plus a walkway on every side.
  const margin = (CHAIR_GAP + CHAIR_R * 2 + 0.35 * S) * 2;
  const tw = Math.max(1.4 * S, width - margin);
  const td = Math.max(1.0 * S, depth - margin);

  if (shape === "round") {
    const r = Math.min(tw, td) / 2;
    registry.addSlab("top", new THREE.CylinderGeometry(r, r, TOP_T, 20), originX, TABLE_H, originZ);
    registry.addSlab(
      "leg",
      new THREE.CylinderGeometry(0.09 * S, 0.22 * S, TABLE_H, 10),
      originX,
      TABLE_H / 2,
      originZ
    );

    const ringR = r + CHAIR_GAP + CHAIR_R;
    for (let i = 0; i < capacity; i++) {
      const angle = (i / capacity) * Math.PI * 2;
      registry.addChair(
        originX + Math.sin(angle) * ringR,
        originZ + Math.cos(angle) * ringR,
        angle + Math.PI
      );
    }
    return { w: r * 2, d: r * 2 };
  }

  const alongX = tw >= td;
  const longLen = alongX ? tw : td;
  const shortLen = alongX ? td : tw;

  registry.addSlab("top", new THREE.BoxGeometry(tw, TOP_T, td), originX, TABLE_H, originZ);
  registry.addSlab(
    "edge",
    new THREE.BoxGeometry(tw * 0.97, 0.08 * S, td * 0.94),
    originX,
    TABLE_H - TOP_T,
    originZ
  );

  // Trestle legs, one pair per ~2.5 units of length.
  const pairs = Math.max(2, Math.round(longLen / (2.5 * S)));
  for (let i = 0; i < pairs; i++) {
    const t = pairs === 1 ? 0.5 : i / (pairs - 1);
    const along = (t - 0.5) * longLen * 0.86;
    for (const side of [-1, 1]) {
      const across = side * shortLen * 0.38;
      registry.addSlab(
        "leg",
        new THREE.BoxGeometry(0.09 * S, TABLE_H - TOP_T, 0.09 * S),
        originX + (alongX ? along : across),
        (TABLE_H - TOP_T) / 2,
        originZ + (alongX ? across : along)
      );
    }
  }

  const { long, short, extra } = seatDistribution(capacity, longLen, shortLen);
  const longOffset = shortLen / 2 + CHAIR_GAP + CHAIR_R;
  const shortOffset = longLen / 2 + CHAIR_GAP + CHAIR_R;

  const place = (px, pz, facing) => {
    registry.addChair(px, pz, facing);
    if (monitors) {
      // A slim monitor on the table in front of each seat sells "puesto de
      // trabajo" without cluttering the silhouette.
      const inward = 0.34 * S;
      registry.addMonitor(
        px - Math.sin(facing + Math.PI) * inward,
        TABLE_H + 0.16 * S,
        pz - Math.cos(facing + Math.PI) * inward,
        facing
      );
    }
  };

  let leftover = extra;
  for (const side of [-1, 1]) {
    const count = long + (leftover-- > 0 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5;
      const along = t * longLen * 0.92;
      const across = side * longOffset;
      // Chairs face the table: local -Z of the chair points at the top.
      const facing = alongX
        ? side > 0
          ? Math.PI
          : 0
        : side > 0
        ? -Math.PI / 2
        : Math.PI / 2;
      place(originX + (alongX ? along : across), originZ + (alongX ? across : along), facing);
    }
  }

  for (let s = 0; s < 2 && short > 0; s++) {
    const side = s === 0 ? -1 : 1;
    for (let i = 0; i < short; i++) {
      const t = (i + 0.5) / short - 0.5;
      const across = t * shortLen * 0.8;
      const along = side * shortOffset;
      const facing = alongX
        ? side > 0
          ? -Math.PI / 2
          : Math.PI / 2
        : side > 0
        ? Math.PI
        : 0;
      place(originX + (alongX ? along : across), originZ + (alongX ? across : along), facing);
    }
  }

  return { w: tw, d: td };
}

/** Small round bistro table with stools — cafetería dressing. */
export function placeBistroTable(registry, { originX, originZ, seats = 4 }) {
  const r = 0.45 * S;
  registry.addSlab("top", new THREE.CylinderGeometry(r, r, 0.06 * S, 14), originX, 0.72 * S, originZ);
  registry.addSlab(
    "leg",
    new THREE.CylinderGeometry(0.06 * S, 0.18 * S, 0.72 * S, 8),
    originX,
    0.36 * S,
    originZ
  );
  for (let i = 0; i < seats; i++) {
    const angle = (i / seats) * Math.PI * 2;
    registry.addStool(
      originX + Math.sin(angle) * (r + 0.42 * S),
      originZ + Math.cos(angle) * (r + 0.42 * S)
    );
  }
  return { w: r * 2, d: r * 2 };
}

export { TABLE_H };
