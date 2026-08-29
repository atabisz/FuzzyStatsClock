/**
 * The one-time import of `%LOCALAPPDATA%\FuzzyClock\settings.json` into the Electron store.
 *
 * Ported from the impure half of `SettingsService.Load()` -- the two legacy migrations and the JSON
 * shape -- with monitor identity re-derived, because the WPF keys cannot be carried across.
 *
 * ## Positions are matched by GEOMETRY, not by key
 *
 * The WPF file keys positions by `MonitorService`'s monitor key. Alex's holds `display6` and
 * `display5`: GDI device indices, reached because the friendly-name lookup failed on his hardware.
 * `display-key.ts` explains at length why neither half of that scheme is portable or stable. So the
 * importer never trusts a stored key. It asks which CURRENT display contains the stored position and
 * re-keys under that display's composite key.
 *
 * Two consequences, both real on his file rather than imagined:
 *
 *   - `display6` at (1620, 20) lands inside his primary LG (0,0 3440x1440), so it imports as
 *     `3440x1440@0,0:1.00 -> (1620, 20)`.
 *   - `display5` at (-227, 510) lands on NO display he owns. It is DROPPED, and the report says so.
 *     Guessing a home for it would restore the widget somewhere he never put it; dropping it means
 *     `placement.ts` falls to first-run placement, which is visible and obviously a fresh start.
 *
 * `LastActiveMonitor` is remapped through the same containment test, so an orphaned position takes
 * the pointer to it with it -- `"display5"` becomes `""`, the sentinel AppSettings.cs documents for
 * "no saved monitor". Carrying the string across would leave a key that resolves to nothing.
 *
 * ## Import happens once, and the marker is our own file's existence
 *
 * No `imported: true` flag, no version stamp. `settings-store.ts` imports only when there is no
 * Electron settings file yet, which is the same condition under which an import can be correct: once
 * the user has changed anything in the Electron app, the WPF file is stale by definition.
 */

import type { AppSettings, MonitorPosition, SettingsInput } from "./settings.js"
import { DEFAULTS, validateSettings } from "./settings.js"
import type { DisplayGeometry } from "./display-key.js"
import { displayKey, findDisplayContaining, primaryDisplay } from "./display-key.js"

/** The six keys deliberately not ported. `settings.ts`'s header carries the reasoning for each. */
export const IGNORED_WPF_KEYS: readonly string[] = [
  "TempsLineVisible",
  "TempCpuVisible",
  "TempGpuVisible",
  "TempMoboVisible",
  "TempNvmeVisible",
  "SoftwareRenderingEnabled",
]

/** Keys the WPF file may carry that are migration INPUTS rather than settings. */
const LEGACY_WPF_KEYS: readonly string[] = ["Left", "Top", "DialMode"]

/** One position, and where it went. */
export interface ImportedPosition {
  readonly wpfKey: string
  readonly displayKey: string
  readonly position: MonitorPosition
}

/** One position that went nowhere, and the position that could not be homed. */
export interface DroppedPosition {
  readonly wpfKey: string
  readonly position: MonitorPosition
}

/**
 * What the import did. Every arm is reported rather than logged-and-forgotten: this runs once, on a
 * user's real data, and if it is wrong the only trace left is a widget in the wrong place.
 */
export interface ImportReport {
  readonly importedPositions: readonly ImportedPosition[]
  readonly droppedPositions: readonly DroppedPosition[]
  /** The WPF `LastActiveMonitor` value read from the file, `""` when absent. */
  readonly requestedActiveMonitor: string
  /** Its composite key after remapping, `""` when it could not be homed. */
  readonly resolvedActiveMonitor: string
  /** Present in the file, intentionally not ported. */
  readonly ignoredKeys: readonly string[]
  /** Present in the file and not recognised at all -- a hand-edit, or a key from a future version. */
  readonly unknownKeys: readonly string[]
  /** The `Left`/`Top` -> `MonitorPositions` migration fired. */
  readonly migratedLegacyPosition: boolean
  /** The `DialMode: true` -> `ClockType.Dial` migration fired. */
  readonly migratedDialMode: boolean
}

export interface ImportResult {
  readonly settings: AppSettings
  readonly report: ImportReport
}

/** Every field name the Electron store understands, taken from DEFAULTS so the two cannot drift. */
const KNOWN_FIELDS = new Set(Object.keys(DEFAULTS))

/** `"MonitorPositions"` -> `"monitorPositions"`. Mechanical for all 44 WPF keys -- checked. */
function camelize(key: string): string {
  return key.length === 0 ? key : key[0]!.toLowerCase() + key.slice(1)
}

/** `JSON.parse`, returning null instead of throwing -- `Load()`'s `catch { return Defaults(); }`. */
export function parseWpfSettingsJson(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function readPosition(raw: unknown): MonitorPosition | null {
  if (typeof raw !== "object" || raw === null) return null
  const left = (raw as { Left?: unknown }).Left
  const top = (raw as { Top?: unknown }).Top
  if (typeof left !== "number" || typeof top !== "number") return null
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null
  return { left, top }
}

/**
 * Reads a WPF settings object and produces validated Electron settings plus a report.
 *
 * The order matters and mirrors `Load()`: shape translation, then the legacy `Left`/`Top` migration
 * (which REPLACES the position map wholesale), then the `DialMode` migration, then `validateSettings`
 * last so a migrated value is guarded like any other.
 */
export function importWpfSettings(raw: Record<string, unknown>, displays: readonly DisplayGeometry[]): ImportResult {
  const input: Record<string, unknown> = {}
  const ignoredKeys: string[] = []
  const unknownKeys: string[] = []

  for (const [wpfKey, value] of Object.entries(raw)) {
    if (IGNORED_WPF_KEYS.includes(wpfKey)) {
      ignoredKeys.push(wpfKey)
      continue
    }
    if (LEGACY_WPF_KEYS.includes(wpfKey)) continue // handled below, not a field
    const field = camelize(wpfKey)
    if (!KNOWN_FIELDS.has(field)) {
      unknownKeys.push(wpfKey)
      continue
    }
    input[field] = value
  }

  // -- positions, by geometry -------------------------------------------------------------------
  const importedPositions: ImportedPosition[] = []
  const droppedPositions: DroppedPosition[] = []
  const positions: Record<string, MonitorPosition> = {}

  const rawPositions = raw["MonitorPositions"]
  if (typeof rawPositions === "object" && rawPositions !== null && !Array.isArray(rawPositions)) {
    for (const [wpfKey, rawPos] of Object.entries(rawPositions as Record<string, unknown>)) {
      const position = readPosition(rawPos)
      if (position === null) continue
      const host = findDisplayContaining(position, displays)
      if (host === null) {
        droppedPositions.push({ wpfKey, position })
        continue
      }
      const key = displayKey(host)
      // Two WPF keys can land on one display -- his two LG panels report the same name, and a
      // re-arrange can move one onto the other's old area. Last write wins, matching the order
      // `Object.entries` yields, which is the file's own key order.
      positions[key] = position
      importedPositions.push({ wpfKey, displayKey: key, position })
    }
  }
  input["monitorPositions"] = positions

  // -- LastActiveMonitor, remapped through the same containment test ------------------------------
  const requestedActiveMonitor = typeof raw["LastActiveMonitor"] === "string" ? (raw["LastActiveMonitor"] as string) : ""
  const activeMatch = importedPositions.find((p) => p.wpfKey === requestedActiveMonitor)
  let resolvedActiveMonitor = activeMatch?.displayKey ?? ""
  input["lastActiveMonitor"] = resolvedActiveMonitor

  // -- legacy Left/Top -> MonitorPositions -------------------------------------------------------
  // `Load()`: only when `Left` is present, `MonitorPositions` is ABSENT, and Left != -1 (the old
  // sentinel for "no saved position"). It replaces the whole map rather than adding to it.
  //
  // One divergence, and it is a bug fix rather than a choice: the C# reads `Top` with
  // `GetProperty("Top")`, which throws when a file has `Left` but not `Top` -- and `Load()`'s catch
  // then discards every other setting in the file. This treats a missing `Top` as no migration.
  let migratedLegacyPosition = false
  const legacyLeft = raw["Left"]
  const legacyTop = raw["Top"]
  if (
    typeof legacyLeft === "number" &&
    raw["MonitorPositions"] === undefined &&
    legacyLeft !== -1 &&
    typeof legacyTop === "number"
  ) {
    const legacyPosition: MonitorPosition = { left: legacyLeft, top: legacyTop }
    // The C# keys this under the PRIMARY monitor, not under whichever monitor contains the point.
    // Faithful: a pre-multi-monitor file's position was necessarily on the primary.
    const primary = primaryDisplay(displays)
    if (primary !== null) {
      const key = displayKey(primary)
      input["monitorPositions"] = { [key]: legacyPosition }
      resolvedActiveMonitor = key
      input["lastActiveMonitor"] = key
      migratedLegacyPosition = true
    }
  }

  // -- legacy DialMode -> ClockType --------------------------------------------------------------
  // `Load()`: only when the new `ClockType` field left the value at Phrase. `DialMode: false` is a
  // no-op because Phrase is already the default.
  let migratedDialMode = false
  if (raw["DialMode"] === true && (raw["ClockType"] === undefined || raw["ClockType"] === 0)) {
    input["clockType"] = "dial"
    migratedDialMode = true
  }

  return {
    settings: validateSettings(input as SettingsInput),
    report: {
      importedPositions,
      droppedPositions,
      requestedActiveMonitor,
      resolvedActiveMonitor,
      ignoredKeys,
      unknownKeys,
      migratedLegacyPosition,
      migratedDialMode,
    },
  }
}
