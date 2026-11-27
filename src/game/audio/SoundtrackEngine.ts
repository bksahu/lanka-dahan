// src/game/audio/SoundtrackEngine.ts — Multi-track procedural Raga Web Audio engine
// Handles ASHOKA_VATIKA (Title), AGNI_TANDAV (Gameplay), AYODHYA_DEEPAVALI (Victory)
// plus Dynamic Ambient Fire Bed with session isolation & zero ghost notes.

import { midiToFreq } from './scales';
import {
  ASHOKA_VATIKA_THEME,
  AGNI_TANDAV_THEME,
  AYODHYA_DEEPAVALI_THEME,
  type PercussionKind,
  type TrackDef,
} from './tracks';
import {
  LOOKAHEAD_POLL_MS,
  LOOKAHEAD_WINDOW_SEC,
  StepSequencer,
} from './sequencer';

export interface MasterSubBuses {
  lead: GainNode;
  harmony: GainNode;
  perc: GainNode;
  drone: GainNode;
  ambientFire: GainNode;
}

interface TrackSession {
  track: TrackDef;
  sequencer: StepSequencer;
  leadBus: GainNode;
  harmonyBus: GainNode;
  percBus: GainNode;
  droneBus: GainNode;
  sources: Set<AudioScheduledSourceNode>;
  pollTimerId: number | null;
  prevLeadFreq: number;
  disposed: boolean;
}

export type TrackId = TrackDef['id'];

const TRACK_MAP: Record<TrackId, TrackDef> = {
  ashoka_vatika: ASHOKA_VATIKA_THEME,
  agni_tandav: AGNI_TANDAV_THEME,
  ayodhya_deepavali: AYODHYA_DEEPAVALI_THEME,
};

export class SoundtrackEngine {
  private readonly ctx: AudioContext;
  private readonly buses: MasterSubBuses;
  private readonly noiseBuffer: AudioBuffer;

  private activeSession: TrackSession | null = null;
  private fireSource: AudioBufferSourceNode | null = null;
  private fireIntensity = 0;
  private fireCrackleTimerId: number | null = null;

  constructor(ctx: AudioContext, buses: MasterSubBuses, noiseBuffer: AudioBuffer) {
    this.ctx = ctx;
    this.buses = buses;
    this.noiseBuffer = noiseBuffer;
  }

  getActiveTrackId(): TrackId | null {
    return this.activeSession ? this.activeSession.track.id : null;
  }

  /**
   * Play a track cleanly. Immediately tears down any previous session via 16ms ramp + 30ms stop/disconnect.
   * Returns false if AudioContext is not running yet.
   */
  play(trackId: TrackId, prevFadeSec = 0.016): boolean {
    if (this.ctx.state !== 'running') {
      return false;
    }

    if (this.activeSession?.track.id === trackId && !this.activeSession.disposed) {
      return true;
    }

    if (this.activeSession) {
      this.teardownSession(this.activeSession, prevFadeSec);
      this.activeSession = null;
    }

    const track = TRACK_MAP[trackId];
    const now = this.ctx.currentTime;

    const leadBus = this.ctx.createGain();
    leadBus.gain.setValueAtTime(1, now);
    leadBus.connect(this.buses.lead);

    const harmonyBus = this.ctx.createGain();
    harmonyBus.gain.setValueAtTime(1, now);
    harmonyBus.connect(this.buses.harmony);

    const percBus = this.ctx.createGain();
    percBus.gain.setValueAtTime(1, now);
    percBus.connect(this.buses.perc);

    const droneBus = this.ctx.createGain();
    droneBus.gain.setValueAtTime(0, now);
    droneBus.gain.linearRampToValueAtTime(1, now + track.tanpura.fadeInSec);
    droneBus.connect(this.buses.drone);

    const session: TrackSession = {
      track,
      sequencer: new StepSequencer(track),
      leadBus,
      harmonyBus,
      percBus,
      droneBus,
      sources: new Set(),
      pollTimerId: null,
      prevLeadFreq: 0,
      disposed: false,
    };

    this.activeSession = session;
    this.startTanpura(session, now);
    session.sequencer.reset(now + 0.05);
    this.startPolling(session);

    return true;
  }

  /** Stop active track cleanly with configurable fade (default 16ms zero-click ramp, 30ms source stop) */
  stop(fadeSec = 0.016): void {
    if (!this.activeSession) return;
    this.teardownSession(this.activeSession, fadeSec);
    this.activeSession = null;
  }

  onHidden(): void {
    if (!this.activeSession) return;
    this.stopPolling(this.activeSession);
    this.stopFireCrackles();
  }

  onVisible(): void {
    if (this.activeSession && !this.activeSession.disposed) {
      this.activeSession.sequencer.resyncTime(this.ctx.currentTime + 0.05);
      this.startPolling(this.activeSession);
    }
    if (this.fireIntensity > 0.05) {
      this.startFireCrackles();
    }
  }

  /** Continuous 500 Hz bandpass fire roar + random highpass ember crackles scaled by 0..1 -> gain 0..0.16 */
  setFireIntensity(intensity: number): void {
    const clamped = Math.max(0, Math.min(1, intensity));
    this.fireIntensity = clamped;
    if (this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    const targetGain = clamped * 0.16;

    if (clamped > 0.01 && !this.fireSource) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(500, now);
      bp.Q.setValueAtTime(1.4, now);

      src.connect(bp);
      bp.connect(this.buses.ambientFire);
      src.start(now);
      this.fireSource = src;
    }

    this.buses.ambientFire.gain.cancelScheduledValues(now);
    this.buses.ambientFire.gain.setValueAtTime(this.buses.ambientFire.gain.value, now);
    this.buses.ambientFire.gain.linearRampToValueAtTime(targetGain, now + 0.12);

    if (clamped > 0.05) {
      this.startFireCrackles();
    } else {
      this.stopFireCrackles();
      if (clamped === 0 && this.fireSource) {
        const old = this.fireSource;
        this.fireSource = null;
        window.setTimeout(() => {
          try {
            old.stop();
            old.disconnect();
          } catch {
            // Ignore
          }
        }, 150);
      }
    }
  }

  playShankhAccent(): void {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(246.94, now);
    osc.frequency.exponentialRampToValueAtTime(261.63, now + 0.12);
    osc.frequency.setValueAtTime(261.63, now + 0.28);

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, now);
    bp.Q.setValueAtTime(2.5, now);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.32, now + 0.08);
    env.gain.linearRampToValueAtTime(0.24, now + 0.26);
    env.gain.linearRampToValueAtTime(0.0001, now + 0.44);

    osc.connect(bp);
    bp.connect(env);
    env.connect(this.buses.harmony);

    osc.start(now);
    osc.stop(now + 0.46);
  }

  private startFireCrackles(): void {
    if (this.fireCrackleTimerId !== null) return;
    this.fireCrackleTimerId = window.setInterval(() => {
      if (this.ctx.state !== 'running' || this.fireIntensity <= 0.05) return;
      if (Math.random() > this.fireIntensity * 0.7) return;

      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const offset = Math.random() * 1.5;

      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(2800 + Math.random() * 1800, now);

      const env = this.ctx.createGain();
      const peak = 0.04 + Math.random() * 0.06 * this.fireIntensity;
      env.gain.setValueAtTime(peak, now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

      src.connect(hp);
      hp.connect(env);
      env.connect(this.buses.ambientFire);
      src.start(now, offset, 0.04);
    }, 110);
  }

  private stopFireCrackles(): void {
    if (this.fireCrackleTimerId !== null) {
      window.clearInterval(this.fireCrackleTimerId);
      this.fireCrackleTimerId = null;
    }
  }

  private teardownSession(session: TrackSession, fadeSec: number): void {
    session.disposed = true;
    this.stopPolling(session);

    const now = this.ctx.currentTime;
    const rampSec = Math.max(0.016, fadeSec);
    const cleanupMs = Math.ceil(Math.max(0.03, rampSec + 0.015) * 1000);

    for (const bus of [session.leadBus, session.harmonyBus, session.percBus, session.droneBus]) {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
      bus.gain.exponentialRampToValueAtTime(0.0001, now + rampSec);
    }

    window.setTimeout(() => {
      for (const src of session.sources) {
        try {
          src.stop();
        } catch {
          // Already stopped
        }
        try {
          src.disconnect();
        } catch {
          // Ignore
        }
      }
      session.sources.clear();

      for (const bus of [session.leadBus, session.harmonyBus, session.percBus, session.droneBus]) {
        try {
          bus.disconnect();
        } catch {
          // Ignore
        }
      }
    }, cleanupMs);
  }

  private trackSource(session: TrackSession, src: AudioScheduledSourceNode): void {
    session.sources.add(src);
    src.onended = () => {
      session.sources.delete(src);
      try {
        src.disconnect();
      } catch {
        // Ignore
      }
    };
  }

  private startPolling(session: TrackSession): void {
    this.stopPolling(session);
    this.tickSession(session);
    session.pollTimerId = window.setInterval(() => {
      this.tickSession(session);
    }, LOOKAHEAD_POLL_MS);
  }

  private stopPolling(session: TrackSession): void {
    if (session.pollTimerId !== null) {
      window.clearInterval(session.pollTimerId);
      session.pollTimerId = null;
    }
  }

  private tickSession(session: TrackSession): void {
    if (session.disposed || this.ctx.state !== 'running') return;

    const events = session.sequencer.advanceLookahead(
      this.ctx.currentTime,
      LOOKAHEAD_WINDOW_SEC,
    );

    for (const ev of events) {
      for (const note of ev.melody) {
        const durSec = note.durationSteps * ev.stepDurationSec;
        if (session.track.leadVoice === 'bansuri') {
          this.triggerBansuri(session, ev.time, note.midiNote, durSec, note.velocity);
        } else {
          this.triggerShehnai(session, ev.time, note.midiNote, durSec, note.velocity, Boolean(note.glide));
        }
      }

      for (const bass of ev.bass) {
        const durSec = (bass.durationSteps ?? 2) * ev.stepDurationSec;
        this.triggerSitarBass(session, ev.time, bass.midiNote, durSec, bass.velocity ?? 0.85);
      }

      for (const chord of ev.chords) {
        this.triggerHarmoniumChord(
          session,
          ev.time,
          chord.midiNotes,
          chord.durationSteps * ev.stepDurationSec,
          chord.velocity ?? 0.65,
        );
      }

      for (const san of ev.santoor) {
        this.triggerSantoor(session, ev.time, san.midiNote, san.velocity ?? 0.78);
      }

      for (const gh of ev.ghanta) {
        this.triggerGhanta(session, ev.time, gh.freqHz, gh.velocity ?? 0.72);
      }

      for (const hit of ev.percussion) {
        this.triggerPercussion(session, ev.time, hit.kind, hit.velocity);
      }
    }
  }

  // ─── Voices ───────────────────────────────────────────────────────────────

  private startTanpura(session: TrackSession, now: number): void {
    const spec = session.track.tanpura;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(spec.filterHz, now);
    filter.Q.setValueAtTime(spec.filterQ, now);

    const levelGain = this.ctx.createGain();
    levelGain.gain.setValueAtTime(spec.level, now);

    filter.connect(levelGain);
    levelGain.connect(session.droneBus);

    for (const voice of spec.midiNotes) {
      const osc = this.ctx.createOscillator();
      osc.type = voice.type;
      osc.frequency.setValueAtTime(midiToFreq(voice.midiNote), now);
      if (voice.detuneCents !== 0) {
        osc.detune.setValueAtTime(voice.detuneCents, now);
      }
      osc.connect(filter);
      osc.start(now);
      this.trackSource(session, osc);
    }

    // Staggered jawari LFOs (0.28 Hz & 0.41 Hz)
    const lfo1 = this.ctx.createOscillator();
    lfo1.type = 'sine';
    lfo1.frequency.setValueAtTime(spec.lfoRatesHz[0], now);
    const lfo1Gain = this.ctx.createGain();
    lfo1Gain.gain.setValueAtTime(140, now);
    lfo1.connect(lfo1Gain);
    lfo1Gain.connect(filter.frequency);
    lfo1.start(now);
    this.trackSource(session, lfo1);

    const lfo2 = this.ctx.createOscillator();
    lfo2.type = 'sine';
    lfo2.frequency.setValueAtTime(spec.lfoRatesHz[1], now);
    const lfo2Gain = this.ctx.createGain();
    lfo2Gain.gain.setValueAtTime(0.03, now);
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(levelGain.gain);
    lfo2.start(now);
    this.trackSource(session, lfo2);

    if (spec.pulseBpmRate) {
      const pulseLfo = this.ctx.createOscillator();
      pulseLfo.type = 'sine';
      pulseLfo.frequency.setValueAtTime(session.track.bpm / 60, now);
      const pulseGain = this.ctx.createGain();
      pulseGain.gain.setValueAtTime(0.08, now);
      pulseLfo.connect(pulseGain);
      pulseGain.connect(levelGain.gain);
      pulseLfo.start(now);
      this.trackSource(session, pulseLfo);
    }
  }

  private triggerBansuri(
    session: TrackSession,
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

    const triOsc = this.ctx.createOscillator();
    triOsc.type = 'triangle';
    triOsc.frequency.setValueAtTime(freq, time);

    const harmOsc = this.ctx.createOscillator();
    harmOsc.type = 'sine';
    harmOsc.frequency.setValueAtTime(freq * 2, time);
    const harmGain = this.ctx.createGain();
    harmGain.gain.setValueAtTime(0.15, time);

    const breathSrc = this.ctx.createBufferSource();
    breathSrc.buffer = this.noiseBuffer;
    breathSrc.loop = true;

    const breathFilter = this.ctx.createBiquadFilter();
    breathFilter.type = 'bandpass';
    breathFilter.frequency.setValueAtTime(1800, time);
    breathFilter.Q.setValueAtTime(1.5, time);

    const breathGain = this.ctx.createGain();
    breathGain.gain.setValueAtTime(0.03, time);

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
    envGain.connect(session.leadBus);

    for (const src of [triOsc, harmOsc, breathSrc, vibOsc]) {
      src.start(time);
      src.stop(endTime);
      this.trackSource(session, src);
    }
    session.prevLeadFreq = freq;
  }

  private triggerShehnai(
    session: TrackSession,
    time: number,
    midiNote: number,
    durationSec: number,
    velocity: number,
    glide: boolean,
  ): void {
    const freq = midiToFreq(midiNote);
    const attack = 0.015;
    const decay = 0.08;
    const sustain = 0.68;
    const release = 0.06;

    const noteOff = Math.max(time + attack + decay, time + durationSec);
    const endTime = noteOff + release + 0.02;

    const saw = this.ctx.createOscillator();
    saw.type = 'sawtooth';

    const sq = this.ctx.createOscillator();
    sq.type = 'square';
    sq.detune.setValueAtTime(3, time);

    const sqGain = this.ctx.createGain();
    sqGain.gain.setValueAtTime(0.5, time); // -6 dB

    if (glide && session.prevLeadFreq > 0) {
      saw.frequency.setValueAtTime(session.prevLeadFreq, time);
      saw.frequency.exponentialRampToValueAtTime(freq, time + 0.03);
      sq.frequency.setValueAtTime(session.prevLeadFreq, time);
      sq.frequency.exponentialRampToValueAtTime(freq, time + 0.03);
    } else {
      saw.frequency.setValueAtTime(freq, time);
      sq.frequency.setValueAtTime(freq, time);
    }
    session.prevLeadFreq = freq;

    const vibOsc = this.ctx.createOscillator();
    vibOsc.type = 'sine';
    vibOsc.frequency.setValueAtTime(5.6, time);
    const vibGain = this.ctx.createGain();
    vibGain.gain.setValueAtTime(8.5, time);
    vibOsc.connect(vibGain);
    vibGain.connect(saw.detune);
    vibGain.connect(sq.detune);

    // Dual nasal bandpass + lowpass
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1250, time);
    bp.Q.setValueAtTime(2.2, time);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1650, time);
    lp.Q.setValueAtTime(1.6, time);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(velocity, time + attack);
    env.gain.linearRampToValueAtTime(velocity * sustain, time + attack + decay);
    env.gain.setValueAtTime(velocity * sustain, noteOff);
    env.gain.linearRampToValueAtTime(0.0001, noteOff + release);

    saw.connect(bp);
    sq.connect(sqGain);
    sqGain.connect(bp);
    bp.connect(lp);
    lp.connect(env);
    env.connect(session.leadBus);

    for (const src of [saw, sq, vibOsc]) {
      src.start(time);
      src.stop(endTime);
      this.trackSource(session, src);
    }
  }

  private triggerSitarBass(
    session: TrackSession,
    time: number,
    midiNote: number,
    durationSec: number,
    velocity: number,
  ): void {
    const freq = midiToFreq(midiNote);
    const endTime = time + Math.max(0.24, durationSec) + 0.08;

    const saw = this.ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(freq, time);

    const tri = this.ctx.createOscillator();
    tri.type = 'triangle';
    tri.frequency.setValueAtTime(freq, time);
    tri.detune.setValueAtTime(5, time);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.setValueAtTime(4.5, time);
    lp.frequency.setValueAtTime(2800, time);
    lp.frequency.exponentialRampToValueAtTime(600, time + 0.20);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(velocity * 0.75, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, endTime - 0.02);

    saw.connect(lp);
    tri.connect(lp);
    lp.connect(env);
    env.connect(session.harmonyBus);

    for (const src of [saw, tri]) {
      src.start(time);
      src.stop(endTime);
      this.trackSource(session, src);
    }
  }

  private triggerHarmoniumChord(
    session: TrackSession,
    time: number,
    midiNotes: readonly number[],
    durationSec: number,
    velocity: number,
  ): void {
    const attack = 0.11;
    const release = 0.20;
    const noteOff = Math.max(time + attack + 0.04, time + durationSec);
    const endTime = noteOff + release + 0.02;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, time);
    lp.Q.setValueAtTime(0.85, time);

    const env = this.ctx.createGain();
    const amp = (velocity * 0.5) / Math.max(1, midiNotes.length);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(amp, time + attack);
    env.gain.setValueAtTime(amp, noteOff);
    env.gain.linearRampToValueAtTime(0.0001, noteOff + release);

    lp.connect(env);
    env.connect(session.harmonyBus);

    for (const midi of midiNotes) {
      const freq = midiToFreq(midi);
      const sq = this.ctx.createOscillator();
      sq.type = 'square';
      sq.frequency.setValueAtTime(freq, time);
      sq.detune.setValueAtTime(-3.5, time);

      const tri = this.ctx.createOscillator();
      tri.type = 'triangle';
      tri.frequency.setValueAtTime(freq, time);
      tri.detune.setValueAtTime(3.5, time);

      sq.connect(lp);
      tri.connect(lp);

      for (const src of [sq, tri]) {
        src.start(time);
        src.stop(endTime);
        this.trackSource(session, src);
      }
    }
  }

  private triggerSantoor(
    session: TrackSession,
    time: number,
    midiNote: number,
    velocity: number,
  ): void {
    const freq = midiToFreq(midiNote);
    const tri = this.ctx.createOscillator();
    tri.type = 'triangle';
    tri.frequency.setValueAtTime(freq, time);

    const harm = this.ctx.createOscillator();
    harm.type = 'sine';
    harm.frequency.setValueAtTime(freq * 2, time);
    const harmGain = this.ctx.createGain();
    harmGain.gain.setValueAtTime(0.35, time);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(velocity * 0.55, time + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);

    tri.connect(env);
    harm.connect(harmGain);
    harmGain.connect(env);
    env.connect(session.harmonyBus);

    for (const src of [tri, harm]) {
      src.start(time);
      src.stop(time + 0.36);
      this.trackSource(session, src);
    }
  }

  private triggerGhanta(
    session: TrackSession,
    time: number,
    baseFreq: number,
    velocity: number,
  ): void {
    const partials: readonly [number, number][] = [
      [1.0, 0.40],
      [2.0, 0.25],
      [2.76, 0.18],
      [4.10, 0.10],
    ];
    const decay = 1.15;

    for (const [ratio, weight] of partials) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * ratio, time);

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(velocity * weight, time + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, time + decay);

      osc.connect(env);
      env.connect(session.harmonyBus);

      osc.start(time);
      osc.stop(time + decay + 0.02);
      this.trackSource(session, osc);
    }
  }

  private triggerPercussion(
    session: TrackSession,
    time: number,
    kind: PercussionKind,
    velocity: number,
  ): void {
    switch (kind) {
      case 'DHIN': {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(135, time);
        osc.frequency.exponentialRampToValueAtTime(68, time + 0.10);

        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(320, time);

        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(velocity, time + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0001, time + 0.184);

        osc.connect(lp);
        lp.connect(env);
        env.connect(session.percBus);
        osc.start(time);
        osc.stop(time + 0.20);
        this.trackSource(session, osc);
        break;
      }
      case 'TA': {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340, time);
        osc.frequency.exponentialRampToValueAtTime(195, time + 0.055);

        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(velocity * 0.65, time + 0.003);
        env.gain.exponentialRampToValueAtTime(0.0001, time + 0.075);

        osc.connect(env);
        env.connect(session.percBus);
        osc.start(time);
        osc.stop(time + 0.09);
        this.trackSource(session, osc);

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1800, time);
        const nEnv = this.ctx.createGain();
        nEnv.gain.setValueAtTime(velocity * 0.32, time);
        nEnv.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

        noise.connect(bp);
        bp.connect(nEnv);
        nEnv.connect(session.percBus);
        noise.start(time, 0, 0.05);
        this.trackSource(session, noise);
        break;
      }
      case 'TIN': {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(430, time);
        osc.frequency.exponentialRampToValueAtTime(395, time + 0.08);

        const over = this.ctx.createOscillator();
        over.type = 'sine';
        over.frequency.setValueAtTime(810, time);

        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(velocity * 0.5, time + 0.003);
        env.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);

        osc.connect(env);
        over.connect(env);
        env.connect(session.percBus);
        for (const src of [osc, over]) {
          src.start(time);
          src.stop(time + 0.14);
          this.trackSource(session, src);
        }
        break;
      }
      case 'DAMARU': {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, time);
        osc.frequency.exponentialRampToValueAtTime(165, time + 0.045);
        osc.frequency.exponentialRampToValueAtTime(245, time + 0.09);

        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(velocity * 0.55, time + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0001, time + 0.10);

        osc.connect(env);
        env.connect(session.percBus);
        osc.start(time);
        osc.stop(time + 0.11);
        this.trackSource(session, osc);
        break;
      }
      case 'SHAKER': {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(5000, time);

        const env = this.ctx.createGain();
        env.gain.setValueAtTime(velocity * 0.25, time);
        env.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

        noise.connect(hp);
        hp.connect(env);
        env.connect(session.percBus);
        noise.start(time, Math.random() * 0.5, 0.05);
        this.trackSource(session, noise);
        break;
      }
      case 'MANJIRA': {
        const decay = 0.18;
        for (const [ratio, weight] of [[1.0, 0.22], [2.0, 0.15], [2.76, 0.12]] as const) {
          const osc = this.ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(3280 * ratio, time);

          const env = this.ctx.createGain();
          env.gain.setValueAtTime(0, time);
          env.gain.linearRampToValueAtTime(velocity * weight, time + 0.002);
          env.gain.exponentialRampToValueAtTime(0.0001, time + decay);

          osc.connect(env);
          env.connect(session.percBus);
          osc.start(time);
          osc.stop(time + decay + 0.02);
          this.trackSource(session, osc);
        }
        break;
      }
    }
  }
}
