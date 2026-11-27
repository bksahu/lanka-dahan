// src/game/audio/RetroSynth.ts — Procedural Web Audio API retro chiptune synthesizer
// Zero external audio file dependencies

export class RetroSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private unlocked = false;

  constructor() {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3;
        this.masterGain.connect(this.ctx.destination);
      }
    } catch {
      // AudioContext not available
    }
  }

  unlock(): void {
    if (this.unlocked || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => { /* ignore */ });
    }
    this.unlocked = true;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'square',
    volume = 0.15,
    freqSlide = 0,
  ): void {
    if (!this.ctx || !this.masterGain) return;

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
    gain.connect(this.masterGain);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + duration);
  }

  private playNoise(duration: number, volume = 0.1): void {
    if (!this.ctx || !this.masterGain) return;

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
    gain.connect(this.masterGain);
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
