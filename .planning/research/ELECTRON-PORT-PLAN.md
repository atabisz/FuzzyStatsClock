# Port Plan — FuzzyClock as a cross-platform Electron overlay with an SVG display

**Project:** FuzzyClock v5.0 — rewrite the WPF/.NET 10 Windows overlay as an Electron desktop overlay with an SVG-rendered display, targeting Windows + macOS + Linux
**Researched:** 2026-08-28
**Base:** `ca61130` (clean tree at planning time)
**Confidence:** **HIGH** on the Windows arms, the API surface, and the cost figures — all measured on this machine or read from Electron 33.4.11's own typings. **LOW on every macOS and Linux *behavioural* arm** — no Mac and no Linux box was touched. Rows in this document are tagged `[MEASURED]`, `[TYPED]` (the API exists and Electron annotates it for that platform) or `[UNPROBED]`. Treat `[TYPED]` as "will compile and is documented to exist", never as "works".

---

## TL;DR for the Roadmapper

- **The port is feasible and the resource argument runs *toward* Electron, not against it.** WPF Release idles at **24.2% of one core** with a 326MB working set; a live Electron overlay on this machine idles at **3.5% of one core** with 310MB. The existing self-contained exe is **200MB** and the Inno installer **57MB**. `[MEASURED]`
- **The cheap alternative died with this requirement.** WebView2 hosted inside the existing WPF shell reaches the SVG-display goal for roughly a tenth of the work — and it is Windows-only. Asking for macOS and Linux is what makes the full Electron rewrite the only path.
- **Linux is the *easiest* telemetry platform of the three, not the hardest.** CPU, memory, swap, battery and **temperatures** are all unprivileged reads under `/proc` and `/sys`. Windows needs a long-lived `typeperf` child plus a ring-0 driver for temps. **macOS is the hard one** — no unprivileged temperature source and no GPU utilisation without root `powermetrics`.
- **Exactly two capabilities are declared absent on Linux by Electron's own typings**, and they are the only hard API gaps in the whole port: `setLoginItemSettings` (`@platform darwin,win32`) → auto-launch needs a hand-written `.desktop` file; `setContentProtection` (`@platform darwin,win32`) → no self-exclusion from screen capture, which is auto-contrast's feedback-loop guard. Everything else is present-but-unproven, a cheaper class of problem.
- **One decision gates the plan and only Alex can make it: temperatures.** See § The one decision below.
- **Do not build the shell first.** The overlay window, tray, click-through and ghost-mode designs are already proven in `~/code/garry-desktop`, so building them first *feels* like progress while learning nothing. **Phase 1 is the telemetry spike, and it is the go/no-go.**
- **Cost centre is not the shell and not the display.** It is 2,510 LOC of `FuzzyClock.Core` plus **633 tests** (469 Core + 164 App) to re-earn, and the three Windows telemetry paths.

---

## The one decision

**What happens to CPU/GPU/motherboard/NVMe temperatures?**

`FuzzyClock.App/TemperatureService.cs` is built on `LibreHardwareMonitorLib 0.9.6` — a .NET library plus a ring-0 WinRing0 driver. There is no Node equivalent and there is no unprivileged Windows API that reads real sensor temperatures (`MSAcpi_ThermalZoneTemperature` is unimplemented or meaningless on most desktops). `[MEASURED: TemperatureService.cs:13, FuzzyClock.App.csproj:15]`

| Option | Windows | macOS | Linux | Cost |
|---|---|---|---|---|
| **A. Sidecar (recommended)** | Full fidelity — keep LHM in a ~100-line .NET console app writing one JSON line per 2s to stdout | `--` (unavailable) | Full fidelity via `/sys/class/hwmon` | One extra build target; Windows installer carries a self-contained trimmed sidecar. **Size is a Phase 1 measurement, not an assertion.** |
| **B. Linux only** | `--` (regression on the primary platform) | `--` | Full fidelity | Cheapest. Loses a v4.2 feature where it is most used. |
| **C. Drop temps** | `--` | `--` | `--` | Cheapest of all; deletes a shipped feature and its settings UI. |
| **D. `nvidia-smi` for GPU temp only** | GPU temp only, NVIDIA only | same | same | Nearly free — `nvidia-smi` is present here and answers in 0.378s `[MEASURED]` — but vendor-locked and no CPU/mobo/NVMe. |

**Recommendation: A.** The sidecar is the one place a second language earns its keep — the logic already exists, the process boundary naturally isolates the **608ms mean `Update()` cost** the WPF app already worked around with a dedicated 2s loop `[MEASURED: TemperatureService.cs header]`, and .NET never ships to macOS or Linux. **A is not free and its size is unknown; Phase 1 produces the number before this is committed to.**

Everything downstream of this decision is unaffected: the stats panel already renders `-1f` as unavailable, so a platform with no temperature source degrades through a path that already exists and is already tested.

---

## Target architecture

Keep the repo. Add a new tree; retire the WPF projects only after parity. That way the shipping app keeps shipping, and the C# tests remain a live oracle to translate against rather than a memory.

```
FuzzyStatsClock/
  FuzzyClock.Core/          # unchanged during the port — the specification
  FuzzyClock.App/           # unchanged during the port — the fallback
  FuzzyClock.Core.Tests/    # 469 tests — the spec to translate
  FuzzyClock.App.Tests/     # 164 tests
  electron/
    src/
      core/                 # direct TS translation of FuzzyClock.Core (pure, no platform deps)
      main/
        window.ts           # overlay shell: flags, position, opacity
        tray.ts
        settings.ts         # app.getPath('userData')/settings.json
        ghost.ts            # cursor poll + proximity ratio
        telemetry/
          index.ts          # StatsSource interface + platform selection
          win32.ts          # typeperf child + optional .NET sidecar
          darwin.ts         # sysctl / pmset / vm_stat
          linux.ts          # /proc, /sys, hwmon
          parse/            # PURE parsers — the whole point, see § Test strategy
      renderer/
        display/            # phrase | dial | lcd | nixie — SVG
        stats/              # the stats panel
      platform.ts           # IS_WIN / IS_MAC / IS_LINUX seam, no Electron import
      shared.ts             # types crossing the preload bridge
    sidecar/                # (Option A only) .NET console temp reader, win32-only
    test/                   # bun test — translated Core tests + fixture-driven parser tests
```

**Follow `garry-desktop/src/platform.ts` literally as the seam pattern.** It already holds the three branch points that matter and it takes **no Electron import, not even a type one**, so a `bun` probe can load it with no Electron on the path. That property is what makes the platform logic unit-testable on any OS. `[MEASURED: garry-desktop/src/platform.ts:1-19]`

### Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | **Electron 33** | 33.4.11 is already on this machine and the overlay flags are proven against it `[MEASURED]`. Do not chase latest during a port. |
| Language | TypeScript | — |
| Build | **`bun build`**, three entry points (main / preload / renderer) | Exactly `garry-desktop`'s shipped toolchain — no webpack, no vite, no ceremony `[MEASURED: garry-desktop/package.json]` |
| Tests | **`bun test`** | The 469 Core tests are pure logic with no DOM. Zero config. |
| Packaging | **electron-builder** — NSIS (win), dmg + zip (mac), AppImage + deb (linux) | **New work with zero precedent in his tree**: `garry-desktop/package.json` has no packaging dependency and no `dist:*` script `[MEASURED]` |

---

## The telemetry seam

One interface, three implementations, **and the `-1` unavailable sentinel is kept from the WPF app** so the renderer's degradation path ports unchanged:

```ts
export interface StatsSample {
  cpu: number      // 0-100, -1 unavailable
  mem: number
  gpu: number
  pag: number      // swap / pagefile
  battery: number
  temps: { cpu: number; gpu: number; mobo: number; nvme: number }
  uptimeSec: number
}
```

18 cells, every one filled — a source or an explicit `-1`:

| Metric | Windows | macOS | Linux |
|---|---|---|---|
| **CPU %** | `os.cpus()` delta `[TYPED]` | `os.cpus()` delta `[TYPED]` | `os.cpus()` or `/proc/stat` `[TYPED]` |
| **MEM %** | `Memory\% Committed Bytes In Use` via `typeperf` child `[MEASURED]` — see the semantics warning below | `os.totalmem/freemem` + `vm_stat` for the compressor `[UNPROBED]` | `/proc/meminfo` `MemAvailable` `[UNPROBED]` |
| **Swap / PAG %** | `Paging File(_Total)\% Usage` via the same child `[MEASURED]` | `sysctl vm.swapusage` `[UNPROBED]` | `/proc/meminfo` `SwapTotal`−`SwapFree` `[UNPROBED]` |
| **GPU %** | `GPU Engine(*engtype_3D)\Utilization Percentage` via the child `[MEASURED — with a defect, below]` | **`-1`** — needs root `powermetrics`; no unprivileged API `[UNPROBED]` | `/sys/class/drm/card*/device/gpu_busy_percent` (amdgpu) → `nvidia-smi` → else `-1` `[UNPROBED]` |
| **Battery %** | `Get-CimInstance Win32_Battery`, polled at 60s `[UNPROBED]` — `powerMonitor.isOnBatteryPower()` returns only a boolean, no percentage `[MEASURED: electron.d.ts:10033]` | `pmset -g batt`, 60s `[UNPROBED]` | `/sys/class/power_supply/BAT*/capacity` `[UNPROBED]` |
| **Temps** | LHM sidecar, 2s (Option A) `[MEASURED: 608ms mean per read]` | **`-1`** `[UNPROBED]` | `/sys/class/hwmon/*/temp*_input` — unprivileged, no driver `[UNPROBED]` |
| *(Uptime)* | `os.uptime()` `[TYPED]` | `os.uptime()` `[TYPED]` | `os.uptime()` `[TYPED]` |

### Three rules that fall out of the measurements

**1. Poll cadence is per-metric, not global.** Per-tick shell-outs are ruled out by measurement: a one-shot `typeperf` sample costs **2.81s** wall and `Get-Counter` **2.55s**, against a bare process start of 0.17s / 0.51s `[MEASURED]` — untenable at the app's 1s interval, let alone its 0.5s hover fast-refresh. But a metric that moves slowly does not need the tick:

| Cadence | Metrics | Mechanism |
|---|---|---|
| 1s (0.5s on hover) | CPU, MEM, GPU, PAG | **one long-lived child**, streaming |
| 2s | temps | sidecar, its own process (mirrors the WPF app's existing `BackgroundLoopIntervalMs = 2000`) |
| 60s | battery | spawn-per-poll is fine at this cadence |
| free | uptime | in-process |

**2. The Windows child works, including the GPU wildcard, and has one known fidelity defect.** `typeperf "\GPU Engine(*engtype_3D)\Utilization Percentage" -si 1` streams CSV and accepts the wildcard, but returned 0.000000 while `nvidia-smi` read 10% in the same minute: **PDH resolves instance names at spawn, so GPU engines belonging to processes started later are invisible** `[MEASURED, with a positive control — the `\Processor(_Total)` column in the same run moved, so the child was live]`. Design consequence: the child must be **periodically recycled**, or the GPU counter re-enumerated, exactly as `StatsService.cs:159-176` already does in-process on `InvalidOperationException`. Carry that behaviour across; do not rediscover it.

**3. `MEM` means something different if you take the easy road.** The WPF app reports **commit charge** (`% Committed Bytes In Use`), which read 97.5% here. `os.freemem()` reports *physical* free. Those are different numbers about different things, and swapping one for the other silently changes what the widget says. If the counter child is dropped on Windows, the settings UI and the docs have to say "physical", not "committed".

---

## Feature port table

| Feature | Port path | Degradation |
|---|---|---|
| Frameless transparent always-on-top overlay | `transparent`, `frame: false`, `skipTaskbar`, `hasShadow: false`, `setAlwaysOnTop(true,"screen-saver")` `[MEASURED: garry-desktop/src/main.ts:179-228]` | none known |
| Kept out of Alt-Tab / Cmd-Tab | win/linux `type: "toolbar"`; macOS `app.dock.hide()` (accessory activation policy) `[MEASURED: garry-desktop/src/platform.ts:43-60]` | none known |
| Visible over a maximised window | win: `screen-saver` level; mac: `setVisibleOnAllWorkspaces(true)` `[MEASURED: platform.ts:70-78]` | **Linux WM-dependent** — his own comment declines to assert it `[UNPROBED]` |
| Click-through | `setIgnoreMouseEvents(true, {forward: true})` `[TYPED]` | **Never rely on the `forward` mousemove path** — measured delivering *zero* events on his 3440×1440 primary `[MEASURED: garry-desktop/src/shared.ts:156-167]`. Poll the cursor instead. |
| Ghost mode (proximity fade) | main polls the cursor, computes the Chebyshev proximity ratio, pushes the *target* over IPC; renderer owns the interpolation | none — **both codebases independently arrived at cursor polling**, so the design transfers 1:1. `GhostModeController.ComputeProximityRatio` and `LerpRatio` are already pure static seams and port verbatim `[MEASURED]` |
| Right-click menu on the overlay | renderer-measured hit boxes → `ipcMain` → toggle `setIgnoreMouseEvents` wholesale `[MEASURED: garry-desktop/src/main.ts:539-556]` | The WPF `Background="#01000000"` alpha=1 hit-test trick has no analogue and needs none — CSS hit-testing works on fully transparent regions with `pointer-events`. |
| Tray icon + menu | `Tray` + `Menu` `[TYPED]` | **Linux click semantics differ** — the typings note the click event fires on "activation", and Linux needs libappindicator present `[MEASURED: electron.d.ts:13228]` |
| Settings window | second `BrowserWindow` | none — this gets *easier* (521 LOC of XAML → HTML/CSS) |
| Per-monitor position memory | `screen.getAllDisplays()`, key on `Display.label`, falling back to a composite of `size`+`workArea`+`scaleFactor`+`internal` `[TYPED: electron.d.ts:7440 "User-friendly label, determined by the platform"]` | Replaces `MonitorService`'s `QueryDisplayConfig` friendly names. **`label` stability is `[UNPROBED]` — Phase 1 item.** The composite fallback exists because "determined by the platform" is not a stability guarantee. |
| Per-monitor DPI | `Display.scaleFactor` `[TYPED: electron.d.ts:7461]` | none — replaces `GetDpiForMonitor` |
| Opacity | CSS `opacity` in the renderer, **not** `win.setOpacity()` | This is an *improvement*, see below |
| Auto-launch | `app.setLoginItemSettings` `[MEASURED: electron.d.ts:1634 — @platform darwin,win32]` | **No Linux API.** Write `~/.config/autostart/fuzzyclock.desktop` by hand. Also: **CrowdStrike Falcon blocks `garry-desktop`'s autostart spawn pair on this machine** — a packaged installer is a different case, but this must be re-proven, not assumed. |
| Update check (GitHub Releases) | `net.request` or `fetch`; `UpdateVersionComparer.cs` is 57 LOC of pure logic | none |
| Auto-contrast (screen sampling) | `desktopCapturer.getSources({types:['screen'], thumbnailSize})` + `setContentProtection(true)` to exclude our own window from the capture | **This is the elegant win and the platform casualty at once.** `setContentProtection` uses `WDA_EXCLUDEFROMCAPTURE` on Win10 2004+, and is `@platform darwin,win32` `[MEASURED: electron.d.ts:2998-3004]`. Excluding our own window replaces the entire `ContrastRefreshController.HasAppWindowBeneath()` Z-order walk that exists solely to stop a BitBlt feedback loop. **On Linux there is no exclusion, so the feedback loop returns** → ship Linux with auto-contrast off. macOS additionally needs a Screen Recording TCC grant. **Low priority regardless: his live settings have `AutoContrastEnabled: false`** `[MEASURED]`. |

### Two places the port should be *better* than the original

**1. The fade may stop freezing under load.** `.planning/STATE.md` still carries v4.4 **PERF-01** — the ghost fade freezing under 25–50% CPU load — deferred to v4.6+. Do the fade as **CSS `opacity` on the renderer's compositor**, driven by a `requestAnimationFrame` loop that owns the interpolation, with main pushing only the *target* ratio at ~80ms. `LerpRatio` is already frame-rate-independent (`alpha = 15.0`), so it drops straight into the rAF loop. A compositor-thread opacity animation does not stall when the main process is busy; `win.setOpacity()` would. **Carry PERF-01 as a claim on this port rather than a hope.**

**2. The display becomes native to the medium.** The dial is a `Canvas` 80×80 with two `Line` hands about centre (40,40) and `DialGeometry.cs` is **19 LOC** `[MEASURED]`; LCD is `SevenSegmentEncoder.cs`, **27 LOC**. Both are more natural as SVG than as XAML.

**The one hard SVG performance rule, from his own measured work:** `transform` and `opacity` are **composited**; `r`, `rx`, `ry`, `cx`, `cy` and `d` **re-rasterise every frame**. So animate the clock hands with `transform="rotate(θ)"` on a `<g>`, never by rewriting `x2`/`y2` on a `<line>`; and build the Nixie glow as a static SVG filter, not a per-frame geometry change.

---

## Linux scope

**Target X11 / XWayland for 1.0. Native Wayland is out of scope.** Three mechanisms drive that, all `[UNPROBED]` here and all needing a real Wayland session to settle:

1. **Window placement is compositor-owned under Wayland** — a client cannot set its own absolute position, which is the whole basis of a draggable, per-monitor-remembered overlay.
2. **Global cursor position** — `screen.getCursorScreenPoint()` carries no `@platform` restriction `[MEASURED: electron.d.ts:10864, and the annotation demonstrably appears elsewhere in the same file, so its absence is information]`, but Wayland has no protocol for a client to query the pointer outside its own surface. Ghost mode is built on exactly that query.
3. **No capture self-exclusion** (see the table) plus a per-session portal prompt for any screen capture.

**Mitigation:** `app.commandLine.appendSwitch('ozone-platform', 'x11')` to force XWayland, where all three work as on X11. Ship that, document it, and revisit native Wayland only if someone asks.

---

## macOS specifics

- `app.dock.hide()` after `whenReady()` for accessory-app behaviour; `setVisibleOnAllWorkspaces(true)` for the "over a fullscreen app" trait `[MEASURED: platform.ts]`
- **No temperatures and no GPU utilisation without root.** Two `--` cells in the stats panel by design, not by omission.
- **Notarization is a new, recurring cost that does not exist today:** an Apple Developer ID (currently ~USD 99/yr). Without it, macOS users hit Gatekeeper on first launch. This is a real line item, not a technical footnote.
- Screen Recording TCC prompt if auto-contrast is ever enabled there.

---

## Phases

Ordered **risk-first**. The largest block of code (Core translation) is deliberately *second*, because it carries zero platform risk — putting it first would burn the biggest budget before knowing whether the premise holds.

### Phase 0 — Decide (no code)
Four calls, all Alex's: the temps option (A/B/C/D), Linux = XWayland-only yes/no, auto-contrast in or out of 1.0, and whether WPF is retired at parity or kept as the Windows build.
**Exits on:** the four answers written into this document.

### Phase 1 — Telemetry + platform spike — **THE GO/NO-GO**
- **P1.1** Electron window running a 1s stat repaint **plus** the long-lived `typeperf` child, measured over 20s for CPU% and RSS. *(This is the feasibility run's first `[DEFERRED-VERIFY]`: the 3.5% Electron figure was measured on a **parked** overlay — it bounds Electron's floor, it does not predict this port's cost.)* **If this exceeds 24.2% of one core, the premise dies here.**
- **P1.2** Long-lived `typeperf` child: CSV parse, and prove the GPU-instance recycle actually recovers a counter that read 0 at spawn.
- **P1.3** *(Option A only)* Sidecar prototype — **measure its packaged size and per-read latency.**
- **P1.4** `screen.getAllDisplays()` on his 3-display setup: is `Display.label` non-empty and stable across a reboot? *(Second `[DEFERRED-VERIFY]` carried in.)*
- **P1.5** One `electron-builder` run to get a **real** installer size against the measured 200MB exe / 57MB Inno installer. *(Third `[DEFERRED-VERIFY]`; the ~85MB figure quoted during feasibility is a prior, not a measurement.)*
- **P1.6** Smoke the shell flags on macOS and on an X11 Linux session — the *only* way the `[UNPROBED]` rows in this document become real. `mcp__mac-codex__codex` can cover the macOS half from here.

**Exits on:** measured CPU%/RSS for the real workload, a sidecar size number, a `display.label` reading, an installer size, and a per-platform smoke result. Any `[UNPROBED]` row still unprobed after this phase is a row that will be discovered in Phase 6 instead.

### Phase 2 — Core translation
28 files / 2,510 LOC → TS, and it splits **1,987 LOC across 18 phrase-provider files (79% — table data, mechanical)** against **523 LOC of real logic across 10 files** `[MEASURED]`. Translate the 469 `FuzzyClock.Core.Tests` cases to `bun test` **as the translation proceeds**, provider by provider — they are the specification, and translating them afterwards converts a spec into a rubber stamp.
**Exits on:** ≥469 green in `bun test`, and every phrase provider's output byte-identical to the C# original for a full 24h × all-locales × all-styles sweep (a generated golden file from the C# side is the cheapest oracle).

### Phase 3 — Shell
Window flags, tray, settings persistence at `app.getPath('userData')` (with a one-time import of the existing `%LOCALAPPDATA%\FuzzyClock\settings.json`), per-monitor position, drag-to-move. Crib from `garry-desktop`.
**Exits on:** on all three platforms — window visible, absent from taskbar/dock and from Alt-Tab/Cmd-Tab, position survives a restart and a display-configuration change.

### Phase 4 — SVG display
Phrase, dial, LCD, Nixie. Obey the composited-property rule above.
**Exits on:** all four modes render at every theme; a frame scrub shows the dial hands moving via `transform` only.

### Phase 5 — Ghost mode
Cursor poll in main, proximity ratio, rAF lerp in the renderer, click-through toggle, configurable override.
**Exits on:** fade stays smooth under a synthetic 25–50% CPU load — i.e. **PERF-01 closed**, not deferred again.

### Phase 6 — Stats panel + per-platform sources
Wire the seam. Fixture-driven parsers first, live acquisition second.
**Exits on:** every one of the 18 cells either shows a live number on its platform or renders `--` through the existing `-1` path.

### Phase 7 — Packaging, auto-launch, update check
electron-builder × 3 targets; `setLoginItemSettings` on win/mac and a `.desktop` file on Linux; the GitHub Releases check.
**Exits on:** an installer per platform that installs, launches, auto-launches at login (**including a Falcon re-proof on Windows**), and reports an available update.

### Phase 8 — Auto-contrast *(optional — cut this first)*
`desktopCapturer` + `setContentProtection`. Off by default on Linux.
**Exits on:** contrast flips against a light and a dark background with **no feedback loop** — i.e. our own window provably absent from the captured thumbnail.

### Phase 9 — Retire WPF *(only if Phase 0 said so)*
Delete `FuzzyClock.App`, keep `FuzzyClock.Core` in git history, retarget the release workflow.
**Exits on:** the `.github/workflows/release.yml` REL-03 guard replaced with whatever guards the new build.

---

## Test strategy

**The insight that makes three platforms testable from one:** the per-platform sources become **pure parsers over captured fixtures**. Capture a real `/proc/meminfo`, a real `typeperf` CSV line, a real `pmset -g batt` block, a real `hwmon` tree once, check them in, and every parser is unit-testable on any OS. Only *acquisition* needs a real machine, and acquisition is a handful of lines per platform.

| Surface | How |
|---|---|
| `src/core/` (translated logic) | `bun test`, 1:1 with the 469 C# cases |
| Pure seams from the App layer (`ComputeProximityRatio`, `LerpRatio`, formatters, comparers) | `bun test` — these are already static and pure in C# |
| Per-platform parsers | fixture-driven, run on every platform in CI |
| Acquisition | one smoke test per platform in CI matrix (win/mac/linux runners), asserting a plausible range, not a value |
| Window/overlay traits | scripted probes in the `garry-desktop` style — the flag set read back off a live window, not off the source |

Of the 164 `FuzzyClock.App.Tests`, the pure-seam ones port directly; the Windows-service ones are *replaced* by the fixture parsers rather than translated. **Expect the final count to differ from 633 — say which cases were replaced and why, rather than quoting a number that looks like parity.**

---

## What the port costs and what it buys

**Buys:** one codebase on three platforms · ~20% of the idle CPU `[MEASURED, floor only]` · a display native to SVG · a plausible fix for PERF-01 · a far cheaper settings UI · auto-contrast's feedback-loop guard reduced from a Z-order walk to one API call (on 2 of 3 platforms).

**Costs:** 2,510 LOC of Core translated · 633 tests re-earned · 7,605 LOC of `FuzzyClock.App` deleted and ~2,500–3,000 LOC of TS written in its place · temps on Windows only via a second language · GPU and temps unavailable on macOS · auto-contrast unavailable on Linux · Wayland users on XWayland · an Apple Developer ID · three packaging targets with no precedent in his tree · CrowdStrike autostart re-proof.

---

## Evidence index

| Claim in this document | Source |
|---|---|
| WPF 24.2% of one core / 326MB WS; Electron 3.5% / 310MB | `TotalProcessorTime` deltas over 20s, **Release** build both sides, 2026-08-28 |
| 200,457,651-byte exe / 57,389,487-byte installer | `ls -la publish/ installer/` |
| Core 2,510 LOC = 1,987 (18 providers) + 523 (10 logic) | per-file `wc -l`, sums exactly |
| 633 tests (469 + 164) | `dotnet test FuzzyClock.slnx`, exit 0 — **README:92 (274) and `.planning/STATE.md:129` (621) are both stale** |
| 24 P/Invoke entry points across 6 files | signature-anchored multiline grep, 41 matching lines |
| temps: 608ms mean `Update()`, 4272ms `Computer.Open()` | `TemperatureService.cs` header — the spike's own recorded measurement |
| `typeperf` 2.81s / `Get-Counter` 2.55s one-shot; 0.17s / 0.51s bare start | 4 timed runs |
| GPU wildcard streams but reads 0 at spawn while `nvidia-smi` reads 10% | `typeperf -si 1 -sc 3` with a `\Processor(_Total)` positive control |
| `setLoginItemSettings` @platform darwin,win32 | `electron.d.ts:1634` |
| `setContentProtection` @platform darwin,win32, `WDA_EXCLUDEFROMCAPTURE` | `electron.d.ts:2998-3004` |
| `getCursorScreenPoint()` carries no platform restriction | `electron.d.ts:10864` |
| `powerMonitor.isOnBatteryPower()` is a boolean only | `electron.d.ts:10033` |
| `Display.label` / `.scaleFactor` exist | `electron.d.ts:7440`, `:7461` |
| Tray click differs on Linux | `electron.d.ts:13228` |
| Overlay flag set proven on this machine | `garry-desktop/src/main.ts:179-228` |
| macOS/Linux window seam | `garry-desktop/src/platform.ts:43-78` |
| `setIgnoreMouseEvents` forwarding measured delivering zero events | `garry-desktop/src/shared.ts:156-167` |
| No packaging precedent | `garry-desktop/package.json`, whole file |
| `AutoContrastEnabled: false` in his live settings | `%LOCALAPPDATA%\FuzzyClock\settings.json` |
| PERF-01 still deferred | `.planning/STATE.md` |
| **Everything about macOS or Linux runtime behaviour** | **`[UNPROBED]` — Phase 1.6** |

---

*Planning ISA: `LIFEOS/MEMORY/WORK/20260828-142533_fuzzyclock-electron-port-plan/ISA.md`. Feasibility ISA: `…/20260828-141000_fuzzyclock-electron-feasibility/ISA.md`, measured on the same base `ca61130`.*
