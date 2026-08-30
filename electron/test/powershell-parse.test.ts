/**
 * Where every expectation in this file comes from.
 *
 * | Expectation | Provenance |
 * |---|---|
 * | `batt 100 2` is the line shape | **Measured on this host**, `cat -A` on the real loop: `batt 100 2^M$` |
 * | `EstimatedChargeRemaining` is a plain integer percent | Measured: `charge='100'`, one instance |
 * | `BatteryStatus` 2 means on-mains | Measured (this host was plugged in); the rest of the map is documented only |
 * | `-1`/out-of-range → `N/A` | `StatsService.cs:108-128`, the `BatteryLifePercent > 1.0f` (0xFF) guard |
 * | no battery → `percent` unavailable **and** not plugged in | `StatsService.cs:70-90`, the `NoSystemBattery` branch |
 *
 * The line endings matter and are tested: the child emits CRLF, measured, and `win32.ts`'s existing `ingest`
 * splits on `/\r?\n/` — so a parser that only tolerated LF would work in every unit test and fail against the
 * real child. That arm exists because the format was measured through `cat -A` rather than eyeballed.
 */

import { describe, expect, test } from "bun:test"
import { UNAVAILABLE } from "../src/shared.js"
import { acFromBatteryStatus, parseBatteryLine } from "../src/main/telemetry/parse/powershell.js"

describe("parseBatteryLine — the measured line", () => {
  test("the exact line this host emits", () => {
    // Byte-for-byte what `cat -A` showed, minus the CRLF the caller strips.
    expect(parseBatteryLine("batt 100 2")).toEqual({ percent: 100, acFromStatus: true })
  })

  test("a trailing CR survives, because the child emits CRLF", () => {
    // `batt 100 2^M$` was the measured output. If `\r` reached `parseInt` on the status field it would still
    // parse -- `parseInt("2\r")` is 2 -- so the arm that actually discriminates is the percent field, where a
    // stray `\r` would have to be tolerated by the trim rather than by luck.
    expect(parseBatteryLine("batt 100 2\r")).toEqual({ percent: 100, acFromStatus: true })
    expect(parseBatteryLine("batt 47 1\r")).toEqual({ percent: 47, acFromStatus: false })
  })

  test("a discharging laptop reads its percentage with no plug", () => {
    // Status 1 is "Other", which in CIM_Battery means discharging. Unmeasured on this host by necessity --
    // it cannot be unplugged from a tool call -- so this pins the documented mapping, not an observation.
    expect(parseBatteryLine("batt 63 1")).toEqual({ percent: 63, acFromStatus: false })
  })
})

describe("parseBatteryLine — the absent battery", () => {
  test("`batt none` is unavailable AND not plugged in", () => {
    // Both halves are the C#'s, and the second is the surprising one: `StatsService.cs:70-90` sets
    // `IsPluggedIn = false` in the `NoSystemBattery` branch, so the WPF app reports a mains-powered DESKTOP
    // as "not plugged in". Parity is the bar, so that is what this reproduces rather than corrects.
    expect(parseBatteryLine("batt none")).toEqual({ percent: UNAVAILABLE, acFromStatus: false })
  })

  test("a NULL percentage is unavailable, not zero", () => {
    // The child substitutes -1 for a NULL `EstimatedChargeRemaining`. `0` would be a real reading of a flat
    // battery and must stay distinguishable -- `shared.ts`'s sentinel doc is explicit that collapsing the two
    // makes a broken counter look like an idle machine.
    expect(parseBatteryLine("batt -1 2")?.percent).toBe(UNAVAILABLE)
    expect(parseBatteryLine("batt 0 2")?.percent).toBe(0)
  })

  test("the 0xFF sentinel range is rejected", () => {
    // 255 is the raw byte `GetSystemPowerStatus` writes for "cannot tell". The CIM property should never
    // carry it, but the guard is the port of the C#'s and costs nothing.
    expect(parseBatteryLine("batt 255 2")?.percent).toBe(UNAVAILABLE)
    expect(parseBatteryLine("batt 101 2")?.percent).toBe(UNAVAILABLE)
    expect(parseBatteryLine("batt 100 2")?.percent).toBe(100) // the boundary is inclusive
  })
})

describe("parseBatteryLine — what is NOT a battery line", () => {
  test("null for anything untagged, because the child's stdout carries other traffic", () => {
    // Not an error case: PowerShell writes its own diagnostics to this stream, and the process count is
    // going to share it. A non-match has to be ordinary.
    expect(parseBatteryLine("")).toBeNull()
    expect(parseBatteryLine("proc 14")).toBeNull()
    expect(parseBatteryLine("Get-CimInstance : Access denied")).toBeNull()
    // Deliberately close to the real thing: the tag must match as a whole token.
    expect(parseBatteryLine("battery 100 2")).toBeNull()
  })

  test("a malformed `batt` line degrades to `N/A` rather than to null", () => {
    // The distinction this file cares about: `null` means "not mine", an unavailable reading means "mine, and
    // I could not read it". Returning null here would leave the previous value on screen forever.
    expect(parseBatteryLine("batt")).toEqual({ percent: UNAVAILABLE, acFromStatus: false })
    expect(parseBatteryLine("batt 100")).toEqual({ percent: UNAVAILABLE, acFromStatus: false })
    expect(parseBatteryLine("batt 100 2 3")).toEqual({ percent: UNAVAILABLE, acFromStatus: false })
  })

  test("a blank field does not shift the ones after it", () => {
    // THE ARM THIS PARSER EXISTS FOR. If the child ever emitted `batt  2` -- which naive string concatenation
    // over a NULL percentage produces -- then splitting and indexing would read the STATUS as the PERCENT.
    // The wrong reading is 2%, which is a plausible number a user would believe, and it would also drag a
    // low-battery alert on. `\s+` collapses the run, so the arity check is what catches it.
    const shifted = parseBatteryLine("batt  2")
    expect(shifted?.percent).not.toBe(2) // the specific wrong number, named
    expect(shifted?.percent).toBe(UNAVAILABLE)
  })
})

describe("acFromBatteryStatus", () => {
  test("the charging states are all on mains", () => {
    for (const status of [6, 7, 8, 9]) expect(acFromBatteryStatus(status)).toBe(true)
  })

  test("the discharging states are not", () => {
    // 1 Other/discharging, 4 Low, 5 Critical. These three are the ones where a wrong `true` would suppress
    // the low-battery alert, which is why the default arm errs the other way.
    for (const status of [1, 4, 5]) expect(acFromBatteryStatus(status)).toBe(false)
  })

  test("unknown and future codes default to on-battery", () => {
    expect(acFromBatteryStatus(0)).toBe(false) // our own NULL sentinel
    expect(acFromBatteryStatus(10)).toBe(false) // Undefined
    expect(acFromBatteryStatus(99)).toBe(false) // a Windows that grew a code
    expect(acFromBatteryStatus(Number.NaN)).toBe(false) // an unparseable field
  })

  test("2 is true and it is the only measured value in the map", () => {
    // Called out as its own arm so the one observation is not lost among ten assumptions.
    expect(acFromBatteryStatus(2)).toBe(true)
  })
})
