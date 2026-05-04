# Pitfalls Research — v4.2 Temps & Menu

**Domain:** Per-user WPF desktop widget adding kernel-driver-backed hardware monitoring + WinForms tray menu reuse
**Researched:** 2026-05-04
**Confidence:** HIGH (WinRing0 / PawnIO / blocklist / MPL-2.0), MEDIUM (DPI / right-click GC), LOW (exact non-admin sensor enumeration)

Scope: pitfalls specific to **adding LibreHardwareMonitorLib** and a **right-click-opens-tray-menu** feature to an existing shipped WPF widget with a **per-user Inno Setup installer (no UAC)**. Constraints that must not break: per-user install path, no elevation prompt on normal use, graceful "N/A" fallback, 501-test suite, Core net10.0 WPF/Win32-free layering, no Defender/SmartScreen regression.

---

## Critical Pitfalls

### Pitfall 1: Shipping LibreHardwareMonitorLib 0.9.4 or older (bundled WinRing0)

**What goes wrong:**
LibreHardwareMonitorLib versions through 0.9.4 embed and extract the WinRing0 kernel driver at runtime. WinRing0 is listed on the Microsoft Vulnerable Driver Blocklist (CVE-2020-14979) and is actively signatured by Microsoft Defender as `HackTool:Win32/Winring0` / `VulnerableDriver:WinNT/Winring0`. On Windows 11 24H2 with the blocklist enabled by default, the driver is prevented from loading for *all* users including admins — LHM initialises with zero non-GPU sensors and the UI silently shows N/A everywhere. On Windows 10/11 builds with Defender active, the extracted `.sys` or `.tmp` file in `C:\Windows\SystemTemp\` or `%LOCALAPPDATA%\Temp\` is quarantined the moment it hits disk, which also corrupts the installed FuzzyClock folder and triggers a user-visible threat notification.

**Why it happens:**
WinRing0's last official signed build is from 2020 with a certificate that was retroactively revoked. Microsoft began shipping the Vulnerable Driver Blocklist on by default starting October 2022 (KB5018482/KB5018483/KB5018496) and added Defender signatures for WinRing0 in 2024-2025. The developer-facing NuGet package default install is still a reasonable-looking "LibreHardwareMonitorLib — free hardware monitoring" — nothing in the package name or description warns you that your installer will get quarantined on a fresh Windows 11 24H2 machine.

**How to avoid:**
- **Pin to LibreHardwareMonitorLib 0.9.6 or newer.** This is the first release where the WinRing0 dependency is replaced with PawnIO (PR #1857, September 2025). Pin exact version in the `.csproj` and upgrade deliberately.
- **Never ship WinRing0.sys / WinRing0x64.sys in the installer or allow LHM to extract it.** Verify with a post-build check: `if exist publish\WinRing0*.sys exit 1`.
- **Test the installed artifact on a clean Windows 11 24H2 VM with Defender real-time protection ON** before every release — if the installer gets eaten, users will never see a working build.

**Warning signs:**
- Defender notification during install or first run mentioning `Winring0` or `VulnerableDriver`
- LHM reports only the discrete GPU and nothing else (no CPU package, no motherboard, no NVMe)
- File `WinRing0*.sys` or `*.tmp` appearing in `%LOCALAPPDATA%\Temp\`, `C:\Windows\SystemTemp\`, or the app install directory
- Clean install on 24H2 works for dev (blocklist off) but fails for users (blocklist on)

**Phase to address:**
Phase 1 (Hardware Discovery Spike — LHM feasibility probe). This is the gating go/no-go decision for the whole milestone. Must be validated before writing the Temps tab UI.

---

### Pitfall 2: Assuming PawnIO-based LHM 0.9.6 "just works" without its driver installed

**What goes wrong:**
LHM 0.9.6 replaces WinRing0 with PawnIO, but PawnIO is **not** bundled inside the LibreHardwareMonitorLib NuGet DLL — it is a separate signed kernel driver that the user (or your installer) must install via a separate MSI/installer. The LHM source comment explicitly says "Don't crash if PawnIO isn't installed" (commit eb5e1a2). If FuzzyClock ships only the LHM DLL but not the PawnIO driver, LHM initialises, enumerates hardware, and returns mostly-empty sensor trees — CPU package temperature, motherboard sensors, and some NVMe readings are silently missing. The user sees "CPU N/A" with no explanation.

**Why it happens:**
The PawnIO project is maintained by `namazso` as a separate signed driver + user-mode library. Installing it requires admin rights (one time), which conflicts with FuzzyClock's per-user no-UAC installer invariant. LHM's design goal is to detect PawnIO at runtime and silently degrade; there is no LHM API that tells you "PawnIO is missing, tell the user to install it."

**How to avoid:**
- **Pick one of three explicit strategies and commit to it in the hardware-discovery phase:**
  1. **Accept no-PawnIO graceful degradation.** Ship only LHM DLL. Only GPU (NVIDIA/AMD — use NVAPI/ADL internal paths, no driver needed), battery (SystemInformation — already working), and a few WMI-readable sensors work. CPU package temp, motherboard, NVMe likely N/A. This is the most consistent with the no-UAC invariant.
  2. **Offer an optional "Install advanced sensors" button in Settings > Temps.** Button shell-opens the PawnIO installer (downloaded once, cached in `%LOCALAPPDATA%\FuzzyClock\`). Requires one UAC prompt, clearly labelled as "advanced sensors only".
  3. **Detect PawnIO availability on first run and show a one-time toast.** "Some sensors require PawnIO. [Install] [Skip]". Same UAC flow as #2 but opt-in via clear prompt.
- **Never silently trigger UAC from the widget itself.** The widget must start and run normally with or without PawnIO.

**Warning signs:**
- `hardware.Sensors` for `HardwareType.Cpu` contains `Load` and `Power` entries but no `Temperature` entries
- LHM `Report` string contains "PawnIO not found" or "Ring0 Status: Failed"
- Works on your dev box (PawnIO installed manually once) but not on clean user machines
- Motherboard sensor tree is completely empty on all machines

**Phase to address:**
Phase 1 (Hardware Discovery Spike). Must enumerate *with* and *without* PawnIO on a clean VM and document which sensors are reachable in each mode.

---

### Pitfall 3: Calling `hardware.Update()` or enumerating sensors on the wrong thread at the wrong cadence

**What goes wrong:**
LHM's `Computer` object is not thread-safe, and `hardware.Update()` performs synchronous I/O — reading PCI config space, issuing SMBus transactions through PawnIO, polling NVMe SMART attributes. A single `Update()` call can take 40–200ms on some hardware (and has been seen to block for seconds on Ryzen 10h CPUs and some Intel chipsets). FuzzyClock's existing stats timer can fire at **0.5s during hover fast-refresh** — calling `Update()` from every tick on the UI thread will cause visible stutter, backdrop redraw hitches, and can starve the dispatcher enough to delay phrase updates or ghost-mode proximity callbacks. Worse, if the user right-clicks the widget while `Update()` is in flight and the right-click path also calls into LHM to sync menu state, you have re-entrant unmanaged driver calls and occasional hard hangs (GitHub issue #450, #2166).

**Why it happens:**
Nothing in LHM's API signals that `Update()` is slow. It looks like a cheap getter call. Developers write the obvious loop — `timer.Tick += (s,e) => { computer.Hardware.ForEach(h => h.Update()); UpdateUi(); }` — and it works fine on dev hardware, then crashes or stutters on the first user with a "interesting" motherboard. The existing FuzzyClock stats pattern (PerformanceCounter polling) is thread-safe and cheap; LHM is neither.

**How to avoid:**
- **Dedicated background thread + `ConcurrentDictionary<string, float?>` cache.** A single long-lived thread wakes on a `ManualResetEventSlim` every N seconds (where N is max(stats interval, 2.0) — temperatures change slowly, do not need 0.5s updates), calls `hardware.Update()` for only the hardware types the user has enabled, snapshots sensor values into the cache, and returns to sleep. UI reads from the cache only.
- **Temps refresh interval is decoupled from stats interval.** Hover fast-refresh must *not* accelerate LHM updates. Add `TempsRefreshIntervalSeconds` (default 5.0, min 2.0) as a separate setting, or internally cap at `max(statsInterval, 2.0)`.
- **Never call `Update()` from the UI thread.** Wrap the read path in a small `TempService` class with an `IsReady` guard identical to the existing `StatsService` pattern.
- **Single-entry lock for `Update()`** — if the background tick is already in `Update()`, drop the new tick rather than stack up work.
- **Drag-pause parity** — extend the existing `_isDragging` pause for stats to also pause the temp service's update loop (match the 2.2 pattern).

**Warning signs:**
- Phrase text stutters or ghost-mode proximity fade becomes jerky
- Widget takes > 500ms to respond to right-click on some machines
- CPU% of `FuzzyClock.exe` jumps from ~0.1% to ~2-4% steady-state after enabling temps
- Unhandled AccessViolationException in `LibreHardwareMonitorLib.dll` on second-instance start

**Phase to address:**
Phase 2 (TempService — background thread, cache, lifetime). Must land *before* the Temps tab UI (Phase 4) so the UI binds to a cache not directly to LHM.

---

### Pitfall 4: Forgetting `Computer.Close()` on app exit — driver handle leak and "previous instance" hang

**What goes wrong:**
`Computer.Open()` initialises kernel-mode handles (via PawnIO or, on old versions, WinRing0) and sets up an internal ring buffer. If you only call `Computer.Close()` from `Window.Closing`, it will not fire on Windows log-off, shutdown, or `ProcessExit`, and a crashed or killed FuzzyClock leaves the driver handle ref-counted but orphaned. On the *next* FuzzyClock start, `Computer.Open()` may block for up to 30 seconds waiting for the stale handle to time out, or throw `Win32Exception` "The service cannot accept control messages at this time." This manifests in v4.2 as "the widget takes forever to appear on second launch after a crash" — which is *especially* bad because FuzzyClock v3.5 added single-instance IPC with a 500ms connection window. If LHM init takes 2000ms, the second launch activation path times out and the second instance exits silently, leaving the first (dead) instance orphaned.

**Why it happens:**
The AbandonedMutexException pattern already established in v3.5 handles the WPF mutex side of crash-recovery, but nobody adds the equivalent for LHM driver handles. Developers assume `Computer.Close()` in `OnClosing` is sufficient — it is not; Windows tears down a process without firing `Closing` on log-off, and Task Manager kill never fires `Closing`.

**How to avoid:**
- **Three-tier cleanup path:** `OnClosing` (normal) + `SessionEnding` (log-off/shutdown — already wired in FuzzyClock for SaveSettings) + `AppDomain.CurrentDomain.ProcessExit` (all other exits). Every path calls `_tempService?.Dispose()` which calls `Computer.Close()` exactly once with an Interlocked guard.
- **Wrap `Computer.Open()` in a timeout.** Launch init on a background task with `Task.Run(() => _computer.Open())`; if it does not complete in 3 seconds, log and proceed without temps — better to have a working widget with N/A temps than no widget.
- **Catch and swallow on Close too** — a stale-handle Close can throw; we do not want the exit path to throw.
- **Pin a single `Computer` instance** per process (singleton in TempService). Never `new Computer()` twice.

**Warning signs:**
- Second launch after an abnormal exit takes several seconds to show the widget
- `sc.exe query pawnio` (or `winring0_1_2_0`) shows SERVICE_RUNNING after FuzzyClock has exited
- `Process.GetProcessesByName("FuzzyClock")` shows ghost processes after expected termination
- First launch works, subsequent launches in the same session have missing/zero sensors

**Phase to address:**
Phase 2 (TempService lifetime). Explicit ISC for three-tier dispose path.

---

### Pitfall 5: Layering violation — referencing LibreHardwareMonitorLib from `FuzzyClock.Core`

**What goes wrong:**
LHM's types (`Computer`, `IHardware`, `ISensor`, `HardwareType`) are hardware-aware and transitively pull in WPF-incompatible dependencies (Windows-only P/Invoke surface, `System.Management`). If a developer adds a `LibreHardwareMonitorLib` PackageReference to `FuzzyClock.Core` — which today is pure `net10.0` and WPF/Win32-free — the Core project loses its cross-surface testability invariant. `FuzzyClock.Core.Tests` (MSTest 4.0.1 net10.0) stops running on non-Windows CI. More insidiously: mocking hardware for unit tests becomes impossible because the test project cannot build on the non-Windows TFM, so sensor-dependent logic gets untested.

**Why it happens:**
The natural place to extract "temp formatting", "sensor selection rules", and "sensor availability logic" is `FuzzyClock.Core` (following the pattern established in v2.5 / v3.1 with `UptimeFormatter`, `DateFormatter`, `DialGeometry`, `ContrastService`). But pulling LHM into Core couples a Windows-kernel-driver dependency into the pure-logic library. First developer who needs `ISensor` in Core adds the reference without thinking.

**How to avoid:**
- **Define `ITempReading` (record struct with `SensorId`, `Name`, `Celsius`, `Kind` enum) in `FuzzyClock.Core`.** This is the boundary type. No LHM types cross it.
- **`TempService` lives in `FuzzyClock.App`** — it references LHM, translates `ISensor` → `ITempReading` at the boundary, and exposes only Core types outward.
- **Pure `TempLineFormatter` in Core** — takes `IEnumerable<ITempReading>` + visibility settings + unit, returns the display string (`"CPU 52°  GPU 61°  NVMe 38°"`). Fully unit-testable with no hardware.
- **`SensorKind` enum in Core** — `CpuPackage`, `Gpu`, `Motherboard`, `Nvme`, `Other`. Settings and UI bind to this enum, not to LHM types.
- **Verify layering in CI.** Grep gate in the release workflow: if `FuzzyClock.Core/` contains the string `LibreHardwareMonitor`, fail the build.

**Warning signs:**
- `FuzzyClock.Core.csproj` gains a PackageReference other than BCL / text-processing
- A `using LibreHardwareMonitor.Hardware;` appears anywhere under `FuzzyClock.Core/`
- Core tests gain `[TestCategory("RequiresWindows")]` or skip attributes
- MSTest discovery fails on a non-Windows dev machine

**Phase to address:**
Phase 2 (TempService design — establish layering up front). Include the grep gate in the ISC list.

---

### Pitfall 6: Re-using the tray `ContextMenuStrip` from WPF `MouseRightButtonUp` without DPI-correct coordinates

**What goes wrong:**
`ContextMenuStrip` is a WinForms control; it opens via `cms.Show(Point screenPoint)` where the Point is in **physical pixels** on the system-DPI coordinate system. WPF `MouseButtonEventArgs.GetPosition(window)` returns **DIPs (device-independent pixels)** on the window's DPI context. Converting with `PointToScreen` gives you DIPs in WPF's screen space, which on a 150% or 200% scaling monitor is not equal to physical pixels. Result: menu pops up 50–100 pixels off-cursor on high-DPI systems, or appears on a completely different monitor in multi-monitor mixed-DPI setups. Known problem area — see `dotnet/winforms#4898`, `dotnet/winforms#9063`, `dotnet/winforms#9258` — `ContextMenuStrip` itself has historical DPI-scaling issues for item sizing, which compounds the placement bug.

**Why it happens:**
WPF's transparent overlay is set up with `AllowsTransparency=True` and (typically) per-monitor-v2 DPI awareness via the app manifest. The WinForms tray icon ecosystem was written pre-DPI-awareness and still uses system-DPI-virtualised coordinates. The two coordinate systems disagree silently — the API signature of `Show(Point)` does not tell you which system it expects. Developers test on a 100% scaling dev monitor where both systems happen to agree.

**How to avoid:**
- **Do not call `cms.Show(Point)`. Use `cms.Show(Control, Point)` with a hidden WinForms anchor control, or better, use `cms.Show()` with `cms.Tag`/position set first.** The `Show(Control, Point)` overload treats the point as control-client-relative and scales correctly.
- **Simplest robust pattern:** use WPF `ContextMenu` (not WinForms `ContextMenuStrip`) for the widget right-click. WPF menus inherit the window's per-monitor DPI context automatically. Either:
  - Build a second WPF `ContextMenu` that mirrors the tray menu (keep both in sync via a shared menu-model class in `FuzzyClock.App`), OR
  - Have a single menu-model and two projections (one `ContextMenuStrip` for NotifyIcon, one `ContextMenu` for widget RMB).
- **If `ContextMenuStrip` must be reused:** anchor via `PresentationSource.FromVisual(this).CompositionTarget.TransformToDevice` to convert WPF DIPs → physical pixels. Do **not** use `DpiHelper.LogicalToDeviceUnitsScalingFactor` — it returns the system DPI, not the monitor DPI.
- **Always test at 100%, 150%, and 200% scaling, on multi-monitor where monitors have different scale factors.**

**Warning signs:**
- Menu appears in the "right place" on the primary monitor but on the wrong monitor for widgets on the secondary
- Menu is offset consistently (e.g. always 50px down-and-left) — a scaling factor mismatch
- Menu items look blurry or oversized on 200% DPI (ContextMenuStrip scaling bug)
- Menu appears briefly then immediately closes (focus-activation race — see Pitfall 8)

**Phase to address:**
Phase 3 (Right-Click Menu). Do the menu-model extraction and projection in Phase 3 explicitly; do not reuse `ContextMenuStrip` across both paths.

---

### Pitfall 7: Menu is garbage-collected between Show and first user click

**What goes wrong:**
If you construct a `ContextMenuStrip` inside the right-click handler as a local variable and call `Show`, the GC can collect it after the handler returns — even while the menu is visually displayed — because the `Show` method does not keep a strong reference to the menu. Result: the menu visibly appears, the user clicks an item, and nothing happens (click handler on a collected delegate is a silent no-op), or the menu closes mid-show with no action fired. This is an extremely common WinForms tray-menu pattern bug.

**Why it happens:**
`NotifyIcon.ContextMenuStrip` assignment keeps a strong reference for the tray case, so this bug does not surface in the existing v2.2 tray integration. When you extend to "also show on widget right-click", the natural pattern is `var menu = BuildMenu(); menu.Show(...)` inside a handler — which constructs a fresh menu on every click and lets GC eat it.

**How to avoid:**
- **Single long-lived `ContextMenuStrip` field.** Build once in `Initialize`, keep as a private field (`_trayMenu`). Both the tray and the widget right-click handler reference the same instance.
- **Sync checkmark state in `Opening` event** — same `ContextMenu_Opened` pattern established for the existing tray in v1.9. One menu, one sync point.
- **Never `new ContextMenuStrip()` in a handler that only calls `Show`.**

**Warning signs:**
- Menu items silently do nothing when clicked — intermittent, more likely under memory pressure
- Menu closes prematurely right after opening
- Debugger break on handler never hits
- Works in Debug build but fails in Release (GC more aggressive in Release)

**Phase to address:**
Phase 3 (Right-Click Menu). Part of the menu-model refactor — explicitly create one menu instance.

---

### Pitfall 8: Right-click activates Topmost transparent widget in ways that break drag/hover

**What goes wrong:**
`ContextMenuStrip.Show` internally creates a new top-level window for the menu. On a `Topmost=True AllowsTransparency=True WindowStyle=None` overlay, this can:
1. Steal activation from the widget, causing `LostFocus` and `MouseLeave` to fire on the widget *before* the menu opens (the v2.3 synthetic-MouseLeave pattern strikes again)
2. Cause the widget to briefly lose Topmost ordering (WPF transparent windows have known Z-order bugs with popup children), meaning the widget can drop behind the taskbar or other Topmost windows momentarily
3. The menu itself ends up behind the widget on some systems because the menu window is not Topmost by default while the widget is
4. Interact badly with ghost mode: if the proximity-fade kicks in while the menu is open, the widget behind the menu partially fades, visually breaking both

**Why it happens:**
The WPF transparent-Topmost-ToolWindow combination is already fragile (see the entire v2.3 ghost-mode comment thread, v3.5 IPC bring-to-front, v3.6.2 cloaked-window guards). Adding a WinForms-parented menu window on top of this stack adds a third windowing system's focus/activation model into the mix.

**How to avoid:**
- **Prefer WPF `ContextMenu` on `RightButtonUp`** — WPF `ContextMenu` is a Popup under the hood, inherits the window's window context, and does not create a separate top-level window. Integrates cleanly with `AllowsTransparency` and does not trigger synthetic MouseLeave.
- **Suppress proximity fade while menu `IsOpen`.** Gate in `GhostModeController.OnTimerTick`: if `MainWindow._contextMenu?.IsOpen == true`, skip the proximity callback. Mirrors the existing `_isDragging` gate.
- **Suppress ghost-mode activation while menu is open.** Ghost-mode is already suppressed by Ctrl+Alt; add menu-open as a second suppressor with the same semantics.
- **Right-click only honoured when Ctrl+Alt is held OR ghost mode is disabled** (matching the existing interaction invariant — WS_EX_TRANSPARENT passes RMB through, so this falls out naturally, but document it explicitly).
- **Test the interaction matrix:** RMB while hovering / RMB while in proximity-fade / RMB immediately after drag / RMB with ghost off / RMB with Ctrl+Alt held / RMB during auto-contrast sample. Each combination must not leave the widget in a weird state.

**Warning signs:**
- Widget flickers when right-clicked
- Ghost-mode activates while the menu is still visible
- Menu opens behind the widget or behind other Topmost windows
- `WM_MOUSELEAVE` fires at the widget while the user is still hovering over it

**Phase to address:**
Phase 3 (Right-Click Menu). Add ISC entries for the interaction matrix explicitly.

---

### Pitfall 9: Right-click on a faded widget triggers interaction the user did not expect

**What goes wrong:**
In v4.0 Proximity Ghost Mode, the widget fades to zero opacity as the cursor approaches. `WS_EX_TRANSPARENT` is applied only at opacity=0; between 0 and `configured_opacity` the widget is visible-but-fading and **still receives mouse input**. If the user right-clicks the widget at, say, 30% opacity (cursor is partway into the proximity zone), the menu appears on a mostly-faded widget. Visually confusing. Worse: `WindowChrome`/popup focus stealing at 30% opacity can leave the widget frozen mid-fade when the menu closes.

**Why it happens:**
The milestone spec says "RMB requires Ghost Mode off or Ctrl+Alt held", which is correct for the `WS_EX_TRANSPARENT` case (opacity=0 — clicks pass through). But the *proximity fade zone* between full-opacity and zero-opacity is an in-between state the spec does not explicitly call out. Cursor approaches, opacity drops to 0.3, user right-clicks before crossing the fully-hidden threshold.

**How to avoid:**
- **Two-part gate on RMB handler:**
  1. `if (_proximityRatio > 0.5) { e.Handled = false; return; }` — treat the inner half of the fade zone as "user already disengaging, do nothing"
  2. OR, freeze `_proximityRatio` at its current value while the menu is open (cursor-over-menu does not advance proximity)
- **Preferred:** when menu opens, pin widget opacity to `configured_opacity` (suppress proximity fade entirely while IsOpen), and restore normal fade behaviour on Closed. Matches the existing "suppress proximity during drag" pattern.
- **Document the interaction rule** in the milestone ISC: "RMB while partially faded — cursor is still in the zone — menu suppresses fade and holds widget at configured opacity until menu closes."

**Warning signs:**
- User reports "I right-clicked and the widget disappeared / flickered"
- Widget stuck at partial opacity after closing the menu
- Menu shows on a barely-visible background, looks "floating in space"

**Phase to address:**
Phase 3 (Right-Click Menu) + integration test against Phase 2 (TempService) gating logic.

---

### Pitfall 10: Installer breaks when LHM DLL or its native dependencies are missing from `[Files]`

**What goes wrong:**
Current `FuzzyClock.iss` ships exactly one file:
```
Source: "{#SourceDir}\FuzzyClock.exe"; DestDir: "{app}"; Flags: ignoreversion
```
This works because the project uses `dotnet publish` with self-contained single-file mode (most likely). Adding `LibreHardwareMonitorLib.dll` as a NuGet reference in a **framework-dependent** publish leaves the DLL as a loose file next to the exe — installer misses it, app crashes with `FileNotFoundException: LibreHardwareMonitorLib` on first run. If the publish profile is **self-contained single-file**, the DLL *is* embedded, but only if `IncludeNativeLibrariesForSelfExtract` is configured correctly — LHM has native assets (PawnIO interop) that need this flag. Inno Setup silently ships only what you list.

**Why it happens:**
The `[Files]` section is hand-maintained in `FuzzyClock.iss`. No globbing. Adding a NuGet reference does not update the installer. The CI pipeline (`release.yml`) runs `dotnet publish` and `ISCC` but does not verify all `publish\*.dll` files are listed.

**How to avoid:**
- **Confirm publish mode.** Determine whether FuzzyClock publishes self-contained-single-file or framework-dependent, and document in PROJECT.md. Re-verify after LHM addition — the publish mode might need to change.
- **If single-file:** add `<IncludeNativeLibrariesForSelfExtract>true</IncludeNativeLibrariesForSelfExtract>` and `<IncludeAllContentForSelfExtract>true</IncludeAllContentForSelfExtract>` to `FuzzyClock.App.csproj`. Verify the final exe size grew appropriately.
- **If multi-file publish:** change `FuzzyClock.iss` `[Files]` to a glob:
  ```
  Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs
  ```
- **Add a smoke test to the CI workflow** — after install, run `FuzzyClock.exe --selfcheck` (new minimal flag that initialises LHM and exits with zero if Computer.Open() succeeds or returns a known-good code if driver unavailable).

**Warning signs:**
- `FileNotFoundException` on first run
- `TypeInitializationException` for TempService
- Publish folder contains DLLs not present in the installed folder
- Self-contained publish exe size does not change when adding a large NuGet dependency

**Phase to address:**
Phase 5 (Installer Update) — include as an ISC. Verify on a clean VM.

---

### Pitfall 11: SmartScreen reputation reset on installer signature / filename change

**What goes wrong:**
SmartScreen reputation is keyed on `(certificate, exact filename)`. FuzzyClock's installer has accumulated some reputation since v3.5 with filename `FuzzyClockSetup-X.Y.Z.exe` (whether signed or not). Adding LibreHardwareMonitorLib's MPL-2.0 attribution may tempt a developer to also rename the installer ("FuzzyClockSetup-with-temps-4.2.0.exe") or bundle PawnIO inside, changing the set of signed binaries — either resets SmartScreen reputation. Users see "Windows protected your PC" warning again, even though prior versions installed cleanly. For unsigned installers (most likely case for FuzzyClock), adding a vulnerable-driver-adjacent component (LHM) increases the probability that Defender's heuristic flags the installer as unknown even if the content is clean.

**Why it happens:**
SmartScreen reputation is opaque and sticky to filename+cert. Developers do not realise a filename change blows away trust earned over prior releases. Adding anything hardware-monitoring-adjacent to an unsigned installer raises heuristic flags because historically that is where malware packs RATs.

**How to avoid:**
- **Do not change the installer filename template.** Keep `FuzzyClockSetup-X.Y.Z.exe`.
- **Do not change the AppId GUID** (already `{B8F2E3A1-...-5B6C}`). If you change it, the upgrade path breaks for existing users *and* SmartScreen treats it as a new product.
- **If unsigned:** submit the v4.2 installer to Microsoft via the SmartScreen submission form (`https://www.microsoft.com/en-us/wdsi/filesubmission`) immediately after release. Reputation builds faster for pre-submitted clean files.
- **If time/budget permits:** invest in a standard code-signing cert (not EV — EV gives instant reputation but is $$$; standard is cheaper and builds trust over a few weeks). One-time decision, not v4.2 scoped.
- **Test the release artifact on a Windows 11 24H2 machine with Defender fully updated, not just your dev box** — dev machines often have Defender exclusions.
- **Keep PawnIO out of the FuzzyClock installer.** Shipping it under your unsigned cert = your installer inherits PawnIO's reputation. Let users install PawnIO separately from its own signed installer if they want advanced sensors (Pitfall 2, Strategy 1/2).

**Warning signs:**
- Users report "Windows protected your PC" on v4.2 installer when v4.1 worked fine
- Defender quarantines `FuzzyClockSetup-4.2.0.exe` in `%LOCALAPPDATA%\Temp\`
- VirusTotal score on v4.2 installer is worse than v4.1 for the same cert
- SmartScreen dialog shows "Unknown publisher" instead of "Alex Tabisz"

**Phase to address:**
Phase 5 (Installer Update). Explicit ISC: "v4.2 installer installs cleanly on Windows 11 24H2 with Defender active and no manual override."

---

### Pitfall 12: MPL-2.0 attribution / NOTICE file missing from the installer

**What goes wrong:**
LibreHardwareMonitorLib is MPL-2.0 licensed. MPL-2.0 Section 3.1 requires: "You must inform recipients that the Source Code Form of the Covered Software is governed by the terms of this License, and how they can obtain a copy of this License." Distributing the DLL unmodified in an installer without including (a) the MPL-2.0 license text and (b) attribution stating "this product includes LibreHardwareMonitorLib, (c) contributors, licensed under MPL-2.0, source at <URL>" is a license violation. This is not theoretical — MPL-2.0 is file-level copyleft, and LHM's maintainers are active; they do check.

**The *good* news:** MPL-2.0 is **not** viral beyond the MPL'd files. FuzzyClock's own code (MIT) has **no** source-disclosure obligation. Combining a proprietary/MIT application with an unmodified MPL-2.0 DLL is explicitly permitted by MPL-2.0 FAQ — the MPL code stays in its own files (the DLL), the MIT code stays in its own files. No copyleft spread.

**Why it happens:**
Developers confuse MPL with GPL/LGPL, either over-worry ("do we have to open-source FuzzyClock?" — no) or under-worry ("just a DLL, attribution doesn't matter" — wrong). Inno Setup makes it easy to forget attribution because it does not ship a default NOTICE or third-party file.

**How to avoid:**
- **Add `THIRD-PARTY-NOTICES.md` to the repo root.** Include:
  - LibreHardwareMonitorLib attribution, version, MPL-2.0 license URL, source URL (https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)
  - Full MPL-2.0 license text (copy verbatim from https://www.mozilla.org/en-US/MPL/2.0/)
  - One line per other NuGet package used (System.Diagnostics.PerformanceCounter etc.) with license
- **Ship `THIRD-PARTY-NOTICES.md` in the installer.** Add to `FuzzyClock.iss` `[Files]`:
  ```
  Source: "{#SourceDir}\THIRD-PARTY-NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion
  ```
- **Add a "Licenses..." menu item** to the Settings window About section or an "Open Licenses" link from tray menu that opens the file.
- **Do NOT modify the LibreHardwareMonitorLib DLL.** If you modify (patch IL, for instance), Section 3.1 triggers modified-file source-disclosure obligations for the DLL only. Keep it pristine.
- **If LHM gets upgraded to a version where the DLL is renamed or split:** update attribution to match. Each MPL-covered file needs attribution.
- **Confirm distribution channel:** GitHub Releases distribution counts as "distribution" under MPL. The attribution must be in the installer, not only in the repo.

**Warning signs:**
- No `THIRD-PARTY-NOTICES.md` in the installed folder
- LHM contributors file a GitHub issue asking about attribution
- VirusTotal or similar scanning tools flag "unlicensed third-party component"
- No user-accessible way to view the MPL-2.0 license after installation

**Phase to address:**
Phase 5 (Installer Update). Non-negotiable; add before the release is tagged.

---

### Pitfall 13: Unit tests touch real hardware and fail on CI / other machines

**What goes wrong:**
LHM's `Computer` class is not interface-backed. A naive test `var c = new Computer(); c.Open(); Assert.IsTrue(c.Hardware.Any());` opens the real driver, takes 200-2000ms, requires admin on some hardware, requires PawnIO installed, and produces different results on every machine. Adding tests like this to the existing 501-test suite causes intermittent CI failures (GitHub Actions runners have different virtualised hardware), slows the suite, and can leave driver handles open if the test is interrupted. Existing suite isolates this problem by never touching hardware — StatsService is mocked via constructor injection or `IsReady` guards; the same discipline must extend to TempService.

**Why it happens:**
LHM was not designed with testability in mind. `Computer`, `IHardware`, `ISensor` are interfaces but LHM constructs concrete types internally; you cannot substitute a mock `IHardware` into `Computer` for testing. Developers reach for integration tests because unit tests "don't really validate anything", and those integration tests start touching the driver.

**How to avoid:**
- **Introduce `ITempSource` abstraction in `FuzzyClock.App`.** One implementation (`LhmTempSource`) wraps LHM; one (`FakeTempSource`) returns canned `ITempReading` values for tests.
- **`TempService` takes `ITempSource` via constructor** — existing App test project pattern (MSTest 4.0.1 net10.0-windows + UseWPF=true).
- **All tests live in `FuzzyClock.App.Tests`** (not Core — Core has no LHM reference). They test: sensor-selection-rules, N/A fallback, temp line formatting, dispose-lifetime (call Close N times), cache-refresh-cadence, visibility-toggle logic.
- **Zero tests call `new Computer().Open()`.** If you need to verify LHM actually opens, use a manual smoke-test checklist or a separate `--selfcheck` CLI flag that is not part of the unit-test run.
- **Keep all TempService tests `[DoNotParallelize]`** if they touch the singleton cache — matches the existing v3.2 `PhraseEngineCoordinatorTests` pattern.
- **CI gate:** all tests pass on the Windows GitHub Actions runner without any driver or admin. Verify before merging.

**Warning signs:**
- CI test run time increases by > 2 seconds
- Intermittent failures on tests with "Temp" or "Hardware" in the name
- Tests pass locally, fail on CI (or vice versa)
- `dotnet test` leaves `winring0*.sys` or driver-handle leaks visible in Process Explorer

**Phase to address:**
Phase 2 (TempService). Create `ITempSource` + `FakeTempSource` *first*, write production code against the interface, never the concrete LHM.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Call `hardware.Update()` on UI thread from stats tick | Zero new threads, simplest wiring | Stutter, hangs on some hardware, cross-thread exceptions when cache grows | Never - always background thread + cache |
| Ship LHM 0.9.4 "because it's on NuGet and it works today" | Don't have to chase nightly builds | Defender quarantines installer; broken for every Win11 24H2 user | Never - 0.9.6+ minimum |
| Bundle WinRing0 / PawnIO driver inside the installer | Single-click install, all sensors work | Defender flag, blocklist collision, MPL-2.0 attribution complexity for PawnIO too, UAC required = breaks no-UAC invariant | Never for FuzzyClock - separate opt-in path if at all |
| Reuse `ContextMenuStrip` directly from WPF right-click | No new UI code, exact same menu | DPI placement bug, focus-activation quirks, GC lifetime bug | Never - build WPF `ContextMenu` and share a menu-model |
| Call `Computer.Open()` synchronously in `MainWindow` constructor | Temps ready at first paint | 200-2000ms startup delay, IPC bring-to-front timeout, UAC-prompt visible briefly on some hardware | Never - lazy-init on first settings-open or first tick |
| Reference LHM from `FuzzyClock.Core` "just for the enum" | Fewer files | Core tests break on Linux CI, whole layering model collapses | Never - define `SensorKind` enum in Core, keep LHM isolated to App |
| Skip `THIRD-PARTY-NOTICES.md` in installer | Smaller installer | MPL-2.0 non-compliance, maintainer DMCA risk | Never - trivial to add |
| Use `new ContextMenuStrip()` per right-click | Fresh state each time | GC collects mid-show, click handlers silently fail | Only if explicitly rooted via a static field (which means "once") |
| Skip Windows 11 24H2 VM test before release | Faster release | Users see Defender warning, reputation damage, support burden | Never once LHM ships |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| LibreHardwareMonitorLib NuGet | Accept latest stable without checking WinRing0/PawnIO transition | Pin `>= 0.9.6`; re-verify on every upgrade that no WinRing0 files land in publish/ |
| PawnIO driver | Assume it's bundled in LHM DLL | It is NOT - it's a separate signed driver + user-mode lib installed once system-wide with UAC |
| WPF RMB + WinForms tray menu | Share one `ContextMenuStrip` instance across both code paths | Build a shared menu-model; one `ContextMenuStrip` for NotifyIcon, one WPF `ContextMenu` for widget RMB - DPI and focus behave correctly |
| Inno Setup `[Files]` | Single exe entry continues to work after adding NuGet refs | Switch to wildcarded glob OR verify self-contained-single-file publish mode + `IncludeNativeLibrariesForSelfExtract` |
| Windows Defender / SmartScreen | Dev machine test sufficient | Dev machines often have exclusions; always test on clean Win 11 24H2 VM with current signatures |
| Windows Vulnerable Driver Blocklist | Disable on dev box, forget it's default-on for users | Assume enabled for every user; test with it enabled; WinRing0 blocks silently |
| Auto-contrast + Temps tab | Temps row changes accent color state, invalidates contrast cache | Temps row reads `_currentDisplayColor` same way as stats rows - verify in Phase 4 |
| Ghost mode proximity fade + RMB menu | Menu opens, proximity keeps updating underneath | Pin `_proximityRatio` at menu-open value; restore at Closed event |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `hardware.Update()` per hover fast-refresh tick (0.5s) | UI stutter, CPU% spikes, delayed phrase updates | Temps cadence decoupled from stats; minimum 2s, default 5s | Immediately on any user with motherboard SMBus sensors |
| Enumerating all sensors on every read | Allocator pressure, GC pauses visible | Cache `ISensor` refs at Open time, reuse; read `.Value` only | Noticeable > 100 sensors (Ryzen + discrete GPU + dual NVMe + MB) |
| Opening `Computer` on UI thread | App feels unresponsive for 500-2000ms at startup | `Task.Run(() => _computer.Open())` with timeout | Always, especially with PawnIO service cold-start |
| Not disposing `Computer` on log-off | Driver handle orphan, next start slow | Three-tier dispose (Closing + SessionEnding + ProcessExit) | Only after a crash or hard termination |
| `Computer.Open()` called twice (e.g. on re-enable) | Driver throws `Win32Exception`, resource leak | Singleton guard; Interlocked open-once | Settings toggle off->on->off->on rapid |
| Allocating new temp strings every tick | GC pressure at 1 Hz | Format into pre-sized StringBuilder; update TextBlock.Text only if changed | After a few minutes of running with stats interval at 0.5s |
| Right-click handler does LHM sync work | Menu takes 500ms to appear | All LHM reads from cache; menu open is always cheap | First right-click after startup before cache populated |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Bundling WinRing0 binaries | Installer quarantined by Defender on most Win11 machines; CVE-2020-14979 liability | Use LHM 0.9.6+; add CI gate that fails if `WinRing0*.sys` appears in `publish/` |
| Extracting drivers to writable temp without integrity check | Attacker replaces the driver before LHM loads it | LHM 0.9.6+ eliminates this path; PawnIO is system-installed and signed |
| Requesting admin on widget start | User trains themselves to approve UAC on a background widget = high-value target | Widget never elevates; PawnIO install is separate, explicit, one-time |
| Running as admin "just in case" to get more sensors | Entire widget attack surface is now admin | Never add `requestedExecutionLevel="requireAdministrator"` to the manifest |
| Missing MPL-2.0 attribution | License violation, DMCA exposure | `THIRD-PARTY-NOTICES.md` in repo and in installer |
| Opening LHM and never closing | Orphan kernel handles, driver stays loaded after app exits | Three-tier dispose path (see Pitfall 4) |
| IPC named pipe receives shell commands from second instance | Remote-code-execution if the pipe ACL is wide open | Existing v3.5 pipe is single-machine per-user; do not broaden ACL for temps |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Temps row shows "N/A" everywhere with no explanation | User thinks the feature is broken | On first-show with all-N/A, show a one-time toast: "Some sensors need PawnIO. [Learn more] [Dismiss]" |
| Temps refresh at 0.5s when hovering causes jitter | Hover on widget shows flickering numbers | Temps refresh minimum 2s regardless of hover state |
| UAC prompt appears when user just wants to see temps | User closes widget, never returns | No UAC from widget; temps work best-effort without admin; PawnIO install is opt-in explicit |
| Menu items differ between tray and right-click | User is confused about where to find settings | Single menu-model; mechanical projection to two UI frameworks; identical items, identical checkmarks |
| Defender quarantines installer on first download | User blames FuzzyClock; abandons | Test Win11 24H2 + Defender before every release; submit unsigned installers to SmartScreen pre-release |
| Widget stutters or lags with Temps enabled | Feels "heavy" vs v4.1 | Background thread + cache; never `Update()` on UI thread |
| Right-click on faded widget does nothing or flickers | User double-right-clicks, feels unresponsive | Pin opacity at configured when menu open; suppress proximity fade |
| Units buried in Settings (Celsius vs Fahrenheit) | User wants Fahrenheit but cannot find it | Scope-cut: Celsius only for v4.2 - per milestone spec; add Fahrenheit in v4.3 if requested |

## "Looks Done But Isn't" Checklist

- [ ] **LHM version:** Pinned to `>=0.9.6`. Verify: `grep LibreHardwareMonitorLib FuzzyClock.App/*.csproj` shows `Version="0.9.6"` or higher.
- [ ] **No WinRing0 in publish:** Verify: `find publish -name "WinRing0*"` returns nothing after `dotnet publish`.
- [ ] **Defender test on Win11 24H2:** Clean VM, Defender signatures current, blocklist default-on. Install runs without prompt/quarantine.
- [ ] **MPL-2.0 attribution:** `THIRD-PARTY-NOTICES.md` exists in repo root AND in installed folder (verify via inspecting installed `{app}\`).
- [ ] **LHM absent from Core:** Verify: `grep -r "LibreHardwareMonitor" FuzzyClock.Core/` returns nothing.
- [ ] **TempService three-tier dispose:** Verify: `Computer.Close()` called from `OnClosing`, `SessionEnding`, and `ProcessExit`, all gated by Interlocked.
- [ ] **Cache-not-direct-read in UI:** Verify: UI code path never calls `ISensor.Value` - only `TempService.GetCached(SensorKind)`.
- [ ] **Temps cadence independent:** Verify: Hover fast-refresh (0.5s) does NOT speed up Temps updates. Temps timer is its own `DispatcherTimer` (or `PeriodicTimer`) with 2s minimum.
- [ ] **Right-click menu parity:** Verify: every tray menu item is present with identical label and identical checkmark behaviour in the widget right-click menu.
- [ ] **Right-click + ghost mode:** Verify on all 6 interaction cases (ghost off / ghost on+normal / ghost on+Ctrl+Alt / during drag / during proximity fade / during auto-contrast sample).
- [ ] **Right-click DPI:** Verify on 100%, 150%, 200% scaling and on multi-monitor with different scales. Menu appears at the cursor, not offset.
- [ ] **Installer ships all LHM assets:** Verify: folder diff between `publish/` and installed `{app}/` - should be identical (or a reasonable subset for self-contained single-file).
- [ ] **Zero admin required on normal use:** Verify: widget launches from tray auto-start with no UAC prompt. `manifest:requestedExecutionLevel=asInvoker` (default).
- [ ] **Single-instance IPC still snappy:** Verify: second-launch bring-to-front completes in <500ms even with LHM loaded (Computer.Open must be async).
- [ ] **501-test baseline holds:** No existing test broken. New tests all pass without admin, without PawnIO installed, without network.
- [ ] **Temps column collapses when all disabled:** Show Temps Line toggle off -> temps line Visibility.Collapsed (no blank row, matching v1.3 stats collapse pattern).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Shipped LHM 0.9.4 (WinRing0) and users report Defender quarantine | HIGH | Hotfix release with LHM 0.9.6+; communicate via README and GitHub issue template; users whose `FuzzyClock.exe` is already quarantined need manual Defender restore |
| Missing MPL-2.0 attribution | LOW | Immediate commit adding `THIRD-PARTY-NOTICES.md`, hotfix installer, add link in about dialog |
| Temps cadence too aggressive causing stutter | MEDIUM | Hotfix: raise min temp interval to 5s via Validate(); add Settings slider in v4.3 |
| Computer.Open() hangs on user hardware | MEDIUM | Add 3s timeout with fallback to N/A for all; log warning; document in README known-hardware-issues |
| Right-click menu offset on high-DPI | MEDIUM | Migrate to WPF `ContextMenu` (dedicated widget menu); reuse menu-model for both projections |
| Installer SmartScreen-flagged | HIGH | Submit to Microsoft file-submission portal; rebuild with same filename; reputation takes 1-4 weeks to rebuild; consider code-signing cert purchase |
| LHM upgraded and sensors disappeared | LOW | Pin version down until root cause identified; file issue upstream; fallback to N/A for affected SensorKinds |
| Context menu GC'd during show | LOW | Refactor to field-held menu instance - standard WinForms tray pattern |
| Driver handle orphaned after crash | MEDIUM | Manual sc.exe stop; implement three-tier dispose + Computer.Open timeout + handle-existing-service path |

## Pitfall-to-Phase Mapping

Recommended phase structure for v4.2:

- **Phase 1 - Hardware Discovery Spike** (addresses Pitfalls 1, 2): Install LHM 0.9.6 on clean Win11 24H2 VM with and without PawnIO, enumerate sensors, document what works in each mode, decide on PawnIO strategy. Go/no-go gate.
- **Phase 2 - TempService** (addresses Pitfalls 3, 4, 5, 13): `ITempSource`, `TempService`, background thread, three-tier dispose, tests against `FakeTempSource`. Zero UI in this phase.
- **Phase 3 - Right-Click Menu** (addresses Pitfalls 6, 7, 8, 9): Menu-model extraction, WPF `ContextMenu` for widget RMB, ghost-mode suppression while open, interaction-matrix tests.
- **Phase 4 - Temps Tab UI** (integrates 2 + 3): Settings tab, checkboxes, temps line rendering, accent color integration, auto-contrast pass-through.
- **Phase 5 - Installer & Release** (addresses Pitfalls 10, 11, 12): `FuzzyClock.iss` updates, `THIRD-PARTY-NOTICES.md`, SmartScreen/Defender verification on clean VM.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 - WinRing0 bundling | Phase 1 | CI grep: no `WinRing0*.sys` in publish/; Defender test on 24H2 VM passes |
| 2 - PawnIO assumption | Phase 1 | Documented decision; clean VM test confirms sensors-with-PawnIO and sensors-without-PawnIO match spec |
| 3 - Update() cadence | Phase 2 | Profiler shows UI thread never blocked > 5ms; temps tick on background thread only |
| 4 - Close() missing | Phase 2 | Unit test: TempService.Dispose called N times, no exception; manual: kill process, sc query shows no orphan |
| 5 - Layering violation | Phase 2 | CI grep: `FuzzyClock.Core/` contains zero LHM references |
| 6 - DPI placement | Phase 3 | Manual test at 100/150/200% + multi-monitor mixed-DPI; screenshot each |
| 7 - Menu GC | Phase 3 | Release-build smoke test: right-click, wait 10s, click item, verify handler fires |
| 8 - Topmost/focus | Phase 3 | Interaction matrix test passes (6 combinations) |
| 9 - Faded RMB | Phase 3 | Manual: approach widget, right-click at ~30% opacity, menu renders clean, ratio frozen |
| 10 - Installer files | Phase 5 | Folder diff publish/ vs installed/ shows zero missing files |
| 11 - SmartScreen | Phase 5 | Clean Win11 24H2 VM install completes without warning; filename unchanged |
| 12 - MPL attribution | Phase 5 | `THIRD-PARTY-NOTICES.md` in installed folder; linked from Settings About |
| 13 - Hardware tests | Phase 2 | 501 -> 501+N tests on CI pass without driver or admin |

## Windows Kernel Driver Landscape - 2025/2026 Snapshot

**WinRing0 status (as of 2026-05):**
- CVE-2020-14979 - known vulnerability, actively exploited by some malware families to gain SYSTEM-level access via unauthenticated MSR/port IO
- Defender signatures: `HackTool:Win32/Winring0.A-Z`, `VulnerableDriver:WinNT/Winring0.A-Z`
- Microsoft Vulnerable Driver Blocklist: enabled by default since Windows 11 22H2 (KB5018483, October 2022); default-on for Windows 11 24H2; harder to disable on 24H2 than on prior versions
- April 2026 Windows security updates (Win10 22H2, Win11 23H2/24H2/25H2, Server 2022/2025) introduce additional protections for known-vulnerable kernel drivers - will impact any remaining WinRing0 deployments
- Last signed WinRing0 build: 2020; certificate has been effectively revoked
- Reasonable conclusion: **WinRing0 is not shippable in 2026.**

**PawnIO status:**
- Signed kernel driver + user-mode `pawnio.dll`, maintained by `namazso`
- Released under MIT license for the driver, GPL-2.0-or-later for the user-mode lib (verify current)
- Not yet on the blocklist; actively maintained and newer than WinRing0
- Requires one-time admin install (service registration) - does not require admin for sensor reads
- Adopted upstream by: FanControl, OpenRGB, LibreHardwareMonitor (0.9.6+), turing-smart-screen-python, CmpInf
- Distributed via its own signed installer, not bundled into consumer apps

**Windows Defender on per-user installers:**
- Heuristic scrutiny has increased noticeably in 2024-2025
- Unsigned installers from unknown publishers face longer SmartScreen "Windows protected your PC" dialog
- Hardware-monitoring-adjacent installers flagged with higher probability (historical malware pattern)
- Solution hierarchy: unsigned + SmartScreen submission (free, 1-4 weeks) < standard cert ($~200/yr, 1-4 weeks) < EV cert ($~400/yr, instant)

**Windows 11 24H2 specific:**
- Vulnerable Driver Blocklist harder to disable than on 22H2/23H2 (requires MDM policy in some SKUs)
- Smart App Control (new in 24H2) adds another layer - unsigned apps may be blocked entirely on "S Mode"-like policy
- Per-user installs (no UAC) remain supported and preferred for consumer apps

## Sources

- LibreHardwareMonitor v0.9.6 release: https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/tag/v0.9.6 [HIGH]
- LHM WinRing0 -> PawnIO PR #1857 commit: https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/commit/eb5e1a20be996d4865170b13bab97af43d97f341 [HIGH]
- HackTool:Win32/Winring0 Defender signature issue: https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/issues/1660 [HIGH]
- Post-WinRing0-block LHM sensor absence: https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/issues/1881 [HIGH]
- No motherboard sensors in pre-454: https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/issues/2088 [MEDIUM]
- Microsoft recommended driver block rules: https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/design/microsoft-recommended-driver-block-rules [HIGH]
- Microsoft Q&A VulnerableDriver:WinNT/Winring0: https://learn.microsoft.com/en-us/answers/questions/5621936/ [HIGH]
- April 2026 Windows security updates (kernel driver protections): https://support.microsoft.com/en-us/topic/april-2026-windows-security-updates-introduce-protections-to-known-vulnerable-kernel-drivers-1f8aaf7c-d4ac-4e02-be1d-b63c1b1aa9d0 [HIGH]
- Defender Winring0 documentation: https://support.microsoft.com/en-us/windows/microsoft-defender-antivirus-alert-vulnerabledriver-winnt-winring0-eb057830-d77b-41a2-9a34-015a5d203c42 [HIGH]
- Replacing WinRing0 in Fan Control with PawnIO: https://poorlydocumented.com/2025/09/replacing-winring0-in-fan-control-with-pawnio/ [MEDIUM]
- LHM admin requirement note: https://librehardwaremonitor.net/ [MEDIUM]
- LHM GPU sensors without admin Stack Overflow: https://stackoverflow.com/questions/75465583/librehardwaremonitor-doesnt-show-gpu-sensors [MEDIUM]
- LHM unmanaged memory leak issue #450: https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/issues/450 [MEDIUM]
- LHM crashes after 5 minutes issue #2166: https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/issues/2166 [MEDIUM]
- ContextMenuStrip DPI scaling bug: https://github.com/dotnet/winforms/issues/4898 [HIGH]
- ContextMenuStrip DPI scale PR: https://github.com/dotnet/winforms/pull/9063 [HIGH]
- WPF ContextMenu placement modes: https://wpf-tutorial.com/common-interface-controls/contextmenu/ [HIGH]
- WPF ContextMenu absolute point StackOverflow: https://stackoverflow.com/questions/31886415/wpf-contextmenu-incorrect-position [HIGH]
- MPL 2.0 FAQ (file-level copyleft): https://www.mozilla.org/en-US/MPL/2.0/FAQ/ [HIGH]
- MPL-2.0 combining with proprietary: https://opensource.com/law/11/9/mpl-20-copyleft-and-license-compatibility [HIGH]
- SmartScreen reputation for developers: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation [HIGH]
- Inno Setup SmartScreen reputation discussion: https://stackoverflow.com/questions/29067877/microsoft-smartscreen-suspended-using-inno-setup-installer [MEDIUM]
- WinRing0 extraction paths in temp: https://www.file.net/process/winring0.sys.html [MEDIUM]
- FuzzyClock v3.5 single-instance IPC + AbandonedMutex (internal): `.planning/PROJECT.md` key decisions, v3.5 [HIGH]
- FuzzyClock v4.0 Proximity Ghost Mode (internal): `.planning/PROJECT.md`, MainWindow `_proximityRatio` + `_isDragging` [HIGH]

---
*Pitfalls research for: v4.2 Temps & Menu - LibreHardwareMonitorLib + right-click tray menu integration into existing WPF no-UAC widget*
*Researched: 2026-05-04*
