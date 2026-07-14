// Port of PS2-mari0-playland's lib/leveleditor.js, running on the
// 5velte-ps2 runtime — restyled after Sonic 2's debug mode. Full-screen
// map view centered on the cursor, and the cursor IS the selected tile
// (blinking over a dark cell), with a one-line readout strip up top
// instead of the PS2 build's 190px help panel. Same verbs as the PS2
// original: D-pad move, CROSS/jump place, SQUARE/TRIANGLE cycle sprite,
// SELECT toggles tiles/objects mode, START saves & plays.
//
// Added for the web build: B (CIRCLE) steps the selected tile forward;
// holding B (or a locked/turbo B) while pressing A (CROSS) steps it back.
//
// Analog up/down steps a zoom preview (2x..8x): the selected tile grows
// into a translucent ghost centered on the cursor, card-flipping through
// each size change.
//
// Deliberate deviations from the PS2 original:
// - GID math honors ts.firstgid instead of assuming 1.
// - The map render is culled to the viewport (the PS2 looped every cell).
// - Cursor movement gets key-repeat pacing (instant step on press, then
//   ~20 steps/sec after a short hold) instead of 60 cells/sec.
// - Tiles the game strips at load (rotating coins etc.) are whatever the
//   cached map JSON holds — the editor clones that JSON, so saving cannot
//   destroy data the way the PS2 build's live-fgData save could.

import type { PS2Runtime, PS2ImageInstance, PS2FontInstance } from '5velte-ps2'
import { poll } from './input'
import type { TilesetInfo } from './tiled'

export interface LevelEditorDeps {
  /** the tileset as a 5velte-ps2 Image (crop-drawn for cursor + map) */
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

const SCREEN_W = 640
const SCREEN_H = 448
const HUD_H = 22

const REPEAT_DELAY = 10 // frames held before auto-repeat kicks in
const REPEAT_EVERY = 3 // frames between repeated steps

const ZOOM_MAX = 8
const ZOOM_REPEAT = 12 // frames between zoom steps while the stick stays deflected
const AXIS_ON = 64 // stick deflection (of ±127) that counts as up/down
const FLIP_FRAMES = 10 // length of the card-flip between zoom sizes

export function createLevelEditor(ps2: PS2Runtime, deps: LevelEditorDeps) {
  const { tilesetImage, ts, level, fgData, font, fgLayerName } = deps
  const TILE_SIZE = ts.tileWidth

  let square_x = 0
  let square_y = 0
  let cur_sprite = 0
  let editMode: 'tiles' | 'objects' = 'tiles'
  let firstFrame = true
  let moveHeldFrames = 0
  let frameCount = 0
  // the SELECT+UP chord that opened the editor is usually still held on the
  // first frames — ignore input until the pad goes neutral once, so the
  // cursor doesn't march away and the mode doesn't toggle on entry
  let inputArmed = false

  // zoom ghost: analog up/down steps 1x..8x; changes card-flip over
  // FLIP_FRAMES frames from zoomFrom to zoom
  let zoom = 1
  let zoomFrom = 1
  let flipT = FLIP_FRAMES
  let zoomHeldFrames = 0
  let lastZoomDir = 0

  let TILES: Array<{ id: number; x: number; y: number }> = []

  const { Draw, Color } = ps2

  const COLOR_CLEAR = Color.new(0, 0, 0)
  const COLOR_HUD = Color.new(224, 248, 208, 112) // GB "white" — the font's dark glyphs need a light strip
  const COLOR_OBJECT = Color.new(0, 0, 255, 64)
  const COLOR_CURSOR_BACK = Color.new(0, 0, 0, 96) // dark pane so the cursor tile pops on white cells
  const TINT_GHOST = Color.new(255, 255, 255, 56) // "light" overlay — under half strength
  const TINT_OPAQUE = Color.new(255, 255, 255, 128)

  // the zoom ghost magnifies pixels — keep them square
  tilesetImage.filter = ps2.NEAREST

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

  function drawTile(tile: { x: number; y: number }, x: number, y: number, w: number, h: number) {
    tilesetImage.startx = tile.x
    tilesetImage.starty = tile.y
    tilesetImage.endx = tile.x + TILE_SIZE
    tilesetImage.endy = tile.y + TILE_SIZE
    tilesetImage.draw(x, y, w, h)
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

    // analog up/down: step the zoom ghost (up = closer); a direction flip
    // resets the repeat clock so the reversal steps immediately
    const zoomDir = pad.ly < -AXIS_ON ? 1 : pad.ly > AXIS_ON ? -1 : 0
    zoomHeldFrames = zoomDir !== 0 && zoomDir === lastZoomDir ? zoomHeldFrames + 1 : zoomDir !== 0 ? 1 : 0
    lastZoomDir = zoomDir
    if (zoomDir !== 0 && (zoomHeldFrames === 1 || zoomHeldFrames % ZOOM_REPEAT === 0)) {
      const next = Math.max(1, Math.min(ZOOM_MAX, zoom + zoomDir))
      if (next !== zoom) {
        zoomFrom = zoom
        zoom = next
        flipT = 0
      }
    }

    if (pad.runPressed) {
      cur_sprite = (cur_sprite - 1 + TILES.length) % TILES.length
    }
    if (pad.boostPressed) {
      cur_sprite = (cur_sprite + 1) % TILES.length
    }

    // B (CIRCLE): press to step the selected tile up. Holding B (or a
    // locked/turbo B) turns A into "step down" instead of a place — so
    // B alone cycles forward, B+A cycles back. Check the chord first so a
    // same-frame B+A steps down once, rather than the up-then-down canceling.
    const bHeld = pad.circle

    if (pad.jumpPressed && bHeld) {
      cur_sprite = (cur_sprite - 1 + TILES.length) % TILES.length
    } else {
      if (pad.circlePressed) {
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
        !pad.left &&
        !pad.right &&
        !pad.up &&
        !pad.down &&
        !pad.select &&
        !pad.start &&
        Math.abs(pad.ly) <= AXIS_ON
    } else {
      updatePads(pad)
    }
    frameCount++

    const camX = square_x * TILE_SIZE - SCREEN_W / 2 + TILE_SIZE / 2
    const camY = square_y * TILE_SIZE - SCREEN_H / 2 + TILE_SIZE / 2

    // AthenaEnv clears the frame implicitly — do it explicitly here
    Draw.rect(0, 0, SCREEN_W, SCREEN_H, COLOR_CLEAR)

    // map tiles, culled to the full-screen viewport
    const firstTx = Math.max(0, Math.floor(camX / TILE_SIZE))
    const lastTx = Math.min(level.width - 1, Math.ceil((camX + SCREEN_W) / TILE_SIZE))
    const firstTy = Math.max(0, Math.floor(camY / TILE_SIZE))
    const lastTy = Math.min(level.height - 1, Math.ceil((camY + SCREEN_H) / TILE_SIZE))
    for (let y = firstTy; y <= lastTy; y++) {
      for (let x = firstTx; x <= lastTx; x++) {
        const gid = fgData[y * level.width + x]
        const tile = gid >= ts.firstgid ? TILES[gid - ts.firstgid] : undefined
        if (tile) {
          drawTile(tile, x * TILE_SIZE - camX, y * TILE_SIZE - camY, TILE_SIZE, TILE_SIZE)
        }
      }
    }

    // object markers
    for (const obj of objectLayer.objects) {
      Draw.rect(obj.x - camX, obj.y - camY, obj.width, obj.height, COLOR_OBJECT)
    }

    // cursor — Sonic 2 debug style: the thing you're placing, blinking in
    // place. A dark backing pane keeps it findable on any map.
    const cellX = square_x * TILE_SIZE - camX
    const cellY = square_y * TILE_SIZE - camY
    const blinkOn = (frameCount >> 3) & 1
    const selectedTile = TILES[cur_sprite]
    if (editMode === 'tiles') {
      Draw.rect(cellX - 1, cellY - 1, TILE_SIZE + 2, TILE_SIZE + 2, COLOR_CURSOR_BACK)
      if (blinkOn && selectedTile) {
        drawTile(selectedTile, cellX, cellY, TILE_SIZE, TILE_SIZE)
      }
    } else if (blinkOn) {
      // the platform the CROSS press would drop (24x5 marker)
      Draw.rect(cellX, cellY, 24, 5, COLOR_OBJECT)
    }

    // zoom ghost — light overlay of the selected tile at 2x..8x, centered
    // on the cursor; size changes card-flip (width sweeps through zero)
    if (editMode === 'tiles' && selectedTile && (zoom > 1 || flipT < FLIP_FRAMES)) {
      const p = Math.min(1, flipT / FLIP_FRAMES)
      const size = TILE_SIZE * (zoomFrom + (zoom - zoomFrom) * p)
      const w = Math.max(1, size * Math.abs(Math.cos(Math.PI * p)))
      const cx = cellX + TILE_SIZE / 2
      const cy = cellY + TILE_SIZE / 2
      tilesetImage.color = TINT_GHOST
      drawTile(selectedTile, cx - w / 2, cy - size / 2, w, size)
      tilesetImage.color = TINT_OPAQUE
    }
    if (flipT < FLIP_FRAMES) flipT++

    // readout strip — position / tile / mode / zoom, nothing else
    Draw.rect(0, 0, SCREEN_W, HUD_H, COLOR_HUD)
    const what = editMode === 'tiles' ? `TILE ${cur_sprite}` : 'OBJ PLATFORM'
    font.print(6, 3, `X${square_x} Y${square_y}  ${what}  Z${zoom}X`)

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
