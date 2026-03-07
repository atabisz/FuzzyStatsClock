# Technology Stack: v3.2 Settings Window, Themes, Alerts, Phrase Styles, Multilingual

**Project:** FuzzyClock v3.2 — Settings window + 5 built-in themes + battery alert + phrase styles + multilingual
**Researched:** 2026-03-08
**Scope:** Additions only — existing validated stack (C# WPF .NET 10, MSTest 4.0.1, System.Text.Json, System.Diagnostics.PerformanceCounter 10.0.0) is unchanged
**Confidence:** HIGH

---

## What Changes vs v3.1

v3.1 validated stack (not re-researched):
- .NET 10, C# 13, WPF (`net10.0-windows`), `UseWindowsForms=true`
- `MainWindow.xaml.cs` (~1300 lines), `FuzzyClock.Core` (pure static), `SettingsService` atomic JSON I/O
- `AppSettings` init-property record, `System.Text.Json` for settings
- `System.Diagnostics.PerformanceCounter` NuGet 10.0.0
- MSTest 4.0.1, `FuzzyClock.Core.Tests` + `FuzzyClock.App.Tests`, 122 tests

v3.2 additions by feature:

| Feature | Stack Change | NuGet Needed |
|---------|-------------|--------------|
| Settings window | New WPF `Window` + `TabControl` — pure WPF built-ins | None |
| 5 named themes | New `ThemeDefinition` record + `AppSettings` theme name property | None |
| Battery low alert | `SystemInformation.PowerStatus` already used; conditional color logic only | None |
| Phrase styles | New enum + strategy dispatch in `PhraseEngine` or sibling classes | None |
| Multilingual phrases | `.resx` files + `ResourceManager` in `FuzzyClock.Core` | None |

**Zero new NuGet packages. Zero csproj changes.**

---

## Recommended Stack Additions

### 1. Settings Window — WPF TabControl (Built-in)

**What it is:** A standard WPF `Window` with a `TabControl` containing three `TabItem` children (Appearance / Stats / Behavior).

**Why no packages are needed:** `TabControl` and `TabItem` are part of `PresentationFramework.dll`, which is already referenced via `<UseWPF>true</UseWPF>`. No third-party UI toolkit is needed for a simple settings dialog in an existing WPF app.

**Window pattern:**
```csharp
// SettingsWindow.xaml.cs
public partial class SettingsWindow : Window
{
    public SettingsWindow(AppSettings current)
    {
        InitializeComponent();
        // populate controls from current settings
    }

    public AppSettings? Result { get; private set; }   // null = cancelled
}
```

**Launch from tray (modeless, single-instance guard):**
```csharp
private SettingsWindow? _settingsWindow;

private void OpenSettings()
{
    if (_settingsWindow is not null) { _settingsWindow.Activate(); return; }
    _settingsWindow = new SettingsWindow(_currentSettings);
    _settingsWindow.Owner = this;                 // keeps it above MainWindow
    _settingsWindow.Closed += (_, _) =>
    {
        if (_settingsWindow.Result is { } updated)
            ApplyAndSaveSettings(updated);
        _settingsWindow = null;
    };
    _settingsWindow.Show();                       // modeless — tray stays usable
}
```

**Key XAML pattern:**
```xml
<TabControl>
    <TabItem Header="Appearance">
        <!-- FontSize slider, AccentColor pickers, Opacity slider, ClockStyle radio buttons -->
    </TabItem>
    <TabItem Header="Stats">
        <!-- Per-row CheckBoxes: CPU/GPU/MEM/PAG/BATT/Uptime, interval selector -->
    </TabItem>
    <TabItem Header="Behavior">
        <!-- Ghost mode, Auto-contrast, Auto-launch, Date display toggles -->
    </TabItem>
</TabControl>
```

**Why modeless (Show) not modal (ShowDialog):** The tray icon NotifyIcon context menu must remain functional while settings are open. `ShowDialog` blocks the calling thread's message pump in WPF, which would freeze the tray menu interaction.

**Source:** https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/how-to-open-window-dialog-box (HIGH confidence — official, updated 2024-10-24)

---

### 2. Named Themes — AppSettings Extension + ThemeDefinition Record

**What it is:** A named bundle of existing settings properties (accent color, opacity, font size, clock style, stats visibility).

**Why no packages are needed:** Themes are pure data — a `record` bundling existing property types. The theme name is persisted as a `string` in `AppSettings`. Theme data lives in a static lookup table in code (no resource files, no external config).

**Pattern:**
```csharp
// FuzzyClock.Core or FuzzyClock.App
public record ThemeDefinition(
    string  Name,
    string  AccentColor,   // AARRGGBB hex, matches AppSettings.AccentColor format
    double  Opacity,
    int     FontSize,
    string  TextStyle,     // "Classic"|"Split"|"Literary"|"Mono"
    bool    StatsVisible
);

public static class BuiltInThemes
{
    public static readonly ThemeDefinition[] All =
    [
        new("Minimal",    "#FFFFFFFF", 0.75, 28, "Classic", false),
        new("Dashboard",  "#FF40C4FF", 1.0,  28, "Classic", true),
        new("Cinematic",  "#FFFFAB00", 0.85, 40, "Literary", false),
        new("Terminal",   "#FF00E676", 0.9,  28, "Mono",    true),
        new("Soft Night", "#FFCE93D8", 0.6,  32, "Classic", false),
    ];
}
```

**AppSettings addition:**
```csharp
public string ActiveThemeName { get; init; } = "";  // "" = no theme (custom)
```

**No serialization changes required** — `string` init-property follows the established pattern. Existing settings.json without this field deserializes to `""` (no active theme).

---

### 3. Battery Low Alert — Conditional Color Logic

**What it is:** When `BatteryPercent < threshold` (e.g., 20%), the battery stat row accent color shifts to red.

**Why no packages are needed:** `SystemInformation.PowerStatus` is already used in `StatsService.cs` (v3.1). This is a conditional branch in the existing `ApplyDisplayColor` / stats rendering pipeline.

**Integration point:**
```csharp
// In the battery stat display logic (MainWindow.xaml.cs or StatsService)
Color batteryColor = (batteryPct >= 0 && batteryPct < LowBatteryThresholdPercent)
    ? Colors.OrangeRed     // alert color — not user accent
    : _accentColor;        // normal accent
```

**AppSettings addition:**
```csharp
public int BatteryLowAlertPercent { get; init; } = 20;  // 0 = disabled
```

No new services, no new NuGet packages.

---

### 4. Phrase Styles — Strategy Pattern in FuzzyClock.Core

**What it is:** Three named personalities for the English phrase engine: Terse (shortest phrase), Poetic (lyrical), Rude (irreverent). The current engine produces "Classic" phrases.

**Why no packages are needed:** This is a pure C# code addition in `FuzzyClock.Core`. Each style is a static bucket table (same data structure as `PhraseEngine.Buckets`). A `PhraseStyle` enum selects which table `GetPhrase` uses.

**Pattern:**
```csharp
public enum PhraseStyle { Classic, Terse, Poetic, Rude }

public static class PhraseEngine
{
    public static string GetPhrase(DateTime dt, PhraseStyle style = PhraseStyle.Classic)
    {
        var buckets = style switch
        {
            PhraseStyle.Terse  => TerseBuckets,
            PhraseStyle.Poetic => PoeticBuckets,
            PhraseStyle.Rude   => RudeBuckets,
            _                  => ClassicBuckets,
        };
        // ... existing bucket-walk logic
    }
}
```

**AppSettings addition:**
```csharp
public string PhraseStyle { get; init; } = "Classic";  // "Classic"|"Terse"|"Poetic"|"Rude"
```

**Testability:** Each new bucket table gets its own `[DataRow]` tests in `FuzzyClock.Core.Tests` — same pattern as existing `PhraseEngineTests`.

---

### 5. Multilingual Phrases — .resx + ResourceManager in FuzzyClock.Core

**What it is:** Locale-specific phrase output in French, Spanish, German, Japanese, driven by `CultureInfo.CurrentUICulture`.

**Why .resx + ResourceManager (not IStringLocalizer):** `IStringLocalizer` requires `Microsoft.Extensions.Localization` + `Microsoft.Extensions.Hosting` and a DI container. This project has no DI container and is a single-process WPF app. `System.Resources.ResourceManager` is built into the BCL, zero-dependency, and is the correct tool for a class library that needs culture-aware string lookup without a host.

**Why not WPF BAML/LocBaml:** LocBaml only works with WPF .NET Framework, not .NET 10. The phrase strings are business logic strings in `FuzzyClock.Core` (a plain `net10.0` class library with no WPF reference), not XAML UI strings. `.resx` + `ResourceManager` is the right scope.

**File structure:**
```
FuzzyClock.Core/
  Resources/
    PhraseStrings.resx          ← English (neutral/fallback)
    PhraseStrings.fr.resx       ← French
    PhraseStrings.de.resx       ← German
    PhraseStrings.es.resx       ← Spanish
    PhraseStrings.ja.resx       ← Japanese
```

**Resource key convention:** One key per phrase bucket slot, e.g.:
```
oclock         → "{h} o'clock"      (fr: "{h} heure pile")
just_after     → "just after {h}"   (fr: "juste après {h}")
ten_past       → "ten past {h}"     ...
```

Hour words are also localized (French: "une", "deux", "trois"...).

**ResourceManager usage in PhraseEngine:**
```csharp
private static readonly ResourceManager _rm =
    new ResourceManager("FuzzyClock.Core.Resources.PhraseStrings",
                        typeof(PhraseEngine).Assembly);

private static string L(string key) =>
    _rm.GetString(key, CultureInfo.CurrentUICulture) ?? key;
```

**Locale detection — CultureInfo.CurrentUICulture:**
```csharp
// Read the Windows display language (set in Settings > Language)
var culture = CultureInfo.CurrentUICulture;
// culture.TwoLetterISOLanguageName → "fr", "de", "es", "ja", "en", ...
// ResourceManager falls back: fr-FR → fr → neutral (.resx) automatically
```

`CultureInfo.CurrentUICulture` is the correct property. `CurrentCulture` controls formatting; `CurrentUICulture` controls which resource file the ResourceManager loads. On Windows 11 (the only supported OS), `CurrentUICulture` reflects the Windows display language.

**Satellite assembly build — csproj addition to FuzzyClock.Core.csproj:**
```xml
<PropertyGroup>
    <NeutralLanguage>en</NeutralLanguage>
</PropertyGroup>
```

This sets `[assembly: NeutralResourcesLanguage("en")]` which tells the runtime the fallback is English. Satellite assemblies (`fr/FuzzyClock.Core.resources.dll`, etc.) are built automatically by MSBuild when `.resx` files with locale suffixes exist — no manual steps.

**Culture fallback chain (built-in, no code needed):**
```
fr-FR → fr → en (neutral / main assembly)
de-AT → de → en
ja-JP → ja → en
unknown culture → en (always)
```

**Manual override in AppSettings (optional):**
```csharp
public string LanguageOverride { get; init; } = "";  // "" = follow Windows CultureInfo
```

If non-empty, `PhraseEngine` uses `CultureInfo.GetCultureInfo(LanguageOverride)` instead of `CurrentUICulture`. Allows users to force a language independent of Windows locale.

**Source:** https://learn.microsoft.com/en-us/dotnet/core/extensions/localization (HIGH confidence, updated 2026-02-04); https://learn.microsoft.com/en-us/dotnet/fundamentals/runtime-libraries/system-globalization-cultureinfo (HIGH confidence, updated 2026-02-12)

---

## Core Technologies: No Changes

| Technology | Version | Status |
|------------|---------|--------|
| .NET 10 WPF (`net10.0-windows`) | 10.0 | Unchanged |
| `FuzzyClock.Core` (`net10.0`) | — | Gains `.resx` files |
| `System.Text.Json` | inbox .NET 10 | Unchanged |
| `System.Diagnostics.PerformanceCounter` | 10.0.0 | Unchanged |
| MSTest | 4.0.1 | Unchanged |
| `System.Resources.ResourceManager` | BCL inbox | New usage in Core |

---

## Supporting Libraries: No Changes

All additions use BCL types already in `net10.0`:
- `System.Resources.ResourceManager` — `.resx` resource lookup (BCL inbox, no NuGet)
- `System.Globalization.CultureInfo` — locale detection (BCL inbox)
- `System.Windows.Controls.TabControl` — settings window tabs (WPF built-in via `UseWPF=true`)

---

## Installation

**No new package installs.** All required types are in:
- `PresentationFramework.dll` (WPF built-in) — `TabControl`, `TabItem`, `Window`
- BCL (`System.Resources`, `System.Globalization`) — `ResourceManager`, `CultureInfo`

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `Microsoft.Extensions.Localization` NuGet | Requires DI host; over-engineered for a standalone WPF app with no service container | `System.Resources.ResourceManager` (BCL inbox) |
| `Microsoft.Extensions.Hosting` NuGet | Brings in the entire generic host for a single-process overlay widget | None needed |
| WPF LocBaml / BAML localization | LocBaml does not work with WPF .NET (only .NET Framework); requires complex toolchain | `.resx` + `ResourceManager` |
| Third-party UI toolkit (MahApps.Metro, MaterialDesign, etc.) | Adds hundreds of KB, styles would conflict with the existing minimal custom UI | WPF built-in `TabControl` |
| MVVM framework (CommunityToolkit.Mvvm, Prism) | No existing MVVM infrastructure; settings window is simple enough for code-behind | Direct code-behind in `SettingsWindow.xaml.cs` |
| Separate settings JSON file per locale | Fragile; phrases are not user-configurable | `.resx` compiled into satellite assemblies |
| `CultureInfo.CurrentCulture` for language detection | Controls number/date formatting, NOT UI language selection | `CultureInfo.CurrentUICulture` (resource lookup) |

---

## Alternatives Considered

| Category | Recommended | Alternative | When Alternative Is Better |
|----------|-------------|-------------|---------------------------|
| Settings UI | WPF built-in `TabControl` | MahApps.Metro `MetroWindow` | If the project adopted a full design system; overkill for 3 tabs |
| Localization | `.resx` + `ResourceManager` | `IStringLocalizer` + DI | Only when the app already uses `IHost` / generic host |
| Theme storage | Static `ThemeDefinition[]` in code | JSON theme files | If users need to create custom themes — not in v3.2 scope |
| Phrase styles | Static bucket tables per style | External JSON phrase files | If phrase content must be user-editable |
| Settings window lifetime | Modeless (`Show`) | Modal (`ShowDialog`) | If the settings window must block all other interaction |

---

## csproj Change Summary

**FuzzyClock.Core.csproj:** Add `<NeutralLanguage>en</NeutralLanguage>` to the existing `<PropertyGroup>`. This is the only csproj change across the entire milestone.

**FuzzyClock.App.csproj:** No changes.

**FuzzyClock.Core.Tests.csproj:** No changes (new phrase style tests follow existing `[DataRow]` pattern).

**FuzzyClock.App.Tests.csproj:** No changes (settings window and theme tests follow existing patterns).

---

## Integration Points in Existing Code

| Location | Change |
|----------|--------|
| `FuzzyClock.Core/PhraseEngine.cs` | Add `PhraseStyle` enum parameter; add Terse/Poetic/Rude bucket tables; add `ResourceManager` field for locale lookup |
| `FuzzyClock.Core/Resources/` | New directory: `PhraseStrings.resx` + `PhraseStrings.{fr,de,es,ja}.resx` |
| `FuzzyClock.Core.csproj` | Add `<NeutralLanguage>en</NeutralLanguage>` |
| `FuzzyClock.App/AppSettings.cs` | Add: `ActiveThemeName`, `BatteryLowAlertPercent`, `PhraseStyle`, `LanguageOverride` init properties |
| `FuzzyClock.App/MainWindow.xaml.cs` | Battery alert: conditional color in stats paint; theme apply: map `ThemeDefinition` to `ApplySettings`-like call |
| `FuzzyClock.App/TrayMenuBuilder.cs` | Add "Settings..." menu item + phrase style submenu |
| New: `FuzzyClock.App/SettingsWindow.xaml` + `.xaml.cs` | New WPF Window with TabControl — Appearance / Stats / Behavior tabs |
| New: `FuzzyClock.App/ThemeDefinition.cs` + `BuiltInThemes.cs` | Static theme registry |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| WPF TabControl (no packages) | HIGH | Built into PresentationFramework; established WPF pattern |
| ResourceManager + .resx for class library | HIGH | BCL standard; verified against official .NET docs |
| CultureInfo.CurrentUICulture for locale detection | HIGH | Official docs confirm: CurrentUICulture drives resource loading, CurrentCulture drives formatting |
| Satellite assembly auto-build with NeutralLanguage | HIGH | Official MSBuild behavior, documented; no manual steps |
| Phrase style dispatch (enum + bucket switch) | HIGH | Straightforward extension of existing PhraseEngine pattern |
| Battery alert (conditional color branch) | HIGH | StatsService already reads BatteryPercent; color override is 2-line conditional |
| IStringLocalizer NOT needed | HIGH | IStringLocalizer requires DI host; ResourceManager is the correct non-hosted alternative per official docs |

---

## Sources

- WPF Window / ShowDialog vs Show: https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/how-to-open-window-dialog-box (official, 2024-10-24)
- .NET Localization + IStringLocalizer: https://learn.microsoft.com/en-us/dotnet/core/extensions/localization (official, updated 2026-02-04)
- WPF Globalization + satellite assemblies: https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/wpf-globalization-and-localization-overview (official; LocBaml .NET Framework only warning confirmed)
- CultureInfo.CurrentUICulture vs CurrentCulture: https://learn.microsoft.com/en-us/dotnet/fundamentals/runtime-libraries/system-globalization-cultureinfo (official, updated 2026-02-12)
- ResourceManager class: https://learn.microsoft.com/en-us/dotnet/api/system.resources.resourcemanager (BCL inbox, no NuGet)
- TabControl: https://learn.microsoft.com/en-us/dotnet/api/system.windows.controls.tabcontrol (WPF built-in)

---
*Stack research for: FuzzyClock v3.2 — Settings Window, Themes, Battery Alert, Phrase Styles, Multilingual*
*Researched: 2026-03-08*
