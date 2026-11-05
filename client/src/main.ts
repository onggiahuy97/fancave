import './styles.css';
import { CAVE_TITLE, LOOK_COUNT } from '@fancave/shared';
import { Sound } from './audio/Sound';
import { Game } from './game/Game';
import { DevOverlay } from './ui/DevOverlay';
import { HowTo } from './ui/HowTo';
import { Hud } from './ui/Hud';
import { Landing } from './ui/Landing';

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
    const name = await this.landing.ask(message);
    this.sound.unlock();
    this.enter(name);
  }

  private enter(name: string): void {
    this.game.spawnLocal('local', name, Math.floor(Math.random() * LOOK_COUNT));
    this.landing.hide();
    this.hud.show();
    this.hud.setCount(this.game.avatars.size);
  }

  private leave(): void {
    this.game.reset();
    this.hud.hide();
    void this.askName();
  }
}

new App();
