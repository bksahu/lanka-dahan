// src/game/scenes/PlayScene.ts — Thin Phaser 3 renderer for Lanka Dahan
// Strictly delegates physics, collisions, AI, and fire propagation to LevelSim

import Phaser from 'phaser';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  FIXED_DT,
  TILE_SIZE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  WIN_BURN_PERCENT,
} from '../../core/constants';
import { getLevel1 } from '../../core/levelData';
import { LevelSim } from '../../core/levelSim';
import type { LevelDef, LevelSnapshot, PlayerState, Enemy } from '../../core/types';
import { InputAdapter } from '../input/InputAdapter';
import { RetroSynth } from '../audio/RetroSynth';

export class PlayScene extends Phaser.Scene {
  private levelDef!: LevelDef;
  private sim!: LevelSim;
  private accumulator = 0;

  private bgMountains!: Phaser.GameObjects.TileSprite;
  private bgPalace!: Phaser.GameObjects.TileSprite;

  private tileSprites: (Phaser.GameObjects.Image | null)[][] = [];
  private flameOverlays: Map<string, Phaser.GameObjects.Sprite> = new Map();

  private playerSprite!: Phaser.GameObjects.Sprite;
  private enemySprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private arrowSprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private exitBeacon!: Phaser.GameObjects.Text;

  private prevPlayerState: PlayerState = 'IDLE';
  private endSoundPlayed = false;

  constructor() {
    super({ key: 'PlayScene' });
  }

  create(): void {
    this.levelDef = getLevel1();
    this.sim = new LevelSim(this.levelDef);
    this.accumulator = 0;
    this.prevPlayerState = 'IDLE';
    this.endSoundPlayed = false;
    (this.registry.get('inputAdapter') as InputAdapter | undefined)?.enableTouchControls();
    this.flameOverlays.clear();
    this.enemySprites.clear();
    this.arrowSprites.clear();

    // Parallax Backgrounds (scrollFactor 0, tilePositionX driven by camera)
    this.add.tileSprite(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 'bg_sky')
      .setOrigin(0, 0)
      .setScrollFactor(0);
    this.bgMountains = this.add.tileSprite(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 'bg_mountains')
      .setOrigin(0, 0)
      .setScrollFactor(0);
    this.bgPalace = this.add.tileSprite(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 'bg_palace_mid')
      .setOrigin(0, 0)
      .setScrollFactor(0);

    // Build tile visuals
    this.buildTileLayer();

    // Exit archway & beacon
    const exitX = this.levelDef.exitTxMin * TILE_SIZE;
    const exitY = 10 * TILE_SIZE;
    this.add.image(exitX, exitY, 'lanka_tiles', 'lanka_tiles 23.aseprite').setOrigin(0, 0);
    this.add.image(exitX + 16, exitY, 'lanka_tiles', 'lanka_tiles 24.aseprite').setOrigin(0, 0);
    this.exitBeacon = this.add.text(exitX + 16, exitY - 12, 'EXIT', {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#ffd43b',
      stroke: '#0b0a14',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // Hanuman sprite (feet aligned at y=31 of 32x32 frame)
    this.playerSprite = this.add.sprite(0, 0, 'hanuman');
    this.playerSprite.setOrigin(0.5, 1);
    this.playerSprite.play('hanuman:idle');

    // Enemy sprites
    for (const enemy of this.sim.enemies) {
      const key = enemy.type === 'GUARD' ? 'rakshasa_guard' : 'rakshasa_archer';
      const spr = this.add.sprite(enemy.x + 16, enemy.y + 32, key);
      spr.setOrigin(0.5, 1);
      spr.play(enemy.type === 'GUARD' ? 'rakshasa_guard:patrol' : 'rakshasa_archer:idle');
      this.enemySprites.set(enemy.id, spr);
    }

    // Camera setup
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.playerSprite, true, 0.15, 0.15);
    this.cameras.main.setDeadzone(40, 24);
  }

  private buildTileLayer(): void {
    this.tileSprites = [];
    for (let ty = 0; ty < this.levelDef.rows; ty++) {
      const rowArr: (Phaser.GameObjects.Image | null)[] = [];
      for (let tx = 0; tx < this.levelDef.cols; tx++) {
        const mat = this.levelDef.grid[ty][tx];
        if (mat === 'EMPTY') {
          rowArr.push(null);
          continue;
        }
        let frameIdx = 4; // STONE solid
        if (mat === 'STONE') {
          const above = ty > 0 ? this.levelDef.grid[ty - 1][tx] : 'EMPTY';
          if (above === 'EMPTY') frameIdx = 0; // cornice
          else if ((tx + ty) % 5 === 0) frameIdx = 3; // alcove
          else if (tx % 4 === 0) frameIdx = 2; // fluted pillar
          else frameIdx = 1; // carved wall
        } else if (mat === 'WOOD_ROOF') {
          frameIdx = 5;
        } else if (mat === 'BANNER') {
          frameIdx = tx % 2 === 0 ? 10 : 11;
        } else if (mat === 'SACRED') {
          const above = ty > 0 ? this.levelDef.grid[ty - 1][tx] : 'EMPTY';
          if (above === 'EMPTY') frameIdx = 15; // marble lotus roof
          else if (tx % 3 === 0) frameIdx = 16; // tulsi pillar
          else if (tx % 3 === 1) frameIdx = 17; // ashoka canopy
          else frameIdx = 19; // marble base
        }

        const img = this.add
          .image(tx * TILE_SIZE, ty * TILE_SIZE, 'lanka_tiles', `lanka_tiles ${frameIdx}.aseprite`)
          .setOrigin(0, 0);
        rowArr.push(img);
      }
      this.tileSprites.push(rowArr);
    }
  }

  update(_time: number, delta: number): void {
    const frameDt = Math.min(delta / 1000, 0.05);
    this.accumulator += frameDt;

    const inputAdapter = this.registry.get('inputAdapter') as InputAdapter | undefined;
    if (!inputAdapter) return;

    let latestSnap: LevelSnapshot | null = null;
    while (this.accumulator >= FIXED_DT) {
      this.accumulator -= FIXED_DT;
      const input = inputAdapter.consumeSnapshot();
      latestSnap = this.sim.step(input, FIXED_DT);
      this.processEvents(latestSnap);
    }

    if (latestSnap) {
      this.syncVisuals(latestSnap);
      this.events.emit('sim-update', latestSnap);
    }

    // Parallax sync
    const camX = this.cameras.main.scrollX;
    this.bgMountains.tilePositionX = camX * 0.15;
    this.bgPalace.tilePositionX = camX * 0.35;
  }

  private processEvents(snap: LevelSnapshot): void {
    const synth = this.registry.get('synth') as RetroSynth | undefined;

    for (const ev of snap.events) {
      switch (ev.type) {
        case 'TILE_IGNITED': {
          const tx = ev.tx as number;
          const ty = ev.ty as number;
          this.updateTileVisual(tx, ty);
          synth?.playIgnite();
          break;
        }
        case 'TILE_BURNING': {
          const tx = ev.tx as number;
          const ty = ev.ty as number;
          this.updateTileVisual(tx, ty);
          this.spawnFlameOverlay(tx, ty);
          break;
        }
        case 'TILE_COLLAPSED': {
          const tx = ev.tx as number;
          const ty = ev.ty as number;
          this.updateTileVisual(tx, ty);
          this.removeFlameOverlay(tx, ty);
          this.cameras.main.shake(90, 0.004);
          synth?.playCollapse();
          break;
        }
        case 'SACRED_PENALTY': {
          synth?.playSacredStruck();
          this.cameras.main.shake(120, 0.006);
          const shield = this.add.sprite(
            snap.player.x + PLAYER_WIDTH / 2 + snap.player.facing * 14,
            snap.player.y + PLAYER_HEIGHT / 2,
            'fx_fire',
          );
          shield.play('fx_fire:sacred_shield');
          shield.once('animationcomplete', () => shield.destroy());
          break;
        }
        case 'ENEMY_HIT':
        case 'ENEMY_HIT_BY_REFLECTED_ARROW': {
          synth?.playWhipHit();
          break;
        }
        case 'ARROW_REFLECTED': {
          synth?.playArrowReflect();
          this.cameras.main.shake(70, 0.004);
          break;
        }
        case 'PLAYER_HIT_BY_ARROW':
        case 'PLAYER_HIT_BY_ENEMY': {
          synth?.playHurt();
          this.cameras.main.shake(150, 0.008);
          break;
        }
        case 'GAME_WIN': {
          if (!this.endSoundPlayed) {
            this.endSoundPlayed = true;
            synth?.playVictory();
          }
          break;
        }
        case 'GAME_OVER': {
          if (!this.endSoundPlayed) {
            this.endSoundPlayed = true;
            synth?.playGameOver();
          }
          break;
        }
      }
    }
  }

  private updateTileVisual(tx: number, ty: number): void {
    const img = this.tileSprites[ty]?.[tx];
    const cell = this.sim.fireGrid.getCell(tx, ty);
    if (!img || !cell) return;

    let frameIdx = -1;
    if (cell.material === 'WOOD_ROOF') {
      if (cell.fireState === 'IGNITING') frameIdx = 6;
      else if (cell.fireState === 'BURNING') frameIdx = 7;
      else if (cell.fireState === 'COLLAPSED') frameIdx = 9;
    } else if (cell.material === 'BANNER') {
      if (cell.fireState === 'IGNITING') frameIdx = 12;
      else if (cell.fireState === 'BURNING') frameIdx = 13;
      else if (cell.fireState === 'COLLAPSED') {
        img.setVisible(false);
        return;
      }
    }

    if (frameIdx >= 0) {
      img.setFrame(`lanka_tiles ${frameIdx}.aseprite`);
    }
  }

  private spawnFlameOverlay(tx: number, ty: number): void {
    const key = `${tx},${ty}`;
    if (this.flameOverlays.has(key)) return;
    const spr = this.add.sprite(tx * TILE_SIZE + 8, ty * TILE_SIZE + 8, 'fx_fire');
    spr.play('fx_fire:flame_loop');
    this.flameOverlays.set(key, spr);
  }

  private removeFlameOverlay(tx: number, ty: number): void {
    const key = `${tx},${ty}`;
    const spr = this.flameOverlays.get(key);
    if (spr) {
      spr.destroy();
      this.flameOverlays.delete(key);
    }
  }

  private syncVisuals(snap: LevelSnapshot): void {
    const p = snap.player;
    const synth = this.registry.get('synth') as RetroSynth | undefined;

    // Player position (feet at bottom-center of collision box)
    this.playerSprite.setPosition(
      Math.round(p.x + PLAYER_WIDTH / 2),
      Math.round(p.y + PLAYER_HEIGHT),
    );
    this.playerSprite.setFlipX(p.facing === -1);

    // Invulnerability blink
    if (p.invulnTimer > 0) {
      this.playerSprite.setAlpha(Math.floor(this.time.now / 60) % 2 === 0 ? 0.4 : 1);
    } else {
      this.playerSprite.setAlpha(1);
    }

    // Player state transition SFX & animations
    if (p.state !== this.prevPlayerState) {
      if (p.state === 'JUMP') {
        synth?.playJump();
      } else if (p.state === 'TAIL_WHIP') {
        synth?.playWhipStart();
        this.cameras.main.shake(60, 0.003);
        const slash = this.add.sprite(
          p.x + PLAYER_WIDTH / 2 + p.facing * 16,
          p.y + PLAYER_HEIGHT / 2,
          'fx_fire',
        );
        slash.setFlipX(p.facing === -1);
        slash.play('fx_fire:whip_slash');
        slash.once('animationcomplete', () => slash.destroy());
      }
      this.prevPlayerState = p.state;
    }

    const animMap: Record<PlayerState, string> = {
      IDLE: 'hanuman:idle',
      RUN: 'hanuman:run',
      JUMP: 'hanuman:jump',
      FALL: 'hanuman:fall',
      WALL_SLIDE: 'hanuman:wall_slide',
      TAIL_WHIP: 'hanuman:tail_whip',
      HURT: 'hanuman:hurt',
    };
    const targetAnim = animMap[p.state];
    if (this.playerSprite.anims.currentAnim?.key !== targetAnim) {
      this.playerSprite.play(targetAnim, true);
    }

    // Sync Enemies
    for (const enemy of snap.enemies) {
      const spr = this.enemySprites.get(enemy.id);
      if (!spr) continue;
      if (enemy.state === 'DEAD') {
        spr.setVisible(false);
        continue;
      }
      spr.setPosition(Math.round(enemy.x + 16), Math.round(enemy.y + 32));
      spr.setFlipX(enemy.facing === -1);
      const eAnim = this.getEnemyAnim(enemy);
      if (spr.anims.currentAnim?.key !== eAnim) {
        spr.play(eAnim, true);
      }
    }

    // Sync Arrows
    const activeArrowIds = new Set<number>();
    for (const arrow of snap.arrows) {
      activeArrowIds.add(arrow.id);
      let spr = this.arrowSprites.get(arrow.id);
      if (!spr) {
        spr = this.add.sprite(arrow.x, arrow.y, 'rakshasa_archer');
        spr.play('rakshasa_archer:arrow');
        this.arrowSprites.set(arrow.id, spr);
      }
      spr.setPosition(Math.round(arrow.x), Math.round(arrow.y));
      spr.setFlipX(arrow.vx < 0);
      spr.setTint(arrow.friendly ? 0xfffbe0 : 0xffffff);
    }
    for (const [id, spr] of this.arrowSprites.entries()) {
      if (!activeArrowIds.has(id)) {
        spr.destroy();
        this.arrowSprites.delete(id);
      }
    }

    // Exit beacon color
    this.exitBeacon.setColor(
      snap.burnProgress.percent >= WIN_BURN_PERCENT ? '#ffd43b' : '#75618a',
    );
  }

  private getEnemyAnim(enemy: Enemy): string {
    const prefix = enemy.type === 'GUARD' ? 'rakshasa_guard' : 'rakshasa_archer';
    if (enemy.state === 'HURT') return `${prefix}:hurt`;
    if (enemy.type === 'GUARD') {
      if (enemy.state === 'ATTACK') return `${prefix}:attack`;
      return enemy.state === 'PATROL' ? `${prefix}:patrol` : `${prefix}:idle`;
    } else {
      if (enemy.state === 'ATTACK') return `${prefix}:aim`;
      return `${prefix}:idle`;
    }
  }
}
