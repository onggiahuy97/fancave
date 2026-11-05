/**
 * Load test: spawns N headless bot clients that wander randomly, ping, chat and emote.
 *
 *   pnpm loadtest                                  # 50 bots against ws://localhost:2567
 *   pnpm loadtest -- --bots 80 --duration 120 --url wss://cave.example.com/colyseus
 */
import type { Room } from 'colyseus.js';
import { Client } from 'colyseus.js';
import type { InputTuple } from '@fancave/shared';
import { C2S, ROOM_NAME, S2C } from '@fancave/shared';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const URL = arg('url', 'ws://localhost:2567');
const BOTS = Number(arg('bots', '50'));
const DURATION_S = Number(arg('duration', '30'));
const CHAT = arg('chat', 'yes') !== 'no';

const LINES = [
  'what a goal!',
  'come on you reds',
  'anyone watching tonight?',
  'hi all',
  'olé olé',
  'nice cave',
];

interface Stats {
  joined: number;
  failed: number;
  dropped: number;
  inputs: number;
  patches: number;
  chats: number;
  emotes: number;
  pings: number[];
}

const stats: Stats = {
  joined: 0,
  failed: 0,
  dropped: 0,
  inputs: 0,
  patches: 0,
  chats: 0,
  emotes: 0,
  pings: [],
};

class Bot {
  private room: Room | null = null;
  private seq = 0;
  private dir = Math.random() * Math.PI * 2;
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly n: number) {}

  async start(): Promise<void> {
    try {
      this.room = await new Client(URL).joinOrCreate(ROOM_NAME, {
        name: `Bot ${String(this.n).padStart(3, '0')}`,
      });
    } catch (e) {
      stats.failed++;
      console.error(`bot ${this.n} failed to join:`, (e as Error).message);
      return;
    }
    stats.joined++;
    const room = this.room;
    room.onStateChange(() => stats.patches++);
    room.onMessage(S2C.Pong, (m: { t: number }) => stats.pings.push(performance.now() - m.t));
    room.onMessage('*', () => undefined);
    room.onLeave((code) => {
      if (code !== 4000) stats.dropped++;
    });

    // 20 Hz input batches of three ~60 fps frames, like a real client.
    this.timers.push(
      setInterval(() => {
        if (Math.random() < 0.03) this.dir = Math.random() * Math.PI * 2;
        const walking = Math.sin(performance.now() / 1000 + this.n) > -0.3;
        if (!walking) return;
        const frames: InputTuple[] = [];
        for (let k = 0; k < 3; k++)
          frames.push([++this.seq, Math.sin(this.dir), Math.cos(this.dir), 1 / 60]);
        room.send(C2S.Input, { i: frames });
        stats.inputs++;
      }, 50),
    );
    this.timers.push(setInterval(() => room.send(C2S.Ping, { t: performance.now() }), 2000));
    this.timers.push(
      setInterval(
        () => {
          const r = Math.random();
          if (CHAT && r < 0.15) {
            room.send(C2S.Chat, { text: LINES[Math.floor(Math.random() * LINES.length)] });
            stats.chats++;
          } else if (r < 0.3) {
            room.send(C2S.Emote, { type: Math.random() < 0.5 ? 'punch' : 'celebrate' });
            stats.emotes++;
          }
        },
        3000 + Math.random() * 2000,
      ),
    );
  }

  async stop(): Promise<void> {
    this.timers.forEach(clearInterval);
    await this.room?.leave(true).catch(() => undefined);
  }
}

function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

async function main(): Promise<void> {
  console.log(`Spawning ${BOTS} bots → ${URL} for ${DURATION_S}s`);
  const bots = Array.from({ length: BOTS }, (_, i) => new Bot(i + 1));
  // Stagger joins a little, like real traffic.
  for (const b of bots) {
    void b.start();
    await new Promise((r) => setTimeout(r, 40));
  }
  const started = Date.now();
  const report = setInterval(() => {
    const t = ((Date.now() - started) / 1000).toFixed(0);
    console.log(
      `[${t}s] joined=${stats.joined} failed=${stats.failed} dropped=${stats.dropped} ` +
        `inputs=${stats.inputs} patches=${stats.patches} chats=${stats.chats} emotes=${stats.emotes} ` +
        `ping p50=${pct(stats.pings, 50).toFixed(1)}ms p95=${pct(stats.pings, 95).toFixed(1)}ms`,
    );
  }, 5000);
  await new Promise((r) => setTimeout(r, DURATION_S * 1000));
  clearInterval(report);
  await Promise.all(bots.map((b) => b.stop()));
  const ok = stats.failed === 0 && stats.dropped === 0 && stats.joined === BOTS;
  console.log(
    `\nDone: ${stats.joined}/${BOTS} joined, ${stats.dropped} dropped, ` +
      `ping p50 ${pct(stats.pings, 50).toFixed(1)}ms / p95 ${pct(stats.pings, 95).toFixed(1)}ms / max ${Math.max(0, ...stats.pings).toFixed(1)}ms`,
  );
  process.exit(ok ? 0 : 1);
}

void main();
