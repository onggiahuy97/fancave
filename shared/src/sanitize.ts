import { CHAT_MAX_LEN, NICK_MAX, NICK_MIN } from './constants';

// Control, format, surrogate and private-use characters.
const CONTROL = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu;
// Nicknames: letters (incl. diacritics), digits, space, underscore, dash, dot.
const NICK_DISALLOWED = /[^\p{L}\p{M}\p{N} _.-]/gu;

function codePointLength(s: string): number {
  return [...s].length;
}

function truncateCodePoints(s: string, max: number): string {
  const cps = [...s];
  return cps.length <= max ? s : cps.slice(0, max).join('');
}

/** Normalised nickname, or null if it is not 3-16 characters after cleaning. */
export function sanitizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .normalize('NFC')
    .replace(CONTROL, '')
    .replace(NICK_DISALLOWED, '')
    .replace(/\s+/g, ' ')
    .trim();
  const len = codePointLength(cleaned);
  if (len < NICK_MIN || len > NICK_MAX) return null;
  return cleaned;
}

/** Cleaned chat text truncated to CHAT_MAX_LEN, or null if empty / not a string. */
export function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Bound the work done on hostile payloads before any regex runs.
  const bounded = raw.length > CHAT_MAX_LEN * 4 ? raw.slice(0, CHAT_MAX_LEN * 4) : raw;
  const cleaned = bounded.normalize('NFC').replace(CONTROL, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return null;
  return truncateCodePoints(cleaned, CHAT_MAX_LEN);
}
