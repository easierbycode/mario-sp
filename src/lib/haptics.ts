// Haptic feedback for the touch controls, tuned like a first-party console
// pad: short, crisp, single-shot ticks — subtle and never buzzy. Every cue is
// one clean pulse with a distinct weight so presses, releases, and stick
// motion each feel different under the thumb.
//
// Uses the Vibration API where available (Android Chrome and friends) and
// silently no-ops elsewhere — iOS Safari exposes no web vibration/haptics API.

const supported = typeof navigator !== 'undefined' && 'vibrate' in navigator

function pulse(pattern: number | number[]): void {
  if (!supported) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // vibration blocked (no user gesture yet / permissions policy) — stay silent
  }
}

export const haptics = {
  /** Face button down — definite, crisp detent. */
  press(): void {
    pulse(12)
  },
  /** Face button up — barely-there release tick. */
  release(): void {
    pulse(4)
  },
  /** Stick planted or pill tapped — soft acknowledgment. */
  plant(): void {
    pulse(8)
  },
  /** Stick crossed into a new direction — feather-light step. */
  step(): void {
    pulse(5)
  },
  /** Button lock engaged — two detents, unmistakably "latched". */
  lock(): void {
    pulse([10, 40, 10])
  },
  /** Button lock released — a single light tick. */
  unlock(): void {
    pulse(6)
  },
}
