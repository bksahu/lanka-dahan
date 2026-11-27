// src/core/playerState.ts — Hanuman movement state machine
// Pure simulation: MUST NOT import phaser, window, document, or any browser/DOM API

import {
  type PlayerContext,
  type PlayerState,
  type InputSnapshot,
  type Rect,
} from './types';
import {
  GRAVITY,
  MAX_FALL_SPEED,
  RUN_SPEED,
  JUMP_VELOCITY,
  JUMP_CUT_MULTIPLIER,
  COYOTE_TIME,
  JUMP_BUFFER_TIME,
  WALL_SLIDE_MAX_VY,
  WALL_JUMP_VX,
  WALL_JUMP_VY,
  WHIP_DURATION,
  WHIP_ACTIVE_START,
  WHIP_ACTIVE_END,
  WHIP_COOLDOWN,
  WHIP_WIDTH,
  WHIP_HEIGHT,
  HURT_DURATION,
  INVULN_DURATION,
  MAX_HEALTH,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  HURT_KNOCKBACK_VX,
  HURT_KNOCKBACK_VY,
} from './constants';

export function createPlayer(x: number, y: number): PlayerContext {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    facing: 1,
    state: 'IDLE',
    stateTimer: 0,
    grounded: false,
    touchingWall: 0,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    whipCooldown: 0,
    whipSwingId: 0,
    health: MAX_HEALTH,
    invulnTimer: 0,
    sacredStrikes: 0,
  };
}

function changeState(player: PlayerContext, newState: PlayerState): void {
  player.state = newState;
  player.stateTimer = 0;
}

export function damagePlayer(player: PlayerContext): void {
  if (player.invulnTimer > 0 || player.state === 'HURT') return;
  player.health -= 1;
  player.vx = -player.facing * HURT_KNOCKBACK_VX;
  player.vy = HURT_KNOCKBACK_VY;
  player.invulnTimer = INVULN_DURATION;
  changeState(player, 'HURT');
}

export function getWhipHitbox(player: PlayerContext): Rect | null {
  if (player.state !== 'TAIL_WHIP') return null;
  if (player.stateTimer < WHIP_ACTIVE_START || player.stateTimer >= WHIP_ACTIVE_END) return null;

  const w = WHIP_WIDTH;
  const h = WHIP_HEIGHT;

  // Whip hitbox relative to player collision box: covers torso level down to 2px into floor
  const hx = player.facing === 1
    ? player.x + PLAYER_WIDTH / 2 + 2
    : player.x + PLAYER_WIDTH / 2 - 2 - w;
  const hy = player.y + PLAYER_HEIGHT - h + 2;

  return { x: hx, y: hy, w, h };
}

export function updatePlayer(
  player: PlayerContext,
  input: InputSnapshot,
  dt: number,
  resolveCollision: (px: number, py: number, vx: number, vy: number) => {
    x: number; y: number; vx: number; vy: number;
    grounded: boolean; touchingWall: 0 | 1 | -1;
  },
): void {
  // Decrement timers
  player.stateTimer += dt;
  player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  player.whipCooldown = Math.max(0, player.whipCooldown - dt);

  // Buffer jump input
  if (input.jumpPressed) {
    player.jumpBufferTimer = JUMP_BUFFER_TIME;
  } else {
    player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt);
  }

  // Update coyote timer
  if (player.grounded) {
    player.coyoteTimer = COYOTE_TIME;
  } else if (player.state !== 'JUMP' && player.state !== 'WALL_SLIDE') {
    player.coyoteTimer = Math.max(0, player.coyoteTimer - dt);
  }

  // ─── State machine ──────────────────────────────────
  switch (player.state) {
    case 'HURT':
      stepHurt(player, input, dt);
      break;
    case 'TAIL_WHIP':
      stepTailWhip(player, input, dt);
      break;
    case 'IDLE':
      stepIdle(player, input, dt);
      break;
    case 'RUN':
      stepRun(player, input, dt);
      break;
    case 'JUMP':
      stepJump(player, input, dt);
      break;
    case 'FALL':
      stepFall(player, input, dt);
      break;
    case 'WALL_SLIDE':
      stepWallSlide(player, input, dt);
      break;
  }

  // Apply gravity (not during HURT knockback start - already handled)
  if (player.state !== 'HURT' || player.stateTimer > 0.05) {
    if (!player.grounded) {
      player.vy += GRAVITY * dt;
      if (player.vy > MAX_FALL_SPEED) {
        player.vy = MAX_FALL_SPEED;
      }
    }
  }

  // Wall slide clamp
  if (player.state === 'WALL_SLIDE' && player.vy > WALL_SLIDE_MAX_VY) {
    player.vy = WALL_SLIDE_MAX_VY;
  }

  // Move and resolve collisions
  const newX = player.x + player.vx * dt;
  const newY = player.y + player.vy * dt;
  const resolved = resolveCollision(newX, newY, player.vx, player.vy);

  player.x = resolved.x;
  player.y = resolved.y;
  player.vx = resolved.vx;
  player.vy = resolved.vy;
  player.grounded = resolved.grounded;
  player.touchingWall = resolved.touchingWall;

  // Landing transitions
  if (player.grounded && player.vy >= 0) {
    player.vy = 0;
    if (player.state === 'FALL' || player.state === 'JUMP') {
      // Check buffered jump
      if (player.jumpBufferTimer > 0) {
        doJump(player);
      } else {
        const moving = input.left !== input.right;
        changeState(player, moving ? 'RUN' : 'IDLE');
      }
    }
  }
}

function tryWhip(player: PlayerContext, input: InputSnapshot): boolean {
  if (input.whipPressed && player.whipCooldown <= 0) {
    changeState(player, 'TAIL_WHIP');
    player.whipSwingId += 1;
    return true;
  }
  return false;
}

function doJump(player: PlayerContext): void {
  player.vy = JUMP_VELOCITY;
  player.coyoteTimer = 0;
  player.jumpBufferTimer = 0;
  changeState(player, 'JUMP');
}

function tryJump(player: PlayerContext): boolean {
  if (player.jumpBufferTimer > 0 && player.coyoteTimer > 0) {
    doJump(player);
    return true;
  }
  return false;
}

function applyRunInput(player: PlayerContext, input: InputSnapshot): void {
  if (input.left && !input.right) {
    player.facing = -1;
    player.vx = -RUN_SPEED;
  } else if (input.right && !input.left) {
    player.facing = 1;
    player.vx = RUN_SPEED;
  } else {
    player.vx = 0;
  }
}

function stepIdle(player: PlayerContext, input: InputSnapshot, _dt: number): void {
  player.vx = 0;

  if (tryWhip(player, input)) return;
  if (tryJump(player)) return;

  if (!player.grounded) {
    changeState(player, 'FALL');
    return;
  }

  if (input.left !== input.right) {
    player.facing = input.right ? 1 : -1;
    player.vx = player.facing * RUN_SPEED;
    changeState(player, 'RUN');
  }
}

function stepRun(player: PlayerContext, input: InputSnapshot, _dt: number): void {
  if (tryWhip(player, input)) return;
  if (tryJump(player)) return;

  if (!player.grounded) {
    changeState(player, 'FALL');
    return;
  }

  if (input.left === input.right) {
    player.vx = 0;
    changeState(player, 'IDLE');
    return;
  }

  player.facing = input.right ? 1 : -1;
  player.vx = player.facing * RUN_SPEED;
}

function stepJump(player: PlayerContext, input: InputSnapshot, _dt: number): void {
  if (tryWhip(player, input)) return;

  // Variable jump height
  if (!input.jumpHeld && player.vy < 0) {
    player.vy *= JUMP_CUT_MULTIPLIER;
  }

  applyRunInput(player, input);

  if (player.vy >= 0) {
    changeState(player, 'FALL');
  }
}

function stepFall(player: PlayerContext, input: InputSnapshot, _dt: number): void {
  if (tryWhip(player, input)) return;
  if (tryJump(player)) return;

  applyRunInput(player, input);

  // Check wall slide
  if (
    player.touchingWall !== 0 &&
    !player.grounded &&
    ((player.touchingWall === 1 && input.right) ||
     (player.touchingWall === -1 && input.left))
  ) {
    changeState(player, 'WALL_SLIDE');
    return;
  }
}

function stepWallSlide(player: PlayerContext, input: InputSnapshot, _dt: number): void {
  // Wall jump
  if (input.jumpPressed) {
    player.vx = -player.touchingWall * WALL_JUMP_VX;
    player.vy = WALL_JUMP_VY;
    player.facing = -player.touchingWall as 1 | -1;
    changeState(player, 'JUMP');
    player.coyoteTimer = 0;
    player.jumpBufferTimer = 0;
    return;
  }

  if (tryWhip(player, input)) return;

  // Exit wall slide
  if (player.grounded) {
    changeState(player, 'IDLE');
    return;
  }

  if (player.touchingWall === 0) {
    changeState(player, 'FALL');
    return;
  }

  // Check if still pressing toward wall
  const pressingToward =
    (player.touchingWall === 1 && input.right) ||
    (player.touchingWall === -1 && input.left);

  if (!pressingToward) {
    changeState(player, 'FALL');
    return;
  }

  // Stay on wall
  player.vx = 0;
}

function stepTailWhip(player: PlayerContext, _input: InputSnapshot, _dt: number): void {
  // Keep horizontal momentum but don't allow direction changes
  if (player.stateTimer >= WHIP_DURATION) {
    player.whipCooldown = WHIP_COOLDOWN;
    changeState(player, player.grounded ? 'IDLE' : 'FALL');
  }
}

function stepHurt(player: PlayerContext, _input: InputSnapshot, _dt: number): void {
  if (player.stateTimer >= HURT_DURATION) {
    changeState(player, player.grounded ? 'IDLE' : 'FALL');
  }
}
