
import Phaser from 'phaser'
import { gamepad, BUTTON_INDEXES } from '../../lib/gamepad.svelte'
import { touch } from '../../lib/touch.svelte'
import { listRtdbMapKeys } from '../../lib/rtdb-maps'
import { listLocalMapKeys } from '../../lib/map-store'
import Constants from '../constants'

/** online-levels list layout (160x144 canvas, 8px SML font) */
const LIST_ROWS = 10
const LIST_TOP = 22
const LIST_ROW_H = 11

export class MenuScene extends Phaser.Scene {
  private startKey: Phaser.Input.Keyboard.Key
  private selectKey: Phaser.Input.Keyboard.Key
  private upKey: Phaser.Input.Keyboard.Key
  private downKey: Phaser.Input.Keyboard.Key
  private bitmapTexts: Phaser.GameObjects.BitmapText[] = []
  private skinPreview: Phaser.GameObjects.Sprite

  // ONLINE LEVELS list — RTDB /maps keys merged with the local map store
  private mode: 'title' | 'list' = 'title'
  private listEntries: Array<{ key: string; local: boolean }> = []
  private listStatus = ''
  private listCursor = 0
  private listScroll = 0
  private listObjects: Phaser.GameObjects.GameObject[] = []
  private listRowTexts: Phaser.GameObjects.BitmapText[] = []
  private listFetchId = 0
  // gamepad.justPressed('up'/'down') only fires for button d-pads — SNES-style
  // adapters report theirs on the axes, so derive edges from dpadIsDown too
  private dpadPrev = { up: false, down: false }

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
    this.downKey = this.input.keyboard.addKey(gamepad.keyFor('down') ?? 'DOWN')
    this.downKey.isDown = false
    this.mode = 'title'
    this.listObjects = []
    this.listRowTexts = []
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

    // the SML font only carries space ! - . 0-9 A-Z a-z — keep UI strings
    // inside that set
    this.bitmapTexts.push(
      this.add.bitmapText(
        this.sys.canvas.width / 2 - 64,
        116,
        'font',
        'DOWN-ONLINE LVLS',
        8
      )
    )
  }

  update(): void {
    // d-pad edges derived once per step, shared by both modes
    const dpadUpHeld = gamepad.dpadIsDown('up')
    const dpadDownHeld = gamepad.dpadIsDown('down')
    const dpadUpFresh = dpadUpHeld && !this.dpadPrev.up
    const dpadDownFresh = dpadDownHeld && !this.dpadPrev.down
    this.dpadPrev = { up: dpadUpHeld, down: dpadDownHeld }

    if (this.mode === 'list') {
      this.updateList(dpadUpFresh, dpadDownFresh)
      return
    }

    // SELECT + UP together (either order) toggles the space suit
    const selectFresh =
      Phaser.Input.Keyboard.JustDown(this.selectKey) ||
      gamepad.justPressed('select') ||
      touch.justPressed('select')
    const upFresh =
      Phaser.Input.Keyboard.JustDown(this.upKey) ||
      gamepad.justPressed('up') ||
      dpadUpFresh ||
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

    // DOWN opens the online-levels list (RTDB maps + local copies)
    if (
      !selectHeld &&
      (Phaser.Input.Keyboard.JustDown(this.downKey) ||
        gamepad.justPressed('down') ||
        dpadDownFresh ||
        touch.justPressed('down'))
    ) {
      this.openList()
      return
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
      this.startGame()
    }
  }

  private startGame(): void {
    this.scene.start('HUDScene')
    this.scene.start('GameScene')
    this.scene.bringToTop('HUDScene')
  }

  // ─── ONLINE LEVELS list ────────────────────────────────────────────────

  private openList(): void {
    this.mode = 'list'
    this.listCursor = 0
    this.listScroll = 0
    this.listEntries = []
    this.listStatus = 'LOADING...'

    // GB "white" backing — the SML font's glyphs are dark and vanish on black
    const overlay = this.add
      .rectangle(0, 0, this.sys.canvas.width, this.sys.canvas.height, 0xe0f8d0)
      .setOrigin(0, 0)
    const header = this.add.bitmapText(8, 6, 'font', 'ONLINE LEVELS', 8)
    const footer = this.add.bitmapText(8, 134, 'font', 'A PLAY   B BACK', 8)
    this.listObjects = [overlay, header, footer]
    this.listRowTexts = []
    for (let row = 0; row < LIST_ROWS; row++) {
      const text = this.add.bitmapText(8, LIST_TOP + row * LIST_ROW_H, 'font', '', 8)
      this.listRowTexts.push(text)
      this.listObjects.push(text)
    }
    this.renderList()

    const fetchId = ++this.listFetchId
    Promise.all([listRtdbMapKeys(), listLocalMapKeys()]).then(([online, local]) => {
      // a stale fetch (list closed/reopened, scene stopped) must not paint
      if (fetchId !== this.listFetchId || this.mode !== 'list' || !this.scene.isActive()) return
      const localSet = new Set(local)
      const keys = [...new Set([...(online ?? []), ...local])].sort()
      this.listEntries = keys.map((key) => ({ key, local: localSet.has(key) }))
      this.listStatus =
        keys.length > 0 ? '' : online === null ? 'OFFLINE. NO LEVELS' : 'NO LEVELS FOUND'
      this.renderList()
    })
  }

  private closeList(): void {
    this.listFetchId++
    this.mode = 'title'
    for (const object of this.listObjects) object.destroy()
    this.listObjects = []
    this.listRowTexts = []
  }

  private updateList(dpadUpFresh: boolean, dpadDownFresh: boolean): void {
    const upFresh =
      Phaser.Input.Keyboard.JustDown(this.upKey) ||
      gamepad.justPressed('up') ||
      dpadUpFresh ||
      touch.justPressed('up')
    const downFresh =
      Phaser.Input.Keyboard.JustDown(this.downKey) ||
      gamepad.justPressed('down') ||
      dpadDownFresh ||
      touch.justPressed('down')
    const pickFresh =
      Phaser.Input.Keyboard.JustDown(this.startKey) ||
      gamepad.justPressed('start') ||
      gamepad.justPressed('jump') ||
      touch.justPressed('start') ||
      touch.justPressed('jump')
    const backFresh =
      Phaser.Input.Keyboard.JustDown(this.selectKey) ||
      gamepad.justPressed('select') ||
      gamepad.justPressed('run') ||
      // the physical B button (face-right) — the footer promises "B BACK";
      // raw-read it only while codemonkey.json leaves it unmapped
      (gamepad.buttonMap[BUTTON_INDEXES.FACE_RIGHT] === undefined &&
        gamepad.buttonJustPressed(BUTTON_INDEXES.FACE_RIGHT)) ||
      touch.justPressed('select') ||
      touch.justPressed('run')

    if (backFresh) {
      this.closeList()
      return
    }

    if (this.listEntries.length > 0) {
      if (upFresh) this.moveListCursor(-1)
      if (downFresh) this.moveListCursor(1)
      if (pickFresh) {
        this.startOnlineLevel(this.listEntries[this.listCursor].key)
      }
    }
  }

  private moveListCursor(delta: number): void {
    const count = this.listEntries.length
    this.listCursor = (this.listCursor + delta + count) % count
    if (this.listCursor < this.listScroll) this.listScroll = this.listCursor
    if (this.listCursor >= this.listScroll + LIST_ROWS) {
      this.listScroll = this.listCursor - LIST_ROWS + 1
    }
    this.renderList()
  }

  private renderList(): void {
    for (let row = 0; row < this.listRowTexts.length; row++) {
      const index = this.listScroll + row
      if (row === 0 && this.listStatus && this.listEntries.length === 0) {
        this.listRowTexts[row].setText(this.listStatus)
        continue
      }
      const entry = this.listEntries[index]
      if (!entry) {
        this.listRowTexts[row].setText('')
        continue
      }
      const cursor = index === this.listCursor ? '-' : ' '
      // trailing '.' marks a level with a local copy (playable offline)
      const mark = entry.local ? '.' : ''
      this.listRowTexts[row].setText(`${cursor}${entry.key.slice(0, 16)}${mark}`)
    }
  }

  /** Boot an RTDB-hosted map — GameScene streams it and keeps a local copy. */
  private startOnlineLevel(key: string): void {
    this.registry.set('level', key)
    this.registry.set('rtdbMap', key)
    this.registry.set('rtdbMapLoaded', false)
    this.registry.set('world', key)
    this.startGame()
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
    // an explicit ?map= request loads the RTDB copy even when a shipped map
    // shares the key (that's how edited built-in levels are played back)
    this.registry.set('rtdbMap', urlMap || null)
    this.registry.set('rtdbMapLoaded', false)
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
