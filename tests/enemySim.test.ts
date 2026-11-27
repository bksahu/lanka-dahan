// tests/enemySim.test.ts — Rakshasa AI tests
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEnemy,
  updateGuard,
  damageEnemy,
  reflectArrow,
  rectsOverlap,
  resetEnemyIds,
} from '../src/core/enemySim';
import { createPlayer } from '../src/core/playerState';
import type { Arrow, EnemySpawn } from '../src/core/types';
import { FIXED_DT, TILE_SIZE, ARROW_REFLECT_MULTIPLIER, ARROW_SPEED } from '../src/core/constants';

function makeGuardSpawn(tx: number, ty: number): EnemySpawn {
  return { type: 'GUARD', tx, ty, patrolLeftTx: tx - 3, patrolRightTx: tx + 3 };
}

// Simple solid ground check
function solidBelow(_tx: number, ty: number): boolean {
  return ty >= 12; // ground at row 12
}

describe('Enemy Simulation', () => {
  beforeEach(() => {
    resetEnemyIds();
  });

  describe('Guard Patrol', () => {
    it('reverses direction at patrol boundaries', () => {
      const spawn = makeGuardSpawn(10, 11);
      const guard = createEnemy(spawn);
      const player = createPlayer(200, 100); // far away

      // Run many steps to hit the right boundary
      for (let i = 0; i < 300; i++) {
        updateGuard(guard, player, FIXED_DT, solidBelow, spawn.patrolLeftTx * TILE_SIZE, spawn.patrolRightTx * TILE_SIZE);
      }

      // Guard should have reversed at some point
      // Check that guard is within patrol bounds
      expect(guard.x).toBeGreaterThanOrEqual(spawn.patrolLeftTx * TILE_SIZE - TILE_SIZE);
      expect(guard.x).toBeLessThanOrEqual(spawn.patrolRightTx * TILE_SIZE + TILE_SIZE);
    });

    it('reverses at walls', () => {
      const spawn = makeGuardSpawn(10, 11);
      const guard = createEnemy(spawn);
      guard.facing = 1;
      const player = createPlayer(200, 100);

      // Wall at tx=12
      function solidWithWall(tx: number, ty: number): boolean {
        if (ty >= 12) return true;
        if (tx === 12 && ty < 12) return true;
        return false;
      }

      for (let i = 0; i < 200; i++) {
        updateGuard(guard, player, FIXED_DT, solidWithWall, spawn.patrolLeftTx * TILE_SIZE, spawn.patrolRightTx * TILE_SIZE);
      }

      // Guard should not be past the wall
      expect(guard.x).toBeLessThan(12 * TILE_SIZE);
    });
  });

  describe('Arrow Reflection', () => {
    it('active Tail Whip reflects a hostile arrow', () => {
      const arrow: Arrow = {
        id: 1,
        x: 100,
        y: 100,
        vx: -ARROW_SPEED,
        vy: 0,
        friendly: false,
        reflectedBySwingId: -1,
      };

      reflectArrow(arrow, 1);

      expect(arrow.friendly).toBe(true);
      expect(arrow.vx).toBe(ARROW_SPEED * ARROW_REFLECT_MULTIPLIER);
      expect(arrow.reflectedBySwingId).toBe(1);
    });
  });

  describe('Damage', () => {
    it('damages guard once per whipSwingId', () => {
      const spawn = makeGuardSpawn(10, 11);
      const guard = createEnemy(spawn);
      const initialHealth = guard.health;

      const hit1 = damageEnemy(guard, 1);
      expect(hit1).toBe(true);
      expect(guard.health).toBe(initialHealth - 1);
      expect(guard.state).toBe('HURT');

      // Same swing ID should not damage again
      // Reset state so we can try
      guard.state = 'PATROL';
      const hit2 = damageEnemy(guard, 1);
      expect(hit2).toBe(false);
      expect(guard.health).toBe(initialHealth - 1); // unchanged

      // Different swing ID should damage
      guard.state = 'PATROL';
      const hit3 = damageEnemy(guard, 2);
      expect(hit3).toBe(true);
      expect(guard.health).toBe(initialHealth - 2);
    });
  });

  describe('Rect Overlap', () => {
    it('detects overlapping rectangles', () => {
      expect(rectsOverlap(
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 5, y: 5, w: 10, h: 10 },
      )).toBe(true);
    });

    it('detects non-overlapping rectangles', () => {
      expect(rectsOverlap(
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 20, y: 20, w: 10, h: 10 },
      )).toBe(false);
    });
  });
});
