import type { InputTuple } from '@fancave/shared';
import { randomSpawn, stepMovement } from '@fancave/shared';

const MAX_PENDING = 240;

/**
 * Client-side prediction for the local player. Inputs are applied immediately with the
 * shared movement code; when an authoritative state arrives we rewind to it and replay
 * every input the server hasn't processed yet. Any visible error is blended out.
 */
export class LocalPlayer {
  x: number;
  z: number;
  ry = 0;
  private seq = 0;
  private pending: InputTuple[] = [];
  private outbox: InputTuple[] = [];
  /** Visual-only correction offset that decays towards zero. */
  errX = 0;
  errZ = 0;

  constructor(spawn = randomSpawn()) {
    this.x = spawn.x;
    this.z = spawn.z;
    this.ry = Math.atan2(-spawn.x, -spawn.z); // face the fire
  }

  /** Apply one frame of input locally; returns true if the player moved. */
  apply(dx: number, dz: number, dt: number): boolean {
    if (Math.hypot(dx, dz) < 1e-3) return false;
    const r = stepMovement(this, this.ry, { dx, dz, dt });
    if (!r.moved) return false;
    const frame: InputTuple = [++this.seq, dx, dz, dt];
    this.pending.push(frame);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    this.outbox.push(frame);
    this.x = r.x;
    this.z = r.z;
    this.ry = r.ry;
    return true;
  }

  /** Inputs to send since the last call. */
  drainOutbox(): InputTuple[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  /** Server says we were at (x, z) after applying input `ack`. */
  reconcile(x: number, z: number, ry: number, ack: number): void {
    this.pending = this.pending.filter((f) => f[0] > ack);
    const oldX = this.x;
    const oldZ = this.z;
    let p = { x, z, ry };
    for (const [, dx, dz, dt] of this.pending) {
      const r = stepMovement(p, p.ry, { dx, dz, dt });
      p = { x: r.x, z: r.z, ry: r.ry };
    }
    this.x = p.x;
    this.z = p.z;
    if (this.pending.length === 0) this.ry = ry;
    const ex = oldX - this.x;
    const ez = oldZ - this.z;
    if (Math.hypot(ex, ez) > 2) {
      // Too far off (teleport / long stall): snap.
      this.errX = this.errZ = 0;
    } else {
      this.errX += ex;
      this.errZ += ez;
    }
  }

  /** Resync sequence numbers after (re)joining a room. */
  resetTo(x: number, z: number, ry: number, seq: number): void {
    this.x = x;
    this.z = z;
    this.ry = ry;
    this.seq = Math.max(this.seq, seq);
    this.pending = [];
    this.outbox = [];
    this.errX = this.errZ = 0;
  }

  get lastSeq(): number {
    return this.seq;
  }

  decayError(dt: number): void {
    const k = Math.exp(-dt * 12);
    this.errX *= k;
    this.errZ *= k;
  }
}
