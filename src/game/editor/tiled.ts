// Tiled-JSON helpers — a TypeScript port of PS2-mari0-playland's lib/tiled.js
// (the parts the level editor needs). Handles both map vintages this repo
// ships: old Tiled 1.1 base64 layers + `tileproperties` maps (level1) and
// new Tiled 1.10+ plain-array layers + `tiles[]` property arrays (level4-2).

export interface TilesetInfo {
  name: string
  image: string
  tileWidth: number
  tileHeight: number
  columns: number
  margin: number
  spacing: number
  firstgid: number
  tilecount: number
  /** local tile id -> { collide?: boolean, ... } */
  tileproperties: Record<number, Record<string, unknown>>
}

export function findLayer(level: any, name: string): any | null {
  return level?.layers?.find((l: any) => l.name === name) ?? null
}

/** The editable tile layer: foregroundLayer (GB maps), ground (Vegas), or the first tile layer. */
export function findEditableTileLayer(level: any): any | null {
  return (
    findLayer(level, 'foregroundLayer') ??
    findLayer(level, 'ground') ??
    level?.layers?.find((l: any) => l.type === 'tilelayer') ??
    null
  )
}

export function tilesetInfo(level: any, tilesetName: string): TilesetInfo {
  const tilesets = level.tilesets ?? []
  let ts = tilesets.find((t: any) => t.name === tilesetName)
  if (!ts) ts = tilesets[0]
  if (!ts) throw new Error('tilesetInfo: map has no tilesets')

  let firstgid = ts.firstgid
  if (firstgid === undefined) {
    firstgid = 1
    for (const other of tilesets) {
      if (other === ts) break
      firstgid += other.tilecount ?? 0
    }
  }

  const tileproperties: Record<number, Record<string, unknown>> = {}
  if (ts.tileproperties) {
    // old Tiled 1.1 style: { "16": { collide: true } }
    for (const [id, props] of Object.entries(ts.tileproperties)) {
      tileproperties[Number(id)] = { ...(props as object) }
    }
  } else if (Array.isArray(ts.tiles)) {
    // new style: tiles: [{ id, properties: [{name,type,value}] }]
    for (const tile of ts.tiles) {
      const props: Record<string, unknown> = {}
      for (const p of tile.properties ?? []) props[p.name] = p.value
      tileproperties[tile.id] = props
    }
  }

  return {
    name: ts.name,
    image: ts.image,
    tileWidth: ts.tilewidth ?? level.tilewidth,
    tileHeight: ts.tileheight ?? level.tileheight,
    columns: ts.columns,
    margin: ts.margin ?? 0,
    spacing: ts.spacing ?? 0,
    firstgid,
    tilecount: ts.tilecount,
    tileproperties,
  }
}

/**
 * Decode a tile layer's data to a Uint32Array of GIDs. Accepts the plain
 * number-array form (CSV encoding / editor-saved maps) and uncompressed
 * base64 little-endian uint32s (old GB maps).
 */
export function decodeLayer(level: any, layer: any): Uint32Array | null {
  if (!layer || layer.type !== 'tilelayer') return null
  if (Array.isArray(layer.data)) return Uint32Array.from(layer.data)
  if (typeof layer.data === 'string') {
    const bytes = base64ToBytes(layer.data)
    const out = new Uint32Array(bytes.length >> 2)
    for (let i = 0; i < out.length; i++) {
      const o = i * 4
      out[i] = (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | ((bytes[o + 3] << 24) >>> 0)) >>> 0
    }
    return out
  }
  return null
}

/**
 * Write GIDs back onto the layer as a plain number array. Unlike the PS2
 * editor (which left a stale `encoding: "base64"` behind), the encoding and
 * compression keys are dropped so Phaser's Tiled parser reads it as CSV data.
 */
export function writeLayerData(layer: any, data: Uint32Array): void {
  layer.data = Array.from(data)
  delete layer.encoding
  delete layer.compression
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '')
  const raw = atob(clean)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
