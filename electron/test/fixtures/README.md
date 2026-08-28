# Captured telemetry fixtures

Real output from real tools, checked in so the per-platform parsers are testable on any
platform. Without these, the Windows parser could only be tested on Windows, the macOS
parser only on macOS, and a three-platform port would ship with three parsers each
tested on one machine.

The Windows captures are written by `bun scripts/capture-fixture.ts`. Do not hand-edit them.

The **macOS captures were taken on a host this machine cannot reach** (an Apple M1 laptop,
macOS 26.6.2 arm64, via `mcp__mac-codex__codex` on 2026-08-28) and were transcribed here by
hand from that run's verbatim output. There is no capture script for them and re-taking them
means another dispatch, so treat them as irreplaceable in the same way
`typeperf-dropped-header.csv` is.

## Rules these files depend on

**Line endings are preserved, in both directions, and they differ per platform.**
`.gitattributes` marks `*.csv` and `macos-*.txt` here `-text`, so git normalises nothing.
The Windows captures are CRLF: `typeperf` emits a bare `\r` line before its header, which is
the reason the CSV parser splits on `/\r?\n/` at all — normalise these to LF and the fixture
silently stops covering the case it exists for. `typeperf-parse.test.ts` asserts the CRLF is
still there, because that regression is invisible in every other test. The macOS captures are
**LF and must stay LF**, which is the same rule pointing the other way: the repo-wide
`*.txt text=auto eol=crlf` policy would rewrite them to line endings `vm_stat` never emits.
`macos-pmset-batt-ac-charged.txt` additionally contains a **literal TAB** between the battery
id and the percentage — that is `pmset`'s own delimiter, and it is the byte a naive
whitespace-split parser gets wrong.

**Byte-exact field widths.** Recorded evidence cites exact lengths — a sound 4-counter
header is 40,020 chars, one that dropped a counter is 39,969. The hostname is therefore
replaced with an **equal-length** placeholder (`EXAMPLEHOST`), and the capture script
aborts if the substitution changes the byte count.

**Sanitized, because this repository is public.** PDH counter paths embed the machine
name in every field — 356 of them in the 4-counter capture. Pids and LUIDs are left
alone; they are meaningless once the processes are gone.

## Files

| File | What it is |
|---|---|
| `typeperf-4counter.csv` | `\Processor(_Total)`, `\Memory`, `\Paging File(_Total)` and the `GPU Engine(*engtype_3D)` wildcard expanded to ~353 columns. The realistic case. |
| `typeperf-scalar.csv` | The three scalar counters only — what the scalar child actually runs. |
| `typeperf-dropped-header.csv` | **The defect, caught live.** Read the note below before touching it. |
| `macos-vm_stat.txt` | `vm_stat` on macOS 26.6.2. **Page size is 16384, not 4096** — the header line is the only place that number appears, so a parser that assumes 4K is wrong by 4× on Apple silicon. Note that `Pages stored in compressor` (450,232) and `Pages occupied by compressor` (165,245) are *different numbers*: the first is logical, the second is the physical footprint, and only the second belongs in a memory-occupancy percentage. |
| `macos-vm-swapusage.txt` | `sysctl vm.swapusage`. Values carry an `M` suffix and the line ends in a bare `(encrypted)` token — both need handling, and neither is documented anywhere. |
| `macos-pmset-batt-ac-charged.txt` | `pmset -g batt` on AC, charged. TAB-delimited (see above). The `0:00 remaining` field is meaningless in this state, so a parser must not read it as "zero minutes left". |
| `macos-ioreg-agxaccelerator.txt` | One line of `ioreg -r -c AGXAccelerator -l`, holding `"Device Utilization %"=26`. This is the **unprivileged macOS GPU source** the plan assumed did not exist — see the note below. |

## About the macOS GPU fixture

The plan had macOS GPU utilisation as a permanent `-1`, because the documented source is
`powermetrics`, and `powermetrics` answers `powermetrics must be invoked as the superuser`.
The M7 run found `ioreg -r -c AGXAccelerator -l` exposing `Device Utilization %`,
`Renderer Utilization %` and `Tiler Utilization %` **with no privileges at all.**

Kept as a fixture rather than acted on yet, and the caveat is the point: this is an
**undocumented IOKit path on Apple's own GPU driver class.** `AGXAccelerator` is Apple-silicon
specific — an Intel Mac has a different accelerator class and this key path will not be there —
and the field names are not contractual. So it is a candidate source with one host of evidence,
not a settled one, and the `-1` fallback stays mandatory rather than becoming vestigial.

## About `typeperf-dropped-header.csv`

`typeperf` omits a requested counter from its header on roughly 21% of spawns, with empty
stderr and exit code 0. This file is one of those spawns: the header declares **2** paths
(`Memory`, `Paging File`) while every sample row carries **3** values, because the dropped
counter's *data* is still there.

```
header: [Memory, PagingFile]        sample: [39.317, 92.581, 4.386]
true:   cpu=39.3 mem=92.6 pag=4.4   rendered: mem=39.3  pag=92.6
```

So the failure is not a missing metric. It is every column after the gap reading its
neighbour's value — memory displaying 39% while it is really 93%. Plausible, stable, and
wrong, which is why `Win32StatsSource` validates the sample width against the header width
and not just the counter names.

It was caught by accident, while capturing the clean scalar fixture, and it cannot be
triggered on demand. **This is the only copy.** It is placed by hand rather than written
by `capture-fixture.ts` — the script rejects unsound captures and would overwrite it with
a clean one.
