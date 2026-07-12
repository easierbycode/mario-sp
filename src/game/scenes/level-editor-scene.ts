// In-game level editor — the PS2-mari0-playland editor running on the
// 5velte-ps2 AthenaEnv shim. Launched from GameScene (SELECT+UP chord, SNES
// SELECT+L2, SHIFT+↑ on keyboard, or the CMG OSD "Level Editor" action);
// GameScene pauses/hides itself and sleeps the HUD while this scene owns
// the screen at the PS2's virtual 640x448 mode.
//
// START saves: the edited Tiled JSON replaces the cached tilemap (so the
// restarted GameScene plays it immediately) and is persisted to the RTDB at
// /maps/<levelKey> alongside the atlas records. SELECT+UP / ESC exits
// without saving.

import Phaser from 'phaser'
import { createRuntime, type PS2Runtime, type PS2ImageInstance } from '5velte-ps2'
import { createPhaserHost, type PadSource } from '5velte-ps2/phaser'
import { consumeEditorRequest } from '../../lib/cmg'
import { gamepad, BUTTON_INDEXES } from '../../lib/gamepad.svelte'
import { touch } from '../../lib/touch.svelte'
import { saveRtdbMap } from '../../lib/rtdb-maps'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'
import { tilesetTextureFor } from '../level-assets'
import { createLevelEditor, type EditorResult } from '../editor/leveleditor'
import { decodeLayer, findEditableTileLayer, tilesetInfo, writeLayerData } from '../editor/tiled'

const SCREEN = { width: 640, height: 448 }

// PS2 digital button masks (mirrors 5velte-ps2's Pads constants)
const MASK = {
  SELECT: 0x0001,
  START: 0x0008,
  UP: 0x0010,
  RIGHT: 0x0020,
  DOWN: 0x0040,
  LEFT: 0x0080,
  TRIANGLE: 0x1000,
  CROSS: 0x4000,
  SQUARE: 0x8000,
} as const

interface LaunchData {
  levelKey: string
  playerX: number
  playerY: number
}

export class LevelEditorScene extends Phaser.Scene {
  private levelKey!: string
  private level: any
  private fgData!: Uint32Array
  private fgLayerName!: string
  private textureKey!: string

  private ps2!: PS2Runtime
  private destroyHost!: () => void
  private editorResult: EditorResult = 'leveleditor'

  private keys = new Map<string, Phaser.Input.Keyboard.Key>()
  private held = new Set<number>()
  private fresh = new Set<number>()
  /** SELECT+START — leave without saving (works on pad, touch, and keyboard) */
  private discardRequested = false

  constructor() {
    super({ key: 'LevelEditorScene' })
  }

  init(data: LaunchData): void {
    this.levelKey = data.levelKey
  }

  create(data: LaunchData): void {
    // edit a clone of the cached Tiled JSON — nothing touches the live map
    // until Save & Play swaps the cache entry
    this.level = structuredClone(this.cache.tilemap.get(this.levelKey).data)

    const ts = tilesetInfo(this.level, 'tiles')
    const fgLayer = findEditableTileLayer(this.level)
    if (!fgLayer) throw new Error(`LevelEditorScene: no tile layer in ${this.levelKey}`)
    this.fgLayerName = fgLayer.name
    this.fgData = decodeLayer(this.level, fgLayer)!

    this.textureKey = tilesetTextureFor(this, this.levelKey).key

    // PS2 virtual mode — restored on exit
    this.scale.setGameSize(SCREEN.width, SCREEN.height)

    for (const [name, code] of Object.entries({
      up: 'UP',
      down: 'DOWN',
      left: 'LEFT',
      right: 'RIGHT',
      place: 'SPACE',
      prev: 'C',
      next: 'X',
      mode: 'SHIFT',
      save: 'S',
      exit: 'ESC',
    })) {
      this.keys.set(name, this.input.keyboard!.addKey(code))
    }

    const pads: PadSource = {
      held: (mask) => this.held.has(mask),
      fresh: (mask) => this.fresh.has(mask),
    }

    const { host, destroy } = createPhaserHost({
      scene: this,
      screen: SCREEN,
      pads,
      resolveTexture: () => this.textureKey,
      resolveFont: () => ({ key: 'font' }),
    })
    this.destroyHost = destroy
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyHost())

    this.ps2 = createRuntime(host)

    const editor = createLevelEditor(this.ps2, {
      tilesetImage: new this.ps2.Image('tileset') as PS2ImageInstance,
      ts,
      level: this.level,
      fgData: this.fgData,
      font: new this.ps2.Font('font'),
      player: { x: data.playerX, y: data.playerY },
      fgLayerName: this.fgLayerName,
    })

    this.ps2.Screen.display(() => {
      this.editorResult = editor.frame()
    })
  }

  update(): void {
    this.snapshotInput()

    // a CMG OSD "Level Editor" press while already editing shouldn't queue
    // up a re-open for after we exit — drain it
    consumeEditorRequest()

    // leave without saving: SELECT+START, or ESC. (SELECT+UP is NOT an exit
    // chord — SELECT toggles the edit mode and UP moves the cursor, so that
    // combination occurs naturally while editing.)
    if (this.discardRequested || Phaser.Input.Keyboard.JustDown(this.keys.get('exit')!)) {
      this.exitEditor(false)
      return
    }

    this.ps2.tick()

    const result = this.editorResult
    if (typeof result === 'object' && result.nextState === 'load_new_level') {
      this.saveAndPlay(result.spawnPos)
    }
  }

  /** Merge gamepad / touch / keyboard into PS2 button-mask sets, once per frame. */
  private snapshotInput(): void {
    this.held.clear()
    this.fresh.clear()

    const key = (name: string) => this.keys.get(name)!
    const set = (mask: number, heldNow: boolean, freshNow: boolean) => {
      if (heldNow) this.held.add(mask)
      if (freshNow) this.fresh.add(mask)
    }

    const dir = (mask: number, action: 'up' | 'down' | 'left' | 'right', k: string) =>
      set(
        mask,
        gamepad.isDown(action) || touch.isDown(action) || key(k).isDown,
        gamepad.justPressed(action) || touch.justPressed(action) || Phaser.Input.Keyboard.JustDown(key(k))
      )

    dir(MASK.UP, 'up', 'up')
    dir(MASK.DOWN, 'down', 'down')
    dir(MASK.LEFT, 'left', 'left')
    dir(MASK.RIGHT, 'right', 'right')

    set(
      MASK.CROSS,
      gamepad.isDown('jump') || touch.isDown('jump') || key('place').isDown,
      gamepad.justPressed('jump') || touch.justPressed('jump') || Phaser.Input.Keyboard.JustDown(key('place'))
    )
    set(
      MASK.SQUARE,
      gamepad.isDown('run') || touch.isDown('run') || key('prev').isDown,
      gamepad.justPressed('run') || touch.justPressed('run') || Phaser.Input.Keyboard.JustDown(key('prev'))
    )
    // TRIANGLE has no mapped action — read the raw top face button (SNES X)
    set(
      MASK.TRIANGLE,
      gamepad.buttonIsDown(BUTTON_INDEXES.FACE_TOP) || key('next').isDown,
      gamepad.buttonJustPressed(BUTTON_INDEXES.FACE_TOP) || Phaser.Input.Keyboard.JustDown(key('next'))
    )
    set(
      MASK.SELECT,
      gamepad.isDown('select') || touch.isDown('select') || key('mode').isDown,
      gamepad.justPressed('select') || touch.justPressed('select') || Phaser.Input.Keyboard.JustDown(key('mode'))
    )
    set(
      MASK.START,
      gamepad.isDown('start') || touch.isDown('start') || key('save').isDown,
      gamepad.justPressed('start') || touch.justPressed('start') || Phaser.Input.Keyboard.JustDown(key('save'))
    )

    // SELECT+START = discard & exit — intercept it so the editor never sees
    // the START edge as a save
    this.discardRequested = this.held.has(MASK.SELECT) && this.fresh.has(MASK.START)
    if (this.held.has(MASK.SELECT)) {
      this.fresh.delete(MASK.START)
      this.held.delete(MASK.START)
    }
  }

  private saveAndPlay(spawnPos: { x: number; y: number }): void {
    const fgLayer = this.level.layers.find((l: any) => l.name === this.fgLayerName)
    writeLayerData(fgLayer, this.fgData)

    // hot-swap the cached map — the restarted GameScene re-parses it
    this.cache.tilemap.remove(this.levelKey)
    this.cache.tilemap.add(this.levelKey, {
      format: Phaser.Tilemaps.Formats.TILED_JSON,
      data: this.level,
    })

    // persist to the RTDB alongside the atlas records (fire-and-forget);
    // if the network write fails, keep a local backup so the edits survive
    const level = this.level
    const levelKey = this.levelKey
    saveRtdbMap(levelKey, level, this.tilesetDataURL()).then((ok) => {
      if (!ok) {
        try {
          localStorage.setItem(`mario-sp:map-backup:${levelKey}`, JSON.stringify(level))
        } catch {}
      }
      console.log(
        ok
          ? `🗺️ map saved to RTDB: maps/${levelKey}`
          : `🗺️ RTDB save failed for maps/${levelKey} — backup kept in localStorage (map still plays from the local cache)`
      )
    })

    this.registry.set('spawn', {
      x: spawnPos.x,
      y: Math.max(0, spawnPos.y - 16),
      dir: 'down',
    })

    this.exitEditor(true)
  }

  private exitEditor(restartGame: boolean): void {
    this.scale.setGameSize(GAME_WIDTH, GAME_HEIGHT)
    this.scene.setVisible(true, 'GameScene')
    this.scene.wake('HUDScene')
    this.scene.resume('GameScene')
    if (restartGame) this.scene.get('GameScene').scene.restart()
    this.scene.stop()
  }

  private tilesetDataURL(): string | null {
    try {
      const source = this.textures.get(this.textureKey).getSourceImage() as
        | HTMLImageElement
        | HTMLCanvasElement
      const canvas = document.createElement('canvas')
      canvas.width = source.width
      canvas.height = source.height
      canvas.getContext('2d')!.drawImage(source, 0, 0)
      return canvas.toDataURL('image/png')
    } catch {
      return null
    }
  }
}
