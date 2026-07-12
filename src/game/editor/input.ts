// Port of PS2-mari0-playland's lib/input.js onto the 5velte-ps2 Pads shim.
// Same fields as the PS2 pad snapshot, plus per-direction edges (the web
// editor uses them for key-repeat pacing; the PS2 original moved the cursor
// every frame a direction was held).

import type { PS2Runtime } from '5velte-ps2'

export interface PadState {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  jump: boolean
  run: boolean
  boost: boolean
  leftPressed: boolean
  rightPressed: boolean
  upPressed: boolean
  downPressed: boolean
  jumpPressed: boolean
  runPressed: boolean
  boostPressed: boolean
  start: boolean
  select: boolean
}

export function poll(ps2: PS2Runtime): PadState {
  const pad = ps2.Pads.get(0)
  const P = ps2.Pads
  return {
    left: pad.pressed(P.LEFT),
    right: pad.pressed(P.RIGHT),
    up: pad.pressed(P.UP),
    down: pad.pressed(P.DOWN),
    jump: pad.pressed(P.CROSS),
    run: pad.pressed(P.SQUARE),
    boost: pad.pressed(P.TRIANGLE),
    leftPressed: pad.justPressed(P.LEFT),
    rightPressed: pad.justPressed(P.RIGHT),
    upPressed: pad.justPressed(P.UP),
    downPressed: pad.justPressed(P.DOWN),
    jumpPressed: pad.justPressed(P.CROSS),
    runPressed: pad.justPressed(P.SQUARE),
    boostPressed: pad.justPressed(P.TRIANGLE),
    start: pad.justPressed(P.START),
    select: pad.justPressed(P.SELECT),
  }
}
