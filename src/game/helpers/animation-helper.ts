import type Phaser from 'phaser'

/**
 * Creates the game animations from the loaded animations.json data.
 * The Animation Manager is global, so any scene works.
 */
export class AnimationHelper {
  private scene: Phaser.Scene
  private animationData: any

  constructor(scene: Phaser.Scene, data: any) {
    this.scene = scene
    this.animationData = data
    this.createGameAnimations()
  }

  private createGameAnimations(): void {
    for (const data of this.animationData.anims) {
      let frames
      const framesArray: any[] = []
      if (data.frames.typeOfGeneration === 'generateFrameNames') {
        frames = this.scene.anims.generateFrameNames(data.frames.key, {
          prefix: data.frames.prefix || '',
          start: data.frames.start || 0,
          end: data.frames.end || 0,
          suffix: data.frames.suffix || '',
          zeroPad: data.frames.zeroPad || 0,
          frames: data.frames.frames || false,
        })
      } else if (data.frames.typeOfGeneration === 'generateFrameNumbers') {
        frames = this.scene.anims.generateFrameNumbers(data.frames.key, {
          start: data.frames.start || 0,
          end: data.frames.end || -1,
          first: data.frames.first || false,
          frames: data.frames.frames || false,
        })
      } else {
        for (const i of data.frames) {
          framesArray.push({
            key: i.key,
            frame: i.frame,
            duration: i.duration || 0,
            visible: i.visible,
          })
        }
      }

      this.scene.anims.create({
        key: data.key,
        frames: frames || framesArray,
        defaultTextureKey: data.defaultTextureKey || null,
        frameRate: data.frameRate || 24,
        duration: data.duration,
        skipMissedFrames: data.skipMissedFrames || true,
        delay: data.delay || 0,
        repeat: data.repeat || 0,
        repeatDelay: data.repeatDelay || 0,
        yoyo: data.yoyo || false,
        showOnStart: data.showOnStart || false,
        hideOnComplete: data.hideOnComplete || false,
      })
    }
  }
}
