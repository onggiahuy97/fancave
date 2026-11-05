import type { ChatEntry, NoticeMsg, RateLimiter } from '@fancave/shared';
import { CHAT_HISTORY, sanitizeChat } from '@fancave/shared';
import type { TextFilter } from '../moderation/profanity';

/** Rolling buffer of the last CHAT_HISTORY messages for late joiners. */
export class ChatLog {
  private readonly entries: ChatEntry[] = [];
  private nextId = 1;

  add(entry: Omit<ChatEntry, 'id'>): ChatEntry {
    const e: ChatEntry = { id: this.nextId++, ...entry };
    this.entries.push(e);
    if (this.entries.length > CHAT_HISTORY)
      this.entries.splice(0, this.entries.length - CHAT_HISTORY);
    return e;
  }

  recent(): ChatEntry[] {
    return [...this.entries];
  }
}

export type ChatDecision = { ok: true; text: string } | { ok: false; notice?: NoticeMsg };

/**
 * Validate one chat message: payload shape, sanitising + 200 char cap, 1 msg/sec rate
 * limit, then the profanity filter hook.
 */
export function moderateChat(
  raw: unknown,
  limiter: RateLimiter,
  nowMs: number,
  filter: TextFilter,
): ChatDecision {
  const text = sanitizeChat(
    raw && typeof raw === 'object' ? (raw as { text?: unknown }).text : undefined,
  );
  if (text === null) return { ok: false };
  if (!limiter.tryConsume(nowMs)) {
    return {
      ok: false,
      notice: { kind: 'chat-rate', text: 'Easy there — one message per second.' },
    };
  }
  const cleaned = filter.clean(text);
  if (cleaned === null) return { ok: false, notice: { kind: 'invalid', text: 'Message blocked.' } };
  return { ok: true, text: cleaned };
}
