import * as THREE from 'three';
import type { EmoteType } from '@fancave/shared';
import { PLAYER_SPEED } from '@fancave/shared';
import type { Look } from './looks';
import { lookFor } from './looks';

export const PUNCH_TIME = 0.45;
export const CELEBRATE_TIME = 1.4;
export const STAGGER_TIME = 0.7;

/** Pose parameters consumed by CharacterRenderer. */
export interface Pose {
  bob: number;
  jump: number;
  lean: number;
  roll: number;
  twist: number;
  headTilt: number;
  legL: number;
  legR: number;
  armSwingL: number;
  armSwingR: number;
  armRaiseL: number;
  armRaiseR: number;
  offsetX: number;
  offsetZ: number;
}

/** A character in the world (local or remote): position + animation state. */
export class Avatar {
  readonly position = new THREE.Vector3();
  ry = 0;
  name: string;
  look: Look;
  online = true;
  readonly pose: Pose = {
    bob: 0,
    jump: 0,
    lean: 0,
    roll: 0,
    twist: 0,
    headTilt: 0,
    legL: 0,
    legR: 0,
    armSwingL: 0,
    armSwingR: 0,
    armRaiseL: 0,
    armRaiseR: 0,
    offsetX: 0,
    offsetZ: 0,
  };

  private readonly lastPos = new THREE.Vector3();
  private speed = 0;
  private walkPhase = 0;
  private walkAmt = 0;
  private readonly seed = Math.random() * 10;
  private emote: { type: EmoteType; t: number } | null = null;
  private stagger: { t: number; dx: number; dz: number } | null = null;

  constructor(
    readonly id: string,
    name: string,
    lookIndex: number,
    readonly isLocal = false,
  ) {
    this.name = name;
    this.look = lookFor(lookIndex);
  }

  setLook(index: number): void {
    this.look = lookFor(index);
  }

  /** Teleport without producing a walk animation. */
  snapTo(x: number, z: number, ry: number): void {
    this.position.set(x, 0, z);
    this.lastPos.copy(this.position);
    this.ry = ry;
  }

  playEmote(type: EmoteType): void {
    this.emote = { type, t: 0 };
  }

  /** Cosmetic knockback away from (fromX, fromZ). */
  playStagger(fromX: number, fromZ: number): void {
    let dx = this.position.x - fromX;
    let dz = this.position.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    this.stagger = { t: 0, dx, dz };
  }

  get isCelebrating(): boolean {
    return this.emote?.type === 'celebrate';
  }

  update(dt: number, time: number): void {
    // Speed estimate from rendered movement drives the walk cycle.
    const moved = Math.hypot(this.position.x - this.lastPos.x, this.position.z - this.lastPos.z);
    this.lastPos.copy(this.position);
    const inst = dt > 0 ? moved / dt : 0;
    this.speed += (Math.min(inst, PLAYER_SPEED * 1.2) - this.speed) * Math.min(1, dt * 12);
    const targetAmt = Math.min(1, this.speed / (PLAYER_SPEED * 0.6));
    this.walkAmt += (targetAmt - this.walkAmt) * Math.min(1, dt * 10);
    this.walkPhase += dt * (4 + this.speed * 2.2) * (this.walkAmt > 0.02 ? 1 : 0);

    const p = this.pose;
    const a = this.walkAmt;
    const s = Math.sin(this.walkPhase);
    const idle = 1 - a;
    p.legL = s * 0.8 * a;
    p.legR = -s * 0.8 * a;
    p.armSwingL = -s * 0.7 * a + Math.sin(time * 1.6 + this.seed) * 0.05 * idle;
    p.armSwingR = s * 0.7 * a - Math.sin(time * 1.6 + this.seed) * 0.05 * idle;
    p.armRaiseL = 0.12;
    p.armRaiseR = 0.12;
    p.bob =
      Math.abs(Math.cos(this.walkPhase)) * 0.06 * a +
      Math.sin(time * 2.4 + this.seed) * 0.012 * idle;
    p.jump = 0;
    p.lean = 0.08 * a;
    p.roll = 0;
    p.twist = 0;
    p.headTilt = Math.sin(time * 1.1 + this.seed) * 0.04 * idle;
    p.offsetX = 0;
    p.offsetZ = 0;

    if (this.emote) {
      this.emote.t += dt;
      const t = this.emote.t;
      if (this.emote.type === 'punch') {
        const u = t / PUNCH_TIME;
        const c = u < 0.22 ? u / 0.22 : u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.45);
        const e = c * c * (3 - 2 * c);
        p.armSwingR = p.armSwingR * (1 - e) - 1.6 * e;
        p.armRaiseR = 0.12 + 0.25 * e;
        p.armSwingL = p.armSwingL * (1 - e) + 0.5 * e;
        p.twist = -0.4 * e;
        p.lean += 0.14 * e;
        if (u >= 1) this.emote = null;
      } else {
        const u = t / CELEBRATE_TIME;
        const env = Math.min(1, t * 6) * Math.min(1, (1 - u) * 6);
        p.jump = Math.abs(Math.sin(u * Math.PI * 2)) * 0.45 * (1 - u * 0.3);
        const wave = Math.sin(t * 16) * 0.3;
        p.armRaiseL = 0.12 + (2.6 + wave) * env;
        p.armRaiseR = 0.12 + (2.6 - wave) * env;
        p.armSwingL *= 1 - env;
        p.armSwingR *= 1 - env;
        p.legL = p.legL * (1 - env) + 0.35 * env * (p.jump > 0.05 ? 1 : 0);
        p.legR = p.legR * (1 - env) - 0.2 * env * (p.jump > 0.05 ? 1 : 0);
        p.headTilt = -0.25 * env;
        if (u >= 1) this.emote = null;
      }
    }

    if (this.stagger) {
      this.stagger.t += dt;
      const u = this.stagger.t / STAGGER_TIME;
      const c = Math.sin(Math.min(1, u) * Math.PI) * (u < 0.3 ? 1 : 1 - (u - 0.3) * 0.4);
      const fx = Math.sin(this.ry);
      const fz = Math.cos(this.ry);
      // Knockback direction in the character's frame: forward component -> lean, side -> roll.
      const fwd = this.stagger.dx * fx + this.stagger.dz * fz;
      const side = this.stagger.dx * fz - this.stagger.dz * fx;
      p.lean += fwd * 0.6 * c;
      p.roll += side * 0.5 * c;
      p.armRaiseL += 0.9 * c;
      p.armRaiseR += 0.9 * c;
      p.headTilt -= 0.3 * c;
      const push = 0.55 * Math.sin(Math.min(1, u) * Math.PI * 0.5) * (1 - Math.max(0, u - 0.5) * 2);
      p.offsetX = this.stagger.dx * push;
      p.offsetZ = this.stagger.dz * push;
      if (u >= 1) this.stagger = null;
    }
  }

  /** World-space point above the head (name tag / speech bubble anchor). */
  headAnchor(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.position.x + this.pose.offsetX,
      this.position.y + 1.4 + this.pose.jump + this.pose.bob,
      this.position.z + this.pose.offsetZ,
    );
  }
}
