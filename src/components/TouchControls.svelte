<script lang="ts">
  import type { GamepadAction } from '../lib/gamepad.svelte'
  import { touch } from '../lib/touch.svelte'

  // TurboGrafx-16-style dynamic touch scheme:
  //  - left half: touch anywhere to plant a virtual analog stick, drag to steer
  //  - right half: the first finger is B (run), the second finger is A (jump)
  //    — each button materializes where the finger lands, with the idle hints
  //    showing B riding slightly above A
  //  - SELECT / RUN pills (fullscreen re-entry / start) sit bottom-center
  // Default skin is TG-16 black-and-red; touch.theme === 'nintendo' (the
  // launcher's Nintendo-red skin) swaps the buttons to NES cabinet gray.

  const STICK_RADIUS = 48
  const STICK_DEAD = 10

  let stick = $state({ active: false, ox: 0, oy: 0, x: 0, y: 0 })
  let stickPointer: number | null = null

  let bBtn = $state({ active: false, x: 0, y: 0 })
  let aBtn = $state({ active: false, x: 0, y: 0 })
  let bPointer: number | null = null
  let aPointer: number | null = null

  let pressed = $state<Record<string, boolean>>({})

  function zonePoint(event: PointerEvent): { x: number; y: number } {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  // ── left half: dynamic analog stick ──
  function stickApply(dx: number, dy: number) {
    const mag = Math.hypot(dx, dy)
    if (mag > STICK_RADIUS) {
      dx *= STICK_RADIUS / mag
      dy *= STICK_RADIUS / mag
    }
    stick.x = dx
    stick.y = dy

    // digital directions from the stick vector: 8-way, diagonals in a 2:1 cone
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    const directions = new Set<GamepadAction>()
    if (Math.max(ax, ay) >= STICK_DEAD) {
      if (ax > ay * 0.5) directions.add(dx < 0 ? 'left' : 'right')
      if (ay > ax * 0.5) directions.add(dy < 0 ? 'up' : 'down')
    }
    touch.setDirections(directions)
  }

  function stickDown(event: PointerEvent) {
    if (stickPointer !== null) return
    stickPointer = event.pointerId
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    const p = zonePoint(event)
    stick = { active: true, ox: p.x, oy: p.y, x: 0, y: 0 }
  }

  function stickMove(event: PointerEvent) {
    if (event.pointerId !== stickPointer) return
    const p = zonePoint(event)
    stickApply(p.x - stick.ox, p.y - stick.oy)
  }

  function stickUp(event: PointerEvent) {
    if (event.pointerId !== stickPointer) return
    stickPointer = null
    stick.active = false
    touch.setDirections(new Set())
  }

  // ── right half: first touch is B (run), second touch is A (jump) ──
  function buttonsDown(event: PointerEvent) {
    const p = zonePoint(event)
    const zone = event.currentTarget as HTMLElement
    if (bPointer === null) {
      bPointer = event.pointerId
      zone.setPointerCapture(event.pointerId)
      bBtn = { active: true, x: p.x, y: p.y }
      touch.press('run')
    } else if (aPointer === null) {
      aPointer = event.pointerId
      zone.setPointerCapture(event.pointerId)
      aBtn = { active: true, x: p.x, y: p.y }
      touch.press('jump')
    }
  }

  function buttonsUp(event: PointerEvent) {
    if (event.pointerId === bPointer) {
      bPointer = null
      bBtn.active = false
      touch.release('run')
    } else if (event.pointerId === aPointer) {
      aPointer = null
      aBtn.active = false
      touch.release('jump')
    }
  }

  // ── SELECT / RUN pills ──
  function pillDown(action: GamepadAction) {
    return (event: PointerEvent) => {
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      touch.press(action)
      pressed = { ...pressed, [action]: true }
    }
  }

  function pillUp(action: GamepadAction) {
    return () => {
      touch.release(action)
      pressed = { ...pressed, [action]: false }
    }
  }
</script>

{#if touch.active}
  <div class="touch-controls {touch.theme === 'nintendo' ? 'nintendo' : ''}" aria-hidden="true">
    <!-- left half: dynamic analog stick -->
    <div
      class="zone left"
      role="presentation"
      onpointerdown={stickDown}
      onpointermove={stickMove}
      onpointerup={stickUp}
      onpointercancel={stickUp}
    >
      {#if stick.active}
        <span class="stick-base" style={`left:${stick.ox}px;top:${stick.oy}px`}></span>
        <span class="stick-knob" style={`left:${stick.ox + stick.x}px;top:${stick.oy + stick.y}px`}></span>
      {:else}
        <span class="hint stick-hint"></span>
      {/if}
    </div>

    <!-- right half: dynamic B (run) above A (jump) -->
    <div
      class="zone right"
      role="presentation"
      onpointerdown={buttonsDown}
      onpointerup={buttonsUp}
      onpointercancel={buttonsUp}
    >
      {#if bBtn.active}
        <span class="face on" style={`left:${bBtn.x}px;top:${bBtn.y}px`}>B</span>
      {:else}
        <span class="face hint b-hint">B</span>
      {/if}
      {#if aBtn.active}
        <span class="face on" style={`left:${aBtn.x}px;top:${aBtn.y}px`}>A</span>
      {:else if bBtn.active}
        <!-- second-finger affordance: A ghost slightly below the planted B -->
        <span class="face hint" style={`left:${bBtn.x + 34}px;top:${bBtn.y + 64}px`}>A</span>
      {:else}
        <span class="face hint a-hint">A</span>
      {/if}
    </div>

    <!-- SELECT / RUN pills -->
    <div class="pills">
      <div class="pill-group">
        <span
          role="presentation"
          class="pill {pressed.fullscreen ? 'on' : ''}"
          onpointerdown={pillDown('fullscreen')}
          onpointerup={pillUp('fullscreen')}
          onpointercancel={pillUp('fullscreen')}
        ></span>
        <span class="pill-label">SELECT</span>
      </div>
      <div class="pill-group">
        <span
          role="presentation"
          class="pill {pressed.start ? 'on' : ''}"
          onpointerdown={pillDown('start')}
          onpointerup={pillUp('start')}
          onpointercancel={pillUp('start')}
        ></span>
        <span class="pill-label">RUN</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .touch-controls {
    /* TurboGrafx-16 skin */
    --pad-body: rgba(24, 24, 28, 0.78);
    --pad-edge: rgba(120, 120, 130, 0.55);
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

  .zone {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 50%;
    pointer-events: auto;
    touch-action: none;
    overflow: hidden;
  }

  .zone.left { left: 0; }
  .zone.right { right: 0; }

  /* ── dynamic stick ── */
  .stick-base,
  .stick-knob,
  .stick-hint {
    position: absolute;
    transform: translate(-50%, -50%);
    border-radius: 50%;
  }

  .stick-base {
    width: 96px;
    height: 96px;
    background: var(--pad-body);
    border: 2px solid var(--pad-edge);
  }

  .stick-knob {
    width: 44px;
    height: 44px;
    background: var(--btn-face);
    border: 2px solid var(--btn-edge);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
  }

  .stick-hint {
    left: 22%;
    bottom: 12%;
    top: auto;
    transform: translate(-50%, 50%);
    width: 96px;
    height: 96px;
    border: 2px dashed var(--pad-edge);
    opacity: 0.5;
  }

  /* ── dynamic B / A buttons ── */
  .face {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: min(16vmin, 72px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--btn-face);
    border: 2px solid var(--btn-edge);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
    color: var(--label);
    font-weight: bold;
    font-size: min(4vmin, 18px);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  }

  .face.hint {
    opacity: 0.4;
    box-shadow: none;
  }

  /* idle hints: B rides slightly above A */
  .face.b-hint {
    right: 24%;
    bottom: 30%;
    left: auto;
    top: auto;
    transform: translate(50%, 50%);
  }

  .face.a-hint {
    right: 10%;
    bottom: 12%;
    left: auto;
    top: auto;
    transform: translate(50%, 50%);
  }

  /* ── SELECT / RUN pills ── */
  .pills {
    position: absolute;
    left: 50%;
    bottom: 7%;
    transform: translateX(-50%);
    display: flex;
    gap: min(4vmin, 22px);
    pointer-events: auto;
    touch-action: none;
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
</style>
