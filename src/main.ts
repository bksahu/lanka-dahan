// src/main.ts — Phaser 3 entry point for Lanka Dahan

import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './core/constants';
import { BootScene } from './game/scenes/BootScene';
import { TitleScene } from './game/scenes/TitleScene';
import { PlayScene } from './game/scenes/PlayScene';
import { HudScene } from './game/scenes/HudScene';
import { InputAdapter } from './game/input/InputAdapter';
import { RetroSynth } from './game/audio/RetroSynth';

const inputAdapter = new InputAdapter();
const synth = new RetroSynth();
inputAdapter.setAudioUnlockCallback(() => synth.unlock());

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#12142b',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, PlayScene, HudScene],
};

const game = new Phaser.Game(config);
game.registry.set('inputAdapter', inputAdapter);
game.registry.set('synth', synth);

// Ensure iOS Safari refreshes canvas dimensions after orientation change
const refreshScale = () => {
  setTimeout(() => game.scale.refresh(), 150);
};
window.addEventListener('orientationchange', refreshScale);
window.addEventListener('resize', refreshScale);
