/**
 * "Reset to Defaults" -- and it is NOT `SettingsService.Defaults()`.
 *
 * That is the whole reason this module exists as its own file with its own table. `MainWindow.ResetToDefaults`
 * (MainWindow.xaml.cs:1600-1697) is a hand-written list of assignments covering 27 of this port's 41
 * fields. It disagrees with `Defaults()` on one of them and is SILENT about twelve more:
 *
 *   - **`fontSize` resets to 16, while the default is 32.** The C# calls `ApplyFontSize(16)` with the
 *     comment "Reset font size to small (16pt)". A port that implemented this menu item as
 *     `settings = DEFAULTS` would double the widget's text size on reset -- the most visible thing on
 *     screen, and the reason this is a table rather than a spread of `DEFAULTS`.
 *   - Twelve fields are never assigned, so a reset LEAVES them: `statsVisible`, the five per-metric
 *     visibility flags, `uptimeVisible`, the three clock-face flags, `lcdSize` and
 *     `batteryAlertThresholdPercent`. Expressed here by ABSENCE from `RESET_FIELDS`, which is exactly
 *     how the C# expresses it -- listing them with their default values would be a different function
 *     that happens to agree on a fresh profile and diverge on a configured one. A user with the stats
 *     panel open and a 24h LCD keeps both across a reset, in the WPF app and here.
 *
 * ## Read from source, not measured
 *
 * `ResetToDefaults` is a private method on a WPF `Window`, so the `fc-appprobe` console harness cannot
 * reach it the way it reaches `SettingsService` and the `Core` formatters. These expectations come from
 * reading the method. Same caveat as `tray-menu.ts`, and stated for the same reason: Phase 3 claims to
 * be measured, and these are the two files where that claim does not hold.
 *
 * ## What is deliberately not here
 *
 * `SetSoftwareRendering(true)` and the four `Temp*Visible` assignments. Both are among the six settings
 * this port drops (see `settings-import.ts`), so there is no field to reset. `AutoLaunchService.Disable()`
 * is a side effect rather than a field: `autoLaunchEnabled: false` is in the table, and unregistering
 * the login item is the caller's job (ISC-30).
 */

import { DEFAULTS } from "./settings.js"
import type { AppSettings } from "./settings.js"

/**
 * Every field `ResetToDefaults` assigns, at the value it assigns.
 *
 * All but `fontSize` happen to equal `DEFAULTS`. Written out literally anyway: the C# is a list of
 * literals, and referencing `DEFAULTS` here would silently follow a future default change that the
 * WPF reset path would not have followed.
 */
export const RESET_FIELDS = {
  accentColor: "#FFFFFFFF",
  opacity: 1.0,
  fontSize: 16,
  clockType: "phrase",
  lcdUse24Hr: false,
  lcdShowSeconds: true,
  lcdStyle: "Dark",
  ghostModeEnabled: true,
  ghostFadeRadiusPx: 80,
  useCtrl: true,
  useAlt: true,
  useShift: false,
  useWin: false,
  autoLaunchEnabled: false,
  autoContrastEnabled: false,
  processCountThresholdPercent: 5.0,
  statsIntervalSeconds: 2.0,
  textStyle: "Classic",
  showDate: true,
  dateFormat: "Short",
  phraseStyle: "Classic",
  phraseLocale: "auto",
  phraseWrapEnabled: true,
  phraseWrapStyle: "midpoint",
  backdropAlwaysVisible: false,
  backdropOpacityPercent: 35,
  updateChecksEnabled: true,
} as const satisfies Partial<AppSettings>

/**
 * Apply the reset to a live settings object.
 *
 * `monitorPositions` is emptied -- "Clear all saved positions so reset gives a clean slate" -- and
 * `lastActiveMonitor` becomes the primary's key, because the C# sets `_currentMonitorKey =
 * MonitorService.GetPrimaryMonitorKey()` in the same breath as centring the window there. Passing the
 * key in rather than computing it keeps this module free of display geometry; the caller has both the
 * key and the window it has to move.
 *
 * Clearing the positions and keying to the primary have to happen together. Clearing alone would leave
 * `lastActiveMonitor` naming a display with no stored position, which `resolveStartPosition` reads as
 * first-run and answers with the top-right corner -- so the next restart would move the widget away
 * from the centre the reset just put it in.
 */
export function resetToDefaults(current: AppSettings, primaryKey: string): AppSettings {
  return {
    ...current,
    ...RESET_FIELDS,
    monitorPositions: {},
    lastActiveMonitor: primaryKey,
  }
}

/** The nine fields a reset leaves alone, for a test to assert against and a reader to check. */
export const RESET_PRESERVES: readonly (keyof AppSettings)[] = [
  "statsVisible",
  "cpuVisible",
  "gpuVisible",
  "memVisible",
  "pagVisible",
  "batteryVisible",
  "uptimeVisible",
  "showHourTicks",
  "showMinuteDots",
  "showHourNumbers",
  "lcdSize",
  "batteryAlertThresholdPercent",
]

/** Sanity: `RESET_FIELDS` plus `RESET_PRESERVES` plus the two placement fields must be all 41. */
export const RESET_FIELD_COUNT = Object.keys(RESET_FIELDS).length
export const SETTINGS_FIELD_COUNT = Object.keys(DEFAULTS).length
