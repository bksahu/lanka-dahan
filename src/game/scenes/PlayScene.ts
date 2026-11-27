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
import type { LevelDef, LevelSnapshot, PlayerState, Enemy, TileMaterial } from '../../core/types';
import { InputAdapter } from '../input/InputAdapter';
import { RetroSynth } from '../audio/RetroSynth';

interface ActiveParticle {
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

const MAX_ACTIVE_PARTICLES = 40;

export class PlayScene extends Phaser.Scene {
  private levelDef!: LevelDef;
  private sim!: LevelSim;
  private accumulator = 0;

  private bgFarSpires!: Phaser.GameObjects.TileSprite;
  private bgMidPalace!: Phaser.GameObjects.TileSprite;

  private tileSprites: (Phaser.GameObjects.Image | null)[][] = [];
  private flameOverlays: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private particles: ActiveParticle[] = [];

  private playerSprite!: Phaser.GameObjects.Sprite;
  private enemySprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private arrowSprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private exitBeacon!: Phaser.GameObjects.Text;
  private fireGlowOverlay!: Phaser.GameObjects.Rectangle;

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
    (this.registry.get('synth') as RetroSynth | undefined)?.stopTitleTheme();
    (this.registry.get('inputAdapter') as InputAdapter | undefined)?.enableTouchControls();
    this.flameOverlays.clear();
    this.enemySprites.clear();
    this.arrowSprites.clear();
    this.particles = [];

    // ── Depth 0 / 10 / 20: 3-Layer Parallax Backdrop ──────────────────────────
    this.add.tileSprite(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 'bg_sky')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0);

    this.bgFarSpires = this.add.tileSprite(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 'bg_far_spires')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(10);

    this.bgMidPalace = this.add.tileSprite(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 'bg_mid_palace')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(20);

    // ── Depth 30 & 40: Decorative Props, Banners & Playable Tilemap ───────────
    this.buildDecorativeLandmarks();
    this.buildTileLayer();

    // ── Depth 50: Enemies ─────────────────────────────────────────────────────
    for (const enemy of this.sim.enemies) {
      const spr = this.add.sprite(Math.round(enemy.x + 16), Math.round(enemy.y + 32), 'rakshasa_guard')
        .setOrigin(0.5, 1)
        .setDepth(50);
      if (enemy.type === 'ARCHER') {
        spr.setTint(0xd8dde8); // slight moonlight tint to distinguish sentry archers
      }
      spr.play(enemy.type === 'GUARD' ? 'rakshasa_guard:patrol' : 'rakshasa_guard:idle');
      this.enemySprites.set(enemy.id, spr);
    }

    // ── Depth 60: Lord Hanuman (48x32 frame, feet anchored at y=31) ───────────
    this.playerSprite = this.add.sprite(0, 0, 'hanuman')
      .setOrigin(0.5, 1)
      .setDepth(60);
    this.playerSprite.play('hanuman:idle');

    // ── Depth 70: Subtle Warm Fire Glow Overlay ───────────────────────────────
    this.fireGlowOverlay = this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0xff7a18, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(70);

    // Camera setup
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.playerSprite, true, 0.15, 0.15);
    this.cameras.main.setDeadzone(40, 24);
  }

  private buildDecorativeLandmarks(): void {
    const grid = this.levelDef.grid;

    // ── Depth 25: Golden Shikhara Temples & Curved Golden Roof Domes rising behind terraces ──
    const shikharas: [number, number][] = [
      [13, 10], [22, 10], [45, 10], [56, 12], [75, 9], [90, 10], [134, 10], [150, 12],
    ];
    for (const [tx, ty] of shikharas) {
      this.add.image(tx * TILE_SIZE, ty * TILE_SIZE, 'props_lanka', 'props_lanka 8.aseprite')
        .setOrigin(0.5, 1)
        .setDepth(25);
    }

    const roofDomes: [number, number][] = [
      [5, 11], [34, 10], [66, 9], [85, 10], [126, 10], [142, 10],
    ];
    for (const [tx, ty] of roofDomes) {
      this.add.image(tx * TILE_SIZE, ty * TILE_SIZE, 'props_lanka', 'props_lanka 9.aseprite')
        .setOrigin(0.5, 1)
        .setDepth(26);
    }

    // ── Depth 28: Carved supporting sandstone pillars under raised WOOD_ROOF pavilions ──
    for (let ty = 4; ty < 11; ty++) {
      for (let tx = 0; tx < this.levelDef.cols; tx++) {
        if (grid[ty][tx] !== 'WOOD_ROOF') continue;
        const leftW = tx > 0 ? grid[ty][tx - 1] : 'EMPTY';
        const rightW = tx < this.levelDef.cols - 1 ? grid[ty][tx + 1] : 'EMPTY';
        const isEdge = leftW !== 'WOOD_ROOF' || rightW !== 'WOOD_ROOF';
        if (!isEdge) continue;

        // Only place pillars if there is a solid STONE/SACRED floor below within rows ty+1..13
        let floorTy = -1;
        for (let py = ty + 1; py < this.levelDef.rows; py++) {
          const m = grid[py][tx];
          if (m === 'STONE' || m === 'SACRED') {
            floorTy = py;
            break;
          }
          if (m !== 'EMPTY' && m !== 'BANNER') break;
        }
        if (floorTy <= ty + 1) continue;

        for (let py = ty + 1; py < floorTy; py++) {
          const pCol = py === ty + 1 ? 2 : (py === floorTy - 1 ? 0 : 1);
          this.add.image(tx * TILE_SIZE, py * TILE_SIZE, 'tileset_lanka', 4 * 16 + pCol)
            .setOrigin(0, 0)
            .setDepth(28);
        }
      }
    }

    // ── Depth 30: Torana Archways on open flat terraces & Stone Balustrade Railings ──
    const toranaPositions: [number, number][] = [
      [1, 11], [41, 10], [123, 10],
    ];
    for (const [tx, ty] of toranaPositions) {
      this.add.image(tx * TILE_SIZE, ty * TILE_SIZE, 'props_lanka', 'props_lanka 0.aseprite')
        .setOrigin(0, 1)
        .setDepth(30);
    }

    // Balustrade railings along open flat STONE terraces (at least 3 wide)
    for (let ty = 1; ty < this.levelDef.rows; ty++) {
      for (let tx = 6; tx < this.levelDef.cols - 5; tx++) {
        const mat = grid[ty][tx];
        const above = grid[ty - 1][tx];
        const left = grid[ty][tx - 1];
        const right = grid[ty][tx + 1];
        if (mat === 'STONE' && above === 'EMPTY' && left === 'STONE' && right === 'STONE') {
          if (tx < 96 || tx > 119) {
            this.add.image(tx * TILE_SIZE, (ty - 1) * TILE_SIZE, 'tileset_lanka', 9)
              .setOrigin(0, 0)
              .setDepth(30);
          }
        }
      }
    }

    // Standing brass diyas along terraces
    const diyaPositions: [number, number][] = [
      [7, 11], [27, 10], [64, 12], [93, 10], [125, 10], [154, 12],
    ];
    for (const [tx, ty] of diyaPositions) {
      const diya = this.add.sprite(tx * TILE_SIZE + 8, ty * TILE_SIZE, 'props_lanka')
        .setOrigin(0.5, 1)
        .setDepth(31);
      diya.play('props_lanka:brass_diya');
    }

    // Vibhishana's White Marble Sacred Shrine on the marble terrace (Zone 4: cols 96..118)
    this.add.image(105 * TILE_SIZE, 10 * TILE_SIZE, 'props_lanka', 'props_lanka 1.aseprite')
      .setOrigin(0, 1)
      .setDepth(30);

    // Sea-Cliff Exit Torana Arch (Zone 5, foreground framing)
    const exitX = this.levelDef.exitTxMin * TILE_SIZE - 16;
    const exitY = 11 * TILE_SIZE;
    this.add.image(exitX, exitY, 'props_lanka', 'props_lanka 0.aseprite')
      .setOrigin(0, 1)
      .setDepth(80);

    this.exitBeacon = this.add.text(exitX + 32, exitY - 70, 'EXIT', {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#ffd23f',
      stroke: '#090b17',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(80);
  }

  private getTileFrameIndex(tx: number, ty: number, mat: TileMaterial): number {
    const grid = this.levelDef.grid;
    const left = tx > 0 ? grid[ty][tx - 1] : 'EMPTY';
    const right = tx < this.levelDef.cols - 1 ? grid[ty][tx + 1] : 'EMPTY';
    const above = ty > 0 ? grid[ty - 1][tx] : 'EMPTY';
    const above2 = ty > 1 ? grid[ty - 2][tx] : 'EMPTY';

    if (mat === 'STONE') {
      // Top walkable sandstone terrace surface (matching ref_gameplay.png)
      if (above !== 'STONE') {
        if (left === 'EMPTY') return 0;   // left terrace corner
        if (right === 'EMPTY') return 3;  // right terrace corner
        return tx % 2 === 0 ? 1 : 2;      // sunlit sandstone flagstones + gold cornice + frieze
      }
      // 1 row below top surface -> continuous carved scroll frieze border
      if (above === 'STONE' && above2 !== 'STONE') {
        if (left !== 'STONE') return 6;
        if (right !== 'STONE') return 7;
        return 4;
      }
      // Deeper interior -> dark framed palace undercroft with carved corner borders
      if (left !== 'STONE') return 6;
      if (right !== 'STONE') return 7;
      return 5;
    }

    if (mat === 'WOOD_ROOF') {
      const posOffset = left !== 'WOOD_ROOF' ? 0 : right !== 'WOOD_ROOF' ? 2 : 1;
      const cell = this.sim.fireGrid.getCell(tx, ty);
      if (cell?.fireState === 'COLLAPSED') return 1 * 16 + 9 + posOffset;
      if (cell?.fireState === 'BURNING') return 1 * 16 + 6 + posOffset;
      if (cell?.fireState === 'IGNITING') return 1 * 16 + 3 + posOffset;
      // Top row of WOOD_ROOF = ribbed golden palace eave; stacked rows underneath = carved palace facade bays/pillars!
      if (above === 'WOOD_ROOF') {
        if (left !== 'WOOD_ROOF' || right !== 'WOOD_ROOF') {
          return 4 * 16 + 1; // carved sandstone palace pillar edge
        }
        return (tx + ty) % 3 === 0 ? 8 : 4 * 16 + 4; // arched palace window / golden pillar facade
      }
      return 1 * 16 + posOffset;
    }

    if (mat === 'BANNER') {
      const cell = this.sim.fireGrid.getCell(tx, ty);
      if (cell?.fireState === 'IGNITING') return 2 * 16 + (tx % 2 === 0 ? 2 : 3);
      if (cell?.fireState === 'BURNING') return 2 * 16 + (tx % 2 === 0 ? 4 : 5);
      if (cell?.fireState === 'COLLAPSED') return 2 * 16 + 6;
      return 2 * 16 + (tx % 2 === 0 ? 0 : 1);
    }

    if (mat === 'SACRED') {
      // Top Ashoka foliage canopies vs white marble terrace & lotus shrine base
      if (ty <= 7) {
        if (left !== 'SACRED') return 3 * 16 + 4;  // Ashoka canopy L
        if (right !== 'SACRED') return 3 * 16 + 6; // Ashoka canopy R
        return 3 * 16 + 5;                         // Ashoka canopy M
      }
      if (ty === 8 || ty === 9) return 3 * 16 + 7; // Ashoka tree trunk
      if (ty === 10) return 3 * 16 + 0;            // marble lotus terrace top
      if (left !== 'SACRED' || right !== 'SACRED') return 3 * 16 + 1; // marble pillar
      return (tx + ty) % 3 === 0 ? 3 * 16 + 3 : 3 * 16 + 2; // lotus crest / floral plinth
    }

    return 0;
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
        const frameIdx = this.getTileFrameIndex(tx, ty, mat);
        const depth = mat === 'BANNER' ? 30 : 40;
        const img = this.add
          .image(tx * TILE_SIZE, ty * TILE_SIZE, 'tileset_lanka', frameIdx)
          .setOrigin(0, 0)
          .setDepth(depth);
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

    this.updateParticles(frameDt);

    // Parallax sync
    const camX = this.cameras.main.scrollX;
    this.bgFarSpires.tilePositionX = camX * 0.15;
    this.bgMidPalace.tilePositionX = camX * 0.35;

    // Subtle warm fire glow near dense active fires
    const fireAlpha = Math.min(0.08, this.flameOverlays.size * 0.004);
    this.fireGlowOverlay.setAlpha(
      fireAlpha * (0.85 + 0.15 * Math.sin(this.time.now / 90)),
    );
  }

  private spawnEmberBurst(wx: number, wy: number, count: number, debris = false): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_ACTIVE_PARTICLES) {
        const oldest = this.particles.shift();
        oldest?.sprite.destroy();
      }
      const vx = (Math.random() - 0.5) * 44;
      const vy = debris ? 15 + Math.random() * 30 : -24 - Math.random() * 34;
      if (debris) {
        const rect = this.add.rectangle(Math.round(wx), Math.round(wy), 3, 2, 0x3b2018)
          .setDepth(70);
        this.particles.push({ sprite: rect, vx, vy, life: 0, maxLife: 0.45, gravity: 180 });
      } else {
        const spr = this.add.sprite(Math.round(wx), Math.round(wy), 'fx_fire')
          .setDepth(70);
        spr.play('fx_fire:ember_spark');
        this.particles.push({ sprite: spr, vx, vy, life: 0, maxLife: 0.55, gravity: -12 });
      }
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.sprite.x = Math.round(p.sprite.x + p.vx * dt);
      p.sprite.y = Math.round(p.sprite.y + p.vy * dt);
    }
  }

  private processEvents(snap: LevelSnapshot): void {
    const synth = this.registry.get('synth') as RetroSynth | undefined;

    for (const ev of snap.events) {
      switch (ev.type) {
        case 'TILE_IGNITED': {
          const tx = ev.tx as number;
          const ty = ev.ty as number;
          this.updateTileVisual(tx, ty);
          this.spawnEmberBurst(tx * TILE_SIZE + 8, ty * TILE_SIZE + 6, 4, false);
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
          this.spawnEmberBurst(tx * TILE_SIZE + 8, ty * TILE_SIZE + 8, 4, true);
          this.cameras.main.shake(90, 0.004);
          synth?.playCollapse();
          break;
        }
        case 'SACRED_PENALTY': {
          synth?.playSacredStruck();
          this.cameras.main.shake(120, 0.006);
          const shield = this.add.sprite(
            Math.round(snap.player.x + PLAYER_WIDTH / 2 + snap.player.facing * 14),
            Math.round(snap.player.y + PLAYER_HEIGHT / 2),
            'fx_fire',
          ).setDepth(70);
          shield.play('fx_fire:sacred_warn');
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

    const frameIdx = this.getTileFrameIndex(tx, ty, cell.material);
    img.setFrame(frameIdx);
  }

  private spawnFlameOverlay(tx: number, ty: number): void {
    const key = `${tx},${ty}`;
    if (this.flameOverlays.has(key)) return;
    const spr = this.add.sprite(tx * TILE_SIZE + 8, ty * TILE_SIZE + 4, 'fx_fire')
      .setDepth(70);
    spr.play('fx_fire:fire_tile_loop');
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

    // Player position (pixel-snapped, feet at bottom-center of collision box)
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

    // Player state transition SFX & ember trails
    if (p.state !== this.prevPlayerState) {
      if (p.state === 'JUMP') {
        synth?.playJump();
        this.spawnEmberBurst(p.x + PLAYER_WIDTH / 2 - p.facing * 8, p.y + 12, 3, false);
      } else if (p.state === 'TAIL_WHIP') {
        synth?.playWhipStart();
        this.cameras.main.shake(60, 0.003);
        this.spawnEmberBurst(p.x + PLAYER_WIDTH / 2 + p.facing * 14, p.y + 12, 5, false);
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
        spr = this.add.sprite(Math.round(arrow.x), Math.round(arrow.y), 'fx_fire')
          .setDepth(50);
        spr.play('fx_fire:arrow');
        this.arrowSprites.set(arrow.id, spr);
      }
      spr.setPosition(Math.round(arrow.x), Math.round(arrow.y));
      spr.setFlipX(arrow.vx < 0);
      spr.setTint(arrow.friendly ? 0xfff9d6 : 0xffffff);
    }
    for (const [id, spr] of this.arrowSprites.entries()) {
      if (!activeArrowIds.has(id)) {
        spr.destroy();
        this.arrowSprites.delete(id);
      }
    }

    // Exit beacon color
    this.exitBeacon.setColor(
      snap.burnProgress.percent >= WIN_BURN_PERCENT ? '#ffd23f' : '#a9c4dc',
    );
  }

  private getEnemyAnim(enemy: Enemy): string {
    if (enemy.state === 'HURT') return 'rakshasa_guard:knockback';
    if (enemy.type === 'GUARD') {
      if (enemy.state === 'ATTACK') return 'rakshasa_guard:shoot';
      return enemy.state === 'PATROL' ? 'rakshasa_guard:patrol' : 'rakshasa_guard:idle';
    }
    if (enemy.state === 'ATTACK') return 'rakshasa_guard:aim';
    return 'rakshasa_guard:idle';
  }
}
