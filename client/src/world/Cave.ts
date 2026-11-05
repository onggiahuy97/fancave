import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PILLARS, SEATS, WALK_RADIUS } from '@fancave/shared';
import {
  ART_RADIUS,
  DOME_HEIGHT,
  DOME_START,
  POSTER_MOUNTS,
  SCREEN_MOUNT,
  TORCH_ANGLES,
  WALL_BASE_RADIUS,
  ceilingAt,
  smoothstep,
  wallNoise,
  wallRadiusAt,
} from './caveShape';
import { fbm3, seededRandom } from './noise';
import { POSTER_CELLS, makeBannerTexture, makePosterAtlas, makeScreenTexture } from './textures';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

function setInstance(
  mesh: THREE.InstancedMesh,
  i: number,
  pos: THREE.Vector3Like,
  rot: { x?: number; y?: number; z?: number },
  scale: THREE.Vector3Like,
): void {
  tmpE.set(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0, 'YXZ');
  tmpQ.setFromEuler(tmpE);
  tmpM.compose(tmpP.set(pos.x, pos.y, pos.z), tmpQ, tmpS.set(scale.x, scale.y, scale.z));
  mesh.setMatrixAt(i, tmpM);
}

interface Flame {
  pos: THREE.Vector3;
  size: number;
  height: number;
  seed: number;
}

/**
 * The static cave: floor, noise-displaced walls/dome, stalactites, amphitheater seating,
 * banners, wall posters and torches. Repeated props are InstancedMeshes, so the whole
 * cave costs ~20 draw calls.
 */
export class Cave {
  readonly group = new THREE.Group();
  /** Where a future scoreboard / watch-party screen is attached. */
  readonly screenMount = new THREE.Object3D();

  private readonly banners: THREE.InstancedMesh;
  private readonly bannerBase: { pos: THREE.Vector3; ry: number }[] = [];
  private readonly flames: THREE.InstancedMesh;
  private readonly flameDefs: Flame[] = [];

  constructor() {
    const rand = seededRandom(1907);
    this.group.add(this.buildFloor());
    this.group.add(this.buildWalls());
    this.group.add(this.buildStalactites(rand));
    this.group.add(this.buildStalagmites(rand));
    this.group.add(this.buildRocks(rand));
    this.group.add(...this.buildSeats());
    this.group.add(...this.buildArt());
    const torchSticks = this.buildTorchSticks();
    this.group.add(torchSticks);
    this.banners = this.buildBanners();
    this.group.add(this.banners);
    this.flames = this.buildFlames();
    this.group.add(this.flames);
  }

  /** Register a flame cone (the campfire adds its own). */
  addFlame(pos: THREE.Vector3, size: number, height: number): void {
    this.flameDefs.push({ pos, size, height, seed: this.flameDefs.length * 1.7 });
  }

  update(t: number): void {
    for (let i = 0; i < this.bannerBase.length; i++) {
      const b = this.bannerBase[i];
      if (!b) continue;
      const sway = Math.sin(t * 0.9 + i * 1.3) * 0.06 + Math.sin(t * 2.1 + i) * 0.015;
      setInstance(this.banners, i, b.pos, { y: b.ry, x: sway }, { x: 1, y: 1, z: 1 });
    }
    this.banners.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.flameDefs.length; i++) {
      const f = this.flameDefs[i];
      if (!f) continue;
      const k = 0.85 + Math.sin(t * 13 + f.seed) * 0.08 + Math.sin(t * 23.7 + f.seed * 3) * 0.07;
      const w = f.size * (0.92 + Math.sin(t * 9 + f.seed * 2) * 0.08);
      setInstance(
        this.flames,
        i,
        { x: f.pos.x, y: f.pos.y + (f.height * k) / 2, z: f.pos.z },
        { y: t * 0.6 + f.seed, z: Math.sin(t * 5 + f.seed) * 0.05 },
        { x: w, y: f.height * k, z: w },
      );
    }
    this.flames.count = this.flameDefs.length;
    this.flames.instanceMatrix.needsUpdate = true;
  }

  private buildFloor(): THREE.Mesh {
    const size = 46;
    const geo = new THREE.PlaneGeometry(size, size, 46, 46);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const n = fbm3(x * 0.35, 0, z * 0.35);
      // Floor is flat where players walk, then rises into a rubble slope at the wall.
      const rise = smoothstep(WALK_RADIUS + 0.4, WALL_BASE_RADIUS + 1, r);
      pos.setY(i, rise * (1.4 + n * 0.6) + (r > WALK_RADIUS ? n * 0.15 : 0));
      const ash = 1 - smoothstep(0.9, 2.6, r);
      const v = 0.75 + n * 0.3;
      tmpC.setRGB(0.2 * v, 0.14 * v, 0.12 * v);
      tmpC.lerp(new THREE.Color(0.07, 0.05, 0.045), ash * 0.8);
      colors[i * 3] = tmpC.r;
      colors[i * 3 + 1] = tmpC.g;
      colors[i * 3 + 2] = tmpC.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    );
    mesh.name = 'floor';
    return mesh;
  }

  private buildWalls(): THREE.Mesh {
    const profile: THREE.Vector2[] = [];
    for (let y = -0.6; y < DOME_START; y += 0.7)
      profile.push(new THREE.Vector2(WALL_BASE_RADIUS, y));
    const domeSteps = 11;
    for (let i = 0; i <= domeSteps; i++) {
      const a = (i / domeSteps) * (Math.PI / 2);
      profile.push(
        new THREE.Vector2(
          Math.max(0.001, WALL_BASE_RADIUS * Math.cos(a)),
          DOME_START + DOME_HEIGHT * Math.sin(a),
        ),
      );
    }
    const geo = new THREE.LatheGeometry(profile, 72);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      let y = pos.getY(i);
      const z = pos.getZ(i);
      const r0 = Math.hypot(x, z);
      const theta = Math.atan2(x, z);
      const n = wallNoise(theta, y);
      if (r0 > 0.01) {
        const r = wallRadiusAt(theta, y);
        pos.setX(i, (x / r0) * r);
        pos.setZ(i, (z / r0) * r);
      }
      if (y > DOME_START)
        y += wallNoise(theta + 2, y + 5) * 0.7 * (1 - r0 / WALL_BASE_RADIUS + 0.3);
      pos.setY(i, y);
      const h = Math.max(0, Math.min(1, y / (DOME_START + DOME_HEIGHT)));
      const v = 0.8 + n * 0.45;
      tmpC.setRGB((0.24 - h * 0.1) * v, (0.16 - h * 0.08) * v, (0.13 - h * 0.06) * v);
      colors[i * 3] = tmpC.r;
      colors[i * 3 + 1] = tmpC.g;
      colors[i * 3 + 2] = tmpC.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
        side: THREE.BackSide,
      }),
    );
    mesh.name = 'walls';
    return mesh;
  }

  private buildStalactites(rand: () => number): THREE.InstancedMesh {
    const geo = new THREE.ConeGeometry(1, 1, 6, 1);
    geo.rotateX(Math.PI);
    geo.translate(0, -0.5, 0);
    const count = 76;
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      count,
    );
    for (let i = 0; i < count; i++) {
      const r = 2.8 + Math.sqrt(rand()) * 14.5;
      const a = rand() * Math.PI * 2;
      const len = 0.7 + rand() * rand() * 3.2;
      const w = 0.12 + rand() * 0.35;
      setInstance(
        mesh,
        i,
        { x: Math.sin(a) * r, y: ceilingAt(r) + 0.7, z: Math.cos(a) * r },
        { y: rand() * 6, x: (rand() - 0.5) * 0.1 },
        { x: w, y: len + 0.7, z: w },
      );
      const v = 0.55 + rand() * 0.25;
      mesh.setColorAt(i, tmpC.setRGB(0.42 * v, 0.33 * v, 0.29 * v));
    }
    mesh.name = 'stalactites';
    return mesh;
  }

  private buildStalagmites(rand: () => number): THREE.InstancedMesh {
    const geo = new THREE.ConeGeometry(1, 1, 7, 2);
    geo.translate(0, 0.5, 0);
    const small = 34;
    const count = PILLARS.length * 3 + small;
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      count,
    );
    let i = 0;
    for (const p of PILLARS) {
      const px = Math.sin(p.angle) * p.radius;
      const pz = Math.cos(p.angle) * p.radius;
      setInstance(
        mesh,
        i++,
        { x: px, y: -0.1, z: pz },
        { y: rand() * 6 },
        {
          x: p.r * 1.15,
          y: 2.6 + rand() * 1.6,
          z: p.r * 1.15,
        },
      );
      // Two little satellites leaning against each pillar.
      for (let k = 0; k < 2; k++) {
        const a = rand() * Math.PI * 2;
        const d = p.r * 0.9;
        const s = 0.25 + rand() * 0.2;
        setInstance(
          mesh,
          i++,
          { x: px + Math.sin(a) * d, y: -0.05, z: pz + Math.cos(a) * d },
          { y: a, z: (rand() - 0.5) * 0.3 },
          { x: s, y: 0.8 + rand() * 0.9, z: s },
        );
      }
    }
    for (let k = 0; k < small; k++) {
      const a = rand() * Math.PI * 2;
      const r = WALK_RADIUS + 0.6 + rand() * 1.6;
      const s = 0.25 + rand() * 0.5;
      setInstance(
        mesh,
        i++,
        { x: Math.sin(a) * r, y: 0.4, z: Math.cos(a) * r },
        { y: a, x: (rand() - 0.5) * 0.2 },
        { x: s, y: 0.8 + rand() * 2.4, z: s },
      );
    }
    for (let k = 0; k < count; k++) {
      const v = 0.5 + rand() * 0.25;
      mesh.setColorAt(k, tmpC.setRGB(0.42 * v, 0.32 * v, 0.27 * v));
    }
    mesh.name = 'stalagmites';
    return mesh;
  }

  private buildRocks(rand: () => number): THREE.InstancedMesh {
    const count = 56;
    const mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      count,
    );
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = WALK_RADIUS + 0.5 + rand() * 1.8;
      const s = 0.3 + rand() * 0.8;
      setInstance(
        mesh,
        i,
        { x: Math.sin(a) * r, y: 0.5 + s * 0.2, z: Math.cos(a) * r },
        { x: rand() * 3, y: rand() * 3, z: rand() * 3 },
        { x: s * (1 + rand()), y: s * 0.7, z: s },
      );
      const v = 0.45 + rand() * 0.3;
      mesh.setColorAt(i, tmpC.setRGB(0.36 * v, 0.28 * v, 0.24 * v));
    }
    mesh.name = 'rocks';
    return mesh;
  }

  private buildSeats(): THREE.InstancedMesh[] {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const stone = new THREE.InstancedMesh(
      geo,
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      SEATS.length,
    );
    const pads = new THREE.InstancedMesh(
      geo,
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      SEATS.length,
    );
    const rand = seededRandom(42);
    SEATS.forEach((s, i) => {
      setInstance(
        stone,
        i,
        { x: s.x, y: s.h / 2, z: s.z },
        { y: s.rot },
        {
          x: s.hw * 2,
          y: s.h,
          z: s.hd * 2,
        },
      );
      const v = 0.55 + rand() * 0.2;
      stone.setColorAt(i, tmpC.setRGB(0.38 * v, 0.31 * v, 0.27 * v));
      // Cushion strip on the front half of the tier, alternating club colours.
      const off = -s.hd * 0.35;
      setInstance(
        pads,
        i,
        { x: s.x + Math.sin(s.rot) * off, y: s.h + 0.03, z: s.z + Math.cos(s.rot) * off },
        { y: s.rot },
        { x: s.hw * 1.9, y: 0.07, z: s.hd * 1.1 },
      );
      pads.setColorAt(i, i % 2 ? tmpC.set(0x8f0b20) : tmpC.set(0x141012));
    });
    stone.name = 'seats';
    pads.name = 'seat-pads';
    return [stone, pads];
  }

  private buildArt(): THREE.Object3D[] {
    // Posters: one merged mesh sampling a 6-cell atlas.
    const quads: THREE.BufferGeometry[] = [];
    POSTER_MOUNTS.forEach((m, i) => {
      const q = new THREE.PlaneGeometry(m.halfWidth * 2, m.halfHeight * 2);
      const uv = q.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) {
        uv.setX(k, (i % POSTER_CELLS) / POSTER_CELLS + uv.getX(k) / POSTER_CELLS);
      }
      q.rotateY(m.angle + Math.PI);
      q.translate(Math.sin(m.angle) * ART_RADIUS, m.y, Math.cos(m.angle) * ART_RADIUS);
      quads.push(q);
    });
    const atlas = makePosterAtlas();
    const posters = new THREE.Mesh(
      mergeGeometries(quads),
      new THREE.MeshLambertMaterial({
        map: atlas,
        emissiveMap: atlas,
        emissive: 0xffffff,
        emissiveIntensity: 0.35,
      }),
    );
    posters.name = 'posters';

    // Frames (posters + screen) as one instanced box.
    const mounts = [...POSTER_MOUNTS, SCREEN_MOUNT];
    const frames = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x2a1a10 }),
      mounts.length,
    );
    mounts.forEach((m, i) => {
      const r = ART_RADIUS + 0.06;
      setInstance(
        frames,
        i,
        { x: Math.sin(m.angle) * r, y: m.y, z: Math.cos(m.angle) * r },
        {
          y: m.angle,
        },
        { x: m.halfWidth * 2 + 0.18, y: m.halfHeight * 2 + 0.18, z: 0.1 },
      );
    });
    frames.name = 'frames';

    const screenTex = makeScreenTexture();
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(SCREEN_MOUNT.halfWidth * 2, SCREEN_MOUNT.halfHeight * 2),
      new THREE.MeshBasicMaterial({ map: screenTex, color: 0xb0b0b0 }),
    );
    const sr = ART_RADIUS - 0.01;
    this.screenMount.position.set(
      Math.sin(SCREEN_MOUNT.angle) * sr,
      SCREEN_MOUNT.y,
      Math.cos(SCREEN_MOUNT.angle) * sr,
    );
    this.screenMount.rotation.y = SCREEN_MOUNT.angle + Math.PI;
    this.screenMount.add(screen);
    screen.name = 'screen';
    return [posters, frames, this.screenMount];
  }

  private buildTorchSticks(): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.05, 0.07, 0.7, 5),
      new THREE.MeshLambertMaterial({ color: 0x3b2414 }),
      TORCH_ANGLES.length,
    );
    TORCH_ANGLES.forEach((a, i) => {
      const r = wallRadiusAt(a, 2.2) - 0.3;
      setInstance(
        mesh,
        i,
        { x: Math.sin(a) * r, y: 2.1, z: Math.cos(a) * r },
        {
          y: a,
          x: -0.35,
        },
        { x: 1, y: 1, z: 1 },
      );
      const fr = r - 0.12;
      this.addFlame(new THREE.Vector3(Math.sin(a) * fr, 2.42, Math.cos(a) * fr), 0.11, 0.38);
    });
    mesh.name = 'torches';
    return mesh;
  }

  private buildBanners(): THREE.InstancedMesh {
    const count = 8;
    const geo = new THREE.PlaneGeometry(1.15, 2.85);
    geo.translate(0, -2.85 / 2, 0);
    const tex = makeBannerTexture();
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshLambertMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: 0xffffff,
        emissiveIntensity: 0.18,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      }),
      count,
    );
    for (let i = 0; i < count; i++) {
      const a = ((i + 0.5) / count) * Math.PI * 2;
      const r = 14.6;
      const pos = new THREE.Vector3(Math.sin(a) * r, ceilingAt(r) - 0.35, Math.cos(a) * r);
      const ry = a + Math.PI;
      this.bannerBase.push({ pos, ry });
      setInstance(mesh, i, pos, { y: ry }, { x: 1, y: 1, z: 1 });
    }
    mesh.name = 'banners';
    return mesh;
  }

  private buildFlames(): THREE.InstancedMesh {
    const geo = new THREE.ConeGeometry(1, 1, 7, 1, true);
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
      24,
    );
    mesh.count = 0;
    mesh.frustumCulled = false;
    for (let i = 0; i < 24; i++) mesh.setColorAt(i, tmpC.set(0xff8a2a));
    mesh.name = 'flames';
    return mesh;
  }

  /** Tint a flame instance (campfire uses layered colours). */
  setFlameColor(index: number, color: THREE.ColorRepresentation): void {
    this.flames.setColorAt(index, tmpC.set(color));
    if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = true;
  }

  get flameCount(): number {
    return this.flameDefs.length;
  }
}
