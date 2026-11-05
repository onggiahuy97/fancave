import { describe, expect, it } from 'vitest';
import { TICK_MS } from '@fancave/shared';
import { SnapshotBuffer } from './Interpolation';

describe('SnapshotBuffer', () => {
  const out = { x: 0, z: 0, ry: 0 };

  it('interpolates between snapshots', () => {
    const b = new SnapshotBuffer();
    b.push(0, 0, 0, 0);
    b.push(50, 1, 2, 0);
    b.sample(25, out);
    expect(out.x).toBeCloseTo(0.5);
    expect(out.z).toBeCloseTo(1);
  });

  it('holds the newest snapshot when sampling ahead of it', () => {
    const b = new SnapshotBuffer();
    b.push(0, 0, 0, 0);
    b.push(50, 4, 0, 0);
    b.sample(500, out);
    expect(out.x).toBe(4);
  });

  it('re-anchors after an idle gap so motion does not stretch across it', () => {
    const b = new SnapshotBuffer();
    b.push(0, 0, 0, 0);
    b.push(5000, 1, 0, 0); // first move after 5s idle
    b.sample(5000 - TICK_MS / 2, out);
    expect(out.x).toBeCloseTo(0.5);
  });

  it('takes the short way around when interpolating angles', () => {
    const b = new SnapshotBuffer();
    b.push(0, 0, 0, Math.PI - 0.1);
    b.push(50, 0, 0, -Math.PI + 0.1);
    b.sample(25, out);
    expect(Math.abs(Math.abs(out.ry) - Math.PI)).toBeLessThan(1e-6);
  });
});
