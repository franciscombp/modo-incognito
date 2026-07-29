import * as THREE from "three";
import { WORLD_SCALE as S } from "./config.js";
import { texturedMaterial } from "./textures.js";

// Every work zone on the blueprint prints a seat count (7, 10, 12, 14...).
// This module turns that single number into ONE big white table with that
// many chairs around it — never a scatter of separate little desks, which is
// the look the reference blueprint and the brief both ask for.

const TABLE_H = 0.74 * S;
const TOP_T = 0.07 * S;
const CHAIR_GAP = 0.5 * S; // clear distance from the table edge to a chair
const CHAIR_R = 0.22 * S;

let sharedMats = null;
function mats() {
  if (!sharedMats) {
    sharedMats = {
      top: new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.45, metalness: 0.02 }),
      edge: new THREE.MeshStandardMaterial({ color: 0xdad6cc, roughness: 0.6 }),
      leg: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.5 }),
      seat: texturedMaterial("fabricDark", { roughness: 0.8 }),
      screen: new THREE.MeshStandardMaterial({
        color: 0x1b1e24,
        emissive: 0x2f6f96,
        emissiveIntensity: 0.75,
      }),
    };
  }
  return sharedMats;
}

/** A low-poly task chair: seat puck, backrest, single column, star base. */
function createChair(angleY) {
  const m = mats();
  const chair = new THREE.Group();

  const seat = new THREE.Mesh(new THREE.CylinderGeometry(CHAIR_R, CHAIR_R * 0.92, 0.1 * S, 10), m.seat);
  seat.position.y = 0.44 * S;
  seat.castShadow = true;
  chair.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(CHAIR_R * 1.8, 0.34 * S, 0.07 * S), m.seat);
  back.position.set(0, 0.66 * S, CHAIR_R * 0.85);
  back.castShadow = true;
  chair.add(back);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * S, 0.045 * S, 0.36 * S, 6), m.leg);
  column.position.y = 0.22 * S;
  chair.add(column);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(CHAIR_R * 0.95, CHAIR_R * 0.95, 0.05 * S, 8), m.leg);
  base.position.y = 0.04 * S;
  chair.add(base);

  chair.rotation.y = angleY;
  return chair;
}

/**
 * Split `capacity` seats between the two long sides and the two short sides
 * of a rectangle, proportionally to their length. Long sides always get the
 * bulk of the seats; the short sides only pick up the remainder.
 */
export function seatDistribution(capacity, longLen, shortLen) {
  if (capacity <= 0) return { long: 0, short: 0, extra: 0 };
  const share = longLen / (longLen + shortLen);
  let perLong = Math.max(1, Math.round((capacity * share) / 2));
  let perShort = Math.floor((capacity - perLong * 2) / 2);
  if (perShort < 0) perShort = 0;
  let placed = perLong * 2 + perShort * 2;
  // Any leftover (odd counts) goes to a long side so the table never looks
  // lopsided across its short ends.
  return { long: perLong, short: perShort, extra: capacity - placed };
}

/**
 * One big table sized to the zone, with `capacity` chairs around it.
 * Returns the mesh group plus the footprint the collision world should use.
 */
export function createSeatedTable({
  width,
  depth,
  capacity,
  shape = "rect",
  monitors = true,
}) {
  const group = new THREE.Group();
  const m = mats();

  // Leave room for the chair ring plus a walkway on every side.
  const margin = (CHAIR_GAP + CHAIR_R * 2 + 0.35 * S) * 2;
  let tw = Math.max(1.4 * S, width - margin);
  let td = Math.max(1.0 * S, depth - margin);

  if (shape === "round") {
    const r = Math.min(tw, td) / 2;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, TOP_T, 20), m.top);
    top.position.y = TABLE_H;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * S, 0.22 * S, TABLE_H, 10), m.leg);
    pedestal.position.y = TABLE_H / 2;
    group.add(pedestal);

    const ringR = r + CHAIR_GAP + CHAIR_R;
    for (let i = 0; i < capacity; i++) {
      const a = (i / capacity) * Math.PI * 2;
      const chair = createChair(a + Math.PI);
      chair.position.set(Math.sin(a) * ringR, 0, Math.cos(a) * ringR);
      group.add(chair);
    }
    return { group, collider: { w: r * 2, d: r * 2 } };
  }

  const alongX = tw >= td;
  const longLen = alongX ? tw : td;
  const shortLen = alongX ? td : tw;

  // Table top: a single slab, with a thin darker edge band so it reads as a
  // solid piece of furniture rather than a floating plane.
  const top = new THREE.Mesh(new THREE.BoxGeometry(tw, TOP_T, td), m.top);
  top.position.y = TABLE_H;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.97, 0.08 * S, td * 0.94), m.edge);
  skirt.position.y = TABLE_H - TOP_T;
  group.add(skirt);

  // Trestle legs, one pair per ~2.5 units of length.
  const pairs = Math.max(2, Math.round(longLen / (2.5 * S)));
  for (let i = 0; i < pairs; i++) {
    const t = pairs === 1 ? 0.5 : i / (pairs - 1);
    const along = (t - 0.5) * longLen * 0.86;
    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.09 * S, TABLE_H - TOP_T, 0.09 * S),
        m.leg
      );
      const across = side * shortLen * 0.38;
      leg.position.set(alongX ? along : across, (TABLE_H - TOP_T) / 2, alongX ? across : along);
      group.add(leg);
    });
  }

  const { long, short, extra } = seatDistribution(capacity, longLen, shortLen);
  const longOffset = shortLen / 2 + CHAIR_GAP + CHAIR_R;
  const shortOffset = longLen / 2 + CHAIR_GAP + CHAIR_R;

  const place = (px, pz, facing) => {
    const chair = createChair(facing);
    chair.position.set(px, 0, pz);
    group.add(chair);
    if (monitors) {
      // A slim monitor on the table in front of each seat sells "puesto de
      // trabajo" without cluttering the silhouette.
      const screen = new THREE.Mesh(
        new THREE.BoxGeometry(0.34 * S, 0.24 * S, 0.04 * S),
        mats().screen
      );
      const inward = 0.34 * S;
      screen.position.set(
        px - Math.sin(facing + Math.PI) * inward,
        TABLE_H + 0.16 * S,
        pz - Math.cos(facing + Math.PI) * inward
      );
      screen.rotation.y = facing;
      group.add(screen);
    }
  };

  let leftover = extra;
  [-1, 1].forEach((side) => {
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
      place(alongX ? along : across, alongX ? across : along, facing);
    }
  });

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
      place(alongX ? along : across, alongX ? across : along, facing);
    }
  }

  return { group, collider: { w: tw, d: td } };
}

/** Small round bistro table with stools — cafetería dressing. */
export function createBistroTable(seats = 4) {
  const group = new THREE.Group();
  const m = mats();
  const r = 0.45 * S;

  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06 * S, 14), m.top);
  top.position.y = 0.72 * S;
  top.castShadow = true;
  group.add(top);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * S, 0.18 * S, 0.72 * S, 8), m.leg);
  stem.position.y = 0.36 * S;
  group.add(stem);

  for (let i = 0; i < seats; i++) {
    const a = (i / seats) * Math.PI * 2;
    const stool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17 * S, 0.17 * S, 0.45 * S, 8),
      m.seat
    );
    stool.position.set(Math.sin(a) * (r + 0.42 * S), 0.23 * S, Math.cos(a) * (r + 0.42 * S));
    stool.castShadow = true;
    group.add(stool);
  }
  return { group, collider: { w: r * 2, d: r * 2 } };
}

export { TABLE_H, createChair };
