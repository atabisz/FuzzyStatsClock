/**
 * The two digit-size maps, ported from FuzzyClock.App/LcdSize.cs (`LcdSize` + `LcdSizeMap`) and
 * FuzzyClock.App/NixieSize.cs (`NixieSizeMap`).
 *
 * Two C# files in one module, which breaks this port's otherwise 1:1 file mapping. They are 14 and 12
 * lines, they are both total functions of the same three-value type, and splitting them would mean a
 * module whose entire content is one `import type`. The provenance is per-function instead.
 *
 * ## The enum is persisted as its ORDINAL, so the port needs both directions
 *
 * `AppSettings.LcdSize` is a C# enum, and System.Text.Json writes an enum as its integer value by
 * default -- his live `%LOCALAPPDATA%\FuzzyClock\settings.json` holds `"LcdSize": 0` and
 * `"ClockType": 1`, not `"Small"` and `"Dial"`. So the settings importer (ISC-18) cannot read these
 * as names, and the declaration order in LcdSize.cs is load-bearing data rather than an
 * implementation detail. `lcdSizeFromOrdinal` is that mapping, kept next to the type it decodes.
 */

/** `enum LcdSize { Small, Medium, Large }` -- names, because nothing here needs the arithmetic. */
export type LcdSize = "small" | "medium" | "large"

/** Declaration order from LcdSize.cs, which is what the WPF settings file stores. */
const ORDINALS: readonly LcdSize[] = ["small", "medium", "large"]

/**
 * Decodes the integer a WPF settings file holds. Returns null rather than throwing or defaulting for
 * an unknown value: an importer meeting a corrupt file should fall back to its own default, and that
 * choice belongs to the importer.
 */
export function lcdSizeFromOrdinal(ordinal: number): LcdSize | null {
  return ORDINALS[ordinal] ?? null
}

/**
 * `LcdSizeMap.ToSegmentHeight` -- the seven-segment digit height in device-independent pixels.
 *
 * The throw is the C#'s `ArgumentOutOfRangeException` arm. Unreachable through the type, reachable
 * from a settings file, which is exactly why it stays.
 */
export function toSegmentHeight(size: LcdSize): number {
  switch (size) {
    case "small":
      return 32
    case "medium":
      return 48
    case "large":
      return 64
    default:
      throw new RangeError(`toSegmentHeight: unknown size ${String(size)}`)
  }
}

/** `NixieSizeMap.ToDigitHeight` -- the Nixie tube height, 8px taller than the LCD at every tier. */
export function toDigitHeight(size: LcdSize): number {
  switch (size) {
    case "small":
      return 40
    case "medium":
      return 56
    case "large":
      return 72
    default:
      throw new RangeError(`toDigitHeight: unknown size ${String(size)}`)
  }
}
