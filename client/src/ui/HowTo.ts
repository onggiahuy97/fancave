import { el } from './dom';

export class HowTo {
  readonly root: HTMLDivElement;

  constructor() {
    const close = el('button.btn.btn-primary', { type: 'button' }, 'Got it');
    close.addEventListener('click', () => this.hide());
    const row = (k: string, v: string) => el('tr', {}, el('td.key', {}, k), el('td', {}, v));
    this.root = el(
      'div.modal-backdrop.hidden',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'How to play' },
      el(
        'div.modal',
        {},
        el('h2', {}, 'How to play'),
        el('h3', {}, 'Desktop'),
        el(
          'table.controls',
          {},
          row('W A S D / ↑ ← ↓ →', 'Walk'),
          row('Drag mouse', 'Orbit camera'),
          row('Mouse wheel', 'Zoom'),
          row('Enter', 'Chat (Enter to send, Esc to close)'),
          row('F', 'Punch (knocks back fans in front of you)'),
          row('E / Space', 'Celebrate (confetti!)'),
          row('`', 'Dev overlay (FPS / ping)'),
        ),
        el('h3', {}, 'Mobile'),
        el(
          'table.controls',
          {},
          row('Left thumbstick', 'Walk'),
          row('Drag screen', 'Orbit camera'),
          row('Pinch', 'Zoom'),
          row('👊 🎉 💬', 'Punch, celebrate, chat'),
        ),
        el('p.muted', {}, 'Be nice — punches are just for show. Emotes have a 2 second cooldown.'),
        close,
      ),
    );
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.hide();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
