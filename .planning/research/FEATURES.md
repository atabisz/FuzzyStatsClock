# Feature Research

**Domain:** Desktop overlay widget — installer, single-instance UX, edge snapping, settings polish (v3.3)
**Researched:** 2026-03-17
**Confidence:** HIGH (installer: MEDIUM — options verified; single-instance, edge snap, WPF patterns: HIGH)

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-user installer (no UAC prompt) | Every modern Windows utility ships with a wizard that puts itself in `%LOCALAPPDATA%\Programs`; raw xcopy drop feels unfinished | MEDIUM | WiX MSIX per-user scope or Inno Setup `[user]` install mode; no elevation required |
| Desktop/Start-menu shortcut created by installer | Users expect to find the app without hunting for the .exe | LOW | Single Start Menu shortcut; no desktop shortcut by default (widget, not a regular app) |
| Uninstall entry in "Add or Remove Programs" | Windows 11 Settings → Apps lists everything with an installer; absence signals untrustworthiness | LOW | Inno Setup registers this automatically; MSIX does it natively |
| Single-instance: bring existing window to front | Current behavior (silent exit) is wrong for distribution — users re-launch thinking the app crashed | LOW | Named pipe or Win32 `FindWindow` + `PostMessage(WM_USER)` from second instance to first; first instance `Activate()`s |
| Auto-update prompt or awareness | Not mandatory for v3.3 but expected from any downloaded utility; at minimum, a version number visible in Settings | LOW | Version string in Settings window About section is the minimum; full auto-update is deferred |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Edge snapping with visual pull | Windows gadgets and desktop widgets (Rainmeter, Sidebar) all snap to screen edges; this project currently free-floats with no edge affinity | MEDIUM | 20px threshold; snap on drag-end (not live during drag); snap to all 4 edges + 4 corners; margin offsets configurable via code constants |
| Dark-themed settings window | Current settings window is the Windows default light chrome with #F0F0F5 backgrounds — it clashes badly with a dark transparent overlay widget | MEDIUM | `Background="#FF1E1E1E"`, `Foreground="White"`, custom styles for TabControl, CheckBox, RadioButton, ComboBox, Slider; window chrome stays standard (no AllowsTransparency — too complex) |
| Settings window "About" section | Version number, GitHub link, quick "Check for updates" hint text — gives the app a finished feel | LOW | Static TextBlock in a new mini-section at bottom of Behavior tab or a fourth tab |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| MSIX/Store packaging | "More professional" install experience, SmartScreen bypass | MSIX requires identity manifest, package family name embedded in code, Store or sideload certificate; complicates CI; no practical benefit for a personal/hobby widget | Inno Setup per-user installer is simpler, produces a real uninstaller, avoids SmartScreen with code-signing (optional) |
| Live drag snap (snap during mouse-move) | Feels responsive | Per-frame recalculation during drag is expensive; worse, it fights the user's hand movement with a rubber-band effect | Snap on drag-release only (same as Windows Aero Snap behavior) |
| Snap to other windows | Power users want to dock against app edges | Requires enumerating all foreground windows every drag tick; massive complexity, rare use case | Snap to screen edges and corners only |
| Auto-update via Squirrel/Sparkle | Real-time update delivery | Squirrel requires NuGet package + delta package build pipeline; Sparkle requires Objective-C/C++ bridge; both are huge dependencies for a single-EXE widget | Ship a version string; link to GitHub Releases in the About section; user updates manually |
| Installer code-signing | Eliminates SmartScreen "Unknown Publisher" warning | EV cert costs $300-500/year; OV cert ~$100/year; self-signed is worse than unsigned on SmartScreen | Note in README: "Windows SmartScreen may warn on first run; click More info → Run anyway." SmartScreen clears after ~5 installs from different machines report clean to Microsoft |

---

## Feature Dependencies

```
[Installer]
    └──creates──> [Start Menu shortcut]
    └──registers──> [Uninstall entry]
    └──does NOT modify──> [AutoLaunchService] (AutoLaunch writes its own HKCU Run key at runtime; installer does not touch it)
    └──installs to──> [%LOCALAPPDATA%\Programs\FuzzyClock\] (per-user, no UAC)

[Single-instance: bring to front]
    └──replaces──> [current silent-exit behavior in App.xaml.cs]
    └──requires──> [named pipe or SendMessage IPC from second instance to first]
    └──first instance handles──> [pipe/message by calling mainWindow.Activate() + BringToFront()]
    └──independent of──> [installer] (applies to both xcopy and installed scenarios)

[Edge Snapping]
    └──hooks into──> [existing drag-end handler in MainWindow.xaml.cs (MouseLeftButtonUp after DragMove)]
    └──reads──> [Screen.WorkingArea for the current monitor]
    └──writes──> [_currentPosition via existing SaveSettings() path]
    └──uses constant──> [SNAP_THRESHOLD = 20px, SNAP_MARGIN = 10px (gap from edge)]
    └──independent of──> [MonitorService] (snap uses WPF screen bounds already available)

[Dark Settings Window]
    └──modifies──> [SettingsWindow.xaml — resource styles only, no logic changes]
    └──independent of──> [SettingsWindow.xaml.cs] (code-behind unchanged)
    └──conflicts with──> [system light/dark mode switching] (fixed dark palette; no dynamic theme response)

[Settings About Section]
    └──reads──> [Assembly.GetExecutingAssembly().GetName().Version]
    └──lives in──> [Behavior tab bottom, or new "About" TabItem]
```

### Dependency Notes

- **Installer does not manage AutoLaunch.** `AutoLaunchService` writes `HKCU\Run` at runtime when the user toggles the setting. The installer must not pre-populate that key — that would create a startup entry even if the user never asked for it, and it would survive uninstall.
- **Edge snap is drag-end only.** WPF's `DragMove()` is a blocking call; there is no per-tick callback during drag. Snapping must happen in `MouseLeftButtonUp` after `DragMove()` returns, comparing `Left`/`Top` to screen edge distances and nudging if within threshold.
- **Single-instance bring-to-front requires IPC.** The Mutex approach (already in `App.xaml.cs`) detects a duplicate launch but only in the second process. The second process cannot directly call methods on the first process's `MainWindow`. A named pipe (write a single byte from second → first) or `PostMessage` to a named `FindWindow` handle is the correct bridge. Named pipe is simpler and avoids Win32 window class naming.
- **Dark settings window is style-only.** All control logic in `SettingsWindow.xaml.cs` is unchanged. Only XAML resource styles and `Background`/`Foreground` properties change. This is the correct scope boundary.

---

## MVP Definition

### Launch With (v3.3)

- [ ] Per-user Inno Setup installer — distributable; no UAC; registers uninstall entry; creates Start Menu shortcut
- [ ] Single-instance bring-to-front — replaces silent-exit with Activate() of existing window
- [ ] Edge snapping — 20px threshold, snap on drag-release, all 4 edges + 4 corners, 10px margin gap
- [ ] Dark settings window — replaces light #F0F0F5 palette with dark #1E1E1E; custom styles for all control types

### Add After Validation (v3.3.x)

- [ ] About section in Settings (version string + GitHub URL) — low complexity, good hygiene
- [ ] SmartScreen guidance in README — not code, but important user-facing documentation

### Future Consideration (v4+)

- [ ] Auto-update notification (polling GitHub Releases API) — requires async HTTP, version comparison, UX for "update available" banner
- [ ] MSIX packaging — only worthwhile if submitting to Microsoft Store
- [ ] Code signing certificate — worthwhile when install count grows; not worth cost at early stage

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Per-user installer | HIGH | MEDIUM | P1 |
| Single-instance bring-to-front | HIGH | LOW | P1 |
| Edge snapping | MEDIUM | MEDIUM | P1 |
| Dark settings window | MEDIUM | MEDIUM | P1 |
| About section (version + link) | LOW | LOW | P2 |
| Auto-update | LOW | HIGH | P3 |

---

## Detailed Feature Specifications

### A. Per-User Inno Setup Installer

**What it does:**
- Installs `FuzzyClock.exe` + supporting DLLs to `{localappdata}\Programs\FuzzyClock\`
- Creates one Start Menu shortcut: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\FuzzyClock.lnk`
- Registers uninstall entry: `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\FuzzyClock`
- Does NOT create a desktop shortcut by default (widget floats on desktop; a shortcut there is confusing)
- Does NOT write `HKLM` keys (per-user scope, no elevation required)
- Does NOT pre-enable auto-launch (user controls that in the app's Behavior settings)

**Upgrade behavior:**
- Inno Setup's default `[Run]` + `[UninstallDelete]` handles in-place upgrade
- `settings.json` in `%LOCALAPPDATA%\FuzzyClock\` is NOT deleted on upgrade — user preferences preserved
- `settings.json` IS deleted on full uninstall (or offer the choice: "Keep settings?" checkbox on uninstall)

**SmartScreen interaction:**
- No code signing = SmartScreen "Unknown Publisher" on first launch after download
- This is acceptable at hobby/early distribution stage
- README must document: "Click More info → Run anyway" workaround
- Note: SmartScreen clears automatically after ~5 users run the installer without reporting it; not a permanent blocker

**CI integration:**
- Inno Setup script (`installer/FuzzyClock.iss`) added to repo
- GitHub Actions `release.yml` gains a step: `iscc installer\FuzzyClock.iss` after `dotnet publish`
- The `.exe` installer is uploaded as a release artifact alongside the raw `FuzzyClock.exe`

**Inno Setup version:** 6.x (current as of 2026) — single `.iss` script, no MSVC redistributable needed for self-contained .NET 10 publish

---

### B. Single-Instance Bring-To-Front

**Current behavior (v3.2):** Second launch detects Mutex not created → `Shutdown()` silently. The widget does not visibly respond.

**Target behavior (v3.3):** Second launch sends a "focus" signal to the running instance, which responds by calling `Activate()` + `BringToFront()` on `MainWindow`. Second instance then exits.

**Implementation pattern — named pipe (recommended):**

```
First instance:
  - Creates Mutex (existing, unchanged)
  - Spawns a background Task that opens a NamedPipeServerStream("FuzzyClock_Focus")
    and awaits a connection in a loop
  - On connection: calls Dispatcher.Invoke(() => mainWindow.Activate())
  - Loop continues (handles repeated re-launches)

Second instance:
  - Mutex already exists → createdNew = false
  - Connects to NamedPipeClientStream("FuzzyClock_Focus")
  - Sends 1 byte (signal payload; content irrelevant)
  - Calls Shutdown()
```

**Why named pipe over FindWindow/PostMessage:**
- `FindWindow` requires registering a known window class name — currently the WPF default (`HwndWrapper...`) which is not stable
- Named pipe works without any Win32 window class knowledge
- Named pipe is pure managed code; no P/Invoke

**Edge case: pipe server not yet ready on first instance startup.**
The pipe server task starts in `ContentRendered`. If a second instance launches before ContentRendered fires (unlikely but possible at startup), the `ConnectAsync` in the second instance will timeout. The second instance should use a 500ms timeout on `ConnectAsync`; if it times out, it still exits (Mutex guard ensures no second window appears). The first instance will not receive a focus signal in this edge case, but there is no visible harm.

**Why not WM_QUERYENDSESSION or WM_SHOWWINDOW:** Those are system-broadcast messages. User-defined `WM_USER+1` PostMessage requires knowing the target HWND, which requires FindWindow with a stable class name.

---

### C. Edge Snapping

**What it does:** After the user releases a drag, if any edge of the widget is within 20 pixels of the corresponding screen edge (work area boundary), snap the widget to that edge with a 10px margin gap.

**Threshold rationale:** 20px is the de-facto standard for Windows desktop widgets:
- Windows Sidebar (Vista/7) used 8px (aggressive)
- Rainmeter uses configurable 20px default
- macOS menu bar widgets use 10px
- 20px is a comfortable "intentional" threshold — close to edge but not accidentally triggered

**Snap margin:** 10px gap between widget edge and screen work area edge. Widgets flush against the edge look clipped. 10px gap is visually balanced and does not obscure the taskbar on the nearest-edge side.

**Which edges snap:**
- All 4 edges snap independently
- Corner snap: if both X and Y edges are within threshold, snap to corner (both axes snap simultaneously)
- No priority ordering needed — the 20px threshold is small enough that accidental corner snap is unlikely

**Snap geometry:**

```
Screen work area: Left=SL, Top=ST, Right=SR, Bottom=SB
Widget rect:      Left=WL, Top=WT, Right=WR=WL+W, Bottom=WB=WT+H
Snap margin:      M = 10

Snap left edge:   if (WL - SL) <= 20  →  WL = SL + M
Snap right edge:  if (SR - WR) <= 20  →  WL = SR - W - M
Snap top edge:    if (WT - ST) <= 20  →  WT = ST + M
Snap bottom edge: if (SB - WB) <= 20  →  WT = SB - H - M
```

**Where in code:** `MouseLeftButtonUp` handler, after `DragMove()` returns. Read `this.Left`/`this.Top`/`this.ActualWidth`/`this.ActualHeight` and the current monitor's `WorkingArea`. Apply snapped position. Call existing `ClampAndSave()`.

**Interaction with SizeToContent:** The widget uses `SizeToContent=WidthAndHeight`. `ActualWidth`/`ActualHeight` are valid after `UpdateLayout()`. Add `UpdateLayout()` call before reading dimensions in the snap logic to guarantee current values.

**No animation on snap.** Snapping is a positional jump, not a spring animation. Animation would require `DoubleAnimation` on `Left`/`Top` DependencyProperties — those are on `Window`, not dependency properties in WPF (they are CLR properties). Animating window position requires a `DispatcherTimer` tweening approach, which is disproportionate complexity for this feature.

---

### D. Dark Settings Window

**Problem:** The settings window currently uses default WPF system colors — `#FFF0F0F5` backgrounds, `#FF333333` text, and unthemed ComboBox/CheckBox/Slider/RadioButton controls. This creates a jarring contrast against the dark transparent overlay widget. Users who set their Windows theme to dark are particularly affected (the settings window ignores the system dark mode preference).

**Target palette:**

| Element | Color | Notes |
|---------|-------|-------|
| Window background | `#FF1E1E1E` | Dark but not pure black; matches VS Code / Windows Terminal dark |
| Tab content background | `#FF252526` | Slightly lighter to create depth |
| Section header text | `#FFF0F0F0` | Near-white, readable |
| Body text / labels | `#FFCCCCCC` | Slightly dimmed to reduce eye strain |
| Checkbox/radio label text | `#FFCCCCCC` | Consistent with body text |
| Input backgrounds (ComboBox, etc.) | `#FF3C3C3C` | Mid-dark; enough contrast against text |
| Input foreground text | `#FFF0F0F0` | Near-white |
| Accent swatch border (selected state) | `#FFFFFFFF` | Selection ring uses white for visibility |
| Theme card background | `#FF2D2D30` | Cards stand out from window background |
| Theme card hover state | Opacity 0.8 (not color change) | Simpler than color; existing hover triggers use Opacity |
| Segment button rail | `#FF3C3C3C` | Replaces current `#FFE8E8E8` light gray |
| Segment button selected pill | `#FF5A5A5F` | Mid-gray selected state (not white — too bright on dark) |
| Slider track | `#FF5A5A5F` | System slider doesn't inherit background on WPF |

**What needs custom styles:**
- `TabControl` + `TabItem` — system TabControl does not respect `Background` properly on dark; requires full `ControlTemplate` or `Background`/`Foreground` override on each item
- `CheckBox` — the check glyph color is system-driven; requires custom template or `Foreground` override for label text only (glyph inherits from system accent)
- `RadioButton` — same as CheckBox; label text color override sufficient
- `ComboBox` + `ComboBoxItem` — dropdown popup is opaque and will be white by default; requires `Background`/`Foreground` on `ComboBox` and a `Style` on popup items
- `Slider` — `Background` of the track requires a custom `ControlTemplate` or at minimum overriding the `PART_Track` background via `Style`
- Standard `Button` (Custom... and Close/OK buttons) — `Background`/`Foreground` override + `BorderBrush`

**What does NOT need custom styles:**
- The `SegmentButtonStyle` already defined as a `StaticResource` — update colors in place (2 hex value changes)
- `TextBlock` — inherits `Foreground` from parent; set `TextElement.Foreground` on `Window` as an attached property to cascade

**Implementation approach:**
1. Set `Window.Background="#FF1E1E1E"` and `TextElement.Foreground="#FFCCCCCC"` on the `Window` element — this cascades to most `TextBlock`s automatically
2. Add `Window.Resources` styles for `CheckBox`, `RadioButton`, `ComboBox`, `ComboBoxItem`, `Slider`, `Button`
3. Update `SegmentButtonStyle` colors
4. Set `TabControl Background` and `TabItem` styles
5. Test each control type visually — system-themed controls resist background inheritance in unexpected ways

**What to keep light:** The title bar / window chrome remains system-themed (light on most Windows 11 installs). Setting `AllowsTransparency=True` + custom chrome for a settings window is not worth the complexity. The slight mismatch between dark content and light chrome is acceptable for a settings dialog.

**Note on system dark mode:** Windows 11 exposes a `SystemParameters.WindowGlassBrush` and `ThemeManager`-style APIs, but WPF does not automatically adapt controls to the system dark mode setting. Manually specifying a fixed dark palette is the established WPF approach. The palette should NOT attempt to dynamically respond to `SystemParameters.WindowGlassBrush` — that adds complexity for negligible benefit in a fixed-purpose settings window.

---

## Competitor Feature Analysis

| Feature | Rainmeter | Windows Clock widget | Our Approach |
|---------|-----------|---------------------|--------------|
| Installer | Per-user NSIS installer | Built-in / Store | Inno Setup per-user, no UAC |
| Second-launch behavior | Focus existing tray icon | N/A (one instance) | Named pipe → Activate() MainWindow |
| Edge snapping | Configurable, 20px default | Not applicable | 20px hard-coded threshold, 10px margin |
| Settings UI | .ini editor or per-skin editor | Flyout panel | Dark WPF window, 3 tabs |
| Settings theme | Matches skin | Windows system | Fixed dark palette |

---

## Sources

- Inno Setup 6 documentation: https://jrsoftware.org/ishelp/ (MEDIUM confidence — docs reviewed; per-user install path `{localappdata}\Programs` is standard)
- WPF named pipe single-instance pattern: well-established .NET pattern (HIGH confidence — used in production WPF apps)
- Edge snap threshold: Rainmeter default 20px (MEDIUM confidence — community-verified default; no official spec for "standard")
- Windows Aero Snap: snaps on drag-release, not during drag (HIGH confidence — observable OS behavior)
- WPF dark theme limitations (no auto dark-mode): established WPF knowledge (HIGH confidence — no system-level WPF dark mode API exists in .NET 10)
- SmartScreen reputation building: ~5 installs to clear warning (MEDIUM confidence — documented community observation; Microsoft does not publish exact threshold)
- `%LOCALAPPDATA%\Programs` per-user install convention: used by VS Code, Slack, Discord (HIGH confidence — observable on standard Windows installs)

---

*Feature research for: FuzzyStatsClock v3.3 — installer, single-instance UX, edge snapping, settings window polish*
*Researched: 2026-03-17*
