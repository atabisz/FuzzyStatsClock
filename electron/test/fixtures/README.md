# Captured telemetry fixtures

Real output from real tools, checked in so the per-platform parsers are testable on any
platform. Without these, the Windows parser could only be tested on Windows, the macOS
parser only on macOS, and a three-platform port would ship with three parsers each
tested on one machine.

The Windows captures are written by `bun scripts/capture-fixture.ts`. Do not hand-edit them.

Four files here are **not** captures. `phrase-golden-*.tsv` are generated from the C# providers as
the ISC-13 translation oracle, and `wpf-geometry.tsv` / `wpf-layout.tsv` are measurements of the
running WPF controls. Both pairs follow different rules — see their sections below.

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
| `phrase-golden-segments.tsv` | The ISC-13 oracle, part 1: `GetSegmentKey` for all 1440 minutes × 18 locales = 25,920 rows. Deterministic by the `IPhraseProvider` contract. For the 8 single-template locales this is also the complete phrase output. |
| `phrase-golden-candidates.tsv` | The ISC-13 oracle, part 2: the **complete candidate set** per bucket for the 10 locales whose `GetPhrase` picks at random — 12,984 rows. See the note below; this one is not a capture, it is generated, and the distinction matters. |
| `wpf-geometry.tsv` | Phase 4's display measurements, read off the **real** `SevenSegmentDigit` and `NixieDigit` controls — 602 lines: 23 header lines and 579 data rows across 23 blocks. See the section below. |
| `wpf-layout.tsv` | Phase 4's layout measurements: WPF font line heights and the two clock views' `DesiredSize` — 100 lines: 4 headers and 96 data rows. Same section. |

## About the two `wpf-*.tsv` measurement fixtures

These are the port's answer to a question no amount of reading the C# settles: **what does WPF
actually compute?** They are stdout from `dotnet run` on a probe in `%TEMP%/fc-appprobe`, which
`<Page Include>`s `SevenSegmentDigit.xaml`, `NixieDigit.xaml`, `LcdClockView.xaml` and
`NixieClockView.xaml` into its own assembly with `<Generator>MSBuild:Compile</Generator>`. So
`InitializeComponent()` exists, the shipped private `RebuildGeometry()` runs, and the numbers are the
real controls' rather than a replica's arithmetic. Read by `test/lib/wpf-fixture.ts`.

**Format:** tab-separated; the first field is the row tag; a `#`-prefixed line is the column header
for the tag that follows the `#`. Every number is `G17`, so it round-trips through `Number()` to the
same double .NET had — which is what lets most assertions be exact rather than toleranced.

**These are not captures and not generated-from-source either.** Re-running the probe rewrites them,
like the phrase-golden files; unlike those, the probe has to be rebuilt from a tree that still has the
WPF app in it. That matters for ISC-31: **deleting `FuzzyClock.App` makes these unreproducible.**
Both regenerations so far diffed clean against the prior copy apart from the intended new rows, so the
probe is deterministic — but its inputs are the very thing Phase 9 removes.

**The only fixtures here NOT marked `-text`, on purpose.** `wpf-fixture.ts` splits on `/\r?\n/`, so
unlike the `typeperf` captures, the macOS captures and the phrase-golden oracle — every one of which is
byte-exact and pinned with `-text` in `.gitattributes` — nothing here depends on the line endings. So
these two follow the repo's ordinary `* text=auto eol=crlf` policy instead, which is what makes a
regeneration diff readable: the probe is `dotnet run` on Windows and emits CRLF, so redirecting its
stdout straight over the file matches the working tree and diffs down to the rows that actually changed.
Pinning them LF would make every regeneration a whole-file diff for no gain. The copies currently on this
disk are LF, from a `tr -d '\r'` that predates working this out; git stores LF either way, so a fresh
checkout gets CRLF and neither the parser nor any test can tell.

**What is measured, what is transcribed, and what is only declared** — the distinction is the point
of these files, and each level is worth a different amount:

- **Measured on the compiled controls.** All the `seg-*` and `nix-*` blocks, `lcd-view`, `nixie-view`,
  `text-line`, `text-size`, `accent-parse`, `dim-alpha`, `wrap-threshold`.
- **Transcribed formulas the probe re-states.** The four `dial-*` blocks and `nix-flicker`.
  `InitDialDecorations` and `UpdateDialDisplay` are private methods on a 2,221-line `MainWindow` with a
  tray icon and a settings service behind it, so the probe cannot call them. What those rows therefore
  prove is that **.NET's `Math.Sin`/`Math.Cos` agree with V8's** at the exact arguments the loops
  produce — which is the part that could genuinely differ — and *not* that the transcription matches
  MainWindow. Both `GeomProbe.cs` and `dial-geometry.test.ts` say so in their headers.
- **Declared, and deliberately absent.** Padding 12, the two 8px row gaps, the 2px stats-child margin,
  the 184px panel width, the 8px bar height, the 80×80 dial. These are literals in `MainWindow.xaml`,
  and a probe measuring them would only be measuring my ability to copy a number.

**`nixie-view` and `nixie-view-repath` are the same three sizes measured twice, and they disagree at
Medium on purpose.** `NixieClockView.SizeProperty` is registered
`new PropertyMetadata(LcdSize.Medium, OnSizePropertyChanged)`, so `new NixieClockView { Size = Medium }`
writes the value the property already holds, WPF raises no change notification, and `OnSizeChanged()` —
the only code that rescales the colon dots — never runs. The digits come out right anyway because
`NixieDigit.DigitHeight` also defaults to `56.0`; the dots stay at the XAML's literal `Width="8"`
instead of `56 * 0.13 = 7.28`, making the view 0.72px wider. So **a Medium Nixie's colon width depends
on the path taken to reach Medium in the shipped app**: 8 if it started there, 7.28 after any switch
away and back. Small and Large are identical on both paths, because their sizes differ from the
registered default and the callback always fires. The port computes from the size every time, so it
matches `nixie-view-repath` and necessarily differs from `nixie-view` at Medium — asserted as a
divergence in `layout.test.ts` rather than averaged away.

**Two blocks record deliberate divergences rather than parity.** `accent-parse` includes `Red` and
`Transparent`, which `ColorConverter` resolves (to `255,255,0,0` and to a *transparent white*,
`a=0 rgb=255,255,255`) and `parseAccentColor` does not — it handles the four hex shapes and falls back
to white, because no code path in the app can write a colour name into the settings file. And the
`text-line` rows carry a `widthOfSample` column that **nothing asserts**: a text width is a property of
the installed font file, and "Segoe UI Light" is absent on macOS and Linux, so asserting those widths
would pass here and fail on a Mac for a reason that is not a defect.

**`text-size` includes 45 and 90 for one specific reason.** `45 * 1.40` is `62.99999999999999` as a
double — the exact product *is* 63 and the double lands just under it — so C#'s `(int)` gives **62**.
That is the only shape in which the floating-point error changes the truncated result, it is reachable
through a hand-edited settings file, and `Math.Round` gets it wrong. Measured rather than argued from
IEEE-754.

## About the two phrase-golden files

These are the only fixtures here that are **generated rather than captured**, by
`dotnet run` on `tools/GoldenGen`. Re-running the generator rewrites them, which is the
opposite of the rule for everything above — so do not hand-edit them, and do not treat a
diff in them as a fixture regression until you have checked whether a provider changed.

**Why an oracle rather than a phrase-per-minute sweep.** ISC-13 was written as "phrase output
is byte-identical to the C# original across a full sweep". That is impossible as stated: 10 of
the 18 providers select a candidate with `Random.Shared.Next()`, so `GetPhrase` has no single
correct answer for a given minute. What these files pin instead is stronger than a sampled
phrase — the **set** of strings the port is permitted to emit, plus the deterministic bucket
key for every minute. A port that returns a plausible phrase from the wrong bucket fails here;
a sampled comparison would have passed it roughly four times in five.

**`kind=phrase` and `kind=structured` rows must not be zipped.** They are sampled
independently, so nothing records which phrase a given `(qualifier, emphasis)` pair came from.
Each kind is a complete set on its own; pairing them across columns would assert a
correspondence that was never measured.

**The reproducibility check is the evidence of completeness.** The candidate sets are collected
by calling the real provider until saturation, so the natural question is whether saturation
actually happened. Two independent generator runs produce **byte-identical** files, hashes and
all — if any set were short, the two runs would disagree. Reflection is used only to read each
bucket's candidate *count* (the denominator); every string in the file came out of the provider,
because an oracle that expanded `{h}` itself would be checking the generator rather than the C#.

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
