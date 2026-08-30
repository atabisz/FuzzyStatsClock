/**
 * Toggling one stat row, including the auto-collapse that hiding the last one triggers.
 *
 * `SetStatRowVisible` (`MainWindow.xaml.cs:1498-1532`) is not a setter. It does three things beyond
 * writing the flag, and two of them change other state:
 *
 *   1. **Auto-collapse, one-way.** Hiding a row while the other four are already hidden collapses the
 *      whole panel — `SetStatsVisible(false)`. Re-showing a row does *not* bring the panel back, which the
 *      C# comment calls out explicitly. So "all five hidden with the panel visible" is a reachable state
 *      (hide all five, then tick Stats in the tray), and `statsPanelHeight` returning 0 is that state
 *      rather than an error.
 *   2. **A re-clamp on SHOW only.** Showing a row makes the panel taller, which can push a widget near the
 *      bottom of a display off it. That is a window-placement action and belongs to main, not here — this
 *      module reports it in the result so the caller cannot forget, rather than performing it.
 *   3. `SaveSettings()` unconditionally, which is `applySettings`' job in the port.
 *
 * **The uptime row is a fourth case, not a fifth row.** `SetUptimeRowVisible` re-clamps on show and saves,
 * and does NOT participate in auto-collapse — hiding it can never collapse the panel, however many rows
 * are already off. Reading it as a sixth member of the row set would make the panel vanish when a user
 * hid the uptime line last, which the original never does.
 *
 * ## Wired to nothing until the settings window lands
 *
 * The only route to these toggles in the C# is `SettingsWindow`'s six events (`:766-771`) — there is no
 * tray item for them — and the settings window is ISC-32 / Phase 6.5. Phase 6 owns *honouring* the saved
 * flags, which is `statsLayout`'s visibility parameter and the renderer's per-row `setVisible`, and both of
 * those are live. This function is here rather than in 6.5 because the rule was measured while reading
 * `UpdateStatsDisplay` for the sources, and the same precedent already exists in this tree: `core/contrast.ts`
 * is translated and tested ahead of the phase that wires it.
 */

import { STATS_ROW_KEYS, type StatsRowKey } from "./layout.js"
import type { AppSettings } from "./settings.js"

/** The `AppSettings` field each row's visibility lives in. */
const ROW_FIELD: Readonly<Record<StatsRowKey, keyof AppSettings>> = {
  cpu: "cpuVisible",
  gpu: "gpuVisible",
  mem: "memVisible",
  pag: "pagVisible",
  batt: "batteryVisible",
}

export interface RowToggleResult {
  readonly settings: AppSettings
  /** True when the panel was auto-collapsed by this change. */
  readonly collapsed: boolean
  /**
   * True when the panel grew, so the caller must re-clamp the window into the display's work area.
   *
   * Only ever set on a SHOW, and only while the panel is visible — a taller panel behind a hidden panel
   * moves nothing. Hiding a row shrinks the window, which cannot push it off a screen.
   */
  readonly reclamp: boolean
}

/** Whether all five metric rows are hidden in these settings. The uptime row is deliberately not counted. */
export function allRowsHidden(settings: AppSettings): boolean {
  return STATS_ROW_KEYS.every((key) => settings[ROW_FIELD[key]] === false)
}

/**
 * `SetStatRowVisible(row, visible)` as a pure transition.
 *
 * The auto-collapse test runs against the settings **after** the flag is written, which is the C#'s order:
 * it assigns `row.Visibility` and then reads all five, so the row being hidden is included in its own
 * check. Testing before the write would need four-of-four rather than five-of-five and would be one
 * off-by-one away from collapsing the panel a row early.
 */
export function setStatRowVisible(
  settings: AppSettings,
  key: StatsRowKey,
  visible: boolean,
): RowToggleResult {
  const next: AppSettings = { ...settings, [ROW_FIELD[key]]: visible }
  const collapse = !visible && allRowsHidden(next) && next.statsVisible
  return {
    settings: collapse ? { ...next, statsVisible: false } : next,
    collapsed: collapse,
    reclamp: visible && next.statsVisible,
  }
}

/** `SetUptimeRowVisible(visible)`. No auto-collapse — see the header. */
export function setUptimeRowVisible(settings: AppSettings, visible: boolean): RowToggleResult {
  const next: AppSettings = { ...settings, uptimeVisible: visible }
  return { settings: next, collapsed: false, reclamp: visible && next.statsVisible }
}
