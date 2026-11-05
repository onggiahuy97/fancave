import { describe, expect, it } from 'vitest';
import type { Placed } from '@fancave/shared';
import {
  EMOTE_BROADCAST_RADIUS,
  EMOTE_COOLDOWN_MS,
  EmoteCooldown,
  PUNCH_RANGE,
  findPunchTargets,
} from '@fancave/shared';
import { nearbyRecipients, resolveEmote } from '../src/features/emotes';

// Facing +Z (ry = 0).
const me: Placed = { id: 'me', x: 0, z: 0, ry: 0 };
const at = (id: string, x: number, z: number): Placed => ({ id, x, z, ry: 0 });

describe('findPunchTargets', () => {
  it('hits players within range in front', () => {
    expect(findPunchTargets(me, [at('a', 0, 1), at('b', 0.6, 1.2)])).toEqual(['a', 'b']);
  });

  it(`ignores players beyond ${PUNCH_RANGE}m`, () => {
    expect(findPunchTargets(me, [at('far', 0, PUNCH_RANGE + 0.01)])).toEqual([]);
    expect(findPunchTargets(me, [at('edge', 0, PUNCH_RANGE)])).toEqual(['edge']);
  });

  it('ignores players behind or beside the puncher', () => {
    expect(
      findPunchTargets(me, [at('behind', 0, -1), at('side', 1, 0), at('wide', 1, 0.4)]),
    ).toEqual([]);
  });

  it('respects the puncher facing', () => {
    const east: Placed = { id: 'me', x: 0, z: 0, ry: Math.PI / 2 };
    expect(findPunchTargets(east, [at('e', 1, 0), at('n', 0, 1)])).toEqual(['e']);
  });

  it('never hits yourself', () => {
    expect(findPunchTargets(me, [me])).toEqual([]);
  });
});

describe('EmoteCooldown', () => {
  it(`enforces ${EMOTE_COOLDOWN_MS}ms per emote type`, () => {
    const cd = new EmoteCooldown();
    expect(cd.tryUse('punch', 0)).toBe(true);
    expect(cd.tryUse('punch', EMOTE_COOLDOWN_MS - 1)).toBe(false);
    expect(cd.remainingMs('punch', 1500)).toBe(500);
    expect(cd.tryUse('celebrate', 10)).toBe(true); // independent per type
    expect(cd.tryUse('punch', EMOTE_COOLDOWN_MS)).toBe(true);
  });

  it('a rejected attempt does not extend the cooldown', () => {
    const cd = new EmoteCooldown();
    cd.tryUse('celebrate', 0);
    cd.tryUse('celebrate', 1900);
    expect(cd.tryUse('celebrate', 2000)).toBe(true);
  });
});

describe('resolveEmote', () => {
  it('rejects unknown types without consuming the cooldown', () => {
    const cd = new EmoteCooldown();
    for (const bad of [null, 'punch', { type: 'dance' }, { type: 5 }, {}]) {
      expect(resolveEmote(bad, me, [], cd, 0)).toEqual({ ok: false });
    }
    expect(resolveEmote({ type: 'punch' }, me, [], cd, 0).ok).toBe(true);
  });

  it('returns a cooldown notice when spammed', () => {
    const cd = new EmoteCooldown();
    resolveEmote({ type: 'celebrate' }, me, [], cd, 0);
    const d = resolveEmote({ type: 'celebrate' }, me, [], cd, 400);
    expect(d.ok).toBe(false);
    expect(!d.ok && d.notice?.kind).toBe('emote-cooldown');
  });

  it('punch includes server-computed hits; celebrate never hits', () => {
    const others = [at('victim', 0, 1), at('bystander', 0, -1)];
    expect(resolveEmote({ type: 'punch' }, me, others, new EmoteCooldown(), 0)).toEqual({
      ok: true,
      event: { type: 'punch', from: 'me', hits: ['victim'] },
    });
    expect(resolveEmote({ type: 'celebrate' }, me, others, new EmoteCooldown(), 0)).toEqual({
      ok: true,
      event: { type: 'celebrate', from: 'me', hits: [] },
    });
  });
});

describe('nearbyRecipients', () => {
  it('includes the emoter and players inside the radius only', () => {
    const r = nearbyRecipients(0, 0, [
      me,
      at('near', 3, 4),
      at('far', EMOTE_BROADCAST_RADIUS + 1, 0),
    ]);
    expect([...r].sort()).toEqual(['me', 'near']);
  });
});
