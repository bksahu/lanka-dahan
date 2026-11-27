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
    this.load.aseprite('hanuman', 'assets/sprites/hanuman.png', 'assets/sprites/hanuman.json');
    this.load.aseprite('rakshasa_guard', 'assets/sprites/rakshasa_guard.png', 'assets/sprites/rakshasa_guard.json');
    this.load.aseprite('props_lanka', 'assets/sprites/props_lanka.png', 'assets/sprites/props_lanka.json');
    this.load.aseprite('fx_fire', 'assets/sprites/fx_fire.png', 'assets/sprites/fx_fire.json');

    this.load.spritesheet('tileset_lanka', 'assets/maps/tileset_lanka.png', {
      frameWidth: 16,
      frameHeight: 16,
    });

    this.load.image('bg_title_lanka', 'assets/bg/bg_title_lanka.png');
    this.load.image('bg_sky', 'assets/bg/bg_sky.png');
    this.load.image('bg_far_spires', 'assets/bg/bg_far_spires.png');
    this.load.image('bg_mid_palace', 'assets/bg/bg_mid_palace.png');
  }

  create(): void {
    this.registerPrefixedAnims('hanuman', new Set(['idle', 'run', 'jump', 'fall', 'wall_slide']));
    this.registerPrefixedAnims('rakshasa_guard', new Set(['idle', 'patrol', 'aim']));
    this.registerPrefixedAnims('props_lanka', new Set(['brass_diya', 'wall_sconce']));
    this.registerPrefixedAnims('fx_fire', new Set(['fire_tile_loop', 'ember_spark', 'arrow']));

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
