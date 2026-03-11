# Architecture Research

**Domain:** C# WPF desktop widget — v3.4 Personalities & Nixie feature integration
**Researched:** 2026-03-11
**Confidence:** HIGH (all analysis from direct codebase inspection)

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                     FuzzyClock.App (WPF)                           │
│                                                                     │
│  ┌─────────────────┐  ┌───────────────────┐  ┌───────────────────┐ │
│  │   MainWindow    │  │  SettingsWindow   │  │  TrayMenuBuilder  │ │
│  │  (orchestrator) │  │  (modeless 3-tab) │  │  (WinForms tray)  │ │
│  └────────┬────────┘  └────────┬──────────┘  └────────┬──────────┘ │
│           │  SetClockType()    │ events (Action<T>)    │ callbacks  │
│           │◄───────────────────┴──────────────────────┘            │
│           │                                                         │
│  ┌────────┴──────────────────────────────────────────────────────┐ │
│  │                    Controls/ (UserControls)                    │ │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────────────┐  │ │
│  │  │ DialCanvas  │ │ LcdClockView │ │  NixieClockView (NEW) │  │ │
│  │  │  (XAML el.) │ │ (UserControl)│ │     (UserControl)     │  │ │
│  │  └─────────────┘ └──────────────┘ └───────────────────────┘  │ │
│  │                   SevenSegmentDigit (sub-control)              │ │
│  └───────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────┤
│                     FuzzyClock.Core (pure logic)                    │
│                                                                     │
│  ┌──────────────┐  ┌────────────────────────────────────────────┐  │
│  │ PhraseEngine │  │  IPhraseProvider implementations           │  │
│  │  (static)    │  │  Classic / Terse / Poetic / Rude           │  │
│  │  SetLocale() │  │  + Pirate / Dwarf / Jive / ValleyGirl      │  │
│  │  GetPhrase() │  │  + Yoda / Shakespeare (all NEW)            │  │
│  └──────┬───────┘  └────────────────────────────────────────────┘  │
│         │ locale key "en-pirate" etc.                               │
│  ┌──────┴──────────────────────────────────────────────────────┐   │
│  │  Dictionary<string, IPhraseProvider>  _providers            │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | v3.4 Change |
|-----------|----------------|-------------|
| `ClockType` enum | Identifies which clock face is active | Add `Nixie = 3` |
| `AppSettings` record | Persists all user preferences as init-property record | Add `DialShape` enum property |
| `PhraseEngine` (static) | Locale registry; routes `GetPhrase()` to active provider | Add 6 new locale keys |
| `IPhraseProvider` | Contract: `GetPhrase(DateTime)` + `GetStructuredPhrase(DateTime)` | Unchanged |
| `RudePhraseProvider` | English rude bucket-table provider | Full rewrite (ruder vocabulary) |
| `LcdClockView` | Self-timed UserControl; DependencyProperty-driven colors+size | Unchanged |
| `SevenSegmentDigit` | Per-character canvas renderer with geometry cache | Unchanged |
| `NixieClockView` | NEW: self-timed UserControl; WPF-only Nixie rendering | New component |
| `MainWindow` | Orchestrator; collapse/show clock areas on `SetClockType()` | Add Nixie branch; add DialShape |
| `SettingsWindow` | Modeless event source; fires `Action<T>` per setting change | Add Nixie button; add DialShape selector |
| `TrayMenuBuilder` | WinForms tray menu with Clock Type submenu | Add Nixie menu item |

## Recommended Project Structure

```
FuzzyClock.Core/
├── IPhraseProvider.cs              # unchanged
├── PhraseEngine.cs                 # add 6 new locale keys to _providers dict
├── EnglishPhraseProvider.cs        # unchanged
├── TersePhraseProvider.cs          # unchanged
├── PoeticPhraseProvider.cs         # unchanged
├── RudePhraseProvider.cs           # REWRITE — ruder vocabulary (WTF, dafaq, tf, etc.)
├── PiratePhraseProvider.cs         # NEW
├── DwarfPhraseProvider.cs          # NEW
├── JivePhraseProvider.cs           # NEW
├── ValleyGirlPhraseProvider.cs     # NEW
├── YodaPhraseProvider.cs           # NEW
└── ShakespearePhraseProvider.cs    # NEW

FuzzyClock.App/
├── ClockType.cs                    # add Nixie = 3
├── AppSettings.cs                  # add DialShape property + DialShape enum
├── MainWindow.xaml / .xaml.cs      # add NixieView element; add Nixie to SetClockType switch;
│                                   # add DialShape handling to dial sizing
├── SettingsWindow.xaml / .xaml.cs  # add BtnNixie toggle button; add DialShape radio buttons;
│                                   # DialShapeChanged event; extend SetClockStyleButtonStates()
├── TrayMenuBuilder.cs              # add _nixieClockItem field; add Nixie to Clock Type submenu
└── Controls/
    ├── LcdClockView.xaml / .xaml.cs      # unchanged
    ├── SevenSegmentDigit.xaml / .xaml.cs # unchanged
    └── NixieClockView.xaml / .xaml.cs    # NEW
```

### Structure Rationale

- **New providers stay in `FuzzyClock.Core/` root** alongside existing providers. No `Providers/` subdirectory exists in the current codebase; introducing one for 6 new files adds unnecessary friction. Keep flat.
- **`NixieClockView` in `Controls/`** — matches the pattern established by `LcdClockView` and `SevenSegmentDigit`; a self-contained UserControl that owns its own timer and DependencyProperties.
- **`DialShape` enum in `AppSettings.cs`** — consistent with `LcdSize` enum which also lives in the App project. Does not belong in Core (Core is display-logic-free).

## Architectural Patterns

### Pattern 1: IPhraseProvider Bucket Table

**What:** Each provider holds a static `(int UpperBound, string Template)[]` array. `GetPhrase(DateTime)` walks buckets, returns first match where `dt.Minute <= upperBound`, substitutes `{h}` / `{h1}` with hour words.

**When to use:** All 6 new English personality providers. The contract is small and well-proven across 4 existing providers.

**Trade-offs:** Simple and testable; no runtime allocation beyond string substitution. Personality uniqueness lives entirely in the bucket strings, so vocabulary is easy to review and adjust.

**Locale key convention:**
```csharp
// PhraseEngine._providers dictionary — new entries
["en-pirate"]      = new PiratePhraseProvider(),
["en-dwarf"]       = new DwarfPhraseProvider(),
["en-jive"]        = new JivePhraseProvider(),
["en-valleygirl"]  = new ValleyGirlPhraseProvider(),
["en-yoda"]        = new YodaPhraseProvider(),
["en-shakespeare"] = new ShakespearePhraseProvider(),
```

### Pattern 2: Self-Timed UserControl with IsVisibleChanged Guard

**What:** `LcdClockView` owns a `DispatcherTimer`. The timer starts/stops via `IsVisibleChanged` — it runs only when the control is visible. `UpdateTime()` is public so `MainWindow` can force an immediate refresh.

**When to use:** `NixieClockView` must follow this exact pattern. `MainWindow` sets `NixieView.Visibility = Visible` to activate; `IsVisibleChanged` fires, calls `UpdateTime()` immediately, then starts the timer.

**Trade-offs:** No wasted CPU ticking when the clock face is hidden. The guard also prevents double-start bugs during `ApplySettings` (which runs before `Show()`).

**NixieClockView skeleton:**
```csharp
public partial class NixieClockView : UserControl
{
    private readonly DispatcherTimer _timer;

    public NixieClockView()
    {
        InitializeComponent();
        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _timer.Tick += (_, _) => UpdateTime();
        IsVisibleChanged += OnIsVisibleChanged;
    }

    private void OnIsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if ((bool)e.NewValue) { UpdateTime(); _timer.Start(); }
        else _timer.Stop();
    }

    public void UpdateTime() { /* render current DateTime.Now */ }
}
```

### Pattern 3: ClockType Switch in MainWindow (two locations)

**What:** `SetClockType(ClockType ct)` collapses all display areas, then exposes exactly one based on the enum value. `ApplySettings()` mirrors the same collapse-then-show logic inline (it cannot delegate to `SetClockType` because timers are null before `ContentRendered`).

**When to use:** Adding `ClockType.Nixie` requires changes in two places that must stay in sync:
1. `SetClockType` switch — add `case ClockType.Nixie:` branch.
2. `ApplySettings` inline block — add `else if (s.ClockType == ClockType.Nixie)` branch.

Missing either one causes Nixie to never appear (on startup or on live switch, respectively).

**Trade-offs:** Duplicated logic is known debt, explicitly called out in source comments at lines 230 and 253. The pattern is well-understood; unifying the two paths is deferred work.

### Pattern 4: SettingsWindow as Pure Event Source

**What:** `SettingsWindow` fires strongly-typed `Action<T>` events. It never writes `AppSettings` directly. `MainWindow` subscribes in `OpenSettings()` and calls its own setters (which call `SaveSettings()`).

**When to use:** New settings (DialShape, Nixie clock type) follow this protocol exactly:
- Add `event Action<DialShape>? DialShapeChanged` to `SettingsWindow`.
- Fire it from the radio-button click handler.
- Subscribe in `MainWindow.OpenSettings()`.

## Data Flow

### Clock Type Switch Flow

```
User clicks Nixie button (SettingsWindow or tray)
    |
    v
SettingsWindow.ClockTypeChanged fires  OR  TrayMenuCallbacks.SetClockType invoked
    |
    v
MainWindow.SetClockType(ClockType.Nixie)
    |
    v
Collapse: PhraseText, SplitPhrasePanel, DialCanvas, LcdView, [NixieView if already shown]
Show: NixieView.Visibility = Visible
    |
    v
NixieClockView.IsVisibleChanged -> UpdateTime() -> _timer.Start()
    |
    v
SaveSettings() -> serializes ClockType.Nixie as "Nixie" via JsonStringEnumConverter
```

### Phrase Style Selection Flow (new personalities)

```
User selects "Pirate" in CmbPhraseStyle
    |
    v
SettingsWindow.PhraseStyleChanged fires with "Pirate"
    |
    v
MainWindow.SetPhraseStyle("Pirate")
    |
    v
locale = "en-pirate"
PhraseEngine.SetLocale("en-pirate") -> _activeProvider = PiratePhraseProvider
    |
    v
SaveSettings() -> persists PhraseStyle = "Pirate"
    |
    v
Next timer tick -> UpdatePhraseIfChanged() -> PhraseEngine.GetPhrase(DateTime.Now)
    -> PiratePhraseProvider.GetPhrase(dt) -> bucket-table result
```

### DialShape Flow

```
User selects Oval radio button (SettingsWindow Appearance tab)
    |
    v
SettingsWindow.DialShapeChanged fires with DialShape.Oval
    |
    v
MainWindow stores _dialShape; calls ApplyDialShape()
    |
    v
ApplyDialShape() -> sets DialCanvas Width/Height based on shape + current font size
    |
    v
SaveSettings() -> persists DialShape = "Oval" via JsonStringEnumConverter
```

### Settings Persistence Flow (unchanged mechanism)

```
AppSettings (init-property record)
    ^ deserialized by SettingsService.Load() at startup
    ^ serialized by SettingsService.Save() on every SaveSettings() call
    ^ JsonStringEnumConverter on ClockType and LcdSize
      -> ClockType.Nixie serializes as "Nixie" (no migration needed for new enum values)
```

## Integration Points

### New vs Modified Components

| Component | Status | Files Changed |
|-----------|--------|---------------|
| `RudePhraseProvider` | Modified (rewrite) | `FuzzyClock.Core/RudePhraseProvider.cs` |
| `PiratePhraseProvider` | New | `FuzzyClock.Core/PiratePhraseProvider.cs` |
| `DwarfPhraseProvider` | New | `FuzzyClock.Core/DwarfPhraseProvider.cs` |
| `JivePhraseProvider` | New | `FuzzyClock.Core/JivePhraseProvider.cs` |
| `ValleyGirlPhraseProvider` | New | `FuzzyClock.Core/ValleyGirlPhraseProvider.cs` |
| `YodaPhraseProvider` | New | `FuzzyClock.Core/YodaPhraseProvider.cs` |
| `ShakespearePhraseProvider` | New | `FuzzyClock.Core/ShakespearePhraseProvider.cs` |
| `PhraseEngine` | Modified | `FuzzyClock.Core/PhraseEngine.cs` |
| `ClockType` enum | Modified | `FuzzyClock.App/ClockType.cs` |
| `AppSettings` record | Modified | `FuzzyClock.App/AppSettings.cs` |
| `NixieClockView` | New | `FuzzyClock.App/Controls/NixieClockView.xaml` + `.xaml.cs` |
| `MainWindow` | Modified | `MainWindow.xaml` + `.xaml.cs` |
| `SettingsWindow` | Modified | `SettingsWindow.xaml` + `.xaml.cs` |
| `TrayMenuBuilder` | Modified | `FuzzyClock.App/TrayMenuBuilder.cs` |

### Locale Key Naming Convention

Existing keys: `"en-classic"`, `"en-terse"`, `"en-poetic"`, `"en-rude"`, `"fr"`, `"es"`, `"de"`, `"ja"`, `"pl"`.

New keys follow `"en-{stylename}"` (lowercase, no spaces):

| Provider | Locale Key | PhraseStyle string (persisted) |
|----------|------------|-------------------------------|
| `PiratePhraseProvider` | `"en-pirate"` | `"Pirate"` |
| `DwarfPhraseProvider` | `"en-dwarf"` | `"Dwarf"` |
| `JivePhraseProvider` | `"en-jive"` | `"Jive"` |
| `ValleyGirlPhraseProvider` | `"en-valleygirl"` | `"ValleyGirl"` |
| `YodaPhraseProvider` | `"en-yoda"` | `"Yoda"` |
| `ShakespearePhraseProvider` | `"en-shakespeare"` | `"Shakespeare"` |

### PhraseStyle to Locale Mapping — Two Call Sites

The style-to-locale switch exists in two places in `MainWindow.xaml.cs` and both must be extended identically:

1. `ApplySettings()` (~lines 319-338) — runs at startup from saved settings.
2. `SetPhraseStyle(string style)` — runs on live user change.

```csharp
// Extended switch (both locations):
effectiveLocale = _currentPhraseStyle.ToLowerInvariant() switch
{
    "terse"       => "en-terse",
    "poetic"      => "en-poetic",
    "rude"        => "en-rude",
    "pirate"      => "en-pirate",      // new
    "dwarf"       => "en-dwarf",       // new
    "jive"        => "en-jive",        // new
    "valleygirl"  => "en-valleygirl",  // new
    "yoda"        => "en-yoda",        // new
    "shakespeare" => "en-shakespeare", // new
    _             => "en-classic",
};
```

### CmbPhraseStyle ComboBox Extension

`SettingsWindow.PopulateControls` maps `PhraseStyle` string to `CmbPhraseStyle.SelectedIndex` (currently indices 0–3). New styles append as indices 4–9. The XAML must add 6 new `ComboBoxItem` entries. The `PhraseStyleChanged` event already carries a `string`, so no event signature changes.

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `MainWindow` <-> `SettingsWindow` | `Action<T>` events fired by Settings, consumed by MainWindow | Events declared on SettingsWindow; subscribed in `OpenSettings()` |
| `MainWindow` <-> `NixieClockView` | WPF Visibility + `UpdateTime()` public method | Identical boundary to `LcdClockView` |
| `MainWindow` <-> `PhraseEngine` | Static method calls `PhraseEngine.SetLocale()`, `GetPhrase()` | No change to Core interface |
| `MainWindow` <-> `TrayMenuBuilder` | `TrayMenuCallbacks` struct + `TrayMenuState` record | Add `ClockType.Nixie` to state sync |
| `FuzzyClock.App` <-> `FuzzyClock.Core` | One-way: App calls Core | Core has zero references to App; no circular dependency risk |

## Build Order

Dependencies flow upward; lower layers must compile before higher layers consume them.

```
Layer 1 — Core: New Providers (no dependencies on App)
  1a. RudePhraseProvider.cs       rewrite in-place; existing tests updated
  1b. PiratePhraseProvider.cs     new file
  1c. DwarfPhraseProvider.cs      new file
  1d. JivePhraseProvider.cs       new file
  1e. ValleyGirlPhraseProvider.cs new file
  1f. YodaPhraseProvider.cs       new file
  1g. ShakespearePhraseProvider.cs new file
  1h. PhraseEngine.cs             register all 6 new locale keys in _providers dict

Layer 2 — App: Enum and Settings (no WPF layout dependencies)
  2a. ClockType.cs                add Nixie = 3
  2b. AppSettings.cs              add DialShape enum + [JsonConverter] property

Layer 3 — App: New UserControl (depends on Layer 2 only for ClockType compilation)
  3a. NixieClockView.xaml         XAML structure: digit slots, glow layers, tube borders
  3b. NixieClockView.xaml.cs      timer, DependencyProperties, UpdateTime()

Layer 4 — App: MainWindow wiring (depends on Layers 2 + 3)
  4a. MainWindow.xaml             add <controls:NixieClockView x:Name="NixieView">
  4b. MainWindow.xaml.cs          SetClockType Nixie branch; ApplySettings Nixie branch;
                                  DialShape field + ApplyDialShape(); extend locale switch

Layer 5 — App: Settings UI (depends on Layer 2 for DialShape type; Layer 4 for event handler pattern)
  5a. SettingsWindow.xaml         add BtnNixie; add DialShape radio buttons; add ComboBoxItems
  5b. SettingsWindow.xaml.cs      DialShapeChanged event; extend SetClockStyleButtonStates();
                                  extend PopulateControls() phrase style index mapping

Layer 6 — App: Tray (depends on Layer 2 for ClockType.Nixie)
  6a. TrayMenuBuilder.cs          add _nixieClockItem; extend SyncCheckmarks()

Layer 7 — Tests
  7a. PhraseStyleProviderTests.cs add >= 2 sample tests per new provider (PHRASE-09)
  7b. Regression: all 248 existing tests must pass
```

**Rationale:**
- Layers 1 and 2 have no mutual dependency and can proceed in parallel.
- `NixieClockView` (Layer 3) must compile before `MainWindow.xaml` can reference it.
- `SetClockType` and `ApplySettings` wiring (Layer 4) must exist before `SettingsWindow` events can be wired in `OpenSettings()` (Layer 5).
- Tray (Layer 6) is independent of Settings UI; can proceed once `ClockType.Nixie` exists.
- Tests (Layer 7) validate finished behavior but provider unit tests can be written TDD-style alongside Layer 1.

## Anti-Patterns

### Anti-Pattern 1: Calling SetClockType Inside ApplySettings

**What people do:** Refactor `ApplySettings` to delegate to `SetClockType()` to avoid duplicated collapse/show logic.

**Why it's wrong:** `SetClockType()` calls `SaveSettings()` and accesses `_statsTimer` / `_timer`, which are null until `ContentRendered` fires. The codebase explicitly guards against this — source comments at lines 230 and 253 document the invariant. Calling `SetClockType` before `Show()` throws `NullReferenceException` or writes corrupt settings.

**Do this instead:** Keep the inline collapse/show block in `ApplySettings` manually synchronized with `SetClockType`. The duplication is intentional.

### Anti-Pattern 2: Adding Nixie Visual State to FuzzyClock.Core

**What people do:** Add Nixie rendering preferences (glow intensity, cathode count) to `FuzzyClock.Core` because it seems like "clock logic."

**Why it's wrong:** `FuzzyClock.Core` is pure logic with no WPF references. Nixie visual parameters belong in `NixieClockView` DependencyProperties, mirroring how `LcdClockView` owns `LitColor`, `BgColor`, `GhostColor`, `Size`.

**Do this instead:** All Nixie visual state lives in `NixieClockView` DependencyProperties. `AppSettings` holds only what needs to persist across restarts (none for v3.4 — Nixie has no user-configurable visual options in this milestone).

### Anti-Pattern 3: Forgetting TrayMenuBuilder When Adding a New Clock Type

**What people do:** Add Nixie to `SettingsWindow` and `SetClockType` but forget `TrayMenuBuilder` and `TrayMenuState`.

**Why it's wrong:** The tray "Clock Type" submenu uses checkmarks synced from `TrayMenuState.ClockType` on every menu open. If `TrayMenuBuilder` has no Nixie item and `SyncCheckmarks` doesn't handle `ClockType.Nixie`, the tray shows no checkmark when Nixie is active.

**Do this instead:** Add `_nixieClockItem` field to `TrayMenuBuilder`, add the menu item to the Clock Type submenu, and handle `ClockType.Nixie` in `SyncCheckmarks`.

### Anti-Pattern 4: Using Image Assets for Nixie Rendering

**What people do:** Import PNG or SVG tube images to simplify the Nixie visual look.

**Why it's wrong:** REQUIREMENTS.md constraint is explicit: "WPF-only rendering: Nixie glow via WPF `RadialGradientBrush` effects, no image assets." Image assets also break the no-external-resource pattern established by `SevenSegmentDigit` (which draws entirely in code-behind procedural geometry).

**Do this instead:** Use `RadialGradientBrush` for the orange glow/bloom effect. Use `Canvas` or `Grid` with stacked `TextBlock` elements at varying `Opacity` for ghost cathode digits. Draw the glass tube border using `Border` with `CornerRadius` and a semi-transparent `BorderBrush`.

### Anti-Pattern 5: Missing the Second Locale Switch Site

**What people do:** Update the `PhraseStyle`-to-locale mapping in `SetPhraseStyle()` but forget the identical switch in `ApplySettings()`.

**Why it's wrong:** New personalities work on live change but revert to Classic on restart — the saved `PhraseStyle = "Pirate"` is not recognized at startup because `ApplySettings` still falls through to `"en-classic"`.

**Do this instead:** Search for both `_currentPhraseStyle.ToLowerInvariant() switch` occurrences and update them together. They are the two call sites documented above under "PhraseStyle to Locale Mapping."

## Sources

- Codebase direct inspection: `FuzzyClock.App/ClockType.cs`, `AppSettings.cs`, `MainWindow.xaml.cs`, `SettingsWindow.xaml.cs`, `TrayMenuBuilder.cs`, `Controls/LcdClockView.xaml.cs`, `Controls/SevenSegmentDigit.xaml.cs`
- Codebase direct inspection: `FuzzyClock.Core/PhraseEngine.cs`, `IPhraseProvider.cs`, `RudePhraseProvider.cs`
- `.planning/REQUIREMENTS.md` — v3.4 constraints and acceptance criteria
- `.planning/PROJECT.md` — milestone context and feature description

---
*Architecture research for: FuzzyClock v3.4 Personalities & Nixie — integration into existing C# WPF app*
*Researched: 2026-03-11*
