// Tiled maps in the RTDB — stored alongside the atlas records, same shape:
//   /maps/<key> = { json: <Tiled map JSON, stringified>, png: <tileset dataURL> }
// mirroring /atlases/<key> = { json, png } (see spriteX). Reads normalize
// the same historical quirks the atlas tooling tolerates: json as object /
// string / double-encoded string, png with or without the data: prefix.

const DATABASE_URL = 'https://evil-invaders-default-rtdb.firebaseio.com'

export interface RtdbMap {
  json: any
  /** tileset PNG as a data: URL, when stored */
  png: string | null
}

/** RTDB keys cannot contain . # $ / [ ] */
export function sanitizeMapKey(key: string): string {
  return key.replace(/[.#$/\[\]]/g, '-')
}

function normalizeJson(value: unknown): any | null {
  let json: any = value
  for (let i = 0; i < 2 && typeof json === 'string'; i++) {
    try {
      json = JSON.parse(json.replace(/^﻿/, ''))
    } catch {
      return null
    }
  }
  return typeof json === 'object' && json !== null ? json : null
}

function ensureDataURL(png: unknown): string | null {
  if (typeof png !== 'string' || !png) return null
  return png.startsWith('data:') ? png : `data:image/png;base64,${png}`
}

export async function fetchRtdbMap(key: string): Promise<RtdbMap | null> {
  try {
    const response = await fetch(`${DATABASE_URL}/maps/${encodeURIComponent(sanitizeMapKey(key))}.json`)
    if (!response.ok) return null
    const record = await response.json()
    const json = normalizeJson(record?.json)
    if (!json) return null
    return { json, png: ensureDataURL(record?.png) }
  } catch {
    return null
  }
}

export async function saveRtdbMap(key: string, mapJson: any, pngDataURL: string | null): Promise<boolean> {
  try {
    const response = await fetch(
      `${DATABASE_URL}/maps/${encodeURIComponent(sanitizeMapKey(key))}.json`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: JSON.stringify(mapJson), png: pngDataURL ?? null }),
      }
    )
    return response.ok
  } catch {
    return false
  }
}
