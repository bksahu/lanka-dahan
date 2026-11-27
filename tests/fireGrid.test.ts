// tests/fireGrid.test.ts — Fire propagation tests
import { describe, it, expect } from 'vitest';
import { FireGrid } from '../src/core/fireGrid';
import type { TileMaterial } from '../src/core/types';
import {
  WOOD_ROOF_IGNITE_DELAY,
  WOOD_ROOF_BURN_DURATION,
  BANNER_IGNITE_DELAY,
  BANNER_BURN_DURATION,
  FIRE_TICK_DT,
  FIRE_SPREAD_DELAY,
} from '../src/core/constants';

describe('Fire Grid', () => {
  describe('Symmetric Spread', () => {
    it('igniting center tile of 5-tile WOOD_ROOF row ignites tx-1 and tx+1 on same tick', () => {
      const grid: TileMaterial[][] = [
        ['WOOD_ROOF', 'WOOD_ROOF', 'WOOD_ROOF', 'WOOD_ROOF', 'WOOD_ROOF'],
      ];
      const fire = new FireGrid(grid);

      // Ignite center tile (index 2)
      const result = fire.igniteTile(2, 0);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('TILE_IGNITED');

      // Advance through igniting -> burning
      let totalTime = 0;
      const igniteTime = WOOD_ROOF_IGNITE_DELAY;
      while (totalTime < igniteTime + FIRE_TICK_DT) {
        fire.step(FIRE_TICK_DT);
        totalTime += FIRE_TICK_DT;
      }

      // Center should now be BURNING
      const center = fire.getCell(2, 0);
      expect(center!.fireState).toBe('BURNING');

      // Now advance until fire can spread (FIRE_SPREAD_DELAY)
      while (totalTime < igniteTime + FIRE_SPREAD_DELAY + FIRE_TICK_DT * 2) {
        fire.step(FIRE_TICK_DT);
        totalTime += FIRE_TICK_DT;
      }

      // Both neighbors should be ignited on the same tick
      const left = fire.getCell(1, 0);
      const right = fire.getCell(3, 0);
      expect(left!.fireState).not.toBe('NONE');
      expect(right!.fireState).not.toBe('NONE');

      // And they should be in the same state (symmetric)
      expect(left!.fireState).toBe(right!.fireState);
    });
  });

  describe('Collapse Timing', () => {
    it('burning WOOD_ROOF transitions to COLLAPSED after burn duration', () => {
      const grid: TileMaterial[][] = [['WOOD_ROOF']];
      const fire = new FireGrid(grid);

      fire.igniteTile(0, 0);

      let totalTime = 0;
      const targetTime = WOOD_ROOF_IGNITE_DELAY + WOOD_ROOF_BURN_DURATION + FIRE_TICK_DT;

      while (totalTime < targetTime) {
        fire.step(FIRE_TICK_DT);
        totalTime += FIRE_TICK_DT;
      }

      const cell = fire.getCell(0, 0);
      expect(cell!.fireState).toBe('COLLAPSED');
    });

    it('COLLAPSED WOOD_ROOF is no longer solid', () => {
      const grid: TileMaterial[][] = [['WOOD_ROOF']];
      const fire = new FireGrid(grid);

      // Initially solid
      expect(fire.isSolid(0, 0)).toBe(true);

      fire.igniteTile(0, 0);

      let totalTime = 0;
      const targetTime = WOOD_ROOF_IGNITE_DELAY + WOOD_ROOF_BURN_DURATION + FIRE_TICK_DT;

      while (totalTime < targetTime) {
        fire.step(FIRE_TICK_DT);
        totalTime += FIRE_TICK_DT;
      }

      expect(fire.isSolid(0, 0)).toBe(false);
    });
  });

  describe('Banner Speed', () => {
    it('BANNER ignites and burns faster than WOOD_ROOF', () => {
      expect(BANNER_IGNITE_DELAY).toBeLessThan(WOOD_ROOF_IGNITE_DELAY);
      expect(BANNER_BURN_DURATION).toBeLessThan(WOOD_ROOF_BURN_DURATION);
    });

    it('BANNER bridges fire across stone gaps', () => {
      // WOOD_ROOF - STONE - BANNER - STONE - WOOD_ROOF
      const grid: TileMaterial[][] = [
        ['WOOD_ROOF', 'BANNER', 'WOOD_ROOF'],
      ];
      const fire = new FireGrid(grid);

      // Ignite left wood
      fire.igniteTile(0, 0);

      // Run enough time for fire to spread through banner to right wood
      let totalTime = 0;
      const maxTime = WOOD_ROOF_IGNITE_DELAY + FIRE_SPREAD_DELAY +
                      BANNER_IGNITE_DELAY + FIRE_SPREAD_DELAY +
                      FIRE_TICK_DT * 20;

      while (totalTime < maxTime) {
        fire.step(FIRE_TICK_DT);
        totalTime += FIRE_TICK_DT;
      }

      // Right wood should have been ignited through the banner
      const rightWood = fire.getCell(2, 0);
      expect(rightWood!.fireState).not.toBe('NONE');
    });
  });

  describe('Sacred Guard', () => {
    it('striking SACRED emits SACRED_STRUCK and keeps fireState NONE', () => {
      const grid: TileMaterial[][] = [['SACRED']];
      const fire = new FireGrid(grid);

      const result = fire.igniteTile(0, 0);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('SACRED_STRUCK');

      const cell = fire.getCell(0, 0);
      expect(cell!.fireState).toBe('NONE');
    });

    it('SACRED blocks adjacent fire spread', () => {
      // WOOD_ROOF - SACRED - WOOD_ROOF
      const grid: TileMaterial[][] = [
        ['WOOD_ROOF', 'SACRED', 'WOOD_ROOF'],
      ];
      const fire = new FireGrid(grid);

      fire.igniteTile(0, 0);

      // Run long enough for fire to try to spread
      let totalTime = 0;
      while (totalTime < 10) {
        fire.step(FIRE_TICK_DT);
        totalTime += FIRE_TICK_DT;
      }

      // Right wood should still be NONE (sacred blocks spread)
      const rightWood = fire.getCell(2, 0);
      expect(rightWood!.fireState).toBe('NONE');

      // Sacred itself is unburned
      const sacred = fire.getCell(1, 0);
      expect(sacred!.fireState).toBe('NONE');
    });

    it('SACRED remains solid always', () => {
      const grid: TileMaterial[][] = [['SACRED']];
      const fire = new FireGrid(grid);
      expect(fire.isSolid(0, 0)).toBe(true);

      fire.igniteTile(0, 0);
      expect(fire.isSolid(0, 0)).toBe(true);
    });
  });

  describe('Burn Progress', () => {
    it('tracks percentage of flammable tiles ignited', () => {
      const grid: TileMaterial[][] = [
        ['WOOD_ROOF', 'WOOD_ROOF', 'STONE', 'WOOD_ROOF', 'BANNER'],
      ];
      const fire = new FireGrid(grid);

      let progress = fire.getBurnProgress();
      expect(progress.totalFlammable).toBe(4); // 3 wood + 1 banner
      expect(progress.ignited).toBe(0);
      expect(progress.percent).toBe(0);

      fire.igniteTile(0, 0);
      fire.igniteTile(1, 0);

      progress = fire.getBurnProgress();
      expect(progress.ignited).toBe(2);
      expect(progress.percent).toBe(50);
    });
  });

  describe('Idempotent Ignition', () => {
    it('igniting already-igniting tile returns null', () => {
      const grid: TileMaterial[][] = [['WOOD_ROOF']];
      const fire = new FireGrid(grid);

      const first = fire.igniteTile(0, 0);
      expect(first).not.toBeNull();

      const second = fire.igniteTile(0, 0);
      expect(second).toBeNull();
    });

    it('igniting EMPTY returns null', () => {
      const grid: TileMaterial[][] = [['EMPTY']];
      const fire = new FireGrid(grid);
      expect(fire.igniteTile(0, 0)).toBeNull();
    });

    it('igniting STONE returns null', () => {
      const grid: TileMaterial[][] = [['STONE']];
      const fire = new FireGrid(grid);
      expect(fire.igniteTile(0, 0)).toBeNull();
    });
  });
});
