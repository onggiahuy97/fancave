import { describe, expect, it } from 'vitest';
import { MoveBudget, stepMovement } from '@fancave/shared';
import { applyInputBatch } from '../../../server/src/features/movement';
import { LocalPlayer } from './LocalPlayer';

describe('LocalPlayer prediction', () => {
  it('matches the server exactly when the server applies the same inputs', () => {
    const lp = new LocalPlayer({ x: 0, z: 11 });
    const server = { x: 0, z: 11, ry: lp.ry, seq: 0 };
    const budget = new MoveBudget(0);
    for (let i = 0; i < 30; i++) lp.apply(Math.sin(i * 0.2), -1, 1 / 60);
    applyInputBatch(server, budget, { i: lp.drainOutbox().slice(0, 12) }, 1000);
    // Server has acked the first 12 frames; client replays the remaining 18.
    lp.reconcile(server.x, server.z, server.ry, server.seq);
    let ref = { x: 0, z: 11 };
    for (let i = 0; i < 30; i++)
      ref = stepMovement(ref, 0, { dx: Math.sin(i * 0.2), dz: -1, dt: 1 / 60 });
    expect(lp.x).toBeCloseTo(ref.x, 9);
    expect(lp.z).toBeCloseTo(ref.z, 9);
    expect(Math.hypot(lp.errX, lp.errZ)).toBeLessThan(1e-9);
  });

  it('corrects towards the server when it disagrees, smoothing the visual error', () => {
    const lp = new LocalPlayer({ x: 0, z: 11 });
    for (let i = 0; i < 10; i++) lp.apply(1, 0, 0.05);
    const predicted = lp.x;
    // Server only granted half the movement (e.g. budget truncation).
    lp.reconcile(predicted / 2, 11, 0, lp.lastSeq);
    expect(lp.x).toBeCloseTo(predicted / 2, 6);
    expect(lp.errX).toBeCloseTo(predicted / 2, 6);
    lp.decayError(1);
    expect(Math.abs(lp.errX)).toBeLessThan(0.001);
  });

  it('does not record idle frames', () => {
    const lp = new LocalPlayer({ x: 0, z: 11 });
    expect(lp.apply(0, 0, 0.016)).toBe(false);
    expect(lp.drainOutbox()).toEqual([]);
  });
});
