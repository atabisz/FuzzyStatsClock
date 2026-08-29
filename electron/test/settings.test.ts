/**
 * Translated from FuzzyClock.App.Tests/AppSettingsTests.cs and SettingsServiceTests.cs, but the
 * expectations are RECORDED rather than read off those tests: `fcappprobe.exe settings` compiles the
 * real AppSettings.cs / ClockType.cs / SettingsService.cs into a console harness and prints
 * `Defaults()`, `Validate()` over every guard, `Math.Round(v, 1)`, and what
 * `JsonSerializer.Deserialize<AppSettings>` produces for `{}` and for a partial object. Doubles
 * printed `G17`, so every figure below is the exact double the C# holds, not a rounded display of it.
 *
 * The probe calls neither `Load()` nor `Save()`. `Save()` writes Alex's live settings file, and no
 * probe in this port is allowed to touch it.
 *
 * 68 of the 88 rows below are Validate rows, which is what the C# suite covers. The Math.Round table
 * and the wrong-typed-field group are new: the first because a naive JS port of `Math.Round(v, 1)` is
 * WRONG on values a user can actually set, and the second because this port answers a corrupt field
 * differently from the C# on purpose.
 */
import { describe, expect, test } from "bun:test"
import { DEFAULTS, roundToOneDecimal, validateSettings } from "../src/core/settings.js"

describe("roundToOneDecimal, measured against C# Math.Round(v, 1)", () => {
  test.each([
    [2.567, 2.6],
    [0.54, 0.5],
    [9.99, 10],
    [2.25, 2.2],
    [2.75, 2.8],
    [0.75, 0.8],
    [1.25, 1.2],
    [3.25, 3.2],
    [6.25, 6.2],
    [5.5, 5.5],
    [2, 2],
    [0.5, 0.5],
    [10, 10],
    [2.55, 2.6],
    [2.65, 2.6],
    [1.05, 1],
    [8.35, 8.4],
    [0.55, 0.6],
    [9.95, 10],
    [3, 3],
  ] as const)("%p -> %p", (input, expected) => {
    expect(roundToOneDecimal(input)).toBe(expected)
  })
})

describe("roundToOneDecimal is not Math.round(v * 10) / 10", () => {
  // The control that gives the table above its discriminating power. Without these rows, a naive
  // implementation would pass 16 of the 20 and the table would read as if it had proven something.
  test.each([
    [2.25, 2.2, 2.3],
    [1.25, 1.2, 1.3],
    [3.25, 3.2, 3.3],
    [6.25, 6.2, 6.3],
  ] as const)("%p -> %p, where the naive port gives %p", (input, csharp, naive) => {
    expect(roundToOneDecimal(input)).toBe(csharp)
    expect(Math.round(input * 10) / 10).toBe(naive)
    expect(csharp).not.toBe(naive)
  })
})

describe("DEFAULTS matches SettingsService.Defaults()", () => {
  test("every field, as the probe printed it", () => {
    expect(DEFAULTS).toEqual({
      monitorPositions: {},
      lastActiveMonitor: "",
      fontSize: 32,
      statsVisible: false,
      statsIntervalSeconds: 2,
      cpuVisible: true,
      gpuVisible: true,
      memVisible: true,
      pagVisible: true,
      batteryVisible: true,
      uptimeVisible: true,
      showHourTicks: false,
      showMinuteDots: false,
      showHourNumbers: false,
      clockType: "phrase",
      lcdUse24Hr: false,
      lcdShowSeconds: true,
      lcdStyle: "Dark",
      lcdSize: "medium",
      accentColor: "#FFFFFFFF",
      opacity: 1,
      ghostModeEnabled: true,
      autoLaunchEnabled: false,
      autoContrastEnabled: false,
      processCountThresholdPercent: 5,
      textStyle: "Classic",
      phraseStyle: "Classic",
      phraseLocale: "auto",
      showDate: true,
      dateFormat: "Short",
      batteryAlertThresholdPercent: 20,
      phraseWrapEnabled: true,
      phraseWrapStyle: "midpoint",
      backdropAlwaysVisible: false,
      backdropOpacityPercent: 35,
      ghostFadeRadiusPx: 80,
      useCtrl: true,
      useAlt: true,
      useShift: false,
      useWin: false,
      updateChecksEnabled: true,
    })
  })

  test("41 fields: the C# record's 47 less the 6 deliberately dropped", () => {
    // The count is the guard. `toEqual` above would not notice a field added to BOTH the interface
    // and the literal, and a silently-added setting is how a port acquires state the WPF app never
    // had. 47 measured C# properties, minus the five Temp* keys (Option C) and
    // SoftwareRenderingEnabled (settings.ts's header carries the reason).
    expect(Object.keys(DEFAULTS)).toHaveLength(41)
  })

  test("ClockType and LcdSize are the ordinals the C# holds, decoded to names", () => {
    // Measured: `default ClockType Phrase(0)` and `default LcdSize Medium(1)`, and the serialiser
    // writes `"ClockType":0,"LcdSize":1`. This pins the decode, not just the name.
    expect(DEFAULTS.clockType).toBe("phrase")
    expect(DEFAULTS.lcdSize).toBe("medium")
  })

  test("useCtrl and useAlt default TRUE (CFG-04)", () => {
    // AppSettings.cs makes this explicit because a bool JSON-deserialises as false when absent: a
    // v4.x file without the modifier keys would otherwise leave ghost mode with NO hotkey at all.
    expect(DEFAULTS.useCtrl).toBe(true)
    expect(DEFAULTS.useAlt).toBe(true)
    expect(DEFAULTS.useShift).toBe(false)
    expect(DEFAULTS.useWin).toBe(false)
  })
})

describe("validateSettings, measured against SettingsService.Validate", () => {
  test.each([
    // StatsIntervalSeconds: outside [0.5, 10.0] -> default 2; inside -> Math.Round(v, 1)
    ["interval 0", { statsIntervalSeconds: 0 }, "statsIntervalSeconds", 2],
    ["interval 0.4", { statsIntervalSeconds: 0.4 }, "statsIntervalSeconds", 2],
    ["interval 0.5", { statsIntervalSeconds: 0.5 }, "statsIntervalSeconds", 0.5],
    ["interval 2.0", { statsIntervalSeconds: 2.0 }, "statsIntervalSeconds", 2],
    ["interval 5.5", { statsIntervalSeconds: 5.5 }, "statsIntervalSeconds", 5.5],
    ["interval 10.0", { statsIntervalSeconds: 10.0 }, "statsIntervalSeconds", 10],
    ["interval 10.1", { statsIntervalSeconds: 10.1 }, "statsIntervalSeconds", 2],
    ["interval 999", { statsIntervalSeconds: 999.0 }, "statsIntervalSeconds", 2],
    ["interval -1", { statsIntervalSeconds: -1.0 }, "statsIntervalSeconds", 2],
    ["interval 2.567", { statsIntervalSeconds: 2.567 }, "statsIntervalSeconds", 2.6],
    ["interval 0.54", { statsIntervalSeconds: 0.54 }, "statsIntervalSeconds", 0.5],
    ["interval 9.99", { statsIntervalSeconds: 9.99 }, "statsIntervalSeconds", 10],
    ["interval 2.25", { statsIntervalSeconds: 2.25 }, "statsIntervalSeconds", 2.2],
    ["interval 2.75", { statsIntervalSeconds: 2.75 }, "statsIntervalSeconds", 2.8],
    ["interval 3.0", { statsIntervalSeconds: 3.0 }, "statsIntervalSeconds", 3],

    // Opacity <= 0 -> 1.0. No upper guard, so 1.5 survives -- the C#'s asymmetry, kept.
    ["opacity 0.0", { opacity: 0.0 }, "opacity", 1],
    ["opacity -0.5", { opacity: -0.5 }, "opacity", 1],
    ["opacity 0.7 live", { opacity: 0.7000000000000001 }, "opacity", 0.7000000000000001],
    ["opacity 1.5", { opacity: 1.5 }, "opacity", 1.5],

    // AccentColor: blank -> default. NOT format-validated -- garbage survives, measured.
    ["accent null", { accentColor: null }, "accentColor", "#FFFFFFFF"],
    ["accent empty", { accentColor: "" }, "accentColor", "#FFFFFFFF"],
    ["accent spaces", { accentColor: "   " }, "accentColor", "#FFFFFFFF"],
    ["accent #FF00FF00", { accentColor: "#FF00FF00" }, "accentColor", "#FF00FF00"],
    ["accent garbage", { accentColor: "not-a-colour" }, "accentColor", "not-a-colour"],

    // ProcessCountThresholdPercent: a ladder of 2/5/10, not a range. 3 is not "close to 2".
    ["procthresh 2", { processCountThresholdPercent: 2.0 }, "processCountThresholdPercent", 2],
    ["procthresh 5", { processCountThresholdPercent: 5.0 }, "processCountThresholdPercent", 5],
    ["procthresh 10", { processCountThresholdPercent: 10.0 }, "processCountThresholdPercent", 10],
    ["procthresh 3", { processCountThresholdPercent: 3.0 }, "processCountThresholdPercent", 5],
    ["procthresh 0", { processCountThresholdPercent: 0.0 }, "processCountThresholdPercent", 5],

    // BatteryAlertThresholdPercent: ladder of 10/15/20.
    ["battalert 10", { batteryAlertThresholdPercent: 10 }, "batteryAlertThresholdPercent", 10],
    ["battalert 15", { batteryAlertThresholdPercent: 15 }, "batteryAlertThresholdPercent", 15],
    ["battalert 20", { batteryAlertThresholdPercent: 20 }, "batteryAlertThresholdPercent", 20],
    ["battalert 5", { batteryAlertThresholdPercent: 5 }, "batteryAlertThresholdPercent", 20],
    ["battalert 0", { batteryAlertThresholdPercent: 0 }, "batteryAlertThresholdPercent", 20],

    // TextStyle: four names, CASE-SENSITIVE -- "classic" is rejected, measured.
    ["textstyle Classic", { textStyle: "Classic" }, "textStyle", "Classic"],
    ["textstyle Split", { textStyle: "Split" }, "textStyle", "Split"],
    ["textstyle Literary", { textStyle: "Literary" }, "textStyle", "Literary"],
    ["textstyle Mono", { textStyle: "Mono" }, "textStyle", "Mono"],
    ["textstyle bogus", { textStyle: "Bogus" }, "textStyle", "Classic"],
    ["textstyle empty", { textStyle: "" }, "textStyle", "Classic"],
    ["textstyle null", { textStyle: null }, "textStyle", "Classic"],
    ["textstyle lowercase", { textStyle: "classic" }, "textStyle", "Classic"],

    ["dateformat Short", { dateFormat: "Short" }, "dateFormat", "Short"],
    ["dateformat Long", { dateFormat: "Long" }, "dateFormat", "Long"],
    ["dateformat Numeric", { dateFormat: "Numeric" }, "dateFormat", "Numeric"],
    ["dateformat ISO", { dateFormat: "ISO" }, "dateFormat", "ISO"],
    ["dateformat bogus", { dateFormat: "RFC3339" }, "dateFormat", "Short"],

    ["phrasestyle Rude", { phraseStyle: "Rude" }, "phraseStyle", "Rude"],
    ["phrasestyle Yoda", { phraseStyle: "Yoda" }, "phraseStyle", "Yoda"],
    ["phrasestyle bogus", { phraseStyle: "Klingon" }, "phraseStyle", "Classic"],
    ["phrasestyle empty", { phraseStyle: "" }, "phraseStyle", "Classic"],

    ["lcdstyle Dark", { lcdStyle: "Dark" }, "lcdStyle", "Dark"],
    ["lcdstyle Paper", { lcdStyle: "Paper" }, "lcdStyle", "Paper"],
    ["lcdstyle Silver", { lcdStyle: "Silver" }, "lcdStyle", "Silver"],
    ["lcdstyle Broken", { lcdStyle: "Broken" }, "lcdStyle", "Dark"],

    // GhostFadeRadiusPx outside 20-200 -> 80. A negative radius clamps HIGH, not to zero.
    ["radius -1", { ghostFadeRadiusPx: -1 }, "ghostFadeRadiusPx", 80],
    ["radius 0", { ghostFadeRadiusPx: 0 }, "ghostFadeRadiusPx", 80],
    ["radius 19", { ghostFadeRadiusPx: 19 }, "ghostFadeRadiusPx", 80],
    ["radius 20", { ghostFadeRadiusPx: 20 }, "ghostFadeRadiusPx", 20],
    ["radius 80", { ghostFadeRadiusPx: 80 }, "ghostFadeRadiusPx", 80],
    ["radius 200", { ghostFadeRadiusPx: 200 }, "ghostFadeRadiusPx", 200],
    ["radius 201", { ghostFadeRadiusPx: 201 }, "ghostFadeRadiusPx", 80],
    ["radius 999", { ghostFadeRadiusPx: 999 }, "ghostFadeRadiusPx", 80],
  ] as const)("%s -> %s = %p", (_label, patch, field, expected) => {
    const result = validateSettings(patch) as unknown as Record<string, unknown>
    expect(result[field]).toBe(expected)
  })

  test("monitorPositions null -> empty map (measured: count 0)", () => {
    expect(Object.keys(validateSettings({ monitorPositions: null }).monitorPositions)).toHaveLength(0)
  })
})

describe("validateSettings supplies the absent-field defaults System.Text.Json supplies", () => {
  test("an empty object yields DEFAULTS exactly", () => {
    // Measured as the `json-empty` section: `Deserialize<AppSettings>("{}")` is field-for-field
    // identical to `Defaults()`, so the init defaults are the wire defaults too.
    expect(validateSettings({})).toEqual(DEFAULTS)
  })

  test("a partial object keeps its one field and defaults the rest", () => {
    // `{"StatsIntervalSeconds":3}` -> interval 3, UptimeVisible True. The second half is the point:
    // an absent bool must NOT come back false.
    const result = validateSettings({ statsIntervalSeconds: 3 })
    expect(result.statsIntervalSeconds).toBe(3)
    expect(result.uptimeVisible).toBe(true)
  })
})

describe("validateSettings on a wrong-typed field -- the documented divergence", () => {
  // `Deserialize` THROWS on these, and `Load()`'s catch discards the entire file. This defaults the
  // offending field and keeps the other forty. Not a translation: a deliberate difference, tested so
  // it stays deliberate.
  test("a string where a number belongs defaults that field alone", () => {
    const result = validateSettings({ opacity: "half", statsVisible: true, fontSize: 18 })
    expect(result.opacity).toBe(1)
    expect(result.statsVisible).toBe(true)
    expect(result.fontSize).toBe(18)
  })

  test("NaN and Infinity are treated as absent", () => {
    expect(validateSettings({ fontSize: Number.NaN }).fontSize).toBe(32)
    expect(validateSettings({ backdropOpacityPercent: Number.POSITIVE_INFINITY }).backdropOpacityPercent).toBe(35)
  })

  test("a clock type outside the enum falls back to phrase", () => {
    // The C# has no guard here at all: `(ClockType)7` deserialises happily and reaches a switch no
    // arm of which matches. This port refuses the value instead.
    expect(validateSettings({ clockType: 7 }).clockType).toBe("phrase")
    expect(validateSettings({ clockType: "sundial" }).clockType).toBe("phrase")
  })

  test("both enum encodings are accepted: WPF's ordinal and this port's name", () => {
    expect(validateSettings({ clockType: 1 }).clockType).toBe("dial")
    expect(validateSettings({ clockType: "dial" }).clockType).toBe("dial")
    expect(validateSettings({ lcdSize: 0 }).lcdSize).toBe("small")
    expect(validateSettings({ lcdSize: "small" }).lcdSize).toBe("small")
  })
})
