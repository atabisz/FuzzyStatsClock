/**
 * What the four display faces have in common.
 *
 * ## The three-method split is WPF's, not an abstraction invented here
 *
 * Each of the ported controls has the same shape, and it is worth naming because the per-second cost of
 * the whole app depends on the boundary being respected:
 *
 *  - **`rebuild`** is `RebuildGeometry()` / `InitDialDecorations()`: it creates elements and assigns
 *    colours. It runs on a settings or theme change and never on a tick.
 *  - **`tick`** is `UpdateTime()` / `UpdateDialDisplay()`: it writes *data* into elements that already
 *    exist. It must not create, remove or re-measure anything.
 *  - **`activate`** is `IsVisibleChanged`: both digit views start their timer on becoming visible and stop
 *    it on becoming hidden, with the C#'s own comment -- "Do NOT call UpdateTime() here" -- recording that
 *    the event does the first paint. The port has one shared per-second tick, so `activate` here is where
 *    the Nixie's 40 ms flicker interval starts and stops, and where a face forgets any change-detection
 *    state that would suppress its first paint.
 *
 * ## Why `rebuild` is cheap to call and does its own gating
 *
 * Auto-contrast (Phase 8) samples the wallpaper every 500 ms and can push a new colour each time. A
 * `rebuild` that tore down and re-created 108 Nixie elements twice a second would be a real cost, so each
 * face splits its own work: {@link structureGate} decides whether the *elements* need rebuilding from a key
 * over the settings that change them, and the colour assignments run unconditionally underneath. Callers
 * therefore do not have to know which changes are structural, which is the mistake that would otherwise
 * show up as an LCD that keeps its old digit size after a font-size change.
 */

import type { ThemeColors } from "../../core/display-colors.js"
import type { Face } from "../../core/display-plan.js"
import type { AppSettings } from "../../core/settings.js"

export interface FaceContext {
  readonly settings: AppSettings
  readonly theme: ThemeColors
}

export interface ClockFace {
  /** Which of the five display areas this is. Its container id comes from `FACE_CONTAINER_IDS`. */
  readonly face: Face
  /** Create elements and assign colours. Safe to call on every settings or theme change. */
  rebuild(context: FaceContext): void
  /** Write this second's data. Creates nothing. */
  tick(now: Date): void
  /** Show or hide, and start or stop whatever this face runs on its own clock. */
  activate(active: boolean): void
  /**
   * The face's rendered content width, when only the face can know it.
   *
   * The phrase faces implement this -- a string's width depends on the font the platform resolved, so it
   * comes from `getComputedTextLength()` after `tick` has painted. The three fixed faces do not, because
   * `contentSize` computes their size exactly and a measurement would be a second, weaker source for a
   * number already pinned by fixture.
   */
  measure?(): FaceMeasurement
}

export interface FaceMeasurement {
  /** The widest painted line, in user units. */
  readonly width: number
  /** 1, or 2 once `ApplyPhraseWrap` has split the phrase. Feeds `windowLayout`'s third argument. */
  readonly lines: number
}

/**
 * A change detector over a string key.
 *
 * Returns a function that answers "has the key changed since last time?", and `true` on its first call so
 * the initial build always happens. Trivial, and named because every face needs exactly this and an
 * inlined `let last = ""` in four files is four chances to compare against the wrong thing.
 */
export function structureGate(): (key: string) => boolean {
  let last: string | null = null
  return (key: string): boolean => {
    if (last === key) return false
    last = key
    return true
  }
}
