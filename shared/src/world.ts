/**
 * Static cave layout shared by client (rendering + prediction) and server (authority).
 * Coordinates: metres, XZ ground plane, Y up. Campfire at the origin.
 */

export interface CircleCollider {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
}

/** Oriented box on the ground plane. Local X = tangential (hw), local Z = radial (hd). */
export interface BoxCollider {
  kind: 'box';
  x: number;
  z: number;
  hw: number;
  hd: number;
  /** Yaw in radians (Three.js convention: rotation about +Y). */
  rot: number;
  /** Height of the top surface (used by the camera). */
  h: number;
}

export type Collider = CircleCollider | BoxCollider;

/** Player centres must stay within this radius of the origin. */
export const WALK_RADIUS = 16.2;
/** Visual wall never comes closer than this (camera + art keep clear of it). */
export const WALL_INNER_RADIUS = 17.2;
export const CEILING_HEIGHT = 9;

export const FIRE_RADIUS = 1.15;

export const SEAT_TIERS = 3;
export const SEAT_FIRST_RADIUS = 4.4;
export const SEAT_TIER_STEP = 1.25;
export const SEAT_DEPTH = 1.0;
export const SEAT_STEP_HEIGHT = 0.42;
/** Angles (radians) of the aisles cut through the amphitheater. */
export const AISLE_ANGLES = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
export const AISLE_HALF_WIDTH = 0.95;

/** Large stalagmite pillars standing in the walkable area. */
export const PILLARS: ReadonlyArray<{ angle: number; radius: number; r: number }> = [
  { angle: 0.35, radius: 13.6, r: 0.75 },
  { angle: 1.9, radius: 14.2, r: 0.9 },
  { angle: 2.75, radius: 12.8, r: 0.6 },
  { angle: 4.1, radius: 14.0, r: 0.85 },
  { angle: 5.2, radius: 13.2, r: 0.7 },
];

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

function buildSeats(): BoxCollider[] {
  const seats: BoxCollider[] = [];
  for (let tier = 0; tier < SEAT_TIERS; tier++) {
    const r = SEAT_FIRST_RADIUS + tier * SEAT_TIER_STEP;
    const n = Math.round((Math.PI * 2 * r) / 1.5);
    const segLen = (Math.PI * 2 * r) / n;
    for (let i = 0; i < n; i++) {
      const theta = ((i + 0.5) / n) * Math.PI * 2;
      const inAisle = AISLE_ANGLES.some(
        (a) => angleDiff(theta, a) * r < AISLE_HALF_WIDTH + segLen * 0.5,
      );
      if (inAisle) continue;
      seats.push({
        kind: 'box',
        x: Math.sin(theta) * r,
        z: Math.cos(theta) * r,
        hw: segLen * 0.48,
        hd: SEAT_DEPTH * 0.5,
        rot: theta,
        h: SEAT_STEP_HEIGHT * (tier + 1),
      });
    }
  }
  return seats;
}

export const SEATS: ReadonlyArray<BoxCollider> = buildSeats();

export const COLLIDERS: ReadonlyArray<Collider> = [
  { kind: 'circle', x: 0, z: 0, r: FIRE_RADIUS },
  ...PILLARS.map<CircleCollider>((p) => ({
    kind: 'circle',
    x: Math.sin(p.angle) * p.radius,
    z: Math.cos(p.angle) * p.radius,
    r: p.r,
  })),
  ...SEATS,
];

/** A random spawn point in the open ring between the seats and the wall. */
export function randomSpawn(rand: () => number = Math.random): { x: number; z: number } {
  // Spawn near an aisle mouth so new fans can walk straight down to the fire.
  const aisle = AISLE_ANGLES[Math.floor(rand() * AISLE_ANGLES.length)] ?? 0;
  const angle = aisle + (rand() - 0.5) * 0.5;
  const radius = 9.6 + rand() * 2.2;
  return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius };
}
