# Architecture Research

**Domain:** WPF desktop widget — v3.3 Polish + Installer additions
**Researched:** 2026-03-17
**Confidence:** HIGH (all claims derived from direct source reading of current codebase)

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         FuzzyClock.App (UI layer)                    │
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  MainWindow.xaml.cs  │  │  SettingsWindow  │  │ TrayMenuBuilder│  │
│  │    (~1450 lines)     │  │  (3-tab modeless)│  │ (WinForms tray)│  │
│  └──────────┬───────────┘  └────────┬─────────┘  └───────┬────────┘  │
│             │  per-setting events   │ SettingsChanged     │ callbacks │
│             └──────────────────────┴─────────────────────┘           │
├──────────────────────────────────────────────────────────────────────┤
│                    App.xaml.cs — Application entry point             │
│   Mutex single-instance (ALREADY IMPLEMENTED)                        │
│   hiddenOwner window, SettingsService.Load(), MainWindow.Show()      │
├──────────────────────────────────────────────────────────────────────┤
│                       Service layer (FuzzyClock.App)                 │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐ ┌───────────┐  │
│  │ StatsService │ │MonitorService│ │ContrastRefresh │ │GhostMode  │  │
│  │ (PDH, batt)  │ │(monitor keys)│ │Controller      │ │Controller │  │
│  └──────────────┘ └──────────────┘ └────────────────┘ └───────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│                       FuzzyClock.Core (pure, no WPF)                 │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐ ┌───────────┐  │
│  │ PhraseEngine │ │DateFormatter │ │ ContrastService│ │DialGeo-   │  │
│  │ (locale      │ │(static,pure) │ │(WCAG math)     │ │metry      │  │
│  │  dispatch)   │ │              │ │                │ │           │  │
│  └──────────────┘ └──────────────┘ └────────────────┘ └───────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│                        Persistence layer                             │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  SettingsService  (Load / Save / Validate / Defaults)        │    │
│  │  AppSettings record (flat init-property JSON record)         │    │
│  └──────────────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────────────┤
│                  Build / Distribution (CI pipeline)                  │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  .github/workflows/release.yml                               │    │
│  │  dotnet publish → FuzzyClock.exe (self-contained, single-file)│    │
│  │  [v3.3 adds] installer build step → FuzzyClockSetup.exe      │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Notes |
|-----------|----------------|-------|
| `App.xaml.cs` | Application lifecycle, Mutex guard, hidden owner window, settings load, MainWindow construction | Single-instance Mutex already implemented; no changes needed for v3.3 |
| `MainWindow.xaml.cs` | All WPF UI state, timers, display update, drag, position persistence, color application | ~1450 lines; sole owner of all live state |
| `AppSettings` | Flat init-property record; single source of persisted truth | Never positional; JSON forward-compat |
| `SettingsService` | Load/Save/Validate/Defaults; atomic JSON write via `.tmp` rename | Pure static; no WPF types |
| `TrayMenuBuilder` | Builds WinForms `NotifyIcon` + `ContextMenuStrip`; syncs checkmarks on `Opening` | Callbacks must `Dispatcher.Invoke` |
| `SettingsWindow` | Modeless 3-tab WPF Window; populates from `SettingsSnapshot`; fires 19 per-setting events | Owner=MainWindow ensures it stays in front of Topmost overlay |
| `release.yml` | CI pipeline: restore → test → publish single-file EXE → GitHub Release | v3.3 adds installer build step after publish |

---

## Recommended Project Structure

```
FuzzyClock.App/
├── App.xaml(.cs)                # NO CHANGES — Mutex already implemented
├── MainWindow.xaml(.cs)         # modify: edge snap in Grid_MouseLeftButtonDown
├── SettingsWindow.xaml(.cs)     # modify: visual redesign (XAML only, no CS logic changes)
├── AppSettings.cs               # no new fields expected for polish/installer features
├── SettingsService.cs           # no changes
├── TrayMenuBuilder.cs           # no changes
├── StatsService.cs              # no changes
├── MonitorService.cs            # no changes
├── ContrastRefreshController.cs # no changes
├── GhostModeController.cs       # no changes

FuzzyClock.Installer/            # NEW project (optional — only if WiX approach chosen)
├── FuzzyClock.Installer.wixproj # WiX 4 project
├── Package.wxs                  # product definition, feature tree, shortcut
└── (alternatives: Inno Setup .iss script outside solution, no new csproj)

.github/workflows/
└── release.yml                  # modify: add installer build step after dotnet publish
```

---

## Architectural Patterns

### Pattern 1: Single-Instance Mutex — ALREADY IMPLEMENTED, NO CHANGES

**What:** `App.xaml.cs` `OnStartup()` creates a named `Mutex("FuzzyClock_SingleInstance_v1", initiallyOwned: true, out bool createdNew)`. If `createdNew` is false, the process calls `Shutdown()` and returns before any window is created.

**Status for v3.3:** Fully implemented as of the existing codebase. The second-instance behavior (silently exits) is the correct choice for a desktop widget — no "bring to front" activation is needed because the widget is always visible.

**Do not modify:** The Mutex is released in `OnExit()` and its name is version-stable. No changes required for v3.3.

**Integration point:** `App.xaml.cs`, method `OnStartup(StartupEventArgs e)`, lines 13–24.

### Pattern 2: Edge Snapping — Post-DragMove Attraction in Grid_MouseLeftButtonDown

**What:** After `DragMove()` returns, compute whether the widget's current `Left`/`Top` is within a snap threshold of any screen edge. If so, snap to that edge exactly. This is a pure position adjustment applied after the modal drag loop exits, before `SaveSettings()`.

**When to use:** Always, as a complement to the existing `SettingsService.Clamp()` (which prevents off-screen placement). Edge snap is attraction toward edges; clamp is repulsion from outside-screen positions. They are independent and both must run.

**Integration point:** `MainWindow.xaml.cs`, method `Grid_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)`, after `_isDragging = false;` and before `SaveSettings()`.

**Exact insertion location:**
```csharp
private void Grid_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
{
    bool statsTimerWasRunning = _statsTimer?.IsEnabled ?? false;
    if (statsTimerWasRunning) _statsTimer!.Stop();

    _isDragging = true;
    DragMove();
    _isDragging = false;
    // LocationChanged fired during DragMove — _hasUserPosition is already true here.

    // Cross-monitor drag cleanup (existing code — unchanged)
    string prevKey = _currentMonitorKey;
    string newKey  = MonitorService.GetCurrentMonitorKey(this);
    if (!string.IsNullOrEmpty(prevKey) && prevKey != newKey)
    { ... }

    // *** NEW: edge snap applied here, AFTER DragMove() and BEFORE SaveSettings() ***
    ApplyEdgeSnap();

    if (statsTimerWasRunning) _statsTimer!.Start();
    SaveSettings();
}
```

**Implementation approach for `ApplyEdgeSnap()`:**
```csharp
private void ApplyEdgeSnap(double threshold = 16.0)
{
    // Use WinForms Screen (already a project dependency via UseWindowsForms=true)
    var screen = System.Windows.Forms.Screen.FromPoint(
        new System.Drawing.Point((int)(Left + ActualWidth / 2), (int)(Top + ActualHeight / 2)));
    var wa = screen.WorkingArea;

    double snapLeft = Left;
    double snapTop  = Top;

    // Snap left edge to left screen edge
    if (Math.Abs(Left - wa.Left) <= threshold)
        snapLeft = wa.Left;
    // Snap right edge to right screen edge
    else if (Math.Abs(Left + ActualWidth - (wa.Left + wa.Width)) <= threshold)
        snapLeft = wa.Left + wa.Width - ActualWidth;

    // Snap top edge to top screen edge
    if (Math.Abs(Top - wa.Top) <= threshold)
        snapTop = wa.Top;
    // Snap bottom edge to bottom screen edge
    else if (Math.Abs(Top + ActualHeight - (wa.Top + wa.Height)) <= threshold)
        snapTop = wa.Top + wa.Height - ActualHeight;

    if (snapLeft != Left || snapTop != Top)
    {
        Left = snapLeft;
        Top  = snapTop;
    }
}
```

**Trade-offs:**
- Uses `WorkingArea` (not `Bounds`) so snap respects taskbar position — consistent with `SettingsService.Clamp()`.
- Uses `Screen.FromPoint` with window center — consistent with `SetStatsVisible()` and `UpdatePhraseIfChanged()` re-clamp calls.
- No new class needed. No new state field needed. Pure geometry.
- `threshold = 16.0` in device-independent pixels (DIPs). Adjust per feel. Could become an `AppSettings` field later but is not needed for v3.3.
- The snap only fires on drag completion, not during drag (WPF receives no intermediate positions during `DragMove()` — it is a blocking Win32 modal loop).

**No changes needed to:**
- `LocationChanged` handler (only sets `_hasUserPosition = true`)
- `SettingsService.Clamp()` (still runs after snap via `SaveSettings()` path... actually `SaveSettings()` does NOT call Clamp — it just saves. Clamp is called in `SetStatsVisible`, `ApplyFontSize`, `SetTextStyle`, `UpdatePhraseIfChanged`. Edge snap is the sole post-drag adjustment.)
- `PositionTopRight()` (only called when no user position exists)

### Pattern 3: Installer — Post-Publish Build Step in CI

**What:** The existing CI pipeline (`release.yml`) produces a self-contained `FuzzyClock.exe` via `dotnet publish`. An installer wraps this EXE, adds a Start Menu shortcut, optionally registers an uninstaller, and gives users a standard setup experience.

**Recommended tooling:** Inno Setup (simpler, no new MSBuild project) over WiX for this project's scope.

**Why Inno Setup over WiX:**
- WiX 4 requires a separate `.wixproj` MSBuild project, NuGet package, and toolchain. Adds ~5 min to build time and a new project to maintain.
- Inno Setup is a standalone compiler (`iscc.exe`) invoked as a post-build shell step in the CI YAML. No new project file.
- For a single-EXE widget with a Start Menu shortcut and uninstaller, Inno Setup is sufficient.
- WiX is justified when you need MSI format, Group Policy integration, or enterprise deployment. None apply here.

**CI integration point:** `.github/workflows/release.yml`, after the `Publish` step and before `Create GitHub Release`.

**New CI step (conceptual):**
```yaml
- name: Build Installer
  run: |
    choco install innosetup --no-progress -y
    iscc /DMyAppVersion="${{ github.ref_name }}" installer/FuzzyClockSetup.iss
    # output: installer/Output/FuzzyClockSetup.exe

- name: Create GitHub Release
  uses: softprops/action-gh-release@v2
  with:
    files: |
      publish/FuzzyClock.exe
      installer/Output/FuzzyClockSetup.exe
    generate_release_notes: true
```

**New file: `installer/FuzzyClockSetup.iss`** (Inno Setup script, not part of the .NET solution):
```
[Setup]
AppName=FuzzyClock
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\FuzzyClock
DefaultGroupName=FuzzyClock
OutputBaseFilename=FuzzyClockSetup
Compression=lzma
SolidCompression=yes

[Files]
Source: "..\publish\FuzzyClock.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\FuzzyClock"; Filename: "{app}\FuzzyClock.exe"
Name: "{commondesktop}\FuzzyClock"; Filename: "{app}\FuzzyClock.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\FuzzyClock.exe"; Description: "Launch FuzzyClock"; Flags: nowait postinstall skipifsilent
```

**What the installer does NOT need to handle:**
- Registry auto-launch: `AutoLaunchService` already writes to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` when the user enables it in Settings. The installer should NOT add an auto-launch entry — the user controls this through the app.
- Settings migration: `SettingsService.Load()` handles absent fields. Upgrade installs are safe.
- `%LOCALAPPDATA%\FuzzyClock\settings.json`: Created by the app on first run. The installer should NOT create or pre-populate it.

**Uninstall behavior:** Inno Setup generates an uninstaller automatically. It removes the EXE and Start Menu shortcut. It does NOT remove `%LOCALAPPDATA%\FuzzyClock\settings.json` (user data — correct omission).

### Pattern 4: Settings Visual Redesign — XAML-Only Changes

**What:** The current `SettingsWindow.xaml` defines all styles inline in `Window.Resources` using a `SegmentButtonStyle` and `DataTrigger` on the `Tag` property. A visual redesign means changing colors, spacing, control shapes, or layout within `SettingsWindow.xaml`. No architecture changes are needed.

**Integration points:**
- `SettingsWindow.xaml` — the only file to modify for visual changes
- `SettingsWindow.xaml.cs` — no changes; all event wiring and `PopulateControls()` logic is unchanged by a visual redesign

**No `ResourceDictionary` migration needed.** The inline styles in `Window.Resources` are appropriate for a single-window style scope. Moving to a shared `ResourceDictionary` would only be justified if styles were shared across multiple windows — `MainWindow` uses no WPF styles (it uses `#01000000` background and element-by-element color application). Adding a `ResourceDictionary` for SettingsWindow alone adds file overhead with no benefit.

**Pattern for selection state without data binding:** The existing `Tag`-based selection state (set in code-behind via `btn.Tag = "selected"` / `btn.Tag = null`) is a well-established pattern for WPF controls where full data binding would be over-engineering. This pattern must be preserved when redesigning — the `SegmentButtonStyle.DataTrigger` watching `Tag` must remain.

**If adding a new tab or section:** Mirror the existing structure — `TabItem` in the root `TabControl`, `StackPanel Margin="12"` content root, `Grid` for two-column label/control layout. The pattern is established in all three existing tabs.

---

## Data Flow

### Drag + Edge Snap Flow (modified for v3.3)

```
User presses left mouse button on widget
    |
    v
Grid_MouseLeftButtonDown fires
    |
    +-- statsTimerWasRunning = _statsTimer.IsEnabled
    +-- _statsTimer.Stop() (if was running)
    |
    v
_isDragging = true
DragMove()   <-- blocking Win32 modal loop; returns when mouse released
_isDragging = false
    |
    +-- LocationChanged fired during DragMove: _hasUserPosition = true
    +-- Cross-monitor key update (existing)
    |
    v
ApplyEdgeSnap()   <-- NEW in v3.3
    --> Screen.FromPoint(window center)
    --> check Left vs WorkingArea.Left and Right edges (threshold = 16 DIPs)
    --> check Top vs WorkingArea.Top and Bottom edges
    --> if within threshold: adjust Left/Top to exact edge position
    |
    v
_statsTimer.Start() (if was running)
SaveSettings()
    --> _currentMonitorKey updated
    --> settings record built with current Left/Top
    --> SettingsService.Save() atomic JSON write
```

### CI Release Flow (modified for v3.3)

```
git push tag v3.3
    |
    v
release.yml triggers
    |
    +-- dotnet restore
    +-- dotnet test (224 tests, must pass)
    +-- dotnet publish → publish/FuzzyClock.exe
    |
    v   [NEW in v3.3]
    +-- choco install innosetup
    +-- iscc FuzzyClockSetup.iss → installer/Output/FuzzyClockSetup.exe
    |
    v
softprops/action-gh-release
    --> attaches FuzzyClock.exe (portable/xcopy)
    --> attaches FuzzyClockSetup.exe (installer)
    --> generates release notes from commits
```

### Settings Visual Redesign — No Data Flow Changes

The visual redesign affects only how controls look, not how they behave. Event handlers, `PopulateControls()`, `_suppressEvents` guard, and all 19 per-setting events are unchanged. The flow from user interaction to MainWindow state change is identical.

---

## Integration Points: New vs Modified Components

### (a) Single-Instance Mutex — NOTHING TO DO

**Status:** Fully implemented in `App.xaml.cs` `OnStartup()`.

**Exact location:** Lines 13–24 of `App.xaml.cs`.
- Mutex name: `"FuzzyClock_SingleInstance_v1"`
- If `!createdNew`: `Shutdown()` is called before any window is created (no flicker).
- Released in `OnExit()`.

**v3.3 action:** Document as complete. No code changes.

### (b) Edge Snapping

**New components:** None.

**Modified components:**
- `MainWindow.xaml.cs`:
  - Add `private void ApplyEdgeSnap(double threshold = 16.0)` private method
  - In `Grid_MouseLeftButtonDown`: call `ApplyEdgeSnap()` after `_isDragging = false`, before `SaveSettings()`

**No changes to:**
- `AppSettings.cs` (threshold is not user-configurable in v3.3)
- `SettingsService.cs`
- `SettingsWindow.xaml.cs`
- `TrayMenuBuilder.cs`
- Any test files (snap is a UI-interaction method; not unit-testable in isolation)

### (c) Installer

**New files:**
- `installer/FuzzyClockSetup.iss` — Inno Setup script (not part of .NET solution, not in a .csproj)

**Modified files:**
- `.github/workflows/release.yml`:
  - Add `Build Installer` step after `Publish` step
  - Add `installer/Output/FuzzyClockSetup.exe` to the `files:` list in the GitHub Release step

**No changes to .NET projects.** The installer consumes the published EXE as an artifact; it has no MSBuild dependency and no NuGet packages.

**Version injection:** Pass `github.ref_name` (e.g. `v3.3`) into the Inno Setup script via `/DMyAppVersion=` on the `iscc` command line.

### (d) Settings Visual Redesign

**Modified files:**
- `SettingsWindow.xaml` — colors, spacing, layout, style updates

**Unchanged files:**
- `SettingsWindow.xaml.cs` — zero logic changes
- Any test files — `FuzzyClock.App.Tests` tests `AppSettings` round-trips and `SettingsService.Validate()`, not `SettingsWindow` visuals

**Constraints from existing architecture:**
1. `SegmentButtonStyle` must remain (with `DataTrigger` on `Tag = "selected"`) — code-behind sets `btn.Tag` to reflect selection state
2. `x:Name` attributes on all controls must be preserved — code-behind references them in `PopulateControls()`, `SetFontSizeButtonStates()`, `SetClockStyleButtonStates()`, `ClearActiveThemeCard()`
3. `Window.Resources` scope for styles is correct — no need to promote to App-level `ResourceDictionary`

---

## AppSettings — No New Fields for v3.3 Features

Edge snap threshold is not persisted (hardcoded 16 DIPs — correct for v3.3 polish scope). If snap attraction edges were to become configurable in a future milestone, the field would follow the standard `{ get; init; } = defaultValue` pattern in `AppSettings.cs` with a guard in `SettingsService.Validate()`.

The installer adds no runtime settings. The visual redesign adds no settings.

---

## Build Order Recommendation

| Phase | Feature | Dependencies | Rationale |
|-------|---------|--------------|-----------|
| 1 | Settings visual redesign | None — XAML-only | Lowest risk; pure visual; no logic to break; can be reviewed quickly |
| 2 | Edge snapping | None — new private method + one call site | Self-contained; no state changes; easy to verify manually |
| 3 | Installer script + CI step | Phase 2 done (want stable EXE before packaging) | Installer is an artifact of the build, not a code feature; ships last |

**Ordering rationale:**
- Settings redesign first: zero risk of breaking functionality; gives visual confidence before the milestone is complete.
- Edge snap second: single-method addition to a well-understood call site; manual drag-to-edge testing is fast.
- Installer last: depends on a stable published EXE. CI step can be tested by running the release workflow on a pre-release tag.
- Single-instance Mutex is not a phase — it is already done.

---

## Anti-Patterns

### Anti-Pattern 1: Implementing Edge Snap During the DragMove Loop

**What people do:** Hook `WM_MOUSEMOVE` via `HwndSource.AddHook` to apply snap positions while the user is dragging.

**Why it's wrong:** `DragMove()` is a blocking Win32 modal loop. WPF's dispatcher does not process messages normally during the loop. `HwndSource.AddHook` during a modal loop is unreliable; the WPF thread is blocked in the Win32 `DefWindowProc` drag handling. The project notes in the ghost mode memory section that Win32 mouse tracking is unreliable during modal loops.

**Do this instead:** Apply snap after `DragMove()` returns. The user releases the mouse button and sees the widget snap to the edge. This is the correct UX pattern (Windows' own window snap works the same way).

### Anti-Pattern 2: Adding the Installer as a New .NET Project

**What people do:** Create `FuzzyClock.Installer.wixproj` in the solution, add it to `FuzzyClock.slnx`, reference it in the build.

**Why it's wrong:** WiX 4 requires additional NuGet packages (`WixToolset.Sdk`), a separate project file, and knowledge of WiX's component/feature/package XML model. For a single-EXE installer with a Start Menu shortcut, this is 10x the complexity of an Inno Setup script. It also means `dotnet build` or `dotnet test` commands that iterate over all projects now include a WiX project that doesn't participate in those operations.

**Do this instead:** Inno Setup script in `installer/FuzzyClockSetup.iss`, invoked by a CI YAML step using `iscc.exe`. The script is a self-contained artifact — not in the .slnx file, not referenced by any .csproj.

### Anti-Pattern 3: Making Edge Snap a Configurable Setting in v3.3

**What people do:** Add `SnapThreshold` to `AppSettings`, expose it in SettingsWindow, write unit tests for it.

**Why it's wrong:** 16 DIPs is the correct snap threshold for a standard desktop widget. Making it configurable requires a new `AppSettings` field, a new Validate guard, a new Defaults entry, a new UI control, and new test coverage — all for a value that 99% of users will never change. Polish phase scope should be minimum viable changes.

**Do this instead:** Hardcode `const double SnapThreshold = 16.0` as a `private const` in `MainWindow.xaml.cs`. Add it as a named constant rather than a magic number. Move to `AppSettings` only if user feedback specifically requests it.

### Anti-Pattern 4: Moving SettingsWindow Styles to App.xaml ResourceDictionary

**What people do:** During a visual redesign, "clean up" by moving `SettingsWindow.xaml`'s `Window.Resources` styles into `App.xaml` so they are "reusable."

**Why it's wrong:** `MainWindow` does not use any WPF styles — it applies all colors programmatically via `ApplyTheme()` and `ApplyDisplayColor()`. The `SegmentButtonStyle` is specific to SettingsWindow's toggle-button pattern. Moving it to App.xaml pollutes the Application scope with a style no other window uses and risks accidental application of `TargetType="Button"` styles to unexpected controls.

**Do this instead:** Keep styles in `SettingsWindow.xaml`'s `Window.Resources`. This is the correct scope.

---

## Scaling Considerations

This is a single-user desktop widget. Scale means code maintainability.

| Concern | Current state | Threshold | What to do |
|---------|--------------|-----------|------------|
| MainWindow line count | ~1450 lines | ~1800 lines | Extract display helpers to `MainWindow.Display.cs` partial class |
| AppSettings field count | ~25 fields | 35+ fields | Consider nested records — but JSON format breaks without migration |
| Installer complexity | Single EXE | Multiple files, prerequisites | Switch from Inno Setup to WiX only if distributing multiple files or requiring .NET runtime installation check |
| CI build time | ~2 min | ~8 min | Inno Setup step adds ~30s; acceptable |

---

## Sources

All findings derived directly from source code; no external verification required.

| Source | What was examined |
|--------|------------------|
| `FuzzyClock.App/App.xaml.cs` | Full file: Mutex implementation, hiddenOwner pattern, OnStartup/OnExit |
| `FuzzyClock.App/MainWindow.xaml.cs` | `Grid_MouseLeftButtonDown` (drag flow), `PositionTopRight`, `SettingsService.Clamp` call sites, `_isDragging` field usage |
| `FuzzyClock.App/SettingsWindow.xaml` | Full XAML: `Window.Resources`, `SegmentButtonStyle`, `DataTrigger` pattern, `x:Name` attributes |
| `FuzzyClock.App/SettingsWindow.xaml.cs` | Constructor, `PopulateControls`, `_suppressEvents`, `SetFontSizeButtonStates`, `SetClockStyleButtonStates` |
| `FuzzyClock.App/TrayMenuBuilder.cs` | `TrayMenuCallbacks` record (all 7 required actions), `Build()` signature |
| `FuzzyClock.App/SettingsService.cs` | `Clamp()` method, `Save()` atomic write pattern |
| `FuzzyClock.App/FuzzyClock.App.csproj` | `UseWindowsForms=true`, target framework, `AssemblyName` |
| `.github/workflows/release.yml` | Full workflow: restore/test/publish/release steps |
| `.planning/PROJECT.md` | v2.3 ghost mode patterns (Win32 modal loop behavior during DragMove) |

---
*Architecture research for: FuzzyClock v3.3 — Polish + Installer (single-instance, edge snapping, installer, Settings visual redesign)*
*Researched: 2026-03-17*
