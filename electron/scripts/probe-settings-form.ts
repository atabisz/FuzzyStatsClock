/**
 * Discriminating-power probe for `test/settings-form.test.ts`.
 *
 * That suite went 59/59 on its first run, which is exactly the shape Algorithm rule 18 calls a suspect
 * instrument: a test authored in the same session as the code it tests, passing immediately, proves nothing
 * about whether it *can* fail. So this breaks the module six ways — one single-parameter change each, every
 * one a plausible mistake rather than a strawman — and requires the suite to go red for each.
 *
 * The six were chosen to hit six *different* claims, because six mutations that all trip the same arm would
 * measure one thing six times:
 *
 *   1. `Math.trunc` → `Math.round` in `opacityLabel`      — the C# truncation artefact
 *   2. `PopulateControls`' rule → the other C# rule        — the documented `isStyleSupported` divergence
 *   3. one field dropped from `EDITABLE_FIELDS`            — the 35-of-41 denominator
 *   4. the stats-row routing bypassed with a plain write   — the auto-collapse (ISA:1045)
 *   5. the Dial Face row pinned visible                    — `SetClockStyleButtonStates`' collapse
 *   6. the font ladder loosened to any number              — the strict-decoder posture
 *
 * A seventh arm runs the suite unmutated at the end and requires green, so a probe that broke the file
 * permanently — or one whose restore silently failed — cannot report success. That is not paranoia: the
 * module is uncommitted while this runs, so a bad restore would lose it.
 *
 * Usage: `bun run probe:settings-form`. Exits 0 only if all six mutations are caught and the restore is
 * clean.
 */
import { spawnSync } from "node:child_process"
import { copyFileSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const MODULE = "src/core/settings-form.ts"
const SUITE = "test/settings-form.test.ts"
const BACKUP = join(tmpdir(), `settings-form-probe-${String(process.pid)}.ts`)

interface Mutation {
  readonly name: string
  readonly claim: string
  readonly from: string
  readonly to: string
}

const MUTATIONS: readonly Mutation[] = [
  {
    name: "opacity label rounds instead of truncating",
    claim: "the C# `(int)` cast artefact at 0.29 / 0.57 / 0.58",
    from: "return `${String(Math.trunc(opacity * 100))}%`",
    to: "return `${String(Math.round(opacity * 100))}%`",
  },
  {
    name: "phrase-style gate uses the OTHER rule in the same C# file",
    claim: "divergence 1 — PopulateControls' rule, not CmbPhraseLanguage_SelectionChanged's",
    from: 'return phraseLocale === "auto" && !AUTO_DETECTED_LANGUAGES.includes(uiLanguage)',
    to: 'return phraseLocale === "auto"',
  },
  {
    name: "one editable field dropped from the inventory",
    claim: "35-of-41 coverage, and that a forgotten field fails loudly",
    from: '  "autoContrastEnabled",\n  "autoLaunchEnabled",',
    to: '  "autoLaunchEnabled",',
  },
  {
    name: "stats rows written directly, bypassing core/stats-rows.ts",
    claim: "the one-way auto-collapse and the re-clamp signal (ISA:1045)",
    from: "  const rowKey = STATS_ROW_FIELDS[edit.id]\n  if (rowKey !== undefined) {",
    to: "  const rowKey = STATS_ROW_FIELDS[edit.id]\n  if (false && rowKey !== undefined) {",
  },
  {
    name: "Dial Face row always visible",
    claim: "SetClockStyleButtonStates collapses the row rather than disabling it",
    from: '        visible: s.clockType === "dial",',
    to: "        visible: true,",
  },
  {
    name: "font size accepts any number",
    claim: "the ladder decoders reject values no control can produce",
    from: "      if (!FONT_SIZE_OPTIONS.some((o) => Number(o.value) === raw)) return null",
    to: "      if (!Number.isFinite(raw)) return null",
  },
]

function runSuite(): { readonly passed: boolean; readonly summary: string } {
  const result = spawnSync("bun", ["test", SUITE], { encoding: "utf8", shell: true })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
  const fails = /(\d+) fail/.exec(output)
  const passes = /(\d+) pass/.exec(output)
  return {
    passed: result.status === 0 && fails?.[1] === "0",
    summary: `${passes?.[1] ?? "?"} pass / ${fails?.[1] ?? "?"} fail`,
  }
}

const original = readFileSync(MODULE, "utf8")
copyFileSync(MODULE, BACKUP)
console.log(`baseline backed up to ${BACKUP} (${String(original.length)} chars)\n`)

let caught = 0
const missed: string[] = []

try {
  for (const [index, mutation] of MUTATIONS.entries()) {
    const arm = `A${String(index + 1)}`
    if (!original.includes(mutation.from)) {
      // The anchor moved. Reported as a probe failure, not skipped: a mutation that cannot be applied is a
      // measurement that did not happen, and silently counting it as caught is how a probe starts lying.
      console.log(`${arm} ANCHOR MISSING — ${mutation.name}`)
      missed.push(`${arm} (anchor not found: the module changed and this probe did not)`)
      continue
    }
    writeFileSync(MODULE, original.replace(mutation.from, mutation.to))
    const { passed, summary } = runSuite()
    if (passed) {
      console.log(`${arm} NOT CAUGHT — ${mutation.name}  [${summary}]`)
      console.log(`   claim left unguarded: ${mutation.claim}`)
      missed.push(`${arm} ${mutation.name}`)
    } else {
      caught += 1
      console.log(`${arm} caught — ${mutation.name}  [${summary}]`)
    }
  }
} finally {
  writeFileSync(MODULE, original)
}

const restored = readFileSync(MODULE, "utf8") === original
console.log(`\nrestore: ${restored ? "byte-identical" : "MISMATCH"}`)

const final = runSuite()
console.log(`unmutated suite: ${final.summary}`)

const ok = caught === MUTATIONS.length && restored && final.passed
console.log(
  `\n${ok ? "PASS" : "FAIL"} — ${String(caught)}/${String(MUTATIONS.length)} mutations caught` +
    (missed.length > 0 ? `; missed: ${missed.join(", ")}` : ""),
)
process.exit(ok ? 0 : 1)
