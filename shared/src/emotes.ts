import { EMOTE_COOLDOWN_MS, PUNCH_MIN_DOT, PUNCH_RANGE } from './constants';
import type { EmoteType } from './messages';

export interface Placed {
  id: string;
  x: number;
  z: number;
  ry: number;
}

/** Ids of players standing within PUNCH_RANGE inside the cone in front of `attacker`. */
export function findPunchTargets(
  attacker: Placed,
  others: Iterable<Placed>,
  range = PUNCH_RANGE,
  minDot = PUNCH_MIN_DOT,
): string[] {
  const fx = Math.sin(attacker.ry);
  const fz = Math.cos(attacker.ry);
  const hits: string[] = [];
  for (const o of others) {
    if (o.id === attacker.id) continue;
    const dx = o.x - attacker.x;
    const dz = o.z - attacker.z;
    const d = Math.hypot(dx, dz);
    if (d > range) continue;
    if (d < 1e-4 || (dx * fx + dz * fz) / d >= minDot) hits.push(o.id);
  }
  return hits;
}

/** Per-player, per-emote cooldown tracker. */
export class EmoteCooldown {
  private readonly last = new Map<EmoteType, number>();

  constructor(private readonly cooldownMs = EMOTE_COOLDOWN_MS) {}

  /** Records and returns true if the emote may fire at `nowMs`. */
  tryUse(type: EmoteType, nowMs: number): boolean {
    const prev = this.last.get(type);
    if (prev !== undefined && nowMs - prev < this.cooldownMs) return false;
    this.last.set(type, nowMs);
    return true;
  }

  remainingMs(type: EmoteType, nowMs: number): number {
    const prev = this.last.get(type);
    return prev === undefined ? 0 : Math.max(0, this.cooldownMs - (nowMs - prev));
  }
}

/** Fixed-interval rate limiter (e.g. 1 chat message per second). */
export class RateLimiter {
  private lastAt = -Infinity;

  constructor(private readonly intervalMs: number) {}

  tryConsume(nowMs: number): boolean {
    if (nowMs - this.lastAt < this.intervalMs) return false;
    this.lastAt = nowMs;
    return true;
  }
}
