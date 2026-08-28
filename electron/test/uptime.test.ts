/**
 * Translated from FuzzyClock.Core.Tests/UptimeFormatterTests.cs -- all 7 cases, same values, same
 * boundaries (sub-hour ceiling, exactly 1h, exactly 1d, days present).
 *
 * The C# constructs `TimeSpan`s; this passes seconds, because that is what the port takes and what
 * `process.uptime()` gives. The conversions are written out (`45 * 60`) rather than pre-multiplied so
 * each case still reads as the case the C# names.
 *
 * Two cases are additions, not translations, and both exist because the C# could not have them: a
 * `TimeSpan` cannot carry a fractional minute component the way a raw second count can, and .NET's
 * truncation-toward-zero is a property of `TimeSpan` that this port had to reimplement. So the seconds
 * remainder and the negative span are pinned here -- `Math.floor` in place of `Math.trunc` passes every
 * translated case above and fails the negative one.
 */
import { describe, expect, test } from "bun:test"
import { formatUptime } from "../src/core/uptime.js"

describe("formatUptime, translated from UptimeFormatterTests", () => {
  // ----- Sub-hour: only minutes shown -----
  test.each([
    [45, "up 45m"], // typical sub-hour
    [59, "up 59m"], // sub-hour ceiling
  ])("sub-hour %p minutes shows minutes only", (minutes, expected) => {
    expect(formatUptime(minutes * 60)).toBe(expected)
  })

  test("exactly one hour shows hours and minutes", () => {
    expect(formatUptime(60 * 60)).toBe("up 1h 0m")
  })

  test("five hours thirty shows hours and minutes", () => {
    expect(formatUptime(5 * 3600 + 30 * 60)).toBe("up 5h 30m")
  })

  test("exactly one day shows days, hours and minutes", () => {
    expect(formatUptime(24 * 3600)).toBe("up 1d 0h 0m")
  })

  // ----- Days present: every smaller unit is shown even at zero -----
  test.each([
    [26, 15, "up 1d 2h 15m"], // 26h 15m = 1d 2h 15m
    [48, 0, "up 2d 0h 0m"], // 48h = 2d 0h 0m
  ])("%p hours %p minutes shows days, hours and minutes", (hours, minutes, expected) => {
    expect(formatUptime(hours * 3600 + minutes * 60)).toBe(expected)
  })
})

describe("what the TimeSpan port had to decide for itself", () => {
  test("a seconds remainder is dropped, never rounded up", () => {
    // 45m 59s is still 45m. Rounding would make a clock tick a minute early.
    expect(formatUptime(45 * 60 + 59)).toBe("up 45m")
  })

  test("a negative count truncates toward zero, as TimeSpan's components do", () => {
    // .NET: TimeSpan.FromSeconds(-330) is Minutes = -5, Seconds = -30. The REMAINDER is what makes
    // this case discriminate: -300s reads "up -5m" under Math.floor as well, because JS % keeps the
    // dividend's sign and -5 is already an integer. Measured -- a floor mutant survived the round
    // number and dies on this one.
    expect(formatUptime(-5 * 60)).toBe("up -5m")
    expect(formatUptime(-5 * 60 - 30)).toBe("up -5m")
  })
})
