import * as THREE from 'three';
import type { Avatar } from './Avatar';

const MAX_CHARACTERS = 128;

const JERSEY = 0xc8102e;
const SHORTS = 0xf4f4f4;
const SHOES = 0x151515;

interface Part {
  mesh: THREE.InstancedMesh;
  perCharacter: 1 | 2;
  /** Instance colour source; undefined = material colour only. */
  tint?: 'skin' | 'hair';
}

const m4 = () => new THREE.Matrix4();

/**
 * Draws every chibi character with one InstancedMesh per body part, so the draw-call
 * cost is constant (~12) no matter how many fans are in the cave.
 */
export class CharacterRenderer {
  readonly group = new THREE.Group();
  private readonly parts: Record<string, Part> = {};

  // Scratch matrices.
  private readonly root = m4();
  private readonly torso = m4();
  private readonly head = m4();
  private readonly pivot = m4();
  private readonly local = m4();
  private readonly out = m4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor() {
    const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    this.add('head', new THREE.IcosahedronGeometry(0.3, 1), lambert(0xffffff), 1, 'skin');
    this.add(
      'hair',
      new THREE.SphereGeometry(0.318, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.52),
      lambert(0xffffff),
      1,
      'hair',
    );
    this.add('eye', new THREE.SphereGeometry(0.042, 6, 4), lambert(0x101010), 2);
    this.add('mouth', new THREE.BoxGeometry(0.08, 0.022, 0.02), lambert(0x5a1414), 1);
    this.add('torso', new THREE.CylinderGeometry(0.19, 0.23, 0.36, 8), lambert(JERSEY), 1);
    this.add('collar', new THREE.CylinderGeometry(0.13, 0.16, 0.045, 8), lambert(SHORTS), 1);
    this.add('shorts', new THREE.CylinderGeometry(0.232, 0.24, 0.15, 8), lambert(SHORTS), 1);
    this.add('sleeve', new THREE.CylinderGeometry(0.075, 0.068, 0.13, 6), lambert(JERSEY), 2);
    this.add('arm', new THREE.CapsuleGeometry(0.052, 0.17, 2, 6), lambert(0xffffff), 2, 'skin');
    this.add('leg', new THREE.CapsuleGeometry(0.066, 0.12, 2, 6), lambert(0xffffff), 2, 'skin');
    this.add('shoe', new THREE.BoxGeometry(0.13, 0.08, 0.2), lambert(SHOES), 2);
    const shadow = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.36, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
      MAX_CHARACTERS,
    );
    this.register('shadow', shadow, 1);
  }

  private add(
    name: string,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    perCharacter: 1 | 2,
    tint?: 'skin' | 'hair',
  ): void {
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_CHARACTERS * perCharacter);
    this.register(name, mesh, perCharacter, tint);
  }

  private register(
    name: string,
    mesh: THREE.InstancedMesh,
    perCharacter: 1 | 2,
    tint?: 'skin' | 'hair',
  ): void {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.name = `char-${name}`;
    if (tint) mesh.setColorAt(0, this.color.set(0xffffff));
    this.parts[name] = { mesh, perCharacter, ...(tint ? { tint } : {}) };
    this.group.add(mesh);
  }

  private part(name: string): Part {
    const p = this.parts[name];
    if (!p) throw new Error(`missing part ${name}`);
    return p;
  }

  /** Write `local` (built from t/rot/scale) relative to `parent` into a part instance. */
  private put(
    name: string,
    index: number,
    parent: THREE.Matrix4,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ): void {
    this.e.set(rx, ry, rz, 'YXZ');
    this.q.setFromEuler(this.e);
    this.local.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.out.multiplyMatrices(parent, this.local);
    this.part(name).mesh.setMatrixAt(index, this.out);
  }

  /** Build a pivot matrix (parent * T * Rz * Rx) into `this.pivot`. */
  private makePivot(
    parent: THREE.Matrix4,
    x: number,
    y: number,
    z: number,
    swing: number,
    raise: number,
  ): void {
    this.e.set(swing, 0, raise, 'ZXY');
    this.q.setFromEuler(this.e);
    this.local.compose(this.v.set(x, y, z), this.q, this.s.set(1, 1, 1));
    this.pivot.multiplyMatrices(parent, this.local);
  }

  render(avatars: Iterable<Avatar>): void {
    let n = 0;
    for (const a of avatars) {
      if (n >= MAX_CHARACTERS) break;
      this.writeCharacter(a, n);
      n++;
    }
    for (const p of Object.values(this.parts)) {
      p.mesh.count = n * p.perCharacter;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }

  private writeCharacter(a: Avatar, i: number): void {
    const p = a.pose;
    const px = a.position.x + p.offsetX;
    const pz = a.position.z + p.offsetZ;
    const py = a.position.y + p.jump;

    // Shadow stays on the floor and shrinks while airborne.
    const ss = 1 - Math.min(0.5, p.jump);
    this.put('shadow', i, this.identity, px, 0.015, pz, 0, 0, 0, ss, 1, ss);

    this.e.set(p.lean, a.ry, p.roll, 'YXZ');
    this.q.setFromEuler(this.e);
    this.root.compose(this.v.set(px, py + p.bob, pz), this.q, this.s.set(1, 1, 1));

    // Lower body
    this.put('shorts', i, this.root, 0, 0.3, 0);
    const legs: [number, number][] = [
      [0.1, p.legL],
      [-0.1, p.legR],
    ];
    legs.forEach(([x, swing], k) => {
      this.makePivot(this.root, x, 0.25, 0, swing, 0);
      this.put('leg', i * 2 + k, this.pivot, 0, -0.1, 0);
      this.put('shoe', i * 2 + k, this.pivot, 0, -0.2, 0.035);
    });

    // Upper body
    this.e.set(0, p.twist, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.local.compose(this.v.set(0, 0.52, 0), this.q, this.s.set(1, 1, 1));
    this.torso.multiplyMatrices(this.root, this.local);
    this.put('torso', i, this.torso, 0, 0, 0);
    this.put('collar', i, this.torso, 0, 0.18, 0);
    const arms: [number, number, number][] = [
      [0.245, p.armSwingL, p.armRaiseL],
      [-0.245, p.armSwingR, -p.armRaiseR],
    ];
    arms.forEach(([x, swing, raise], k) => {
      this.makePivot(this.torso, x, 0.12, 0, swing, raise);
      this.put('sleeve', i * 2 + k, this.pivot, 0, -0.045, 0);
      this.put('arm', i * 2 + k, this.pivot, 0, -0.16, 0);
    });

    // Head
    this.e.set(p.headTilt, p.twist * 0.4, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.local.compose(this.v.set(0, 0.96, 0), this.q, this.s.set(1, 0.95, 1));
    this.head.multiplyMatrices(this.root, this.local);
    this.put('head', i, this.head, 0, 0, 0);
    this.put('hair', i, this.head, 0, 0.035, -0.025, -0.22);
    this.put('eye', i * 2, this.head, 0.1, 0.0, 0.268, 0, 0, 0, 1, 1.35, 0.6);
    this.put('eye', i * 2 + 1, this.head, -0.1, 0.0, 0.268, 0, 0, 0, 1, 1.35, 0.6);
    this.put('mouth', i, this.head, 0, -0.1, 0.278);

    // Per-character tints.
    const skin = this.color.setHex(a.look.skin);
    this.part('head').mesh.setColorAt(i, skin);
    this.part('arm').mesh.setColorAt(i * 2, skin);
    this.part('arm').mesh.setColorAt(i * 2 + 1, skin);
    this.part('leg').mesh.setColorAt(i * 2, skin);
    this.part('leg').mesh.setColorAt(i * 2 + 1, skin);
    this.part('hair').mesh.setColorAt(i, this.color.setHex(a.look.hair));
  }

  private readonly identity = new THREE.Matrix4();
}
