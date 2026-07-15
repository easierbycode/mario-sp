// Local copies of online levels — the same "stream now, keep a copy" deal
// the CMG launcher gives CMG Network games (their files land in the
// launcher's cmg-net-v1 Cache Storage and replay offline). Online maps
// stream from the RTDB and are cache.put() here in the background, so they
// list and replay without a network, and survive an RTDB outage.
//
// Records keep the RTDB /maps shape ({ json: stringified, png: dataURL })
// under a synthetic same-origin URL that is only ever cache.match()ed,
// never actually fetched.

import { normalizeMapRecord, sanitizeMapKey, type RtdbMap } from './rtdb-maps'

const CACHE_NAME = 'mario-sp-maps-v1'
const PREFIX = '/__mario-sp-maps__/'

function entryURL(key: string): string {
  return `${PREFIX}${encodeURIComponent(sanitizeMapKey(key))}.json`
}

/** Cache Storage needs a secure context (https / localhost). */
function storeAvailable(): boolean {
  return typeof caches !== 'undefined'
}

export async function saveLocalMap(key: string, map: RtdbMap): Promise<boolean> {
  if (!storeAvailable()) return false
  try {
    const cache = await caches.open(CACHE_NAME)
    const body = JSON.stringify({
      key: sanitizeMapKey(key),
      json: JSON.stringify(map.json),
      png: map.png ?? null,
    })
    await cache.put(
      entryURL(key),
      new Response(body, { headers: { 'Content-Type': 'application/json' } })
    )
    return true
  } catch {
    return false
  }
}

export async function loadLocalMap(key: string): Promise<RtdbMap | null> {
  if (!storeAvailable()) return null
  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(entryURL(key))
    if (!hit) return null
    return normalizeMapRecord(await hit.json())
  } catch {
    return null
  }
}

export async function listLocalMapKeys(): Promise<string[]> {
  if (!storeAvailable()) return []
  try {
    const cache = await caches.open(CACHE_NAME)
    const keys: string[] = []
    for (const request of await cache.keys()) {
      const { pathname } = new URL(request.url)
      if (!pathname.startsWith(PREFIX)) continue
      keys.push(decodeURIComponent(pathname.slice(PREFIX.length).replace(/\.json$/, '')))
    }
    return keys.sort()
  } catch {
    return []
  }
}
