import * as THREE from 'three';
import { BUBBLE_MS } from '@fancave/shared';
import type { Avatar } from '../actors/Avatar';
import { el } from './dom';

const FADE_START = 9;
const FADE_END = 24;

interface Label {
  root: HTMLDivElement;
  name: HTMLDivElement;
  bubble: HTMLDivElement;
  bubbleUntil: number;
  shownName: string;
  lastOpacity: number;
}

/**
 * Name tags and speech bubbles rendered as DOM overlays projected from 3D. They always
 * face the camera, stay crisp at any DPR and cost zero draw calls.
 */
export class Labels {
  private readonly labels = new Map<string, Label>();
  private readonly v = new THREE.Vector3();

  constructor(private readonly layer: HTMLElement) {}

  private ensure(a: Avatar): Label {
    let l = this.labels.get(a.id);
    if (!l) {
      const name = el('div.tag-name');
      const bubble = el('div.bubble');
      const root = el('div.tag', {}, bubble, name);
      if (a.isLocal) root.classList.add('tag-local');
      this.layer.append(root);
      l = { root, name, bubble, bubbleUntil: 0, shownName: '', lastOpacity: -1 };
      this.labels.set(a.id, l);
    }
    return l;
  }

  say(a: Avatar, text: string): void {
    const l = this.ensure(a);
    l.bubble.textContent = text;
    l.bubble.classList.add('show');
    l.bubbleUntil = performance.now() + BUBBLE_MS;
  }

  remove(id: string): void {
    const l = this.labels.get(id);
    if (l) {
      l.root.remove();
      this.labels.delete(id);
    }
  }

  clear(): void {
    for (const id of [...this.labels.keys()]) this.remove(id);
  }

  update(avatars: Iterable<Avatar>, camera: THREE.PerspectiveCamera, w: number, h: number): void {
    const now = performance.now();
    for (const a of avatars) {
      const l = this.ensure(a);
      const label = a.online ? a.name : `${a.name} (reconnecting…)`;
      if (l.shownName !== label) {
        l.name.textContent = label;
        l.shownName = label;
      }
      if (l.bubbleUntil && now > l.bubbleUntil) {
        l.bubble.classList.remove('show');
        l.bubbleUntil = 0;
      }
      a.headAnchor(this.v);
      const dist = this.v.distanceTo(camera.position);
      this.v.project(camera);
      const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2;
      const fade = 1 - Math.min(1, Math.max(0, (dist - FADE_START) / (FADE_END - FADE_START)));
      const opacity = visible ? fade * (a.online ? 1 : 0.55) : 0;
      if (Math.abs(opacity - l.lastOpacity) > 0.01) {
        l.root.style.opacity = opacity.toFixed(2);
        l.root.style.visibility = opacity > 0.01 ? 'visible' : 'hidden';
        l.lastOpacity = opacity;
      }
      if (opacity <= 0.01) continue;
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      const scale = Math.max(0.7, Math.min(1.1, 8 / Math.max(1, dist)));
      l.root.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(2)})`;
      l.root.style.zIndex = String(1000 - Math.round(dist * 10));
    }
  }
}
