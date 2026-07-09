// Gamepad support via the browser Gamepad API — an optimized port of the
// original gamepad-support.ts, which dispatched synthetic keyboard events at
// the canvas. Instead, game code reads held actions directly via isDown() /
// justPressed(), sampled once per Phaser game step (the Gamepad API is
// poll-based). Button → action mapping is loaded from /codemonkey.json;
// by default FACEBTN_LEFT runs (keyboard C) and FACEBTN_BOTTOM jumps
// (keyboard SPACE).

export type GamepadAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'jump'
  | 'run'
  | 'start'
  | 'fullscreen'

const ACTIONS: GamepadAction[] = [
  'up',
  'down',
  'left',
  'right',
  'jump',
  'run',
  'start',
  'fullscreen',
]

/** Standard-mapping button indexes (https://w3.org/TR/gamepad/#remapping). */
export const BUTTON_INDEXES: Record<string, number> = {
  FACE_BOTTOM: 0,
  FACE_RIGHT: 1,
  FACE_LEFT: 2,
  FACE_TOP: 3,
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  HOME: 16,
  // codemonkey.json aliases
  FACEBTN_BOTTOM: 0,
  FACEBTN_RIGHT: 1,
  FACEBTN_LEFT: 2,
  FACEBTN_TOP: 3,
}

/** Display glyphs for UI hints (Xbox-style face labels). */
export const BUTTON_GLYPHS: Record<number, string> = {
  0: 'Ⓐ',
  1: 'Ⓑ',
  2: 'Ⓧ',
  3: 'Ⓨ',
  4: 'L1',
  5: 'R1',
  6: 'L2',
  7: 'R2',
  8: 'Select',
  9: 'Start',
  10: 'L3',
  11: 'R3',
  12: '✛↑',
  13: '✛↓',
  14: '✛←',
  15: '✛→',
  16: '⌂',
}

const DEFAULT_BUTTON_MAP: Record<number, GamepadAction> = {
  [BUTTON_INDEXES.DPAD_UP]: 'up',
  [BUTTON_INDEXES.DPAD_DOWN]: 'down',
  [BUTTON_INDEXES.DPAD_LEFT]: 'left',
  [BUTTON_INDEXES.DPAD_RIGHT]: 'right',
  [BUTTON_INDEXES.FACE_BOTTOM]: 'jump',
  [BUTTON_INDEXES.FACE_LEFT]: 'run',
  [BUTTON_INDEXES.START]: 'start',
  [BUTTON_INDEXES.HOME]: 'fullscreen',
}

/** Keyboard equivalents (Phaser key names) — codemonkey.json can override. */
const DEFAULT_KEYBOARD_MAP: Partial<Record<GamepadAction, string>> = {
  up: 'UP',
  down: 'DOWN',
  left: 'LEFT',
  right: 'RIGHT',
  jump: 'SPACE',
  run: 'C',
  start: 'S',
  fullscreen: 'F',
}

const AXIS_THRESHOLD = 0.5

class GamepadState {
  connected = $state(false)
  id = $state('')
  /** button index → action, from codemonkey.json */
  buttonMap = $state<Record<number, GamepadAction>>({ ...DEFAULT_BUTTON_MAP })
  /** action → Phaser keyboard key name, from codemonkey.json */
  keyboardMap = $state<Partial<Record<GamepadAction, string>>>({
    ...DEFAULT_KEYBOARD_MAP,
  })

  /** Fired once per mapped button press (edge-triggered from poll()). */
  onaction: ((action: GamepadAction) => void) | null = null

  #held = new Set<GamepadAction>()
  #fresh = new Set<GamepadAction>()
  #down = new Set<number>()

  /** Whether an action's button is currently held on any connected pad. */
  isDown(action: GamepadAction): boolean {
    return this.#held.has(action)
  }

  /** True only on the poll where the action's button went down. */
  justPressed(action: GamepadAction): boolean {
    return this.#fresh.has(action)
  }

  /** The Phaser keyboard key name mapped to an action, e.g. 'SPACE'. */
  keyFor(action: GamepadAction): string | null {
    return this.keyboardMap[action] ?? null
  }

  /** UI glyph for an action's configured button, e.g. 'Ⓐ'. */
  glyphFor(action: GamepadAction): string {
    for (const [index, mapped] of Object.entries(this.buttonMap)) {
      if (mapped === action) return BUTTON_GLYPHS[Number(index)] ?? '🎮'
    }
    return '🎮'
  }

  /**
   * Starts listening for connections and loads the codemonkey.json mapping.
   * Returns a cleanup function.
   */
  init(): () => void {
    const onConnect = (event: GamepadEvent) => {
      console.log(`🎮 Gamepad connected: ${event.gamepad.id}`)
      this.#refreshConnected()
    }

    const onDisconnect = (event: GamepadEvent) => {
      console.log(`🎮 Gamepad disconnected: ${event.gamepad.id}`)
      this.#refreshConnected()
    }

    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)

    // adopt pads that were connected before this page loaded
    this.#refreshConnected()
    this.#loadConfig()

    return () => {
      window.removeEventListener('gamepadconnected', onConnect)
      window.removeEventListener('gamepaddisconnected', onDisconnect)
    }
  }

  /**
   * Samples every connected pad (input is merged, so any controller drives
   * the game) and fires onaction on fresh presses. Call once per game step.
   */
  poll(): void {
    this.#fresh.clear()
    if (!this.connected) return

    const held = new Set<GamepadAction>()
    const down = new Set<number>()

    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue

      for (const [indexKey, action] of Object.entries(this.buttonMap)) {
        const index = Number(indexKey)
        if (pad.buttons[index]?.pressed) {
          held.add(action)
          down.add(index)
          if (!this.#down.has(index)) this.#fresh.add(action)
        }
      }

      // left analog stick doubles as the d-pad
      const [x, y] = [pad.axes[0] ?? 0, pad.axes[1] ?? 0]
      if (x < -AXIS_THRESHOLD) held.add('left')
      if (x > AXIS_THRESHOLD) held.add('right')
      if (y < -AXIS_THRESHOLD) held.add('up')
      if (y > AXIS_THRESHOLD) held.add('down')
    }

    this.#held = held
    this.#down = down

    for (const action of this.#fresh) this.onaction?.(action)
  }

  #refreshConnected(): void {
    const pads = (navigator.getGamepads?.() ?? []).filter(Boolean) as Gamepad[]
    this.connected = pads.length > 0
    this.id = pads[0]?.id ?? ''
    if (!this.connected) {
      this.#held = new Set()
      this.#down.clear()
    }
  }

  async #loadConfig(): Promise<void> {
    try {
      const response = await fetch('/codemonkey.json')
      if (!response.ok) return

      const config = await response.json()
      const buttons = config?.gamepad?.buttons
      if (!buttons) return

      // overlay onto the defaults, so a partial config (say, only the face
      // buttons) still leaves the d-pad and start working
      const map: Record<number, GamepadAction> = { ...DEFAULT_BUTTON_MAP }
      const keys = { ...DEFAULT_KEYBOARD_MAP }
      let mapped = 0

      for (const [name, value] of Object.entries(buttons)) {
        const index = BUTTON_INDEXES[name]
        if (index === undefined) continue

        // supports both "FACE_BOTTOM": "jump" and
        // "FACEBTN_BOTTOM": { "action": "jump", "key": "SPACE" }
        const action = typeof value === 'string' ? value : (value as any)?.action
        if (!ACTIONS.includes(action as GamepadAction)) continue

        map[index] = action as GamepadAction
        mapped++

        const key = typeof value === 'object' ? (value as any)?.key : undefined
        if (typeof key === 'string' && key) {
          keys[action as GamepadAction] = key.toUpperCase()
        }
      }

      if (mapped > 0) {
        this.buttonMap = map
        this.keyboardMap = keys
        console.log('🎮 Gamepad mapping loaded from codemonkey.json:', buttons)
      }
    } catch {
      // no config — keep the default mapping
    }
  }
}

export const gamepad = new GamepadState()
