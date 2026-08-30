/**
 * `stats-rows.ts` — `SetStatRowVisible` and `SetUptimeRowVisible` as pure transitions.
 *
 * Provenance: **`MainWindow.xaml.cs:1498-1553`**, read as source. Both functions there do three things
 * beyond writing a flag, and the two that change other state are what this file pins:
 *
 *   1. the one-way auto-collapse, including the fact that its test runs on the settings **after** the write;
 *   2. the re-clamp, which happens on show only and which this module *reports* rather than performs.
 *
 * The third thing — `SaveSettings()` — is `applySettings`' job in the port and has no arm here.
 *
 * ## The panel ships COLLAPSED, so almost every arm has to turn it on
 *
 * `DEFAULTS.statsVisible` is `false` (`settings.ts:177`) while all six row flags are `true` — a fresh
 * install has no stats panel and six visible rows behind it. That makes `DEFAULTS` the wrong base for
 * anything about the collapse (both the collapse and the re-clamp are gated on the panel being up, so
 * every such arm would pass for the wrong reason), which is why `visible()` below exists and why the
 * default is asserted rather than assumed.
 *
 * ## Wired to nothing yet, and tested anyway
 *
 * The only route to these toggles in the C# is the settings window's six events (`:766-771`), which is
 * ISC-32 / Phase 6.5. The precedent for landing a translated rule ahead of its caller is `core/contrast.ts`,
 * and the reason is the same: the rule was measured while reading `UpdateStatsDisplay` for Phase 6's
 * sources, and a measured rule with no test is a rule that gets re-derived from scratch later.
 *
 * ## Immutability is a claim about the settings object, not a style preference
 *
 * `applySettings` diffs the incoming settings against the live ones to decide what to repaint. A transition
 * that mutated its input would make that diff empty and the panel would not re-lay-out until something else
 * changed. The last block checks the input survived.
 */
import { describe, expect, test } from "bun:test"
import { STATS_ROW_KEYS, type StatsRowKey } from "../src/core/layout.js"
import { DEFAULTS, type AppSettings } from "../src/core/settings.js"
import { allRowsHidden, setStatRowVisible, setUptimeRowVisible } from "../src/core/stats-rows.js"

const settings = (overrides: Partial<AppSettings>): AppSettings => ({ ...DEFAULTS, ...overrides })

/** The same, with the panel turned on — the state in which the collapse and the re-clamp can happen at all. */
const visible = (overrides: Partial<AppSettings> = {}): AppSettings =>
  settings({ statsVisible: true, ...overrides })

/** All five metric rows off. The state the auto-collapse exists to prevent arriving at with a visible panel. */
const NONE_VISIBLE: Partial<AppSettings> = {
  cpuVisible: false,
  gpuVisible: false,
  memVisible: false,
  pagVisible: false,
  batteryVisible: false,
}

/** The `AppSettings` field for a row key, restated here so a transposition in the module fails loudly. */
const FIELD: Readonly<Record<StatsRowKey, keyof AppSettings>> = {
  cpu: "cpuVisible",
  gpu: "gpuVisible",
  mem: "memVisible",
  pag: "pagVisible",
  batt: "batteryVisible",
}

describe("the shipped defaults, since every arm below is relative to them", () => {
  test("the panel is off and all six rows are on", () => {
    // Not a tautology: it is the reason a user's first tick of Stats in the tray shows five rows, and the
    // reason `visible()` exists in this file. If `statsVisible` ever defaulted to `true`, half the arms here
    // would still pass while testing a different transition.
    expect(DEFAULTS.statsVisible).toBe(false)
    for (const key of STATS_ROW_KEYS) expect(DEFAULTS[FIELD[key]]).toBe(true)
    expect(DEFAULTS.uptimeVisible).toBe(true)
  })
})

describe("allRowsHidden", () => {
  test("is false on a default profile and true only when all five are off", () => {
    expect(allRowsHidden(DEFAULTS)).toBe(false)
    expect(allRowsHidden(settings(NONE_VISIBLE))).toBe(true)
  })

  test("is false when ANY single row survives, checked one row at a time", () => {
    // Five-of-five, not four-of-four. Each arm here is the off-by-one that would collapse the panel a row
    // early, and there are five distinct ways to make it.
    for (const key of STATS_ROW_KEYS) {
      expect(allRowsHidden(settings({ ...NONE_VISIBLE, [FIELD[key]]: true }))).toBe(false)
    }
  })

  test("ignores the uptime row and the panel flag", () => {
    // The uptime line is a fourth case, not a fifth row. Counting it would make the panel vanish when a user
    // hid the uptime line last, which the original never does.
    expect(allRowsHidden(settings({ ...NONE_VISIBLE, uptimeVisible: true }))).toBe(true)
    expect(allRowsHidden(settings({ ...NONE_VISIBLE, uptimeVisible: false }))).toBe(true)
    expect(allRowsHidden(visible(NONE_VISIBLE))).toBe(true)
    expect(allRowsHidden(visible({ cpuVisible: false }))).toBe(false)
  })
})

describe("hiding a stat row", () => {
  test("writes the row's own field and nothing else", () => {
    // The mapping arm. `batt` reads `batteryVisible`, so the keys and the fields do not correspond by name —
    // one transposed pair silently toggles the wrong row, and every behavioural arm below still passes.
    for (const key of STATS_ROW_KEYS) {
      const result = setStatRowVisible(visible(), key, false)
      expect(result.settings[FIELD[key]]).toBe(false)
      for (const other of STATS_ROW_KEYS.filter((k) => k !== key)) {
        expect(result.settings[FIELD[other]]).toBe(true)
      }
      expect(result.settings.uptimeVisible).toBe(true)
      expect(result.settings.statsVisible).toBe(true)
    }
  })

  test("does not collapse the panel while another row survives", () => {
    let current = visible()
    for (const key of STATS_ROW_KEYS.slice(0, 4)) {
      const result = setStatRowVisible(current, key, false)
      expect(result.collapsed).toBe(false)
      expect(result.settings.statsVisible).toBe(true)
      current = result.settings
    }
    // Four down, one to go, and the panel is still up. This is the state the fifth toggle acts on.
    expect(allRowsHidden(current)).toBe(false)
    expect(current.statsVisible).toBe(true)
  })

  test("collapses the panel on the FIFTH row, counting the row being hidden", () => {
    // The C# assigns `row.Visibility` and *then* reads all five, so the row in flight is included in its own
    // check. A pre-write test would need four-of-four and would collapse on the fourth toggle.
    const four = visible({ ...NONE_VISIBLE, batteryVisible: true })
    const result = setStatRowVisible(four, "batt", false)
    expect(result.collapsed).toBe(true)
    expect(result.settings.statsVisible).toBe(false)
    expect(result.settings.batteryVisible).toBe(false)
  })

  test("collapses whichever row happens to be last, not a particular one", () => {
    // Five orders, five last rows. Asserted because "the fifth" is a count and not an identity, and a rule
    // keyed on `batt` would pass the arm above.
    for (const last of STATS_ROW_KEYS) {
      const four = visible({ ...NONE_VISIBLE, [FIELD[last]]: true })
      const result = setStatRowVisible(four, last, false)
      expect(result.collapsed).toBe(true)
      expect(result.settings.statsVisible).toBe(false)
    }
  })

  test("does not collapse an already-hidden panel, and does not report one", () => {
    // `collapsed` is a transition, not a state. Reporting it on a panel that was already down would make the
    // caller re-run whatever it does on a collapse — a window resize the user never asked for. This is also
    // the DEFAULT path, since the panel ships off: hiding rows from the settings window with Stats unticked
    // must be inert.
    const result = setStatRowVisible(
      settings({ ...NONE_VISIBLE, batteryVisible: true, statsVisible: false }),
      "batt",
      false,
    )
    expect(result.collapsed).toBe(false)
    expect(result.settings.statsVisible).toBe(false)
    expect(allRowsHidden(result.settings)).toBe(true)
  })

  test("never asks for a re-clamp, because a shorter window cannot fall off a screen", () => {
    for (const key of STATS_ROW_KEYS) {
      expect(setStatRowVisible(visible(), key, false).reclamp).toBe(false)
    }
    expect(setStatRowVisible(visible({ ...NONE_VISIBLE, batteryVisible: true }), "batt", false).reclamp).toBe(
      false,
    )
  })

  test("hiding an already-hidden row is idempotent and still collapses if it is the fifth", () => {
    // Reachable: the settings window's checkbox events fire on programmatic changes too. Idempotence is what
    // stops a redundant event from being a second collapse.
    const already = visible({ cpuVisible: false })
    const result = setStatRowVisible(already, "cpu", false)
    expect(result.settings).toEqual(already)
    expect(result.collapsed).toBe(false)
    // But on the all-hidden profile the same redundant event *does* collapse, because the condition is a
    // property of the resulting settings rather than of the change. That is the C#'s behaviour.
    const allOff = visible(NONE_VISIBLE)
    expect(setStatRowVisible(allOff, "cpu", false).collapsed).toBe(true)
  })
})

describe("showing a stat row", () => {
  test("asks for a re-clamp, because the window just got taller", () => {
    // The panel grows by 17.96 per row, which can push a widget near the bottom of a display off it. The
    // module reports rather than performs: placement is main's, and a `core/` function that moved a window
    // would be untestable without an Electron process.
    const result = setStatRowVisible(visible({ cpuVisible: false }), "cpu", true)
    expect(result.settings.cpuVisible).toBe(true)
    expect(result.reclamp).toBe(true)
    expect(result.collapsed).toBe(false)
  })

  test("does not ask for a re-clamp while the panel is collapsed", () => {
    // A taller panel behind a hidden panel moves nothing. Re-clamping here would nudge the window for a
    // change with no visual effect, which on a multi-monitor setup is how a widget walks off a display. Also
    // the default path — the panel ships off.
    const result = setStatRowVisible(settings({ ...NONE_VISIBLE, statsVisible: false }), "cpu", true)
    expect(result.reclamp).toBe(false)
    expect(result.settings.statsVisible).toBe(false)
  })

  test("does NOT un-collapse the panel — the auto-collapse is one-way", () => {
    // The C# comment says so explicitly, and it is the fact that makes "all five hidden with the panel
    // visible" reachable: hide all five (panel collapses), tick Stats in the tray (panel returns, empty),
    // and `statsPanelHeight` is 0. `layout.test.ts` asserts that height; this is the arm that says the state
    // is reachable rather than defensive.
    let current = visible({ ...NONE_VISIBLE, batteryVisible: true })
    current = setStatRowVisible(current, "batt", false).settings
    expect(current.statsVisible).toBe(false)

    for (const key of STATS_ROW_KEYS) {
      const result = setStatRowVisible(current, key, true)
      expect(result.settings.statsVisible).toBe(false)
      expect(result.collapsed).toBe(false)
    }
  })

  test("showing all five back does not restore the panel either", () => {
    // The full round trip, so the one-wayness is asserted at the end state and not only per step. A user who
    // hides everything and changes their mind has to use the tray, which is the original's behaviour.
    let current = visible(NONE_VISIBLE)
    current = setStatRowVisible(current, "cpu", false).settings
    expect(current.statsVisible).toBe(false)
    for (const key of STATS_ROW_KEYS) current = setStatRowVisible(current, key, true).settings
    expect(allRowsHidden(current)).toBe(false)
    expect(current.statsVisible).toBe(false)
  })
})

describe("the uptime row", () => {
  test("writes its own field and never participates in the auto-collapse", () => {
    // Hiding the uptime line with all five rows already off must not collapse the panel. It is the case a
    // "six rows" reading gets wrong, and it is silent: the panel simply disappears at a moment the user
    // associates with a different checkbox.
    const result = setUptimeRowVisible(visible(NONE_VISIBLE), false)
    expect(result.settings.uptimeVisible).toBe(false)
    expect(result.collapsed).toBe(false)
    expect(result.settings.statsVisible).toBe(true)
  })

  test("leaves all five metric flags untouched in both directions", () => {
    for (const uptimeVisible of [true, false]) {
      const result = setUptimeRowVisible(visible(), uptimeVisible)
      for (const key of STATS_ROW_KEYS) {
        expect(result.settings[FIELD[key]]).toBe(true)
      }
      expect(result.settings.uptimeVisible).toBe(uptimeVisible)
    }
  })

  test("re-clamps on show only, and only while the panel is visible", () => {
    // The same rule as a metric row, for the same reason: the uptime line is 16.63 of height.
    expect(setUptimeRowVisible(visible({ uptimeVisible: false }), true).reclamp).toBe(true)
    expect(setUptimeRowVisible(visible(), false).reclamp).toBe(false)
    expect(setUptimeRowVisible(settings({ uptimeVisible: false, statsVisible: false }), true).reclamp).toBe(
      false,
    )
  })

  test("never reports a collapse, whatever the inputs", () => {
    for (const uptimeVisible of [true, false]) {
      for (const statsVisible of [true, false]) {
        for (const base of [{}, NONE_VISIBLE]) {
          expect(
            setUptimeRowVisible(settings({ ...base, statsVisible }), uptimeVisible).collapsed,
          ).toBe(false)
        }
      }
    }
  })
})

describe("immutability", () => {
  test("neither function mutates the settings it was given", () => {
    // See the header: `applySettings` diffs, so a mutated input is a change that never repaints.
    const original = visible({ ...NONE_VISIBLE, batteryVisible: true })
    const snapshot = { ...original }

    const collapsing = setStatRowVisible(original, "batt", false)
    expect(original).toEqual(snapshot)
    expect(collapsing.settings).not.toBe(original)
    // And the collapse really did happen on the copy, so the arm is not passing because nothing changed.
    expect(collapsing.settings.statsVisible).toBe(false)
    expect(original.statsVisible).toBe(true)

    const uptime = setUptimeRowVisible(original, false)
    expect(original).toEqual(snapshot)
    expect(uptime.settings).not.toBe(original)
  })

  test("carries every unrelated field through unchanged", () => {
    // The transitions spread the whole object, so a field added to `AppSettings` later is carried without
    // this module knowing about it. Asserted over a profile with several non-defaults, because a hand-written
    // constructor would silently reset them.
    const custom = visible({
      clockType: "nixie",
      fontSize: 40,
      accentColor: "#FF00FF00",
      backdropOpacityPercent: 72,
      batteryAlertThresholdPercent: 35,
      cpuVisible: false,
    })
    const result = setStatRowVisible(custom, "gpu", false)
    expect({ ...result.settings, gpuVisible: true }).toEqual(custom)
  })
})
