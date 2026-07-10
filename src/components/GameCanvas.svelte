<script lang="ts">
  import Phaser from 'phaser'
  import { Game } from 'svelte-phaser'
  import { GAME_HEIGHT, GAME_WIDTH, physics, scenes } from '../game/config'
  import GamepadPoller from './GamepadPoller.svelte'
  import TouchControls from './TouchControls.svelte'

  let frame = $state<HTMLDivElement>()
  let phaser = $state<Phaser.Game>()

  // handy for debugging from the console
  $effect(() => {
    ;(window as any).__phaser = phaser
  })

  export function toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      enterFullscreen()
    }
  }

  export function enterFullscreen(): void {
    if (document.fullscreenElement) return
    // iPhone Safari has no element fullscreen API at all — bail rather than
    // throw a TypeError inside the caller's pointer handler
    const request =
      frame?.requestFullscreen ?? (frame as any)?.webkitRequestFullscreen
    if (!frame || typeof request !== 'function') return
    try {
      // may be rejected without a user gesture (e.g. from a gamepad button)
      Promise.resolve(request.call(frame)).catch((error) => {
        console.log('Fullscreen request rejected:', error)
      })
    } catch (error) {
      console.log('Fullscreen request rejected:', error)
    }
  }
</script>

<div class="game-frame" bind:this={frame}>
  {#if frame}
    <Game
      bind:instance={phaser}
      title="Super Mario Land"
      url="https://github.com/easierbycode/svelte-phaser"
      version="2.0"
      width={GAME_WIDTH}
      height={GAME_HEIGHT}
      type={Phaser.AUTO}
      parent={frame}
      scene={scenes}
      input={{ keyboard: true }}
      {physics}
      backgroundColor="#f8f8f8"
      render={{ pixelArt: true, antialias: false }}
      scale={{
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      }}
      banner={false}
    >
      <GamepadPoller />
    </Game>
  {/if}

  <!-- overlays live inside the frame so they stay visible in fullscreen -->
  <TouchControls />
</div>

<style>
  .game-frame {
    position: relative;
    width: min(90vw, 800px);
    aspect-ratio: 10 / 9;
    margin: 0 auto;
    background: #000;
  }

  .game-frame:fullscreen {
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
  }

  .game-frame :global(canvas) {
    display: block;
    image-rendering: pixelated;
  }

</style>
