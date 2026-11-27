// tests/titleAudio.test.ts — Raga Bhupali & 32-step lookahead sequencer tests
import { describe, it, expect } from 'vitest';
import {
  RAGA_BHUPALI_PITCH_CLASSES,
  isNoteInRaga,
  midiToFreq,
} from '../src/game/audio/scales';
import { ASHOKA_VATIKA_THEME } from '../src/game/audio/tracks';
import {
  StepSequencer,
  getStepDurationSec,
  LOOKAHEAD_WINDOW_SEC,
} from '../src/game/audio/sequencer';

describe('Ashoka Vatika Title Theme (Raga Bhupali)', () => {
  it('every melody note belongs strictly to Raga Bhupali [0, 2, 4, 7, 9]', () => {
    expect(RAGA_BHUPALI_PITCH_CLASSES).toEqual([0, 2, 4, 7, 9]);
    expect(ASHOKA_VATIKA_THEME.melody.length).toBe(10);

    for (const note of ASHOKA_VATIKA_THEME.melody) {
      expect(isNoteInRaga(note.midiNote, RAGA_BHUPALI_PITCH_CLASSES)).toBe(true);
      expect(note.step).toBeGreaterThanOrEqual(0);
      expect(note.step).toBeLessThan(32);
    }
  });

  it('has soft DHIN percussion only on steps 0, 8, 16, and 24', () => {
    expect(ASHOKA_VATIKA_THEME.percussion.map((p) => p.step)).toEqual([0, 8, 16, 24]);
    for (const hit of ASHOKA_VATIKA_THEME.percussion) {
      expect(hit.kind).toBe('DHIN');
      expect(hit.velocity).toBe(0.45);
    }
  });

  it('computes 92 BPM 16th-note step duration (~163.04 ms) and MIDI frequencies accurately', () => {
    const stepDur = getStepDurationSec(92);
    expect(stepDur).toBeCloseTo(60 / 92 / 4, 10);
    expect(stepDur * 1000).toBeCloseTo(163.043478, 4);
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(60)).toBeCloseTo(261.625565, 4);
  });

  it('32-step sequencer loops cleanly 31 -> 0 at 92 BPM with zero timestamp drift', () => {
    const seq = new StepSequencer(ASHOKA_VATIKA_THEME);
    const startTime = 1.0;
    seq.reset(startTime);

    const stepDur = seq.stepDurationSec;
    const collected: { step: number; time: number }[] = [];

    // Poll every 25ms across 3 full loops (96 steps)
    const totalDuration = 96 * stepDur;
    for (let t = startTime; t <= startTime + totalDuration; t += 0.025) {
      const events = seq.advanceLookahead(t, LOOKAHEAD_WINDOW_SEC);
      for (const ev of events) {
        collected.push({ step: ev.step, time: ev.time });
      }
    }

    expect(collected.length).toBeGreaterThanOrEqual(96);

    // Verify wrap 31 -> 0 and zero drift on every single step
    for (let i = 0; i < 96; i++) {
      expect(collected[i].step).toBe(i % 32);
      expect(collected[i].time).toBeCloseTo(startTime + i * stepDur, 10);
    }
    expect(collected[31].step).toBe(31);
    expect(collected[32].step).toBe(0);
  });

  it('resyncTime resets nextStepTime without catch-up note bursts', () => {
    const seq = new StepSequencer(ASHOKA_VATIKA_THEME);
    seq.reset(0.5);
    seq.advanceLookahead(0.5, LOOKAHEAD_WINDOW_SEC); // schedules step 0

    // Simulate returning after a 10-second background suspension
    const resumeNow = 10.55;
    seq.resyncTime(resumeNow);
    const resumed = seq.advanceLookahead(10.5, LOOKAHEAD_WINDOW_SEC);

    // Only step 1 should be in the 100ms lookahead window, never a burst of missed steps
    expect(resumed.length).toBe(1);
    expect(resumed[0].step).toBe(1);
    expect(resumed[0].time).toBe(resumeNow);
  });
});
