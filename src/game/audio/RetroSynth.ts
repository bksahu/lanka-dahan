// src/game/audio/RetroSynth.ts — Procedural Web Audio API synthesizer & Master Bus
// Zero external audio file dependencies

import { TitleThemePlayer } from './TitleTheme';

const MUTE_STORAGE_KEY = 'lanka_dahan_muted';

export class RetroSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private titleTheme: TitleThemePlayer | null = null;
  private muted = false;
  private unlocked = false;

  constructor() {
    this.muted = this.readMutePref();

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();

        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-6, this.ctx.currentTime);
        compressor.knee.setValueAtTime(6, this.ctx.currentTime);
        compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        compressor.release.setValueAtTime(0.12, this.ctx.currentTime);
        compressor.connect(this.ctx.destination);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1, this.ctx.currentTime);
        this.masterGain.connect(compressor);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(0.30, this.ctx.currentTime);
        this.sfxGain.connect(this.masterGain);

        this.titleTheme = new TitleThemePlayer(this.ctx, this.masterGain);
        this.bindVisibilityLifecycle();
      }
    } catch {
      // AudioContext not available
    }
  }

  private readMutePref(): boolean {
    try {
      return window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private writeMutePref(muted: boolean): void {
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? 'true' : 'false');
    } catch {
      // Ignore storage errors (private mode / SSR)
    }
  }

  private bindVisibilityLifecycle(): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) {
        this.titleTheme?.onHidden();
        if (this.ctx.state === 'running') {
          this.ctx.suspend().catch(() => { /* ignore */ });
        }
      } else {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume()
            .then(() => {
              this.titleTheme?.onVisible();
            })
            .catch(() => { /* ignore */ });
        } else {
          this.titleTheme?.onVisible();
        }
      }
    });
  }

  isSuspended(): boolean {
    return !this.ctx || this.ctx.state === 'suspended';
  }

  async unlock(): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Ignore resume failure prior to user gesture
      }
    }
    this.unlocked = this.ctx.state === 'running';
  }

  startTitleTheme(): boolean {
    if (!this.titleTheme) return false;
    return this.titleTheme.start();
  }

  stopTitleTheme(): void {
    this.titleTheme?.stop();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.writeMutePref(muted);
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(muted ? 0 : 1, now + 0.02);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'square',
    volume = 0.15,
    freqSlide = 0,
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    if (!this.unlocked && this.ctx.state !== 'running') return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (freqSlide !== 0) {
      osc.frequency.linearRampToValueAtTime(
        freq + freqSlide,
        this.ctx.currentTime + duration,
      );
    }

    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + duration);
  }

  private playNoise(duration: number, volume = 0.1): void {
    if (!this.ctx || !this.sfxGain) return;
    if (!this.unlocked && this.ctx.state !== 'running') return;

    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start(this.ctx.currentTime);
  }

  // ─── Game SFX ─────────────────────────────────

  playJump(): void {
    this.playTone(200, 0.15, 'square', 0.12, 400);
  }

  playWhipStart(): void {
    this.playTone(150, 0.08, 'sawtooth', 0.15, 600);
    this.playNoise(0.06, 0.08);
  }

  playWhipHit(): void {
    this.playTone(300, 0.1, 'square', 0.15, -200);
    this.playNoise(0.08, 0.1);
  }

  playIgnite(): void {
    this.playNoise(0.2, 0.08);
    this.playTone(800, 0.15, 'sawtooth', 0.06, -400);
  }

  playCollapse(): void {
    this.playNoise(0.3, 0.12);
    this.playTone(100, 0.3, 'triangle', 0.1, -50);
  }

  playHurt(): void {
    this.playTone(400, 0.1, 'square', 0.2, -300);
    this.playTone(200, 0.15, 'square', 0.15, -100);
  }

  playSacredStruck(): void {
    this.playTone(1200, 0.3, 'sine', 0.12, -600);
    this.playTone(800, 0.2, 'sine', 0.08, 200);
  }

  playArrowReflect(): void {
    this.playTone(600, 0.08, 'square', 0.1, 400);
    this.playTone(900, 0.1, 'triangle', 0.08, -200);
  }

  playWallSlide(): void {
    this.playNoise(0.05, 0.03);
  }

  playWallJump(): void {
    this.playTone(250, 0.12, 'square', 0.1, 350);
  }

  playVictory(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.3, 'square', 0.12);
      }, i * 150);
    });
  }

  playGameOver(): void {
    const notes = [400, 350, 300, 200];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.4, 'triangle', 0.1);
      }, i * 200);
    });
  }

  playMenuSelect(): void {
    this.playTone(800, 0.08, 'square', 0.08);
  }
}
