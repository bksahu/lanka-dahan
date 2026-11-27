// src/core/levelSim.ts — Level simulation orchestrator
// Pure simulation: MUST NOT import phaser, window, document, or any browser/DOM API

import {
  type InputSnapshot,
  type PlayerContext,
  type Enemy,
  type Arrow,
  type LevelDef,
  type LevelSnapshot,
  type GameStatus,
  type LoseReason,
  type SimEvent,
  type Rect,
} from './types';
import {
  TILE_SIZE,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  WIN_BURN_PERCENT,
  MAX_SACRED_STRIKES,
  FIRE_TICK_DT,
  WORLD_HEIGHT,
} from './constants';
import { createPlayer, updatePlayer, getWhipHitbox, damagePlayer } from './playerState';
import { FireGrid } from './fireGrid';
import {
  createEnemy,
  updateGuard,
  updateArcher,
  updateArrows,
  getEnemyHitbox,
  getArrowHitbox,
  damageEnemy,
  reflectArrow,
  rectsOverlap,
  resetEnemyIds,
} from './enemySim';

export class LevelSim {
  player: PlayerContext;
  enemies: Enemy[];
  arrows: Arrow[];
  fireGrid: FireGrid;
  gameStatus: GameStatus;
  loseReason: LoseReason | null;
  time: number;
  private fireAccumulator: number;
  private levelDef: LevelDef;
  private events: SimEvent[];

  constructor(levelDef: LevelDef) {
    this.levelDef = levelDef;
    resetEnemyIds();
    this.fireGrid = new FireGrid(levelDef.grid);
    this.player = createPlayer(
      levelDef.playerStartTx * TILE_SIZE,
      levelDef.playerStartTy * TILE_SIZE - PLAYER_HEIGHT,
    );
    this.enemies = levelDef.enemies.map((s) => createEnemy(s));
    this.arrows = [];
    this.gameStatus = 'PLAYING';
    this.loseReason = null;
    this.time = 0;
    this.fireAccumulator = 0;
    this.events = [];
  }

  step(input: InputSnapshot, dt: number): LevelSnapshot {
    this.events = [];

    if (this.gameStatus !== 'PLAYING') {
      return this.snapshot();
    }

    this.time += dt;

    // ─── Update player ────────────────────────
    updatePlayer(this.player, input, dt, (px, py, vx, vy) =>
      this.resolvePlayerCollision(px, py, vx, vy),
    );

    // ─── Tail Whip interactions ───────────────
    const whipBox = getWhipHitbox(this.player);
    if (whipBox) {
      this.handleWhipInteractions(whipBox);
    }

    // ─── Update enemies ───────────────────────
    for (const enemy of this.enemies) {
      if (enemy.type === 'GUARD') {
        const patrolLeft = this.getEnemyPatrolLeft(enemy);
        const patrolRight = this.getEnemyPatrolRight(enemy);
        updateGuard(
          enemy,
          this.player,
          dt,
          (tx, ty) => this.fireGrid.isSolid(tx, ty),
          patrolLeft,
          patrolRight,
        );
      } else {
        const newArrow = updateArcher(enemy, this.player, dt, this.arrows);
        if (newArrow) {
          this.arrows.push(newArrow);
        }
      }
    }

    // ─── Update arrows ────────────────────────
    this.arrows = updateArrows(
      this.arrows,
      dt,
      (tx, ty) => this.fireGrid.isSolid(tx, ty),
      this.levelDef.cols * TILE_SIZE,
    );

    // ─── Arrow-player collisions ──────────────
    this.checkArrowPlayerCollisions();

    // ─── Arrow-enemy collisions (reflected) ───
    this.checkArrowEnemyCollisions();

    // ─── Enemy-player contact damage ──────────
    this.checkEnemyPlayerCollisions();

    // ─── Fire tick ────────────────────────────
    this.fireAccumulator += dt;
    while (this.fireAccumulator >= FIRE_TICK_DT) {
      this.fireAccumulator -= FIRE_TICK_DT;
      const fireEvents = this.fireGrid.step(FIRE_TICK_DT);
      for (const e of fireEvents) {
        this.events.push({ ...e });
      }
    }

    // ─── Win/Lose checks ──────────────────────
    this.checkWinLose();

    return this.snapshot();
  }

  private getEnemyPatrolLeft(enemy: Enemy): number {
    const spawnDef = this.levelDef.enemies.find((s) => {
      const sx = s.tx * TILE_SIZE;
      return Math.abs(sx - enemy.x) < TILE_SIZE * 20; // rough match
    });
    return spawnDef ? spawnDef.patrolLeftTx * TILE_SIZE : enemy.x - 48;
  }

  private getEnemyPatrolRight(enemy: Enemy): number {
    const spawnDef = this.levelDef.enemies.find((s) => {
      const sx = s.tx * TILE_SIZE;
      return Math.abs(sx - enemy.x) < TILE_SIZE * 20;
    });
    return spawnDef ? spawnDef.patrolRightTx * TILE_SIZE : enemy.x + 48;
  }

  private handleWhipInteractions(whipBox: Rect): void {
    // Whip vs tiles
    const tileMinX = Math.floor(whipBox.x / TILE_SIZE);
    const tileMaxX = Math.floor((whipBox.x + whipBox.w - 1) / TILE_SIZE);
    const tileMinY = Math.floor(whipBox.y / TILE_SIZE);
    const tileMaxY = Math.floor((whipBox.y + whipBox.h - 1) / TILE_SIZE);

    for (let ty = tileMinY; ty <= tileMaxY; ty++) {
      for (let tx = tileMinX; tx <= tileMaxX; tx++) {
        const result = this.fireGrid.igniteTile(tx, ty);
        if (result) {
          this.events.push({ ...result });
          if (result.type === 'SACRED_STRUCK') {
            this.player.sacredStrikes++;
            this.events.push({
              type: 'SACRED_PENALTY',
              strikes: this.player.sacredStrikes,
            });
          }
        }
      }
    }

    // Whip vs enemies
    for (const enemy of this.enemies) {
      if (enemy.state === 'DEAD') continue;
      const enemyBox = getEnemyHitbox(enemy);
      if (rectsOverlap(whipBox, enemyBox)) {
        if (damageEnemy(enemy, this.player.whipSwingId)) {
          this.events.push({
            type: 'ENEMY_HIT',
            enemyId: enemy.id,
          });
        }
      }
    }

    // Whip vs arrows (reflect)
    for (const arrow of this.arrows) {
      if (arrow.friendly) continue;
      if (arrow.reflectedBySwingId === this.player.whipSwingId) continue;
      const arrowBox = getArrowHitbox(arrow);
      if (rectsOverlap(whipBox, arrowBox)) {
        reflectArrow(arrow, this.player.whipSwingId);
        this.events.push({ type: 'ARROW_REFLECTED', arrowId: arrow.id });
      }
    }
  }

  private checkArrowPlayerCollisions(): void {
    const playerBox: Rect = {
      x: this.player.x,
      y: this.player.y,
      w: PLAYER_WIDTH,
      h: PLAYER_HEIGHT,
    };

    for (const arrow of this.arrows) {
      if (arrow.friendly) continue;
      const arrowBox = getArrowHitbox(arrow);
      if (rectsOverlap(playerBox, arrowBox)) {
        damagePlayer(this.player);
        // Remove arrow
        arrow.x = -999;
        this.events.push({ type: 'PLAYER_HIT_BY_ARROW' });
      }
    }
    this.arrows = this.arrows.filter((a) => a.x > -100);
  }

  private checkArrowEnemyCollisions(): void {
    for (const arrow of this.arrows) {
      if (!arrow.friendly) continue;
      const arrowBox = getArrowHitbox(arrow);
      for (const enemy of this.enemies) {
        if (enemy.state === 'DEAD') continue;
        const enemyBox = getEnemyHitbox(enemy);
        if (rectsOverlap(arrowBox, enemyBox)) {
          damageEnemy(enemy, arrow.reflectedBySwingId);
          arrow.x = -999;
          this.events.push({ type: 'ENEMY_HIT_BY_REFLECTED_ARROW', enemyId: enemy.id });
        }
      }
    }
    this.arrows = this.arrows.filter((a) => a.x > -100);
  }

  private checkEnemyPlayerCollisions(): void {
    const playerBox: Rect = {
      x: this.player.x,
      y: this.player.y,
      w: PLAYER_WIDTH,
      h: PLAYER_HEIGHT,
    };

    for (const enemy of this.enemies) {
      if (enemy.state === 'DEAD' || enemy.state === 'HURT') continue;
      if (enemy.state === 'ATTACK' && enemy.stateTimer >= 0.15 && enemy.stateTimer < 0.35) {
        const enemyBox = getEnemyHitbox(enemy);
        if (rectsOverlap(playerBox, enemyBox)) {
          damagePlayer(this.player);
          this.events.push({ type: 'PLAYER_HIT_BY_ENEMY', enemyId: enemy.id });
        }
      }
    }
  }

  private checkWinLose(): void {
    // Abyss death
    if (this.player.y > WORLD_HEIGHT + 32) {
      this.gameStatus = 'LOSE';
      this.loseReason = 'ABYSS';
      this.events.push({ type: 'GAME_OVER', reason: 'ABYSS' });
      return;
    }

    // Health death
    if (this.player.health <= 0) {
      this.gameStatus = 'LOSE';
      this.loseReason = 'HEALTH';
      this.events.push({ type: 'GAME_OVER', reason: 'HEALTH' });
      return;
    }

    // Sacred strike limit
    if (this.player.sacredStrikes >= MAX_SACRED_STRIKES) {
      this.gameStatus = 'LOSE';
      this.loseReason = 'SACRED';
      this.events.push({ type: 'GAME_OVER', reason: 'SACRED' });
      return;
    }

    // Win condition: reach exit with enough burn
    const playerTx = Math.floor((this.player.x + PLAYER_WIDTH / 2) / TILE_SIZE);
    if (
      playerTx >= this.levelDef.exitTxMin &&
      playerTx <= this.levelDef.exitTxMax
    ) {
      const burn = this.fireGrid.getBurnProgress();
      if (burn.percent >= WIN_BURN_PERCENT) {
        this.gameStatus = 'WIN';
        this.events.push({ type: 'GAME_WIN', burnPercent: burn.percent });
      }
    }
  }

  private resolvePlayerCollision(
    newX: number,
    newY: number,
    vx: number,
    vy: number,
  ): {
    x: number;
    y: number;
    vx: number;
    vy: number;
    grounded: boolean;
    touchingWall: 0 | 1 | -1;
  } {
    let x = newX;
    let y = newY;
    let outVx = vx;
    let outVy = vy;
    let grounded = false;
    let touchingWall: 0 | 1 | -1 = 0;

    // Resolve Y first (vertical)
    const botTy = Math.floor((y + PLAYER_HEIGHT - 1) / TILE_SIZE);
    const leftTx = Math.floor(x / TILE_SIZE);
    const rightTx = Math.floor((x + PLAYER_WIDTH - 1) / TILE_SIZE);

    // Downward collision
    if (vy >= 0) {
      for (let tx = leftTx; tx <= rightTx; tx++) {
        if (this.fireGrid.isSolid(tx, botTy)) {
          y = botTy * TILE_SIZE - PLAYER_HEIGHT;
          outVy = 0;
          grounded = true;
          break;
        }
      }
    }

    // Upward collision
    if (vy < 0) {
      const newTopTy = Math.floor(y / TILE_SIZE);
      for (let tx = leftTx; tx <= rightTx; tx++) {
        if (this.fireGrid.isSolid(tx, newTopTy)) {
          y = (newTopTy + 1) * TILE_SIZE;
          outVy = 0;
          break;
        }
      }
    }

    // Recalculate after Y resolution
    const adjTopTy = Math.floor(y / TILE_SIZE);
    const adjBotTy = Math.floor((y + PLAYER_HEIGHT - 1) / TILE_SIZE);

    // Rightward collision
    if (vx > 0) {
      const newRightTx = Math.floor((x + PLAYER_WIDTH - 1) / TILE_SIZE);
      for (let ty = adjTopTy; ty <= adjBotTy; ty++) {
        if (this.fireGrid.isSolid(newRightTx, ty)) {
          x = newRightTx * TILE_SIZE - PLAYER_WIDTH;
          outVx = 0;
          touchingWall = 1;
          break;
        }
      }
    }

    // Leftward collision
    if (vx < 0) {
      const newLeftTx = Math.floor(x / TILE_SIZE);
      for (let ty = adjTopTy; ty <= adjBotTy; ty++) {
        if (this.fireGrid.isSolid(newLeftTx, ty)) {
          x = (newLeftTx + 1) * TILE_SIZE;
          outVx = 0;
          touchingWall = -1;
          break;
        }
      }
    }

    // Additional grounded check (look one pixel below)
    if (!grounded && outVy >= 0) {
      const checkY = y + PLAYER_HEIGHT;
      const checkTy = Math.floor(checkY / TILE_SIZE);
      const cLeftTx = Math.floor(x / TILE_SIZE);
      const cRightTx = Math.floor((x + PLAYER_WIDTH - 1) / TILE_SIZE);
      for (let tx = cLeftTx; tx <= cRightTx; tx++) {
        if (this.fireGrid.isSolid(tx, checkTy)) {
          grounded = true;
          break;
        }
      }
    }

    return { x, y, vx: outVx, vy: outVy, grounded, touchingWall };
  }

  snapshot(): LevelSnapshot {
    return {
      player: { ...this.player },
      enemies: this.enemies.map((e) => ({ ...e })),
      arrows: this.arrows.map((a) => ({ ...a })),
      burnProgress: this.fireGrid.getBurnProgress(),
      gameStatus: this.gameStatus,
      loseReason: this.loseReason,
      events: [...this.events],
      time: this.time,
    };
  }
}
