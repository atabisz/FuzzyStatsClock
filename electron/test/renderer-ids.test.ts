/**
 * `index.html` and `index.css` as a contract, checked against the modules that write into them.
 *
 * ## Why this file exists at all
 *
 * There is no DOM test library here, so nothing else in `bun test` can see the markup. That would be
 * tolerable if the markup's failure modes were loud, and they are not -- these are the three that are
 * completely silent:
 *
 *   1. **A missing id.** `applyTheme` reaches 26 elements by id and `renderer.ts` reaches ~40 more. A typo
 *      throws at startup, which is fine. But an element *removed* from the html while its id stays in
 *      `ACCENT_TARGET_IDS` throws only when that face is first shown, which may be a settings combination
 *      nobody opens.
 *   2. **A `<use>` pointing at nothing.** SVG renders an unresolvable `<use>` as *nothing*, with no
 *      console error. Rename `nixieGlyph2` and the third Nixie tube goes dark and stays dark.
 *   3. **A CSS declaration shadowing a presentation attribute.** This is the one that motivated the file.
 *      A declaration BEATS a presentation attribute, so `text { fill: white }` in `index.css` does not
 *      "set a default" -- it permanently defeats `applyTheme` on every text element, and the app looks
 *      completely correct on the default white accent.
 *
 * So the tests below are a source-read contract rather than a rendering check: the real rendering evidence
 * is `scripts/probe-display.ts`, which reads the live DOM over CDP. This file is what catches the three
 * failures above in a second rather than in a probe run, and what keeps the id set from drifting.
 *
 * ## The html is parsed with regexes, and the tests police the assumptions that makes safe
 *
 * No attribute value in `index.html` contains `<`, `>` or a quote of the kind delimiting it, and the
 * stylesheet has no at-rules and no nesting. Both are asserted rather than assumed, because a naive parser
 * that silently stops matching is worse than no parser: it turns every arm below green.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  ACCENT_TARGET_IDS,
  DIM_ALPHA,
  DIM_TARGET_IDS,
  NEVER_THEMED_IDS,
  PHASE_7_ACCENT_TARGET_IDS,
  STRUCTURAL_IDS,
  WHITE_ACCENT,
  dimmed,
  parseAccentColor,
} from "../src/core/display-colors.js"
import {
  NIXIE_COLON_GRADIENT_ID,
  NIXIE_GLYPH_IDS,
} from "../src/renderer/faces/nixie-face.js"
import { STROKE_TARGET_IDS, THEME_TARGETS } from "../src/renderer/theme.js"
import { FACE_CONTAINER_IDS, FACES } from "../src/core/display-plan.js"
import { CORNER_RADIUS } from "../src/core/layout.js"
import {
  DIAL_CENTER_X,
  DIAL_CENTER_Y,
  HOUR_HAND_LENGTH,
  MINUTE_HAND_LENGTH,
  TICK_STROKE_WIDTH,
} from "../src/core/dial-geometry.js"
import { fontStackFor } from "../src/core/text-metrics.js"

const RENDERER = join(import.meta.dirname, "..", "src", "renderer")
const RAW_HTML = readFileSync(join(RENDERER, "index.html"), "utf8")
const RAW_CSS = readFileSync(join(RENDERER, "index.css"), "utf8")

/**
 * Comments stripped first, and not as a nicety: the file's comments quote markup (`<g id="hourTicks">`,
 * `<Border CornerRadius="5"/>`), so an id scan over the raw text would pick up ids that are documentation.
 */
const HTML = RAW_HTML.replace(/<!--[\s\S]*?-->/g, "")
const CSS = RAW_CSS.replace(/\/\*[\s\S]*?\*\//g, "")

/** Every `id="..."`, in document order. */
const HTML_IDS: readonly string[] = [...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] ?? "")

/** The open tag of the element carrying `id`, from its `<` to its first `>`. */
function tagFor(id: string): string {
  const at = HTML.indexOf(` id="${id}"`)
  if (at < 0) throw new Error(`index.html has no element with id="${id}"`)
  const open = HTML.lastIndexOf("<", at)
  const close = HTML.indexOf(">", at)
  if (open < 0 || close < 0) throw new Error(`could not delimit the tag carrying id="${id}"`)
  return HTML.slice(open, close + 1)
}

/**
 * One attribute off an open tag, or null.
 *
 * Both quote styles, because `#root`'s `font-family` is single-quoted so the font names inside it can keep
 * their double quotes. `(?:^|\s)` rather than `\b` on the name: `\bwidth=` also matches `stroke-width=`,
 * which would have this reading the tick width as the group's width.
 */
function attr(tag: string, name: string): string | null {
  const found = new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`).exec(tag)
  if (found === null) return null
  return found[1] ?? found[2] ?? null
}

/** An authored numeric attribute. Throws rather than yielding NaN, so a renamed attribute is a red test. */
function numAttr(id: string, name: string): number {
  const raw = attr(tagFor(id), name)
  if (raw === null) throw new Error(`#${id} has no ${name}`)
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`#${id}'s ${name} is not a number: ${raw}`)
  return value
}

describe("the regex parser's own assumptions", () => {
  test("no attribute value contains an angle bracket, so a tag ends at its first `>`", () => {
    // `tagFor` slices to the first `>` after the id. A value like `content="a > b"` would truncate the tag
    // and every `attr` lookup past that point would read null -- which reads as "the attribute is absent"
    // rather than as a parse failure.
    for (const [, dq, sq] of HTML.matchAll(/\s[a-zA-Z-]+=(?:"([^"]*)"|'([^']*)')/g)) {
      const value = dq ?? sq ?? ""
      expect(value).not.toContain("<")
      expect(value).not.toContain(">")
    }
  })

  test("ids are unique", () => {
    // `getElementById` returns the first match, so a duplicate leaves the second element permanently
    // unreachable while the markup still looks right.
    expect(HTML_IDS).toHaveLength(new Set(HTML_IDS).size)
  })

  test("the stylesheet has no at-rules and no nesting", () => {
    // The rule splitter below is `([^{}]+)\{([^{}]*)\}`. A `@media` block or a nested rule would make it
    // skip whole sections silently, which would turn the forbidden-declaration test green by accident.
    expect(CSS).not.toContain("@")
    expect(CSS).not.toContain("&")
  })
})

describe("the id set is a closed 46-member contract", () => {
  /**
   * The seven sources. Five live in `display-colors.ts` because the theme is what needs them as data; two
   * live in `nixie-face.ts` because it is their only consumer, and the gradient carries a colour of its
   * own so `STRUCTURAL_IDS` -- "ids that carry no colour" -- would misdescribe it.
   */
  const SOURCES: readonly { readonly name: string; readonly ids: readonly string[] }[] = [
    { name: "ACCENT_TARGET_IDS", ids: ACCENT_TARGET_IDS },
    { name: "DIM_TARGET_IDS", ids: DIM_TARGET_IDS },
    { name: "NEVER_THEMED_IDS", ids: NEVER_THEMED_IDS },
    { name: "PHASE_7_ACCENT_TARGET_IDS", ids: PHASE_7_ACCENT_TARGET_IDS },
    { name: "STRUCTURAL_IDS", ids: STRUCTURAL_IDS },
    { name: "NIXIE_GLYPH_IDS", ids: NIXIE_GLYPH_IDS },
    { name: "NIXIE_COLON_GRADIENT_ID", ids: [NIXIE_COLON_GRADIENT_ID] },
  ]

  test("the sets have the sizes their doc comments claim", () => {
    // Pinned individually as well as in the union, so a member moved from one set to another fails here
    // rather than passing the union test and quietly changing what gets themed.
    expect(ACCENT_TARGET_IDS).toHaveLength(23)
    expect(DIM_TARGET_IDS).toHaveLength(2)
    expect(NEVER_THEMED_IDS).toHaveLength(6)
    expect(PHASE_7_ACCENT_TARGET_IDS).toHaveLength(1)
    expect(STRUCTURAL_IDS).toHaveLength(9)
    expect(NIXIE_GLYPH_IDS).toHaveLength(4)
  })

  test("the seven sets are pairwise disjoint", () => {
    for (const a of SOURCES) {
      for (const b of SOURCES) {
        if (a.name === b.name) continue
        const shared = a.ids.filter((id) => b.ids.includes(id))
        expect(shared, `${a.name} and ${b.name} both claim`).toEqual([])
      }
    }
  })

  test("their union is exactly the ids in index.html", () => {
    const declared = new Set(SOURCES.flatMap((source) => source.ids))
    expect(declared.size).toBe(46)

    const authored = new Set(HTML_IDS)
    // Both directions named separately: "declared but not authored" is a startup crash or a dead `<use>`,
    // "authored but not declared" is an element nobody themes or places. Different bugs, different fixes.
    expect([...declared].filter((id) => !authored.has(id)), "declared but missing from index.html").toEqual(
      [],
    )
    expect([...authored].filter((id) => !declared.has(id)), "in index.html but declared nowhere").toEqual([])
  })

  test("every id a `url(#…)` or an `href` points at is authored", () => {
    const authored = new Set(HTML_IDS)
    const referenced = [
      ...[...HTML.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1] ?? ""),
      ...[...HTML.matchAll(/href="#([^"]+)"/g)].map((m) => m[1] ?? ""),
    ]
    expect(referenced.length).toBeGreaterThan(0)
    for (const id of referenced) expect(authored.has(id), `#${id} is referenced but not authored`).toBe(true)
  })

  test("the templates a `<use>` targets are inside `<defs>`", () => {
    // A `<use>` renders nothing when its target has `display: none`, so hiding the four Nixie glyph
    // templates that way is not available -- `<defs>` is the only place they can live. Asserted as an
    // exact set so an element cannot drift into or out of it.
    const defs = /<defs>([\s\S]*?)<\/defs>/.exec(HTML)
    expect(defs).not.toBeNull()
    const inDefs = [...(defs?.[1] ?? "").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] ?? "")
    const expected: string[] = ["textShadow", ...NIXIE_GLYPH_IDS, NIXIE_COLON_GRADIENT_ID]
    expect([...inDefs].sort()).toEqual(expected.sort())
  })
})

describe("what the theme owns, and what it must leave alone", () => {
  test("THEME_TARGETS is the 26 elements ApplyTheme touches, all of them authored", () => {
    expect(THEME_TARGETS).toHaveLength(26)
    const authored = new Set(HTML_IDS)
    for (const target of THEME_TARGETS) expect(authored.has(target.id)).toBe(true)
  })

  test("the never-themed ids are still absent from THEME_TARGETS", () => {
    // `ApplyTheme`'s own closing comment names these as deliberate exclusions: an accent-tinted track
    // stops reading as an empty gauge, and an accent-filled `ContentBorder` destroys contrast with the
    // text over it. The failure mode is a *new* element being added and themed by nobody noticing.
    const themed = new Set(THEME_TARGETS.map((target) => target.id))
    for (const id of NEVER_THEMED_IDS) expect(themed.has(id)).toBe(false)
  })

  test("the three stroke targets are authored with a stroke, and nothing else is", () => {
    for (const id of STROKE_TARGET_IDS) expect(attr(tagFor(id), "stroke")).toBe("white")
    // `minuteDots` is the trap: it is a `<g>` like `hourTicks`, but `InitDialDecorations` sets `el.Fill` on
    // the ellipses, so it takes `fill`. Getting the pair the wrong way round is invisible on the default
    // white accent and gives an unfilled dot ring on every other.
    expect(STROKE_TARGET_IDS).not.toContain("minuteDots")
  })

  test("the five bar tracks are authored with one identical colour", () => {
    // XAML `Background="#40FFFFFF"` on each `{S}BarTrack`. No module constant owns it -- these are the
    // never-themed ids, so nothing ever writes them -- and equality across the five is the only check
    // available. A single mistyped track is otherwise a one-row shade difference nobody sees.
    const fills = NEVER_THEMED_IDS.filter((id) => id.endsWith("Track")).map((id) =>
      attr(tagFor(id), "fill"),
    )
    expect(fills).toHaveLength(5)
    expect(new Set(fills).size).toBe(1)
    expect(fills[0]).toBe("#40FFFFFF")
  })

  test("the qualifier's authored fill IS the dim colour, derived rather than eyeballed", () => {
    // `applyTheme` overwrites it on the first settings push, so this only matters for the frame before
    // that -- but it is a checkable claim, and `#8CFFFFFF` looks equally plausible one nibble wrong.
    const authored = attr(tagFor("qualifier"), "fill")
    expect(authored).not.toBeNull()
    expect(parseAccentColor(authored ?? "")).toEqual(dimmed(WHITE_ACCENT))
    expect(dimmed(WHITE_ACCENT).a).toBe(DIM_ALPHA)
  })
})

describe("the four authored geometry constants", () => {
  /**
   * `index.html` carries ids and defaults, not geometry -- `renderer.ts` writes every coordinate from
   * `core/layout.ts`. These are the numbers no code path writes, so they have to be authored, and each is
   * asserted against the module constant it duplicates. That is what makes the duplication checked rather
   * than trusted.
   */
  test("the hands' origin is the dial centre", () => {
    for (const id of ["hourHand", "minuteHand"]) {
      expect(numAttr(id, "x1")).toBe(DIAL_CENTER_X)
      expect(numAttr(id, "y1")).toBe(DIAL_CENTER_Y)
      expect(numAttr(id, "x2")).toBe(DIAL_CENTER_X)
    }
  })

  test("each hand's authored y2 IS its length", () => {
    // `dial-face.ts` writes only `transform`, so the hand's geometry never changes after load: the line is
    // authored pointing at 12 o'clock and rotated from there. `y2` is therefore the length, upward.
    expect(numAttr("hourHand", "y2")).toBe(DIAL_CENTER_Y - HOUR_HAND_LENGTH)
    expect(numAttr("minuteHand", "y2")).toBe(DIAL_CENTER_Y - MINUTE_HAND_LENGTH)
    // And the minute hand is the longer one -- the arm that catches the two being swapped, which the two
    // assertions above cannot.
    expect(numAttr("minuteHand", "y2")).toBeLessThan(numAttr("hourHand", "y2"))
  })

  test("the tick stroke width is on the group, inherited by all twelve", () => {
    expect(numAttr("hourTicks", "stroke-width")).toBe(TICK_STROKE_WIDTH)
    // Not in `index.css`: a declaration there would beat this attribute. See the CSS block below.
    expect(TICK_STROKE_WIDTH).not.toBe(numAttr("hourHand", "stroke-width"))
  })

  test("the hands are round-capped and the ticks are not", () => {
    // `InitDialDecorations` sets no line caps on the tick `Line`s while the XAML sets
    // `StrokeStartLineCap`/`StrokeEndLineCap="Round"` on both hands, so flat ticks and round hands is
    // faithful rather than an oversight. SVG's initial `stroke-linecap` is already `butt`.
    for (const id of ["hourHand", "minuteHand"]) expect(attr(tagFor(id), "stroke-linecap")).toBe("round")
    expect(attr(tagFor("hourTicks"), "stroke-linecap")).toBeNull()
  })

  test("the panel's corner radius mirrors CORNER_RADIUS", () => {
    expect(numAttr("windowBackground", "rx")).toBe(CORNER_RADIUS)
    // And it starts at the window origin, not at the padding: this is the unnamed
    // `<Border Background="Black" CornerRadius="5"/>` at MainWindow.xaml:27-29, a child of the root Grid
    // rather than of the padded one, so it covers the 12px strip the drag handler lives on.
    expect(numAttr("windowBackground", "x")).toBe(0)
    expect(numAttr("windowBackground", "y")).toBe(0)
  })
})

describe("#root's two inherited defaults", () => {
  test("the font family IS the Classic stack, not a hand-written copy of it", () => {
    // What actually inherits it is the dial's hour numbers, which WPF also leaves at Segoe UI Light. The
    // four styled texts each override it with `fontStackFor(textStyle)`, and a per-element presentation
    // attribute beats an inherited one -- which is the whole reason this is safe here and would not be
    // safe in `index.css`.
    expect(attr(tagFor("root"), "font-family")).toBe(fontStackFor("Classic"))
  })

  test("fill defaults to white and stroke is deliberately NOT set", () => {
    expect(attr(tagFor("root"), "fill")).toBe("white")
    // SVG's initial `stroke` is `none`. A `stroke="white"` here would inherit into every LCD segment
    // polygon and every unlit Nixie cathode, outlining shapes that are meant to be fill-only or
    // individually stroked. The three elements that want a stroke carry it themselves.
    expect(attr(tagFor("root"), "stroke")).toBeNull()
  })

  test("the viewBox agrees with the authored width and height", () => {
    // Both are placeholders overwritten on the first tick from `windowPixelSize()`, and they match
    // `main.ts`'s pre-measurement window size. What matters permanently is the agreement: a viewBox that
    // disagrees with the attributes scales the whole document, which is a blur rather than an offset and
    // much harder to attribute.
    const width = numAttr("root", "width")
    const height = numAttr("root", "height")
    expect(attr(tagFor("root"), "viewBox")).toBe(`0 0 ${String(width)} ${String(height)}`)
  })
})

describe("visibility and baselines, as authored", () => {
  test("all five faces plus the stats panel and the update line ship hidden", () => {
    // `renderer.ts` calls `activate(face === active)` on every face on every settings push, so there is no
    // first-run asymmetry -- but the authored state has to be "off", or the frame before the first push
    // shows all five faces stacked.
    for (const face of FACES) expect(attr(tagFor(FACE_CONTAINER_IDS[face]), "display")).toBe("none")
    expect(attr(tagFor("stats"), "display")).toBe("none")
    expect(attr(tagFor("update"), "display")).toBe("none")
  })

  test("every face container is a structural id", () => {
    // `includes` on a widened copy rather than `toContain`: the tuple's element type is the nine literals,
    // so `toContain` would reject anything not already known to be one of them -- which is the check.
    const structural: readonly string[] = STRUCTURAL_IDS
    for (const face of FACES) {
      expect(structural.includes(FACE_CONTAINER_IDS[face]), `${face} container`).toBe(true)
    }
  })

  test("the drop shadow is on exactly three elements, and the qualifier is not one", () => {
    // `QualifierText` carries no `Effect` in the XAML -- read at MainWindow.xaml:79-85 rather than inferred
    // from symmetry with the other three texts, which is exactly the inference that would add a fourth.
    expect((HTML.match(/url\(#textShadow\)/g) ?? [])).toHaveLength(3)
    for (const id of ["phrase", "emphasis", "date"]) {
      expect(attr(tagFor(id), "filter")).toBe("url(#textShadow)")
    }
    expect(attr(tagFor("qualifier"), "filter")).toBeNull()
  })

  test("#phrase carries text-anchor but NOT dominant-baseline", () => {
    // `text-anchor` is inherited, so the parent `<text>` is the right place for it and the two `<tspan>`s
    // get it for free. `dominant-baseline` is NOT inherited (SVG 1.1: "Inherited: no"), so the tspans have
    // to carry their own -- and `phrase-face.ts` writes it on each one it builds. Authoring it here as
    // well would look like it worked while doing nothing for the lines that matter.
    expect(attr(tagFor("phrase"), "text-anchor")).toBe("middle")
    expect(attr(tagFor("phrase"), "dominant-baseline")).toBeNull()
  })

  test("the five stat values share one text-anchor", () => {
    // `BattText` uses `HorizontalAlignment="Right"` where the other four use `TextAlignment="Right"`, and
    // the arrange fixture proves all five right edges land on 227.63 -- so one `end` is faithful for all
    // five and `renderer.ts` can write one x per row.
    for (const id of ["cpuText", "gpuText", "memText", "pagText", "battText"]) {
      expect(attr(tagFor(id), "text-anchor")).toBe("end")
    }
  })
})

describe("index.css declares nothing the code owns", () => {
  /**
   * The properties a presentation attribute is written for somewhere in this renderer. A CSS declaration
   * on ANY selector matching such an element wins, permanently and without an error, so the rule is
   * blanket rather than per-selector: no rule in this stylesheet may declare one of these, except by an
   * explicit entry in `ALLOWED` below.
   */
  const CODE_OWNED = [
    "fill",
    "stroke",
    "stroke-width",
    "font-family",
    "font-size",
    "transform",
    "transform-origin",
    "width",
    "height",
    "x",
    "y",
    "rx",
    "d",
    "opacity",
    "stop-color",
    "stop-opacity",
  ] as const

  /**
   * `selector:property` exceptions. One entry, in two halves.
   *
   * The Nixie glow layers and unlit cathodes are stroked *outlines*, so they must not be filled -- and no
   * code writes their `fill`, only their `stroke` and `stroke-width`. Which is the distinction that makes
   * this safe: `fill: none` here is a property with no attribute writer, exactly like `display: block` on
   * `#root` and the two `.dialNumber` alignment properties.
   */
  const ALLOWED = new Set([".nixieGlow:fill", ".nixieGhost:fill"])

  /** `selector -> declared properties`, one entry per selector in a comma-separated list. */
  const RULES: readonly { readonly selector: string; readonly property: string; readonly value: string }[] =
    [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((rule) => {
      const selectors = (rule[1] ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0)
      const declarations = (rule[2] ?? "")
        .split(";")
        .map((d) => d.trim())
        .filter((d) => d.length > 0)
      return selectors.flatMap((selector) =>
        declarations.map((declaration) => {
          const at = declaration.indexOf(":")
          return {
            selector,
            property: declaration.slice(0, at).trim(),
            value: declaration.slice(at + 1).trim(),
          }
        }),
      )
    })

  test("the parser found the rules that are actually there", () => {
    // Guards the whole block: a regex that matched nothing would make every assertion below vacuous.
    const selectors = new Set(RULES.map((rule) => rule.selector))
    expect(selectors).toContain("#root")
    expect(selectors).toContain("body")
    expect(selectors).toContain(".dialNumber")
    expect(selectors).toContain(".nixieGlow")
    for (const rule of RULES) expect(rule.property.length).toBeGreaterThan(0)
  })

  test("no rule declares a property a presentation attribute owns", () => {
    const violations = RULES.filter(
      (rule) =>
        (CODE_OWNED as readonly string[]).includes(rule.property) &&
        !ALLOWED.has(`${rule.selector}:${rule.property}`),
    ).map((rule) => `${rule.selector} { ${rule.property} }`)
    // The previous revision of this stylesheet failed here on `text { font-family }` and `text { fill }`,
    // which between them would have defeated `applyTheme` on all 26 targets and `fontStackFor` on all four
    // styled texts -- while looking completely correct on the default white accent.
    expect(violations).toEqual([])
  })

  test("the glow layers' stroke width is left to the four `<use>` elements", () => {
    // The bloom is four copies of one path at four widths. A `stroke-width` declared for the class would
    // collapse all four layers onto one width, and there would be no glow at all -- just a thick outline.
    const glow = RULES.filter((rule) => rule.selector === ".nixieGlow" || rule.selector === ".nixieGhost")
    expect(glow.length).toBeGreaterThan(0)
    for (const rule of glow) {
      expect(rule.property).not.toBe("stroke")
      expect(rule.property).not.toBe("stroke-width")
    }
  })

  test("nothing paints a background over the desktop", () => {
    // The window is transparent and always on top. An opaque `background` anywhere here turns the overlay
    // into a rectangle sitting over whatever is behind it, which is the single most visible way to break
    // this app -- and the easiest thing to introduce while styling something else.
    const backgrounds = RULES.filter((rule) => rule.property.startsWith("background"))
    expect(backgrounds.length).toBeGreaterThan(0)
    for (const rule of backgrounds) expect(["transparent", "none"]).toContain(rule.value)
  })

  test("#root is display: block", () => {
    // An `<svg>` is a replaced INLINE element, so the body's line box adds a descender gap under it and
    // the document ends up a few pixels taller than the window. Under `overflow: hidden` that reads as the
    // widget sitting too high inside its own panel -- a layout bug attributed to `layout.ts`.
    const root = RULES.filter((rule) => rule.selector === "#root")
    expect(root).toEqual([{ selector: "#root", property: "display", value: "block" }])
  })

  test("the dial numbers are centred in CSS because dominant-baseline does not inherit", () => {
    // `dial-face.ts` writes `hourNumbers()`'s radial centre (`cx`/`cy`), not WPF's hand-computed top-left
    // (`cx - 4.0`, `cy - 4.5`), so the centring has to happen here. It cannot be inherited from a `<g>`:
    // `text-anchor` would inherit, `dominant-baseline` would not, and half a fix looks like a font problem.
    const declared = new Map(
      RULES.filter((rule) => rule.selector === ".dialNumber").map((rule) => [rule.property, rule.value]),
    )
    expect(declared.get("text-anchor")).toBe("middle")
    expect(declared.get("dominant-baseline")).toBe("central")
  })
})
