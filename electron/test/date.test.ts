/**
 * Translated from FuzzyClock.Core.Tests/DateFormatterTests.cs -- all 6 cases, same fixed date
 * (Saturday, 7 March 2026) and the same four expected strings.
 *
 * The C# reads `CurrentCulture`, so those six expectations are what the C# suite produced *on this
 * host* -- 469/469 green under en-AU, measured, not assumed. The port takes the locale as a parameter,
 * so the translated cases pin `en-AU` to mirror that run and `en-US` to show the two agree.
 *
 * The last group is not a translation. It is the discriminator for the whole field-by-field design, and
 * it is worth more than the six cases above: `Intl` asked for weekday + month + day *together* reorders
 * them per locale, and on this very host that yields "Sat, 7 Mar" -- which is what the renderer's
 * placeholder was showing and what the WPF app never shows. Asserting the two forms DIFFER is what
 * proves the order in the output is this file's and not the locale's.
 */
import { describe, expect, test } from "bun:test"
import { formatDate } from "../src/core/date.js"

/** Saturday, 7 March 2026, constructed local as the C# `new DateTime(2026, 3, 7)` is. */
const TEST_DATE = new Date(2026, 2, 7)

/** Self-check on the fixture, so a zone or month-index slip fails by name instead of by mismatch. */
if (TEST_DATE.getFullYear() !== 2026 || TEST_DATE.getMonth() !== 2 || TEST_DATE.getDate() !== 7)
  throw new Error("TEST_DATE is not 2026-03-07 local -- month is 0-based in this constructor.")

describe("formatDate, translated from DateFormatterTests", () => {
  test.each(["en-AU", "en-US"])("Short is the abbreviated day and month (%s)", (locale) => {
    expect(formatDate("Short", TEST_DATE, locale)).toBe("Sat, Mar 7")
  })

  test.each(["en-AU", "en-US"])("Long is the full day and month (%s)", (locale) => {
    expect(formatDate("Long", TEST_DATE, locale)).toBe("Saturday, March 7")
  })

  test("Numeric is M/d/yyyy", () => {
    expect(formatDate("Numeric", TEST_DATE, "en-AU")).toBe("3/7/2026")
  })

  test("ISO is yyyy-MM-dd, zero-padded", () => {
    expect(formatDate("ISO", TEST_DATE, "en-AU")).toBe("2026-03-07")
  })

  // ----- Fallback: unknown values default to Short -----
  test.each(["", "unknown"])("%p falls back to Short", (format) => {
    expect(formatDate(format, TEST_DATE, "en-AU")).toBe("Sat, Mar 7")
  })
})

describe("the field order is the pattern's, not the locale's", () => {
  test("en-AU: this port and a whole-date Intl format disagree, and that is the point", () => {
    const whole = new Intl.DateTimeFormat("en-AU", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(TEST_DATE)

    expect(whole).toBe("Sat, 7 Mar") // the locale's order -- day before month
    expect(formatDate("Short", TEST_DATE, "en-AU")).toBe("Sat, Mar 7") // the C# pattern's order
    expect(formatDate("Short", TEST_DATE, "en-AU")).not.toBe(whole)
  })

  test("de-DE: the names localise and the order does not move", () => {
    // Guard the instrument before trusting it: a build without German ICU data falls back to English,
    // which would fail the assertions below for a reason that has nothing to do with this port.
    const march = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(TEST_DATE)
    if (march === "March")
      throw new Error("no de-DE ICU data in this runtime -- this case cannot be evaluated.")

    expect(formatDate("Long", TEST_DATE, "de-DE")).toBe("Samstag, März 7")
    expect(formatDate("ISO", TEST_DATE, "de-DE")).toBe("2026-03-07")
  })

  test("Numeric and ISO ignore the locale entirely", () => {
    // They have no name-bearing field, so they are built from the date's components. Pinned because
    // routing them through Intl instead is the obvious "simplification" and it changes the output.
    for (const locale of ["en-AU", "en-US", "de-DE", "ja-JP"]) {
      expect(formatDate("Numeric", TEST_DATE, locale)).toBe("3/7/2026")
      expect(formatDate("ISO", TEST_DATE, locale)).toBe("2026-03-07")
    }
  })
})
