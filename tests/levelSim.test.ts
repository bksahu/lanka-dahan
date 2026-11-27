// tests/levelSim.test.ts — Full level simulation integration tests
import { describe, it, expect } from 'vitest';
import { LevelSim } from '../src/core/levelSim';
import { getLevel1 } from '../src/core/levelData';
import type { InputSnapshot, LevelDef, TileMaterial } from '../src/core/types';
import {
  FIXED_DT,
  TILE_SIZE,
  PLAYER_HEIGHT,
  MAX_SACRED_STRIKES,
} from '../src/core/constants';

function noInput(): InputSnapshot {
  return { left: false, right: false, jumpPressed: false, jumpHeld: false, whipPressed: false };
}

function rightInput(): InputSnapshot {
  return { left: false, right: true, jumpPressed: false, jumpHeld: false, whipPressed: false };
}

function rightJumpInput(): InputSnapshot {
  return { left: false, right: true, jumpPressed: true, jumpHeld: true, whipPressed: false };
}

function whipInput(): InputSnapshot {
  return { left: false, right: false, jumpPressed: false, jumpHeld: false, whipPressed: true };
}

// Small test level for predictable behavior
function makeTestLevel(): LevelDef {
  const cols = 20;
  const rows = 6;
  const grid: TileMaterial[][] = [
    // row 0: empty
    Array(cols).fill('EMPTY'),
    // row 1: empty
    Array(cols).fill('EMPTY'),
    // row 2: some banners
    [...Array(5).fill('EMPTY'), 'BANNER', 'BANNER', ...Array(13).fill('EMPTY')],
    // row 3: sacred zone
    [...Array(10).fill('EMPTY'), 'SACRED', 'SACRED', ...Array(8).fill('EMPTY')],
    // row 4: wood roof platform
    [...Array(2).fill('STONE'), ...Array(6).fill('WOOD_ROOF'), 'STONE', 'STONE', 'SACRED', 'SACRED', ...Array(6).fill('WOOD_ROOF'), ...Array(2).fill('STONE')],
    // row 5: ground
    Array(cols).fill('STONE'),
  ];

  return {
    cols,
    rows,
    grid,
    playerStartTx: 2,
    playerStartTy: 4,
    exitTxMin: 18,
    exitTxMax: 19,
    enemies: [],
  };
}

describe('Level Simulation', () => {
  describe('Tile Collisions', () => {
    it('player stands on solid tiles', () => {
      const level = makeTestLevel();
      const sim = new LevelSim(level);

      // Step a few frames
      for (let i = 0; i < 10; i++) {
        sim.step(noInput(), FIXED_DT);
      }

      const snap = sim.step(noInput(), FIXED_DT);
      expect(snap.player.grounded).toBe(true);
      expect(snap.gameStatus).toBe('PLAYING');
    });

    it('player can move right across tiles', () => {
      const level = makeTestLevel();
      const sim = new LevelSim(level);

      // Initialize
      for (let i = 0; i < 5; i++) {
        sim.step(noInput(), FIXED_DT);
      }

      const startX = sim.player.x;

      // Run right for 60 frames (1 second)
      for (let i = 0; i < 60; i++) {
        sim.step(rightInput(), FIXED_DT);
      }

      expect(sim.player.x).toBeGreaterThan(startX);
    });
  });

  describe('Fire Spread Progress', () => {
    it('whipping flammable tiles increases burn percentage', () => {
      const level = makeTestLevel();
      const sim = new LevelSim(level);

      // Initialize
      for (let i = 0; i < 5; i++) {
        sim.step(noInput(), FIXED_DT);
      }

      const initialBurn = sim.step(noInput(), FIXED_DT).burnProgress;
      expect(initialBurn.percent).toBe(0);

      // Position player near wood tiles and whip
      sim.player.x = 3 * TILE_SIZE;
      sim.player.y = 4 * TILE_SIZE - PLAYER_HEIGHT;
      sim.player.facing = 1;

      // Trigger whip
      sim.step({ ...whipInput() }, FIXED_DT);

      // Run for a few seconds to let fire propagate
      for (let i = 0; i < 300; i++) {
        sim.step(noInput(), FIXED_DT);
      }

      const afterBurn = sim.step(noInput(), FIXED_DT).burnProgress;
      expect(afterBurn.ignited).toBeGreaterThan(0);
    });
  });

  describe('Sacred Strike Penalty', () => {
    it('reaching max sacred strikes loses the game', () => {
      const level = makeTestLevel();
      const sim = new LevelSim(level);

      // Initialize
      for (let i = 0; i < 5; i++) {
        sim.step(noInput(), FIXED_DT);
      }

      // Manually increment sacred strikes to threshold
      sim.player.sacredStrikes = MAX_SACRED_STRIKES;

      const snap = sim.step(noInput(), FIXED_DT);
      expect(snap.gameStatus).toBe('LOSE');
      expect(snap.loseReason).toBe('SACRED');
    });
  });

  describe('Win/Lose Conditions', () => {
    it('health reaching 0 triggers LOSE', () => {
      const level = makeTestLevel();
      const sim = new LevelSim(level);

      for (let i = 0; i < 5; i++) {
        sim.step(noInput(), FIXED_DT);
      }

      sim.player.health = 0;
      const snap = sim.step(noInput(), FIXED_DT);
      expect(snap.gameStatus).toBe('LOSE');
      expect(snap.loseReason).toBe('HEALTH');
    });

    it('falling into abyss triggers LOSE', () => {
      const level = makeTestLevel();
      const sim = new LevelSim(level);

      // Move player below world
      sim.player.y = 300;
      const snap = sim.step(noInput(), FIXED_DT);
      expect(snap.gameStatus).toBe('LOSE');
      expect(snap.loseReason).toBe('ABYSS');
    });
  });

  describe('Multi-second Playthrough', () => {
    it('runs a scripted playthrough without crashes', () => {
      const level = getLevel1();
      const sim = new LevelSim(level);

      // Run 5 seconds of simulation
      const totalFrames = 5 * 60; // 5 seconds at 60fps

      for (let i = 0; i < totalFrames; i++) {
        const frame = i % 120;
        let input: InputSnapshot;

        if (frame < 60) {
          // Run right
          input = rightInput();
        } else if (frame < 65) {
          // Jump
          input = rightJumpInput();
        } else if (frame < 70) {
          // Whip
          input = { ...rightInput(), whipPressed: true };
        } else {
          input = rightInput();
        }

        const snap = sim.step(input, FIXED_DT);

        // Should not crash
        expect(snap).toBeDefined();
        expect(snap.player).toBeDefined();
        expect(snap.burnProgress).toBeDefined();

        // If game ended, that's fine
        if (snap.gameStatus !== 'PLAYING') break;
      }
    });
  });
});
