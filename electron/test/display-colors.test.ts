/**
 * `display-colors.ts` against the measured colour rows.
 *
 * ## Three classes of claim, and they are not equally strong
 *
 * **Measured on the compiled C#.** The auto-ghost integer division (`seg-ghost`), the dim alpha
 * (`dim-alpha`) and the accent parse (`accent-parse`, run through `ColorConverter.ConvertFromString`
 * inside MainWindow's own try/catch shape). These are compared exactly.
 *
 * **Verified by reading the shipped source.** The twelve Paper/Silver skin literals and Dark's
 * background are `private static readonly Color` fields on `MainWindow`, which the probe cannot reach:
 * it compiles individual App sources and `MainWindow.xaml.cs` is not among them, because pulling it in
 * drags SettingsWindow, the tray icon and the settings service with it. There is no built
 * `FuzzyClock.App.dll` to reflect over either. So these were read directly out of
 * `MainWindow.xaml.cs:2124-2131` and `ApplyLcdColors`'s else arm and checked channel by channel against
 * the module -- a source read, not a runtime measurement. Stated rather than blurred, because "measured"
 * and "read carefully" are different levels of confidence and this file makes both kinds of claim.
 *
 * **Structural.** The element-id sets are asserted disjoint and exhaustive against `index.html` in
 * `renderer` tests, not here; what this file pins is their internal consistency and the two deliberate
 * absences (`TempsText`, `UpdateText`).
 *
 * ## Two divergences from WPF are asserted as divergences
 *
 * The C# parses ~140 named colours and this port does not; `accent-parse` records what WPF returns for
 * `Red` and `Transparent` so the narrowing is a decision with a number attached. See the last block.
 */
import { describe, expect, test } from "bun:test"
import { LCD_STYLES } from "../src/core/settings.js"
import {
  ACCENT_TARGET_IDS,
  DIM_ALPHA,
  DIM_TARGET_IDS,
  NEVER_THEMED_IDS,
  PHASE_7_ACCENT_TARGET_IDS,
  STRUCTURAL_IDS,
  WHITE_ACCENT,
  autoGhostColor,
  cssColor,
  dimmed,
  formatAccentColor,
  lcdSkin,
  parseAccentColor,
  resolveThemeColors,
  type RgbaColor,
} from "../src/core/display-colors.js"
import { field, geometryFixture, num, rows } from "./lib/wpf-fixture.js"

const fixture = geometryFixture()

describe("the auto-ghost rule, measured", () => {
  // seg-ghost: litR, litG, litB, ghostR, ghostG, ghostB
  test.each(
    rows(fixture, "seg-ghost").map((r) => ({
      lit: { r: num(r, 0), g: num(r, 1), b: num(r, 2) },
      ghost: { r: num(r, 3), g: num(r, 4), b: num(r, 5) },
    })),
  )("lit $lit.r,$lit.g,$lit.b ghosts to $ghost.r,$ghost.g,$ghost.b", (row) => {
    expect(autoGhostColor(row.lit)).toEqual(row.ghost)
  })

  test("the truncation is what makes 6 go dark and 7 not", () => {
    // `(byte)(r * 15 / 100)` in C#: 6*15/100 is 0.9 truncated to 0, 7*15/100 is 1.05 truncated to 1.
    // Rounding instead would light a ghost segment WPF leaves black -- visible as a faint glow on the
    // Dark skin with a near-black accent, and impossible to attribute later.
    expect(autoGhostColor({ r: 6, g: 6, b: 6 })).toEqual({ r: 0, g: 0, b: 0 })
    expect(autoGhostColor({ r: 7, g: 7, b: 7 })).toEqual({ r: 1, g: 1, b: 1 })
    expect(Math.round((6 * 15) / 100)).toBe(1)
  })

  test("every byte value ghosts to something in range and monotonically", () => {
    // Exhaustive over 0..255 rather than the ten measured rows: the ghost must never exceed the lit
    // channel and never leave the byte range, or the SVG carries an out-of-gamut colour.
    let previous = 0
    for (let v = 0; v <= 255; v++) {
      const ghost = autoGhostColor({ r: v, g: v, b: v })
      expect(ghost.r).toBeGreaterThanOrEqual(0)
      expect(ghost.r).toBeLessThanOrEqual(v)
      expect(ghost.r).toBeGreaterThanOrEqual(previous)
      expect(Number.isInteger(ghost.r)).toBe(true)
      previous = ghost.r
    }
    expect(autoGhostColor({ r: 255, g: 255, b: 255 })).toEqual({ r: 38, g: 38, b: 38 })
  })
})

describe("the dim alpha, measured", () => {
  // dim-alpha: alpha, fraction
  test.each(rows(fixture, "dim-alpha").map((r) => ({ alpha: num(r, 0), fraction: num(r, 1) })))(
    "alpha $alpha is $fraction of full",
    (row) => {
      expect(DIM_ALPHA).toBe(row.alpha)
      expect(DIM_ALPHA / 255).toBe(row.fraction)
    },
  )

  test("dimming replaces any alpha rather than multiplying it", () => {
    // `Color.FromArgb(0x8C, r, g, b)` discards the source alpha. A port that multiplied would dim a
    // half-transparent accent twice, and the date row would fade to nearly nothing.
    expect(dimmed({ a: 0x40, r: 10, g: 20, b: 30 })).toEqual({ a: 0x8c, r: 10, g: 20, b: 30 })
    expect(dimmed({ r: 10, g: 20, b: 30 })).toEqual({ a: 0x8c, r: 10, g: 20, b: 30 })
  })
})

describe("accent parsing, measured against ColorConverter", () => {
  interface ParseRow {
    readonly input: string
    readonly label: string
    readonly wpf: RgbaColor
  }

  // accent-parse: input, a, r, g, b. The probe writes EMPTY for "" and SPACE for each space, because a
  // bare empty field reads as a missing column.
  const parses: readonly ParseRow[] = rows(fixture, "accent-parse").map((r) => {
    const label = field(r, 0)
    return {
      label,
      input: label === "EMPTY" ? "" : label.replaceAll("SPACE", " "),
      wpf: { a: num(r, 1), r: num(r, 2), g: num(r, 3), b: num(r, 4) },
    }
  })

  /** The named-colour inputs the port deliberately does not support -- asserted below, not skipped. */
  const NAMED = new Set(["Red", "Transparent"])

  test.each(parses.filter((p) => !NAMED.has(p.label)))("$label parses as WPF does", (row) => {
    expect(parseAccentColor(row.input)).toEqual(row.wpf)
  })

  test("the fixture covers all four hex shapes, the malformed cases and the named ones", () => {
    expect(parses).toHaveLength(15)
    for (const shape of ["#FFF", "#8ABC", "#FF8800", "#8CFF8800"]) {
      expect(parses.some((p) => p.label === shape)).toBe(true)
    }
  })

  test("a 1-digit group is duplicated, not left-padded", () => {
    // Measured: #F0C is 255,0,204 -- i.e. 0xC becomes 0xCC. Left-padding would give 0x0C and a colour
    // that looks like a darker version of the right hue, which is the kind of wrong that survives review.
    expect(parseAccentColor("#F0C")).toEqual({ a: 0xff, r: 0xff, g: 0x00, b: 0xcc })
    expect(parseAccentColor("#8ABC")).toEqual({ a: 0x88, r: 0xaa, g: 0xbb, b: 0xcc })
  })

  test("alpha defaults to opaque for the 3- and 6-digit forms", () => {
    expect(parseAccentColor("#FF8800").a).toBe(0xff)
    expect(parseAccentColor("#FFF").a).toBe(0xff)
    // And is honoured where it is given, including zero -- which is a real value, not a missing one.
    expect(parseAccentColor("#00000000")).toEqual({ a: 0, r: 0, g: 0, b: 0 })
    expect(parseAccentColor("#8CFF8800").a).toBe(0x8c)
  })

  test("malformed input falls back to white and never throws", () => {
    // The C# wraps the convert in try/catch because a corrupt accent must not stop the clock starting.
    for (const bad of ["#GGG", "#12345", "#", "", "notacolour", "#1234567", "#-1", "##FFF"]) {
      expect(() => parseAccentColor(bad)).not.toThrow()
      expect(parseAccentColor(bad)).toEqual(WHITE_ACCENT)
    }
  })

  test("round-trips through the only shape the app writes", () => {
    // `#AARRGGBB` (MainWindow.xaml.cs:912). Every parse result must survive a write and re-read, or a
    // settings save silently changes the user's colour.
    for (const row of parses) {
      const parsed = parseAccentColor(row.input)
      expect(parseAccentColor(formatAccentColor(parsed))).toEqual(parsed)
    }
    expect(formatAccentColor({ a: 0x8c, r: 0xff, g: 0x88, b: 0x00 })).toBe("#8CFF8800")
    expect(formatAccentColor(WHITE_ACCENT)).toBe("#FFFFFFFF")
  })
})

describe("the two named-colour divergences, recorded", () => {
  test("WPF parses Red and this port returns white", () => {
    // Measured: ColorConverter gives 255,255,0,0. The port narrows to the four hex shapes because no
    // code path in the app can write a name into the file, so supporting ~140 names would be untested
    // surface. Consequence if a user hand-edits "Red" in: they get white, not red. Asserted so the
    // narrowing is a decision with a number attached rather than an undiscovered gap.
    const red = rows(fixture, "accent-parse").find((r) => field(r, 0) === "Red")
    expect(red).toBeDefined()
    expect(red === undefined ? null : num(red, 2)).toBe(255)
    expect(red === undefined ? null : num(red, 3)).toBe(0)
    expect(parseAccentColor("Red")).toEqual(WHITE_ACCENT)
  })

  test("WPF's Transparent is a transparent WHITE, and the port returns opaque white", () => {
    // Measured: a=0, r=g=b=255. So in the C# an accent of "Transparent" renders every themed element
    // invisible; here it renders them opaque white. The port's behaviour is the more useful one and it
    // is still a divergence, which is why it is written down. Unreachable through the settings UI.
    const transparent = rows(fixture, "accent-parse").find((r) => field(r, 0) === "Transparent")
    expect(transparent).toBeDefined()
    expect(transparent === undefined ? null : num(transparent, 1)).toBe(0)
    expect(parseAccentColor("Transparent")).toEqual(WHITE_ACCENT)
    expect(parseAccentColor("Transparent").a).toBe(0xff)
  })
})

describe("LCD skins", () => {
  test("Paper and Silver carry the literals from MainWindow.xaml.cs:2124-2131", () => {
    // Read out of the shipped source rather than measured -- see the file header for why the probe
    // cannot reach these. Channel by channel, so a single-nibble slip fails one assertion rather than
    // hiding inside an object comparison of the wrong shape.
    const paper = lcdSkin("Paper", WHITE_ACCENT)
    expect(paper.segmentStyle).toBe("Classic")
    expect(paper.lit).toEqual({ a: 0xff, r: 0x1a, g: 0x1c, b: 0x14 })
    expect(paper.background).toEqual({ r: 0xb2, g: 0xc4, b: 0xa0 })
    expect(paper.ghost).toEqual({ r: 0x8d, g: 0x9b, b: 0x7e })

    const silver = lcdSkin("Silver", WHITE_ACCENT)
    // Silver is the only skin that switches the segment style, which is why the Bold ratios exist.
    expect(silver.segmentStyle).toBe("Bold")
    expect(silver.lit).toEqual({ a: 0xff, r: 0x18, g: 0x18, b: 0x18 })
    expect(silver.background).toEqual({ r: 0xd0, g: 0xd2, b: 0xcc })
    expect(silver.ghost).toEqual({ r: 0xb0, g: 0xb2, b: 0xac })
  })

  test("Dark takes the accent and derives its ghost from it", () => {
    // The reason changing the accent restyles the LCD: Dark's lit colour IS the accent, and its ghost is
    // the 15% rule applied to it. The C# passes Colors.Transparent as a sentinel and lets the control
    // derive; the resolution happens at this boundary instead, so the sentinel never enters the renderer.
    const accent: RgbaColor = { a: 0xff, r: 0xc8, g: 0x64, b: 0x32 }
    const dark = lcdSkin("Dark", accent)
    expect(dark.segmentStyle).toBe("Classic")
    expect(dark.lit).toEqual(accent)
    expect(dark.background).toEqual({ r: 0x0f, g: 0x0f, b: 0x0f })
    // 200,100,50 -> 30,15,7, which is a measured `seg-ghost` row.
    expect(dark.ghost).toEqual({ r: 30, g: 15, b: 7 })
  })

  test("Dark keeps the accent's alpha and the other two do not have one to keep", () => {
    const dark = lcdSkin("Dark", { a: 0x40, r: 0xff, g: 0x00, b: 0x00 })
    expect(dark.lit.a).toBe(0x40)
    expect(lcdSkin("Paper", { a: 0x40, r: 0xff, g: 0, b: 0 }).lit.a).toBe(0xff)
  })

  test("every style in the union produces a skin, and no sentinel survives", () => {
    // Exhaustive over LCD_STYLES: a fourth skin added to settings without a case here would land in the
    // Dark arm and silently render as Dark rather than failing.
    for (const style of LCD_STYLES) {
      const skin = lcdSkin(style, WHITE_ACCENT)
      expect(["Classic", "Bold"]).toContain(skin.segmentStyle)
      // The C#'s Transparent sentinel is #00FFFFFF; a ghost that still carried it would render the
      // ghost segments invisible instead of dim.
      expect(skin.ghost).not.toEqual({ r: 0xff, g: 0xff, b: 0xff })
      for (const channel of [skin.ghost.r, skin.ghost.g, skin.ghost.b]) {
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(255)
      }
    }
    expect(LCD_STYLES).toHaveLength(3)
  })
})

describe("cssColor", () => {
  test("emits no alpha for an opaque colour", () => {
    // So the common case reads as an ordinary colour in devtools rather than as `rgb(255 255 255 / 1)`.
    expect(cssColor({ r: 255, g: 136, b: 0 })).toBe("rgb(255 136 0)")
    expect(cssColor({ a: 0xff, r: 255, g: 136, b: 0 })).toBe("rgb(255 136 0)")
  })

  test("emits a 0-1 slash alpha for a transparent one", () => {
    // CSS Color 4 `rgb()` with slash-alpha: channels stay the bytes WPF has, alpha becomes the fraction
    // CSS wants. 140/255 is the measured dim-alpha value.
    expect(cssColor({ a: 0x8c, r: 255, g: 136, b: 0 })).toBe("rgb(255 136 0 / 0.5490196078431373)")
    expect(cssColor({ a: 0, r: 0, g: 0, b: 0 })).toBe("rgb(0 0 0 / 0)")
  })

  test("rounds channels rather than emitting fractions", () => {
    // Auto-contrast arithmetic can produce a non-integer channel, and an SVG `fill` of `rgb(127.5 ...)`
    // is valid CSS but not what WPF's byte would have been.
    expect(cssColor({ r: 127.5, g: 0.4, b: 254.6 })).toBe("rgb(128 0 255)")
  })
})

describe("theme colour resolution", () => {
  test("no override keeps the accent alpha, an override discards it", () => {
    // The asymmetry is in the C#: ApplyTheme does `new SolidColorBrush(_accentColor)` while
    // ApplyDisplayColor does `Color.FromRgb(...)`, which is alpha 0xFF by construction.
    const accent: RgbaColor = { a: 0x40, r: 10, g: 20, b: 30 }
    expect(resolveThemeColors(accent, null).accent).toEqual(accent)
    expect(resolveThemeColors(accent, { r: 1, g: 2, b: 3 }).accent).toEqual({
      a: 0xff,
      r: 1,
      g: 2,
      b: 3,
    })
  })

  test("the dim colour always follows the resolved accent, not the raw one", () => {
    const resolved = resolveThemeColors({ a: 0x40, r: 10, g: 20, b: 30 }, { r: 1, g: 2, b: 3 })
    expect(resolved.dim).toEqual({ a: DIM_ALPHA, r: 1, g: 2, b: 3 })
  })
})

describe("the themed element sets", () => {
  const all = [
    ...ACCENT_TARGET_IDS,
    ...DIM_TARGET_IDS,
    ...NEVER_THEMED_IDS,
    ...PHASE_7_ACCENT_TARGET_IDS,
    ...STRUCTURAL_IDS,
  ]

  test("are pairwise disjoint", () => {
    // An id in two sets would be written twice with different colours, and which one wins would depend
    // on the order the renderer happens to apply them in.
    expect(new Set(all).size).toBe(all.length)
  })

  test("the exclusions are the five tracks and the content background, and nothing else", () => {
    // ApplyTheme's closing comment as an assertion. If a sixth element is ever excluded, this fails and
    // the comment and the data have to be reconciled deliberately.
    // Widened to `string[]` before sorting: the set's element type is a literal union, and a union-typed
    // receiver will not compare against a plain string list.
    const excluded: readonly string[] = NEVER_THEMED_IDS
    expect([...excluded].sort()).toEqual([
      "battTrack",
      "contentBackground",
      "cpuTrack",
      "gpuTrack",
      "memTrack",
      "pagTrack",
    ])
    for (const id of NEVER_THEMED_IDS) {
      expect(ACCENT_TARGET_IDS as readonly string[]).not.toContain(id)
      expect(DIM_TARGET_IDS as readonly string[]).not.toContain(id)
    }
  })

  test("every bar has a track and every stat has a label, a bar and a value", () => {
    // Structural completeness across the five stats rows: 5 bars, 5 tracks, 5 labels, 5 values. A stat
    // wired with a bar but no label renders as an unnamed gauge.
    for (const stat of ["cpu", "gpu", "mem", "pag", "batt"]) {
      expect(ACCENT_TARGET_IDS as readonly string[]).toContain(`${stat}Bar`)
      expect(ACCENT_TARGET_IDS as readonly string[]).toContain(`${stat}Label`)
      expect(ACCENT_TARGET_IDS as readonly string[]).toContain(`${stat}Text`)
      expect(NEVER_THEMED_IDS as readonly string[]).toContain(`${stat}Track`)
    }
  })

  test("only qualifier and date are dimmed", () => {
    expect(DIM_TARGET_IDS).toEqual(["qualifier", "date"])
  })

  test("TempsText is absent entirely and UpdateText is declared for Phase 7", () => {
    // The two elements from the C# list that are not in ACCENT_TARGET_IDS, each for its own reason.
    // Temps are retired on all three platforms (Option C), so there is no element to theme; the update
    // text arrives with the update check in Phase 7 and is named so the gap reads as a declaration.
    expect(all).not.toContain("temps")
    expect(all).not.toContain("tempsText")
    expect(PHASE_7_ACCENT_TARGET_IDS).toEqual(["update"])
    expect(ACCENT_TARGET_IDS as readonly string[]).not.toContain("update")
  })
})
