import { TICK_MS } from '@fancave/shared';

interface Snapshot {
  t: number;
  x: number;
  z: number;
  ry: number;
}

const MAX_SNAPSHOTS = 24;

/** Buffers authoritative snapshots of a remote player and samples them in the past. */
export class SnapshotBuffer {
  private readonly snaps: Snapshot[] = [];

  push(t: number, x: number, z: number, ry: number): void {
    const last = this.snaps[this.snaps.length - 1];
    // After an idle gap, re-anchor the previous position one tick ago so the motion
    // starts smoothly instead of stretching across the whole gap.
    if (last && t - last.t > TICK_MS * 3) {
      this.snaps.push({ t: t - TICK_MS, x: last.x, z: last.z, ry: last.ry });
    }
    this.snaps.push({ t, x, z, ry });
    if (this.snaps.length > MAX_SNAPSHOTS) this.snaps.splice(0, this.snaps.length - MAX_SNAPSHOTS);
  }

  /** Interpolated state at time t (clamped to the newest snapshot). */
  sample(t: number, out: { x: number; z: number; ry: number }): boolean {
    const s = this.snaps;
    if (s.length === 0) return false;
    const newest = s[s.length - 1]!;
    if (t >= newest.t || s.length === 1) {
      out.x = newest.x;
      out.z = newest.z;
      out.ry = newest.ry;
      return true;
    }
    for (let i = s.length - 2; i >= 0; i--) {
      const a = s[i]!;
      if (a.t <= t) {
        const b = s[i + 1]!;
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        out.x = a.x + (b.x - a.x) * k;
        out.z = a.z + (b.z - a.z) * k;
        out.ry = lerpAngle(a.ry, b.ry, k);
        return true;
      }
    }
    const oldest = s[0]!;
    out.x = oldest.x;
    out.z = oldest.z;
    out.ry = oldest.ry;
    return true;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
