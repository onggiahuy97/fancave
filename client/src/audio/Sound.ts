const MUTE_KEY = 'fancave.muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Procedural Web Audio: fire crackle ambience plus tiny emote / chat sounds. No assets. */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private crackleTimer = 0;
  muted = readMuted();

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  private startAmbience(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    // Low rumble of the fire.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0.07;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    // Random crackles.
    const tick = (): void => {
      this.crackle();
      this.crackleTimer = window.setTimeout(tick, 80 + Math.random() * 420);
    };
    tick();
  }

  private crackle(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || this.muted) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1500 + Math.random() * 3000;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.05 + Math.random() * 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.04);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.9, 0.1);
  }

  private tone(
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(this.master);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  /** Volume falls off with distance from the listener (0..1 gain multiplier). */
  punch(gain = 1): void {
    if (!this.ctx || gain <= 0.01) return;
    const t = this.ctx.currentTime;
    this.tone(160, t, 0.18, 'sine', 0.5 * gain, 45);
    this.tone(900, t, 0.04, 'square', 0.05 * gain, 200);
  }

  celebrate(gain = 1): void {
    if (!this.ctx || gain <= 0.01) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone(f, t + i * 0.07, 0.25, 'triangle', 0.14 * gain),
    );
  }

  chat(): void {
    if (!this.ctx) return;
    this.tone(880, this.ctx.currentTime, 0.08, 'sine', 0.08, 1320);
  }

  dispose(): void {
    clearTimeout(this.crackleTimer);
    void this.ctx?.close();
    this.ctx = null;
  }
}
