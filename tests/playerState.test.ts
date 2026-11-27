// tests/playerState.test.ts — Hanuman movement state machine tests
import { describe, it, expect, beforeEach } from 'vitest';
import { createPlayer, updatePlayer, getWhipHitbox, damagePlayer } from '../src/core/playerState';
import {
  FIXED_DT,
  COYOTE_TIME,
  JUMP_VELOCITY,
  JUMP_CUT_MULTIPLIER,
  WALL_SLIDE_MAX_VY,
  WALL_JUMP_VX,
  WHIP_DURATION,
  GRAVITY,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
} from '../src/core/constants';
import type { InputSnapshot, PlayerContext } from '../src/core/types';

function noInput(): InputSnapshot {
  return { left: false, right: false, jumpPressed: false, jumpHeld: false, whipPressed: false };
}

function jumpInput(): InputSnapshot {
  return { left: false, right: false, jumpPressed: true, jumpHeld: true, whipPressed: false };
}

function rightInput(): InputSnapshot {
  return { left: false, right: true, jumpPressed: false, jumpHeld: false, whipPressed: false };
}

function whipInput(): InputSnapshot {
  return { left: false, right: false, jumpPressed: false, jumpHeld: false, whipPressed: true };
}

// Simple collision resolver: flat ground at y = 192 (row 12 * 16)
const GROUND_Y = 12 * 16;

function flatGroundResolver(px: number, py: number, vx: number, vy: number) {
  let grounded = false;
  let y = py;
  let outVy = vy;

  if (py + PLAYER_HEIGHT >= GROUND_Y && vy >= 0) {
    y = GROUND_Y - PLAYER_HEIGHT;
    outVy = 0;
    grounded = true;
  }

  return { x: px, y, vx, vy: outVy, grounded, touchingWall: 0 as 0 | 1 | -1 };
}

// Wall on right side at x = 160
function wallRightResolver(px: number, py: number, vx: number, vy: number) {
  let grounded = false;
  let y = py;
  let x = px;
  let outVx = vx;
  let outVy = vy;
  let touchingWall: 0 | 1 | -1 = 0;

  if (py + PLAYER_HEIGHT >= GROUND_Y && vy >= 0) {
    y = GROUND_Y - PLAYER_HEIGHT;
    outVy = 0;
    grounded = true;
  }

  if (px + PLAYER_WIDTH >= 160 && vx > 0) {
    x = 160 - PLAYER_WIDTH;
    outVx = 0;
    touchingWall = 1;
  }

  return { x, y, vx: outVx, vy: outVy, grounded, touchingWall };
}

function noCollisionResolver(px: number, py: number, vx: number, vy: number) {
  return { x: px, y: py, vx, vy, grounded: false, touchingWall: 0 as 0 | 1 | -1 };
}

describe('Player State Machine', () => {
  let player: PlayerContext;

  beforeEach(() => {
    player = createPlayer(80, GROUND_Y - PLAYER_HEIGHT);
    // Initialize grounded
    updatePlayer(player, noInput(), FIXED_DT, flatGroundResolver);
  });

  describe('Coyote Time', () => {
    it('allows jump at 0.08s after walking off ledge', () => {
      expect(player.grounded).toBe(true);
      expect(player.state).toBe('IDLE');

      // Walk right off a ledge (use noCollision so player becomes airborne)
      updatePlayer(player, rightInput(), FIXED_DT, noCollisionResolver);
      player.grounded = false;
      player.state = 'FALL';
      player.coyoteTimer = COYOTE_TIME;

      // Simulate ~0.08s (5 frames at 60fps)
      for (let i = 0; i < 4; i++) {
        updatePlayer(player, noInput(), FIXED_DT, noCollisionResolver);
      }

      expect(player.coyoteTimer).toBeGreaterThan(0);

      // Now press jump - should work (coyote time still active)
      updatePlayer(player, jumpInput(), FIXED_DT, noCollisionResolver);
      expect(player.state).toBe('JUMP');
      expect(player.vy).toBeCloseTo(JUMP_VELOCITY + GRAVITY * FIXED_DT, 2);
    });

    it('does NOT allow jump at 0.12s after walking off ledge', () => {
      player.grounded = false;
      player.state = 'FALL';
      player.coyoteTimer = COYOTE_TIME;

      // Simulate ~0.12s (8 frames at 60fps = 0.133s > COYOTE_TIME)
      for (let i = 0; i < 8; i++) {
        updatePlayer(player, noInput(), FIXED_DT, noCollisionResolver);
      }

      expect(player.coyoteTimer).toBe(0);

      // Now press jump - should NOT work
      updatePlayer(player, jumpInput(), FIXED_DT, noCollisionResolver);
      expect(player.state).toBe('FALL');
    });
  });

  describe('Jump Buffer', () => {
    it('pressing jump 0.08s before landing triggers immediate JUMP on landing', () => {
      // Put player 10px above ground falling at 150 px/s (lands in ~0.065s < 0.10s buffer)
      player.y = GROUND_Y - PLAYER_HEIGHT - 10;
      player.vy = 150;
      player.grounded = false;
      player.state = 'FALL';
      player.coyoteTimer = 0;

      // Press jump while still in air
      updatePlayer(player, jumpInput(), FIXED_DT, flatGroundResolver);
      expect(player.jumpBufferTimer).toBeGreaterThan(0);
      expect(player.state).toBe('FALL'); // still falling

      // Advance ~0.08s (5 frames) until landing
      for (let i = 0; i < 5; i++) {
        updatePlayer(player, { ...noInput(), jumpHeld: true }, FIXED_DT, flatGroundResolver);
      }

      // After landing with buffer, should be in JUMP
      expect(player.state).toBe('JUMP');
    });
  });

  describe('Variable Jump Height', () => {
    it('releasing jumpHeld while ascending applies JUMP_CUT_MULTIPLIER', () => {
      // Ground player first
      updatePlayer(player, noInput(), FIXED_DT, flatGroundResolver);
      expect(player.grounded).toBe(true);

      // Jump
      updatePlayer(player, jumpInput(), FIXED_DT, flatGroundResolver);
      expect(player.state).toBe('JUMP');
      const vyAfterJump = player.vy;
      expect(vyAfterJump).toBe(JUMP_VELOCITY);

      // One frame ascending with jumpHeld
      updatePlayer(player, { ...noInput(), jumpHeld: true }, FIXED_DT, noCollisionResolver);
      const vyBeforeCut = player.vy;
      expect(vyBeforeCut).toBeLessThan(0); // still ascending

      // Release jump (jumpHeld = false) while ascending
      updatePlayer(player, noInput(), FIXED_DT, noCollisionResolver);
      // vy should have been multiplied by JUMP_CUT_MULTIPLIER
      expect(player.vy).toBeCloseTo(vyBeforeCut * JUMP_CUT_MULTIPLIER + GRAVITY * FIXED_DT, 0);
    });
  });

  describe('Wall Slide & Wall Jump', () => {
    it('descending against wall clamps vy <= WALL_SLIDE_MAX_VY', () => {
      // Position player near right wall, in air
      player.x = 160 - PLAYER_WIDTH;
      player.y = 50;
      player.vy = 200;
      player.grounded = false;
      player.state = 'FALL';
      player.coyoteTimer = 0;

      // Press right to touch wall
      for (let i = 0; i < 10; i++) {
        updatePlayer(player, rightInput(), FIXED_DT, wallRightResolver);
      }

      expect(player.state).toBe('WALL_SLIDE');
      expect(player.vy).toBeLessThanOrEqual(WALL_SLIDE_MAX_VY);
    });

    it('pressing jump during wall slide launches away with flipped facing', () => {
      // Setup wall slide
      player.x = 160 - PLAYER_WIDTH;
      player.y = 50;
      player.vy = 50;
      player.grounded = false;
      player.state = 'WALL_SLIDE';
      player.touchingWall = 1;
      player.facing = 1;
      player.coyoteTimer = 0;

      // Press jump
      updatePlayer(player, { ...jumpInput(), right: true }, FIXED_DT, wallRightResolver);

      expect(player.state).toBe('JUMP');
      expect(player.facing).toBe(-1); // flipped
      expect(player.vx).toBe(-WALL_JUMP_VX); // pushed away from wall
    });
  });

  describe('Tail Whip Active Window', () => {
    it('getWhipHitbox is null at t=0.04s', () => {
      player.state = 'TAIL_WHIP';
      player.stateTimer = 0.04;
      expect(getWhipHitbox(player)).toBeNull();
    });

    it('getWhipHitbox is non-null at t=0.10s', () => {
      player.state = 'TAIL_WHIP';
      player.stateTimer = 0.10;
      player.facing = 1;
      const box = getWhipHitbox(player);
      expect(box).not.toBeNull();
      expect(box!.w).toBeGreaterThan(0);
      expect(box!.h).toBeGreaterThan(0);
    });

    it('getWhipHitbox is null at t=0.20s', () => {
      player.state = 'TAIL_WHIP';
      player.stateTimer = 0.20;
      expect(getWhipHitbox(player)).toBeNull();
    });

    it('transitions through startup->active->recovery->cooldown', () => {
      // Start whip from idle
      updatePlayer(player, whipInput(), FIXED_DT, flatGroundResolver);
      expect(player.state).toBe('TAIL_WHIP');
      expect(player.whipSwingId).toBe(1);

      // Advance through whip duration
      const totalFrames = Math.ceil(WHIP_DURATION / FIXED_DT);
      for (let i = 0; i < totalFrames + 1; i++) {
        updatePlayer(player, noInput(), FIXED_DT, flatGroundResolver);
      }

      // Should be back to IDLE with cooldown
      expect(player.state).toBe('IDLE');
      expect(player.whipCooldown).toBeGreaterThan(0);
    });
  });

  describe('Damage & Invulnerability', () => {
    it('damagePlayer reduces health and applies knockback', () => {
      player.health = 3;
      damagePlayer(player);
      expect(player.health).toBe(2);
      expect(player.state).toBe('HURT');
      expect(player.invulnTimer).toBeGreaterThan(0);
    });

    it('does not damage during invulnerability', () => {
      player.health = 3;
      player.invulnTimer = 0.5;
      damagePlayer(player);
      expect(player.health).toBe(3); // no damage
    });
  });
});
