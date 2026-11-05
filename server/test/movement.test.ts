import { describe, expect, it } from 'vitest';
import {
  COLLIDERS,
  FIRE_RADIUS,
  MAX_INPUT_DT,
  MAX_INPUTS_PER_BATCH,
  MOVE_BUDGET_CAP_S,
  MoveBudget,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  SEAT_FIRST_RADIUS,
  SEAT_TIER_STEP,
  SEAT_TIERS,
  SEAT_DEPTH,
  WALK_RADIUS,
  stepMovement,
} from '@fancave/shared';
import { applyInputBatch } from '../src/features/movement';
import type { InputTuple } from '@fancave/shared';

const open = { x: 0, z: 11 }; // open ring between seats and wall, on an aisle-free spot

function player(x = open.x, z = open.z) {
  return { x, z, ry: 0, seq: 0 };
}

function frames(count: number, dx: number, dz: number, dt: number, startSeq = 1): InputTuple[] {
  return Array.from({ length: count }, (_, i) => [startSeq + i, dx, dz, dt] as InputTuple);
}

describe('stepMovement', () => {
  it('never exceeds PLAYER_SPEED even with an oversized direction vector', () => {
    const r = stepMovement(open, 0, { dx: 1000, dz: 0, dt: 0.05 }, []);
    expect(Math.hypot(r.x - open.x, r.z - open.z)).toBeCloseTo(PLAYER_SPEED * 0.05, 5);
  });

  it('clamps dt to MAX_INPUT_DT', () => {
    const r = stepMovement(open, 0, { dx: 1, dz: 0, dt: 10 }, []);
    expect(Math.hypot(r.x - open.x, r.z - open.z)).toBeCloseTo(PLAYER_SPEED * MAX_INPUT_DT, 5);
  });

  it('treats NaN / Infinity as no movement', () => {
    expect(stepMovement(open, 1, { dx: NaN, dz: 1, dt: 0.05 }).moved).toBe(false);
    expect(stepMovement(open, 1, { dx: 1, dz: 0, dt: Infinity }).moved).toBe(false);
    expect(stepMovement(open, 1, { dx: 1, dz: 0, dt: -1 }).moved).toBe(false);
  });

  it('honours analog magnitude below 1 (joystick)', () => {
    const r = stepMovement(open, 0, { dx: 0.5, dz: 0, dt: 0.1 }, []);
    expect(r.x - open.x).toBeCloseTo(PLAYER_SPEED * 0.1 * 0.5, 5);
  });

  it('faces the direction of travel', () => {
    const r = stepMovement(open, 0, { dx: 1, dz: 0, dt: 0.05 }, []);
    expect(r.ry).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('walkable area', () => {
  it('keeps players inside the cave wall', () => {
    let p = { x: 0, z: 14 };
    for (let i = 0; i < 200; i++) p = stepMovement(p, 0, { dx: 0, dz: 1, dt: 0.1 });
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(WALK_RADIUS - PLAYER_RADIUS + 1e-6);
  });

  it('cannot walk into the campfire', () => {
    // Down the 45deg aisle straight at the fire.
    const a = Math.PI / 4;
    let p = { x: Math.sin(a) * 10, z: Math.cos(a) * 10 };
    let closest = Infinity;
    for (let i = 0; i < 200; i++) {
      p = stepMovement(p, 0, { dx: -Math.sin(a), dz: -Math.cos(a), dt: 0.1 });
      closest = Math.min(closest, Math.hypot(p.x, p.z));
    }
    // Reaches the fire ring but never enters it (it may slide around and carry on).
    expect(closest).toBeGreaterThanOrEqual(FIRE_RADIUS + PLAYER_RADIUS - 1e-6);
    expect(closest).toBeLessThan(FIRE_RADIUS + PLAYER_RADIUS + 0.05);
  });

  it('is blocked by the seating tiers away from the aisles', () => {
    let p = { x: 0, z: 10 };
    for (let i = 0; i < 200; i++) p = stepMovement(p, 0, { dx: 0, dz: -1, dt: 0.1 });
    const outer = SEAT_FIRST_RADIUS + (SEAT_TIERS - 1) * SEAT_TIER_STEP + SEAT_DEPTH / 2;
    // Seat segments are flat chords, so the face is slightly inside the outer arc.
    expect(p.z).toBeGreaterThan(outer + PLAYER_RADIUS - 0.15);
    expect(p.z).toBeLessThan(outer + PLAYER_RADIUS + 0.05);
  });

  it('random walks never end a step overlapping a collider (fuzz)', () => {
    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const violations: string[] = [];
    for (let walk = 0; walk < 60; walk++) {
      const ang = rand() * Math.PI * 2;
      let p = { x: Math.sin(ang) * 11, z: Math.cos(ang) * 11 };
      let dir = rand() * Math.PI * 2;
      for (let i = 0; i < 300; i++) {
        if (rand() < 0.05) dir = rand() * Math.PI * 2;
        p = stepMovement(p, 0, { dx: Math.sin(dir), dz: Math.cos(dir), dt: 0.05 + rand() * 0.05 });
        for (const c of COLLIDERS) {
          if (c.kind === 'circle') {
            if (Math.hypot(p.x - c.x, p.z - c.z) < c.r + PLAYER_RADIUS - 0.01)
              violations.push(`circle ${walk}:${i}`);
          } else {
            const cos = Math.cos(c.rot);
            const sin = Math.sin(c.rot);
            const lx = (p.x - c.x) * cos - (p.z - c.z) * sin;
            const lz = (p.x - c.x) * sin + (p.z - c.z) * cos;
            if (Math.abs(lx) < c.hw && Math.abs(lz) < c.hd) violations.push(`box ${walk}:${i}`);
          }
        }
        if (Math.hypot(p.x, p.z) > WALK_RADIUS - PLAYER_RADIUS + 1e-6)
          violations.push(`wall ${walk}:${i}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('MoveBudget (anti speed-hack)', () => {
  it('starts full and refuses time it does not have', () => {
    const b = new MoveBudget(0);
    let granted = 0;
    for (let i = 0; i < 50; i++) granted += b.consume(0.1, 0);
    expect(granted).toBeCloseTo(MOVE_BUDGET_CAP_S, 6);
  });

  it('refills with wall-clock time up to the cap', () => {
    const b = new MoveBudget(0);
    b.consume(0.1, 0);
    b.consume(0.1, 0);
    b.consume(0.1, 0);
    b.consume(0.1, 0);
    b.consume(0.1, 0);
    expect(b.consume(0.1, 0)).toBeCloseTo(0, 9);
    expect(b.consume(0.1, 50)).toBeCloseTo(0.05, 6);
    expect(b.consume(0.1, 60_000)).toBeCloseTo(0.1, 6);
    expect(b.remaining).toBeCloseTo(MOVE_BUDGET_CAP_S - 0.1, 6);
  });
});

describe('applyInputBatch', () => {
  it('applies valid frames and acks the last sequence number', () => {
    const p = player();
    const r = applyInputBatch(p, new MoveBudget(0), { i: frames(3, 1, 0, 0.05) }, 0);
    expect(r).toEqual({ applied: 3, rejected: 0 });
    expect(p.seq).toBe(3);
    expect(p.x).toBeCloseTo(PLAYER_SPEED * 0.15, 4);
  });

  it('a speed hacker flooding inputs cannot outrun real time', () => {
    const p = player(0, 11);
    const budget = new MoveBudget(0);
    // 10 batches of max-size frames all claiming 0.1s, sent within the same 100ms.
    let seq = 1;
    for (let k = 0; k < 10; k++) {
      applyInputBatch(p, budget, { i: frames(MAX_INPUTS_PER_BATCH, 1, 0, 0.1, seq) }, k * 10);
      seq += MAX_INPUTS_PER_BATCH;
    }
    const maxLegit = PLAYER_SPEED * (MOVE_BUDGET_CAP_S + 0.1);
    expect(Math.hypot(p.x - 0, p.z - 11)).toBeLessThanOrEqual(maxLegit + 1e-6);
  });

  it('ignores frames beyond the per-batch limit', () => {
    const p = player();
    const r = applyInputBatch(
      p,
      new MoveBudget(0),
      { i: frames(MAX_INPUTS_PER_BATCH + 5, 1, 0, 0.01) },
      0,
    );
    expect(r.applied).toBe(MAX_INPUTS_PER_BATCH);
    expect(r.rejected).toBe(5);
  });

  it('rejects replayed or out-of-order sequence numbers', () => {
    const p = player();
    const b = new MoveBudget(0);
    applyInputBatch(p, b, { i: frames(2, 1, 0, 0.05) }, 0);
    const x = p.x;
    const r = applyInputBatch(
      p,
      b,
      {
        i: [
          [2, 1, 0, 0.05],
          [1, 1, 0, 0.05],
        ],
      },
      100,
    );
    expect(r).toEqual({ applied: 0, rejected: 2 });
    expect(p.x).toBe(x);
  });

  it('rejects huge sequence jumps and non-integer sequence numbers', () => {
    const p = player();
    const r = applyInputBatch(
      p,
      new MoveBudget(0),
      {
        i: [
          [1e9, 1, 0, 0.05],
          [1.5, 1, 0, 0.05],
        ],
      },
      0,
    );
    expect(r).toEqual({ applied: 0, rejected: 2 });
  });

  it.each([
    ['null', null],
    ['string', 'hello'],
    ['missing i', { x: 1 }],
    ['i not array', { i: 5 }],
  ])('rejects malformed payload: %s', (_label, payload) => {
    const p = player();
    const r = applyInputBatch(p, new MoveBudget(0), payload, 0);
    expect(r.applied).toBe(0);
    expect(p).toEqual(player());
  });

  it('rejects malformed frames but keeps good ones', () => {
    const p = player();
    const bad = [[1, 'x', 0, 0.05], [2, NaN, 0, 0.05], [3, 1, 0], { 0: 4 }, [5, 1, 0, 0.05]];
    const r = applyInputBatch(p, new MoveBudget(0), { i: bad }, 0);
    expect(r).toEqual({ applied: 1, rejected: 4 });
    expect(p.seq).toBe(5);
  });
});
