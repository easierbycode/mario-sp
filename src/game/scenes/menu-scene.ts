
import Phaser from 'phaser'
import { gamepad } from '../../lib/gamepad.svelte'
import { touch } from '../../lib/touch.svelte'
import Constants from '../constants'


export class MenuScene extends Phaser.Scene {
  private startKey: Phaser.Input.Keyboard.Key
  private selectKey: Phaser.Input.Keyboard.Key
  private upKey: Phaser.Input.Keyboard.Key
  private bitmapTexts: Phaser.GameObjects.BitmapText[] = []
  private skinPreview: Phaser.GameObjects.Sprite

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
    this.selectKey = this.input.keyboard.addKey(
      gamepad.keyFor('select') ?? 'SHIFT'
    )
    this.selectKey.isDown = false
    this.upKey = this.input.keyboard.addKey(gamepad.keyFor('up') ?? 'UP')
    this.upKey.isDown = false
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

    // SELECT swaps mario for his SML2 space suit — preview him on the
    // title's ground band
    this.skinPreview = this.add
      .sprite(this.sys.canvas.width / 2, 136, 'mario', 0)
      .setOrigin(0.5, 1)
    this.updateSkinPreview()
  }

  update(): void {
    // SELECT + UP together (either order) toggles the space suit
    const selectFresh =
      Phaser.Input.Keyboard.JustDown(this.selectKey) ||
      gamepad.justPressed('select') ||
      touch.justPressed('select')
    const upFresh =
      Phaser.Input.Keyboard.JustDown(this.upKey) ||
      gamepad.justPressed('up') ||
      touch.justPressed('up')
    const selectHeld =
      this.selectKey.isDown || gamepad.isDown('select') || touch.isDown('select')
    const upHeld = this.upKey.isDown || gamepad.isDown('up') || touch.isDown('up')
    // SNES pads also toggle it with SELECT + L2 (chord detected in poll())
    if (
      (selectHeld && upHeld && (selectFresh || upFresh)) ||
      gamepad.justPressed('suit')
    ) {
      const next =
        this.registry.get('skin') === 'space' ? 'classic' : 'space'
      this.registry.set('skin', next)
      this.updateSkinPreview()
    }

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

  private updateSkinPreview(): void {
    if (this.registry.get('skin') === 'space') {
      this.skinPreview.setTexture('space-mario', 'atlas_s0')
    } else {
      this.skinPreview.setTexture('mario', 0)
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
    // ?map=<key> boots into a map imported from the RTDB (GameScene fetches
    // /maps/<key> when the key isn't in the local cache)
    const urlMap =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('map')
        : null
    this.registry.set('level', urlMap || 'level1')
    // the SELECT skin choice survives game overs — only seed the default
    if (!this.registry.has('skin')) {
      this.registry.set('skin', 'classic')
    }

    const { physics, physicsScale, spawn } = this.levelOpts(this.registry.get('level'))

    this.registry.set('world', urlMap || '1-1')
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
