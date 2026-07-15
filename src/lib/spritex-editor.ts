// CMG-embedded editor handoff. When mario-sp runs inside the CMG launcher,
// the OSD "Level Editor" action hands the current level to SpriteX (the
// launcher swaps the game frame to it and relays the payload as
// spritex-tilemap-preload until SpriteX acks — the same bridge its
// sprite-picker uses). SELECT+UP still opens the in-game editor everywhere.
//
// Payload: the whole level "family" — the current map plus every map
// reachable through portal objects whose names are tilemap cache keys
// (level1 → level1Room1 + level1Room2), so a save in SpriteX can update all
// of the level's tilemap files:
//   { type: 'cmg-open-spritex-tilemap',
//     primary: <current level key>,
//     maps: [{ key, path, json, png }] }
// path is the game-relative file from pack.json (assets/maps/level1.json),
// null for maps that only live in the RTDB; png is the tileset as a dataURL.
// The launcher stamps the gameId itself from the mounted catalog entry.

import type Phaser from 'phaser'
import { tilesetDataURLFor, tilesetTextureFor } from '../game/level-assets'

export interface SpriteXMapPayload {
  key: string
  path: string | null
  json: any
  png: string | null
}

export function isEmbeddedInCmg(): boolean {
  return typeof window !== 'undefined' && window.parent !== window
}

/** pack.json's tilemap key → file mapping (e.g. level1 → assets/maps/level1.json). */
let packFilesPromise: Promise<Map<string, string>> | null = null
function packFilesByKey(): Promise<Map<string, string>> {
  // the pack never changes within a session — fetch it once
  packFilesPromise ??= (async () => {
    const byKey = new Map<string, string>()
    try {
      const pack = await (await fetch('assets/pack.json')).json()
      for (const section of Object.values<any>(pack ?? {})) {
        for (const file of section?.files ?? []) {
          if (file?.type === 'tilemapTiledJSON' && file.key && typeof file.url === 'string') {
            // pack.json writes './assets/maps/…' — the launcher wants the
            // game-relative path without the leading './'
            byKey.set(file.key, file.url.replace(/^\.\//, ''))
          }
        }
      }
    } catch {
      // no pack (RTDB-only boot) — every map reports path: null
    }
    return byKey
  })()
  return packFilesPromise
}

/** The level and every map its portals (transitively) lead to. */
function levelFamily(scene: Phaser.Scene, levelKey: string): string[] {
  const family: string[] = []
  const queue = [levelKey]
  while (queue.length > 0) {
    const key = queue.shift()!
    if (family.includes(key) || !scene.cache.tilemap.exists(key)) continue
    family.push(key)
    const json = scene.cache.tilemap.get(key).data
    for (const layer of json?.layers ?? []) {
      if (layer?.type !== 'objectgroup') continue
      for (const obj of layer.objects ?? []) {
        if (obj?.type === 'portal' && typeof obj.name === 'string') queue.push(obj.name)
      }
    }
  }
  return family
}

/**
 * Post the current level's tilemaps to the CMG launcher so it can open
 * SpriteX preloaded with them. True when the request was posted.
 */
export async function openLevelInSpriteX(
  scene: Phaser.Scene,
  levelKey: string
): Promise<boolean> {
  if (!isEmbeddedInCmg()) return false

  const paths = await packFilesByKey()
  // one dataURL per texture — the family usually shares a tileset
  const pngByTexture = new Map<string, string | null>()
  const maps: SpriteXMapPayload[] = levelFamily(scene, levelKey).map((key) => {
    const textureKey = tilesetTextureFor(scene, key).key
    if (!pngByTexture.has(textureKey)) {
      pngByTexture.set(textureKey, tilesetDataURLFor(scene, key))
    }
    return {
      key,
      path: paths.get(key) ?? null,
      // the cache's copy, so unsaved Save & Play edits ride along
      json: scene.cache.tilemap.get(key).data,
      png: pngByTexture.get(textureKey) ?? null,
    }
  })
  if (maps.length === 0) return false

  try {
    window.parent.postMessage(
      { type: 'cmg-open-spritex-tilemap', primary: levelKey, maps },
      '*'
    )
    return true
  } catch {
    return false
  }
}
