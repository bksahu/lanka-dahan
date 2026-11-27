// src/game/audio/sequencer.ts — Pure lookahead step scheduler (zero AudioContext dependency)

import type { MelodyNote, PercussionHit, TrackDef } from './tracks';

export const LOOKAHEAD_POLL_MS = 25;
export const LOOKAHEAD_WINDOW_SEC = 0.100;

export interface ScheduledStepEvents {
  step: number;
  time: number;
  stepDurationSec: number;
  melody: MelodyNote[];
  percussion: PercussionHit[];
}

export function getStepDurationSec(bpm: number): number {
  // 16th-note grid: 4 steps per quarter-note beat
  return 60 / bpm / 4;
}

export class StepSequencer {
  readonly track: TrackDef;
  readonly stepDurationSec: number;
  currentStep = 0;
  nextStepTime = 0;
  private anchorTime = 0;
  private anchorStepCount = 0;

  constructor(track: TrackDef) {
    this.track = track;
    this.stepDurationSec = getStepDurationSec(track.bpm);
  }

  reset(startTime: number): void {
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
   * using exact integer step multiples from the anchor to prevent timestamp drift.
   */
  advanceLookahead(now: number, lookaheadSec = LOOKAHEAD_WINDOW_SEC): ScheduledStepEvents[] {
    const out: ScheduledStepEvents[] = [];
    const horizon = now + lookaheadSec;

    while (this.nextStepTime < horizon) {
      const step = this.currentStep;
      const time = this.nextStepTime;

      const melody = this.track.melody.filter((n) => n.step === step);
      const percussion = this.track.percussion.filter((p) => p.step === step);

      out.push({
        step,
        time,
        stepDurationSec: this.stepDurationSec,
        melody,
        percussion,
      });

      this.currentStep = (this.currentStep + 1) % this.track.totalSteps;
      this.anchorStepCount += 1;
      this.nextStepTime = this.anchorTime + this.anchorStepCount * this.stepDurationSec;
    }

    return out;
  }
}
