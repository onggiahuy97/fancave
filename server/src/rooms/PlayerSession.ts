import { CHAT_RATE_MS, EmoteCooldown, MoveBudget, RateLimiter } from '@fancave/shared';

/** Server-only per-player bookkeeping (never synchronised to clients). */
export class PlayerSession {
  readonly budget: MoveBudget;
  readonly chat = new RateLimiter(CHAT_RATE_MS);
  readonly emotes = new EmoteCooldown();

  constructor(nowMs: number) {
    this.budget = new MoveBudget(nowMs);
  }
}
