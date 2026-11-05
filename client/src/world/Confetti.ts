import * as THREE from 'three';

const MAX = 900;
const PER_BURST = 120;
const COLORS = [0xc8102e, 0xffffff, 0x111111, 0xf2b33d, 0xff5a5a].map((c) => new THREE.Color(c));

/** Pooled confetti particles (one draw call for every celebration in view). */
export class Confetti {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private cursor = 0;
  private alive = 0;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -100;
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true }),
    );
    this.points.frustumCulled = false;
  }

  burst(x: number, y: number, z: number): void {
    for (let n = 0; n < PER_BURST; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2.2;
      this.pos.set([x, y, z], i * 3);
      this.vel.set([Math.cos(a) * s, 3 + Math.random() * 3, Math.sin(a) * s], i * 3);
      const c = COLORS[n % COLORS.length] ?? COLORS[0]!;
      this.col.set([c.r, c.g, c.b], i * 3);
      this.life[i] = 1.6 + Math.random() * 0.8;
    }
    this.alive = Math.min(MAX, this.alive + PER_BURST);
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      const l = this.life[i] ?? 0;
      if (l <= 0) continue;
      const k = i * 3;
      const nl = l - dt;
      this.life[i] = nl;
      if (nl <= 0) {
        this.pos[k + 1] = -100;
        continue;
      }
      alive++;
      const vx = (this.vel[k] ?? 0) * (1 - dt * 1.5);
      const vy = (this.vel[k + 1] ?? 0) - 7 * dt;
      const vz = (this.vel[k + 2] ?? 0) * (1 - dt * 1.5);
      this.vel[k] = vx;
      this.vel[k + 1] = Math.max(vy, -1.2);
      this.vel[k + 2] = vz;
      this.pos[k] = (this.pos[k] ?? 0) + vx * dt + Math.sin(nl * 9 + i) * dt * 0.4;
      this.pos[k + 1] = Math.max(0.02, (this.pos[k + 1] ?? 0) + (this.vel[k + 1] ?? 0) * dt);
      this.pos[k + 2] = (this.pos[k + 2] ?? 0) + vz * dt;
    }
    this.alive = alive;
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
