// src/game/audio/tracks.ts — Procedural Raga soundtrack tables (pure TS, zero AudioContext)

export type LeadVoice = 'bansuri' | 'shehnai';
export type PercussionKind = 'DHIN' | 'TA' | 'TIN' | 'DAMARU' | 'SHAKER' | 'MANJIRA';

export interface MelodyNote {
  step: number;
  midiNote: number;
  durationSteps: number;
  velocity: number;
  glide?: boolean;
}

export interface BassNote {
  step: number;
  midiNote: number;
  durationSteps?: number;
  velocity?: number;
}

export interface HarmoniumChord {
  step: number;
  midiNotes: readonly number[];
  durationSteps: number;
  velocity?: number;
}

export interface SantoorNote {
  step: number;
  midiNote: number;
  velocity?: number;
}

export interface GhantaHit {
  step: number;
  freqHz: number;
  velocity?: number;
}

export interface PercussionHit {
  step: number;
  kind: PercussionKind;
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
  readonly pulseBpmRate?: boolean;
}

export interface TrackPhase {
  readonly steps: number;
  readonly melody: readonly MelodyNote[];
  readonly bass: readonly BassNote[];
  readonly chords: readonly HarmoniumChord[];
  readonly santoor: readonly SantoorNote[];
  readonly ghanta: readonly GhantaHit[];
  readonly percussion: readonly PercussionHit[];
}

export interface TrackDef {
  readonly id: 'ashoka_vatika' | 'agni_tandav' | 'ayodhya_deepavali';
  readonly title: string;
  readonly bpm: number;
  readonly leadVoice: LeadVoice;
  readonly intro?: TrackPhase;
  readonly loop: TrackPhase;
  readonly tanpura: TanpuraSpec;
}

// ─── 1. TITLE SCREEN: ASHOKA VATIKA (Raga Bhupali, 92 BPM, 32-step loop) ─────

export const ASHOKA_VATIKA_THEME: TrackDef = {
  id: 'ashoka_vatika',
  title: 'Ashoka Vatika (Raga Bhupali)',
  bpm: 92,
  leadVoice: 'bansuri',
  loop: {
    steps: 32,
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
    bass: [],
    chords: [],
    santoor: [],
    ghanta: [],
    percussion: [
      { step: 0, kind: 'DHIN', velocity: 0.45 },
      { step: 8, kind: 'DHIN', velocity: 0.45 },
      { step: 16, kind: 'DHIN', velocity: 0.45 },
      { step: 24, kind: 'DHIN', velocity: 0.45 },
    ],
  },
  tanpura: {
    midiNotes: [
      { midiNote: 43, type: 'sawtooth', detuneCents: 0 },
      { midiNote: 48, type: 'sawtooth', detuneCents: 0 },
      { midiNote: 48, type: 'sawtooth', detuneCents: 4 },
      { midiNote: 36, type: 'triangle', detuneCents: 0 },
    ],
    filterHz: 850,
    filterQ: 1.2,
    lfoRatesHz: [0.28, 0.41],
    level: 0.18,
    fadeInSec: 0.8,
    fadeOutSec: 0.25,
  },
};

// ─── 2. CORE GAMEPLAY: AGNI TANDAV (Raga Bhairav, 142 BPM, 64-step loop) ──────

function buildAgniPercussion(): PercussionHit[] {
  const hits: PercussionHit[] = [];
  const barBase: readonly [number, PercussionKind, number][] = [
    [0, 'DHIN', 0.90], [0, 'MANJIRA', 0.65],
    [2, 'DAMARU', 0.80],
    [3, 'SHAKER', 0.50],
    [4, 'TA', 0.85],
    [6, 'DHIN', 0.82], [6, 'MANJIRA', 0.60],
    [7, 'DAMARU', 0.75],
    [8, 'DHIN', 0.88], [8, 'TIN', 0.78],
    [10, 'DAMARU', 0.82], [10, 'MANJIRA', 0.62],
    [12, 'TA', 0.85],
    [14, 'DHIN', 0.84], [14, 'DAMARU', 0.76],
    [15, 'SHAKER', 0.55],
  ];

  // Bars 1-3 + first half of Bar 4 (steps 0..55)
  for (let bar = 0; bar < 4; bar++) {
    const offset = bar * 16;
    for (const [s, kind, velocity] of barBase) {
      const step = offset + s;
      if (step >= 56) continue; // overridden by Bar-4 turnaround
      hits.push({ step, kind, velocity });
    }
  }

  // Bar-4 turnaround override (steps 56..63)
  const turnaround: readonly [number, PercussionKind, number][] = [
    [56, 'DHIN', 0.92], [56, 'MANJIRA', 0.72],
    [58, 'TA', 0.88], [58, 'DAMARU', 0.85],
    [59, 'DAMARU', 0.84],
    [60, 'DHIN', 0.94], [60, 'TA', 0.88],
    [61, 'DAMARU', 0.86],
    [62, 'TA', 0.92], [62, 'MANJIRA', 0.76],
    [63, 'DHIN', 0.96], [63, 'TA', 0.92],
  ];
  for (const [step, kind, velocity] of turnaround) {
    hits.push({ step, kind, velocity });
  }
  return hits;
}

export const AGNI_TANDAV_THEME: TrackDef = {
  id: 'agni_tandav',
  title: 'Agni Tandav (Raga Bhairav)',
  bpm: 142,
  leadVoice: 'shehnai',
  loop: {
    steps: 64,
    melody: [
      // Bar 1 (0-15)
      { step: 0, midiNote: 60, durationSteps: 2, velocity: 0.95 },
      { step: 2, midiNote: 64, durationSteps: 2, velocity: 0.90 },
      { step: 4, midiNote: 65, durationSteps: 2, velocity: 0.90 },
      { step: 6, midiNote: 67, durationSteps: 2, velocity: 0.95 },
      { step: 8, midiNote: 68, durationSteps: 2, velocity: 1.00 },
      { step: 10, midiNote: 67, durationSteps: 2, velocity: 0.92, glide: true },
      { step: 12, midiNote: 65, durationSteps: 2, velocity: 0.88 },
      { step: 14, midiNote: 64, durationSteps: 2, velocity: 0.86 },
      // Bar 2 (16-31)
      { step: 16, midiNote: 65, durationSteps: 2, velocity: 0.92 },
      { step: 18, midiNote: 67, durationSteps: 2, velocity: 0.94 },
      { step: 20, midiNote: 61, durationSteps: 2, velocity: 0.98 },
      { step: 22, midiNote: 60, durationSteps: 2, velocity: 0.94, glide: true },
      { step: 24, midiNote: 64, durationSteps: 2, velocity: 0.90 },
      { step: 26, midiNote: 67, durationSteps: 2, velocity: 0.94 },
      { step: 28, midiNote: 61, durationSteps: 2, velocity: 0.96 },
      { step: 30, midiNote: 60, durationSteps: 2, velocity: 0.92, glide: true },
      // Bar 3 (32-47)
      { step: 32, midiNote: 67, durationSteps: 2, velocity: 0.94 },
      { step: 34, midiNote: 68, durationSteps: 2, velocity: 0.96 },
      { step: 36, midiNote: 71, durationSteps: 2, velocity: 0.98 },
      { step: 38, midiNote: 72, durationSteps: 4, velocity: 1.00 },
      { step: 42, midiNote: 73, durationSteps: 2, velocity: 1.00 },
      { step: 44, midiNote: 72, durationSteps: 2, velocity: 0.96, glide: true },
      { step: 46, midiNote: 71, durationSteps: 2, velocity: 0.92 },
      // Bar 4 (48-63)
      { step: 48, midiNote: 68, durationSteps: 2, velocity: 0.98 },
      { step: 50, midiNote: 67, durationSteps: 2, velocity: 0.94, glide: true },
      { step: 52, midiNote: 65, durationSteps: 2, velocity: 0.90 },
      { step: 54, midiNote: 64, durationSteps: 2, velocity: 0.88 },
      { step: 56, midiNote: 65, durationSteps: 2, velocity: 0.92 },
      { step: 58, midiNote: 61, durationSteps: 2, velocity: 0.98 },
      { step: 60, midiNote: 60, durationSteps: 2, velocity: 0.96, glide: true },
      { step: 62, midiNote: 55, durationSteps: 1, velocity: 0.84 },
      { step: 63, midiNote: 59, durationSteps: 1, velocity: 0.88 },
    ],
    bass: [
      // Bar 1
      { step: 0, midiNote: 48 }, { step: 2, midiNote: 36 }, { step: 4, midiNote: 48 }, { step: 6, midiNote: 43 },
      { step: 8, midiNote: 44 }, { step: 10, midiNote: 43 }, { step: 12, midiNote: 48 }, { step: 14, midiNote: 43 },
      // Bar 2
      { step: 16, midiNote: 48 }, { step: 18, midiNote: 36 }, { step: 20, midiNote: 49 }, { step: 22, midiNote: 48 },
      { step: 24, midiNote: 43 }, { step: 26, midiNote: 44 }, { step: 28, midiNote: 49 }, { step: 30, midiNote: 48 },
      // Bar 3
      { step: 32, midiNote: 43 }, { step: 34, midiNote: 44 }, { step: 36, midiNote: 47 }, { step: 38, midiNote: 48 },
      { step: 40, midiNote: 36 }, { step: 42, midiNote: 49 }, { step: 44, midiNote: 48 }, { step: 46, midiNote: 47 },
      // Bar 4
      { step: 48, midiNote: 44 }, { step: 50, midiNote: 43 }, { step: 52, midiNote: 41 }, { step: 54, midiNote: 40 },
      { step: 56, midiNote: 49 }, { step: 58, midiNote: 48 }, { step: 60, midiNote: 43 }, { step: 62, midiNote: 47 },
    ],
    chords: [],
    santoor: [],
    ghanta: [],
    percussion: buildAgniPercussion(),
  },
  tanpura: {
    midiNotes: [
      { midiNote: 43, type: 'sawtooth', detuneCents: 0 },
      { midiNote: 48, type: 'sawtooth', detuneCents: 0 },
      { midiNote: 48, type: 'sawtooth', detuneCents: 4 },
      { midiNote: 36, type: 'triangle', detuneCents: 0 },
    ],
    filterHz: 850,
    filterQ: 1.2,
    lfoRatesHz: [0.28, 0.41],
    level: 0.55,
    fadeInSec: 0.3,
    fadeOutSec: 0.016,
    pulseBpmRate: true,
  },
};

// ─── 3. POST-WIN VICTORY: AYODHYA DEEPAVALI (Raga Khamaj, 118 BPM, 16+64) ─────

function buildAyodhyaLoopPercussion(): PercussionHit[] {
  const hits: PercussionHit[] = [];
  const barBase: readonly [number, PercussionKind, number][] = [
    [0, 'DHIN', 0.88],
    [3, 'DHIN', 0.68],
    [4, 'TA', 0.82],
    [6, 'DHIN', 0.80],
    [8, 'DHIN', 0.86], [8, 'TIN', 0.78],
    [10, 'DHIN', 0.80],
    [12, 'TA', 0.84],
    [14, 'DHIN', 0.82], [14, 'TIN', 0.76],
  ];

  for (let bar = 0; bar < 4; bar++) {
    const offset = bar * 16;
    for (const [s, kind, velocity] of barBase) {
      const step = offset + s;
      if (step >= 61) continue; // Bar-4 turnaround overrides 61..63
      hits.push({ step, kind, velocity });
    }
  }

  // Bar-4 turnaround: 61: TA, 62: DHIN+TA, 63: TIN
  hits.push({ step: 61, kind: 'TA', velocity: 0.86 });
  hits.push({ step: 62, kind: 'DHIN', velocity: 0.90 });
  hits.push({ step: 62, kind: 'TA', velocity: 0.86 });
  hits.push({ step: 63, kind: 'TIN', velocity: 0.84 });

  // Manjira every 4 steps (0, 4, 8, ..., 60)
  for (let step = 0; step < 64; step += 4) {
    hits.push({ step, kind: 'MANJIRA', velocity: 0.68 });
  }
  return hits;
}

export const AYODHYA_DEEPAVALI_THEME: TrackDef = {
  id: 'ayodhya_deepavali',
  title: 'Ayodhya Deepavali (Raga Khamaj)',
  bpm: 118,
  leadVoice: 'shehnai',
  intro: {
    steps: 16,
    melody: [
      { step: 2, midiNote: 64, durationSteps: 2, velocity: 0.86 },
      { step: 4, midiNote: 67, durationSteps: 3, velocity: 0.92, glide: true },
      { step: 7, midiNote: 69, durationSteps: 1, velocity: 0.88 },
      { step: 8, midiNote: 71, durationSteps: 2, velocity: 0.94 },
      { step: 10, midiNote: 72, durationSteps: 6, velocity: 0.98, glide: true },
    ],
    bass: [],
    chords: [
      { step: 0, midiNotes: [48, 52, 55], durationSteps: 8, velocity: 0.65 },
      { step: 8, midiNotes: [55, 59, 62], durationSteps: 8, velocity: 0.70 },
    ],
    santoor: [
      { step: 10, midiNote: 72, velocity: 0.75 },
      { step: 12, midiNote: 76, velocity: 0.80 },
      { step: 14, midiNote: 79, velocity: 0.85 },
    ],
    ghanta: [
      { step: 0, freqHz: 523.25, velocity: 0.72 },
      { step: 8, freqHz: 659.25, velocity: 0.76 },
    ],
    percussion: [
      { step: 0, kind: 'DHIN', velocity: 0.86 },
      { step: 0, kind: 'MANJIRA', velocity: 0.72 },
      { step: 4, kind: 'MANJIRA', velocity: 0.65 },
      { step: 8, kind: 'DHIN', velocity: 0.88 },
      { step: 8, kind: 'MANJIRA', velocity: 0.72 },
      { step: 12, kind: 'TA', velocity: 0.82 },
      { step: 12, kind: 'MANJIRA', velocity: 0.68 },
      { step: 14, kind: 'DHIN', velocity: 0.86 },
      { step: 14, kind: 'TIN', velocity: 0.80 },
    ],
  },
  loop: {
    steps: 64,
    melody: [
      // Bar 1 (0-15)
      { step: 0, midiNote: 64, durationSteps: 2, velocity: 0.92 },
      { step: 2, midiNote: 65, durationSteps: 2, velocity: 0.88 },
      { step: 4, midiNote: 67, durationSteps: 3, velocity: 0.96, glide: true },
      { step: 7, midiNote: 69, durationSteps: 1, velocity: 0.90 },
      { step: 8, midiNote: 71, durationSteps: 2, velocity: 0.96 },
      { step: 10, midiNote: 72, durationSteps: 4, velocity: 1.00, glide: true },
      { step: 14, midiNote: 70, durationSteps: 2, velocity: 0.92 },
      // Bar 2 (16-31)
      { step: 16, midiNote: 69, durationSteps: 2, velocity: 0.94, glide: true },
      { step: 18, midiNote: 67, durationSteps: 2, velocity: 0.92 },
      { step: 20, midiNote: 65, durationSteps: 2, velocity: 0.90 },
      { step: 22, midiNote: 64, durationSteps: 2, velocity: 0.92, glide: true },
      { step: 24, midiNote: 62, durationSteps: 2, velocity: 0.88 },
      { step: 26, midiNote: 64, durationSteps: 2, velocity: 0.92 },
      { step: 28, midiNote: 60, durationSteps: 4, velocity: 0.96, glide: true },
      // Bar 3 (32-47)
      { step: 32, midiNote: 67, durationSteps: 2, velocity: 0.94 },
      { step: 34, midiNote: 69, durationSteps: 2, velocity: 0.94 },
      { step: 36, midiNote: 72, durationSteps: 3, velocity: 0.98, glide: true },
      { step: 39, midiNote: 74, durationSteps: 1, velocity: 0.94 },
      { step: 40, midiNote: 76, durationSteps: 2, velocity: 1.00 },
      { step: 42, midiNote: 74, durationSteps: 2, velocity: 0.96 },
      { step: 44, midiNote: 72, durationSteps: 2, velocity: 0.96 },
      { step: 46, midiNote: 70, durationSteps: 2, velocity: 0.94 },
      // Bar 4 (48-63)
      { step: 48, midiNote: 69, durationSteps: 2, velocity: 0.94, glide: true },
      { step: 50, midiNote: 67, durationSteps: 2, velocity: 0.94 },
      { step: 52, midiNote: 65, durationSteps: 2, velocity: 0.92 },
      { step: 54, midiNote: 67, durationSteps: 2, velocity: 0.94 },
      { step: 56, midiNote: 64, durationSteps: 2, velocity: 0.92, glide: true },
      { step: 58, midiNote: 62, durationSteps: 2, velocity: 0.88 },
      { step: 60, midiNote: 60, durationSteps: 4, velocity: 0.98, glide: true },
    ],
    bass: [],
    chords: [
      { step: 0, midiNotes: [48, 52, 55], durationSteps: 12, velocity: 0.65 },
      { step: 12, midiNotes: [55, 58, 62], durationSteps: 4, velocity: 0.65 },
      { step: 16, midiNotes: [53, 57, 60], durationSteps: 8, velocity: 0.65 },
      { step: 24, midiNotes: [48, 52, 55], durationSteps: 8, velocity: 0.65 },
      { step: 32, midiNotes: [48, 52, 55], durationSteps: 8, velocity: 0.68 },
      { step: 40, midiNotes: [55, 58, 62], durationSteps: 8, velocity: 0.68 },
      { step: 48, midiNotes: [53, 57, 60], durationSteps: 8, velocity: 0.65 },
      { step: 56, midiNotes: [48, 52, 55], durationSteps: 8, velocity: 0.68 },
    ],
    santoor: [
      { step: 32, midiNote: 72, velocity: 0.78 },
      { step: 40, midiNote: 76, velocity: 0.80 },
    ],
    ghanta: [
      { step: 0, freqHz: 523.25, velocity: 0.72 },
      { step: 32, freqHz: 587.33, velocity: 0.72 },
    ],
    percussion: buildAyodhyaLoopPercussion(),
  },
  tanpura: {
    midiNotes: [
      { midiNote: 43, type: 'sawtooth', detuneCents: 0 },
      { midiNote: 48, type: 'sawtooth', detuneCents: 0 },
      { midiNote: 48, type: 'sawtooth', detuneCents: 4 },
      { midiNote: 36, type: 'triangle', detuneCents: 0 },
    ],
    filterHz: 850,
    filterQ: 1.2,
    lfoRatesHz: [0.28, 0.41],
    level: 0.78,
    fadeInSec: 0.4,
    fadeOutSec: 0.016,
  },
};
