import * as THREE from 'three';
import type { Cave } from './Cave';

const SPARKS = 90;

/** Central campfire: stone ring, logs, layered flames, flickering light and sparks. */
export class Campfire {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  private readonly sparkPos: Float32Array;
  private readonly sparkVel: Float32Array;
  private readonly sparkLife: Float32Array;
  private readonly sparks: THREE.Points;

  constructor(cave: Cave) {
    const stoneMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.24, 0),
      new THREE.MeshLambertMaterial({ color: 0x5b4c45, flatShading: true }),
      12,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      e.set(i * 0.7, i * 1.3, 0);
      q.setFromEuler(e);
      const s = 0.85 + ((i * 37) % 10) / 30;
      m.compose(
        new THREE.Vector3(Math.sin(a) * 0.95, 0.12, Math.cos(a) * 0.95),
        q,
        new THREE.Vector3(s, s * 0.75, s),
      );
      stoneMesh.setMatrixAt(i, m);
    }
    this.group.add(stoneMesh);

    const logs = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.08, 0.11, 1.15, 6),
      new THREE.MeshLambertMaterial({ color: 0x3a2213, flatShading: true }),
      5,
    );
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      e.set(0.75, a, 0, 'YXZ');
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(Math.sin(a) * 0.28, 0.32, Math.cos(a) * 0.28),
        q,
        new THREE.Vector3(1, 1, 1),
      );
      logs.setMatrixAt(i, m);
    }
    this.group.add(logs);

    const embers = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff4d12 }),
    );
    embers.position.y = 0.03;
    this.group.add(embers);

    // Layered flames drawn by the cave's shared flame InstancedMesh.
    const base = cave.flameCount;
    cave.addFlame(new THREE.Vector3(0, 0.1, 0), 0.55, 1.5);
    cave.addFlame(new THREE.Vector3(0.05, 0.1, -0.04), 0.38, 1.15);
    cave.addFlame(new THREE.Vector3(-0.03, 0.1, 0.03), 0.22, 0.85);
    cave.setFlameColor(base, 0xc8241a);
    cave.setFlameColor(base + 1, 0xff7a1e);
    cave.setFlameColor(base + 2, 0xffd36a);

    this.light = new THREE.PointLight(0xff8a3c, 60, 40, 1.35);
    this.light.position.set(0, 1.4, 0);
    this.group.add(this.light);

    this.sparkPos = new Float32Array(SPARKS * 3);
    this.sparkVel = new Float32Array(SPARKS * 3);
    this.sparkLife = new Float32Array(SPARKS);
    for (let i = 0; i < SPARKS; i++) this.respawn(i, Math.random() * 2.5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparks = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffa040,
        size: 0.07,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);
  }

  private respawn(i: number, life: number): void {
    this.sparkPos[i * 3] = (Math.random() - 0.5) * 0.6;
    this.sparkPos[i * 3 + 1] = 0.3 + Math.random() * 0.4;
    this.sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    this.sparkVel[i * 3] = (Math.random() - 0.5) * 0.5;
    this.sparkVel[i * 3 + 1] = 1.2 + Math.random() * 1.6;
    this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    this.sparkLife[i] = life;
  }

  update(t: number, dt: number): void {
    const flicker =
      Math.sin(t * 11.3) * 0.08 + Math.sin(t * 17.9 + 1.2) * 0.06 + Math.sin(t * 3.1) * 0.05;
    this.light.intensity = 60 * (1 + flicker + (Math.random() - 0.5) * 0.06);
    this.light.position.x = Math.sin(t * 7.1) * 0.05;
    this.light.position.z = Math.cos(t * 6.3) * 0.05;
    for (let i = 0; i < SPARKS; i++) {
      const life = (this.sparkLife[i] ?? 0) - dt;
      if (life <= 0) {
        this.respawn(i, 1.2 + Math.random() * 1.5);
        continue;
      }
      this.sparkLife[i] = life;
      const k = i * 3;
      this.sparkVel[k] = (this.sparkVel[k] ?? 0) + Math.sin(t * 3 + i) * dt * 0.8;
      this.sparkPos[k] = (this.sparkPos[k] ?? 0) + (this.sparkVel[k] ?? 0) * dt;
      this.sparkPos[k + 1] = (this.sparkPos[k + 1] ?? 0) + (this.sparkVel[k + 1] ?? 0) * dt;
      this.sparkPos[k + 2] = (this.sparkPos[k + 2] ?? 0) + (this.sparkVel[k + 2] ?? 0) * dt;
    }
    (this.sparks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
