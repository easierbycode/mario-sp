<script lang="ts">
  import { onMount } from 'svelte'
  import GameCanvas from './components/GameCanvas.svelte'
  import { gamepad } from './lib/gamepad.svelte'

  let gameCanvas = $state<ReturnType<typeof GameCanvas>>()

  // handy for debugging from the console
  ;(window as any).__gamepad = gamepad

  onMount(() => {
    // gamepad: FACEBTN_LEFT runs, FACEBTN_BOTTOM jumps — see public/codemonkey.json
    const cleanupGamepad = gamepad.init()
    gamepad.onaction = (action) => {
      if (action === 'fullscreen') {
        gameCanvas?.toggleFullscreen()
      }
    }

    return () => {
      cleanupGamepad()
      gamepad.onaction = null
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
  <h1>SUPER MARIO LAND</h1>
  <GameCanvas bind:this={gameCanvas} />
  <p class="controls">
    ←/→ move · ↓ duck · SPACE jump · C run · S start · F fullscreen
    {#if gamepad.connected}
      · 🎮 connected
    {:else}
      · 🎮 plug in a controller
    {/if}
  </p>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px 0;
  }

  h1 {
    margin: 0;
    font-size: 22px;
    letter-spacing: 4px;
    color: #f8d870;
  }

  .controls {
    margin: 0;
    font-size: 13px;
    color: #9aa0b5;
  }
</style>
