import Phaser from 'phaser'
import { gamepad } from '../../lib/gamepad.svelte'
import type { ISpriteConstructor } from '../interfaces/interfaces'

const WALK_MAX_VELOCITY = 50
const RUN_MAX_VELOCITY = 85
const WALK_ACCELERATION = 500
const RUN_ACCELERATION = 750

export class Mario extends Phaser.GameObjects.Sprite {
  declare body: Phaser.Physics.Arcade.Body

  // variables
  private currentScene: Phaser.Scene
  private marioSize: string
  private isJumping: boolean
  private isDying: boolean
  private isVulnerable: boolean
  private vulnerableCounter: number

  // input
  private keys: Map<string, Phaser.Input.Keyboard.Key>

  public getVulnerable(): boolean {
    return this.isVulnerable
  }

  /** Held state for an action, merged from keyboard and gamepad. */
  public actionIsDown(action: 'left' | 'right' | 'down' | 'jump' | 'run'): boolean {
    return this.keys.get(action)?.isDown || gamepad.isDown(action)
  }

  constructor(aParams: ISpriteConstructor) {
    super(aParams.scene, aParams.x, aParams.y, aParams.texture, aParams.frame)

    this.currentScene = aParams.scene
    this.initSprite()
    this.currentScene.add.existing(this)
  }

  private initSprite() {
    // variables
    this.marioSize = this.currentScene.registry.get('marioSize')
    this.isJumping = false
    this.isDying = false
    this.isVulnerable = true
    this.vulnerableCounter = 100

    // sprite
    this.setOrigin(0.5, 0.5)
    this.setFlipX(false)

    // input — jump and run keys follow codemonkey.json (SPACE / C by default)
    this.keys = new Map([
      ['left', this.addKey('LEFT')],
      ['right', this.addKey('RIGHT')],
      ['down', this.addKey('DOWN')],
      ['jump', this.addKey(gamepad.keyFor('jump') ?? 'SPACE')],
      ['run', this.addKey(gamepad.keyFor('run') ?? 'C')],
    ])

    // physics
    this.currentScene.physics.world.enable(this)
    this.adjustPhysicBodyToSmallSize()
    this.body.maxVelocity.x = WALK_MAX_VELOCITY
    this.body.maxVelocity.y = 300
  }

  private addKey(key: string): Phaser.Input.Keyboard.Key {
    return this.currentScene.input.keyboard.addKey(key)
  }

  update(): void {
    if (!this.isDying) {
      this.handleInput()
      this.handleAnimations()
    } else {
      this.setFrame(12)
      if (this.y > this.currentScene.sys.canvas.height) {
        this.currentScene.scene.stop('GameScene')
        this.currentScene.scene.stop('HUDScene')
        this.currentScene.scene.start('MenuScene')
      }
    }

    if (!this.isVulnerable) {
      if (this.vulnerableCounter > 0) {
        this.vulnerableCounter -= 1
      } else {
        this.vulnerableCounter = 100
        this.isVulnerable = true
      }
    }
  }

  private handleInput() {
    if (this.y > this.currentScene.sys.canvas.height) {
      // mario fell into a hole
      this.isDying = true
    }

    // evaluate if player is on the floor or on object
    // if neither of that, set the player to be jumping
    if (
      this.body.onFloor() ||
      this.body.touching.down ||
      this.body.blocked.down
    ) {
      this.isJumping = false
    }

    // holding run (B on the Game Boy) raises the speed cap, as in the original
    const running = this.actionIsDown('run')
    const acceleration = running ? RUN_ACCELERATION : WALK_ACCELERATION
    this.body.maxVelocity.x = running ? RUN_MAX_VELOCITY : WALK_MAX_VELOCITY

    // handle movements to left and right
    if (this.actionIsDown('right')) {
      this.body.setAccelerationX(acceleration)
      this.setFlipX(false)
    } else if (this.actionIsDown('left')) {
      this.body.setAccelerationX(-acceleration)
      this.setFlipX(true)
    } else {
      this.body.setVelocityX(0)
      this.body.setAccelerationX(0)
    }

    // handle jumping
    if (this.actionIsDown('jump') && !this.isJumping) {
      this.body.setVelocityY(-180)
      this.isJumping = true
    }
  }

  private handleAnimations(): void {
    if (this.body.velocity.y !== 0) {
      // mario is jumping or falling
      this.anims.stop()
      if (this.marioSize === 'small') {
        this.setFrame(4)
      } else {
        this.setFrame(10)
      }
    } else if (this.body.velocity.x !== 0) {
      // mario is moving horizontal

      // check if mario is making a quick direction change
      if (
        (this.body.velocity.x < 0 && this.body.acceleration.x > 0) ||
        (this.body.velocity.x > 0 && this.body.acceleration.x < 0)
      ) {
        if (this.marioSize === 'small') {
          this.setFrame(5)
        } else {
          this.setFrame(11)
        }
      }

      this.anims.play(this.marioSize + 'MarioWalk', true)
    } else {
      // mario is standing still
      this.anims.stop()
      if (this.marioSize === 'small') {
        this.setFrame(0)
      } else {
        if (this.actionIsDown('down')) {
          this.setFrame(13)
        } else {
          this.setFrame(6)
        }
      }
    }
  }

  public growMario(): void {
    this.marioSize = 'big'
    this.currentScene.registry.set('marioSize', 'big')
    this.adjustPhysicBodyToBigSize()
  }

  private shrinkMario(): void {
    this.marioSize = 'small'
    this.currentScene.registry.set('marioSize', 'small')
    this.adjustPhysicBodyToSmallSize()
  }

  private adjustPhysicBodyToSmallSize(): void {
    this.body.setSize(6, 12)
    this.body.setOffset(6, 4)
  }

  private adjustPhysicBodyToBigSize(): void {
    this.body.setSize(8, 16)
    this.body.setOffset(4, 0)
  }

  public bounceUpAfterHitEnemyOnHead(): void {
    this.currentScene.add.tween({
      targets: this,
      props: { y: this.y - 5 },
      duration: 200,
      ease: 'Power1',
      yoyo: true,
    })
  }

  public gotHit(): void {
    this.isVulnerable = false
    if (this.marioSize === 'big') {
      this.shrinkMario()
    } else {
      // mario is dying
      this.isDying = true

      // sets acceleration, velocity and speed to zero
      // stop all animations
      this.body.stop()
      this.anims.stop()

      // make last dead jump and turn off collision check
      this.body.setVelocityY(-180)

      this.body.checkCollision.up = false
      this.body.checkCollision.down = false
      this.body.checkCollision.left = false
      this.body.checkCollision.right = false
    }
  }
}
