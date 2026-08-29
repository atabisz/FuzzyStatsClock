/**
 * Translated from FuzzyClock.App.Tests/LcdTimeFormatHelperTests.cs -- all 4 cases, same sample time
 * (2026-03-11 14:05:09), same expected strings including the leading space in 12-hour mode.
 *
 * The additions are the nine other times the C# suite does not cover, every expectation measured off
 * the real LcdTimeFormatHelper.cs compiled into `$TEMP/fc-appprobe` (`dotnet run -- lcdfmt`, which
 * delimits each result with pipes so a leading space cannot be lost in transcription). Midnight, noon
 * and the 9-to-10 boundary are the three that would actually break a careless port.
 */
import { describe, expect, test } from "bun:test"
import { formatLcdTime } from "../src/core/lcd-time-format.js"

/** Local-time construction, which is what `DateTime.Now` hands the C#. Month 2 is March. */
const at = (hour: number, minute: number, second: number): Date =>
  new Date(2026, 2, 11, hour, minute, second)

describe("formatLcdTime, translated from LcdTimeFormatHelperTests", () => {
  const pm = at(14, 5, 9)

  test("24-hour with seconds", () => {
    expect(formatLcdTime(pm, true, true)).toBe("14:05:09")
  })

  test("24-hour without seconds", () => {
    expect(formatLcdTime(pm, true, false)).toBe("14:05")
  })

  test("12-hour with seconds", () => {
    expect(formatLcdTime(pm, false, true)).toBe(" 2:05:09")
  })

  test("12-hour without seconds", () => {
    expect(formatLcdTime(pm, false, false)).toBe(" 2:05")
  })
})

describe("formatLcdTime, additions measured against the compiled C#", () => {
  test.each([
    [0, 0, 0, "00:00:00", "00:00", "12:00:00", "12:00"],
    [0, 9, 5, "00:09:05", "00:09", "12:09:05", "12:09"],
    [1, 2, 3, "01:02:03", "01:02", " 1:02:03", " 1:02"],
    [9, 5, 7, "09:05:07", "09:05", " 9:05:07", " 9:05"],
    [10, 0, 0, "10:00:00", "10:00", "10:00:00", "10:00"],
    [12, 0, 0, "12:00:00", "12:00", "12:00:00", "12:00"],
    [12, 34, 56, "12:34:56", "12:34", "12:34:56", "12:34"],
    [13, 0, 0, "13:00:00", "13:00", " 1:00:00", " 1:00"],
    [23, 59, 59, "23:59:59", "23:59", "11:59:59", "11:59"],
  ] as const)("%p:%p:%p", (h, m, s, h24s, h24, h12s, h12) => {
    const time = at(h, m, s)
    expect(formatLcdTime(time, true, true)).toBe(h24s)
    expect(formatLcdTime(time, true, false)).toBe(h24)
    expect(formatLcdTime(time, false, true)).toBe(h12s)
    expect(formatLcdTime(time, false, false)).toBe(h12)
  })

  test("midnight is 00 in 24-hour mode and 12 in 12-hour mode", () => {
    // The `h % 12 == 0 ? 12` fold. A port that dropped it would print " 0:00", which is the one
    // wrong answer a reader would not notice on a clock face.
    expect(formatLcdTime(at(0, 0, 0), true, false)).toBe("00:00")
    expect(formatLcdTime(at(0, 0, 0), false, false)).toBe("12:00")
    expect(formatLcdTime(at(12, 0, 0), false, false)).toBe("12:00")
  })

  test("minutes and seconds are zero-padded while the hour is space-padded", () => {
    expect(formatLcdTime(at(14, 5, 9), true, true)).toBe("14:05:09")
    expect(formatLcdTime(at(13, 0, 0), false, true)).toBe(" 1:00:00")
  })
})

describe("formatLcdTime, universals the C# suite leaves implicit", () => {
  // Swept over all 24 hours rather than sampled. Every row the probe measured satisfies both of
  // these, but neither is a recorded C# value -- they are properties of the port, stated so a future
  // change to the padding fails here rather than in a rendered glyph cell.
  test("the leading space appears below 10 and nowhere else", () => {
    for (let hour = 0; hour < 24; hour++) {
      const rendered = formatLcdTime(at(hour, 0, 0), false, false)
      const hour12 = hour % 12 === 0 ? 12 : hour % 12
      expect(rendered.startsWith(" ")).toBe(hour12 < 10)
    }
  })

  test("every string is 5 or 8 characters wide, in both modes", () => {
    // The reason the hour is space-padded rather than zero-padded: the segment renderer draws one
    // glyph per cell, so the colon has to land in the same column at every hour of the day.
    for (let hour = 0; hour < 24; hour++) {
      for (const use24Hr of [true, false]) {
        expect(formatLcdTime(at(hour, 7, 8), use24Hr, false)).toHaveLength(5)
        expect(formatLcdTime(at(hour, 7, 8), use24Hr, true)).toHaveLength(8)
      }
    }
  })
})
