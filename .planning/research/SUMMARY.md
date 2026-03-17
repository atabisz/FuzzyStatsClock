# Project Research Summary

**Project:** FuzzyStatsClock v3.3 — Polish + Installer
**Domain:** WPF desktop overlay widget — distribution packaging, single-instance UX, edge snapping, settings polish
**Researched:** 2026-03-17
**Confidence:** HIGH

## Executive Summary

FuzzyStatsClock v3.3 is a polish-and-distribution milestone on a mature, well-tested WPF overlay widget (.NET 10, 224 tests, ~1450-line MainWindow). The milestone has four features: a per-user installer that packages the app for normal end-user distribution, a single-instance bring-to-front fix (replacing the current silent-exit behavior), edge snapping when dragging near screen edges, and a dark visual redesign of the settings window. No new NuGet packages are required if Inno Setup is chosen for the installer (the recommendation). All four features are additive and do not touch `FuzzyClock.Core`, `AppSettings`, or `SettingsService`.

The recommended approach prioritizes the lowest-risk visual work first (settings window redesign), then the self-contained UI improvement (edge snapping), then the distribution artifact (installer + CI step). The single-instance Mutex is already implemented; the only remaining work is adding `AbandonedMutexException` handling and a named-pipe bring-to-front signal. The key architectural decisions are: use **Inno Setup** (not Velopack) for the installer — it requires no app code changes, no custom `Main`, and no new NuGet packages, and the user requirement is simply "download Setup.exe, run it, upgrades in-place"; use **post-DragMove** edge snap (not a WM_MOVING hook) — `DragMove()` is a blocking Win32 modal loop and `HwndSource.AddHook` during it is unreliable, as documented by the project's own ghost mode notes.

The dominant risks are: (1) edge snap threshold must be 8px or less — a 16-20px threshold overwrites intentional near-edge placements and conflicts with per-monitor position memory; (2) `UpdateLayout()` must be called before snap computation or the snap position is wrong for variable-width `SizeToContent` windows; (3) the auto-launch registry entry must be reconciled on every startup and cleaned up by the installer on upgrade/uninstall, or users end up with broken startup entries after path changes; (4) styles added during the settings redesign must stay inside `SettingsWindow.xaml`'s `Window.Resources` — any implicit style in `App.xaml` will leak to MainWindow and corrupt the overlay appearance.

## Key Findings

### Recommended Stack

All v3.3 features use only existing project dependencies or external tools invoked from CI. No new NuGet packages are needed.

**Core technologies:**
- **Inno Setup 6.x** (standalone `iscc.exe`, not in solution): per-user installer — installs to `{localappdata}\Programs\FuzzyClock`, registers uninstall entry, creates Start Menu shortcut, no UAC; invoked from CI YAML as a post-publish shell step with no `.wixproj` or MSBuild integration
- **`System.Threading.Mutex` (BCL)**: single-instance guard — already implemented as `"FuzzyClock_SingleInstance_v1"`; add `AbandonedMutexException` catch so crash-restart works
- **`System.IO.Pipes.NamedPipeServerStream` (BCL)**: bring-to-front IPC — running instance listens on a named pipe; second instance connects, writes `"ACTIVATE"`, exits; server dispatches `Activate()` on UI thread; pure managed code, no P/Invoke
- **WPF `ThemeMode="Dark"` (PresentationFramework.Fluent, .NET 9+/10)**: dark settings window — XAML attribute on `SettingsWindow` only; applies Fluent dark to all standard controls; main overlay window is unaffected; set as XAML attribute (not from C# code, which generates WPF0001 warning)
- **Post-DragMove edge snap** (`Screen.FromPoint` + `WorkingArea`, WinForms already available via `UseWindowsForms=true`): snap to screen edges — called in `Grid_MouseLeftButtonDown` after `DragMove()` returns, before `SaveSettings()`

**What NOT to use:**
- Velopack: requires a custom `[STAThread] static void Main` with `VelopackApp.Build().Run()`, a csproj NuGet addition, and `App.xaml` Build Action change to `Page` — disproportionate refactor for the stated requirement; Inno Setup delivers the same user experience with zero app code changes
- WM_MOVING hook for edge snap: fires continuously during `DragMove()`'s modal loop; WPF dispatcher does not process messages normally during the loop; unreliable per the project's own ghost mode documentation
- `Application.ThemeMode="Dark"` (app-wide): would apply Fluent dark to the transparent frameless main overlay — wrong aesthetic
- App.xaml `ResourceDictionary` for settings styles: implicit styles leak globally to MainWindow

### Expected Features

**Must have (table stakes):**
- Per-user installer (no UAC prompt) — every distributed Windows utility ships this way; absence signals unfinished product
- Uninstall entry in Add/Remove Programs — Windows 11 users expect this; Inno Setup registers it automatically
- Start Menu shortcut — users expect to launch without hunting for the EXE
- Single-instance bring-to-front — current silent-exit is wrong for distribution; users re-launch thinking the app crashed

**Should have (differentiators):**
- Edge snapping — Rainmeter, all major desktop widgets snap to edges; free-floating widget feels unfinished; 20px threshold from FEATURES.md is overridden — use 8px per PITFALLS.md to avoid overwriting intentional near-edge positions
- Dark settings window — current light `#F0F0F5` palette clashes severely with a dark transparent overlay; jarring for dark-mode Windows users

**Defer (v3.3.x / v4+):**
- About section in Settings (version + GitHub URL) — low complexity; add after validation
- Auto-update notification — requires async HTTP, version comparison, update-available UX; scope for v4+
- MSIX/Store packaging — only if submitting to Microsoft Store
- Code-signing certificate — worthwhile when install count grows; not cost-justified at hobby stage
- SmartScreen guidance — README documentation, not code; add in installer phase

### Architecture Approach

All four v3.3 features fit within the existing component structure without new classes. `MainWindow.xaml.cs` gains one private method (`ApplyEdgeSnap()`). `App.xaml.cs` gains `AbandonedMutexException` handling and a named-pipe listener task. `SettingsWindow.xaml` gets a visual overhaul (XAML-only, no logic changes). A new `installer/FuzzyClockSetup.iss` file is added outside the .NET solution. The CI `release.yml` gains one step after publish.

**Major components:**
1. `App.xaml.cs` — add `AbandonedMutexException` catch; add named-pipe server task for bring-to-front; second-instance path connects as client and writes `"ACTIVATE"` before exiting
2. `MainWindow.xaml.cs` — add `private void ApplyEdgeSnap()` called post-DragMove after `_isDragging = false` and after `UpdateLayout()`; uses `Screen.FromPoint` + `WorkingArea`; threshold constant `EdgeSnapThreshold = 8.0`
3. `SettingsWindow.xaml` — add `ThemeMode="Dark"` XAML attribute; set `Background="#1E1E1E"`; add dark styles for CheckBox, RadioButton, ComboBox, Slider, Button, TabControl/TabItem inside `Window.Resources`; update `SegmentButtonStyle` colors; no changes to `SettingsWindow.xaml.cs`
4. `installer/FuzzyClockSetup.iss` — Inno Setup script (outside .slnx); per-user install to `{localappdata}\Programs\FuzzyClock`; removes auto-launch Run entry on upgrade/uninstall; version injected via `/DMyAppVersion=` on `iscc` command line
5. `.github/workflows/release.yml` — add `Build Installer` step (`choco install innosetup` + `iscc`); add `FuzzyClockSetup.exe` to GitHub Release artifacts

### Critical Pitfalls

1. **Edge snap threshold too aggressive (8px hard limit)** — thresholds of 16-20px overwrite intentional near-edge placements and permanently corrupt per-monitor position memory; define as `private const double EdgeSnapThreshold = 8.0` and never exceed it; the ARCHITECTURE.md threshold of 16px is overridden by PITFALLS.md's analysis — 8px is correct

2. **Edge snap without `UpdateLayout()` first gives wrong right/bottom snap position** — `SizeToContent=WidthAndHeight` means `ActualWidth`/`ActualHeight` are stale until a layout pass; call `UpdateLayout()` synchronously after `DragMove()` returns and before `ApplyEdgeSnap()` reads `ActualWidth`; same pattern already used in `UpdatePhraseIfChanged()`

3. **Implicit WPF styles added to App.xaml leak globally to MainWindow** — any `Style` with `TargetType` and no `x:Key` in `Application.Resources` applies to every matching element in the entire app including the overlay; all settings redesign styles must stay in `SettingsWindow.xaml`'s `<Window.Resources>` block; never add unkeyed styles to `App.xaml`

4. **Auto-launch registry entry not reconciled on startup or cleaned up by installer** — `AutoLaunchService` writes the Run entry with the current EXE path; if the install path changes (portable-to-installed or version upgrade), the old entry points to the wrong path; `ApplySettings()` must always call `AutoLaunchService.Enable/Disable` unconditionally (idempotent reconciliation), and the installer must delete the Run entry on upgrade and uninstall

5. **`AbandonedMutexException` not handled — crash leaves app unlaunchable** — if FuzzyClock crashes without releasing the Mutex, the next launch throws `AbandonedMutexException` instead of acquiring the Mutex; the app crashes immediately on every subsequent launch until a reboot; wrap Mutex construction in `try/catch (AbandonedMutexException)` and treat it as `createdNew = true`

## Implications for Roadmap

Based on combined research, the recommended build order is determined by risk profile and dependency. Architecture.md and Pitfalls.md independently converge on the same three-phase structure.

### Phase 1: Settings Window Visual Redesign

**Rationale:** Zero risk to functionality — pure XAML changes with no logic changes to `SettingsWindow.xaml.cs`. Can be reviewed visually and rolled back instantly if anything looks wrong. No dependencies on other v3.3 features. Delivers the most user-visible polish immediately and builds confidence before more complex changes.
**Delivers:** Dark `SettingsWindow.xaml` with `ThemeMode="Dark"`, `Background="#1E1E1E"`, dark styles for all control types inside `Window.Resources`, updated `SegmentButtonStyle` colors, no behavioral changes.
**Addresses:** Dark settings window (differentiator feature)
**Avoids:** Pitfall 6 (styles in `Window.Resources` only, never `App.xaml`), Pitfall 9 (if new controls are added, update `SettingsSnapshot` in the same commit)

### Phase 2: Edge Snapping + Single-Instance Bring-To-Front

**Rationale:** Both features touch `App.xaml.cs` / `MainWindow.xaml.cs` only, affect no other components, and are independently testable by manual interaction. Grouping them in one phase is efficient. Edge snap is the single-method addition (`ApplyEdgeSnap()`); bring-to-front is the Mutex + named-pipe fix. Neither has CI or installer dependencies.
**Delivers:** `ApplyEdgeSnap()` private method in `MainWindow.xaml.cs` (post-DragMove, after `UpdateLayout()`, 8px threshold); `AbandonedMutexException` catch in `App.xaml.cs`; named-pipe server task (running instance) + client connection (second instance) for bring-to-front.
**Addresses:** Edge snapping (differentiator), single-instance bring-to-front (table stakes)
**Avoids:** Pitfall 3 (AbandonedMutexException crash loop), Pitfall 4 (ghost mode flicker — snap only post-DragMove, never on LocationChanged), Pitfall 5 (UpdateLayout before snap), Pitfall 8 (threshold constant 8px)

### Phase 3: Installer + CI Integration

**Rationale:** Depends on a stable, tested published EXE from the prior phases. The installer wraps the artifact — it is the last step before the release. CI changes are verified by running the release workflow on a pre-release tag. Auto-launch registry cleanup must be implemented here to avoid the orphaned-entry pitfall.
**Delivers:** `installer/FuzzyClockSetup.iss` (Inno Setup script); per-user install to `{localappdata}\Programs\FuzzyClock`; Start Menu shortcut; uninstall entry; auto-launch Run entry cleanup on upgrade/uninstall; `ApplySettings()` idempotent auto-launch reconciliation fix; `.github/workflows/release.yml` updated with installer build step and dual-artifact release; SmartScreen documentation in README.
**Addresses:** Per-user installer (table stakes), uninstall entry (table stakes), Start Menu shortcut (table stakes)
**Avoids:** Pitfall 1 (SmartScreen — document workaround before release), Pitfall 2 (orphaned auto-launch entry on upgrade), Pitfall 7 (auto-launch path stale after first install from portable)

### Phase Ordering Rationale

- **Settings redesign first** — zero functional risk; pure visual; gives the milestone a visual win immediately; any XAML mistake is immediately visible and easily reverted without affecting any other code path
- **Edge snap + single-instance second** — both are self-contained `MainWindow`/`App` changes; neither requires a stable build artifact; can be verified by manual interaction within minutes of implementation; single-instance bring-to-front adds named-pipe code that is best verified before packaging
- **Installer last** — depends on a stable EXE to wrap; auto-launch cleanup is a prerequisite that is also resolved in this phase; CI changes are the highest-ceremony changes and should happen after all code is stable
- **Single-instance Mutex is already done** — only the crash-recovery (`AbandonedMutexException`) and bring-to-front (named pipe) increments are needed; these are small additions in Phase 2

### Research Flags

Phases with well-documented patterns — skip `/gsd:research-phase`:
- **Phase 1 (Settings visual redesign):** Pure XAML color changes on an existing window with an established style structure; `ThemeMode="Dark"` is officially documented; all patterns are known
- **Phase 2 (Edge snap + single-instance):** Post-DragMove snap is a one-method addition; Mutex + NamedPipe bring-to-front is a well-documented .NET pattern (~40 lines); no external APIs
- **Phase 3 (Installer):** Inno Setup is mature with comprehensive documentation; CI step pattern (`choco install` + `iscc`) is established; no novel integration

No phases require `/gsd:research-phase` — all patterns are fully specified in STACK.md and ARCHITECTURE.md with exact code samples.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies are built-in BCL/WPF or standalone CLI tools; verified against official docs; Inno Setup conflict resolved to known-good approach |
| Features | HIGH | Installer/single-instance/edge-snap are well-established patterns; settings dark theme is officially documented via ThemeMode; SmartScreen behavior is HIGH confidence |
| Architecture | HIGH | Derived from direct codebase source reading; all integration points identified by name and line; no speculative architectural changes |
| Pitfalls | HIGH | All 9 pitfalls grounded in direct source inspection of App.xaml.cs, MainWindow.xaml.cs, GhostModeController.cs, SettingsWindow.xaml; prior-milestone regressions documented |

**Overall confidence:** HIGH

### Gaps to Address

- **Edge snap threshold conflict resolved:** STACK.md and ARCHITECTURE.md suggest 16-20px; PITFALLS.md analysis (per-monitor position memory corruption) requires 8px maximum. **Resolution: use 8px.** This is the correct value for intentional-snap sensitivity without overwriting near-edge placements.

- **Installer technology conflict resolved:** STACK.md recommends Velopack (requires custom `Main`, NuGet package, App.xaml Build Action change); FEATURES.md and ARCHITECTURE.md recommend Inno Setup (no app code changes). **Resolution: Inno Setup.** The user requirement is "download Setup.exe, run it, upgrades in-place" — Inno Setup delivers this without any app code changes. Velopack's Main refactor is disproportionate.

- **SmartScreen — accept and document:** No code-signing certificate is planned for v3.3. The SmartScreen "Unknown Publisher" warning is accepted; README must document "More info → Run anyway" before the release. This is a documentation task in Phase 3, not a code gap.

- **Named-pipe bring-to-front vs. silent exit:** ARCHITECTURE.md initially states that silent exit is correct for a widget that is "always visible." This is overridden: a widget in ghost mode (Opacity=0) or minimized to tray is not visible, and users re-launching it expect it to reactivate. The named-pipe bring-to-front is the correct v3.3 behavior.

- **`SettingsSnapshot` coverage for redesign:** Phase 1 is a visual-only redesign with no new controls. If no new controls are added, `SettingsSnapshot` does not need updating. If a new control is added (e.g., About section), `SettingsSnapshot` must be updated in the same commit.

## Sources

### Primary (HIGH confidence)

- `FuzzyClock.App/App.xaml.cs` — Mutex implementation (lines 13-24); `OnExit` mutex release; `AbandonedMutexException` handling absent (confirmed gap)
- `FuzzyClock.App/MainWindow.xaml.cs` — `Grid_MouseLeftButtonDown` drag flow; `DragMove()` call; `_isDragging` flag; `LocationChanged` handler; `UpdateLayout()` usage in `UpdatePhraseIfChanged()`; `Screen.FromPoint` usage
- `FuzzyClock.App/SettingsWindow.xaml` — `Window.Resources` structure; `SegmentButtonStyle` with `DataTrigger` on `Tag`; all `x:Name` attributes
- `FuzzyClock.App/GhostModeController.cs` — 75ms restore timer; `GetCursorPos` + `GetWindowRect` pattern
- `FuzzyClock.App/App.xaml` — `<Application.Resources />` confirmed empty
- `.planning/PROJECT.md` — v2.3 ghost mode: DragMove modal loop unreliability; `WS_EX_TRANSPARENT` patterns
- `.github/workflows/release.yml` — existing pipeline steps (restore/test/publish/release)
- https://learn.microsoft.com/en-us/dotnet/desktop/wpf/whats-new/net90 — `ThemeMode="Dark"`, Fluent dark mode, Window-scoped XAML attribute stable in .NET 9+/10
- https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-moving — lParam is mutable RECT*; however post-DragMove is preferred over WM_MOVING hook per architecture analysis
- https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.namedpipeserverstream — net-10.0 moniker confirmed
- https://learn.microsoft.com/en-us/dotnet/standard/threading/mutexes — Named system Mutex cross-process detection; AbandonedMutexException behavior

### Secondary (MEDIUM confidence)

- Inno Setup 6 documentation (https://jrsoftware.org/ishelp/) — per-user install path `{localappdata}\Programs`; uninstall entry registration; upgrade behavior
- Edge snap threshold 20px — Rainmeter community-documented default; overridden to 8px by per-monitor-position-memory analysis
- SmartScreen reputation (~5 installs to clear) — community-documented observation; Microsoft does not publish exact threshold

### Tertiary (LOW confidence)

- SmartScreen clearance timing — "weeks to months" for OV certificate reputation building; no official Microsoft publication on exact timeline

---
*Research completed: 2026-03-17*
*Ready for roadmap: yes*
