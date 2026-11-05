import type { MoveBudget } from '@fancave/shared';
import { MAX_INPUTS_PER_BATCH, stepMovement } from '@fancave/shared';

export interface MovablePlayer {
  x: number;
  z: number;
  ry: number;
  seq: number;
}

/** Sequence numbers may not jump further ahead than this in one batch. */
const MAX_SEQ_JUMP = 10_000;

export interface BatchResult {
  applied: number;
  rejected: number;
}

/**
 * Validate and apply a client's input batch. The server never trusts positions: it
 * re-simulates each frame with the shared movement code, clamps direction to unit length
 * and dt to the wall-clock budget, then keeps the player inside the walkable area.
 */
export function applyInputBatch(
  player: MovablePlayer,
  budget: MoveBudget,
  raw: unknown,
  nowMs: number,
): BatchResult {
  const result: BatchResult = { applied: 0, rejected: 0 };
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { i?: unknown }).i)) {
    result.rejected++;
    return result;
  }
  const frames = (raw as { i: unknown[] }).i;
  const n = Math.min(frames.length, MAX_INPUTS_PER_BATCH);
  result.rejected += frames.length - n;
  let x = player.x;
  let z = player.z;
  let ry = player.ry;
  let seq = player.seq;
  for (let k = 0; k < n; k++) {
    const f = frames[k];
    if (
      !Array.isArray(f) ||
      f.length !== 4 ||
      !f.every((v) => typeof v === 'number' && Number.isFinite(v))
    ) {
      result.rejected++;
      continue;
    }
    const [s, dx, dz, dt] = f as [number, number, number, number];
    if (!Number.isInteger(s) || s <= seq || s > seq + MAX_SEQ_JUMP) {
      result.rejected++;
      continue;
    }
    const granted = budget.consume(dt, nowMs);
    const r = stepMovement({ x, z }, ry, { dx, dz, dt: granted });
    x = r.x;
    z = r.z;
    ry = r.ry;
    seq = s;
    result.applied++;
  }
  if (result.applied > 0) {
    player.x = x;
    player.z = z;
    player.ry = ry;
    player.seq = seq;
  }
  return result;
}
