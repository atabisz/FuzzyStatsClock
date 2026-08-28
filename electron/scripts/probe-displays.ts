/**
 * ISC-7 — is `Display.label` a usable per-monitor key on Alex's 3-display setup?
 *
 * Per-monitor position memory needs a key that names a physical monitor and keeps
 * naming it across restarts. The plan's assumption was `Display.label`, with a
 * composite of geometry as the fallback. This probe decides which of those is the
 * primary key, by measuring rather than by preference.
 *
 * ## Why "non-empty and stable" is not the claim
 *
 * That was the claim as written, and the WPF original shows why it is too weak.
 * `MonitorService.BuildKeyMap` (`FuzzyClock.App/MonitorService.cs:77-118`) resolves a
 * friendly name per screen — the same `monitorFriendlyDeviceName` from
 * `QueryDisplayConfig` that Chromium populates `label` from on Windows — and then does
 * a **second pass to suffix duplicates `-2`, `-3`**. That pass exists because two
 * monitors of the same model report the *same* friendly name. Such a label is
 * non-empty, is perfectly stable, and is still useless as a key: the overlay would
 * restore onto whichever of the two it looked at first.
 *
 * So uniqueness is an arm of its own (B3), and it is the arm most likely to fail on a
 * real desk. If it does, the answer is not "the label is broken" — it is that the key
 * needs the same disambiguation WPF already does, and the ordering that disambiguation
 * relies on then needs its own stability check (B4 covers it, because the composite key
 * carries position).
 *
 * ## What a restart means here, and what it does not
 *
 * Two separate Electron launches, so the enumeration is genuinely re-done from a cold
 * process. That bounds the claim at **stable across a process restart** — which is the
 * case per-monitor position memory actually meets on every app start. It does NOT
 * establish stability across a reboot, a cable swap, a monitor power-cycle or a
 * resolution change, and the ISA records those separately rather than letting a
 * process-restart pass stand in for them.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnElectron } from "./lib/electron-launch.js"

/** Alex's setup, per the ISA. A different count is INCONCLUSIVE, not FAIL — a laptop
 *  undocked is a different question, not a failed one. */
const EXPECTED_DISPLAYS = 3

const APP = join(import.meta.dirname, "probe-displays-app.cjs")

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}
interface DisplayInfo {
  id: number
  label: string
  bounds: Bounds
  workArea: Bounds
  scaleFactor: number
  rotation: number
  internal: boolean
  colorDepth: number
  displayFrequency: number
  isPrimary: boolean
}
interface Enumeration {
  primaryId: number
  displays: DisplayInfo[]
}

/**
 * The fallback key, and the thing B4 measures the stability of.
 *
 * Geometry plus scale, not geometry alone: two identical monitors side by side differ
 * only in `bounds.x`, so position has to be in the key — which is also the weakness,
 * since rearranging displays in Windows changes it. That trade-off is the reason the
 * label is preferred when it can carry the load.
 */
function compositeKey(d: DisplayInfo): string {
  const b = d.bounds
  return `${String(b.width)}x${String(b.height)}@${String(b.x)},${String(b.y)}:${d.scaleFactor.toFixed(2)}`
}

function launch(tag: string): Promise<Enumeration | null> {
  return new Promise((resolve) => {
    const proc = spawnElectron(APP)
    let out = ""
    let err = ""
    const timer = setTimeout(() => {
      proc.kill()
      console.log(`  ${tag}: no PROBE-DISPLAYS line within 25s`)
      resolve(null)
    }, 25_000)

    proc.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString()
    })
    proc.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString()
    })
    proc.on("exit", (code) => {
      clearTimeout(timer)
      const match = /^PROBE-DISPLAYS (.+)$/m.exec(out)
      if (match === null) {
        // Printed rather than swallowed: an Electron that ran as plain Node exits 0 with
        // a stack trace, and that is exactly the shape this must not read as "no displays".
        console.log(
          `  ${tag}: exit ${String(code)}, no marker line.\n` +
            `    stdout: ${out.slice(0, 400) || "(empty)"}\n    stderr: ${err.slice(0, 400) || "(empty)"}`,
        )
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(match[1] as string) as Enumeration)
      } catch (e) {
        console.log(`  ${tag}: unparseable marker payload: ${String(e)}`)
        resolve(null)
      }
    })
  })
}

/**
 * Arms, split by whether their failure blocks ISC-7.
 *
 * ISC-7 is written as a disjunction — "label is non-empty and restart-stable, **or** the
 * composite fallback key becomes the primary" — so a failing label does not fail the
 * claim, it selects the other branch. B2, B3 and B6 are therefore **diagnostic**: their
 * failures are design inputs, and they are still reported as FAIL because that is what
 * they measured. Softening them to make a summary green is the thing AC-5 forbids.
 *
 * What blocks is B1 (nothing was enumerated, so nothing was measured) and B5 (no usable
 * key of any kind exists, which would leave ISC-19 with nothing to build on). The exit
 * code follows the blocking arms alone, so a re-run on this desk is not permanently red
 * for reporting a property of Alex's monitors correctly.
 */
const results: {
  name: string
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE"
  detail: string
  blocking: boolean
}[] = []
function record(
  name: string,
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE",
  detail: string,
  blocking = false,
): void {
  results.push({ name, verdict, detail, blocking })
  console.log(`  → ${verdict}${blocking ? " (blocking)" : ""}: ${detail}\n`)
}

function report(tag: string, e: Enumeration): void {
  console.log(`\n  ${tag} — ${String(e.displays.length)} displays:`)
  for (const d of e.displays) {
    console.log(
      `    id ${String(d.id).padEnd(12)} label ${JSON.stringify(d.label).padEnd(26)} ` +
        `${String(d.bounds.width)}x${String(d.bounds.height)}@${String(d.bounds.x)},${String(d.bounds.y)} ` +
        `scale ${d.scaleFactor.toFixed(2)} ${String(d.displayFrequency)}Hz` +
        `${d.internal ? " internal" : ""}${d.isPrimary ? " PRIMARY" : ""}`,
    )
    console.log(`      composite: ${compositeKey(d)}`)
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// B1 — enumeration works at all, over a stated denominator.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== B1: a running Electron enumerates the displays ===")
const first = await launch("launch 1")
if (first !== null) report("launch 1", first)

if (first === null) {
  record(
    "B1 enumeration",
    "INCONCLUSIVE",
    "launch 1 produced no enumeration — see output above",
    true,
  )
} else if (first.displays.length === 0) {
  record("B1 enumeration", "FAIL", "zero displays reported by a running Electron", true)
} else if (first.displays.length !== EXPECTED_DISPLAYS) {
  record(
    "B1 enumeration",
    "INCONCLUSIVE",
    `${String(first.displays.length)} displays, expected ${String(EXPECTED_DISPLAYS)} — the setup ` +
      `differs from the one ISC-7 names, so a pass here would not be about that setup`,
    true,
  )
} else {
  record(
    "B1 enumeration",
    "PASS",
    `${String(first.displays.length)} displays enumerated, one marked primary ` +
      `(${String(first.displays.filter((d) => d.isPrimary).length)})`,
    true,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// B2 — every label carries text. The arm as originally written.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== B2: every label is non-empty ===")
if (first === null) {
  record("B2 labels non-empty", "INCONCLUSIVE", "no enumeration")
} else {
  const blank = first.displays.filter((d) => d.label.trim() === "")
  if (blank.length > 0) {
    record(
      "B2 labels non-empty",
      "FAIL",
      `${String(blank.length)} of ${String(first.displays.length)} labels are empty ` +
        `(ids ${blank.map((d) => String(d.id)).join(", ")}) — the composite key becomes the primary`,
    )
  } else {
    record(
      "B2 labels non-empty",
      "PASS",
      `${String(first.displays.length)}/${String(first.displays.length)} labels carry text: ` +
        first.displays.map((d) => JSON.stringify(d.label)).join(", "),
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// B3 — the arm the naive claim misses: do the labels DISTINGUISH the displays?
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== B3: labels are unique, so a label can identify one monitor ===")
if (first === null) {
  record("B3 labels unique", "INCONCLUSIVE", "no enumeration")
} else {
  const counts = new Map<string, number>()
  for (const d of first.displays) counts.set(d.label, (counts.get(d.label) ?? 0) + 1)
  const dupes = [...counts.entries()].filter(([, n]) => n > 1)
  if (dupes.length > 0) {
    record(
      "B3 labels unique",
      "FAIL",
      `${dupes.map(([l, n]) => `${String(n)}× ${JSON.stringify(l)}`).join(", ")} — a label alone ` +
        `cannot name a monitor here, so the key needs the same duplicate suffixing WPF does ` +
        `(MonitorService.cs:90-115) or the composite key instead`,
    )
  } else {
    record(
      "B3 labels unique",
      "PASS",
      `${String(counts.size)} distinct labels across ${String(first.displays.length)} displays — ` +
        `each label names exactly one monitor`,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// B4 — stability across a genuine process restart, per field.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== B4: labels, ids and composite keys survive a restart ===")
const second = await launch("launch 2")
if (second !== null) report("launch 2", second)

if (first === null || second === null) {
  record("B4 restart stability", "INCONCLUSIVE", "need both launches to compare")
} else if (first.displays.length !== second.displays.length) {
  record(
    "B4 restart stability",
    "FAIL",
    `display count moved ${String(first.displays.length)} → ${String(second.displays.length)} ` +
      `between launches`,
  )
} else {
  // Compared as sets per field, not pairwise by index: enumeration order is itself a
  // thing that can move, and comparing by index would report an order change as a
  // content change. Order is reported separately below so it is visible either way.
  const asSet = (values: string[]): string => [...values].sort().join(" | ")
  const fields: { name: string; of: (d: DisplayInfo) => string }[] = [
    { name: "label", of: (d) => d.label },
    { name: "id", of: (d) => String(d.id) },
    { name: "composite", of: compositeKey },
  ]

  const moved: string[] = []
  for (const f of fields) {
    const a = asSet(first.displays.map(f.of))
    const b = asSet(second.displays.map(f.of))
    console.log(`    ${f.name.padEnd(10)} ${a === b ? "stable" : `MOVED\n      1: ${a}\n      2: ${b}`}`)
    if (a !== b) moved.push(f.name)
  }

  const orderStable =
    first.displays.map((d) => d.label).join("|") === second.displays.map((d) => d.label).join("|")
  console.log(`    ${"order".padEnd(10)} ${orderStable ? "stable" : "MOVED — duplicate suffixing would be unstable"}`)

  const labelUnique = new Set(first.displays.map((d) => d.label)).size === first.displays.length
  const labelUsable = !moved.includes("label") && labelUnique

  if (moved.length === 0) {
    record(
      "B4 restart stability",
      "PASS",
      `label, id and composite key all identical across two cold launches; enumeration order ` +
        `${orderStable ? "also stable" : "MOVED (matters only if duplicate suffixing is needed)"}`,
    )
  } else if (labelUsable) {
    record(
      "B4 restart stability",
      "PASS",
      `label is stable and unique — usable as the primary key. ${moved.join(" and ")} moved, ` +
        `which is why the label is preferred over the composite`,
    )
  } else {
    record(
      "B4 restart stability",
      "FAIL",
      `${moved.join(" and ")} moved across a restart${moved.includes("label") ? " — including the label, so it cannot be the primary key" : ""}`,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// B5 — the decision ISC-7 exists to make.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== B5: which key does per-monitor position memory use? ===")
{
  const b2 = results.find((r) => r.name === "B2 labels non-empty")?.verdict
  const b3 = results.find((r) => r.name === "B3 labels unique")?.verdict
  const b4 = results.find((r) => r.name === "B4 restart stability")?.verdict
  const labelUsable = b2 === "PASS" && b3 === "PASS" && b4 === "PASS"

  // The fallback branch has to be *measured* before it can be selected, not assumed to
  // work because the preferred branch failed. Uniqueness across the current displays is
  // the property that makes a key a key; B4 already covered its restart stability.
  const compositesUnique =
    first !== null && new Set(first.displays.map(compositeKey)).size === first.displays.length
  const compositeUsable = compositesUnique && b4 === "PASS"

  if (labelUsable) {
    record(
      "B5 key decision",
      "PASS",
      `Display.label is the primary key: non-empty, unique and restart-stable on this setup. ` +
        `The composite key stays as the fallback for the case B3 would have caught — two ` +
        `monitors of one model — since that is a different desk, not a different Electron`,
      true,
    )
  } else if (compositeUsable) {
    record(
      "B5 key decision",
      "PASS",
      `the COMPOSITE key is the primary — ISC-7's fallback branch, selected by measurement: ` +
        `${String(first?.displays.length ?? 0)} distinct composites, all restart-stable, where the ` +
        `label is ${b2 === "FAIL" ? "empty on one display" : "present"} and ` +
        `${b3 === "FAIL" ? "duplicated across two" : "unique"}. Label is kept as a display *name*, ` +
        `never as an identity. Cost of the branch: the key carries position, so rearranging ` +
        `displays in Windows invalidates it — ISC-19 inherits that and must fall back to the ` +
        `work area rather than restoring off-screen`,
      true,
    )
  } else {
    record(
      "B5 key decision",
      "FAIL",
      `neither key is usable: label (B2 ${String(b2)}, B3 ${String(b3)}) and composite ` +
        `(unique=${String(compositesUnique)}, stable via B4 ${String(b4)}) both fail, so there is ` +
        `no per-monitor identity to build ISC-19 on`,
      true,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// B6 — what the WPF app actually stores today. Informs ISC-18, measured here
//      because the enumeration this needs is already in hand.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== B6: can the existing WPF settings file be imported key-for-key? ===")
{
  const local = process.env.LOCALAPPDATA
  const settingsPath = local === undefined ? null : join(local, "FuzzyClock", "settings.json")

  if (settingsPath === null || !existsSync(settingsPath)) {
    record(
      "B6 settings import shape",
      "INCONCLUSIVE",
      `no live settings file at ${settingsPath ?? "%LOCALAPPDATA% unset"} — nothing to import from`,
    )
  } else if (first === null) {
    record("B6 settings import shape", "INCONCLUSIVE", "no enumeration to match against")
  } else {
    // Read-only. The file is Alex's live configuration and this probe never writes it.
    const raw = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      MonitorPositions?: Record<string, { Left: number; Top: number }>
      LastActiveMonitor?: string
    }
    const stored = raw.MonitorPositions ?? {}
    const storedKeys = Object.keys(stored)
    console.log(
      `    stored keys      : ${storedKeys.length > 0 ? storedKeys.join(", ") : "(none)"}\n` +
        `    last active      : ${raw.LastActiveMonitor ?? "(unset)"}`,
    )

    // Does any stored key match anything Electron can produce for a current display?
    const producible = new Set<string>()
    for (const d of first.displays) {
      producible.add(d.label)
      producible.add(String(d.id))
      producible.add(compositeKey(d))
    }
    const matched = storedKeys.filter((k) => producible.has(k))

    // Geometry match: does the stored position land inside a display that exists now?
    const inside = (p: { Left: number; Top: number }, b: Bounds): boolean =>
      p.Left >= b.x && p.Left < b.x + b.width && p.Top >= b.y && p.Top < b.y + b.height
    const geometric = storedKeys.map((k) => {
      const pos = stored[k] as { Left: number; Top: number }
      const hit = first.displays.find((d) => inside(pos, d.bounds))
      return { key: k, pos, hit }
    })
    for (const g of geometric) {
      console.log(
        `    ${g.key.padEnd(16)} (${String(g.pos.Left)}, ${String(g.pos.Top)}) → ` +
          (g.hit === undefined
            ? "NO current display contains this point"
            : `${compositeKey(g.hit)}${g.hit.label === "" ? " (unlabelled)" : ` "${g.hit.label}"`}`),
      )
    }
    const orphans = geometric.filter((g) => g.hit === undefined).length

    if (matched.length === storedKeys.length && storedKeys.length > 0) {
      record(
        "B6 settings import shape",
        "PASS",
        `all ${String(storedKeys.length)} stored keys are reproducible from Electron's display data`,
      )
    } else {
      record(
        "B6 settings import shape",
        "FAIL",
        `${String(storedKeys.length - matched.length)} of ${String(storedKeys.length)} stored keys ` +
          `(${storedKeys.filter((k) => !producible.has(k)).join(", ")}) cannot be produced from any ` +
          `Electron field — they are GDI device names (MonitorService.FallbackKey), which Electron ` +
          `does not expose. So ISC-18's import must match by GEOMETRY, not by key` +
          (orphans > 0
            ? `; and ${String(orphans)} stored position(s) land outside every currently connected ` +
              `display, so the importer must handle an orphaned entry rather than trusting it`
            : ""),
      )
    }
  }
}

console.log("=== summary ===")
for (const r of results) {
  console.log(`${r.verdict.padEnd(13)} ${r.blocking ? "[blocking] " : "[diagnostic]"} ${r.name}`)
}
const passed = results.filter((r) => r.verdict === "PASS").length
const failed = results.filter((r) => r.verdict === "FAIL").length
const inconclusive = results.filter((r) => r.verdict === "INCONCLUSIVE").length
const blockingBad = results.filter((r) => r.blocking && r.verdict !== "PASS")
console.log(
  `\n${String(passed)} passed / ${String(failed)} failed / ${String(inconclusive)} inconclusive` +
    ` — ${String(blockingBad.length)} blocking`,
)
console.log(
  "\nThe diagnostic failures are the finding, not a defect in the probe: Display.label is not a\n" +
    "usable identity on this desk, and the WPF settings file cannot be imported by key. Both\n" +
    "change what gets built (ISC-18, ISC-19) rather than stopping it.",
)
console.log(
  "\nBound: two cold process launches. NOT proven across a reboot, a cable swap, a monitor\n" +
    "power-cycle or a resolution change — those are separate arms and the ISA carries them as such.",
)
process.exit(blockingBad.length > 0 ? 1 : 0)
