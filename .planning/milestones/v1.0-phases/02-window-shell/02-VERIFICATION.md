---
phase: 02-window-shell
verified: 2026-02-25T01:30:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# Phase 2: Window Shell Verification Report

**Phase Goal:** A transparent, frameless, always-on-top WPF window floats on the desktop with a working close mechanism
**Verified:** 2026-02-25T01:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All truths drawn from ROADMAP.md success criteria and plan must_haves across plans 02-01, 02-02, and 02-03.

| #  | Truth                                                                                          | Status     | Evidence                                                                               |
|----|-----------------------------------------------------------------------------------------------|------------|----------------------------------------------------------------------------------------|
| 1  | `dotnet build FuzzyClock.slnx` succeeds with zero errors                                      | VERIFIED   | Build output: "Build succeeded. 0 Warning(s) 0 Error(s)"                             |
| 2  | FuzzyClock.App targets net10.0-windows with UseWPF=true and OutputType=WinExe                | VERIFIED   | FuzzyClock.App.csproj lines 8–12: all three properties confirmed                      |
| 3  | FuzzyClock.App has a ProjectReference to FuzzyClock.Core                                      | VERIFIED   | FuzzyClock.App.csproj line 4: `<ProjectReference Include="..\FuzzyClock.Core\...">`   |
| 4  | FuzzyClock.App, FuzzyClock.Core, and FuzzyClock.Core.Tests all appear in FuzzyClock.slnx     | VERIFIED   | FuzzyClock.slnx lines 2–4: all three Project entries present                          |
| 5  | Window has no frame and no background box — text floats on the desktop                        | VERIFIED   | MainWindow.xaml: WindowStyle="None", AllowsTransparency="True", Background="Transparent" |
| 6  | Window is always-on-top                                                                       | VERIFIED   | MainWindow.xaml line 11: Topmost="True"                                               |
| 7  | Right-clicking shows a single "Close" item that exits the application                         | VERIFIED   | MainWindow.xaml: single MenuItem Header="Close" Click="CloseMenuItem_Click"; code-behind calls Application.Current.Shutdown() |
| 8  | Window does not appear in the Windows taskbar or Alt+Tab switcher                             | VERIFIED   | MainWindow.xaml: ShowInTaskbar="False"; App.xaml.cs: hidden ToolWindow owner pattern (hiddenOwner.Show() + mainWindow.Owner = hiddenOwner) |
| 9  | Second launch exits immediately — single-instance enforced via named Mutex                    | VERIFIED   | App.xaml.cs lines 14–22: Mutex("FuzzyClock_SingleInstance_v1"), Shutdown() + return if !createdNew, before any window creation |
| 10 | Drop shadow provides text legibility on varied wallpapers                                     | VERIFIED   | MainWindow.xaml: manual offset TextBlock (Foreground="#BB000000", TranslateTransform X=2 Y=2) as primary technique; DropShadowEffect kept as belt-and-suspenders. Human-confirmed visually effective. |

**Score:** 10/10 truths verified

---

### Required Artifacts

| Artifact                               | Provides                                          | Status     | Evidence                                                    |
|----------------------------------------|---------------------------------------------------|------------|-------------------------------------------------------------|
| `FuzzyClock.App/FuzzyClock.App.csproj` | WPF app project: net10.0-windows, UseWPF, WinExe | VERIFIED   | File exists; contains UseWPF, OutputType=WinExe, TargetFramework=net10.0-windows, ProjectReference to Core |
| `FuzzyClock.slnx`                      | Solution including FuzzyClock.App                 | VERIFIED   | File exists; lists FuzzyClock.App, FuzzyClock.Core, FuzzyClock.Core.Tests |
| `FuzzyClock.App/App.xaml`              | Application entry — no StartupUri                 | VERIFIED   | File exists; StartupUri absent (grep confirms no match); contains Application.Resources |
| `FuzzyClock.App/App.xaml.cs`           | OnStartup: Mutex guard, hidden owner, MainWindow  | VERIFIED   | File exists; contains Mutex, FuzzyClock_SingleInstance_v1, hiddenOwner, new MainWindow(), OnExit release |
| `FuzzyClock.App/MainWindow.xaml`       | Transparent overlay XAML                          | VERIFIED   | File exists; contains AllowsTransparency="True", WindowStyle="None", Background="Transparent", Topmost="True", ShowInTaskbar="False", Grid Background="#01000000", ContextMenu with single Close item, two TextBlocks for shadow |
| `FuzzyClock.App/MainWindow.xaml.cs`    | ContentRendered positioning + close handler       | VERIFIED   | File exists; contains ContentRendered subscription, SystemParameters.PrimaryScreenWidth, Application.Current.Shutdown() |

---

### Key Link Verification

| From                               | To                               | Via                                  | Status  | Evidence                                                          |
|------------------------------------|----------------------------------|--------------------------------------|---------|-------------------------------------------------------------------|
| FuzzyClock.App.csproj              | FuzzyClock.Core.csproj           | ProjectReference                     | WIRED   | csproj line 4: `ProjectReference Include="..\FuzzyClock.Core\FuzzyClock.Core.csproj"` |
| FuzzyClock.slnx                    | FuzzyClock.App/FuzzyClock.App.csproj | dotnet solution entry             | WIRED   | FuzzyClock.slnx line 2: `<Project Path="FuzzyClock.App/FuzzyClock.App.csproj" />` |
| App.xaml.cs OnStartup              | MainWindow.xaml                  | new MainWindow() in OnStartup        | WIRED   | App.xaml.cs line 41: `var mainWindow = new MainWindow();`         |
| MainWindow.xaml.cs constructor     | SystemParameters.PrimaryScreenWidth | ContentRendered -> PositionTopRight | WIRED   | MainWindow.xaml.cs line 17 (ContentRendered subscription) + line 23 (PrimaryScreenWidth usage) |
| MainWindow.xaml ContextMenu        | MainWindow.xaml.cs handler       | CloseMenuItem_Click event binding    | WIRED   | MainWindow.xaml line 23: Click="CloseMenuItem_Click"; MainWindow.xaml.cs line 27: handler defined; generated g.cs confirms event wiring |

---

### Requirements Coverage

| Requirement | Source Plans        | Description                                                                          | Status    | Evidence                                                                |
|-------------|---------------------|--------------------------------------------------------------------------------------|-----------|-------------------------------------------------------------------------|
| WIN-01      | 02-01, 02-02, 02-03 | Window is frameless and transparent — text floats directly on the desktop with no background box | SATISFIED | WindowStyle="None", AllowsTransparency="True", Background="Transparent" in MainWindow.xaml; human-confirmed visually |
| WIN-02      | 02-01, 02-02, 02-03 | Window is always-on-top                                                              | SATISFIED | Topmost="True" in MainWindow.xaml; human-confirmed stays above all applications |
| WIN-03      | 02-01, 02-02, 02-03 | User can right-click to close the application (required: Alt+F4 removed by WindowStyle=None) | SATISFIED | ContextMenu with single "Close" MenuItem; CloseMenuItem_Click calls Application.Current.Shutdown(); human-confirmed |

All three Phase 2 requirements (WIN-01, WIN-02, WIN-03) are SATISFIED. No orphaned requirements.

---

### Anti-Patterns Found

| File                               | Line | Pattern                                | Severity | Impact                                          |
|------------------------------------|------|----------------------------------------|----------|-------------------------------------------------|
| `FuzzyClock.App/MainWindow.xaml`   | 41   | Comment: "static placeholder for Phase 2" | INFO  | Intentional — Phase 3 replaces static text with PhraseEngine output. Not a stub; design decision documented in plan. |

No blocker or warning-level anti-patterns found. The `obj/project.assets.json` "placeholder" matches are build artifacts (NuGet placeholder DLL path), not code stubs.

---

### Drop Shadow Deviation Note

The plan (02-02) specified DropShadowEffect as the primary shadow mechanism. At runtime, DropShadowEffect silently fails on AllowsTransparency=True windows in .NET 10 (GPU rendering path disabled for layered HWNDs). The implementation added a manual offset TextBlock (Foreground="#BB000000", TranslateTransform X=2 Y=2) as the primary technique, keeping DropShadowEffect as belt-and-suspenders.

This deviation is acceptable and by-design:
- The XAML in MainWindow.xaml documents the rationale inline (line 27-29 comment).
- Human visual verification (plan 02-03) confirmed the shadow is visible and provides legibility contrast on varied wallpapers.
- The legibility requirement is satisfied.

---

### Human Verification Status

Plan 02-03 was a blocking human-verification checkpoint. The user approved all 8 checks:

1. TRANSPARENCY — Confirmed: text floats over desktop wallpaper with no frame or background rectangle.
2. POSITION — Confirmed: top-right corner, approximately 20px from edges.
3. DROP SHADOW — Confirmed: manual offset TextBlock shadow is visible and provides contrast. (DropShadowEffect silently fails on AllowsTransparency windows in .NET 10 — manual shadow technique used instead.)
4. ALWAYS-ON-TOP — Confirmed: text remains visible over other application windows when they are focused.
5. TASKBAR — Confirmed: no taskbar button.
6. ALT+TAB — Confirmed: no entry in the Alt+Tab switcher.
7. RIGHT-CLICK CLOSE — Confirmed: single "Close" item in context menu exits the application.
8. SINGLE INSTANCE — Confirmed: second launch exits immediately without a second overlay.

All 8 checks passed on first attempt. No remediation was required.

---

## Gaps Summary

No gaps. All must-haves verified, all requirements satisfied, build passes with zero errors, and all 8 human visual checks approved. Phase 2 goal is fully achieved.

---

_Verified: 2026-02-25T01:30:00Z_
_Verifier: Claude (gsd-verifier)_
