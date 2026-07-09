import Phaser from 'phaser'
import { Collectible } from './collectible'
import type { IBoxConstructor } from '../interfaces/interfaces'

export class Box extends Phaser.GameObjects.Sprite {
  declare body: Phaser.Physics.Arcade.Body

  // variables
  private currentScene: Phaser.Scene
  private boxContent: string
  private content: Collectible
  // Phaser 4 removed the Timeline API — collect the hit tweens and play them
  // as a chain instead
  private hitTweens: Phaser.Types.Tweens.TweenBuilderConfig[]

  public getContent(): Phaser.GameObjects.Sprite {
    return this.content
  }

  public getBoxContentString(): string {
    return this.boxContent
  }

  constructor(aParams: IBoxConstructor) {
    super(aParams.scene, aParams.x, aParams.y, aParams.texture, aParams.frame)

    // variables
    this.currentScene = aParams.scene
    this.boxContent = aParams.content

    this.initSprite()
    this.currentScene.add.existing(this)
  }

  private initSprite() {
    // variables
    this.content = null
    this.hitTweens = []

    // sprite
    this.setOrigin(0, 0)
    this.setFrame(0)

    // physics
    this.currentScene.physics.world.enable(this)
    this.body.setSize(8, 8)
    this.body.setAllowGravity(false)
    this.body.setImmovable(true)
  }

  update(): void {}

  public yoyoTheBoxUpAndDown(): void {
    this.hitTweens.push({
      targets: this,
      props: { y: this.y - 10 },
      duration: 60,
      ease: 'Power0',
      yoyo: true,
      onComplete: () => {
        this.active = false
        this.setFrame(1)
      },
    })
  }

  public spawnBoxContent(): Collectible {
    this.content = new Collectible({
      scene: this.currentScene,
      x: this.x,
      y: this.y - 8,
      texture: this.boxContent,
      points: 1000,
    })
    return this.content
  }

  public tweenBoxContent(
    props: {},
    duration: number,
    complete: () => void
  ): void {
    this.hitTweens.push({
      targets: this.content,
      props: props,
      delay: 0,
      duration: duration,
      ease: 'Power0',
      onComplete: complete,
    })
  }

  public startHitTimeline(): void {
    if (this.hitTweens.length === 0) return
    this.currentScene.tweens.chain({ tweens: this.hitTweens })
    this.hitTweens = []
  }

  public popUpCollectible(): void {
    this.content.body.setVelocity(30, -50)
    this.content.body.setAllowGravity(true)
    this.content.body.setGravityY(-300)
  }

  public addCoinAndScore(coin: number, score: number): void {
    this.currentScene.registry.values.coins += coin
    this.currentScene.events.emit('coinsChanged')
    this.currentScene.registry.values.score += score
    this.currentScene.events.emit('scoreChanged')
  }
}
