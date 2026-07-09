import Phaser from 'phaser'
import type { ISpriteConstructor } from '../interfaces/interfaces'

class Enemy extends Phaser.GameObjects.Sprite {
  declare body: Phaser.Physics.Arcade.Body

  protected currentScene: Phaser.Scene
  protected isActivated: boolean
  protected isDying: boolean
  protected speed: number
  protected dyingScoreValue: number

  constructor(aParams: ISpriteConstructor) {
    super(aParams.scene, aParams.x, aParams.y, aParams.texture, aParams.frame)

    // variables
    this.currentScene = aParams.scene
    this.initSprite()
    this.currentScene.add.existing(this)
  }

  protected initSprite() {
    // variables
    this.isActivated = false
    this.isDying = false

    // sprite
    this.setOrigin(0, 1)
    this.setFrame(0)

    // physics
    this.currentScene.physics.world.enable(this)
  }
}

export class Turtle extends Enemy {
  constructor(aParams: ISpriteConstructor) {
    super(aParams)
    this.speed = -20
    this.dyingScoreValue = 100
  }

  update(): void {
    if (!this.isDying) {
      if (this.isActivated) {
        // turtle is still alive
        // add speed to velocity x
        this.body.setVelocityX(this.speed)

        this.flipX = this.speed > 0

        // if turtle is moving into obstacle from map layer, turn
        if (this.body.blocked.right || this.body.blocked.left) {
          this.speed = -this.speed
          this.body.velocity.x = this.speed
        }

        // apply walk animation
        this.anims.play('turtleWalk', true)
      } else {
        if (
          Phaser.Geom.Intersects.RectangleToRectangle(
            this.getBounds(),
            this.currentScene.cameras.main.worldView
          )
        ) {
          this.isActivated = true
        }
      }
    } else {
      // turtle is dying, so stop animation, make velocity 0 and do not check collisions anymore
      this.anims.stop()
      this.body.setVelocity(0, 0)
      this.body.checkCollision.none = true
    }
  }

  public gotHitOnHead(): void {
    this.isDying = true
    this.setFrame(2)
  }

  protected gotHitFromBulletOrMarioHasStar(): void {
    this.isDying = true
    this.body.setVelocityX(20)
    this.body.setVelocityY(-20)
    this.setFlipY(true)
  }

  public isDead(): void {
    this.destroy()
  }
}
