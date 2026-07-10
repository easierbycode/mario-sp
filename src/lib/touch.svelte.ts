// Touch-screen controls state (TurboGrafx-16 layout — see TouchControls.svelte).
// Mirrors GamepadState's poll-based API: the overlay presses/releases actions,
// game code reads isDown()/justPressed(), sampled once per Phaser game step.
//
// Enablement is the "Touchscreen Controls" option: its default ships in
// codemonkey.json ({ "touchControls": { "default": true } }) and the CMG
// launcher can override it live via postMessage
// { type: 'cmg-touchcontrols-set', value }. The launcher's skin arrives as
// { type: 'cmg-theme', theme } (or the same-origin 'cmg-theme' localStorage
// key) so the pad can swap to Nintendo gray while the Nintendo-red theme is on.

import { loadCodemonkeyConfig } from './codemonkey-config'
import type { GamepadAction } from './gamepad.svelte'

export type CmgTheme = 'xbox' | 'nintendo'

const DIRECTIONS: GamepadAction[] = ['up', 'down', 'left', 'right']

class TouchState {
  /** whether this device has a touch screen at all */
  supported = $state(false)
  /** the Touchscreen Controls option (codemonkey.json / launcher override) */
  enabled = $state(false)
  /** CMG launcher theme — 'nintendo' renders the pad in Nintendo gray */
  theme = $state<CmgTheme>('xbox')

  /** Fired once per action press (edge-triggered from poll()). */
  onaction: ((action: GamepadAction) => void) | null = null

  // live state written by the overlay; snapshotted once per game step so
  // isDown()/justPressed() are frame-stable like the gamepad's. #pending
  // latches presses that begin AND end between two polls (a quick tap is
  // shorter than a frame) so they still register for one step.
  #held = new Set<GamepadAction>()
  #pending = new Set<GamepadAction>()
  #polled = new Set<GamepadAction>()
  #fresh = new Set<GamepadAction>()
  #launcherSet = false

  /** The overlay renders (and input merges) only when this is true. */
  get active(): boolean {
    return this.supported && this.enabled
  }

  isDown(action: GamepadAction): boolean {
    return this.#polled.has(action)
  }

  justPressed(action: GamepadAction): boolean {
    return this.#fresh.has(action)
  }

  press(action: GamepadAction): void {
    this.#held.add(action)
    this.#pending.add(action)
  }

  release(action: GamepadAction): void {
    this.#held.delete(action)
  }

  /** Replace the held d-pad directions in one shot (from the d-pad zone). */
  setDirections(directions: Set<GamepadAction>): void {
    for (const direction of DIRECTIONS) {
      if (directions.has(direction)) this.#held.add(direction)
      else this.#held.delete(direction)
    }
  }

  /** Snapshot held actions and fire onaction on fresh presses. Once per step. */
  poll(): void {
    this.#fresh.clear()
    // disabling mid-hold unmounts the overlay before its pointer-up handlers
    // can fire — drop any stale held actions so input doesn't stick
    if (!this.active) {
      this.#held.clear()
      this.#pending.clear()
      this.#polled = new Set()
      return
    }
    const snapshot = new Set(this.#held)
    for (const action of this.#pending) snapshot.add(action)
    this.#pending.clear()
    for (const action of snapshot) {
      if (!this.#polled.has(action)) this.#fresh.add(action)
    }
    this.#polled = snapshot
    for (const action of this.#fresh) this.onaction?.(action)
  }

  /**
   * Detects touch support, loads the codemonkey.json option, syncs with an
   * embedding CMG launcher (theme + toggle). Returns a cleanup function.
   */
  init(): () => void {
    this.supported =
      navigator.maxTouchPoints > 0 || 'ontouchstart' in window

    // a same-origin launcher (CMG Network cache) shares localStorage
    try {
      const theme = localStorage.getItem('cmg-theme')
      if (theme === 'nintendo' || theme === 'xbox') this.theme = theme
    } catch {
      // storage unavailable — keep the default theme
    }

    this.#loadConfig()

    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'cmg-theme' && (data.theme === 'nintendo' || data.theme === 'xbox')) {
        this.theme = data.theme
      }
      if (data.type === 'cmg-touchcontrols-set') {
        this.#launcherSet = true
        this.enabled = !!data.value
      }
    }
    window.addEventListener('message', onMessage)

    // advertise the option to an embedding CMG launcher (mirrors the
    // cmg-twinstick handshake) — it replies with cmg-touchcontrols-set
    // and cmg-theme
    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'cmg-touchcontrols', default: true }, '*')
      } catch {
        // sandboxed parent — standalone behavior applies
      }
    }

    return () => {
      window.removeEventListener('message', onMessage)
      this.#held.clear()
    }
  }

  async #loadConfig(): Promise<void> {
    const config = await loadCodemonkeyConfig()
    const option = config?.touchControls
    if (option === undefined || this.#launcherSet) return
    this.enabled = option === true || !!option?.default
  }
}

export const touch = new TouchState()
