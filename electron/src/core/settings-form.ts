/**
 * The settings window as pure data, ported from `FuzzyClock.App/SettingsWindow.xaml` (521 lines of XAML)
 * and `SettingsWindow.xaml.cs` (779 lines of code-behind).
 *
 * Two functions and a pile of tables. {@link buildSettingsForm} is `PopulateControls` +
 * `SetFontSizeButtonStates` + `SetClockStyleButtonStates` + `SetActiveSwatch` — everything the C# does to
 * *reflect* settings into controls — and {@link applySettingsEdit} is the 34 `event Action<T>?` handlers,
 * collapsed into one reducer. Neither touches a DOM or an Electron API, so `bun test` covers the whole of
 * the window's behaviour on any OS and the renderer that consumes this is a generic interpreter.
 *
 * ## Why a data model rather than hand-written HTML with 35 listeners
 *
 * The C# pays for its 35 controls three times: once in XAML, once in `PopulateControls`, once in a handler
 * each. The third copy is where its one real inconsistency lives (see `isStyleSupported` below), and the
 * second is where a new setting gets forgotten. Here the tables below are the single copy, and
 * `test/settings-form.test.ts` asserts that every editable field appears in the form exactly once and that
 * every control's id round-trips through the reducer.
 *
 * ## What this window does NOT edit, and why that is the exit bar
 *
 * `AppSettings` has 41 fields; this form exposes **35**. The six absent ones are absent from
 * `SettingsWindow.xaml` too: `monitorPositions` and `lastActiveMonitor` are placement bookkeeping,
 * `lcdSize` and `textStyle` are tray-only in the original, and `backdropAlwaysVisible` /
 * `backdropOpacityPercent` are referenced by no XAML anywhere in `FuzzyClock.App` (see
 * `src/renderer/index.html`'s note — the original runs them at a hardcoded false/35). The plan's exit
 * criterion is "every setting the WPF window exposes", so those six are out of scope by construction
 * rather than by omission.
 *
 * The Temps tab retires here with Option C, and `ChkSoftwareRendering` retires with it — `core/settings.ts`'s
 * header owns both decisions and the reasons.
 *
 * ## Two deliberate divergences from the original, both recorded rather than silently fixed
 *
 * 1. **`isStyleSupported` is computed one way, and the C# computes it two.** `PopulateControls:166-169`
 *    says `locale == "ja" || locale == "en" || (locale == "auto" && !nonEnglishActive)`, while
 *    `CmbPhraseLanguage_SelectionChanged:499` says `locale is "en" or "ja" or "auto"` for the same fact. So
 *    in the original, picking "Auto" from the dropdown enables the phrase-style combo even on a French UI,
 *    and reopening the window disables it again. This port takes the `PopulateControls` rule — the
 *    idempotent one, the one that survives a reopen, and the one that agrees with
 *    `core/phrase/locale-key.ts`, where an auto-detected `fr` genuinely drops the style. `AUTO_DETECTED_LANGUAGES`
 *    is imported from that module rather than re-listed, so the two cannot drift.
 * 2. **"Auto (detect from Windows)" becomes "Auto (detect from the system)".** The original's label and its
 *    subtitle both name Windows, which is false on two of the three platforms this port ships to. The
 *    mechanism is unchanged — it is still `TwoLetterISOLanguageName`'s counterpart — only the word is.
 *
 * ## Faithful artefacts kept on purpose
 *
 * - `$"{(int)(s.Opacity * 100)}%"` **truncates**, and on three of the ninety-one values the slider can
 *   store that costs a percent: 0.29 reads `28%`, 0.57 reads `56%`, 0.58 reads `57%`. {@link opacityLabel}
 *   uses `Math.trunc` to reproduce it. A `Math.round` here would be nicer numbers and a different app.
 * - A threshold ladder value that matches nothing leaves **every** radio unset (`RbThresh2.IsChecked =
 *   s.ProcessCountThreshold == 2.0` and friends), which is reachable only from a hand-edited file that
 *   `validateSettings` would have snapped — so it is unreachable in practice and modelled anyway, as
 *   `value: null`, because the alternative is inventing a selection the original does not make.
 * - The five metric-row checkboxes are **not** gated on `ChkStatsVisible`. Checked in the XAML: there is no
 *   `IsEnabled` binding on that `WrapPanel`, unlike `TempSensorsPanel` which does have one. So a user can
 *   configure rows with the panel collapsed, and hiding the last row collapses the panel from under them —
 *   which is `core/stats-rows.ts`' auto-collapse, and this reducer is its first caller.
 */

import { roundHalfToEven } from "./contrast.js"
import { formatAccentColor, parseAccentColor } from "./display-colors.js"
import { AUTO_DETECTED_LANGUAGES } from "./phrase/locale-key.js"
import { setStatRowVisible, setUptimeRowVisible } from "./stats-rows.js"
import type { StatsRowKey } from "./layout.js"
import {
  BATTERY_ALERT_THRESHOLDS,
  DATE_FORMATS,
  FADE_RADIUS_MAX_PX,
  FADE_RADIUS_MIN_PX,
  LCD_STYLES,
  PHRASE_STYLES,
  PROCESS_COUNT_THRESHOLDS,
  roundToOneDecimal,
  validateSettings,
  type AppSettings,
} from "./settings.js"

// ---------------------------------------------------------------------------------------------------
// The window itself
// ---------------------------------------------------------------------------------------------------

/**
 * `Width="480" Height="600" ResizeMode="NoResize"` from `SettingsWindow.xaml:5-7`.
 *
 * Here rather than in `main/settings-window.ts` so the numbers are testable and so the one place they are
 * authored is the one place the port's shape is compared against the original's.
 */
export const SETTINGS_WINDOW_WIDTH = 480
export const SETTINGS_WINDOW_HEIGHT = 600

/** `Title="FuzzyClock Settings"` — `SettingsWindow.xaml:4`. */
export const SETTINGS_WINDOW_TITLE = "FuzzyClock Settings"

// ---------------------------------------------------------------------------------------------------
// Field identity
// ---------------------------------------------------------------------------------------------------

/**
 * Every `AppSettings` field this window can change, and nothing else.
 *
 * `satisfies readonly (keyof AppSettings)[]` is the load-bearing part: a field renamed in
 * `core/settings.ts` fails the typecheck here rather than becoming an edit the reducer silently drops.
 */
export const EDITABLE_FIELDS = [
  // Appearance — 13
  "accentColor",
  "opacity",
  "fontSize",
  "clockType",
  "phraseStyle",
  "phraseWrapEnabled",
  "phraseWrapStyle",
  "showHourTicks",
  "showMinuteDots",
  "showHourNumbers",
  "lcdUse24Hr",
  "lcdShowSeconds",
  "lcdStyle",
  // Stats — 11
  "statsVisible",
  "cpuVisible",
  "gpuVisible",
  "memVisible",
  "pagVisible",
  "batteryVisible",
  "uptimeVisible",
  "statsIntervalSeconds",
  "processCountThresholdPercent",
  "showDate",
  "dateFormat",
  // Behavior — 11
  "phraseLocale",
  "ghostModeEnabled",
  "ghostFadeRadiusPx",
  "useCtrl",
  "useAlt",
  "useShift",
  "useWin",
  "autoContrastEnabled",
  "autoLaunchEnabled",
  "updateChecksEnabled",
  "batteryAlertThresholdPercent",
] as const satisfies readonly (keyof AppSettings)[]

export type EditableField = (typeof EDITABLE_FIELDS)[number]

/** Whether a string off the IPC wire names a field this window owns. */
export function isEditableField(id: string): id is EditableField {
  return (EDITABLE_FIELDS as readonly string[]).includes(id)
}

// ---------------------------------------------------------------------------------------------------
// Control shapes
// ---------------------------------------------------------------------------------------------------

export interface FormOption {
  /** What travels on the wire. Numbers are stringified; the reducer decodes. */
  readonly value: string
  readonly label: string
}

/** One of the five accent presets — `SwatchWhite` … `SwatchPink`, `SettingsWindow.xaml:38-136`. */
export interface AccentPreset {
  readonly id: string
  readonly label: string
  /** `#AARRGGBB`, the shape `formatAccentColor` writes and the C# compares as a `Color`. */
  readonly argb: string
}

export type FormControl =
  /** A bold section header — `Phrase Language`, `Battery Alert`. */
  | { readonly kind: "heading"; readonly text: string }
  /** Muted explanatory text. `#FF999999`, `FontSize="11"`, wrapping. */
  | { readonly kind: "note"; readonly text: string }
  | {
      readonly kind: "swatches"
      readonly id: "accentColor"
      readonly enabled: boolean
      readonly presets: readonly AccentPreset[]
      /** The stored value, normalised to `#AARRGGBB`. */
      readonly value: string
      /** Which preset carries the selection ring, or null for a custom colour — `SetActiveSwatch`. */
      readonly activePreset: string | null
    }
  | {
      readonly kind: "slider"
      readonly id: "opacity" | "statsIntervalSeconds" | "ghostFadeRadiusPx"
      readonly enabled: boolean
      readonly min: number
      readonly max: number
      readonly step: number
      readonly value: number
      /** The adjacent `TextBlock`'s text, formatted exactly as the C# formats it. */
      readonly valueLabel: string
    }
  | {
      readonly kind: "segments"
      readonly id: "fontSize" | "clockType"
      readonly enabled: boolean
      readonly options: readonly FormOption[]
      readonly value: string
    }
  | {
      readonly kind: "select"
      readonly id: "phraseStyle" | "lcdStyle" | "dateFormat" | "phraseLocale"
      readonly enabled: boolean
      /** An inline label to the select's left, as `CmbLcdStyle` has ("Style"). Null for the rest. */
      readonly label: string | null
      readonly options: readonly FormOption[]
      readonly value: string
    }
  | {
      readonly kind: "checkbox"
      readonly id: BooleanField
      readonly enabled: boolean
      readonly label: string
      readonly checked: boolean
    }
  | {
      readonly kind: "radios"
      readonly id: "phraseWrapStyle" | "processCountThresholdPercent" | "batteryAlertThresholdPercent"
      readonly enabled: boolean
      readonly options: readonly FormOption[]
      /** Null when the stored value matches no option — see the header. */
      readonly value: string | null
    }

/**
 * One `Grid` row: a right-aligned label in column 0 and controls in column 1.
 *
 * `visible` is a row property because the two collapsible rows hide their **label and panel together**
 * (`SetClockStyleButtonStates:334-340`), and `enabled` is a *control* property because the gated things —
 * the wrap radios, the phrase-style combo, the fade slider, the four modifier boxes — sit beside
 * ungated siblings in the same row.
 */
export interface FormRow {
  /** Column-0 text, or null for a full-width row. */
  readonly label: string | null
  readonly visible: boolean
  readonly controls: readonly FormControl[]
}

export interface FormTab {
  readonly id: string
  readonly label: string
  readonly rows: readonly FormRow[]
}

export interface SettingsForm {
  readonly tabs: readonly FormTab[]
}

/** The `AppSettings` fields this window edits with a checkbox. Derived, so it cannot drift. */
type BooleanField = Extract<
  EditableField,
  | "phraseWrapEnabled"
  | "showHourTicks"
  | "showMinuteDots"
  | "showHourNumbers"
  | "lcdUse24Hr"
  | "lcdShowSeconds"
  | "statsVisible"
  | "cpuVisible"
  | "gpuVisible"
  | "memVisible"
  | "pagVisible"
  | "batteryVisible"
  | "uptimeVisible"
  | "showDate"
  | "ghostModeEnabled"
  | "useCtrl"
  | "useAlt"
  | "useShift"
  | "useWin"
  | "autoContrastEnabled"
  | "autoLaunchEnabled"
  | "updateChecksEnabled"
>

// ---------------------------------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------------------------------

/** `BtnFontS`/`M`/`L`/`XL` → 16/24/32/40 (`SettingsWindow.xaml.cs:432-457`). */
export const FONT_SIZE_OPTIONS: readonly FormOption[] = [
  { value: "16", label: "S" },
  { value: "24", label: "M" },
  { value: "32", label: "L" },
  { value: "40", label: "XL" },
]

/** The segment rail's order is the XAML's — Phrase, Dial, **Nixie**, LCD. Not `ClockType`'s ordinals. */
export const CLOCK_TYPE_OPTIONS: readonly FormOption[] = [
  { value: "phrase", label: "Phrase" },
  { value: "dial", label: "Dial" },
  { value: "nixie", label: "Nixie" },
  { value: "lcd", label: "LCD" },
]

/**
 * `CmbPhraseStyle`'s ten items in the order the XAML lists them.
 *
 * Deliberately NOT `PHRASE_STYLES` from `core/settings.ts`: that array is `SettingsService.cs:110-112`'s
 * *validation* order, which has Pirate before Dwarf, and the combo lists Jive, Pirate, Dwarf. Same ten
 * names, different sequence, and the combo's is what a user sees. Both are asserted in the test as a set
 * so a name added to one and not the other fails.
 */
export const PHRASE_STYLE_OPTIONS: readonly FormOption[] = [
  { value: "Classic", label: "Classic" },
  { value: "Terse", label: "Terse" },
  { value: "Poetic", label: "Poetic" },
  { value: "Rude", label: "Rude" },
  { value: "Jive", label: "Jive" },
  { value: "Pirate", label: "Pirate" },
  { value: "Dwarf", label: "Dwarf" },
  { value: "ValleyGirl", label: "ValleyGirl" },
  { value: "Yoda", label: "Yoda" },
  { value: "Shakespeare", label: "Shakespeare" },
]

/** `CmbPhraseLanguage`'s seven `Tag` values. Divergence 2 in the header owns the first label. */
export const PHRASE_LOCALE_OPTIONS: readonly FormOption[] = [
  { value: "auto", label: "Auto (detect from the system)" },
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "pl", label: "Polish" },
]

/** `RbWrapMidpoint` / `RbWrapNatural`, whose values are what `core/phrase-wrap.ts` reads. */
export const WRAP_STYLE_OPTIONS: readonly FormOption[] = [
  { value: "midpoint", label: "Nearest Midpoint" },
  { value: "natural", label: "Natural Pause" },
]

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: "white", label: "White", argb: "#FFFFFFFF" },
  { id: "amber", label: "Amber", argb: "#FFFFC000" },
  { id: "ice", label: "Ice", argb: "#FF87CEEB" },
  { id: "green", label: "Green", argb: "#FF00C000" },
  { id: "pink", label: "Pink", argb: "#FFFF69B4" },
]

/** `SetActiveSwatch`'s ring colour, `Color.FromRgb(0x00, 0x78, 0xD4)` (`:347`). */
export const ACCENT_RING_COLOR = "#0078D4"

// ---------------------------------------------------------------------------------------------------
// Label formats
// ---------------------------------------------------------------------------------------------------

/**
 * `$"{(int)(s.Opacity * 100)}%"` — and the cast truncates, which is visible at three real settings.
 *
 * All ninety-one values the slider can store were enumerated rather than reasoned about, because the
 * obvious candidates are not the ones that bite: `0.35 * 100` is *exactly* 35 as a double, and so are 0.7
 * and 0.95. The three that land a hair low are **0.29** (28.999999999999996), **0.57** (56.99999999999999)
 * and **0.58** (57.99999999999999), so those read a percent light — in this port and in the original alike,
 * since C# doubles are the same IEEE-754 doubles. Reproduced rather than corrected: the label and the
 * stored value are separate facts, and only the label is off.
 */
export function opacityLabel(opacity: number): string {
  return `${String(Math.trunc(opacity * 100))}%`
}

/** `$"{s.StatsIntervalSeconds:F1}s"`. The stored value is already 1dp — `validateSettings` rounds it. */
export function statsIntervalLabel(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}

/** `$"{s.GhostFadeRadiusPx} px"` — with the space, which is the original's. */
export function fadeRadiusLabel(px: number): string {
  return `${String(px)} px`
}

/**
 * `Math.Round(value, 2)` for the opacity slider — ties to EVEN, like every other rounding in this port.
 *
 * Local rather than exported from `core/settings.ts` beside `roundToOneDecimal` because nothing else needs
 * it: the settings *file* has no 2dp field, only this one slider handler does. The reasoning for why
 * `Math.round(x * 100) / 100` is wrong is `roundToOneDecimal`'s, unchanged at a different scale.
 */
function roundToTwoDecimals(value: number): number {
  return roundHalfToEven(value * 100) / 100
}

// ---------------------------------------------------------------------------------------------------
// Gating rules
// ---------------------------------------------------------------------------------------------------

/**
 * `PopulateControls:166-169` — whether the phrase-style combo is live.
 *
 * Style tables exist for English and Japanese only. An explicit `en` or `ja` always qualifies; `auto`
 * qualifies only when the UI language is not one the auto-detector would claim, because in that case
 * `resolveLocaleKey` returns the bare base locale and discards the style entirely.
 *
 * Note what this does with an unrecognised `phraseLocale` (a hand-edited `"xx"`): **false**, where
 * `resolveLocaleKey` treats the same value as `auto` and does consult the style. That asymmetry is the
 * C#'s — its condition tests `== "auto"` literally — and it is kept, because a disabled combo on a
 * corrupt locale is the harmless direction and `validateSettings` does not guard this field.
 *
 * @param uiLanguage two-letter UI language, `app.getLocale()`'s prefix in the port.
 */
export function phraseStyleSupported(phraseLocale: string, uiLanguage: string): boolean {
  if (phraseLocale === "ja" || phraseLocale === "en") return true
  return phraseLocale === "auto" && !AUTO_DETECTED_LANGUAGES.includes(uiLanguage)
}

// ---------------------------------------------------------------------------------------------------
// buildSettingsForm
// ---------------------------------------------------------------------------------------------------

function checkbox(
  id: BooleanField,
  label: string,
  checked: boolean,
  enabled = true,
): FormControl {
  return { kind: "checkbox", id, label, checked, enabled }
}

/** The stored accent, normalised, plus which preset ring it lights. `PopulateControls:260-269`. */
function accentControl(accentColor: string): FormControl {
  const value = formatAccentColor(parseAccentColor(accentColor))
  const match = ACCENT_PRESETS.find((preset) => preset.argb === value)
  return {
    kind: "swatches",
    id: "accentColor",
    enabled: true,
    presets: ACCENT_PRESETS,
    value,
    activePreset: match?.id ?? null,
  }
}

function appearanceTab(s: AppSettings, uiLanguage: string): FormTab {
  const styleEnabled = phraseStyleSupported(s.phraseLocale, uiLanguage)
  return {
    id: "appearance",
    label: "Appearance",
    rows: [
      { label: null, visible: true, controls: [accentControl(s.accentColor)] },
      {
        label: "Opacity",
        visible: true,
        controls: [
          {
            kind: "slider",
            id: "opacity",
            enabled: true,
            min: 0.1,
            max: 1.0,
            step: 0.01,
            value: s.opacity,
            valueLabel: opacityLabel(s.opacity),
          },
        ],
      },
      {
        label: "Font Size",
        visible: true,
        controls: [
          {
            kind: "segments",
            id: "fontSize",
            enabled: true,
            options: FONT_SIZE_OPTIONS,
            value: String(s.fontSize),
          },
        ],
      },
      {
        label: "Clock Style",
        visible: true,
        controls: [
          {
            kind: "segments",
            id: "clockType",
            enabled: true,
            options: CLOCK_TYPE_OPTIONS,
            value: s.clockType,
          },
        ],
      },
      {
        label: "Phrase Style",
        visible: true,
        controls: [
          {
            kind: "select",
            id: "phraseStyle",
            enabled: styleEnabled,
            label: null,
            options: PHRASE_STYLE_OPTIONS,
            value: s.phraseStyle,
          },
        ],
      },
      {
        label: "Phrase Wrap",
        visible: true,
        controls: [
          checkbox("phraseWrapEnabled", "Wrap long phrases", s.phraseWrapEnabled),
          {
            kind: "radios",
            id: "phraseWrapStyle",
            // `WrapStylePanel.IsEnabled = s.PhraseWrapEnabled` (`PopulateControls:236`).
            enabled: s.phraseWrapEnabled,
            options: WRAP_STYLE_OPTIONS,
            value: WRAP_STYLE_OPTIONS.some((o) => o.value === s.phraseWrapStyle) ? s.phraseWrapStyle : null,
          },
        ],
      },
      {
        label: "Dial Face",
        // `SetClockStyleButtonStates:334-336`. Collapsed, not disabled.
        visible: s.clockType === "dial",
        controls: [
          checkbox("showHourTicks", "Hour Ticks", s.showHourTicks),
          checkbox("showMinuteDots", "Minute Dots", s.showMinuteDots),
          checkbox("showHourNumbers", "Hour Numbers", s.showHourNumbers),
        ],
      },
      {
        label: "LCD Options",
        // `SetClockStyleButtonStates:338-341`.
        visible: s.clockType === "lcd",
        controls: [
          checkbox("lcdUse24Hr", "24-hour display", s.lcdUse24Hr),
          checkbox("lcdShowSeconds", "Show seconds", s.lcdShowSeconds),
          {
            kind: "select",
            id: "lcdStyle",
            enabled: true,
            label: "Style",
            options: LCD_STYLES.map((name) => ({ value: name, label: name })),
            value: s.lcdStyle,
          },
        ],
      },
    ],
  }
}

function statsTab(s: AppSettings): FormTab {
  return {
    id: "stats",
    label: "Stats",
    rows: [
      {
        label: null,
        visible: true,
        controls: [checkbox("statsVisible", "Show Stats Panel", s.statsVisible)],
      },
      {
        label: "Rows",
        visible: true,
        // Ungated on `statsVisible` — see the header. Order and labels are the `WrapPanel`'s.
        controls: [
          checkbox("cpuVisible", "CPU", s.cpuVisible),
          checkbox("gpuVisible", "GPU", s.gpuVisible),
          checkbox("memVisible", "Memory", s.memVisible),
          checkbox("pagVisible", "Paging", s.pagVisible),
          checkbox("batteryVisible", "Battery", s.batteryVisible),
          checkbox("uptimeVisible", "Uptime", s.uptimeVisible),
        ],
      },
      {
        label: "Interval",
        visible: true,
        controls: [
          {
            kind: "slider",
            id: "statsIntervalSeconds",
            enabled: true,
            min: 0.5,
            max: 10.0,
            step: 0.1,
            value: s.statsIntervalSeconds,
            valueLabel: statsIntervalLabel(s.statsIntervalSeconds),
          },
        ],
      },
      {
        label: "Threshold",
        visible: true,
        controls: [
          {
            kind: "radios",
            id: "processCountThresholdPercent",
            enabled: true,
            options: PROCESS_COUNT_THRESHOLDS.map((pct) => ({
              value: String(pct),
              label: `${String(pct)}%`,
            })),
            value: (PROCESS_COUNT_THRESHOLDS as readonly number[]).includes(s.processCountThresholdPercent)
              ? String(s.processCountThresholdPercent)
              : null,
          },
        ],
      },
      { label: null, visible: true, controls: [checkbox("showDate", "Show Date", s.showDate)] },
      {
        label: "Date Format",
        visible: true,
        controls: [
          {
            kind: "select",
            id: "dateFormat",
            enabled: true,
            label: null,
            options: DATE_FORMATS.map((name) => ({ value: name, label: name })),
            value: s.dateFormat,
          },
        ],
      },
    ],
  }
}

function behaviorTab(s: AppSettings): FormTab {
  return {
    id: "behavior",
    label: "Behavior",
    rows: [
      { label: null, visible: true, controls: [{ kind: "heading", text: "Phrase Language" }] },
      {
        label: null,
        visible: true,
        controls: [
          { kind: "note", text: "Auto-detects from the system display language. Override here." },
        ],
      },
      {
        label: null,
        visible: true,
        controls: [
          {
            kind: "select",
            id: "phraseLocale",
            enabled: true,
            label: null,
            options: PHRASE_LOCALE_OPTIONS,
            value: PHRASE_LOCALE_OPTIONS.some((o) => o.value === s.phraseLocale) ? s.phraseLocale : "auto",
          },
        ],
      },
      {
        label: null,
        visible: true,
        controls: [
          checkbox("ghostModeEnabled", "Ghost Mode — auto-hide widget on hover", s.ghostModeEnabled),
        ],
      },
      {
        label: "Fade Radius",
        visible: true,
        controls: [
          {
            kind: "slider",
            id: "ghostFadeRadiusPx",
            // `GhostFadeRadiusPanel.IsEnabled = s.GhostModeEnabled` (`PopulateControls:243`).
            enabled: s.ghostModeEnabled,
            min: FADE_RADIUS_MIN_PX,
            max: FADE_RADIUS_MAX_PX,
            // `IsSnapToTickEnabled="True"` with `TickFrequency="10"` — the one snapping slider.
            step: 10,
            value: s.ghostFadeRadiusPx,
            valueLabel: fadeRadiusLabel(s.ghostFadeRadiusPx),
          },
        ],
      },
      {
        label: null,
        visible: true,
        controls: [{ kind: "note", text: "Hold these keys to keep widget visible:" }],
      },
      {
        label: null,
        visible: true,
        // `GhostOverridePanel.IsEnabled = s.GhostModeEnabled` (`PopulateControls:244`), so all four.
        controls: [
          checkbox("useCtrl", "Left Ctrl", s.useCtrl, s.ghostModeEnabled),
          checkbox("useAlt", "Left Alt", s.useAlt, s.ghostModeEnabled),
          checkbox("useShift", "Left Shift", s.useShift, s.ghostModeEnabled),
          checkbox("useWin", "Left Windows key", s.useWin, s.ghostModeEnabled),
        ],
      },
      {
        label: null,
        visible: true,
        controls: [
          checkbox("autoContrastEnabled", "Auto-Contrast — WCAG luminance sampling", s.autoContrastEnabled),
          checkbox("autoLaunchEnabled", "Auto-Launch at Login", s.autoLaunchEnabled),
          checkbox("updateChecksEnabled", "Check for updates on launch", s.updateChecksEnabled),
        ],
      },
      { label: null, visible: true, controls: [{ kind: "heading", text: "Battery Alert" }] },
      {
        label: null,
        visible: true,
        controls: [
          { kind: "note", text: "Alert when unplugged and battery is at or below:" },
          {
            kind: "radios",
            id: "batteryAlertThresholdPercent",
            enabled: true,
            options: BATTERY_ALERT_THRESHOLDS.map((pct) => ({
              value: String(pct),
              label: `${String(pct)}%`,
            })),
            value: (BATTERY_ALERT_THRESHOLDS as readonly number[]).includes(s.batteryAlertThresholdPercent)
              ? String(s.batteryAlertThresholdPercent)
              : null,
          },
        ],
      },
    ],
  }
}

/**
 * `PopulateControls(SettingsSnapshot)`, as data.
 *
 * The C# takes an immutable snapshot because its window is modeless and its controls are stateful; this
 * takes the settings themselves because the form it returns *is* the snapshot. Called on open and again on
 * every settings push, which is how a tray toggle re-ticks a box in an already-open window — the C# does
 * the same through `RefreshControls`.
 *
 * @param uiLanguage two-letter UI language for {@link phraseStyleSupported}.
 */
export function buildSettingsForm(settings: AppSettings, uiLanguage: string): SettingsForm {
  return {
    tabs: [appearanceTab(settings, uiLanguage), statsTab(settings), behaviorTab(settings)],
  }
}

// ---------------------------------------------------------------------------------------------------
// applySettingsEdit
// ---------------------------------------------------------------------------------------------------

/** The metric rows that participate in `core/stats-rows.ts`' auto-collapse. Uptime is not one. */
const STATS_ROW_FIELDS: Readonly<Partial<Record<EditableField, StatsRowKey>>> = {
  cpuVisible: "cpu",
  gpuVisible: "gpu",
  memVisible: "mem",
  pagVisible: "pag",
  batteryVisible: "batt",
}

export interface SettingsEdit {
  readonly id: string
  readonly value: unknown
}

export interface SettingsEditResult {
  readonly settings: AppSettings
  /** True when hiding the last metric row collapsed the whole panel — `setStatRowVisible`. */
  readonly collapsed: boolean
  /** True when the panel grew, so the caller must re-clamp the window into the work area. */
  readonly reclamp: boolean
}

const BOOLEAN_FIELDS: readonly string[] = [
  "phraseWrapEnabled",
  "showHourTicks",
  "showMinuteDots",
  "showHourNumbers",
  "lcdUse24Hr",
  "lcdShowSeconds",
  "statsVisible",
  "cpuVisible",
  "gpuVisible",
  "memVisible",
  "pagVisible",
  "batteryVisible",
  "uptimeVisible",
  "showDate",
  "ghostModeEnabled",
  "useCtrl",
  "useAlt",
  "useShift",
  "useWin",
  "autoContrastEnabled",
  "autoLaunchEnabled",
  "updateChecksEnabled",
]

/** `#RGB`, `#ARGB`, `#RRGGBB` or `#AARRGGBB` — the four shapes `parseAccentColor` reads. */
const ACCENT_SHAPE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/** A finite number from the wire, or null. A range input sends a string; a segment button sends one too. */
function wireNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function inLadder(value: number, ladder: readonly number[]): boolean {
  return ladder.includes(value)
}

/**
 * Decode one field's payload into a settings patch, or reject it.
 *
 * **Strict, unlike `validateSettings`.** That function's job is to salvage a hand-edited file, so an
 * unknown enum value becomes the default; this one's job is a message from a renderer we shipped, so an
 * unknown value is a bug or a tampered payload and the honest answer is to drop the edit rather than
 * silently reset the user's setting to something they did not choose. The composition still runs through
 * `validateSettings` afterwards — this narrows first so that pass has nothing left to salvage.
 */
function decode(field: EditableField, value: unknown): Partial<AppSettings> | null {
  if (BOOLEAN_FIELDS.includes(field)) {
    return typeof value === "boolean" ? { [field]: value } : null
  }
  switch (field) {
    case "accentColor": {
      if (typeof value !== "string" || !ACCENT_SHAPE.test(value.trim())) return null
      return { accentColor: formatAccentColor(parseAccentColor(value.trim())) }
    }
    case "opacity": {
      // `Math.Round(e.NewValue, 2)` then the slider's own bounds. The 0.10 floor is the XAML's
      // `Minimum`, and it is stricter than `validateSettings`' `<= 0` guard on purpose: that guard exists
      // for a corrupt file, this one for a control that cannot legally go lower.
      const raw = wireNumber(value)
      if (raw === null) return null
      const rounded = roundToTwoDecimals(raw)
      if (rounded < 0.1 || rounded > 1.0) return null
      return { opacity: rounded }
    }
    case "statsIntervalSeconds": {
      const raw = wireNumber(value)
      if (raw === null) return null
      const rounded = roundToOneDecimal(raw)
      if (rounded < 0.5 || rounded > 10.0) return null
      return { statsIntervalSeconds: rounded }
    }
    case "ghostFadeRadiusPx": {
      // `(int)GhostFadeRadiusSlider.Value` — truncates, and the C# truncates too.
      const raw = wireNumber(value)
      if (raw === null) return null
      const px = Math.trunc(raw)
      if (px < FADE_RADIUS_MIN_PX || px > FADE_RADIUS_MAX_PX) return null
      return { ghostFadeRadiusPx: px }
    }
    case "fontSize": {
      const raw = wireNumber(value)
      if (raw === null) return null
      // A ladder, not a range: the four segment buttons are the only route in the original.
      if (!FONT_SIZE_OPTIONS.some((o) => Number(o.value) === raw)) return null
      return { fontSize: raw }
    }
    case "processCountThresholdPercent": {
      const raw = wireNumber(value)
      if (raw === null || !inLadder(raw, PROCESS_COUNT_THRESHOLDS)) return null
      return { processCountThresholdPercent: raw }
    }
    case "batteryAlertThresholdPercent": {
      const raw = wireNumber(value)
      if (raw === null || !inLadder(raw, BATTERY_ALERT_THRESHOLDS)) return null
      return { batteryAlertThresholdPercent: raw }
    }
    case "clockType": {
      if (!CLOCK_TYPE_OPTIONS.some((o) => o.value === value)) return null
      return { clockType: value as AppSettings["clockType"] }
    }
    case "phraseStyle": {
      if (!PHRASE_STYLE_OPTIONS.some((o) => o.value === value)) return null
      return { phraseStyle: value as AppSettings["phraseStyle"] }
    }
    case "lcdStyle": {
      if (!(LCD_STYLES as readonly string[]).includes(value as string)) return null
      return { lcdStyle: value as AppSettings["lcdStyle"] }
    }
    case "dateFormat": {
      if (!(DATE_FORMATS as readonly string[]).includes(value as string)) return null
      return { dateFormat: value as AppSettings["dateFormat"] }
    }
    case "phraseLocale": {
      if (!PHRASE_LOCALE_OPTIONS.some((o) => o.value === value)) return null
      return { phraseLocale: value as string }
    }
    case "phraseWrapStyle": {
      if (!WRAP_STYLE_OPTIONS.some((o) => o.value === value)) return null
      return { phraseWrapStyle: value as string }
    }
    default:
      // Unreachable: `BOOLEAN_FIELDS` covers every remaining member of `EditableField`, and the test
      // asserts that by driving one edit per field through this function.
      return null
  }
}

/**
 * One control changed: the 34 handlers in `SettingsWindow.xaml.cs`, as a single reducer.
 *
 * Returns null for a payload this window could not have produced — an unknown field, a wrong type, an
 * out-of-range slider, an enum value that is not in the list. The caller drops it; nothing is saved.
 *
 * Two fields do more than write themselves, and both go through `core/stats-rows.ts` rather than being
 * reimplemented here:
 *   - the five metric rows, because hiding the last one collapses the panel (one-way);
 *   - any row's SHOW, because a taller panel can push the widget off the bottom of a display.
 *
 * `validateSettings` runs over the result even though {@link decode} already narrowed, and the reason is
 * not belt-and-braces: `setStatRowVisible` can write `statsVisible: false` as a *consequence*, and routing
 * the composed object through the same guard the file loader uses keeps "what is in memory" and "what a
 * reload would produce" the same object by construction.
 */
export function applySettingsEdit(settings: AppSettings, edit: SettingsEdit): SettingsEditResult | null {
  if (!isEditableField(edit.id)) return null
  const patch = decode(edit.id, edit.value)
  if (patch === null) return null

  const rowKey = STATS_ROW_FIELDS[edit.id]
  if (rowKey !== undefined) {
    const result = setStatRowVisible(settings, rowKey, edit.value as boolean)
    return { ...result, settings: validateSettings(result.settings) }
  }
  if (edit.id === "uptimeVisible") {
    const result = setUptimeRowVisible(settings, edit.value as boolean)
    return { ...result, settings: validateSettings(result.settings) }
  }

  return {
    settings: validateSettings({ ...settings, ...patch }),
    collapsed: false,
    // Showing the panel itself makes it appear at full height, which is the same hazard a row show is.
    reclamp: edit.id === "statsVisible" && edit.value === true,
  }
}
