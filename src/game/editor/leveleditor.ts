// Port of PS2-mari0-playland's lib/leveleditor.js, running on the
// 5velte-ps2 runtime. Same layout (640x448 virtual screen, 448x224 map
// viewport centered on the cursor, 190px side panel at x=450), same
// controls (D-pad move, CROSS/jump place, SQUARE/TRIANGLE cycle sprite,
// SELECT toggles tiles/objects mode, START saves & plays).
//
// Deliberate deviations from the PS2 original:
// - GID math honors ts.firstgid instead of assuming 1.
// - The map render is culled to the viewport (the PS2 looped every cell).
// - Cursor movement gets key-repeat pacing (instant step on press, then
//   ~20 steps/sec after a short hold) instead of 60 cells/sec.
// - Panel colors are flipped for the GB bitmap font (dark glyphs need a
//   light panel; the PS2 drew gray TTF text on black), and the cursor /
//   object markers render half-transparent instead of PS2-opaque.
// - Tiles the game strips at load (rotating coins etc.) are whatever the
//   cached map JSON holds — the editor clones that JSON, so saving cannot
//   destroy data the way the PS2 build's live-fgData save could.

import type { PS2Runtime, PS2ImageInstance, PS2FontInstance } from '5velte-ps2'
import { poll } from './input'
import type { TilesetInfo } from './tiled'

export interface LevelEditorDeps {
  /** the tileset as a 5velte-ps2 Image (crop-drawn for palette + map) */
  tilesetImage: PS2ImageInstance
  ts: TilesetInfo
  /** deep-cloned Tiled map JSON — mutated in place */
  level: any
  /** decoded GIDs of the editable tile layer — mutated in place */
  fgData: Uint32Array
  font: PS2FontInstance
  /** player position in world pixels, for the initial cursor placement */
  player: { x: number; y: number }
  /** name of the layer fgData was decoded from */
  fgLayerName: string
}

export type EditorResult =
  | 'leveleditor'
  | { nextState: 'load_new_level'; spawnPos: { x: number; y: number } }

const VIEW_W = 448
const VIEW_H = 224
const PANEL_X = 450
const PANEL_W = 190
const SCREEN_W = 640
const SCREEN_H = 448

const REPEAT_DELAY = 10 // frames held before auto-repeat kicks in
const REPEAT_EVERY = 3 // frames between repeated steps

export function createLevelEditor(ps2: PS2Runtime, deps: LevelEditorDeps) {
  const { tilesetImage, ts, level, fgData, font, fgLayerName } = deps
  const TILE_SIZE = ts.tileWidth

  let square_x = 0
  let square_y = 0
  let cur_sprite = 0
  let editMode: 'tiles' | 'objects' = 'tiles'
  let firstFrame = true
  let moveHeldFrames = 0
  // the SELECT+UP chord that opened the editor is usually still held on the
  // first frames — ignore input until the pad goes neutral once, so the
  // cursor doesn't march away and the mode doesn't toggle on entry
  let inputArmed = false

  let TILES: Array<{ id: number; x: number; y: number }> = []

  const { Draw, Color } = ps2

  const COLOR_CLEAR = Color.new(0, 0, 0)
  const COLOR_PANEL = Color.new(224, 248, 208) // GB "white" — dark glyphs need a light panel
  const COLOR_PREVIEW_BG = Color.new(64, 64, 64)
  const COLOR_OBJECT = Color.new(0, 0, 255, 64)
  const COLOR_CURSOR = Color.new(255, 0, 0, 64)

  function initializeTileList() {
    // honor margin/spacing — the Vegas castle tileset is extruded (1px
    // margin, 2px spacing); the PS2 original assumed 0/0
    TILES = []
    for (let i = 0; i < ts.tilecount; i++) {
      const x = ts.margin + (i % ts.columns) * (ts.tileWidth + ts.spacing)
      const y = ts.margin + Math.floor(i / ts.columns) * (ts.tileHeight + ts.spacing)
      TILES.push({ id: i, x, y })
    }
  }

  function updatePads(pad: ReturnType<typeof poll>) {
    const anyDirHeld = pad.left || pad.right || pad.up || pad.down
    moveHeldFrames = anyDirHeld ? moveHeldFrames + 1 : 0
    const anyDirFresh = pad.leftPressed || pad.rightPressed || pad.upPressed || pad.downPressed
    const step =
      anyDirFresh || (moveHeldFrames > REPEAT_DELAY && moveHeldFrames % REPEAT_EVERY === 0)

    if (step) {
      if (pad.left && square_x > 0) square_x--
      if (pad.right && square_x < level.width - 1) square_x++
      if (pad.up && square_y > 0) square_y--
      if (pad.down && square_y < level.height - 1) square_y++
    }

    if (pad.runPressed) {
      cur_sprite = (cur_sprite - 1 + TILES.length) % TILES.length
    }
    if (pad.boostPressed) {
      cur_sprite = (cur_sprite + 1) % TILES.length
    }

    if (pad.jumpPressed) {
      if (editMode === 'tiles') {
        const selectedTile = TILES[cur_sprite]
        if (selectedTile) {
          const tileIndex = square_y * level.width + square_x
          fgData[tileIndex] = ts.firstgid + selectedTile.id
        }
      } else {
        const newObject = {
          height: 5,
          id: level.nextobjectid++,
          name: 'platformMovingUpAndDown',
          properties: { distance: 80 },
          propertytypes: { distance: 'int' },
          rotation: 0,
          type: 'platformMovingUpAndDown',
          visible: true,
          width: 24,
          x: square_x * TILE_SIZE,
          y: square_y * TILE_SIZE,
        }
        const objectLayer = level.layers.find((l: any) => l.name === 'objects')
        objectLayer.objects.push(newObject)
      }
    }

    if (pad.select) {
      editMode = editMode === 'tiles' ? 'objects' : 'tiles'
    }
  }

  function frame(): EditorResult {
    if (firstFrame) {
      square_x = Math.max(0, Math.min(level.width - 1, Math.floor(deps.player.x / TILE_SIZE)))
      square_y = Math.max(0, Math.min(level.height - 1, Math.floor(deps.player.y / TILE_SIZE)))
      firstFrame = false
    }

    if (TILES.length !== ts.tilecount) {
      initializeTileList()
      cur_sprite = 0
    }

    let objectLayer = level.layers.find((l: any) => l.name === 'objects')
    if (!objectLayer) {
      objectLayer = {
        draworder: 'topdown',
        name: 'objects',
        objects: [],
        opacity: 1,
        type: 'objectgroup',
        visible: true,
        x: 0,
        y: 0,
      }
      level.layers.push(objectLayer)
    }

    const pad = poll(ps2)
    if (!inputArmed) {
      inputArmed =
        !pad.left && !pad.right && !pad.up && !pad.down && !pad.select && !pad.start
    } else {
      updatePads(pad)
    }

    const camX = square_x * TILE_SIZE - VIEW_W / 2 + TILE_SIZE / 2
    const camY = square_y * TILE_SIZE - VIEW_H / 2 + TILE_SIZE / 2

    // AthenaEnv clears the frame implicitly — do it explicitly here
    Draw.rect(0, 0, SCREEN_W, SCREEN_H, COLOR_CLEAR)

    // map tiles, culled to the viewport left of the panel
    const firstTx = Math.max(0, Math.floor(camX / TILE_SIZE))
    const lastTx = Math.min(level.width - 1, Math.ceil((camX + PANEL_X) / TILE_SIZE))
    const firstTy = Math.max(0, Math.floor(camY / TILE_SIZE))
    const lastTy = Math.min(level.height - 1, Math.ceil((camY + SCREEN_H) / TILE_SIZE))
    for (let y = firstTy; y <= lastTy; y++) {
      for (let x = firstTx; x <= lastTx; x++) {
        const gid = fgData[y * level.width + x]
        const tile = gid >= ts.firstgid ? TILES[gid - ts.firstgid] : undefined
        if (tile) {
          tilesetImage.startx = tile.x
          tilesetImage.starty = tile.y
          tilesetImage.endx = tile.x + TILE_SIZE
          tilesetImage.endy = tile.y + TILE_SIZE
          tilesetImage.draw(x * TILE_SIZE - camX, y * TILE_SIZE - camY, TILE_SIZE, TILE_SIZE)
        }
      }
    }

    // object markers
    for (const obj of objectLayer.objects) {
      Draw.rect(obj.x - camX, obj.y - camY, obj.width, obj.height, COLOR_OBJECT)
    }

    // cursor
    Draw.rect(
      square_x * TILE_SIZE - camX,
      square_y * TILE_SIZE - camY,
      TILE_SIZE,
      TILE_SIZE,
      COLOR_CURSOR
    )

    // side panel (drawn after the map so nothing bleeds over it)
    Draw.rect(PANEL_X, 0, PANEL_W, SCREEN_H, COLOR_PANEL)
    font.print(460, 15, 'A - ADD TILE/OBJECT')
    font.print(460, 45, 'START - SAVE + PLAY')
    font.print(460, 75, 'D-PAD - MOVE')
    font.print(460, 105, 'Y/X - CHANGE SPRITE')
    font.print(460, 135, 'SELECT - CHANGE MODE')
    font.print(460, 165, `CURSOR ${square_x},${square_y}`)
    font.print(460, 195, `TILE ID ${cur_sprite}`)
    font.print(460, 225, `MODE ${editMode.toUpperCase()}`)
    font.print(460, 405, 'SEL+START - EXIT')

    // selected-tile preview
    const selectedTile = TILES[cur_sprite]
    if (selectedTile) {
      Draw.rect(470, 250, 150, 150, COLOR_PREVIEW_BG)
      tilesetImage.startx = selectedTile.x
      tilesetImage.starty = selectedTile.y
      tilesetImage.endx = selectedTile.x + TILE_SIZE
      tilesetImage.endy = selectedTile.y + TILE_SIZE
      tilesetImage.draw(470, 250, 150, 150)
    }

    if (inputArmed && pad.start) {
      firstFrame = true
      return {
        nextState: 'load_new_level',
        spawnPos: { x: square_x * TILE_SIZE, y: square_y * TILE_SIZE },
      }
    }

    return 'leveleditor'
  }

  return { frame }
}
