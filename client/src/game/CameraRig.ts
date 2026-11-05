import * as THREE from 'three';
import { COLLIDERS } from '@fancave/shared';
import { ceilingAt, wallRadiusAt } from '../world/caveShape';

const MIN_DIST = 2.2;
const MAX_DIST = 10;
const MIN_PITCH = 0.08;
const MAX_PITCH = 1.25;
const TARGET_HEIGHT = 1.05;
const MARGIN = 0.35;

/** Third-person orbit camera that follows a target and never clips through the cave. */
export class CameraRig {
  yaw = 0;
  pitch = 0.42;
  distance = 6;
  private currentDist = 6;
  private readonly target = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly probe = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  orbit(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch + dPitch));
  }

  zoom(factor: number): void {
    this.distance = Math.max(MIN_DIST, Math.min(MAX_DIST, this.distance * factor));
  }

  /** Camera-relative ground directions for movement input. */
  basis(): { fx: number; fz: number; rx: number; rz: number } {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    return { fx, fz, rx: -fz, rz: fx };
  }

  update(focus: THREE.Vector3, dt: number, snap = false): void {
    const goal = this.probe.set(focus.x, focus.y + TARGET_HEIGHT, focus.z);
    if (snap) this.target.copy(goal);
    else this.target.lerp(goal, 1 - Math.exp(-dt * 14));

    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const allowed = this.allowedDistance(this.target, this.dir, this.distance);
    // Pull in instantly when blocked, ease back out when clear.
    if (snap || allowed < this.currentDist) this.currentDist = allowed;
    else this.currentDist += (allowed - this.currentDist) * (1 - Math.exp(-dt * 4));

    this.camera.position.copy(this.target).addScaledVector(this.dir, this.currentDist);
    this.camera.lookAt(this.target);
  }

  /** March along the boom and stop before the first wall/ceiling/floor/prop hit. */
  private allowedDistance(from: THREE.Vector3, dir: THREE.Vector3, want: number): number {
    const steps = 28;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * want;
      const x = from.x + dir.x * t;
      const y = from.y + dir.y * t;
      const z = from.z + dir.z * t;
      if (this.blocked(x, y, z)) return Math.max(0.5, t - want / steps - 0.1);
    }
    return want;
  }

  private blocked(x: number, y: number, z: number): boolean {
    if (y < 0.25) return true;
    const r = Math.hypot(x, z);
    if (y > ceilingAt(r) - 0.6) return true;
    if (r > wallRadiusAt(Math.atan2(x, z), y) - MARGIN - 0.4) return true;
    for (const c of COLLIDERS) {
      if (c.kind === 'circle') {
        // Fire is only "solid" low down; pillars are tall.
        const height = c.r > 1 ? 0.4 : 3;
        if (y < height && Math.hypot(x - c.x, z - c.z) < c.r + MARGIN * 0.6) return true;
      } else if (y < c.h + MARGIN * 0.5) {
        const cos = Math.cos(c.rot);
        const sin = Math.sin(c.rot);
        const wx = x - c.x;
        const wz = z - c.z;
        const lx = wx * cos - wz * sin;
        const lz = wx * sin + wz * cos;
        if (Math.abs(lx) < c.hw + 0.1 && Math.abs(lz) < c.hd + 0.1) return true;
      }
    }
    return false;
  }
}
