// CMG launcher integration for the level editor. On boot the game
// advertises an OSD action (mirroring the cmg-touchcontrols handshake in
// touch.svelte.ts); the launcher renders a "Level Editor" button in its
// Guide/OSD Game section and posts { type:'cmg-action', id } back into the
// frame when the player activates it. Capabilities are cleared on every
// game launch, so this must run on each boot.

// timestamp of the last OSD activation — consumed with a short TTL so a
// press latched while the game was at the title (or while the editor was
// already open) doesn't surprise-open the editor much later
let requestedAt = 0
const REQUEST_TTL_MS = 3000

export function initCmgActions(): () => void {
  if (typeof window === 'undefined' || window.parent === window) return () => {}

  const onMessage = (event: MessageEvent) => {
    const data = event.data
    // the launcher posts with targetOrigin '*' — match on shape only
    if (data && data.type === 'cmg-action' && data.id === 'level-editor') {
      requestedAt = performance.now()
    }
  }
  window.addEventListener('message', onMessage)

  try {
    window.parent.postMessage(
      { type: 'cmg-actions', actions: [{ id: 'level-editor', label: 'Level Editor' }] },
      '*'
    )
  } catch {
    // sandboxed parent
  }

  return () => window.removeEventListener('message', onMessage)
}

/** True once per recent OSD activation — GameScene polls this from update(). */
export function consumeEditorRequest(): boolean {
  const fresh = requestedAt > 0 && performance.now() - requestedAt < REQUEST_TTL_MS
  requestedAt = 0
  return fresh
}
