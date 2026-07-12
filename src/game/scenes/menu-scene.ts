
import Phaser from 'phaser'
import { gamepad } from '../../lib/gamepad.svelte'
import { touch } from '../../lib/touch.svelte'
import Constants from '../constants'


export class MenuScene extends Phaser.Scene {
  private startKey: Phaser.Input.Keyboard.Key
  private bitmapTexts: Phaser.GameObjects.BitmapText[] = []

  constructor() {
    super({
      key: 'MenuScene',
    })
  }

  init(): void {
    this.startKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.S
    )
    this.startKey.isDown = false
    this.initGlobalDataManager()
  }

  create(): void {
    this.add.image(0, 0, 'title').setOrigin(0, 0)

    this.bitmapTexts.push(
      this.add.bitmapText(
        this.sys.canvas.width / 2 - 22,
        105,
        'font',
        'START',
        8
      )
    )
  }

  update(): void {
    if (
      this.startKey.isDown ||
      gamepad.justPressed('start') ||
      gamepad.justPressed('jump') ||
      touch.justPressed('start') ||
      touch.justPressed('jump') ||
      // the dynamic touch scheme makes the FIRST right-half touch B (run),
      // so a single tap must also start from the title screen
      touch.justPressed('run')
    ) {
      this.scene.start('HUDScene')
      this.scene.start('GameScene')
      this.scene.bringToTop('HUDScene')
    }
  }

  private levelOpts(level: string): {
    physics       : string
    physicsScale  : number
    spawn         : { x: number; y: number; dir: string }
  } {
    switch (level) {
      case 'levele1':
        return Constants.SMA4
      case 'levelVegas':
      case 'levelVegasRoom1':
        return Constants.VEGAS
      default:
        return Constants.GB
    }
  }

  private initGlobalDataManager(): void {
    this.registry.set('time', 400)
    this.registry.set('level', 'level1')

    const { physics, physicsScale, spawn } = this.levelOpts(this.registry.get('level'))

    this.registry.set('world', '1-1')
    this.registry.set('worldTime', 'WORLD TIME')
    this.registry.set('score', 0)
    this.registry.set('coins', 0)
    this.registry.set('lives', 2)
    this.registry.set('spawn', spawn)
    this.registry.set('marioSize', 'small')
    this.registry.set('physics', physics)
    // GB levels use 8px tiles — E1 (16px tiles) raises this to 2
    this.registry.set('physicsScale', physicsScale)
  }
}
