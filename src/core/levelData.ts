// src/core/levelData.ts — Level 1: Svarna Lanka Rooftops
// Pure simulation: MUST NOT import phaser, window, document, or any browser/DOM API
// 160 x 14 tile map (2560 x 224 world pixels)

import { type LevelDef, type TileMaterial, type EnemySpawn } from './types';
import { LEVEL_COLS, LEVEL_ROWS } from './constants';

// Legend:
// '.' = EMPTY
// '#' = STONE
// 'W' = WOOD_ROOF
// 'B' = BANNER
// 'S' = SACRED

const TILE_CHAR_MAP: Record<string, TileMaterial> = {
  '.': 'EMPTY',
  '#': 'STONE',
  'W': 'WOOD_ROOF',
  'B': 'BANNER',
  'S': 'SACRED',
};

// 160 columns x 14 rows — Clean horizontal Svarna Lanka terraces, 1-tile golden-eaved roofs,
// hanging banner bridges, and moonlit marble/Ashoka sanctuary (matching ref_gameplay.png).
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
  '.........................................BBBBBB.........................BBBBBB...................................................BBBBBB.........................',
  '...................WWWWWW..............##WWWWWW##.....WWWWWW..........##WWWWWW##....WWWWWW.....................................##WWWWWW##.....WWWWWW............',
  '...................B....B..............B........B.....B....B..........B........B....B....B...........S.........S...............B........B.....B....B............',
  '...................B....B.....WWWWWW...B........B..###WWWWWW###.......B........B..##WWWWWW##.......SSSSS.....SSSSS.......WWWWWWB........B..###WWWWWW###.........',
  '...................B....B.....B....B.............###..........#.......#........#..#........#.........S.........S.........B....B#........#..#..........#.........',
  '...................#....#.....B....B...#........#..#..........#WWWWWWW#........#..#........#WWWWWW...S.........S...WWWWWWB....B#........#..#..........#WWWWWW...',
  '.........WWWWWWWWWW######.....#....#####.........###...........########........####........#######SSSSSSSSSSSSSSSSS######......#########..############......###.',
  '#########..........######.....#...................................................................SSSSSSSSSSSSSSSSS..........................................###.',
  '#########..........###############################################################################SSSSSSSSSSSSSSSSS##########################################.###.',
  '#########..........###############################################################################SSSSSSSSSSSSSSSSS##########################################.###.',
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
  // Zone 2: Guards patrolling terraces & towers (feet at ty + 1)
  { type: 'GUARD', tx: 34, ty: 11, patrolLeftTx: 31, patrolRightTx: 38 },
  { type: 'GUARD', tx: 54, ty: 6, patrolLeftTx: 51, patrolRightTx: 59 },

  // Zone 3: Archers & Guard on ridge
  { type: 'ARCHER', tx: 74, ty: 4, patrolLeftTx: 72, patrolRightTx: 77 },
  { type: 'GUARD', tx: 66, ty: 11, patrolLeftTx: 62, patrolRightTx: 70 },
  { type: 'ARCHER', tx: 86, ty: 6, patrolLeftTx: 84, patrolRightTx: 89 },

  // Zone 4: Guard near entrance to Vibhishana's House (standing on row 9 awning)
  { type: 'GUARD', tx: 94, ty: 8, patrolLeftTx: 92, patrolRightTx: 96 },

  // Zone 5: Gauntlet
  { type: 'GUARD', tx: 132, ty: 4, patrolLeftTx: 129, patrolRightTx: 136 },
  { type: 'ARCHER', tx: 147, ty: 6, patrolLeftTx: 144, patrolRightTx: 151 },
  { type: 'GUARD', tx: 143, ty: 9, patrolLeftTx: 140, patrolRightTx: 148 },
  { type: 'ARCHER', tx: 157, ty: 9, patrolLeftTx: 156, patrolRightTx: 158 },
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
