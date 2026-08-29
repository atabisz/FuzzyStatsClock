/**
 * ISC-18: the one-time import of the WPF settings file.
 *
 * New coverage -- the C# has no importer to translate, because it IS the writer of this format. The
 * value expectations are still measured: the golden row below is Alex's live
 * `%LOCALAPPDATA%\FuzzyClock\settings.json`, and `fcappprobe.exe settings` printed what the real
 * `JsonSerializer.Deserialize<AppSettings>` + `SettingsService.Validate` make of it, field by field at
 * `G17`. Everything this file asserts about VALUES comes from that run; what it adds is the monitor
 * re-keying, which has no C# counterpart.
 *
 * The JSON is embedded rather than read. His live file is read-only to every probe and test in this
 * port -- an import test that opened the real path would be one typo away from writing it.
 */
import { describe, expect, test } from "bun:test"
import type { DisplayGeometry } from "../src/core/display-key.js"
import { displayKey } from "../src/core/display-key.js"
import { importWpfSettings, parseWpfSettingsJson } from "../src/core/settings-import.js"
import { DEFAULTS } from "../src/core/settings.js"

/** Copied byte-for-byte from his live file on 2026-08-29. Note `ClockType:1` and `LcdSize:0`: ordinals. */
const LIVE_JSON =
  '{"MonitorPositions":{"display6":{"Left":1620,"Top":20},"display5":{"Left":-227,"Top":510}},' +
  '"LastActiveMonitor":"display5","FontSize":16,"StatsVisible":true,"StatsIntervalSeconds":3,' +
  '"CpuVisible":true,"GpuVisible":true,"MemVisible":true,"PagVisible":true,"BatteryVisible":true,' +
  '"UptimeVisible":true,"ShowHourTicks":true,"ShowMinuteDots":false,"ShowHourNumbers":false,' +
  '"ClockType":1,"LcdUse24Hr":false,"LcdShowSeconds":true,"LcdStyle":"Dark","LcdSize":0,' +
  '"AccentColor":"#FFFFFFFF","Opacity":0.7000000000000001,"GhostModeEnabled":true,' +
  '"AutoLaunchEnabled":true,"AutoContrastEnabled":false,"ProcessCountThresholdPercent":2,' +
  '"TextStyle":"Classic","PhraseStyle":"Rude","PhraseLocale":"auto","ShowDate":true,' +
  '"DateFormat":"Short","BatteryAlertThresholdPercent":20,"PhraseWrapEnabled":true,' +
  '"PhraseWrapStyle":"midpoint","BackdropAlwaysVisible":true,"BackdropOpacityPercent":15,' +
  '"GhostFadeRadiusPx":200,"TempsLineVisible":true,"TempCpuVisible":true,"TempGpuVisible":true,' +
  '"TempMoboVisible":false,"TempNvmeVisible":false,"UseCtrl":true,"UseAlt":false,"UseShift":true,' +
  '"UseWin":false,"UpdateChecksEnabled":true,"SoftwareRenderingEnabled":false}'

/** ISC-7's measured desk. */
const INTERNAL: DisplayGeometry = {
  bounds: { x: 3441, y: -499, width: 1920, height: 1080 },
  workArea: { x: 3441, y: -499, width: 1920, height: 1040 },
  scaleFactor: 1.0,
}
const LG_PRIMARY: DisplayGeometry = {
  bounds: { x: 0, y: 0, width: 3440, height: 1440 },
  workArea: { x: 0, y: 0, width: 3440, height: 1400 },
  scaleFactor: 1.0,
  isPrimary: true,
}
const LG_SECOND: DisplayGeometry = {
  bounds: { x: 1, y: -1440, width: 3440, height: 1440 },
  workArea: { x: 1, y: -1440, width: 3440, height: 1440 },
  scaleFactor: 1.0,
}
const DESK: readonly DisplayGeometry[] = [INTERNAL, LG_PRIMARY, LG_SECOND]

function importLive() {
  const raw = parseWpfSettingsJson(LIVE_JSON)
  expect(raw).not.toBeNull()
  return importWpfSettings(raw!, DESK)
}

describe("importWpfSettings on Alex's live file", () => {
  test("every setting, measured against Deserialize + Validate on the real C#", () => {
    expect(importLive().settings).toEqual({
      // Re-keyed: `display6` -> the primary LG's composite key. `display5` is gone entirely.
      monitorPositions: { "3440x1440@0,0:1.00": { left: 1620, top: 20 } },
      // `"display5"` pointed at the dropped entry, so the sentinel takes its place.
      lastActiveMonitor: "",
      fontSize: 16,
      statsVisible: true,
      statsIntervalSeconds: 3,
      cpuVisible: true,
      gpuVisible: true,
      memVisible: true,
      pagVisible: true,
      batteryVisible: true,
      uptimeVisible: true,
      showHourTicks: true,
      showMinuteDots: false,
      showHourNumbers: false,
      clockType: "dial", // ordinal 1
      lcdUse24Hr: false,
      lcdShowSeconds: true,
      lcdStyle: "Dark",
      lcdSize: "small", // ordinal 0
      accentColor: "#FFFFFFFF",
      opacity: 0.7000000000000001, // the C# printed 0.70000000000000007 -- the same double
      ghostModeEnabled: true,
      autoLaunchEnabled: true,
      autoContrastEnabled: false,
      processCountThresholdPercent: 2,
      textStyle: "Classic",
      phraseStyle: "Rude",
      phraseLocale: "auto",
      showDate: true,
      dateFormat: "Short",
      batteryAlertThresholdPercent: 20,
      phraseWrapEnabled: true,
      phraseWrapStyle: "midpoint",
      backdropAlwaysVisible: true,
      backdropOpacityPercent: 15,
      ghostFadeRadiusPx: 200,
      useCtrl: true,
      useAlt: false, // differs from the default -- he changed the hotkey to Ctrl+Shift
      useShift: true,
      useWin: false,
      updateChecksEnabled: true,
    })
  })

  test("positions are matched by GEOMETRY: display6 imports, display5 drops", () => {
    const { report } = importLive()
    expect(report.importedPositions).toEqual([
      { wpfKey: "display6", displayKey: "3440x1440@0,0:1.00", position: { left: 1620, top: 20 } },
    ])
    expect(report.droppedPositions).toEqual([{ wpfKey: "display5", position: { left: -227, top: 510 } }])
  })

  test("LastActiveMonitor follows its position: display5 -> the empty sentinel", () => {
    const { report } = importLive()
    expect(report.requestedActiveMonitor).toBe("display5")
    expect(report.resolvedActiveMonitor).toBe("")
  })

  test("all six dropped keys are reported as ignored, not silently swallowed", () => {
    expect(importLive().report.ignoredKeys).toEqual([
      "TempsLineVisible",
      "TempCpuVisible",
      "TempGpuVisible",
      "TempMoboVisible",
      "TempNvmeVisible",
      "SoftwareRenderingEnabled",
    ])
  })

  test("nothing in his file is unrecognised, and neither migration fires", () => {
    const { report } = importLive()
    expect(report.unknownKeys).toEqual([])
    expect(report.migratedLegacyPosition).toBe(false)
    expect(report.migratedDialMode).toBe(false)
  })

  test("SoftwareRenderingEnabled does not reach the settings at all", () => {
    // It is `false` in his file, so a careless port would look correct by accident. The claim is that
    // the FIELD is absent, not that the value happens to be harmless.
    expect(Object.keys(importLive().settings)).not.toContain("softwareRenderingEnabled")
    expect(Object.keys(importLive().settings)).toHaveLength(41)
  })

  test("re-keying is against the CURRENT displays, so a different desk imports differently", () => {
    // Same file, only the internal panel attached: (1620, 20) is not on it either, so BOTH positions
    // drop and the import is a clean first run.
    const raw = parseWpfSettingsJson(LIVE_JSON)!
    const { settings, report } = importWpfSettings(raw, [{ ...INTERNAL, isPrimary: true }])
    expect(report.droppedPositions).toHaveLength(2)
    expect(report.importedPositions).toEqual([])
    expect(settings.monitorPositions).toEqual({})
    expect(settings.lastActiveMonitor).toBe("")
    // The other 40 settings still come across -- a dropped position is not a failed import.
    expect(settings.clockType).toBe("dial")
    expect(settings.opacity).toBe(0.7000000000000001)
  })
})

describe("importWpfSettings legacy migrations, from SettingsService.Load()", () => {
  test("Left/Top -> MonitorPositions under the PRIMARY key", () => {
    const { settings, report } = importWpfSettings({ Left: 900, Top: 40, FontSize: 24 }, DESK)
    expect(report.migratedLegacyPosition).toBe(true)
    expect(settings.monitorPositions).toEqual({ "3440x1440@0,0:1.00": { left: 900, top: 40 } })
    expect(settings.lastActiveMonitor).toBe(displayKey(LG_PRIMARY))
    expect(settings.fontSize).toBe(24)
  })

  test("Left == -1 is the old 'no saved position' sentinel and does not migrate", () => {
    const { settings, report } = importWpfSettings({ Left: -1, Top: -1 }, DESK)
    expect(report.migratedLegacyPosition).toBe(false)
    expect(settings.monitorPositions).toEqual({})
    expect(settings.lastActiveMonitor).toBe("")
  })

  test("Left is ignored once MonitorPositions exists", () => {
    // `hasOldLeft && !hasNewPositions`. A file carrying both is mid-upgrade; the new field wins.
    const { settings, report } = importWpfSettings(
      { Left: 900, Top: 40, MonitorPositions: { display6: { Left: 1620, Top: 20 } }, LastActiveMonitor: "display6" },
      DESK,
    )
    expect(report.migratedLegacyPosition).toBe(false)
    expect(settings.monitorPositions).toEqual({ "3440x1440@0,0:1.00": { left: 1620, top: 20 } })
  })

  test("Left without Top does not migrate -- where the C# throws and loses the whole file", () => {
    // The C# reads `GetProperty("Top")` unguarded, so this file costs the user every other setting.
    // Documented divergence: migrate nothing, keep everything else.
    const { settings, report } = importWpfSettings({ Left: 900, FontSize: 24 }, DESK)
    expect(report.migratedLegacyPosition).toBe(false)
    expect(settings.fontSize).toBe(24)
  })

  test("DialMode true -> ClockType dial, but only while ClockType is absent or Phrase", () => {
    expect(importWpfSettings({ DialMode: true }, DESK).settings.clockType).toBe("dial")
    expect(importWpfSettings({ DialMode: true }, DESK).report.migratedDialMode).toBe(true)
    expect(importWpfSettings({ DialMode: true, ClockType: 0 }, DESK).settings.clockType).toBe("dial")
    // An explicit non-Phrase ClockType wins -- the C#'s `loaded.ClockType == ClockType.Phrase` guard.
    expect(importWpfSettings({ DialMode: true, ClockType: 2 }, DESK).settings.clockType).toBe("lcd")
    expect(importWpfSettings({ DialMode: true, ClockType: 2 }, DESK).report.migratedDialMode).toBe(false)
  })

  test("DialMode false is a no-op, since Phrase is already the default", () => {
    const { settings, report } = importWpfSettings({ DialMode: false }, DESK)
    expect(settings.clockType).toBe("phrase")
    expect(report.migratedDialMode).toBe(false)
  })

  test("the legacy keys are never reported as unknown", () => {
    expect(importWpfSettings({ Left: 900, Top: 40, DialMode: true }, DESK).report.unknownKeys).toEqual([])
  })
})

describe("importWpfSettings on files that are not his", () => {
  test("an empty object yields the defaults", () => {
    expect(importWpfSettings({}, DESK).settings).toEqual(DEFAULTS)
  })

  test("an unrecognised key is reported, not merged", () => {
    const { settings, report } = importWpfSettings({ FontSize: 20, WarpFactor: 9 }, DESK)
    expect(report.unknownKeys).toEqual(["WarpFactor"])
    expect(settings.fontSize).toBe(20)
    expect(Object.keys(settings)).toHaveLength(41)
  })

  test("a malformed position entry is skipped without dropping its siblings", () => {
    const { settings, report } = importWpfSettings(
      {
        MonitorPositions: {
          display6: { Left: 1620, Top: 20 },
          display9: { Left: "over there" },
          display1: null,
        },
      },
      DESK,
    )
    expect(Object.keys(settings.monitorPositions)).toEqual(["3440x1440@0,0:1.00"])
    // Skipped for being unreadable, which is not the same as dropped for landing off-screen.
    expect(report.droppedPositions).toEqual([])
    expect(report.importedPositions).toHaveLength(1)
  })

  test("two WPF keys landing on one display collapse, last write winning", () => {
    // Real on his desk: both LG panels report the same name, so a re-arrange can move one onto the
    // other's old area. Stated as behaviour rather than left to chance.
    const { settings, report } = importWpfSettings(
      { MonitorPositions: { display6: { Left: 100, Top: 100 }, display7: { Left: 200, Top: 200 } } },
      DESK,
    )
    expect(settings.monitorPositions).toEqual({ "3440x1440@0,0:1.00": { left: 200, top: 200 } })
    expect(report.importedPositions).toHaveLength(2)
  })

  test("out-of-range values are still guarded by validateSettings", () => {
    // The importer runs Validate last, so a hand-edited WPF file cannot smuggle a bad value across.
    const { settings } = importWpfSettings({ Opacity: 0, GhostFadeRadiusPx: 999, StatsIntervalSeconds: 42 }, DESK)
    expect(settings.opacity).toBe(1)
    expect(settings.ghostFadeRadiusPx).toBe(80)
    expect(settings.statsIntervalSeconds).toBe(2)
  })

  test("no displays attached: every position drops rather than being re-keyed to nothing", () => {
    const { settings, report } = importWpfSettings(parseWpfSettingsJson(LIVE_JSON)!, [])
    expect(report.droppedPositions).toHaveLength(2)
    expect(settings.monitorPositions).toEqual({})
    expect(report.migratedLegacyPosition).toBe(false)
  })
})

describe("parseWpfSettingsJson", () => {
  test.each([
    ["{}", true],
    ['{"FontSize":20}', true],
    ["not json at all", false],
    ["", false],
    ["[1,2,3]", false],
    ["null", false],
    ['"a string"', false],
    ["42", false],
  ] as const)("%p -> parsed=%p", (text, ok) => {
    expect(parseWpfSettingsJson(text) !== null).toBe(ok)
  })

  test("a truncated file returns null rather than throwing", () => {
    // Load()'s `catch { return Defaults(); }`, as a return value. A half-written file is what a
    // mid-save power cut leaves, and the store must fall back rather than crash at startup.
    expect(parseWpfSettingsJson(LIVE_JSON.slice(0, 200))).toBeNull()
  })
})
