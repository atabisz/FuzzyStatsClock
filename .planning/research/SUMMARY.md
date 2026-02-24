# Project Research Summary

**Project:** Fuzzy Clock — C# WPF transparent desktop widget
**Domain:** Windows desktop overlay widget (natural-language clock)
**Researched:** 2026-02-25
**Confidence:** HIGH (stack and pitfalls verified against official Microsoft docs; features HIGH for vocabulary, MEDIUM for competitive landscape)

## Executive Summary

Fuzzy Clock is a Windows-only desktop widget that renders a natural-language time phrase ("almost noon", "quarter past 3") as floating text over the desktop. The well-established expert approach is a minimal WPF application on .NET 10 LTS: a single frameless, transparent, always-on-top window containing one `TextBlock`, driven by a `DispatcherTimer` polling `DateTime.Now`, with phrase generation delegated to a standalone pure-function class. No third-party packages are needed. The entire application fits in five files.

The recommended approach is to build the phrase engine first (pure C# logic, fully unit-testable with no WPF dependency), then establish the transparent window shell, then wire them together, then add text legibility polish. This ordering matches architectural dependencies and isolates the most failure-prone concerns: phrase boundary logic can be validated independently before any UI exists, and the WPF transparency setup has strict property-ordering constraints that must be verified in isolation before adding logic on top.

The key risks are all well-documented and preventable. The three-way transparency dependency (`WindowStyle=None` + `AllowsTransparency=True` + `Background=Transparent`) must be set in XAML before the window is shown — any one missing causes a visible failure or a runtime exception. Timer drift from a naive 5-minute interval must be avoided by deriving phrases from `DateTime.Now` on every tick and aligning ticks to 5-minute clock boundaries. Text legibility on transparent windows requires deliberate attention because ClearType is disabled on layered windows; larger, bolder fonts with a near-transparent hit-testable grid background solve both the readability and drag-hit-testing problems simultaneously.

## Key Findings

### Recommended Stack

The entire project runs on .NET 10 LTS (supported Nov 2025 – Nov 2028) with WPF and C# 13. No NuGet packages are needed. WPF provides `AllowsTransparency`, `WindowStyle=None`, and `Topmost` as first-class `Window` properties, making the overlay configuration a pure XAML declaration. `DispatcherTimer` fires on the UI thread, eliminating the cross-thread marshalling that `System.Timers.Timer` would require.

The project file is minimal: `<TargetFramework>net10.0-windows</TargetFramework>` with `<UseWPF>true</UseWPF>`. WinForms was rejected because it has no native per-pixel transparency. WinUI 3 was rejected as higher-complexity with a larger deployment footprint for no functional gain over WPF for this use case.

**Core technologies:**
- **.NET 10 LTS**: runtime and SDK — current LTS with 3-year support window; recommended by Visual Studio 2026 for new WPF projects
- **WPF**: UI framework — native `AllowsTransparency`, `Topmost`, frameless window support; no third-party packages needed
- **C# 13**: language — ships with the SDK; no version-specific features required for this project
- **DispatcherTimer**: timing — fires on UI thread; no Dispatcher.Invoke needed for TextBlock updates

### Expected Features

The core value of the product is the phrase engine. All table-stakes features converge on it; the overlay window and timer exist only to deliver the phrase to the user's desktop continuously.

**Must have (table stakes):**
- Fuzzy English phrase for current time (12 buckets per hour, 5-minute granularity) — core product promise
- Correct 12-hour phrasing with noon/midnight special cases — natural English requires this
- Always-on-top transparent frameless overlay — reason to use a widget over the taskbar clock
- Phrase updates at 5-minute boundaries — users learn the cadence; stale text breaks trust
- Readable typography with legibility on any wallpaper (drop shadow or outline) — text must be visible over light and dark backgrounds
- Draggable window positioning — lets users avoid desktop icon conflicts

**Should have (competitive):**
- Poetic / approximation vocabulary ("just gone half past", "almost noon") rather than strict "X past Y" — project-stated design goal; differentiates from mechanical implementations
- Position persistence across sessions (save/restore `Window.Left`/`Top`) — users expect the widget to stay where they placed it
- Windows startup launch (registry run key or startup folder) — persistent desktop presence requires this
- Single-instance enforcement (named Mutex) — prevents duplicate widget instances

**Defer (v2+):**
- Animated phrase transitions (fade in/out) — polish; adds scope without changing functionality
- System tray icon — useful UX pattern but adds scope; right-click ContextMenu on the window is sufficient for MVP
- Config file for font/color customization — hard-code sensible defaults; discover what users actually want to change before building UI for it
- Windows startup toggle in UI — the registry write is easy; defer the toggle surface until settings are in scope

### Architecture Approach

The application is a four-component system with strictly one-way data flow: `DateTime.Now` → `PhraseEngine.TimeToPhrase()` → `TextBlock.Text` → rendered pixel. There is no navigation, no MVVM framework, no dependency injection. The `MainWindow` code-behind owns the `DispatcherTimer`, calls `PhraseEngine` on each tick, and assigns the returned string directly to the `TextBlock`. All phrase logic lives in a separate static class with no WPF dependency, making it fully unit-testable.

The timer should fire every 30 seconds (not every 5 minutes). This guarantees the display updates within 30 seconds of any phrase boundary without the alignment complexity of computing exact milliseconds to the next boundary. The phrase is always derived from `DateTime.Now` on each tick, never from a counter — this prevents drift entirely.

**Major components:**
1. `PhraseEngine` (static class) — pure `DateTime` → `string` mapping; 12 five-minute buckets per hour plus noon/midnight special cases; no WPF dependency; unit-testable in isolation
2. `MainWindow` (XAML + code-behind) — transparent frameless always-on-top window; owns `DispatcherTimer`; calls `PhraseEngine`; handles `DragMove`; sets `ShowInTaskbar=False`
3. `DispatcherTimer` — 30-second interval; fires on UI thread; drives phrase refresh
4. `TextBlock` (XAML element) — renders the phrase string; styled for legibility on transparent background

**Project file structure (5 files total):**
```
FuzzyClock/
├── FuzzyClock.csproj
├── App.xaml / App.xaml.cs
├── MainWindow.xaml / MainWindow.xaml.cs
└── PhraseEngine.cs
```

### Critical Pitfalls

1. **Three-way transparency dependency** — `WindowStyle=None`, `AllowsTransparency=True`, and `Background=Transparent` must ALL be set in XAML before the window is shown; any one missing causes either a solid white rectangle or a runtime `InvalidOperationException`. Never attempt to change these at runtime.

2. **ClearType disabled on transparent windows** — WPF falls back to greyscale anti-aliasing on layered windows; text at small sizes appears blurry. Mitigate with larger/bolder fonts, `TextOptions.TextRenderingMode="Grayscale"` for consistent rendering, and high-contrast foreground colors. Test on the actual transparent background early.

3. **DispatcherTimer drift** — a fixed 5-minute interval from app launch will drift and display wrong phrases. Always derive the phrase from `DateTime.Now` on each tick; use a 30-second interval or compute exact time until next 5-minute boundary.

4. **Hit-testing fails on fully transparent pixels** — mouse events do not fire on alpha=0 areas; `DragMove()` only fires over visible content. Fix: use `Background="#01000000"` (1/255 alpha, invisible but hit-testable) on the root `Grid`.

5. **No close mechanism** — `WindowStyle=None` removes Alt+F4 and the system menu. Add a right-click `ContextMenu` with a "Close" item or handle `Key.F4`/`Key.Escape` in `KeyDown`.

## Implications for Roadmap

Based on research, the build has a clear dependency chain that naturally suggests three phases: phrase logic first (testable in isolation), window shell second (verify transparency constraints before adding logic), then integration and polish. A fourth phase for persistence and startup makes sense as a distinct concern.

### Phase 1: Phrase Engine — Core Logic

**Rationale:** `PhraseEngine` has zero dependencies on WPF or any external library. It is the core value of the product and the easiest component to get wrong (edge cases: noon, midnight, :00 boundary, "almost" vs "o'clock" at :58–:59). Build and test it first in complete isolation before any UI exists.
**Delivers:** A verified `PhraseEngine.TimeToPhrase(DateTime)` method with full coverage of all 12 buckets, noon, midnight, and boundary edge cases.
**Addresses:** Phrase bucket engine (table stakes), correct noon/midnight handling, poetic vocabulary (differentiator).
**Avoids:** Undetected phrase logic bugs that would be hard to isolate once wired to the UI.
**Research flag:** Standard patterns — phrase bucket logic is simple switch/if logic; no deeper research needed.

### Phase 2: Transparent Window Shell

**Rationale:** The WPF transparency configuration has hard constraints that fail with runtime exceptions if properties are set incorrectly or in the wrong order. Verify the transparent frameless always-on-top window works correctly — showing just a test string — before adding `PhraseEngine` or timer logic on top. This isolates WPF setup failures from logic failures.
**Delivers:** A working transparent, frameless, always-on-top WPF window with `DragMove` and a right-click "Close" menu. `ShowInTaskbar=False`. Single-instance `Mutex`.
**Addresses:** Always-visible overlay (table stakes), draggable positioning (table stakes), no close mechanism (Pitfall 10), taskbar entry (Pitfall 11), multiple instances (Pitfall 7).
**Avoids:** Three-way transparency dependency failure (Pitfall 1), hit-testing on transparent pixels (Pitfall 5).
**Research flag:** Standard patterns — all WPF properties verified against official docs at HIGH confidence; no additional research needed.

### Phase 3: Integration and Text Legibility

**Rationale:** Wire `PhraseEngine` into `MainWindow` via `DispatcherTimer`, then address text legibility. These belong together because legibility decisions (font size, weight, rendering mode, background trick) depend on seeing the actual phrase text rendered on the transparent window.
**Delivers:** A fully working widget that displays the correct fuzzy time phrase, updates every 30 seconds, and is legible on a variety of desktop wallpapers.
**Addresses:** Phrase updates at 5-minute boundaries (table stakes), readable typography (table stakes).
**Avoids:** DispatcherTimer drift (Pitfall 4), ClearType degradation (Pitfall 2), software rendering cost from bitmap effects (Pitfall 3).
**Research flag:** Standard patterns — `DispatcherTimer` and `TextBlock` styling are well-documented; the 30-second interval strategy is the established mitigation for drift.

### Phase 4: Persistence and Startup

**Rationale:** Position persistence and Windows startup are both moderate-complexity additions that require OS integration (settings storage and registry/startup folder). They are correctness-independent of the widget's core function, so deferring them keeps Phase 3 focused. However, they are important enough that users will miss them immediately — treat as Phase 4, not v2.
**Delivers:** Widget remembers its screen position across sessions. Validates saved position against screen bounds on startup (handles DPI changes and monitor configuration changes). Optionally launches with Windows.
**Addresses:** Position persistence (Pitfall 9), off-screen after DPI change (Pitfall 6).
**Avoids:** Widget always resetting to default position (Pitfall 9), widget appearing off-screen after display reconfiguration (Pitfall 6).
**Research flag:** Standard patterns — `Properties.Settings.Default` for position persistence is well-documented; registry run key for startup is standard Windows pattern.

### Phase Ordering Rationale

- `PhraseEngine` before window: logic has no dependencies; the window setup can fail at runtime in non-obvious ways. Validate the testable core before introducing the harder-to-debug WPF layer.
- Window shell before integration: isolates the three-way transparency constraint failures from phrase logic. A white rectangle failure is obvious and easy to fix when the window is the only thing being built.
- Legibility in Phase 3 not Phase 2: font/size/rendering decisions require seeing actual phrase text on the transparent background; premature decisions get undone.
- Persistence in Phase 4: functionally independent from the core widget; user-facing polish that does not affect phrase correctness or display.

### Research Flags

Phases with well-documented patterns (skip research-phase):
- **Phase 1:** Pure C# logic, no external dependencies; standard switch/mapping code.
- **Phase 2:** All WPF window properties verified at HIGH confidence against official Microsoft docs.
- **Phase 3:** `DispatcherTimer` behavior and `TextBlock` styling are thoroughly documented.
- **Phase 4:** `Properties.Settings.Default` and registry startup key are established Windows patterns.

No phases require `/gsd:research-phase` — the full stack is .NET/WPF which is well-documented and the entire architecture is deterministic from research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All properties and API behavior verified against official Microsoft docs (learn.microsoft.com). .NET 10 LTS status confirmed. |
| Features | HIGH (vocabulary) / MEDIUM (competitive) | Natural English time phrase vocabulary is stable and validated against project examples. Competitive feature sets (macOS Fuzzy Clock, KDE, GNOME) are training-data knowledge without live verification. |
| Architecture | HIGH | All architectural patterns (DispatcherTimer on UI thread, AllowsTransparency constraints, DragMove behavior) verified against official docs. |
| Pitfalls | HIGH | All 5 critical pitfalls verified against official Microsoft documentation with direct links. |

**Overall confidence:** HIGH

### Gaps to Address

- **Competitive feature sets:** The macOS Fuzzy Clock, KDE, and GNOME widget feature descriptions are training-data knowledge (MEDIUM confidence). This does not affect implementation — it only affects understanding of what the competitive landscape offers. Validate against current app store listings if competitive differentiation matters.
- **Window position on multi-monitor setups:** The research covers DPI scaling and screen bounds validation, but multi-monitor `Left`/`Top` coordinate behavior across different Windows versions is noted as potentially surprising. Validate position persistence on a multi-monitor configuration during Phase 4 implementation.
- **`SizeToContent="WidthAndHeight"` with long phrases:** The longest poetic phrases (e.g., "just a little after twenty-five past") are significantly longer than short phrases ("noon"). The window auto-sizing behavior at the chosen font size should be verified early in Phase 3 to ensure no phrases are clipped or produce awkward window dimensions.

## Sources

### Primary (HIGH confidence)
- `Window.AllowsTransparency` official docs — https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.allowstransparency
- `Window.Topmost` official docs — https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.topmost
- `Window.WindowStyle` official docs — https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.windowstyle
- `Window.DragMove` official docs — https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.dragmove
- `DispatcherTimer` official docs — https://learn.microsoft.com/en-us/dotnet/api/system.windows.threading.dispatchertimer
- WPF Windows Overview — https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/
- What's new in WPF for .NET 10 — https://learn.microsoft.com/en-us/dotnet/desktop/wpf/whats-new/net100
- .NET Support Policy — https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core
- ClearType Overview (WPF) — https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/cleartype-overview
- Graphics Rendering Tiers — https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/graphics-rendering-tiers
- High DPI Desktop Application Development — https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows
- WPF Graphics Rendering Overview — https://learn.microsoft.com/en-us/dotnet/desktop/wpf/graphics-multimedia/wpf-graphics-rendering-overview
- Project context: `C:/src/gsd1/.planning/PROJECT.md`

### Secondary (MEDIUM confidence)
- macOS Fuzzy Clock feature set — training data; apps may have changed since knowledge cutoff
- KDE Plasma fuzzy-clock applet behavior — training data from open-source codebase knowledge
- GNOME fuzzy clock extension — training data

---
*Research completed: 2026-02-25*
*Ready for roadmap: yes*
