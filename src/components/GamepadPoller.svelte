<script lang="ts">
  import { onGameEvent } from 'svelte-phaser'
  import { gamepad } from '../lib/gamepad.svelte'
  import { touch } from '../lib/touch.svelte'

  // the Gamepad API is poll-based — sample it (and snapshot the touch
  // overlay's held actions) once per Phaser game step, before the scenes
  // update, so isDown()/justPressed() are frame-accurate
  onGameEvent('step', () => {
    gamepad.poll()
    touch.poll()
  })
</script>
