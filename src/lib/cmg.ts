// CMG launcher integration for the level editor. On boot the game
// advertises an OSD action (mirroring the cmg-touchcontrols handshake in
// touch.svelte.ts); the launcher renders a "Level Editor" button in its
// Guide/OSD Game section and posts { type:'cmg-action', id } back into the
// frame when the player activates it. Capabilities are cleared on every
// game launch, so this must run on each boot.

let editorRequested = false

export function initCmgActions(): () => void {
  if (typeof window === 'undefined' || window.parent === window) return () => {}

  const onMessage = (event: MessageEvent) => {
    const data = event.data
    // the launcher posts with targetOrigin '*' — match on shape only
    if (data && data.type === 'cmg-action' && data.id === 'level-editor') {
      editorRequested = true
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

/** True once per OSD activation — GameScene polls this from update(). */
export function consumeEditorRequest(): boolean {
  const requested = editorRequested
  editorRequested = false
  return requested
}
