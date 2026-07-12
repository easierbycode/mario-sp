<script lang="ts">
  import { onMount } from 'svelte'
  import GameCanvas from './components/GameCanvas.svelte'
  import { initCmgActions } from './lib/cmg'
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
    // advertise the in-game level editor to an embedding CMG launcher (it
    // shows a "Level Editor" button in its OSD and posts cmg-action back)
    const cleanupCmg = initCmgActions()
    const onaction = (action: string) => {
      if (action === 'fullscreen') {
        gameCanvas?.toggleFullscreen()
      }
    }
    gamepad.onaction = onaction
    touch.onaction = onaction

    // start in fullscreen: browsers only honor requestFullscreen from a user
    // gesture, so keep promoting the frame on taps/clicks — and on gamepad
    // button presses, for browsers that count those as activation — until
    // one lands (the F key keeps its toggle for keyboard players)
    const onPointer = () => gameCanvas?.enterFullscreen()
    const onFullscreenChange = () => {
      if (document.fullscreenElement) {
        window.removeEventListener('pointerdown', onPointer, true)
        document.removeEventListener('fullscreenchange', onFullscreenChange)
        gamepad.onanybutton = null
      }
    }
    window.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    gamepad.onanybutton = () => gameCanvas?.enterFullscreen()

    return () => {
      cleanupGamepad()
      cleanupTouch()
      cleanupCmg()
      gamepad.onaction = null
      gamepad.onanybutton = null
      touch.onaction = null
      window.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
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
      ←/→ move · ↓ duck · SPACE jump · C run · S start · SHIFT+↑ suit (title) / editor (in game) · F fullscreen
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
