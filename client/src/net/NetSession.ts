import type { Room } from 'colyseus.js';
import { Client } from 'colyseus.js';
import type {
  ChatEntry,
  EmoteEventMsg,
  EmoteType,
  InputBatchMsg,
  JoinOptions,
  NoticeMsg,
  PingMsg,
  PlayerState,
  WelcomeMsg,
} from '@fancave/shared';
import {
  C2S,
  INTERP_DELAY_MS,
  MAX_INPUTS_PER_BATCH,
  RECONNECT_WINDOW_S,
  ROOM_NAME,
  S2C,
  TICK_MS,
} from '@fancave/shared';
import type { Game } from '../game/Game';
import { SnapshotBuffer } from './Interpolation';

/** Client view of decoded schema objects (colyseus.js reflection). */
interface SyncedPlayer extends PlayerState {
  onChange(cb: () => void): () => void;
}
interface SyncedState {
  players: {
    onAdd(cb: (p: SyncedPlayer, key: string) => void, triggerAll?: boolean): () => void;
    onRemove(cb: (p: SyncedPlayer, key: string) => void): () => void;
    readonly size: number;
  };
}

export interface NetEvents {
  onCount(n: number): void;
  onStatus(text: string): void;
  /** Connection is gone for good (reconnect window expired). */
  onDisconnected(reason: string): void;
  onChat(entry: ChatEntry): void;
  onHistory(entries: ChatEntry[]): void;
  onNotice(n: NoticeMsg): void;
  onPing(ms: number): void;
}

/** After the reconnection window, keep trying fresh joins this long (server restarts). */
const REJOIN_GIVE_UP_MS = 20_000;

export function serverEndpoint(): string {
  const override = new URLSearchParams(location.search).get('server');
  if (override) return override;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/colyseus`;
}

/** Bridges a Colyseus room to the Game: prediction, interpolation, reconnects. */
export class NetSession {
  private room: Room<SyncedState> | null = null;
  private readonly buffers = new Map<string, SnapshotBuffer>();
  private sendAcc = 0;
  private pingAcc = 0;
  private leaving = false;
  private readonly sample = { x: 0, z: 0, ry: 0 };
  private name = '';

  private constructor(
    private readonly client: Client,
    private readonly game: Game,
    private readonly events: NetEvents,
  ) {}

  static async connect(name: string, game: Game, events: NetEvents): Promise<NetSession> {
    const s = new NetSession(new Client(serverEndpoint()), game, events);
    s.name = name;
    const room = await s.client.joinOrCreate<SyncedState>(ROOM_NAME, {
      name,
    } satisfies JoinOptions);
    s.attach(room);
    return s;
  }

  get sessionId(): string {
    return this.room?.sessionId ?? '';
  }

  private attach(room: Room<SyncedState>): void {
    this.room = room;
    const game = this.game;
    game.onTick = (dt) => this.tick(dt);
    game.onLocalEmote = (type) => this.sendEmote(type);

    room.onMessage(S2C.Welcome, (m: WelcomeMsg) => this.events.onHistory(m.history));
    room.onMessage(S2C.Pong, (m: PingMsg) => this.events.onPing(performance.now() - m.t));
    room.onMessage(S2C.Chat, (m: ChatEntry) => this.events.onChat(m));
    room.onMessage(S2C.Notice, (m: NoticeMsg) => this.events.onNotice(m));
    room.onMessage(S2C.Emote, (m: EmoteEventMsg) => {
      // Our own animation already played locally; still apply hits we caused.
      game.playEmote(m.from, m.type, m.hits, m.from !== room.sessionId);
    });

    const players = room.state.players;
    players.onAdd((p, key) => {
      if (key === room.sessionId) {
        if (!game.localAvatar) {
          game.spawnLocal(key, p.name, p.look, { x: p.x, z: p.z });
        } else {
          game.rekeyLocal(key);
        }
        const lp = game.local;
        if (lp) lp.resetTo(p.x, p.z, p.ry, p.seq);
        if (game.localAvatar) game.localAvatar.setLook(p.look);
        p.onChange(() => game.local?.reconcile(p.x, p.z, p.ry, p.seq));
      } else {
        const a = game.avatars.get(key) ?? game.addRemote(key, p.name, p.look, p.x, p.z, p.ry);
        a.online = p.online;
        const buf = new SnapshotBuffer();
        buf.push(performance.now(), p.x, p.z, p.ry);
        this.buffers.set(key, buf);
        p.onChange(() => {
          buf.push(performance.now(), p.x, p.z, p.ry);
          a.online = p.online;
          a.name = p.name;
        });
      }
      this.events.onCount(game.avatars.size);
    }, true);
    players.onRemove((_p, key) => {
      if (key !== room.sessionId) {
        game.removeAvatar(key);
        this.buffers.delete(key);
      }
      this.events.onCount(game.avatars.size);
    });

    room.onLeave((code) => {
      // Anything we didn't ask for (network drop, server restart/deploy) -> reconnect.
      // Note: a server shutdown also closes with the "consented" code.
      if (this.leaving || this.room !== room) return;
      console.info('[net] connection closed', code);
      void this.reconnect();
    });
    room.onError((code, message) => console.warn('[net] room error', code, message));

    room.send(C2S.Hello);
  }

  private async reconnect(): Promise<void> {
    const old = this.room;
    if (!old) return;
    const token = old.reconnectionToken;
    this.room = null;
    this.game.onTick = null;
    this.events.onStatus('Connection lost — reconnecting…');
    // Remote avatars are rebuilt from the fresh state after reconnecting.
    for (const id of [...this.game.avatars.keys()]) {
      if (id !== this.game.localAvatar?.id) this.game.removeAvatar(id);
    }
    this.buffers.clear();
    const deadline = performance.now() + RECONNECT_WINDOW_S * 1000;
    let delay = 400;
    while (!this.leaving && performance.now() < deadline) {
      try {
        const room = await this.client.reconnect<SyncedState>(token);
        this.events.onStatus('');
        this.attach(room);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(1500, delay * 1.6);
      }
    }
    // Window expired (or the server restarted and forgot us): rejoin as a new fan.
    const giveUp = performance.now() + REJOIN_GIVE_UP_MS;
    while (!this.leaving && performance.now() < giveUp) {
      try {
        const room = await this.client.joinOrCreate<SyncedState>(ROOM_NAME, { name: this.name });
        this.events.onStatus('');
        this.attach(room);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    this.events.onStatus('');
    if (!this.leaving) this.events.onDisconnected('Lost connection to the cave.');
  }

  private tick(dt: number): void {
    const room = this.room;
    const local = this.game.local;
    if (!room || !local) return;
    this.sendAcc += dt * 1000;
    if (this.sendAcc >= TICK_MS) {
      this.sendAcc %= TICK_MS;
      const frames = local.drainOutbox();
      for (let i = 0; i < frames.length; i += MAX_INPUTS_PER_BATCH) {
        room.send(C2S.Input, {
          i: frames.slice(i, i + MAX_INPUTS_PER_BATCH),
        } satisfies InputBatchMsg);
      }
    }
    this.pingAcc += dt;
    if (this.pingAcc > 2) {
      this.pingAcc = 0;
      room.send(C2S.Ping, { t: performance.now() } satisfies PingMsg);
    }
    const renderT = performance.now() - INTERP_DELAY_MS;
    for (const [id, buf] of this.buffers) {
      const a = this.game.avatars.get(id);
      if (!a || !buf.sample(renderT, this.sample)) continue;
      a.position.x = this.sample.x;
      a.position.z = this.sample.z;
      a.ry = this.sample.ry;
    }
  }

  sendChat(text: string): void {
    this.room?.send(C2S.Chat, { text });
  }

  sendEmote(type: EmoteType): void {
    this.room?.send(C2S.Emote, { type });
  }

  async leave(): Promise<void> {
    this.leaving = true;
    this.game.onTick = null;
    try {
      await this.room?.leave(true);
    } catch {
      /* already gone */
    }
    this.room = null;
  }
}
