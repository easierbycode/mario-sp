import Phaser from 'phaser'
import { gamepad } from '../../lib/gamepad.svelte'
import { touch } from '../../lib/touch.svelte'
import type { ISpriteConstructor } from '../interfaces/interfaces'

// Game Boy (Super Mario Land) profile
const WALK_MAX_VELOCITY = 50
const RUN_MAX_VELOCITY = 85
const WALK_ACCELERATION = 500
const RUN_ACCELERATION = 750
const JUMP_VELOCITY = -180

// GBA SMB3 (SMA4) profile, ported from the mario repo — per-frame
// acceleration ramp at 60fps, skid deceleration, and running jumps
// that get higher with horizontal speed
const SMA4 = {
  WALK_MAX_VELOCITY: 90,
  RUN_MAX_VELOCITY: 210,
  ACCELERATION: 3.28125,
  DECELERATION: 3.28125,
  SKID_DECELERATION: 7.5,
}

export class Mario extends Phaser.GameObjects.Sprite {
  declare body: Phaser.Physics.Arcade.Body

  // variables
  private currentScene: Phaser.Scene
  private marioSize: string
  private acceleration: number = 0
  private isJumping: boolean
  private isDying: boolean
  private isVulnerable: boolean
  private vulnerableCounter: number

  // input
  private keys: Map<string, Phaser.Input.Keyboard.Key>

  // levels with double-size tiles (E1's 16px vs the GB levels' 8px) set
  // registry physicsScale=2: scaling every velocity by k alongside gravity ×k
  // doubles all distances with identical timing, so tile-relative jumps and
  // gaps play exactly like the original implementation
  private physicsScale: number = 1

  public getVulnerable(): boolean {
    return this.isVulnerable
  }

  /** Held state for an action, merged from keyboard, gamepad, and touch. */
  public actionIsDown(action: 'up' | 'left' | 'right' | 'down' | 'jump' | 'run'): boolean {
    return this.keys.get(action)?.isDown || gamepad.isDown(action) || touch.isDown(action)
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
      ['up', this.addKey(gamepad.keyFor('up') ?? 'UP')],
      ['left', this.addKey('LEFT')],
      ['right', this.addKey('RIGHT')],
      ['down', this.addKey('DOWN')],
      ['jump', this.addKey(gamepad.keyFor('jump') ?? 'SPACE')],
      ['run', this.addKey(gamepad.keyFor('run') ?? 'C')],
    ])

    // physics
    this.physicsScale = this.currentScene.registry.get('physicsScale') ?? 1
    this.currentScene.physics.world.enable(this)
    this.adjustPhysicBodyToSmallSize()
    this.body.maxVelocity.x = WALK_MAX_VELOCITY * this.physicsScale
    this.body.maxVelocity.y = 300 * this.physicsScale
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
      if (this.y > this.currentScene.physics.world.bounds.bottom) {
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
    if (this.y > this.currentScene.physics.world.bounds.bottom) {
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

    // scenes pick a movement profile via the physics registry key
    if (this.currentScene.registry.get('physics') === 'sma4') {
      this.handleSma4Input()
    } else {
      this.handleGbInput()
    }
  }

  private handleGbInput() {
    const s = this.physicsScale
    // holding run (B on the Game Boy) raises the speed cap, as in the original
    const running = this.actionIsDown('run')
    const acceleration = (running ? RUN_ACCELERATION : WALK_ACCELERATION) * s
    this.body.maxVelocity.x =
      (running ? RUN_MAX_VELOCITY : WALK_MAX_VELOCITY) * s

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
      this.body.setVelocityY(JUMP_VELOCITY * s)
      this.isJumping = true
    }
  }

  private handleSma4Input() {
    const s = this.physicsScale
    // scale the per-frame constants by the actual frame time
    const timeScale = this.currentScene.game.loop.delta / (1000 / 60)

    const left = this.actionIsDown('left')
    const right = this.actionIsDown('right')

    // running only raises the cap while steering
    if ((left || right) && this.actionIsDown('run')) {
      this.body.maxVelocity.x = SMA4.RUN_MAX_VELOCITY * s
    } else {
      this.body.maxVelocity.x = SMA4.WALK_MAX_VELOCITY * s
    }

    if (
      this.body.onFloor() ||
      this.body.touching.down ||
      this.body.blocked.down
    ) {
      this.body.setVelocityY(0)
    }

    let velocity = this.body.velocity.x

    // handle movements to left and right — acceleration ramps up while
    // steering and bleeds off (faster when skidding) when released
    if (right) {
      if (this.acceleration < this.body.maxVelocity.x) {
        this.acceleration += SMA4.ACCELERATION * timeScale * s
        if (this.acceleration > this.body.maxVelocity.x)
          this.acceleration = this.body.maxVelocity.x
      }

      this.body.setAccelerationX(this.acceleration)
      this.setFlipX(false)
    } else if (left) {
      if (this.acceleration < this.body.maxVelocity.x) {
        this.acceleration += SMA4.ACCELERATION * timeScale * s
        if (this.acceleration > this.body.maxVelocity.x)
          this.acceleration = this.body.maxVelocity.x
      }

      this.body.setAccelerationX(-this.acceleration)
      this.setFlipX(true)
    } else {
      if (this.acceleration !== 0) {
        this.acceleration -= SMA4.DECELERATION * timeScale * s
        if (this.acceleration < 0) this.acceleration = 0
      }

      let decel = SMA4.DECELERATION * timeScale * s

      if (
        (this.body.velocity.x < 0 && this.body.acceleration.x > 0) ||
        (this.body.velocity.x > 0 && this.body.acceleration.x < 0)
      ) {
        decel = SMA4.SKID_DECELERATION * timeScale * s
      }

      if (this.flipX) {
        velocity += decel
        if (velocity > 0) velocity = 0
        this.body.setVelocityX(velocity)
        this.body.setAccelerationX(-this.acceleration)
      } else {
        velocity -= decel
        if (velocity < 0) velocity = 0
        this.body.setVelocityX(velocity)
        this.body.setAccelerationX(this.acceleration)
      }
    }

    // handle jumping — faster running means a higher jump, as in SMB3
    if (this.actionIsDown('jump') && !this.isJumping) {
      let jumpVelocity = -206.25
      if (Math.abs(velocity) > 180 * s) {
        jumpVelocity = -236.25
      } else if (Math.abs(velocity) > 120 * s) {
        jumpVelocity = -221.25
      } else if (Math.abs(velocity) > 60 * s) {
        jumpVelocity = -213.75
      }

      this.body.setVelocityY(jumpVelocity * s)
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
