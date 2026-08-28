/**
 * Repro: `typeperf` silently drops a requested counter from its header.
 *
 * Established in the first round (6 trials): 2/6 children emitted a header with no
 * `Processor Time` field at all — 39,969 chars against the good runs' 40,020, which
 * is exactly the missing field's width — with empty stderr and exit code 0. The same
 * header captured to a file parses correctly, so neither `classifyColumns` nor the
 * chunk reassembly is at fault. `typeperf` is.
 *
 * That matters because a dropped counter is indistinguishable from an absent one:
 * CPU renders "N/A" on a third of app starts, forever, with nothing in the log.
 *
 * This round tests the design hypothesis:
 *
 *   H3 the 354-instance GPU wildcard is what perturbs the batch → a child asking
 *      only for the three scalar counters never drops one, and the fix is to split
 *      the wildcard into its own child rather than to retry.
 *
 * Configurations are run interleaved rather than in blocks, so a machine-state
 * drift partway through cannot masquerade as a difference between them.
 *
 * ## H3 IS REFUTED — read this before trusting a "SUPPORTED" line below
 *
 * This script reported H3 SUPPORTED on 8 interleaved rounds (all-four 3 bad,
 * scalars-only 0 bad). A later `probe-typeperf` run then caught the live scalar child —
 * three counters, no wildcard on its command line — dropping `cpu` on its first spawn.
 * A single counter-example beats 8 clean trials, so the drop is a `typeperf` property
 * and not a batch-size effect.
 *
 * The verdict this script prints is therefore kept honest by its own text below rather
 * than reworded: 0/8 is what it saw, "NOT REPRODUCED this round" is what 0 means, and
 * treating that as a mechanism was the error. Raise `TRIALS_PER_CONFIG` far above 8
 * before reading anything into a scalars-only zero; at a ~21% per-spawn rate, 8 trials
 * miss a real effect roughly one time in six.
 */

import { spawn } from "node:child_process"
import { classifyColumns, parseHeaderPaths, splitCsvLine } from "../src/main/telemetry/parse/typeperf.js"

const CPU = "\\Processor(_Total)\\% Processor Time"
const MEM = "\\Memory\\% Committed Bytes In Use"
const PAG = "\\Paging File(_Total)\\% Usage"
const GPU = "\\GPU Engine(*engtype_3D)\\Utilization Percentage"

const CONFIGS = [
  { name: "all-four (current)", counters: [CPU, MEM, PAG, GPU], expectScalars: 3 },
  { name: "scalars-only", counters: [CPU, MEM, PAG], expectScalars: 3 },
  { name: "gpu-wildcard-only", counters: [GPU], expectScalars: 0 },
] as const

const TRIALS_PER_CONFIG = 8

interface Trial {
  config: string
  ok: boolean
  headerChars: number
  fields: number
  missing: string[]
  gpu: number
}

function runOnce(config: (typeof CONFIGS)[number]): Promise<Trial> {
  return new Promise((resolve) => {
    const proc = spawn("typeperf", [...config.counters, "-si", "1"], { windowsHide: true })
    let buffer = ""
    let settled = false

    const finish = (t: Trial): void => {
      if (settled) return
      settled = true
      proc.kill()
      resolve(t)
    }

    proc.stdout.setEncoding("utf8")
    proc.stdout.on("data", (chunk: string) => {
      buffer += chunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === "" || !trimmed.includes("(PDH-CSV")) continue

        const layout = classifyColumns(parseHeaderPaths(trimmed))
        const missing: string[] = []
        // Widened to `readonly string[]`: the three `as const` config tuples have no
        // common element type, so `includes` on the union narrows its parameter to
        // `never` and rejects every literal.
        const asked = config.counters as readonly string[]
        if (asked.includes(CPU) && layout.cpu === -1) missing.push("cpu")
        if (asked.includes(MEM) && layout.mem === -1) missing.push("mem")
        if (asked.includes(PAG) && layout.pag === -1) missing.push("pag")
        if (asked.includes(GPU) && layout.gpu.length === 0) missing.push("gpu")

        finish({
          config: config.name,
          ok: missing.length === 0,
          headerChars: trimmed.length,
          fields: splitCsvLine(trimmed).length,
          missing,
          gpu: layout.gpu.length,
        })
      }
    })

    proc.on("exit", () =>
      finish({
        config: config.name,
        ok: false,
        headerChars: 0,
        fields: 0,
        missing: ["<no header>"],
        gpu: 0,
      }),
    )
  })
}

const rows: Trial[] = []
for (let round = 1; round <= TRIALS_PER_CONFIG; round++) {
  for (const config of CONFIGS) rows.push(await runOnce(config))
}

console.log(`${TRIALS_PER_CONFIG} interleaved rounds per configuration\n`)
console.log("config                fields headerLen gpuCols  missing")
for (const r of rows) {
  console.log(
    `${r.config.padEnd(21)} ${String(r.fields).padStart(6)} ${String(r.headerChars).padStart(9)} ` +
      `${String(r.gpu).padStart(7)}  ${r.ok ? "-" : r.missing.join(",")}`,
  )
}

console.log("\nconfig                 dropped/total   rate")
for (const config of CONFIGS) {
  const mine = rows.filter((r) => r.config === config.name)
  const bad = mine.filter((r) => !r.ok)
  const pct = mine.length > 0 ? ((bad.length / mine.length) * 100).toFixed(0) : "?"
  console.log(`${config.name.padEnd(22)} ${String(bad.length).padStart(3)}/${mine.length}          ${pct}%`)
}

const allFour = rows.filter((r) => r.config === "all-four (current)")
const scalars = rows.filter((r) => r.config === "scalars-only")
const allFourBad = allFour.filter((r) => !r.ok).length
const scalarsBad = scalars.filter((r) => !r.ok).length
console.log(
  `\nH3 (the GPU wildcard perturbs the batch): ` +
    `${allFourBad > 0 && scalarsBad === 0 ? "SUPPORTED" : allFourBad === 0 ? "NOT REPRODUCED this round" : "REFUTED — scalars-only drops too"}` +
    ` (all-four ${allFourBad} bad, scalars-only ${scalarsBad} bad)`,
)
process.exit(0)
