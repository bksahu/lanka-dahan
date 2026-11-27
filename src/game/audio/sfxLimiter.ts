// src/game/audio/sfxLimiter.ts — Pure TS burst-throttling limiter for SFX events

export class SfxLimiter {
  private lastPlayedMs: Map<string, number> = new Map();
  private readonly defaultCooldownMs: number;
  private readonly cooldownOverrides: Record<string, number>;

  constructor(
    defaultCooldownMs = 80,
    cooldownOverrides: Record<string, number> = {
      TILE_IGNITED: 90,
      TILE_BURNING: 140,
      TILE_COLLAPSED: 120,
    },
  ) {
    this.defaultCooldownMs = defaultCooldownMs;
    this.cooldownOverrides = cooldownOverrides;
  }

  canTrigger(eventKey: string, nowMs: number): boolean {
    const cooldown = this.cooldownOverrides[eventKey] ?? this.defaultCooldownMs;
    const prev = this.lastPlayedMs.get(eventKey);
    if (prev !== undefined && nowMs - prev < cooldown) {
      return false;
    }
    this.lastPlayedMs.set(eventKey, nowMs);
    return true;
  }

  reset(): void {
    this.lastPlayedMs.clear();
  }
}
