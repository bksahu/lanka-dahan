// src/core/types.ts — Core simulation types for Lanka Dahan
// MUST NOT import phaser, window, document, or any browser/DOM API

// ─── Input ────────────────────────────────────────────────────
export interface InputSnapshot {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;  // edge-triggered, true for one tick
  jumpHeld: boolean;     // level-triggered, true while held
  whipPressed: boolean;  // edge-triggered, true for one tick
}

// ─── Geometry ─────────────────────────────────────────────────
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

// ─── Player ───────────────────────────────────────────────────
export type PlayerState =
  | 'IDLE'
  | 'RUN'
  | 'JUMP'
  | 'FALL'
  | 'WALL_SLIDE'
  | 'TAIL_WHIP'
  | 'HURT';

export interface PlayerContext {
  x: number;         // left edge of collision box
  y: number;         // top edge of collision box
  vx: number;
  vy: number;
  facing: 1 | -1;    // 1 = right, -1 = left
  state: PlayerState;
  stateTimer: number;
  grounded: boolean;
  touchingWall: 0 | 1 | -1; // 0 = none, 1 = right wall, -1 = left wall
  coyoteTimer: number;
  jumpBufferTimer: number;
  whipCooldown: number;
  whipSwingId: number;
  health: number;
  invulnTimer: number;
  sacredStrikes: number;
}

// ─── Tiles / Fire ─────────────────────────────────────────────
export type TileMaterial =
  | 'EMPTY'
  | 'STONE'
  | 'WOOD_ROOF'
  | 'BANNER'
  | 'SACRED';

export type FireState =
  | 'NONE'
  | 'IGNITING'
  | 'BURNING'
  | 'COLLAPSED';

export interface TileCell {
  material: TileMaterial;
  fireState: FireState;
  timer: number;
  /** Visual variant index for tile rendering */
  variant: number;
}

export type FireEventType =
  | 'TILE_IGNITED'
  | 'TILE_BURNING'
  | 'TILE_COLLAPSED'
  | 'SACRED_STRUCK';

export interface FireEvent {
  type: FireEventType;
  tx: number;
  ty: number;
}

export interface BurnProgress {
  ignited: number;       // tiles that have been ignited (IGNITING, BURNING, or COLLAPSED)
  totalFlammable: number;
  percent: number;       // 0-100
}

// ─── Enemies ──────────────────────────────────────────────────
export type EnemyType = 'GUARD' | 'ARCHER';

export type EnemyState =
  | 'IDLE'
  | 'PATROL'
  | 'ATTACK'
  | 'HURT'
  | 'DEAD';

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  state: EnemyState;
  stateTimer: number;
  health: number;
  /** For archers: cooldown between shots */
  attackCooldown: number;
  /** Track last whipSwingId that hit this enemy */
  lastHitBySwingId: number;
}

export interface Arrow {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  friendly: boolean;
  /** Track which whipSwingId reflected this arrow */
  reflectedBySwingId: number;
}

// ─── Level Simulation ─────────────────────────────────────────
export type GameStatus = 'PLAYING' | 'WIN' | 'LOSE';

export type LoseReason = 'HEALTH' | 'ABYSS' | 'SACRED';

export interface SimEvent {
  type: string;
  [key: string]: unknown;
}

export interface LevelSnapshot {
  player: PlayerContext;
  enemies: Enemy[];
  arrows: Arrow[];
  burnProgress: BurnProgress;
  gameStatus: GameStatus;
  loseReason: LoseReason | null;
  events: SimEvent[];
  time: number;
}

// ─── Level Data ───────────────────────────────────────────────
export interface EnemySpawn {
  type: EnemyType;
  tx: number;
  ty: number;
  patrolLeftTx: number;
  patrolRightTx: number;
}

export interface LevelDef {
  cols: number;
  rows: number;
  /** Row-major tile material grid: grid[row][col] */
  grid: TileMaterial[][];
  /** Player start tile position */
  playerStartTx: number;
  playerStartTy: number;
  /** Exit zone tile range */
  exitTxMin: number;
  exitTxMax: number;
  /** Enemy spawns */
  enemies: EnemySpawn[];
}
