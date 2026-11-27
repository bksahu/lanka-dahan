// src/game/scenes/TitleScene.ts — Title screen with parallax Svarna Lanka backdrop

import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../core/constants';
import { InputAdapter } from '../input/InputAdapter';
import { RetroSynth } from '../audio/RetroSynth';

export class TitleScene extends Phaser.Scene {
  private bgMountains!: Phaser.GameObjects.TileSprite;
  private bgPalace!: Phaser.GameObjects.TileSprite;
  private startPrompt!: Phaser.GameObjects.Text;
  private started = false;

  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    this.started = false;

    this.add.image(0, 0, 'bg_sky').setOrigin(0, 0);
    this.bgMountains = this.add.tileSprite(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 'bg_mountains').setOrigin(0, 0);
    this.bgPalace = this.add.tileSprite(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 'bg_palace_mid').setOrigin(0, 0);

    // Animated Hanuman preview
    const hanuman = this.add.sprite(CANVAS_WIDTH / 2, 118, 'hanuman');
    hanuman.play('hanuman:idle');

    this.add.text(CANVAS_WIDTH / 2, 30, 'LANKA DAHAN', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#f0b83d',
      stroke: '#0b0a14',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(CANVAS_WIDTH / 2, 48, 'SUNDARA KANDA', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#ff7a1a',
      stroke: '#0b0a14',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(CANVAS_WIDTH / 2, 70, 'Ignite 60% of Svarna Lanka. Spare Sacred Zones.', {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#d7e6f0',
      stroke: '#0b0a14',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.startPrompt = this.add.text(CANVAS_WIDTH / 2, 150, 'PRESS SPACE / TAP TO BEGIN', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#fff1a8',
      stroke: '#0b0a14',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(CANVAS_WIDTH / 2, 168, 'ARROWS/WASD: Move  SPACE: Jump  J/X/SHIFT: Tail Whip', {
      fontFamily: 'monospace',
      fontSize: '6px',
      color: '#75618a',
    }).setOrigin(0.5);

    const startGame = () => {
      if (this.started) return;
      this.started = true;
      const synth = this.registry.get('synth') as RetroSynth | undefined;
      if (synth) {
        synth.unlock();
        synth.playMenuSelect();
      }
      this.sound.unlock();
      const inputAdapter = this.registry.get('inputAdapter') as InputAdapter | undefined;
      inputAdapter?.enableTouchControls();

      this.scene.start('PlayScene');
      this.scene.launch('HudScene');
    };

    this.input.keyboard?.on('keydown-SPACE', startGame);
    this.input.keyboard?.on('keydown-ENTER', startGame);
    this.input.on('pointerdown', startGame);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.bgMountains.tilePositionX += 6 * dt;
    this.bgPalace.tilePositionX += 14 * dt;
    this.startPrompt.setAlpha(0.5 + 0.5 * Math.sin(this.time.now / 250));
  }
}
