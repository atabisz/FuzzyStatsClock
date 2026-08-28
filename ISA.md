---
task: "FuzzyClock v5.0 — port the WPF/.NET overlay to a cross-platform Electron + SVG overlay, on a branch, merging to master and deleting the WPF version at parity"
slug: fuzzyclock-v5-electron-port
project: FuzzyStatsClock
principal_stated_goal: "Lets do this work in a different branch, when complete we'll move it to the main branch and remove the wpf version. Create the branch and begin work"
phase: build
progress: 10/34
mode: interactive
started: 2026-08-28T14:36:40+10:00
updated: 2026-08-28T19:24:00+10:00
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

- [ ] **ISC-11. `FuzzyClock.Core` is translated in full, and the denominator is the measured one —
  re-measured after Option C, because a stale denominator is how a deletion turns into missing work.**
  **27 files / 2,467 LOC = 1,987 across 18 phrase providers + 480 across 9 logic files.** Was 28 files
  / 2,510 = 1,987 + 523 across 10; `TemperatureFormatter.cs` (43 LOC) is deleted under Option C, so it
  is not a file left to translate and must not be counted as one. The phrase-provider half is
  untouched — temps never entered it.
- [ ] **ISC-12. ≥457 translated Core tests pass under `bun test`.** Was ≥469; `TemperatureFormatterTests.cs`
  contributes **12** of those cases and retires with the feature. Translated alongside each unit, not
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

- [ ] **ISC-27. All 15 telemetry cells resolve.** Was 18; the three temperature cells retire with
  Option C. Each shows a live number on its platform or renders `--` through the existing `-1` sentinel
  path. Two rows moved under ISC-10's M7 and the claim inherits both: **macOS MEM must come from
  `vm_stat`, not `os.freemem()`** (which read 3.1% free on a healthy 8GB Mac), and **macOS GPU% may
  resolve after all** via unprivileged `ioreg -c AGXAccelerator` — a candidate, not an adoption, so the
  `-1` path stays reachable and tested on that cell rather than being treated as dead code.
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
  UI row.
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

### Still outstanding

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
  rather than carrying this number forward.
- **The mac `dmg` and linux `AppImage` targets are configured but never built.** They cannot be built
  from this host, so their sizes are unknown — not estimated, unknown. Whoever runs ISC-10's hosts
  should run `probe:size` there too, since the artefacts differ enough per platform that a Windows
  figure predicts little.
- **`probe-size.ts` cannot run on a fresh clone.** `installer/` and `publish/` are gitignored, so C2
  and C3 return INCONCLUSIVE without a local WPF build. That is the intended degradation — they say so
  rather than passing — but it means the ISC-8 figures are reproducible only on a machine that has
  built both sides.

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
