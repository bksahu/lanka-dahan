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

// 160 columns x 14 rows
// Zone 1 (0-28): Palace Parapet Entry
// Zone 2 (29-60): Banner Towers
// Zone 3 (61-95): Archer Ridge
// Zone 4 (96-122): Vibhishana's House & Ashoka Vatika
// Zone 5 (123-159): Royal Armory Gauntlet & Sea-Cliff Exit

const LEVEL_STRINGS: string[] = [
  //0         1         2         3         4         5         6         7         8         9         10        11        12        13        14        15
  //0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789
  '................................................................................................................................................................',
  '................................................................................................................................................................',
  '.....................................................................................##.........SS..SS...............................................................', 
  '....................#####..............##..BB..##.........##...............##.......####.......SSSSSSSS........##..BB..##.........................................', 
  '.................###WWWWW###........####..BB..####.....####.............####.....##WWWW##...SS......SS.....####..BB..####.....####...............................', 
  '..............###WWWWWWWWWWW###..###WWWW......WWWW###.#WWWW#.........#WWWW#..##WWWWWWWW##.S........S...##WWWW......WWWW##.##WWWW##.........##.................', 
  '............##WWWWWWWWWWWWWWWW####WWWWWWWWWWWWWWWWWW##WWWWWWW##.....#WWWWWW###WWWWWWWWWWW#.S........S.##WWWWWWWWWWWWWWWW##WWWWWWWW###...####..BB..............', 
  '..........##WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW##.##WWWWWWWWWWWWWWWWWWWWWW#S........S#WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW###WWWW..BB..............', 
  '........##WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW##WWWWWWWWWWWWWWWWWWWWWWWWSSSSSSSSSSSWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW......BB..........', 
  '......##WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW########WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW......BB..........', 
  '....##WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW..........WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW......BB......', 
  '..####WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW..........WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW....BB..##', 
  '####################################################################################################################################WWWWWWWWWWWWWWWWWW......##', 
  '################################################################################################################################################################', 
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
  // Zone 2: First Guard patrol
  { type: 'GUARD', tx: 38, ty: 5, patrolLeftTx: 34, patrolRightTx: 44 },
  { type: 'GUARD', tx: 50, ty: 6, patrolLeftTx: 46, patrolRightTx: 56 },

  // Zone 3: Archers
  { type: 'ARCHER', tx: 68, ty: 5, patrolLeftTx: 66, patrolRightTx: 72 },
  { type: 'ARCHER', tx: 78, ty: 4, patrolLeftTx: 76, patrolRightTx: 82 },
  { type: 'GUARD', tx: 85, ty: 5, patrolLeftTx: 82, patrolRightTx: 90 },

  // Zone 4: Guards near sacred zone
  { type: 'GUARD', tx: 95, ty: 3, patrolLeftTx: 92, patrolRightTx: 98 },

  // Zone 5: Gauntlet
  { type: 'GUARD', tx: 130, ty: 6, patrolLeftTx: 126, patrolRightTx: 136 },
  { type: 'ARCHER', tx: 138, ty: 5, patrolLeftTx: 136, patrolRightTx: 142 },
  { type: 'GUARD', tx: 145, ty: 7, patrolLeftTx: 142, patrolRightTx: 150 },
  { type: 'ARCHER', tx: 150, ty: 6, patrolLeftTx: 148, patrolRightTx: 154 },
];

export function getLevel1(): LevelDef {
  return {
    cols: LEVEL_COLS,
    rows: LEVEL_ROWS,
    grid: parseLevelGrid(),
    playerStartTx: 4,
    playerStartTy: 10,
    exitTxMin: 156,
    exitTxMax: 159,
    enemies: ENEMY_SPAWNS,
  };
}
