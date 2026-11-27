// src/game/audio/sequencer.ts — Pure lookahead step scheduler (zero AudioContext dependency)

import type {
  BassNote,
  GhantaHit,
  HarmoniumChord,
  MelodyNote,
  PercussionHit,
  SantoorNote,
  TrackDef,
} from './tracks';

export const LOOKAHEAD_POLL_MS = 25;
export const LOOKAHEAD_WINDOW_SEC = 0.100;

export interface ScheduledStepEvents {
  phase: 'intro' | 'loop';
  step: number;
  time: number;
  stepDurationSec: number;
  melody: MelodyNote[];
  bass: BassNote[];
  chords: HarmoniumChord[];
  santoor: SantoorNote[];
  ghanta: GhantaHit[];
  percussion: PercussionHit[];
}

export function getStepDurationSec(bpm: number): number {
  // 16th-note grid: 4 steps per quarter-note beat
  return 60 / bpm / 4;
}

export class StepSequencer {
  readonly track: TrackDef;
  readonly stepDurationSec: number;
  inIntro: boolean;
  currentStep = 0;
  nextStepTime = 0;
  private anchorTime = 0;
  private anchorStepCount = 0;

  constructor(track: TrackDef) {
    this.track = track;
    this.stepDurationSec = getStepDurationSec(track.bpm);
    this.inIntro = Boolean(track.intro && track.intro.steps > 0);
  }

  reset(startTime: number): void {
    this.inIntro = Boolean(this.track.intro && this.track.intro.steps > 0);
    this.currentStep = 0;
    this.anchorTime = startTime;
    this.anchorStepCount = 0;
    this.nextStepTime = startTime;
  }

  /** Resets timing anchor on resume/unhide without bursting catch-up notes */
  resyncTime(resumeTime: number): void {
    this.anchorTime = resumeTime;
    this.anchorStepCount = 0;
    this.nextStepTime = resumeTime;
  }

  /**
   * Collect all steps falling within [now, now + lookaheadSec) and advance cursor
   * using exact integer step multiples from anchorTime to guarantee zero timestamp drift.
   */
  advanceLookahead(now: number, lookaheadSec = LOOKAHEAD_WINDOW_SEC): ScheduledStepEvents[] {
    const out: ScheduledStepEvents[] = [];
    const horizon = now + lookaheadSec;

    while (this.nextStepTime < horizon) {
      const phaseName: 'intro' | 'loop' = this.inIntro ? 'intro' : 'loop';
      const phaseData = this.inIntro && this.track.intro ? this.track.intro : this.track.loop;
      const step = this.currentStep;
      const time = this.nextStepTime;

      out.push({
        phase: phaseName,
        step,
        time,
        stepDurationSec: this.stepDurationSec,
        melody: phaseData.melody.filter((n) => n.step === step),
        bass: phaseData.bass.filter((b) => b.step === step),
        chords: phaseData.chords.filter((c) => c.step === step),
        santoor: phaseData.santoor.filter((s) => s.step === step),
        ghanta: phaseData.ghanta.filter((g) => g.step === step),
        percussion: phaseData.percussion.filter((p) => p.step === step),
      });

      if (this.inIntro && this.track.intro) {
        if (this.currentStep + 1 >= this.track.intro.steps) {
          this.inIntro = false;
          this.currentStep = 0;
        } else {
          this.currentStep += 1;
        }
      } else {
        this.currentStep = (this.currentStep + 1) % this.track.loop.steps;
      }

      this.anchorStepCount += 1;
      this.nextStepTime = this.anchorTime + this.anchorStepCount * this.stepDurationSec;
    }

    return out;
  }
}
