---
task: "FuzzyClock v5.0 — port the WPF/.NET overlay to a cross-platform Electron + SVG overlay, on a branch, merging to master and deleting the WPF version at parity"
slug: fuzzyclock-v5-electron-port
project: FuzzyStatsClock
principal_stated_goal: "Lets do this work in a different branch, when complete we'll move it to the main branch and remove the wpf version. Create the branch and begin work"
phase: build
progress: 8/34
mode: interactive
started: 2026-08-28T14:36:40+10:00
updated: 2026-08-28T16:41:00+10:00
branch: v5.0-electron-port
merge_target: master
base: ca611304c9937f9db6e9d4d7fc3ca4e2e15b28fe (branch point; the plan's and the feasibility run's measurements were taken here)
plan: .planning/research/ELECTRON-PORT-PLAN.md
---

## Problem

FuzzyClock is 15,204 LOC of WPF/.NET 10 that only runs on Windows: 24 P/Invoke entry points, four PDH
counters and a ring-0 temperature driver. The ask is a cross-platform Electron + SVG rewrite, built on
a branch, merged to `master` at parity with the WPF projects deleted at that point.

Two failure modes are specific to this shape of work. First, a port that *looks* three-platform because
it compiles, while every macOS and Linux behavioural claim was written on a Windows box. Second, a port
that deletes a working app before the replacement has earned the 633 tests the original passes — the
deletion is the irreversible step and it comes last for that reason.

## Vision

One codebase, three platforms, cheaper at idle than the WPF original, with a display that is native to
its medium rather than translated into it. At the end `master` has no `FuzzyClock.App` and nobody
misses it, because every feature either ported or was consciously retired with the reason written down.

## Out of Scope

- Native Wayland. X11/XWayland is the 1.0 Linux target (three named mechanisms in the plan).
- Feature additions. This is a port; new ideas go on the roadmap, not into the port.
- Touching `master` before parity. The WPF app stays shippable off `master` for the whole port.
- The gsd milestone tooling (`config.json`, `STATE.md`, `HANDOFF.json`, `ROADMAP.md`, `milestones/`) —
  written by `/gsd:*` commands, not by hand.

## Anti-claims

- **AC-1. `master` is never broken and never carries half a port.** All work lands on
  `v5.0-electron-port`. Falsifier: any commit on `master` before the parity merge.
- **AC-2. The WPF app is not deleted before the replacement passes what it passes.** Falsifier: a
  commit deleting `FuzzyClock.App` while the port's green test count is below the translated spec.
- **AC-3. No macOS or Linux behaviour is claimed green from a Windows probe.** API-surface evidence
  (Electron typings, `@platform` annotations) is labelled as such and never as behavioural. Falsifier:
  a `[x]` on a mac/linux runtime arm whose only evidence ran on win32.
- **AC-4. The go/no-go is decided by measurement, not by momentum.** Once code exists, the sunk cost
  argues for continuing. Falsifier: Phase 1 closing without a measured CPU% for the real workload, or
  that number exceeding the WPF baseline and the port continuing anyway without Alex's explicit call.
- **AC-5. Translated tests are not softened to pass.** A C# case that fails in TS is a port defect
  until proven a spec change. Falsifier: a test whose assertion was loosened in translation without a
  Decisions row saying why.

## Claims

### Phase 0 — Decide

- [x] **ISC-1. The merge target is named unambiguously.** "the main branch" is `master` in this repo —
  `git branch --show-current` on a clean tree returned `master`, and there is no `main`. Evidence:
  command output, this run.
- [x] **ISC-2. The WPF disposition is settled.** Retired at parity, deleted on merge — stated in the
  goal verbatim ("remove the wpf version"), which closes Phase 0's fourth question.
- [~] **ISC-3. The remaining three Phase 0 calls are Alex's and are surfaced, not assumed.** Temps
  option (A/B/C/D), Linux XWayland-only, auto-contrast in/out of 1.0. **None of them gates Phases 1-3**,
  and Phase 1 produces the sidecar size the temps call depends on — so the build proceeds and the
  questions are asked when their evidence exists, rather than blocking now. Closes when he answers.

### Phase 1 — Telemetry + platform spike (THE GO/NO-GO)

- [x] **ISC-4. Long-lived `typeperf` children stream all four Windows counters and are parsed.**
  `bun electron/scripts/probe-typeperf.ts`, 7 passed / 0 failed / 1 inconclusive. A1 layout: live
  `cpu=36.64 mem=91.43 pag=4.17`, 353 bound 3D instances, and the counter-case reorder moved cpu 0→3
  while gpu moved 3→0, so the parser is matching on path text and not on position. A2 cadence: mean
  1008ms, worst 1013ms. A3 CPU: PDH 38.11% against `os.cpus()` jiffies 34.38%, |delta| 3.73 over one
  shared window, with a 46.6-point spread that rules out a constant. A2b: recovers to mean 1012ms after
  32-core saturation. **Two children, not one** — the reasons are in `win32.ts`'s docblock and only one
  of them is the drop defect.
- [x] **ISC-4.1. `typeperf` silently drops a counter from its header while keeping the data, and both
  guards catch it.** Measured 3/14 on all-four spawns; header one field short (39,969 against 40,020),
  **empty stderr, exit code 0**. Caught live twice more: once on a 3-counter scalar child
  (`header missing [cpu] (attempt 1/4)` → re-spawn → `header ok: 3 paths` → A1 read `cpu=74.41` from the
  replacement), and once **captured to disk in full**, which is what showed the consequence had been
  misread. The header declared 2 paths while every sample row carried 3 values:

  ```
  header: [Memory, PagingFile]        sample: [39.317, 92.581, 4.386]
  true:   cpu=39.3 mem=92.6 pag=4.4   rendered: mem=39.3  pag=92.6
  ```

  The dropped counter's *data stays in the rows*, so every column after the gap is off by one and renders
  **plausible, stable, wrong numbers** — memory showing 39% while it is really 93%. Strictly worse than a
  missing reading. Two independent guards now: `acceptHeader` matches names, and `acceptSampleWidth`
  compares header field count against the first sample's, which catches a drop **without knowing which
  counter went missing** — the case name-matching cannot see is a dropped *GPU* column, where all three
  scalar names are present and all 353 3D indices shift. Fixture: `typeperf-dropped-header.csv`;
  34 tests pass under `bun test`.
- [x] **ISC-5. The GPU spawn-time instance defect is reproduced and the recycle recovers it.** PDH
  resolves `GPU Engine(*engtype_3D)` instances at spawn, so engines from later-started processes are
  invisible. A5, with the churn caused rather than awaited: the launch created **1 new instance**
  (`pid_157656_..._engtype_3D`), live 353→354, vanished 0, and the running child — bound to 353 at spawn
  — was blind to it. A6: the recycle recovered **1/1**, bound 353→354, across **6 scalar samples with a
  worst stamp gap of 1015ms**, against the ~3000ms a sequential kill-then-spawn would show.
- [x] **ISC-6. The real workload is measured, and on CPU it is cheaper than the WPF baseline.** The
  window is the real shape — frameless, transparent, topmost, out of Alt-Tab — with the two live
  `typeperf` children attached and the SVG stat panel repainting once a second. `bun
  electron/scripts/probe-cost.ts`, **4 passed / 0 failed / 0 inconclusive**, run twice:

  | run | electron | wpf | factor | electron paints |
  |---|---|---|---|---|
  | 1 | 10.88% of one core | 20.98% | 1.93× | 75 |
  | 2 | **8.21%** | **19.92%** | **2.43×** | 75 |

  Both builds measured **by this probe, back to back, with one instrument** — stronger than the
  Verification row asked for, which only required the same probe *shape* as the prior WPF figure. The
  three WPF readings (24.2% prior, 20.98%, 19.92%) and the two Electron readings (10.88%, 8.21%) do
  not overlap, so the direction survives the ambient noise on this host rather than resting on one
  pair. Startup+settle is reported separately and also favours Electron heavily: **2.68% against
  26.51%** over ~14s. AC-4 is satisfied: the number exists and the claim was allowed to fail.
- [ ] **ISC-6.1. The RSS half of ISC-6 is NOT resolved, and the reason is the method, not the result.**
  A multi-process tree has no single true footprint: sum-of-working-sets double-counts every page
  shared between Electron's processes (upper bound), and sum-of-private-working-sets omits shared
  pages that are genuinely resident (lower bound). Measured intervals **overlap in both runs** —
  electron `[95.7, 358.0]`MB against wpf `[167.7, 327.7]`MB (run 2), electron `[105.3, 380.6]`MB
  against wpf `[165.1, 324.6]`MB (run 1) — so no ordering follows in *either* direction. The probe
  says so in its own verdict and gates on CPU alone. Closing this needs shared-page accounting
  (per-process PSS), not another run of the same instrument. **Does not gate the port**: ISC-6's CPU
  half is what AC-4 named, and 358MB against 327.7MB is not a magnitude that changes the decision.
- [x] **ISC-7. `Display.label` is read from a running Electron on his 3-display setup — and it is NOT a
  usable key. The composite fallback becomes the primary.** `bun electron/scripts/probe-displays.ts`,
  6 arms, **0 blocking failures**, two cold Electron launches. What his desk actually reports:

  | display | label | geometry | scale |
  |---|---|---|---|
  | internal | **`""`** (empty) | 1920×1080 @ 3441,−499 | 1.00 |
  | LG (primary) | `"LG HDR WQHD"` | 3440×1440 @ 0,0 | 1.00 |
  | LG | `"LG HDR WQHD"` — **same string** | 3440×1440 @ 1,−1440 | 1.00 |

  So the label fails **both** ways at once: empty on one display, and duplicated across the other two.
  "Non-empty and stable" — the claim as originally written — would have passed on two of three
  displays and still produced an overlay that restores onto the wrong LG. Uniqueness had to be a
  separate arm, and the WPF original is what pointed at it: `MonitorService.cs:90-115` already runs a
  second pass suffixing duplicate friendly names `-2`, `-3`, which is only there because this exact
  case happens. The disjunction in the claim is what resolved it: **composite key
  `WxH@x,y:scale`** — 3 distinct values, all identical across both launches, as are `id` and
  enumeration order. Label is kept as a display *name*, never as an identity.
- [x] **ISC-7.1. The existing WPF settings file cannot be imported key-for-key, and one of its entries
  is already orphaned.** His live `%LOCALAPPDATA%\FuzzyClock\settings.json` stores
  `MonitorPositions: { display6: …, display5: … }` with `LastActiveMonitor: "display5"`. Those are
  **`MonitorService.FallbackKey` output** — GDI device names with `\\.\` stripped — which means the
  shipping app is not using friendly names on this machine at all, and Electron exposes no GDI device
  name to reproduce them from. Measured against the live enumeration: `display6`'s (1620, 20) lands
  inside the primary LG, and **`display5`'s (−227, 510) lands outside every connected display**. So
  ISC-18's import must match **by geometry, not by key**, and must handle an orphaned entry rather
  than trusting a stored position — a case his live file already contains. Read-only; the file was
  not modified.
- [ ] **ISC-8. A real installer size exists.** One `electron-builder` run, measured against the WPF
  200,457,651-byte single-file exe and 57,389,487-byte Inno installer. *(Carried `[DEFERRED-VERIFY]`;
  the ~85MB figure in circulation is a prior, not a measurement.)*
- [ ] **ISC-9. The temps sidecar's packaged size and per-read latency are measured.** Option A cannot
  be chosen on an unmeasured size. Prototype: .NET console wrapping LibreHardwareMonitorLib, one JSON
  line per 2s to stdout.
- [ ] **ISC-10. The shell flags are smoked on macOS and on an X11 Linux session.** The only way the
  plan's `[UNPROBED]` rows become real. `mcp__mac-codex__codex` can cover the macOS half on Alex's
  go-ahead; Linux needs a host.

### Phase 2 — Core translation

- [ ] **ISC-11. `FuzzyClock.Core` is translated in full, and the denominator is the measured one.**
  28 files / 2,510 LOC = 1,987 across 18 phrase providers + 523 across 10 logic files.
- [ ] **ISC-12. ≥469 translated Core tests pass under `bun test`.** Translated alongside each unit, not
  afterwards — a test written after the code it checks is a rubber stamp (AC-5).
- [ ] **ISC-13. Phrase output is byte-identical to the C# original across a full sweep.** Golden file
  generated from the C# side: every minute of 24h × 6 locales × 11 styles. This is the claim that makes
  ISC-12 more than self-agreement.
- [ ] **ISC-14. The pure seams from the App layer are ported with their tests.**
  `ComputeProximityRatio`, `LerpRatio`, the formatters and the version comparer are already static and
  pure in C#.

### Phase 3 — Shell

- [ ] **ISC-15. The overlay window carries the proven flag set, read back off a live window.**
  Not read off the source (`garry-desktop`'s own probe discipline).
- [ ] **ISC-16. It is absent from the taskbar/dock and from Alt-Tab/Cmd-Tab on all three platforms.**
- [ ] **ISC-17. Tray icon and menu work, with the Linux activation-semantics difference handled.**
- [ ] **ISC-18. Settings persist at `app.getPath('userData')`, and the existing Windows settings file
  is imported once — matching monitors by GEOMETRY, not by key.** `%LOCALAPPDATA%\FuzzyClock\settings.json`
  must survive the transition; his live file is the one an upgrade meets, and per ISC-7.1 its
  `display5`/`display6` keys are GDI device names Electron cannot produce. The importer maps a stored
  `Left`/`Top` to whichever current display's bounds contain it, and **drops an entry that lands on no
  display** — his file already has one (`display5` at −227, 510).
- [ ] **ISC-19. Per-monitor position survives a restart and a display-configuration change.** Keyed on
  the composite (ISC-7), which carries position — so rearranging displays in Windows invalidates the
  key by construction. The falsifier that matters is therefore not "the position was lost" but "the
  window restored off-screen": on a key miss it must clamp into the target display's work area.
- [ ] **ISC-20. Drag-to-move works, and the window stays within the target display's work area.**

### Phase 4 — SVG display

- [ ] **ISC-21. All four display modes render: phrase, dial, LCD, Nixie.**
- [ ] **ISC-22. Animation touches only composited properties.** `transform`/`opacity` only; never
  `r`/`rx`/`ry`/`cx`/`cy`/`d` per frame. Falsifier: a frame scrub or a paint-flash capture showing
  re-rasterisation.
- [ ] **ISC-23. Every theme and the auto-contrast colour path render correctly.**

### Phase 5 — Ghost mode

- [ ] **ISC-24. Proximity fade works off main-process cursor polling.** Never off
  `setIgnoreMouseEvents` mousemove forwarding, which was measured delivering zero events here.
- [ ] **ISC-25. Click-through toggles against renderer-measured hit boxes.**
- [ ] **ISC-26. PERF-01 is closed, not deferred again.** The fade stays smooth under a synthetic
  25–50% CPU load — the v4.4 defect still open in `.planning/STATE.md`. Mechanism: CSS `opacity` on the
  compositor with the rAF loop owning interpolation, so a busy main process cannot stall it.

### Phase 6 — Stats panel + per-platform sources

- [ ] **ISC-27. All 18 telemetry cells resolve.** Each shows a live number on its platform or renders
  `--` through the existing `-1` sentinel path.
- [ ] **ISC-28. Every per-platform parser is fixture-driven and runs on every platform.** Captured
  `/proc/meminfo`, `typeperf` CSV, `pmset -g batt`, `hwmon` tree checked in. This is what makes three
  platforms testable from one.

### Phase 7 — Packaging, auto-launch, update check

- [ ] **ISC-29. An installer per platform installs, launches and auto-launches at login.** Includes a
  **CrowdStrike Falcon re-proof on Windows** — Falcon blocks `garry-desktop`'s autostart spawn pair on
  this machine, and a packaged installer is a different case that must be proven, not assumed.
- [ ] **ISC-30. Linux auto-launch works via a hand-written `~/.config/autostart/*.desktop`.**
  `setLoginItemSettings` is `@platform darwin,win32` — there is no API to call.

### Phase 8-9 — Auto-contrast, then retirement

- [FOG] **Auto-contrast.** `desktopCapturer` + `setContentProtection(true)` for self-exclusion, which
  replaces the Z-order feedback guard on win/mac and has no Linux equivalent. Too dim to state as a
  claim until Phase 6 lands, and first on the cut list — his live settings have it disabled.
- [ ] **ISC-31. The merge deletes the WPF version and the release pipeline still ships.**
  `FuzzyClock.App` gone, `release.yml`'s REL-03 guard replaced by whatever guards the new build. This
  is the irreversible step; it closes last (AC-2).

## Decisions

- **Branch `v5.0-electron-port` off `ca61130`.** Same base every existing measurement was taken at, so
  the plan's numbers and the feasibility greens apply to this tree without re-probing (claim 17).
- **ISA at the repo root, not in `MEMORY/WORK/`.** The port has persistent identity and outlives this
  run, which is the documented home for that class. It lives on the branch so it travels with the work
  and merges with it — the same shape `~/code/garry-desktop/ISA.md` already uses.
- **Did not block on the three open Phase 0 calls.** None gates Phases 1-3, and the temps decision
  depends on a number Phase 1 produces (ISC-9). Asking now would trade a turn for answers that would
  be better-informed one phase later, right after he said "begin work".
- **Phase 1 before the shell, deliberately.** The window flags, tray, click-through and ghost design
  are already proven in `garry-desktop`, so building them first would feel like progress while learning
  nothing. The only open question that can kill the port is what the telemetry actually costs.
- **`electron/` as a sibling tree, WPF untouched.** Keeps the shipping app shipping and keeps the 633
  C# tests alive as a translation oracle rather than a memory (ISC-13 depends on running them).
- **`electron/scripts/` probes are `bun`-runnable with no Electron import.** Same rule
  `garry-desktop/src/platform.ts` follows: the platform and parsing layers stay loadable without an
  Electron runtime, which is what makes them testable on any OS.
- **A non-finite parse becomes `-1`, never `0`.** `typeperf`'s CSV quotes every field and a
  decimal-comma locale would break `parseFloat`. A zero would render as a real reading of zero; `-1` is
  the app's existing unavailable sentinel and renders as `--`. Silent-zero is the failure being
  designed out.
- **GPU is the SUM of every `engtype_3D` engine, clamped to 100 — not the max, not the mean.** That is
  what `FuzzyClock.App/StatsService.cs:129-131` does (`Math.Min(_gpuCounters.Sum(c => c.NextValue()),
  100f)`). Fidelity requirement, not a design choice: work spreads across engines, so a max
  under-reports a loaded GPU and a mean under-reports it worse. `gpuColumnsLive` is carried separately
  because "every engine read zero" and "no engine columns existed" are different failures and the summed
  value cannot tell them apart.
- **Every Electron launch from a probe goes through `scripts/lib/electron-launch.ts`.** VSCode exports
  `ELECTRON_RUN_AS_NODE=1` into terminal environments, and under it `electron.exe` runs the script as
  plain Node: `require("electron")` yields the path string, `app` is `undefined`, nothing renders — and
  with stdio discarded it **exits 0**, indistinguishable from a clean run. This cost a whole detour
  (Changelog). The general rule is the reason it is a shared helper and not an inline `delete`: an
  instrument that fails silently under a variable you did not set will be believed. ISC-6, ISC-7 and
  ISC-8 all launch Electron and are all exposed to it.
- **Two independent header guards, not one.** `acceptHeader` matches counter names;
  `acceptSampleWidth` compares the header's field count against the first sample's. Kept separate
  because each catches a case the other cannot: a missing scalar name is invisible to a width check on a
  wildcard child whose column count varies anyway, and a dropped GPU column is invisible to name
  matching. Both route through one `rejectChild`, bounded at 4 attempts — unbounded would spawn forever
  on a machine where a counter is *legitimately* absent, e.g. no pagefile.
- **Captured fixtures are byte-exact, CRLF-preserved, and hostname-sanitized.**
  `scripts/capture-fixture.ts` writes them; `.gitattributes` marks
  `electron/test/fixtures/** -text` so git normalises neither direction. Three properties are
  load-bearing. CRLF, because `typeperf` emits a bare `\r` line before its header and that is why the
  parser splits on `/\r?\n/`. Byte-exact field widths, because recorded evidence cites exact lengths
  (40,020 good / 39,969 dropped) — so the hostname substitution is **equal-length** and the script aborts
  if the byte count moves. And sanitization at all, because **this repo is public** and PDH paths embed
  the machine name in every one of 356 fields.
- **The capture script re-captures on an unsound capture, up to 6 times.** It validates header width
  against sample width before writing. Needed because the defect fires often enough to land in a fixture:
  the first "clean" scalar fixture this script wrote *was* a dropped-header capture, and a fixture named
  `typeperf-scalar` that quietly contains the defect teaches every test written against it that the
  broken shape is normal. The defect capture is checked in deliberately under its own name, placed by
  hand so a re-run cannot overwrite it with a clean one.
- **The recycle is kept, and its necessity is now measured rather than assumed.** A5/A6 show a real
  process starting later, registering a 3D instance, and the running child staying blind until rotated.
  Cost is one extra spawn per interval and a measured worst gap of 1015ms with the overlap; the interval
  itself is still an open Phase 6 tuning question (Still outstanding).
- **The ISC-6 harness is the real window, not a stub.** Frameless, transparent, topmost, `skipTaskbar`,
  `backgroundThrottling: false`, real telemetry attached, real SVG repainting at 1s. A harness cheaper
  than the finished app produces a number that flatters the port and then fails to hold in Phase 6. What
  is absent — phrase engine, tray, settings, ghost mode — is absent because none of it runs work on the
  1s tick, and the phrase text is rewritten at most once a minute in the WPF original either way.
- **A pid that starts inside the measurement window contributes its ENTIRE CPU time, not a delta.**
  The one line the whole comparison turns on (`probe-cost.ts`, `fold()`). Without it every recycle
  replacement is scored as `last − first` against its own first sighting and silently discards most of
  its cost — which on this workload is 76% of the total. A "start-of-window process set" resolved once
  would have had the same effect.
- **The WPF baseline app is killed, never closed.** A clean exit lets it write to Alex's live
  `%LOCALAPPDATA%\FuzzyClock\settings.json`, and this probe has no business modifying it. It is
  launched with his real settings (`StatsVisible: true`, 3s interval, temps and uptime on) precisely
  because the question is what the app he actually runs costs — but read-only.
- **`probe-displays.ts` splits its arms into blocking and diagnostic, and the exit code follows the
  blocking ones.** ISC-7 is a disjunction, so a failing label selects the other branch rather than
  failing the claim. B2/B3/B6 stay recorded as FAIL because that is what they measured — the alternative
  is relabelling a true negative to make a summary green — but a re-run on this desk is not permanently
  red for correctly reporting a property of Alex's monitors. What blocks is B1 (nothing enumerated) and
  B5 (no usable key of any kind).
- **The composite key is `WxH@x,y:scale`, and position is in it deliberately despite the cost.** Two
  identical monitors differ *only* in position, so a geometry key without it collapses exactly where the
  label already did. The cost is real and is now ISC-19's problem: rearranging displays invalidates the
  key. `display.id` was the other candidate — unique and restart-stable in both launches — and is not
  chosen because Chromium derives it per session on Windows and nothing here measured it across a
  reboot. Preferring the key whose failure mode is *understood* over the one whose stability is merely
  unrefuted.
- **His live `settings.json` is read and never written, by both probes.** `probe-cost.ts` kills the WPF
  app rather than closing it for this reason; `probe-displays.ts` opens the file read-only. It is his
  real configuration and the upgrade path (ISC-18) has to meet it intact.
- **The probe gates on CPU and says so in its verdict text.** An earlier draft printed "0.85× on
  sum-WS" inside a PASS sentence, where 0.85× means Electron is *more* expensive — a true number
  arranged to read as a win, in the one artifact whose job is to be able to fail. It now prints both
  footprint intervals, the word INDETERMINATE, and "the RSS half of ISC-6 stays OPEN and is not claimed
  here".

## Verification

Base: `ca611304c9937f9db6e9d4d7fc3ca4e2e15b28fe`, branch `v5.0-electron-port`. Every green below was
measured on this branch at or after that base.

| Claim | Re-runnable probe | Discriminator |
|---|---|---|
| ISC-1 | `git branch --show-current` on the pre-branch tree; `git branch --list main` | **positive control**: `master` was returned by the same command that would have returned `main` had it existed, and `--list main` is empty — so the absence is measured, not inferred from the presence |
| ISC-2 | The stated goal, verbatim in frontmatter | quoted from his message, not paraphrased |
| ISC-4 | `bun electron/scripts/probe-typeperf.ts` — arms A1, A2, A2b, A3 | **counter-case** met by reordering the requested counters and re-reading the header: cpu moved 0→3 and gpu 3→0, so a positional parser would have failed where this one did not. **Cross-mechanism** for CPU: `os.cpus()[].times` jiffies come from libuv with no PDH, no child and no counter path, so agreement is two independent readings and not one reading twice. **Denominator** for the spread: 46.6 points of PDH movement across the shared window, because a source stuck at any constant passes a mean comparison |
| ISC-4.1 | `bun test` (34 pass) over `test/fixtures/typeperf-dropped-header.csv`; plus arm A7, observational | **asymmetric evidence** (claim 19): a run reporting 0 retries is not evidence the defect is absent, only that it did not fire, so A7 never returns PASS and the deterministic evidence is the fixture. **Counter-case** for each guard separately: a synthesised GPU-column drop passes name matching with all three scalar names present, and is caught only by the width comparison — so neither guard is redundant. The fixture is a **real capture, not a synthesis**, which matters because the misalignment was not predicted; it was found by the clean-fixture capture accidentally catching the defect and the tests failing on it |
| ISC-5 | same probe, arms A5 and A6, with `nvidia-smi --query-gpu=utilization.gpu` cross-reads | **positive control** is the correction that makes this arm mean anything: `liveBefore` is captured so the churn is scored as `liveAfter − liveBefore`, and the defect read only from instances that control proves are new. Without it the only comparison is bound-vs-live, which is already non-zero at spawn (319 of 354 in one run) and so passes for any churn source at all, including one that never ran. **Transition** in one process lifetime: bound 353 → blind to a named new instance → recycle → bound 354 covering it |
| ISC-6 | `bun electron/scripts/probe-cost.ts` from `electron/` — arms A1, A2, A3, A4 | **positive control** (A1): a deliberate spin loop must read ≥80% of one core, and did — 98.9% and 97.1% across the two runs. Without it a plumbing fault returning near-zero CPU for everything presents as a spectacular result, which is the exact failure this claim is most vulnerable to. **Liveness control**: 75 real paints per 70s window, acknowledged from inside `requestAnimationFrame` — a renderer Chromium believes occluded stops rendering and becomes very cheap, so a CPU-only probe would score that state as a win. **Cross-check** against a measurement this run does not depend on: the prior session's 24.2% WPF figure, reproduced here at 19.92% and 20.98% (−4.28pp, −3.22pp). **Denominator**: the whole process tree re-walked every sample, 8-10 processes against WPF's 1, so `electron.exe`-alone (which would drop the renderer) cannot be what was measured |
| ISC-7 | `bun electron/scripts/probe-displays.ts` — arms B1..B5 | **the uniqueness arm is the discriminator, and it is the one the claim as written did not have.** "Non-empty and stable" passes on 2 of 3 of his displays while still being unusable, so the probe asks separately whether a label *distinguishes* one monitor from another — and 2× `"LG HDR WQHD"` is what makes the answer no. **Counter-case from the original**: WPF's own `MonitorService.cs:90-115` duplicate-suffix pass exists only for this case, so the ambiguity is a known production property, not a probe artefact. **The fallback branch is measured before being selected** — composite uniqueness and restart stability are both checked, rather than assumed to work because the preferred branch failed. **Two cold launches**, so the enumeration is genuinely re-done and not read twice from one process |
| ISC-7.1 | same probe, arm B6 | **cross-artifact**: the live settings file and the live enumeration are read in the same run and matched against each other, so "these keys are unproducible" is measured against what Electron actually reported on this desk rather than against the API docs. **Two independent failures, one visible only via geometry**: the key mismatch would be caught by any comparison, but the orphaned `display5` position is only visible by testing the stored point against current bounds — and it is the one that would have shipped as a window restored off-screen |
| ISC-6.1 | same probe, A4's memory lines | the claim is that the method **cannot** decide, and the probe demonstrates it rather than asserting it: it prints both bounds and both intervals, and the overlap is visible in the output. A single RSS number for either side would pass a naive comparison in whichever direction it was chosen — which is the failure being refused |

### Still outstanding

- **Every macOS and Linux runtime arm is unprobed** (ISC-10, and the platform halves of ISC-15..20,
  ISC-27..30). What exists is API-surface evidence from Electron 33.4.11's typings. `[DEFERRED-VERIFY]`
  — Phase 1.6 opens them; a Mac is reachable via `mcp__mac-codex__codex` on Alex's go-ahead, a Linux
  host is not currently identified.
- **The GPU recycle interval will need tuning even once ISC-5 closes, and ISC-6 now says how much is at
  stake.** **76% of Electron's measured CPU is the recycle, not the app** — reproduced exactly across
  both runs (4.27s of 5.61 in run 2; 5.83s of 7.63 in run 1), attributed to the replacement `typeperf`
  children and their conhosts that started inside the window. The resident cost of the actual overlay —
  main, renderer, GPU process, the two long-lived counter children — is **1.34 CPU-seconds over 68.4s,
  about 2% of one core**. So the dominant term is a tunable (`recycleMs`, currently 30s), and the
  headroom below the WPF baseline is far larger than the 2.43× headline. The naive answer still fails in
  the other direction: recycle constantly and the 2.81s spawn cost the streaming design exists to avoid
  comes back.
- **The memory half of ISC-6 is open as ISC-6.1**, and it needs a different instrument rather than
  another run.
- **Two asymmetries remain in the ISC-6 comparison, and they cut opposite ways.** *Against Electron:* it
  repaints every 1s where Alex's live WPF settings sample every 3s, so Electron is doing three times the
  update work per unit time and still measured cheaper. *For Electron:* the WPF build polls
  LibreHardwareMonitor for temperatures (`TempsLineVisible: true` in his settings) and Electron has no
  temperature source yet, so some part of WPF's cost buys a feature Electron does not have. The probe
  cannot separate that without editing his live settings, which it will not do. **ISC-9 is where the
  second one gets bounded**, which is why the ISC-6 pass is conditional on ISC-9 rather than final.
- **ISC-7's stability is bounded at "across a process restart", which is weaker than it sounds.** Two
  cold Electron launches, minutes apart, one display arrangement. It does **not** cover a reboot, a cable
  swap, a monitor power-cycle, or a resolution change — and the composite key is *designed* to break on
  the last of those. Per claim 19 the arm is stated at the endpoint that was measured. The reboot and
  rearrange cases are cheap to close later (re-run the same probe after each) and neither blocks Phase 3.
- **`display.id`'s stability is unmeasured beyond a restart**, which is why it is not the key even though
  it was unique and stable in both launches. If a future reboot check shows it holds, it is strictly
  better than the composite — it does not carry position, so rearranging displays would not invalidate it.
- **`MEASURE_SEC` is now 70 and must not be shortened back.** See the aliasing entry in the Changelog:
  a 20s window can miss the 30s recycle entirely and report roughly half the true cost.
- **The guards are validated at the parse layer, not at the process layer.** 34 fixture tests prove
  detection and spell out the consequence, but `acceptHeader` / `acceptSampleWidth` / `rejectChild` are
  private methods on a class that spawns real children, so **the re-spawn itself has only been observed
  live, once, not unit-tested**. Closing that means extracting the validators as pure functions over
  (headerPaths, firstSampleWidth, role) — worth doing, and it is the shape the rest of the telemetry layer
  already follows.
- **`MAX_HEADER_ATTEMPTS = 4` is calibrated to one host's ~21% drop rate**, which leaves under 0.2%
  residual. That bound is a measurement, not a constant: on a host where the rate is much higher, 4
  attempts is not enough. `scripts/repro-header-shift.ts` is retained for exactly this — re-measuring the
  rate per host — rather than deleted as originally planned, since its per-configuration comparison is
  the only thing that produces the number the bound depends on.
- **`typeperf -qx` and the parse module's own enumeration disagree by one instance** (353 vs 354 in one
  cross-check). Not chased: every comparison the probe makes uses one method on both sides, so a constant
  offset cannot produce a false transition. Worth resolving before any claim rests on an absolute count
  rather than a difference.
- **Counter paths are English-locale only.** `typeperf` takes localized counter names, so
  `\Processor(_Total)\% Processor Time` fails on a non-English Windows. The locale-independent form is the
  numeric index path via the `Perflib\009` / `CurrentLanguage` registry maps — a lookup table, not a
  redesign, and it needs a non-English host to verify on. Recorded in `win32.ts` as a known limitation.

## Changelog

- **conjectured** at ISA-scaffold time that the counter probe would confirm the mechanism, and I wrote
  ISC-4 and ISC-5 into the artifact as `[x]` with invented sample values before the probe existed.
  **refuted-by** claim 18 on re-read — a box flipped from expectation is not a probe. Both reverted to
  `[ ]`, the fabricated numbers deleted, and the discriminators rewritten as what the probe *must* show
  rather than what I assumed it would. Recorded rather than quietly corrected, because the near-miss is
  the useful part: pre-writing an ISA's greens alongside its claims is how a self-consistent artifact
  gets built on nothing.
- **criterion-now** the go/no-go is ISC-6 alone. ISC-4 and ISC-5 only establish that the mechanism
  exists and its known defect is recoverable; neither says what it costs, and cost is the only thing
  that can kill the port.
- **conjectured** that the ~21% counter drop was caused by the 354-instance GPU wildcard perturbing the
  batch (H3), on 8 interleaved rounds per configuration: all-four 3 bad, scalars-only 0/8,
  gpu-only 0/8. Wrote the split-child design up as *the fix for the drop*. **refuted-by** a later
  `probe-typeperf` run in which the three-counter scalar child — no wildcard on its command line —
  dropped `cpu` on its first spawn. One counter-example beats 8 clean trials. The split stays, on three
  grounds that never depended on the defect, and `acceptHeader()` is reclassified from defence-in-depth
  to the load-bearing fix. The lesson is the one the original comment had already written down and then
  reasoned past: **0/8 bounds a ~21% rate loosely, and "loosely" was doing real work in that sentence.**
- **conjectured** that A5's earlier pass demonstrated churn-driven blindness — `bound 319, live 354,
  appeared 35`, credited to a `notepad.exe` launch. **refuted-by** re-reading the sequence: the child had
  bound 319 *at spawn, before notepad launched*, so the arm was measuring the standing gap between a
  child's spawn-time wildcard expansion and what `typeperf -qx` lists. It would have "passed" with no
  churn source at all, and did — the launch it credited was a tabbed single-instance app that created no
  process. Fixed by taking a third set (`liveBefore`) and scoring the churn as a positive control, which
  is what turned A5 into a claim about the defect instead of a claim about wildcard expansion.
- **conjectured** that this host does not register new 3D engine instances for newly started processes,
  after a churn Electron produced `appeared: 0` with the set pinned at exactly 354 twice, and after
  finding that of four `electron` pids only one appeared in the `GPU Engine` object at all.
  **refuted-by** running the churn helper in the foreground instead of discarding its output: it was
  dying on `TypeError: Cannot read properties of undefined (reading 'whenReady')` under
  `ELECTRON_RUN_AS_NODE=1`, so it had never launched once, and the four pids were the editor's own.
  With the variable scrubbed the set moves 706→708 counter-path lines on every launch. Three things were
  nearly concluded from this — that PDH returns a stable superset, that the "new process is invisible"
  premise was weak on this host, and that the recycle was insurance of unproven necessity. All three were
  artefacts of a broken instrument, and the closest call is that **the wrong conclusion was the
  conservative-sounding one**: it would have removed a mechanism the defect genuinely needs, while
  citing measurements as the reason.
- **conjectured** the counter drop's consequence was that the missing metric reads unavailable and
  renders `--`, "on roughly one app start in five, forever" — written into `win32.ts`'s docblock as a
  measured characterisation. **refuted-by** a capture of the defect: the header lost the path, the
  **samples kept the data**, so the columns after the gap shift and render memory as 39% while it is 93%.
  Wrong numbers, not missing ones. The mistake was inferring the consequence from the symptom I had
  measured — a header one field short — instead of from the pair. Two things followed: the width guard,
  which is the stronger of the two and did not exist while the wrong model held; and the reason the
  fixture is checked in as a real capture rather than a synthesis, since a synthesised short header
  reproduces the symptom and *not* the misalignment, and would have confirmed the wrong model.
- **criterion-changed** ISC-6's own stated method. It said "measured over 20s", and the first run of the
  probe showed why 20s is the wrong number: a `typeperf` child that started mid-window contributed
  2.078s of 3.70 total CPU-seconds — **56% of everything measured** — and that child is a 30s recycle
  replacement. So a 20s window can land entirely between two recycles and report roughly half the true
  cost, or catch one and report it as steady state. **The measurement period must exceed the workload's
  own period**, which is a general rule and not a detail of this probe: `MEASURE_SEC = 70` guarantees at
  least two recycles, and `midWindowStarts` is reported so a window that caught none is visible rather
  than silently flattering. The claim body was rewritten to the method that is defensible, not the one
  written before the workload's period was known.
- **conjectured** the Electron harness was working, because the transparent window appeared, Electron
  logged only a warning, and `ready-to-show` fired and printed `PROBE-READY`. **refuted-by** the paint
  counter reading **0**: `join(app.getAppPath(), "dist", "index.html")` had requested
  `dist/dist/index.html`, because with `main` pointing at `dist/main.js` Electron already resolves the
  app path to `dist/`. A transparent window with nothing in it is visually identical to a working
  overlay against a dark desktop — **and in a CPU measurement it reads cheap and PASSES**, which would
  have produced a spuriously favourable ISC-6 on the one claim that is allowed to kill the port. Fixed
  with `import.meta.dirname` (true in both layouts and inside an asar) plus a permanent `did-fail-load`
  logger. The paint counter had been written for the *throttling* case and caught a different failure
  entirely; that it earned its keep before the run it was written for is the argument for liveness
  controls in general.
- **conjectured** the reworked probe was typechecked, having run `bunx tsc --noEmit` and seen no errors.
  **refuted-by** reading what that command actually printed: it had resolved, downloaded and run
  **TypeScript 7.0.2** and emitted usage help, because the shell's cwd had drifted to the repo root
  where there is no tsconfig and no local typescript. Nothing had been checked. Fixed by adding a
  `typecheck` script so the compiler is the pinned local 5.9.3 (exit 0 from `electron/`). Same family as
  `ELECTRON_RUN_AS_NODE=1`: a gate that silently measures something other than its subject, and reports
  success. Three instances of that family in this phase now — the env var, the doubled path, the wrong
  compiler.
- **conjectured** A2b's recovery bound was too tight, when it failed at mean 1280ms / worst 2082ms.
  **refuted-by** reading the sequence rather than the number: `child.kill()` only signals, so the
  recovery window opened while 32 burner processes were still tearing down and scored the teardown
  transient as recovery. Awaiting real exits plus discarding the one straddling sample gives mean 1012ms
  / worst 1014ms against the unchanged bound. Loosening the bound would have hidden the bug and kept the
  arm passing.
- **conjectured** in the plan and in ISC-7 as written that `Display.label` was the per-monitor key, with
  a composite of geometry as a fallback that probably would not be needed. **refuted-by** reading it off
  his actual desk: the internal panel's label is the **empty string**, and both LG monitors report the
  **identical** `"LG HDR WQHD"`. The claim's own test — "non-empty and stable across a restart" — would
  have passed on two of three displays and shipped an overlay that restores onto the wrong LG, because
  *stable* and *unique* are different properties and only one of them was being asked for. What supplied
  the missing arm was the code being ported: WPF's `MonitorService.BuildKeyMap` runs a whole second pass
  suffixing duplicate friendly names `-2`/`-3`, which is a load-bearing hint that the duplicate case is
  normal rather than exotic. **The general form: when a claim tests a proxy for identity, test whether
  the proxy actually distinguishes — non-emptiness and stability are both satisfiable by a constant.**
- **learned, from a read of his live settings, that the shipping WPF app is not using friendly monitor
  names on this machine at all.** Its stored keys are `display5` and `display6` — `FallbackKey` output,
  GDI device names with the prefix stripped — so `QueryDisplayConfig` returns nothing usable here and the
  documented "friendly name" path is dead code on this host. Two consequences neither the plan nor ISC-18
  had: the import cannot be key-for-key, since Electron exposes no GDI device name to reproduce those
  strings from; and GDI display indices renumber as monitors are attached, which is why one stored
  position (−227, 510) now **lands outside every connected display**. The orphan is not hypothetical
  breakage introduced by the port — it is already in his file, and it is only visible by testing the
  stored point against current bounds rather than by comparing keys.
- **criterion-now** the go/no-go is answered and the criterion moves. ISC-6 was "the one claim that can
  kill the port"; it passed on CPU by 2.43× with a resident cost near 2% of one core, so **resource cost
  is no longer the port's risk**. What remains is fidelity and platform reach: ISC-13 (phrase output
  byte-identical to the C# original across the full sweep) is now the claim most able to embarrass this
  port, because it is the only one that can fail *after* everything compiles and runs. Cost was the risk
  that could stop the work; correctness is the risk that can waste it.
