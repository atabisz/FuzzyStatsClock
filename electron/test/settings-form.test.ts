/**
 * `settings-form.ts` — the settings window's shape and its reducer, tested without a window.
 *
 * Provenance: `FuzzyClock.App/SettingsWindow.xaml` (521 lines) and `SettingsWindow.xaml.cs` (779), read as
 * source. The module under test is the whole of that window minus its pixels, so this file is where the
 * port's fidelity to it is actually bought.
 *
 * ## What earns a test here, and what would only look like one
 *
 * A form model invites tautologies — assert the table contains what the table contains, get a green, learn
 * nothing. Three kinds of arm avoid that, and every block below is one of them:
 *
 *   1. **Denominators.** 41 `AppSettings` fields = 35 this window edits + 6 it does not, and the six are
 *      named rather than counted. `EDITABLE_FIELDS` is checked against `DEFAULTS`' own keys, so a field
 *      added to the settings and forgotten here fails — that is the failure mode the port is exposed to,
 *      since the C# would have failed at compile time and this cannot.
 *   2. **Round-trips.** Every one of the 35 is driven through `applySettingsEdit` with a value that differs
 *      from the default, and the arm is that the value *changed*. A reducer that silently dropped a field
 *      would return the settings unchanged and pass any "did not throw" test; this one it fails.
 *   3. **Rejections with a matched acceptance.** Each guard is asserted twice — the bad payload rejected
 *      AND a neighbouring good one accepted. A rejection arm alone cannot tell "the guard works" from "the
 *      whole field is unreachable", which is exactly the mistake the strict decoders make easy.
 *
 * ## The label arms are the interesting ones
 *
 * `opacityLabel` reproduces a C# truncation artefact. It would be trivial to write an arm that passes for
 * both `Math.trunc` and `Math.round` — every value where they agree — so the arms below name the three
 * values on the slider's 0.01 ladder where they disagree, and pair them with the values that were *assumed*
 * to disagree and do not (0.35, 0.7, 0.95 are all exact). Both halves matter: the first proves the artefact
 * is reproduced, the second stops the comment above the function from drifting back into folklore.
 *
 * ## Two documented divergences, pinned so they stay deliberate
 *
 * `phraseStyleSupported` implements `PopulateControls`' rule, not the *other* rule the same C# file uses in
 * `CmbPhraseLanguage_SelectionChanged`. The truth table below includes the one cell where the two disagree
 * (`auto` on a French UI) and asserts the `PopulateControls` answer. And the phrase-language label says "the
 * system" where the original says "Windows". Both are asserted, so removing them is a test failure rather
 * than a silent regression to the original's bug.
 */
import { describe, expect, test } from "bun:test"
import {
  ACCENT_PRESETS,
  ACCENT_RING_COLOR,
  applySettingsEdit,
  buildSettingsForm,
  CLOCK_TYPE_OPTIONS,
  EDITABLE_FIELDS,
  FONT_SIZE_OPTIONS,
  fadeRadiusLabel,
  isEditableField,
  opacityLabel,
  PHRASE_LOCALE_OPTIONS,
  PHRASE_STYLE_OPTIONS,
  phraseStyleSupported,
  SETTINGS_WINDOW_HEIGHT,
  SETTINGS_WINDOW_TITLE,
  SETTINGS_WINDOW_WIDTH,
  statsIntervalLabel,
  WRAP_STYLE_OPTIONS,
  type EditableField,
  type FormControl,
  type FormRow,
  type SettingsForm,
} from "../src/core/settings-form.js"
import { AUTO_DETECTED_LANGUAGES } from "../src/core/phrase/locale-key.js"
import {
  BATTERY_ALERT_THRESHOLDS,
  DATE_FORMATS,
  DEFAULTS,
  LCD_STYLES,
  PHRASE_STYLES,
  PROCESS_COUNT_THRESHOLDS,
  type AppSettings,
} from "../src/core/settings.js"

const settings = (overrides: Partial<AppSettings> = {}): AppSettings => ({ ...DEFAULTS, ...overrides })

/** An English UI, so `phraseStyleSupported` is not the thing under test in unrelated arms. */
const form = (overrides: Partial<AppSettings> = {}, uiLanguage = "en"): SettingsForm =>
  buildSettingsForm(settings(overrides), uiLanguage)

const rows = (f: SettingsForm): readonly FormRow[] => f.tabs.flatMap((tab) => tab.rows)

const controls = (f: SettingsForm): readonly FormControl[] => rows(f).flatMap((row) => row.controls)

/** Every control that carries a field id — i.e. everything but headings and notes. */
function fieldControls(f: SettingsForm): readonly Extract<FormControl, { id: string }>[] {
  return controls(f).filter((c): c is Extract<FormControl, { id: string }> => "id" in c)
}

function control(f: SettingsForm, id: EditableField): Extract<FormControl, { id: string }> {
  const found = fieldControls(f).filter((c) => c.id === id)
  expect(found).toHaveLength(1)
  return found[0]!
}

/** The row a given field's control sits in — for the two rows that collapse. */
function rowOf(f: SettingsForm, id: EditableField): FormRow {
  const found = rows(f).filter((row) => row.controls.some((c) => "id" in c && c.id === id))
  expect(found).toHaveLength(1)
  return found[0]!
}

// ---------------------------------------------------------------------------------------------------

describe("the field inventory, which is the exit criterion restated as a number", () => {
  test("41 settings = 35 this window edits + 6 it does not, and the 6 are named", () => {
    // The plan's bar is "every setting the WPF window exposes". That is only checkable against a
    // denominator, and the denominator is `AppSettings` itself — read off `DEFAULTS`' keys rather than
    // recounted by hand, because a hand count is what put a wrong field total in a comment once already.
    const all = Object.keys(DEFAULTS)
    expect(all).toHaveLength(41)
    expect(EDITABLE_FIELDS).toHaveLength(35)

    const editable = new Set<string>(EDITABLE_FIELDS)
    expect(all.filter((key) => !editable.has(key)).sort()).toEqual([
      // Placement bookkeeping — written by dragging the window, never by a control.
      "backdropAlwaysVisible",
      "backdropOpacityPercent",
      "lastActiveMonitor",
      "lcdSize",
      "monitorPositions",
      "textStyle",
    ])
  })

  test("every editable field is a real settings key", () => {
    // The `satisfies` clause in the module already enforces this at compile time; this arm is what keeps it
    // enforced if that clause is ever loosened to `string[]` to get past an error.
    for (const field of EDITABLE_FIELDS) expect(DEFAULTS).toHaveProperty(field)
  })

  test("isEditableField accepts the 35 and rejects a settings field this window does not own", () => {
    for (const field of EDITABLE_FIELDS) expect(isEditableField(field)).toBe(true)
    // `lcdSize` is the discriminating case: a genuine `AppSettings` field, so a predicate that merely
    // checked "is this a settings key" would pass it.
    expect(isEditableField("lcdSize")).toBe(false)
    expect(isEditableField("")).toBe(false)
    expect(isEditableField("__proto__")).toBe(false)
  })
})

describe("buildSettingsForm covers every editable field exactly once", () => {
  test("the three tabs are Appearance, Stats, Behavior in the XAML's order", () => {
    expect(form().tabs.map((tab) => tab.id)).toEqual(["appearance", "stats", "behavior"])
    expect(form().tabs.map((tab) => tab.label)).toEqual(["Appearance", "Stats", "Behavior"])
  })

  test("the union of control ids is exactly EDITABLE_FIELDS, with no duplicates", () => {
    // Both directions in one arm, and the duplicate check is the half that matters: a field wired into two
    // controls would still satisfy a set-equality test while giving the renderer two sources of truth.
    const ids = fieldControls(form()).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual([...EDITABLE_FIELDS].sort())
  })

  test("the collapsed rows still contribute their ids, so coverage does not depend on clock type", () => {
    // The Dial Face and LCD Options rows are hidden on a phrase clock. Emitting them with `visible: false`
    // rather than omitting them is what makes the arm above independent of `DEFAULTS.clockType` — checked
    // here on all four types rather than assumed from the one.
    for (const option of CLOCK_TYPE_OPTIONS) {
      const ids = fieldControls(form({ clockType: option.value as AppSettings["clockType"] })).map((c) => c.id)
      expect([...ids].sort()).toEqual([...EDITABLE_FIELDS].sort())
    }
  })

  test("the window is 480x600 and titled as the original", () => {
    expect(SETTINGS_WINDOW_WIDTH).toBe(480)
    expect(SETTINGS_WINDOW_HEIGHT).toBe(600)
    expect(SETTINGS_WINDOW_TITLE).toBe("FuzzyClock Settings")
  })
})

describe("option tables against the originals", () => {
  test("the phrase-style combo lists the same ten styles as the validator, in a different order", () => {
    // Two orderings of one set, and both are deliberate: `PHRASE_STYLES` is `SettingsService.cs`'s
    // validation order (Pirate then Dwarf), the combo is the XAML's (Jive, Pirate, Dwarf). The set equality
    // is the arm that catches a style added to one and not the other; the inequality is what stops someone
    // "tidying" the combo into the validator's order and changing what a user sees.
    const combo = PHRASE_STYLE_OPTIONS.map((o) => o.value)
    expect([...combo].sort()).toEqual([...PHRASE_STYLES].sort())
    expect(combo).not.toEqual([...PHRASE_STYLES])
    expect(combo.slice(4, 7)).toEqual(["Jive", "Pirate", "Dwarf"])
  })

  test("the clock rail puts Nixie before LCD, unlike the ClockType union", () => {
    expect(CLOCK_TYPE_OPTIONS.map((o) => o.value)).toEqual(["phrase", "dial", "nixie", "lcd"])
  })

  test("the font ladder is S/M/L/XL to 16/24/32/40", () => {
    expect(FONT_SIZE_OPTIONS.map((o) => o.label)).toEqual(["S", "M", "L", "XL"])
    expect(FONT_SIZE_OPTIONS.map((o) => Number(o.value))).toEqual([16, 24, 32, 40])
  })

  test("the five accent presets carry the XAML's exact ARGB", () => {
    expect(ACCENT_PRESETS.map((p) => p.argb)).toEqual([
      "#FFFFFFFF",
      "#FFFFC000",
      "#FF87CEEB",
      "#FF00C000",
      "#FFFF69B4",
    ])
    expect(ACCENT_RING_COLOR).toBe("#0078D4")
  })

  test("the language dropdown says 'the system', not 'Windows' — divergence 2", () => {
    // The original's label and subtitle both name Windows, which is false on two of three target platforms.
    // Pinned so the port does not drift back to a wrong word, and asserted on the note as well as the
    // option because the original states it twice.
    expect(PHRASE_LOCALE_OPTIONS[0]).toEqual({ value: "auto", label: "Auto (detect from the system)" })
    expect(PHRASE_LOCALE_OPTIONS.map((o) => o.value)).toEqual(["auto", "en", "fr", "es", "de", "ja", "pl"])

    const notes = controls(form())
      .filter((c): c is Extract<FormControl, { kind: "note" }> => c.kind === "note")
      .map((c) => c.text)
    expect(notes).toContain("Auto-detects from the system display language. Override here.")
    for (const note of notes) expect(note).not.toContain("Windows display")
  })

  test("the wrap radios keep the values core/phrase-wrap.ts reads", () => {
    expect(WRAP_STYLE_OPTIONS.map((o) => o.value)).toEqual(["midpoint", "natural"])
    expect(WRAP_STYLE_OPTIONS.map((o) => o.label)).toEqual(["Nearest Midpoint", "Natural Pause"])
  })
})

describe("value labels, including the C#'s truncation artefact", () => {
  test("opacityLabel truncates at the three values where it matters", () => {
    // `(int)(0.29 * 100)` is 28 because the product is 28.999999999999996 — in C# and here alike. These
    // three are the whole of the artefact across the 91 values the slider can store; they were enumerated,
    // not guessed.
    expect(opacityLabel(0.29)).toBe("28%")
    expect(opacityLabel(0.57)).toBe("56%")
    expect(opacityLabel(0.58)).toBe("57%")
  })

  test("and is exact everywhere else, including the values folklore says it is not", () => {
    // The counter-case half. 0.35 was written into a comment as "reads 34%" and that was wrong: `0.35 * 100`
    // is exactly 35 as a double. Without these arms, a `Math.round` implementation would pass the block
    // above by accident on any value not in it.
    expect(opacityLabel(0.35)).toBe("35%")
    expect(opacityLabel(0.7)).toBe("70%")
    expect(opacityLabel(0.95)).toBe("95%")
    expect(opacityLabel(1.0)).toBe("100%")
    expect(opacityLabel(0.1)).toBe("10%")
  })

  test("statsIntervalLabel is F1 with a trailing s", () => {
    expect(statsIntervalLabel(2)).toBe("2.0s")
    expect(statsIntervalLabel(0.5)).toBe("0.5s")
    expect(statsIntervalLabel(10)).toBe("10.0s")
  })

  test("fadeRadiusLabel keeps the space before the unit", () => {
    // `$"{s.GhostFadeRadiusPx} px"`. The space is the original's and it is the kind of thing a reformat
    // eats silently.
    expect(fadeRadiusLabel(80)).toBe("80 px")
    expect(fadeRadiusLabel(20)).toBe("20 px")
  })

  test("the form's own labels come from those functions, not from a second formatting site", () => {
    const opacity = control(form({ opacity: 0.29 }), "opacity")
    expect(opacity.kind === "slider" && opacity.valueLabel).toBe("28%")
    const interval = control(form({ statsIntervalSeconds: 3.5 }), "statsIntervalSeconds")
    expect(interval.kind === "slider" && interval.valueLabel).toBe("3.5s")
    const radius = control(form({ ghostFadeRadiusPx: 150 }), "ghostFadeRadiusPx")
    expect(radius.kind === "slider" && radius.valueLabel).toBe("150 px")
  })
})

describe("phraseStyleSupported — PopulateControls' rule, not the other one in the same file", () => {
  test("an explicit en or ja qualifies whatever the UI language is", () => {
    for (const ui of ["en", "fr", "ja", "pl", "de", "es"]) {
      expect(phraseStyleSupported("en", ui)).toBe(true)
      expect(phraseStyleSupported("ja", ui)).toBe(true)
    }
  })

  test("auto qualifies only when the UI language is not one the detector claims", () => {
    // This is the cell where the C# contradicts itself: `CmbPhraseLanguage_SelectionChanged` would say true
    // for every row here. `PopulateControls` says false for the five detected languages, and that is the
    // answer that agrees with `resolveLocaleKey` actually discarding the style.
    for (const ui of AUTO_DETECTED_LANGUAGES) expect(phraseStyleSupported("auto", ui)).toBe(false)
    expect(phraseStyleSupported("auto", "en")).toBe(true)
    // An unclaimed language is not a detected one, so the style survives — same as an English UI.
    expect(phraseStyleSupported("auto", "sv")).toBe(true)
  })

  test("the five detected languages are locale-key.ts's list, not a copy of it", () => {
    // If `AUTO_DETECTED_LANGUAGES` gained a sixth entry, the arm above would follow it automatically. This
    // one pins the list itself, so the two facts are separable when one of them changes.
    expect([...AUTO_DETECTED_LANGUAGES]).toEqual(["fr", "es", "de", "ja", "pl"])
  })

  test("a hand-edited locale disables the combo, where resolveLocaleKey would still read the style", () => {
    // The C#'s condition tests `== "auto"` literally, so an unrecognised value falls through to false. Kept,
    // and pinned: a disabled combo is the harmless direction, and `validateSettings` does not guard this
    // field, so the state is reachable from a corrupt file.
    expect(phraseStyleSupported("xx", "en")).toBe(false)
  })

  test("the form's phrase-style select is gated by it", () => {
    expect(control(form({ phraseLocale: "auto" }, "en"), "phraseStyle").enabled).toBe(true)
    expect(control(form({ phraseLocale: "auto" }, "fr"), "phraseStyle").enabled).toBe(false)
    expect(control(form({ phraseLocale: "ja" }, "fr"), "phraseStyle").enabled).toBe(true)
  })
})

describe("gating — enabled on controls, visible on rows, because the XAML does both", () => {
  test("the wrap radios follow the wrap checkbox, which stays enabled itself", () => {
    // `WrapStylePanel.IsEnabled = s.PhraseWrapEnabled` while `ChkPhraseWrap` is never disabled. Asserting
    // the checkbox too is what distinguishes per-control gating from gating the whole row.
    const on = form({ phraseWrapEnabled: true })
    expect(control(on, "phraseWrapStyle").enabled).toBe(true)
    expect(control(on, "phraseWrapEnabled").enabled).toBe(true)

    const off = form({ phraseWrapEnabled: false })
    expect(control(off, "phraseWrapStyle").enabled).toBe(false)
    expect(control(off, "phraseWrapEnabled").enabled).toBe(true)
  })

  test("the fade slider and all four modifier boxes follow ghost mode", () => {
    const on = form({ ghostModeEnabled: true })
    for (const id of ["ghostFadeRadiusPx", "useCtrl", "useAlt", "useShift", "useWin"] as const) {
      expect(control(on, id).enabled).toBe(true)
    }
    expect(control(on, "ghostModeEnabled").enabled).toBe(true)

    const off = form({ ghostModeEnabled: false })
    for (const id of ["ghostFadeRadiusPx", "useCtrl", "useAlt", "useShift", "useWin"] as const) {
      expect(control(off, id).enabled).toBe(false)
    }
    expect(control(off, "ghostModeEnabled").enabled).toBe(true)
  })

  test("the five metric rows are NOT gated on the panel, which is the XAML's oddity not an omission", () => {
    // Checked in the source: that `WrapPanel` has no `IsEnabled` binding, unlike `TempSensorsPanel` which
    // does. So a user configures rows against a collapsed panel, and hiding the last one collapses it from
    // under them — the transition `applySettingsEdit` routes through `stats-rows.ts` for.
    for (const statsVisible of [true, false]) {
      const f = form({ statsVisible })
      for (const id of ["cpuVisible", "gpuVisible", "memVisible", "pagVisible", "batteryVisible", "uptimeVisible"] as const) {
        expect(control(f, id).enabled).toBe(true)
      }
    }
  })

  test("Dial Face is visible only on a dial, and LCD Options only on an LCD", () => {
    // Four types x two rows, so the counter-cases are in the table rather than implied by one negative.
    for (const option of CLOCK_TYPE_OPTIONS) {
      const f = form({ clockType: option.value as AppSettings["clockType"] })
      expect(rowOf(f, "showHourTicks").visible).toBe(option.value === "dial")
      expect(rowOf(f, "lcdUse24Hr").visible).toBe(option.value === "lcd")
    }
  })

  test("the collapsible rows carry their label with them", () => {
    // `SetClockStyleButtonStates` sets `Visibility` on `DialFaceLabel` and `DialFacePanel` both; modelling
    // visibility on the row is what reproduces that, and this arm is why the label lives on the row.
    expect(rowOf(form({ clockType: "dial" }), "showHourTicks").label).toBe("Dial Face")
    expect(rowOf(form({ clockType: "lcd" }), "lcdUse24Hr").label).toBe("LCD Options")
  })

  test("the selected segment is reported as the stored value, for both rails", () => {
    const f = form({ clockType: "nixie", fontSize: 16 })
    const clock = control(f, "clockType")
    expect(clock.kind === "segments" && clock.value).toBe("nixie")
    const font = control(f, "fontSize")
    expect(font.kind === "segments" && font.value).toBe("16")
  })
})

describe("the accent swatch ring — SetActiveSwatch", () => {
  test("a preset colour lights its ring", () => {
    for (const preset of ACCENT_PRESETS) {
      const swatch = control(form({ accentColor: preset.argb }), "accentColor")
      expect(swatch.kind === "swatches" && swatch.activePreset).toBe(preset.id)
    }
  })

  test("case and short forms still match, because the C# compares Color structs not strings", () => {
    // `#ffffc000` and `#FFC000` are both amber to the original. Normalising through
    // `formatAccentColor(parseAccentColor(x))` is what buys that; a string compare would fail all three.
    for (const spelling of ["#ffffc000", "#FFC000", "#ffc000"]) {
      const swatch = control(form({ accentColor: spelling }), "accentColor")
      expect(swatch.kind === "swatches" && swatch.activePreset).toBe("amber")
      expect(swatch.kind === "swatches" && swatch.value).toBe("#FFFFC000")
    }
  })

  test("a custom colour lights nothing, and an unparseable one falls back to white's ring", () => {
    const custom = control(form({ accentColor: "#FF123456" }), "accentColor")
    expect(custom.kind === "swatches" && custom.activePreset).toBe(null)

    // `parseAccentColor` returns white on anything it cannot read and never throws, so a corrupt value
    // presents as the white preset rather than as an empty ring. Asserted because it is a real difference
    // from the line above, not because it is desirable.
    const junk = control(form({ accentColor: "not a colour" }), "accentColor")
    expect(junk.kind === "swatches" && junk.activePreset).toBe("white")
  })
})

describe("radios report null when the stored value matches no option", () => {
  test("a ladder value snaps, and an off-ladder one leaves every radio unset", () => {
    // The C# writes `RbThresh2.IsChecked = s.ProcessCountThreshold == 2.0` three times, so an off-ladder
    // value leaves all three clear. `validateSettings` makes that unreachable from a file, so the arm feeds
    // the form directly — and the paired in-ladder arm is what proves the field is not simply always null.
    const good = control(form({ processCountThresholdPercent: 10 }), "processCountThresholdPercent")
    expect(good.kind === "radios" && good.value).toBe("10")

    const odd = buildSettingsForm({ ...DEFAULTS, processCountThresholdPercent: 7 }, "en")
    const bad = control(odd, "processCountThresholdPercent")
    expect(bad.kind === "radios" && bad.value).toBe(null)
  })

  test("the same for the battery ladder", () => {
    const good = control(form({ batteryAlertThresholdPercent: 15 }), "batteryAlertThresholdPercent")
    expect(good.kind === "radios" && good.value).toBe("15")
    const bad = control(buildSettingsForm({ ...DEFAULTS, batteryAlertThresholdPercent: 42 }, "en"), "batteryAlertThresholdPercent")
    expect(bad.kind === "radios" && bad.value).toBe(null)
  })

  test("the ladders themselves are the ones core/settings.ts validates against", () => {
    const thresh = control(form(), "processCountThresholdPercent")
    expect(thresh.kind === "radios" && thresh.options.map((o) => Number(o.value))).toEqual([
      ...PROCESS_COUNT_THRESHOLDS,
    ])
    const batt = control(form(), "batteryAlertThresholdPercent")
    expect(batt.kind === "radios" && batt.options.map((o) => Number(o.value))).toEqual([
      ...BATTERY_ALERT_THRESHOLDS,
    ])
  })
})

// ---------------------------------------------------------------------------------------------------
// applySettingsEdit
// ---------------------------------------------------------------------------------------------------

/**
 * One accepted edit per editable field, each differing from `DEFAULTS`.
 *
 * Hand-written rather than generated: a generated value would be derived from the field's current value by
 * the same code path under test, and the arm would prove nothing. Every entry here was chosen against the
 * printed defaults, and the test asserts the *change*, so a field the reducer drops fails rather than passes.
 *
 * Typed as a mapped type over `AppSettings` rather than `Record<EditableField, unknown>`, which does two
 * things beyond satisfying the compiler: a value of the wrong type for its field is a typecheck error here
 * instead of a runtime rejection, and a field missing from the table is too — so this table is itself part of
 * the 35-field denominator rather than a list that could quietly fall behind it.
 */
const EDITS: { readonly [K in EditableField]: AppSettings[K] } = {
  accentColor: "#FFFFC000",
  opacity: 0.5,
  fontSize: 40,
  clockType: "lcd",
  phraseStyle: "Yoda",
  phraseWrapEnabled: false,
  phraseWrapStyle: "natural",
  showHourTicks: true,
  showMinuteDots: true,
  showHourNumbers: true,
  lcdUse24Hr: true,
  lcdShowSeconds: false,
  lcdStyle: "Paper",
  statsVisible: true,
  cpuVisible: false,
  gpuVisible: false,
  memVisible: false,
  pagVisible: false,
  batteryVisible: false,
  uptimeVisible: false,
  statsIntervalSeconds: 4.5,
  processCountThresholdPercent: 10,
  showDate: false,
  dateFormat: "ISO",
  phraseLocale: "ja",
  ghostModeEnabled: false,
  ghostFadeRadiusPx: 150,
  useCtrl: false,
  useAlt: false,
  useShift: true,
  useWin: true,
  autoContrastEnabled: true,
  autoLaunchEnabled: true,
  updateChecksEnabled: false,
  batteryAlertThresholdPercent: 10,
}

describe("applySettingsEdit reaches all 35 fields", () => {
  test("every field changes, and the value that lands is the value sent", () => {
    // The denominator arm for the reducer. `EDITS` is keyed by `EditableField`, so TypeScript already
    // requires all 35 entries; this asserts each one actually takes effect.
    for (const field of EDITABLE_FIELDS) {
      const result = applySettingsEdit(DEFAULTS, { id: field, value: EDITS[field] })
      expect(result, `${field} was rejected`).not.toBeNull()
      expect(result!.settings[field], `${field} did not change`).not.toEqual(DEFAULTS[field])
      expect(result!.settings[field], `${field} landed wrong`).toEqual(EDITS[field])
    }
  })

  test("one edit changes one field and nothing else", () => {
    // Except where the port deliberately writes a second field — the auto-collapse. Those five are excluded
    // by name and get their own block below, rather than by loosening this arm to "at least one changed".
    const collapsers = new Set(["cpuVisible", "gpuVisible", "memVisible", "pagVisible", "batteryVisible"])
    for (const field of EDITABLE_FIELDS) {
      if (collapsers.has(field)) continue
      const result = applySettingsEdit(DEFAULTS, { id: field, value: EDITS[field] })
      const changed = Object.keys(DEFAULTS).filter(
        (key) => JSON.stringify(result!.settings[key as keyof AppSettings]) !== JSON.stringify(DEFAULTS[key as keyof AppSettings]),
      )
      expect(changed, `${field} changed more than itself`).toEqual([field])
    }
  })

  test("the input settings object is never mutated", () => {
    // `applySettings` in main.ts diffs incoming against live to decide what to repaint; a mutating reducer
    // makes that diff empty and the repaint never happens.
    const before = settings()
    const snapshot = JSON.stringify(before)
    for (const field of EDITABLE_FIELDS) applySettingsEdit(before, { id: field, value: EDITS[field] })
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe("applySettingsEdit rejects what the window could not have sent", () => {
  test("an unknown id, including a real settings field this window does not own", () => {
    expect(applySettingsEdit(DEFAULTS, { id: "lcdSize", value: "Large" })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "", value: true })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "constructor", value: true })).toBeNull()
  })

  test("a boolean field sent a non-boolean, with the boolean accepted alongside", () => {
    // The paired acceptance is the point: without it, a decoder that rejected *everything* for this field
    // would pass the rejection half.
    for (const value of ["true", 1, 0, null, undefined, {}]) {
      expect(applySettingsEdit(DEFAULTS, { id: "autoContrastEnabled", value })).toBeNull()
    }
    expect(applySettingsEdit(DEFAULTS, { id: "autoContrastEnabled", value: true })?.settings.autoContrastEnabled).toBe(true)
  })

  test("a slider outside its XAML bounds, at both ends", () => {
    // Both endpoints, because a one-sided guard passes a one-sided test. The 0.10 floor is stricter than
    // `validateSettings`' `<= 0` — deliberately: that guard is for a corrupt file, this is for a control
    // that cannot legally go lower.
    expect(applySettingsEdit(DEFAULTS, { id: "opacity", value: 0.09 })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "opacity", value: 1.01 })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "opacity", value: 0.1 })?.settings.opacity).toBe(0.1)
    expect(applySettingsEdit(DEFAULTS, { id: "opacity", value: 1 })?.settings.opacity).toBe(1)

    expect(applySettingsEdit(DEFAULTS, { id: "statsIntervalSeconds", value: 0.4 })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "statsIntervalSeconds", value: 10.1 })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "statsIntervalSeconds", value: 0.5 })?.settings.statsIntervalSeconds).toBe(0.5)

    expect(applySettingsEdit(DEFAULTS, { id: "ghostFadeRadiusPx", value: 19 })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "ghostFadeRadiusPx", value: 201 })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "ghostFadeRadiusPx", value: 20 })?.settings.ghostFadeRadiusPx).toBe(20)
    expect(applySettingsEdit(DEFAULTS, { id: "ghostFadeRadiusPx", value: 200 })?.settings.ghostFadeRadiusPx).toBe(200)
  })

  test("NaN and Infinity, which pass a naive range check", () => {
    // `NaN < 0.1` is false and `NaN > 1.0` is false, so a range guard alone lets NaN through and it reaches
    // the renderer's arithmetic. This is the shape of bug `main.ts` validates its IPC payloads against.
    for (const value of [NaN, Infinity, -Infinity, "abc", ""]) {
      expect(applySettingsEdit(DEFAULTS, { id: "opacity", value })).toBeNull()
      expect(applySettingsEdit(DEFAULTS, { id: "ghostFadeRadiusPx", value })).toBeNull()
      expect(applySettingsEdit(DEFAULTS, { id: "statsIntervalSeconds", value })).toBeNull()
    }
  })

  test("an enum value that is not in its list, one field at a time", () => {
    expect(applySettingsEdit(DEFAULTS, { id: "clockType", value: "analog" })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "phraseStyle", value: "Klingon" })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "lcdStyle", value: "Neon" })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "dateFormat", value: "RFC3339" })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "phraseLocale", value: "sv" })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "phraseWrapStyle", value: "hyphen" })).toBeNull()
    // And each accepts its own list in full, so none of the above is a field that rejects everything.
    for (const style of PHRASE_STYLES) {
      expect(applySettingsEdit(DEFAULTS, { id: "phraseStyle", value: style })?.settings.phraseStyle).toBe(style)
    }
    for (const style of LCD_STYLES) {
      expect(applySettingsEdit(DEFAULTS, { id: "lcdStyle", value: style })?.settings.lcdStyle).toBe(style)
    }
    for (const fmt of DATE_FORMATS) {
      expect(applySettingsEdit(DEFAULTS, { id: "dateFormat", value: fmt })?.settings.dateFormat).toBe(fmt)
    }
    for (const option of PHRASE_LOCALE_OPTIONS) {
      expect(applySettingsEdit(DEFAULTS, { id: "phraseLocale", value: option.value })?.settings.phraseLocale).toBe(option.value)
    }
  })

  test("an off-ladder number where the control is radios or segments", () => {
    // A range would accept 7% and 30px-font; the original offers neither, so the reducer must not either.
    expect(applySettingsEdit(DEFAULTS, { id: "processCountThresholdPercent", value: 7 })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "batteryAlertThresholdPercent", value: 25 })).toBeNull()
    expect(applySettingsEdit(DEFAULTS, { id: "fontSize", value: 30 })).toBeNull()
    for (const option of FONT_SIZE_OPTIONS) {
      expect(applySettingsEdit(DEFAULTS, { id: "fontSize", value: option.value })?.settings.fontSize).toBe(Number(option.value))
    }
  })

  test("a malformed accent colour, with the four legal shapes accepted", () => {
    // The illegal digit counts are 1, 2, 5 and 7 — NOT 4, which is the `#ARGB` shape and was wrongly listed
    // here first. `#FFC0` is amber at full alpha and the reducer was right to take it.
    for (const value of ["FFC000", "#FFC00", "#FFC0000", "#F", "#FF", "#GGGGGG", "#", "rgb(1,2,3)", 16711680, null]) {
      expect(applySettingsEdit(DEFAULTS, { id: "accentColor", value })).toBeNull()
    }
    // #RGB, #ARGB, #RRGGBB, #AARRGGBB — all normalised to the one shape the app writes.
    expect(applySettingsEdit(DEFAULTS, { id: "accentColor", value: "#FC0" })?.settings.accentColor).toBe("#FFFFCC00")
    expect(applySettingsEdit(DEFAULTS, { id: "accentColor", value: "#8FC0" })?.settings.accentColor).toBe("#88FFCC00")
    expect(applySettingsEdit(DEFAULTS, { id: "accentColor", value: "#ffc000" })?.settings.accentColor).toBe("#FFFFC000")
    expect(applySettingsEdit(DEFAULTS, { id: "accentColor", value: "#80ffc000" })?.settings.accentColor).toBe("#80FFC000")
  })
})

describe("rounding on the way in, ties to even like every other rounding in this port", () => {
  test("the opacity slider rounds to 2dp", () => {
    expect(applySettingsEdit(DEFAULTS, { id: "opacity", value: 0.456 })?.settings.opacity).toBe(0.46)
    expect(applySettingsEdit(DEFAULTS, { id: "opacity", value: 0.454 })?.settings.opacity).toBe(0.45)
  })

  test("the interval slider rounds to 1dp, and 2.25 goes DOWN — .NET's Math.Round, not JS's", () => {
    // The divergence `roundToOneDecimal` exists for: `Math.round(2.25 * 10) / 10` is 2.3 in JS and 2.2 in
    // C#. Pinned here as well as in settings.test.ts because this is the path a user's slider actually
    // takes, and it would be easy to "simplify" this decoder into the wrong one.
    expect(applySettingsEdit(DEFAULTS, { id: "statsIntervalSeconds", value: 2.25 })?.settings.statsIntervalSeconds).toBe(2.2)
    expect(applySettingsEdit(DEFAULTS, { id: "statsIntervalSeconds", value: 2.35 })?.settings.statsIntervalSeconds).toBe(2.4)
  })

  test("the radius slider truncates, because the C# casts to int", () => {
    expect(applySettingsEdit(DEFAULTS, { id: "ghostFadeRadiusPx", value: 87.9 })?.settings.ghostFadeRadiusPx).toBe(87)
    expect(applySettingsEdit(DEFAULTS, { id: "ghostFadeRadiusPx", value: 20.99 })?.settings.ghostFadeRadiusPx).toBe(20)
  })

  test("a range input's string payload is accepted, since that is what the DOM sends", () => {
    // `<input type="range">`'s `.value` is a string. If this rejected strings, every slider in the shipped
    // window would be dead while every test above still passed.
    expect(applySettingsEdit(DEFAULTS, { id: "opacity", value: "0.5" })?.settings.opacity).toBe(0.5)
    expect(applySettingsEdit(DEFAULTS, { id: "statsIntervalSeconds", value: "4.5" })?.settings.statsIntervalSeconds).toBe(4.5)
    expect(applySettingsEdit(DEFAULTS, { id: "ghostFadeRadiusPx", value: "150" })?.settings.ghostFadeRadiusPx).toBe(150)
    expect(applySettingsEdit(DEFAULTS, { id: "fontSize", value: "40" })?.settings.fontSize).toBe(40)
    expect(applySettingsEdit(DEFAULTS, { id: "processCountThresholdPercent", value: "10" })?.settings.processCountThresholdPercent).toBe(10)
  })
})

describe("the stats rows route through core/stats-rows.ts — ISA:1045", () => {
  const visible = (overrides: Partial<AppSettings> = {}): AppSettings =>
    settings({ statsVisible: true, ...overrides })

  test("hiding the last metric row collapses the panel and says so", () => {
    const oneLeft = visible({ gpuVisible: false, memVisible: false, pagVisible: false, batteryVisible: false })
    const result = applySettingsEdit(oneLeft, { id: "cpuVisible", value: false })
    expect(result).not.toBeNull()
    expect(result!.settings.cpuVisible).toBe(false)
    expect(result!.settings.statsVisible).toBe(false)
    expect(result!.collapsed).toBe(true)
    expect(result!.reclamp).toBe(false)
  })

  test("hiding a row with others left does not collapse", () => {
    // The counter-case that stops the arm above passing for "any hide collapses".
    const result = applySettingsEdit(visible(), { id: "cpuVisible", value: false })
    expect(result!.settings.statsVisible).toBe(true)
    expect(result!.collapsed).toBe(false)
  })

  test("the collapse is one-way — re-showing a row does not bring the panel back", () => {
    const collapsed = applySettingsEdit(
      visible({ gpuVisible: false, memVisible: false, pagVisible: false, batteryVisible: false }),
      { id: "cpuVisible", value: false },
    )!.settings
    const reshown = applySettingsEdit(collapsed, { id: "cpuVisible", value: true })!
    expect(reshown.settings.cpuVisible).toBe(true)
    expect(reshown.settings.statsVisible).toBe(false)
    // And no re-clamp, because the panel is still down — nothing grew.
    expect(reshown.reclamp).toBe(false)
  })

  test("showing a row while the panel is up asks for a re-clamp", () => {
    const result = applySettingsEdit(visible({ cpuVisible: false }), { id: "cpuVisible", value: true })!
    expect(result.reclamp).toBe(true)
    expect(result.collapsed).toBe(false)
  })

  test("uptime never participates in the collapse, even as the last row standing", () => {
    // `SetUptimeRowVisible` is a separate function in the C# for exactly this reason. Hiding uptime with all
    // five metric rows already off leaves the panel up.
    const onlyUptime = visible({
      cpuVisible: false,
      gpuVisible: false,
      memVisible: false,
      pagVisible: false,
      batteryVisible: false,
    })
    const result = applySettingsEdit(onlyUptime, { id: "uptimeVisible", value: false })!
    expect(result.settings.uptimeVisible).toBe(false)
    expect(result.settings.statsVisible).toBe(true)
    expect(result.collapsed).toBe(false)
  })

  test("showing uptime with the panel up asks for a re-clamp too", () => {
    const result = applySettingsEdit(visible({ uptimeVisible: false }), { id: "uptimeVisible", value: true })!
    expect(result.reclamp).toBe(true)
  })

  test("turning the panel itself on asks for a re-clamp; turning it off does not", () => {
    // The panel appearing at full height is the same hazard a row show is, and it is the more common one.
    expect(applySettingsEdit(DEFAULTS, { id: "statsVisible", value: true })!.reclamp).toBe(true)
    expect(applySettingsEdit(visible(), { id: "statsVisible", value: false })!.reclamp).toBe(false)
  })

  test("no other field ever asks for a re-clamp or reports a collapse", () => {
    // The denominator arm for the two flags: 35 fields, and only the seven above may set either.
    const mayReclamp = new Set([
      "cpuVisible",
      "gpuVisible",
      "memVisible",
      "pagVisible",
      "batteryVisible",
      "uptimeVisible",
      "statsVisible",
    ])
    for (const field of EDITABLE_FIELDS) {
      if (mayReclamp.has(field)) continue
      const result = applySettingsEdit(DEFAULTS, { id: field, value: EDITS[field] })!
      expect(result.reclamp, `${field} asked for a re-clamp`).toBe(false)
      expect(result.collapsed, `${field} reported a collapse`).toBe(false)
    }
  })
})

describe("the result always survives validateSettings, so memory and a reload agree", () => {
  test("every accepted edit produces settings that validate to themselves", () => {
    // Idempotence, which is the real claim: if the reducer could produce a state `validateSettings` would
    // then change, the app in memory and the app after a restart would differ.
    for (const field of EDITABLE_FIELDS) {
      const result = applySettingsEdit(DEFAULTS, { id: field, value: EDITS[field] })!
      const twice = applySettingsEdit(result.settings, { id: field, value: EDITS[field] })!
      expect(twice.settings, field).toEqual(result.settings)
    }
  })

  test("and the form can be rebuilt from any of them", () => {
    // The round trip the shipped window actually performs on every push: edit -> settings -> form.
    for (const field of EDITABLE_FIELDS) {
      const next = applySettingsEdit(DEFAULTS, { id: field, value: EDITS[field] })!.settings
      const ids = fieldControls(buildSettingsForm(next, "en")).map((c) => c.id)
      expect([...ids].sort(), field).toEqual([...EDITABLE_FIELDS].sort())
    }
  })
})
