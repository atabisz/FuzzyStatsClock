/**
 * Hovering the widget: the backdrop, and the fast refresh.
 *
 * `Window_MouseEnter` / `Window_MouseLeave` (`MainWindow.xaml.cs:1456-1495`). Two effects, two different
 * sets of conditions, and **neither is symmetric between enter and leave** — which is the whole reason this
 * is a module with a test rather than four lines in `main.ts`.
 *
 * ## Enter is gated on ghost mode; leave is gated on ghost being ACTIVE
 *
 * The entire body of `MouseEnter` sits inside `if (IsModifierHeld() || !IsEnabled)`. So with ghost mode on
 * and no modifier held, moving the cursor onto the widget does **nothing at all** — no backdrop, no faster
 * sampling. That is deliberate in the original: ghost mode's own proximity fade owns the cursor's approach,
 * and painting a backdrop under a widget that is fading out would fight it.
 *
 * `MouseLeave`'s guard is a different question — `IsActive`, meaning click-through is currently applied —
 * and it returns early, leaving the backdrop **painted**. It is cleared later by the `Restored` handler
 * (`:249-250`). So "ghost retreat clears the backdrop" is a path through ghost mode, not through leave.
 *
 * ## The stats-panel condition applies to the interval and NOT to the backdrop
 *
 * Enter paints the backdrop unconditionally and changes the interval only when the panel is visible. Leave
 * clears the backdrop unconditionally (bar `backdropAlwaysVisible`) and restores the interval only when the
 * panel is visible. So a user with the stats panel collapsed still gets a hover backdrop, which is right —
 * there would be no reason to tie a visual affordance to a panel.
 *
 * ## The flag it sets is NOT symmetric, and that is a defect reproduced on purpose
 *
 * `_isHoverFastRefresh = true` runs **outside** the panel-visible check on enter, and `= false` runs
 * **inside** it on leave. So: collapse the panel, hover, leave — the flag is now stuck true, and it stays
 * true until a leave that happens while the panel is visible. The flag gates the load-average queue
 * (`load-average.ts`'s `pushCpuSample`), so a stuck flag means the 1/5/15-minute averages silently stop
 * accumulating. Parity is the bar, the arms in `test/hover.test.ts` pin it, and `main.ts` does not read the
 * flag for that purpose anyway — see the next section, which is where the port genuinely diverges.
 *
 * ## What the flag MEANS, and why the port derives it instead of copying it
 *
 * In the C# the flag and "the sample cadence changed" are the same fact, because `_statsTimer` both drives
 * the sampling and gets its interval rewritten. In the port they can come apart, and on Windows they do:
 * `typeperf -si` takes `[[hh:]mm:]ss` and **rejects a fractional interval outright** — measured, the child
 * prints `Invalid syntax: -si <[[hh:]mm:]ss>` and exits — so the Windows source cannot sample at 0.5s at
 * all. Copying the flag there would drop samples out of the load-average queue to pay for a faster cadence
 * that never happened, freezing the averages while the cursor rests on the widget.
 *
 * So `main.ts` reads the flag from what the source **accepted** ({@link StatsSource.setIntervalSec}'s
 * return value) rather than from the cursor. That keeps the C#'s meaning — "the queue's samples are no
 * longer one configured interval apart" — on a platform where the cursor no longer implies it.
 */

/** `TimeSpan.FromSeconds(0.5)` in `Window_MouseEnter`. A literal there, not a setting. */
export const HOVER_INTERVAL_SEC = 0.5

/** The ghost-mode state the enter and leave rules read. Both fields are `GhostDriver` getters. */
export interface GhostHoverState {
  /** `_ghostMode.IsEnabled` — the setting, not the current fade. */
  readonly enabled: boolean
  /** `_ghostMode.IsModifierHeld()` — the Ctrl+Alt escape hatch, inert on this platform. */
  readonly modifierHeld: boolean
  /** `_ghostMode.IsActive` — click-through currently applied. Read by leave only. */
  readonly active: boolean
}

/** What an enter or a leave asks the caller to do. Every field is a decision, never a maybe. */
export interface HoverEffect {
  /** Paint or clear the backdrop. `null` means "leave it exactly as it is". */
  readonly backdrop: "paint" | "clear" | null
  /** The interval the source should run at, or `null` to leave the cadence alone. */
  readonly intervalSec: number | null
  /** The new value of `_isHoverFastRefresh`, or `null` where the original does not assign it. */
  readonly fastRefreshFlag: boolean | null
}

const NOTHING: HoverEffect = { backdrop: null, intervalSec: null, fastRefreshFlag: null }

/**
 * `Window_MouseEnter`.
 *
 * `statsRunning` is the C#'s `_statsTimer != null && _statsTimer.IsEnabled` folded together with
 * `StatsPanel.Visibility == Visible`: all three ask the same question of the port, whose source is either
 * started or it is not.
 */
export function hoverEnter(ghost: GhostHoverState, statsRunning: boolean): HoverEffect {
  // The one gate on the whole body. With ghost enabled and nothing held, hovering is not an event.
  if (!(ghost.modifierHeld || !ghost.enabled)) return NOTHING
  return {
    backdrop: "paint",
    intervalSec: statsRunning ? HOVER_INTERVAL_SEC : null,
    // Outside the panel check in the original. See the header: this is the asymmetry, not a typo here.
    fastRefreshFlag: true,
  }
}

/**
 * `Window_MouseLeave`.
 *
 * `configuredIntervalSec` is `_statsIntervalSeconds` — the user's setting, which is what leave restores.
 * Passed rather than read from a module-level default because it is a setting and this module holds none.
 */
export function hoverLeave(
  ghost: GhostHoverState,
  statsRunning: boolean,
  backdropAlwaysVisible: boolean,
  configuredIntervalSec: number,
): HoverEffect {
  // Ghost active means click-through is on and the proximity fade owns the widget. The backdrop stays
  // painted; `GhostDriver`'s restore edge is what clears it.
  if (ghost.active) return NOTHING
  const backdrop = backdropAlwaysVisible ? null : "clear"
  if (!statsRunning) {
    // Returns before touching either the interval or the flag. The flag not being cleared here is the
    // asymmetry the header describes.
    return { backdrop, intervalSec: null, fastRefreshFlag: null }
  }
  return { backdrop, intervalSec: configuredIntervalSec, fastRefreshFlag: false }
}
