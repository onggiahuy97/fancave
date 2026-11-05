import { describe, expect, it } from 'vitest';
import {
  CHAT_HISTORY,
  CHAT_MAX_LEN,
  CHAT_RATE_MS,
  RateLimiter,
  sanitizeChat,
} from '@fancave/shared';
import { ChatLog, moderateChat } from '../src/features/chat';
import type { TextFilter } from '../src/moderation/profanity';
import { WordListFilter } from '../src/moderation/profanity';

const pass: TextFilter = { clean: (t) => t };

describe('sanitizeChat', () => {
  it('trims, collapses whitespace and strips control characters', () => {
    expect(sanitizeChat('  hello \n\t world\u0007  ')).toBe('hello world');
  });

  it(`caps messages at ${CHAT_MAX_LEN} characters`, () => {
    expect(sanitizeChat('a'.repeat(500))).toHaveLength(CHAT_MAX_LEN);
    expect([...(sanitizeChat('😀'.repeat(300)) ?? '')]).toHaveLength(CHAT_MAX_LEN);
  });

  it('rejects empty and non-string payloads', () => {
    expect(sanitizeChat('   ')).toBeNull();
    expect(sanitizeChat(undefined)).toBeNull();
    expect(sanitizeChat({ text: 'x' })).toBeNull();
  });

  it('leaves markup as plain text (the client renders with textContent)', () => {
    expect(sanitizeChat('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });
});

describe('moderateChat', () => {
  it('accepts a normal message', () => {
    expect(moderateChat({ text: 'hi' }, new RateLimiter(CHAT_RATE_MS), 0, pass)).toEqual({
      ok: true,
      text: 'hi',
    });
  });

  it('rate limits to one message per second', () => {
    const lim = new RateLimiter(CHAT_RATE_MS);
    expect(moderateChat({ text: '1' }, lim, 0, pass).ok).toBe(true);
    const second = moderateChat({ text: '2' }, lim, 500, pass);
    expect(second.ok).toBe(false);
    expect(!second.ok && second.notice?.kind).toBe('chat-rate');
    expect(moderateChat({ text: '3' }, lim, 999, pass).ok).toBe(false);
    expect(moderateChat({ text: '4' }, lim, 1000, pass).ok).toBe(true);
  });

  it('does not burn the rate limit on invalid messages', () => {
    const lim = new RateLimiter(CHAT_RATE_MS);
    expect(moderateChat({ text: '   ' }, lim, 0, pass).ok).toBe(false);
    expect(moderateChat({ text: 'real' }, lim, 1, pass).ok).toBe(true);
  });

  it('rejects malformed payloads silently', () => {
    const lim = new RateLimiter(CHAT_RATE_MS);
    for (const bad of [null, 'text', 42, { text: 5 }, { msg: 'hi' }]) {
      expect(moderateChat(bad, lim, 0, pass)).toEqual({ ok: false });
    }
  });

  it('runs the profanity hook and can drop messages', () => {
    const upper: TextFilter = { clean: (t) => t.toUpperCase() };
    expect(moderateChat({ text: 'go reds' }, new RateLimiter(1), 0, upper)).toEqual({
      ok: true,
      text: 'GO REDS',
    });
    const block: TextFilter = { clean: () => null };
    const d = moderateChat({ text: 'x x' }, new RateLimiter(1), 0, block);
    expect(d.ok).toBe(false);
  });
});

describe('WordListFilter', () => {
  const f = new WordListFilter();

  it('masks listed words, keeping the first letter', () => {
    expect(f.clean('what the fuck ref')).toBe('what the f*** ref');
    expect(f.clean('SHIT happens')).toBe('S*** happens');
  });

  it('catches simple leetspeak', () => {
    expect(f.clean('sh1t')).toBe('s***');
  });

  it('masks Vietnamese words with diacritics', () => {
    expect(f.clean('đéo hiểu')).toBe('đ** hiểu');
  });

  it('does not touch innocent words containing a listed word', () => {
    expect(f.clean('a classic assessment of Dickens')).toBe('a classic assessment of Dickens');
  });
});

describe('ChatLog', () => {
  it(`keeps only the last ${CHAT_HISTORY} messages with increasing ids`, () => {
    const log = new ChatLog();
    for (let i = 0; i < CHAT_HISTORY + 20; i++)
      log.add({ from: 'a', name: 'A', text: String(i), t: i });
    const r = log.recent();
    expect(r).toHaveLength(CHAT_HISTORY);
    expect(r[0]?.text).toBe('20');
    expect(r.at(-1)?.id).toBe(CHAT_HISTORY + 20);
  });
});
