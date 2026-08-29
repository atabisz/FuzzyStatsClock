/**
 * The settings record and its validation guards, ported from FuzzyClock.App/AppSettings.cs and the
 * pure half of FuzzyClock.App/SettingsService.cs (`Validate`, `Defaults`).
 *
 * Two C# files in one module, for the same reason `digit-size.ts` merges two: `AppSettings` is a bare
 * record and `Validate` is the only thing that gives its fields meaning. Provenance is per-function.
 *
 * ## Field names are camelCase here, PascalCase on the WPF wire
 *
 * The Electron app owns its own file at `app.getPath('userData')/settings.json` and writes camelCase,
 * because that is what every other module in `src/` reads. `%LOCALAPPDATA%\FuzzyClock\settings.json`
 * is a *foreign* format that gets read exactly once, by `settings-import.ts`. Keeping the two shapes
 * separate is what stops the import from being a permanent tax on every reader.
 *
 * ## Enums that WPF stores as ORDINALS become names here
 *
 * `System.Text.Json` writes a C# enum as its integer value, so Alex's live file holds `"ClockType": 1`
 * and `"LcdSize": 0` -- measured, and confirmed by serialising `Defaults()` back out. This port stores
 * them by NAME (`"dial"`, `"small"`), because an ordinal in a config file is a number nobody can read
 * and a declaration-order change silently repoints. The ordinals only appear at the import boundary,
 * where `clockTypeFromOrdinal` / `lcdSizeFromOrdinal` decode them.
 *
 * ## Six keys from the WPF file are deliberately dropped, not ported
 *
 * `TempsLineVisible`, `TempCpuVisible`, `TempGpuVisible`, `TempMoboVisible`, `TempNvmeVisible` retire
 * with Option C (no temperature telemetry in the Electron port -- Alex's decision, "C, drop temps").
 * `SoftwareRenderingEnabled` names a WPF `RenderMode.SoftwareOnly` fix for a bug class this port does
 * not have: WPF's layered-window GPU path can drop the glyph layer under pressure. Electron's nearest
 * equivalent is `app.disableHardwareAcceleration()`, which would defeat ISC-22 and ISC-26 outright --
 * those claims require the *compositor* to own the fade. Porting the key with its `true` default would
 * therefore ship an app that disables the mechanism two later claims are built on. It is an ignored
 * key on import, and `settings-import.ts` reports it as one rather than swallowing it.
 *
 * ## Provenance for every expectation in `test/settings.test.ts`
 *
 * `fcappprobe.exe settings` -- a throwaway console project that `<Compile Include>`s AppSettings.cs,
 * ClockType.cs, MonitorService.cs, ScreenDpi.cs and SettingsService.cs into its own assembly, so
 * `Validate`, `Defaults`, `Clamp` and `JsonSerializer.Deserialize<AppSettings>` are the REAL ones.
 * Doubles printed `G17`. It calls neither `Load()` nor `Save()`: `Save()` writes Alex's live file.
 */

import { roundHalfToEven } from "./contrast.js"
import type { DateFormatName } from "./date.js"
import type { LcdSize } from "./digit-size.js"
import { lcdSizeFromOrdinal } from "./digit-size.js"

/** `enum ClockType { Phrase, Dial, Lcd, Nixie }` -- names, per the module header. */
export type ClockType = "phrase" | "dial" | "lcd" | "nixie"

/** Declaration order from ClockType.cs, which is what a WPF settings file stores. */
const CLOCK_TYPE_ORDINALS: readonly ClockType[] = ["phrase", "dial", "lcd", "nixie"]

/**
 * Decodes the integer a WPF settings file holds -- `"ClockType": 1` is `Dial`, measured.
 *
 * Returns null for an unknown value rather than defaulting, so the caller owns the fallback. Note
 * what the C# does here instead: an out-of-range ordinal deserialises to `(ClockType)7` and flows on
 * as a value no `switch` arm matches. That is a divergence this port keeps, deliberately.
 */
export function clockTypeFromOrdinal(ordinal: number): ClockType | null {
  return CLOCK_TYPE_ORDINALS[ordinal] ?? null
}

/** `SettingsService.cs:101` -- the only four `TextStyle` values that survive validation. */
export const TEXT_STYLES = ["Classic", "Split", "Literary", "Mono"] as const
export type TextStyleName = (typeof TEXT_STYLES)[number]

/** `SettingsService.cs:110-112` -- ten phrase styles. */
export const PHRASE_STYLES = [
  "Classic",
  "Terse",
  "Poetic",
  "Rude",
  "Pirate",
  "Dwarf",
  "Jive",
  "ValleyGirl",
  "Yoda",
  "Shakespeare",
] as const
export type PhraseStyleName = (typeof PHRASE_STYLES)[number]

/** `SettingsService.cs:116` -- three LCD skins. */
export const LCD_STYLES = ["Dark", "Paper", "Silver"] as const
export type LcdStyleName = (typeof LCD_STYLES)[number]

/** `SettingsService.cs:105` -- the same four `date.ts` accepts, and it owns the type. */
export const DATE_FORMATS = ["Short", "Long", "Numeric", "ISO"] as const

/** `SettingsService.cs:93` / `:97` -- ladder values, not ranges. */
export const PROCESS_COUNT_THRESHOLDS = [2.0, 5.0, 10.0] as const
export const BATTERY_ALERT_THRESHOLDS = [10, 15, 20] as const

/** PROX-06: the settable fade radius, in px. Outside this, `Validate` snaps to the default. */
export const FADE_RADIUS_MIN_PX = 20
export const FADE_RADIUS_MAX_PX = 200

/** `record MonitorPosition` -- `Left`/`Top` doubles, in DIPs. */
export interface MonitorPosition {
  readonly left: number
  readonly top: number
}

/**
 * `record AppSettings`, minus the six keys the module header explains away.
 *
 * `phraseWrapStyle` is `string` rather than a union because `Validate` does not guard it -- the C#
 * lets an unknown value through and `phrase-wrap.ts` falls back at use. Typing it tighter here would
 * claim a guarantee no code provides.
 */
export interface AppSettings {
  readonly monitorPositions: Readonly<Record<string, MonitorPosition>>
  readonly lastActiveMonitor: string
  readonly fontSize: number
  readonly statsVisible: boolean
  readonly statsIntervalSeconds: number
  readonly cpuVisible: boolean
  readonly gpuVisible: boolean
  readonly memVisible: boolean
  readonly pagVisible: boolean
  readonly batteryVisible: boolean
  readonly uptimeVisible: boolean
  readonly showHourTicks: boolean
  readonly showMinuteDots: boolean
  readonly showHourNumbers: boolean
  readonly clockType: ClockType
  readonly lcdUse24Hr: boolean
  readonly lcdShowSeconds: boolean
  readonly lcdStyle: LcdStyleName
  readonly lcdSize: LcdSize
  readonly accentColor: string
  readonly opacity: number
  readonly ghostModeEnabled: boolean
  readonly autoLaunchEnabled: boolean
  readonly autoContrastEnabled: boolean
  readonly processCountThresholdPercent: number
  readonly textStyle: TextStyleName
  readonly phraseStyle: PhraseStyleName
  readonly phraseLocale: string
  readonly showDate: boolean
  readonly dateFormat: DateFormatName
  readonly batteryAlertThresholdPercent: number
  readonly phraseWrapEnabled: boolean
  readonly phraseWrapStyle: string
  readonly backdropAlwaysVisible: boolean
  readonly backdropOpacityPercent: number
  readonly ghostFadeRadiusPx: number
  readonly useCtrl: boolean
  readonly useAlt: boolean
  readonly useShift: boolean
  readonly useWin: boolean
  readonly updateChecksEnabled: boolean
}

/**
 * What a settings file on disk is allowed to look like: any field absent, or present and wrong.
 *
 * A hand-edited file is the case both this and the C# exist for, and `unknown` per field is the only
 * honest type for one. `validateSettings` is therefore also the parser -- see its own note on the one
 * place that behaviour diverges from `SettingsService.Load()`.
 */
export type SettingsInput = {
  readonly [K in keyof AppSettings]?: unknown
}

/**
 * `SettingsService.Defaults()`, field for field as the probe printed it, with the six dropped keys
 * absent and the two enums as names (`Phrase(0)` -> `"phrase"`, `Medium(1)` -> `"medium"`).
 *
 * `lastActiveMonitor: ""` is load-bearing, not an empty initialiser: it is the sentinel for "no saved
 * monitor -- position top-right on the primary", stated as such in AppSettings.cs:81.
 */
export const DEFAULTS: AppSettings = {
  monitorPositions: {},
  lastActiveMonitor: "",
  fontSize: 32,
  statsVisible: false,
  statsIntervalSeconds: 2.0,
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
  opacity: 1.0,
  ghostModeEnabled: true,
  autoLaunchEnabled: false,
  autoContrastEnabled: false,
  processCountThresholdPercent: 5.0,
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
}

/**
 * `Math.Round(value, 1)` -- and the naive port of it is WRONG on real inputs.
 *
 * .NET scales by 10, rounds to nearest with ties-to-EVEN, then divides. JavaScript's `Math.round`
 * breaks a tie upward, and the disagreement is not hypothetical: measured on the C#, `2.25 -> 2.2`,
 * `1.25 -> 1.2`, `3.25 -> 3.2` and `6.25 -> 6.2`, where `Math.round(x * 10) / 10` gives 2.3, 1.3, 3.3
 * and 6.3. Those are settable stats intervals, not contrived values.
 *
 * The scale-then-round order matters as much as the tie rule. `2.55 * 10` is *exactly* 25.5 as a
 * double, so the tie is reached by the multiply and then resolved upward to even 26 -- giving 2.6,
 * which is what the C# prints. `1.05 * 10` is exactly 10.5 and resolves DOWN to even 10, giving 1.0.
 * Same rule, opposite direction, and neither is what decimal arithmetic would say.
 */
export function roundToOneDecimal(value: number): number {
  return roundHalfToEven(value * 10) / 10
}

/** `string.IsNullOrWhiteSpace` over an `unknown`: not a string, or nothing but space. */
function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === ""
}

/** A finite number, or nothing usable. NaN and Infinity are what a hand-edited file produces. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function oneOf<T extends string>(value: unknown, valid: readonly T[], fallback: T): T {
  return !isBlank(value) && (valid as readonly string[]).includes(value as string)
    ? (value as T)
    : fallback
}

/**
 * Decodes a persisted enum that may arrive as this port's NAME or as WPF's ORDINAL.
 *
 * Both directions in one place because the Electron file writes names while an imported WPF file
 * carries numbers, and a file written by a mid-upgrade build could hold either.
 */
function enumValue<T extends string>(
  value: unknown,
  names: readonly T[],
  fromOrdinal: (ordinal: number) => T | null,
  fallback: T,
): T {
  if (typeof value === "number") return fromOrdinal(value) ?? fallback
  return oneOf(value, names, fallback)
}

function positions(value: unknown): Readonly<Record<string, MonitorPosition>> {
  // The C#'s guard is `MonitorPositions == null -> new()`, for the hand-edited `"MonitorPositions":
  // null` case. This widens it to any non-object, and drops an entry whose Left/Top are not numbers
  // -- in the C# such an entry throws out of `Load()` and costs the user every other setting.
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  const out: Record<string, MonitorPosition> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue
    const left = num((raw as { left?: unknown }).left)
    const top = num((raw as { top?: unknown }).top)
    if (left === null || top === null) continue
    out[key] = { left, top }
  }
  return out
}

/**
 * `SettingsService.Validate`, plus the deserialiser's absent-field defaults.
 *
 * The C# splits these across two steps -- `JsonSerializer.Deserialize<AppSettings>` supplies an init
 * default for every absent field, then `Validate` guards eleven of them -- and the composition is
 * what `Load()` returns. One function here, because `unknown` per field is the only honest input type
 * for a file a user can edit, and a two-step port would need the loose shape anyway.
 *
 * ## The one behavioural divergence, stated rather than buried
 *
 * A field of the wrong TYPE (`"opacity": "half"`) makes `Deserialize` throw, and `Load()`'s
 * `catch { return Defaults(); }` then discards the whole file -- all forty settings, for one bad
 * character. This defaults the offending field alone and keeps the rest. Both are safe; only one
 * loses work the user did.
 */
export function validateSettings(input: SettingsInput): AppSettings {
  const d = DEFAULTS

  // StatsIntervalSeconds: outside [0.5, 10.0] -> the default; inside -> rounded to 1dp.
  // `SettingsService.cs:77-80`. Zero from an absent or corrupted field lands in the first arm.
  const rawInterval = num(input.statsIntervalSeconds) ?? d.statsIntervalSeconds
  const statsIntervalSeconds =
    rawInterval < 0.5 || rawInterval > 10.0 ? d.statsIntervalSeconds : roundToOneDecimal(rawInterval)

  // Opacity <= 0 -> 1.0. `SettingsService.cs:85-86`, guarding the invisible-widget regression: a
  // fully transparent overlay cannot be clicked, so there is no way back without deleting the file.
  // Note the asymmetry, which is the C#'s and is kept: there is no upper guard, so 1.5 survives.
  const rawOpacity = num(input.opacity) ?? d.opacity
  const opacity = rawOpacity <= 0.0 ? d.opacity : rawOpacity

  // GhostFadeRadiusPx outside 20-200 -> 80. `SettingsService.cs:120-121`. A negative radius clamps
  // HIGH, not to zero -- 200px of halo, not none.
  const rawRadius = num(input.ghostFadeRadiusPx) ?? d.ghostFadeRadiusPx
  const ghostFadeRadiusPx =
    rawRadius < FADE_RADIUS_MIN_PX || rawRadius > FADE_RADIUS_MAX_PX ? d.ghostFadeRadiusPx : rawRadius

  const rawThreshold = num(input.processCountThresholdPercent)
  const processCountThresholdPercent =
    rawThreshold !== null && (PROCESS_COUNT_THRESHOLDS as readonly number[]).includes(rawThreshold)
      ? rawThreshold
      : d.processCountThresholdPercent

  const rawAlert = num(input.batteryAlertThresholdPercent)
  const batteryAlertThresholdPercent =
    rawAlert !== null && (BATTERY_ALERT_THRESHOLDS as readonly number[]).includes(rawAlert)
      ? rawAlert
      : d.batteryAlertThresholdPercent

  return {
    monitorPositions: positions(input.monitorPositions),
    lastActiveMonitor: typeof input.lastActiveMonitor === "string" ? input.lastActiveMonitor : d.lastActiveMonitor,
    fontSize: num(input.fontSize) ?? d.fontSize,
    statsVisible: bool(input.statsVisible, d.statsVisible),
    statsIntervalSeconds,
    cpuVisible: bool(input.cpuVisible, d.cpuVisible),
    gpuVisible: bool(input.gpuVisible, d.gpuVisible),
    memVisible: bool(input.memVisible, d.memVisible),
    pagVisible: bool(input.pagVisible, d.pagVisible),
    batteryVisible: bool(input.batteryVisible, d.batteryVisible),
    uptimeVisible: bool(input.uptimeVisible, d.uptimeVisible),
    showHourTicks: bool(input.showHourTicks, d.showHourTicks),
    showMinuteDots: bool(input.showMinuteDots, d.showMinuteDots),
    showHourNumbers: bool(input.showHourNumbers, d.showHourNumbers),
    clockType: enumValue(input.clockType, CLOCK_TYPE_ORDINALS, clockTypeFromOrdinal, d.clockType),
    lcdUse24Hr: bool(input.lcdUse24Hr, d.lcdUse24Hr),
    lcdShowSeconds: bool(input.lcdShowSeconds, d.lcdShowSeconds),
    lcdStyle: oneOf(input.lcdStyle, LCD_STYLES, d.lcdStyle),
    lcdSize: enumValue(input.lcdSize, ["small", "medium", "large"] as const, lcdSizeFromOrdinal, d.lcdSize),
    accentColor: isBlank(input.accentColor) ? d.accentColor : (input.accentColor as string),
    opacity,
    ghostModeEnabled: bool(input.ghostModeEnabled, d.ghostModeEnabled),
    autoLaunchEnabled: bool(input.autoLaunchEnabled, d.autoLaunchEnabled),
    autoContrastEnabled: bool(input.autoContrastEnabled, d.autoContrastEnabled),
    processCountThresholdPercent,
    textStyle: oneOf(input.textStyle, TEXT_STYLES, d.textStyle),
    phraseStyle: oneOf(input.phraseStyle, PHRASE_STYLES, d.phraseStyle),
    phraseLocale: isBlank(input.phraseLocale) ? d.phraseLocale : (input.phraseLocale as string),
    showDate: bool(input.showDate, d.showDate),
    dateFormat: oneOf(input.dateFormat, DATE_FORMATS, d.dateFormat),
    batteryAlertThresholdPercent,
    phraseWrapEnabled: bool(input.phraseWrapEnabled, d.phraseWrapEnabled),
    phraseWrapStyle: isBlank(input.phraseWrapStyle) ? d.phraseWrapStyle : (input.phraseWrapStyle as string),
    backdropAlwaysVisible: bool(input.backdropAlwaysVisible, d.backdropAlwaysVisible),
    backdropOpacityPercent: num(input.backdropOpacityPercent) ?? d.backdropOpacityPercent,
    ghostFadeRadiusPx,
    useCtrl: bool(input.useCtrl, d.useCtrl),
    useAlt: bool(input.useAlt, d.useAlt),
    useShift: bool(input.useShift, d.useShift),
    useWin: bool(input.useWin, d.useWin),
    updateChecksEnabled: bool(input.updateChecksEnabled, d.updateChecksEnabled),
  }
}
