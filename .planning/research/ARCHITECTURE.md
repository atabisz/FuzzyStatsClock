# Architecture Research

**Domain:** WPF desktop widget — v3.2 feature integration
**Researched:** 2026-03-08
**Confidence:** HIGH (all claims derived from direct source reading of current codebase)

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         FuzzyClock.App (UI layer)                    │
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  MainWindow.xaml.cs  │  │  SettingsWindow  │  │ TrayMenuBuilder│  │
│  │    (~1300 lines)     │  │  (v3.2 — new)    │  │ (WinForms tray)│  │
│  └──────────┬───────────┘  └────────┬─────────┘  └───────┬────────┘  │
│             │  ApplySettings()      │ SettingsChanged     │           │
│             │  SaveSettings()       │ event               │ callbacks │
│             └──────────────────────┴─────────────────────┘           │
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
│  │ (v3.2: locale│ │(static,pure) │ │(WCAG math)     │ │metry      │  │
│  │  dispatch)   │ │              │ │                │ │           │  │
│  └──────────────┘ └──────────────┘ └────────────────┘ └───────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│                        Persistence layer                             │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  SettingsService  (Load / Save / Validate / Defaults)        │    │
│  │  AppSettings record (flat init-property JSON record)         │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Notes |
|-----------|----------------|-------|
| `MainWindow` | All WPF UI state, timers, display update methods, color application | ~1300 lines; single-owner of all live state |
| `AppSettings` | Flat init-property record; single source of persisted truth | Never positional; JSON forward-compat pattern |
| `SettingsService` | Load/Save/Validate/Defaults; atomic JSON write via `.tmp` rename | Pure static; no WPF types |
| `TrayMenuBuilder` | Builds WinForms `NotifyIcon` + `ContextMenuStrip`; syncs checkmarks on `Opening` | All callbacks must `Dispatcher.Invoke` before touching WPF |
| `PhraseEngine` | Pure static phrase generation and structured decomposition | Currently English-only; v3.2 needs locale dispatch |
| `ContrastRefreshController` | 500ms sampling timer; fires `ColorChanged`/`Cleared` events | Wired to `ApplyDisplayColor` / `ApplyTheme` in ContentRendered |
| `SettingsWindow` | v3.2 new — WPF Window for settings UI | Must not own live state; reflects and propagates to MainWindow |

---

## Recommended Project Structure

```
FuzzyClock.App/
├── MainWindow.xaml(.cs)         # unchanged owner of all timers and UI state
├── SettingsWindow.xaml(.cs)     # NEW — second WPF Window; Owner=MainWindow
├── AppSettings.cs               # add new fields: Theme, PhraseLocale, BatteryAlertPercent, etc.
├── SettingsService.cs           # add Validate guards and Defaults for new fields
├── TrayMenuBuilder.cs           # add "Open Settings..." menu item + OpenSettings callback
├── StatsService.cs              # unchanged
├── MonitorService.cs            # unchanged
├── ContrastRefreshController.cs # unchanged
├── GhostModeController.cs       # unchanged

FuzzyClock.Core/
├── PhraseEngine.cs              # refactor: static dispatcher calling IPhraseProvider
├── IPhraseProvider.cs           # NEW interface: GetPhrase + GetStructuredPhrase
├── EnglishPhraseProvider.cs     # NEW: current bucket table moved here verbatim
├── FrenchPhraseProvider.cs      # example of additional locale (add as needed)
├── DateFormatter.cs             # unchanged
├── ContrastService.cs           # unchanged
├── DialGeometry.cs              # unchanged
├── UptimeFormatter.cs           # unchanged
```

### Structure Rationale

- **`SettingsWindow` in FuzzyClock.App:** WPF Window requires `net10.0-windows`; Core must stay WPF-free for test isolation.
- **`IPhraseProvider` + `*PhraseProvider` in Core:** Keeps Core's public API stable (`PhraseEngine.GetPhrase` stays the entry point) while isolating each language as its own class. No runtime file I/O.
- **`AppSettings.cs` additions:** The init-property record pattern (never positional, all fields optional for JSON compat) must be continued for each new setting.

---

## Architectural Patterns

### Pattern 1: Settings Window as Owner-Child with Event Notification

**What:** `SettingsWindow` is opened from a tray callback. `Owner = mainWindowInstance` is set before `Show()`. SettingsWindow does not own an `AppSettings` copy — it receives the current snapshot at open time and fires `event Action<AppSettings> SettingsChanged` when the user applies a change. MainWindow subscribes and calls `ApplySettings()` + `SaveSettings()`.

**When to use:** Any second WPF Window that needs to modify MainWindow-owned state.

**Trade-offs:**
- Owner relationship ensures SettingsWindow renders in front of the `Topmost=True` overlay on all Windows versions. Without Owner, the settings window can fall behind the always-on-top overlay.
- Event-based notification keeps SettingsWindow ignorant of MainWindow internals. MainWindow remains the single authoritative owner of all live state.
- SettingsWindow must NOT call `SettingsService.Save()` directly.
- Use `Show()` not `ShowDialog()`. `ShowDialog()` runs a nested dispatcher loop and freezes all timers — the overlay phrase, stats, and auto-contrast would all stop updating while settings are open.

**Example:**
```csharp
// In ContentRendered, inside TrayMenuCallbacks initialization:
OpenSettings = () => Dispatcher.Invoke(() =>
{
    if (_settingsWindow == null || !_settingsWindow.IsVisible)
    {
        _settingsWindow = new SettingsWindow(_settings);
        _settingsWindow.Owner = this;
        _settingsWindow.SettingsChanged += s =>
        {
            ApplySettings(s);
            SaveSettings();
        };
        _settingsWindow.Show();
    }
    else
    {
        _settingsWindow.Activate();
    }
}),
```

`_settingsWindow` must be a field on MainWindow, not a local variable. The null-or-not-visible guard prevents duplicate windows.

### Pattern 2: IPhraseProvider Interface for Multi-Locale PhraseEngine

**What:** Extract the English bucket table and `HourWords` array into `EnglishPhraseProvider : IPhraseProvider`. `PhraseEngine` becomes a static dispatcher with a module-level `_provider` field, a `SetLocale(string)` method, and unchanged `GetPhrase`/`GetStructuredPhrase` public methods. Call sites in MainWindow are unmodified.

**When to use:** Adding multilingual phrase generation.

**Trade-offs:**
- `PhraseEngine` becomes stateful at module level (holds `_provider`). In unit tests, any test that calls `SetLocale` must restore the default locale afterward (or set locale explicitly before each assertion) to prevent cross-test pollution. This is the tradeoff for leaving call sites unchanged.
- All 51+ existing `PhraseEngine` unit tests continue to pass without modification — the English provider produces identical output to the current static implementation.
- Phrase template strings for non-English locales are embedded as `private static readonly` arrays in their provider class (compiled into the assembly). No runtime file I/O. No resource loading. Keeps Core pure and test-safe.

**Example:**
```csharp
// FuzzyClock.Core/PhraseEngine.cs
public static class PhraseEngine
{
    private static IPhraseProvider _provider = new EnglishPhraseProvider();

    public static void SetLocale(string locale)
        => _provider = locale switch
        {
            "fr" => new FrenchPhraseProvider(),
            _    => new EnglishPhraseProvider()
        };

    public static string GetPhrase(DateTime dt)
        => _provider.GetPhrase(dt);

    public static (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt)
        => _provider.GetStructuredPhrase(dt);
}
```

### Pattern 3: Theme as Named Preset — No ThemeService Class

**What:** A theme is a named color preset stored as a string in `AppSettings`. `ApplyTheme()` in MainWindow already applies `_accentColor` to all UI elements. Adding theme support means: (a) `SetTheme(string)` sets `_accentColor` from the preset palette, and (b) optionally sets a `ContentBorder` background tint. There is no need for a separate `ThemeService`.

**When to use:** When theme scope is limited to color presets. A `ThemeService` would only be justified if themes involved fonts, layout variants, or animation — none of which are planned for v3.2.

**Trade-offs:**
- `ApplyTheme()` already covers all 20+ elements. Adding a background tint adds exactly one line: `ContentBorder.Background = new SolidColorBrush(themeBackground)`.
- `ApplyDisplayColor()` (auto-contrast override path) must also respect the theme background tint — one additional line there too.
- The `SettingsService.Validate()` guard for the `Theme` field follows the existing pattern: `string[] validThemes = { "Default", "Dark", ... }`.

### Pattern 4: Battery Alert as Display-Side State Flag

**What:** `AppSettings.BatteryAlertPercent` (int, default 20) and `AppSettings.BatteryAlertEnabled` (bool, default false). MainWindow adds `_batteryAlertActive` bool field. `UpdateStatsDisplay()` computes and sets this flag on every stats tick. `ApplyTheme()` and `ApplyDisplayColor()` check the flag and override the `BattBar`/`BattText` color if alert is active.

**When to use:** For a visual alert that requires no new timer, service, or event system. The stats timer already calls `UpdateStatsDisplay()` on every tick.

**Trade-offs:**
- Alert color must be hardcoded (not subject to user theme) — a warning red visible regardless of accent. Suggested: `Color.FromRgb(0xFF, 0x44, 0x00)`.
- `ApplyTheme()` and `ApplyDisplayColor()` both need an identical battery-section guard. These methods are already parallel (one covers accent path, one covers auto-contrast path) and both must be kept in sync when new battery logic is added.
- `BatteryAlertEnabled = false` default means no alert on first launch or upgrade — users opt in.

---

## Data Flow

### Settings Change Flow

```
User changes setting
    |
    +-- Via tray menu callback (WinForms thread)
    |       Dispatcher.Invoke(...)
    |
    +-- Via SettingsWindow.SettingsChanged event (WPF thread, already correct)
    |
    v
MainWindow.Set*() or MainWindow.ApplySettings(AppSettings s)
    |
    v
Updates MainWindow private fields (_accentColor, _dialMode, _phraseLocale, etc.)
    |
    v
Calls ApplyTheme() / PhraseEngine.SetLocale() / UpdateStatsDisplay() etc.
    |
    v
SaveSettings()
    --> builds new _settings record with { ... } expression
    --> SettingsService.Save(_settings)
    --> atomic JSON write to %LOCALAPPDATA%\FuzzyClock\settings.json
```

### Color Application Pipeline

```
_accentColor (field on MainWindow)
    |
    +-- ApplyTheme()
    |   Applies accent brush to all 20+ UI elements.
    |   Called when: accent color changes, auto-contrast clears (Cleared event),
    |   SetTextStyle(), ContentRendered (after InitDialDecorations).
    |   Battery section: checks _batteryAlertActive → alert color OR accent brush.
    |
    +-- ApplyDisplayColor(RgbColor)
        Applies computed override color to same 20+ elements.
        Called when: ContrastRefreshController.ColorChanged event fires (500ms tick).
        Battery section: checks _batteryAlertActive → alert color OR override brush.
```

### Battery Alert State Flow

```
_statsTimer.Tick (1s/3s/10s)
    |
    v
UpdateStatsDisplay()
    --> _statsService.Refresh()
    --> reads BatteryPercent, IsPluggedIn
    --> computes: _batteryAlertActive =
            _batteryAlertEnabled &&
            _statsService.BatteryPercent >= 0f &&
            _statsService.BatteryPercent < _batteryAlertPercent &&
            !_statsService.IsPluggedIn
    --> if _batteryAlertActive: applies alert brush to BattBar/BattText directly
    --> else: applies accent brush to BattBar/BattText

Next call to ApplyTheme() or ApplyDisplayColor():
    --> battery section checks _batteryAlertActive flag
    --> if true: skips writing accent/override color to BattBar/BattText
    --> if false: writes accent/override color as normal
```

### Phrase Locale Flow

```
AppSettings.PhraseLocale = "fr"  (loaded from settings.json or set via SettingsWindow)
    |
    v
ApplySettings(s) calls PhraseEngine.SetLocale(s.PhraseLocale)
    |
    v
_timer.Tick (10s) --> UpdatePhraseIfChanged()
    --> PhraseEngine.GetPhrase(DateTime.Now) --> FrenchPhraseProvider.GetPhrase()
    --> PhraseText.Text = French phrase string
```

---

## Integration Points: New vs Modified Components

### (a) Settings Window

**New components:**
- `FuzzyClock.App/SettingsWindow.xaml` — standard WPF Window; NOT AllowsTransparency; NOT Topmost
- `FuzzyClock.App/SettingsWindow.xaml.cs` — constructor accepts `AppSettings` snapshot; exposes `event Action<AppSettings> SettingsChanged`

**Modified components:**
- `MainWindow.xaml.cs`:
  - Add `private SettingsWindow? _settingsWindow` field
  - In ContentRendered, add `OpenSettings` to `TrayMenuCallbacks` struct
  - Subscribe to `_settingsWindow.SettingsChanged` to call `ApplySettings()` + `SaveSettings()`
- `TrayMenuBuilder.cs`:
  - Add "Open Settings..." menu item (first item, before Ghost Mode separator)
  - Add `required Action OpenSettings` to `TrayMenuCallbacks`
- `TrayMenuCallbacks` record — add `required Action OpenSettings { get; init; }`

**Owner relationship:** `_settingsWindow.Owner = this` must be set before `_settingsWindow.Show()`. This ensures the Settings Window renders in front of the `Topmost=True` overlay. Without Owner, the settings window disappears behind the overlay on Windows 10/11.

### (b) PhraseEngine Multi-Locale Refactor

**New components in FuzzyClock.Core:**
- `IPhraseProvider.cs` — interface with `GetPhrase(DateTime)` and `GetStructuredPhrase(DateTime)` methods
- `EnglishPhraseProvider.cs` — current static `Buckets` array, `HourWords` array, and both methods moved verbatim; implements `IPhraseProvider`
- Additional locale classes as needed (e.g. `FrenchPhraseProvider.cs`)

**Modified components:**
- `FuzzyClock.Core/PhraseEngine.cs`:
  - Becomes a static dispatcher
  - Retains `GetPhrase(DateTime)` and `GetStructuredPhrase(DateTime)` as public static methods (call sites in MainWindow unchanged)
  - Adds `public static void SetLocale(string locale)` static method
  - Internal `_provider` field set to `new EnglishPhraseProvider()` by default
- `FuzzyClock.App/MainWindow.xaml.cs`:
  - Add `private string _phraseLocale = "en"` field
  - `ApplySettings(AppSettings s)` calls `PhraseEngine.SetLocale(s.PhraseLocale)` and clears `PhraseText.Text` to force redraw on next tick
  - `SaveSettings()` includes `PhraseLocale = _phraseLocale` in the settings record expression
  - `ResetToDefaults()` resets `_phraseLocale = "en"` and calls `PhraseEngine.SetLocale("en")`
- `FuzzyClock.App/AppSettings.cs` — add `public string PhraseLocale { get; init; } = "en"`
- `FuzzyClock.App/SettingsService.cs` — add PhraseLocale to `Validate()` (allowed values list) and `Defaults()`

**Test impact:** All existing PhraseEngine unit tests use `PhraseEngine.GetPhrase(DateTime)` with implicit default English provider. They remain valid and pass without modification. New locale tests require explicit `PhraseEngine.SetLocale("fr")` calls with teardown restoring `"en"`.

### (c) Theme Logic

**No new ThemeService class.** Theme is an accent color preset applied through the existing `ApplyTheme()` method.

**Modified components:**
- `FuzzyClock.App/AppSettings.cs` — add `public string Theme { get; init; } = "Default"`
- `FuzzyClock.App/SettingsService.cs` — add Theme guard in `Validate()`, add to `Defaults()`
- `FuzzyClock.App/MainWindow.xaml.cs`:
  - Add `private string _theme = "Default"` field
  - `ApplyTheme()` — after applying accent brush to all elements, check `_theme` field; apply the theme's background tint (if any) to `ContentBorder.Background`
  - Add `private void SetTheme(string theme)` — sets `_theme`, derives `_accentColor` from the preset palette, calls `ApplyTheme()`, calls `SaveSettings()`
  - `ResetToDefaults()` — resets `_theme = "Default"`, calls `SetTheme("Default")`
  - `ApplySettings(AppSettings s)` — sets `_theme = s.Theme`
- `TrayMenuBuilder.cs` — new "Theme" submenu in tray menu; new callback `SetTheme` in `TrayMenuCallbacks`
- `TrayMenuCallbacks` record — add `required Action<string> SetTheme { get; init; }`

**No changes to ContrastRefreshController or ContrastService.** Auto-contrast computes a display color from sampled background pixels, independent of theme.

### (d) Battery Alert State Flow

**No new service or class.** Alert state is a display flag on MainWindow.

**Modified components:**
- `FuzzyClock.App/AppSettings.cs`:
  - Add `public int BatteryAlertPercent { get; init; } = 20`
  - Add `public bool BatteryAlertEnabled { get; init; } = false`
- `FuzzyClock.App/SettingsService.cs`:
  - Add `BatteryAlertPercent` guard (clamp to 1–99 or discrete ladder) in `Validate()`
  - Add both fields to `Defaults()`
- `FuzzyClock.App/MainWindow.xaml.cs`:
  - Add `private bool _batteryAlertActive = false` field
  - Add `private bool _batteryAlertEnabled = false` field
  - Add `private int _batteryAlertPercent = 20` field
  - `UpdateStatsDisplay()` — after reading `BatteryPercent`, compute and set `_batteryAlertActive`; apply alert brush to `BattBar.Background` and `BattText.Foreground` when true
  - `ApplyTheme()` — in the battery section (lines ~1097–1116 in current code), check `_batteryAlertActive`: if true, apply `Color.FromRgb(0xFF, 0x44, 0x00)` alert brush; if false, apply accent brush
  - `ApplyDisplayColor(RgbColor)` — same check for `BattBar` and `BattText` elements (lines ~1148–1153 in current code)
  - `ApplySettings(AppSettings s)` — sets `_batteryAlertEnabled = s.BatteryAlertEnabled`, `_batteryAlertPercent = s.BatteryAlertPercent`
  - `SaveSettings()` — includes `BatteryAlertEnabled = _batteryAlertEnabled`, `BatteryAlertPercent = _batteryAlertPercent` in record expression
  - `ResetToDefaults()` — resets `_batteryAlertEnabled = false`, `_batteryAlertPercent = 20`, `_batteryAlertActive = false`

---

## AppSettings Migration Strategy

All new fields are added as `{ get; init; }` init-property declarations with explicit `= defaultValue`. This is the established forward/backward JSON compat pattern. Fields absent in an older `settings.json` deserialize to the C# type default (0/false/""), so:
1. `SettingsService.Defaults()` must use explicit `= value` for all new fields.
2. `SettingsService.Validate()` must guard each new field against invalid values.

Fields to add for v3.2:

```csharp
// AppSettings.cs additions
public string PhraseLocale         { get; init; } = "en";
public string Theme                { get; init; } = "Default";
public int    BatteryAlertPercent  { get; init; } = 20;
public bool   BatteryAlertEnabled  { get; init; } = false;
```

No migration code is needed (unlike the v2.6 `MonitorPositions` migration from flat `Left`/`Top`). All new fields are additive with safe defaults on absent keys.

---

## Build Order Recommendation

Dependencies between v3.2 features determine the safe build order:

| Phase | Feature | Dependencies | Rationale |
|-------|---------|--------------|-----------|
| 1 | `IPhraseProvider` + `EnglishPhraseProvider` extraction | None — pure Core refactor | Highest-risk change (touches Core with 51 unit tests); isolated early so failures are contained; no behavioral changes to MainWindow yet |
| 2 | Settings Window infrastructure | None (uses existing `AppSettings`) | Establishes Owner/event pattern before features need it as a UI surface; can start as a minimal shell that just displays current settings |
| 3 | Theme presets | Settings Window (UI surface for theme picker) | Extends `ApplyTheme()` — must be stable before battery alert adds another branch to the same method |
| 4 | Battery alert | Theme done (`ApplyTheme()` stable); Settings Window available | Adds `_batteryAlertActive` guard to `ApplyTheme()` and `ApplyDisplayColor()` — do after theme to avoid concurrent edits to same methods |
| 5 | Multilingual phrase support | Phase 1 (`IPhraseProvider` done); Phase 2 (Settings Window for locale picker) | Locale providers are additive; no existing code is broken until `SetLocale` is called |

**Ordering rationale:**
- The PhraseEngine refactor is the only change that touches Core and its test suite. Isolating it first means any test regression is immediately attributable.
- Settings Window infrastructure before specific features means the UI surface is ready by the time theme and locale controls are implemented, avoiding a situation where settings live in the tray while partially moved.
- Theme before battery alert because both modify `ApplyTheme()`. Sequential changes to the same method are cleaner than parallel.
- Locale last because `FrenchPhraseProvider` (or other locales) are pure additions with no risk to existing behavior.

---

## Anti-Patterns

### Anti-Pattern 1: SettingsWindow Owns Live State

**What people do:** Give `SettingsWindow` its own `AppSettings` copy, let it call `SettingsService.Save()` directly, have MainWindow poll settings on next tick.

**Why it's wrong:** Creates dual source of truth. MainWindow's private fields (`_accentColor`, `_dialMode`, `_currentTextStyle`, etc.) would be out of sync with what SettingsWindow wrote to disk until the next restart. All 20+ UI elements would display the old values.

**Do this instead:** SettingsWindow fires `SettingsChanged` with a new `AppSettings` snapshot. MainWindow calls `ApplySettings()` then `SaveSettings()` — identical path to tray callbacks.

### Anti-Pattern 2: ShowDialog() for SettingsWindow

**What people do:** `settingsWindow.ShowDialog()` for a modal settings experience.

**Why it's wrong:** `ShowDialog()` runs a nested WPF dispatcher loop on the UI thread. All `DispatcherTimer` ticks stop: phrase does not update, stats freeze, auto-contrast stops sampling. The overlay becomes a frozen screenshot while settings are open.

**Do this instead:** `Show()` (modeless). Guard with `if (_settingsWindow == null || !_settingsWindow.IsVisible)` to prevent duplicate windows.

### Anti-Pattern 3: ThemeService as a Separate Stateful Class

**What people do:** Create a `ThemeService` with its own color dictionaries, inject it into MainWindow, have it fire events when theme changes.

**Why it's wrong:** No DI container, no reactive binding framework. There would be two write paths to the same `TextBlock.Foreground` properties: `ApplyTheme()` and the new `ThemeService`. Race conditions and stale colors are inevitable.

**Do this instead:** Extend `ApplyTheme()`. Add a `_theme` field to MainWindow alongside `_currentTextStyle`. A theme preset is just a named value for `_accentColor` plus an optional `ContentBorder` background tint.

### Anti-Pattern 4: PhraseEngine Loads Phrase Tables from Files at Runtime

**What people do:** Store locale phrase templates in embedded resources or JSON files. Load them in `PhraseEngine.SetLocale()` via `Assembly.GetManifestResourceStream()`.

**Why it's wrong:** `FuzzyClock.Core` is a pure, no-I/O library. Test projects rely on this for deterministic, side-effect-free unit testing. Introducing resource loading adds a failure mode (missing resource, bad manifest path) that does not currently exist. It also forces tests to depend on build artifact layout.

**Do this instead:** Embed phrase templates as `private static readonly` arrays inside the `*PhraseProvider` class. Compiled directly into the assembly — no runtime file I/O, no path resolution, no resource loading.

### Anti-Pattern 5: Modifying BattBar/BattText Color Only in UpdateStatsDisplay

**What people do:** Set the alert color for battery elements only in `UpdateStatsDisplay()`, and not add any guard in `ApplyTheme()` or `ApplyDisplayColor()`.

**Why it's wrong:** `ApplyTheme()` is called when the user changes accent color or the auto-contrast contrast controller fires `Cleared`. Both of these happen independently of the stats timer. Without the `_batteryAlertActive` check in those methods, changing accent color while battery is in alert state would overwrite the alert color with the new accent color.

**Do this instead:** Check `_batteryAlertActive` in both `ApplyTheme()` and `ApplyDisplayColor()` for the battery elements. `UpdateStatsDisplay()` sets the flag; color-application methods respect it.

---

## Scaling Considerations

This is a single-user desktop widget. Scale means code maintainability, not user load.

| Concern | Current state | Threshold | What to do |
|---------|--------------|-----------|------------|
| MainWindow line count | ~1300 lines | ~1800 lines | Extract display helpers to partial class or dedicated DisplayCoordinator |
| AppSettings field count | 20 fields | 35+ fields | Consider grouping into nested records — but that is a breaking JSON change requiring migration code |
| Tray menu item count | ~30 items | ~50 items | Settings Window takes over most settings; tray reduces to: Open Settings / Ghost Mode / Auto-Launch / Reset / Quit |

---

## Sources

All findings derived directly from source code and project documentation, no external verification required.

| Source | What was examined |
|--------|------------------|
| `FuzzyClock.App/MainWindow.xaml.cs` | Full file (~1224 lines): all fields, ApplySettings, SaveSettings, ApplyTheme, ApplyDisplayColor, UpdateStatsDisplay, TrayMenuCallbacks wiring, ContentRendered |
| `FuzzyClock.App/AppSettings.cs` | All 20 init-property fields and their defaults |
| `FuzzyClock.App/SettingsService.cs` | Load/Validate/Save/Defaults; all existing guards |
| `FuzzyClock.App/TrayMenuBuilder.cs` | TrayMenuState, TrayMenuCallbacks, TrayMenuBuilder class |
| `FuzzyClock.App/ContrastRefreshController.cs` | ColorChanged/Cleared event contract; Initialize() signature |
| `FuzzyClock.Core/PhraseEngine.cs` | Full file: static class, Buckets, HourWords, GetPhrase, GetStructuredPhrase |
| `FuzzyClock.Core/ContrastService.cs` | RgbColor struct, ContrastState enum; module boundary |
| `.planning/PROJECT.md` | Architecture decisions, v2.3 ghost mode patterns |
| `.planning/MILESTONES.md` | v2.3–v3.1 implementation notes |

---
*Architecture research for: FuzzyClock v3.2 — Settings Window, themes, battery alert, phrase styles, multilingual*
*Researched: 2026-03-08*
