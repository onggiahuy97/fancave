import type { ChatEntry } from '@fancave/shared';
import { CHAT_HISTORY, CHAT_MAX_LEN, CHAT_RATE_MS } from '@fancave/shared';
import { el } from './dom';

export interface ChatCallbacks {
  onSend(text: string): void;
  /** Local feedback when the user types faster than the server allows. */
  onTooFast(): void;
}

/** Collapsible chat panel with an unread badge and the last 50 messages. */
export class Chat {
  readonly root: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly badge: HTMLSpanElement;
  private readonly panel: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly seen = new Set<number>();
  private open = false;
  private unread = 0;
  private lastSent = -Infinity;
  selfId = '';

  constructor(private readonly cb: ChatCallbacks) {
    this.badge = el('span.chat-badge.hidden', { 'aria-label': 'unread messages' });
    this.toggle = el(
      'button.chat-toggle',
      { type: 'button' },
      el('span.chat-toggle-label', {}, 'Show chat'),
      this.badge,
    );
    this.toggle.addEventListener('click', () => (this.open ? this.close() : this.show(false)));
    this.list = el('div.chat-list', { role: 'log', 'aria-live': 'polite' });
    this.input = el('input.chat-input', {
      type: 'text',
      maxlength: CHAT_MAX_LEN,
      placeholder: 'Say something… (Enter)',
      enterkeyhint: 'send',
      autocomplete: 'off',
      'aria-label': 'Chat message',
    });
    const send = el('button.chat-send', { type: 'submit', 'aria-label': 'Send' }, '➤');
    const form = el('form.chat-form', {}, this.input, send);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.input.blur();
        if (!this.input.value) this.close();
      }
      e.stopPropagation();
    });
    this.panel = el('div.chat-panel.hidden', {}, this.list, form);
    this.root = el('div.chat', {}, this.toggle, this.panel);
    // Keep pointer interaction with the chat from orbiting the camera.
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  /** Open the panel; optionally focus the input (Enter key / chat button). */
  show(focus = true): void {
    this.open = true;
    this.panel.classList.remove('hidden');
    this.toggle.querySelector('.chat-toggle-label')!.textContent = 'Hide chat';
    this.unread = 0;
    this.renderBadge();
    this.list.scrollTop = this.list.scrollHeight;
    if (focus) this.input.focus();
  }

  close(): void {
    this.open = false;
    this.input.blur();
    this.panel.classList.add('hidden');
    this.toggle.querySelector('.chat-toggle-label')!.textContent = 'Show chat';
  }

  /** Toggle focus into the input (Enter pressed in-game). */
  focusInput(): void {
    if (!this.open) this.show(true);
    else this.input.focus();
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (!text) {
      this.input.blur();
      return;
    }
    const now = performance.now();
    if (now - this.lastSent < CHAT_RATE_MS) {
      this.cb.onTooFast();
      return;
    }
    this.lastSent = now;
    this.cb.onSend(text);
    this.input.value = '';
    // On desktop keep typing flow; Enter on an empty box returns to the game.
  }

  setHistory(entries: ChatEntry[]): void {
    for (const e of entries) this.add(e, false);
  }

  add(e: ChatEntry, countUnread = true): void {
    if (this.seen.has(e.id)) return;
    this.seen.add(e.id);
    const row = el('div.chat-row', { 'data-id': e.id });
    if (e.system) {
      row.classList.add('system');
      row.textContent = e.text;
    } else {
      const name = el('span.chat-name', {}, e.name);
      if (e.from === this.selfId) row.classList.add('self');
      row.append(name, document.createTextNode(' '), el('span.chat-text', {}, e.text));
    }
    const stick = this.list.scrollTop + this.list.clientHeight >= this.list.scrollHeight - 30;
    // History can arrive after live messages: keep rows ordered by server id.
    let after: Element | null = null;
    for (let n = this.list.lastElementChild; n; n = n.previousElementSibling) {
      if (Number((n as HTMLElement).dataset.id) < e.id) {
        after = n;
        break;
      }
    }
    if (after) after.after(row);
    else this.list.prepend(row);
    while (this.list.childElementCount > CHAT_HISTORY) this.list.firstElementChild?.remove();
    if (stick || e.from === this.selfId) this.list.scrollTop = this.list.scrollHeight;
    if (!this.open && countUnread && !e.system && e.from !== this.selfId) {
      this.unread++;
      this.renderBadge();
    }
  }

  private renderBadge(): void {
    this.badge.textContent = this.unread > 9 ? '9+' : String(this.unread);
    this.badge.classList.toggle('hidden', this.unread === 0);
  }

  reset(): void {
    this.list.replaceChildren();
    this.seen.clear();
    this.unread = 0;
    this.renderBadge();
    this.close();
  }
}
