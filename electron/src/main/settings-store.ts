/**
 * Settings persistence -- `FuzzyClock.App/SettingsService.cs`'s Load/Save half.
 *
 * ## No Electron import, deliberately
 *
 * Same rule as `platform.ts`: not even a type import. The store takes its directory as a
 * constructor argument, so `main.ts` passes `app.getPath("userData")` and a test passes a temp dir.
 * That is what lets the atomic-write path, the corrupt-file fallback and the one-time WPF import be
 * covered by `bun test` on any OS -- and those three are exactly where a settings layer loses a
 * user's configuration.
 *
 * ## The file we write is NOT the file we read on first run
 *
 * Ours is camelCase and holds 41 fields (`core/settings.ts`). The WPF one is PascalCase, holds 47,
 * and stores enums as ordinals. `settings-import.ts` translates one into the other exactly once --
 * on the first launch that finds no file of our own. There is no version stamp and no "imported"
 * flag: **the existence of our own file IS the marker.** A flag would be a second source of truth
 * about the same fact, and the failure mode of the two disagreeing is importing over a user's
 * settings.
 *
 * ## Atomic writes
 *
 * `writeFileSync` to the real path truncates first, so a crash mid-write leaves a zero-length or
 * half-written file -- and the WPF app's own `Load()` answers that by discarding EVERY setting and
 * returning defaults. Write to a sibling temp file and `renameSync` over the target instead: rename
 * within a directory is atomic on NTFS, APFS and ext4, so a reader sees either the old file or the
 * new one. The WPF original does not do this; it is a fix, not a translation.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { DisplayGeometry } from "../core/display-key.js"
import type { ImportReport } from "../core/settings-import.js"
import { importWpfSettings, parseWpfSettingsJson } from "../core/settings-import.js"
import type { AppSettings, SettingsInput } from "../core/settings.js"
import { DEFAULTS, validateSettings } from "../core/settings.js"

/** Our own file, inside `app.getPath("userData")`. */
export const SETTINGS_FILENAME = "settings.json"

/**
 * Where the WPF app keeps its settings, or null if this platform never ran it.
 *
 * `%LOCALAPPDATA%\FuzzyClock\settings.json` -- `SettingsService.cs` builds it from
 * `Environment.SpecialFolder.LocalApplicationData`. Windows only: FuzzyClock v4 is a WPF app, so
 * there is nothing to import from on macOS or Linux, and inventing a plausible path there would be a
 * migration that can only ever find garbage.
 *
 * `env` and `platform` are arguments rather than reads of `process` so the resolution itself is
 * testable -- including the case where `LOCALAPPDATA` is unset, which is a real service-account
 * configuration and would otherwise produce the path `"undefined\FuzzyClock\settings.json"`.
 */
export function legacyWpfSettingsPath(
  env: Record<string, string | undefined> = process.env,
  platform: string = process.platform,
): string | null {
  if (platform !== "win32") return null
  const localAppData = env["LOCALAPPDATA"]
  if (localAppData === undefined || localAppData.trim() === "") return null
  return join(localAppData, "FuzzyClock", SETTINGS_FILENAME)
}

/** How `load()` arrived at what it returned. Logged, and shown in the import report. */
export type LoadOrigin =
  | "own-file"
  /** Our file existed but could not be read or parsed -- defaults, and the file is left alone. */
  | "own-file-unreadable"
  | "wpf-import"
  /** The WPF file existed but was unreadable -- defaults rather than a partial import. */
  | "wpf-unreadable"
  | "defaults"

export interface LoadResult {
  readonly settings: AppSettings
  readonly origin: LoadOrigin
  /** Only present when `origin` is `"wpf-import"`. The caller logs it; nothing branches on it. */
  readonly importReport: ImportReport | null
}

export interface SettingsStoreOptions {
  readonly userDataDir: string
  /** Current displays, for the import's geometry matching. Empty is valid -- every position drops. */
  readonly displays: readonly DisplayGeometry[]
  /** Absolute path to the WPF file. `null` disables the import entirely. */
  readonly legacyPath?: string | null
  readonly log?: (level: "info" | "warn" | "error", message: string) => void
}

export class SettingsStore {
  private readonly userDataDir: string
  private readonly displays: readonly DisplayGeometry[]
  private readonly legacyPath: string | null
  private readonly log: (level: "info" | "warn" | "error", message: string) => void

  constructor(options: SettingsStoreOptions) {
    this.userDataDir = options.userDataDir
    this.displays = options.displays
    // `=== undefined`, NOT `??`. `??` collapses an explicit `null` into the default, which made the
    // documented "null disables the import" unreachable: passing null still resolved
    // `%LOCALAPPDATA%\FuzzyClock\settings.json`, so on this machine every store test that thought it
    // had opted out was reading Alex's live WPF file and its result depended on his configuration.
    // Caught by `settings-store.test.ts`, which is the reason that file passes `legacyPath` in all 35
    // of its tests rather than relying on the default.
    this.legacyPath = options.legacyPath === undefined ? legacyWpfSettingsPath() : options.legacyPath
    this.log = options.log ?? ((): void => {})
  }

  get path(): string {
    return join(this.userDataDir, SETTINGS_FILENAME)
  }

  /**
   * Read, importing from WPF exactly once if we have nothing of our own.
   *
   * Every failure lands on defaults rather than throwing. A settings file is not worth a startup
   * crash, and the WPF app already established that contract (`Load()`'s bare `catch`) -- so a user
   * whose file went bad sees a reset overlay in both versions, which is a known behaviour rather
   * than a new one.
   */
  load(): LoadResult {
    if (existsSync(this.path)) {
      try {
        const text = readFileSync(this.path, "utf8")
        const parsed: unknown = JSON.parse(text)
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          this.log("warn", `settings: ${this.path} is not an object -- using defaults`)
          return { settings: DEFAULTS, origin: "own-file-unreadable", importReport: null }
        }
        return {
          settings: validateSettings(parsed as SettingsInput),
          origin: "own-file",
          importReport: null,
        }
      } catch (err) {
        // Left on disk on purpose. Overwriting it on the next save is the user's own action; deleting
        // it here would destroy the only copy of a file that a human might still be able to repair.
        this.log("warn", `settings: ${this.path} unreadable (${String(err)}) -- using defaults`)
        return { settings: DEFAULTS, origin: "own-file-unreadable", importReport: null }
      }
    }

    if (this.legacyPath !== null && existsSync(this.legacyPath)) {
      let text: string
      try {
        text = readFileSync(this.legacyPath, "utf8")
      } catch (err) {
        this.log("warn", `settings: WPF file at ${this.legacyPath} unreadable (${String(err)})`)
        return { settings: DEFAULTS, origin: "wpf-unreadable", importReport: null }
      }
      const raw = parseWpfSettingsJson(text)
      if (raw === null) {
        this.log("warn", `settings: WPF file at ${this.legacyPath} is not a JSON object`)
        return { settings: DEFAULTS, origin: "wpf-unreadable", importReport: null }
      }
      const { settings, report } = importWpfSettings(raw, this.displays)
      this.log(
        "info",
        `settings: imported from ${this.legacyPath} -- ` +
          `${String(report.importedPositions.length)} position(s) re-keyed, ` +
          `${String(report.droppedPositions.length)} dropped, ` +
          `${String(report.ignoredKeys.length)} key(s) ignored, ` +
          `${String(report.unknownKeys.length)} unrecognised`,
      )
      // NOT written back here. The caller saves once the window has been placed, so the first file we
      // write already carries a monitor key that resolves -- and if the import turns out to be wrong,
      // the WPF file is still the only copy and is still untouched.
      return { settings, origin: "wpf-import", importReport: report }
    }

    return { settings: DEFAULTS, origin: "defaults", importReport: null }
  }

  /**
   * Write, atomically. Returns false on failure rather than throwing.
   *
   * A failed save must not take the app down: the overlay is still perfectly usable, and the next
   * save may well succeed (a virus scanner holding the file for a moment is the common case).
   */
  save(settings: AppSettings): boolean {
    const temp = `${this.path}.tmp`
    try {
      mkdirSync(this.userDataDir, { recursive: true })
      writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`, "utf8")
      renameSync(temp, this.path)
      return true
    } catch (err) {
      this.log("error", `settings: save to ${this.path} failed: ${String(err)}`)
      // Best-effort cleanup. A stale `.tmp` is harmless -- nothing reads it -- but leaving one per
      // failed save in the user data directory is litter.
      try {
        if (existsSync(temp)) unlinkSync(temp)
      } catch {
        // Nothing useful to do, and the real error is already logged.
      }
      return false
    }
  }
}
