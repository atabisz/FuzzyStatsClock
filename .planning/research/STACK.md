# Stack Research

**Domain:** Windows WPF desktop widget — temperature monitoring additions (v4.2 Temps & Menu)
**Researched:** 2026-05-04
**Confidence:** HIGH

## Scope of This Research

This is a **subsequent-milestone** research doc. The project's existing stack is validated and frozen:

- C# / WPF on .NET 10 (`net10.0-windows`, `UseWPF=true`, `UseWindowsForms=true`, `AllowsTransparency=true`)
- `FuzzyClock.Core` (pure `net10.0`) + `FuzzyClock.App` (WPF) + MSTest 4.0.1 tests (501 tests, CI-gated)
- `System.Text.Json` in-box
- Inno Setup 6 per-user installer (`PrivilegesRequired=lowest`, `{localappdata}\Programs\FuzzyClock\`)
- PDH `System.Diagnostics.PerformanceCounter` 10.0.0
- WinForms `NotifyIcon` + `ContextMenuStrip` already live as the tray

**Out of scope for this doc:** stack choices already validated over 69 phases. **In scope:** the *minimal additions* required for (1) temperature sensors and (2) surfacing the existing `ContextMenuStrip` from a WPF right-click event.

---

## Recommended Additions

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **LibreHardwareMonitorLib** | **0.9.6** (released 2026-02-14) | Temperature / fan / voltage sensor readings — CPU package, GPU, motherboard, NVMe/SSD | The de facto Windows hardware-sensor library. Actively maintained fork of OpenHardwareMonitor (last release ~12 weeks before milestone start). MPL-2.0 — compatible with closed-source redistribution. Ships a native `net10.0` TFM. Wide sensor coverage: MSI B840/B850/X870(E)/Z890, Intel IGCL, NVIDIA/AMD/Intel GPUs, Thermal Grizzly, Ryzen SMU. No other maintained .NET library comes close. |
| **System.Windows.Forms.ContextMenuStrip** | (in-box, `UseWindowsForms=true` already enabled) | Right-click menu on the widget surface, reusing the existing tray menu instance | Already referenced by the project. `ToolStripDropDown.Show(Point screenLocation)` is a stable, documented, `windowsdesktop-10.0`-supported API that takes screen coordinates and requires **no owner `Control`** — exactly what's needed to surface a WinForms menu from a WPF `MouseRightButtonUp` handler. Zero new dependency. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none required) | — | — | All temperature work is served by LibreHardwareMonitorLib's in-process API. No JSON, DI, logging, or threading library additions needed. |

### Transitive Dependencies (auto-pulled by LibreHardwareMonitorLib 0.9.6 on `net10.0`)

| Transitive | Purpose | Deployment Concern |
|------------|---------|--------------------|
| DiskInfoToolkit | SSD/NVMe SMART/health readings | Managed DLL — copied to output automatically |
| HidSharp | USB HID device I/O (fan controllers, WireView) | Managed DLL — copied to output automatically |
| RAMSPDToolkit-NDD | Memory SPD/thermal (DIMM temps) | Managed DLL — copied to output automatically |
| Mono.Posix.NETStandard | Cross-platform interop shim (unused on Windows) | Small managed DLL — copied but inert on Windows |
| System.IO.Ports 10.0.7 | Serial port access (PSU/fan controllers) | Managed DLL — copied to output automatically |
| System.Management 10.0.7 | WMI queries | In-box on Windows, managed DLL copy |
| System.Threading.AccessControl 10.0.7 | Mutex ACLs | Managed DLL — small |

**Critical finding — no native drivers bundled in the NuGet package.** LHM v0.9.6's `.csproj` contains *zero* `<Content>` entries for `.sys` files and *zero* embedded `WinRing0.sys` / `WinRing0x64.sys` resources. Instead, it embeds 13 PawnIO `.bin` modules as `EmbeddedResource` (e.g. `AMDFamily17.bin`, `IntelMSR.bin`, `LpcIO.bin`, `SmbusI801.bin`, `RyzenSMU.bin`) which are loaded *into* the separately-installed PawnIO kernel driver at runtime via `\\?\GLOBALROOT\Device\PawnIO`. **No `.sys` files ship with our app.**

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| (none added) | — | Existing `dotnet` CLI + Inno Setup 6 + GitHub Actions pipeline absorbs the new NuGet dep with no workflow change. `dotnet publish -r win-x64 --self-contained=false` continues to produce the exe + managed DLL drop that `[Files]` globs. |

---

## Installation

```bash
# Add to FuzzyClock.App.csproj ItemGroup containing package references:
# <PackageReference Include="LibreHardwareMonitorLib" Version="0.9.6" />
dotnet add FuzzyClock.App package LibreHardwareMonitorLib --version 0.9.6

# Update Inno Setup [Files] to glob all managed DLLs from publish dir
# (replaces the single-file FuzzyClock.exe entry)
```

Update `FuzzyClock.iss` `[Files]` section from:

```ini
Source: "{#SourceDir}\FuzzyClock.exe"; DestDir: "{app}"; Flags: ignoreversion
```

to:

```ini
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
```

This picks up `LibreHardwareMonitorLib.dll`, `HidSharp.dll`, `DiskInfoToolkit.dll`, `RAMSPDToolkit-NDD.dll`, `Mono.Posix.NETStandard.dll`, `System.IO.Ports.dll`, `System.Management.dll`, `System.Threading.AccessControl.dll`, plus transitive satellite assemblies.

---

## Layering Impact (Core vs App)

**Recommendation: LibreHardwareMonitorLib goes in `FuzzyClock.App` only, not `FuzzyClock.Core`.**

Rationale:
- LHM internally pinvokes Windows-only DeviceIoControl and WMI — would break the `net10.0` pure-library invariant of `FuzzyClock.Core`
- Existing pattern (CPU/GPU/MEM via `System.Diagnostics.PerformanceCounter`) lives in `App` for the same reason
- Temperature-extraction *logic* that is testable (formatting `"CPU 52°  GPU 61°"`, filtering unavailable sensors, sensor-key mapping) can live in `Core` as pure static methods operating on a `float?` or a `record TemperatureReading(string Label, float? Celsius)`, with MSTest verifying formatting in isolation — same pattern used for `UptimeFormatter`, `DateFormatter`, `PhraseWrapService`.

**Suggested new type layout:**

- `FuzzyClock.Core.TemperatureFormatter` — pure static, formats the one-liner + handles N/A; unit-testable (no WPF, no Windows native calls)
- `FuzzyClock.App.TemperatureService` — wraps LHM `Computer` lifecycle, exposes `float? CpuPackageTempC`, `float? GpuTempC`, `float? MotherboardTempC`, `float? NvmeTempC`; called from the existing stats `DispatcherTimer` tick
- `[InternalsVisibleTo]` entries are already set on both projects to their test assemblies; no new `InternalsVisibleTo` entries needed since `TemperatureService` can be `internal` inside `App`.

---

## Right-Click ContextMenuStrip Integration

**Recommendation: Reuse the existing tray `ContextMenuStrip` instance. Wire `MouseRightButtonUp` on the WPF window to `_trayMenu.Show(new System.Drawing.Point((int)screenPos.X, (int)screenPos.Y))`.**

Minimal integration sketch (reference only — implementation is a later phase):

```csharp
private void MainWindow_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
{
    // Respect existing ghost-mode invariants: RMB only works when widget is interactable
    // (ghost disabled OR Ctrl+Alt held — same predicate used for drag/scroll).
    if (_isGhostMode || _proximityRatio > 0.0) return;

    // Convert WPF logical coords -> Win32 screen coords via PointToScreen (handles DPI)
    var pos = this.PointToScreen(e.GetPosition(this));
    _trayMenu.Show(new System.Drawing.Point((int)pos.X, (int)pos.Y));
    e.Handled = true;
}
```

**Why this works:**
- `ToolStripDropDown.Show(Point)` overload is documented on `windowsdesktop-10.0`; takes raw screen pixels; no owner control required.
- `UseWindowsForms=true` already gives the project a single WinForms message pump co-hosted with the WPF Dispatcher — same-thread, no marshal.
- The existing tray menu instance already contains the 8 pruned items with IsChecked sync on `Opening` — reusing it guarantees the v3.2 *"identical items, checkmarks, and behavior"* requirement for free.
- DPI: `Window.PointToScreen` returns DPI-aware screen pixels on .NET 10 WPF (PerMonitorV2) — menu lands precisely at the cursor on mixed-DPI setups.
- Threading: WinForms menu item callbacks fire on the shared UI thread; the existing `Dispatcher.Invoke(...)` pattern in the tray click handlers (validated in v2.2, key-decision log entry 420) applies unchanged.

**Suppression invariants to preserve (from milestone spec):**
- `_isGhostMode == true` → suppress (click-through is active; RMB would hit the window below)
- `_proximityRatio > 0.0` → suppress (widget is fading; RMB during fade would be jarring)
- Ctrl+Alt held → RMB allowed (matches existing drag/scroll override path)

No XAML changes needed — `MouseRightButtonUp` is a `UIElement` event already available on `Window`.

---

## Alternatives Considered

### Temperature libraries

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| LibreHardwareMonitorLib 0.9.6 | **OpenHardwareMonitorLib** | Never for this project — archived/unmaintained since 2020, uses legacy WinRing0 driver that modern AV (Defender/BitDefender) flags as `HackTool:Win32/WinRing0`. LHM is the active fork. |
| LibreHardwareMonitorLib 0.9.6 | **HWiNFO shared-memory API / sensor bridge** | Only if we wanted read-only access to a user-installed monitoring tool — requires HWiNFO Pro running, adds UX friction, commercial restrictions. Not viable for a zero-dependency widget. |
| LibreHardwareMonitorLib 0.9.6 | **MSI Afterburner shared memory (`MAHMSharedMemory`)** | Only exposes GPU sensors and requires MSI Afterburner installed. Too narrow for CPU / GPU / Motherboard / NVMe coverage. |
| LibreHardwareMonitorLib 0.9.6 | **Direct WMI `MSAcpi_ThermalZoneTemperature`** | Available without admin but returns only motherboard ACPI thermal zones (often 1–2 sensors, frequently garbage readings, zero GPU/NVMe coverage). Does not meet the "CPU package / GPU / NVMe" requirement. Could be a future fallback for users without PawnIO — not a replacement. |
| LibreHardwareMonitorLib 0.9.6 | **Intel IGCL / NVIDIA NVML direct P/Invoke** | Much lower-level; would require implementing three separate vendor SDKs. LHM already wraps all three consistently. |

### WPF right-click menu

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Reuse tray `ContextMenuStrip` via `Show(Point)` | **Build a parallel WPF `ContextMenu`** | Would require duplicating all 8 menu items, submenus, checkmark sync logic, and IsChecked-on-Opening pattern — ~400 LOC duplication and continuous drift risk between tray and widget menus. Rejected. |
| Reuse tray `ContextMenuStrip` via `Show(Point)` | **WPF `Window.ContextMenu` property** | Requires the menu to be a WPF `ContextMenu`; same duplication problem. Also, WPF `ContextMenu` on an `AllowsTransparency=True` frameless window has known positioning quirks with per-monitor DPI (documented since .NET Core 3). The WinForms menu renders via a separate HWND and avoids this class of bug. |
| `Show(Point screenLocation)` overload | `Show(int x, int y)` overload | Functionally identical; `Show(Point)` matches existing `System.Drawing.Point` usage in tray code for consistency. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **OpenHardwareMonitorLib** (any version) | Archived; uses WinRing0 driver that's flagged by modern AV; last release 2020; no .NET Core+ support | LibreHardwareMonitorLib |
| **Bundling `WinRing0.sys` / `WinRing0x64.sys` ourselves** | (a) LHM 0.9.6 no longer uses these — replaced by the separately-installed PawnIO driver in the v0.9.x line. (b) Even for older LHM versions, shipping an unsigned kernel driver in a per-user `%LOCALAPPDATA%` installer would be blocked by Windows driver signing enforcement on any Win10 1607+ system. (c) Driver install requires admin — violates the "no UAC" milestone constraint. | Rely on graceful fallback via `PawnIo.IsInstalled` (see "Graceful Fallback" below). Do **not** ship, extract, or install any `.sys` file. |
| **Driving LHM from the WPF UI thread synchronously on every tick** | `Computer.Accept(IVisitor)` / `IHardware.Update()` can stall tens of milliseconds on sensor enumeration (CPU MSR reads, WMI calls). Blocking the Dispatcher every 0.5s would make the widget jittery during hover. | Kick a background `Task`, marshal the result scalar values back via `Dispatcher.InvokeAsync`. |
| **Creating a fresh `Computer` instance per tick** | `Computer.Open()` does driver init, hardware enumeration, and PawnIO module loading — 200–600ms cold. Per-tick recreate would kill startup and cause stutter. | Single long-lived `Computer`; open once in `TemperatureService` ctor, close in `Dispose()`. Call `Update()` on the four chosen hardware items each tick (cheap). |
| **Enabling every sensor group** | LHM's `IsCpuEnabled/IsGpuEnabled/IsMotherboardEnabled/IsStorageEnabled/IsMemoryEnabled/IsControllerEnabled/IsNetworkEnabled/IsPsuEnabled/IsBatteryEnabled` true-for-all enumerates *every* sensor of every kind — tens of ms of overhead we don't need. | Enable only the four groups this milestone targets: `IsCpuEnabled`, `IsGpuEnabled`, `IsMotherboardEnabled`, `IsStorageEnabled`. Leave others `false`. |

---

## Graceful Fallback — The Critical Deployment Pattern

LibreHardwareMonitorLib 0.9.6 gets most CPU-package / motherboard / LPC sensors from **PawnIO**, a separately-installed signed kernel driver (GPL-2.0 + linking exception; downloaded from pawnio.eu, installed via a signed MSI that requires one-time admin). **Our installer cannot install PawnIO** (per-user, no UAC).

**Fallback behavior observed in `LibreHardwareMonitorLib/PawnIo/PawnIo.cs` (master branch):**

- `PawnIo.IsInstalled` — static property that probes `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO` (with 64-bit view fallback) and returns `bool`. Safe to call without admin. No exception if the key is absent.
- When PawnIO is absent: `LoadModuleFromResource()` returns a `PawnIo` instance with a null handle; `IsLoaded` returns `false`; hardware groups whose sensors depend on PawnIO degrade their `ISensor.Value` to `null` (rather than throwing).
- Sensors that **do NOT depend on PawnIO** — these work on a no-admin system without PawnIO installed:
  - GPU temperature via NVAPI (NVIDIA) / AtiAdlxx (AMD) / IGCL (Intel iGPU) — vendor user-mode DLLs
  - NVMe/SSD temperature via Windows Storage API (`DeviceIoControl` on physical drive handles; read-only SMART is accessible to non-admin on Windows 10+)
  - Battery sensors via `SetupDi*` + `IOCTL_BATTERY_QUERY_INFORMATION` (user-mode)
  - Some motherboard sensors through WMI `MSAcpi_ThermalZoneTemperature` (coarse, but present)
- Sensors that **require PawnIO** (will surface as `null` → "N/A" in our UI):
  - CPU package temperature via MSR reads (Intel `MSR_TEMPERATURE_TARGET` 0x1A2, AMD family-specific MSRs)
  - Motherboard Super-I/O / LPC chip temps (IT87xx, NCT67xx, W836xx)
  - SMBus DIMM thermal readings

**Implementation implication for Phase N:** `TemperatureService` must expose `float?` (nullable). The Settings > Temps UI must disable a sensor checkbox + show the "N/A" label when the corresponding LHM `ISensor.Value == null` at startup enumeration. This aligns exactly with the milestone requirement: *"unavailable sensors disabled with N/A label"*.

**Do not prompt the user to install PawnIO.** Document it in `README.md` as an optional power-user enhancement: *"For full CPU-package and motherboard temperature coverage, install PawnIO once from pawnio.eu — FuzzyClock will pick it up automatically on next launch."*

---

## MPL-2.0 Compliance for Closed-Source Redistribution

**Verdict: LibreHardwareMonitorLib 0.9.6 (MPL-2.0) ships cleanly in a closed-source FuzzyClock.exe with minimal obligations.**

MPL-2.0 is **file-level copyleft** (unlike GPL's project-level copyleft). Key compliance points for this use case:

| Obligation | Required action | Status |
|------------|----------------|--------|
| Keep the LHM source available | If we ship an *unmodified* `LibreHardwareMonitorLib.dll`, the public GitHub repo at `github.com/LibreHardwareMonitor/LibreHardwareMonitor` satisfies this — no need to re-host or bundle source | Nothing to do; link in NOTICES is sufficient |
| Ship the MPL-2.0 LICENSE text | Include `LICENSE-LibreHardwareMonitorLib.txt` (MPL-2.0) alongside the app | **New installer `[Files]` entry required** (see below) |
| Keep MPL file headers intact | Only applies when *modifying* MPL source; we consume the library as a binary NuGet | N/A — we are not modifying |
| Open-source FuzzyClock itself | **NOT required** — MPL-2.0 is file-scope copyleft; our own .cs files are under our own license (currently MIT per commit `caafd20`). Only the *MPL-2.0 licensed files* must remain under MPL-2.0, which they do (we don't modify them) | No impact on FuzzyClock's MIT license |
| Attribution in "About" or docs | MPL requires informing recipients of MPL coverage; a `NOTICES.txt` with "This product uses LibreHardwareMonitorLib (MPL-2.0) — github.com/LibreHardwareMonitor/LibreHardwareMonitor" satisfies it | **New installer `[Files]` entry or README section** |
| Transitive MPL/LGPL deps (HidSharp, etc.) | Follow their individual licenses — HidSharp is Apache 2.0; DiskInfoToolkit is MIT-style per its repo; bundle notices | Add one-line attributions to NOTICES.txt |

**Required installer changes for license compliance:**

```ini
[Files]
Source: "{#SourceDir}\*";                   DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "licenses\LICENSE-LHM.txt";         DestDir: "{app}\licenses"; Flags: ignoreversion
Source: "licenses\NOTICES.txt";             DestDir: "{app}\licenses"; Flags: ignoreversion
```

Add a `licenses\` directory in the repo with:
- `LICENSE-LHM.txt` — verbatim MPL-2.0 (copy from `https://www.mozilla.org/MPL/2.0/`)
- `NOTICES.txt` — one-liner per third-party dep, with repo URLs

Optional polish: wire an "About / Licenses" item in Settings > Behavior that opens `{app}\licenses\` in Explorer. Not required by MPL; nice UX.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| LibreHardwareMonitorLib 0.9.6 | net10.0 (native), net8.0, net9.0, net472, netstandard2.0 | Explicit `net10.0` TFM in the NuGet — no fallback, no trimming risk |
| LibreHardwareMonitorLib 0.9.6 | HidSharp 2.6.4+ | Pinned by LHM; do not override |
| LibreHardwareMonitorLib 0.9.6 | System.Management 10.0.7 | Same major version as the project's existing `System.Diagnostics.PerformanceCounter` 10.0.0 — no downgrade/upgrade conflict |
| LibreHardwareMonitorLib 0.9.6 | PawnIO user-mode install | Runtime only; not a build dep. Library version-probes the registry; tolerates absence |
| `dotnet publish -r win-x64 --self-contained=false` | Inno Setup `[Files] recursesubdirs` glob | Well-tested pattern in .NET 10 WPF installers; no known conflict with LHM's transitive DLLs |
| Windows 10 1809+ / Windows 11 | LHM 0.9.6 | LHM requires Win10+ for its DeviceIoControl patterns; matches FuzzyClock's existing Win10/11 target |

**Architecture note:** LHM's PawnIO DeviceIoControl paths assume x64. The project currently publishes `win-x64` (implicit from SDK defaults; no `x86` or `arm64` artifacts in CI). **Keep `win-x64` only for v4.2.** Do not switch to `AnyCPU` runtime — IL from LHM works AnyCPU-wise, but the PawnIO driver-side contract is x64-only, and mixed-arch deployment adds no value for a Windows desktop widget. The GitHub Actions matrix should remain single-arch.

---

## Integration Checklist for Downstream Planning

Use this as a concrete Phase-N input:

**NuGet additions — `FuzzyClock.App.csproj` only:**
- [ ] `<PackageReference Include="LibreHardwareMonitorLib" Version="0.9.6" />`

**Inno Setup `FuzzyClock.iss` changes:**
- [ ] Replace single-file `[Files]` entry with glob: `Source: "{#SourceDir}\*"; ... Flags: ignoreversion recursesubdirs createallsubdirs`
- [ ] Add `licenses\LICENSE-LHM.txt` and `licenses\NOTICES.txt` entries
- [ ] No `[Run]` changes; no UAC changes (`PrivilegesRequired=lowest` preserved)
- [ ] **Do not** add any `.sys` file installation — PawnIO is the user's responsibility as a side install

**New files in repo:**
- [ ] `licenses/LICENSE-LHM.txt` — verbatim MPL-2.0
- [ ] `licenses/NOTICES.txt` — attributions for LHM + HidSharp + DiskInfoToolkit + RAMSPDToolkit-NDD

**No new files for `WinRing0.sys` / `WinRing0x64.sys`** — these are not used by LHM 0.9.6 and must not appear in `[Files]`.

**`[InternalsVisibleTo]` changes:** none required. `TemperatureService` lives `internal` in App (already exposes internals to `FuzzyClock.App.Tests`). `TemperatureFormatter` lives `public static` in Core (already exposes internals to `FuzzyClock.Core.Tests`).

**CI release workflow:** no change. `dotnet publish` will transparently include the new DLLs; `ISCC` glob will pick them up; `sha256sum` continues to hash `FuzzyClockSetup-X.Y.Z.exe`.

**Antivirus false-positive concern:** LHM 0.9.6 no longer bundles WinRing0, so the historical OHM/WinRing0-triggered AV flag (`HackTool:Win32/WinRing0`) does **not** apply to our distribution. LHM itself is clean-signature on VirusTotal (verified on the LHM 0.9.6 NuGet drop). No SmartScreen/Defender issues anticipated beyond the existing unsigned-exe warning that v3.5's per-user installer already handles.

---

## Sources

- **NuGet.org** — `https://www.nuget.org/packages/LibreHardwareMonitorLib` — version 0.9.6, TFM list, transitive deps (HIGH confidence; primary source)
- **GitHub `LibreHardwareMonitor/LibreHardwareMonitor`** — master branch tree inspection confirms: `LibreHardwareMonitorLib/PawnIo/PawnIo.cs` exists, `Hardware/Cpu/` contains no `Ring0.cs`, `Interop/` has no driver-loading interop file. Confirms WinRing0 replaced by PawnIO (HIGH confidence)
- **GitHub `LibreHardwareMonitor/LibreHardwareMonitor` — `LibreHardwareMonitorLib.csproj`** — 11 PackageReferences, 13 EmbeddedResources (all `Resources\PawnIo\*.bin`), no `.sys` files referenced anywhere (HIGH confidence; source-of-truth for deployment model)
- **GitHub `LibreHardwareMonitor` v0.9.5 / v0.9.6 release notes** — "Add option to disable Ring0 driver installation" + "Update PawnIO modules" confirms the WinRing0→PawnIO transition in the v0.9.x line (HIGH confidence)
- **GitHub `namazso/PawnIO`** — license GPL-2.0 + linking exception, separate install from pawnio.eu, user-admin install required (HIGH confidence)
- **Microsoft Learn — `ToolStripDropDown.Show` method reference** — documented overloads for `Show(Point)` and `Show(int, int)`, explicit `windowsdesktop-10.0` moniker support (HIGH confidence)
- **Microsoft Learn — WPF/WinForms interop walkthrough** — confirms `UseWindowsForms=true` co-hosting pattern; no explicit marshaling needed for same-thread menu display (HIGH confidence)
- **choosealicense.com / tldrlegal — MPL-2.0** — file-level copyleft; closed-source redistribution allowed with LICENSE + attribution (MEDIUM-HIGH; supplementary — the MPL official text is the binding source but mozilla.org was unreachable during this research session. File-scope-only-copyleft is a widely-documented property of MPL-2.0 affirmed across multiple license summaries; low risk of misreading.)
- **Project local** — `.planning/PROJECT.md`, `FuzzyClock.App.csproj`, `FuzzyClock.Core.csproj`, `FuzzyClock.slnx`, `FuzzyClock.iss` — existing stack invariants

---

*Stack research for: Windows WPF desktop widget — v4.2 Temps & Menu milestone*
*Researched: 2026-05-04*
