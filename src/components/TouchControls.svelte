<script lang="ts">
  import type { GamepadAction } from '../lib/gamepad.svelte'
  import { touch } from '../lib/touch.svelte'

  // TurboGrafx-16 pad layout: 8-way d-pad on the left, SELECT / RUN pills in
  // the middle, round Ⅱ (run) and Ⅰ (jump) buttons on the right. Default skin
  // is the TG-16 black-and-red; touch.theme === 'nintendo' (the launcher's
  // Nintendo-red skin) swaps the buttons to NES cabinet gray.

  let dpad = $state<HTMLDivElement>()
  let dpadPointer: number | null = null
  let pressed = $state<Record<string, boolean>>({})

  // d-pad direction from pointer position: 8-way, diagonals inside a 2:1 cone
  function dpadUpdate(event: PointerEvent) {
    if (!dpad) return
    const rect = dpad.getBoundingClientRect()
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    const dead = rect.width * 0.12

    const directions = new Set<GamepadAction>()
    if (Math.max(ax, ay) >= dead) {
      if (ax > ay * 0.5) directions.add(dx < 0 ? 'left' : 'right')
      if (ay > ax * 0.5) directions.add(dy < 0 ? 'up' : 'down')
    }
    touch.setDirections(directions)
    pressed = {
      ...pressed,
      up: directions.has('up'),
      down: directions.has('down'),
      left: directions.has('left'),
      right: directions.has('right'),
    }
  }

  function dpadDown(event: PointerEvent) {
    dpadPointer = event.pointerId
    dpad?.setPointerCapture(event.pointerId)
    dpadUpdate(event)
  }

  function dpadMove(event: PointerEvent) {
    if (event.pointerId === dpadPointer) dpadUpdate(event)
  }

  function dpadUp(event: PointerEvent) {
    if (event.pointerId !== dpadPointer) return
    dpadPointer = null
    touch.setDirections(new Set())
    pressed = { ...pressed, up: false, down: false, left: false, right: false }
  }

  function buttonDown(action: GamepadAction) {
    return (event: PointerEvent) => {
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      touch.press(action)
      pressed = { ...pressed, [action]: true }
    }
  }

  function buttonUp(action: GamepadAction) {
    return () => {
      touch.release(action)
      pressed = { ...pressed, [action]: false }
    }
  }
</script>

{#if touch.active}
  <div class="touch-controls {touch.theme === 'nintendo' ? 'nintendo' : ''}" aria-hidden="true">
    <!-- d-pad -->
    <div
      class="dpad"
      role="presentation"
      bind:this={dpad}
      onpointerdown={dpadDown}
      onpointermove={dpadMove}
      onpointerup={dpadUp}
      onpointercancel={dpadUp}
    >
      <span class="arm v"></span>
      <span class="arm h"></span>
      <span class="cap up {pressed.up ? 'on' : ''}"></span>
      <span class="cap down {pressed.down ? 'on' : ''}"></span>
      <span class="cap left {pressed.left ? 'on' : ''}"></span>
      <span class="cap right {pressed.right ? 'on' : ''}"></span>
    </div>

    <!-- SELECT / RUN pills -->
    <div class="pills">
      <div class="pill-group">
        <span
          role="presentation"
          class="pill {pressed.fullscreen ? 'on' : ''}"
          onpointerdown={buttonDown('fullscreen')}
          onpointerup={buttonUp('fullscreen')}
          onpointercancel={buttonUp('fullscreen')}
        ></span>
        <span class="pill-label">SELECT</span>
      </div>
      <div class="pill-group">
        <span
          role="presentation"
          class="pill {pressed.start ? 'on' : ''}"
          onpointerdown={buttonDown('start')}
          onpointerup={buttonUp('start')}
          onpointercancel={buttonUp('start')}
        ></span>
        <span class="pill-label">RUN</span>
      </div>
    </div>

    <!-- Ⅱ (run) and Ⅰ (jump) buttons -->
    <div class="face-buttons">
      <div class="face-group">
        <span
          role="presentation"
          class="face {pressed.run ? 'on' : ''}"
          onpointerdown={buttonDown('run')}
          onpointerup={buttonUp('run')}
          onpointercancel={buttonUp('run')}
        ></span>
        <span class="face-label">Ⅱ</span>
      </div>
      <div class="face-group">
        <span
          role="presentation"
          class="face {pressed.jump ? 'on' : ''}"
          onpointerdown={buttonDown('jump')}
          onpointerup={buttonUp('jump')}
          onpointercancel={buttonUp('jump')}
        ></span>
        <span class="face-label">Ⅰ</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .touch-controls {
    /* TurboGrafx-16 skin */
    --pad-body: rgba(24, 24, 28, 0.78);
    --pad-edge: rgba(120, 120, 130, 0.55);
    --pad-cross: rgba(46, 46, 52, 0.9);
    --btn-face: radial-gradient(circle at 35% 30%, #f4535e 0%, #d22730 40%, #7d1017 100%);
    --btn-edge: rgba(255, 120, 130, 0.5);
    --label: rgba(235, 235, 240, 0.85);

    position: absolute;
    inset: 0;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    font-family: 'Courier New', monospace;
  }

  /* Nintendo-red launcher theme → NES cabinet grays (#d5d5d8 / #88848b) */
  .touch-controls.nintendo {
    --btn-face: radial-gradient(circle at 35% 30%, #f2f3f6 0%, #d5d5d8 40%, #88848b 100%);
    --btn-edge: rgba(213, 213, 216, 0.6);
  }

  .touch-controls > div {
    pointer-events: auto;
    touch-action: none;
  }

  /* ── d-pad (left) ── */
  .dpad {
    position: absolute;
    left: max(4%, env(safe-area-inset-left));
    bottom: 6%;
    width: min(34vmin, 168px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--pad-body);
    border: 2px solid var(--pad-edge);
  }

  .dpad .arm {
    position: absolute;
    background: var(--pad-cross);
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(150, 150, 160, 0.35);
  }

  .dpad .arm.v { left: 36%; top: 10%; width: 28%; height: 80%; }
  .dpad .arm.h { top: 36%; left: 10%; height: 28%; width: 80%; }

  .dpad .cap {
    position: absolute;
    width: 28%;
    height: 28%;
    border-radius: 6px;
    opacity: 0;
    background: rgba(255, 255, 255, 0.28);
  }

  .dpad .cap.on { opacity: 1; }
  .dpad .cap.up { left: 36%; top: 10%; }
  .dpad .cap.down { left: 36%; bottom: 10%; }
  .dpad .cap.left { left: 10%; top: 36%; }
  .dpad .cap.right { right: 10%; top: 36%; }

  /* ── SELECT / RUN pills (center) ── */
  .pills {
    position: absolute;
    left: 50%;
    bottom: 7%;
    transform: translateX(-50%);
    display: flex;
    gap: min(4vmin, 22px);
  }

  .pill-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .pill {
    display: block;
    width: min(9vmin, 46px);
    height: min(3.4vmin, 18px);
    border-radius: 999px;
    background: var(--pad-body);
    border: 2px solid var(--pad-edge);
  }

  .pill.on { background: rgba(255, 255, 255, 0.35); }

  .pill-label {
    font-size: min(2.4vmin, 11px);
    letter-spacing: 0.08em;
    color: var(--label);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  }

  /* ── Ⅱ / Ⅰ buttons (right) ── */
  .face-buttons {
    position: absolute;
    right: max(4%, env(safe-area-inset-right));
    bottom: 8%;
    display: flex;
    gap: min(5vmin, 26px);
    align-items: flex-end;
  }

  .face-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }

  .face {
    display: block;
    width: min(16vmin, 78px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--btn-face);
    border: 2px solid var(--btn-edge);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
    opacity: 0.88;
  }

  .face.on {
    opacity: 1;
    transform: translateY(2px);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
  }

  .face-label {
    font-size: min(3.4vmin, 16px);
    font-weight: bold;
    color: var(--label);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  }
</style>
