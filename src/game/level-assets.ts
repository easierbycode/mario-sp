// Which loaded texture backs a level's embedded tileset (always named
// 'tiles' inside the map JSON). Shared by GameScene, the level editor, and
// the RTDB map loader.

import type Phaser from 'phaser'

export interface TilesetTexture {
  key: string
  /** extra addTilesetImage args for extruded tilesets: [tileW, tileH, margin, spacing] */
  args?: [number, number, number, number]
}

export function tilesetTextureFor(scene: Phaser.Scene, levelKey: string): TilesetTexture {
  // maps imported at runtime from the RTDB register their tileset PNG
  // under map-<key>
  if (scene.textures.exists(`map-${levelKey}`)) return { key: `map-${levelKey}` }
  // the Vegas maps share the extruded castle tileset (1px margin, 2px spacing)
  if (levelKey.startsWith('levelVegas')) return { key: 'tileset', args: [16, 16, 1, 2] }
  // level4-2 ships its own 42-tile playland tileset
  if (levelKey === 'level4-2') return { key: 'tiles42' }
  return { key: 'tiles' }
}
