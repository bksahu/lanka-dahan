// src/core/enemySim.ts — Rakshasa enemy AI simulation
// Pure simulation: MUST NOT import phaser, window, document, or any browser/DOM API

import {
  type Enemy,
  type Arrow,
  type PlayerContext,
  type Rect,
  type EnemySpawn,
} from './types';
import {
  TILE_SIZE,
  GUARD_PATROL_SPEED,
  GUARD_DETECT_RANGE,
  GUARD_ATTACK_RANGE,
  ARCHER_DETECT_RANGE,
  ARROW_SPEED,
  ARROW_REFLECT_MULTIPLIER,
  GUARD_HEALTH,
  ARCHER_HEALTH,
  PLAYER_WIDTH,
} from './constants';

let nextEnemyId = 1;
let nextArrowId = 1;

export function resetEnemyIds(): void {
  nextEnemyId = 1;
  nextArrowId = 1;
}

export function createEnemy(spawn: EnemySpawn): Enemy {
  return {
    id: nextEnemyId++,
    type: spawn.type,
    x: spawn.tx * TILE_SIZE,
    y: spawn.ty * TILE_SIZE - (spawn.type === 'GUARD' ? 16 : 16), // Enemies are 32px tall, stand on tile
    vx: 0,
    vy: 0,
    facing: 1,
    state: spawn.type === 'GUARD' ? 'PATROL' : 'IDLE',
    stateTimer: 0,
    health: spawn.type === 'GUARD' ? GUARD_HEALTH : ARCHER_HEALTH,
    attackCooldown: 0,
    lastHitBySwingId: -1,
  };
}

export function createArrow(enemy: Enemy): Arrow {
  return {
    id: nextArrowId++,
    x: enemy.x + (enemy.facing === 1 ? 24 : -8),
    y: enemy.y + 10,
    vx: enemy.facing * ARROW_SPEED,
    vy: 0,
    friendly: false,
    reflectedBySwingId: -1,
  };
}

function distToPlayer(enemy: Enemy, player: PlayerContext): number {
  const ex = enemy.x + 16; // center of enemy
  const px = player.x + PLAYER_WIDTH / 2;
  return Math.abs(ex - px);
}

function facingPlayer(enemy: Enemy, player: PlayerContext): 1 | -1 {
  const ex = enemy.x + 16;
  const px = player.x + PLAYER_WIDTH / 2;
  return px >= ex ? 1 : -1;
}

export function getEnemyHitbox(enemy: Enemy): Rect {
  // Enemies use a slightly smaller collision box inside 32x32
  return {
    x: enemy.x + 6,
    y: enemy.y + 4,
    w: 20,
    h: 28,
  };
}

export function updateGuard(
  enemy: Enemy,
  player: PlayerContext,
  dt: number,
  isSolid: (tx: number, ty: number) => boolean,
  patrolLeftX: number,
  patrolRightX: number,
): void {
  if (enemy.state === 'DEAD') return;

  enemy.stateTimer += dt;

  if (enemy.state === 'HURT') {
    if (enemy.stateTimer >= 0.3) {
      if (enemy.health <= 0) {
        enemy.state = 'DEAD';
      } else {
        enemy.state = 'PATROL';
        enemy.stateTimer = 0;
      }
    }
    return;
  }

  const dist = distToPlayer(enemy, player);

  if (enemy.state === 'ATTACK') {
    if (enemy.stateTimer >= 0.5) {
      enemy.state = 'PATROL';
      enemy.stateTimer = 0;
      enemy.attackCooldown = 1.0;
    }
    return;
  }

  // Patrol
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

  if (dist < GUARD_ATTACK_RANGE && enemy.attackCooldown <= 0) {
    enemy.state = 'ATTACK';
    enemy.stateTimer = 0;
    enemy.facing = facingPlayer(enemy, player);
    enemy.vx = 0;
    return;
  }

  if (dist < GUARD_DETECT_RANGE) {
    enemy.facing = facingPlayer(enemy, player);
  }

  // Move in patrol
  enemy.vx = enemy.facing * GUARD_PATROL_SPEED;
  enemy.x += enemy.vx * dt;

  // Check patrol boundaries and ledge/wall detection
  const feetTy = Math.floor((enemy.y + 32) / TILE_SIZE);
  const frontTx = Math.floor((enemy.x + (enemy.facing === 1 ? 28 : 4)) / TILE_SIZE);

  // Wall ahead
  const wallAhead = isSolid(frontTx, Math.floor((enemy.y + 16) / TILE_SIZE));

  // Ledge ahead (no ground in front)
  const groundAhead = isSolid(frontTx, feetTy);

  // Patrol bounds
  const atLeftBound = enemy.x <= patrolLeftX;
  const atRightBound = enemy.x >= patrolRightX;

  if (wallAhead || !groundAhead || (enemy.facing === -1 && atLeftBound) || (enemy.facing === 1 && atRightBound)) {
    enemy.facing = (enemy.facing * -1) as 1 | -1;
    enemy.vx = 0;
  }
}

export function updateArcher(
  enemy: Enemy,
  player: PlayerContext,
  dt: number,
  _arrows: Arrow[],
): Arrow | null {
  if (enemy.state === 'DEAD') return null;

  enemy.stateTimer += dt;
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

  if (enemy.state === 'HURT') {
    if (enemy.stateTimer >= 0.3) {
      if (enemy.health <= 0) {
        enemy.state = 'DEAD';
      } else {
        enemy.state = 'IDLE';
        enemy.stateTimer = 0;
      }
    }
    return null;
  }

  const dist = distToPlayer(enemy, player);
  enemy.facing = facingPlayer(enemy, player);

  if (dist < ARCHER_DETECT_RANGE && enemy.attackCooldown <= 0) {
    if (enemy.state === 'IDLE') {
      enemy.state = 'ATTACK';
      enemy.stateTimer = 0;
    }
  }

  if (enemy.state === 'ATTACK') {
    // Frame 0-1: aim (0.3s), Frame 2: shoot
    if (enemy.stateTimer >= 0.3 && enemy.stateTimer < 0.35) {
      // Shoot
      enemy.attackCooldown = 2.0;
      enemy.state = 'IDLE';
      enemy.stateTimer = 0;
      return createArrow(enemy);
    }
  }

  return null;
}

export function updateArrows(
  arrows: Arrow[],
  dt: number,
  isSolid: (tx: number, ty: number) => boolean,
  worldWidth: number,
): Arrow[] {
  return arrows.filter((arrow) => {
    arrow.x += arrow.vx * dt;
    arrow.y += arrow.vy * dt;

    // Remove if out of bounds
    if (arrow.x < -32 || arrow.x > worldWidth + 32 || arrow.y < -32 || arrow.y > 400) {
      return false;
    }

    // Remove if hit solid tile
    const tx = Math.floor(arrow.x / TILE_SIZE);
    const ty = Math.floor(arrow.y / TILE_SIZE);
    if (isSolid(tx, ty)) {
      return false;
    }

    return true;
  });
}

export function reflectArrow(arrow: Arrow, whipSwingId: number): void {
  arrow.vx = -arrow.vx * ARROW_REFLECT_MULTIPLIER;
  arrow.friendly = true;
  arrow.reflectedBySwingId = whipSwingId;
}

export function damageEnemy(enemy: Enemy, whipSwingId: number): boolean {
  if (enemy.state === 'DEAD' || enemy.state === 'HURT') return false;
  if (enemy.lastHitBySwingId === whipSwingId) return false;

  enemy.lastHitBySwingId = whipSwingId;
  enemy.health -= 1;
  enemy.state = 'HURT';
  enemy.stateTimer = 0;
  return true;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function getArrowHitbox(arrow: Arrow): Rect {
  return { x: arrow.x, y: arrow.y, w: 16, h: 4 };
}
