/**
 * `main/settings-store.ts` -- the load/save layer.
 *
 * Testable at all because the store takes its directory as a constructor argument and imports no
 * Electron, so this runs under plain `bun test` on any OS against a `mkdtemp` directory.
 *
 * ## `legacyPath` is passed EXPLICITLY in every single test, including the `null` cases
 *
 * Not tidiness. The default is `legacyWpfSettingsPath()`, which on this machine resolves to Alex's real
 * `%LOCALAPPDATA%\FuzzyClock\settings.json` -- the file that is read-only to everything in this port.
 * Letting one `new SettingsStore({...})` fall through to the default would make that test's result
 * depend on his live configuration, and would make it pass here and fail anywhere else. The resolver
 * itself is tested through its `env`/`platform` arguments, which touch no filesystem.
 *
 * ## The test that earns its keep
 *
 * "a failed save leaves the previous file intact". `writeFileSync` to the real path truncates first, so
 * the naive implementation answers a mid-write failure with a zero-length settings file -- and the WPF
 * `Load()` answers a zero-length file by discarding every setting. Forcing the failure needs a real
 * obstruction, so the test makes `settings.json.tmp` a DIRECTORY: `writeFileSync` throws EISDIR, and the
 * question is whether `settings.json` survived.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DisplayGeometry } from "../src/core/display-key.js"
import { displayKey } from "../src/core/display-key.js"
import { DEFAULTS } from "../src/core/settings.js"
import type { AppSettings } from "../src/core/settings.js"
import { SETTINGS_FILENAME, SettingsStore, legacyWpfSettingsPath } from "../src/main/settings-store.js"

const LG_PRIMARY: DisplayGeometry = {
  bounds: { x: 0, y: 0, width: 3440, height: 1440 },
  workArea: { x: 0, y: 0, width: 3440, height: 1400 },
  scaleFactor: 1.0,
  isPrimary: true,
}
const DISPLAYS: readonly DisplayGeometry[] = [LG_PRIMARY]

/** The WPF file's shape, trimmed to what the import branch needs. Camel-free on purpose. */
const WPF_JSON = JSON.stringify({
  MonitorPositions: { display6: { Left: 1620, Top: 20 } },
  LastActiveMonitor: "display6",
  ClockType: 1,
  Opacity: 0.5,
  TempsLineVisible: true,
})

let dir = ""
let logs: string[] = []
const log = (level: "info" | "warn" | "error", message: string): void => {
  logs.push(`${level}: ${message}`)
}

function store(options: { legacyPath: string | null; userDataDir?: string }): SettingsStore {
  return new SettingsStore({
    userDataDir: options.userDataDir ?? dir,
    displays: DISPLAYS,
    legacyPath: options.legacyPath,
    log,
  })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fc-settings-"))
  logs = []
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("legacyWpfSettingsPath", () => {
  test("win32 with LOCALAPPDATA set", () => {
    expect(legacyWpfSettingsPath({ LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" }, "win32")).toBe(
      join("C:\\Users\\x\\AppData\\Local", "FuzzyClock", SETTINGS_FILENAME),
    )
  })

  test.each([["darwin"], ["linux"], ["freebsd"]])("%s has nothing to import from", (platform) => {
    // FuzzyClock v4 is a WPF app. Inventing `~/Library/Application Support/FuzzyClock` here would be a
    // migration that can only ever find garbage or nothing.
    expect(legacyWpfSettingsPath({ LOCALAPPDATA: "/whatever" }, platform)).toBeNull()
  })

  test.each([[undefined], [""], ["   "]])("LOCALAPPDATA=%p yields null, never a literal 'undefined' path", (value) => {
    // A real service-account configuration. The naive `join(env.LOCALAPPDATA, ...)` produces
    // `undefined\FuzzyClock\settings.json`, which `existsSync` answers false for -- so the bug hides as
    // "no import needed" rather than surfacing.
    expect(legacyWpfSettingsPath({ LOCALAPPDATA: value }, "win32")).toBeNull()
  })

  test("the filename is the same on both sides of the import", () => {
    expect(SETTINGS_FILENAME).toBe("settings.json")
  })
})

describe("load", () => {
  test("nothing anywhere -> defaults", () => {
    const result = store({ legacyPath: null }).load()
    expect(result.origin).toBe("defaults")
    expect(result.settings).toEqual(DEFAULTS)
    expect(result.importReport).toBeNull()
  })

  test("our own file -> own-file, validated", () => {
    writeFileSync(join(dir, SETTINGS_FILENAME), JSON.stringify({ ...DEFAULTS, fontSize: 48 }))
    const result = store({ legacyPath: null }).load()
    expect(result.origin).toBe("own-file")
    expect(result.settings.fontSize).toBe(48)
  })

  test("our own file is still VALIDATED, not trusted", () => {
    // A hand-edited file is the case this exists for. `validateSettings` is the parser, so an
    // out-of-range value is corrected rather than carried into the app.
    writeFileSync(join(dir, SETTINGS_FILENAME), JSON.stringify({ ...DEFAULTS, opacity: 0, fontSize: "big" }))
    const result = store({ legacyPath: null }).load()
    expect(result.origin).toBe("own-file")
    expect(result.settings.opacity).toBe(1)
    expect(result.settings.fontSize).toBe(DEFAULTS.fontSize)
  })

  test.each([
    ["truncated json", "{ \"fontSize\": 4"],
    ["empty file", ""],
    ["an array", "[1, 2, 3]"],
    ["a bare null", "null"],
    ["a bare number", "42"],
    ["a bare string", "\"nope\""],
  ])("%s -> own-file-unreadable and defaults", (_name, contents) => {
    writeFileSync(join(dir, SETTINGS_FILENAME), contents)
    const result = store({ legacyPath: null }).load()
    expect(result.origin).toBe("own-file-unreadable")
    expect(result.settings).toEqual(DEFAULTS)
  })

  test("an unreadable file is LEFT ON DISK", () => {
    // Deleting it would destroy the only copy of something a human might still repair by hand. The
    // next save overwrites it, which is the user's own action rather than ours.
    const path = join(dir, SETTINGS_FILENAME)
    writeFileSync(path, "{ broken")
    store({ legacyPath: null }).load()
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, "utf8")).toBe("{ broken")
  })

  test("no file of ours, a WPF file present -> wpf-import with a report", () => {
    const legacy = join(dir, "legacy.json")
    writeFileSync(legacy, WPF_JSON)
    const result = store({ legacyPath: legacy }).load()
    expect(result.origin).toBe("wpf-import")
    expect(result.settings.clockType).toBe("dial")
    expect(result.settings.opacity).toBe(0.5)
    // The WPF key `display6` is a GDI name Electron cannot produce; geometry matching re-keys it.
    expect(result.settings.monitorPositions).toEqual({ [displayKey(LG_PRIMARY)]: { left: 1620, top: 20 } })
    expect(result.importReport?.importedPositions).toHaveLength(1)
    expect(result.importReport?.ignoredKeys).toContain("TempsLineVisible")
  })

  test("the import does NOT write our file -- the WPF file stays the only copy", () => {
    // `main.ts` saves once the window has been placed, so the first file we write carries a monitor key
    // that resolves. Writing here would produce one keyed to whatever the import guessed.
    const legacy = join(dir, "legacy.json")
    writeFileSync(legacy, WPF_JSON)
    const s = store({ legacyPath: legacy })
    s.load()
    expect(existsSync(s.path)).toBe(false)
    expect(readFileSync(legacy, "utf8")).toBe(WPF_JSON)
  })

  test.each([
    ["not json", "{{{"],
    ["an array", "[]"],
    ["a bare string", "\"x\""],
  ])("a WPF file that is %s -> wpf-unreadable, not a partial import", (_name, contents) => {
    const legacy = join(dir, "legacy.json")
    writeFileSync(legacy, contents)
    const result = store({ legacyPath: legacy }).load()
    expect(result.origin).toBe("wpf-unreadable")
    expect(result.settings).toEqual(DEFAULTS)
  })

  test("legacyPath null disables the import even with a file sitting there", () => {
    // This arm failed on first run, and the implementation was wrong rather than the test: the
    // constructor used `options.legacyPath ?? legacyWpfSettingsPath()`, and `??` treats an explicit
    // `null` exactly like an absent one. So "null disables the import" was documented but unreachable,
    // and on a Windows box every call that passed null was quietly reading the real WPF file. The three
    // failures were all in tests that expected `"defaults"` and got `"wpf-import"` -- from Alex's own
    // settings, on a machine where that file happens to exist.
    writeFileSync(join(dir, "legacy.json"), WPF_JSON)
    expect(store({ legacyPath: null }).load().origin).toBe("defaults")
  })

  test("an OMITTED legacyPath still falls back to the platform default", () => {
    // The other half of the same distinction: `undefined` must keep the default, or `main.ts` -- which
    // omits the option -- would stop importing altogether. Asserted structurally, against the resolver
    // rather than the filesystem, because the default resolves to Alex's live file on this machine and
    // nothing in this port reads that path outside his own app run.
    const resolved = legacyWpfSettingsPath()
    expect(resolved === null || resolved.endsWith(join("FuzzyClock", SETTINGS_FILENAME))).toBe(true)
  })

  test("our file wins over the WPF file -- the existence of our file IS the import-once marker", () => {
    // The whole reason there is no version stamp and no `imported: true` flag. Two sources of truth
    // about the same fact fail by importing over a user's settings.
    const legacy = join(dir, "legacy.json")
    writeFileSync(legacy, WPF_JSON)
    writeFileSync(join(dir, SETTINGS_FILENAME), JSON.stringify({ ...DEFAULTS, fontSize: 11 }))
    const result = store({ legacyPath: legacy }).load()
    expect(result.origin).toBe("own-file")
    expect(result.settings.fontSize).toBe(11)
    expect(result.settings.clockType).toBe("phrase")
  })

  test("a legacyPath that does not exist -> defaults, no throw", () => {
    expect(store({ legacyPath: join(dir, "absent.json") }).load().origin).toBe("defaults")
  })

  test("a missing userDataDir is not an error -- first launch has no directory yet", () => {
    const fresh = join(dir, "does", "not", "exist")
    expect(store({ legacyPath: null, userDataDir: fresh }).load().origin).toBe("defaults")
  })

  test("the import logs its counts", () => {
    const legacy = join(dir, "legacy.json")
    writeFileSync(legacy, WPF_JSON)
    store({ legacyPath: legacy }).load()
    expect(logs.some((line) => line.startsWith("info: settings: imported from"))).toBe(true)
  })
})

describe("save", () => {
  const CONFIGURED: AppSettings = { ...DEFAULTS, fontSize: 20, lastActiveMonitor: displayKey(LG_PRIMARY) }

  test("writes, and round-trips through load", () => {
    const s = store({ legacyPath: null })
    expect(s.save(CONFIGURED)).toBe(true)
    const back = store({ legacyPath: null }).load()
    expect(back.origin).toBe("own-file")
    expect(back.settings).toEqual(CONFIGURED)
  })

  test("creates the directory -- `app.getPath('userData')` does not exist on a first launch", () => {
    const fresh = join(dir, "nested", "userData")
    expect(store({ legacyPath: null, userDataDir: fresh }).save(CONFIGURED)).toBe(true)
    expect(existsSync(join(fresh, SETTINGS_FILENAME))).toBe(true)
  })

  test("pretty-printed with a trailing newline -- the file is meant to be hand-editable", () => {
    const s = store({ legacyPath: null })
    s.save(CONFIGURED)
    const text = readFileSync(s.path, "utf8")
    expect(text.endsWith("\n")).toBe(true)
    expect(text).toContain('\n  "fontSize": 20')
  })

  test("leaves no .tmp behind on success", () => {
    const s = store({ legacyPath: null })
    s.save(CONFIGURED)
    expect(existsSync(`${s.path}.tmp`)).toBe(false)
  })

  test("a failed save leaves the previous file INTACT, and returns false", () => {
    // The atomicity claim, tested rather than asserted in a comment. `settings.json.tmp` is made a
    // directory, so `writeFileSync(temp, ...)` throws EISDIR before `renameSync` is reached. A
    // truncate-first implementation would have destroyed `settings.json` by this point.
    const s = store({ legacyPath: null })
    expect(s.save(CONFIGURED)).toBe(true)
    const before = readFileSync(s.path, "utf8")

    mkdirSync(`${s.path}.tmp`)
    expect(s.save({ ...CONFIGURED, fontSize: 99 })).toBe(false)

    expect(readFileSync(s.path, "utf8")).toBe(before)
    expect(store({ legacyPath: null }).load().settings.fontSize).toBe(20)
    expect(logs.some((line) => line.startsWith("error: settings: save to"))).toBe(true)
    rmSync(`${s.path}.tmp`, { recursive: true })
  })

  test("a failed save does not throw -- the overlay stays usable", () => {
    const s = store({ legacyPath: null })
    mkdirSync(`${s.path}.tmp`)
    expect(() => s.save(CONFIGURED)).not.toThrow()
    rmSync(`${s.path}.tmp`, { recursive: true })
  })

  test("path is userDataDir/settings.json", () => {
    expect(store({ legacyPath: null }).path).toBe(join(dir, SETTINGS_FILENAME))
  })
})
