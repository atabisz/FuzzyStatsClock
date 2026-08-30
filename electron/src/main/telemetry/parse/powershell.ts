/**
 * Parsers for the long-lived PowerShell helper child's output lines.
 *
 * Named after the tool that produces the text, like `parse/typeperf.ts` next door, because that is what
 * determines the format. The child emits one whitespace-separated line per reading, tagged by a leading
 * keyword, so a second reading type can be added without the two becoming ambiguous — the process count is
 * the one that will land here next.
 *
 * ## Why a child at all, and why a long-lived one
 *
 * Both halves are measured on this host:
 *
 * | Route | Cost |
 * |---|---|
 * | `SystemInformation.PowerStatus` — **what the WPF app reads** | **0.0 ms** |
 * | `Get-CimInstance Win32_Battery`, inside an already-running PowerShell | 23.7 ms |
 * | the same query via a **cold** `powershell -Command` spawn | **1,326 ms** |
 *
 * The first row is why the WPF app polls battery on its ordinary stats timer with no dedicated one
 * (`StatsService.cs:70-90`) — it is a `GetSystemPowerStatus` struct read, no WMI provider, no process. Node
 * has no equivalent, and Electron's `powerMonitor` exposes only the AC line as a boolean, not a percentage.
 * So a percentage costs a WMI query, and the third row is why that query lives in a child that stays alive:
 * a cold spawn is 56x the query it wraps. Same conclusion `typeperf`'s 2.81s first-sample cost forced for
 * the scalar rows, reached the same way.
 *
 * ## The wire format is fixed-arity on purpose
 *
 * `batt <percent> <status>`, always three tokens, with `-1` standing in for a NULL property rather than an
 * empty field. `EstimatedChargeRemaining` genuinely can be NULL, and `'batt ' + $null + ' ' + 2` would emit
 * `batt  2` — which reads as two tokens or three-with-a-blank depending on how it is split. That ambiguity
 * is the `typeperf` dropped-header defect in miniature: a field that vanishes rather than reading empty
 * shifts everything after it, and the result is a plausible wrong number instead of a missing one. So the
 * child never emits a variable number of fields, and this parser rejects a line that has the wrong count
 * instead of indexing into it.
 */

import { UNAVAILABLE } from "../../../shared.js"

/** One battery reading off the wire. */
export interface BatteryReading {
  /** 0-100, or {@link UNAVAILABLE} for "no battery, or a battery that will not say". */
  readonly percent: number
  /**
   * Whether `BatteryStatus` implies the machine is on mains.
   *
   * A **fallback only** — see {@link acFromBatteryStatus}. When the AC line can be read directly it wins,
   * because that is the byte the WPF app reads and this is an inference from a different field.
   */
  readonly acFromStatus: boolean
}

/**
 * `Win32_Battery.BatteryStatus` → "is this machine on mains".
 *
 * The values are from the CIM_Battery documentation and **only `2` is measured here** — this host was plugged
 * in and reported `batt 100 2` on every read, and no reachable machine can be unplugged from a tool call. So
 * the rest of this map is documented-but-unverified, which is precisely why it is the fallback and not the
 * primary: {@link BatteryReading.acFromStatus} is overridden by a real AC-line read whenever one is available.
 *
 * Two entries are genuinely mushy rather than merely unmeasured. `3` (Fully Charged) and `11` (Partially
 * Charged) describe the *charge*, not the *supply*, so a laptop sitting at 100% with the cable pulled can
 * report `3`. They are mapped to `true` because that is the common case, and the mapping being wrong in the
 * uncommon one is exactly the error the direct read removes.
 */
export function acFromBatteryStatus(status: number): boolean {
  switch (status) {
    case 2: // "Unknown" in the docs, and misleadingly named: it means the system has AC.  MEASURED.
    case 3: // Fully Charged
    case 6: // Charging
    case 7: // Charging and High
    case 8: // Charging and Low
    case 9: // Charging and Critical
    case 11: // Partially Charged
      return true
    default:
      // 1 Other/discharging, 4 Low, 5 Critical, 10 Undefined, 0 our own NULL sentinel, and anything a
      // future Windows adds. Defaulting to "on battery" is the safer error: it can only ever fail to draw
      // the plug glyph, where the opposite would suppress the low-battery alert on a draining laptop.
      return false
  }
}

/**
 * Parse one `batt` line, or return `null` for anything else.
 *
 * `null` is "not a battery line" rather than "a broken battery line" — the child's stdout also carries
 * PowerShell's own diagnostics, and later a second reading type, so a non-match is the ordinary case and not
 * an error. A `batt` line that is malformed returns an {@link UNAVAILABLE} reading instead: the tag says the
 * child was trying to report a battery, and the honest result of failing to read it is the `N/A` the renderer
 * already knows how to draw.
 */
export function parseBatteryLine(line: string): BatteryReading | null {
  const fields = line.trim().split(/\s+/)
  if (fields[0] !== "batt") return null

  // The explicit no-battery answer. A desktop takes this path, and so does a VM.
  if (fields.length === 2 && fields[1] === "none") {
    return { percent: UNAVAILABLE, acFromStatus: false }
  }

  // Arity is checked rather than assumed, for the reason the module header gives.
  if (fields.length !== 3) return { percent: UNAVAILABLE, acFromStatus: false }

  return {
    percent: batteryPercent(fields[1] ?? ""),
    acFromStatus: acFromBatteryStatus(Number.parseInt(fields[2] ?? "", 10)),
  }
}

/**
 * `EstimatedChargeRemaining` → a percentage, or {@link UNAVAILABLE}.
 *
 * The range check is the port of the WPF app's `BatteryLifePercent > 1.0f` guard
 * (`StatsService.cs:108-128`). That looks like a tautology on a 0-1 float and is not: `GetSystemPowerStatus`
 * writes `0xFF` into the byte when it cannot tell, which .NET divides by 100 into `2.55`, so the comparison
 * is a sentinel test wearing a range check's clothes. The CIM property expresses the same "cannot tell" as
 * NULL, which the child sends as `-1`, and both land on {@link UNAVAILABLE} here.
 */
function batteryPercent(field: string): number {
  const value = Number.parseInt(field, 10)
  if (!Number.isFinite(value) || value < 0 || value > 100) return UNAVAILABLE
  return value
}
