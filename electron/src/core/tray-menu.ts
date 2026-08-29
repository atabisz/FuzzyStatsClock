/**
 * The tray menu as data, ported from FuzzyClock.App/TrayMenuBuilder.cs.
 *
 * A pure model rather than a `Menu.buildFromTemplate` call, for the reason every other `core/` module
 * exists: the labels, the order, the separators and -- above all -- which items show a tick for a
 * given state are the things a parity claim is made about, and none of them need Electron to test.
 * `main/tray.ts` is the thin adapter that turns this into a real menu.
 *
 * ## No C# test covers TrayMenuBuilder
 *
 * Confirmed by search: `FuzzyClock.App.Tests/` has no tray-menu test at all. So `test/tray-menu.test.ts`
 * is NEW coverage, not a translation, and its expectations come from reading TrayMenuBuilder.cs rather
 * than from a recorded C# run. Said plainly because everything else in Phase 3 is measured, and this
 * is the one table that is not.
 *
 * ## Checkboxes, not radios, for Clock Type
 *
 * The C# sets `Checked` on all four clock-type items independently -- four checkboxes of which exactly
 * one happens to be ticked. Electron offers `type: "radio"`, which would be the more idiomatic model,
 * and it is deliberately NOT used: radio items render as a dot rather than a tick and auto-uncheck
 * their siblings, so the menu would look and behave differently from the app this is a port of.
 */

import type { ClockType } from "./settings.js"

/** Every action the menu can raise. String ids so the adapter is a lookup, not a closure per item. */
export type TrayAction =
  | "open-settings"
  | "set-clock-type:phrase"
  | "set-clock-type:dial"
  | "set-clock-type:lcd"
  | "set-clock-type:nixie"
  | "toggle-ghost-mode"
  | "toggle-stats"
  | "toggle-auto-contrast"
  | "toggle-auto-launch"
  | "reset-defaults"
  | "about"
  | "quit"

export type TrayMenuItem =
  | { readonly kind: "separator" }
  | { readonly kind: "command"; readonly label: string; readonly action: TrayAction }
  | { readonly kind: "checkbox"; readonly label: string; readonly action: TrayAction; readonly checked: boolean }
  | { readonly kind: "submenu"; readonly label: string; readonly items: readonly TrayMenuItem[] }

/**
 * `record TrayMenuState` -- the four booleans and the clock type the checkmarks are computed from.
 *
 * Deliberately not `AppSettings`: the menu reads five fields, and a narrower input is what lets the
 * checkmark table be exhaustive without enumerating forty irrelevant settings.
 */
export interface TrayMenuState {
  readonly ghostModeEnabled: boolean
  readonly statsVisible: boolean
  readonly autoContrastEnabled: boolean
  readonly autoLaunchEnabled: boolean
  readonly clockType: ClockType
}

/** `NotifyIcon.Text` -- the hover tooltip, and on Linux the indicator's accessible name. */
export const TRAY_TOOLTIP = "FuzzyClock"

/** `MessageBox` caption. */
export const ABOUT_TITLE = "About FuzzyClock"

/** Labels in one place so the menu and its test cannot disagree about a string. */
export const TRAY_LABELS = {
  openSettings: "Open Settings...",
  clockType: "Clock Type",
  phrase: "Phrase",
  dial: "Dial",
  lcd: "LCD",
  nixie: "Nixie",
  ghostMode: "Ghost Mode",
  showStats: "Show Stats",
  autoContrast: "Auto-Contrast",
  autoLaunch: "Auto-Launch at Login",
  resetDefaults: "Reset to Defaults",
  about: "About",
  quit: "Quit",
} as const

/**
 * The menu for a given state -- `BuildMenu` and `SyncCheckmarks` in one function.
 *
 * The C# needs both because WinForms items are long-lived objects it holds field references to and
 * re-ticks on every `menu.Opening`. Rebuilding from state is the same behaviour with nothing to keep
 * in sync, and Electron wants a fresh template on each open anyway. The `Opening` handler mattered:
 * without it the ticks went stale whenever a setting changed from the settings window rather than
 * from the menu, so `main/tray.ts` must rebuild per open, not once at startup.
 */
export function buildTrayMenu(state: TrayMenuState): readonly TrayMenuItem[] {
  return [
    { kind: "command", label: TRAY_LABELS.openSettings, action: "open-settings" },
    { kind: "separator" },
    {
      kind: "submenu",
      label: TRAY_LABELS.clockType,
      items: [
        { kind: "checkbox", label: TRAY_LABELS.phrase, action: "set-clock-type:phrase", checked: state.clockType === "phrase" },
        { kind: "checkbox", label: TRAY_LABELS.dial, action: "set-clock-type:dial", checked: state.clockType === "dial" },
        { kind: "checkbox", label: TRAY_LABELS.lcd, action: "set-clock-type:lcd", checked: state.clockType === "lcd" },
        { kind: "checkbox", label: TRAY_LABELS.nixie, action: "set-clock-type:nixie", checked: state.clockType === "nixie" },
      ],
    },
    { kind: "checkbox", label: TRAY_LABELS.ghostMode, action: "toggle-ghost-mode", checked: state.ghostModeEnabled },
    { kind: "checkbox", label: TRAY_LABELS.showStats, action: "toggle-stats", checked: state.statsVisible },
    { kind: "checkbox", label: TRAY_LABELS.autoContrast, action: "toggle-auto-contrast", checked: state.autoContrastEnabled },
    { kind: "checkbox", label: TRAY_LABELS.autoLaunch, action: "toggle-auto-launch", checked: state.autoLaunchEnabled },
    { kind: "separator" },
    { kind: "command", label: TRAY_LABELS.resetDefaults, action: "reset-defaults" },
    { kind: "command", label: TRAY_LABELS.about, action: "about" },
    { kind: "command", label: TRAY_LABELS.quit, action: "quit" },
  ]
}

/**
 * The About body, verbatim from TrayMenuBuilder.cs including the `&` and the line breaks.
 *
 * The C# builds `versionStr` as `Major.Minor.Build` off the assembly version, dropping the revision,
 * and prints `0.0.0` when the version is null. Here the caller passes `app.getVersion()`, which
 * returns package.json's `version` -- already a three-part string, and a semver prerelease tag such
 * as `5.0.0-alpha.0` is shown as-is rather than truncated. An empty string maps to `0.0.0` to keep
 * the C#'s "no version available" output.
 */
export function aboutMessage(version: string): string {
  const shown = version === "" ? "0.0.0" : version
  return [
    `FuzzyClock v${shown}`,
    "",
    "A fuzzy time & system stats desktop overlay.",
    "",
    "Built as a Claude + GSD experiment",
    "by Alex Tabisz.",
  ].join("\n")
}
