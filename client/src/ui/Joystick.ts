import { el } from './dom';

/** Virtual thumbstick (bottom-left). Writes a {x, y} vector, y = forward. */
export class Joystick {
  readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointerId: number | null = null;
  private cx = 0;
  private cy = 0;
  private readonly radius = 52;

  constructor(private readonly out: { x: number; y: number }) {
    this.knob = el('div.joy-knob');
    this.root = el('div.joystick', { 'aria-label': 'Move' }, this.knob);
    this.root.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
  }

  private readonly down = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    const r = this.root.getBoundingClientRect();
    this.cx = r.left + r.width / 2;
    this.cy = r.top + r.height / 2;
    this.move(e);
  };

  private readonly move = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    let dx = e.clientX - this.cx;
    let dy = e.clientY - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      dx = (dx / d) * this.radius;
      dy = (dy / d) * this.radius;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Small dead zone so resting a thumb doesn't drift; rescale the rest to 0..1.
    const nx = dx / this.radius;
    const ny = dy / this.radius;
    const mag = Math.hypot(nx, ny);
    const scale = mag < 0.12 ? 0 : (mag - 0.12) / 0.88 / mag;
    this.out.x = nx * scale;
    this.out.y = -ny * scale;
  };

  private readonly up = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.out.x = 0;
    this.out.y = 0;
    this.knob.style.transform = '';
  };
}
