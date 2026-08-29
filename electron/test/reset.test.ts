/**
 * `core/reset.ts` -- "Reset to Defaults".
 *
 * Read from `MainWindow.ResetToDefaults` rather than measured: it is a private method on a WPF `Window`,
 * so the `fc-appprobe` harness cannot reach it the way it reaches `SettingsService`. Same caveat as
 * `tray-menu.test.ts`, said again here because Phase 3 otherwise claims to be measured throughout.
 *
 * The tests that carry weight are the two that would pass a wrong implementation:
 *
 *   - `fontSize` must be 16, NOT the default 32. `settings = DEFAULTS` is the obvious implementation of
 *     a menu item called "Reset to Defaults" and it is wrong on the most visible field in the app.
 *   - The twelve untouched fields must SURVIVE. Every one of them equals its default on a fresh profile,
 *     so a `DEFAULTS`-based implementation passes any test written against a default-valued fixture.
 *     They are therefore all asserted from a fixture where each holds its NON-default value.
 */

import { describe, expect, test } from "bun:test"
import { DEFAULTS } from "../src/core/settings.js"
import type { AppSettings } from "../src/core/settings.js"
import { RESET_FIELDS, RESET_FIELD_COUNT, RESET_PRESERVES, SETTINGS_FIELD_COUNT, resetToDefaults } from "../src/core/reset.js"

const PRIMARY_KEY = "3440x1440@0,0:1.00"

/**
 * A thoroughly configured profile: every field the reset must PRESERVE holds a non-default value, and
 * every field it must CHANGE holds something other than its reset value. So a reset that no-ops and a
 * reset that overwrites everything both fail.
 */
const CONFIGURED: AppSettings = {
  ...DEFAULTS,
  monitorPositions: { [PRIMARY_KEY]: { left: 1620, top: 20 }, "1920x1080@3440,0:1.00": { left: 3500, top: 100 } },
  lastActiveMonitor: "1920x1080@3440,0:1.00",
  // The twelve the reset never touches, all flipped away from their defaults.
  statsVisible: true,
  cpuVisible: false,
  gpuVisible: false,
  memVisible: false,
  pagVisible: false,
  batteryVisible: false,
  uptimeVisible: false,
  showHourTicks: true,
  showMinuteDots: true,
  showHourNumbers: true,
  lcdSize: "small",
  batteryAlertThresholdPercent: 42,
  // A sample of the ones it does touch.
  fontSize: 64,
  accentColor: "#FF00FF00",
  opacity: 0.7000000000000001,
  clockType: "nixie",
  lcdUse24Hr: true,
  lcdShowSeconds: false,
  lcdStyle: "Paper",
  ghostModeEnabled: false,
  ghostFadeRadiusPx: 200,
  useCtrl: false,
  useAlt: false,
  useShift: true,
  useWin: true,
  autoLaunchEnabled: true,
  autoContrastEnabled: true,
  processCountThresholdPercent: 25,
  statsIntervalSeconds: 5,
  textStyle: "Split",
  showDate: false,
  dateFormat: "Long",
  phraseStyle: "Pirate",
  phraseLocale: "pl",
  phraseWrapEnabled: false,
  phraseWrapStyle: "none",
  backdropAlwaysVisible: true,
  backdropOpacityPercent: 90,
  updateChecksEnabled: false,
}

describe("resetToDefaults", () => {
  test("the whole result, field for field", () => {
    expect(resetToDefaults(CONFIGURED, PRIMARY_KEY)).toEqual({
      // Cleared and re-keyed together.
      monitorPositions: {},
      lastActiveMonitor: PRIMARY_KEY,
      // The 27 assigned fields.
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
      // The 12 preserved, at the configured profile's values.
      statsVisible: true,
      cpuVisible: false,
      gpuVisible: false,
      memVisible: false,
      pagVisible: false,
      batteryVisible: false,
      uptimeVisible: false,
      showHourTicks: true,
      showMinuteDots: true,
      showHourNumbers: true,
      lcdSize: "small",
      batteryAlertThresholdPercent: 42,
    })
  })

  test("fontSize resets to 16, which is NOT the default 32 -- `ApplyFontSize(16)` in the C#", () => {
    expect(resetToDefaults(CONFIGURED, PRIMARY_KEY).fontSize).toBe(16)
    expect(DEFAULTS.fontSize).toBe(32)
  })

  test("the result differs from DEFAULTS -- reset is not Defaults()", () => {
    expect(resetToDefaults(DEFAULTS, PRIMARY_KEY)).not.toEqual(DEFAULTS)
  })

  test.each(RESET_PRESERVES.map((field) => [field] as const))("preserves %s", (field) => {
    const result = resetToDefaults(CONFIGURED, PRIMARY_KEY)
    expect(result[field]).toEqual(CONFIGURED[field])
    // And the fixture is actually discriminating: the preserved value is not the default, so an
    // implementation that spread DEFAULTS over everything would fail this arm rather than pass it.
    expect(result[field]).not.toEqual(DEFAULTS[field])
  })

  test.each(Object.keys(RESET_FIELDS).map((field) => [field] as const))("assigns %s", (field) => {
    const key = field as keyof AppSettings
    const result = resetToDefaults(CONFIGURED, PRIMARY_KEY)
    expect(result[key]).toEqual(RESET_FIELDS[field as keyof typeof RESET_FIELDS])
    expect(result[key]).not.toEqual(CONFIGURED[key])
  })

  test("clears every saved position, both of them", () => {
    expect(Object.keys(CONFIGURED.monitorPositions)).toHaveLength(2)
    expect(resetToDefaults(CONFIGURED, PRIMARY_KEY).monitorPositions).toEqual({})
  })

  test("keys to the primary, so the cleared positions do not read as first-run on the next launch", () => {
    // `resolveStartPosition` treats "a key with no stored position" the same as "no key": first-run,
    // top-right. That is correct there and wrong here, which is why the caller commits a position
    // immediately after this returns.
    const result = resetToDefaults(CONFIGURED, PRIMARY_KEY)
    expect(result.lastActiveMonitor).toBe(PRIMARY_KEY)
    expect(result.monitorPositions[result.lastActiveMonitor]).toBeUndefined()
  })

  test("does not mutate its input", () => {
    const before = structuredClone(CONFIGURED)
    resetToDefaults(CONFIGURED, PRIMARY_KEY)
    expect(CONFIGURED).toEqual(before)
  })

  test("27 assigned + 12 preserved + 2 placement = all 41 fields, none forgotten", () => {
    expect(RESET_FIELD_COUNT).toBe(27)
    expect(RESET_PRESERVES).toHaveLength(12)
    expect(RESET_FIELD_COUNT + RESET_PRESERVES.length + 2).toBe(SETTINGS_FIELD_COUNT)
    expect(SETTINGS_FIELD_COUNT).toBe(41)
  })

  test("the assigned and preserved sets do not overlap", () => {
    const assigned = new Set(Object.keys(RESET_FIELDS))
    expect(RESET_PRESERVES.filter((f) => assigned.has(f))).toEqual([])
  })

  test("an empty primary key is passed through -- the caller's no-display branch", () => {
    // `onResetToDefaults` only reaches this with `settings.lastActiveMonitor`, which may be `""`. The
    // result is the first-run sentinel, which is the right answer when there is no display to key to.
    expect(resetToDefaults(CONFIGURED, "").lastActiveMonitor).toBe("")
  })
})
