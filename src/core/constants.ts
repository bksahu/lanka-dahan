// src/core/constants.ts — Tuning constants for Lanka Dahan
// All coordinates assume 320x180 canvas, 16x16 tiles, 60 Hz timestep

export const TILE_SIZE = 16;
export const FIXED_DT = 1 / 60;
export const FIRE_TICK_DT = 0.10;

// Player collision box (centered inside 32x32 sprite)
export const PLAYER_WIDTH = 12;
export const PLAYER_HEIGHT = 22;

// Movement
export const RUN_SPEED = 110;        // px/s
export const GRAVITY = 680;          // px/s^2
export const MAX_FALL_SPEED = 320;   // px/s
export const JUMP_VELOCITY = -245;   // px/s (upward)
export const JUMP_CUT_MULTIPLIER = 0.5;

// Grace timers
export const COYOTE_TIME = 0.10;     // seconds
export const JUMP_BUFFER_TIME = 0.10;

// Wall mechanics
export const WALL_SLIDE_MAX_VY = 45;  // px/s
export const WALL_JUMP_VX = 130;      // px/s
export const WALL_JUMP_VY = -225;     // px/s

// Tail Whip timing
export const WHIP_DURATION = 0.24;      // total duration
export const WHIP_ACTIVE_START = 0.06;  // startup ends, active begins
export const WHIP_ACTIVE_END = 0.16;    // active ends, recovery begins
export const WHIP_COOLDOWN = 0.18;      // cooldown after whip

// Damage
export const HURT_DURATION = 0.30;
export const INVULN_DURATION = 1.00;

// Whip hitbox dimensions
export const WHIP_WIDTH = 24;
export const WHIP_HEIGHT = 14;

// Player starting health
export const MAX_HEALTH = 3;

// Win condition
export const WIN_BURN_PERCENT = 60;

// Sacred zone penalty limit
export const MAX_SACRED_STRIKES = 3;

// Level dimensions
export const LEVEL_COLS = 160;
export const LEVEL_ROWS = 14;
export const WORLD_WIDTH = LEVEL_COLS * TILE_SIZE;  // 2560
export const WORLD_HEIGHT = LEVEL_ROWS * TILE_SIZE; // 224

// Canvas
export const CANVAS_WIDTH = 320;
export const CANVAS_HEIGHT = 180;

// Knockback on hurt
export const HURT_KNOCKBACK_VX = 90;
export const HURT_KNOCKBACK_VY = -120;

// Fire spread delay (must burn this long before spreading to neighbors)
export const FIRE_SPREAD_DELAY = 0.40;

// Material timings
export const WOOD_ROOF_IGNITE_DELAY = 0.35;
export const WOOD_ROOF_BURN_DURATION = 2.50;
export const BANNER_IGNITE_DELAY = 0.15;
export const BANNER_BURN_DURATION = 1.20;

// Enemy constants
export const GUARD_PATROL_SPEED = 40;    // px/s
export const GUARD_ATTACK_RANGE = 20;    // px
export const GUARD_DETECT_RANGE = 80;    // px
export const ARCHER_DETECT_RANGE = 140;  // px
export const ARROW_SPEED = 160;          // px/s
export const ARROW_REFLECT_MULTIPLIER = 1.4;
export const GUARD_HEALTH = 2;
export const ARCHER_HEALTH = 1;
