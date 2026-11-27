// src/game/audio/TitleTheme.ts — Procedural "Ashoka Vatika" Raga Bhupali Web Audio engine
// Zero external audio files or third-party packages

import { midiToFreq } from './scales';
import { ASHOKA_VATIKA_THEME } from './tracks';
import {
  LOOKAHEAD_POLL_MS,
  LOOKAHEAD_WINDOW_SEC,
  StepSequencer,
} from './sequencer';

interface TanpuraNodes {
  oscs: OscillatorNode[];
  lfo1: OscillatorNode;
  lfo2: OscillatorNode;
  levelGain: GainNode;
  filter: BiquadFilterNode;
}

export class TitleThemePlayer {
  private readonly ctx: AudioContext;
  private readonly musicGain: GainNode;
  private readonly droneGain: GainNode;
  private readonly noiseBuffer: AudioBuffer;
  private readonly sequencer = new StepSequencer(ASHOKA_VATIKA_THEME);

  private pollTimerId: number | null = null;
  private stopCleanupId: number | null = null;
  private tanpura: TanpuraNodes | null = null;
  private playing = false;

  constructor(ctx: AudioContext, masterGain: GainNode) {
    this.ctx = ctx;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.45;
    this.musicGain.connect(masterGain);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.20;
    this.droneGain.connect(masterGain);

    // Pre-allocate a single white noise buffer for Bansuri breath
    const bufferLen = Math.floor(ctx.sampleRate * 1.0);
    this.noiseBuffer = ctx.createBuffer(1, bufferLen, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferLen; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Starts the Ashoka Vatika theme if AudioContext is running.
   * Returns true if started immediately, false if AudioContext is still suspended.
   */
  start(): boolean {
    if (this.ctx.state !== 'running') {
      return false;
    }

    if (this.stopCleanupId !== null) {
      window.clearTimeout(this.stopCleanupId);
      this.stopCleanupId = null;
    }

    if (this.playing) {
      return true;
    }

    this.playing = true;
    const now = this.ctx.currentTime;

    // Restore music & drone bus targets cleanly
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0.45, now);

    this.droneGain.gain.cancelScheduledValues(now);
    this.droneGain.gain.setValueAtTime(0.20, now);

    this.startTanpura(now);
    this.sequencer.reset(now + 0.05);
    this.startPolling();

    return true;
  }

  /** Smoothly fades out (0.4s) the title music and tanpura drone */
  stop(): void {
    if (!this.playing && !this.tanpura) return;
    this.playing = false;
    this.stopPolling();

    const now = this.ctx.currentTime;
    const fadeOut = ASHOKA_VATIKA_THEME.tanpura.fadeOutSec; // 0.4s

    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(0, now + fadeOut);

    if (this.tanpura) {
      const nodes = this.tanpura;
      nodes.levelGain.gain.cancelScheduledValues(now);
      nodes.levelGain.gain.setValueAtTime(nodes.levelGain.gain.value, now);
      nodes.levelGain.gain.linearRampToValueAtTime(0, now + fadeOut);

      this.stopCleanupId = window.setTimeout(() => {
        this.disposeTanpura(nodes);
        if (this.tanpura === nodes) {
          this.tanpura = null;
        }
        this.stopCleanupId = null;
      }, Math.ceil((fadeOut + 0.05) * 1000));
    }
  }

  /** Pause lookahead timer when page goes hidden */
  onHidden(): void {
    if (!this.playing) return;
    this.stopPolling();
  }

  /** Reset nextStepTime on page unhide/resume to avoid catch-up note bursts */
  onVisible(): void {
    if (!this.playing) return;
    this.sequencer.resyncTime(this.ctx.currentTime + 0.05);
    this.startPolling();
  }

  private startPolling(): void {
    this.stopPolling();
    this.tickScheduler();
    this.pollTimerId = window.setInterval(() => {
      this.tickScheduler();
    }, LOOKAHEAD_POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimerId !== null) {
      window.clearInterval(this.pollTimerId);
      this.pollTimerId = null;
    }
  }

  private tickScheduler(): void {
    if (!this.playing || this.ctx.state !== 'running') return;

    const events = this.sequencer.advanceLookahead(
      this.ctx.currentTime,
      LOOKAHEAD_WINDOW_SEC,
    );

    for (const ev of events) {
      for (const note of ev.melody) {
        this.triggerBansuri(
          ev.time,
          note.midiNote,
          note.durationSteps * ev.stepDurationSec,
          note.velocity,
        );
      }
      for (const hit of ev.percussion) {
        if (hit.kind === 'DHIN') {
          this.triggerDhin(ev.time, hit.velocity);
        }
      }
    }
  }

  private startTanpura(now: number): void {
    if (this.tanpura) {
      this.disposeTanpura(this.tanpura);
      this.tanpura = null;
    }

    const spec = ASHOKA_VATIKA_THEME.tanpura;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(spec.filterHz, now);
    filter.Q.setValueAtTime(spec.filterQ, now);

    const levelGain = this.ctx.createGain();
    levelGain.gain.setValueAtTime(0, now);
    levelGain.gain.linearRampToValueAtTime(spec.level, now + spec.fadeInSec);

    filter.connect(levelGain);
    levelGain.connect(this.droneGain);

    const oscs: OscillatorNode[] = [];
    for (const voice of spec.midiNotes) {
      const osc = this.ctx.createOscillator();
      osc.type = voice.type;
      osc.frequency.setValueAtTime(midiToFreq(voice.midiNote), now);
      if (voice.detuneCents !== 0) {
        osc.detune.setValueAtTime(voice.detuneCents, now);
      }
      osc.connect(filter);
      osc.start(now);
      oscs.push(osc);
    }

    // Two slow staggered LFOs (0.28 Hz & 0.41 Hz) for gentle jawari shimmer
    const lfo1 = this.ctx.createOscillator();
    lfo1.type = 'sine';
    lfo1.frequency.setValueAtTime(spec.lfoRatesHz[0], now);
    const lfo1Gain = this.ctx.createGain();
    lfo1Gain.gain.setValueAtTime(140, now);
    lfo1.connect(lfo1Gain);
    lfo1Gain.connect(filter.frequency);
    lfo1.start(now);

    const lfo2 = this.ctx.createOscillator();
    lfo2.type = 'sine';
    lfo2.frequency.setValueAtTime(spec.lfoRatesHz[1], now);
    const lfo2Gain = this.ctx.createGain();
    lfo2Gain.gain.setValueAtTime(0.025, now);
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(levelGain.gain);
    lfo2.start(now);

    this.tanpura = { oscs, lfo1, lfo2, levelGain, filter };
  }

  private disposeTanpura(nodes: TanpuraNodes): void {
    for (const osc of nodes.oscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Already stopped
      }
    }
    try {
      nodes.lfo1.stop();
      nodes.lfo1.disconnect();
      nodes.lfo2.stop();
      nodes.lfo2.disconnect();
      nodes.filter.disconnect();
      nodes.levelGain.disconnect();
    } catch {
      // Ignore cleanup errors
    }
  }

  private triggerBansuri(
    time: number,
    midiNote: number,
    durationSec: number,
    velocity: number,
  ): void {
    const freq = midiToFreq(midiNote);
    const attack = 0.04;
    const decay = 0.10;
    const sustain = 0.75;
    const release = 0.14;

    const noteOff = Math.max(time + attack + decay, time + durationSec);
    const endTime = noteOff + release + 0.02;

    // 1. Triangle lead + (+12 st) sine harmonic (15% mix)
    const triOsc = this.ctx.createOscillator();
    triOsc.type = 'triangle';
    triOsc.frequency.setValueAtTime(freq, time);

    const harmOsc = this.ctx.createOscillator();
    harmOsc.type = 'sine';
    harmOsc.frequency.setValueAtTime(freq * 2, time);
    const harmGain = this.ctx.createGain();
    harmGain.gain.setValueAtTime(0.15, time);

    // 2. Faint bandpass-filtered white noise breath (1800 Hz, 3% mix) from pre-allocated buffer
    const breathSrc = this.ctx.createBufferSource();
    breathSrc.buffer = this.noiseBuffer;
    breathSrc.loop = true;

    const breathFilter = this.ctx.createBiquadFilter();
    breathFilter.type = 'bandpass';
    breathFilter.frequency.setValueAtTime(1800, time);
    breathFilter.Q.setValueAtTime(1.5, time);

    const breathGain = this.ctx.createGain();
    breathGain.gain.setValueAtTime(0.03, time);

    // 3. 4.8 Hz vibrato (±6 cents, delayed 80 ms)
    const vibOsc = this.ctx.createOscillator();
    vibOsc.type = 'sine';
    vibOsc.frequency.setValueAtTime(4.8, time);
    const vibGain = this.ctx.createGain();
    vibGain.gain.setValueAtTime(0, time);
    vibGain.gain.setValueAtTime(0, time + 0.08);
    vibGain.gain.linearRampToValueAtTime(6, time + 0.12);

    vibOsc.connect(vibGain);
    vibGain.connect(triOsc.detune);
    vibGain.connect(harmOsc.detune);

    // 4. 2200 Hz lowpass + ADSR envelope
    const lpFilter = this.ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.setValueAtTime(2200, time);

    const envGain = this.ctx.createGain();
    envGain.gain.setValueAtTime(0, time);
    envGain.gain.linearRampToValueAtTime(velocity, time + attack);
    envGain.gain.linearRampToValueAtTime(velocity * sustain, time + attack + decay);
    envGain.gain.setValueAtTime(velocity * sustain, noteOff);
    envGain.gain.linearRampToValueAtTime(0.0001, noteOff + release);

    triOsc.connect(lpFilter);
    harmOsc.connect(harmGain);
    harmGain.connect(lpFilter);
    breathSrc.connect(breathFilter);
    breathFilter.connect(breathGain);
    breathGain.connect(lpFilter);

    lpFilter.connect(envGain);
    envGain.connect(this.musicGain);

    triOsc.start(time);
    harmOsc.start(time);
    breathSrc.start(time);
    vibOsc.start(time);

    triOsc.stop(endTime);
    harmOsc.stop(endTime);
    breathSrc.stop(endTime);
    vibOsc.stop(endTime);
  }

  private triggerDhin(time: number, velocity: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, time);
    osc.frequency.exponentialRampToValueAtTime(68, time + 0.10);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(320, time);

    const env = this.ctx.createGain();
    const attack = 0.004;
    const decay = 0.15;
    const release = 0.03;

    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(velocity, time + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay + release);

    osc.connect(lp);
    lp.connect(env);
    env.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + attack + decay + release + 0.02);
  }
}
