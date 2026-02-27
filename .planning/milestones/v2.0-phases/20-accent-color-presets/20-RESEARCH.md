# Phase 20: Accent Color Presets - Research

**Researched:** 2026-02-27
**Domain:** WPF SolidColorBrush assignment; ColorConverter hex parsing; ContextMenu IsChecked sync; ContentRendered ordering constraints
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| THEME-01 | User can select a built-in accent color preset (White, Amber, Ice Blue, Green, Hello Kitty Pink) via a right-click Theme submenu; current preset shown as checked | Theme submenu XAML; five preset click handlers; `ContextMenu_Opened` sync against `_accentColor` hex comparison |
| THEME-03 | Active accent color is applied consistently to phrase text, dial hands and decorations (ticks, dots, numbers), and stats bars and percentage text | `ApplyTheme()` method covering all 14 named elements + 3 iterated code-behind lists; call ordering after `InitDialDecorations()` in ContentRendered |
</phase_requirements>

---

## Summary

Phase 20 is the accent color half of the v2.0 Visual Identity milestone. The AppSettings schema is complete from Phase 18 (`AccentColor` hex string, default `"#FFFFFFFF"`; both guards in `SettingsService.Load()`). Phase 19 is complete (window opacity fully implemented). Phase 20 adds a single central method `ApplyTheme()` and wires it into the existing startup and runtime flows.

The implementation has two distinct parts. First, `ApplyTheme()` must be written to cover every accent-colored element in the widget: `PhraseText.Foreground`, `HourHand.Stroke`, `MinuteHand.Stroke`, all elements in `_hourTickElements` (12 `Line.Stroke`), `_minuteDotElements` (60 `Ellipse.Fill`), and `_hourNumberElements` (12 `TextBlock.Foreground`), plus all four stats fill bars (`CpuBar/GpuBar/MemBar/PagBar.Background`) and all four stats percentage text elements (`CpuText/GpuText/MemText/PagText.Foreground`). That is 11 direct element assignments plus iteration over 3 lists. Bar track backgrounds, row labels, shadow text, and the hover backdrop are deliberately excluded. Second, the Theme submenu (5 `IsCheckable` preset entries) must be added to the ContextMenu XAML and the five click handlers plus checkmark sync must be wired.

The critical startup ordering constraint is already locked in STATE.md and ARCHITECTURE.md: `ApplySettings()` sets `_accentColor` only (no `ApplyTheme()` call — decoration lists are empty at that point). ContentRendered calls `InitDialDecorations()` first, then `ApplyTheme()`. This mirrors how `_showHourTicks`/`_showMinuteDots`/`_showHourNumbers` are applied after decoration elements are created. Runtime theme changes (preset menu click) call `ApplyTheme()` directly because ContentRendered has already run and all lists are populated.

**Primary recommendation:** Add `_accentColor` field and `ApplyTheme()` method, add Theme submenu XAML, wire 5 preset click handlers and `ContextMenu_Opened` sync, extend `ApplySettings()` to parse hex and set field, extend `SaveSettings()` to serialize field back to `#AARRGGBB`, and call `ApplyTheme()` in ContentRendered after `InitDialDecorations()`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `System.Windows.Media.SolidColorBrush` | windowsdesktop-10.0, PresentationCore.dll | Applies a flat color to a WPF element property (Foreground, Stroke, Fill, Background) | In-box WPF; the only correct brush type for solid accent color; creating new instances avoids frozen-brush mutation exceptions |
| `System.Windows.Media.ColorConverter.ConvertFromString()` | windowsdesktop-10.0, PresentationCore.dll | Parses `#AARRGGBB` or `#RRGGBB` hex string to `Color` struct | Same mechanism XAML uses internally; handles both 6-digit and 8-digit hex; throws on invalid input (wrap in try/catch) |
| `System.Windows.Media.Color.FromArgb(a,r,g,b)` | windowsdesktop-10.0, PresentationCore.dll | Constructs a `Color` struct from raw byte components | In-box; used for preset color constants defined in code |
| `System.Windows.Media.Colors` static class | windowsdesktop-10.0, PresentationCore.dll | Named color constants (e.g. `Colors.White`) for fallback | In-box; clean White fallback in the `ApplySettings()` catch block |

### No New Dependencies

Phase 20 requires zero NuGet additions and zero csproj changes. All APIs are in `PresentationCore.dll`, which is a dependency of every WPF project targeting `net10.0-windows`. The `<UseWindowsForms>true</UseWindowsForms>` csproj flag is NOT needed for Phase 20 — that is required in Phase 21 for the custom color picker only.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `new SolidColorBrush(_accentColor)` per `ApplyTheme()` call | Cache a single `SolidColorBrush` instance | Single cached instance must be unfrozen to update Color; if any code path freezes it, mutation throws `InvalidOperationException`. Per-call creation is cheaper (rare user action) and simpler |
| `ColorConverter.ConvertFromString()` | Manual hex string parsing | ConvertFromString is the canonical XAML color parser — handles edge cases (named colors, 3-digit hex, alpha prefix) that manual parsing misses |
| `Color.FromArgb` for preset constants | String constants with runtime parsing | `Color.FromArgb` creates typed constants with zero runtime cost and no parsing at call time |
| Storing `Color` in `AppSettings` | Already rejected (Phase 18) | `System.Text.Json` cannot serialize `System.Windows.Media.Color` natively (complex struct with `ColorContext` reference member) — hex string is the correct serialization form |

---

## Architecture Patterns

### What Phase 20 Touches

Exactly three locations change:

```
FuzzyClock.App/
├── MainWindow.xaml           # Add Theme submenu (5 IsCheckable preset items)
├── MainWindow.xaml.cs        # Add _accentColor field; add ApplyTheme() method;
│                             #   extend ApplySettings(), SaveSettings(),
│                             #   ContextMenu_Opened(), ContentRendered lambda;
│                             #   add 5 preset click handlers + SetAccentColor() helper
└── AppSettings.cs            # ALREADY DONE in Phase 18 — no changes needed
SettingsService.cs            # ALREADY DONE in Phase 18 — no changes needed
```

`AppSettings.cs` (AccentColor field + default) and `SettingsService.cs` (load guards + Defaults()) are both complete. Phase 20 is pure runtime + XAML behavior.

### Pattern 1: ApplyTheme() — The Centerpiece Method

**What:** A single private method that constructs one `SolidColorBrush` from `_accentColor` and applies it to every accent-colored element. Called at startup (from ContentRendered, after `InitDialDecorations()`) and at runtime (from each preset click handler via `SetAccentColor()`).

**When to use:** Any time `_accentColor` changes. Also called once at startup to paint all elements from the restored/default color.

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
private void ApplyTheme()
{
    var brush = new System.Windows.Media.SolidColorBrush(_accentColor);

    // Phrase mode element
    PhraseText.Foreground = brush;
    // ShadowText deliberately excluded — stays #BB000000 (dark shadow for legibility)

    // Dial mode elements (static XAML)
    HourHand.Stroke   = brush;
    MinuteHand.Stroke = brush;

    // Dial face decorations (code-behind lists, populated in InitDialDecorations())
    // Lists are empty until ContentRendered runs — only call ApplyTheme() after InitDialDecorations()
    foreach (var el in _hourTickElements)   el.Stroke     = brush;
    foreach (var el in _minuteDotElements)  el.Fill       = brush;
    foreach (var el in _hourNumberElements) el.Foreground = brush;

    // Stats fill bars (accent color)
    CpuBar.Background  = brush;
    GpuBar.Background  = brush;
    MemBar.Background  = brush;
    PagBar.Background  = brush;

    // Stats percentage text (accent color)
    CpuText.Foreground = brush;
    GpuText.Foreground = brush;
    MemText.Foreground = brush;
    PagText.Foreground = brush;

    // Stats bar tracks deliberately excluded — stay #40FFFFFF (neutral semi-transparent white)
    // Stats row labels ("CPU"/"GPU"/"MEM"/"PAG") deliberately excluded — stay white
}
```

**Why a single brush instance per call:** One `SolidColorBrush` created per `ApplyTheme()` call is shared across all elements. This is safe because the brush is not frozen and `ApplyTheme()` is only called on user interaction or startup — never in a tight loop.

### Pattern 2: SetAccentColor() Helper

**What:** Sets `_accentColor`, calls `ApplyTheme()`, calls `SaveSettings()`. All five preset click handlers delegate to this. This is the runtime pattern; do not use it from `ApplySettings()` (see anti-patterns).

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
private void SetAccentColor(System.Windows.Media.Color color)
{
    _accentColor = color;
    ApplyTheme();
    SaveSettings();
}
```

### Pattern 3: ApplySettings() Extension — _accentColor Only

**What:** Parses hex string from loaded settings into `_accentColor`. Does NOT call `ApplyTheme()` — decoration lists are empty at this point. `ContentRendered` calls `ApplyTheme()` after `InitDialDecorations()`.

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// Add at the end of the existing ApplySettings(AppSettings s) body.
// Safe before Show(): no layout pass required; just parsing hex and storing a Color struct.

// Parse AccentColor hex string -> Color struct
// try/catch fallback: if the hex string is invalid or the field is empty,
// SettingsService.Load() should have already defaulted it to "#FFFFFFFF",
// but guard here for belt-and-suspenders safety.
try
{
    _accentColor = (System.Windows.Media.Color)
        System.Windows.Media.ColorConverter.ConvertFromString(s.AccentColor);
}
catch
{
    _accentColor = System.Windows.Media.Colors.White;  // fallback on any parse failure
}
// Do NOT call ApplyTheme() here — _hourTickElements etc. are empty until ContentRendered
```

### Pattern 4: ContentRendered Ordering — ApplyTheme() After InitDialDecorations()

**What:** The existing `ContentRendered` lambda calls `InitDialDecorations()` (which populates `_hourTickElements`, `_minuteDotElements`, `_hourNumberElements`). Phase 20 adds `ApplyTheme()` immediately after, so decoration elements are colored at startup.

```csharp
// Source: STATE.md locked decision + ARCHITECTURE.md (HIGH confidence)
// In ContentRendered += (_, _) => { ... }:
// ... existing position clamp/PositionTopRight, timer setup, stats init ...
if (_dialMode) UpdateDialDisplay();
InitDialDecorations();   // existing — populates decoration lists
ApplyTheme();            // NEW: after lists are populated; colors all accent elements
// ... existing hover handlers ...
```

**Why this order matters:** If `ApplyTheme()` is called before `InitDialDecorations()`, the three `foreach` loops iterate empty lists and decorate elements show white even when a non-white theme was restored from settings. The visual inconsistency would only appear on the next runtime theme change. See Anti-Pattern 1.

### Pattern 5: SaveSettings() Extension — AccentColor Serialization

**What:** Adds `AccentColor` to the `AppSettings` record in `SaveSettings()`. Serializes `_accentColor` back to `#AARRGGBB` format matching the AppSettings default format.

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// In SaveSettings(), add to the new AppSettings { ... } initializer:
AccentColor = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}",
// Produces 8-digit AARRGGBB format matching AppSettings default "#FFFFFFFF"
// Alpha is always FF (255) for all preset colors — presets use fully opaque colors
```

**Format note:** AppSettings.AccentColor init default is `"#FFFFFFFF"` (8-digit AARRGGBB). SaveSettings should produce the same format. Using `{A:X2}{R:X2}{G:X2}{B:X2}` ensures 8-digit output. Preset constants have A=255 (fully opaque), so alpha is always FF.

### Pattern 6: ContextMenu_Opened Sync — Hex Comparison

**What:** Adds checkmark sync for the five preset MenuItems. Computes the current hex from `_accentColor` and compares to each preset's canonical hex. No preset is checked when a custom color is active (Phase 21).

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// Add to ContextMenu_Opened():

// Theme preset sync: derive hex from _accentColor; compare to preset constants
// No secondary "current theme name" field — _accentColor is the single source of truth
string currentHex = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}";
MenuThemeWhite.IsChecked = (currentHex == "#FFFFFFFF");
MenuThemeAmber.IsChecked = (currentHex == "#FFFFC000");
MenuThemeIce.IsChecked   = (currentHex == "#FF87CEEB");
MenuThemeGreen.IsChecked = (currentHex == "#FF00C000");
MenuThemePink.IsChecked  = (currentHex == "#FFFF69B4");
// When custom color is active (Phase 21), none of these match — no checkmark. Correct.
```

### Pattern 7: XAML Theme Submenu

**What:** Adds the Theme submenu to the existing ContextMenu. Five `IsCheckable` preset entries. No Custom entry yet — Phase 21 adds that.

```xml
<!-- Source: ARCHITECTURE.md (project research, HIGH confidence) -->
<!-- In MainWindow.xaml ContextMenu, before the Opacity submenu: -->
<MenuItem Header="Theme">
    <MenuItem x:Name="MenuThemeWhite"  Header="White"            IsCheckable="True" Click="MenuThemeWhite_Click" />
    <MenuItem x:Name="MenuThemeAmber"  Header="Amber"            IsCheckable="True" Click="MenuThemeAmber_Click" />
    <MenuItem x:Name="MenuThemeIce"    Header="Ice Blue"         IsCheckable="True" Click="MenuThemeIce_Click" />
    <MenuItem x:Name="MenuThemeGreen"  Header="Green"            IsCheckable="True" Click="MenuThemeGreen_Click" />
    <MenuItem x:Name="MenuThemePink"   Header="Hello Kitty Pink" IsCheckable="True" Click="MenuThemePink_Click" />
</MenuItem>
```

**Note:** No `Separator` and no `Custom Color...` entry in Phase 20. Phase 21 adds both.

### Anti-Patterns to Avoid

- **Calling `ApplyTheme()` from `ApplySettings()`:** Decoration lists are empty before `ContentRendered` runs. This silently skips tick marks, minute dots, and hour numbers. The elements show white at startup even when a non-white preset was saved. Appears correct on first runtime theme change. Hard to catch in testing.

- **Mutating `Brushes.White` or any frozen `Brushes.*` instance:** `System.Windows.Media.Brushes` static instances are frozen (thread-safe read-only). Assigning `.Color = x` on a frozen brush throws `InvalidOperationException`. Always use `new SolidColorBrush(color)`.

- **Storing a `string _currentThemeName` field for checkmark sync:** Creates a secondary field that diverges from `_accentColor`. When the custom picker (Phase 21) is active, the sentinel value `"Custom"` has no clear relationship to `_accentColor`. Compare hex directly from `_accentColor` instead.

- **Reading `IsChecked` in preset click handlers:** WPF's `IsCheckable=True` toggles `IsChecked` before the handler fires. The handler sees the post-toggle value. All existing handlers in the codebase explicitly avoid reading `IsChecked` (per ContextMenu_Opened sync pattern). Preset handlers must unconditionally apply the color, never toggle based on prior check state.

- **Double-serializing AccentColor without alpha prefix:** The AppSettings default is `"#FFFFFFFF"` (8-digit). If SaveSettings uses `#RRGGBB` (6-digit), ColorConverter can still parse it, but the format is inconsistent with the existing default. Use 8-digit AARRGGBB throughout.

---

## Element Inventory

### Elements That Receive Accent Color (14 assignment targets)

| Element | x:Name | Property | Source | WPF API |
|---------|--------|----------|--------|---------|
| Phrase text | `PhraseText` | `Foreground` | XAML (static) | `TextBlock.Foreground = brush` |
| Dial hour hand | `HourHand` | `Stroke` | XAML (static) | `Line.Stroke = brush` |
| Dial minute hand | `MinuteHand` | `Stroke` | XAML (static) | `Line.Stroke = brush` |
| Hour tick marks (12 elements) | `_hourTickElements[]` | `Stroke` | Code-behind list | `Line.Stroke = brush` (foreach) |
| Minute dots (60 elements) | `_minuteDotElements[]` | `Fill` | Code-behind list | `Ellipse.Fill = brush` (foreach) |
| Hour number labels (12 elements) | `_hourNumberElements[]` | `Foreground` | Code-behind list | `TextBlock.Foreground = brush` (foreach) |
| CPU fill bar | `CpuBar` | `Background` | XAML (static) | `Border.Background = brush` |
| GPU fill bar | `GpuBar` | `Background` | XAML (static) | `Border.Background = brush` |
| MEM fill bar | `MemBar` | `Background` | XAML (static) | `Border.Background = brush` |
| PAG fill bar | `PagBar` | `Background` | XAML (static) | `Border.Background = brush` |
| CPU percentage text | `CpuText` | `Foreground` | XAML (static) | `TextBlock.Foreground = brush` |
| GPU percentage text | `GpuText` | `Foreground` | XAML (static) | `TextBlock.Foreground = brush` |
| MEM percentage text | `MemText` | `Foreground` | XAML (static) | `TextBlock.Foreground = brush` |
| PAG percentage text | `PagText` | `Foreground` | XAML (static) | `TextBlock.Foreground = brush` |

### Elements Deliberately Excluded (Must NOT Change Color)

| Element | x:Name | Property | Why Excluded |
|---------|--------|----------|-------------|
| Shadow text | `ShadowText` | `Foreground` | Always `#BB000000` — dark shadow for legibility regardless of accent |
| CPU bar track | `CpuBarTrack` | `Background` | Stays `#40FFFFFF` (25%-alpha white neutral container) |
| GPU bar track | `GpuBarTrack` | `Background` | Stays `#40FFFFFF` |
| MEM bar track | `MemBarTrack` | `Background` | Stays `#40FFFFFF` |
| PAG bar track | `PagBarTrack` | `Background` | Stays `#40FFFFFF` |
| CPU row label | (no x:Name, col 0) | `Foreground` | Stays `White` — label contrast is independent of accent; low-contrast accent on label is unreadable |
| GPU row label | (no x:Name, col 0) | `Foreground` | Stays `White` |
| MEM row label | (no x:Name, col 0) | `Foreground` | Stays `White` |
| PAG row label | (no x:Name, col 0) | `Foreground` | Stays `White` |
| ContentBorder | `ContentBorder` | `Background` | Hover backdrop (`#59000000`) is a neutral overlay, not themed |
| Grid background | (no name) | `Background` | `#01000000` hit-test sentinel — must never change |

**Confirmed from XAML inspection:** The row label TextBlocks in columns 0 of each stats row have `Foreground="White"` but no `x:Name` assigned. They are not individually accessible from code-behind without reflection or named parent traversal. ARCHITECTURE.md and STATE.md both explicitly confirm these labels stay white.

---

## Five Preset Color Values

**Canonical values from additional_context (authoritative):**

| Preset Name | Hex (AARRGGBB) | `Color.FromArgb` | Notes |
|-------------|---------------|------------------|-------|
| White | `#FFFFFFFF` | `Color.FromArgb(0xFF,0xFF,0xFF,0xFF)` | Default; matches XAML `Foreground="White"` and AppSettings default |
| Amber | `#FFFFC000` | `Color.FromArgb(0xFF,0xFF,0xC0,0x00)` | Warm amber; readable on dark backgrounds |
| Ice Blue | `#FF87CEEB` | `Color.FromArgb(0xFF,0x87,0xCE,0xEB)` | Sky blue (`SkyBlue` named color); readable on dark and light |
| Green | `#FF00C000` | `Color.FromArgb(0xFF,0x00,0xC0,0x00)` | Moderate phosphor green; less harsh than pure lime |
| Hello Kitty Pink | `#FFFF69B4` | `Color.FromArgb(0xFF,0xFF,0x69,0xB4)` | Hot pink (`HotPink` named color); matches the name |

**Discrepancy note (resolved):** FEATURES.md (project research doc) and ARCHITECTURE.md use slightly different values (e.g. Amber as `#FFFFBF00` or `#FFC200`, Ice Blue as `#FF00BFFF` or `#A8D8EA`). STATE.md has a pending todo: "Settle on canonical preset color hex values before Phase 20 implementation (FEATURES.md is the design authority — Ice Blue varies across research files)". The values above from the `<additional_context>` of this research task are treated as the authoritative design decision. The planner should use these values and close the STATE.md pending todo.

**Recommended constant declarations:**

```csharp
// Source: additional_context canonical values (design authority)
private static readonly System.Windows.Media.Color PresetWhite   = System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0xFF, 0xFF);
private static readonly System.Windows.Media.Color PresetAmber   = System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0xC0, 0x00);
private static readonly System.Windows.Media.Color PresetIce     = System.Windows.Media.Color.FromArgb(0xFF, 0x87, 0xCE, 0xEB);
private static readonly System.Windows.Media.Color PresetGreen   = System.Windows.Media.Color.FromArgb(0xFF, 0x00, 0xC0, 0x00);
private static readonly System.Windows.Media.Color PresetPink    = System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0x69, 0xB4);
```

**Preset click handlers:**

```csharp
private void MenuThemeWhite_Click(object sender, RoutedEventArgs e) => SetAccentColor(PresetWhite);
private void MenuThemeAmber_Click(object sender, RoutedEventArgs e) => SetAccentColor(PresetAmber);
private void MenuThemeIce_Click(object sender, RoutedEventArgs e)   => SetAccentColor(PresetIce);
private void MenuThemeGreen_Click(object sender, RoutedEventArgs e) => SetAccentColor(PresetGreen);
private void MenuThemePink_Click(object sender, RoutedEventArgs e)  => SetAccentColor(PresetPink);
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hex string → Color | Manual string parsing (substring, Convert.ToByte) | `ColorConverter.ConvertFromString()` | ConvertFromString handles `#RRGGBB`, `#AARRGGBB`, named colors, `#RGB` short form; manual parsing misses edge cases |
| Applying a color to many elements | Loop over all UI elements using reflection or visual tree traversal | Direct named property assignments in `ApplyTheme()` | Named element access is compile-time safe; reflection is fragile and slow; visual tree traversal requires element-type-specific casting |
| Ensuring brushes aren't frozen | Check `brush.IsFrozen` before mutation | Create a new `SolidColorBrush(_accentColor)` per `ApplyTheme()` call | New instance creation is O(1) for a rarely-called method; avoiding frozen-brush detection logic entirely is simpler |
| Tracking which preset is active | Separate `_currentPresetName` string field | Hex comparison in `ContextMenu_Opened` | Field divergence risk (especially across Phase 21 custom picker); single source of truth in `_accentColor` |

**Key insight:** `ApplyTheme()` is the only correct consolidation point. Scattering element color assignments across individual click handlers risks missing elements (e.g., forgetting `PagText` in the Amber handler but not in White). One function, called uniformly from all paths, is the only way to guarantee consistency.

---

## Common Pitfalls

### Pitfall 1: ApplyTheme() Called Before InitDialDecorations()

**What goes wrong:** `_hourTickElements`, `_minuteDotElements`, and `_hourNumberElements` are populated in `InitDialDecorations()`, which runs in `ContentRendered`. If `ApplyTheme()` is called in `ApplySettings()` (before `Show()`) or at the start of ContentRendered (before `InitDialDecorations()`), the three `foreach` loops run on empty lists. The decoration elements are created by `InitDialDecorations()` with `Brushes.White` — they stay white even when a non-white theme is restored. The problem only manifests for users who had a non-white accent color saved before restarting.

**Why it happens:** The startup sequence has three phases: constructor, `ApplySettings()` (before Show), and ContentRendered. Decoration elements do not exist in phase 1 or phase 2. The existing pattern for `_showHourTicks` / `_showMinuteDots` / `_showHourNumbers` shows how to handle this: ApplySettings sets the fields; ContentRendered applies the effect after elements exist.

**How to avoid:** Call `ApplyTheme()` only from ContentRendered (after `InitDialDecorations()`) and from `SetAccentColor()` (runtime only, after ContentRendered has run).

**Warning signs:** White-themed widget launches correctly; non-white themed widget shows dial decorations as white on launch, then snaps to correct color on first theme menu interaction.

### Pitfall 2: Mutating a Frozen Brush

**What goes wrong:** `System.Windows.Media.Brushes.White` and other static brush instances from the `Brushes` class are frozen (`IsFrozen == true`). Calling `myBrush.Color = newColor` on a frozen instance throws `InvalidOperationException: Cannot change the Color property on a frozen SolidColorBrush.`

**Why it happens:** Frozen brushes are created as shared read-only instances for thread safety and rendering optimization. The `InitDialDecorations()` method assigns `Stroke = System.Windows.Media.Brushes.White` to each created element. `ApplyTheme()` then assigns a new `SolidColorBrush` to those properties (replacing the frozen brush reference entirely) — this is safe. The error only occurs if code tries to mutate the color on an existing brush instance rather than replacing the brush reference.

**How to avoid:** In `ApplyTheme()`, always assign a new `SolidColorBrush(_accentColor)` to element properties. Never mutate the Color property of an existing brush. The pattern `element.Stroke = new SolidColorBrush(_accentColor)` replaces the property value (brush reference); `element.Stroke.Color = newColor` mutates the brush value (wrong).

**Warning signs:** `InvalidOperationException` from `ApplyTheme()` on the first runtime theme change (the startup call to `ApplyTheme()` creates fresh brushes, so it succeeds; the error surfaces only when existing `Brushes.*` instances survive from `InitDialDecorations()` and are then mutated).

### Pitfall 3: AccentColor Format Mismatch in SaveSettings vs ContextMenu_Opened

**What goes wrong:** If `SaveSettings()` serializes `_accentColor` as `#RRGGBB` (no alpha) but `ContextMenu_Opened()` compares against `#AARRGGBB` canonical hex strings (e.g. `"#FFFFC000"`), the comparison always fails. No preset checkmark ever appears even when the active color matches a preset.

**Why it happens:** Format inconsistency between the serialization path and the comparison path. The AppSettings default is `"#FFFFFFFF"` (8-digit), but if `SaveSettings()` writes `"#FFC000"` (6-digit), the loaded string parses to the same color but the hex comparison string in `ContextMenu_Opened()` won't match `"#FFFFC000"`.

**How to avoid:** Use 8-digit AARRGGBB format consistently everywhere. In `SaveSettings()`: `$"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}"`. In `ContextMenu_Opened()`: compare against `"#FFFFFFFF"`, `"#FFFFC000"`, etc.

**Warning signs:** Selecting a preset turns the widget to the correct color and saves correctly, but reopening the menu shows no checkmark on any preset. Selecting the same preset again re-applies it (no visual change) and still no checkmark.

### Pitfall 4: Theme Submenu Missing AccentColor in SaveSettings()

**What goes wrong:** Phase 19's `SaveSettings()` intentionally omitted `AccentColor` from the `AppSettings` record initializer (deferred to Phase 20). If Phase 20 forgets to add it, the accent color is applied at runtime but lost on restart — the widget always starts with `#FFFFFFFF` (White) regardless of the preset selected.

**How to avoid:** Phase 20 MUST add `AccentColor = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}"` to `SaveSettings()`. This is a required change for THEME-03 (accent color applied on launch from persisted value).

**Warning signs:** Selecting Amber in the current session works correctly; restarting the widget shows White instead of Amber.

### Pitfall 5: SizeToContent Interaction (Non-Issue to Confirm)

`ApplyTheme()` only changes Brush/Color properties — it does NOT affect element size, layout, or position. `SizeToContent=WidthAndHeight` only re-measures when element sizes change. No `UpdateLayout()`, `Clamp()`, or re-position calls are needed after `ApplyTheme()`. (Confirmed: ARCHITECTURE.md SizeToContent table explicitly states "None" for `ApplyTheme()`.)

---

## Code Examples

### Complete ApplyTheme() Method

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence) + codebase inspection
private void ApplyTheme()
{
    var brush = new System.Windows.Media.SolidColorBrush(_accentColor);

    // Phrase mode
    PhraseText.Foreground = brush;
    // ShadowText: excluded — stays #BB000000 always

    // Dial mode (static XAML elements)
    HourHand.Stroke   = brush;
    MinuteHand.Stroke = brush;

    // Dial decorations (code-behind lists)
    // Safe to call here because ApplyTheme() is always called after InitDialDecorations()
    foreach (var el in _hourTickElements)   el.Stroke     = brush;
    foreach (var el in _minuteDotElements)  el.Fill       = brush;
    foreach (var el in _hourNumberElements) el.Foreground = brush;

    // Stats fill bars
    CpuBar.Background = brush;
    GpuBar.Background = brush;
    MemBar.Background = brush;
    PagBar.Background = brush;

    // Stats percentage text
    CpuText.Foreground = brush;
    GpuText.Foreground = brush;
    MemText.Foreground = brush;
    PagText.Foreground = brush;
}
```

### SetAccentColor() Helper

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
private void SetAccentColor(System.Windows.Media.Color color)
{
    _accentColor = color;
    ApplyTheme();
    SaveSettings();
}
```

### Preset Color Constants and Click Handlers

```csharp
// Source: additional_context canonical values (design authority)
private static readonly System.Windows.Media.Color PresetWhite =
    System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0xFF, 0xFF);
private static readonly System.Windows.Media.Color PresetAmber =
    System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0xC0, 0x00);
private static readonly System.Windows.Media.Color PresetIce =
    System.Windows.Media.Color.FromArgb(0xFF, 0x87, 0xCE, 0xEB);
private static readonly System.Windows.Media.Color PresetGreen =
    System.Windows.Media.Color.FromArgb(0xFF, 0x00, 0xC0, 0x00);
private static readonly System.Windows.Media.Color PresetPink =
    System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0x69, 0xB4);

private void MenuThemeWhite_Click(object sender, RoutedEventArgs e) => SetAccentColor(PresetWhite);
private void MenuThemeAmber_Click(object sender, RoutedEventArgs e) => SetAccentColor(PresetAmber);
private void MenuThemeIce_Click(object sender, RoutedEventArgs e)   => SetAccentColor(PresetIce);
private void MenuThemeGreen_Click(object sender, RoutedEventArgs e) => SetAccentColor(PresetGreen);
private void MenuThemePink_Click(object sender, RoutedEventArgs e)  => SetAccentColor(PresetPink);
```

### _accentColor Field Declaration

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// Add with other private fields in MainWindow:
private System.Windows.Media.Color _accentColor = System.Windows.Media.Colors.White;
```

### ApplySettings() Addition (end of existing method body)

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// Parse hex string to Color struct; catch any invalid input from manually edited settings.json
// SettingsService.Load() already guards against null/empty, but be defensive here too.
try
{
    _accentColor = (System.Windows.Media.Color)
        System.Windows.Media.ColorConverter.ConvertFromString(s.AccentColor);
}
catch
{
    _accentColor = System.Windows.Media.Colors.White;
}
// NOTE: Do NOT call ApplyTheme() here — _hourTickElements etc. are empty until ContentRendered
```

### SaveSettings() Addition

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// Add to the new AppSettings { ... } initializer in SaveSettings():
AccentColor = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}",
// Produces 8-digit AARRGGBB matching AppSettings default format "#FFFFFFFF"
```

### ContextMenu_Opened Addition

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// Add to ContextMenu_Opened() after existing opacity sync:

// Theme preset sync — compare hex from _accentColor to preset constants
// Using AARRGGBB format consistently (presets always have A=FF)
string currentHex = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}";
MenuThemeWhite.IsChecked = (currentHex == "#FFFFFFFF");
MenuThemeAmber.IsChecked = (currentHex == "#FFFFC000");
MenuThemeIce.IsChecked   = (currentHex == "#FF87CEEB");
MenuThemeGreen.IsChecked = (currentHex == "#FF00C000");
MenuThemePink.IsChecked  = (currentHex == "#FFFF69B4");
// When a custom color is active (Phase 21), none match — no checkmark is shown. Correct.
```

### ContentRendered Addition (after InitDialDecorations)

```csharp
// Source: STATE.md locked decision + ARCHITECTURE.md (HIGH confidence)
// In ContentRendered += (_, _) => { ... }, AFTER the existing InitDialDecorations() call:
InitDialDecorations();   // existing
ApplyTheme();            // NEW: must come after InitDialDecorations() or decoration elements are skipped
```

---

## Existing Codebase State (Phase 18 + Phase 19 Complete)

**What is already done — Phase 20 must NOT re-do these:**

**AppSettings.cs:**
```csharp
public string AccentColor { get; init; } = "#FFFFFFFF";  // confirmed in place
public double Opacity     { get; init; } = 1.0;          // confirmed in place
```

**SettingsService.cs — Defaults(), Load() guards:**
```csharp
AccentColor = "#FFFFFFFF",    // in Defaults() — confirmed
Opacity = 1.0,                // in Defaults() — confirmed
// Load() guards for both Opacity <= 0 and IsNullOrWhiteSpace(AccentColor) — confirmed
```

**MainWindow.xaml.cs — Phase 19 additions:**
- `private double _windowOpacity = 1.0;` — in place
- `SetOpacity()` helper — in place
- `MenuOpacity25/50/75/100_Click` handlers — in place
- `Window_PreviewMouseWheel` handler — in place
- `_windowOpacity = s.Opacity; this.Opacity = s.Opacity;` in `ApplySettings()` — in place
- `Opacity = _windowOpacity` in `SaveSettings()` — **in place** (confirmed from code inspection)

**MainWindow.xaml — Phase 19 additions:**
- `PreviewMouseWheel="Window_PreviewMouseWheel"` on Window element — in place
- Opacity submenu with 4 items (`MenuOpacity25/50/75/100`) — in place

**What Phase 20 must add:**

1. `private System.Windows.Media.Color _accentColor = System.Windows.Media.Colors.White;` field in `MainWindow.xaml.cs`
2. Five `static readonly Color` preset constants in `MainWindow.xaml.cs`
3. `ApplyTheme()` private method in `MainWindow.xaml.cs`
4. `SetAccentColor()` private helper in `MainWindow.xaml.cs`
5. Five preset click handlers (`MenuThemeWhite_Click` etc.) in `MainWindow.xaml.cs`
6. Parse `s.AccentColor` → `_accentColor` (try/catch) in `ApplySettings()` — no `ApplyTheme()` call
7. `AccentColor = ...` in `SaveSettings()` record initializer
8. `MenuThemeWhite/Amber/Ice/Green/Pink.IsChecked = ...` in `ContextMenu_Opened()`
9. `ApplyTheme()` call in ContentRendered, after `InitDialDecorations()`
10. Theme submenu XAML (5 `IsCheckable` items in `<MenuItem Header="Theme">`) in `MainWindow.xaml`

**What Phase 20 must NOT touch:**
- `AppSettings.cs` — complete
- `SettingsService.cs` — complete
- Custom color picker (`Custom Color...` menu item) — Phase 21
- `InitDialDecorations()` method body — no changes needed (elements already created with Brushes.White; `ApplyTheme()` replaces the brush after creation)
- `_windowOpacity` / opacity logic — complete

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All elements hardcoded `Foreground="White"` or `Brushes.White` | `ApplyTheme()` assigns `new SolidColorBrush(_accentColor)` | Phase 20 | Single method updates all 14+ elements consistently |
| AccentColor absent from settings | `AppSettings.AccentColor` hex string, default `"#FFFFFFFF"` | Phase 18 (complete) | Theme selection persists across restarts |
| No Theme menu | Theme submenu with 5 named presets | Phase 20 | User-selectable accent color |
| No custom color | `Custom Color...` entry opening ColorDialog | Phase 21 (next) | Arbitrary color via WinForms interop |

**Deprecated/outdated patterns for Phase 20 context:**
- `Brushes.*` frozen instances for dynamic color: do not use as mutable brush source; always create `new SolidColorBrush(color)`.
- Phase 19's intentional omission of `AccentColor` from `SaveSettings()`: this omission must be fixed in Phase 20.

---

## Open Questions

1. **Row label color (CPU/GPU/MEM/PAG text) — confirmed white**
   - What we know: ARCHITECTURE.md explicitly states labels stay white. STATE.md pending todo says "Confirm whether row label text (CPU/GPU/MEM/PAG) follows accent color or stays white (ARCHITECTURE.md leaves them white; confirm before Phase 20)."
   - Recommendation: Leave labels white. The row label TextBlocks have no `x:Name` attribute in the current XAML, making them inaccessible from code-behind without additional plumbing. More importantly, the design rationale is sound: white labels are legible against any accent color (including white accent where white-on-accent-white would be invisible). ARCHITECTURE.md decision is confirmed.

2. **Bar track background — confirmed neutral (no change)**
   - What we know: `CpuBarTrack`, `GpuBarTrack`, `MemBarTrack`, `PagBarTrack` all have `Background="#40FFFFFF"`. FEATURES.md suggests these could become a 25%-alpha tint of the accent color: `Color.FromArgb(0x40, accent.R, accent.G, accent.B)`. ARCHITECTURE.md explicitly excludes them from `ApplyTheme()` and leaves them as `#40FFFFFF`.
   - What's unclear: Whether the user experience is noticeably better with accent-tinted tracks vs neutral white tracks.
   - Recommendation: Keep bar tracks neutral (`#40FFFFFF`) in Phase 20. The ARCHITECTURE.md decision is clear and the bar tracks have no `x:Name` making them harder to update anyway. FEATURES.md "semi-transparent tint" is a nice-to-have, not a requirement per REQUIREMENTS.md THEME-03 (which specifies "stats bars and percentage text" only, not bar tracks). If desired, this is a future enhancement.

3. **Canonical preset hex values — resolved by this research**
   - What we know: STATE.md pending todo flags that "Ice Blue varies across research files." FEATURES.md, ARCHITECTURE.md, and the additional_context all have slightly different Amber and Ice Blue values.
   - Resolution: Use the `<additional_context>` values as authoritative: White `#FFFFFFFF`, Amber `#FFFFC000`, Ice Blue `#FF87CEEB`, Green `#FF00C000`, Hello Kitty Pink `#FFFF69B4`. These should be declared as `static readonly Color` constants in code. The planner should note that STATE.md's pending todo on hex values is resolved by this phase.

---

## Sources

### Primary (HIGH confidence)

- `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml` — direct inspection: all element x:Names, existing Foreground/Stroke/Fill/Background assignments, current XAML structure; no Theme submenu exists yet, Opacity submenu and PreviewMouseWheel present from Phase 19
- `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml.cs` — direct inspection: `_hourTickElements`/`_minuteDotElements`/`_hourNumberElements` list population in `InitDialDecorations()`, `ContentRendered` ordering, `ContextMenu_Opened()` pattern, `_windowOpacity` field and all Phase 19 additions confirmed in place; `AccentColor` absent from `SaveSettings()` confirmed (pending Phase 20)
- `C:/src/FuzzyStatsClock/FuzzyClock.App/AppSettings.cs` — confirmed `AccentColor = "#FFFFFFFF"` and `Opacity = 1.0` init defaults
- `C:/src/FuzzyStatsClock/FuzzyClock.App/SettingsService.cs` — confirmed Phase 18 complete: both `AccentColor` and `Opacity` guards in `Load()`; `Defaults()` has both fields
- `C:/src/FuzzyStatsClock/.planning/research/ARCHITECTURE.md` — complete `ApplyTheme()` implementation, startup ordering constraint, element table, anti-patterns, `SaveSettings()` serialization format (HIGH, first-party research 2026-02-27)
- `C:/src/FuzzyStatsClock/.planning/research/FEATURES.md` — element dependency graph, confirmed shadow text and bar track exclusions, five preset definitions (HIGH, first-party research 2026-02-27)
- `C:/src/FuzzyStatsClock/.planning/STATE.md` — locked decisions: brush pattern (new SolidColorBrush, never mutate Brushes.*), ApplyTheme() ordering constraint, AccentColor as hex string, pending todos about hex values and row labels
- `C:/src/FuzzyStatsClock/.planning/REQUIREMENTS.md` — THEME-01 and THEME-03 requirements text

### Secondary (MEDIUM confidence)

- `C:/src/FuzzyStatsClock/.planning/phases/19-window-opacity/19-RESEARCH.md` — confirms Phase 19 complete, describes `AccentColor` omission from `SaveSettings()` as intentional deferral to Phase 20, documents brush-creation pattern rationale

### External (HIGH confidence via official docs)

- `System.Windows.Media.ColorConverter.ConvertFromString`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.colorconverter — parses `#AARRGGBB` hex strings to `System.Windows.Media.Color`
- `System.Windows.Media.SolidColorBrush`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.solidcolorbrush — creating new instances; frozen brush constraint (`IsFrozen`)
- `System.Windows.Media.Color.FromArgb`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.color.fromargb — factory from byte A,R,G,B components

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs in-box WPF (`PresentationCore.dll`); no NuGet; no csproj changes; confirmed against official docs
- Architecture: HIGH — complete method signatures verified against codebase; StartupOrdering is a locked project decision in STATE.md; element inventory verified by reading XAML and code-behind
- Pitfalls: HIGH — Pitfall 1 (ordering constraint) is documented as locked decision in STATE.md; Pitfall 2 (frozen brush) confirmed by WPF `SolidColorBrush.IsFrozen` behavior; Pitfalls 3/4 identified from codebase state inspection
- Preset hex values: MEDIUM — authoritative source is additional_context; cross-project research files have inconsistencies (documented in Open Questions #3)

**Research date:** 2026-02-27
**Valid until:** 2026-03-29 (30 days — stable WPF APIs, no fast-moving dependencies)
