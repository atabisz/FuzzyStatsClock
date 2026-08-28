/**
 * Translated from FuzzyClock.Core.Tests/PhraseWrapServiceTests.cs -- all 23 cases: 5 guards, 3
 * midpoint, 5 natural, the 7-row marker sweep, 2 allowNatural=false, and the unknown-style case.
 *
 * `Assert.IsNotNull(result)` then two component asserts becomes one `toEqual`, which also pins that
 * there is no third field. `Assert.IsNull(result)` becomes `toBeNull()`.
 *
 * Two of the C# rows assert only non-nullness -- "nearly eight" and "almost nine" pass `null`
 * expectations through the DataRow and skip the value checks. Their real output was measured against
 * the compiled C# and is asserted here, so those two rows stop being placeholders.
 *
 * The second describe block is additions. Every expectation in it was measured the same way: a
 * throwaway console project compiled the real PhraseWrapService.cs and printed ComputeSplit's output
 * for each input. Nothing here was derived by reading the algorithm.
 */
import { describe, expect, test } from "bun:test"
import { computeSplit, type PhraseSplit } from "../src/core/phrase-wrap.js"

/** Shorthand for the expected pair. */
function split(line1: string, line2: string): PhraseSplit {
  return { line1, line2 }
}

describe("computeSplit guards, translated from PhraseWrapServiceTests", () => {
  test.each([
    [null], // ComputeSplit(null!, "midpoint")
    [""],
    ["   "],
    ["noon"], // single word
    ["midnight"],
  ])("%p cannot be split", (phrase) => {
    expect(computeSplit(phrase, "midpoint")).toBeNull()
  })
})

describe("computeSplit midpoint, translated from PhraseWrapServiceTests", () => {
  test("half past eleven: mid 8, boundaries 5 and 10, nearest is 10", () => {
    expect(computeSplit("half past eleven", "midpoint")).toEqual(split("half past", "eleven"))
  })

  test("just a little after eleven: mid 13, boundaries 5/7/14/21, nearest is 14", () => {
    expect(computeSplit("just a little after eleven", "midpoint")).toEqual(
      split("just a little", "after eleven"),
    )
  })

  test("two words split at the only boundary", () => {
    expect(computeSplit("ten twelve", "midpoint")).toEqual(split("ten", "twelve"))
  })
})

describe("computeSplit natural, translated from PhraseWrapServiceTests", () => {
  test("half past eleven splits after the half past marker", () => {
    expect(computeSplit("half past eleven", "natural")).toEqual(split("half past", "eleven"))
  })

  test("almost a quarter before twelve keeps the whole marker on line 1", () => {
    expect(computeSplit("almost a quarter before twelve", "natural")).toEqual(
      split("almost a quarter before", "twelve"),
    )
  })

  test("longest marker wins: just after quarter past beats just after", () => {
    expect(computeSplit("just after quarter past three", "natural")).toEqual(
      split("just after quarter past", "three"),
    )
  })

  test("ten past five splits after the ten past marker", () => {
    expect(computeSplit("ten past five", "natural")).toEqual(split("ten past", "five"))
  })

  test("an unmarked phrase falls back to midpoint: mid 12, boundary 13 is nearest", () => {
    expect(computeSplit("some unknown phrase here", "natural")).toEqual(
      split("some unknown", "phrase here"),
    )
  })

  // ----- the 7-row marker sweep -----
  test.each([
    ["a quarter past six", split("a quarter past", "six")],
    ["almost half past two", split("almost half past", "two")],
    ["just past half past nine", split("just past half past", "nine")],
    ["a quarter before five", split("a quarter before", "five")],
    ["just after seven", split("just after", "seven")],
    // The C# asserts only non-null for these two. Values measured against the compiled C#.
    ["nearly eight", split("nearly", "eight")],
    ["almost nine", split("almost", "nine")],
  ])("%p splits at its marker", (phrase, expected) => {
    expect(computeSplit(phrase, "natural")).toEqual(expected)
  })
})

describe("computeSplit style and veto, translated from PhraseWrapServiceTests", () => {
  test("allowNatural false forces midpoint -- same answer here, by coincidence", () => {
    expect(computeSplit("half past eleven", "natural", false)).toEqual(split("half past", "eleven"))
  })

  test("allowNatural false forces midpoint -- and here it differs from natural", () => {
    // This is the pair that gives `allowNatural` its discriminating power: natural gives
    // "almost a quarter before" / "twelve", midpoint gives "almost a quarter" / "before twelve".
    expect(computeSplit("almost a quarter before twelve", "natural", false)).toEqual(
      split("almost a quarter", "before twelve"),
    )
    expect(computeSplit("almost a quarter before twelve", "natural")).toEqual(
      split("almost a quarter before", "twelve"),
    )
  })

  test("an unknown style behaves exactly as midpoint", () => {
    const midpoint = computeSplit("half past eleven", "midpoint")
    expect(computeSplit("half past eleven", "unknown_style")).toEqual(midpoint)
    // The C# compares the two results against each other, which passes even if both are wrong.
    // Pinning the value as well costs one line.
    expect(midpoint).toEqual(split("half past", "eleven"))
  })
})

describe("computeSplit, branches the C# suite never reaches (all measured)", () => {
  test("undefined is rejected, as null is", () => {
    // Not translated: C# `string` covers both with one null. The phrase reaches this from a
    // provider lookup, where a miss is undefined.
    expect(computeSplit(undefined, "natural")).toBeNull()
  })

  test("a marker consuming the whole phrase is rejected and the midpoint runs", () => {
    // "half past " matches the marker exactly, so line2 would be blank. The C# keeps looking, no
    // other marker matches, and the midpoint fallback runs over ["half", "past", ""].
    expect(computeSplit("half past ", "natural")).toEqual(split("half", "past "))
  })

  test("a phrase that is the marker without its trailing space does not match it", () => {
    expect(computeSplit("half past", "natural")).toEqual(split("half", "past"))
  })

  test("equidistant boundaries keep the earlier split", () => {
    // "ab c efg": length 8, mid 4, boundaries at 3 and 5 -- both distance 1. Strictly-less-than
    // means the first one holds. A `<=` comparison would return "ab c" / "efg" instead.
    expect(computeSplit("ab c efg", "midpoint")).toEqual(split("ab", "c efg"))
  })

  test("a doubled space defeats the marker and survives into the output", () => {
    // No marker matches "half  past ...", and the empty word between the spaces rejoins as a
    // trailing space on line 1.
    expect(computeSplit("half  past eleven", "natural")).toEqual(split("half ", "past eleven"))
  })

  test("a leading space is not trimmed away before splitting", () => {
    expect(computeSplit(" half past eleven", "natural")).toEqual(split(" half", "past eleven"))
  })

  test("marker matching ignores case but the output keeps the original", () => {
    // The phrase has to be one whose natural and midpoint splits DIFFER, or the assertion is
    // vacuous: "HALF PAST ELEVEN" gives "HALF PAST" / "ELEVEN" whether the marker matched or the
    // midpoint fallback ran, so a case-SENSITIVE implementation passes it. Found by mutation --
    // dropping the case fold left the suite green. "almost a quarter before " is the marker whose
    // split the midpoint disagrees with, so it is the one that can see the difference.
    expect(computeSplit("ALMOST A QUARTER BEFORE TWELVE", "natural")).toEqual(
      split("ALMOST A QUARTER BEFORE", "TWELVE"),
    )
    expect(computeSplit("Almost A Quarter Before Twelve", "natural")).toEqual(
      split("Almost A Quarter Before", "Twelve"),
    )
    // and the midpoint answer it must NOT be, measured against the C#
    expect(computeSplit("ALMOST A QUARTER BEFORE TWELVE", "midpoint")).toEqual(
      split("ALMOST A QUARTER", "BEFORE TWELVE"),
    )
    // kept as well, now labelled for what it is: agreement between the two paths
    expect(computeSplit("HALF PAST ELEVEN", "natural")).toEqual(split("HALF PAST", "ELEVEN"))
    expect(computeSplit("Half Past Eleven", "natural")).toEqual(split("Half Past", "Eleven"))
  })

  test("a single word is still unsplittable under the natural style", () => {
    expect(computeSplit("nearly", "natural")).toBeNull()
    expect(computeSplit("a", "midpoint")).toBeNull()
  })

  test("the shortest splittable phrase is two words", () => {
    expect(computeSplit("a b", "midpoint")).toEqual(split("a", "b"))
  })

  test("the two markers with no translated case of their own", () => {
    expect(computeSplit("ten to four", "natural")).toEqual(split("ten to", "four"))
    expect(computeSplit("just past nine", "natural")).toEqual(split("just past", "nine"))
  })
})
