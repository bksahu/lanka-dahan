// tests/audio/soundtrack.test.ts — Raga compliance, intro->loop sequencer & SfxLimiter tests
import { describe, it, expect } from 'vitest';
import {
  RAGA_BHUPALI_PITCH_CLASSES,
  RAGA_BHAIRAV_PITCH_CLASSES,
  RAGA_KHAMAJ_PITCH_CLASSES,
  isNoteInRaga,
  midiToFreq,
} from '../../src/game/audio/scales';
import {
  ASHOKA_VATIKA_THEME,
  AGNI_TANDAV_THEME,
  AYODHYA_DEEPAVALI_THEME,
  type TrackPhase,
} from '../../src/game/audio/tracks';
import {
  StepSequencer,
  getStepDurationSec,
  LOOKAHEAD_WINDOW_SEC,
} from '../../src/game/audio/sequencer';
import { SfxLimiter } from '../../src/game/audio/sfxLimiter';

function collectAllMidiNotes(phase: TrackPhase): number[] {
  const notes: number[] = [];
  for (const m of phase.melody) notes.push(m.midiNote);
  for (const b of phase.bass) notes.push(b.midiNote);
  for (const c of phase.chords) notes.push(...c.midiNotes);
  for (const s of phase.santoor) notes.push(s.midiNote);
  return notes;
}

describe('Finalized Soundtrack Raga Compliance', () => {
  it('ASHOKA_VATIKA: every pitched note belongs strictly to Raga Bhupali [0, 2, 4, 7, 9]', () => {
    const notes = collectAllMidiNotes(ASHOKA_VATIKA_THEME.loop);
    expect(notes.length).toBe(10);
    for (const midi of notes) {
      expect(isNoteInRaga(midi, RAGA_BHUPALI_PITCH_CLASSES)).toBe(true);
    }
    expect(ASHOKA_VATIKA_THEME.loop.percussion.map((p) => p.step)).toEqual([0, 8, 16, 24]);
  });

  it('AGNI_TANDAV: every pitched note (melody + sitar bass) belongs strictly to Raga Bhairav [0, 1, 4, 5, 7, 8, 11]', () => {
    const notes = collectAllMidiNotes(AGNI_TANDAV_THEME.loop);
    expect(notes.length).toBeGreaterThan(50);
    for (const midi of notes) {
      expect(isNoteInRaga(midi, RAGA_BHAIRAV_PITCH_CLASSES)).toBe(true);
    }
    // Verify Bar-4 turnaround steps 56..63 exist
    const bar4Steps = AGNI_TANDAV_THEME.loop.percussion.filter((p) => p.step >= 56);
    expect(bar4Steps.some((p) => p.step === 63 && p.kind === 'DHIN')).toBe(true);
    expect(bar4Steps.some((p) => p.step === 63 && p.kind === 'TA')).toBe(true);
  });

  it('AYODHYA_DEEPAVALI (intro + loop): every pitched note belongs strictly to Raga Khamaj [0, 2, 4, 5, 7, 9, 10, 11]', () => {
    expect(AYODHYA_DEEPAVALI_THEME.intro).toBeDefined();
    const introNotes = collectAllMidiNotes(AYODHYA_DEEPAVALI_THEME.intro!);
    const loopNotes = collectAllMidiNotes(AYODHYA_DEEPAVALI_THEME.loop);
    expect(introNotes.length).toBeGreaterThan(10);
    expect(loopNotes.length).toBeGreaterThan(40);

    for (const midi of [...introNotes, ...loopNotes]) {
      expect(isNoteInRaga(midi, RAGA_KHAMAJ_PITCH_CLASSES)).toBe(true);
    }
  });
});

describe('StepSequencer Timing & Intro -> Loop Transitions', () => {
  it('transitions AYODHYA_DEEPAVALI from intro step 15 -> loop step 0 and wraps loop 63 -> 0 at 118 BPM with zero drift', () => {
    const seq = new StepSequencer(AYODHYA_DEEPAVALI_THEME);
    const startTime = 2.0;
    seq.reset(startTime);

    const stepDur = getStepDurationSec(118);
    expect(seq.stepDurationSec).toBeCloseTo(stepDur, 10);

    const collected: { phase: 'intro' | 'loop'; step: number; time: number }[] = [];
    // Run across 16 intro + 128 loop steps = 144 steps
    const totalSteps = 144;
    for (let t = startTime; t <= startTime + totalSteps * stepDur; t += 0.025) {
      for (const ev of seq.advanceLookahead(t, LOOKAHEAD_WINDOW_SEC)) {
        collected.push({ phase: ev.phase, step: ev.step, time: ev.time });
      }
    }

    expect(collected.length).toBeGreaterThanOrEqual(totalSteps);

    // Check intro steps 0..15
    for (let i = 0; i < 16; i++) {
      expect(collected[i].phase).toBe('intro');
      expect(collected[i].step).toBe(i);
      expect(collected[i].time).toBeCloseTo(startTime + i * stepDur, 10);
    }

    // Check seamless transition intro 15 -> loop 0
    expect(collected[15].phase).toBe('intro');
    expect(collected[15].step).toBe(15);
    expect(collected[16].phase).toBe('loop');
    expect(collected[16].step).toBe(0);
    expect(collected[16].time - collected[15].time).toBeCloseTo(stepDur, 10);

    // Check loop wrap 63 -> 0 (index 16+63 = 79 -> index 80)
    expect(collected[79].phase).toBe('loop');
    expect(collected[79].step).toBe(63);
    expect(collected[80].phase).toBe('loop');
    expect(collected[80].step).toBe(0);
    expect(collected[80].time).toBeCloseTo(startTime + 80 * stepDur, 10);
  });

  it('wraps AGNI_TANDAV 63 -> 0 at 142 BPM with zero drift and resyncs cleanly', () => {
    const seq = new StepSequencer(AGNI_TANDAV_THEME);
    const startTime = 0.5;
    seq.reset(startTime);

    const stepDur = getStepDurationSec(142);
    const collected: { step: number; time: number }[] = [];
    for (let t = startTime; t <= startTime + 128 * stepDur; t += 0.025) {
      for (const ev of seq.advanceLookahead(t, LOOKAHEAD_WINDOW_SEC)) {
        collected.push({ step: ev.step, time: ev.time });
      }
    }

    expect(collected[63].step).toBe(63);
    expect(collected[64].step).toBe(0);
    expect(collected[64].time).toBeCloseTo(startTime + 64 * stepDur, 10);

    // Resync test
    seq.resyncTime(25.05);
    const afterResume = seq.advanceLookahead(25.0, LOOKAHEAD_WINDOW_SEC);
    expect(afterResume.length).toBe(1);
    expect(afterResume[0].time).toBe(25.05);
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
  });
});

describe('SfxLimiter Burst Throttling', () => {
  it('throttles burst TILE_IGNITED, TILE_BURNING, and TILE_COLLAPSED events during AGNI_TANDAV', () => {
    const limiter = new SfxLimiter();

    // Burst of 5 ignitions within 30ms -> only first allowed
    expect(limiter.canTrigger('TILE_IGNITED', 1000)).toBe(true);
    expect(limiter.canTrigger('TILE_IGNITED', 1005)).toBe(false);
    expect(limiter.canTrigger('TILE_IGNITED', 1020)).toBe(false);
    expect(limiter.canTrigger('TILE_IGNITED', 1085)).toBe(false);
    // After 90ms cooldown -> allowed again
    expect(limiter.canTrigger('TILE_IGNITED', 1090)).toBe(true);

    // Independent channel limits for TILE_BURNING (140ms) and TILE_COLLAPSED (120ms)
    expect(limiter.canTrigger('TILE_BURNING', 1000)).toBe(true);
    expect(limiter.canTrigger('TILE_BURNING', 1100)).toBe(false);
    expect(limiter.canTrigger('TILE_BURNING', 1140)).toBe(true);

    expect(limiter.canTrigger('TILE_COLLAPSED', 1000)).toBe(true);
    expect(limiter.canTrigger('TILE_COLLAPSED', 1050)).toBe(false);
    expect(limiter.canTrigger('TILE_COLLAPSED', 1120)).toBe(true);
  });
});
