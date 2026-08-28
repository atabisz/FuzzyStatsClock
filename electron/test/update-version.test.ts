/**
 * Translated from FuzzyClock.Core.Tests/UpdateVersionComparerTests.cs -- all 20 cases: the 6 happy
 * tags, the 10 rejections, and the 4 ordering methods.
 *
 * `Assert.IsTrue(TryParseTag(tag, out var v))` followed by four component asserts becomes one
 * `toEqual`, which is the same four assertions and additionally pins that there is no fifth field.
 * `Assert.IsFalse(TryParseTag(tag, out _))` becomes `toBeNull()`.
 *
 * The second group is additions, and every expectation in it was MEASURED against the C# rather than
 * reasoned about -- a throwaway console project compiled the real UpdateVersionComparer.cs and printed
 * `Version.TryParse` and `TryParseTag` side by side for each input. That is where the int.MaxValue
 * ceiling, the leading-zero behaviour and the one deliberate divergence come from.
 */
import { describe, expect, test } from "bun:test"
import { isNewer, parseTag, type Version } from "../src/core/update-version.js"

/** Shorthand for the four-field expectation, with -1 for the components a tag omitted. */
function version(major: number, minor: number, build: number, revision: number): Version {
  return { major, minor, build, revision }
}

describe("parseTag, translated from UpdateVersionComparerTests", () => {
  // ----- happy path: 6 rows, same tags, same components -----
  test.each([
    ["v4.5.0", version(4, 5, 0, -1)],
    ["V4.5.0", version(4, 5, 0, -1)],
    ["4.5.0", version(4, 5, 0, -1)],
    ["4.5", version(4, 5, -1, -1)],
    ["4.5.0.0", version(4, 5, 0, 0)],
    ["v10.20.30.40", version(10, 20, 30, 40)],
  ])("%p parses to its components", (tag, expected) => {
    expect(parseTag(tag)).toEqual(expected)
  })

  // ----- reject path: 10 rows -----
  test.each([
    [null], // [DataRow(null)]
    [""],
    ["   "],
    ["v"], // a bare 'v' strips to nothing
    ["garbage"],
    ["v4.5.0-beta"],
    ["4.5.0-rc1"],
    ["v4.5.0-alpha.2"],
    ["4.5.0+sha.abc"],
    ["v4.x.0"],
  ])("%p is rejected", (tag) => {
    expect(parseTag(tag)).toBeNull()
  })
})

describe("parseTag edges, measured against the C# rather than assumed", () => {
  test("undefined is rejected, as null is", () => {
    // Not a translated case: C# `string?` covers both with one null. TS does not, and the tag
    // arrives from parsed JSON, where a missing field is undefined rather than null.
    expect(parseTag(undefined)).toBeNull()
  })

  test("the int.MaxValue ceiling is enforced, as Version.TryParse enforces it", () => {
    // Measured: 4.2147483647 parses, 4.2147483648 does not. Worth porting rather than letting JS
    // numbers accept it -- being LOOSER here would offer an update for a garbage tag, which is the
    // unsafe direction.
    expect(parseTag("4.2147483647")).toEqual(version(4, 2_147_483_647, -1, -1))
    expect(parseTag("4.2147483648")).toBeNull()
    expect(parseTag("4.99999999999999999999")).toBeNull()
    // Measured on every component, not just minor: the ceiling is uniform in .NET, so each half of
    // the port's two-line check needs a case or half of it is decoration.
    expect(parseTag("2147483647.0")).toEqual(version(2_147_483_647, 0, -1, -1))
    expect(parseTag("2147483648.0")).toBeNull()
    expect(parseTag("4.5.2147483648")).toBeNull()
    expect(parseTag("4.5.0.2147483648")).toBeNull()
  })

  test.each([
    ["4"], // one component: Version needs at least two
    ["4.5.0.0.0"], // five components
    ["4.5."], // trailing dot
    [".4.5"], // leading dot
    ["4..5"], // empty component
    ["vv4.5.0"], // only ONE leading v is stripped
    ["version 4.5.0"], // and only a 'v', never a word
    ["٤.٥"], // Arabic-Indic digits: rejected by .NET's invariant parser and by JS \d alike
    ["4.-5"], // negative component
    ["-4.5"],
  ])("%p is rejected, measured false in the C# too", (tag) => {
    expect(parseTag(tag)).toBeNull()
  })

  test("leading zeros in a component are accepted, and are not significant", () => {
    // Measured: both give 4.5. Kept for parity -- there is no reason to reject a tag the C# takes.
    expect(parseTag("4.05")).toEqual(version(4, 5, -1, -1))
    expect(parseTag("04.5")).toEqual(version(4, 5, -1, -1))
  })

  test("surrounding whitespace is trimmed, inside or outside the v", () => {
    expect(parseTag("  v4.5.0  ")).toEqual(version(4, 5, 0, -1))
    expect(parseTag("\t4.5\n")).toEqual(version(4, 5, -1, -1))
  })

  test("a + inside a component is rejected -- and here the C# guard is load-bearing", () => {
    // `Version.TryParse("4.+5")` returns TRUE (4.5), measured: NumberStyles.Integer allows a
    // leading sign per component. The C# only rejects it because of the explicit Contains('+')
    // check, so that guard is not the pure documentation its comment suggests. This port rejects it
    // on shape as well, which is why the same guard is redundant HERE.
    expect(parseTag("4.+5")).toBeNull()
  })

  test("DIVERGENCE: interior whitespace is rejected here, accepted by the C#", () => {
    // Measured: TryParseTag("4. 5") returns TRUE with 4.5, because NumberStyles.Integer allows
    // leading whitespace per component. That is an accident of the number parser, not a rule
    // anyone wrote, and it cannot come out of a GitHub tag. Rejecting it means "no update
    // offered", never a bogus one -- the safe direction. Pinned so the difference stays visible
    // instead of being discovered as a bug report.
    expect(parseTag("4. 5")).toBeNull()
  })
})

describe("isNewer, translated from UpdateVersionComparerTests", () => {
  test("latest strictly greater is newer", () => {
    expect(isNewer(version(4, 5, 0, -1), version(4, 6, 0, -1))).toBe(true)
  })

  test("equal is not newer", () => {
    expect(isNewer(version(4, 5, 0, -1), version(4, 5, 0, -1))).toBe(false)
  })

  test("running greater than latest is not newer", () => {
    expect(isNewer(version(4, 6, 0, -1), version(4, 5, 0, -1))).toBe(false)
  })

  test("absent components compare as zero", () => {
    // These two are what give `normalize` its discriminating power, and they are the C#'s own
    // asserts. Without the -1 -> 0 promotion, latest's build (then revision) is 0 against the
    // running -1, 0 > -1 holds, and both of these report a phantom update.
    expect(isNewer(version(4, 5, -1, -1), version(4, 5, 0, -1))).toBe(false)
    expect(isNewer(version(4, 5, 0, -1), version(4, 5, 0, 0))).toBe(false)
  })
})

describe("isNewer, the shapes the app actually produces", () => {
  test("a 4-component assembly version against a 3-component tag", () => {
    // MainWindow.xaml.cs:1321-1322: `running` is the assembly version, always 4-component, and
    // `latest` comes from a tag that usually has 3. Documentation of the production path rather
    // than a case that discriminates -- in THIS direction an unnormalized compare also says false,
    // because latest's -1 revision loses to running's 0.
    const running = version(5, 0, 0, 0)
    expect(isNewer(running, parseTag("v5.0.0")!)).toBe(false)
    expect(isNewer(running, parseTag("v5.0.1")!)).toBe(true)
    expect(isNewer(running, parseTag("v5.1")!)).toBe(true)
    expect(isNewer(running, parseTag("v4.9.9")!)).toBe(false)
  })

  test("each component in turn decides, most significant first", () => {
    expect(isNewer(version(4, 9, 9, 9), version(5, 0, 0, 0))).toBe(true)
    expect(isNewer(version(4, 5, 9, 9), version(4, 6, 0, 0))).toBe(true)
    expect(isNewer(version(4, 5, 0, 9), version(4, 5, 1, 0))).toBe(true)
    expect(isNewer(version(4, 5, 0, 0), version(4, 5, 0, 1))).toBe(true)
    // and the same four, reversed, must all be false
    expect(isNewer(version(5, 0, 0, 0), version(4, 9, 9, 9))).toBe(false)
    expect(isNewer(version(4, 6, 0, 0), version(4, 5, 9, 9))).toBe(false)
    expect(isNewer(version(4, 5, 1, 0), version(4, 5, 0, 9))).toBe(false)
    expect(isNewer(version(4, 5, 0, 1), version(4, 5, 0, 0))).toBe(false)
  })
})
