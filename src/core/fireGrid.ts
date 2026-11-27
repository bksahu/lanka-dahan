// src/core/fireGrid.ts — Tile-based fire propagation cellular automaton
// Pure simulation: MUST NOT import phaser, window, document, or any browser/DOM API

import {
  type TileCell,
  type TileMaterial,
  type FireState,
  type FireEvent,
  type BurnProgress,
} from './types';
import {
  WOOD_ROOF_IGNITE_DELAY,
  WOOD_ROOF_BURN_DURATION,
  BANNER_IGNITE_DELAY,
  BANNER_BURN_DURATION,
  FIRE_SPREAD_DELAY,
} from './constants';

interface MaterialProps {
  flammable: boolean;
  igniteDelay: number;
  burnDuration: number;
  solidInitially: boolean;
  solidAfterCollapse: boolean;
}

const MATERIAL_PROPS: Record<TileMaterial, MaterialProps> = {
  EMPTY: {
    flammable: false,
    igniteDelay: 0,
    burnDuration: 0,
    solidInitially: false,
    solidAfterCollapse: false,
  },
  STONE: {
    flammable: false,
    igniteDelay: 0,
    burnDuration: 0,
    solidInitially: true,
    solidAfterCollapse: true,
  },
  WOOD_ROOF: {
    flammable: true,
    igniteDelay: WOOD_ROOF_IGNITE_DELAY,
    burnDuration: WOOD_ROOF_BURN_DURATION,
    solidInitially: true,
    solidAfterCollapse: false,
  },
  BANNER: {
    flammable: true,
    igniteDelay: BANNER_IGNITE_DELAY,
    burnDuration: BANNER_BURN_DURATION,
    solidInitially: false,
    solidAfterCollapse: false,
  },
  SACRED: {
    flammable: false,
    igniteDelay: 0,
    burnDuration: 0,
    solidInitially: true,
    solidAfterCollapse: true,
  },
};

export class FireGrid {
  readonly cols: number;
  readonly rows: number;
  private cells: TileCell[][];

  constructor(grid: TileMaterial[][]) {
    this.rows = grid.length;
    this.cols = grid.length > 0 ? grid[0].length : 0;
    this.cells = grid.map((row, _ry) =>
      row.map((material, _rx) => ({
        material,
        fireState: 'NONE' as FireState,
        timer: 0,
        variant: 0,
      }))
    );
  }

  getCell(tx: number, ty: number): TileCell | null {
    if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) return null;
    return this.cells[ty][tx];
  }

  isSolid(tx: number, ty: number): boolean {
    const cell = this.getCell(tx, ty);
    if (!cell) return false;
    const props = MATERIAL_PROPS[cell.material];
    if (cell.fireState === 'COLLAPSED') return props.solidAfterCollapse;
    return props.solidInitially;
  }

  igniteTile(tx: number, ty: number): FireEvent | null {
    if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) return null;
    const cell = this.cells[ty][tx];

    if (cell.material === 'EMPTY' || cell.material === 'STONE') return null;

    if (cell.material === 'SACRED') {
      return { type: 'SACRED_STRUCK', tx, ty };
    }

    const props = MATERIAL_PROPS[cell.material];
    if (!props.flammable) return null;

    if (cell.fireState === 'NONE') {
      cell.fireState = 'IGNITING';
      cell.timer = 0;
      return { type: 'TILE_IGNITED', tx, ty };
    }

    return null; // Already igniting, burning, or collapsed
  }

  step(tickDt: number): FireEvent[] {
    const events: FireEvent[] = [];

    // Phase 1 — Advance Timers
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const cell = this.cells[ty][tx];
        if (cell.fireState === 'IGNITING') {
          cell.timer += tickDt;
          const delay = MATERIAL_PROPS[cell.material].igniteDelay;
          if (cell.timer >= delay) {
            cell.fireState = 'BURNING';
            cell.timer = 0;
            events.push({ type: 'TILE_BURNING', tx, ty });
          }
        } else if (cell.fireState === 'BURNING') {
          cell.timer += tickDt;
          const dur = MATERIAL_PROPS[cell.material].burnDuration;
          if (cell.timer >= dur) {
            cell.fireState = 'COLLAPSED';
            cell.timer = 0;
            events.push({ type: 'TILE_COLLAPSED', tx, ty });
          }
        }
      }
    }

    // Phase 2 — Collect Spread Targets (double-buffered)
    const pendingIgnitions = new Set<string>();
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const cell = this.cells[ty][tx];
        if (cell.fireState === 'BURNING' && cell.timer >= FIRE_SPREAD_DELAY) {
          const neighbors: [number, number][] = [
            [tx - 1, ty],
            [tx + 1, ty],
            [tx, ty - 1],
            [tx, ty + 1],
          ];
          for (const [nx, ny] of neighbors) {
            const neighbor = this.getCell(nx, ny);
            if (
              neighbor &&
              MATERIAL_PROPS[neighbor.material].flammable &&
              neighbor.fireState === 'NONE'
            ) {
              pendingIgnitions.add(`${nx},${ny}`);
            }
          }
        }
      }
    }

    // Phase 3 — Commit Ignitions
    for (const key of pendingIgnitions) {
      const [nxStr, nyStr] = key.split(',');
      const nx = parseInt(nxStr, 10);
      const ny = parseInt(nyStr, 10);
      const neighbor = this.cells[ny][nx];
      neighbor.fireState = 'IGNITING';
      neighbor.timer = 0;
      events.push({ type: 'TILE_IGNITED', tx: nx, ty: ny });
    }

    return events;
  }

  getBurnProgress(): BurnProgress {
    let ignited = 0;
    let totalFlammable = 0;

    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const cell = this.cells[ty][tx];
        if (MATERIAL_PROPS[cell.material].flammable) {
          totalFlammable++;
          if (cell.fireState !== 'NONE') {
            ignited++;
          }
        }
      }
    }

    return {
      ignited,
      totalFlammable,
      percent: totalFlammable === 0 ? 0 : Math.round((ignited / totalFlammable) * 100),
    };
  }
}
