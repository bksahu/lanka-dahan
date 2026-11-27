// src/game/scenes/BootScene.ts — Asset loader and Aseprite animation registration

import Phaser from 'phaser';

interface AsepriteFrameTag {
  name: string;
  from: number;
  to: number;
  direction?: string;
}

interface AsepriteJson {
  frames: Record<string, { duration?: number }>;
  meta: {
    frameTags?: AsepriteFrameTag[];
  };
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.load.aseprite('hanuman', 'assets/hanuman.png', 'assets/hanuman.json');
    this.load.aseprite('rakshasa_guard', 'assets/rakshasa_guard.png', 'assets/rakshasa_guard.json');
    this.load.aseprite('rakshasa_archer', 'assets/rakshasa_archer.png', 'assets/rakshasa_archer.json');
    this.load.aseprite('lanka_tiles', 'assets/lanka_tiles.png', 'assets/lanka_tiles.json');
    this.load.aseprite('fx_fire', 'assets/fx_fire.png', 'assets/fx_fire.json');

    this.load.image('bg_sky', 'assets/bg_sky.png');
    this.load.image('bg_mountains', 'assets/bg_mountains.png');
    this.load.image('bg_palace_mid', 'assets/bg_palace_mid.png');
  }

  create(): void {
    this.registerPrefixedAnims('hanuman', new Set(['idle', 'run', 'jump', 'fall', 'wall_slide']));
    this.registerPrefixedAnims('rakshasa_guard', new Set(['idle', 'patrol']));
    this.registerPrefixedAnims('rakshasa_archer', new Set(['idle', 'aim', 'arrow']));
    this.registerPrefixedAnims('fx_fire', new Set(['flame_loop', 'ember']));

    this.scene.start('TitleScene');
  }

  private registerPrefixedAnims(sheetKey: string, loopTags: Set<string>): void {
    const data = this.cache.json.get(sheetKey) as AsepriteJson | undefined;
    if (!data?.meta?.frameTags) return;

    const frameKeys = Object.keys(data.frames);
    for (const tag of data.meta.frameTags) {
      const prefixedKey = `${sheetKey}:${tag.name}`;
      if (this.anims.exists(prefixedKey)) continue;

      const animFrames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = tag.from; i <= tag.to; i++) {
        const namedKey = `${sheetKey} ${i}.aseprite`;
        const frameName = data.frames[namedKey] ? namedKey : frameKeys[i];
        if (!frameName) continue;
        const duration = data.frames[frameName]?.duration ?? 100;
        animFrames.push({
          key: sheetKey,
          frame: frameName,
          duration,
        });
      }

      if (animFrames.length > 0) {
        this.anims.create({
          key: prefixedKey,
          frames: animFrames,
          repeat: loopTags.has(tag.name) ? -1 : 0,
        });
      }
    }
  }
}
