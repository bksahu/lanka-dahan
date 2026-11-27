// src/game/scenes/HudScene.ts — Pixel HUD overlay & Win/Lose modal

import Phaser from 'phaser';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  WIN_BURN_PERCENT,
  MAX_SACRED_STRIKES,
  MAX_HEALTH,
} from '../../core/constants';
import type { LevelSnapshot } from '../../core/types';
import type { RetroSynth } from '../audio/RetroSynth';

export class HudScene extends Phaser.Scene {
  private healthText!: Phaser.GameObjects.Text;
  private burnText!: Phaser.GameObjects.Text;
  private sacredText!: Phaser.GameObjects.Text;
  private burnBarFill!: Phaser.GameObjects.Rectangle;
  private warningText!: Phaser.GameObjects.Text;
  private modalGroup!: Phaser.GameObjects.Group;
  private modalShown = false;

  constructor() {
    super({ key: 'HudScene' });
  }

  create(): void {
    this.modalShown = false;

    // Top HUD backing strip
    this.add.rectangle(0, 0, CANVAS_WIDTH, 16, 0x0b0a14, 0.72).setOrigin(0, 0);

    // Prana Hearts
    this.healthText = this.add.text(4, 3, '♥♥♥', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ff7a1a',
    });

    // Burn Progress bar
    this.add.rectangle(90, 5, 80, 6, 0x241c33).setOrigin(0, 0);
    this.burnBarFill = this.add.rectangle(90, 5, 0, 6, 0xffd43b).setOrigin(0, 0);
    // 60% target tick mark
    this.add.rectangle(90 + Math.floor(80 * (WIN_BURN_PERCENT / 100)), 4, 1, 8, 0xfff1a8).setOrigin(0, 0);

    this.burnText = this.add.text(174, 3, '0%', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffd43b',
    });

    // Sacred strikes
    this.sacredText = this.add.text(CANVAS_WIDTH - 4, 3, 'SACRED 0/3', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#2d9973',
    }).setOrigin(1, 0);

    // Sacred warning popup
    this.warningText = this.add.text(CANVAS_WIDTH / 2, 26, 'SACRED ZONE! DO NOT BURN!', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#d7e6f0',
      backgroundColor: '#2d9973',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setVisible(false);

    this.modalGroup = this.add.group();

    const playScene = this.scene.get('PlayScene');
    playScene.events.on('sim-update', this.onSimUpdate, this);

    const onMuteKey = () => {
      const synth = this.registry.get('synth') as RetroSynth | undefined;
      synth?.toggleMute();
    };
    this.input.keyboard?.on('keydown-M', onMuteKey);

    this.events.once('shutdown', () => {
      playScene.events.off('sim-update', this.onSimUpdate, this);
      this.input.keyboard?.off('keydown-M', onMuteKey);
    });
  }

  private onSimUpdate(snap: LevelSnapshot): void {
    // Hearts
    const filled = Math.max(0, snap.player.health);
    const empty = Math.max(0, MAX_HEALTH - filled);
    this.healthText.setText('♥'.repeat(filled) + '♡'.repeat(empty));

    // Burn bar
    const pct = Math.min(100, snap.burnProgress.percent);
    this.burnBarFill.width = Math.round((pct / 100) * 80);
    this.burnBarFill.fillColor = pct >= WIN_BURN_PERCENT ? 0xff7a1a : 0xffd43b;
    this.burnText.setText(`${pct}%/${WIN_BURN_PERCENT}%`);

    // Sacred strikes
    const strikes = snap.player.sacredStrikes;
    this.sacredText.setText(`SACRED ${strikes}/${MAX_SACRED_STRIKES}`);
    this.sacredText.setColor(strikes > 0 ? '#ff7a1a' : '#2d9973');

    // Warning flash
    for (const ev of snap.events) {
      if (ev.type === 'SACRED_PENALTY') {
        this.warningText.setVisible(true);
        this.time.delayedCall(1500, () => {
          if (this.warningText.active) {
            this.warningText.setVisible(false);
          }
        });
      }
    }

    if (snap.gameStatus !== 'PLAYING' && !this.modalShown) {
      this.modalShown = true;
      this.showEndModal(snap);
    }
  }

  private showEndModal(snap: LevelSnapshot): void {
    const isWin = snap.gameStatus === 'WIN';
    const bg = this.add.rectangle(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 230, 104, 0x0b0a14, 0.92);
    bg.setStrokeStyle(2, isWin ? 0xf0b83d : 0xb8233a);

    const title = this.add.text(
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 - 32,
      isWin ? 'SVARNA LANKA ABLAZE!' : 'MISSION FAILED',
      {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: isWin ? '#f0b83d' : '#b8233a',
      },
    ).setOrigin(0.5);

    let subMsg = `Ignited: ${snap.burnProgress.percent}%  Time: ${snap.time.toFixed(1)}s`;
    if (!isWin) {
      if (snap.loseReason === 'SACRED') subMsg = 'Sacred Sanctuaries Violated (3/3)';
      else if (snap.loseReason === 'ABYSS') subMsg = 'Fell into the Midnight Abyss';
      else subMsg = 'Prana Depleted by Rakshasa Guards';
    }

    const sub = this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 8, subMsg, {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#f2ede1',
    }).setOrigin(0.5);

    const retry = this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 24, 'PRESS R / TAP TO REPLAY', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffd43b',
    }).setOrigin(0.5);

    this.modalGroup.addMultiple([bg, title, sub, retry]);

    const restart = () => {
      this.scene.stop('HudScene');
      this.scene.start('PlayScene');
      this.scene.launch('HudScene');
    };

    this.input.keyboard?.once('keydown-R', restart);
    this.input.keyboard?.once('keydown-SPACE', restart);
    this.input.once('pointerdown', restart);
  }
}
