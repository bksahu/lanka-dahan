// src/game/audio/tracks.ts — Ashoka Vatika procedural track data (pure TS)

export interface MelodyNote {
  step: number;
  midiNote: number;
  durationSteps: number;
  velocity: number;
}

export interface PercussionHit {
  step: number;
  kind: 'DHIN';
  velocity: number;
}

export interface TanpuraSpec {
  readonly midiNotes: readonly { midiNote: number; type: OscillatorType; detuneCents: number }[];
  readonly filterHz: number;
  readonly filterQ: number;
  readonly lfoRatesHz: readonly [number, number];
  readonly level: number;
  readonly fadeInSec: number;
  readonly fadeOutSec: number;
}

export interface TrackDef {
  readonly id: string;
  readonly title: string;
  readonly bpm: number;
  readonly totalSteps: number;
  readonly melody: readonly MelodyNote[];
  readonly percussion: readonly PercussionHit[];
  readonly tanpura: TanpuraSpec;
}

export const ASHOKA_VATIKA_THEME: TrackDef = {
  id: 'ashoka_vatika',
  title: 'Ashoka Vatika (Raga Bhupali)',
  bpm: 92,
  totalSteps: 32,
  melody: [
    // Bar 1
    { step: 0, midiNote: 60, durationSteps: 3, velocity: 0.80 },
    { step: 3, midiNote: 62, durationSteps: 2, velocity: 0.75 },
    { step: 5, midiNote: 64, durationSteps: 3, velocity: 0.85 },
    { step: 8, midiNote: 67, durationSteps: 4, velocity: 0.90 },
    { step: 12, midiNote: 64, durationSteps: 4, velocity: 0.78 },
    // Bar 2
    { step: 16, midiNote: 69, durationSteps: 3, velocity: 0.92 },
    { step: 19, midiNote: 67, durationSteps: 2, velocity: 0.82 },
    { step: 21, midiNote: 64, durationSteps: 3, velocity: 0.80 },
    { step: 24, midiNote: 62, durationSteps: 3, velocity: 0.76 },
    { step: 27, midiNote: 60, durationSteps: 5, velocity: 0.85 },
  ],
  percussion: [
    { step: 0, kind: 'DHIN', velocity: 0.45 },
    { step: 8, kind: 'DHIN', velocity: 0.45 },
    { step: 16, kind: 'DHIN', velocity: 0.45 },
    { step: 24, kind: 'DHIN', velocity: 0.45 },
  ],
  tanpura: {
    midiNotes: [
      { midiNote: 43, type: 'sawtooth', detuneCents: 0 }, // G2
      { midiNote: 48, type: 'sawtooth', detuneCents: 0 }, // C3
      { midiNote: 48, type: 'sawtooth', detuneCents: 4 }, // C3 +4 cents
      { midiNote: 36, type: 'triangle', detuneCents: 0 }, // C2
    ],
    filterHz: 850,
    filterQ: 1.2,
    lfoRatesHz: [0.28, 0.41],
    level: 0.18,
    fadeInSec: 0.8,
    fadeOutSec: 0.4,
  },
};
