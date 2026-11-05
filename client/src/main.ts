import './styles.css';
import { CAVE_TITLE, LOOK_COUNT } from '@fancave/shared';
import { Sound } from './audio/Sound';
import { Game } from './game/Game';
import { DevOverlay } from './ui/DevOverlay';
import { HowTo } from './ui/HowTo';
import { Hud } from './ui/Hud';
import { Landing } from './ui/Landing';
import { NetSession } from './net/NetSession';

document.title = CAVE_TITLE;

function byId<T extends HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error(`#${id} missing`);
  return n as T;
}

class App {
  private readonly sound = new Sound();
  private readonly dev = new DevOverlay();
  private readonly howTo = new HowTo();
  private readonly landing: Landing;
  private readonly hud: Hud;
  private readonly game: Game;
  private net: NetSession | null = null;
  private readonly offline = new URLSearchParams(location.search).has('offline');

  constructor() {
    const ui = byId<HTMLDivElement>('ui');
    this.game = new Game(byId('scene'), byId('labels'), this.sound, this.dev, {
      onEmoteRejected: (_t, ms) => this.hud.toast(`Cooldown — ${(ms / 1000).toFixed(1)}s`, 900),
      onEmoteUsed: (t) => this.hud.cooldown(t, 2000),
      onOpenChat: () => this.hud.toast('Chat arrives in a later milestone', 1200),
      onToggleDev: () => this.dev.toggle(),
    });
    this.hud = new Hud(
      {
        onLeave: () => this.leave(),
        onToggleMute: () => {
          this.sound.setMuted(!this.sound.muted);
          return this.sound.muted;
        },
        onHowTo: () => this.howTo.show(),
        onToggleDev: () => this.dev.toggle(),
        onEmote: (t) => this.game.emote(t),
        onChat: () => this.hud.toast('Chat arrives in a later milestone', 1200),
      },
      this.game.input.stick,
      this.sound.muted,
    );
    this.landing = new Landing(() => this.howTo.show());
    ui.append(this.hud.root, this.dev.root, this.landing.root, this.howTo.root);
    void this.askName();
  }

  private async askName(message = ''): Promise<void> {
    for (;;) {
      const name = await this.landing.ask(message);
      this.sound.unlock();
      this.landing.setBusy(true);
      try {
        await this.enter(name);
        return;
      } catch (err) {
        console.warn('[app] join failed', err);
        message = joinErrorMessage(err);
      }
    }
  }

  private async enter(name: string): Promise<void> {
    if (this.offline) {
      this.game.spawnLocal('local', name, Math.floor(Math.random() * LOOK_COUNT));
    } else {
      this.net = await NetSession.connect(name, this.game, {
        onCount: (n) => this.hud.setCount(n),
        onStatus: (text) => this.hud.setStatus(text),
        onDisconnected: (reason) => this.backToLanding(reason),
        onChat: () => undefined,
        onHistory: () => undefined,
        onNotice: (n) => this.hud.toast(n.text),
        onPing: (ms) =>
          (this.dev.ping = this.dev.ping === null ? ms : this.dev.ping * 0.7 + ms * 0.3),
      });
    }
    this.landing.hide();
    this.hud.show();
    this.hud.setCount(Math.max(1, this.game.avatars.size));
  }

  private leave(): void {
    void this.net?.leave();
    this.backToLanding('');
  }

  private backToLanding(message: string): void {
    this.net = null;
    this.dev.ping = null;
    this.game.reset();
    this.hud.setStatus('');
    this.hud.hide();
    void this.askName(message);
  }
}

function joinErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/nickname/i.test(msg)) return msg;
  if (/full|locked/i.test(msg)) return 'The cave is packed — try again in a moment.';
  return "Couldn't reach the cave. Check your connection and try again.";
}

new App();
