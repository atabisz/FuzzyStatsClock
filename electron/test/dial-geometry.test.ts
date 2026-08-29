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
 * The comparison is exact (`toBe`) and that is a deliberate risk: if any of these ever drifts by an ulp
 * on another machine or another V8, the honest fix is to record the disagreement and loosen *that* row
 * with the measurement attached, not to pre-emptively soften all of them. IEEE-754 does not mandate
 * bit-identical transcendentals, so a green run here is a finding about these two implementations rather
 * than a guarantee. `dial-num 12` is the row that makes this worth having: `Math.sin(2 * Math.PI)` is
 * -2.4492935982947064e-16, not 0, so the "12" glyph sits at x 39.999999999999993 -- and both runtimes
 * agree on that, digit for digit.
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
    expect(tick?.x1).toBe(row.x1)
    expect(tick?.y1).toBe(row.y1)
    expect(tick?.x2).toBe(row.x2)
    expect(tick?.y2).toBe(row.y2)
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
    expect(dot?.cx).toBe(row.cx)
    expect(dot?.cy).toBe(row.cy)
    // The WPF placement is the centre minus half the 2.0 dot size. An SVG circle wants the centre, so
    // both are carried: the fixture records `left`/`top` and the renderer uses `cx`/`cy`.
    expect(dot?.left).toBe(row.left)
    expect(dot?.top).toBe(row.top)
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
    expect(placed?.cx).toBe(row.cx)
    expect(placed?.cy).toBe(row.cy)
    expect(placed?.left).toBe(row.left)
    expect(placed?.top).toBe(row.top)
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
    expect(ends.hour.x).toBe(row.hourX2)
    expect(ends.hour.y).toBe(row.hourY2)
    expect(ends.minute.x).toBe(row.minuteX2)
    expect(ends.minute.y).toBe(row.minuteY2)
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

  test("the transform string is a CSS angle, not a bare number", () => {
    // SVG's `transform` attribute takes `rotate(45)` and CSS's `transform` property takes `rotate(45deg)`
    // -- and a bare number in the CSS property is invalid and silently drops the whole declaration, so
    // the hand would simply never move. The port animates via CSS, hence the unit.
    expect(handTransform(0)).toBe("rotate(0deg)")
    expect(handTransform(359.5)).toBe("rotate(359.5deg)")
    expect(handTransform(-90)).toBe("rotate(-90deg)")
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
