// src/game/scenes/TitleScene.ts — Title screen showcasing Svarna Lanka vista

import Phaser from 'phaser';
import { CANVAS_WIDTH } from '../../core/constants';
import { InputAdapter } from '../input/InputAdapter';
import { RetroSynth } from '../audio/RetroSynth';

export class TitleScene extends Phaser.Scene {
  private startPrompt!: Phaser.GameObjects.Text;
  private moonGlow!: Phaser.GameObjects.Arc;
  private started = false;

  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    this.started = false;

    // 320x180 Svarna Lanka Trikuta Mountain vista
    this.add.image(0, 0, 'bg_title_lanka').setOrigin(0, 0);

    // Subtle moon shimmer halo near top-right full moon
    this.moonGlow = this.add.circle(265, 30, 18, 0xf2f6fc, 0.08);

    // Animated brass diyas flanking the prompt
    const leftDiya = this.add.sprite(56, 156, 'props_lanka').setOrigin(0.5, 1);
    leftDiya.play('props_lanka:brass_diya');
    const rightDiya = this.add.sprite(264, 156, 'props_lanka').setOrigin(0.5, 1);
    rightDiya.play('props_lanka:brass_diya');

    // Title placed in clean upper-left sky negative space
    this.add.text(12, 12, 'LANKA DAHAN', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#f2b63d',
      stroke: '#090b17',
      strokeThickness: 4,
    });

    this.add.text(13, 32, 'SUNDARA KANDA', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ff7a18',
      stroke: '#090b17',
      strokeThickness: 2,
    });

    this.add.text(13, 44, 'Ignite 60% of Lanka. Spare Sacred Zones.', {
      fontFamily: 'monospace',
      fontSize: '6px',
      color: '#d8dde8',
      stroke: '#090b17',
      strokeThickness: 2,
    });

    // Prompt pill at bottom center
    this.add.rectangle(CANVAS_WIDTH / 2, 152, 176, 16, 0x090b17, 0.78)
      .setStrokeStyle(1, 0xc78028);

    this.startPrompt = this.add.text(CANVAS_WIDTH / 2, 152, 'PLAY / TAP TO BEGIN', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffe680',
      stroke: '#090b17',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(CANVAS_WIDTH / 2, 170, 'ARROWS/WASD: Move   SPACE: Jump   J/X/SHIFT: Tail Whip', {
      fontFamily: 'monospace',
      fontSize: '6px',
      color: '#a9c4dc',
      stroke: '#090b17',
      strokeThickness: 2,
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

  update(): void {
    const pulse = 0.55 + 0.45 * Math.sin(this.time.now / 260);
    this.startPrompt.setAlpha(pulse);
    this.moonGlow.setAlpha(0.05 + 0.05 * Math.sin(this.time.now / 700));
  }
}
