# Port Plan — FuzzyClock as a cross-platform Electron overlay with an SVG display

**Project:** FuzzyClock v5.0 — rewrite the WPF/.NET 10 Windows overlay as an Electron desktop overlay with an SVG-rendered display, targeting Windows + macOS + Linux
**Researched:** 2026-08-28
**Base:** `ca61130` (clean tree at planning time)
**Status:** last updated **2026-08-29** — see § Status below. Branch `v5.0-electron-port` at `36072c5`.
**Confidence:** **HIGH** on the Windows arms, the API surface, and the cost figures — all measured on this machine or read from Electron 33.4.11's own typings. **The macOS behavioural arms moved from LOW to mixed on 2026-08-28** — a real M1 laptop was probed (P1.6), so the mac rows are now a mix of `[MEASURED]` and three named `[INCONCLUSIVE]`. **Linux is still LOW on every behavioural arm: no Linux box has been touched.** Rows in this document are tagged `[MEASURED]`, `[TYPED]` (the API exists and Electron annotates it for that platform) or `[UNPROBED]`. Treat `[TYPED]` as "will compile and is documented to exist", never as "works".

---

## TL;DR for the Roadmapper

- **The port is feasible and the resource argument runs *toward* Electron, not against it — and this is no longer a floor-vs-baseline comparison.** The real workload was measured in Phase 1: **8.21-10.88% of one core against WPF's 19.92-20.98%, 1.93-2.43× cheaper**, one instrument, both builds back to back `[MEASURED: ISC-6]`. The original headline (WPF 24.2% / 326MB against a **parked** Electron overlay at 3.5% / 310MB) stands as the floor it always was, and the real figure landed comfortably inside it. **Memory did not resolve and the reason is the method** — the intervals overlap in both directions, so no ordering follows. Disk went the other way: **the NSIS installer is 1.40× the Inno one** (76.4MB vs 54.7MB), against a ~85MB prior. `[MEASURED]`
- **The cheap alternative died with this requirement.** WebView2 hosted inside the existing WPF shell reaches the SVG-display goal for roughly a tenth of the work — and it is Windows-only. Asking for macOS and Linux is what makes the full Electron rewrite the only path.
- **Linux is the *easiest* telemetry platform of the three, not the hardest.** CPU, memory, swap, battery and **temperatures** are all unprivileged reads under `/proc` and `/sys`. Windows needs a long-lived `typeperf` child plus a ring-0 driver for temps. **macOS is the hard one** — no unprivileged temperature source and no GPU utilisation without root `powermetrics`.
- **Exactly two capabilities are declared absent on Linux by Electron's own typings**, and they are the only hard API gaps in the whole port: `setLoginItemSettings` (`@platform darwin,win32`) → auto-launch needs a hand-written `.desktop` file; `setContentProtection` (`@platform darwin,win32`) → no self-exclusion from screen capture, which is auto-contrast's feedback-loop guard. Everything else is present-but-unproven, a cheaper class of problem.
- **One decision gated the plan and only Alex could make it: temperatures. ~~Open~~ DECIDED 2026-08-28 — Option C, drop them, on evidence Phase 1 produced.** See § The one decision below; the sidecar was built and measured before being deleted, and the reason it lost was not its size.
- **Do not build the shell first.** The overlay window, tray, click-through and ghost-mode designs are already proven in `~/code/garry-desktop`, so building them first *feels* like progress while learning nothing. **Phase 1 is the telemetry spike, and it is the go/no-go.**
- **Cost centre is not the shell and not the display.** It is **2,467 LOC** of `FuzzyClock.Core` plus **632 tests** (469 Core + 163 App) to re-earn — of which **578 survive Option C** — and the three Windows telemetry paths. All three figures were re-measured on the branch and all three moved: the LOC lost `TemperatureFormatter.cs`, the App count was **633 quoted and 632 measured**, and 54 of the 632 cover temperatures.

---

## Status — 2026-08-29

Branch `v5.0-electron-port` at **`36072c5`**. Gates at that commit: `bun test` **700 pass / 0 fail** (185,894 assertions across 16 files), `bun run typecheck` exit 0, `bun run build` exit 0.

| Phase | State | Where it stands |
|---|---|---|
| **0 — Decide** | **2 of 4 answered** | WPF retired at parity (in the goal verbatim); temps = **C** (2026-08-28). Linux-XWayland and auto-contrast are still Alex's calls, and neither gates Phases 1-3. |
| **1 — Telemetry spike (go/no-go)** | **PASSED, one half of one item outstanding** | P1.1-P1.5 all closed by probe. **The premise held with room: 8.21-10.88% of one core against WPF's 19.92-20.98%, back to back on one instrument — 1.93-2.43× cheaper.** P1.6's macOS half is done on a real M1; **the Linux half has no host.** |
| **2 — Core translation** | **DONE** | 27 files / 2,467 LOC translated; **all 457 translated Core cases green**, plus 147 measured additions and the golden-file oracle. Both exit conditions met. |
| **3 — Shell** | not started | Next after the App-layer pure seams. |
| **4 — SVG display** | not started | |
| **5 — Ghost mode** | not started | Carries PERF-01 as a claim. |
| **6 — Stats panel** | not started | The Windows parsers exist and are fixture-tested from Phase 1; the mac/linux ones do not. |
| **7 — Packaging** | **partly pre-paid** | `electron-builder` already produced a real NSIS installer for P1.5, so the toolchain is standing. Auto-launch, the Falcon re-proof and the update check are untouched. |
| **8 — Auto-contrast** | not started, still first on the cut list | `core/contrast.ts` is translated and tested but wired to nothing; it is deleted with the feature if the feature is cut. |
| **9 — Retire WPF** | not started | The irreversible step, and it stays last. |

**Three Phase 1 findings changed this document rather than confirming it,** and they are folded into the rows below rather than kept here: temps went to Option C on a coverage finding, not a size one (§ The one decision); `Display.label` turned out unusable as an identity key so the composite fallback is now the primary (Feature port table); and the installer is a **1.40× disk regression**, not the ~85MB prior (§ What the port costs).

**Open debt that is not a phase:** the RSS half of the cost comparison is unresolved by method, not by result — the measured intervals overlap in both directions, and closing it needs per-process shared-page accounting rather than another run. It does not gate anything.

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

**Recommendation was A.** The sidecar looked like the one place a second language earns its keep — the logic already exists, the process boundary naturally isolates the **608ms mean `Update()` cost** the WPF app already worked around with a dedicated 2s loop `[MEASURED: TemperatureService.cs header]`, and .NET never ships to macOS or Linux. The recommendation came with its own condition: **A is not free and its size is unknown; Phase 1 produces the number before this is committed to.**

### DECIDED 2026-08-28: **C — drop temps.** Alex's call, on Phase 1 evidence that the table above did not have.

The number Phase 1 produced was not the one that decided it. Option A came in at a very affordable **17.0MB trimmed** with a **106.8ms** mean read — both better than this table assumed. What decided it was `probe-sidecar.ts`'s coverage arm: **unelevated, the CPU node enumerates 51 temperature sensors and every one reads NULL.** Only GPU answered (NVAPI needs no ring-0 driver). So "full fidelity" in row A is conditional on an elevation manifest — a UAC prompt at every launch of an autostarting overlay — and **without it row A delivers exactly what row D delivers nearly free.** Full evidence: ISA ISC-9. The sidecar was built, measured and then deleted; its code is at `64c747e` if the decision is ever revisited.

Everything downstream is unaffected, and that was true whichever row won: the stats panel already renders `-1f` as unavailable, so a platform with no temperature source degrades through a path that already exists and is already tested. Under C that path is the only path, on all three platforms.

---

## Target architecture

Keep the repo. Add a new tree; retire the WPF projects only after parity. That way the shipping app keeps shipping, and the C# tests remain a live oracle to translate against rather than a memory.

```
FuzzyStatsClock/
  FuzzyClock.Core/          # unchanged during the port — the specification
  FuzzyClock.App/           # unchanged during the port — the fallback
  FuzzyClock.Core.Tests/    # 469 tests; 457 the spec to translate, 12 retire with temps -- ALL 457 DONE
  FuzzyClock.App.Tests/     # 163 tests (measured; 164 was a quote), 42 of them temps
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
                            # (no sidecar/ — Option C was chosen; see § The one decision)
    test/                   # bun test — translated Core tests + fixture-driven parser tests
```

**Follow `garry-desktop/src/platform.ts` literally as the seam pattern.** It already holds the three branch points that matter and it takes **no Electron import, not even a type one**, so a `bun` probe can load it with no Electron on the path. That property is what makes the platform logic unit-testable on any OS. `[MEASURED: garry-desktop/src/platform.ts:1-19]`

### Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | **Electron 33** | 33.4.11 is already on this machine and the overlay flags are proven against it `[MEASURED]`. Do not chase latest during a port. |
| Language | TypeScript | — |
| Build | **`bun build`**, three entry points (main / preload / renderer) | Exactly `garry-desktop`'s shipped toolchain — no webpack, no vite, no ceremony `[MEASURED: garry-desktop/package.json]` |
| Tests | **`bun test`** | The 457 translated Core tests are pure logic with no DOM. Zero config. **Held up: all 457 are green with 147 measured additions alongside them `[MEASURED]`.** |
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
  uptimeSec: number
}
```

**`temps` is gone from the sample, not stubbed at `-1`.** Option C retires the feature rather than shipping four permanently-unavailable cells, so the four temperature fields leave `StatsSample`, the stats panel loses its temps line and the settings UI loses its temps tab. A field that is `-1` on every platform forever is dead weight that reads as an unimplemented feature; a deleted field reads as a decision. `TempsLineVisible` in the existing settings file is therefore an ignored key on import (ISC-18), not a migrated one.

**15** cells, every one filled — a source or an explicit `-1`. Was 18; the Temps row's three cells left with the feature:

| Metric | Windows | macOS | Linux |
|---|---|---|---|
| **CPU %** | `os.cpus()` delta `[TYPED]` | `os.cpus()` delta `[TYPED]` | `os.cpus()` or `/proc/stat` `[TYPED]` |
| **MEM %** | `Memory\% Committed Bytes In Use` via `typeperf` child `[MEASURED]` — see the semantics warning below | **`vm_stat`, and `os.freemem()` is NOT usable** `[MEASURED: macOS 26.6.2 arm64]` — see below | `/proc/meminfo` `MemAvailable` `[UNPROBED]` |
| **Swap / PAG %** | `Paging File(_Total)\% Usage` via the same child `[MEASURED]` | `sysctl vm.swapusage` `[MEASURED: macOS 26.6.2 arm64]` — `total = 1024.00M  used = 413.44M  free = 610.56M  (encrypted)`, so `M` suffixes and a trailing token to handle | `/proc/meminfo` `SwapTotal`−`SwapFree` `[UNPROBED]` |
| **GPU %** | `GPU Engine(*engtype_3D)\Utilization Percentage` via the child `[MEASURED — with a defect, below]` | **not `-1` after all** — `powermetrics` is confirmed root-only `[MEASURED]`, but `ioreg -r -c AGXAccelerator -l` exposes `Device Utilization %` **unprivileged** `[MEASURED: macOS 26.6.2, Apple M1]`. Undocumented and Apple-silicon-only, so `-1` stays the fallback | `/sys/class/drm/card*/device/gpu_busy_percent` (amdgpu) → `nvidia-smi` → else `-1` `[UNPROBED]` |
| **Battery %** | `Get-CimInstance Win32_Battery`, polled at 60s `[UNPROBED]` — `powerMonitor.isOnBatteryPower()` returns only a boolean, no percentage `[MEASURED: electron.d.ts:10033]` | `pmset -g batt`, 60s `[MEASURED: macOS 26.6.2 arm64]` — **TAB-delimited**, and `0:00 remaining` appears while charged, so it must not be read as "no time left" | `/sys/class/power_supply/BAT*/capacity` `[UNPROBED]` |
| ~~**Temps**~~ | **retired — Option C** | **retired** | **retired** |
| *(Uptime)* | `os.uptime()` `[TYPED]` | `os.uptime()` `[MEASURED: 733,625s]` | `os.uptime()` `[TYPED]` |

**Two macOS measurements changed a cell each, in opposite directions.**

`os.freemem()` returned **264,617,984 of 8,589,934,592 bytes — 3.1% free — on a healthy,
responsive machine.** It is not a memory-pressure signal on macOS; it is the free-page count,
and macOS keeps that near zero on purpose. So the macOS MEM cell is computed from `vm_stat`,
not from `os.freemem()`, and the plan's original "`os.totalmem/freemem` + `vm_stat` for the
compressor" had the primary and the supplement the wrong way round. The occupancy figure is
`(active + wired + occupied-by-compressor) / total pages` — **69.14%** on the captured
snapshot, against the 3.1% `os.freemem()` implies. A cell that reads 97% used when the machine
is fine is worse than a cell that reads `--`.

`ioreg -r -c AGXAccelerator -l` returns GPU utilisation **with no privileges**, which the plan
had written off. It is an undocumented IOKit path on an Apple-silicon-only driver class, so it
is a candidate rather than a decision — but a candidate is not a `-1`, and the row above says
so now. Fixture and caveats: `electron/test/fixtures/README.md`.

### Three rules that fall out of the measurements

**1. Poll cadence is per-metric, not global.** Per-tick shell-outs are ruled out by measurement: a one-shot `typeperf` sample costs **2.81s** wall and `Get-Counter` **2.55s**, against a bare process start of 0.17s / 0.51s `[MEASURED]` — untenable at the app's 1s interval, let alone its 0.5s hover fast-refresh. But a metric that moves slowly does not need the tick:

| Cadence | Metrics | Mechanism |
|---|---|---|
| 1s (0.5s on hover) | CPU, MEM, GPU, PAG | **one long-lived child**, streaming |
| ~~2s~~ | ~~temps~~ | **no longer exists — Option C.** The 2s tier had exactly one occupant, so retiring temps retires a whole cadence and the process that served it |
| 60s | battery | spawn-per-poll is fine at this cadence |
| free | uptime | in-process |

**2. The Windows child works, including the GPU wildcard, and has one known fidelity defect.** `typeperf "\GPU Engine(*engtype_3D)\Utilization Percentage" -si 1` streams CSV and accepts the wildcard, but returned 0.000000 while `nvidia-smi` read 10% in the same minute: **PDH resolves instance names at spawn, so GPU engines belonging to processes started later are invisible** `[MEASURED, with a positive control — the `\Processor(_Total)` column in the same run moved, so the child was live]`. Design consequence: the child must be **periodically recycled**, or the GPU counter re-enumerated, exactly as `StatsService.cs:159-176` already does in-process on `InvalidOperationException`. Carry that behaviour across; do not rediscover it.

**3. `MEM` means something different if you take the easy road.** The WPF app reports **commit charge** (`% Committed Bytes In Use`), which read 97.5% here. `os.freemem()` reports *physical* free. Those are different numbers about different things, and swapping one for the other silently changes what the widget says. If the counter child is dropped on Windows, the settings UI and the docs have to say "physical", not "committed".

---

## Feature port table

| Feature | Port path | Degradation |
|---|---|---|
| Frameless transparent always-on-top overlay | `transparent`, `frame: false`, `skipTaskbar`, `hasShadow: false`, `setAlwaysOnTop(true,"screen-saver")` `[MEASURED: garry-desktop/src/main.ts:179-228]` | none known |
| Kept out of Alt-Tab / Cmd-Tab | win/linux `type: "toolbar"`; macOS `app.dock.hide()` (accessory activation policy) `[MEASURED: garry-desktop/src/platform.ts:43-60]` | On macOS the **policy** is confirmed from outside the process — `NSRunningApplication.activationPolicy` = `accessory`, LaunchServices `ApplicationType="UIElement"` `[MEASURED: macOS 26.6.2]` — but the **switcher UI itself was not observed** `[INCONCLUSIVE]`. Those are different claims and only the first is measured. |
| Visible over a maximised window | win: `screen-saver` level; mac: `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true})` `[MEASURED: platform.ts:70-78]` | **Linux WM-dependent** — his own comment declines to assert it `[UNPROBED]`. **macOS is also still unproven** `[INCONCLUSIVE]`: with a second app in native fullscreen the overlay read back `isVisible: true` and painted 588 frames, but `screencapture` was denied (`could not create image from display`), so nothing established it was *composited above*. |
| Click-through | `setIgnoreMouseEvents(true, {forward: true})` `[TYPED]` | **Never rely on the `forward` mousemove path — now measured on both platforms.** Zero events on Windows (3440×1440) `[MEASURED: garry-desktop/src/shared.ts:156-167]`; **one** event on macOS across an eight-lap programmatic cursor sweep `[MEASURED: macOS 26.6.2]`. Different numbers, same conclusion. Poll the cursor instead — `screen.getCursorScreenPoint()` at 100ms gave 61 changes / 42 unique points over 98 samples on macOS `[MEASURED]`. |
| Ghost mode (proximity fade) | main polls the cursor, computes the Chebyshev proximity ratio, pushes the *target* over IPC; renderer owns the interpolation | none — **both codebases independently arrived at cursor polling**, so the design transfers 1:1. `GhostModeController.ComputeProximityRatio` and `LerpRatio` are already pure static seams and port verbatim `[MEASURED]` |
| Right-click menu on the overlay | renderer-measured hit boxes → `ipcMain` → toggle `setIgnoreMouseEvents` wholesale `[MEASURED: garry-desktop/src/main.ts:539-556]` | The WPF `Background="#01000000"` alpha=1 hit-test trick has no analogue and needs none — CSS hit-testing works on fully transparent regions with `pointer-events`. |
| Tray icon + menu | `Tray` + `Menu` `[TYPED]` | **Linux click semantics differ** — the typings note the click event fires on "activation", and Linux needs libappindicator present `[MEASURED: electron.d.ts:13228]` |
| Settings window | second `BrowserWindow` | none — this gets *easier* (521 LOC of XAML → HTML/CSS) |
| Per-monitor position memory | `screen.getAllDisplays()`, keyed on the **composite `WxH@x,y:scale`** — the fallback is now the primary `[MEASURED: probe-displays.ts, two cold launches]` | Replaces `MonitorService`'s `QueryDisplayConfig` friendly names. **`label` was probed in Phase 1 and it is not a usable identity — the plan's own "is it non-empty and stable" was the wrong question.** On his desk it is **`""` on the internal display and the identical `"LG HDR WQHD"` on both LGs**, so it fails empty *and* duplicated at once, and "non-empty and stable" would have passed on two of three while still restoring the overlay onto the wrong LG. The composite gives 3 distinct values, identical across both launches. Label survives as a display *name*, never as identity. Still outstanding: the reboot, cable-swap and resolution-change arms. |
| Per-monitor DPI | `Display.scaleFactor` `[TYPED: electron.d.ts:7461]` | none — replaces `GetDpiForMonitor` |
| Opacity | CSS `opacity` in the renderer, **not** `win.setOpacity()` | This is an *improvement*, see below |
| Auto-launch | `app.setLoginItemSettings` `[MEASURED: electron.d.ts:1634 — @platform darwin,win32]` | **No Linux API.** Write `~/.config/autostart/fuzzyclock.desktop` by hand. Also: **CrowdStrike Falcon blocks `garry-desktop`'s autostart spawn pair on this machine** — a packaged installer is a different case, but this must be re-proven, not assumed. |
| Update check (GitHub Releases) | `net.request` or `fetch`; `UpdateVersionComparer.cs` is 57 LOC of pure logic | none |
| Auto-contrast (screen sampling) | `desktopCapturer.getSources({types:['screen'], thumbnailSize})` + `setContentProtection(true)` to exclude our own window from the capture | **This is the elegant win and the platform casualty at once.** `setContentProtection` uses `WDA_EXCLUDEFROMCAPTURE` on Win10 2004+, and is `@platform darwin,win32` `[MEASURED: electron.d.ts:2998-3004]`. Excluding our own window replaces the entire `ContrastRefreshController.HasAppWindowBeneath()` Z-order walk that exists solely to stop a BitBlt feedback loop. **On Linux there is no exclusion, so the feedback loop returns** → ship Linux with auto-contrast off. **macOS needs a Screen Recording TCC grant, and on the probed Mac that grant is absent** — `screencapture -x` failed `could not create image from display` `[MEASURED: macOS 26.6.2]`. That is the same permission `desktopCapturer` needs, so on macOS this feature starts from *denied* and requires a user prompt, not merely a manifest entry. **Low priority regardless: his live settings have `AutoContrastEnabled: false`** `[MEASURED]`. |

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
- **GPU: not root-only after all, but not a decision either.** `powermetrics` is confirmed root-only, so the plan's original "one `--` cell by design" held on that path — but `ioreg -r -c AGXAccelerator -l` returns `Device Utilization %` **unprivileged** on Apple silicon `[MEASURED: M1, macOS 26.6.2]`. Undocumented and driver-class-specific, so `-1` stays the fallback and the cell is a candidate rather than a promise. **The telemetry table above is the current word on this cell; this bullet used to contradict it.** macOS also has no unprivileged temperature source, which is now moot rather than a degradation — Option C retires temps everywhere, so there is no macOS-specific gap left to explain.
- **Notarization is a new, recurring cost that does not exist today:** an Apple Developer ID (currently ~USD 99/yr). Without it, macOS users hit Gatekeeper on first launch. This is a real line item, not a technical footnote.
- Screen Recording TCC prompt if auto-contrast is ever enabled there.

---

## Phases

Ordered **risk-first**. The largest block of code (Core translation) is deliberately *second*, because it carries zero platform risk — putting it first would burn the biggest budget before knowing whether the premise holds.

### Phase 0 — Decide (no code)
Four calls, all Alex's: the temps option (A/B/C/D), Linux = XWayland-only yes/no, auto-contrast in or out of 1.0, and whether WPF is retired at parity or kept as the Windows build.
**Two are answered:** WPF is retired at parity and deleted on merge (stated in the goal verbatim), and **temps is C** (2026-08-28, on Phase 1 evidence). Two remain open — Linux XWayland and auto-contrast — and **neither gates Phases 1-3**, which is why the build proceeded rather than blocking on Phase 0.
**Exits on:** the four answers written into this document.

### Phase 1 — Telemetry + platform spike — **THE GO/NO-GO** → **PASSED**, Linux smoke excepted
- **P1.1** Electron window running a 1s stat repaint **plus** the long-lived `typeperf` child, measured over 20s for CPU% and RSS. *(This is the feasibility run's first `[DEFERRED-VERIFY]`: the 3.5% Electron figure was measured on a **parked** overlay — it bounds Electron's floor, it does not predict this port's cost.)* **If this exceeds 24.2% of one core, the premise dies here.** **DONE — the premise held with room.** The real shape (frameless, transparent, topmost, out of Alt-Tab, two live `typeperf` children, SVG panel repainting at 1s) measured **10.88% then 8.21% of one core against WPF's 20.98% and 19.92%** — 1.93× and 2.43× cheaper, both builds measured back to back by one instrument, and the three WPF readings and two Electron readings do not overlap. Startup+settle favours it harder still: **2.68% against 26.51%**. **The RSS half did NOT close, by method rather than by result** — sum-of-working-sets double-counts shared pages and sum-of-private omits resident ones, and the resulting intervals overlap in both directions (electron `[95.7, 358.0]`MB vs wpf `[167.7, 327.7]`MB). Closing it needs per-process PSS, not another run; it gates nothing, since CPU is what the go/no-go named.
- **P1.2** Long-lived `typeperf` child: CSV parse, and prove the GPU-instance recycle actually recovers a counter that read 0 at spawn. **DONE**, and it found a second defect the plan did not predict: **`typeperf` can drop a counter from its header while still streaming that column's data**, so a header-derived column map silently misaligns every value after it. Both defects are now fixture-tested.
- **P1.3** ~~*(Option A only)*~~ **DONE, and it decided against itself.** Sidecar prototype built and measured: 17.0MB trimmed, 106.8ms mean read — then deleted, because the same probe found the CPU sensors enumerate and all read NULL unelevated. Deciding a build step by building it is the point of a spike; this one earned its cost by removing a feature rather than by shipping one.
- **P1.4** `screen.getAllDisplays()` on his 3-display setup: is `Display.label` non-empty and stable across a reboot? **DONE, and the question was the wrong one — `label` is not a usable identity at all.** `""` on the internal display, the identical `"LG HDR WQHD"` on both LGs: it fails empty *and* duplicated simultaneously, so "non-empty and stable" would have gone green on two displays of three and still restored onto the wrong monitor. Uniqueness had to be its own arm, and the WPF original is what pointed at it — `MonitorService.cs:90-115` already suffixes duplicate friendly names `-2`/`-3`. **The composite `WxH@x,y:scale` is now the primary key**: 3 distinct values, identical across two cold launches. A side finding closed with it: his live settings store `MonitorPositions` under **GDI fallback keys Electron cannot reproduce**, and one of the two stored positions (−227, 510) **lands outside every connected display**, so the Phase 3 import must match by geometry and handle an orphan. Reboot and cable-swap remain unprobed.
- **P1.5** One `electron-builder` run to get a **real** installer size against the measured 200MB exe / 57MB Inno installer. *(Third `[DEFERRED-VERIFY]`; the ~85MB figure quoted during feasibility is a prior, not a measurement.)* **DONE, and it is a regression: 76.4MB NSIS against 54.7MB Inno, and 268.1MB unpacked against the 191.2MB single-file exe — 1.40× on both measures.** The prior was optimistic by about 10%. Both WPF baselines were re-read off disk and matched their recorded byte counts, so the comparison is against the same artefact the plan measured.
- **P1.6** Smoke the shell flags on macOS and on an X11 Linux session — the *only* way the `[UNPROBED]` rows in this document become real. **macOS half DONE 2026-08-28** via `mcp__mac-codex__codex` on an Apple M1 laptop, macOS 26.6.2 arm64, Electron pinned to exactly 33.4.11: window renders (578 rAF paints, no `did-fail-load`), flags read back off the live window, accessory activation policy confirmed externally, cursor polling live, four telemetry fixtures captured. Three arms came back INCONCLUSIVE and stay that way — Cmd-Tab UI, over-fullscreen layering, and click-through into another app — all three because screen capture is TCC-denied on that host. **Linux half still has no host.**

**Exits on:** measured CPU%/RSS for the real workload, a sidecar size number, a `display.label` reading, an installer size, and a per-platform smoke result. Any `[UNPROBED]` row still unprobed after this phase is a row that will be discovered in Phase 6 instead.

**Exit status: five of six met, and the sixth is a host problem rather than a work item.** CPU measured (RSS deliberately open, above), sidecar sized at 17.0MB, `label` read and refuted, installer sized at 76.4MB, macOS smoked on real hardware. **The Linux rows in this document are therefore exactly the set that will be discovered in Phase 6 instead** — that sentence was written as a warning and it has come true for one platform. Three macOS arms are `[INCONCLUSIVE]` for a reason no Linux host would fix (TCC screen-capture denial), and they are named in the rows they affect.

### Phase 2 — Core translation → **DONE 2026-08-29**
**27 files / 2,467 LOC** → TS, and it splits **1,987 LOC across 18 phrase-provider files (81% — table data, mechanical)** against **480 LOC of real logic across 9 files** `[MEASURED]`. Re-measured after Option C: `TemperatureFormatter.cs` (43 LOC) is deleted, not translated, so the pre-Option-C figures (28 / 2,510 = 1,987 + 523 across 10) would have counted a deleted file as outstanding work. Translate the **457** `FuzzyClock.Core.Tests` cases to `bun test` **as the translation proceeds**, provider by provider — they are the specification, and translating them afterwards converts a spec into a rubber stamp. (Was 469; `TemperatureFormatterTests.cs` contributes 12 and retires with the feature.)

**The golden-file oracle is DONE and it is not the sweep this plan asked for.** "Every phrase provider's output byte-identical to the C# original for a full 24h × all-locales × all-styles sweep" is impossible: **10 of the 18 providers pick a candidate with `Random.Shared.Next()`**, so `GetPhrase` has no single correct answer for a minute. And the registry is **18 flat locale keys**, not a 6 × 11 = 66 locale-×-style matrix — read by reflecting `PhraseEngine._providers`. What `tools/GoldenGen` generated instead is stronger than a sampled sweep: `phrase-golden-segments.tsv` (25,920 rows — the deterministic `GetSegmentKey` for 1440 minutes × 18 locales) plus `phrase-golden-candidates.tsv` (12,984 rows — the **complete candidate set** per bucket for the 10 random providers). Pinning the whole permitted set catches a port that emits a plausible phrase from the wrong bucket; a one-sample comparison would have passed it four times in five.

**Exits on:** ≥457 green in `bun test`, and the TypeScript providers reproducing both golden files — the segment key for every minute, and the exact candidate set for every bucket.

**Exit status: BOTH MET.** All 27 files are translated, **all 457 cases are translated and green**, and the port reproduces both golden files. `bun test` reads **700 pass / 0 fail** at `36072c5` — 457 translations, 147 measured additions, 96 from the golden and `typeperf` fixture work.

**The 147 additions are counted separately from the 457 on purpose, and that separation is the only thing keeping the number honest** — a port that invents its own tests and counts them toward a translation target reaches the target without translating anything. **From `update-version.ts` onward every added expectation was measured against the compiled C#** rather than derived from reading it, via a throwaway console project outside the repo that `<Compile Include>`s the real `.cs` files. That is what surfaced the `int.MaxValue` component ceiling, .NET's acceptance of `"4. 5"`, two `PhraseWrapService` branches the C# suite never reaches, and — in `ContrastService` — every override colour plus a **banker's-rounding divergence that is load-bearing, not defensive**: `Math.Round` is round-half-to-even and JavaScript's `Math.round` is not, and over exactly the inputs `adjustAccent` generates that is **215 of 4,096** grey-axis calls and **44,017 of 4,194,304** cube calls landing on a different value.

**Three translated modules are wired to nothing yet, and that is scheduling rather than drift:** `update-version.ts` waits on Phase 7, `phrase-wrap.ts` on Phase 4, `contrast.ts` on Phase 8 — all three are standalone in `FuzzyClock.Core` too. The import-side claim deliberately sits with the phase that does the wiring, because an unimported module's tests pass happily while the wiring is wrong.

### Phase 3 — Shell
Window flags, tray, settings persistence at `app.getPath('userData')` (with a one-time import of the existing `%LOCALAPPDATA%\FuzzyClock\settings.json`), per-monitor position, drag-to-move. Crib from `garry-desktop`.
**Two Phase 1 findings land here as requirements, not as advice:** the position key is the composite, never `label`; and the settings import matches monitors **by geometry**, because the live file's keys are GDI names Electron cannot produce and one of its two stored positions is already orphaned off-screen.
**Exits on:** on all three platforms — window visible, absent from taskbar/dock and from Alt-Tab/Cmd-Tab, position survives a restart and a display-configuration change.

### Phase 4 — SVG display
Phrase, dial, LCD, Nixie. Obey the composited-property rule above.
**Exits on:** all four modes render at every theme; a frame scrub shows the dial hands moving via `transform` only.

### Phase 5 — Ghost mode
Cursor poll in main, proximity ratio, rAF lerp in the renderer, click-through toggle, configurable override.
**Exits on:** fade stays smooth under a synthetic 25–50% CPU load — i.e. **PERF-01 closed**, not deferred again.

### Phase 6 — Stats panel + per-platform sources
Wire the seam. Fixture-driven parsers first, live acquisition second.
**Partly pre-paid by Phase 1:** the Windows `typeperf` child, its CSV parser and both of its measured defects (spawn-time GPU instances, the dropped-header misalignment) are already built and fixture-tested. The macOS fixtures were captured on the M1 host; the Linux ones do not exist.
**Exits on:** every one of the **15** cells either shows a live number on its platform or renders `--` through the existing `-1` path. (Was 18 — the three temperature cells retired with Option C, matching the table in § The telemetry seam. The two figures disagreeing in one document is exactly how a retired feature comes back as three missing cells.)

### Phase 7 — Packaging, auto-launch, update check
electron-builder × 3 targets; `setLoginItemSettings` on win/mac and a `.desktop` file on Linux; the GitHub Releases check.
**The Windows toolchain is already standing** — `electron-builder` 26.15.3 produced a real NSIS installer for P1.5. What is untouched is the mac and linux targets, auto-launch on all three, the Falcon re-proof, and the update check. **The P1.5 size number is not a shippable-artefact number:** it was built without a real icon or signature, so it gets re-measured once those exist, and there are ~40MB of unused Electron locales still in the payload.
**Exits on:** an installer per platform that installs, launches, auto-launches at login (**including a Falcon re-proof on Windows**), and reports an available update.

### Phase 8 — Auto-contrast *(optional — cut this first)*
`desktopCapturer` + `setContentProtection`. Off by default on Linux.
**Its pure half is already translated and tested** (`core/contrast.ts`, 197 LOC against a 10-case C# suite), wired to nothing, and **deleted along with the feature if the feature is cut.** Translating it ahead of the decision was the cheaper order — the measurement harness was already standing, and the float-heavy internals are precisely where a rushed Phase 8 port would have missed the rounding. Worth knowing before trusting the C# suite here: for both override-entry cases it asserts only that the colour *differs* from the accent and clears 4.5:1, never which colour, so **every override value in the port's tests is probe-measured, not read off the original.**
**Exits on:** contrast flips against a light and a dark background with **no feedback loop** — i.e. our own window provably absent from the captured thumbnail.

### Phase 9 — Retire WPF *(only if Phase 0 said so)*
Delete `FuzzyClock.App`, keep `FuzzyClock.Core` in git history, retarget the release workflow.
**Exits on:** the `.github/workflows/release.yml` REL-03 guard replaced with whatever guards the new build.

---

## Test strategy

**The insight that makes three platforms testable from one:** the per-platform sources become **pure parsers over captured fixtures**. Capture a real `/proc/meminfo`, a real `typeperf` CSV line, a real `pmset -g batt` block, a real `hwmon` tree once, check them in, and every parser is unit-testable on any OS. Only *acquisition* needs a real machine, and acquisition is a handful of lines per platform.

| Surface | How |
|---|---|
| `src/core/` (translated logic) | `bun test`, 1:1 with the **457** translatable C# cases (469 less the 12 that retire with temps) — **DONE, all 457 green** |
| Pure seams from the App layer (`ComputeProximityRatio`, `LerpRatio`, formatters, comparers) | `bun test` — these are already static and pure in C#. **Not started; this is the next unit of work.** |
| Per-platform parsers | fixture-driven, run on every platform in CI. **Windows done** (the `typeperf` CSV parser, both defects fixture-pinned); macOS fixtures captured, parsers not written; Linux neither |
| Acquisition | one smoke test per platform in CI matrix (win/mac/linux runners), asserting a plausible range, not a value |
| Window/overlay traits | scripted probes in the `garry-desktop` style — the flag set read back off a live window, not off the source |

Of the **163** `FuzzyClock.App.Tests`, the pure-seam ones port directly; the Windows-service ones are *replaced* by the fixture parsers rather than translated. **Expect the final count to differ from 632 — say which cases were replaced and why, rather than quoting a number that looks like parity.**

**The parity denominator is now measured, and both halves of it moved.** `dotnet test FuzzyClock.slnx -c Release` at the branch point gives **469 Core + 163 App = 632**, not the 633 this plan carried — so the figure every parity comparison rested on was off by one, and it was a quote rather than a reading. **Of those 632, 54 cover temperatures** and retire with Option C: `TemperatureFormatterTests` 12, `TemperatureServiceTests` 21, `TempsLineTests` 10, and 11 temps-key cases in `AppSettingsTests`. **So the real bar before WPF may be deleted is 578, not 632** — a consciously retired feature must not read as 54 missing tests, which is exactly how a raw count comparison reads it.

---

## What the port costs and what it buys

**Buys:** one codebase on three platforms · **roughly half the CPU of the WPF app under the real workload, 1.93-2.43× cheaper across two back-to-back runs** `[MEASURED: ISC-6 — this replaces the "~20% of idle CPU, floor only" figure, which was a parked overlay]` · a display native to SVG · a plausible fix for PERF-01 · a far cheaper settings UI · auto-contrast's feedback-loop guard reduced from a Z-order walk to one API call (on 2 of 3 platforms).

**Costs:** **2,467 LOC of Core translated — DONE** · **632 tests re-earned, 578 of them after Option C; the 457 Core translations are DONE and the App half is not started** · 7,605 LOC of `FuzzyClock.App` deleted and ~2,500–3,000 LOC of TS written in its place · **temperatures retired on all three platforms, a shipped v4.2 feature deliberately given up (Option C)** · GPU unavailable on macOS · auto-contrast unavailable on Linux · Wayland users on XWayland · an Apple Developer ID · three packaging targets with no precedent in his tree · CrowdStrike autostart re-proof · **1.40× more disk than the WPF installer** `[MEASURED: ISC-8]`.

---

## Evidence index

| Claim in this document | Source |
|---|---|
| WPF 24.2% of one core / 326MB WS; Electron 3.5% / 310MB — **the parked floor, superseded** | `TotalProcessorTime` deltas over 20s, **Release** build both sides, 2026-08-28 |
| **Real workload: Electron 10.88% / 8.21% against WPF 20.98% / 19.92%; startup+settle 2.68% vs 26.51%** | `electron/scripts/probe-cost.ts`, one instrument both sides, two runs, 2026-08-28 (ISC-6) |
| **RSS is unresolved by method: electron `[95.7, 358.0]`MB vs wpf `[167.7, 327.7]`MB, overlapping** | same probe, which gates on CPU alone and says so (ISC-6.1) |
| **`Display.label` is `""` on the internal display and duplicated across both LGs** | `electron/scripts/probe-displays.ts`, 6 arms, two cold launches (ISC-7) |
| **NSIS 80,089,948 B vs Inno 57,389,487 B; unpacked 281,087,190 B vs exe 200,457,651 B — 1.40× both** | `electron/scripts/probe-size.ts`, `electron-builder` 26.15.3 (ISC-8) |
| **457 of 457 translatable Core cases green; `bun test` 700 pass / 0 fail / 185,894 assertions** | `bun test` at `36072c5`, per-class counts from a TRX parse of the C# run (37 classes, 469 results, 0 unmapped) |
| 200,457,651-byte exe / 57,389,487-byte installer | `ls -la publish/ installer/` |
| ~~Core 2,510 LOC = 1,987 (18 providers) + 523 (10 logic)~~ → **2,467 = 1,987 + 480 across 9** | per-file `wc -l`, sums exactly; re-measured after Option C deleted `TemperatureFormatter.cs` (43 LOC) |
| ~~633 tests (469 + 164)~~ → **632 (469 + 163), of which 578 survive Option C** | `dotnet test FuzzyClock.slnx -c Release`, exit 0, re-measured on the branch — **README:92 (274) and `.planning/STATE.md:129` (621) are both still stale, and 633 was this document's own quote** |
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
| ~~**Everything about macOS or Linux runtime behaviour**~~ → **macOS partly measured; Linux entirely unprobed** | macOS: real M1 laptop, macOS 26.6.2 arm64, Electron 33.4.11, 2026-08-28 — window/flags/policy/cursor measured, three arms `[INCONCLUSIVE]` on TCC denial. **Linux: `[UNPROBED]`, no host** |

---

*Planning ISA: `LIFEOS/MEMORY/WORK/20260828-142533_fuzzyclock-electron-port-plan/ISA.md`. Feasibility ISA: `…/20260828-141000_fuzzyclock-electron-feasibility/ISA.md`, measured on the same base `ca61130`.*

***The live claim state is `ISA.md` at the repo root, not this file.*** This plan is the design and the reasoning behind it; the ISA carries the 34 numbered claims, their box states and their evidence, and it is the thing to read for "what is actually true right now". Where the two disagree, the ISA wins and this file is the one to fix.
