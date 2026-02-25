# Project Research Summary

**Project:** Fuzzy Clock v1.1 — drag, position persistence, font size
**Domain:** Transparent frameless always-on-top WPF desktop widget enhancement
**Researched:** 2026-02-25
**Confidence:** HIGH

## Executive Summary

Fuzzy Clock v1.1 adds three tightly coupled features to an already-working .NET 10 WPF overlay: drag-to-reposition, JSON-based position and font size persistence, and a font size submenu in the existing right-click context menu. All three features are built entirely from APIs already present in the .NET 10 SDK — `Window.DragMove()`, `System.Text.Json`, `Environment.SpecialFolder.LocalApplicationData`, and nested `MenuItem` elements. Zero NuGet packages are required, preserving the v1.0 zero-dependency principle. The implementation surface is small: two new files (`AppSettings.cs`, `SettingsService.cs`) and targeted changes to three existing files (`App.xaml.cs`, `MainWindow.xaml.cs`, `MainWindow.xaml`).

The recommended approach centers on a clean separation of concerns: a static `SettingsService` owns all JSON I/O and screen-clamping logic, while `MainWindow` and `App.xaml.cs` only pass and receive `AppSettings` records. Drag is implemented with a single `DragMove()` call in `MouseLeftButtonDown` on the root Grid — the OS handles native movement with no manual delta tracking. Settings are saved immediately after each drag completes (DragMove blocks until mouse-up, so the line after it is the ideal save point) and immediately after each font size change. A `-1` sentinel for `Left` distinguishes "no saved position" from a valid x=0 coordinate, allowing the existing `PositionTopRight()` to serve as a first-run fallback without a separate boolean flag.

The primary risks are all related to sequencing interactions with v1.0 code that was written without awareness of user-controlled positioning. The `UpdatePhraseIfChanged()` method currently calls `PositionTopRight()` unconditionally after every phrase change — this will silently snap the widget back to the top-right corner during a 5-minute boundary crossing if not guarded. The `ContentRendered` handler has the same problem. Both require a `_hasUserPosition` guard before `PositionTopRight()` is called. These are the only non-obvious changes; everything else is additive.

---

## Key Findings

### Recommended Stack

The v1.0 stack (.NET 10 WPF, C# 13, zero NuGet dependencies) is unchanged. All three v1.1 features use APIs already shipped with the SDK. `Window.DragMove()` is in `PresentationFramework.dll` (already referenced via `UseWPF=true`). `System.Text.Json` is in-box since .NET Core 3.0 — no package needed. `SystemParameters.VirtualScreen*` properties cover multi-monitor screen bounds without adding `System.Windows.Forms` as a dependency. The only new file-system APIs used are `Environment.GetFolderPath`, `Directory.CreateDirectory`, `File.ReadAllText`, and `File.WriteAllText` — all BCL.

See full details in `.planning/research/STACK.md`.

**Core technologies:**
- **.NET 10 / WPF:** `Window.DragMove()` for OS-native drag; `SizeToContent=WidthAndHeight` already handles window resize after font change
- **System.Text.Json (in-box):** Serialize/deserialize the three-field `AppSettings` record — no Newtonsoft.Json, no NuGet cost
- **SystemParameters.VirtualScreen*:** Clamp restored position against all connected monitors, not just the primary screen
- **Nested MenuItem (XAML):** Three static font size items inside a "Font Size" parent MenuItem — the standard WPF submenu pattern

**Key version constraint:** None. All APIs are available in .NET 10 LTS (and have been since .NET Core 3.0 for most of them).

---

### Expected Features

See full details in `.planning/research/FEATURES.md`.

**Must have (table stakes — v1.1 scope):**
- **Drag to reposition (WIN-04)** — users' first instinct for a borderless widget; wiring `DragMove()` is 3 lines
- **Position restored on startup, clamped if off-screen (WIN-05)** — a widget that forgets its position on restart is fundamentally broken as a persistent desktop tool
- **Font size selector in right-click menu (DISP-05)** — three labeled options (Small 16pt, Medium 24pt, Large 32pt); current v1.0 hardcodes 32pt with no user control
- **Font size persists across restarts (DISP-06)** — stored in the same JSON file as position; one read/write path covers everything
- **Right-click menu shows current font size as checked** — stateless menu feels broken; set `IsChecked` on restore and on each selection change

**Should have (polish, low cost):**
- **Save position after drag, not only on close** — DragMove blocks until mouse-up, so `SaveSettings()` on the next line covers this at essentially zero cost; eliminates position loss on crash or kill
- **Drag cursor feedback** — `Cursor="SizeAll"` on the Grid communicates draggability to new users; one XAML attribute

**Defer to v2+:**
- **Auto-launch on Windows login (STRT-01)** — registry run key; explicitly deferred in PROJECT.md
- **Multi-monitor smart positioning** — per-monitor identity via `Screen.GetWorkingArea`; virtual screen clamp is sufficient for v1.1
- **Snap-to-screen-edge magnetism** — nice polish, medium complexity; not required for v1.1
- **Arbitrary font size input / font family selector** — contradicts the widget's fixed-layout design

**Confirmed anti-features (do not implement):**
- Click-through transparent areas — incompatible with drag; kills `DragMove()` event delivery
- Settings dialog / second window — contradicts the product's simplicity model
- `IsCheckable` radio-group on font MenuItems without manual mutual exclusion — WPF lacks built-in `GroupName` for `MenuItem`; must clear all then set one

---

### Architecture Approach

The architecture is minimal-change: two new files are introduced to isolate persistence logic, and three existing files receive targeted additions. `SettingsService` (static class) owns the JSON file path, `Load()`, `Save()`, screen clamping, and defaults — it never touches WPF types. `AppSettings` is a plain C# record with three properties (`double Left, Top; int FontSize`). `App.xaml.cs` calls `SettingsService.Load()` before `Show()` and passes the result to `mainWindow.ApplySettings()`. `MainWindow` handles drag (calls `DragMove()` then `SaveSettings()`), font size changes (calls `SetFontSize()` which updates both TextBlocks, calls `UpdateLayout()`, then `SaveSettings()`), and conditional position restore in `ContentRendered`. `FuzzyClock.Core` and its tests are untouched.

See full details in `.planning/research/ARCHITECTURE.md`.

**Major components:**
1. **AppSettings record** (`AppSettings.cs`) — data contract: `Left`, `Top`, `FontSize`; no WPF dependencies; Left=-1 is the sentinel for "no saved position"
2. **SettingsService** (`SettingsService.cs`) — JSON load/save, `%LOCALAPPDATA%\FuzzyClock\settings.json` path, `VirtualScreen*` clamp, defaults; static class, no instance or DI needed
3. **MainWindow.xaml.cs** — drag handler (`DragMove()` + `SaveSettings()`), `ApplySettings(AppSettings)`, `SetFontSize(int)`, `_hasUserPosition` flag, conditional `PositionTopRight()` guards
4. **MainWindow.xaml** — `MouseLeftButtonDown` on Grid, `<MenuItem Header="Font Size">` submenu with three `IsCheckable` children
5. **App.xaml.cs** — `SettingsService.Load()` before `Show()`; `SessionEnding` handler as backup save path

**Key patterns to follow:**
- `DragMove()` in `MouseLeftButtonDown` on the Grid (not on child elements, not in `MouseMove`)
- Save immediately after `DragMove()` returns and after `SetFontSize()` — do not defer to `Closing` only
- `UpdateLayout()` after every `FontSize` change before any position calculation (`ActualWidth` is stale until a layout pass)
- Write JSON via temp-file + rename to prevent partial-write corruption

**Build order (each step independently testable):**
1. `AppSettings` + `SettingsService` (no UI, verify file creation and defaults)
2. Apply settings on startup — wire `Load()` in `App.xaml.cs`, add `ApplySettings()`, make `PositionTopRight()` conditional
3. Drag — `MouseLeftButtonDown` + `DragMove()` + `SaveSettings()`
4. Font size — XAML submenu + `SetFontSize()` + checkmark sync
5. Off-screen clamp validation (edge-case: manually set extreme values in JSON, verify clamp)

---

### Critical Pitfalls

See full details in `.planning/research/PITFALLS.md`.

1. **`UpdatePhraseIfChanged()` unconditionally calls `PositionTopRight()` after phrase changes** — after a 5-minute boundary crossing mid-drag, the widget snaps back to the top-right corner. Introduce `bool _hasUserPosition`; set it via `LocationChanged`; guard `PositionTopRight()` inside `UpdatePhraseIfChanged()`. This is the single most insidious regression risk because it only manifests at 5-minute boundaries and is easy to miss in testing.

2. **`ContentRendered` calls `PositionTopRight()` unconditionally, overwriting the loaded saved position every launch** — introduce `bool _savedPositionLoaded`; only call `PositionTopRight()` when false. Without this fix, persistence appears to work (JSON file is written) but the widget always starts at the top-right.

3. **`Window.Left`/`Top` set in the constructor can be silently reset by `InitializeComponent()`** — apply saved position in `App.xaml.cs` after `new MainWindow()` but before `mainWindow.Show()`. This is the only safe assignment window for `WindowStartupLocation="Manual"`.

4. **Off-screen clamping against `PrimaryScreenWidth` breaks multi-monitor setups** — any saved position on a secondary monitor is clamped back to the primary on every restart. Use `SystemParameters.VirtualScreenLeft/Top/Width/Height` instead.

5. **`DragMove()` throws `InvalidOperationException` if called asynchronously or wired on the wrong element** — wire `MouseLeftButtonDown` on the outermost Grid (not on child TextBlocks); call `DragMove()` synchronously (no `Dispatcher.BeginInvoke`, no `await`).

6. **`Window.Closing` is not raised on Windows session end** — position saved only in `Closing` is lost on log-off or shutdown. Add `Application.SessionEnding` handler that also calls `SaveSettings()`.

7. **Both TextBlocks must receive identical `FontSize` changes** — `ShadowText` is a mirror of `PhraseText`; updating only `PhraseText` causes shadow misalignment and incorrect `ActualWidth` after layout.

---

## Implications for Roadmap

Based on the feature dependencies and architecture build order identified in research, a two-phase structure is the natural fit. All four v1.1 features share the same JSON settings infrastructure; persistence must be in place before drag or font size can be wired up meaningfully.

### Phase 1: Settings Infrastructure + Drag + Position Persistence

**Rationale:** `AppSettings` and `SettingsService` have no WPF dependencies and can be written and unit-tested independently. Once the save/load/clamp path is proven, drag can be wired in one handler and position restore follows immediately. These three concerns are tightly coupled (drag produces a position, persistence saves it, startup restores it) and share all the same integration risks — the `ContentRendered` guard and `_hasUserPosition` flag must both be introduced here.

**Delivers:**
- Widget remembers its position across restarts
- User can drag the widget anywhere on any connected monitor
- Off-screen positions clamped safely on startup using virtual screen bounds
- Position saved after each drag (not only on close)

**Features from FEATURES.md:** WIN-04 (drag), WIN-05 (position persistence + clamping)

**Pitfalls to avoid:**
- P2 (`PositionTopRight()` guard in `UpdatePhraseIfChanged()` via `_hasUserPosition` flag)
- P3 (`ContentRendered` guard via `_savedPositionLoaded` flag)
- P7 (Apply saved position in `App.xaml.cs` after `new MainWindow()` before `Show()`)
- P5 (JSON path in `%LOCALAPPDATA%`, not next to the exe)
- P6 (`SessionEnding` handler for session-end saves)
- P8 (Virtual screen clamp, not primary-screen clamp)
- P12 (Atomic JSON write via temp-file + rename)

**Research flag:** No additional phase research needed. All patterns are well-documented WPF fundamentals verified against official docs.

---

### Phase 2: Font Size Selection + Persistence

**Rationale:** Font size selection is the simplest of the three features and has a hard dependency on the JSON settings path built in Phase 1 (font size is stored in the same file). The `UpdateLayout()` sequencing requirement is already established by the existing phrase-change code in v1.0. This phase is purely additive and has no backward risk to Phase 1 if done after.

**Delivers:**
- Right-click menu "Font Size" submenu with Small (16pt), Medium (24pt), Large (32pt)
- Selected font size applied immediately to both TextBlocks
- Font size persists across restarts
- Menu checkmarks reflect the current size on startup and on change

**Features from FEATURES.md:** DISP-05 (font size selector), DISP-06 (font size persistence)

**Pitfalls to avoid:**
- P4 (Call `UpdateLayout()` after font size change before any position calculation)
- P4 (Always set `FontSize` on both `ShadowText` and `PhraseText` together)
- P10 (Set `IsChecked` on the correct menu item on startup from restored value, not only in Click handler)
- P11 (JSON deserialization wrapped in try/catch; `null` falls back to defaults)

**Research flag:** No additional phase research needed. Standard WPF `MenuItem` submenu and `IsCheckable` patterns; verified against official ContextMenu docs.

---

### Phase Ordering Rationale

- Phase 1 before Phase 2 because font size persistence reuses the JSON write path established in Phase 1; writing Phase 2 first would require duplicating or deferring that infrastructure.
- Both phases deliver independently shippable increments: after Phase 1, the widget fully remembers its position; after Phase 2, it also remembers font size.
- The critical sequencing pitfalls (P2, P3, P7) all live in Phase 1 and must be addressed there before Phase 2 adds any new save calls.
- The `UpdateLayout()` sequencing requirement (P4) is already present in the existing `UpdatePhraseIfChanged()` code — Phase 2 extends the same established pattern.

### Research Flags

Phases with standard patterns (skip `/gsd:research-phase`):
- **Phase 1:** `DragMove()`, `System.Text.Json`, `LocalApplicationData`, `VirtualScreen*` — all verified against official Microsoft docs at HIGH confidence; implementation patterns confirmed in existing codebase
- **Phase 2:** WPF `MenuItem` submenu, `IsCheckable`, `UpdateLayout()` after `SizeToContent` change — all verified against official Microsoft docs at HIGH confidence

No phase requires deeper research before planning. The research already provides complete, verified implementation patterns for every feature and pitfall.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All APIs verified against official Microsoft docs (windowsdesktop-10.0). Zero new packages. Existing project structure confirmed by reading source files directly. |
| Features | HIGH | All four v1.1 features verified against official WPF docs. Feature boundaries and anti-features are clearly motivated by architectural constraints (AllowsTransparency, SizeToContent, hit-testing). |
| Architecture | HIGH | Build order verified against existing codebase. Component boundaries are minimal and justified. Pattern for `UpdateLayout()` sequencing validated in v1.0 source. |
| Pitfalls | HIGH | All critical pitfalls sourced from official API documentation (Closing, DragMove, LocationChanged, VirtualScreen, SpecialFolder). The `PositionTopRight()` regression risk explicitly derived from reading the existing source code. |

**Overall confidence:** HIGH

### Gaps to Address

- **Multi-monitor position behavior after monitor reconfiguration:** The v1.1 approach (virtual screen clamp, single saved position) is the correct minimal solution. If a secondary monitor is disconnected after saving a position there, the widget will be clamped to the primary screen. This is the documented least-bad outcome. Validate with a real two-monitor setup if available during implementation.

- **Session-end save timing:** The `SessionEnding` save path (Pitfall 6) is architecturally correct but is difficult to test in a development environment without an actual log-off cycle. Flag for manual verification during implementation of Phase 1.

- **Font size checkmark mutual exclusion:** WPF `MenuItem` lacks a built-in `GroupName` property. The manual clear-all-then-check-one approach is standard; implementation is straightforward but should be explicitly tested for the case where the menu is opened and closed without a selection, then reopened.

---

## Sources

### Primary (HIGH confidence)

- `Window.DragMove` official docs (windowsdesktop-10.0, updated 2026-02-11): https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.dragmove
- `Window.LocationChanged` official docs (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.locationchanged
- `System.Text.Json` overview: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview
- `SystemParameters.VirtualScreenWidth` official docs (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.systemparameters.virtualscreenwidth
- `Environment.GetFolderPath` / `SpecialFolder.LocalApplicationData` (.NET 10): https://learn.microsoft.com/en-us/dotnet/api/system.environment.getfolderpath
- WPF ContextMenu / nested MenuItem (updated 2026-01-28): https://learn.microsoft.com/en-us/dotnet/desktop/wpf/controls/contextmenu
- `Window.Closing` — not raised on session end: https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.closing
- `Window.Left` / coordinate system and NaN behavior: https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.left
- `MenuItem.IsChecked`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.controls.menuitem.ischecked
- `SystemParameters.WorkArea`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.systemparameters.workarea
- `UIElement.IsHitTestVisible` + WPF hit testing: https://learn.microsoft.com/en-us/dotnet/desktop/wpf/graphics-multimedia/hit-testing-in-the-visual-layer
- Existing project source (read directly): `c:/src/gsd1/FuzzyClock.App/MainWindow.xaml` and `MainWindow.xaml.cs` — confirmed Grid hit-test background, TextBlock names, ContextMenu structure, `PositionTopRight()` and `UpdatePhraseIfChanged()` implementations

### Secondary (MEDIUM confidence)

None required. All findings resolved at PRIMARY confidence against official documentation.

---
*Research completed: 2026-02-25*
*Ready for roadmap: yes*
