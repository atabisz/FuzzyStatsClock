/**
 * Seven-segment bitmasks, ported from FuzzyClock.Core/SevenSegmentEncoder.cs.
 *
 * Bits 0-6 are segments a-g (bit 0 = top horizontal, bit 6 = middle horizontal). Bit 7 (0x80) is the
 * **colon sentinel**, not segment data: the renderer special-cases it as two dots. Verbatim from the
 * C# doc comment, because the sentinel is the one thing about this table that cannot be inferred from
 * the values.
 *
 * A lookup object rather than a `switch`, which is the same thing in TypeScript and makes the
 * supported set enumerable -- the test sweeps `Object.keys` rather than repeating the list, so a row
 * added here without a test row cannot pass unnoticed.
 *
 * The C# signature is `Encode(char)`, and `char` is a type this language does not have. So the
 * one-character precondition becomes a runtime check with its own message: a two-character string is
 * a caller bug, distinct from a single character this display cannot render, and collapsing the two
 * into "Unsupported character: 'AB'" would describe the wrong problem.
 */

const MASKS: { readonly [character: string]: number } = {
  "0": 0x3f,
  "1": 0x06,
  "2": 0x5b,
  "3": 0x4f,
  "4": 0x66,
  "5": 0x6d,
  "6": 0x7d,
  "7": 0x07,
  "8": 0x7f,
  "9": 0x6f,
  ":": 0x80,
  " ": 0x00,
}

/** Every character this encoder accepts, in table order. */
export const SUPPORTED_CHARACTERS: readonly string[] = Object.keys(MASKS)

/** `SevenSegmentEncoder.Encode(char)`. Throws on anything not in the table, as the C# does. */
export function encodeSevenSegment(character: string): number {
  if ([...character].length !== 1)
    throw new Error(
      `encodeSevenSegment expects exactly one character, got ${[...character].length}: "${character}".`,
    )
  const mask = MASKS[character]
  if (mask === undefined) throw new Error(`Unsupported character: '${character}'`)
  return mask
}
