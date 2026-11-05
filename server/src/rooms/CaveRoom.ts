import type { Client } from 'colyseus';
import { Room, ServerError } from 'colyseus';
import type { ChatEntry, JoinOptions, PingMsg, WelcomeMsg } from '@fancave/shared';
import {
  C2S,
  LOOK_COUNT,
  MAX_PLAYERS,
  RECONNECT_WINDOW_S,
  S2C,
  TICK_MS,
  randomSpawn,
  sanitizeNickname,
} from '@fancave/shared';
import { ChatLog, moderateChat } from '../features/chat';
import { applyInputBatch } from '../features/movement';
import { textFilter } from '../moderation/profanity';
import { CaveState, Player } from './CaveState';
import { PlayerSession } from './PlayerSession';

export interface AuthData {
  name: string;
}

/**
 * One cave instance (max 100 fans). Colyseus' joinOrCreate fills this room and spins up
 * another instance automatically once it's locked at maxClients.
 *
 * Extension point: features are small modules that register message handlers on the
 * room (movement here, chat and emotes in their own files). A future scoreboard or
 * watch-party module plugs in the same way from onCreate().
 */
export class CaveRoom extends Room<CaveState> {
  override maxClients = MAX_PLAYERS;
  readonly sessions = new Map<string, PlayerSession>();
  readonly chatLog = new ChatLog();

  override onCreate(): void {
    this.setState(new CaveState());
    this.setPatchRate(TICK_MS);
    this.setMetadata({ kind: 'cave' });

    this.onMessage(C2S.Input, (client, msg: unknown) => {
      const player = this.state.players.get(client.sessionId);
      const session = this.sessions.get(client.sessionId);
      if (!player || !session || !player.online) return;
      applyInputBatch(player, session.budget, msg, Date.now());
    });

    this.onMessage(C2S.Ping, (client, msg: Partial<PingMsg> | undefined) => {
      const t = typeof msg?.t === 'number' && Number.isFinite(msg.t) ? msg.t : 0;
      client.send(S2C.Pong, { t } satisfies PingMsg);
    });

    this.onMessage(C2S.Hello, (client) => {
      client.send(S2C.Welcome, {
        sessionId: client.sessionId,
        history: this.welcomeHistory(),
      } satisfies WelcomeMsg);
    });

    this.onMessage(C2S.Chat, (client, msg: unknown) => {
      const player = this.state.players.get(client.sessionId);
      const session = this.sessions.get(client.sessionId);
      if (!player || !session) return;
      const d = moderateChat(msg, session.chat, Date.now(), textFilter());
      if (!d.ok) {
        if (d.notice) client.send(S2C.Notice, d.notice);
        return;
      }
      this.broadcastChat({
        from: client.sessionId,
        name: player.name,
        text: d.text,
        t: Date.now(),
      });
    });

    // Ignore unknown message types quietly instead of logging per message.
    this.onMessage('*', () => undefined);
  }

  protected welcomeHistory(): WelcomeMsg['history'] {
    return this.chatLog.recent();
  }

  broadcastChat(entry: Omit<ChatEntry, 'id'>): void {
    this.broadcast(S2C.Chat, this.chatLog.add(entry));
  }

  private system(text: string): void {
    this.broadcastChat({ from: '', name: '', text, t: Date.now(), system: true });
  }

  override onAuth(_client: Client, options: Partial<JoinOptions> | undefined): AuthData {
    const name = sanitizeNickname(options?.name);
    if (!name)
      throw new ServerError(400, 'Nickname must be 3-16 letters, numbers, spaces, _ - or .');
    return { name };
  }

  override onJoin(client: Client, _options?: unknown, auth?: AuthData): void {
    if (!auth) throw new ServerError(401, 'Not authenticated');
    const spawn = randomSpawn();
    const p = new Player();
    p.name = auth.name;
    p.x = spawn.x;
    p.z = spawn.z;
    p.ry = Math.atan2(-spawn.x, -spawn.z);
    p.look = Math.floor(Math.random() * LOOK_COUNT);
    this.state.players.set(client.sessionId, p);
    this.sessions.set(client.sessionId, new PlayerSession(Date.now()));
    this.system(`${auth.name} entered the cave`);
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!consented) {
      player.online = false;
      try {
        // Keep the avatar for a few seconds so a flaky connection can resume.
        await this.allowReconnection(client, RECONNECT_WINDOW_S);
        // Keep the existing session so rate limits / cooldowns survive a reconnect.
        player.online = true;
        return;
      } catch {
        // Window expired: fall through to cleanup.
      }
    }
    this.removePlayer(client.sessionId);
  }

  protected removePlayer(sessionId: string): void {
    const p = this.state.players.get(sessionId);
    if (p) this.system(`${p.name} left`);
    this.state.players.delete(sessionId);
    this.sessions.delete(sessionId);
  }
}
