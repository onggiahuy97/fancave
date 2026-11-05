import type { EmoteType } from '@fancave/shared';

export interface InputCallbacks {
  onEmote(type: EmoteType): void;
  onOpenChat(): void;
  onToggleDev(): void;
  onOrbit(dx: number, dy: number): void;
  onZoom(factor: number): void;
}

/**
 * Keyboard + mouse/touch camera input. Movement is read as a screen-space vector
 * (x = right, y = forward) and combined with the joystick by the game.
 */
export class Input {
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  /** Joystick vector (set by the Joystick widget). */
  stick = { x: 0, y: 0 };
  enabled = true;

  constructor(
    private readonly surface: HTMLElement,
    private readonly cb: InputCallbacks,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
    surface.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    surface.addEventListener('wheel', this.onWheel, { passive: false });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private typing(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.typing(e) || !this.enabled) return;
    const k = e.key.toLowerCase();
    if (k === 'enter') {
      e.preventDefault();
      this.keys.clear();
      this.cb.onOpenChat();
      return;
    }
    if (e.repeat) return;
    if (k === 'f' || k === 'q') this.cb.onEmote('punch');
    else if (k === 'e' || k === ' ') {
      e.preventDefault();
      this.cb.onEmote('celebrate');
    } else if (k === '`' || k === 'f3') {
      e.preventDefault();
      this.cb.onToggleDev();
    }
    this.keys.add(k);
    if (k.startsWith('arrow')) e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) this.pinchDist = this.currentPinch();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 1) {
      this.cb.onOrbit(dx, dy);
    } else if (this.pointers.size === 2) {
      const d = this.currentPinch();
      if (this.pinchDist > 0 && d > 0) this.cb.onZoom(this.pinchDist / d);
      this.pinchDist = d;
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.pinchDist = this.pointers.size === 2 ? this.currentPinch() : 0;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.cb.onZoom(Math.exp(e.deltaY * 0.001));
  };

  private currentPinch(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  clearKeys(): void {
    this.keys.clear();
  }

  /** Screen-space move vector: x right, y forward, |v| <= 1. */
  moveVector(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('w') || k.has('arrowup')) y += 1;
    if (k.has('s') || k.has('arrowdown')) y -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    x += this.stick.x;
    y += this.stick.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.surface.removeEventListener('wheel', this.onWheel);
  }
}
