/**
 * Reader for the two WPF measurement fixtures, `wpf-geometry.tsv` and `wpf-layout.tsv`.
 *
 * Both are stdout from `dotnet run` on the probe in `%TEMP%/fc-appprobe`, which compiles the **real**
 * `SevenSegmentDigit`, `NixieDigit`, `LcdClockView` and `NixieClockView` into its own assembly and reads
 * their built geometry back. Every number is `G17`, so a value round-trips through `Number()` to the
 * same double .NET had -- which is what lets the tests assert exact equality rather than a tolerance
 * everywhere except where a transcendental function is involved.
 *
 * Format: tab-separated, first field is the row tag, `#`-prefixed lines are the column headers for the
 * tag that follows the `#`. Blocks appear in the probe's emission order and rows within a block in loop
 * order, but nothing here depends on either -- rows are selected by tag and filtered by key, so
 * reordering the probe does not silently change which rows a test reads.
 *
 * ## Two things this reader is strict about, both of which have already caught something
 *
 * `rows()` **throws when a tag matches nothing.** A typo'd tag returning `[]` makes `test.each([])` pass
 * an empty suite, and a green run over zero cases is the worst possible outcome here -- it looks exactly
 * like a green run over 240 cases.
 *
 * `numbers()` **throws on a field that is not a finite number**, rather than yielding `NaN`. `NaN`
 * compares unequal to everything, so a mis-parsed column would surface as a confusing assertion failure
 * on a plausible-looking value instead of as "the fixture is not what you think it is".
 *
 * The tag filter is also why the loader strips nothing else: the fixture must be the probe's bytes. The
 * one time a fixture was edited on the way in, it carried two lines of NuGet credential-provider noise
 * from a cold build -- so `assertNoForeignLines` exists and runs as its own test.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures")

export interface FixtureRow {
  readonly tag: string
  readonly fields: readonly string[]
  /** 1-based line number in the fixture, so a failure names something greppable. */
  readonly line: number
}

export interface Fixture {
  readonly name: string
  readonly rows: readonly FixtureRow[]
  /** Column names per tag, from the `#` header lines. */
  readonly headers: ReadonlyMap<string, readonly string[]>
}

/** Loads and splits a fixture. Line endings are normalised; nothing else is. */
export function loadFixture(name: string): Fixture {
  const text = readFileSync(join(FIXTURE_DIR, name), "utf8")
  const rows: FixtureRow[] = []
  const headers = new Map<string, readonly string[]>()
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? ""
    if (raw.length === 0) continue
    const fields = raw.split("\t")
    const first = fields[0] ?? ""
    if (first.startsWith("#")) {
      // `# tag<TAB>col<TAB>col` -- the tag is the remainder of the first field.
      const tag = first.slice(1).trim()
      headers.set(tag, fields.slice(1))
      continue
    }
    rows.push({ tag: first, fields: fields.slice(1), line: i + 1 })
  }
  return { name, rows, headers }
}

/** Every row carrying a tag. Throws when there are none -- see the module header. */
export function rows(fixture: Fixture, tag: string): readonly FixtureRow[] {
  const matched = fixture.rows.filter((r) => r.tag === tag)
  if (matched.length === 0) {
    const tags = [...new Set(fixture.rows.map((r) => r.tag))].sort().join(", ")
    throw new Error(`${fixture.name}: no rows tagged "${tag}". Present tags: ${tags}`)
  }
  return matched
}

/** One field as a string, by index into the post-tag fields. */
export function field(row: FixtureRow, index: number): string {
  const value = row.fields[index]
  if (value === undefined) {
    throw new Error(`fixture line ${String(row.line)}: no field at index ${String(index)}`)
  }
  return value
}

/** One field as a finite number. Throws rather than yielding `NaN`. */
export function num(row: FixtureRow, index: number): number {
  const raw = field(row, index)
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(`fixture line ${String(row.line)}: field ${String(index)} is not finite: "${raw}"`)
  }
  return value
}

/** Several fields as numbers, in order. */
export function numbers(row: FixtureRow, ...indices: readonly number[]): readonly number[] {
  return indices.map((i) => num(row, i))
}

/**
 * Asserts that every line is either a `#` header or a row whose tag is one of the expected ones.
 *
 * This is the contamination guard. The probe runs through `dotnet run`, whose stdout also carries
 * MSBuild and NuGet output when a build is cold -- the first capture of `wpf-geometry.tsv` began with two
 * `[NuGet Manager] [CredentialProvider]` lines, which a lenient parser would have skipped in silence.
 * Returns the offending lines rather than throwing so the test can report all of them at once.
 */
export function foreignLines(fixture: Fixture, expectedTags: readonly string[]): readonly string[] {
  const allowed = new Set(expectedTags)
  return fixture.rows
    .filter((r) => !allowed.has(r.tag))
    .map((r) => `line ${String(r.line)}: ${r.tag}`)
}

/** The geometry fixture: the digit controls, the dial and the text-size derivations. */
export function geometryFixture(): Fixture {
  return loadFixture("wpf-geometry.tsv")
}

/** The layout fixture: font line heights and the two clock views' `DesiredSize`. */
export function layoutFixture(): Fixture {
  return loadFixture("wpf-layout.tsv")
}
