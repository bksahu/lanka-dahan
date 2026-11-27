// src/core/levelData.ts — Level 1: Svarna Lanka Rooftops
// Pure simulation: MUST NOT import phaser, window, document, or any browser/DOM API
// 160 x 14 tile map (2560 x 224 world pixels)

import { type LevelDef, type TileMaterial, type EnemySpawn } from './types';
import { LEVEL_COLS, LEVEL_ROWS } from './constants';

const TILE_CHAR_MAP: Record<string, TileMaterial> = {
  '.': 'EMPTY',
  '#': 'STONE',
  'W': 'WOOD_ROOF',
  'B': 'BANNER',
  'S': 'SACRED',
};

// 160 columns x 14 rows — Every STONE (#) and SACRED (S) structure is grounded down to row 13.
// Every BANNER (B) hangs strictly beneath a roof. Every elevated WOOD_ROOF (W) pavilion is supported
// at both ends by carved pillars down to a solid terrace below.
//
// Zone 1 (0-28):   Palace Parapet Entry
// Zone 2 (29-60):  Banner Towers
// Zone 3 (61-95):  Archer Ridge
// Zone 4 (96-122): Vibhishana's House & Ashoka Vatika (SACRED)
// Zone 5 (123-159): Royal Armory Gauntlet & Sea-Cliff Exit

const LEVEL_STRINGS: string[] = [
  //0         1         2         3         4         5         6         7         8         9         10        11        12        13        14        15
  //0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789
  '................................................................................................................................................................',
  '................................................................................................................................................................',
  '................................................................................................................................................................',
  '................................................................................................................................................................',
  '................................................................................................................................................................',
  '...................WWWWWW...........................................................WWWWWWWWWWW.................................................................',
  '....................B..B..............WWWWWWWWWWWW..................WWWWWW...........B.......B.......SSS.......SSS...................WWWWW.......WWWWW..........',
  '....................B..B......WWWWWW...B........B....................B..B............B.......B......SSSSS.....SSSSS...................B.B.........B.B...........',
  '....................B..B.......B..B....B........B....................B..B............B.......B........S.........S.....................B.B.........B.B...........',
  '.......................................B........B.....................................................S.........S...............................................',
  '.........WWWWWWWWWW######.....######..............##########....##########..........###########....SSSSSSSSSSSSSSSSS....##########WWW#####WWW#########...#######',
  '#########..........######.....######..............##########....##########..........###########....SSSSSSSSSSSSSSSSS....##########...#####...#########...#######',
  '#########..........######.....#################################################################....SSSSSSSSSSSSSSSSS....##########...#####...#########...#######',
  '#########..........######.....#################################################################....SSSSSSSSSSSSSSSSS....##########...#####...#########...#######',
];

function parseLevelGrid(): TileMaterial[][] {
  const grid: TileMaterial[][] = [];
  for (let row = 0; row < LEVEL_ROWS; row++) {
    const line = LEVEL_STRINGS[row];
    const rowTiles: TileMaterial[] = [];
    for (let col = 0; col < LEVEL_COLS; col++) {
      const ch = col < line.length ? line[col] : '.';
      rowTiles.push(TILE_CHAR_MAP[ch] ?? 'EMPTY');
    }
    grid.push(rowTiles);
  }
  return grid;
}

const ENEMY_SPAWNS: EnemySpawn[] = [
  // Zone 2: Guards patrolling terraces & sunken courtyards
  { type: 'GUARD', tx: 33, ty: 9, patrolLeftTx: 30, patrolRightTx: 35 },
  { type: 'GUARD', tx: 44, ty: 11, patrolLeftTx: 39, patrolRightTx: 48 },
  { type: 'GUARD', tx: 55, ty: 9, patrolLeftTx: 50, patrolRightTx: 59 },

  // Zone 3: Archers & Guards along ridge
  { type: 'ARCHER', tx: 70, ty: 9, patrolLeftTx: 64, patrolRightTx: 72 },
  { type: 'ARCHER', tx: 76, ty: 11, patrolLeftTx: 74, patrolRightTx: 79 },
  { type: 'GUARD', tx: 88, ty: 9, patrolLeftTx: 85, patrolRightTx: 93 },
  { type: 'GUARD', tx: 92, ty: 9, patrolLeftTx: 85, patrolRightTx: 93 },

  // Zone 5: Citadel, Bastion & Exit Gauntlet
  { type: 'GUARD', tx: 125, ty: 9, patrolLeftTx: 121, patrolRightTx: 129 },
  { type: 'ARCHER', tx: 135, ty: 9, patrolLeftTx: 133, patrolRightTx: 137 },
  { type: 'GUARD', tx: 145, ty: 9, patrolLeftTx: 141, patrolRightTx: 149 },
  { type: 'ARCHER', tx: 157, ty: 9, patrolLeftTx: 154, patrolRightTx: 158 },
];

export function getLevel1(): LevelDef {
  return {
    cols: LEVEL_COLS,
    rows: LEVEL_ROWS,
    grid: parseLevelGrid(),
    playerStartTx: 3,
    playerStartTy: 11,
    exitTxMin: 156,
    exitTxMax: 159,
    enemies: ENEMY_SPAWNS,
  };
}
