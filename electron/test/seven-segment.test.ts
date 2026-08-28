/**
 * Translated from FuzzyClock.Core.Tests/SevenSegmentEncoderTests.cs -- all 13 cases: the 12 known
 * characters with their masks, and the throw on an unsupported one.
 *
 * The mask table is repeated here as literals rather than imported, on purpose. Importing the module's
 * own table and comparing it to itself would pass for any table at all; these 12 numbers are
 * transcribed from `SevenSegmentEncoder.cs`, which is a second copy from a different source.
 *
 * The coverage assertion is the one addition that matters: `SUPPORTED_CHARACTERS` must be exactly the
 * 12 keys listed below, so a character added to the port without a case here fails rather than passing
 * untested.
 */
import { describe, expect, test } from "bun:test"
import { SUPPORTED_CHARACTERS, encodeSevenSegment } from "../src/core/seven-segment.js"

/** Transcribed from the C# switch, not read from the port. */
const EXPECTED: readonly (readonly [string, number])[] = [
  ["0", 0x3f],
  ["1", 0x06],
  ["2", 0x5b],
  ["3", 0x4f],
  ["4", 0x66],
  ["5", 0x6d],
  ["6", 0x7d],
  ["7", 0x07],
  ["8", 0x7f],
  ["9", 0x6f],
  [":", 0x80], // the colon sentinel -- two dots in the renderer, not segment data
  [" ", 0x00],
]

describe("encodeSevenSegment, translated from SevenSegmentEncoderTests", () => {
  test.each(EXPECTED)("%p encodes to its mask", (character, expected) => {
    expect(encodeSevenSegment(character)).toBe(expected)
  })

  test("an unsupported character throws", () => {
    expect(() => encodeSevenSegment("X")).toThrow("Unsupported character: 'X'")
  })
})

describe("what the char-to-string change forced", () => {
  test("the supported set is exactly the 12 characters pinned above", () => {
    expect([...SUPPORTED_CHARACTERS]).toEqual(EXPECTED.map(([character]) => character))
  })

  test("a multi-character string is reported as a caller bug, not an unsupported character", () => {
    // C# takes a `char`, so this case could not exist there. It must not be folded into the other
    // message: "Unsupported character: '12'" would send a reader looking for a missing table row.
    expect(() => encodeSevenSegment("12")).toThrow("expects exactly one character")
    expect(() => encodeSevenSegment("")).toThrow("expects exactly one character")
  })
})
