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
    // may be rejected without a user gesture (e.g. from a gamepad button)
    frame?.requestFullscreen()?.catch((error) => {
      console.log('Fullscreen request rejected:', error)
    })
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
  <div class="game-ui">
    <button
      class="fullscreen-btn"
      onclick={toggleFullscreen}
      title="Fullscreen (F)"
      aria-label="Toggle fullscreen"
    >⛶</button>
  </div>
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

  .game-ui {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .fullscreen-btn {
    background: rgba(0, 0, 0, 0.6);
    color: #f8f8f8;
    border: none;
    border-radius: 6px;
    font-size: 16px;
    padding: 4px 8px;
    cursor: pointer;
  }

  .fullscreen-btn:hover {
    background: rgba(0, 0, 0, 0.85);
  }
</style>
