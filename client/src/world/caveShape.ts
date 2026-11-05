import { WALL_INNER_RADIUS } from '@fancave/shared';
import { fbm3 } from './noise';

/** Base radius of the cave wall before noise. */
export const WALL_BASE_RADIUS = 18.6;
/** Height where the vertical wall turns into the dome. */
export const DOME_START = 3.5;
export const DOME_HEIGHT = 5.8;
/** Radius at which wall art (posters, screen) is mounted; the wall is flattened behind it. */
export const ART_RADIUS = 17.55;
const FLAT_RADIUS = 17.75;

export interface WallMount {
  angle: number;
  /** Half width in metres. */
  halfWidth: number;
  y: number;
  halfHeight: number;
}

export const POSTER_MOUNTS: WallMount[] = [0.95, 1.32, 2.3, 3.75, 4.62, 5.78].map((angle) => ({
  angle,
  halfWidth: 0.72,
  y: 2.35,
  halfHeight: 0.95,
}));

/** Extension point: wide wall screen for a future scoreboard / watch-party. */
export const SCREEN_MOUNT: WallMount = { angle: Math.PI, halfWidth: 3.2, y: 3.6, halfHeight: 1.6 };

export const TORCH_ANGLES = [0.18, 1.62, 3.05 - 0.55, 3.24 + 0.55, 4.25, 5.35];

const MOUNTS = [...POSTER_MOUNTS, SCREEN_MOUNT];

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

/** 0 = untouched rock, 1 = fully flattened (behind wall art). */
function flatten(theta: number, y: number): number {
  let w = 0;
  for (const m of MOUNTS) {
    const da = angleDiff(theta, m.angle) * ART_RADIUS;
    const dy = Math.abs(y - m.y);
    const ax = 1 - smoothstep(m.halfWidth + 0.15, m.halfWidth + 0.9, da);
    const ay = 1 - smoothstep(m.halfHeight + 0.2, m.halfHeight + 1.2, dy);
    w = Math.max(w, ax * ay);
  }
  return w;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Radial noise offset for the rock at (theta, y). */
export function wallNoise(theta: number, y: number): number {
  return fbm3(Math.cos(theta) * 3.1 + 11, y * 0.42, Math.sin(theta) * 3.1 - 7, 4);
}

/** Inner wall radius at angle theta and height y (for camera collision and props). */
export function wallRadiusAt(theta: number, y: number): number {
  const base = y <= DOME_START ? WALL_BASE_RADIUS : domeRadius(y);
  const rock = base + wallNoise(theta, y) * 1.6 * (base / WALL_BASE_RADIUS);
  const flat = flatten(theta, y);
  const r = rock + (FLAT_RADIUS - rock) * flat;
  return y <= DOME_START ? Math.max(WALL_INNER_RADIUS, r) : r;
}

function domeRadius(y: number): number {
  const s = Math.min(1, (y - DOME_START) / DOME_HEIGHT);
  return WALL_BASE_RADIUS * Math.sqrt(Math.max(0, 1 - s * s));
}

/** Approximate ceiling height above a ground point at distance r from the centre. */
export function ceilingAt(r: number): number {
  const s = Math.min(1, r / WALL_BASE_RADIUS);
  return DOME_START + DOME_HEIGHT * Math.sqrt(Math.max(0, 1 - s * s));
}
