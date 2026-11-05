import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type { Room } from 'colyseus.js';
import { Client } from 'colyseus.js';
import type { ChatEntry, NoticeMsg, PlayerState, WelcomeMsg } from '@fancave/shared';
import { C2S, MAX_PLAYERS, RECONNECT_WINDOW_S, ROOM_NAME, S2C } from '@fancave/shared';
import { CaveRoom } from '../src/rooms/CaveRoom';

const PORT = 2700 + Math.floor(Math.random() * 200);
let server: Server;

interface State {
  players: Map<string, PlayerState> & { size: number };
}

beforeAll(async () => {
  server = new Server({ transport: new WebSocketTransport({ server: http.createServer() }) });
  server.define(ROOM_NAME, CaveRoom);
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const client = () => new Client(`ws://localhost:${PORT}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out');
    await wait(20);
  }
}

describe('CaveRoom', () => {
  it('rejects invalid nicknames at join', async () => {
    await expect(client().joinOrCreate(ROOM_NAME, { name: 'x' })).rejects.toThrow(/Nickname/);
    await expect(client().joinOrCreate(ROOM_NAME, {})).rejects.toThrow(/Nickname/);
  });

  it('stores the sanitized nickname and syncs players to each other', async () => {
    const a = await client().joinOrCreate<State>(ROOM_NAME, { name: '  Alice  <3 ' });
    const b = await client().joinOrCreate<State>(ROOM_NAME, { name: 'Bob' });
    expect(a.roomId).toBe(b.roomId);
    await until(() => a.state.players.size === 2 && b.state.players.size === 2);
    expect(b.state.players.get(a.sessionId)?.name).toBe('Alice 3');
    await a.leave();
    await until(() => b.state.players.size === 1);
    await b.leave();
  });

  it('server is authoritative: moves by simulated input, not claimed position', async () => {
    const a = await client().joinOrCreate<State>(ROOM_NAME, { name: 'Mover' });
    await until(() => a.state.players.size >= 1);
    const me = () => a.state.players.get(a.sessionId)!;
    const start = { x: me().x, z: me().z };
    // A cheating payload claiming giant steps + a bogus extra field.
    a.send(C2S.Input, {
      i: [
        [1, 50, 0, 5],
        [2, 50, 0, 5],
      ],
      x: 999,
    });
    await until(() => me().seq === 2);
    const moved = Math.hypot(me().x - start.x, me().z - start.z);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(4.5 * 0.2 + 1e-3);
    await a.leave();
  });

  it('keeps a dropped player for the reconnection window, then cleans up', async () => {
    const watcher = await client().joinOrCreate<State>(ROOM_NAME, { name: 'Watcher' });
    const c = client();
    const flaky = await c.joinOrCreate<State>(ROOM_NAME, { name: 'Flaky' });
    const id = flaky.sessionId;
    await until(() => watcher.state.players.get(id) !== undefined);

    // Non-consented drop -> marked offline but kept.
    flaky.connection.close();
    await until(() => watcher.state.players.get(id)?.online === false);

    // Reconnect within the window -> same player, online again.
    const back = await c.reconnect<State>(flaky.reconnectionToken);
    expect(back.sessionId).toBe(id);
    await until(() => watcher.state.players.get(id)?.online === true);

    // Drop again and stay away -> removed within ~5s.
    const dropped = Date.now();
    back.connection.close();
    await until(() => watcher.state.players.get(id) === undefined, (RECONNECT_WINDOW_S + 2) * 1000);
    expect(Date.now() - dropped).toBeLessThan((RECONNECT_WINDOW_S + 1) * 1000);
    await watcher.leave();
  }, 20_000);

  it('removes players immediately on a consented leave', async () => {
    const watcher = await client().joinOrCreate<State>(ROOM_NAME, { name: 'Watcher2' });
    const p: Room<State> = await client().joinOrCreate<State>(ROOM_NAME, { name: 'Leaver' });
    await until(() => watcher.state.players.get(p.sessionId) !== undefined);
    await p.leave(true);
    await until(() => watcher.state.players.get(p.sessionId) === undefined, 1000);
    await watcher.leave();
  });

  it(`opens a new instance when a cave reaches ${MAX_PLAYERS} fans`, async () => {
    const rooms: Room<State>[] = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      rooms.push(await client().joinOrCreate<State>(ROOM_NAME, { name: `Fan ${i}` }));
    }
    const full = rooms[0]!.roomId;
    expect(rooms.every((r) => r.roomId === full)).toBe(true);
    const extra = await client().joinOrCreate<State>(ROOM_NAME, { name: 'Late Fan' });
    expect(extra.roomId).not.toBe(full);
    await Promise.all([...rooms, extra].map((r) => r.leave()));
  }, 30_000);

  it('broadcasts chat, rate limits spam and replays history to late joiners', async () => {
    const a = await client().joinOrCreate<State>(ROOM_NAME, { name: 'Talker' });
    const b = await client().joinOrCreate<State>(ROOM_NAME, { name: 'Listener' });
    const heard: ChatEntry[] = [];
    const notices: NoticeMsg[] = [];
    b.onMessage(S2C.Chat, (m: ChatEntry) => heard.push(m));
    a.onMessage(S2C.Chat, () => undefined);
    a.onMessage(S2C.Notice, (m: NoticeMsg) => notices.push(m));
    a.send(C2S.Chat, { text: '  come on   you reds  ' });
    a.send(C2S.Chat, { text: 'spam' });
    await until(() => heard.some((m) => !m.system) && notices.length > 0);
    const said = heard.filter((m) => !m.system);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({ from: a.sessionId, name: 'Talker', text: 'come on you reds' });
    expect(notices[0]?.kind).toBe('chat-rate');

    const late = await client().joinOrCreate<State>(ROOM_NAME, { name: 'Latecomer' });
    let welcome: WelcomeMsg | null = null;
    late.onMessage(S2C.Welcome, (m: WelcomeMsg) => (welcome = m));
    late.onMessage(S2C.Chat, () => undefined);
    late.send(C2S.Hello);
    await until(() => welcome !== null);
    expect(welcome!.history.some((m) => m.text === 'come on you reds')).toBe(true);
    await Promise.all([a.leave(), b.leave(), late.leave()]);
  });
});
