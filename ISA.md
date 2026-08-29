---
task: "FuzzyClock v5.0 — port the WPF/.NET overlay to a cross-platform Electron + SVG overlay, on a branch, merging to master and deleting the WPF version at parity"
slug: fuzzyclock-v5-electron-port
project: FuzzyStatsClock
principal_stated_goal: "Lets do this work in a different branch, when complete we'll move it to the main branch and remove the wpf version. Create the branch and begin work"
phase: build
progress: 26/43
mode: interactive
started: 2026-08-28T14:36:40+10:00
updated: 2026-08-30T06:07:24+10:00
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
that deletes a working app before the replacement has earned the **632** tests the original passes (of
which 578 survive Option C — see AC-2) — the deletion is the irreversible step and it comes last for
that reason.

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
  **The denominator is measured, and both halves of it moved today.** Re-run at this base:
  `dotnet test FuzzyClock.slnx -c Release` gives **469 Core + 163 App = 632**, not the 633 this ISA
  and the plan both inherited — so the figure every AC-2 comparison rests on was off by one and is
  now measured rather than quoted. And **54 of those 632 cover temperatures**, which Alex retired
  today (Option C): `TemperatureFormatterTests` 12, `TemperatureServiceTests` 21, `TempsLineTests`
  10, and 11 temps-key cases in `AppSettingsTests`. **AC-2's target is therefore 578, not 632** — a
  consciously retired feature must not read as 54 missing tests, which is exactly how a raw count
  comparison would read it. Falsifier unchanged; the number it compares against is now stated.
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
- [~] **ISC-3. The remaining three Phase 0 calls are Alex's and are surfaced, not assumed. One of the
  three is now ANSWERED: temps is C, drop them.** **None of them gates Phases 1-3**, and Phase 1
  produced the sidecar size the temps call depended on — so the build proceeded and the questions were
  asked when their evidence existed, rather than blocking at Phase 0.
  - **Temps — CLOSED 2026-08-28. Alex chose C.** He was given the reframed question, not the plan's
    original one: unelevated, Option A and Option D return the same GPU-only reading (ISC-9's D5), so
    A only earns its 17MB if CPU temperature is worth a UAC prompt at every launch of an autostarting
    overlay. **The answer retires a shipped v4.2 feature**, which the Vision explicitly allows for —
    "every feature either ported or was consciously retired with the reason written down" — and this
    is the reason, written down. Acted on in the same session: `electron/sidecar/` and
    `scripts/probe-sidecar.ts` deleted, `probe:sidecar` removed from `package.json`.
  - **Linux XWayland-only — still open.** No new evidence; it needs ISC-10's Linux host, which does
    not exist yet.
  - **Auto-contrast in/out of 1.0 — still open, and it acquired evidence today without being asked.**
    ISC-10's macOS run found `screencapture` **TCC-denied** on that host, and that is the same
    permission `desktopCapturer` needs. So on macOS the feature starts from *denied* and needs a user
    prompt, not just an entitlement — which makes the "cut it" side of Alex's call cheaper than the
    plan assumed. Recorded here rather than pushed at him: the call is still his and it is Phase 8.

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
- [x] **ISC-8. A real installer size exists — and it is a REGRESSION, by 1.40× on both measures.**
  `electron-builder` 26.15.3, NSIS target, `bun run dist:win`. `probe-size.ts` 5 passed / 0 failed /
  0 inconclusive. Installer-to-installer, the artefact a user downloads: **80,089,948 B (76.4MB) NSIS
  vs 57,389,487 B (54.7MB) Inno → 1.40× larger.** Payload-to-payload: **281,087,190 B (268.1MB)
  `win-unpacked` across 73 files vs 200,457,651 B (191.2MB) single-file exe → 1.40× larger.** Both
  WPF figures were re-read off disk and matched their recorded byte counts exactly, so the baseline
  is the same artefact the plan measured, not a lookalike. The two ratios agreeing to two decimals is
  coincidence, but it makes the finding one sentence: **Electron costs about 40% more disk, both
  download and installed.**
  - **The ~85MB prior was roughly right**, and that is worth saying plainly rather than framing the
    prior as wrong: 76.4MB measured against ~85MB reasoned. The claim needed replacing because it was
    unmeasured, not because it was inaccurate.
  - **Size is a floor here, not a trajectory.** The app is 24,021 B of asar — **0.009%** of the
    installed payload. Everything else is the Electron runtime, a fixed cost: 180MB `FuzzyClock.exe`,
    40.3MB of locales, 10MB `icudtl.dat`. So this ratio *improves* for Electron through Phases 2-8,
    because the WPF side grows with every feature and this side does not. Quoting today's 1.40× at
    Phase 9 would overstate the disadvantage.
  - **An available reduction, deliberately not taken:** 55 locale `.pak` files are 40.3MB, 15.0% of
    the payload, for languages this app never renders. ISC-8 measures the *default* build on purpose —
    a tuned number would not be the one a `dist:win` reproduces. Carried to ISC-29.
  - **The size is only meaningful because containment was checked (C4).** A wrong `files:` glob
    produces a perfectly plausible installer size for a shell that launches to nothing. All six
    runtime files are present in `app.asar` — read from the asar header directly rather than via a
    `bunx asar` that could be absent and degrade into "no files found", which is indistinguishable
    from the failure the arm exists to catch.
  - Bounds: **Windows only.** `mac: dmg` and `linux: AppImage` are configured and **NOT built** —
    electron-builder needs the host platform, and a size asserted from this box is what AC-3 forbids.
    Unsigned and with no application icon (electron-builder logged `default Electron icon is used`),
    both of which add bytes. And `installer/` + `publish/` are gitignored, so C2 and C3 only run on a
    machine that has built the WPF side — a fresh clone gets INCONCLUSIVE, by design rather than by
    silent pass.
- [x] **ISC-9. The temps sidecar is built and measured — and the finding is not the size, it is that
  unelevated it reads GPU only.** `electron/sidecar/FuzzyClock.Temps/`, 231 lines of C# over
  `LibreHardwareMonitorLib 0.9.6` (pinned to the exact version `FuzzyClock.App.csproj:15` uses), one
  JSON line per 2s to stdout. `bun run probe:sidecar`, **5 passed / 0 failed / 0 inconclusive**.
  - **Size — Option A's actual cost:** trimmed **17,855,474 B (17.0MB)** against untrimmed
    **78,543,941 B (74.9MB)**, a 4.40× saving. The single-file exe is 15.5MB trimmed / 73.4MB
    untrimmed, and **1.5MB rides beside it** — `libMonoPosixHelper.dll` + `MonoPosixHelper.dll`, LHM
    native dependencies that `PublishSingleFile` does not absorb, so "single file" is three files.
    Against ISC-8's 76.4MB installer, Option A is roughly a **+22% installer** at the trimmed size.
  - **Latency — 5.7× better than the prior that shaped the WPF design.** n=20: min 61ms, p50 78ms,
    p95/max 472ms, **mean 106.8ms**, against the 608.2ms mean the v4.2 spike measured
    (`TemperatureService.cs:4-6`). Worst case fits well inside the 2000ms interval, so the dedicated
    background loop the WPF app needed is comfortable rather than tight. **`Computer.Open()` was
    672ms here against the 4272ms that forced the WPF init timeout from 3s to 5s** — and it moved
    542/572/672/1794ms across four runs depending on whether the ring-0 driver was already loaded, so
    a parent timeout must budget for the cold case, not this one.
  - **The improvement may not be portable, and the reason is the next bullet.** This host has fewer
    sensors to update than the spike box did: motherboard exposes zero, Storage is absent entirely.
    A machine with a populated super-I/O controller and an NVMe sensor has more work per read.
  - **THE FINDING (D5). Unelevated, only GPU temperature works — and the sensors are there.** The CPU
    node enumerates **51 temperature sensors and every one reads NULL**; 2 of 53 sensors returned a
    value, both on the NVIDIA GPU (`GPU Core` 47.0, `GPU Hot Spot` 55.5, via NVAPI which needs no
    driver). `elevated: false`. Enumerated-but-null is a **ring-0 refusal, not absent hardware** —
    a distinction invisible through the normal output, where both render as `-1`, which is why
    `--dump` exists. Motherboard "Dell 0342YC" reports 0 sensors and Intel UHD reports 0, so those
    two really are absent.
    - **This reframes the A/B/C/D decision and is Alex's call, not mine: Option A unelevated returns
      exactly what Option D returns nearly free.** Full fidelity needs a `requestedExecutionLevel`
      manifest, which changes what a user sees at every launch — a product decision, not packaging.
    - **It is NOT a port regression.** `FuzzyClock.App.csproj` declares no elevation manifest either
      and the sidecar mirrors its resolver line for line, so v4.2 shows the same readings today. This
      is a **code-identity argument, labelled as such** — identical priority lists
      (`TemperatureService.cs:24-34`), identical resolution walk (`:141-205`), identical library
      version and the same four `Computer` flags. I did not run the WPF app to confirm it, because
      that would put its overlay on Alex's desktop.
  - **Trimming is safe here and the claim stops at "here" (D4).** Both builds resolve the same
    sensors and return the same live sources. But `PublishTrimmed` emits IL2104 warnings for
    `LibreHardwareMonitorLib`, `System.Management` and `HidSharp` — and the reflection paths those
    cover are precisely the ones this box cannot exercise: no Storage/NVMe node, no AMD GPU, no
    motherboard sensors. A trimmed build could silently return sentinels on hardware this host cannot
    present, and D-14's silent-failure posture means nobody would notice. So the 4.40× saving is
    real and its risk is unmeasurable from this machine.
  - **It bounds ISC-6's temps asymmetry — and under Option C the bound applies to the other side of
    the comparison than the one it was computed for.** ISC-6 measured Electron *without* a temps
    source while the WPF baseline had `TemperatureService` running in-process. The original use was
    "what would Electron pay to add it": 106.8ms per 2000ms interval = **5.34% of one core** ceiling,
    an over-estimate since it charges wall-clock as CPU, giving Electron + sidecar ≈ 13.6% against
    WPF's 19.92% — narrowing the win, not flipping it. **Electron is now never paying that**, so the
    same figure instead bounds how much of the *WPF* baseline buys a feature the port does not have.
    At Alex's live 3s interval that ceiling is 106.8/3000 = **≤3.56% of one core**, so a temps-free
    WPF baseline is **≥16.36%** of the measured 19.92%, and the 2.43× CPU win becomes **≥2.0×**. Worth
    keeping precisely because the sidecar mirrors `TemperatureService.cs`'s resolver line for line —
    without that fidelity the number would bound nothing on the WPF side.
  - Bounds: Windows, one host, unelevated, `dotnet 10.0.400`. The sidecar is win32-only by
    construction — Linux reads `/sys/class/hwmon` from TypeScript and never touches this project, and
    macOS has no temperature source at all.
- [~] **ISC-10. The shell flags are smoked on macOS and on an X11 Linux session. The macOS half is
  DONE; the Linux half has no host, so the claim stays open.** Dispatched to
  `mcp__mac-codex__codex` on Alex's explicit go-ahead. Host: **Apple M1 laptop, 8GB, 8 logical cores,
  macOS 26.6.2 build 25G83, arm64**, with Electron pinned to **exactly 33.4.11** so the evidence is
  comparable to the Windows-side typings claims. Seven arms; **4 measured, 3 INCONCLUSIVE and stated
  as such.**
  - **M1 — the window renders (the gate).** 578 rAF paints over 10,000.8ms, acknowledged from inside
    `requestAnimationFrame`, zero `did-fail-load` events. Every visual arm below is reported subject
    to this, which is the lesson of the doubled-path detour: a transparent window with nothing in it
    is visually identical to a working overlay and *cheaper*.
  - **M2 — flags read back off the live window, not off the source.** `isAlwaysOnTop: true`, bounds
    exactly `100,100,400×200`, `isFullScreen: false`, `app.dock.isVisible(): false`,
    `process.versions.electron: 33.4.11`. **Two API surfaces I would have used do not exist at
    runtime in 33.4.11**: `win.getAlwaysOnTopLevel` and `app.getActivationPolicy` are both
    `undefined`. So the always-on-top *level* cannot be verified from Electron at all — only that the
    flag is on. And **`isFocused` differed between two runs on the same host**, so it is not an
    overlay invariant and no claim may rest on it.
  - **M3 — out of the Dock, confirmed from OUTSIDE the process.** LaunchServices reports
    `ApplicationType="UIElement"` and `bundleID="com.github.Electron"` for the live pid. That is the
    arm that matters; `app.dock.isVisible() === false` is the process agreeing with itself.
    **`osascript`/System Events is not a usable verification channel on this host** — the requested
    `tell application "System Events" to get name of every application process whose background only
    is false` **hung with no stdout and no stderr for ~22s** and had to be killed, consistent with an
    ungranted Automation TCC. Worth knowing before anything in this port reaches for AppleScript.
  - **M4 — Cmd-Tab: the policy is measured, the switcher is NOT, and the two are not the same claim.**
    An external Swift binary read `NSRunningApplication(processIdentifier:).activationPolicy` =
    `rawValue 1` = **`.accessory`**, corroborated by M3's `UIElement`. But nobody observed the Cmd-Tab
    switcher, because screen capture is denied on that host. `[MEASURED]` for the policy,
    `[INCONCLUSIVE]` for the behaviour. This is the discipline AC-3 is about, applied one level
    finer than AC-3 asks: the arm ran on the right OS and *still* only reaches the mechanism.
  - **M5 — over a fullscreen window: INCONCLUSIVE, and the API acceptance is not the answer.** A
    second Electron process went native-fullscreen (`isFullScreen: true` read back), the overlay's
    `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true})` did not throw, and the overlay
    still read `isVisible: true` while painting 588 frames. **None of that establishes it was
    composited above.** `screencapture -x` failed: `could not create image from display`. Reported as
    the unproven arm it is rather than dressed as a pass.
  - **M6 — the `forward: true` mousemove path is unusable on macOS too, and the shipping mechanism
    is live.** Forwarding delivered **1** renderer `mousemove` across an eight-lap programmatic
    cursor sweep (Windows measured **0** on a 3440×1440 primary). Different number, same verdict —
    and the finding is stronger for the disagreement than it would be for a match, because two
    platforms failing the same way for the same reason was the weaker hypothesis. What I actually
    intend to ship measured healthy: `screen.getCursorScreenPoint()` polled at 100ms gave **61
    changes / 42 unique coordinates across 98 samples**. Cursor position was restored afterwards.
    Click-through *into another application* was not instrumented — `[INCONCLUSIVE]`.
  - **M7 — four macOS telemetry fixtures captured, and two of them changed a plan row.** Checked in
    under `electron/test/fixtures/macos-*.txt`, LF-preserved via a new `.gitattributes` rule. The
    positive control ran: aggregate CPU read **1.25%** idle and **26.73%** with one core deliberately
    busy, so the pipeline did not collapse both samples toward zero.
    - **`os.freemem()` is not a memory signal on macOS.** 264,617,984 of 8,589,934,592 bytes =
      **3.1% free** on a healthy, responsive machine. `vm_stat` occupancy on the same snapshot is
      **69.14%**. The plan had `os.totalmem/freemem` as primary with `vm_stat` as a supplement for
      the compressor; that is now inverted. A cell reading 97% used on an idle Mac is worse than `--`.
    - **macOS GPU% is NOT a permanent `-1`.** `powermetrics` is confirmed root-only (`powermetrics
      must be invoked as the superuser`, exit 1, no `sudo` attempted) — but `ioreg -r -c
      AGXAccelerator -l` returns `"Device Utilization %"=26`, `"Renderer Utilization %"=25`,
      `"Tiler Utilization %"=26` **with no privileges at all.** Undocumented IOKit, Apple-silicon-only
      driver class, one host of evidence — so it is a *candidate* source, recorded and not adopted,
      and the `-1` fallback stays mandatory rather than vestigial.
    - `vm_stat` **page size is 16384, not 4096** on Apple silicon, and it reports `Pages stored in
      compressor` (450,232) and `Pages occupied by compressor` (165,245) as different numbers — only
      the second is a physical footprint. `sysctl vm.swapusage` carries `M` suffixes and a trailing
      `(encrypted)` token. `pmset -g batt` is **TAB-delimited** and prints `0:00 remaining` while
      charged, which must not read as "no time left". Every one of those is a parser trap that a
      hand-written fixture would not have contained.
  - Bounds, stated because the temptation is to let this stand for "macOS works": **one Mac, one OS
    version, Apple silicon only, and screen capture denied throughout** — which is precisely why the
    three visual arms are inconclusive rather than absent. An Intel Mac has a different GPU driver
    class and is untested. **The Linux half of this claim has no host and no evidence.**

### Phase 2 — Core translation

- [x] **ISC-11. `FuzzyClock.Core` is translated in full, and the denominator is the measured one —
  re-measured after Option C, because a stale denominator is how a deletion turns into missing work.**
  **27 files / 2,467 LOC = 1,987 across 18 phrase providers + 480 across 9 logic files.** Was 28 files
  / 2,510 = 1,987 + 523 across 10; `TemperatureFormatter.cs` (43 LOC) is deleted under Option C, so it
  is not a file left to translate and must not be counted as one. The phrase-provider half is
  untouched — temps never entered it.
  - **CLOSED. All 27 files / 2,467 LOC are translated: 1,987 across 18 phrase providers + 480 across
    9 logic files.** `IPhraseProvider` → `core/phrase/types.ts`, `PhraseEngine` →
    `core/phrase/engine.ts` (both under ISC-13), `UptimeFormatter` → `core/uptime.ts`, `DialGeometry`
    → `core/dial.ts`, `DateFormatter` → `core/date.ts`, `SevenSegmentEncoder` →
    `core/seven-segment.ts`, `UpdateVersionComparer` → `core/update-version.ts`, `PhraseWrapService`
    → `core/phrase-wrap.ts`, `ContrastService` → `core/contrast.ts`.
  - **`ContrastService` was last on purpose and cost the most oracle work, as predicted.** 197 LOC
    against a 10-case C# suite, and the suite is weak in a specific way: for both override-entry
    cases it asserts only that the returned colour *differs* from the accent and clears 4.5:1, never
    which colour. Every override value in `contrast.test.ts` is therefore probe-measured; none of it
    could have been read off the C# tests. The port also carries a **behavioural fix the C# did not
    need**: `Math.Round` is round-half-to-even and `Math.round` is not, and that is not academic here
    — measured over exactly the inputs `adjustAccent` generates, **215 of 4,096** grey-axis calls and
    **44,017 of 4,194,304** cube calls round differently, and on a white background **4,807 of
    262,144** accents end up a different colour. `roundHalfToEven` is load-bearing, not defensive.
  - **`update-version.ts`, `phrase-wrap.ts` and `contrast.ts` are not consumed yet, and that is not
    drift.** The update check is Phase 7 (ISC-27), phrase wrapping is Phase 4, auto-contrast is Phase
    8-9 and still [FOG]; all three C# units are standalone in `FuzzyClock.Core` too. What would be
    drift is translating them and *not* recording that nothing imports them, since an unimported
    module's tests can pass while the wiring is wrong — so the import-side claim stays with the phase
    that does the wiring, not with this one. **`contrast.ts` follows the auto-contrast feature's
    fate**: if that feature is cut (it is first on the cut list, and Alex's live settings have it
    disabled), this module is deleted with it. Translating it anyway was the cheaper order — the
    probe harness was already standing, and the float-heavy internals are where a rushed Phase 8 port
    would have missed the rounding.
- [x] **ISC-12. ≥457 translated Core tests pass under `bun test`.** Was ≥469; `TemperatureFormatterTests.cs`
  contributes **12** of those cases and retires with the feature. Translated alongside each unit, not
  afterwards — a test written after the code it checks is a rubber stamp (AC-5).
  - **The 469 is measured on this host, not inherited.** `dotnet test FuzzyClock.Core.Tests` reports
    `Passed: 469, Failed: 0` and `TemperatureFormatterTests` contributes exactly 12 of them, so 457 is
    confirmed by the same run that confirms the total. Two instruments were wrong before one was right:
    an `xUnit`-shaped grep for `[Fact]`/`[InlineData]` returned **0 cases in every file** (this project
    is MSTest — `[TestClass]`/`[TestMethod]`/`[DataRow]`), and an MSTest-shaped `awk` counter returned
    **436**, 33 short. `dotnet test --list-tests` cannot settle it either: it lists *methods*, so a
    `[DataRow]` method counts once. Per-class counts come from a TRX parse (37 classes, 469 results,
    0 unmapped), which is what the per-unit figures below are read from.
  - **Progress: all 457 translated, and `bun test` is at 700 pass / 0 fail** (96 from ISC-13 and
    the typeperf fixtures, 604 new). The 457 are `UptimeFormatterTests` 7, `DialGeometryTests` 6,
    `DateFormatterTests` 6, `SevenSegmentEncoderTests` 13, `UpdateVersionComparerTests` 20,
    `PhraseWrapServiceTests` 23, `ContrastServiceTests` 10, `PhraseEngineTests` 51,
    `GetStructuredPhraseTests` 17, `PhraseEngineCoordinatorTests` 17, `SegmentKeyTests` 37,
    `MultilingualPhraseProviderTests` 128, `PhraseStyleProviderTests` 64,
    `EnglishPhraseProviderExpandedTests` 13, `YodaPhraseProviderExpandedTests` 12,
    `JivePhraseProviderExpandedTests` 11, `PiratePhraseProviderExpandedTests` 11,
    `TersePhraseProviderExpandedTests` 11 — each file's
    full case count from the TRX, none partially taken. The other 147 new cases are **additions, not
    translations**, and are counted separately on purpose: a port that invents its own tests and counts
    them toward a translation target can reach the number without translating anything.
  - **CLOSED at `36072c5`.** Re-probed at that HEAD rather than flipped from the queue's own bookkeeping:
    `bun test` → 700 pass / 0 fail / 185,894 expect() across 16 files, `bun run typecheck` exit 0. HEAD is
    the same commit the last unit's greens were measured against, so ISC-17's base check holds. The
    discriminator is the mutation harness, not the pass line: 23 mutations over `tables.generated.ts` and
    `specs.ts`, 14 of them fixture-consistent, **13 caught by this suite alone and 0 caught by nothing** —
    the suite has demonstrably produced both verdicts through the same path.
  - **0 remain: the ISC-12 translation queue is closed.** 457 + 12 retired = 469. **The file
    and class counts are re-measured at each unit rather than carried, and the pair carried in
    once was wrong** — "ten files / thirty classes", neither number ever right. Measured now: the 37
    `[TestClass]` attributes divide 18 files into 17 translated (36 classes — `PhraseEngineTests.cs`
    holds two, `SegmentKeyTests.cs` four, `MultilingualPhraseProviderTests.cs` eight,
    `PhraseStyleProviderTests.cs` nine and the five `*PhraseProviderExpandedTests.cs` one apiece) and
    1 retired, so 36 + 1 = 37 classes and 17 + 1 = 18 files. Given per file *and* per class on
    purpose: the two decompositions of
    the same remainder have to agree, and a remainder computed by subtracting a remembered figure agrees
    with itself no matter how stale it is. **A closed queue is the one state where that check is cheap
    and still worth doing** — 0 remaining is exactly the claim a stale subtraction reaches first.
  - **The additions are not guesses either — from `update-version.ts` on, every added expectation was
    measured against the compiled C#.** A throwaway console project outside the repo (`$TEMP/fc-verprobe`,
    `dotnet run -- version|phrases|contrast`) `<Compile Include>`s the real `.cs` files and prints what
    they actually return, so an added case is a *recorded* C# behaviour rather than my reading of the
    algorithm. That is what turned up the `int.MaxValue` component ceiling, .NET's acceptance of
    `"4. 5"`, the two `PhraseWrapService` branches its own suite never reaches, and — on the contrast
    pass — every override colour, the exact grey where `adjustAccent` reverses direction, and the
    banker's-rounding divergence counts.
  - **The contrast pass is where measuring earned its keep twice in a row.** I asserted a derived
    0.5-luminance crossover at grey 186/187; the suite failed and the probe said 187/188. I then
    assumed a 128 grey accent would adjust on both sides of it; it exhausts on 187, and the probe
    supplied the accent that does work (60 grey → darkened to 47 on bg 188, lightened to 73 on bg
    187 — one background step apart, opposite directions, which is the tight pin on the constant).
    Two wrong derivations, both caught before commit, neither by reading the code again.
- [x] **ISC-13. Phrase output matches the C# original across a full sweep. RESTATED — the original
  wording was impossible; the oracle was built first, and the port now satisfies it.** This is the claim
  that makes ISC-12 more than self-agreement, so it is the one worth getting right before any TypeScript
  is written.
  - **What was wrong.** It said "byte-identical … every minute of 24h × 6 locales × 11 styles". Two
    errors. The registry has **18 flat locale keys**, not a 6 × 11 = 66 matrix — read by reflecting
    `PhraseEngine._providers` and cross-checked against `SetLocale` accepting all 18 and rejecting a
    bogus one. And **10 of the 18 providers call `Random.Shared.Next()`** to pick among candidates, so
    `GetPhrase` has no single correct answer for a minute and "byte-identical" is not a property it
    can have. A sweep comparing one sample per minute would have passed a port that emitted a
    plausible phrase from the **wrong bucket** about four times in five.
  - **What replaces it, and it is stronger.** Two golden files, generated and checked in:
    `phrase-golden-segments.tsv` (**25,920 rows** — `GetSegmentKey` for 1440 minutes × 18 locales,
    deterministic by the interface's own contract) and `phrase-golden-candidates.tsv` (**12,984
    rows** — the *complete candidate set* per bucket for the 10 random providers, both `GetPhrase`
    and `GetStructuredPhrase`). Pinning the whole permitted set is a tighter constraint than pinning
    one sample from it.
  - **The oracle.** `tools/GoldenGen`, run against the untouched C# tree, exit 0 with
    `no problems reported`. Re-run at the close of the port (`b66579e`): both files came back
    **byte-identical** to the committed ones, and non-vacuously so — appending a line to
    `phrase-golden-segments.tsv` (25,928 lines) and re-running restored it to 25,927 with
    `git status` clean, which is what proves the generator writes the paths the tests read rather
    than a diff passing because nothing was written.
  - **The comparison, and it has now run.** `electron/src/core/phrase/` — five files: the reflected
    `tables.generated.ts`, `types.ts`, `factories.ts`, `specs.ts`, `engine.ts`. **96 green in
    `bun test`, 0 fail**, of which 44 are the golden suite: the segment key for all 1440 minutes ×
    18 locales, and the complete phrase and structured-pair set for every bucket of the 10 drawing
    locales. `bun run typecheck` exits 0 and `--listFiles` shows all five source files and both test
    files in the 220 the compiler read, so neither result is vacuous.
  - **Discriminating power is measured, not argued (claim 18).** A green sweep over 38,904 fixture
    rows written by the same hand as the port is worth nothing until it can be shown to fail. **Twelve
    injected defects, all twelve caught**: a shifted German bucket bound, a one-character typo in an
    `en-classic` candidate, a duplicated sixth candidate in a five-candidate bucket, `en-poetic`'s
    `:witching` key changed to `:midnight`, one extra `r` in a hand-transcribed Pirate noon string,
    an `{h1}` template emphasising the wrong hour, noon shifted to minute 721, an exclusive bucket
    bound, `hour12` losing its 0→12 mapping, a qualifier keeping its trailing space, and `{ho}`
    resolved out of order. **The first pass caught only 11**, and the survivor was informative rather
    than a hole — see the o'clock-guard entry in § Decisions.
  - **The arity assertion is why the `Picker` seam exists.** Driving the picker by index recovers each
    bucket's whole candidate space *and* `items.length`. A set comparison alone accepts a port with a
    duplicated sixth candidate in a five-candidate bucket — same set, wrong distribution — which is
    exactly mutation 3, and it fails on the count.
  - The generator also settled three facts the port needs: the 8 single-template locales
    (`de es fr ja-classic ja-poetic ja-rude ja-terse pl`) are **verified** deterministic rather than
    assumed, 200 draws per minute yielding one value equal to their own segment key; the candidate set
    depends only on **(segment key, 12-hour hour)** and never on the minute within a bucket, checked
    across all 1440 minutes rather than asserted; and every bucket saturated to **exactly** its
    declared candidate count, so no table holds a duplicate or unreachable candidate.
  - **And one fact that shrinks the work: `GetStructuredPhrase` is `("", GetPhrase(dt))` in 16 of the
    18 providers**, verbatim, so only `en-classic` and `en-poetic` need a real qualifier/emphasis
    implementation — the other 16 are one delegating line each. Read off the source and worth stating
    because the interface's two methods imply 18 pairs of implementations, and 16 of them are the same
    line.
- [x] **ISC-14. The pure seams from the App layer are ported with their tests.**
  `ComputeProximityRatio`, `LerpRatio`, the formatters and the version comparer are already static and
  pure in C#.
  - **Scope enumerated from the test tree, not from that sentence — and the sentence was wrong.**
    `UpdateVersionComparer` lives in `FuzzyClock.Core`, not the App layer, and closed under ISC-12 as
    `core/update-version.ts` with its 20 cases. What is actually here is **46 C# cases across 7 files**:
    `GhostModeControllerProximityTests` 12, `LerpRatioTests` 5, `GhostModeControllerTests` 12,
    `OnSampleTickTests` 4, `LcdTimeFormatHelperTests` 4, `NixieSizeMapTests` 3,
    `RightClickMenuGateTests` 6. The temps suites are out by Alex's "C, drop temps", contrast is
    `[FOG]`/Phase 8, and settings is Phase 3.
  - **CLOSED at `6370ecc`.** `bun test` → **846 pass / 0 fail / 186,489 expect() across 20 files**,
    `bun run typecheck` exit 0, `bun run build` exit 0. Against ISC-12's close (`36072c5`, 700 pass /
    185,894 / 16 files) this unit adds **146 tests, 595 expectations and 4 files** — 46 translations and
    **100 additions, counted apart** for the same reason ISC-12 separated its 147.
  - **Every added expectation is a recorded C# value.** `$TEMP/fc-appprobe` is a throwaway console
    project that `<Compile Include>`s the five real `.cs` files, so `internal` members are reachable
    without editing `FuzzyClock.App` or its `InternalsVisibleTo` list. Subcommands
    `prox|lerp|tick|modifier|lcdfmt|sizes|rmb`, doubles printed `G17` invariant. Every float literal was
    then re-checked bit-exact in Bun before being written into a test: .NET and Bun agreed on all of
    them, including the four `Math.exp` rows — which are nonetheless asserted with
    `toBeCloseTo(literal, 15)` *plus* an exact `toBe` against the formula inline, because neither spec
    pins `exp` bitwise.
  - **`IsModifierHeld` is the one seam whose C# test cannot discriminate, and the port fixes that
    rather than inheriting it.** The predicate calls `GetAsyncKeyState` inside itself, so in a test
    process no key is ever down and all 12 rows expect `false` — eleven of them would pass against
    `return false`. Splitting the read out makes the logic testable over all **256 (config × held)
    pairs** against a deliberately different formulation (collect the configured keys, ask whether all
    are down), with `expect(heldTrue).toBe(65)` as the guard: two formulations that both collapsed to
    `return false` would agree on all 256 rows. Synthesising keystrokes to measure the held rows was
    rejected — `SendInput` would press keys on his live desktop.
  - **REFUTED, and pinned: a negative fade radius clamps HIGH.** I assumed it would clamp to 0.0. The
    clamp applies to `1 - distance/radius`, which a negative divisor sends above 1, so a negative radius
    makes the entire screen count as the widget and pins click-through on. Measured on the C#, pinned in
    a test so a settings path that ever admits one fails here.
  - **Discriminating power (claim 18): 41 mutations, 38 caught by the owning suite ALONE, 17 of those by
    the added rows only.** Columns were MINE / SIBLINGS / the 16 pre-existing suites enumerated from
    `test/` on disk, plus a fourth projection — `bun test -t "translated from"` — that runs the 46
    translated rows and nothing else, which is what makes "what the additions bought" a measurement
    rather than a claim. Sibling and pre-existing columns were **0 as predicted**, restore byte-identical.
    The projection also needed a guard: `-t` exits 0 when it matches nothing, so the baseline asserts the
    count, and that assertion is what caught the projection matching **50** — four all-keys-up rows the
    C# omits were sitting inside a describe titled "translated from". Split out, so the title is true.
  - **The first run found a real gap and two things that are dead code.** The gap: edge inclusion is
    **unobservable at every radius except 0**, because a cursor on an edge has Chebyshev distance 0 and
    `1 - 0/r` is 1.0 through the arithmetic anyway — strictening `>=` to `>` changed no answer. PROX-08
    makes radius 0 a real setting, and there the two paths disagree (1.0 vs 0.0, i.e. a fade-disabled
    widget would stop ghosting with the cursor on its own border), so ten measured `r=0` rows were added
    and both mutations now die. The three survivors are behaviourally dead and documented in place: the
    zero-radius arm the clamp already covers, the `if (ratioChanged)` write guard, and the RMB-02-beats-
    RMB-03 precedence the C# asserts but which **no input can observe** — both rules return false, so
    swapping the guards changes nothing. That last one is a corrected claim in two files, not just a
    survivor.
  - **Two findings for later phases, both from his live `%LOCALAPPDATA%\FuzzyClock\settings.json`** —
    read, never written. (1) `System.Text.Json` writes a C# enum as its **ordinal**, and his file holds
    `"LcdSize": 0` / `"ClockType": 1`, so **ISC-18's importer cannot read these as names**;
    `lcdSizeFromOrdinal` exists for it. (2) His `GhostFadeRadiusPx` is **200**, not the 80 default, so
    the halo reaches 2.5× further than every C# test row exercises — pinned as its own row.
  - **One documented deviation from the otherwise 1:1 file mapping:** `LcdSize.cs` and `NixieSize.cs`
    (14 and 12 lines, same shape, same three-value domain) are one `digit-size.ts`. Splitting them would
    leave a module whose entire body is an `import type`. Provenance is per-function instead.

### Phase 3 — Shell

- [x] **ISC-15. The overlay window carries the proven flag set, read back off a live window.**
  Not read off the source (`garry-desktop`'s own probe discipline). **MET on Windows at `ff4899d`;
  Linux `[UNPROBED]` and macOS untested for THIS window.**
  - `scripts/probe-shell.ts` launches the built `dist/main.js` into a throwaway `--user-data-dir` and
    `scripts/winflags.ps1` reads `GWL_EXSTYLE`/`GWL_STYLE` back over `EnumWindows`: **6 of 6 as
    required** — `toolwindow`, `topmost`, `layered` set; `caption`, `thickframe`, `appwindow` clear.
    Each expectation names the constructor option that should have produced it, so a red says which
    line to read.
  - **The discipline was worth keeping and it was NOT free to inherit.** `garry-desktop`'s probe scans
    by process *name*, which on this box also matches any other Electron app running — it would
    attribute a stranger's window to the overlay. `winflags.ps1` takes the spawned pid instead, and
    that is the only substantive change from the source it was ported from.
  - macOS: ISC-10's M1 run read flags off a live window of the *smoke harness*, not this app's window,
    so it does not transfer here. Both non-Windows arms report INCONCLUSIVE with the reason rather
    than being skipped.
- [~] **ISC-16. It is absent from the taskbar/dock and from Alt-Tab/Cmd-Tab on all three platforms.**
  **Windows met, and the zero carries its own denominator.** `winflags.ps1` computes the shell's
  documented eligibility rule (visible, titled, unowned, and either not `WS_EX_TOOLWINDOW` or forcibly
  `WS_EX_APPWINDOW`) over **every** visible window on the desktop: **0 of ours eligible against 13
  that are.** Without `altTabTotal`, "not in Alt-Tab" and "this enumerator finds nothing" return an
  identical zero — claim 18, and the reason the control exists. **Precisely stated: the flag
  combination that suppresses the taskbar button is confirmed on the live window; the button's absence
  was not separately queried from the shell.** Mac and Linux halves stay with ISC-10.
- [~] **ISC-17. Tray icon and menu work, with the Linux activation-semantics difference handled.**
  Built and wired — `main/tray.ts` (the only new Phase 3 file importing Electron), `core/tray-menu.ts`
  as the menu model, `setStateAndRefresh` pushing freshness because **`popUpContextMenu` is
  `@platform darwin,win32`** and has no Linux implementation, so rebuilding on open is not available
  there. The live app logs `tray: win32/darwin -- menu rebuilt per open`. **NOT met, and the gap is
  the interaction, not the code: nothing has clicked it.** No probe confirms the icon is in the
  notification area, no probe opens the menu, and the Linux `click` difference is handled in code and
  unexercised. `core/tray-menu.ts` also has **no C# counterpart test** (`TrayMenuBuilder` has no
  suite), which its header says in place.
- [x] **ISC-18. Settings persist at `app.getPath('userData')`, and the existing Windows settings file
  is imported once — matching monitors by GEOMETRY, not by key.** `%LOCALAPPDATA%\FuzzyClock\settings.json`
  must survive the transition; his live file is the one an upgrade meets, and per ISC-7.1 its
  `display5`/`display6` keys are GDI device names Electron cannot produce. The importer maps a stored
  `Left`/`Top` to whichever current display's bounds contain it, and **drops an entry that lands on no
  display** — his file already has one (`display5` at −227, 510). **MET, against that actual file.**
  - The live run reports `1 position re-keyed, 1 dropped, 6 keys ignored, 0 unrecognised`. **The
    dropped one is the (−227, 510) orphan ISC-7.1 predicted**, and because `LastActiveMonitor` named
    it, `restore()` fell through to `first-run` and placed the window at **(3188, 20)** = 3440 − 232 −
    20, the work-area width less the window less `FIRST_RUN_PADDING_PX`. `commitPlacement` then wrote a
    key that resolves. **Read, never written** — the standing constraint on that file held.
  - Persistence measured end to end: **41 fields written** (counted off `DEFAULTS`, not hardcoded in
    the probe) **into the throwaway profile**, and the probe asserts the store path is *inside* that
    profile — so a `--user-data-dir` that stopped being honoured could not pass silently while the run
    quietly wrote to the real one.
  - **A real defect, found by this claim's own test file.** The constructor used
    `options.legacyPath ?? legacyWpfSettingsPath()`, and `??` collapses an explicit `null` into the
    default — so the documented "`null` disables the import" was **unreachable**, and on Windows every
    caller passing null was silently reading his live WPF file. Three store tests expecting `defaults`
    returned `wpf-import` from his own configuration. Fixed to `=== undefined`, which preserves the
    branch `main.ts` depends on (it omits the option). Nothing was written, so the constraint was not
    breached — but the tests would have passed here and failed on any other machine, which is exactly
    the hazard `test/settings-store.test.ts`'s header was written about, and why it passes `legacyPath`
    explicitly in all 35 of its tests.
  - Atomicity is tested rather than asserted: `settings.json.tmp` is made a **directory**, so the write
    throws `EISDIR` before `renameSync`, and the arm checks `settings.json` survived byte-intact. A
    truncate-first implementation — which is what the WPF original does — fails it.
- [~] **ISC-19. Per-monitor position survives a restart and a display-configuration change.** Keyed on
  the composite (ISC-7), which carries position — so rearranging displays in Windows invalidates the
  key by construction. The falsifier that matters is therefore not "the position was lost" but "the
  window restored off-screen": on a key miss it must clamp into the target display's work area.
  **The clamp is proven; the two live transitions are not.**
  - The live rect read off the window (**3188,20 232×260**) equals placement's own logged decision, so
    the shell honoured it. **But the source was `first-run`, not `key`** — the orphaned
    `LastActiveMonitor` above is why — so **this run did not exercise restoring a saved position**, and
    the probe says so inside its own PASS verdict rather than letting a green read as more than it is.
  - `test/window-placement.test.ts` covers both transitions against a **mutable fake display list**,
    which is what makes an unplug testable at all. The arm that file exists for: **a display change
    does NOT drop the source monitor's saved position.** Before the refactor `commit` took
    `{ snap: boolean }` and dropped the source key whenever the display had changed — so wiring
    `screen`'s `display-removed` to it would have **deleted the position the user set on a monitor at
    the moment that monitor was unplugged.** Also pinned: a `display5`-shaped miss at (−227, 510)
    restores to (0, 510), `clamped: true`, logging "CLAMPED back on-screen".
  - **No cable has been pulled and no restart has restored from a key.** Both are cheap for Alex and
    impossible for me without touching his hardware.
- [~] **ISC-20. Drag-to-move works, and the window stays within the target display's work area.**
  Wired end to end and unexercised live. `renderer.ts` pointer handlers (with pointer capture, and
  `pointercancel` ending the drag so a session lock cannot leave main convinced a drag is in progress)
  → three `send`-only IPC channels carrying no coordinates → `onDragStart/Move/End` in main →
  `commit("drag")`, whose snap-and-clamp behaviour **is** covered against recorded C# `SnapToEdge` and
  `Clamp` values, including the arm where the clamp corrects a snap that would have left the window
  off-screen. The drag is hand-rolled rather than `-webkit-app-region: drag` precisely because the CSS
  region gives no release callback, and this claim needs one.
  - **Not measured live, by a decision this ISA already recorded:** synthesising the drag needs
    `SendInput`/`SetCursorPos`, which moves the real cursor on his live desk — the same reason ISC-14
    rejected synthesising keystrokes. And the design makes a *cursor-free* synthetic drag useless:
    `onDragMove` reads `screen.getCursorScreenPoint()` (deliberately, so a drag across this desk's
    negative-x seam does not jump), so `sendInputEvent` alone would move the window by a zero delta.
  - **This is the one Phase 3 arm left for Alex: drag the widget, including across the monitor seam,
    and check it lands inside the work area.**

### Phase 4 — SVG display

- [x] **ISC-21. All four display modes render: phrase, dial, LCD, Nixie.** **CLOSED 2026-08-30 —
  measured on a live Chromium document, not on the source.** `scripts/probe-display.ts` launches the
  built app five times, once per face, and reads the DOM back over CDP: **51 arms green / 0 failed / 10
  inconclusive-by-design / 0 blocking**.
  - **"Four modes" is five faces, and the fifth is why the count is stated.** `clockType: "phrase"` with
    `textStyle: "Split"` is structurally a different face — `#qualifier` + `#emphasis`, not a font
    change — so a four-launch probe would have left one face unrendered and still read green.
  - **Three failures a fake DOM cannot have, which is the whole reason this is a probe.** An
    unresolvable `<use>` renders nothing *with no console error*; a CSS declaration silently beats a
    presentation attribute; a replaced inline element with no `#root { display: block }` collapses.
    Only Chromium's own cascade can answer the middle one. All 16 `<use>` hrefs resolve against
    `getElementById` in every case, and all 46 contract ids are present with no strays — checked in
    **both** directions, so an added id fails as loudly as a missing one.
  - **Element counts are derived from the geometry tables, never relisted in the probe:**
    `lcdSlot=8 lcdSeg=56 lcdDot=16`, `nixieTube=4 nixieGlow=16 nixieGhost=40 nixieColonDot=2`,
    `dialTick=12 dialDot=60 dialNumber=12`, `phraseLine=2`. A relisted expectation would pass against a
    face that had drifted from its own table.
  - **The hole in my own green run, found after it passed.** The first run read 46 green and printed
    `phrase="" qualifier="" emphasis=""` as diagnostic output — correct for that case, but it exposed
    that **no arm could catch a blank face**: `#phrase` is a child of `#phraseFace` whether or not it
    holds text, so a phrase engine returning `""` passed everything. **Arm D11 added**, with its
    negative control: the active text face must be non-empty, and on a dial/lcd/nixie case all three
    text elements must be *empty* (proving only the active face ticks). Live values:
    `phrase="just after four"`, `qualifier="five past"` + `emphasis="four"`, `date="Sun, Aug 30"`.
  - **Two-sided control on the dial decorations, because the one-sided version proves nothing.** All
    three flags — `showHourTicks`/`showMinuteDots`/`showHourNumbers` — **default FALSE**, so a probe
    that does not set them reads an *empty dial* as correct. The dial case sets all three (12/60/12
    visible); the other four leave them at their defaults and assert `display="none"`.
  - **A design decision converted into a measurement.** The LCD case sets `textStyle: "Literary"` and
    **no LCD pixel depends on it** — it is there to measure the "all five faces rebuild on every
    settings push" decision, since `#phrase` computing the Palatino stack while the LCD is visible is
    only possible if the hidden phrase face rebuilt.
  - Bounded: **no pixel is compared.** No screenshot is taken and no glyph is measured against WPF's.
- [x] **ISC-22. Animation touches only composited properties.** `transform`/`opacity` only; never
  `r`/`rx`/`ry`/`cx`/`cy`/`d` per frame. Falsifier: a frame scrub or a paint-flash capture showing
  re-rasterisation. **CLOSED 2026-08-30, with the falsifier replaced because it was not measurable as
  written — the deviation is stated, not glossed.**
  - **The dial cannot be frame-scrubbed.** `dialPlan` reads hours and minutes only, so the hands move
    once a *minute*: a 3-second scrub samples a window in which a **correct** dial is motionless, and
    that green is equally true of a dial that never rendered. Replaced with three claims a broken dial
    cannot pass — the hands' `transform` equals `handTransform(dialPlan(now))` **accepting this minute
    or the previous one** (a minute boundary between the renderer's last tick and the harvest is
    legitimate; the probe names which it matched, which is the difference between a probe and a flaky
    probe); the `x1/y1/x2/y2` endpoints are unchanged, so rotation is not faked by moving points; and
    `el.style.transform === ""`, read off the element rather than assumed from the source.
  - **The scrub moved to the faces that actually animate.** Nixie glow `opacity` (40 ms) and the LCD
    colon dot fills (1 s): **nixie 11 distinct DOM states across 3,155 ms, lcd 4 across 3,187 ms.**
  - **The negative half is what makes the positive half evidence.** Phrase, split and dial must each
    produce **exactly one** DOM state across the same window — all three do. This is also the only
    observable form of the `svg.ts` write memo: **the renderer bundle exports to no global, so CDP
    cannot see a closure** and `setAttr`'s return count is unreachable from outside the renderer. The
    probe hashes the visible face's `outerHTML` and measures the effect instead.
  - Bounded: **no paint-flash capture was taken.** The composited-property claim rests on the attribute
    /`style` distinction and the per-frame diff, not on a rasterisation trace.
- [~] **ISC-23. Every theme and the auto-contrast colour path render correctly.** **Theme half CLOSED
  2026-08-30; the auto-contrast half stays open and is not this phase's to close.**
  - **All 26 themed elements COMPUTE the accent the settings file carried** — five different accents
    across five launches, read as Chromium's *computed* `fill`/`stroke`, which is the only place the
    central trap is answerable: **a CSS declaration beats a presentation attribute**, and every colour
    here goes on as an attribute because the CSP ships no `unsafe-inline`. `#80FFFFFF` on the Nixie case
    exercises `cssColor`'s alpha path (CSS Color 4 `rgb(r g b / a)` against Chromium's legacy
    `rgba(…)`, normalised by channel with alpha to ±0.005).
  - The trap is guarded twice on purpose: `test/renderer-ids.test.ts` forbids `index.css` declaring any
    property code writes as an attribute on a matching element, over the *source*; arm D5 checks the
    same claim over Chromium's *cascade*. The source check cannot see the cascade and the cascade check
    cannot see an unreached rule.
  - **Open half:** `core/contrast.ts` is translated and tested but **wired to nothing** — auto-contrast
    is `[FOG]`/Phase 8 and first on the cut list, and `desktopCapturer` dies on the same denial noted at
    ISC-10's macOS arm. Nothing here renders that path, so it is not claimed.

### Phase 5 — Ghost mode

- [x] **ISC-24. Proximity fade works off main-process cursor polling.** Never off
  `setIgnoreMouseEvents` mousemove forwarding, which was measured delivering zero events here.
  `main/ghost.ts` polls `screen.getCursorScreenPoint()` at **33 ms** — `SAMPLE_MS`, the C#'s own cadence
  measured off `System.Threading.Timer(…, 0, 33)`, not 16 — converts the window's bounds through
  `boundsToEdges` and drives the already-translated `GhostSampler`. **`{ forward: true }` is not passed
  anywhere in the tree**, which is the negative half of this claim and is enforceable by reading rather
  than by trusting: the option is what would reintroduce the dependency on the mechanism this ISC
  forbids. 83 new tests across four files; `main/ghost.ts` is structurally typed like
  `window-placement.ts`, so the whole driver runs under Bun with literal fakes and no Electron on the
  path.
  - **D-06's asymmetry is closed by the driver, and it had to be.** `GhostSampler.onTick` clears its own
    ghost flag on a restore but never sets it on an activate — the C#'s contract, preserved — so
    whoever applies click-through must call `markActive()`. Without it the sampler emits `"activate"` on
    every one of the 30 ticks per second the cursor sits over the widget, each re-applying the same
    style bit. That is measured behaviour of the sampler's own tests, not a hypothesis.
  - **The ratio is computed in DIPs and that is a real divergence from the C#, stated rather than
    papered over.** Win32 gives `GetWindowRect`/`GetCursorPos` in physical pixels, so WPF's
    `GhostFadeRadiusPx` is a physical-pixel radius; Electron's bounds and cursor APIs are both DIP.
    **Both operands come from DIP APIs, so the ratio is at least internally consistent** — mixing them
    is the one thing that would be wrong and is not what happens. The consequence: Alex's stored `200`
    covers 1.5× more physical pixels at 150% scale than it did. No conversion fixes it without picking
    a display to convert against, which is wrong on a desk with mixed scaling — this one, at
    1.00 / 1.25 / 1.00.
  - **The keyboard override ships inert, and this is a DECISION with four rejected alternatives, not an
    omission.** `IsModifierHeld` calls `GetAsyncKeyState(VK_LCONTROL)`; there is no Electron API for
    global modifier state. `globalShortcut` needs a non-modifier key and would steal that chord
    desktop-wide; `before-input-event` and DOM `keydown` both need focus this overlay never has
    (`skipTaskbar`, no dock icon, click-through half the time by design); a native module means a
    compiled dependency to prebuild for three platforms in ISC-29 plus a macOS Accessibility prompt at
    first launch, against a tree with five devDependencies and no native ones; polling the OS per tick
    is 30 process spawns a second. So `readModifiers` is injected and returns `NO_MODIFIERS`.
    **The user-visible consequence, stated because it is a degradation of a shipped v4.2 behaviour:
    while ghost mode is on and the cursor is over the widget it is click-through with no keyboard way
    to suppress it.** The tray is the route to every setting, `isModifierHeld` is tested over all 256
    combinations, the driver logs the limitation once at startup, and a real reader is a one-line
    change.
- [x] **ISC-25. Click-through toggles against renderer-measured hit boxes.** `setIgnoreMouseEvents(true)`
  is Electron's `WS_EX_TRANSPARENT` on Windows and the equivalent elsewhere, so the C#'s `SetWindowLong`
  + `SWP_FRAMECHANGED` pair is one call. **`probe-shell.ts`'s S8 is the before-half and it is green: the
  bit is CLEAR at rest**, so the widget receives its own clicks when the cursor is away — which is what
  makes the toggle observable rather than assumed. The right-click gate now has both real inputs
  (`shouldOpenContextMenu(isDragging(), ghost.isActive, ghost.isModifierHeld)`), and RMB-03's arm is
  **defensive on Windows too**: the C# records that the handler never fires while click-through is
  applied, because the OS routes the click past the window — the value of wiring it to real state
  rather than a literal is that the claim is answered by state on the platforms where it *can* fire.
  - **RMB-04's menu pin is built around an open question rather than an assumption.** `_menuOpen` pins
    the fade so the widget cannot fade out from under its own menu, and makes a second right-click a
    no-op instead of a re-`Show()` that flickers. Electron has `menu-will-show`/`menu-will-close`, but
    `menu-will-show`'s own doc reads *"Emitted when `menu.popup()` is called"* (`electron.d.ts:8607-8626`)
    and this app opens the menu with `tray.popUpContextMenu()` deliberately. **Nothing in the typings
    says those events fire on that path**, so: on is set by `popUp()` itself, off has three independent
    routes (`menu-will-close`, any item click, and a 30 s watchdog), and each transition logs which
    route fired — so one right-click and one dismissal answer the question empirically on whatever
    platform it was run on. The watchdog is sized by what a stuck pin costs: the fade stops writing and
    the widget's right-click stops working, silently, until restart. **On Linux `popUp()` returns
    early** (no `popUpContextMenu` there), and the pin is set *after* that return so a Linux
    right-click does not freeze the fade for 30 s for nothing.
- [~] **ISC-26. PERF-01 is closed as a COMPARATIVE claim and measured. The absolute figures are
  provisional, and the reason is not the code.** The fade stays smooth under the synthetic 25–50% CPU
  load — the v4.4 defect still open in `.planning/STATE.md`. `scripts/probe-fade.ts` (new) builds the
  shipped `FadePump` **and a v4.4-shaped negative control** — `win.setOpacity()` driven from main at
  30 Hz — into one Electron process and runs both across eight phases: idle, main-blocked, system-load,
  oversubscribed. **7 of 8 blocking arms pass.**
  - **The pump: median 12.7 ms, p99 13.5 ms, max 13.8 ms — identical idle and with main blocked 40 ms
    out of every 50.** Zero frames over the 33.4 ms bar in any phase, including 100% oversubscription.
  - **The control degrades, and that arm is itself blocking.** Median 31.0 → 62.0 ms, 63 ticks against
    145 in the same 4 s. Without it a flat line under a load that never arrived is indistinguishable
    from success — Rule 18, and it is the arm that makes the other seven mean anything.
  - **F5b is the architectural claim as a number.** Under the same block, main's ghost pushes went
    33 → 62 ms while the renderer's frames did not move. **The delay lands on the target, not on the
    animation.**
  - **F6 measured 49.8% system CPU inside the plan's band with the pump at 12.7 ms — and F6b says what
    that green is worth, which is less than it looks.** 12 saturated cores of 32 leaves 20 idle, so this
    band starves neither process on this host; the plan's wording is a proxy for thread occupancy, which
    is what actually broke v4.4. **F5 carries the claim, not F6.** F7 goes further — 36 workers on 32
    cores, 100% measured, pump at median 12.6 ms — and is reported as *"no limit found below full
    oversubscription"*, never as "immune".
  - **Why this is `[~]` and not `[x]`: the workstation was LOCKED for every measurement**
    (`Get-Process LogonUI` → 1), so the rAF cadence was measured against a compositor that was not
    presenting. The corroborating signal is in the data — idle median 12.7 ms is **~79 Hz, which matches
    no standard refresh rate**, which is why arm F0 exists and checks the measured interval against
    60/75/90/120/144/165/240 Hz. **The comparative result is unaffected**: both architectures ran in one
    process, on one host, under one load, and the control degraded while the pump did not. **The
    absolute numbers are not yet a claim about what a user sees.** F0 is blocking, so a locked run exits
    1 on purpose — PERF-01 cannot be quoted as closed from a locked desk. **Trigger to close: re-run
    `bun run probe:fade` from an unlocked session.**
  - **What no probe here has seen: the REAL app fading under a REAL cursor.** Pushing a target needs
    `ipcRenderer`, which CDP cannot reach; moving the cursor needs `SendInput`, which moves Alex's own.
    Manual, alongside the drag and the monitor unplug.
- [x] **ISC-26.1. The pump's two deviations from `OnRenderingTick` are named, and both close a defect
  the C# has.** Not a sub-claim of convenience: each is a behaviour a faithful port would have shipped.
  - **An epsilon snap, because the C#'s convergence test is unreachable for an intermediate target.**
    `lerpRatio` snaps hard at exactly 0 or 1, but `ProximityChanged` receives every value
    `computeProximityRatio` produces, and a cursor parked partway into the halo is a target like 0.8 —
    which the exponential approaches and never equals. `_currentRatio == _targetRatio` never holds, so
    WPF's `CompositionTarget.Rendering` stays attached forever, ticking at compositor rate for a value
    that stopped changing. `RATIO_EPSILON` lets the pump actually stop, and `renderer.ts` detaches the
    rAF loop outright rather than spinning a no-op frame — which matters for the honesty of any future
    CPU probe, since a loop waking 60×/s to compare two equal numbers reads as "the fade is cheap".
  - **A converged frame still writes once if a guard swallowed the write.** The C#'s guards return
    before the write while step 3 has already advanced the ratio, so a guard held long enough to
    converge means the write never happens: start a drag, move onto the widget, the target snaps to 1.0
    under `_isDragging`, and every later frame early-returns. **The widget stays at full opacity for the
    rest of that gesture while ghost mode is active and click-through is applied.** `skipped` is a
    *reason* rather than a boolean so the owed write lands on the first unguarded frame.
  - **The body order is the behaviour, which is why this is a class and not four inline lines.** The
    guard chain must short-circuit the opacity write but must NOT short-circuit the lerp, or visible
    state jumps instead of catching up on the frame after the guard releases. One `if` in the wrong
    place, and not observable from a screenshot.
- [x] **ISC-26.2. The whole opacity product moved to the renderer, and the deciding evidence is a
  platform annotation rather than a preference.** `main.ts` used to call
  `mainWindow.setOpacity(settings.opacity)` and deliberately no longer does. `setOpacity` is
  **`@platform win32,darwin`** and documented "On Linux, does nothing" (`electron.d.ts:3115-3120`), so
  splitting `windowOpacity × (1 − ratio)` across the two layers — window alpha times element alpha is
  the same number — would have made **the user's own opacity setting silently inert on Linux while the
  fade kept working.** A divergence visible only to a Linux user, on a setting they had already saved.
  - **It goes on as the SVG `opacity` presentation attribute on `#root`, not `element.style.opacity`**,
    for the CSP reason every colour already does: `index.html` ships no `style-src 'unsafe-inline'`.
    **A CSS declaration BEATS a presentation attribute**, so `opacity` joins the property list
    `test/renderer-ids.test.ts` forbids `index.css` from declaring — a single `#root { opacity: 1 }`
    there would leave the fade running, the ratio moving, and nothing on screen.
  - Written at **four decimal places** deliberately: `setAttr` stringifies with `String` and never
    rounds, so precision is the call site's job. 1e-4 is 0.0255 of one 8-bit alpha level, so the memo
    can collapse the tail of a fade instead of writing a fresh 17-digit string every frame.
- [ ] **ISC-26.3. BLOCKING GATE RED, deliberately not waived: `probe-shell.ts`'s S2 reports
  `layered=false, want true`, and the correction needs pixel evidence that cannot be gathered from a
  locked screen.** Removing main's `setOpacity` call is what turned S2 red. A five-stage scratch probe
  measured where `WS_EX_LAYERED` actually comes from on this build: `transparent: true` with nothing
  called → false/false; after `setIgnoreMouseEvents(false)` → false/false; after
  `setIgnoreMouseEvents(true)` → **true/true**; after `setOpacity(0.9)` then `(false)` → **true**/false.
  **So the bit was never a consequence of `transparent: true`, and S2's green had been reading the right
  bit off the wrong cause since Phase 3.**
  - **Why the table is not enough to correct the arm, which is the whole point of this claim.** It
    cannot distinguish *"the bit is irrelevant"* from *"the bit was load-bearing and the widget is now
    an opaque box"*. **Nothing else in this repo can either** — every arm reads a decision, never an
    appearance, and `probe-display.ts:64` says so in as many words. **A widget rendering as a black
    rectangle passes every gate this tree has.** Relaxing S2 on the table alone would be rationalising
    a red gate, so it stays red.
  - **The instrument was built rather than the arm relaxed.** `scripts/probe-pixels.ts` +
    `probe-pixels-app.cjs` + `screengrab.ps1` — the first pixel-reading probe in the repo. An opaque
    magenta backdrop we own (not the wallpaper: a dark desktop under an opaque dark box also "matches"),
    the real widget's whole option list stacked on top at `screen-saver`, and `CopyFromScreen` reduced
    to a mean plus an 8×8 centre-sampled grid (a mean alone cannot tell magenta from a red/blue
    checker). **Arm X2 is the control and is reported before the claim on purpose:** the same window,
    same flags, painting opaque green must turn the capture green, or the probe was photographing the
    backdrop all along and X3's magenta means nothing.
  - **`capturePage()` cannot answer this question** — it captures the page's own surface, so a
    transparent page captures as transparent whether or not the OS honoured it.
  - **Trigger to close: unlock the screen, `bun run probe:pixels`, then correct or confirm S2's
    `layered` expectation on that evidence and re-run `bun run probe:shell`.**
- [x] **ISC-26.4. A capture-based probe must establish that anyone was looking before it reports
  anything, and this claim exists because mine did not.** `probe-pixels.ts` reported all four arms red
  on its first two runs, including the line *"THE WIDGET IS PAINTING A BOX — removing main's setOpacity
  call broke transparency"*. **It had not.** `CopyFromScreen` from a process on the default desktop
  reads near-black while `LogonUI.exe` owns the display, so every stage photographed the same black
  rectangle and the comparisons between them were perfectly consistent and entirely meaningless.
  **That is worse than a probe that does not exist, because the output was specific, alarming and
  wrong.**
  - **Three wrong diagnoses came first, and the order is the lesson.** An isolated `screengrab.ps1` run
    proved the capture path works (varied greys elsewhere on screen); `PIXEL-BOUNDS` reporting proved
    the windows were exactly where they had been asked to go at scale 1.00; a wide hunt over the full
    3440×1440 found **0 of 576 cells magenta anywhere**. Only then: `Get-Process LogonUI`.
  - `scripts/lib/session-lock.ts` is the gate. **`LogonUI.exe` presence and not an API, for a measured
    reason**: Win32 has session-state *notifications* but no queryable locked flag, and
    `WTSQuerySessionInformation` reports the session Active either way. Same signal PAI's own
    `FeedIngest.cmd` gates on. **Fails OPEN** — a broken query costs one possibly-contaminated run
    rather than silently disabling every capture arm forever. Verdict when locked is **INCONCLUSIVE,
    exit 0**: a probe that could not look is not a probe that saw a defect.
- [x] **ISC-26.5. Three features this port did not own were found by reading every C# writer of the
  state each one touches, and one of them is paid here.** The method is the claim: reading only the
  writer the fade needed would have shipped all three as silent gaps.
  - **The scroll-wheel opacity gesture** (`Window_PreviewMouseWheel`) — one 10% step per notch. **No
    phase owned it and the word "wheel" appears nowhere in the plan document.** A Phase 3 omission
    (a window interaction, like the drag and the right-click that phase *did* port), paid here because
    Phase 5 owns `opacity` and because a daily-use gesture that silently does nothing is exactly what a
    "Phase 5 closed" claim would have papered over. Two porting traps, both pinned by tests: **the sign
    is inverted** between WPF's `e.Delta > 0` (up) and the DOM's negative `deltaY` (up), so a literal
    port dims when you scroll up **and still looks deliberate**; and it steps on `Math.sign`, never the
    magnitude, or a high-resolution wheel makes every notch a different size. The negation lives in
    `renderer.ts`, at the boundary where the DOM's convention is, so the two conventions never meet.
    **The clamp is asymmetric with `validateSettings` and that is the C#'s**: `Validate` guards opacity
    only from below and lets 1.5 through, while `stepOpacity` clamps to `[0.10, 1.0]` — so a hand-edited
    1.5 survives a load and snaps to 1.0 on the first scroll. A `direction` of 0 is a no-op rather than
    a clamp of `current + 0`, precisely so a scroll carrying no direction cannot change a
    hand-edited value.
  - **The hover backdrop and the hover fast-refresh** (`Window_MouseEnter`/`MouseLeave`) — hovering
    paints a semi-transparent backdrop behind the widget and drops the stats interval to 0.5 s.
    `backdropAlwaysVisible` and `backdropOpacityPercent` are in `AppSettings` **with no reader
    anywhere**; alpha is `Clamp(pct / 100 × 255, 25, 255)` (`MainWindow.xaml:34`). **Assigned to
    ISC-27**, since the interval half is stats cadence.
- [x] **ISC-26.6. Two observed C# defects, one reproduced and one closed — decided on a stated standard
  rather than case by case.** The standard: **a one-DIP geometry difference gets reproduced faithfully;
  a state that reads as a broken app gets named and fixed.**
  - **Reproduced.** `boundsToEdges` keeps Win32's *exclusive* right/bottom edges, because
    `GhostModeController` passes `rect.Right` into an inside test of `cursorX <= rectRight` — so in the
    WPF app a cursor one DIP past the widget's last painted column reads as inside. `x + width`
    reproduces that exactly. The more defensible geometry (`x + width - 1`) is **not** what ships, and
    a test pins the asymmetry so a future change to the obviously-right version fails loudly instead of
    shifting the fade boundary by a pixel nobody can find.
  - **Closed.** `_lastProximityRatio` has **no reset anywhere in the C#** — measured by reading every
    writer of the field, which is `GhostModeController.cs:441` and nothing else. So a re-enable with the
    cursor parked over the widget computes ratio 1.0 against a remembered 1.0, reports no change and
    never raises `ProximityChanged` — while the transition *is* `Activate`, so `WS_EX_TRANSPARENT` goes
    back on. **The widget is then click-through at FULL opacity: unclickable, showing no sign of why.**
    It self-heals as soon as the cursor moves somewhere with a different ratio, which is why it is not
    in the restart-only class — and is also why it survived in the C#, where the tray is the only
    toggle and using it puts the cursor at the other end of the screen. `deactivate()` clears it to 0,
    which is safe in the other direction too: a re-enable with the cursor far away computes 0 against a
    remembered 0, reports no edge, and the renderer is already at full opacity.
  - The *first* write in `deactivate()` is the C#'s and is why `_isGhostMode` is `internal` there:
    once `IsEnabled` is false, `OnSampleThreadTick` returns before the restore branch, so **no future
    tick can ever clear the flag**. Without it a re-enable with the cursor over the widget leaves a
    widget faded to invisible but NOT click-through — curable only by a restart.
- [x] **ISC-26.7. Four platform facts were measured here, each after a wrong first diagnosis, and each
  is written into the file it would bite next.**
  - **Electron's main process on Windows does not deliver piped stdin.** With `stdio: "pipe"`,
    `process.stdin` in main is a bare `Readable` with `isTTY === undefined` that never emits `data` and
    **never errors either**. **stdOUT is unaffected**, which is what makes it present as a hung
    renderer rather than a dead channel — the first fade-probe run hung after
    `PROBE-FADE-PHASE renderer-idle`. Diagnosed with a scratch probe rather than guessed at. Both probe
    hosts now gate on a **monotonically increasing counter file** polled at 25 ms, chosen over a
    sentinel file so a phase release cannot be lost to a race or double-consumed.
  - **`#rrggbb` inside a `data:text/html,` URL is a FRAGMENT.** Everything from the `#` on is stripped
    before the document is parsed, so the pixel host's first version served a page whose style ended at
    `background:` and whose closing tags were gone. Colours are `rgb()` and the whole document goes
    through `encodeURIComponent`. Choosing a colour nothing supplies by accident is worth nothing if the
    page never receives it.
  - **`setInterval(16)` coalesces to ~31 ms on Windows even at idle.** F4's first bar was
    `busy.max > idle.max × 2` and returned INCONCLUSIVE on a load that had plainly arrived, failing at
    exactly 64 > 64 — idle max and busy max sat one timer tick apart. Replaced with medians against a
    bar **derived from the block size** (`BUSY_SPIN_MS`) rather than a tuned multiple. F4b records the
    corollary as its own diagnostic arm: the control is already off-vsync when idle, ~32 Hz for a 16 ms
    request.
  - **A locked session poisons any capture-based arm** — ISC-26.4.
  - **One mechanism guess of mine was wrong and the measurement settled it better.** I first reasoned
    from remembered Electron C++ about an internal `layered_` flag being set at window creation. The
    five-stage probe showed something different and more useful: `transparent: true` never sets the bit
    at all on this build. **Reasoning from a remembered implementation is the failure mode; the table
    is the fix.**

### Phase 6 — Stats panel + per-platform sources

- [ ] **ISC-27. All 15 telemetry cells resolve.** Was 18; the three temperature cells retire with
  Option C. Each shows a live number on its platform or renders `--` through the existing `-1` sentinel
  path. Two rows moved under ISC-10's M7 and the claim inherits both: **macOS MEM must come from
  `vm_stat`, not `os.freemem()`** (which read 3.1% free on a healthy 8GB Mac), and **macOS GPU% may
  resolve after all** via unprivileged `ioreg -c AGXAccelerator` — a candidate, not an adoption, so the
  `-1` path stays reachable and tested on that cell rather than being treated as dead code.
  - **Two features joined this claim from ISC-26.5, and neither was in any phase's exit criteria.** The
    **hover backdrop** (`backdropAlwaysVisible` / `backdropOpacityPercent` are in `AppSettings` with no
    reader; alpha is `Clamp(pct / 100 × 255, 25, 255)`, `MainWindow.xaml:34`; the element does not exist
    in the SVG yet) and the **hover fast-refresh** (stats interval → 0.5 s on enter, restored on leave).
    They land here rather than in Phase 3 because the interval half is stats cadence.
  - **Per-row stat visibility, `statsLayout()`/`statsPanelHeight()`/`layoutStats()`'s `textInset`, the
    battery-alert colour override** (`theme.ts` declares `ThemeOverrides.batteryAlertActive`,
    `BATTERY_ALERT_OWNED_ID = "battBar"`) **and `SetDateFormat`'s `_currentDateText = ""` force-redraw**
    are the rest of this claim's unwired surface — all named in Phase 4's landing, none of them wired.
- [ ] **ISC-28. Every per-platform parser is fixture-driven and runs on every platform.** Captured
  `/proc/meminfo`, `typeperf` CSV, `pmset -g batt`, `hwmon` tree checked in. This is what makes three
  platforms testable from one.

### Phase 6.5 — Settings window *(NEW — no phase owned it; added 2026-08-29)*

- [ ] **ISC-32. The settings window exists and edits every setting the WPF window exposes.** A second
  `BrowserWindow` replacing `SettingsWindow.xaml` (521 LOC of XAML → HTML/CSS): changes apply live, and
  closing it does not take the overlay down. **Found by wiring the tray in Phase 3, not by planning.**
  The plan's component table always listed a "second `BrowserWindow`"; **no phase's exit criteria ever
  mentioned it**, and a table and a phase list disagreeing is how a shipped feature goes missing. The
  `open-settings` tray action therefore logs and does nothing today, `main.ts`'s header says so, and
  § Phase 6.5 now exists in the plan rather than the gap living in a comment.
  - **What is missing is the editing surface, not the state.** Every setting is already validated,
    persisted and — for the ones the tray exposes — togglable now, so nothing is lost by this landing
    late.
  - **This is scope that did not exist when "continue until you finish Phase 7" was said.** Flagged
    here for Alex rather than absorbed into that sentence or quietly dropped: whether it lands before
    Phase 7 is his call, and the plan states the case for before (an installer that ships without it
    ships a v5.0 configurable only from a tray menu).

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

- **Phase 5: no native module for global key state, so the `Ctrl` override ships inert.** Four
  alternatives rejected on stated cost (ISC-24). This gives up a shipped v4.2 behaviour, which is why it
  is here and not only in a code comment — the tray remains the route to every setting, and a real
  reader is a one-line change against an injected seam tested over all 256 combinations.
- **Phase 5: S2 stays RED rather than being corrected on the evidence available.** The measured
  `WS_EX_LAYERED` table proves the arm's cause attribution was wrong, and that is still not enough to
  correct its expectation — it cannot distinguish an irrelevant bit from a widget that is now an opaque
  box, and nothing in the tree could. **Built the instrument (`probe:pixels`) instead of relaxing the
  gate**, and left the gate red until the instrument can run. ISC-26.3.
- **Phase 5: elected no cross-vendor second look.** Blast radius is one feature on a branch that is not
  merged, every claim is backed by a re-runnable probe or a test in this repo, and the two things a
  second reader could not have caught (the locked session, the missing pixel instrument) were found by
  measurement rather than by review.
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
- **`electron/` as a sibling tree, WPF untouched.** Keeps the shipping app shipping and keeps the 632
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
- **ISC-8 is `[x]` while reporting a regression, and NSIS was chosen because it is the harder
  comparison.** The claim asked for a measured size, not a favourable one, so a 1.40× loss closes it —
  marking it `[ ]` because the answer was unwelcome would make the box track preference instead of
  measurement. The packaging target follows the same logic: electron-builder's `portable` or `zip`
  targets would have produced a much smaller artefact, but WPF ships an Inno *installer*, and
  comparing a zip against an installer measures compression choices rather than platform cost.
- **The sidecar mirrors `TemperatureService.cs` line for line instead of being redesigned.** Its
  priority lists, resolution walk, NVMe SubHardware descent and `-1` sentinel are copied, with the
  source lines cited in comments. That file is what shipped in v4.2 and what the tests cover, so any
  difference here would be a fidelity regression dressed as an improvement. Two things were changed
  deliberately and both are documented in the file: the 5s init-timeout race moves to the parent
  (which can see a process fail to emit, strictly more information than the in-process version had),
  and the silent-failure posture becomes stderr — silence was right for a UI thread and wrong for a
  process whose only job is to report.
- **The elevation finding is reported, not fixed.** Adding a `requestedExecutionLevel` manifest would
  get CPU temperature back, and it would also put a UAC prompt in front of an app that autostarts.
  That trade is Alex's, and taking it unilaterally would be deciding a product question inside a
  measurement task. Recorded in ISC-9 and in Still outstanding.
- **`--dump` exists because a sentinel is ambiguous and the decision needs it not to be.** `-1` covers
  both "the driver refused" and "there is no such sensor", which are different diagnoses with
  different fixes. Adding a mode that prints the inventory was cheaper than reasoning about which one
  was happening — and it is what turned "temps mostly don't work" into "51 sensors present, all
  refused, unelevated."
- **Option C acted on in full: the sidecar tree, its probe and its npm script are deleted, not left
  dormant.** Alex chose "C, drop temps" after ISC-9, so `electron/sidecar/` (231-line `Program.cs` +
  csproj), `electron/scripts/probe-sidecar.ts` and `package.json`'s `probe:sidecar` are gone. Kept
  nothing behind a flag: a dormant sidecar is a second temperature implementation that no test covers
  and no platform builds, and the next person to read the tree would reasonably assume it works.
  Everything is recoverable from **`64c747e`**, which is cited at ISC-9 and in the plan so the code is
  a `git checkout` away rather than a rewrite. **The sidecar's entire value was informational, and it
  delivered:** it existed to produce a number, the number it produced was "51 CPU sensors present and
  all NULL unelevated", and that retired the feature it was built to serve. A probe that argues against
  its own subject is a successful probe, not wasted work.
- **The four temperature fields leave `StatsSample` entirely rather than being stubbed at `-1`.** A
  field that is permanently `-1` on every platform reads as *unimplemented* — an invitation to finish
  it — whereas an absent field reads as a decision. The `-1` sentinel keeps meaning "no source right
  now" for the 15 cells that can have one, which is precisely the meaning a permanent `-1` would
  erode. `TempsLineVisible` therefore becomes an **ignored key** on settings import (ISC-18), not a
  missing one: his live file has it, the importer must not choke on it, and it must not resurrect a
  UI row. **This became true of the tree only later** — `e6bfa77` asserted it in a commit message
  without containing it, see § Changelog. Landed for real across six deletions: `Temperatures` and
  `EMPTY_TEMPS` and the `temps` field out of `shared.ts` (replaced by a doc block saying the absence is
  a decision, so the next reader does not read it as an oversight), the `EMPTY_TEMPS` import and
  initialiser out of `main.ts`, the duplicated interface + `tempsEl` + `formatTemps()` + its `setText`
  call out of `renderer.ts`, and the orphaned `<text id="temps">` node out of `index.html`. Verified as
  a running app, not just a compiling one: `bun run typecheck` 0, `bun test` 96/0, and a 12s launch
  reaching `PROBE-READY` and `PROBE-PAINTS 9` with no `did-fail-load` — which is the arm that matters,
  because `element()` throws on a missing id, so a half-done deletion would have killed the renderer
  module at load and frozen paints at 0 while the transparent window still showed.
- **`DateFormatter` is ported field by field through `Intl`, and that decision fixed a divergence the
  port was already shipping.** A .NET custom format string is placeholders plus literals: each
  placeholder resolves against the culture independently and the *order* is the pattern's, fixed.
  `Intl.DateTimeFormat` does the opposite — given `{weekday, month, day}` together it emits the locale's
  own order. On **this host, en-AU, that is "Sat, 7 Mar" where the WPF app renders "Sat, Mar 7"**, and
  the renderer was calling exactly that whole-date form. So each field is fetched alone and this file
  supplies the order and the literals, which is .NET's semantics exactly. `Numeric` and `ISO` consult no
  locale at all, having no name-bearing field. **The divergence is why the test asserts the two forms
  DIFFER** rather than only asserting the right string: a port that delegates ordering to the locale
  passes every value assertion on an en-US CI box and is wrong on Alex's desk. One divergence is kept
  and written down rather than fixed: in .NET `/` inside a custom format is the culture's
  `DateSeparator`, and this pins `/`.
- **The renderer's own copies of `formatUptime` and the date line are deleted, not left beside the
  ports.** Both had already drifted — the local uptime dropped the minutes field past a day
  (`up 1d 2h`, where the C# gives `up 1d 2h 15m`) and the date used the locale's field order. `../core/`
  is imported straight into the renderer bundle, which the file now explains, because the comment above
  it says main-process code must never be imported there and a reader needs to see why these are a
  different case: they are pure translations of `FuzzyClock.Core` with no Node, Electron or IPC surface,
  and the WPF original calls the same code from its UI thread. **The "no reading yet" state moved rather
  than vanished** — `index.html` ships "up —" as the node's initial text, so it shows before the first
  sample and never returns, instead of living as a `seconds <= 0` branch inside a formatter the C# has no
  branch in.
- **`bun run start` now goes through `scripts/start.ts`, because `electron dist/main.js` does not work
  in the shell this repo is developed in.** Found by using it: the smoke launch above, run from a
  VSCode-descended shell, died in `node:internal/modules/esm/translators` under a `Node.js v20.18.3`
  banner — `ELECTRON_RUN_AS_NODE=1`, the same variable `lib/electron-launch.ts` was written for, reaching
  the one launch path that did not use it. The probes were defended and the dev entry point was not, so
  the fix routes `start` through `spawnElectron` rather than adding a second `delete env[...]`: one place
  strips the variable and every launcher shares it. **The before/after is a real positive control, not an
  argument** — the identical shell with the identical variable still set produced the Node crash on the
  old script form and a live app (`PROBE-READY`, `PROBE-PAINTS 9`) on the new one, minutes apart. Two
  details are load-bearing and commented as such: stdio is forwarded rather than discarded, because a
  discarded stream is what let this crash pass for a clean exit the first time it happened; and `SIGINT`
  is forwarded to the child, so `before-quit` runs and the two `typeperf` children are reaped instead of
  outliving the terminal.
- **The AC-2 denominator was re-measured rather than reasoned about, and the inherited number was
  wrong.** 469 Core + 163 App = **632**, not the 633 carried in earlier notes; 54 of those cases are
  temps (12 + 21 + 10 + 11), so the parity target is **578**. Recorded as a correction rather than
  quietly substituted, because the failure this prevents is specific and one-directional: a raw
  before/after count at merge time would read a retired feature as 54 missing tests, and the safe-looking
  response to that is to write 54 tests for code that no longer exists.
- **The `ioreg` GPU source is recorded as a candidate and NOT adopted.** `ioreg -r -c AGXAccelerator -l`
  gives macOS GPU utilisation unprivileged, which is better than the `-1` the plan had — but it is an
  **undocumented IOKit path on an Apple-silicon-only driver class**, with field names that are not
  contractual and one host of evidence. So it is checked in as a fixture with the caveat written next
  to it, and the `-1` fallback stays mandatory. Adopting a source on its first sighting is how a cell
  becomes silently broken on the first Intel Mac it meets.
- **macOS MEM comes from `vm_stat`, and `os.freemem()` is rejected outright rather than kept as a
  fallback.** It read **3.1% free on a healthy 8GB machine**. A wrong-but-plausible 97% is worse than
  `--`, and a fallback that is confidently wrong is worse than no fallback — it would activate exactly
  when `vm_stat` is unavailable and there is nothing to contradict it. Note also that `Pages stored in
  compressor` ≠ `Pages occupied by compressor`; only the second is a physical footprint.
- **The macOS dispatch ran `danger-full-access` / `approval-policy: never`, and the constraints were
  put in the prompt instead.** It needed network (npm) and WindowServer access, so a sandbox would have
  failed for reasons unrelated to the question. What bounded it was written rather than enforced: all
  writes confined to a `mktemp -d`, no global installs, **no interaction with any permission prompt**,
  and no temperature probing at all — that decision was already made and re-opening it on a second
  host would have been scope I was not given. The TCC denials are therefore a real property of that
  host, not something a granted prompt papered over, which is why three arms are inconclusive instead
  of green.
- **The 40% disk regression is surfaced to Alex, not adjudicated here.** Phase 1 is the go/no-go, and
  the two numbers now point opposite ways: ~2× cheaper on CPU, 1.40× more disk. Which one matters is
  his call about the product — a desktop overlay's disk cost is paid once and its CPU cost is paid
  continuously, which is an argument, not a decision. The ISA records both at full strength rather
  than netting them into a verdict I was not asked for.
- **ISC-13's oracle was built before any TypeScript, and the claim was rewritten to fit what is
  actually observable rather than the reverse.** The original wording demanded byte-identical phrase
  output; 10 of 18 providers are random, so no port could satisfy it and no port could fail it
  informatively either. Two options were available: weaken the claim to a sampled comparison, or find
  a deterministic property strong enough to be worth pinning. The second exists — `GetSegmentKey` is
  contractually deterministic and the candidate *set* is finite and enumerable — so the claim got
  **stronger** while becoming checkable. A sampled comparison would have passed a wrong-bucket port
  four times in five, which is the specific defect a phrase port is most likely to have: the tables
  are mechanical to transcribe and the bucket boundaries are not.
- **Reflection supplies only the denominator; every string in the golden files came out of the
  provider.** The generator reads `Buckets[i].Candidates.Length` to know when a set has saturated, and
  nothing else. It deliberately does **not** re-implement `{h}` substitution, because a generator that
  rendered the templates itself would be diffing the port against the generator's idea of the C#
  rather than against the C#. Same reason the bucket index comes from `GetSegmentKey`'s own return
  value instead of re-walking the `UpperBound` table: duplicated selection logic is a second
  implementation that can agree with neither side.
- **The `(segment key, hour12)` grouping is checked, not assumed.** It is stated as a hypothesis and
  every group is verified for internal agreement across all 1440 minutes, so a wrong hour formula or a
  minute-dependent provider produces a loud problem line rather than silently collapsing rows that
  differ. Without that check the file would be smaller, look correct, and quietly drop whichever
  minutes disagreed.
- **`tools/GoldenGen` is deliberately outside `FuzzyClock.slnx`.** It must not join the 632-test gate
  and `dotnet test` must not start depending on it — a generator that runs as part of the test suite
  can rewrite the oracle it is being tested against. It dies with the WPF tree at ISC-31; the two
  `.tsv` files are the artifact that survives, which is why they are checked in rather than generated
  on demand.
- **The golden files are `-text` in `.gitattributes`, and that is load-bearing rather than tidy.** The
  repo-wide `*` rule would bring them back CRLF in the working copy, every hash would move, and the
  byte-identical-rerun check — the only evidence that the random sampling saturated — would fail for a
  reason having nothing to do with phrases. A verification that can be broken by a line-ending policy
  is not a verification. The golden test now asserts the absence of CR on read, so the day that policy
  slips the failure names the cause instead of naming a phrase.
- **Three routes to the same C# data, on purpose.** `tools/TableExport` reaches the strings by
  **reflecting fields**; `tools/GoldenGen` reaches them by **calling providers** and saturating random
  draws; the ~40 noon/midnight specials are **transcribed by hand** from source. Any one of the three
  going wrong fails the comparison. The tempting simplification — have TableExport sample the specials
  too — would have given the fixture and the spec one shared origin and made every `:noon`,
  `:midnight` and `:witching` row a check on its own provenance. Mutation 5 (one extra `r` in a Pirate
  noon string) is that separation paying off.
- **The specials census is the exporter's own output, not a reading of the source.** I first wrote
  "seven providers hold their noon/midnight candidates in method locals." The run proved **only
  `en-classic` and `en-terse` declare them as static fields, so it is 16 of 18** — locals carry no
  metadata to reflect. The number is now quoted from the run in both the emitted header and the class
  doc, because a hand-counted census in a file about mechanical extraction is the one figure nobody
  re-checks.
- **`tools/TableExport` is outside `FuzzyClock.slnx` for the same reason GoldenGen is,** and dies with
  the WPF tree at ISC-31. What survives is `tables.generated.ts`, checked in, with its regeneration
  command in the header. Reflection rather than a source parser or hands: a human mistypes one of 899
  strings, a regex mishandles a nested bracket silently, and reflection reads what the CLR actually
  built. It emits **data only** — no template substitution, no bucket walk, no special-case branch —
  because a generator that emitted behaviour too would leave the port agreeing with itself.
- **`makeProvider` checks its preconditions at construction, and that is the one deliberate
  behavioural divergence in the phrase layer.** The C# throws from `GetPhrase` at the first uncovered
  minute and picks from an empty array at noon — real failures that would first appear an hour or a
  day into a run. Nothing in the generated tables can trigger either, which is precisely why the
  guards had never once executed; `phrase-factories.test.ts` now feeds them bad tables on purpose,
  with a well-formed spec as the positive control so the six throws are demonstrably rejecting the
  defect and not the shape.
- **The surviving mutant was a finding about the code, not a hole in the test.** Disabling
  `en-classic`'s o'clock guard left all 78 assertions green. Reading
  `EnglishPhraseProvider.GetStructuredPhrase` explains it: for `"{h} o'clock"` the guard returns
  `("", Replace("{h}", …))` and the fallback returns the same thing plus a `{h1}` replacement that has
  nothing to act on — so **the branch is redundant in the C# too**, an equivalent mutant rather than a
  gap. Two things followed. My comment claimed the guard stopped the phrase collapsing to
  `("", "three")`, which it cannot: `"{h} o'clock"` does not end with `{h}`, so no split arm would
  ever have claimed it. That comment is now the measured truth. And the branch is kept rather than
  deleted, because it *is* live for any `oClockTemplate` ending in an hour token — a distinction
  `phrase-factories.test.ts` pins with the same template under both settings, which is what turned the
  survivor into a caught mutation.
- **`segmentKeyMode` is written out per locale rather than derived from `declaredShape`.** The two line
  up exactly today — all 8 `"template"` locales key on the phrase, all 10 `"candidates"` locales key on
  the bucket index — but that alignment is an observation about the original, not a rule the port
  should inherit silently. So it is spelled out per spec and the equivalence is asserted as a fact
  about today's C#. `specShapeMismatches` reports the contradiction if a regeneration ever breaks it,
  and each of its four rules has a spec built to trip it — asserting only that it returns nothing would
  be satisfied by a function that returns nothing unconditionally (claim 19).
- **`TryParseTag`'s `out Version` becomes `Version | null`, and the trigger was a NullReferenceException
  in my own probe.** The C# assigns `new Version(0, 0)` on entry and calls it a "sentinel out-value —
  caller must check return" (`UpdateVersionComparer.cs:16`). That comment is false for every rejection
  that reaches `Version.TryParse`, because `TryParse` writes **null** into the out-parameter on failure
  and clobbers the sentinel; "garbage", "4" and "4.x.0" all come back null. The out is annotated
  non-nullable, so a caller that trusted the comment and skipped the bool dereferences null — which is
  exactly what happened the first time the probe ran. **Not fixed in the WPF tree, deliberately**: it is
  latent, not live (`UpdateCheckService.cs:138` is the only production caller and it does check the
  bool), the WPF version is deleted at ISC-31, and editing it would put a change into a tree that is
  about to be removed. The port makes the trap unrepresentable instead, and that same caller is the
  proof the nullable return is the shape the app wanted anyway.
- **`System.Version`'s -1 for an absent component is carried into the port rather than normalized away
  at parse time.** Normalizing early would make `isNewer` a plain field compare and delete the -1
  distinction — along with the discriminating power of the two asserts that cover it, which are the
  C#'s own. Measured: raw `4.5.0 > 4.5` is **true** in .NET, so the promotion is not cosmetic. It is
  also live rather than theoretical, since the app compares a 4-component assembly version against a
  3-component release tag (`MainWindow.xaml.cs:1321-1322`).
- **The port is deliberately stricter than the C# on one input, and it is written down rather than
  smoothed over.** .NET parses each version component with `NumberStyles.Integer`, which allows leading
  whitespace inside a component, so `TryParseTag("4. 5")` returns 4.5 — measured, not inferred. That is
  an accident of the number parser rather than a rule anyone wrote, it cannot come out of a GitHub tag,
  and the direction is the safe one: rejecting a tag the C# accepted means no update is offered, never a
  bogus one. A test pins the divergence so it stays visible instead of surfacing as a bug report.
- **Case-insensitive marker matching is done length-preservingly, not via `toLowerCase().startsWith()`.**
  The C# matches `OrdinalIgnoreCase` and then slices the **original** phrase by `marker.Length`, which is
  sound only because ordinal folding cannot change a string's length. JS lowercasing can — 'İ' (U+0130)
  becomes two code units — so the obvious translation would let a matched prefix and the slice length
  disagree. Comparing `phrase.slice(0, marker.length).toLowerCase()` keeps every index on the original
  string, and on the inputs where the two could differ at all they agree ('ß' matches "ss" in neither).
- **Survivors are now predicted before the mutation run, not explained after it.** Both harnesses take an
  `expectSurvives` reason per mutation, written before execution, and report unpredicted survivors and
  refuted predictions as separate lines. This changes what a survivor means: an equivalent mutant that
  was named in advance is evidence the code is understood, whereas the same survivor discovered
  afterwards is indistinguishable from a rationalisation. It immediately earned itself — `phrase-wrap`
  produced one **unpredicted** survivor, and it was a genuinely vacuous test rather than an equivalence.
- **An equivalent mutant is now written as an asserted property, not as a paragraph.** The next step past
  predicting survivors: for each of `contrast.ts`'s ten, the equivalence itself is a test that sweeps the
  reachable input space and fails if the property ever stops holding — the ties are unreachable *because*
  no integer triple hits 4.5 or 5.5, and that is swept rather than argued. An explanation in a comment
  decays silently when a constant moves; a swept assertion goes red. The mutation harness's own reason
  strings now point at the test that carries the proof.
- **`ContrastService` was ported even though the feature it serves is `[FOG]` and first on the cut list.**
  Alex's live settings have auto-contrast disabled, so this module may be deleted at Phase 8-9 along with
  the feature. Translating it now was still the cheaper order: the C# oracle harness was already standing
  from the two previous files, and the float-heavy internals are exactly where a rushed later port would
  have missed the rounding rule — which it would have, since the C# suite's own assertions cannot detect
  it. If the feature is cut, `electron/src/core/contrast.ts` and its test go with it.
- **`roundHalfToEven` is a hand-written helper rather than `Math.round`, and the reason is measured.**
  See the Verification row for the counts. This is the single highest-value finding of the Core
  translation so far, because nothing in the C# test suite and nothing in a careful reading of the
  algorithm would have surfaced it — only running both rounding rules over the reachable input space did.
- **`ContrastState` becomes a string union, not a numeric enum.** `"normal"`/`"override"` survive a
  settings round trip and an IPC hop as themselves; `0`/`1` would arrive as untyped numbers on the other
  side of both, and a mis-set default would silently read as a valid state.
- **The C#'s `internal` helpers (`AdjustAccent`, `ColorToHsl`, `HslToColor`) are exported.** They were
  unreachable from the C# tests and so untested there. Exporting them is what lets the port pin the HSL
  round trip directly — verified against the compiled C# over all 16,777,216 colours with zero
  disagreements, which is a stronger statement than the original ever made about itself.
- **Two provably dead guards are kept, with the proof written next to them instead of the guard being
  deleted.** `colorToHsl`'s `denom === 0` check cannot fire (denom is 0 only for pure black and white,
  both of which have `delta === 0` and take the earlier branch — and the C#'s own comment claiming
  otherwise is simply wrong), and the `% 6` on the `max === r` hue arm is the identity there. Both stay so
  the code reads as the canonical conversion, both are documented as unreachable, and both are asserted
  as properties. Same call for `computeDisplayColor`'s redundant exit-guard state test (M5): it cannot
  change an answer, it names which of the two hysteresis rules a reader is looking at, and the comment
  says which mutation proved it and which neighbouring mutation is *not* redundant.

- **A sampled C# assertion is translated as a universal, and this is the rule for the whole phrase side,
  not a one-off.** The C# phrase tests draw one candidate from a random bucket and assert a substring, so
  a *faithful* translation would be flaky by construction: it would pass or fail on the draw. Two ways
  out — seed the picker and assert the one phrase that seed yields, or enumerate the bucket and assert
  the C#'s predicate over every candidate. The second is chosen, because it is what the originals' own
  comments say they mean ("with randomization, check that phrase contains the hour word") and because a
  seeded single-draw test pins an arbitrary implementation detail of the picker. **The guard against
  self-flattery is that the universal is verified against the C#-generated fixture before the test is
  written, never derived from the port's own tables** — five universals, all held, and if one had not, the
  case would have been translated in its sampled form with the failure recorded. **The remaining 250
  phrase cases follow this rule**, so the next unit does not re-litigate it.

- **Test instruments live in `test/support/`, once, as soon as a second suite needs them.** `indexPicker`,
  `enumerateAll` and `wallTime` were local to `phrase-golden.test.ts` and moved out when
  `phrase-engine.test.ts` needed all three. Copying was the alternative and is worse for one specific
  reason: `enumerateAll` asserts *exactly one draw per provider call*, and the port takes a second draw in
  `getStructuredPhrase` on purpose. If that guard drifts in one copy and not the other, the affected suite
  enumerates part of the candidate space and still reports green — the failure mode the guard exists to
  prevent, reintroduced by duplicating the guard.

- **A prediction whose reason names another file is TWO claims, and the second one gets run.** Established on
  M17 in the previous unit and it paid here. E9's prediction was "survives this suite, caught by
  `phrase-engine.test.ts` and `phrase-golden.test.ts`". The verdict was right; the reason was false, and
  running it was the only thing that could show that — both files miss it, because both build providers
  through `makeProvider` and never import `engine.ts`. A survivor filed with an unverified reason is
  indistinguishable from a survivor filed with a true one, and the difference here was a real hole in the
  coordinator's structured-phrase delegation. **So a recorded survivor reason that names a file is not
  finished until that file has been run alone against the mutation.**

- **Where the C# throws and the port cannot usefully throw, the port diverges deliberately and says so.**
  `PhraseEngine.SetLocale(null)` throws `ArgumentNullException` in C# because `Dictionary.TryGetValue(null)`
  does; `engine.ts` returns false and leaves the active locale alone. Not an oversight and not smoothed
  over: the value arrives from settings JSON, whose `locale` field is not type-checked by anything, and the
  C# method's own doc contract is that an unusable locale must leave the clock running. The C# fails its own
  contract for exactly one input. Recorded in the test file, asserted, and listed as the unit's one
  divergence — a divergence that is written down is a decision, and one that is not is a defect waiting to
  be found by someone else.

- **A strengthening computed from the recorded constants is not a strengthening — it has to read the
  implementation.** Both halves of the `SegmentKeyTests` translation were written that way first: the
  same-bucket rows compared `bucketOf(m1)` to `bucketOf(m2)` and the adjacent rows compared
  `bucketOf(m2)` to `bucketOf(m1) + 1`, where `bucketOf` is a lookup into the fixture-measured bounds.
  Both are constant-versus-constant: they check that my recorded table agrees with the C#'s `[DataRow]`,
  which is worth something, and they cannot fail for any provider. Rewritten to locate the run
  *containing* the minute by walking the provider's own output, at which point the mutations that move a
  boundary (M7) or add one (M14) die. **The tell is that the expected value and the measurement come
  from the same place** — a recorded oracle belongs on one side of an assertion, never on both.

- **Where a C# comment states a universal, translate the universal AND its scope — measured, not
  assumed.** `DifferentProviders_SameBucket_DifferentKeys` says “locale prefix prevents cross-provider
  key collision”. Asserting that sentence over all 18 locales would have asserted something false: the
  eight phrase-keyed locales have no prefix, and ja-classic and ja-terse collide on 650 of 1440 minutes.
  The port asserts the guarantee where it holds (the ten prefixed locales) plus the exact collision count
  where it does not. **The exact count is the load-bearing part**: two mutations that abolish phrase-mode
  leave the eight collision-free, and only an exact expectation notices. A softer “sometimes collide”
  passes them, and a port that had “fixed” the collision by prefixing all 18 would have diverged from the
  C# silently while looking more correct.

- **When a unit overlaps a suite that already exists, the mutation run is per-suite and the report names
  the overlap.** `MultilingualPhraseProviderTests` is the first unit where the coverage was mostly already
  there: `phrase-golden.test.ts` sweeps these 8 locales at every minute of the day. A single-suite run
  would have returned 13/13 — true, and an overclaim, because 7 of the 13 die in golden too. Each mutation
  was therefore run against both files separately and reported as a pair, so "what this file adds" is a
  measured 6 rather than an implied 13. The general rule: **a mutation score is only a claim about a
  suite's value if the other suites were given the same mutation.**

- **To measure whether a second oracle origin is worth anything, mutate the source AND regenerate the
  oracle from it.** A fixture-derived expectation cannot catch a bug in the generator that produced the
  fixture — oracle and port agree with each other and are both wrong. So the harness has a *consistent*
  class: apply the mutation, re-derive the segments fixture from the mutated source, then run. Golden is
  green by construction and only genuinely independent expectations object. All 6 consistent mutations
  were caught here and none by golden, which is what makes "the C#'s hand-typed literals are a second
  route" a measurement rather than a plausible-sounding reason to write the file. This also retires the
  temptation to skip a unit as redundant: **redundant against what, and demonstrated how, are the two
  questions, and only the second one is answerable by running something.**
- **A mutation run over an overlapping unit needs THREE columns, not two: mine, golden, and every other
  suite.** The consistent-class decision above was measured with two — mine and golden — and that answers
  "does golden catch it", which is not the question "does anything else catch it". Those come apart in
  practice: of the 10 consistent mutations in the `PhraseStyleProviderTests` run, golden caught none once
  the accidental tripwire was corrected for, but `phrase-engine-coordinator.test.ts` caught one on its own
  split-mode count. Reported as two columns that would have been "10 of 10, mine alone" — an overclaim by
  one, and the one it overclaims is the interesting row, because it is the addition that has a second
  independent expectation behind it. So the third column is **enumerated from disk** (`readdirSync` on
  `test/` minus mine and golden) rather than listed by hand, so a suite added later joins the run instead
  of being silently omitted, and the honest summary is four numbers: mine-only, mine-and-something,
  without-mine, and nothing.
- **A fixture row-count constant is a real tripwire for arity-changing generator bugs, and it is also a
  fact about the FILE — so a consistent-class run has to decide which it is testing.**
  `test/phrase-golden.test.ts:107` asserts `CANDIDATE_ROWS.length === 12984`, and it caught two consistent
  mutations that were predicted green, refuting the prediction. That is genuine strength and it is now
  credited. But it does not catch them by comparing the port against the oracle — it catches them because
  the regenerated file has a different number of lines, and anyone landing a regenerated fixture updates
  that constant in the same commit, because a stale count is a hard failure they cannot miss. So the
  faithful version of an arity-changing consistent mutation **patches the constant too**, and re-run that
  way both mutations put golden green with this file the only objector. The general rule: when a
  consistent mutation dies in the fixture-derived suite, find out *which assertion* killed it before
  accepting the refutation — a constant describing the fixture's shape is not the same evidence as a
  comparison against its contents.
- **A disjunction's arms get measured, because a passing assertion cannot tell a load-bearing arm from a
  dead one.** The C#'s style checks are `terms.Any(t => phrase.Contains(t))` over 14 jive terms, 19 pirate
  terms and 7 Yoda endings, and translating them verbatim would copy in an arm that matches nothing:
  `"ahoy"` has 0 hits in all 730 en-pirate candidates, so the assertion reads identically with it deleted.
  Two other shapes hide in the same place — an arm that only matches candidates another arm already
  matches (10 of pirate's 19, 4 of jive's 14), and a disjunction that looks like hedging but is not
  (nautical alone leaves 195 of 730, pirate alone 243). So each arm's hit count, the dead set and the
  removable set are computed against the C#-generated fixture *before* the file is written, and the
  interesting ones are asserted as exact sets. The payoff is measurable: the mutation that makes `"ahoy"`
  live is caught by nothing else in the repo, because every disjunction stays satisfied and the fixture
  was regenerated. **The same lens found where two C# files disagree** — `PhraseStyleProviderTests` and
  `JivePhraseProviderExpandedTests` write different jive midnight lists, both hold, and only the arm
  analysis says which is tighter. Generalising: when a translated assertion is a disjunction, the arms are
  data to be measured, not a list to be copied.

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
| ISC-9 | **No longer re-runnable on this branch — `probe:sidecar` and the sidecar tree were deleted under Option C. The probe is at `64c747e:electron/scripts/probe-sidecar.ts` and restoring it is a `git checkout 64c747e -- electron/`.** Arms D1..D5 (two `dotnet publish` runs, ~2 min) | **the reading arm is the discriminator** (D2): the WPF original's D-14 posture makes a totally dead temperature source *look* like a machine without sensors, so a sidecar emitting well-formed JSON full of `-1` has a size and a latency that describe nothing. Everything else is reported subject to D2, and it passed on a real GPU value. **Enumerated-vs-absent** (D5) is the distinction the decision turns on and the normal output cannot show: 51 CPU sensors present and all NULL is a driver refusal, 0 motherboard sensors is absent hardware, and both render `-1` — hence a `--dump` mode rather than an inference from the sentinel. **Trim safety compared on behaviour, not on exit status** (D4): a trimmed publish that succeeds and then silently returns sentinels is the actual failure mode, so the two builds are compared on which sources came back live, and the claim is explicitly bounded to this host's hardware because the IL2104 warnings cover exactly the paths it cannot exercise. **Percentiles not a mean** (D3): the question is whether a read can overrun its 2s interval, and a 106.8ms mean hides a 472ms worst case. **Oracle fidelity**: the priority lists and resolution walk are copied from `TemperatureService.cs` rather than redesigned, so a difference in reading is a port defect and not a design variation |
| ISC-8 | `bun electron/scripts/probe-size.ts` from `electron/` — arms C1..C5, after `bun run dist:win` | **containment is the discriminator** (C4): a wrong `files:` glob yields a plausible installer size for a package that launches to nothing, so all six runtime files are verified present *inside* `app.asar` — and the asar header is parsed directly, because a `bunx asar` that is not installed degrades into "no files found", indistinguishable from the failure being tested. **Baseline identity** (C2): both WPF artefacts are re-read off disk and compared to their recorded byte counts, so citing a stale or different `publish/` surfaces as a FAIL instead of silently becoming the baseline — both matched exactly. **Like-for-like denominators**: installer-vs-installer and payload-vs-payload, never one of each, since an installer measured against an uncompressed tree flatters whichever side is compressed; and `publish/` is measured as a tree to confirm the single-file exe *is* the whole WPF payload (3 files, 0.1MB of pdbs beside it) rather than one file out of several. **The split that dates the finding** (C5): the app is 0.009% of the payload, so the ratio is a floor that improves for Electron as the port fills in — without it, today's 1.40× would be quoted at Phase 9 as though it were static |
| ISC-10 (macOS half only) | `mcp__mac-codex__codex` against an Apple M1, macOS 26.6.2 arm64, Electron pinned to 33.4.11. **Not re-runnable from this machine** — it needs that dispatch and a host with the same TCC state. Four scripts and four fixture captures in a `mktemp -d`; arms M1..M7 | **the render gate is the discriminator, and it comes first** (M1): a transparent frameless window that loaded nothing is visually identical to a working overlay and *cheaper*, so 578 rAF paints acknowledged from inside the renderer plus zero `did-fail-load` is what licenses every arm after it. **Readback off the live window, never off the source** (M2) — and the readback itself found two typings-implied APIs (`getAlwaysOnTopLevel`, `getActivationPolicy`) that **do not exist at runtime**, which is exactly the class of error a source-reading probe cannot produce. **External corroboration for the two claims a process cannot make about itself** (M3/M4): LaunchServices `ApplicationType="UIElement"` and a separate Swift binary reading `NSRunningApplication.activationPolicy == .accessory`, rather than trusting `app.dock.isVisible()`, which is the process agreeing with itself. **Policy and UI are split, not merged** (M4): the accessory policy is `[MEASURED]`, the Cmd-Tab switcher is `[INCONCLUSIVE]`, because `screencapture -x` is TCC-denied on that host — three arms (M4b, M5, M6) are reported unproven for that one reason rather than inferred from the mechanism. **Positive control on the telemetry** (M7): 1.25% idle vs 26.73% with one core deliberately busy, so a collapsed pipeline returning near-zero for everything cannot pass. **Counter-case that reversed a plan row**: `os.freemem()` was cross-read against `vm_stat` on the same snapshot and disagreed 3.1%-free vs 69.14%-occupied — a single-source read would have shipped a memory cell showing 97% used on an idle Mac. **A refuted absence**: `powermetrics` was confirmed root-only *and* an unprivileged `ioreg` path was found anyway, so "no source exists" was tested rather than concluded from the documented one failing |
| ISC-13 (the oracle half) | `dotnet run` on `tools/GoldenGen` (Release), then re-run and compare hashes. Writes `electron/test/fixtures/phrase-golden-{segments,candidates}.tsv`. Exit 0 means every internal check passed; exit 1 prints the problems and still writes the files | **byte-identical reruns are the discriminator, and they are the only available evidence of completeness** — the candidate sets are collected by sampling a random provider to saturation, so the question that decides whether this oracle is worth anything is whether saturation happened. Two independent runs produced identical bytes (`66ba906040fe15c45d6378a63ccf7466` candidates, `fa810b263d2805d13acbc9d7abd009bb` segments, second run verified via `md5sum -c`); a short set would have differed between runs. **Denominator from the source, values from the provider**: reflection reads each bucket's declared candidate count and every bucket saturated to *exactly* it, which is simultaneously the saturation proof and a check that no table holds a duplicate or unreachable candidate. **The grouping hypothesis is tested, not assumed**: every `(segment key, hour12)` group must agree across all 1440 minutes, so a wrong hour formula fails loudly instead of silently dropping the minutes that disagreed. **Positive control on the registry read**: all 18 reflected locales are fed back through the public `SetLocale`, *and* a bogus locale must be rejected — without the second half, a `SetLocale` that returned true for everything would make the first half vacuous. **Determinism claimed for the 8 single-template locales is measured**: 200 draws per minute per locale, each yielding one distinct value equal to its own segment key, rather than read off the source. **Hand-derivation cross-check**: `en-classic:0` hour 3 was derived by hand from `EnglishPhraseProvider.cs` and matched the file's 5 phrases and 5 structured pairs exactly. **Bounded**: this row covers the oracle only — no TypeScript has been compared against it, which is why ISC-13 is `[~]` |
| ISC-13 (the port half) | `bun test` (96 pass / 0 fail) and `bun run typecheck` (exit 0), then `bun $TEMP/fc-mutate.ts` — twelve injected defects, each applied to one file, suite run, file restored from an in-memory copy in a `finally` | **the mutation run is the evidence; the green run is only its precondition.** 44 assertions over 38,904 fixture rows, written by the same hand as the port, prove nothing until they can be made to fail — so all twelve defects were injected and all twelve turn the suite red, each naming a plausible test. **Every anchor is uniqueness-checked**: a mutation whose search string does not appear exactly once is reported `SKIP` and counted as a survivor, so a typo in the harness cannot read as a pass. **The suite's own instruments are guarded rather than trusted**: the fixture parse requires the exact field count on every row (a ragged row is how a comparison reports "0 mismatches" over 0 rows) and rejects CR; `at(hour, minute)` asserts its own round-trip, so a host whose zone shifted on the chosen date fails by name instead of mismatching every phrase; `enumerateAll` asserts exactly one draw per provider call, since the port takes a second draw in `getStructuredPhrase` by design and index enumeration would silently cover half the space if that became two. **The denominator is asserted, not assumed**: each locale's sweep ends `expect(checked).toBe(1440)`, and the PENDING/extra sets must both be empty — a suite iterating only over what it had ported would report all-green on a port of one locale. **Two independently generated artifacts are made to agree on which locales draw**: GoldenGen decided by redrawing each minute and watching the phrase move, TableExport by the C# field's static type, and the test asserts the two sets are the same 10. **Bounded**: `PhraseWrapService` and the display-side formatting are outside this, so ISC-13's green says nothing about how a phrase is wrapped or rendered — that stays with ISC-11/ISC-12 |

| ISC-11 / ISC-12 (the four small logic files) | `bun test` (137 pass / 0 fail) and `bun run typecheck` (exit 0) from `electron/`; the denominator from `dotnet test FuzzyClock.Core.Tests` (469 pass) with per-class counts out of a TRX parse; then `bun $TEMP/fc-mutate-core.ts` — eight injected defects, uniqueness-checked anchors, `finally` restore | **the C# expectations are the oracle and they were measured on this host, not assumed**: `DateFormatterTests` asserts "Sat, Mar 7" and it passes under en-AU, so the strings the port is held to are what the original actually produces where it runs. **Mutation, 8/8 caught** — floor-for-trunc on the uptime minutes, days shown at zero, the hour hand's interpolation term dropped, the minute hand off by a factor, the month index off by one, ISO losing its zero padding, `Short` delegating its order to the locale, one wrong seven-segment mask. **The order assertion is a counter-case, not a value check**: `formatDate("Short", …, "en-AU")` must *differ* from `Intl`'s whole-date output for the same locale, which is the only assertion that fails for a port that reorders — every value assertion passes on an en-US box. **The mask table is transcribed, not imported**: comparing the module's own table to itself would pass for any table, and `SUPPORTED_CHARACTERS` is asserted equal to the transcribed list so a row added without a test row fails. **A survivor produced a doc fix, not a test patch** — see § Changelog. **Bounded**: `bun test` green says nothing about what the panel *shows*; the renderer now calls both ports, and the evidence for that is a 12s launch reaching `PROBE-PAINTS 9` with no `did-fail-load`, which proves the module loaded and rendered, not that the glyphs are right |
| ISC-11 / ISC-12 (`update-version.ts`, `phrase-wrap.ts`) | `bun test` (208 pass / 0 fail), `bun run typecheck` (exit 0), `bun run build` (exit 0) from `electron/`; the C# oracle from `$TEMP/fc-verprobe` (`dotnet run -- version` and `-- phrases`, which `<Compile Include>`s the real `UpdateVersionComparer.cs` and `PhraseWrapService.cs`); then `bun $TEMP/fc-mutate-uvc.ts` (19 mutations) and `bun $TEMP/fc-mutate-wrap.ts` (18) | **the added expectations are recorded C# output, not my reading of the algorithm** — the probe is what established the `int.MaxValue` ceiling on all four components, .NET accepting `"4. 5"` as 4.5, and the two `PhraseWrapService` branches its own suite never reaches (a marker that consumes the whole phrase; two boundaries equidistant from the midpoint). **Mutation: 17/19 and 15/18 caught, and the survivors were named BEFORE the run with their reasons** — that is the change from the previous row, where the survivor was a discovery. Predicted: the `-`/`+` guard and the empty-after-trim check in `parseTag` (both subsumed by the shape regex), the `trimEnd()`/`marker.length - 1` pair in `splitNatural`, and the dead `best = 0` initializer. None of the four predictions was refuted and no unpredicted survivor appeared in the second run. **The masked pair is measured as a pair**: `trimEnd()` and the `-1` do the same job, so each survives alone while removing BOTH is caught — reporting the two solo survivors without that third mutation would describe the suite as weaker than it is. **One vacuous assertion was found and replaced**: the case-insensitivity test used "HALF PAST ELEVEN", whose midpoint fallback returns the same two lines as its marker split, so a case-*sensitive* implementation passed it; the replacement uses "ALMOST A QUARTER BEFORE TWELVE", where the two paths disagree (measured), and it also pins the midpoint answer it must not be. **Bounded**: neither module is imported by anything yet, so these greens say nothing about wiring — that evidence belongs to ISC-27 (update check) and Phase 4 (wrapping) |
| ISC-11 / ISC-12 (`contrast.ts`) | `bun test` (289 pass / 0 fail / 154,574 expect() across 10 files), `bun run typecheck` (exit 0), `bun run build` (exit 0) from `electron/`; the C# oracle at `$TEMP/fc-verprobe` extended with `Contrast.cs` and `dotnet run -c Release -- contrast`, which `<Compile Include>`s the real `ContrastService.cs`; then `bun $TEMP/fc-mutate-contrast.ts` (48 mutations) | **the rounding divergence is the discriminator, and it is quantified rather than noted**: C# `Math.Round` is half-to-even and JS `Math.round` is not, and a lightness step of 5 units is 12.75/255, so channel values land on `x.5` constantly. Measured over exactly the inputs `adjustAccent` generates — **215 of 4,096** grey-axis calls and **44,017 of 4,194,304** cube calls round differently, and it reaches the *output*: on a white background **4,807 of 262,144** accents get a different adjusted colour (`0,0,128` → `0,0,102` here vs `0,0,103` under `Math.round`). A port that used `Math.round` would have been green on any test written from the algorithm. **The C# suite could not have supplied these values**: it asserts only that the override colour *differs* from the accent and clears 4.5, and its hysteresis-retain test discards the colour entirely (`var (_, newState)`), so every override colour in the port's tests is a recorded C# output. **Two coverage gaps were closed by reasoning before mutating, not after**: nothing exercised `linearize`'s linear arm (needs a channel ≤ 10) and nothing reached `clamp` (needs a first-step overshoot); both were measured against the C# and asserted, so the mutation run did not have to find them. **Mutation: 38/48 caught, 0 skipped, all ten survivors predicted with their reasons.** Four are exact-threshold ties unreachable at 8-bit precision, and the rest are the `% 6` no-op, the dead `denom === 0` guard, the `0.04045` boundary, the fallback tie-break, hue-arm continuity at 60, and M5. **Every equivalence is an asserted swept property, not an excuse** — a `describe("the branches that provably cannot be told apart")` block that goes red if any of those properties ever stops holding, which is the change from the previous row, where an equivalent mutant produced a documentation fix. **M5 was found unpredicted and promoted rather than quietly rationalised**: dropping `&& currentState === "override"` from the exit guard survived, and analysis showed it *cannot* change an answer (a ratio above 5.5 is above 4.5, so the next guard returns the identical pair) — the same test in the guard below is caught (M7), which is what distinguishes redundancy from a hole. **Positive control on the rounding helper**, so `roundHalfToEven` is pinned to disagree with `Math.round` on a case that reaches a colour. **Bounded**: this module has no caller, and it serves a feature that may be cut — see Decisions |
| ISC-11 / ISC-12 (`PhraseEngineTests` + `GetStructuredPhraseTests`, 68 cases) | `bun test` (360 pass / 0 fail / 174,135 expect() across 11 files), `bun run typecheck` (exit 0), `bun run build` (exit 0) from `electron/`; then `bun $TEMP/fc-mutate-engine.ts` — 28 mutations across `factories.ts`, `types.ts` and `tables.generated.ts`, **with `test/phrase-engine.test.ts` as the ONLY suite**; then `bun $TEMP/fc-mutate-engine-full.ts` for the two that survived everything | **the suite was deliberately narrowed, because the wide run would have flattered it.** This layer already passed a 12-defect run under ISC-13 with the golden fixture in play, so a full-suite mutation run measures the fixture and says nothing about the 68 new cases. Withholding it asks the only question worth asking: **22/28 caught by these cases alone, 0 skipped, 6 survivors, all 6 predicted with reasons written beforehand, 0 refuted.** **Every sampled C# assertion is translated as a universal, and the strengthening is a recorded property of the original rather than an improvement invented by the port**: the C# draws one candidate from a random bucket and asserts a substring — its own comments say "with randomization, check that phrase contains the hour word", a claim about *every* candidate that the original can only sample. All five such universals were checked against the C#-generated fixture **before** any test was written, and all five hold. **The strengthening is quantified, and it is uniform**: an arity probe over all 146 en-classic buckets (12 buckets × 12 hours + noon + midnight) returns exactly 5 everywhere, so each translated case is a 5× tightening and provably non-vacuous — asserted as `expect([...arities]).toEqual([5])` rather than left as a measurement, so a bucket that lost a candidate fails there instead of quietly weakening 68 assertions (mutation M25 confirms it fails). **The mutation that justifies the whole design is M23**: one candidate in the :45 bucket changed from `{h1}` to `{h}`. The universal catches it every time; the C#'s sampled form catches it one time in five. **Each survivor was chased to the file that does catch it, rather than filed as a boundary and left**: M15/M16 (trailing space in the qualifier — the C# asserts only non-emptiness) and M22 (the ordinal `{ho}` index, dead for en-classic) and M28 (noon/midnight segment-key swap — no C# class in this file asserts a key) are caught by `phrase-golden.test.ts`; M17 (the `oClockTemplate` branch) is caught by `phrase-factories.test.ts:96`, which is the *predicted* file, verified by running that file alone. **One mutation in 28 survives the entire suite, and it is proved to be a no-op rather than reported as a gap**: reversing `resolve`'s substitution order. None of `{h}`, `{h1}`, `{ho}` is a substring of another, so no substitution can create or destroy a later one's match and all orderings agree on every input — a true equivalent mutant, and the finding upgraded `resolve`'s comment from an implied constraint to a measured faithfulness note. **A derived assertion was replaced by a measured one**: the o'clock qualifier-split addition first asserted `2 × 33` empty against `2 × 22` non-empty, arithmetic off a fixture total that a reader would have to redo; measuring per hour12 gave a uniform 3-empty / 2-non-empty, which is what it now asserts, and mutation M18 shows that addition is the only thing catching a non-empty fallback. **Shared instruments were extracted, not copied**: `indexPicker`/`enumerateAll`/`wallTime` moved to `test/support/picker.ts`, because `enumerateAll`'s "exactly one draw per provider call" guard is load-bearing for both suites and two copies drift in exactly the direction that makes an enumeration silently partial. **Bounded**: en-classic only. The other 17 locales are touched by one addition asserting the absence of `" 0"`, which is why M22 survives — the eight locale-provider classes and the three segment-key classes are still untranslated |
| ISC-11 / ISC-12 (`PhraseEngineCoordinatorTests`, 17 cases) | `bun test` (386 pass / 0 fail / 174,384 expect() across 12 files), `bun run typecheck` (exit 0), `bun run build` (exit 0) from `electron/`; the C# oracle from `$TEMP/fc-verprobe` extended with a `coordinator` mode whose csproj now `<Compile Include>`s **all 28 `FuzzyClock.Core/*.cs` files** as a glob; then `bun $TEMP/fc-mutate-coordinator.ts` — 17 mutations across `engine.ts` and `tables.generated.ts`, **with `test/phrase-engine-coordinator.test.ts` as the ONLY suite** | **`engine.ts` had ZERO coverage before this unit — nothing in the suite imported it.** So unlike the previous row there was no fixture to withhold: the narrowed run is the only run there is. **Mutation: 16/17 caught, 0 skipped, 1 survivor, predicted** (the constructor's missing-spec guard, unreachable while all 18 `LOCALES` have a spec). **The C#'s test-isolation machinery has no counterpart, and that is what makes two cases mean what their names say.** `[DoNotParallelize]` and a `[TestCleanup]` calling `SetLocale("en-classic")` exist only because `PhraseEngine` is a static class; the port's engine is instantiable, so every test builds a fresh one. `DefaultLocale_IsEnClassic` carries a comment conceding it checks its own cleanup rather than the startup default — the probe reads `CurrentLocale` as the first statement in the process and confirms `en-classic`, so the port asserts the real thing. **The two rejection cases are strengthened from an assertion that cannot fail into one that can**: both C# methods assert `CurrentLocale == "en-classic"` after a rejected key, which the cleanup already guaranteed, so "unchanged" and "silently reset to the default" are indistinguishable there. Each port case enters from `fr` instead. The probe confirmed the C# behaves that way — all 34 rejected keys entered from `fr` returned false and read `fr` back — and **mutation E1 is the proof the strengthening is not just words**: a `setLocale` that resets to the default on rejection dies here and passes the C# file untouched. **Non-empty became exact equality, because the probe made it possible**: the four `GetPhrase_Ja*_ReturnsNonEmpty` cases assert only `IsNullOrWhiteSpace == false`, but all four ja-* locales declare one template per bucket, so 03:30 is deterministic and the exact strings were recorded (`三時半`, `時の折り返し、三時の半ば`, `やっと三時半じゃないか`). Each case asserts `arity === 1` alongside, so a locale that gained a second template fails loudly instead of quietly turning an exact check into a 1-in-2 sample — the arity is also why `everyCandidateContains` (which requires more than one candidate) is the wrong instrument here. **The delegation case is enumerated, not sampled**: the probe drew 20000 times through the coordinator and saw exactly 5 distinct strings, which are the oracle, and mutation E15 (one candidate removed from the 03:30 bucket) confirms the set assertion catches what a 1-in-5 sample misses four times in five. **A survivor whose REASON was wrong is the finding of this unit, and it was found only because a prediction naming a file was run against that file.** E9 — hard-wiring delegate mode into the coordinator, `getStructuredPhrase` rebuilt as `("", getPhrase(dt))` — was predicted to survive here and to be caught by `phrase-engine.test.ts` and `phrase-golden.test.ts`. Both miss it, and so does the full suite: those files build providers through `makeProvider` and never import `engine.ts`, so **nothing anywhere read split-mode structured output through the coordinator**. Right verdict, wrong reason, and the wrong reason was a real gap — closed by an 18-locale delegation test that counts the two split-mode locales (`expect(splitSeen).toBe(2)`), so the comparison cannot go vacuous if a qualifier ever stops appearing at 03:30. **One gap was closed by reasoning before mutating**: `currentLocale` is a string field, so the default case proves only that the label reads `en-classic` — a constructor setting the label and the wrong provider passes it and every other test, since they all call `setLocale` first. The fresh-engine phrase read was written for that, and E8 confirms it is what catches it. **One deliberate divergence, measured rather than discovered later**: `SetLocale(null)` throws `ArgumentNullException` in the C# (`Dictionary.TryGetValue(null)`), where the port returns false and leaves the locale alone. Null reaches this method from settings JSON, whose `locale` field nothing type-checks, so the port honours the contract the C# method's own callers depend on and the C# does not. **Recorded and not asserted where the guarantee does not exist**: `locales` hands back `LOCALES` by reference and `as const` freezes nothing, so the test pins `toBe(LOCALES)` and `Object.isFrozen === false` rather than claiming an immutability the getter does not provide. **Case-sensitivity and whitespace are pinned though no C# test covers them** — 14 rejects measured on the C# side — because a well-meant `locale.trim().toLowerCase()` would be a silent behaviour change (E5/E6 both die). **Bounded**: this is the coordinator's registry and switch only. The 287 remaining cases are the per-locale providers and the segment-key classes, and nothing here says anything about what any locale emits away from 03:30 |
| ISC-11 / ISC-12 (`SegmentKeyTests`, 37 cases over 4 classes) | `bun test` (430 pass / 0 fail / 181,832 expect() across 13 files), `bun run typecheck` (exit 0), `bun run build` (exit 0) from `electron/`; the C# oracle read out of `test/fixtures/phrase-golden-segments.tsv`, which tools/GoldenGen produced from the compiled providers — 25,920 rows, 18 locales × 1440 minutes; then `bun $TEMP/fc-mutate-segkey.ts` — 15 mutations across `factories.ts`, `specs.ts` and `tables.generated.ts`, **with `test/segment-key.test.ts` as the ONLY suite** | **The C# comments state a partition the C# assertions never check, and closing that gap is the whole unit.** Every `[DataRow]` carries a comment naming the buckets it exercises (`// bucket 0 (<=2) vs bucket 1 (<=7)`) while the assertion asks only whether two keys differ — so a provider that returned a different key every minute passes all 16 `AdjacentBuckets` rows across the four classes, and a provider whose boundaries all moved passes them too. **Mutation proves both**: M1 (the key carries the minute instead of the bucket index) and M7 (`bucketIndex` shifted to an exclusive bound, moving every boundary in every locale) are exactly those two defects, and they die here only on the run-structure addition and on each translated row's ends-at/starts-at pair. **Mutation: 14/15 caught, 0 skipped, 1 survivor, predicted with its reason written beforehand** — replacing `bucketIndex`'s no-match `throw` with a fallback, unreachable because `makeProvider` checks bucket coverage at construction. 0 unpredicted, 0 refuted, restore byte-identical. **The bounds are measured off the C#, not read off the port**, and the measurement found the exception the port would otherwise have tripped over: nine of the ten bucket-keyed locales partition the hour at `2 7 12 17 22 27 32 37 42 47 52 59`, and **en-terse at `2 7 12 17 22 32 37 42 47 52 59` — 11 buckets, no separate “almost half past”, 23-32 as one span**. The C# knows and never says so in words: `TerseSegmentKeyTests` is the only class whose bucket-5-vs-6 row reads `[DataRow(3, 32, 3, 33)]` where the other three use `(3, 27, 3, 28)`. **M14 is why that is an addition and not a footnote**: giving en-terse the 12th bucket the other nine have is invisible to every translated row *including its own*, because 32/33 straddles a boundary either way — only the run-structure and 11-bucket additions see it. **The run structure is identical across all 22 ordinary hours of all ten locales (measured), so the C#'s single hour is the whole day** — asserted for every hour rather than argued, since that is the claim the translation rests on. **One C# claim is true only where it is tested, and the port records the scope rather than inheriting the sentence.** `DifferentProviders_SameBucket_DifferentKeys` comments “Ensures locale prefix prevents cross-provider key collision”, and the eight phrase-keyed locales have no prefix: measured over the fixture, **ja-classic and ja-terse return an identical segment key on exactly 650 of 1440 minutes**, and no other pair of the 18 collides anywhere. So the universal asserted is “no collision among the ten prefixed locales” plus that exact count — and the count is what makes it a measurement: M8 (phrase-mode killed, all 18 keying on the bucket index) and M9 (phrase-mode returning the locale name) both leave the eight collision-free, so `{}` fails against `{ja-classic <-> ja-terse: 650}`, where a test saying “they sometimes collide” would have passed both. **A first draft of both strengthenings was vacuous and was rewritten before the run, not after** — they compared `bucketOf(m2)` to `bucketOf(m1) + 1`, both computed from the recorded constants, so the assertion checked my table against the DataRow and never touched the provider. Both now locate the run *containing* the minute by reading the provider, which is also why M14 and M7 die. **The port's `segmentKeyMode` is checked against the C# rather than supplying its own answer**: the ten bucket-keyed locales are listed from the fixture and asserted equal to the set `SPECS` declares (M12 dies). **The special-minute exception is asserted as an exception**: nine locales end `:midnight`, en-poetic ends `:witching`, and the test names en-poetic as the only one (M11 dies). **Bounded**: segment keys only, and only the ten bucket-keyed locales structurally — the eight phrase-keyed ones are covered here just by the collision census and the within-minute stability sweep. Nothing here says what any locale's phrase *text* is; that is ISC-13's fixture and the 250 remaining cases |
| ISC-11 / ISC-12 (`MultilingualPhraseProviderTests`, 128 cases over 8 classes) | `bun test` (564 pass / 0 fail / 182,233 expect() across 14 files), `bun run typecheck` (exit 0), `bun run build` (exit 0) from `electron/`; then `bun $TEMP/fc-mutate-multilingual.ts` — 13 mutations across `specs.ts` and `tables.generated.ts`, each run against **`test/multilingual.test.ts` AND `test/phrase-golden.test.ts` separately**, plus an invisible-character sweep (0 hits, positive control finds its 3) | **This unit OVERLAPS an existing suite, so "13 of 13 caught" would have been a misleading number, and the experiment was designed around that instead of reporting it.** `phrase-golden.test.ts` already sweeps all 1440 minutes of all 18 locales against the generated fixture and already asserts the structured phrase is `("", <segment key>)` at every minute of exactly these 8 locales — so of the C#'s 128 cases, the 104 `AllBuckets_ReturnNonEmpty` rows and all 8 `GetStructuredPhrase` cases are **subsumed**, and saying otherwise would have been the claim to check. The question asked instead: which defects does this file catch that golden does not? **Two classes, both predicted before the run. 7 PORT-ONLY mutations (source changed, fixtures untouched): all 7 caught by BOTH — that is the overlap, measured. 6 CONSISTENT mutations (source changed AND the segments fixture regenerated from the mutated source): all 6 GREEN under golden and all 6 caught here.** 0 refuted, 0 caught by golden only, 0 caught by neither, restore byte-identical, both baselines green after. **So the contribution is not coverage, it is a second origin — and the port already rests on that argument without having tested it.** `specs.ts:36-38` says the fixture "arrived by an entirely different route" and that had TableExport harvested the literals by sampling too, "both sides would share one origin and the check would be worth nothing"; the consistent class is that sentence's failure mode made real, since a tools/GoldenGen bug leaves oracle and port agreeing with each other and both wrong. The 16 noon/midnight expectations are **hand-typed literals in the C# test file**, and all 16 agree with the fixture — that agreement is the finding, and these assertions are what stops it lapsing. **The six survivors-of-golden name what each addition is for**: fr's noon and ja-rude's noon (the bare literals), de's bucket 4 and pl's bucket 6 (which is what makes transcribing the 104 probe values earn its place rather than being decoration — only the minute-20 and minute-30 rows object, and pl's is shared with the structured case whose emphasis is that same string), es's midnight set equal to a bucket phrase (the no-collision addition), and ja-rude's bucket 11 (the census, the localisation and the probe count together). **The 104 `IsNullOrEmpty == false` rows became exact equalities, and the premise is asserted rather than assumed**: all 8 locales carry exactly one template in each of 12 buckets, so `03:15 -> "et quart trois heures"` is a fact about the locale and not one of five candidates. **That arity addition is recorded as OVERLAPPING, not new** — golden already checks it at all 1440 minutes by instrumenting the picker (`ctl.lastLength !== 1`), which the port-only arity mutation confirms; kept because it is the stated premise of 104 equalities and argues behaviourally rather than by instrumentation. Worth naming: golden catches that mutation through the instrument and *not* through any phrase comparison, because it draws with `indexPicker` and always takes candidate 0. **One locale's table repeats itself, and the mechanism is asserted rather than left as a count**: ja-rude has 134 distinct phrases a day where the other seven have 146 (12 buckets × 12 hour-words + noon + midnight), because buckets 8 (38-42) and 11 (53-59) share the single template `早く{h1}になれ` — localised to `[8,11]` in all 22 ordinary hours, so a failure names the cause. **The C#'s own probe set sees it**: minutes 40 and 55 return the same string, making ja-rude the only class whose 13 rows yield 12 distinct phrases rather than 13, which is also the honest measure of what the sampled row set is worth. **The `[TestCleanup]` does not translate, and that is asserted as a design property.** Every C# class ends `[TestCleanup] ResetLocale() => PhraseEngine.SetLocale("en-classic")` — a static call, so its tests share one mutable locale and must undo it. The port's locale is per-`PhraseEngine`-instance and providers never consult the engine (`makeProvider` closes over its own spec), so a test asserts that switching an engine through all 8 locales cannot change what a provider obtained earlier returns — which is the property that lets these 128 cases run in any order with no cleanup. **The C# file's own doc comment is stale and was not inherited**: it says "the five new multilingual phrase providers. Four test methods per language (20 total)" where the file holds 8 classes and 128 cases. **One C# method name is a typo and is preserved verbatim** — `Polish_Midnight_ReturnPolnoc`, "Return" not "Returns" — so the two files grep alike. **Bounded**: these 8 locales only, and phrase *text* only. Nothing here touches the 10 drawing locales, the segment-key partition (ISC-13 and the `SegmentKeyTests` row above), or how a phrase is wrapped or rendered. The 122 remaining cases are `PhraseStyleProviderTests` and the five expanded per-style files |
| ISC-11 / ISC-12 (`PhraseStyleProviderTests`, 64 cases over 9 classes) | `bun test` (635 pass / 0 fail / 184,732 expect() across 15 files), `bun run typecheck` (exit 0), `bun run build` (exit 0) from `electron/`; the C# oracle read out of `test/fixtures/phrase-golden-candidates.tsv`, tools/GoldenGen's output from the compiled providers; then `bun $TEMP/fc-mutate-style.ts` — 18 mutations across `specs.ts` and `tables.generated.ts`, each run against **three targets separately: `test/phrase-style.test.ts`, `test/phrase-golden.test.ts`, and every other suite in `test/`**; then `bun $TEMP/fc-mutate-style2.ts` to chase the three refuted predictions | **The overlap here is near-total, and the run was built around that fact rather than reporting it afterwards.** Golden already walks all 1440 minutes of these nine locales, compares the port's complete candidate set against the fixture in **both** kinds, and asserts arity equals the oracle's — so every string in this unit is subsumed and a bare "18 of 18 caught" would have been the claim to check. **Three columns, which is the advance over the multilingual run's two**: "golden does not catch it" is not the same claim as "nothing else catches it", and that run only asked the first. The third column is enumerated from disk (`readdirSync` minus mine and golden, 13 suites) so a new test file joins the run instead of being silently skipped. **8 PORT-ONLY mutations (source mutated, fixtures untouched): all 8 caught by mine AND by golden — that is the overlap, measured rather than asserted. 10 CONSISTENT mutations (source mutated AND the candidates fixture regenerated from the mutated source): all 10 caught by mine, 9 of them by this file ALONE.** 0 caught by nothing, 0 caught without mine, restore byte-identical, all three baselines green after. **The consistent class is the only one that can answer the question this file exists to answer, and it needs an instrument proven before it is trusted.** `$TEMP/fc-regen-candidates.ts` rebuilds every row from scratch — not in place, because a mutation can change a bucket's candidate *count* — and `--verify` requires byte-identity with the checked-in fixture when no mutation is applied: **`IDENTICAL -- 12984 data rows, 12 comment lines, 819595 bytes`**, which also established empirically that GoldenGen sorted values by plain UTF-16 ordinal. The harness refuses to start unless that check passes, and it earned its place: the first two runs printed `DIFFERS`, because `hour12Of` takes an hour number and I handed it a `Date`, so `% 12` reduced the epoch millisecond count and every hour collapsed into one cell. Without the gate the whole consistent column would have been measured against a wrong oracle and every verdict in it would have meant nothing. **Three predictions were refuted, and all three were chased rather than filed.** **C7 and C10 were predicted green under golden and were CAUGHT — and the mechanism is worth carrying**: `test/phrase-golden.test.ts:107` asserts `CANDIDATE_ROWS.length === 12984`, a fact about the FIXTURE FILE rather than a comparison between port and oracle, so any arity-changing generator bug trips it. That is a real strength of golden and I had not credited it. It is also a constant that whoever lands a regenerated fixture updates in the same commit, since a stale row count is a hard failure they cannot miss — which is exactly the scenario the consistent class models. **Re-run as C7b/C10b with the count corrected to the regenerated file's real row count (12,960 and 12,986), as a genuine fixture landing would: golden GREEN, mine the only objector.** C7b fails four of my tests (Rude on-the-hour, Rude structured, the arity table, the bucket-0 asymmetry addition); C10b fails two (the Dwarf noon literal, the arity table). **N8 (en-yoda's `declaredShape` flipped to `template`) was predicted to die in some third suite and does not** — an attribution run over the failing test names puts it on exactly one assertion here, *"these nine plus en-classic are exactly the locales the tables declare as drawing"*, so the coverage denominator has mutation coverage of its own and nothing but golden checks shape alignment. **The one consistent mutation with a second independent objector is named rather than absorbed into a total**: en-poetic dropping to `delegate` is also caught by `phrase-engine-coordinator.test.ts`, which counts exactly two split-mode locales. **What this file adds is a second ORACLE ORIGIN, not coverage — now measured instead of argued.** `specs.ts:36-38` already rests on the claim that a shared origin makes a check worth nothing; the consistent class is that sentence's failure mode made real. 8 exact literals, 6 vocabulary disjunctions and the hour-word claims are hand-typed in the C# test file, where every other expectation in this port descends from GoldenGen walking the compiled providers. **All 64 sampled C# assertions are translated as UNIVERSALS over every candidate, each checked against the C#-generated fixture BEFORE it was written**, with exact arity asserted alongside so the tightening cannot go vacuous. The C#'s own comment — "With randomization, we check for patterns, not exact text" — is a claim about every candidate that one draw can only sample; these buckets hold 4 or 5, so each case was a 1-in-4 or 1-in-5 sample of its own meaning. **The C# assertion FORM tracks the table, and no generated oracle can state that**: all four classes using `AreEqual` on a special have specialArity 1, all three using a `Contains \|\| Contains` disjunction have specialArity 5, and the two classes that test no special are one of each (en-terse 5, en-rude 1) — so the exact literals are not a stylistic choice, and C10b is what proves that assertion earns its place. **Two C# claims are true only at the hour they sample, and both are recorded as exact maps rather than quietly generalised.** `Terse_HalfHour_ReturnsBritishHalf` asserts 3:30 contains "four" and not "three"; over all 24 hours the positive half holds 120/120 and the negative half holds as a WORD, but the C# wrote a substring test and at 1:30 en-terse can emit "gone half two" — "gone" contains "one" — so the substring form's counterexamples are pinned as the exact two-entry list. `Shakespeare_OnTheHour_ContainsHourWord`'s comment ("'fourth' is also a match since it contains 'four'") is a coincidence of hour 4: three of that bucket's four candidates use the ordinal `{ho}`, and only six of the twelve ordinals contain their cardinal, so the hit rate is asserted as the map `1:1/4 2:1/4 3:1/4 4:4/4 5:1/4 6:4/4 7:4/4 8:4/4 9:1/4 10:4/4 11:4/4 12:1/4` — read at minute 1, since 12:00 and 0:00 are specials — and C9 confirms it is the only assertion anywhere pinning the ordinal/cardinal split. **One candidate addition was measured and REJECTED rather than shipped as plausible**: "all candidates in a bucket agree on which hour word they name" is FALSE — every one of the nine has buckets mixing current-only, next-only, both and neither. **Facts another suite already owns are used as inputs and not re-claimed**: `segment-key.test.ts` asserts en-terse's eleven buckets and en-poetic's `:witching` key, so this file states neither. **Bounded**: these nine drawing locales, phrase and structured TEXT and arity only. Nothing here touches wrapping, rendering, or the bucket partition. The 58 remaining ISC-12 cases are the five expanded per-style files |
| ISC-11 / ISC-12 (the five `*PhraseProviderExpandedTests`, 58 cases over 5 classes — **the translation queue closes here**) | `bun test` (700 pass / 0 fail / 185,894 expect() across 16 files), `bun run typecheck` (exit 0), `bun run build` (exit 0) from `electron/`; the C# oracle read out of `test/fixtures/phrase-golden-candidates.tsv`, which tools/GoldenGen produced from the compiled providers; oracle pre-check `bun $TEMP/fc-expanded-oracle.ts` (ten sections, every universal against the fixture before it was written) and arm analysis `bun $TEMP/fc-expanded-arms.ts`; then `bun $TEMP/fc-mutate-expanded.ts` — **23 mutations, 14 of them CONSISTENT**, across `tables.generated.ts` and `specs.ts`, in the three columns MINE / GOLDEN / OTHERS with OTHERS enumerated from disk (14 suites) | **This is the unit where the oracle cannot help, and mutation says so in a number: 13 of 23 caught by this file ALONE, 10 by it and golden together, 0 caught without it, 0 caught by nothing, 0 predictions refuted, restore byte-identical.** Nine port-only mutations establish the overlap by measurement — golden caught all nine, as predicted, because it compares the port against the C#-generated file. The other fourteen are CONSISTENT: source mutated *and* the fixture regenerated from the mutated source, which is what a GoldenGen bug looks like — oracle and port agreeing with each other and both wrong. **Golden went green on all fourteen and this file caught all fourteen**, and that is the unit's entire justification: its five word lists and two shape rules are claims about *register*, not about text any reflection pass can harvest. No generated fixture can state "no en-yoda phrase opens with an SVO subject-verb" or "every en-jive phrase carries one of fourteen jive terms" — the same argument `specs.ts:36-38` makes one layer up. The regenerator is proven before use: `--verify` with no mutation applied reads `IDENTICAL -- 12984 data rows, 12 comment lines, 819595 bytes`, without which it would not be entitled to stand in for GoldenGen. **Every one of the 58 C# cases samples a fifth of what it says, at one hour of twelve** — each draws ONE candidate per sampled minute at hour 3, and every bucket of these five locales holds exactly 5 — so each is translated as a universal over every candidate with the exact arity asserted alongside, and all 58 universals were checked against the C#-generated fixture *before* being written. The hour, the sampled minutes and the iteration counts stay as the C# wrote them; the widening along the hour axis is an addition, over all 1,438 non-special minutes × 5 candidates = 7,190 per locale, with the count asserted so a probe that enumerated less than the whole space cannot pass. **Three findings the pre-check turned up, each now an assertion rather than a comment.** (1) **`"ahoy"` matches nothing** — one of the nineteen arms of the pirate disjunction, 0 hits in 730 candidates, so the assertion would read the same with the arm deleted; it is the only dead arm in the four lists, and C10 (making it live) is caught by nothing else in the repo because every disjunction stays satisfied. (2) **The pirate disjunction is irreducible to either half** — nautical alone leaves 195 of 730 unmatched, pirate alone 243, so `hasNautical \|\| hasPirate` is load-bearing and not a hedge; C11 moves those counts while leaving the disjunction true, and only the counts object. (3) **en-yoda's seven endings are the only irredundant list of the four** — 4 of jive's 14 are removable and 10 of pirate's 19, mostly by subsumption ("real gone" cannot match anything "gone" does not); C12 shrinks jive's removable set from 4 to 3 with the vocabulary claim still green. **The two C# files disagree about two special-case disjunctions and both versions hold**, which is recorded rather than reconciled: this file's jive midnight list ends "dead of night" where `PhraseStyleProviderTests`' ends "night", and this file's pirate midnight list carries a fourth arm "graveyard". The jive difference is the one that matters — with "dead of night" all four arms carry weight, and with "night" the "midnight" arm becomes removable, so the style file's four arms are really three. The removable-arm map is asserted exactly (en-classic noon → `noontime`; en-pirate noon → `zenith`; en-pirate midnight → `midnight`, `graveyard`; en-yoda midnight → `midnight`; the other five → none), and C13 flips `zenith` from removable to load-bearing while `phrase-style.test.ts`'s own noon disjunction stays green on the `zenith` arm. **"Always empty qualifier" understates delegate mode, and the stronger form is what got written**: the structured emphasis SET equals the phrase set in every cell of all four delegate locales — en-terse 134/134, en-yoda/en-jive/en-pirate 146/146 — while split-mode en-classic matches in exactly 2 of 146, and those two are precisely its noon and midnight, where the whole special goes into the emphasis. That property is a strengthening rather than a new detector: it dies to the same mutation as the qualifier claim it subsumes, and is recorded as such. **The C# writes the hour-word check case-sensitively in four classes and `OrdinalIgnoreCase` in the fifth, and over every bucket candidate of all five the two forms return the same verdict** — so the inconsistency is currently unobservable, which is exactly why the equivalence is asserted instead of assumed: en-shakespeare already capitalises and is not one of these five, and C14 (en-yoda's cardinal 3 becomes `Three`) makes it observable and dies. **One prediction was written to be uncomfortable and held**: N9/C9 mutate en-classic's cardinal 3 to `threeish` — contains `"three"`, does not equal it — and were predicted to be caught by OTHERS as well, because `phrase-engine.test.ts` already pins the NEXT-hour emphasis exactly and hour 2's next word is `"three"`. Both were, so C9 is the one consistent mutation this file did not catch alone, and the honest reading is that the exact-emphasis tightening is new only for the *current*-hour buckets. C8 is the isolating one: an en-classic bucket-3 candidate that stops ending in `{h}` cannot be sliced, and only this file's exact-`"three"` and non-empty-qualifier pair at quarter past objects. **The twelve cardinals are hand-typed rather than read from `TABLES[locale].words.hourWords`** — reading the port's own table as the expectation would be circular — and the shared list was measured to satisfy the hour-word universal for every bucket candidate of all five locales, 720/720 four times and 660/660 for en-terse, identically under case folding. **The British-half case is a duplicate across two C# files and is translated without being re-claimed**: `Terse_HalfHour_UsesBritishIdiom` here and `Terse_HalfHour_ReturnsBritishHalf` in `PhraseStyleProviderTests` are the same claim, and `phrase-style.test.ts` owns the all-hours generalisation with its single substring counterexample (1:30 `"gone half two"` contains `"one"`). **What other suites own is stated in the header and used as input, not re-argued** — `segment-key.test.ts` holds en-classic's and en-terse's bucket structure in a much stronger form (it locates the boundary run rather than comparing two keys), `phrase-style.test.ts` holds arity for all nine and same-bucket for en-pirate/en-yoda and both cases for en-jive, and `phrase-engine.test.ts` holds en-classic's hour-word, special-vocabulary and structured claims. **Bounded**: these five locales, phrase and structured text only. Nothing here touches wrapping or rendering, bucket structure stays `segment-key.test.ts`'s, and one file rather than five because the five classes share eight cases apiece — five copies of that core would be five places for it to drift |

| ISC-15 / ISC-16 (the shell's window traits, Windows) | `bun run probe:shell` — builds first, then `scripts/probe-shell.ts` launches `dist/main.js` into a `mkdtemp` `--user-data-dir` and `scripts/winflags.ps1 -Pids <pid>` reads the style bits back over `EnumWindows`. 8 arms, 8 PASS at `ff4899d` | **Read off a LIVE window, never off `main.ts`** — the distinction the claim is worded around, because asserting `frame: false, transparent: true` from the source proves the constructor was *called*, and Chromium degrades window traits silently under real compositors. **Positive control on the absence (claim 18):** `altTabTotal` computes the shell's eligibility rule over *every* visible window, giving **0 ours against 13 others** — an enumerator that found nothing would return the same zero as a real absence, so the denominator is what makes it evidence. **Discriminating per-flag:** each of the 6 expectations names the option that should have produced it, so a red identifies the line rather than the file. **Not inherited blindly:** `garry-desktop`'s version scans by process *name* and would attribute another Electron app's window to the overlay; the pid parameter is the only substantive change. **Bounded:** one host, one launch, scale 1.00 — `GetWindowRect` is physical pixels and `setPosition` is DIPs, so the rect arm is only meaningful while they coincide, and the probe says so in its own FAIL text |
| ISC-18 (settings persistence + the one-time WPF import) | `bun test` (`test/settings-store.test.ts`, 35 cases; `test/settings-import.test.ts`) plus the live arms of `probe:shell` — S5 and S6 | **The live import ran against his real file and matched the prediction ISC-7.1 made from reading it**: `1 re-keyed, 1 dropped, 6 ignored, 0 unrecognised`, the dropped entry being the (−227, 510) orphan, and the fallback landing at (3188, 20) = 3440 − 232 − 20 — arithmetic that only comes out right if `FIRST_RUN_PADDING_PX` and the work area are both what the C# says. **The isolation is measured, not assumed:** S5 asserts the store path is *inside* the throwaway profile, so a `--user-data-dir` Electron stopped honouring would fail rather than let the run quietly read and write the real profile. **Field count read off `DEFAULTS`** rather than hardcoded, so adding a setting cannot make the probe stale. **A real defect, caught by the test rather than by inspection:** `??` collapsed an explicit `null` into the platform default, making "`null` disables the import" unreachable and every opted-out test a reader of his live file — three arms expecting `defaults` returned `wpf-import`. **Atomicity has a real obstruction:** `settings.json.tmp` is made a *directory*, so the write throws `EISDIR` before `renameSync` and the arm can check the previous file survived byte-intact; a truncate-first implementation (which is what the WPF original does) fails it |
| ISC-19 / ISC-20 (placement across restarts, display changes and drags) | `bun test` (`test/window-placement.test.ts`, ~35 cases) against `FakeScreen`/`FakeWindow`; S4 of `probe:shell` for the live rect | **The regression this file exists for:** `commit` used to take `{ snap: boolean }` and dropped the source monitor's key whenever the display had changed, so wiring `display-removed` to it would have **deleted the position the user set on a monitor at the moment that monitor was unplugged.** Provable only because `FakeScreen.displays` is *mutable* — the unplug is modelled, not inspected. **Both LG fakes carry an identical label, asserted**, so any future name-based key scheme fails here first (ISC-7's finding, pinned as a test rather than a memory). **Honest about what the live run did NOT show:** the source was `first-run`, so restoring from a saved key was never exercised, and the probe says so *inside its PASS verdict* rather than letting a green over-read. **The snap/clamp composition is pinned by outcome, not by order** — `snapToEdge`'s own −72 is asserted directly before the composition, because clamp-then-snap and snap-then-clamp agree on every reachable input and a test claiming to discriminate them would be claiming discriminating power it does not have. **ISC-20's live half is refused rather than faked:** `onDragMove` reads `screen.getCursorScreenPoint()` by design, so a `sendInputEvent` drag moves the window by a zero delta, and the only real synthetic drag is `SetCursorPos` on his live desk — the same input-synthesis line ISC-14 already declined to cross. **S4's live-rect expectation was VOIDED by Phase 4 and re-earned — rule 17 in its literal form.** Phase 4 makes the window size a renderer decision (the renderer measures its content and main honours a `resize`), so S4 went to FAIL at `208x243 vs 232x260` with the **position exact and only the size wrong**. The expectation was stale, not the code: S4 now parses main's own `PROBE-SIZE` out of the app's stdout and compares against the last one, falling back to the constructor constants only when no resize was needed — **and names which source it used in both verdict branches**, because `232×260` proves nothing about the resize path. Back to 8/0/0. A non-blocking arm is not a waivable one |
| ISC-21 / ISC-22 / ISC-23 (the five faces, the composited-property rule, the theme) | `bun run probe:display` — builds, then `scripts/probe-display.ts` launches `dist/main.js` five times into throwaway `--user-data-dir` profiles (one per face) with `--remote-debugging-port` + `--remote-allow-origins=*`, and harvests one in-page IIFE over CDP: **51 passed / 0 failed / 10 inconclusive / 0 blocking**. Plus `bun test` — `test/renderer-ids.test.ts`, `test/theme.test.ts`, `test/display-plan.test.ts`, `test/locale-key.test.ts` | **Read off the live document, never off the markup**, because three of the failures being guarded against cannot exist in a fake DOM: an unresolvable `<use>` renders nothing *with no console error*, a CSS declaration silently beats a presentation attribute, and a replaced inline element with no `#root { display: block }` collapses. **Only Chromium's cascade can answer the middle one**, which is why the CSS-shadowing claim is guarded twice — over the source in `renderer-ids.test.ts` and over the cascade in arm D5 — and neither check subsumes the other. **The reduction to five launches is logged at run start rather than hidden**: one launch per settings combination is the only route (main does not watch the settings file; CDP reaches the page but not `ipcRenderer`), and accent × face is not dropped for convenience since only the LCD reads the accent for anything beyond a paint, through a separately-tested pure function. **Two negative controls carry the two claims that would otherwise be vacuous**: three faces must produce *exactly one* DOM state across 3 s (a phrase face rewriting identical text every second passes every other arm in the file), and the dial decorations must be `display="none"` on the four cases that leave their **false defaults** alone (a probe that never sets those flags reads an empty dial as correct). **The memo is measured as an effect, not a count** — the bundle exports to no global, so CDP cannot see `setAttr`'s return value; the probe hashes `outerHTML` instead. **`harvestExpression` deliberately uses string concatenation and no template literals inside the page code**, since the file is already inside one and the nesting is how you get a probe that measures a syntax error. **Bounded, and the bounds are in the probe's own header:** no pixel is compared, no screenshot is taken, no paint-flash trace is captured, and the `text-before-edge` vs WPF `FontFamily.Baseline` offset is *recorded* by D10 (`#date y=110 bbox=97.23,110.00 81.47×21.00`) and **checked by nothing** |

| ISC-24 / ISC-25 / ISC-26.1 / ISC-26.2 / ISC-26.6 (the driver, the click-through toggle, the pump's deviations, the opacity move, the two C# defects) | `bun test` — `test/ghost-driver.test.ts`, `test/ghost-fade.test.ts`, `test/ghost-rect.test.ts`, `test/opacity-step.test.ts`: **83 new tests, 2107 pass / 0 fail overall** (271,808 `expect()` calls, 43 files). Plus `bun run typecheck`, `bun run build`, and `bun run probe:shell` for S8's before-half | **Structurally typed like `window-placement.ts`, so the whole driver runs with literal fakes and no Electron on the path** — which is what makes the 30-ticks-per-second `markActive()` claim measurable at all rather than reasoned about. **The pure/platform split is the discriminator**: `FadePump.frame()` returns the number to write and lets the caller write it, so Bun drives the state machine, and `null` means *"do not write"* rather than *"write the same value again"* — collapsing those two would hide the guard-swallowed-write deviation entirely, because `svg.ts`'s memo makes them look identical from outside. **`isModifierHeld` is swept over all 256 (config × held) pairs against an independently formulated oracle with a `heldTrue === 65` count**, because the C# suite's own 12 rows all expect `false` in a test process and eleven of them pass against `return false`. **Bounded, and stated rather than left to infer:** none of this sees a real cursor, a real screen or a second platform — `setIgnoreMouseEvents` is one call on all three and has been read back off a live window on one |
| ISC-26 (PERF-01) | `bun run probe:fade` — builds, then `scripts/probe-fade.ts` launches `probe-fade-app.cjs`, which constructs a window with `main.ts:137-157`'s options and runs **the shipped `FadePump` and a v4.4-shaped `win.setOpacity()`-from-main control** across 8 phases (idle / main-blocked / system-load / oversubscribed × both architectures), releasing each phase through a counter file: **7 of 8 blocking arms pass; F0 INCONCLUSIVE, exit 1** | **The negative control is itself a blocking arm, and that is the whole design.** A flat frame clock under a load that never arrived is indistinguishable from success, so F4 requires the control to degrade (measured 31.0 → 62.0 ms median, 63 ticks vs 145 in the same 4 s) before F5's green means anything. **The bar is derived, not tuned**: F4 compares medians against `BUSY_SPIN_MS` because `setInterval(16)` coalesces to ~31 ms on Windows even idle, so the first bar (`busy.max > idle.max × 2`) returned INCONCLUSIVE at exactly 64 > 64 on a load that had plainly arrived. **F6b and F7 refuse to over-claim in the direction the run favours**: 12 saturated cores of 32 starves nothing on this host, so F5 carries the claim rather than F6, and 100% oversubscription is reported as *"no limit found below full oversubscription"*, never as "immune". **F0 is why this row does not close the claim** — the session was locked, so the cadence was measured against a compositor that was not presenting, and the idle median of 12.7 ms is ~79 Hz, matching no standard refresh rate. F0 checks against 60/75/90/120/144/165/240 Hz and blocks. **The comparative result survives the lock; the absolute figures do not.** **Bounded:** Windows only, one host, and no probe has seen the real app fade under a real cursor — `ipcRenderer` is unreachable from CDP and `SendInput` would move Alex's own pointer |
| ISC-26.3 / ISC-26.4 (does a transparent window actually composite; and was anyone looking) | `bun run probe:pixels` — `scripts/probe-pixels.ts` + `probe-pixels-app.cjs` + `screengrab.ps1`. **Currently INCONCLUSIVE, exit 0: the workstation is locked, so nothing is launched and nothing is measured** | **The first arm in this repo that reads a rendered pixel** — every other probe reads a decision, and `probe-display.ts:64` says so. **The backdrop is OURS, not the wallpaper**: the naive version captures the desktop, shows the transparent window, captures again and passes when they match — which also passes when a dark desktop sits under an opaque dark box. Magenta is chosen for being un-supplyable by any theme, wallpaper or Chromium default. **X2 is the control and is reported before X3 on purpose**: "still magenta" is equally what a window that never showed produces, so the same window with the same flags must turn the capture green when asked to paint opaque, or X3 is VOID and says so in its own verdict text. **The grid is not decoration** — a mean alone cannot tell magenta from a red/blue checker. **The rect is taken from the window's own reported bounds with a 12-DIP inset and multiplied by `scaleFactor`**, because the first run grabbed the *requested* rect, photographed the wallpaper and called it a failed paint; PowerShell is not per-monitor DPI aware. **`capturePage()` cannot answer this** — it captures the page's own surface, so a transparent page captures as transparent regardless of whether the OS honoured it. **The lock gate is the discriminator for the probe itself**: without it this file produced four specific, alarming, false FAILs, and `lib/session-lock.ts` fails OPEN so a broken query costs one contaminated run rather than permanently disabling every capture arm |

### Still outstanding

- **The lock is now the top of this list, and it is one physical action that unblocks two claims.**
  **Unlock the screen, then `bun run probe:pixels` and re-run `bun run probe:fade`.** The first settles
  ISC-26.3 — whether transparency composites without `WS_EX_LAYERED` — and with it whether
  `probe-shell.ts`'s S2 expectation gets corrected or the widget is genuinely painting a box. The second
  turns ISC-26's provisional cadence figures into a claim about what a user sees. **Neither is a code
  change and neither can be done from a tool call.** Until then `probe:shell` reads 7/1 and `probe:fade`
  exits 1, both on purpose.
- **Three Phase 3 arms need Alex's hands and nothing else.** (1) **Drag the widget**, including across
  the monitor seam, and check it lands inside the work area — ISC-20's live half, refused rather than
  synthesised because the only real synthetic drag moves his cursor. (2) **Restart the app** and confirm
  it comes back on the monitor it was left on: the probe's run fell to `first-run` because his
  `LastActiveMonitor` names the orphaned display, so *no* run has yet restored from a saved key. (3)
  **Unplug a monitor** with the widget on it. All three are covered against recorded C# values or fakes;
  none has been seen on hardware. **Do not read the 8/8 probe as covering them** — it does not, and it
  says so in its own closing lines.
- **Nothing has clicked the tray (ISC-17).** The icon's presence in the notification area, the menu
  opening, and the Linux `click`-vs-`right-click` difference are all unexercised. `core/tray-menu.ts`
  additionally has **no C# counterpart test** — `TrayMenuBuilder` has no suite — and so does
  `core/reset.ts`, whose `ResetToDefaults` is a private method on a WPF `Window` and unreachable from
  the console harness. Both headers say so in place; every other Phase 3 expectation is a recorded C#
  value.
- **ISC-6's greens are void again, by rule 17, and this is now the third time.** `main.ts` changed
  substantially in Phase 3 (settings, tray, placement, drag, IPC), `settings-store.ts` changed after its
  own tests were written, and **Phase 4 added an 87.73 KB renderer bundle that ticks every second** —
  which is exactly the thing a CPU comparison measures. The cost figures were measured on the old
  harness, so the comparison needs a re-run before any of them is quoted again. It gates nothing right
  now — the go/no-go already passed with a 1.93–2.43× margin — but the *number* is stale and must not be
  repeated as current, and Phase 4 is the change most likely to have moved it.
- **Phase 4 renders no pixel comparison and does not pretend to.** No screenshot, no glyph measured
  against WPF's. The concrete residual is the **`text-before-edge` vs WPF `FontFamily.Baseline` offset**:
  arm D10 *records* it (`#date y=110 bbox=97.23,110.00 81.47×21.00`) and **nothing checks it**, so a
  systematic vertical offset in the date line would ship green. Carried as debt, not closed.
- **The stats panel renders all bars at `0` and all values `"--"`, which is correct for Phase 4.** Arm
  D10b is deliberately inconclusive-by-design: it is the before-picture for Phase 6, which owns the
  sources. Do not read the panel's presence as the panel working.
- **The Linux runtime arms are entirely unprobed, and there is no host.** ISC-10's Linux half plus the
  Linux halves of ISC-15..20 and ISC-27..30. What exists for Linux is API-surface evidence from Electron
  33.4.11's typings and nothing else — no window ever opened. `[DEFERRED-VERIFY]`, and unlike the macOS
  half this one cannot be closed by a dispatch: **no Linux host is identified.** The two rows that will
  hurt are XWayland (`setIgnoreMouseEvents` and always-on-top behave differently under Wayland
  compositors) and ISC-30's hand-written `~/.config/autostart/*.desktop`, since `setLoginItemSettings`
  is `@platform darwin,win32` — there is no API to call. **macOS is no longer in this bullet**: ISC-10's
  macOS half is measured (see the Verification row), which narrows the gap rather than closing it — one
  M1 on one OS version, Apple silicon only.
- **Three macOS arms are blocked on a TCC grant, not on effort.** M4(b) the Cmd-Tab switcher, M5
  layering over a fullscreen window, M6 click-through into another application. All three need a screen
  capture and `screencapture -x` answers `could not create image from display` on that host. They are
  `[INCONCLUSIVE]`, deliberately not downgraded to "probably fine because the mechanism is right" —
  M4's own split (policy measured, switcher not) is the template. Closing them means Screen Recording
  granted to the harness on a Mac, which is Alex's grant to give on his own machine, and the same grant
  ISC-23's auto-contrast path will need anyway since `desktopCapturer` dies on the identical denial.
  **`osascript`/System Events is also unusable there** — it hung ~22s with no output, so nothing in this
  port should route verification through AppleScript.
- **One busy JS thread on the M1 measured 26.73% aggregate CPU where ~12.5% was expected, and I cannot
  explain it.** 8 logical cores, so one saturated thread should read about an eighth. The control still
  did its job — 1.25% idle against 26.73% busy is unambiguous, which is all M7 needed it for — but the
  *absolute* figure is unexplained. The M1's 4 performance + 4 efficiency split and how macOS attributes
  time across them is the obvious suspect and was not tested. Recorded rather than smoothed over,
  because any future macOS CPU-percentage cell inherits whatever this is: a 26.73% reading may not mean
  what the same number means on the Windows box.
- **The macOS host cannot extend ISC-6's cost comparison.** It is an **8GB, 8-logical-core M1**; the
  Windows measurement is a 32-core i9-13950HX with an RTX 5000 Ada. There is no WPF baseline on macOS to
  compare against in any case (that is the point of the port), so the 2.43× headline is a Windows number
  and stays one. If a macOS cost figure is ever wanted it needs its own baseline and its own claim.
- **Two Electron 33.4.11 APIs the typings imply are absent at runtime, so no flag probe may use them.**
  `win.getAlwaysOnTopLevel` and `app.getActivationPolicy` are both `undefined`. Consequence for ISC-15:
  the always-on-top **level** cannot be read back from Electron at all — only that the flag is set — so
  if the level matters it needs external evidence, the way M3/M4 used LaunchServices and
  `NSRunningApplication`. And **`win.isFocused()` differed between two runs on the same host**, so it is
  not an overlay invariant and nothing may assert on it.
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
  cannot separate that without editing his live settings, which it will not do. **Option C makes the
  second asymmetry permanent rather than temporary** — Electron is never getting temperatures, so this
  is not a gap that closes at Phase 6; it is a standing overstatement of the 2.43× in Electron's favour.
  **It is bounded, not open:** ISC-9's 106.8ms mean read at his 3s interval is ≤3.56% of one core, so
  the temps-free WPF baseline is ≥16.36% and the win is **≥2.0×** rather than 2.43×. What stays
  unmeasured is the exact figure inside that bound, and it stays that way deliberately — measuring it
  means flipping `TempsLineVisible` off in his live settings and re-running the WPF baseline, and that
  file is read-only to every probe. A bound that survives the worst case is enough for a go/no-go.
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
- **The temps decision is CLOSED — Option C, drop temps. Do not re-raise it, and do not treat the four
  bullets it retired as open work.** They were: the A/B/C/D question itself; CPU temperature unmeasured
  elevated (the ring-0 refusal is still inferred from 51 NULL sensors and will now stay inferred, since
  nothing in the port needs the answer); trimming's IL2104 safety unwidenable from this host's hardware;
  and `Computer.Open()` varying 542–1794ms against a 4272ms prior from a different box. All four were
  properties of a sidecar that no longer exists. **Each was a real residual and none is a defect being
  waived** — they are moot, which is a different disposition, and worth distinguishing because a moot
  item that reads as waived invites someone to come back and pay it. If temps ever return, they return
  from `64c747e` and every one of those four is open again unchanged.
- **The disk regression needs Alex's read before Phase 2 is worth starting.** 1.40× larger on both
  measures, against ~2× cheaper on CPU. Not a blocker and not a question I should stop on, but it is
  the first Phase 1 result that goes the wrong way, and it is the kind of thing better surfaced now
  than discovered by him at Phase 9.
- **40.3MB of unused locales are shipping, 15.0% of the payload.** 55 `.pak` files for languages the
  app never renders. Removable via an `afterPack` hook on Windows (`electronLanguages` covers macOS
  only), which would cut the installer meaningfully and narrow the 1.40×. Deliberately out of ISC-8's
  scope, which measures the default build; belongs to ISC-29.
- **No icon and no code signature yet**, both of which add bytes and change the measured size. So the
  76.4MB figure will move upward once packaging is real, and ISC-29 should re-run `probe-size.ts`
  rather than carrying this number forward. The phrase layer is a third reason the same way: `b66579e`
  adds ~37KB of generated tables plus four source files that were not in the tree when 76.4MB was
  measured. It is noise against 76.4MB and it is still a stale denominator, so it is named here rather
  than left for someone to notice — the re-run ISC-29 already owes covers it, and no *new* work is owed.
- **Claim 17 checked against `b66579e`, and no green reverts.** The commit adds nine files and modifies
  none, so every Phase 1 measurement — which was taken on the Electron shell, the C# tree and the
  telemetry path, all untouched — still describes the code it was taken from. The one number the commit
  does perturb is the packaged size, handled in the entry above.
- **The mac `dmg` and linux `AppImage` targets are configured but never built.** They cannot be built
  from this host, so their sizes are unknown — not estimated, unknown. Whoever runs ISC-10's hosts
  should run `probe:size` there too, since the artefacts differ enough per platform that a Windows
  figure predicts little.
- **`probe-size.ts` cannot run on a fresh clone.** `installer/` and `publish/` are gitignored, so C2
  and C3 return INCONCLUSIVE without a local WPF build. That is the intended degradation — they say so
  rather than passing — but it means the ISC-8 figures are reproducible only on a machine that has
  built both sides.
- **The golden files are pinned to the C# tree as it stands and there is nothing that notices if it
  moves.** They were generated at this base; if a provider's table is edited before the port lands, the
  oracle silently becomes wrong in the port's favour — the TS would be graded against strings the C#
  no longer produces. The cheap guard is to re-run the generator and confirm zero diff before closing
  ISC-13, which is why the regeneration command is documented in three places (the csproj comment, the
  fixture README, the Verification row) rather than remembered. **Not a hypothetical**: the WPF tree is
  live on `master` until ISC-31, and every phrase provider is a file someone could reasonably touch.
- **The oracle covers `GetPhrase` and `GetStructuredPhrase` and nothing else in the phrase layer.**
  `PhraseWrapService` (76 LOC) and the display-side formatting are not in it, so ISC-13's green will not
  say anything about how a phrase is wrapped or rendered. That belongs to ISC-11/ISC-12 via the
  translated unit tests, and the split is worth stating because "phrase output matches" reads broader
  than what is actually pinned.
- **The `(qualifier, emphasis)`-to-phrase correspondence is unmeasured, and the gap is exactly two
  providers wide — measured, not estimated.** `kind=phrase` and `kind=structured` are sampled
  independently, so nothing records which phrase a given pair came from; a port producing the right set
  of pairs attached to the wrong phrases would pass ISC-13. But **16 of the 18 providers define
  `GetStructuredPhrase(dt) => ("", GetPhrase(dt))` verbatim**, so for those the correspondence is an
  identity with nothing left to get wrong, and the port should assert it *as* an identity rather than
  comparing two sets — a strictly stronger check than the fixture can express, available for free. Only
  **`en-classic` and `en-poetic`** split a qualifier off the template with their own independent
  `Random.Shared` draw (`EnglishPhraseProvider.cs:95`, `PoeticPhraseProvider.cs:138`), and only those
  two carry the gap. Closing it would need a deterministic seam the C# does not offer, since the two
  methods roll separately. The file header warns against zipping the two kinds for this reason: zipping
  would assert the correspondence without having measured it, which is worse than leaving it open.

## Changelog

- **Phase 5 close-out, 2026-08-30. Ghost mode ships; one blocking gate is left RED on purpose and two
  claims are blocked on an unlocked screen.** ISC-24 and ISC-25 closed, ISC-26 (PERF-01) closed as a
  **comparative** claim and left `[~]` on its absolute figures, plus seven new sub-claims — ISC-26.1
  (the pump's two deviations), 26.2 (the opacity product moved to the renderer on a platform
  annotation), 26.3 (**the red S2 gate and the pixel instrument built for it**), 26.4 (the locked-session
  contamination), 26.5 (three unowned features, one paid here and two moved to ISC-27), 26.6 (two C#
  defects, one reproduced and one closed on a stated standard) and 26.7 (four platform facts, each after
  a wrong first diagnosis). 8 files added / 6 changed, 3,482 new lines, **83 new tests → 2107 pass /
  0 fail**.
  - **The three decisions in this phase that were mine to make and are recorded rather than absorbed.**
    (1) **No native module for global key state**, so the Ctrl+Alt override ships inert — a degradation
    of shipped v4.2 behaviour, with four alternatives rejected on stated cost. (2) **`probe-pixels.ts`
    was built rather than S2 relaxed.** The measured `WS_EX_LAYERED` table proves S2's *cause
    attribution* was wrong from Phase 3 onward, and correcting the arm on that alone would still have
    been rationalising a red gate, because no instrument in the tree could tell "the bit is irrelevant"
    from "the widget is now an opaque box". (3) **The oversubscribed phases and the pixel subsystem are
    past the plan's literal bar** — the first converts "passed the bar" into "no limit found below full
    oversubscription", and the second was not optional: the alternative was a red blocking gate with no
    path, or a silently relaxed arm whose green had been wrong.
  - **The failure worth carrying out of this phase is not a bug, it is an instrument that lied
    confidently.** `probe-pixels.ts` printed *"THE WIDGET IS PAINTING A BOX"* about a screen nobody was
    looking at, and three plausible diagnoses came before the right one. Specific, alarming, wrong
    output is worse than no probe — hence `lib/session-lock.ts`, which fails OPEN and reports
    INCONCLUSIVE rather than FAIL.
- **Phase 4 close-out, 2026-08-30.** ISC-21 and ISC-22 closed on `probe:display` (51/0/10/0-blocking
  across five launches); ISC-23 half-closed — the theme path measured through Chromium's cascade, the
  auto-contrast path left to `[FOG]`/Phase 8 rather than claimed. Two arms were added *after* a green
  run rather than before it, and both are recorded that way on purpose: **D11** (a face with children but
  no words passed all 46 earlier arms) and **S4's fix** in `probe-shell.ts`. Ownership of
  `test/fixtures/wpf-layout.tsv` (96 → 326 data rows) and `test/wpf-fixture.test.ts` was **determined
  before staging, not assumed**: `test/layout.test.ts` — my own uncommitted Phase 4 file — consumes all
  three new row families (`lay-arrange` 140 = 4 configs × 35 elements, `lay-date` 84, `lay-emptytext` 6)
  and the guard's counts match, so they are mine and no foreign path was held back.
- **four false doc claims removed, and the class matters more than the count.** `svg.ts:34` said
  `probe-display.ts` "counts" `setAttr`'s return value; `theme.ts:106` said it reads `applyTheme`'s write
  count. **Both are impossible** — the renderer bundle exports to no global, so CDP has no route to a
  closure — and both were written by me in this phase, describing a verification that cannot happen.
  Rewritten to state what the probe measures instead (`outerHTML` hashing for the memo, computed paint
  for the theme). The other two, caught pre-compaction, were `nixie-face.ts`'s "listed in
  `STRUCTURAL_IDS`" and `display-colors.ts`'s "their union is exactly the addressable element set".
  **My first correction was itself false** — it cited `test/svg.test.ts`, which does not exist — which is
  the tell for the whole class: **nothing executes a doc comment**, so a claim about test coverage
  written into a header passes typecheck, `bun test`, `build` and both probes untouched. The only
  available control is grepping the *claim* for the artefact it names, which is how all four surfaced.
- **conjectured** that translating `MultilingualPhraseProviderTests` would add coverage, since 104 of its
  128 cases assert only `IsNullOrEmpty == false` and every one of them could become an exact string.
  **refuted-by** reading `phrase-golden.test.ts` before writing anything: it already sweeps all 1440
  minutes of all 18 locales against the fixture, and its `describe("the 8 single-template locales")`
  already asserts the structured phrase is `("", <segment key>)` at every minute of exactly these 8. So
  104 of the rows and all 8 structured cases are **subsumed**, and a "13 of 13 caught" mutation report
  would have been true and misleading. The unit was rebuilt around the honest question — which defects
  does this file catch that golden does not — by running every mutation against both suites separately
  and adding a **consistent** class: mutate the source, then regenerate the segments fixture *from the
  mutated source*, which is what a tools/GoldenGen bug looks like. 7 port-only mutations caught by both,
  **6 consistent mutations green under golden and caught here**, 0 refuted. The contribution is a second
  oracle origin, not coverage — and `specs.ts:36-38` already rested on that argument untested ("had
  TableExport harvested these by sampling too, both sides would share one origin and the check would be
  worth nothing"). A second draft claim also died on the way: that the arity-1 addition filled a gap.
  Golden asserts arity 1 at all 1440 minutes by instrumenting the picker, so it is recorded as
  overlapping and kept only because it is the stated premise of 104 exact equalities.
- **conjectured** that mutation E9 — hard-wiring delegate mode into the coordinator, `getStructuredPhrase`
  rebuilt as `("", getPhrase(dt))` — would survive `phrase-engine-coordinator.test.ts` and be caught by
  `phrase-engine.test.ts` and `phrase-golden.test.ts`, since those two exercise en-classic and en-poetic,
  the only split-mode locales. **refuted-by** running the mutation against each of those files alone and
  then against the full suite: all three stay green. The verdict was right and the reason was wrong, and the
  reason was the finding — both files build providers through `makeProvider` and never import `engine.ts`,
  so **no test anywhere read split-mode structured output through the coordinator**. Closed with an
  18-locale delegation test that compares enumerated engine output against `providerFor()` for every
  method, plus `expect(splitSeen).toBe(2)` so the structured comparison cannot go vacuous if a qualifier
  stops appearing at 03:30. Re-run: 16/17 caught. Worth recording because the near-miss was a *correct*
  prediction — had I filed E9 as a predicted survivor and moved on, the write-up would have been accurate
  in its verdict, wrong in its explanation, and the gap would have shipped described as covered.

- **conjectured** while writing the ISC-12 remainder bullet that the 287 could be listed as
  "eight 16-case locale providers = 128; `PhraseStyleProviderTests` 9 classes = 64; `SegmentKeyTests` 4
  classes = 37; `EnglishPhraseProviderExpandedTests` 13; two 12-case; three 11-case; ..." **refuted-by**
  adding it up before saving: that mixes a per-file enumeration with the per-class one it replaced, so the
  9 `PhraseStyleProviderTests` classes and the 4 `SegmentKeyTests` classes were counted twice — once by
  name and again inside the size tail. Rewritten as a clean per-file breakdown whose class count (8 + 9 + 4
  + 5 = 26) and case count (128 + 64 + 37 + 58 = 287) are both shown, so the two decompositions of the same
  number have to agree. The general shape of the mistake is the one this bullet already warns about: a
  remainder that is edited rather than recomputed agrees with itself.

- **`enumerateAll` refused to enumerate `getSegmentKey` and was right to.** The 18-locale delegation test
  first drove all three methods through the enumeration instrument; it threw `expected exactly one draw per
  provider call, saw 0` for the bucket-mode locales, whose `getSegmentKey` formats a bucket index and never
  draws. Changed to a direct comparison, with the reason written next to it: bucket-mode keys are constant
  within a minute and the 8 phrase-mode locales are the deterministic ones, so neither family has a draw
  that could differ and the direct form is exact for all 18. Recorded because the instrument's guard did
  the job it was extracted to do — it turned a silently partial enumeration into a named failure, on a call
  shape nobody had considered when it was written.

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
- **conjectured** — implicitly, by the plan carrying "~85MB" — that the packaged size would be a
  *win*, since the WPF single-file exe is 191MB and 85 is well under that. **refuted-by** measuring the
  comparable artefacts: 191MB is not what a WPF user downloads, the 54.7MB Inno installer is, and the
  Electron equivalent is 76.4MB. The prior's *number* was close; the framing it invited was wrong,
  because it was being compared against the largest figure on the other side rather than the matching
  one. The 191MB-vs-268MB row exists precisely so the flattering comparison and the fair one appear
  together and neither can be quoted alone.
- **conjectured**, following the plan's framing, that ISC-9's answer would be a *size* — that the
  sidecar's cost was the question and its function was settled, since the WPF app ships this feature
  today. **refuted-by** D5: the size came in at a very affordable 17.0MB and turned out to be the
  least interesting number in the run, because unelevated the component delivers GPU temperature only,
  which Option D delivers nearly free. The decision input was never the size. Worth recording because
  the claim was *written* as "measure size and latency" and would have closed green on both without
  ever asking whether the thing worked — the reading arm (D2) was added defensively and the coverage
  arm (D5) only because a `-1` in the output looked worth explaining.
- **conjectured** that the 608.2ms mean read cost would carry over and that the 2s loop was therefore
  load-bearing. **refuted-by** 106.8ms measured here, 5.7× better. But the refutation is *weak and is
  labelled that way*: this host has fewer sensors to update than the spike box (motherboard 0, Storage
  absent), so the honest statement is "fewer sensors, faster read" rather than "the prior was wrong."
  A same-hardware comparison was not available.
- **conjectured** that measuring the installer was sufficient to close ISC-8. **refuted-by** the
  realisation that `files:` had never been validated: 22KB of bundles in an 80MB installer produces
  the same byte count whether the bundles are present or absent, so the arm that makes the number mean
  anything is containment, not measurement. C4 was added for it, and the asar-header parse was chosen
  over `bunx asar` for the same reason the whole probe exists — an instrument that fails silently
  under a variable you did not set will be believed. Third instance of that pattern this phase, after
  `ELECTRON_RUN_AS_NODE` and the doubled path.
- **conjectured** that ISC-9's finding would decide *between Options A and D* — the two that keep the
  feature — since the reframed question I wrote into Still outstanding was "does A earn its 17MB over D."
  **refuted-by** Alex answering **C, drop temps**, which was not on the axis I had narrowed to. The
  useful part is what the narrowing did: I had reasoned my way from four options down to two and then
  presented the two, and the option that won was one I had implicitly retired. **A probe's job was
  finished the moment it produced the number; picking which options the number was allowed to decide
  between was not part of that job.** The wider consequence is the pleasant one — the sidecar's entire
  value turned out to be informational, and what it informed was the removal of the feature it was
  built to serve. 231 lines of `Program.cs` and a whole probe deleted at `64c747e`, and the run that
  produced them is the reason the deletion is defensible rather than a guess.
- **conjectured** that macOS GPU utilisation was a permanent `-1`, written into the plan as a settled
  row on the strength of `powermetrics` being root-only. **refuted-by** M7 finding `ioreg -r -c
  AGXAccelerator -l` returning `"Device Utilization %"=26` **with no privileges at all**. The
  `powermetrics` finding was correct and correctly measured (`must be invoked as the superuser`, exit
  1) — the error was concluding *no source exists* from *the documented source fails*. Those are
  different claims and only the second was tested. The general form is the mirror of the enumerated-vs-
  absent distinction that decided temps: **a failed lookup of the known path is not an absence proof,
  and the cheap follow-up is to enumerate rather than to reason.** Not adopted on one sighting — an
  undocumented Apple-silicon-only IOKit key path is a candidate, so the `-1` fallback stays mandatory.
- **conjectured** that `os.totalmem()`/`os.freemem()` was the primary macOS memory source, with
  `vm_stat` a supplement for compressor detail. **refuted-by** the numbers on one healthy machine:
  `freemem` reported **3.1% free** where `vm_stat` occupancy on the same snapshot was **69.14%**. Roles
  inverted, and `freemem` dropped entirely rather than kept as a fallback — a fallback that is
  confidently wrong activates exactly when nothing is available to contradict it. What caught this was
  cross-reading two sources in one snapshot instead of trusting the portable-looking one; on Windows
  and Linux `freemem` is roughly what it sounds like, so nothing but a same-instant comparison on macOS
  would have shown it. A memory cell reading 97% used on an idle Mac is worse than `--`.
- **conjectured** that the zero-`mousemove` result under `setIgnoreMouseEvents(…, {forward: true})` was
  a Windows property, which is why ISC-24 was worded against "measured delivering zero events here."
  **refuted-by** macOS delivering **1** event across an eight-lap sweep — which does not restore the
  API, it generalises the verdict. And the disagreement is what makes it worth recording: two platforms
  producing the *same* number would have been the weaker evidence, since a shared zero invites "the
  harness never moved the cursor." One event proves the harness worked and the channel is still useless.
  Cursor polling via `screen.getCursorScreenPoint()` measured healthy on both (61 changes / 42 unique
  points over 98 samples at 100ms), so the design does not change — only the strength of the reason.
- **corrected** the C# test denominator, which does not reproduce. Earlier notes and AC-2 carried
  **633**; measuring it gives **632** (469 Core + 163 App). Recorded rather than silently substituted
  because AC-2 is a parity gate and the merge is the irreversible step — a target number quoted from
  memory is exactly the kind of figure that gets defended later. The temps-covered subset is 54 cases
  (12 + 21 + 10 + 11), so the real target is **578**, and the reason to nail that down now is that a raw
  before/after count at merge time reads a retired feature as 54 missing tests.
- **conjectured** that the four hand-transcribed macOS fixtures had arrived CRLF, on the strength of
  `grep -c $'\r'` returning 23/2/1/1. **refuted-by** noticing those were each file's exact **line**
  count — `grep -c` counts matching lines, and with an unquoted/mis-escaped pattern it was matching
  every line. A byte-level count (`[...readFileSync(f)].filter(x => x === 13).length`) shows **0 CRs**:
  the files were LF all along and the "conversion" I ran changed nothing, which is why its own output
  claimed identical byte counts *and* zero CRs simultaneously — a self-contradiction that was the real
  tell. My first attempt to check that read `p.filter?.length` and printed `1`, which is the **arity of
  `Uint8Array.prototype.filter`**, not a CR count; `Buffer` inherits it, so the expression was
  well-formed and measured nothing. **Instances five and six of the family already named four times
  above** (`ELECTRON_RUN_AS_NODE`, the doubled `dist/dist` path, TypeScript 7.0.2, a possibly-absent
  `bunx asar`), and the first two that were mine rather than a tool's. Both would have been believed:
  one would have "fixed" line endings that were already correct, and the other would have confirmed it.
  `.gitattributes` now pins `electron/test/fixtures/macos-*.txt -text` so the repo-wide
  `*.txt text=auto eol=crlf` rule cannot rewrite captures to line endings `vm_stat` never emits.
- **corrected** ISC-13, which was **unsatisfiable as written** and would have been discovered only at the
  end of Phase 2, by a port that could not be graded. "Phrase output is byte-identical to the C#
  original across a full sweep" cannot hold: **10 of the 18 providers pick with `Random.Shared.Next()`**,
  so `GetPhrase` has no single correct answer for a minute. Two things are worth separating here. The
  weaker error is the count — "6 locales × 11 styles" was arithmetic on a shape that does not exist;
  `PhraseEngine._providers` is a **flat dictionary of 18 keys**, and one Read of the file was enough. The
  serious error is that the claim named a property nothing could have. **What makes it worth a changelog
  entry rather than a quiet edit is which way the fix went.** The obvious repair is to weaken the claim
  to a sampled comparison, and that repair would have been *worse than useless*: a wrong-bucket port —
  the single most likely defect when transcribing 1,987 LOC of boundary tables — passes a one-sample
  comparison roughly four times in five, so the claim would have gone from unsatisfiable to reassuring.
  Pinning the candidate **set** instead makes it strictly stronger than the original wording aimed at.
  General form, and it is the reverse of the usual advice: **when a claim turns out to be unmeasurable,
  find the strongest property that IS observable before touching the claim** — reaching for a weaker
  claim first is how a gate becomes decoration.
- **conjectured** that reflection would reach every candidate array in a multi-candidate provider, since
  the bucket tables are `private static readonly` fields. **refuted-by** the noon/midnight candidates
  being **method locals** in several providers — not fields, not reflectable, nothing to read. This is
  the reason `SpecialStableDraws` (2000) exists beside `StableDraws` (400): for ~20 special-case buckets
  the "no new value in N draws" rule is not a backstop to the declared arity, it is the *only* rule, so
  it is set wider where nothing can cross-check it. Recorded because the two constants look like
  arbitrary tuning and are not — one is belt-and-braces, the other is load-bearing, and the code cannot
  say which by inspection.
- **corrected** two rounds of my own source-file corruption, both invisible in a normal read. `Program.cs`
  needed an ASCII Unit Separator to pack a `(qualifier, emphasis)` pair into one set member. The Write
  tool put **two raw 0x1F control bytes** into the source — which compiles, runs identically, and is
  ungreppable and uncopyable. Replacing them with a named `Sep = "\u001f"` constant then hit the
  opposite failure: the Edit tool **interpreted the escape** and wrote the literal byte back. Caught
  both times by counting raw 0x1F bytes in the file rather than reading it back, because a control byte
  renders as nothing at all in a terminal and the read looks correct. Final state verified: 0 raw 0x1F
  in the source, 0 in either golden file. **Instance seven of the same family** — the tool did something
  reasonable under an input rule I had not set, and produced an artifact that behaved correctly while
  being wrong; the only reason it mattered here is that a separator byte reaching a TSV file would have
  corrupted the oracle silently, which is why the check is a byte count on the output as well. **Then it
  happened a third time, inside this very entry**: typing the escape sequence into the changelog line
  that describes the problem put a raw 0x1F into `ISA.md`, found by running the same byte count over the
  ISA. Which is the actual lesson, and it is not "be careful with escapes" — a rule I had just written
  a paragraph about and still broke on the next keystroke. It is that **the check has to be mechanical
  and it has to cover every file, not just the one the topic is about.**
- **corrected** two prose semicolons a mechanical style pass had eaten. To match the tree's
  no-semicolon style I stripped every line-final `;` from the four hand-written phrase files — 129 of
  them — with a scratch script that did not distinguish code from prose. It reported its 36 ASI hazards
  honestly, and all 36 were benign. What it did not report was the damage it did inside doc comments:
  `types.ts` lost the semicolon after "`(string Qualifier, string Emphasis)`" and `engine.ts` the one
  after "the provider was swapped", each turning one sentence into two clauses that run together.
  **Instance nine of the same family** — an instrument that fails silently under a variable I did not
  set. What makes it worth an entry is how the scope was closed: not by re-reading four files hoping to
  spot a missing semicolon, but by **counting**. The script reported its removals per file (14 / 68 / 18
  / 29); counting the code statements that legitimately ended in `;` gave 13 / 68 / 18 / 28. Two files
  matched exactly and are therefore provably untouched in prose; the other two were over by exactly one,
  which is the whole population of possible damage and pinned it to the two lines already found. A
  denominator turned "probably fine" into a closed set.
- **conjectured** that a green golden suite was evidence the phrase port was correct. **refuted-by**
  claim 18 before the commit: 44 assertions over 38,904 fixture rows all passed on the *first* run, and
  both sides — the port and the specs — were written by me from the same source tree in the same
  sitting, so the suite agreeing with the port is partly the suite agreeing with itself. Twelve injected
  defects settled it, and the eleventh result was the useful one: **the o'clock guard could be disabled
  with no test noticing**, because for `en-classic`'s own template that branch is identical to the
  fallback in the C# as well. So the suite was right and my *comment* was wrong — it claimed the guard
  prevented an outcome that template can never produce. Fixed the comment, kept the branch (it is live
  for any template ending in an hour token), and pinned that case directly, which took the run to 12/12.
  Recorded because the finding was only reachable by trying to break a suite that had just gone green.
- **conjectured**, in a commit message — which is what makes it worth an entry rather than a quiet fix —
  that `e6bfa77` had removed the temperature feature from the port. Its body states "The four temperature
  fields leave `StatsSample` entirely rather than being stubbed at `-1`", in the present tense, as a
  description of its own tree. **refuted-by** `git show --stat e6bfa77`: it touched `.gitattributes`, the
  plan, this ISA, `electron/package.json`, `FuzzyClock.Temps/`, `probe-sidecar.ts` and fixtures, and never
  `shared.ts`, `main.ts` or `renderer.ts` — all three of which still carried `Temperatures`,
  `EMPTY_TEMPS`, the `temps` field, `formatTemps()` and a `#temps` SVG node. **The sentence was true of
  the decision and false of the commit**, and the distinction is not pedantry: a message is the only
  record most readers will consult, so that commit published a deletion nobody could find, in the same
  breath as arguing that a half-removed feature "reads as working to the next person in the tree." Its
  own reasoning applied to itself. Fixed by finishing the deletion here rather than by softening the
  message, since the message describes what should be true and now is. **The general form, which has bitten
  the Feed work too:** a claim about a *tree* must be checked against `--stat`, not against intent — the
  work item was authorized, planned, written up in three documents and simply never carried out in code,
  and every document read as though it had been.
- **conjectured**, in `uptime.ts`'s own doc comment, that `Math.floor` in place of `Math.trunc` would
  read a -300s span as "up -1d 23h 55m" and invent a day that does not exist. **refuted-by** the
  mutation run: that exact substitution **survived**, because JS `%` already keeps the sign of the
  dividend, so the floored and truncated forms agree on every positive input and on any negative one
  whose quotient is already an integer — and -300s is exactly that. The real difference needs a
  sub-minute remainder (-330s reads -5m truncated, -6m floored), which is now the case the test pins,
  taking the run to 8/8. **Second time a surviving mutant has been a finding about a comment rather than
  a gap in a test** (the first was the o'clock guard), and the shape is the same both times: the code was
  right, the *reason given for it* was wrong, and only an attempt to break it could tell them apart. On
  the days and hours lines the two functions are equivalent for every reachable input — a negative
  component fails the `> 0` guard whichever way it rounded — so that is recorded as having nothing for a
  test to hold, rather than left looking like missing coverage.
- **conjectured** that `phrase-wrap.test.ts` held the port to case-insensitive marker matching, asserting
  `computeSplit("HALF PAST ELEVEN", "natural")` is `"HALF PAST"` / `"ELEVEN"`. **refuted-by** the
  mutation run: deleting the `.toLowerCase()` from `startsWithIgnoreCase` left the suite **green**. With
  the fold gone no marker matches, the midpoint fallback runs, and for that phrase it returns the same
  two lines — mid 8, boundaries at 5 and 10, the nearer one splitting after "PAST". The assertion was
  right about the values and blind to the mechanism, so a case-*sensitive* implementation passed it.
  Replaced with "ALMOST A QUARTER BEFORE TWELVE", where natural gives `"ALMOST A QUARTER BEFORE"` /
  `"TWELVE"` and midpoint gives `"ALMOST A QUARTER"` / `"BEFORE TWELVE"` — both measured against the
  compiled C# — and the midpoint answer is pinned as the one it must not be. M13 dies on the replacement.
  **What makes this the sharpest instance yet: the very same coincidence is labelled two tests above, in
  my own words** — the `allowNatural=false` case is annotated "same answer here, by coincidence", which is
  why the C# suite pairs it with a second phrase where the paths diverge. I wrote that down, then chose a
  phrase with the identical defect for the case-folding test one screen later. Reading carefully is not a
  substitute for trying to break it; a green suite and a correct-looking assertion agreed with each other
  and were both uninformative.
- **criterion-now** a mutation run reports **predicted** and **unpredicted** survivors separately, with
  the reason for each prediction written before execution. Equivalent mutants are unavoidable — three of
  the four survivors across these two modules are genuinely equivalent — but naming them in advance is
  what distinguishes understanding the code from rationalising a result, and it is what made the fourth
  one visible as a finding within seconds instead of being explained away in the same paragraph as the
  other three. Masked pairs are covered by a third mutation that applies both edits at once, so two
  mutually-masking survivors cannot be reported as a coverage gap when the combination is in fact caught.
- **conjectured** that grey 187 is the first background whose relative luminance exceeds 0.5, and wrote
  the `adjustAccent` direction test around a 186/187 pair. **refuted-by** the suite failing on the spot:
  187 is 0.49693299506087041, and 188 at 0.50288645803256871 is the first above. I had solved
  `0.2126 + 0.7152 + 0.0722 = 1` times a linearized channel in my head instead of asking the probe for the
  crossover, which is a two-line loop it can run over all 256 greys. **Then did it again in the fix**: I
  assumed a mid-grey accent (128) would adjust in both directions one background step apart, and it
  exhausts all eight steps on 187, so that assertion failed too. Measured properly, accent 60 darkens to
  47 on background 188 and lightens to 73 on background 187 — opposite directions one step apart, which
  is a far tighter pin on the `> 0.5` constant than the pair I was reaching for. Both mistakes are now in
  the test's own comment, because the pattern is the interesting part: **two consecutive derived values,
  both wrong, both cheap to measure, and the oracle was already compiled and sitting there.** The suite
  caught them, so nothing shipped — but a derivation that agrees with itself is exactly what the oracle
  exists to replace.
- **conjectured** that every `>=`/`>` in `contrast.ts` that survived mutation was an unreachable
  threshold tie, and that this was the whole story for the file's survivors. **refuted-by** M5 surviving
  **unpredicted**: dropping `&& currentState === "override"` from the hysteresis exit guard left the suite
  green, and it is not a tie at all. It is a genuinely redundant guard — a ratio above 5.5 is also above
  4.5, so an incoming `"normal"` that skips the exit rule is caught by the next rule and returns the
  identical pair. **This is a new class among the equivalent mutants found so far**: the previous four
  were about a wrong comment (three) and a vacuous assertion (one); this one is about production logic
  that provably cannot change an answer. The discriminator against "so delete it" is M7, which removes the
  same state test from the guard *below* and is caught — so the two tests are not interchangeable, and the
  redundant one earns its place by naming which of the two hysteresis rules a reader is in. Fixed by
  documenting the guard, asserting the equivalence as a sweep, and promoting M5 to a predicted survivor;
  the second run reports zero unpredicted survivors and zero refuted predictions.
- **conjectured** that a phrase provider's segment key carries the *minute* the bucket covers, and wrote
  the universal probe's to-hour classifier as `/:(40|45|50|55)$/`. **refuted-by** the probe's own first
  run: 243 counter-examples on one property and 246 on another, from a check I had written expecting zero.
  Keys are bucket **indices** — `en-classic:0` is minutes 00-02 and `en-classic:10` is 48-52 — so that
  regex matched nothing that names the next hour and every to-hour bucket got classified as a
  current-hour one. Diagnosed by dumping the key→minute mapping rather than re-reading the regex, and the
  fix is `bucketIndex(segKey) >= 8`. All five universals then held. **The lesson is which way the failure
  pointed**: 489 counter-examples on a property I expected to hold is the shape of a broken instrument,
  not of a broken port, and treating it as the latter would have "fixed" the tables. A probe that had
  reported *two* counter-examples is the dangerous version of this mistake.
- **conjectured**, having measured the o'clock qualifier split off the fixture as 36 empty against 24
  non-empty, that asserting `2 * 33` and `2 * 22` recorded the measurement. **refuted-by** reading it
  back: the numbers are right and the assertion is still bad, because it makes a reader redo arithmetic
  to learn what is being claimed, and it is the *second* time this session a derived value went into an
  assertion. Re-measured the split per hour12 instead — uniformly 3 empty / 2 non-empty for all twelve —
  and the test now asserts that per bucket via `toEqual({ hour, empty: 3, nonEmpty: 2 })`, which also
  names the hour in the failure message. Mutation M18 (fallback qualifier forced non-empty) confirms this
  addition is the only thing in the file that catches it: it is 3/2 → 1/4, invisible to a total.
- **conjectured** in the mutation harness that M18 would survive and that `phrase-factories.test.ts`
  would catch M17, and wrote both predictions before running. **Both were checked instead of trusted, and
  one of them changed before the run.** Tracing en-classic's bucket 0 showed that two of its five
  candidates end in no hour token and so reach the structured fallback, which is exactly where the
  measured 3-empty / 2-non-empty split comes from — so M18 is *caught*, and the prediction was rewritten
  with that trace as its reason rather than left to be refuted by the run. M17's prediction named a third
  file, so it was run: `phrase-factories.test.ts:96` fails, and the full suite catches M17 while the
  golden suite alone does not. **A prediction naming a file is a claim about that file, and it costs one
  command to stop guessing.** Net: 0 refuted predictions across 28 mutations, and the one mutation that
  survives everything is proved equivalent rather than reported as coverage.
- **conjectured** that `SegmentKeyTests`' cross-provider case could be translated straight to its own
  comment — “locale prefix prevents cross-provider key collision” — as a universal over all 18 locales.
  **refuted-by** the golden segment fixture before the test was written: only ten locales carry a
  prefix, and among the other eight **ja-classic and ja-terse emit an identical segment key on 650 of
  1440 minutes**. No other pair of the 18 collides. So the universal was split — the guarantee asserted
  over the ten prefixed locales, the collision asserted as that exact number. **The exact number is not
  decoration**: mutations M8 and M9 both abolish phrase-mode and leave the eight collision-free, so a
  softer “they sometimes collide” would have passed both. The alternative reading — that the port should
  prefix all 18 and remove the collision — was rejected: it looks more correct and diverges from the
  original silently.
- **conjectured** that asserting each `[DataRow]`'s bucket relationship (`bucketOf(m2) === bucketOf(m1)
  + 1`) strengthened the C#'s bare “the two keys differ”. **refuted-by** reading it back before the
  mutation run: `bucketOf` is a lookup into the recorded bounds, so both sides of the comparison came
  from the same constants and no provider could fail it. Rewrote both helpers to locate the run
  containing the minute by walking the provider's own 60 keys, then assert that m1 ends its run, m2
  starts the next, and both runs span the recorded buckets. **The rewrite is what makes M7 and M14
  die** — shifting every boundary to an exclusive bound, and giving en-terse a 12th bucket. Third time
  this ISA has caught a value doing duty as both the expectation and the measurement, so it is now a
  Decision rather than a note.
- **measured, and the C# corroborated it afterwards.** The per-locale bucket bounds were read off the
  fixture rather than the port, which is what turned up **en-terse having 11 buckets where the other
  nine have 12** — 23-32 as one span, no separate “almost half past”. The corroboration is that
  `TerseSegmentKeyTests` is the only one of the four classes whose bucket-5-vs-6 `[DataRow]` reads
  `(3, 32, 3, 33)` where the others read `(3, 27, 3, 28)`: the C# author knew, and encoded it in a
  DataRow without ever writing it down. A translation that had carried the 12-bucket bounds to all ten
  locales would have failed on en-terse with no explanation in the diff.
- **conjectured** that `SettingsStore`'s documented "`legacyPath: null` disables the import entirely"
  was true, since the doc comment and the branch guarding it (`this.legacyPath !== null`) both read
  correctly. **refuted-by** its own first test run: three arms expecting `origin === "defaults"`
  returned `"wpf-import"`. The constructor resolved the default with `options.legacyPath ??
  legacyWpfSettingsPath()`, and `??` cannot tell an explicit `null` from an absent property — so the
  documented opt-out was **unreachable**, and on Windows every caller that passed null was reading
  Alex's live `%LOCALAPPDATA%\FuzzyClock\settings.json`. Fixed to `=== undefined`, which is the only
  form that keeps *both* halves: `main.ts` omits the option and must still import. **Two things this run
  got right by accident and one it got right on purpose.** By accident: nothing wrote that file, so the
  read-only constraint on it held. On purpose: `test/settings-store.test.ts` passes `legacyPath`
  explicitly in all 35 of its tests *including the null cases*, and its header says why — a test whose
  result depends on his live configuration passes here and fails everywhere else. Without that rule the
  three reds would have been three quiet greens on this machine. **The reverse direction was checked in
  the same run:** two other failures in `test/window-placement.test.ts` were MY arithmetic, not the
  implementation's — a dead-space assertion placed on `displayForRect`, whose third arm is the primary
  so it never answers null while a display exists, and a snap width of 3500 where the right-edge arm
  needs |−75 + w − 3440| ≤ 8. Both were fixed in the test, with the reason recorded in place. Same rule
  18, applied in both directions in one run, which is the only way it means anything.
- **measured, against a prediction the plan wrote a day earlier.** ISC-7.1 read Alex's settings file and
  predicted the import would have to drop one entry — `display5` at (−227, 510), off every connected
  display. The live app, run into an empty profile, reported exactly `1 position re-keyed, 1 dropped, 6
  keys ignored, 0 unrecognised`, and then placed itself at (3188, 20) because `LastActiveMonitor` named
  the entry that was dropped. **The fallback is what makes the number checkable**: 3188 = 3440 − 232 −
  20 is the work-area width less the window less `FIRST_RUN_PADDING_PX`, so the arithmetic only
  reconciles if the padding, the window size and the work area are all what the C# says. A prediction
  from reading, confirmed by running, on the same file — and the file was never written.
