import { MAX_INPUT_DT, MOVE_BUDGET_CAP_S, PLAYER_RADIUS, PLAYER_SPEED } from './constants';
import type { Collider } from './world';
import { COLLIDERS, WALK_RADIUS } from './world';

export interface Vec2 {
  x: number;
  z: number;
}

export interface MoveInput {
  dx: number;
  dz: number;
  dt: number;
}

export interface MoveResult {
  x: number;
  z: number;
  /** Facing yaw; unchanged when not moving. */
  ry: number;
  moved: boolean;
}

/** Push a circle at `p` out of one collider (mutates p). Returns true if it overlapped. */
export function resolveCollider(p: Vec2, radius: number, c: Collider): boolean {
  if (c.kind === 'circle') {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const min = radius + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return false;
    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      p.x = c.x + min;
      return true;
    }
    const push = (min - d) / d;
    p.x += dx * push;
    p.z += dz * push;
    return true;
  }
  // Oriented box: move into box-local space.
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  const wx = p.x - c.x;
  const wz = p.z - c.z;
  const lx = wx * cos - wz * sin;
  const lz = wx * sin + wz * cos;
  if (Math.abs(lx) >= c.hw + radius || Math.abs(lz) >= c.hd + radius) return false;
  const cx = Math.max(-c.hw, Math.min(c.hw, lx));
  const cz = Math.max(-c.hd, Math.min(c.hd, lz));
  let ox = lx - cx;
  let oz = lz - cz;
  const d2 = ox * ox + oz * oz;
  let nx: number;
  let nz: number;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    if (d >= radius) return false;
    const push = (radius - d) / d;
    ox *= push;
    oz *= push;
    nx = lx + ox;
    nz = lz + oz;
  } else {
    // Centre inside the box: exit through the nearest face.
    const px = c.hw - Math.abs(lx);
    const pz = c.hd - Math.abs(lz);
    if (px < pz) {
      nx = (lx >= 0 ? 1 : -1) * (c.hw + radius);
      nz = lz;
    } else {
      nx = lx;
      nz = (lz >= 0 ? 1 : -1) * (c.hd + radius);
    }
  }
  p.x = c.x + nx * cos + nz * sin;
  p.z = c.z - nx * sin + nz * cos;
  return true;
}

/** Keep a circle inside the walkable disc (mutates p). */
export function clampToWalkable(p: Vec2, radius = PLAYER_RADIUS): void {
  const max = WALK_RADIUS - radius;
  const d2 = p.x * p.x + p.z * p.z;
  if (d2 > max * max) {
    const s = max / Math.sqrt(d2);
    p.x *= s;
    p.z *= s;
  }
}

export function resolveAll(
  p: Vec2,
  radius = PLAYER_RADIUS,
  colliders: ReadonlyArray<Collider> = COLLIDERS,
): void {
  for (let pass = 0; pass < 2; pass++) {
    let hit = false;
    for (const c of colliders) hit = resolveCollider(p, radius, c) || hit;
    clampToWalkable(p, radius);
    if (!hit) break;
  }
}

/**
 * Deterministic movement step used by both the client (prediction) and the server
 * (authority). The direction is clamped to unit length and dt to MAX_INPUT_DT, so a
 * client can never move faster than PLAYER_SPEED regardless of what it sends.
 */
export function stepMovement(
  from: Vec2,
  ry: number,
  input: MoveInput,
  colliders: ReadonlyArray<Collider> = COLLIDERS,
): MoveResult {
  let { dx, dz } = input;
  const dt = Number.isFinite(input.dt) ? Math.max(0, Math.min(MAX_INPUT_DT, input.dt)) : 0;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) dx = dz = 0;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3 || dt === 0) return { x: from.x, z: from.z, ry, moved: false };
  // Unit direction + analog magnitude (joystick) capped at 1.
  const ux = dx / len;
  const uz = dz / len;
  const dist = PLAYER_SPEED * dt * Math.min(1, len);
  const steps = Math.max(1, Math.ceil(dist / (PLAYER_RADIUS * 0.5)));
  const stepX = (ux * dist) / steps;
  const stepZ = (uz * dist) / steps;
  const p = { x: from.x, z: from.z };
  for (let i = 0; i < steps; i++) {
    p.x += stepX;
    p.z += stepZ;
    resolveAll(p, PLAYER_RADIUS, colliders);
  }
  return { x: p.x, z: p.z, ry: Math.atan2(ux, uz), moved: true };
}

/**
 * Server-side movement time budget. Each input frame claims some dt; the budget refills
 * with real wall-clock time and is capped, so a client that sends inputs faster than
 * real time (speed hack) gets its frames truncated.
 */
export class MoveBudget {
  private budget: number;
  private last: number;

  constructor(
    nowMs: number,
    private readonly cap = MOVE_BUDGET_CAP_S,
  ) {
    this.budget = cap;
    this.last = nowMs;
  }

  /** Returns the dt actually granted (0..dt). */
  consume(dt: number, nowMs: number): number {
    this.refill(nowMs);
    const want = Number.isFinite(dt) ? Math.max(0, Math.min(MAX_INPUT_DT, dt)) : 0;
    const granted = Math.min(want, this.budget);
    this.budget -= granted;
    return granted;
  }

  get remaining(): number {
    return this.budget;
  }

  private refill(nowMs: number): void {
    const elapsed = Math.max(0, (nowMs - this.last) / 1000);
    this.last = nowMs;
    this.budget = Math.min(this.cap, this.budget + elapsed);
  }
}
