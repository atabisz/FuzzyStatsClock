/**
 * NEW coverage. `FuzzyClock.App.Tests/` has no tray-menu test (confirmed by search), so unlike every
 * other Phase 3 table these expectations come from READING TrayMenuBuilder.cs, not from a recorded C#
 * run. Said here as well as in the module header, because a reader who trusts the rest of this phase's
 * "measured" claim should know exactly which file breaks it.
 *
 * What that costs: a label typo shared between the port and this test would pass. What it still buys:
 * the checkmark logic, the ordering and the separator positions are pinned, and those are what actually
 * regress when the menu is rebuilt per open.
 */
import { describe, expect, test } from "bun:test"
import type { ClockType } from "../src/core/settings.js"
import type { TrayMenuItem, TrayMenuState } from "../src/core/tray-menu.js"
import { ABOUT_TITLE, TRAY_LABELS, TRAY_TOOLTIP, aboutMessage, buildTrayMenu } from "../src/core/tray-menu.js"

const ALL_OFF: TrayMenuState = {
  ghostModeEnabled: false,
  statsVisible: false,
  autoContrastEnabled: false,
  autoLaunchEnabled: false,
  clockType: "phrase",
}

function labels(items: readonly TrayMenuItem[]): string[] {
  return items.map((item) => (item.kind === "separator" ? "---" : item.label))
}

function find(items: readonly TrayMenuItem[], label: string): TrayMenuItem {
  const found = items.find((item) => item.kind !== "separator" && item.label === label)
  if (found === undefined) throw new Error(`no item labelled ${label}`)
  return found
}

function checkedOf(items: readonly TrayMenuItem[], label: string): boolean {
  const item = find(items, label)
  if (item.kind !== "checkbox") throw new Error(`${label} is a ${item.kind}, not a checkbox`)
  return item.checked
}

function clockTypeItems(state: TrayMenuState): readonly TrayMenuItem[] {
  const submenu = find(buildTrayMenu(state), TRAY_LABELS.clockType)
  if (submenu.kind !== "submenu") throw new Error("Clock Type is not a submenu")
  return submenu.items
}

describe("buildTrayMenu shape", () => {
  test("the order and separator positions of BuildMenu", () => {
    expect(labels(buildTrayMenu(ALL_OFF))).toEqual([
      "Open Settings...",
      "---",
      "Clock Type",
      "Ghost Mode",
      "Show Stats",
      "Auto-Contrast",
      "Auto-Launch at Login",
      "---",
      "Reset to Defaults",
      "About",
      "Quit",
    ])
  })

  test("eleven items, two separators", () => {
    const items = buildTrayMenu(ALL_OFF)
    expect(items).toHaveLength(11)
    expect(items.filter((i) => i.kind === "separator")).toHaveLength(2)
  })

  test("Quit is last -- the one position users reach for without looking", () => {
    const items = buildTrayMenu(ALL_OFF)
    expect(items[items.length - 1]).toEqual({ kind: "command", label: "Quit", action: "quit" })
  })

  test("each kind is what the adapter expects", () => {
    const items = buildTrayMenu(ALL_OFF)
    expect(find(items, TRAY_LABELS.openSettings).kind).toBe("command")
    expect(find(items, TRAY_LABELS.clockType).kind).toBe("submenu")
    expect(find(items, TRAY_LABELS.ghostMode).kind).toBe("checkbox")
    expect(find(items, TRAY_LABELS.resetDefaults).kind).toBe("command")
    expect(find(items, TRAY_LABELS.about).kind).toBe("command")
  })

  test("every action id is distinct, so the adapter's lookup cannot collide", () => {
    const collect = (items: readonly TrayMenuItem[]): string[] =>
      items.flatMap((item) =>
        item.kind === "submenu" ? collect(item.items) : item.kind === "separator" ? [] : [item.action],
      )
    const actions = collect(buildTrayMenu(ALL_OFF))
    expect(actions).toHaveLength(12)
    expect(new Set(actions).size).toBe(12)
  })

  test("the tooltip and About caption", () => {
    expect(TRAY_TOOLTIP).toBe("FuzzyClock")
    expect(ABOUT_TITLE).toBe("About FuzzyClock")
  })
})

describe("Clock Type submenu", () => {
  test("four items in enum order, matching the ClockType ordinals", () => {
    // Ordinals are what WPF persists (`"ClockType":1`), so the submenu order is the enum order.
    expect(labels(clockTypeItems(ALL_OFF))).toEqual(["Phrase", "Dial", "LCD", "Nixie"])
  })

  test.each([
    ["phrase", [true, false, false, false]],
    ["dial", [false, true, false, false]],
    ["lcd", [false, false, true, false]],
    ["nixie", [false, false, false, true]],
  ] as const)("%s ticks exactly one item: %p", (clockType, expected) => {
    const items = clockTypeItems({ ...ALL_OFF, clockType: clockType as ClockType })
    // Spread: `as const` on the table is what stops Bun widening the rows to `(string | boolean[])[]`,
    // and it also makes each row a readonly tuple, which `toEqual` will not take.
    expect(items.map((i) => (i.kind === "checkbox" ? i.checked : null))).toEqual([...expected])
  })

  test("checkbox, never radio -- Electron's radio type would render a dot and self-manage siblings", () => {
    for (const item of clockTypeItems(ALL_OFF)) expect(item.kind).toBe("checkbox")
  })

  test("the actions carry the clock type, so the handler needs no index arithmetic", () => {
    expect(clockTypeItems(ALL_OFF).map((i) => (i.kind === "checkbox" ? i.action : null))).toEqual([
      "set-clock-type:phrase",
      "set-clock-type:dial",
      "set-clock-type:lcd",
      "set-clock-type:nixie",
    ])
  })
})

describe("checkmarks are SyncCheckmarks, computed per build", () => {
  test("all four toggles off", () => {
    const items = buildTrayMenu(ALL_OFF)
    expect(checkedOf(items, TRAY_LABELS.ghostMode)).toBe(false)
    expect(checkedOf(items, TRAY_LABELS.showStats)).toBe(false)
    expect(checkedOf(items, TRAY_LABELS.autoContrast)).toBe(false)
    expect(checkedOf(items, TRAY_LABELS.autoLaunch)).toBe(false)
  })

  test("all four toggles on", () => {
    const items = buildTrayMenu({
      ghostModeEnabled: true,
      statsVisible: true,
      autoContrastEnabled: true,
      autoLaunchEnabled: true,
      clockType: "dial",
    })
    expect(checkedOf(items, TRAY_LABELS.ghostMode)).toBe(true)
    expect(checkedOf(items, TRAY_LABELS.showStats)).toBe(true)
    expect(checkedOf(items, TRAY_LABELS.autoContrast)).toBe(true)
    expect(checkedOf(items, TRAY_LABELS.autoLaunch)).toBe(true)
  })

  test.each([
    ["ghostModeEnabled", TRAY_LABELS.ghostMode],
    ["statsVisible", TRAY_LABELS.showStats],
    ["autoContrastEnabled", TRAY_LABELS.autoContrast],
    ["autoLaunchEnabled", TRAY_LABELS.autoLaunch],
  ] as const)("%s ticks %s and nothing else", (field, label) => {
    // The cross-wiring guard. Four booleans and four checkboxes in the same order is exactly the shape
    // where a copy-paste error ticks the neighbour, and every one of them is a real setting whose
    // visible state would then lie.
    const items = buildTrayMenu({ ...ALL_OFF, [field]: true })
    const ticked = items.filter((i) => i.kind === "checkbox" && i.checked)
    expect(ticked).toHaveLength(1)
    expect(ticked[0]!.kind === "checkbox" ? ticked[0]!.label : "").toBe(label)
  })

  test("his live state: ghost mode and auto-launch on, stats on, dial clock", () => {
    // From the imported settings: GhostModeEnabled true, StatsVisible true, AutoLaunchEnabled true,
    // AutoContrastEnabled false, ClockType dial. What his tray actually shows today.
    const items = buildTrayMenu({
      ghostModeEnabled: true,
      statsVisible: true,
      autoContrastEnabled: false,
      autoLaunchEnabled: true,
      clockType: "dial",
    })
    expect(items.filter((i) => i.kind === "checkbox" && i.checked).map((i) => (i.kind === "checkbox" ? i.label : "")))
      .toEqual(["Ghost Mode", "Show Stats", "Auto-Launch at Login"])
    expect(checkedOf(clockTypeItems({ ...ALL_OFF, clockType: "dial" }) as TrayMenuItem[], TRAY_LABELS.dial)).toBe(true)
  })

  test("rebuilding from the same state gives an identical menu", () => {
    // The property `main/tray.ts` relies on: rebuild-per-open is only safe if the build is a pure
    // function of state, or the menu would flicker between opens.
    expect(buildTrayMenu(ALL_OFF)).toEqual(buildTrayMenu(ALL_OFF))
  })

  test("a state change is visible in the next build -- what menu.Opening existed for", () => {
    // The WPF bug this prevents: change a setting from the settings WINDOW and the tray tick went
    // stale, because nothing re-ran SyncCheckmarks.
    expect(checkedOf(buildTrayMenu(ALL_OFF), TRAY_LABELS.showStats)).toBe(false)
    expect(checkedOf(buildTrayMenu({ ...ALL_OFF, statsVisible: true }), TRAY_LABELS.showStats)).toBe(true)
  })
})

describe("aboutMessage", () => {
  test("verbatim from TrayMenuBuilder.cs, ampersand and blank lines included", () => {
    expect(aboutMessage("5.0.0")).toBe(
      "FuzzyClock v5.0.0\n" +
        "\n" +
        "A fuzzy time & system stats desktop overlay.\n" +
        "\n" +
        "Built as a Claude + GSD experiment\n" +
        "by Alex Tabisz.",
    )
  })

  test("an empty version reads 0.0.0, matching the C#'s null-version output", () => {
    expect(aboutMessage("").startsWith("FuzzyClock v0.0.0")).toBe(true)
  })

  test("a semver prerelease is shown whole, not truncated to three parts", () => {
    // The C# built Major.Minor.Build off the assembly version and dropped the rest. app.getVersion()
    // returns package.json's string, and hiding the `-alpha.0` from a prerelease build would make a
    // bug report unattributable.
    expect(aboutMessage("5.0.0-alpha.0").startsWith("FuzzyClock v5.0.0-alpha.0")).toBe(true)
  })

  test("six lines, two of them blank", () => {
    const lines = aboutMessage("5.0.0").split("\n")
    expect(lines).toHaveLength(6)
    expect(lines.filter((l) => l === "")).toHaveLength(2)
  })
})
