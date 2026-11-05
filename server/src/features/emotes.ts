import type { EmoteCooldown, EmoteEventMsg, NoticeMsg, Placed } from '@fancave/shared';
import { EMOTE_BROADCAST_RADIUS, findPunchTargets, isEmoteType } from '@fancave/shared';

export type EmoteDecision = { ok: true; event: EmoteEventMsg } | { ok: false; notice?: NoticeMsg };

/**
 * Validate an emote request: known type + per-emote cooldown (2s). Punches resolve their
 * cosmetic knockback targets here, on the server, from authoritative positions.
 */
export function resolveEmote(
  raw: unknown,
  actor: Placed,
  others: Iterable<Placed>,
  cooldown: EmoteCooldown,
  nowMs: number,
): EmoteDecision {
  const type = raw && typeof raw === 'object' ? (raw as { type?: unknown }).type : undefined;
  if (!isEmoteType(type)) return { ok: false };
  if (!cooldown.tryUse(type, nowMs)) {
    const s = (cooldown.remainingMs(type, nowMs) / 1000).toFixed(1);
    return { ok: false, notice: { kind: 'emote-cooldown', text: `Cooldown — ${s}s` } };
  }
  const hits = type === 'punch' ? findPunchTargets(actor, others) : [];
  return { ok: true, event: { type, from: actor.id, hits } };
}

/** Session ids that should receive an emote performed at (x, z). */
export function nearbyRecipients(
  x: number,
  z: number,
  players: Iterable<Placed>,
  radius = EMOTE_BROADCAST_RADIUS,
): Set<string> {
  const out = new Set<string>();
  const r2 = radius * radius;
  for (const p of players) {
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz <= r2) out.add(p.id);
  }
  return out;
}
