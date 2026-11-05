import * as THREE from 'three';
import type { EmoteType } from '@fancave/shared';
import { EmoteCooldown, findPunchTargets } from '@fancave/shared';
import { Avatar } from '../actors/Avatar';
import { CharacterRenderer } from '../actors/CharacterRenderer';
import type { Sound } from '../audio/Sound';
import { LocalPlayer } from '../net/LocalPlayer';
import type { DevOverlay } from '../ui/DevOverlay';
import { isTouchDevice } from '../ui/dom';
import { Labels } from '../ui/Labels';
import { Campfire } from '../world/Campfire';
import { Cave } from '../world/Cave';
import { Confetti } from '../world/Confetti';
import { CameraRig } from './CameraRig';
import { Input } from './Input';

export interface GameEvents {
  onEmoteRejected(type: EmoteType, remainingMs: number): void;
  onEmoteUsed(type: EmoteType): void;
  onOpenChat(): void;
  onToggleDev(): void;
}

/** Owns the renderer, scene, avatars and per-frame update. Networking plugs in via hooks. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  readonly input: Input;
  readonly avatars = new Map<string, Avatar>();
  readonly labels: Labels;

  private readonly cave: Cave;
  private readonly fire: Campfire;
  private readonly confetti = new Confetti();
  private readonly chars = new CharacterRenderer();
  private readonly clock = new THREE.Clock();
  private readonly cooldown = new EmoteCooldown();
  private readonly tmp = new THREE.Vector3();
  private time = 0;
  private readonly fill: THREE.DirectionalLight;

  local: LocalPlayer | null = null;
  localAvatar: Avatar | null = null;
  /** Called every frame while playing (networking: send inputs, interpolate remotes). */
  onTick: ((dt: number) => void) | null = null;
  /** Called when the local player triggers an emote that passed the local cooldown. */
  onLocalEmote: ((type: EmoteType) => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    labelLayer: HTMLElement,
    private readonly sound: Sound,
    private readonly dev: DevOverlay,
    private readonly events: GameEvents,
  ) {
    const touch = isTouchDevice();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, touch ? 1.5 : 2));
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 80);
    this.rig = new CameraRig(this.camera);

    const fogColor = new THREE.Color(0x0c0606);
    this.scene.background = fogColor;
    this.scene.fog = new THREE.FogExp2(fogColor, 0.03);
    this.scene.add(new THREE.HemisphereLight(0x6b3a2c, 0x140909, 1.3));
    const moon = new THREE.DirectionalLight(0x8a7aa8, 0.35);
    moon.position.set(-6, 12, 4);
    this.scene.add(moon);
    // Soft fill that rides with the camera so characters never become pure silhouettes.
    this.fill = new THREE.DirectionalLight(0xffd2b0, 0.55);
    this.scene.add(this.fill, this.fill.target);

    this.cave = new Cave();
    this.fire = new Campfire(this.cave);
    this.scene.add(this.cave.group, this.fire.group, this.chars.group, this.confetti.points);

    this.labels = new Labels(labelLayer);
    this.input = new Input(canvas, {
      onEmote: (t) => this.emote(t),
      onOpenChat: () => this.events.onOpenChat(),
      onToggleDev: () => this.events.onToggleDev(),
      onOrbit: (dx, dy) => this.rig.orbit(-dx * 0.006, dy * 0.005),
      onZoom: (f) => this.rig.zoom(f),
    });

    window.addEventListener('resize', this.resize);
    this.resize();
    this.renderer.setAnimationLoop(this.frame);
  }

  get playing(): boolean {
    return this.local !== null;
  }

  /** Spawn the local player. */
  spawnLocal(id: string, name: string, look: number, at?: { x: number; z: number }): void {
    this.local = new LocalPlayer(at);
    this.localAvatar = new Avatar(id, name, look, true);
    this.localAvatar.snapTo(this.local.x, this.local.z, this.local.ry);
    this.avatars.set(id, this.localAvatar);
    this.rig.yaw = this.local.ry + Math.PI;
    this.rig.pitch = 0.38;
    this.rig.update(this.localAvatar.position, 0, true);
  }

  /** Re-key the local avatar (server assigns the session id after join). */
  rekeyLocal(id: string): void {
    const a = this.localAvatar;
    if (!a || a.id === id) return;
    this.avatars.delete(a.id);
    this.labels.remove(a.id);
    const b = new Avatar(id, a.name, 0, true);
    b.look = a.look;
    b.snapTo(a.position.x, a.position.z, a.ry);
    this.localAvatar = b;
    this.avatars.set(id, b);
  }

  addRemote(id: string, name: string, look: number, x: number, z: number, ry: number): Avatar {
    const a = new Avatar(id, name, look);
    a.snapTo(x, z, ry);
    this.avatars.set(id, a);
    return a;
  }

  removeAvatar(id: string): void {
    this.avatars.delete(id);
    this.labels.remove(id);
  }

  /** Remove everyone (leaving the room). */
  reset(): void {
    this.avatars.clear();
    this.labels.clear();
    this.local = null;
    this.localAvatar = null;
    this.onTick = null;
    this.onLocalEmote = null;
  }

  /** Trigger an emote for the local player (keyboard or HUD button). */
  emote(type: EmoteType): void {
    const a = this.localAvatar;
    if (!a || !this.local) return;
    const now = performance.now();
    if (!this.cooldown.tryUse(type, now)) {
      this.events.onEmoteRejected(type, this.cooldown.remainingMs(type, now));
      return;
    }
    this.events.onEmoteUsed(type);
    if (this.onLocalEmote) {
      this.onLocalEmote(type);
      // Play our own animation immediately; the server echoes hits.
      this.playEmote(a.id, type, []);
    } else {
      // Offline: resolve punch targets locally.
      const hits =
        type === 'punch'
          ? findPunchTargets(
              { id: a.id, x: a.position.x, z: a.position.z, ry: a.ry },
              [...this.avatars.values()].map((o) => ({
                id: o.id,
                x: o.position.x,
                z: o.position.z,
                ry: o.ry,
              })),
            )
          : [];
      this.playEmote(a.id, type, hits);
    }
  }

  /** Play an emote on an avatar (local echo or network event). */
  playEmote(fromId: string, type: EmoteType, hits: string[], animate = true): void {
    const a = this.avatars.get(fromId);
    if (!a) return;
    const gain = this.audibleGain(a);
    if (animate) {
      a.playEmote(type);
      if (type === 'celebrate') {
        this.confetti.burst(a.position.x, a.position.y + 1.6, a.position.z);
        this.sound.celebrate(gain);
      } else {
        this.sound.punch(gain * 0.4);
      }
    }
    if (hits.length) {
      // Delay the stagger to line up with the fist landing.
      window.setTimeout(() => {
        for (const id of hits) {
          const t = this.avatars.get(id);
          if (t) t.playStagger(a.position.x, a.position.z);
        }
        this.sound.punch(gain);
      }, 110);
    }
  }

  private audibleGain(a: Avatar): number {
    const l = this.localAvatar;
    if (!l) return 0.5;
    const d = l.position.distanceTo(a.position);
    return Math.max(0, 1 - d / 22);
  }

  private readonly resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 70 : 60;
    this.camera.updateProjectionMatrix();
  };

  private readonly frame = (): void => {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.time += dt;
    const t = this.time;

    if (this.local && this.localAvatar) {
      const mv = this.input.moveVector();
      const b = this.rig.basis();
      const dx = b.fx * mv.y + b.rx * mv.x;
      const dz = b.fz * mv.y + b.rz * mv.x;
      this.local.apply(dx, dz, dt);
      this.local.decayError(dt);
      this.localAvatar.position.set(
        this.local.x + this.local.errX,
        0,
        this.local.z + this.local.errZ,
      );
      this.localAvatar.ry = lerpAngle(this.localAvatar.ry, this.local.ry, 1 - Math.exp(-dt * 18));
      this.onTick?.(dt);
      this.rig.update(this.localAvatar.position, dt);
    } else {
      // Attract mode behind the landing screen: slow orbit around the fire.
      this.rig.yaw = t * 0.06;
      this.rig.pitch = 0.32;
      this.rig.distance = 10;
      this.rig.update(this.tmp.set(0, 0.6, 0), dt, true);
    }

    this.fill.position.copy(this.camera.position);
    this.fill.target.position.set(this.camera.position.x * 0.2, 0.5, this.camera.position.z * 0.2);
    for (const a of this.avatars.values()) a.update(dt, t);
    this.cave.update(t);
    this.fire.update(t, dt);
    this.confetti.update(dt);
    this.chars.render(this.avatars.values());
    this.renderer.render(this.scene, this.camera);
    this.labels.update(this.avatars.values(), this.camera, window.innerWidth, window.innerHeight);
    this.dev.players = this.avatars.size;
    this.dev.frame(dt, this.renderer);
  };
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
