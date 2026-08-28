/**
 * Translated from FuzzyClock.Core.Tests/DialGeometryTests.cs -- all 6 cases, same angles.
 *
 * The C# asserts with a 1e-9 delta; `toBeCloseTo(x, 9)` is a 0.5e-9 tolerance, so every assertion here
 * is at least as strict as the one it was translated from.
 *
 * The two interpolation cases are the ones with teeth: 3:15 must be 97.5° and not 90°, and 12:30 must
 * be 15° and not 0°. A port that dropped the `minute / 720` term passes all four cardinal rows.
 */
import { describe, expect, test } from "bun:test"
import { hourAngleDegrees, minuteAngleDegrees } from "../src/core/dial.js"

describe("dial angles, translated from DialGeometryTests", () => {
  // ----- Cardinal hour positions (minute = 0, no interpolation) -----
  test.each([
    [12, 0, 0.0, 0.0], // 12:00 -- both hands at the top
    [3, 0, 90.0, 0.0], // 3:00  -- hour at 90 (right)
    [6, 0, 180.0, 0.0], // 6:00  -- hour at 180 (bottom)
    [9, 0, 270.0, 0.0], // 9:00  -- hour at 270 (left)
  ])("%p:%p is at the cardinal angles", (hour, minute, expectedHour, expectedMinute) => {
    expect(hourAngleDegrees(hour, minute)).toBeCloseTo(expectedHour, 9)
    expect(minuteAngleDegrees(minute)).toBeCloseTo(expectedMinute, 9)
  })

  test("3:15 interpolates the hour hand past the hour", () => {
    // hour: ((3 % 12) / 12 + 15 / 720) * 360 = (0.25 + 0.0208333...) * 360 = 97.5
    // minute: (15 / 60) * 360 = 90
    expect(hourAngleDegrees(3, 15)).toBeCloseTo(97.5, 9)
    expect(minuteAngleDegrees(15)).toBeCloseTo(90.0, 9)
  })

  test("12:30 interpolates from zero, not from 360", () => {
    // hour: ((12 % 12) / 12 + 30 / 720) * 360 = (0 + 0.0416666...) * 360 = 15
    // minute: (30 / 60) * 360 = 180
    expect(hourAngleDegrees(12, 30)).toBeCloseTo(15.0, 9)
    expect(minuteAngleDegrees(30)).toBeCloseTo(180.0, 9)
  })
})
