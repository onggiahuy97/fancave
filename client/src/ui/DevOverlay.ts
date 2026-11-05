import type * as THREE from 'three';
import { el } from './dom';

/** Toggleable FPS / frame time / draw calls / latency readout. */
export class DevOverlay {
  readonly root: HTMLDivElement;
  visible = new URLSearchParams(location.search).has('dev');
  ping: number | null = null;
  players = 0;
  private frames = 0;
  private acc = 0;
  private worst = 0;

  constructor() {
    this.root = el('div.dev-overlay');
    this.root.classList.toggle('hidden', !this.visible);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('hidden', !this.visible);
  }

  frame(dt: number, renderer: THREE.WebGLRenderer): void {
    this.frames++;
    this.acc += dt;
    this.worst = Math.max(this.worst, dt);
    if (this.acc < 0.5) return;
    if (this.visible) {
      const info = renderer.info.render;
      const fps = this.frames / this.acc;
      this.root.textContent = [
        `FPS ${fps.toFixed(0)}  (worst ${(this.worst * 1000).toFixed(1)} ms)`,
        `draws ${info.calls}  tris ${(info.triangles / 1000).toFixed(1)}k`,
        `ping ${this.ping === null ? '—' : `${this.ping.toFixed(0)} ms`}`,
        `fans ${this.players}`,
      ].join('\n');
    }
    this.frames = 0;
    this.acc = 0;
    this.worst = 0;
  }
}
