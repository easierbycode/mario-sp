import Phaser from 'phaser'
import { AnimationHelper } from '../helpers/animation-helper'
import type { ICollectibleConstructor } from '../interfaces/interfaces'

// default animations for animated collectibles, keyed by texture
// (frames come from the sma4 tileset spritesheet)
const defaultAnimationFrames: Record<string, any> = {
  coin2: {
    key: 'default',
    frames: {
      key: 'sma4',
      start: 268,
      end: 271,
      typeOfGeneration: 'generateFrameNumbers',
    },
    frameRate: 6,
    repeat: -1,
  },
}

export class Collectible extends Phaser.GameObjects.Sprite {
  declare body: Phaser.Physics.Arcade.Body

  // variables
  private currentScene: Phaser.Scene
  private points: number
  private animated: boolean

  constructor(aParams: ICollectibleConstructor) {
    super(aParams.scene, aParams.x, aParams.y, aParams.texture, aParams.frame)

    // variables
    this.currentScene = aParams.scene
    this.points = aParams.points
    this.animated = !!aParams.animated
    this.initSprite()

    // animated collectibles play their default animation on spawn
    if (this.animated) this.createAndPlayDefaultAnim(aParams)

    this.currentScene.add.existing(this)
  }

  private initSprite() {
    // sprite
    this.setOrigin(0, 0)
    this.setFrame(0)

    // physics
    this.currentScene.physics.world.enable(this)
    if (this.animated) {
      // sma4-sized collectible (16x16 tiles)
      this.body.setSize(16, 16).setOffset(0)
    } else {
      this.body.setSize(8, 8)
    }
    this.body.setAllowGravity(false)
  }

  update(): void {}

  public collected(): void {
    if (this.animated && this.currentScene.anims.exists('coin-impact')) {
      // play coin impact animation, then destroy
      this.body.enable = false
      this.once('animationcomplete-coin-impact', () => this.destroy())
      this.play('coin-impact')
    } else {
      this.destroy()
    }
    this.currentScene.registry.values.score += this.points
    this.currentScene.events.emit('scoreChanged')
  }

  private createAndPlayDefaultAnim(aParams: ICollectibleConstructor): void {
    const anim = defaultAnimationFrames[aParams.texture]
    if (!anim) return

    if (!this.currentScene.anims.exists(anim.key)) {
      new AnimationHelper(this.currentScene, { anims: [anim] })
    }
    this.play(anim.key)
  }
}
