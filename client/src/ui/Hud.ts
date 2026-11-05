import { CAVE_TITLE } from '@fancave/shared';
import type { EmoteType } from '@fancave/shared';
import { el, isTouchDevice } from './dom';
import { Joystick } from './Joystick';

export interface HudCallbacks {
  onLeave(): void;
  onToggleMute(): boolean;
  onHowTo(): void;
  onToggleDev(): void;
  onEmote(type: EmoteType): void;
  onChat(): void;
}

/** In-game overlay: top bar, online count, action buttons, joystick and toasts. */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly count: HTMLDivElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly toasts: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly cooldowns = new Map<EmoteType, HTMLButtonElement>();

  constructor(cb: HudCallbacks, stick: { x: number; y: number }, muted: boolean) {
    const button = (cls: string, label: string, title: string, fn: () => void) => {
      const b = el(`button.${cls}`, { type: 'button', title, 'aria-label': title }, label);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
        b.blur();
      });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      return b;
    };
    this.muteBtn = button('hud-btn', muted ? '🔇' : '🔊', 'Mute / unmute', () => {
      const m = cb.onToggleMute();
      this.muteBtn.textContent = m ? '🔇' : '🔊';
    });
    const bar = el(
      'div.hud-bar',
      {},
      button('hud-btn.hud-leave', 'Leave', 'Leave the cave', cb.onLeave),
      this.muteBtn,
      button('hud-btn', '?', 'How to play', cb.onHowTo),
      button('hud-btn.hud-dev', 'FPS', 'Toggle dev overlay', cb.onToggleDev),
    );
    this.count = el('div.hud-count', { 'aria-live': 'polite' }, `${CAVE_TITLE} · 1 fan`);
    const punch = button('action-btn', '👊', 'Punch (F)', () => cb.onEmote('punch'));
    const celebrate = button('action-btn', '🎉', 'Celebrate (E)', () => cb.onEmote('celebrate'));
    this.cooldowns.set('punch', punch);
    this.cooldowns.set('celebrate', celebrate);
    const actions = el(
      'div.actions',
      {},
      button('action-btn.action-chat', '💬', 'Chat (Enter)', cb.onChat),
      punch,
      celebrate,
    );
    this.toasts = el('div.toasts', { 'aria-live': 'polite' });
    this.status = el('div.conn-status.hidden');
    this.root = el('div.hud.hidden', {}, bar, this.count, actions, this.toasts, this.status);
    if (isTouchDevice()) {
      this.root.classList.add('touch');
      this.root.append(new Joystick(stick).root);
    }
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setCount(n: number): void {
    this.count.textContent = `${CAVE_TITLE} · ${n} ${n === 1 ? 'fan' : 'fans'}`;
  }

  /** Grey out an emote button for its cooldown. */
  cooldown(type: EmoteType, ms: number): void {
    const b = this.cooldowns.get(type);
    if (!b) return;
    b.classList.add('cooling');
    b.style.setProperty('--cd', `${ms}ms`);
    window.setTimeout(() => b.classList.remove('cooling'), ms);
  }

  toast(text: string, ms = 2200): void {
    const t = el('div.toast', {}, text);
    this.toasts.append(t);
    while (this.toasts.childElementCount > 3) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => t.classList.add('out'), ms);
    window.setTimeout(() => t.remove(), ms + 400);
  }

  /** Persistent connection banner ("Reconnecting…"); empty string hides it. */
  setStatus(text: string): void {
    this.status.textContent = text;
    this.status.classList.toggle('hidden', !text);
  }
}
