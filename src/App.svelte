<script lang="ts">
  import { onMount } from 'svelte'
  import GameCanvas from './components/GameCanvas.svelte'
  import { gamepad } from './lib/gamepad.svelte'
  import { touch } from './lib/touch.svelte'

  let gameCanvas = $state<ReturnType<typeof GameCanvas>>()

  // UI tips only make sense for keyboard players — hide them the moment the
  // touch overlay or a gamepad can drive the game instead (a touch screen
  // with the controls option off still leaves the keyboard as the only input)
  let keyboardOnly = $derived(!touch.active && !gamepad.connected)

  // handy for debugging from the console
  ;(window as any).__gamepad = gamepad
  ;(window as any).__touch = touch

  onMount(() => {
    // gamepad: FACEBTN_LEFT runs, FACEBTN_BOTTOM jumps — see public/codemonkey.json
    const cleanupGamepad = gamepad.init()
    const cleanupTouch = touch.init()
    const onaction = (action: string) => {
      if (action === 'fullscreen') {
        gameCanvas?.toggleFullscreen()
      }
    }
    gamepad.onaction = onaction
    touch.onaction = onaction

    // launch in fullscreen: browsers only honor requestFullscreen from a user
    // gesture, so the first tap/click promotes the frame (the ⛶ button and
    // F key keep their own toggles)
    const onFirstPointer = (event: PointerEvent) => {
      window.removeEventListener('pointerdown', onFirstPointer, true)
      if ((event.target as Element | null)?.closest?.('.fullscreen-btn')) return
      gameCanvas?.enterFullscreen()
    }
    window.addEventListener('pointerdown', onFirstPointer, true)

    return () => {
      cleanupGamepad()
      cleanupTouch()
      gamepad.onaction = null
      touch.onaction = null
      window.removeEventListener('pointerdown', onFirstPointer, true)
    }
  })

  function onKeydown(event: KeyboardEvent) {
    if (event.code === 'KeyF') {
      gameCanvas?.toggleFullscreen()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<main>
  <GameCanvas bind:this={gameCanvas} />
  {#if keyboardOnly}
    <p class="controls">
      ←/→ move · ↓ duck · SPACE jump · C run · S start · F fullscreen
    </p>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px 0;
  }

  .controls {
    margin: 0;
    font-size: 13px;
    color: #9aa0b5;
  }
</style>
