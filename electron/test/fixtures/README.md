# Captured telemetry fixtures

Real output from real tools, checked in so the per-platform parsers are testable on any
platform. Without these, the Windows parser could only be tested on Windows, the macOS
parser only on macOS, and a three-platform port would ship with three parsers each
tested on one machine.

Written by `bun scripts/capture-fixture.ts`. Do not hand-edit them.

## Rules these files depend on

**CRLF is preserved, in both directions.** `.gitattributes` marks the `*.csv` files here
`-text`, so git normalises nothing. `typeperf` emits a bare `\r` line before its header,
which is the reason the CSV parser splits on `/\r?\n/` at all — normalise these to LF and
the fixture silently stops covering the case it exists for. `typeperf-parse.test.ts`
asserts the CRLF is still there, because that regression is invisible in every other test.

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
