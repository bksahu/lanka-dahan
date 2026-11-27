// src/game/audio/scales.ts — Raga definitions & MIDI utilities (pure TS, no DOM/AudioContext)

/** Raga Bhupali: Sa = C (0), Re = D (2), Ga = E (4), Pa = G (7), Dha = A (9) */
export const RAGA_BHUPALI_PITCH_CLASSES: readonly number[] = [0, 2, 4, 7, 9];

export function midiToFreq(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export function isNoteInRaga(midiNote: number, pitchClasses: readonly number[]): boolean {
  const pc = ((midiNote % 12) + 12) % 12;
  return pitchClasses.includes(pc);
}
