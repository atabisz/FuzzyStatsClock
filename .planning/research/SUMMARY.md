# Project Research Summary

**Project:** FuzzyClock v2.0 — Color Themes and Opacity Control
**Domain:** WPF transparent frameless desktop overlay widget (additive milestone)
**Researched:** 2026-02-27
**Confidence:** HIGH

## Executive Summary

FuzzyClock v2.0 is a well-scoped additive milestone on top of a validated, stable v1.9 codebase. The two features — accent color theming and widget opacity control — are implemented entirely through WPF's existing APIs (`SolidColorBrush`, `UIElement.Opacity`, `MouseWheelEventArgs`) plus one csproj-level change (`UseWindowsForms=true`) to enable the native Win32 color picker. No new NuGet packages are required. All stack additions live in `PresentationCore.dll` (already a dependency) or in the `Microsoft.WindowsDesktop.App` runtime that any WPF project already references. The recommended approach is to build in four sequential steps — AppSettings schema first, then opacity, then accent color presets, then the custom color picker — each independently verifiable before the next begins.

The architecture is minimal and deliberate. Only three files change: `AppSettings.cs` (two new fields), `MainWindow.xaml` (two new submenus), and `MainWindow.xaml.cs` (new fields, one new method, extended lifecycle hooks). The existing code-behind pattern — no MVVM, no data binding, direct property assignment from event handlers — is the correct and consistent approach for this widget. The central implementation decision is the `ApplyTheme()` helper method, which must cover all 14+ accent-colored elements in a single call used at both startup and runtime. Missing even one element produces a visible inconsistency that users will immediately notice.

The top risks for this milestone are well-understood and preventable. The ordering constraint in `ContentRendered` (decoration lists must be populated before `ApplyTheme()` is called) is the most subtle correctness issue. The `PreviewMouseWheel` vs `MouseWheel` choice and the `ColorDialog` HWND owner requirement are the two implementation-level traps most likely to cause regressions in production that do not manifest in the debugger. With these three issues addressed up front, the milestone is low-risk and can be implemented confidently in order.

---

## Key Findings

### Recommended Stack

v2.0 requires one csproj property change and zero new NuGet packages. All APIs are in-box on `net10.0-windows`. The only addition to `FuzzyClock.App.csproj` is `<UseWindowsForms>true</UseWindowsForms>`, which unlocks `System.Windows.Forms.ColorDialog` without adding any package reference.

**Core technologies added:**
- `System.Windows.Media.SolidColorBrush(Color)` — paints all accent-colored elements; existing code already constructs these directly; one new `ApplyTheme()` call covers all 14+ elements — already in `PresentationCore.dll`
- `UIElement.Opacity` (on Window) — single property assignment fades the entire layered HWND including all child content; range 0.0–1.0; minimum enforced at 0.10 for scroll wheel, 0.25 as lowest menu preset — already in `PresentationCore.dll`
- `PreviewMouseWheel` event + `MouseWheelEventArgs.Delta` — scroll wheel opacity adjustment; `PreviewMouseWheel` (not `MouseWheel`) is required on frameless transparent windows to fire without prior focus — already in `PresentationCore.dll`
- `System.Windows.Forms.ColorDialog` — native Win32 `ChooseColor` dialog; zero implementation cost; requires `UseWindowsForms=true` and an HWND owner wrapper via `WindowInteropHelper` — in `System.Windows.Forms.dll`, unlocked by csproj flag
- `System.Windows.Media.ColorConverter.ConvertFromString()` — parses `#RRGGBB`/`#AARRGGBB` hex strings at settings load time; wrap in try/catch and fall back to white — already in `PresentationCore.dll`

**AppSettings schema additions (two fields only):**
- `public string AccentColor { get; init; } = "#FFFFFFFF"` — hex string, not Color struct (`System.Text.Json` cannot natively serialize the WPF Color struct without a custom converter)
- `public double Opacity { get; init; } = 1.0` — double type default is 0.0; the init default of 1.0 is essential for backward compat with v1.9 settings files

See `.planning/research/STACK.md` for full API detail, preset color values table, alternatives considered, and version compatibility matrix.

### Expected Features

All eight v2.0 features are table stakes for a color/opacity feature in a desktop widget. None are optional. The complexity across all eight is LOW to LOW-MEDIUM — this is a shallow, wide implementation rather than a deep architectural change.

**Must have (table stakes — all v2.0):**
- `THEME-01` — 5 named preset color themes (White, Amber, Ice Blue, Green, Hello Kitty Pink) in right-click "Theme" submenu; active preset shown as checkmarked
- `THEME-02` — "Custom Color..." entry in Theme submenu opens system color picker dialog; custom color persists across restarts
- `THEME-03` — Accent color applies immediately and consistently to all accent-colored elements: phrase text, dial hands, dial decorations (ticks/dots/numbers), all stats bars, all stats percentage text
- `THEME-04` — Theme selection persists to `settings.json` as a hex string and restores on launch
- `OPAC-01` — 25%/50%/75%/100% opacity presets in right-click "Opacity" submenu; active value shown as checkmarked
- `OPAC-02` — Scroll wheel adjusts opacity in 10% increments; minimum 10% (never fully invisible); opacity change persists
- `OPAC-03` — Opacity applies to the entire window via `Window.Opacity`
- `OPAC-04` — Opacity setting persists to `settings.json` and restores on launch

**Behavioral expectations (unstated but immediately noticed if wrong):**
- Color and opacity changes are instant with no animation
- Bar track (`#40FFFFFF`) stays neutral white; only fill bars get accent color
- Shadow text (`ShadowText`) always remains dark (`#BB000000`); it must never receive the accent color
- Checkmarks in both submenus follow the existing `ContextMenu_Opened` sync pattern (same as Font Size and Update Interval)
- Theme submenu is not mode-conditional; it appears in both phrase mode and dial mode (unlike Font Size which hides in dial mode)

**Explicitly deferred (not in v2.0):**
- Per-element color overrides
- Live preview while dragging the color picker
- Opacity below 10%
- Smooth opacity animation or easing
- System accent color sync
- Settings screen or second window

See `.planning/research/FEATURES.md` for full dependency map, anti-feature analysis, and complexity breakdown per component.

### Architecture Approach

v2.0 is an additive change to three files. The architectural pattern is: two new private fields (`_accentColor: Color`, `_windowOpacity: double`), one new helper method (`ApplyTheme()`), and targeted extensions to four existing lifecycle methods (`ApplySettings`, `ContentRendered`, `SaveSettings`, `ContextMenu_Opened`). No components are added; no existing components are restructured; `SettingsService.cs`, `App.xaml.cs`, `StatsService.cs`, and `FuzzyClock.Core` are unchanged.

**Major components and their v2.0 changes:**
1. `AppSettings.cs` — two new init-property fields; backward-compatible via init defaults + load-time guards
2. `MainWindow.xaml` — two new submenus (Theme with 6 items, Opacity with 4 items); `PreviewMouseWheel` event wired on Window element
3. `MainWindow.xaml.cs` — `ApplyTheme()` covers 14+ elements; `Window_PreviewMouseWheel` handler; 9 preset click handlers; `SetOpacity()` helper; extensions to `ApplySettings`, `ContentRendered`, `SaveSettings`, `ContextMenu_Opened`

**Critical ordering constraint in `ContentRendered`:**

The startup sequence must be: `UpdateDialDisplay()` → `InitDialDecorations()` → `ApplyTheme()`. The decoration element lists (`_hourTickElements`, `_minuteDotElements`, `_hourNumberElements`) are empty until `InitDialDecorations()` runs. `ApplySettings()` (called before `Show()`) must only set `_accentColor` from the parsed hex string — it must NOT call `ApplyTheme()`. Calling `ApplyTheme()` from `ApplySettings()` silently skips all dial decoration elements at startup, producing white decorations even when a non-white theme was saved.

**Theme checkmark sync pattern:** Drive `IsChecked` from the `_accentColor` field in `ContextMenu_Opened()` by hex-string comparison against the five preset constants. Do not maintain a separate `_currentThemeName` field — that introduces secondary state that can diverge from `_accentColor`.

See `.planning/research/ARCHITECTURE.md` for complete method signatures, full data flow diagrams, XAML structures, and five annotated anti-patterns.

### Critical Pitfalls

1. **Window.Opacity multiplies with AllowsTransparency per-pixel alpha** — `Window.Opacity = 0.25` takes the hover backdrop from 35% effective alpha to ~9%, and risks degrading the `#01000000` hit-test sentinel. Test right-click and drag at every opacity preset. Minimum preset is 25%; scroll wheel floor is 10% but below 25% is a documented degradation zone.

2. **PreviewMouseWheel required, not MouseWheel** — `MouseWheel` (bubbling) is silently dropped on frameless transparent windows when the widget does not have keyboard focus. Use `PreviewMouseWheel` (tunneling at Window level). Set `e.Handled = true` to prevent scroll leaking to windows below. This is a production regression that typically does not appear in debugger sessions.

3. **ApplyTheme() must not be called from ApplySettings()** — `ApplySettings()` runs before `Show()`, before `InitDialDecorations()` has populated the decoration element lists. Calling `ApplyTheme()` early silently skips all ticks, dots, and number elements. Fix: `ApplySettings()` sets `_accentColor` only; `ContentRendered` calls `ApplyTheme()` after `InitDialDecorations()`.

4. **ColorDialog must have an HWND owner** — Without a `WindowInteropHelper`-based HWND wrapper passed to `ShowDialog()`, the dialog renders behind the `Topmost=True` WPF window. The dialog opens but is inaccessible to the user. Use `new Win32Window(new WindowInteropHelper(this).Handle)` as the owner argument.

5. **AppSettings backward compat: Opacity field defaults to 0.0 without an init default** — C#'s type default for `double` is 0.0. A `settings.json` from v1.9 (missing the Opacity field) produces `Opacity = 0.0` on deserialization, making the widget fully transparent on first launch after upgrade. Declare `public double Opacity { get; init; } = 1.0` and add a load-time guard `if (Opacity <= 0.0) reset to 1.0`.

6. **Static brushes from Brushes class are frozen and cannot be mutated** — `Brushes.White` and similar static instances from `System.Windows.Media.Brushes` are pre-frozen `SolidColorBrush` objects. Attempting to set `.Color` on them throws `InvalidOperationException`. Always use `new SolidColorBrush(_accentColor)` — never store a `Brushes.*` reference and try to mutate it.

See `.planning/research/PITFALLS.md` for 10 pitfalls with code examples, detection symptoms, and the complete "looks done but isn't" verification checklist (13 items).

---

## Implications for Roadmap

Based on combined research, the build order is established by two hard dependencies: AppSettings schema must be stable before any field is read or written; and `ApplyTheme()` must be validated on preset colors before the custom color picker adds WinForms interop complexity. The suggested phase structure is four phases, totaling roughly 8 development features across them.

### Phase 1: AppSettings Schema Extension

**Rationale:** All other phases read from or write to `AppSettings`. The schema must be locked first. This phase has zero UI surface and is fully testable in isolation via round-trip JSON tests.
**Delivers:** `AccentColor` (string, hex, default `#FFFFFFFF`) and `Opacity` (double, default `1.0`) fields in `AppSettings`; updated `SettingsService.Defaults()`; load-time guards for both fields in `SettingsService.Load()`; verified backward compat with a v1.9 `settings.json` (fields absent, defaults applied).
**Addresses:** THEME-04 (partial persistence infrastructure), OPAC-04 (partial persistence infrastructure)
**Avoids:** Pitfall 5 (Opacity=0 invisible widget on upgrade), null AccentColor NullReferenceException on parse

### Phase 2: Window Opacity — Presets and Scroll Wheel

**Rationale:** Opacity is the simpler of the two features (no element enumeration, no color parsing — just a single `this.Opacity` double assignment). Validating the `ApplySettings`/`SaveSettings` extension pattern and the `PreviewMouseWheel` event plumbing on this simpler feature before the more complex accent color wiring reduces risk and establishes patterns that Phase 3 reuses.
**Delivers:** Opacity submenu (25/50/75/100%); `Window_PreviewMouseWheel` scroll handler with 10% step and 0.10 floor; `SetOpacity()` helper; `_windowOpacity` field; opacity applied from `ApplySettings()`; opacity persisted in `SaveSettings()`; checkmarks synced in `ContextMenu_Opened()`; all four presets tested including right-click and drag verification at 25%.
**Addresses:** OPAC-01, OPAC-02, OPAC-03, OPAC-04
**Avoids:** Pitfall 1 (Window.Opacity/AllowsTransparency multiplication — test at every preset), Pitfall 2 (use `PreviewMouseWheel`, not `MouseWheel`)

### Phase 3: Accent Color — Preset Themes

**Rationale:** Preset color selection validates `ApplyTheme()` across all 14+ elements and the complete startup ordering constraint before the custom picker adds WinForms interop. Each preset is one click handler; the infrastructure is identical for all five. Verifying that all elements update consistently (including dial decorations, stats bars, and stats text) is the highest-complexity task in the milestone.
**Delivers:** `ApplyTheme()` covering PhraseText, HourHand, MinuteHand, all three decoration element lists (`_hourTickElements`, `_minuteDotElements`, `_hourNumberElements`), all four stats bars (`CpuBar`/`GpuBar`/`MemBar`/`PagBar`) and percentage TextBlocks; Theme submenu with 5 named presets (no Custom yet); `_accentColor` field; accent parsed and stored from `ApplySettings()`; `ApplyTheme()` called in `ContentRendered` after `InitDialDecorations()`; accent persisted as `#RRGGBB` hex in `SaveSettings()`; checkmarks synced in `ContextMenu_Opened()` via hex comparison; bar tracks and ShadowText confirmed excluded from accent application.
**Addresses:** THEME-01, THEME-03, THEME-04
**Avoids:** Pitfall 3 (ContentRendered ordering — must call ApplyTheme() after InitDialDecorations()), Pitfall 4 (frozen brush mutation — always use `new SolidColorBrush(_accentColor)`), Pitfall 6 (missing dial decoration elements in ApplyTheme())

### Phase 4: Custom Color Picker

**Rationale:** WinForms interop is an independent dependency (one csproj flag, one helper class, one dialog call). Building it last keeps the three prior phases free of the WinForms reference and isolates any interop issues to this phase alone.
**Delivers:** `<UseWindowsForms>true</UseWindowsForms>` in csproj; `Win32Window : IWin32Window` helper class; `MenuThemeCustom_Click` using `System.Windows.Forms.ColorDialog` with HWND owner via `WindowInteropHelper`; explicit `System.Drawing.Color` to `System.Windows.Media.Color.FromArgb(A,R,G,B)` conversion; custom color persists as hex in `settings.json`; no preset checkmark appears when a custom color is active.
**Addresses:** THEME-02
**Avoids:** Pitfall 3 (ColorDialog behind Topmost window — HWND owner required), Pitfall 9 (System.Drawing.Color not converted to System.Windows.Media.Color)

### Phase Ordering Rationale

- AppSettings first because both runtime phases (opacity and color) read and write it — no feature can be tested without the schema in place, and the backward-compat guards must exist before any field is ever read.
- Opacity before accent color because it exercises the same extension points (ApplySettings, SaveSettings, ContextMenu_Opened, a new event handler) with lower complexity, validating the pattern before color wiring adds element enumeration and the startup ordering constraint.
- Accent color presets before custom picker because five preset click handlers validate `ApplyTheme()` exhaustively; the custom picker merely supplies a user-chosen color to the same `ApplyTheme()` call.
- This order matches the "Suggested Build Order" in ARCHITECTURE.md (Steps 1–4), which was derived from the same dependency analysis independently.

### Research Flags

All four phases have HIGH-confidence, working code examples already in the research files. No phase requires `/gsd:research-phase`.

Phases with standard, well-documented patterns:
- **Phase 1 (AppSettings):** Init-property record + `System.Text.Json` is established in this project since v1.1; pattern fully validated by prior milestones.
- **Phase 2 (Opacity):** `UIElement.Opacity` and `PreviewMouseWheel` are both confirmed in official docs; the `PreviewMouseWheel` pitfall is already documented with working mitigation code.
- **Phase 3 (Color presets):** `SolidColorBrush`, `ColorConverter`, and the element assignment pattern are all documented in ARCHITECTURE.md with a complete `ApplyTheme()` method body ready for implementation.
- **Phase 4 (Custom picker):** `WindowInteropHelper` + `IWin32Window` adapter pattern and `ColorDialog` setup are fully specified in PITFALLS.md with a working code example.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All APIs confirmed in official windowsdesktop-10.0 and net-10.0 docs; no NuGet unknowns; one LOW-confidence item is the preset color RGB aesthetic values (author-specified, not API facts) |
| Features | HIGH | Based on first-party codebase inspection + official WPF docs; all 8 v2.0 features are precisely scoped with dependency maps; no feature ambiguity |
| Architecture | HIGH | Complete method signatures, data flow diagrams, and startup ordering constraint rigorously analyzed; five anti-patterns documented with explanations; XAML structure specified |
| Pitfalls | HIGH | 10 pitfalls (6 critical, 4 moderate) documented; all critical ones have working mitigation code; sources are official docs or first-party codebase review |

**Overall confidence: HIGH**

### Gaps to Address

- **Preset color hex values are inconsistent across research files** — STACK.md, FEATURES.md, and ARCHITECTURE.md list slightly different hex values for the five presets (e.g., Ice Blue is `#FF99D9EA` in STACK.md but `#FF00BFFF` in FEATURES.md). These are aesthetic choices with no single authoritative value. Recommendation: treat FEATURES.md as the design authority for preset colors and use its values in implementation. Settle on the canonical set before coding Phase 3.

- **Opacity floor: 0.10 (scroll) vs 0.25 (preset menu)** — FEATURES.md and STACK.md specify `Math.Clamp(..., 0.10, 1.0)` for scroll wheel, while PITFALLS.md warns that hit-test reliability degrades below 0.25 and recommends 0.25 as the practical minimum for menu presets. This is internally consistent on close reading (scroll floor = 0.10 with a documented caveat; menu floor = 0.25) but should be made explicit in Phase 2 acceptance criteria to prevent confusion.

- **Stats label text coloring (CPU/GPU/MEM/PAG row labels)** — ARCHITECTURE.md notes this as an open design decision: "Row label text (CPU/GPU/MEM/PAG) can stay white or follow accent." The `ApplyTheme()` method body in ARCHITECTURE.md leaves row labels white. This should be confirmed as a deliberate design choice before Phase 3 implementation begins.

---

## Sources

### Primary (HIGH confidence)
- `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml` and `MainWindow.xaml.cs` — first-party codebase, inspected 2026-02-27
- `C:/src/FuzzyStatsClock/FuzzyClock.App/AppSettings.cs` — first-party codebase, inspected 2026-02-27
- https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.color?view=windowsdesktop-10.0 — `Color.FromArgb`, `FromRgb`, A/R/G/B properties, `PresentationCore.dll`
- https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.solidcolorbrush?view=windowsdesktop-10.0 — `SolidColorBrush(Color)` constructor, `IsFrozen`, `Freeze()`
- https://learn.microsoft.com/en-us/dotnet/api/system.windows.uielement.opacity?view=windowsdesktop-10.0 — range 0.0–1.0, AllowsTransparency interaction, input delivery at opacity=0
- https://learn.microsoft.com/en-us/dotnet/api/system.windows.input.mousewheeleventargs?view=windowsdesktop-10.0 — `Delta`, sign convention (positive = scroll up)
- https://learn.microsoft.com/en-us/dotnet/api/system.windows.input.mouse.mousewheeldeltaforoneline?view=windowsdesktop-10.0 — `const int = 120`
- https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.colordialog?view=windowsdesktop-10.0 — `ShowDialog(IWin32Window)`, `Color` property, `AllowFullOpen`, `System.Windows.Forms.dll`
- https://learn.microsoft.com/en-us/dotnet/api/system.drawing.color?view=net-10.0 — A/R/G/B byte properties, `System.Drawing.Primitives.dll`
- https://learn.microsoft.com/en-us/dotnet/core/project-sdk/msbuild-props-desktop — `UseWindowsForms=true` + `UseWPF=true` coexistence in same project
- https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/freezable-objects-overview — `Freeze()`, `InvalidOperationException` on frozen brush mutation, `Brushes.*` static instances are pre-frozen
- https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.allowstransparency — `LWA_ALPHA` layered window interaction with per-pixel alpha
- https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/how-to-open-common-system-dialog-box — WPF has no built-in color picker dialog

### Secondary (MEDIUM confidence)
- `System.Text.Json` init-property record deserialization with absent fields defaulting to init values — inferred from existing `AppSettings.cs` pattern validated across v1.1–v1.9; consistent with prior project behavior
- `PreviewMouseWheel` vs `MouseWheel` on frameless transparent windows — inferred from WPF routed events tunneling/bubbling model; specific frameless window focus behavior confirmed from existing `MouseEnter`/`MouseLeave` wiring pattern in the codebase (ContentRendered wire-up pattern)

---
*Research completed: 2026-02-27*
*Ready for roadmap: yes*
