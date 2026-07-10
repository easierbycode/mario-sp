<script lang="ts">
  import type { GamepadAction } from '../lib/gamepad.svelte'
  import { haptics } from '../lib/haptics'
  import { touch } from '../lib/touch.svelte'

  // Touch scheme:
  //  - left half of the screen: touch anywhere to plant a virtual analog
  //    stick, drag to steer
  //  - right half: its left half is a virtual B button (run), its right half
  //    is a virtual A button (jump). A second touch while B is already held is
  //    ALWAYS A — even on the B side — so holding B with the thumb tip and
  //    tapping next to it jumps while running.
  //  - SELECT / RUN pills sit centered vertically in the game's bottom tile
  //    band (the ground strip is 16 of 144 source pixels ≈ 11% of the height)
  // Presses and releases land short haptic ticks (see lib/haptics.ts).
  // Default skin is TG-16 black-and-red; touch.theme === 'nintendo' (the
  // launcher's Nintendo-red skin) swaps the buttons to NES cabinet gray.

  const STICK_RADIUS = 48
  const STICK_DEAD = 10

  let stick = $state({ active: false, ox: 0, oy: 0, x: 0, y: 0 })
  let stickPointer: number | null = null
  let stickDirections = ''

  // every active right-side finger, in the order it landed: pointerId → action
  const rightPointers = new Map<number, 'run' | 'jump'>()
  let bHeld = $state(false)
  let aHeld = $state(false)

  let pressed = $state<Record<string, boolean>>({})

  function zonePoint(event: PointerEvent): { x: number; y: number; w: number } {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, w: rect.width }
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

    // feather tick each time the stick crosses into a different direction
    const key = [...directions].sort().join()
    if (key && key !== stickDirections) haptics.step()
    stickDirections = key
  }

  function stickDown(event: PointerEvent) {
    event.preventDefault()
    if (stickPointer !== null) return
    stickPointer = event.pointerId
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    const p = zonePoint(event)
    stick = { active: true, ox: p.x, oy: p.y, x: 0, y: 0 }
    stickDirections = ''
    haptics.plant()
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
    stickDirections = ''
    touch.setDirections(new Set())
  }

  // ── right half: virtual B (left side, run) and A (right side, jump) ──
  // Re-derive held state from the live finger map, pressing/releasing the
  // shared touch state only on 0↔1 transitions so overlapping fingers on the
  // same button can't drop it early.
  function syncButtons() {
    const actions = [...rightPointers.values()]
    const run = actions.includes('run')
    const jump = actions.includes('jump')
    if (run !== bHeld) {
      bHeld = run
      if (run) touch.press('run')
      else touch.release('run')
    }
    if (jump !== aHeld) {
      aHeld = jump
      if (jump) touch.press('jump')
      else touch.release('jump')
    }
  }

  function buttonsDown(event: PointerEvent) {
    event.preventDefault()
    const p = zonePoint(event)
    const onBSide = p.x < p.w / 2
    // B side is B for the first finger only — while B is held, any additional
    // touch (B side included) is A. The A side is always A.
    const action: 'run' | 'jump' = onBSide && !bHeld ? 'run' : 'jump'
    rightPointers.set(event.pointerId, action)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    syncButtons()
    haptics.press()
  }

  function buttonsUp(event: PointerEvent) {
    if (!rightPointers.delete(event.pointerId)) return
    syncButtons()
    haptics.release()
  }

  // ── SELECT / RUN pills ──
  function pillDown(action: GamepadAction) {
    return (event: PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      touch.press(action)
      pressed = { ...pressed, [action]: true }
      haptics.plant()
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
  <div
    class="touch-controls {touch.theme === 'nintendo' ? 'nintendo' : ''}"
    aria-hidden="true"
    oncontextmenu={(e) => e.preventDefault()}
  >
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

    <!-- right half: virtual B on its left side, virtual A on its right side -->
    <div
      class="zone right"
      role="presentation"
      onpointerdown={buttonsDown}
      onpointerup={buttonsUp}
      onpointercancel={buttonsUp}
    >
      <span class="side b {bHeld ? 'on' : ''}"><span class="face">B</span></span>
      <span class="side a {aHeld ? 'on' : ''}"><span class="face">A</span></span>
    </div>

    <!-- SELECT / RUN pills, centered vertically in the bottom tile band -->
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
    -webkit-touch-callout: none;
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
    pointer-events: none;
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

  /* ── virtual B / A button halves ── */
  .side {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 50%;
    pointer-events: none;
  }

  .side.b { left: 0; }
  .side.a { right: 0; }

  /* B rides slightly above A */
  .side.b .face { bottom: 26%; }
  .side.a .face { bottom: 14%; }

  .face {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: min(18vmin, 84px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--btn-face);
    border: 2px solid var(--btn-edge);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
    color: var(--label);
    font-weight: bold;
    font-size: min(4.4vmin, 20px);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    opacity: 0.55;
    transition: transform 70ms ease-out, opacity 70ms ease-out;
  }

  .side.on .face {
    opacity: 1;
    transform: translateX(-50%) scale(0.92);
    box-shadow:
      0 1px 4px rgba(0, 0, 0, 0.5),
      0 0 0 6px rgba(255, 255, 255, 0.12);
  }

  /* ── SELECT / RUN pills: the ground tile band is the bottom 16 of the
     game's 144 source rows (≈11%); center the pills vertically inside it.
     In fullscreen landscape the FIT-scaled canvas fills the frame height,
     so the band lines up with the bottom of the frame. ── */
  .pills {
    position: absolute;
    left: 50%;
    bottom: 0;
    height: 11.1%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: min(4vmin, 22px);
    pointer-events: auto;
    touch-action: none;
  }

  .pill-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
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
