/**
 * Translated from FuzzyClock.App.Tests/NixieSizeMapTests.cs -- all 3 DataRows, same heights.
 *
 * `LcdSizeMap.ToSegmentHeight` has no C# suite at all despite being the same shape and one file over,
 * so its three heights are additions measured off the compiled C# (`dotnet run -- sizes`) rather than
 * translations. Same for both throw arms and for the ordinal decoding.
 */
import { describe, expect, test } from "bun:test"
import { lcdSizeFromOrdinal, toDigitHeight, toSegmentHeight, type LcdSize } from "../src/core/digit-size.js"

describe("toDigitHeight, translated from NixieSizeMapTests", () => {
  test.each([
    ["small", 40],
    ["medium", 56],
    ["large", 72],
  ] as const)("%p -> %p", (size, expected) => {
    expect(toDigitHeight(size)).toBe(expected)
  })
})

describe("toSegmentHeight, measured against the compiled C#", () => {
  test.each([
    ["small", 32],
    ["medium", 48],
    ["large", 64],
  ] as const)("%p -> %p", (size, expected) => {
    expect(toSegmentHeight(size)).toBe(expected)
  })

  test("the Nixie tube is 8px taller than the LCD digit at every tier", () => {
    // Not stated anywhere in the C#; it falls out of the six measured values, and it is the kind of
    // relationship that makes a transposed pair obvious.
    for (const size of ["small", "medium", "large"] as const) {
      expect(toDigitHeight(size) - toSegmentHeight(size)).toBe(8)
    }
  })
})

describe("the out-of-range arm", () => {
  // The C# throws ArgumentOutOfRangeException for any enum value outside the three -- measured on
  // both (LcdSize)99 and (LcdSize)(-1), on both maps. Unreachable through the union type here, which
  // is why it takes a cast to test, and worth keeping because a settings file can hold anything.
  test.each([["", "empty"], ["Small", "the C# name rather than the port's"], ["huge", "a plausible fourth tier"]] as const)(
    "%p throws (%s)",
    (bad) => {
      expect(() => toSegmentHeight(bad as LcdSize)).toThrow(RangeError)
      expect(() => toDigitHeight(bad as LcdSize)).toThrow(RangeError)
    },
  )
})

describe("lcdSizeFromOrdinal", () => {
  // System.Text.Json writes a C# enum as its ordinal, so the WPF settings file the importer (ISC-18)
  // has to read holds 0/1/2 -- his live file says `"LcdSize": 0`. The mapping is the declaration
  // order in LcdSize.cs.
  test.each([
    [0, "small"],
    [1, "medium"],
    [2, "large"],
  ] as const)("%p -> %p", (ordinal, expected) => {
    expect(lcdSizeFromOrdinal(ordinal)).toBe(expected)
  })

  test.each([[-1], [3], [99], [1.5], [Number.NaN]])("%p has no size", (ordinal) => {
    expect(lcdSizeFromOrdinal(ordinal)).toBeNull()
  })

  test("his live settings file's value decodes to the smallest tier", () => {
    expect(lcdSizeFromOrdinal(0)).toBe("small")
    expect(toSegmentHeight("small")).toBe(32)
  })
})
