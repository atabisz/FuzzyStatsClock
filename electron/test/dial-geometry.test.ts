/**
 * `dial-geometry.ts` against the recorded .NET values.
 *
 * ## What these rows do and do not prove
 *
 * The dial is the one part of Phase 4 the probe **transcribes** rather than compiles: `InitDialDecorations`
 * and `UpdateDialDisplay` are private methods on a 2221-line `MainWindow` with a tray icon and a settings
 * service behind it, so the probe re-states their two formulas instead of calling them. Both
 * `GeomProbe.cs`'s header and `dial-geometry.ts`'s say so, and so does this one.
 *
 * So what is measured here is **.NET's `Math.Sin`/`Math.Cos` against V8's**, at the exact arguments the
 * three loops produce -- which is the part that could genuinely differ between the two runtimes, and the
 * part no amount of reading the C# would settle. It is *not* proof that the transcription matches
 * MainWindow. That claim is carried by the eyes-on arm of ISC-21, not by this file.
 *
 * The comparison is exact (`toBe`) and that was called a deliberate risk here, with the remedy written
 * down in advance: if any of these ever drifts by an ulp on another machine or another V8, record the
 * disagreement and loosen *that* row with the measurement attached, rather than pre-emptively softening
 * all of them. IEEE-754 does not mandate bit-identical transcendentals, so a green run here is a finding
 * about particular implementations rather than a guarantee.
 *
 * **That risk materialised on 2026-08-30, and {@link ARCH_DIVERGENT} is the prescribed remedy applied.**
 * The suite had only ever run on Windows x64; its first run on macOS arm64 (bun 1.4.0 on both, so the
 * variable is the architecture's libm and not the runtime) failed 7 tests. Enumerating every field rather
 * than chasing them one at a time gave the true extent: **13 of 376 fields, each by 1 to 4 ulps**, largest
 * absolute disagreement 1.42e-14 on a dial 80 units across -- about one part in 5.6e15, which no renderer
 * and no screen can express. So the divergence is real, bounded, and enumerated, and the table below
 * carries both architectures' exact doubles for each of the thirteen.
 *
 * `dial-num 12` is the row that makes this worth having, and it did NOT diverge: `Math.sin(2 * Math.PI)`
 * is -2.4492935982947064e-16, not 0, so the "12" glyph sits at x 39.999999999999993 -- and .NET on x64,
 * V8 on x64 and V8 on arm64 all agree on that, digit for digit.
 *
 * ## ISC-22's discriminator lives here
 *
 * The port animates the hands with a CSS `transform: rotate()` rather than rewriting `x2`/`y2` per frame.
 * That is only legitimate if rotating the upward-pointing point about the dial centre lands exactly where
 * `UpdateDialDisplay`'s trigonometry puts it. `rotateUpwardPoint` writes the rotation matrix out as
 * arithmetic so that equivalence is a test rather than a comment -- see the last block.
 */
import { describe, expect, test } from "bun:test"
import {
  DIAL_CENTER_X,
  DIAL_CENTER_Y,
  DIAL_SIZE,
  HOUR_HAND_LENGTH,
  MINUTE_HAND_LENGTH,
  handEndpoint,
  handEndpoints,
  handTransform,
  hourNumbers,
  hourTicks,
  minuteDots,
  rotateUpwardPoint,
} from "../src/core/dial-geometry.js"
import { hourAngleDegrees, minuteAngleDegrees } from "../src/core/dial.js"
import { geometryFixture, num, rows } from "./lib/wpf-fixture.js"

const fixture = geometryFixture()

/**
 * The thirteen coordinates where a macOS arm64 host disagrees with the x64-recorded fixture.
 *
 * Each entry is `[recorded, arm64]` -- both **exact** doubles, measured on 2026-08-30 by comparing all 376
 * fixture fields on an M-series host (macOS 26.6.2, bun 1.4.0) against the same suite's Windows x64 run.
 * Nothing here is a tolerance: the assertion still demands an exact match, just against a two-element set
 * instead of one value. A third value -- a real geometry regression -- still fails, which a `toBeCloseTo`
 * would have quietly absorbed. That is the whole reason for the shape.
 *
 * The keys read `<tag>.<index>.<field>`, matching the fixture's own tags. Deriving `arm64` from `recorded`
 * by "add two ulps" was considered and rejected: the ulp step changes size at every power of two (see
 * `dial-dot.56`, where `top` moves 4 ulps and `cy` 2 for the same 3.55e-15 of absolute drift, because 7.02
 * and 8.02 sit either side of 8), so a derived value would be a guess dressed as a measurement.
 */
const ARCH_DIVERGENT = new Map<string, readonly [number, number]>([
  ["dial-tick.8.x1", [13.153212482682406, 13.15321248268241]],
  ["dial-tick.8.x2", [8.823085463760215, 8.823085463760219]],
  ["dial-dot.11.left", [70.97409101749103, 70.97409101749102]],
  ["dial-dot.11.cx", [71.97409101749103, 71.97409101749102]],
  ["dial-dot.40.left", [8.689110867544652, 8.689110867544656]],
  ["dial-dot.40.cx", [9.689110867544652, 9.689110867544656]],
  ["dial-dot.56.top", [7.025908982508966, 7.02590898250897]],
  ["dial-dot.56.cy", [8.025908982508966, 8.02590898250897]],
  ["dial-num.4.top", [47.99999999999999, 48]],
  ["dial-num.4.cy", [52.49999999999999, 52.5]],
  ["dial-num.8.left", [14.349364905389038, 14.349364905389042]],
  ["dial-num.8.cx", [18.349364905389038, 18.34936490538904]],
  ["dial-hand.13:5.hourX2", [53.43249020867059, 53.4324902086706]],
])

/**
 * Assert one coordinate against the fixture: exactly, unless it is one of the thirteen.
 *
 * For a listed field both assertions matter and they catch different things. `toContain(recorded)` keeps
 * the table honest -- if the fixture is ever regenerated and a recorded value moves, the pair no longer
 * describes it and this fails rather than silently accepting whatever the host produced. `toContain(actual)`
 * is the real check: the host must produce one of the two architectures' values and not a third.
 *
 * A missing coordinate falls through to the exact assertion deliberately: `undefined` is not one of the
 * two values, so the listed rows must not quietly treat "the array was short" as a pass. It is also what
 * satisfies `toContain`'s element type without a cast.
 */
function expectCoordinate(key: string, actual: number | undefined, recorded: number): void {
  const pair = ARCH_DIVERGENT.get(key)
  if (pair === undefined || actual === undefined) {
    expect(actual).toBe(recorded)
    return
  }
  expect(pair).toContain(recorded)
  expect(pair).toContain(actual)
}

describe("hour ticks, every endpoint measured", () => {
  const ticks = hourTicks()

  // dial-tick: hour, x1, y1, x2, y2
  test.each(
    rows(fixture, "dial-tick").map((r) => ({
      hour: num(r, 0),
      x1: num(r, 1),
      y1: num(r, 2),
      x2: num(r, 3),
      y2: num(r, 4),
    })),
  )("tick $hour", (row) => {
    const tick = ticks[row.hour]
    expect(tick).toBeDefined()
    expectCoordinate(`dial-tick.${String(row.hour)}.x1`, tick?.x1, row.x1)
    expectCoordinate(`dial-tick.${String(row.hour)}.y1`, tick?.y1, row.y1)
    expectCoordinate(`dial-tick.${String(row.hour)}.x2`, tick?.x2, row.x2)
    expectCoordinate(`dial-tick.${String(row.hour)}.y2`, tick?.y2, row.y2)
  })

  test("there are twelve, and index 0 points straight up", () => {
    expect(ticks).toHaveLength(12)
    // sin(0) is exactly 0 and cos(0) exactly 1, so this row is the one with no floating-point residue --
    // which makes it the one that would catch a swapped sin/cos or a sign error outright.
    expect(ticks[0]).toEqual({ x1: 40, y1: 9, x2: 40, y2: 4 })
  })
})

describe("minute dots, every position measured", () => {
  const dots = minuteDots()

  // dial-dot: minute, left, top, cx, cy
  test.each(
    rows(fixture, "dial-dot").map((r) => ({
      minute: num(r, 0),
      left: num(r, 1),
      top: num(r, 2),
      cx: num(r, 3),
      cy: num(r, 4),
    })),
  )("dot $minute", (row) => {
    const dot = dots[row.minute]
    expect(dot).toBeDefined()
    expectCoordinate(`dial-dot.${String(row.minute)}.cx`, dot?.cx, row.cx)
    expectCoordinate(`dial-dot.${String(row.minute)}.cy`, dot?.cy, row.cy)
    // The WPF placement is the centre minus half the 2.0 dot size. An SVG circle wants the centre, so
    // both are carried: the fixture records `left`/`top` and the renderer uses `cx`/`cy`.
    expectCoordinate(`dial-dot.${String(row.minute)}.left`, dot?.left, row.left)
    expectCoordinate(`dial-dot.${String(row.minute)}.top`, dot?.top, row.top)
  })

  test("there are sixty, and each sits one unit up-left of its centre", () => {
    expect(dots).toHaveLength(60)
    for (const dot of dots) {
      expect(dot.cx - dot.left).toBe(1)
      expect(dot.cy - dot.top).toBe(1)
    }
  })
})

describe("hour numbers, every position measured", () => {
  const numbersOnDial = hourNumbers()

  // dial-num: hour, left, top, cx, cy
  test.each(
    rows(fixture, "dial-num").map((r) => ({
      hour: num(r, 0),
      left: num(r, 1),
      top: num(r, 2),
      cx: num(r, 3),
      cy: num(r, 4),
    })),
  )("number $hour", (row) => {
    // The C# loop runs 1..12, so the list is offset by one from the hour it draws. Asserted through the
    // label rather than by trusting the index: an off-by-one here would put "12" at one o'clock, which
    // is the kind of wrong that looks fine in a screenshot of a round clock face.
    const placed = numbersOnDial[row.hour - 1]
    expect(placed).toBeDefined()
    expect(placed?.text).toBe(String(row.hour))
    expectCoordinate(`dial-num.${String(row.hour)}.cx`, placed?.cx, row.cx)
    expectCoordinate(`dial-num.${String(row.hour)}.cy`, placed?.cy, row.cy)
    expectCoordinate(`dial-num.${String(row.hour)}.left`, placed?.left, row.left)
    expectCoordinate(`dial-num.${String(row.hour)}.top`, placed?.top, row.top)
  })

  test("the last entry is 12 and it is at the top", () => {
    expect(numbersOnDial).toHaveLength(12)
    const twelve = numbersOnDial[11]
    expect(twelve?.text).toBe("12")
    // Not 40: sin(2*PI) is -2.4492935982947064e-16, so the glyph is a quarter of a femtometre left of
    // centre in both runtimes. Pinned exactly because it is the sharpest available agreement between
    // .NET's and V8's sin.
    expect(twelve?.cx).toBe(39.999999999999993)
    expect(twelve?.cy).toBe(15)
  })
})

describe("hands, measured at ten times", () => {
  // dial-hand: hour, minute, hourX2, hourY2, minuteX2, minuteY2
  test.each(
    rows(fixture, "dial-hand").map((r) => ({
      hour: num(r, 0),
      minute: num(r, 1),
      hourX2: num(r, 2),
      hourY2: num(r, 3),
      minuteX2: num(r, 4),
      minuteY2: num(r, 5),
    })),
  )("$hour:$minute", (row) => {
    // These rows go through the probe's call to FuzzyClock.Core.DialGeometry, so they cross-check the
    // already-translated `dial.ts` angle functions at the same time as the endpoint arithmetic here.
    const ends = handEndpoints(row.hour, row.minute)
    const at = `dial-hand.${String(row.hour)}:${String(row.minute)}`
    expectCoordinate(`${at}.hourX2`, ends.hour.x, row.hourX2)
    expectCoordinate(`${at}.hourY2`, ends.hour.y, row.hourY2)
    expectCoordinate(`${at}.minuteX2`, ends.minute.x, row.minuteX2)
    expectCoordinate(`${at}.minuteY2`, ends.minute.y, row.minuteY2)
  })

  test("the hour hand is shorter than the minute hand", () => {
    // Trivial-looking, and it is the one error that survives every numeric check above if the two
    // lengths are swapped at the call site rather than in the formula.
    expect(HOUR_HAND_LENGTH).toBeLessThan(MINUTE_HAND_LENGTH)
    const ends = handEndpoints(3, 0)
    expect(ends.hour.x).toBe(DIAL_CENTER_X + HOUR_HAND_LENGTH)
    expect(ends.minute.y).toBe(DIAL_CENTER_Y - MINUTE_HAND_LENGTH)
  })
})

describe("ISC-22: a CSS rotation is the same point as the WPF arithmetic", () => {
  test("rotating the upward point equals recomputing the endpoint, exactly", () => {
    // Every 0.5 degrees through two full turns, plus the negatives -- 1441 angles per hand. If these
    // agreed only approximately, animating `transform` would drift the hand away from where the C# draws
    // it, and the port would have to write x2/y2 per frame instead. They agree bit for bit because the
    // rotation matrix applied to (0, -L) reduces to the same two products in the same order.
    for (let deg = -360; deg <= 360; deg += 0.5) {
      for (const length of [HOUR_HAND_LENGTH, MINUTE_HAND_LENGTH]) {
        const rotated = rotateUpwardPoint(deg, length)
        const computed = handEndpoint(deg, length)
        expect(rotated.x).toBe(computed.x)
        expect(rotated.y).toBe(computed.y)
      }
    }
  })

  test("the same holds at every angle the clock can actually show", () => {
    // 720 hour positions and 60 minute positions, i.e. the whole reachable set rather than a sample.
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute++) {
        const hourDeg = hourAngleDegrees(hour, minute)
        const minuteDeg = minuteAngleDegrees(minute)
        expect(rotateUpwardPoint(hourDeg, HOUR_HAND_LENGTH)).toEqual(
          handEndpoint(hourDeg, HOUR_HAND_LENGTH),
        )
        expect(rotateUpwardPoint(minuteDeg, MINUTE_HAND_LENGTH)).toEqual(
          handEndpoint(minuteDeg, MINUTE_HAND_LENGTH),
        )
      }
    }
  })

  test("the transform is the SVG attribute form: unitless, with the centre in it", () => {
    // The two forms are not interchangeable and each rejects the other's syntax. SVG's `transform`
    // attribute takes `rotate(45)` or `rotate(45 cx cy)` and treats `45deg` as a parse error; CSS's
    // `transform` property requires the unit and drops the whole declaration without it. Either mistake
    // leaves the hand pointing at twelve forever, which is why this is pinned as a string.
    //
    // The attribute is what the renderer writes -- see `handTransform`'s own note on the CSP.
    expect(handTransform(0)).toBe("rotate(0 40 40)")
    expect(handTransform(359.5)).toBe("rotate(359.5 40 40)")
    expect(handTransform(-90)).toBe("rotate(-90 40 40)")
    expect(handTransform(90)).not.toContain("deg")
  })

  test("the rotation centre in the string is the dial centre", () => {
    // Written as literals in the function, so this is the arm that catches them drifting from the
    // constants the ticks, dots and numbers are all placed against.
    expect(handTransform(12)).toBe(`rotate(12 ${String(DIAL_CENTER_X)} ${String(DIAL_CENTER_Y)})`)
  })
})

describe("everything lands inside the 80x80 face", () => {
  test("no tick, dot or number escapes the canvas", () => {
    // The dial canvas is a fixed 80x80 with no clip, so anything outside it would be drawn over the row
    // above rather than being cut off. The numbers get the widest allowance because their offsets place
    // a glyph box, not a point.
    expect(DIAL_SIZE).toBe(80)
    for (const t of hourTicks()) {
      for (const v of [t.x1, t.y1, t.x2, t.y2]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(DIAL_SIZE)
      }
    }
    for (const d of minuteDots()) {
      expect(d.left).toBeGreaterThanOrEqual(0)
      expect(d.top).toBeGreaterThanOrEqual(0)
      expect(d.left + 2).toBeLessThanOrEqual(DIAL_SIZE)
      expect(d.top + 2).toBeLessThanOrEqual(DIAL_SIZE)
    }
    for (const n of hourNumbers()) {
      expect(n.left).toBeGreaterThanOrEqual(0)
      expect(n.top).toBeGreaterThanOrEqual(0)
      expect(n.left).toBeLessThanOrEqual(DIAL_SIZE)
      expect(n.top).toBeLessThanOrEqual(DIAL_SIZE)
    }
  })
})
