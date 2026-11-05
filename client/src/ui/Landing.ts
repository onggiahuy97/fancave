import {
  CAVE_TITLE,
  NICK_MAX,
  NICK_MIN,
  NICK_STORAGE_KEY,
  sanitizeNickname,
} from '@fancave/shared';
import { el } from './dom';

function loadNick(): string {
  try {
    return localStorage.getItem(NICK_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveNick(n: string): void {
  try {
    localStorage.setItem(NICK_STORAGE_KEY, n);
  } catch {
    /* storage unavailable (private mode) — nickname just isn't remembered */
  }
}

/** Nickname entry screen. Resolves with the sanitized nickname. */
export class Landing {
  readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly error: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private resolve: ((name: string) => void) | null = null;

  constructor(onHowTo: () => void) {
    this.input = el('input.nick-input', {
      type: 'text',
      maxlength: NICK_MAX + 8,
      placeholder: 'Your nickname',
      autocomplete: 'nickname',
      spellcheck: 'false',
      'aria-label': 'Nickname',
    });
    this.input.value = loadNick();
    this.error = el('div.nick-error', { role: 'alert' });
    this.button = el('button.btn.btn-primary.enter-btn', { type: 'submit' }, 'Enter the cave');
    const howTo = el('button.btn-link', { type: 'button' }, 'How to play');
    howTo.addEventListener('click', onHowTo);
    const form = el(
      'form.landing-card',
      {},
      el('div.landing-flame', { 'aria-hidden': 'true' }),
      el('h1.landing-title', {}, CAVE_TITLE),
      el('p.landing-sub', {}, 'The fan club hangout. Pull up a seat by the fire.'),
      this.input,
      this.error,
      this.button,
      howTo,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.input.addEventListener('input', () => (this.error.textContent = ''));
    this.root = el('div.landing', {}, form);
  }

  private submit(): void {
    const name = sanitizeNickname(this.input.value);
    if (!name) {
      this.error.textContent = `Nickname must be ${NICK_MIN}–${NICK_MAX} letters, numbers, spaces, _ - or .`;
      this.input.focus();
      return;
    }
    this.input.value = name;
    saveNick(name);
    this.resolve?.(name);
  }

  /** Show the screen and wait for a valid nickname. */
  ask(message = ''): Promise<string> {
    this.root.classList.remove('hidden');
    this.error.textContent = message;
    this.setBusy(false);
    setTimeout(() => this.input.focus(), 50);
    return new Promise((res) => (this.resolve = res));
  }

  setBusy(busy: boolean, label = 'Entering…'): void {
    this.button.disabled = busy;
    this.button.textContent = busy ? label : 'Enter the cave';
  }

  showError(msg: string): void {
    this.error.textContent = msg;
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
