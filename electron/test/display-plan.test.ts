/**
 * `display-plan.ts` -- the decisions the renderer makes before it touches an element.
 *
 * ## What these tests can and cannot prove
 *
 * They prove the *decisions*: which face, how many lines, which character in which slot, which colon is
 * lit on frame one, what the Nixie shows when the settings say 24-hour. Every one of those is a pure
 * function over `(now, settings)` and every one is a place the C# does something a reimplementation would
 * get wrong by being reasonable.
 *
 * They prove nothing about painting. There is no DOM library here, so "the element ended up with that
 * text" is `scripts/probe-display.ts`'s job, against the real built app over CDP. The split is deliberate
 * and it is the only way a renderer gets unit-tested in this repo.
 *
 * ## Dates are constructed, not mocked
 *
 * `new Date(2026, 7, 30, 13, 5, 9)` is local time, which is what `DateTime.Now` is. No timezone
 * manipulation anywhere: every function here reads only `getHours`/`getMinutes`/`getSeconds`, so a
 * constructed local date is the exact input shape and the tests are stable in any zone.
 */
import { describe, expect, test } from "bun:test"
import {
  COLON2_ALWAYS_ON,
  FACES,
  FACE_CONTAINER_IDS,
  FIRST_FRAME_COLON1_ON,
  activeFace,
  dialPlan,
  lcdPlan,
  nixieDigits,
  phraseLines,
  wpfVisibleFaces,
  type Face,
} from "../src/core/display-plan.js"
import { DEFAULTS, LCD_STYLES, TEXT_STYLES, type AppSettings, type ClockType } from "../src/core/settings.js"
import { STATS_PANEL_WIDTH, wrapThreshold } from "../src/core/text-metrics.js"
import { hourAngleDegrees, minuteAngleDegrees } from "../src/core/dial.js"
import { formatLcdTime } from "../src/core/lcd-time-format.js"
import { computeSplit, type PhraseSplit } from "../src/core/phrase-wrap.js"
import { DIAL_CENTER_X, DIAL_CENTER_Y, HOUR_HAND_LENGTH, MINUTE_HAND_LENGTH, handEndpoints, rotateUpwardPoint } from "../src/core/dial-geometry.js"

const settings = (overrides: Partial<AppSettings>): AppSettings => ({ ...DEFAULTS, ...overrides })
const CLOCK_TYPES: readonly ClockType[] = ["phrase", "dial", "lcd", "nixie"]

/** `computeSplit`'s result in `phraseLines`' shape, so the two can be compared without null-handling noise. */
const splitLines = (split: PhraseSplit | null): readonly string[] | null =>
  split === null ? null : [split.line1, split.line2]

describe("face selection", () => {
  test("every clock type resolves to exactly one face, and Split is the phrase type's second", () => {
    // `SetClockType` collapses all five and makes one visible, so "exactly one" is the invariant and not
    // an implementation convenience. The phrase type is the only one with two faces.
    for (const textStyle of TEXT_STYLES) {
      expect(activeFace(settings({ clockType: "dial", textStyle }))).toBe("dial")
      expect(activeFace(settings({ clockType: "lcd", textStyle }))).toBe("lcd")
      expect(activeFace(settings({ clockType: "nixie", textStyle }))).toBe("nixie")
      expect(activeFace(settings({ clockType: "phrase", textStyle }))).toBe(
        textStyle === "Split" ? "split" : "phrase",
      )
    }
  })

  test("the text style is the ONLY thing that moves the phrase type between its two faces", () => {
    // Sweeping the rest of the size- and paint-affecting settings, because a face chosen off the wrong
    // field renders the right clock in the wrong container and the window is then sized for a hidden one.
    for (const lcdStyle of LCD_STYLES) {
      for (const fontSize of [16, 24, 32, 40]) {
        for (const statsVisible of [true, false]) {
          const base = { clockType: "phrase" as const, lcdStyle, fontSize, statsVisible }
          expect(activeFace(settings({ ...base, textStyle: "Split" }))).toBe("split")
          expect(activeFace(settings({ ...base, textStyle: "Classic" }))).toBe("phrase")
        }
      }
    }
  })

  test("every face has a container id, all five are distinct, and FACES is complete", () => {
    expect(FACES).toHaveLength(5)
    const ids = FACES.map((f) => FACE_CONTAINER_IDS[f])
    expect(new Set(ids).size).toBe(5)
    expect(ids).toEqual(["phraseFace", "splitFace", "dialFace", "lcdFace", "nixieFace"])
    // And nothing reachable through the settings falls outside FACES.
    for (const clockType of CLOCK_TYPES) {
      for (const textStyle of TEXT_STYLES) {
        expect(FACES).toContain(activeFace(settings({ clockType, textStyle })))
      }
    }
  })
})

describe("the two-faces-at-once divergence, recorded not reproduced", () => {
  test("WPF shows a phrase element OVER the digit view after a text-style change", () => {
    // `SetTextStyle`'s visibility block is guarded `if (_clockType != ClockType.Dial)` and nothing else
    // (`MainWindow.xaml.cs:1895`). With Lcd or Nixie showing it makes PhraseText or SplitPhrasePanel
    // Visible and leaves the digit view Visible, so both paint until the next `SetClockType`.
    expect(wpfVisibleFaces("lcd", "Classic")).toEqual(["phrase", "lcd"])
    expect(wpfVisibleFaces("lcd", "Split")).toEqual(["split", "lcd"])
    expect(wpfVisibleFaces("nixie", "Mono")).toEqual(["phrase", "nixie"])
    expect(wpfVisibleFaces("nixie", "Split")).toEqual(["split", "nixie"])
  })

  test("the dial is the one guarded case, so it never doubles up", () => {
    for (const textStyle of TEXT_STYLES) {
      expect(wpfVisibleFaces("dial", textStyle)).toEqual(["dial"])
    }
  })

  test("the phrase type is single either way, because its two faces are mutually exclusive there", () => {
    for (const textStyle of TEXT_STYLES) {
      const visible = wpfVisibleFaces("phrase", textStyle)
      expect(visible).toHaveLength(1)
      expect(visible[0]).toBe(activeFace(settings({ clockType: "phrase", textStyle })))
    }
  })

  test("the port diverges exactly where WPF doubles up, and nowhere else", () => {
    // The comparison stated as data rather than as prose: `activeFace` agrees with the C# on 8 of the 16
    // (clockType, textStyle) pairs and returns the single digit face on the other 8, where the C# has two.
    let agree = 0
    let diverge = 0
    for (const clockType of CLOCK_TYPES) {
      for (const textStyle of TEXT_STYLES) {
        const wpf = wpfVisibleFaces(clockType, textStyle)
        const port: Face = activeFace(settings({ clockType, textStyle }))
        if (wpf.length === 1) {
          expect(wpf[0]).toBe(port)
          agree++
        } else {
          // The digit face is what the port keeps; the phrase element is the one it declines to paint.
          expect(wpf).toHaveLength(2)
          expect(wpf[1]).toBe(port)
          diverge++
        }
      }
    }
    expect([agree, diverge]).toEqual([8, 8])
  })
})

describe("the phrase wrap decision", () => {
  const wrapContext = (over: Partial<Parameters<typeof phraseLines>[1]> = {}) => ({
    settings: settings({ clockType: "phrase", phraseWrapEnabled: true, phraseWrapStyle: "midpoint" }),
    measuredWidth: 300,
    resolvedLocale: "en-US",
    ...over,
  })

  test("the threshold is 202.4, and it is that whether the stats panel is showing or not", () => {
    // `panelWidth` is `StatsPanel.ActualWidth` when visible and the literal `184.0` when not -- and
    // StatsPanel has `Width="184"` in the markup, so both arms are 184. The C#'s conditional is therefore
    // a no-op, which is worth pinning: a port that used the *window* width when the panel was visible
    // would wrap at a different point in the two states.
    expect(wrapThreshold(STATS_PANEL_WIDTH)).toBeCloseTo(202.4, 10)
    const raw = "twenty-five past eleven"
    const atThreshold = phraseLines(raw, wrapContext({ measuredWidth: 202.4 }))
    expect(atThreshold).toEqual([raw])
    // Strictly greater: the C# is `if (PhraseText.ActualWidth > threshold)`.
    expect(phraseLines(raw, wrapContext({ measuredWidth: 202.5 }))).toHaveLength(2)
    // And an explicit panel width moves it, which is the only reason the parameter exists.
    expect(phraseLines(raw, wrapContext({ measuredWidth: 202.5, panelWidth: 400 }))).toEqual([raw])
  })

  test("each of the three guards forces one line on its own", () => {
    const raw = "twenty-five past eleven"
    // Not the phrase clock type: the digit and dial faces have no phrase element to wrap.
    for (const clockType of ["dial", "lcd", "nixie"] as const) {
      expect(
        phraseLines(raw, wrapContext({ settings: settings({ clockType, phraseWrapEnabled: true }) })),
      ).toEqual([raw])
    }
    // The Split style: it has its own two-element layout, so wrapping as well would give four lines.
    expect(
      phraseLines(
        raw,
        wrapContext({ settings: settings({ clockType: "phrase", textStyle: "Split", phraseWrapEnabled: true }) }),
      ),
    ).toEqual([raw])
    // Wrap disabled.
    expect(
      phraseLines(
        raw,
        wrapContext({ settings: settings({ clockType: "phrase", phraseWrapEnabled: false }) }),
      ),
    ).toEqual([raw])
    // And with all three satisfied it does wrap, so the assertions above are testing the guards and not
    // an unrelated refusal.
    expect(phraseLines(raw, wrapContext())).toHaveLength(2)
  })

  test("allowNatural tests for `en-` WITH the hyphen", () => {
    // `CurrentLocale.StartsWith("en-", StringComparison.Ordinal)`. So `en-US` and `en-GB` get the
    // pause-marker split and a bare `en` gets the midpoint. Reproduced including the hyphen, because that
    // is the string in the C# and the alternative reading ("any English locale") is the plausible one.
    //
    // The phrase is chosen so the two splits actually differ -- most do not. "half past eleven" gives
    // "half past" / "eleven" both ways, because its marker boundary IS its nearest-midpoint boundary, and
    // a test written on it would pass with `allowNatural` hardcoded either way.
    const raw = "almost twenty-five past eleven"
    const natural = { measuredWidth: 300, settings: settings({ clockType: "phrase", phraseWrapStyle: "natural" }) }
    const withHyphen = phraseLines(raw, wrapContext({ ...natural, resolvedLocale: "en-GB" }))
    const without = phraseLines(raw, wrapContext({ ...natural, resolvedLocale: "en" }))
    expect(withHyphen).toEqual(["almost", "twenty-five past eleven"])
    expect(without).toEqual(["almost twenty-five", "past eleven"])
    expect(withHyphen).not.toEqual(without)
    // Which is `computeSplit`'s third argument doing its job, and nothing else.
    expect(withHyphen).toEqual(splitLines(computeSplit(raw, "natural", true)) ?? [raw])
    expect(without).toEqual(splitLines(computeSplit(raw, "natural", false)) ?? [raw])
    // A non-English locale takes the midpoint even with the style set to natural.
    expect(phraseLines(raw, wrapContext({ ...natural, resolvedLocale: "de-DE" }))).toEqual(without)
    expect(phraseLines(raw, wrapContext({ ...natural, resolvedLocale: "en-US" }))).toEqual(withHyphen)
  })

  test("a split that comes back null leaves the long single line alone", () => {
    // `ComputeSplit` returns null for a one-word phrase and the C# only swaps the inlines
    // `if (split.HasValue)`. So a single very long word overflows rather than being broken mid-word.
    const oneWord = "Donaudampfschifffahrtsgesellschaftskapitaen"
    expect(computeSplit(oneWord, "midpoint")).toBeNull()
    expect(phraseLines(oneWord, wrapContext({ measuredWidth: 900 }))).toEqual([oneWord])
  })

  test("the two lines are exactly ComputeSplit's, unmodified", () => {
    // No trimming, no re-joining: `phraseLines` is a thin adapter and the wrap rules -- including the
    // leading-space and doubled-space behaviours `phrase-wrap.ts` measures -- belong to that module.
    for (const raw of ["twenty-five past eleven", " half past eleven", "half  past eleven", "nearly ten to three"]) {
      for (const style of ["midpoint", "natural"]) {
        const lines = phraseLines(raw, wrapContext({ settings: settings({ clockType: "phrase", phraseWrapStyle: style }) }))
        expect(lines).toEqual(splitLines(computeSplit(raw, style, true)) ?? [raw])
      }
    }
  })
})

describe("the LCD plan", () => {
  const now = new Date(2026, 7, 30, 13, 5, 9)

  test("the slots skip the colons in the formatted string rather than consuming them", () => {
    // The mapping is `time[0] time[1] _ time[3] time[4] _ time[6] time[7]`, and the two colon slots carry
    // `Character=":"` from `LcdClockView.xaml`. Indexing straight through the string instead would put a
    // colon glyph into a digit slot at every size -- plausible-looking and wrong.
    const plan = lcdPlan(now, settings({ lcdUse24Hr: true, lcdShowSeconds: true }), true)
    expect(plan.time).toBe("13:05:09")
    expect(plan.slots.map((s) => s.character)).toEqual(["1", "3", ":", "0", "5", ":", "0", "9"])
    // The characters come out of the formatter, not out of arithmetic done twice.
    expect(plan.time).toBe(formatLcdTime(now, true, true))
  })

  test("12-hour mode pads the hour with a SPACE, and the space reaches slot 0", () => {
    // `formatLcdTime` pads with " " rather than "0", so 1pm is " 1:05". `encodeSevenSegment(" ")` is the
    // all-off mask, which is how the blank tens digit renders. A port that padded with "0" would show
    // `01:05` -- the Nixie's behaviour, on the wrong face. Both are in this codebase; see `nixieDigits`.
    const plan = lcdPlan(now, settings({ lcdUse24Hr: false, lcdShowSeconds: true }), true)
    expect(plan.time).toBe(" 1:05:09")
    expect(plan.slots[0]?.character).toBe(" ")
    expect(plan.slots[1]?.character).toBe("1")
    // Noon and midnight both fold to 12, so slot 0 is a real digit there.
    expect(lcdPlan(new Date(2026, 7, 30, 0, 5, 9), settings({ lcdUse24Hr: false }), true).slots[0]?.character).toBe("1")
    expect(lcdPlan(new Date(2026, 7, 30, 12, 5, 9), settings({ lcdUse24Hr: false }), true).slots[0]?.character).toBe("1")
  })

  test("no seconds drops three slots, not two", () => {
    // `UpdateTime` collapses Colon2, D4 AND D5 -- and `Collapsed` is what removes them from the
    // StackPanel's width, which is the same fact `lcdViewSize` counts as four digits and one colon.
    const plan = lcdPlan(now, settings({ lcdUse24Hr: true, lcdShowSeconds: false }), true)
    expect(plan.time).toBe("13:05")
    expect(plan.slots).toHaveLength(5)
    expect(plan.slots.map((s) => s.character)).toEqual(["1", "3", ":", "0", "5"])
    expect(plan.slots.filter((s) => s.colonOn !== null)).toHaveLength(1)
  })

  test("exactly two slots are colons with seconds on, and they are at index 2 and 5", () => {
    const plan = lcdPlan(now, settings({ lcdShowSeconds: true }), true)
    const colonIndexes = plan.slots.flatMap((s, i) => (s.colonOn === null ? [] : [i]))
    expect(colonIndexes).toEqual([2, 5])
    for (const slot of plan.slots) {
      if (slot.colonOn === null) expect(slot.character).not.toBe(":")
      else expect(slot.character).toBe(":")
    }
  })

  test("Colon1 follows the caller's blink phase and Colon2 never does", () => {
    // `UpdateTime` assigns `Colon1.ColonOn` every tick and never assigns `Colon2.ColonOn` at all, so
    // Colon2 keeps `ColonOnProperty`'s registered default of `true`. Lit, permanently.
    for (const phase of [true, false]) {
      const plan = lcdPlan(now, settings({ lcdShowSeconds: true }), phase)
      expect(plan.slots[2]?.colonOn).toBe(phase)
      expect(plan.slots[5]?.colonOn).toBe(true)
    }
    expect(COLON2_ALWAYS_ON).toBe(true)
  })

  test("the first painted frame has Colon1 DARK and Colon2 lit", () => {
    // `private bool _colonVisible = true` and `UpdateTime` does `_colonVisible = !_colonVisible` BEFORE
    // assigning, so frame one is `ColonOn = false`. That is the frame a screenshot captures and the frame
    // a user sees on launch, and the opposite choice looks equally correct in isolation.
    expect(FIRST_FRAME_COLON1_ON).toBe(false)
    const first = lcdPlan(now, settings({ lcdShowSeconds: true }), FIRST_FRAME_COLON1_ON)
    expect(first.slots[2]?.colonOn).toBe(false)
    expect(first.slots[5]?.colonOn).toBe(true)
  })

  test("every minute of the day maps to slots the seven-segment encoder accepts", () => {
    // The sweep the mapping needs: any index slip shows up as a stray ":" or an empty string in a digit
    // slot, and only at some times of day -- ` 1:05` and `13:05` differ in exactly the place a
    // pad-with-space bug hides.
    for (const use24Hr of [true, false]) {
      for (const showSeconds of [true, false]) {
        const s = settings({ lcdUse24Hr: use24Hr, lcdShowSeconds: showSeconds })
        for (let minutes = 0; minutes < 1440; minutes++) {
          const at = new Date(2026, 7, 30, Math.floor(minutes / 60), minutes % 60, 37)
          const plan = lcdPlan(at, s, true)
          expect(plan.slots).toHaveLength(showSeconds ? 8 : 5)
          for (const [index, slot] of plan.slots.entries()) {
            if (index === 2 || index === 5) continue
            expect(slot.character === " " || /^[0-9]$/.test(slot.character)).toBe(true)
          }
        }
      }
    }
  })
})

describe("the Nixie digits", () => {
  test("always 12-hour, four digits, no seconds, whatever the settings say", () => {
    // `NixieClockView.UpdateTime` has no Use24Hr and no ShowSeconds property at all -- its body is
    // `int h = now.Hour % 12; if (h == 0) h = 12;` and four assignments. So a settings file with
    // `lcdUse24Hr` true renders 24-hour on the LCD face and 12-hour on the Nixie. The two faces genuinely
    // disagree in the shipped app; matching that is the parity bar, not a bug to fix.
    const afternoon = new Date(2026, 7, 30, 13, 5, 9)
    expect(nixieDigits(afternoon)).toEqual([0, 1, 0, 5])
    expect(nixieDigits(afternoon)).toHaveLength(4)
  })

  test("pads the hour with a LEADING ZERO, unlike the LCD face's space", () => {
    // `h / 10` is integer division in C#, so 1 o'clock is `0 1`. The LCD face pads with a space in
    // 12-hour mode. Both are in this codebase and they disagree on purpose.
    const one = new Date(2026, 7, 30, 1, 5, 0)
    expect(nixieDigits(one)[0]).toBe(0)
    expect(lcdPlan(one, { ...DEFAULTS, lcdUse24Hr: false }, true).slots[0]?.character).toBe(" ")
  })

  test("midnight and noon are both 12", () => {
    expect(nixieDigits(new Date(2026, 7, 30, 0, 0, 0))).toEqual([1, 2, 0, 0])
    expect(nixieDigits(new Date(2026, 7, 30, 12, 0, 0))).toEqual([1, 2, 0, 0])
    expect(nixieDigits(new Date(2026, 7, 30, 23, 59, 0))).toEqual([1, 1, 5, 9])
  })

  test("every minute gives four digits in 0..9, and the hour pair reads 01..12", () => {
    const seen = new Set<string>()
    for (let minutes = 0; minutes < 1440; minutes++) {
      const digits = nixieDigits(new Date(2026, 7, 30, Math.floor(minutes / 60), minutes % 60, 0))
      for (const d of digits) {
        expect(Number.isInteger(d)).toBe(true)
        expect(d).toBeGreaterThanOrEqual(0)
        expect(d).toBeLessThanOrEqual(9)
      }
      seen.add(`${String(digits[0])}${String(digits[1])}`)
      expect(digits[2] * 10 + digits[3]).toBe(minutes % 60)
    }
    // Twelve distinct hour pairs and no "00": the fold means 12 appears where 0 would have.
    expect([...seen].sort()).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"])
  })
})

describe("the dial plan", () => {
  test("the two angles are the geometry module's, on the raw 24-hour value", () => {
    const now = new Date(2026, 7, 30, 13, 30, 0)
    expect(dialPlan(now)).toEqual({
      hourAngle: hourAngleDegrees(13, 30),
      minuteAngle: minuteAngleDegrees(30),
    })
    // 13:30 and 01:30 are the same hand position -- the `% 12` is inside `hourAngleDegrees`, which is
    // where the C# has it too.
    expect(dialPlan(now).hourAngle).toBe(dialPlan(new Date(2026, 7, 30, 1, 30, 0)).hourAngle)
    // And the hour hand interpolates, so it is not on the hour mark at half past.
    expect(dialPlan(now).hourAngle).not.toBe(hourAngleDegrees(13, 0))
  })

  test("rotating a hand drawn straight up lands exactly where the C# puts the endpoint", () => {
    // The licence for animating `transform` instead of `X2`/`Y2`. `UpdateDialDisplay` assigns
    // `40 + L*Sin(rad)` / `40 - L*Cos(rad)`; this port draws each hand from (40,40) to (40, 40-L) and
    // rotates it. Checked at every minute of the twelve-hour cycle, because the two forms agreeing at
    // 12 o'clock proves nothing.
    for (let minutes = 0; minutes < 720; minutes++) {
      const at = new Date(2026, 7, 30, Math.floor(minutes / 60), minutes % 60, 0)
      const plan = dialPlan(at)
      const wpf = handEndpoints(at.getHours(), at.getMinutes())
      const hour = rotateUpwardPoint(plan.hourAngle, HOUR_HAND_LENGTH)
      const minute = rotateUpwardPoint(plan.minuteAngle, MINUTE_HAND_LENGTH)
      expect(hour.x).toBeCloseTo(wpf.hour.x, 12)
      expect(hour.y).toBeCloseTo(wpf.hour.y, 12)
      expect(minute.x).toBeCloseTo(wpf.minute.x, 12)
      expect(minute.y).toBeCloseTo(wpf.minute.y, 12)
    }
    // Sanity on the frame itself: 12 o'clock is straight up from the centre.
    const noon = rotateUpwardPoint(0, MINUTE_HAND_LENGTH)
    expect(noon.x).toBeCloseTo(DIAL_CENTER_X, 12)
    expect(noon.y).toBeCloseTo(DIAL_CENTER_Y - MINUTE_HAND_LENGTH, 12)
  })

  test("both angles stay in [0, 360)", () => {
    for (let minutes = 0; minutes < 1440; minutes++) {
      const plan = dialPlan(new Date(2026, 7, 30, Math.floor(minutes / 60), minutes % 60, 0))
      for (const angle of [plan.hourAngle, plan.minuteAngle]) {
        expect(angle).toBeGreaterThanOrEqual(0)
        expect(angle).toBeLessThan(360)
      }
    }
  })
})
