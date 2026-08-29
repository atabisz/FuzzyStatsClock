/**
 * The contamination guard for the two WPF measurement fixtures, and the loader's own tests.
 *
 * ## Why this file exists
 *
 * Both fixtures are raw stdout from `dotnet run`, and `dotnet run` puts more than the program's output on
 * stdout when the build is cold. The first capture of `wpf-geometry.tsv` began with two
 * `[NuGet Manager] [CredentialProvider]` lines. A lenient parser skips those in silence; `loadFixture`
 * does not skip them, it turns each into a row with a nonsense tag, and nothing noticed because every
 * test selects rows *by tag*. So the noise sat in the file, invisible, until it was spotted by eye.
 *
 * `foreignLines()` is the check that closes that hole, and until now it was exported and called nowhere --
 * which is the same failure one level up: a guard that never runs is not a guard. Its module header has
 * claimed since it was written that it "runs as its own test". This is that test.
 *
 * ## What is pinned, and what each pin catches
 *
 * - **No foreign rows.** Build noise, a stray `echo`, a partially-overwritten file.
 * - **Exact row counts per tag.** Catches the opposite failure: a regeneration that was interrupted, or a
 *   probe method quietly dropped from `Run()`. A missing tag is caught for free -- `rows()` throws when a
 *   tag matches nothing, so a deleted block fails here rather than passing an empty `test.each`.
 * - **Row width equals the header width, per tag.** `GeomProbe.cs`'s own comment on `seg-lit` names this
 *   one: a header one column short reads as a 3-field row and mis-parses the whole block into plausible
 *   numbers. This is the pin that makes a column added to the probe but not to its header a failure.
 * - **`nix-wire` is 29 rows and that is not a lost row.** The wire count varies with digit height (7, 10,
 *   12), which is the one block whose size is not a product of the loop bounds, so it is cross-checked
 *   against `nix-metrics`'s own `wireCount` column rather than against a number I chose.
 *
 * The counts here are measured, not derived, and they are deliberately literal: a count computed from the
 * file it is checking would agree with any file.
 */
import { describe, expect, test } from "bun:test"
import {
  field,
  foreignLines,
  geometryFixture,
  layoutFixture,
  loadFixture,
  num,
  rows,
  type Fixture,
} from "./lib/wpf-fixture.js"

/** Measured 2026-08-30 against the probe's current output. Sums to 579 data rows in 602 lines. */
const GEOMETRY_ROWS: Readonly<Record<string, number>> = {
  "accent-parse": 15,
  "dial-dot": 60,
  "dial-hand": 10,
  "dial-num": 12,
  "dial-tick": 12,
  "dim-alpha": 1,
  "nix-bounds": 30,
  "nix-dot": 3,
  "nix-flicker": 8,
  "nix-ghoststroke": 3,
  "nix-highlight": 3,
  "nix-metrics": 3,
  "nix-stroke": 12,
  "nix-tube": 3,
  "nix-wire": 29,
  "seg-colon": 6,
  "seg-dot": 12,
  "seg-ghost": 10,
  "seg-lit": 77,
  "seg-metrics": 6,
  "seg-poly": 252,
  "text-size": 8,
  "wrap-threshold": 4,
}

/** Same, for the layout fixture: 326 data rows in 333 lines. */
const LAYOUT_ROWS: Readonly<Record<string, number>> = {
  // 4 configs (dial, lcd, phrase, split) x 35 elements.
  "lay-arrange": 140,
  // 3 families x 4 derived date sizes x 7 candidate strings.
  "lay-date": 84,
  "lay-emptytext": 6,
  "lcd-view": 12,
  "nixie-view": 3,
  "nixie-view-repath": 3,
  "text-line": 78,
}

// Mutable at the top level on purpose: `describe.each` rejects a `readonly` table.
const FIXTURES: {
  readonly label: string
  readonly load: () => Fixture
  readonly expected: Readonly<Record<string, number>>
  readonly lines: number
  readonly dataRows: number
}[] = [
  {
    label: "wpf-geometry.tsv",
    load: geometryFixture,
    expected: GEOMETRY_ROWS,
    lines: 602,
    dataRows: 579,
  },
  { label: "wpf-layout.tsv", load: layoutFixture, expected: LAYOUT_ROWS, lines: 333, dataRows: 326 },
]

describe.each(FIXTURES)("$label", (spec) => {
  const fixture = spec.load()
  const expectedTags = Object.keys(spec.expected)

  test("carries no line that is not a header or an expected row", () => {
    // The guard itself. Reported as a list rather than a count so a failure names the lines.
    expect(foreignLines(fixture, expectedTags)).toEqual([])
  })

  test("holds exactly the measured number of rows per tag", () => {
    const counted: Record<string, number> = {}
    for (const tag of expectedTags) counted[tag] = rows(fixture, tag).length
    expect(counted).toEqual(spec.expected)
  })

  test("has one header per tag and no header without rows", () => {
    // A header whose tag has no rows means the probe emitted a block and then wrote nothing into it --
    // which is exactly what a method that threw halfway looks like from here.
    expect([...fixture.headers.keys()].sort()).toEqual([...expectedTags].sort())
  })

  test("every row is as wide as its own header says", () => {
    // The failure this catches is silent: `seg-lit` once had a header one column short, so the fourth
    // field was read as a missing column and the block parsed into plausible-looking rubbish.
    for (const tag of expectedTags) {
      const header = fixture.headers.get(tag)
      expect(header).toBeDefined()
      const width = header === undefined ? -1 : header.length
      for (const row of rows(fixture, tag)) {
        expect({ tag, line: row.line, width: row.fields.length }).toEqual({
          tag,
          line: row.line,
          width,
        })
      }
    }
  })

  test("the total accounts for every line in the file", () => {
    // Headers plus data rows equals the line count, so nothing was dropped by the loader's own filtering.
    expect(fixture.rows.length).toBe(spec.dataRows)
    expect(fixture.rows.length + fixture.headers.size).toBe(spec.lines)
  })
})

describe("nix-wire's odd count is size-dependent, not a lost row", () => {
  const fixture = geometryFixture()

  test("the per-height wire counts are 7, 10 and 12, and nix-metrics says so too", () => {
    // 29 is the only block size in either fixture that is not a product of the probe's loop bounds, so it
    // is the only one where "the count changed" could be either a real geometry change or a truncation.
    // `nix-metrics` carries `wireCount` as its own column, measured off `canvas.Children.OfType<Line>()`,
    // which makes it a control rather than a second opinion from the same arithmetic.
    const perHeight = new Map<number, number>()
    for (const row of rows(fixture, "nix-wire")) {
      const height = num(row, 0)
      perHeight.set(height, (perHeight.get(height) ?? 0) + 1)
    }
    expect([...perHeight.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [40, 7],
      [56, 10],
      [72, 12],
    ])

    for (const metrics of rows(fixture, "nix-metrics")) {
      const height = num(metrics, 0)
      // nix-metrics: digitHeight, ctrlWidth, ctrlHeight, childCount, wireCount, ghostCount, glowCount
      expect(perHeight.get(height)).toBe(num(metrics, 4))
    }
  })

  test("nix-bounds and nix-stroke are fixed-width blocks, which is why they need no control", () => {
    // 10 ghost paths and 4 glow paths at every size -- stated so the contrast with nix-wire is on record.
    for (const metrics of rows(fixture, "nix-metrics")) {
      expect(num(metrics, 5)).toBe(10)
      expect(num(metrics, 6)).toBe(4)
    }
  })
})

describe("the loader's strictness, which the fixtures depend on", () => {
  const fixture = layoutFixture()

  test("rows() throws on an unmatched tag instead of returning nothing", () => {
    // The whole point: `test.each([])` over a typo'd tag is a green run over zero cases, and it looks
    // identical to a green run over 240. The message names the tags that are present, so the typo is
    // fixable from the failure alone.
    expect(() => rows(fixture, "nixie-veiw")).toThrow(/no rows tagged "nixie-veiw"/)
    expect(() => rows(fixture, "nixie-veiw")).toThrow(/nixie-view-repath/)
  })

  test("num() throws on a non-numeric field rather than yielding NaN", () => {
    // NaN compares unequal to everything, so a mis-parsed column surfaces as a baffling failure on a
    // plausible value. Field 0 of a `text-line` row is a font family, which is the nearest real case.
    const row = rows(fixture, "text-line")[0]
    expect(row).toBeDefined()
    if (row === undefined) return
    expect(field(row, 0)).toBe("Segoe UI Light")
    expect(() => num(row, 0)).toThrow(/is not finite/)
    expect(() => field(row, 99)).toThrow(/no field at index 99/)
  })

  test("G17 numbers round-trip through Number() to the double .NET had", () => {
    // Which is what lets almost every assertion in the fixture-backed tests be exact rather than
    // toleranced. A 15-digit round-trip would lose the last bit and force a tolerance everywhere.
    const g17 = "144.39999999999998"
    expect(String(Number(g17))).toBe(g17)
    expect(Number("46.719999999999999")).toBe(46.72)
  })
})

describe("the guard would catch the noise it was written for", () => {
  test("a NuGet credential-provider line is reported, not skipped", () => {
    // Falsifying the guard rather than only running it. This is the shape of the two lines that actually
    // shipped in the first capture: no tabs, so the whole line becomes one field and one bogus tag.
    const contaminated: Fixture = {
      name: "synthetic",
      headers: new Map([["seg-dot", ["style"]]]),
      rows: [
        { tag: "[NuGet Manager] [CredentialProvider]Information: acquiring token", fields: [], line: 1 },
        { tag: "seg-dot", fields: ["Classic"], line: 2 },
      ],
    }
    expect(foreignLines(contaminated, ["seg-dot"])).toEqual([
      "line 1: [NuGet Manager] [CredentialProvider]Information: acquiring token",
    ])
  })

  test("and an empty allow-list rejects everything, so the check cannot pass vacuously", () => {
    // A guard called with the wrong tag list would otherwise report nothing and read as green.
    expect(foreignLines(layoutFixture(), []).length).toBe(326)
  })

  test("both fixtures load by name as well as through their helpers", () => {
    // The helpers are the only callers of `loadFixture`, so the name strings are pinned here rather than
    // being discovered as a missing-file error inside an unrelated suite.
    expect(loadFixture("wpf-geometry.tsv").rows.length).toBe(579)
    expect(loadFixture("wpf-layout.tsv").rows.length).toBe(326)
  })
})
