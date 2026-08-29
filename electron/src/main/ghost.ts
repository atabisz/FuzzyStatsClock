/**
 * The platform half of ghost mode: the 33 ms cursor poll, the click-through mutation, and the ratio push.
 *
 * `core/ghost.ts` is the pure seam and `core/ghost-fade.ts` is the renderer's pump. This file is what
 * Phase 2 called "platform plumbing, not logic", and it is structurally typed for the same reason
 * `window-placement.ts` is -- every Electron surface it touches is an interface, so Bun drives the whole
 * driver with fakes and the tests cover the parts a probe cannot reach.
 *
 * ## `setIgnoreMouseEvents`, not `WS_EX_TRANSPARENT`
 *
 * The C# sets `WS_EX_TRANSPARENT` with `SetWindowLong` and follows it with a `SWP_FRAMECHANGED`
 * `SetWindowPos`. Electron's `setIgnoreMouseEvents(true)` is that same style bit on Windows and the
 * equivalent on the other two platforms, so the port is one call -- and `probe-shell.ts`'s S8 arm reads
 * the bit back off the live window, which is the before-half of this claim: it is currently CLEAR,
 * because nothing had ever set it.
 *
 * **No `{ forward: true }`.** That option asks Chromium to keep delivering `mousemove` into a
 * click-through window, and it is exactly the mechanism ISC-24 forbids -- measured here delivering zero
 * events. The cursor poll below exists because of that measurement; passing `forward` would reintroduce
 * the dependency on a thing that does not work while also being the slower of the two.
 *
 * ## D-06's asymmetry, and the one call that closes it
 *
 * `GhostSampler.onTick` CLEARS its own ghost flag on a restore but never SETS it on an activate: it
 * emits `"activate"` and leaves the write to whoever applies click-through. That is the C#'s contract,
 * preserved deliberately, and it means **this file must call `markActive()`** -- a driver that applies
 * the style and forgets it gets `"activate"` on every one of the 30 ticks per second while the cursor
 * sits over the widget, each one re-applying the same style bit. That is not a hypothetical: it is what
 * the sampler's own tests measure it doing.
 *
 * ## The modifier override ships as a seam with no reader, and that is a decision
 *
 * `IsModifierHeld` calls `GetAsyncKeyState(VK_LCONTROL)` on the sampler thread. **There is no Electron
 * API for global modifier state.** The candidates and why each is not it:
 *
 *   - `globalShortcut.register()` needs a non-modifier accelerator key, and registering one would steal
 *     that chord from every other app on the desktop.
 *   - `webContents.on("before-input-event")` and DOM `keydown` both need focus. This overlay never has
 *     it -- `skipTaskbar`, no dock icon, and click-through half the time by design.
 *   - A native module (`node-global-key-listener` and friends) would work, and is refused on cost: a
 *     compiled dependency to prebuild for three platforms in Phase 7, plus a macOS Accessibility
 *     permission prompt at first launch, for a convenience override. This tree has five devDependencies
 *     and no native ones, and that is worth more than the feature.
 *   - Polling the OS per tick (PowerShell `GetAsyncKeyState` on Windows) is 30 process spawns a second.
 *
 * So `readModifiers` is injected, and the shipped implementation returns `NO_MODIFIERS` -- never held.
 * The consequence is stated rather than buried: **the Ctrl+Alt escape hatch does not work**, so while
 * ghost mode is enabled and the cursor is over the widget it is click-through with no keyboard way to
 * suppress it. The tray icon remains the route to every setting, which is why this is a degraded
 * feature and not a lost one. The driver logs it once at startup, and `isModifierHeld`'s full logic is
 * tested over all 256 combinations, so dropping a real reader in later is a one-line change.
 */

import { GhostSampler, NO_MODIFIERS, computeProximityRatio, isModifierHeld } from "../core/ghost.js"
import type { ModifierConfig } from "../core/ghost.js"
import { boundsToEdges } from "../core/ghost-rect.js"
import type { WindowBounds } from "../core/ghost-rect.js"

/** `System.Threading.Timer(…, 0, 33)` -- SAMP-04. 33 ms, not 16: the C#'s cadence, measured. */
export const SAMPLE_MS = 33

/** The Electron surfaces this driver touches. Structural, so a test passes a literal. */
export interface GhostWindowLike {
  getBounds(): WindowBounds
  setIgnoreMouseEvents(ignore: boolean): void
  isDestroyed(): boolean
}

export interface CursorSourceLike {
  getCursorScreenPoint(): { x: number; y: number }
}

export interface GhostDriverOptions {
  readonly window: GhostWindowLike
  readonly cursor: CursorSourceLike
  /** Where the ratio goes. Called only when it actually changed -- see {@link GhostDriver.tick}. */
  readonly onRatio: (ratio: number) => void
  /** `Restored`. Fires only at full retreat, after having been ghost-active -- the v4.0 P67 invariant. */
  readonly onRestored: () => void
  readonly log: (level: "info" | "warn" | "error", message: string) => void
  /** Injected for the reason in the header. Omitted means "no key is ever held". */
  readonly readModifiers?: () => ModifierConfig
}

export class GhostDriver {
  readonly sampler = new GhostSampler()

  #timer: ReturnType<typeof setInterval> | null = null
  #ticks = 0
  #skipped = 0
  readonly #options: GhostDriverOptions
  readonly #readModifiers: () => ModifierConfig

  constructor(options: GhostDriverOptions) {
    this.#options = options
    this.#readModifiers = options.readModifiers ?? ((): ModifierConfig => NO_MODIFIERS)
    if (options.readModifiers === undefined) {
      options.log(
        "warn",
        "ghost: no global modifier reader on this platform — the Ctrl+Alt escape hatch is inert." +
          " See src/main/ghost.ts for why no native module was added.",
      )
    }
  }

  /** For the probe and the tests: how many ticks ran, and how many did no work at all (D-08). */
  get counters(): { ticks: number; skipped: number } {
    return { ticks: this.#ticks, skipped: this.#skipped }
  }

  get isActive(): boolean {
    return this.sampler.isActive
  }

  /**
   * `_ghostMode.IsModifierHeld()` as the right-click gate calls it -- recomputed on demand, not cached.
   *
   * On demand because the C#'s is: `Window_PreviewMouseRightButtonUp` calls the predicate at the moment of
   * the click rather than reading whatever the last 33 ms sample decided, and a cached value would answer
   * for a keyboard state up to a tick old. It returns false on every platform today for the reason in the
   * header, and it is wired anyway -- the alternative was a `false` literal at the call site, which is a
   * thing that reads as correct and cannot be fixed by supplying the missing reader.
   */
  get isModifierHeld(): boolean {
    return isModifierHeld(this.sampler.modifiers, this.#readModifiers())
  }

  /**
   * A settings push. `enabled` and `radius` land on the sampler; a DISABLE also restores interactivity.
   *
   * That last part is not in the C#'s setter and has to be here: `onTick` returns a no-op while disabled
   * and notably does NOT clear its own ghost flag (SEM-05, measured), so turning ghost mode off from the
   * tray while the cursor happens to be over the widget would otherwise leave `setIgnoreMouseEvents(true)`
   * applied with no tick left that could ever clear it -- a permanently click-through overlay whose only
   * cure is a restart. Cheap to fix here, invisible to find later.
   */
  applySettings(enabled: boolean, radiusPx: number, modifiers: ModifierConfig): void {
    const wasEnabled = this.sampler.enabled
    this.sampler.enabled = enabled
    this.sampler.fadeRadiusPx = radiusPx
    this.sampler.modifiers = modifiers
    if (wasEnabled && !enabled) this.#clearClickThrough("ghost mode disabled")
  }

  start(): void {
    if (this.#timer !== null) return
    // `0` initial delay in the C#; `setInterval` has no such argument, and one tick's difference at
    // startup is 33 ms before the first sample. Not worth an extra immediate call that would run before
    // `ready-to-show` on some launches.
    this.#timer = setInterval(() => this.tick(), SAMPLE_MS)
  }

  stop(): void {
    if (this.#timer === null) return
    clearInterval(this.#timer)
    this.#timer = null
  }

  /**
   * One sample. Public because the tests drive it directly rather than waiting on a timer.
   *
   * D-02's `Interlocked.CompareExchange` reentrancy guard has no counterpart: this body is synchronous
   * on one thread, so a second tick cannot begin inside the first. Recorded rather than ported as a
   * no-op flag that could never be set -- a guard that cannot fire reads as protection that exists.
   */
  tick(): void {
    this.#ticks++
    if (!this.sampler.enabled) {
      this.#skipped++
      return
    }
    const win = this.#options.window
    if (win.isDestroyed()) {
      this.#skipped++
      return
    }

    const cursor = this.#options.cursor.getCursorScreenPoint()
    const edges = boundsToEdges(win.getBounds())
    const held = this.isModifierHeld

    const result = this.sampler.onTick(
      cursor.x,
      cursor.y,
      edges.left,
      edges.top,
      edges.right,
      edges.bottom,
      held,
    )

    // D-08: zero downstream pressure at steady state. Nothing changed and nothing transitioned, so no
    // IPC message is sent -- which matters more here than in WPF, where the equivalent was a dispatcher
    // queue entry. At 30 Hz with the cursor parked away from the widget this is the whole cost of the
    // feature: one cursor read, one bounds read, and a return.
    if (result.transition === "none" && !result.ratioChanged) {
      this.#skipped++
      return
    }

    // Order is the C#'s: `ProximityChanged` fires BEFORE the style mutation and before `Restored`.
    if (result.ratioChanged) this.#options.onRatio(result.ratio)

    switch (result.transition) {
      case "activate":
        win.setIgnoreMouseEvents(true)
        // D-06's other half. Without this the next tick emits "activate" again, forever.
        this.sampler.markActive()
        break
      case "restore-no-event":
        win.setIgnoreMouseEvents(false)
        break
      case "restore-with-event":
        win.setIgnoreMouseEvents(false)
        this.#options.onRestored()
        break
      case "none":
        // Reachable only with `ratioChanged` true, which the send above already handled.
        break
    }
  }

  /**
   * The disable edge, ported from `MainWindow.SetGhostModeEnabled(false)`'s `CR-01` block.
   *
   * Three writes, and all three are needed: clear the style, clear the sampler's flag, and zero the
   * ratio. Dropping the middle one is the defect `GhostSampler.deactivate`'s doc-comment describes --
   * a re-enable with the cursor over the widget then leaves it invisible but not click-through, with no
   * tick left that could ever notice. Emits no `Restored`: no retreat happened, and the event is the
   * cursor-left-the-halo signal rather than a state-is-clear one.
   */
  #clearClickThrough(why: string): void {
    const wasActive = this.sampler.isActive
    this.sampler.deactivate()
    const win = this.#options.window
    if (!win.isDestroyed()) win.setIgnoreMouseEvents(false)
    if (wasActive) this.#options.log("info", `ghost: click-through cleared (${why})`)
    this.#options.onRatio(0)
  }
}

/** Re-exported so `main.ts` has one import for the ghost surface. */
export { computeProximityRatio }
