// src/game/audio/scales.ts — Raga definitions & MIDI utilities (pure TS, no DOM/AudioContext)

/** Raga Bhupali: Sa = C (0), Re = D (2), Ga = E (4), Pa = G (7), Dha = A (9) */
export const RAGA_BHUPALI_PITCH_CLASSES: readonly number[] = [0, 2, 4, 7, 9];

/** Raga Bhairav: Sa = C (0), komal Re = Db (1), Ga = E (4), Ma = F (5), Pa = G (7), komal Dha = Ab (8), Ni = B (11) */
export const RAGA_BHAIRAV_PITCH_CLASSES: readonly number[] = [0, 1, 4, 5, 7, 8, 11];

/** Raga Khamaj: C (0), D (2), E (4), F (5), G (7), A (9), Bb (10), B (11) */
export const RAGA_KHAMAJ_PITCH_CLASSES: readonly number[] = [0, 2, 4, 5, 7, 9, 10, 11];

export function midiToFreq(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export function isNoteInRaga(midiNote: number, pitchClasses: readonly number[]): boolean {
  const pc = ((midiNote % 12) + 12) % 12;
  return pitchClasses.includes(pc);
}
