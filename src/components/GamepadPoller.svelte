<script lang="ts">
  import { onGameEvent } from 'svelte-phaser'
  import { gamepad } from '../lib/gamepad.svelte'

  // the Gamepad API is poll-based — sample it once per Phaser game step,
  // before the scenes update, so isDown()/justPressed() are frame-accurate
  onGameEvent('step', () => gamepad.poll())
</script>
