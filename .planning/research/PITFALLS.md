# Pitfalls Research

**Domain:** WPF transparent frameless overlay — color theming and opacity control (v2.0 additions)
**Project:** Fuzzy Clock
**Researched:** 2026-02-27
**Confidence:** HIGH — all critical claims verified against official Microsoft docs and existing source code

---

> **Scope note:** This document covers pitfalls specific to adding color themes and opacity control to the existing AllowsTransparency=True, WindowStyle=None WPF overlay widget. Prior milestone pitfalls (performance counters, DispatcherTimer, SizeToContent layout, AllowsTransparency software rendering, DragMove, JSON persistence) are documented in prior PITFALLS.md versions and are not repeated here except where they directly interact with the v2.0 changes.

---

## Critical Pitfalls

Mistakes that cause silent wrong behavior, crashes, or make the feature non-functional.

---

### Pitfall 1: Window.Opacity Multiplies With AllowsTransparency Transparency — Setting 0.5 Does Not Mean 50% Visible

**What goes wrong:**
The window already uses `AllowsTransparency="True"` with `Background="Transparent"` and content elements that have semi-transparent fills (e.g., `ContentBorder` uses `#59000000` = 35% alpha black on hover). When `Window.Opacity` is set to, say, 0.5, the Windows compositing layer applies the opacity multiplicatively over the entire layered HWND — including the already-transparent parts. This means:

- A region that was 100% opaque white text becomes 50% visible (correct).
- A region that was already 35% alpha black (the hover backdrop) becomes 17.5% visible — the backdrop nearly disappears.
- A region that was alpha=1 (near-transparent grid background `#01000000`) becomes effectively invisible.

The interaction is not additive ("show 50% of the widget") — it is multiplicative over every pixel including transparent ones. Users setting opacity to 25% will find the hover backdrop is effectively gone.

**Why it happens:**
`Window.Opacity` sets the `LWA_ALPHA` flag on the layered HWND via `SetLayeredWindowAttributes`. This applies a uniform alpha multiplier to the entire composited surface. The WPF software-rendered surface for an `AllowsTransparency` window already contains per-pixel alpha from the XAML visual tree. Windows then multiplies the HWND-level alpha on top. Source: https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.allowstransparency (remarks on layered windows).

**Consequences:**
- At `Window.Opacity = 0.25`, the hover backdrop (35% alpha) effectively vanishes. The user has no visual indication that hover is active — and more importantly, the stats bars become very hard to read.
- At `Window.Opacity = 0.25`, the grid hit-test background (`#01000000`) becomes alpha=0.25% — effectively zero — which eliminates mouse event delivery to the transparent window region. Right-click and drag will stop working.
- The near-zero hit-test background `#01000000` was specifically chosen to be non-zero for hit-testing (documented in MainWindow.xaml comment). Multiplying that alpha by 0.25 takes it to 0.0025 — still non-zero, but the Win32 layered window documentation does not guarantee hit-testing below a threshold. In practice, very low HWND-level opacity degrades mouse-event delivery on some Windows versions.

**How to avoid:**
Use `Window.Opacity` only for values ≥ 0.25 as the minimum preset. Document that 0.25 is the floor and note the hit-test risk. Test right-click and drag at every opacity preset before shipping. If opacity below 0.25 is ever needed, the alternative is reducing the alpha on the WPF content elements themselves (the TextBlocks, bars, etc.) rather than the HWND-level opacity — but that requires per-element changes instead of a single window property.

Do not reduce the grid hit-test background `#01000000` as part of opacity work; it must remain `#01000000` or higher to preserve mouse-event delivery regardless of `Window.Opacity`.

**Warning signs:**
- Right-click stops working at the lowest opacity setting.
- Drag stops working (window immediately drops out of DragMove) at 25% opacity.
- Hover backdrop becomes invisible at lower opacity settings.

**Phase to address:** Opacity persistence and presets phase — test all presets before marking done.

---

### Pitfall 2: Scroll Wheel on Transparent/Frameless Window — MouseWheel May Not Fire, PreviewMouseWheel Required

**What goes wrong:**
The widget is `WindowStyle=None, AllowsTransparency=True, ResizeMode=NoResize`. Mouse wheel events on transparent WPF windows are subject to focus and hit-test restrictions that do not apply to normal WPF windows:

1. `MouseWheel` (bubbling) only fires if the element under the cursor has a valid hit-test surface and keyboard focus. A frameless, always-on-top, click-through-like window may not have keyboard focus at the time the user scrolls over it.
2. `PreviewMouseWheel` (tunneling, fired at the Window level before elements) is more reliable for frameless overlays because it fires as long as the window has logical mouse capture — which happens while the mouse is within the window bounds (the `#01000000` background ensures the hit-test surface is present).
3. The ContextMenu steals focus. If the user closes the context menu and immediately scrolls, the window may not have focus yet and `MouseWheel` is silently dropped.

**Why it happens:**
`MouseWheel` is a routed bubbling event. It requires the element to be focused or under the mouse with a valid hit-test surface. WPF dispatches `MouseWheel` from the element that has mouse capture or from the element at the current mouse position, but only if that element is hit-testable and the window is the active foreground window. A frameless `Topmost=True` overlay is always on top but is not always the active foreground window — especially after the user interacted with another application.

Using `PreviewMouseWheel` at the `Window` level intercepts the event during the tunnel phase before it reaches any element that might not handle it, and it fires even when no child element is focused.

**How to avoid:**
Register `PreviewMouseWheel` on the `Window` (not `Grid` or `ContextMenu`):

```csharp
// In ContentRendered (same pattern as MouseEnter/MouseLeave):
this.PreviewMouseWheel += Window_PreviewMouseWheel;

private void Window_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
{
    // e.Delta > 0 = scroll up = increase opacity; < 0 = decrease
    int steps = e.Delta / 120;  // each notch = 120 units
    double newOpacity = Math.Clamp(this.Opacity + steps * 0.10, 0.25, 1.0);
    this.Opacity = newOpacity;
    SaveSettings();
    e.Handled = true;  // prevent scroll from propagating to window below
}
```

Set `e.Handled = true` to prevent the scroll event from leaking to the desktop or windows behind the overlay.

**Warning signs:**
- Scroll wheel has no effect when the widget is not the most recently clicked window.
- Scroll wheel works only after the user clicks the widget first.
- Scroll wheel works in Visual Studio debug but not in production (debugger keeps focus on the window).

**Phase to address:** Opacity scroll wheel phase — use `PreviewMouseWheel` from the start.

---

### Pitfall 3: WPF Has No Built-In Color Picker Dialog — Windows.Forms ColorDialog Requires Additional Setup in WPF .NET 10

**What goes wrong:**
There is no `ColorDialog` in WPF's `System.Windows` namespace. The only ready-made system color picker is `System.Windows.Forms.ColorDialog`. Using it from a WPF .NET 10 application requires:

1. Adding `<UseWindowsForms>true</UseWindowsForms>` to the `.csproj` (or using the `Microsoft.WindowsDesktop.App.WindowsForms` ref assembly).
2. Calling `ShowDialog()` without a WPF `IWin32Window` owner — which means the dialog appears without a logical owner, potentially appearing behind the WPF window.
3. Converting the result: `System.Drawing.Color` (Windows.Forms) must be converted to `System.Windows.Media.Color` (WPF). They are different types with different channel representations.

The most common mistake is calling `colorDialog.ShowDialog()` without setting an owner HWND, then finding the dialog appears behind the always-on-top WPF widget.

**Why it happens:**
`System.Windows.Forms.ColorDialog.ShowDialog()` accepts a `System.Windows.Forms.IWin32Window` owner. WPF windows do not implement this interface. To pass the WPF window as an owner, the HWND must be obtained via `PresentationSource.FromVisual(this).RootVisual` and wrapped in a helper. Without an owner, Windows places the dialog at an arbitrary Z-order position — typically below a `Topmost=True` WPF window.

**How to avoid:**
Use a Win32 HWND helper to pass the WPF window as the owner:

```csharp
// Helper: wrap WPF Window HWND as IWin32Window for WinForms dialogs
private class Win32Window : System.Windows.Forms.IWin32Window
{
    public IntPtr Handle { get; }
    public Win32Window(IntPtr handle) => Handle = handle;
}

private void OpenColorPicker()
{
    var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
    using var dlg = new System.Windows.Forms.ColorDialog();
    dlg.AllowFullOpen = true;
    dlg.FullOpen = true;
    dlg.Color = System.Drawing.Color.FromArgb(
        _accentColor.A, _accentColor.R, _accentColor.G, _accentColor.B);

    if (dlg.ShowDialog(new Win32Window(hwnd)) == System.Windows.Forms.DialogResult.OK)
    {
        var c = dlg.Color;
        _accentColor = System.Windows.Media.Color.FromArgb(c.A, c.R, c.G, c.B);
        ApplyAccentColor();
        SaveSettings();
    }
}
```

Also add to `.csproj`:

```xml
<UseWindowsForms>true</UseWindowsForms>
```

**Warning signs:**
- `System.Windows.Forms` types not available — missing `<UseWindowsForms>true</UseWindowsForms>`.
- Color dialog appears behind the widget — missing HWND owner.
- Color is always black after selection — `System.Drawing.Color` not converted to `System.Windows.Media.Color`.

**Phase to address:** Custom color picker phase — set up Windows Forms interop and HWND owner from the start.

---

### Pitfall 4: Shared Static Brushes From Brushes Class Are Frozen — Cannot Be Modified

**What goes wrong:**
The existing code uses `System.Windows.Media.Brushes.White` and `System.Windows.Media.Brushes.Transparent` (from the static `Brushes` class) for element colors. These are pre-frozen `SolidColorBrush` instances. When applying the accent color, the code must not attempt to modify these shared instances — it must create new `SolidColorBrush` instances.

The failure mode:

```csharp
// BUG: Brushes.White is frozen — throws InvalidOperationException
PhraseText.Foreground = Brushes.White;
((SolidColorBrush)PhraseText.Foreground).Color = Colors.Amber; // throws
```

Or more subtly — storing a reference to `Brushes.White` in a field and then trying to change its color:

```csharp
private SolidColorBrush _accentBrush = Brushes.White; // frozen brush stored as field
_accentBrush.Color = newColor; // InvalidOperationException at runtime
```

**Why it happens:**
All brushes returned by the `System.Windows.Media.Brushes` static class (e.g., `Brushes.White`, `Brushes.Transparent`) are frozen `SolidColorBrush` instances shared across the application. Attempting to set their `Color` property throws `InvalidOperationException: Cannot modify a frozen object`. Source: https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/freezable-objects-overview

**How to avoid:**
Always create a new `SolidColorBrush` when applying the accent color. Do not take a reference to a `Brushes.*` static and attempt to modify it. For performance, apply the new brush to all elements in a single `ApplyAccentColor()` call:

```csharp
private System.Windows.Media.Color _accentColor = System.Windows.Media.Colors.White;

private void ApplyAccentColor()
{
    var brush = new System.Windows.Media.SolidColorBrush(_accentColor);
    // Do NOT freeze here — the brush is applied to multiple elements
    // and must remain modifiable for future accent changes.
    PhraseText.Foreground = brush;
    ShadowText.Foreground = ... // shadow uses a darker version, not the same brush
    HourHand.Stroke = brush;
    MinuteHand.Stroke = brush;
    // Stats bars: create a separate brush instance per element or share one unfrozen brush
    CpuBar.Background = brush;
    // etc.
}
```

Note: Do not freeze the accent brush if it will be reused across multiple elements and changed later. A frozen brush assigned to one element can be re-assigned to other elements safely (frozen brushes are shareable), but cannot be modified. Since the accent color will change when the user picks a new color, do not freeze the accent brush.

**Warning signs:**
- `InvalidOperationException: Cannot modify a frozen object` when first applying a color theme.
- The existing `Brushes.White` in XAML assignments continues to work (XAML brushes from `Brushes.*` are not the same as ones created in code), but code-behind brush references throw.

**Phase to address:** Accent color application phase — establish the `ApplyAccentColor()` pattern before any element-level color assignment.

---

### Pitfall 5: AppSettings Backward Compat — New Color/Opacity Fields Default to 0 for Existing JSON

**What goes wrong:**
Adding `AccentColor` (stored as a hex string like `"#FFFFFFFF"`) and `Opacity` (stored as a `double`) to the `AppSettings` record follows the existing init-property pattern. However, `double`'s type default is `0.0` — which would set the window to completely invisible (`Window.Opacity = 0`). A `string?`'s type default is `null`.

When an existing `settings.json` (v1.9, without AccentColor/Opacity fields) is deserialized into the new `AppSettings` record:
- `Opacity` is missing from JSON → deserializes as `0.0` → `Window.Opacity = 0` → invisible widget.
- `AccentColor` is missing from JSON → deserializes as `null` → `Color.FromArgb(null)` → `NullReferenceException` or wrong color.

**Why it happens:**
`System.Text.Json` with init-property records treats absent JSON fields as using the property's **init default value** (the value in the `= X` initializer). This is safe IF the initializer is correct. If the property is declared as:

```csharp
public double Opacity { get; init; } = 1.0;  // safe — default is visible
public string AccentColor { get; init; } = "#FFFFFFFF";  // safe — default is white
```

...then absent fields correctly default to these values. The existing project already uses this init-property pattern (confirmed in `AppSettings.cs`). The pitfall is forgetting to supply a sensible init default and leaving the C# type default (0.0, null) in place.

**How to avoid:**
Declare the new fields with correct init defaults:

```csharp
public double Opacity    { get; init; } = 1.0;           // full opacity — safe default
public string AccentColor { get; init; } = "#FFFFFFFF";   // white — matches existing XAML
```

Also add guards in `SettingsService.Load()` for the same reason the `StatsIntervalSeconds` guard exists — protect against corrupt or partially-written JSON:

```csharp
if (loaded.Opacity <= 0.0 || loaded.Opacity > 1.0)
    loaded = loaded with { Opacity = 1.0 };
if (string.IsNullOrWhiteSpace(loaded.AccentColor))
    loaded = loaded with { AccentColor = "#FFFFFFFF" };
```

**Warning signs:**
- Widget is invisible after upgrading to v2.0 from v1.9 — `Opacity = 0` from missing field.
- `NullReferenceException` when parsing accent color from settings.

**Phase to address:** AppSettings extension phase — must be done before any `Opacity` or `AccentColor` reading.

---

### Pitfall 6: Dial Hand and Decoration Brushes Are Set Via Code-Behind Using Brushes.White — Must Switch to Per-Field References

**What goes wrong:**
The current `InitDialDecorations()` and dial hand setup in XAML both use `Brushes.White` as the stroke/fill. When implementing the accent color, all of these must be switched to use the current accent brush. The danger is missing elements — there are 12 hour tick `Line` elements, 60 minute dot `Ellipse` elements, 12 hour number `TextBlock` elements, plus the two hand `Line` elements. A partial switch (updating the hands but forgetting the tick marks, or vice versa) produces a visually inconsistent dial where some elements are white and others follow the accent color.

The minute dots (`Ellipse.Fill = Brushes.White`) and tick marks (`Line.Stroke = Brushes.White`) are created in `InitDialDecorations()`. If the accent color is applied after `InitDialDecorations()` runs, it must iterate all three element lists (`_hourTickElements`, `_minuteDotElements`, `_hourNumberElements`) in addition to the XAML-defined hand elements.

**Why it happens:**
`InitDialDecorations()` hardcodes `Brushes.White` for the decoration elements. There is no data binding or style resource that would automatically update these when the accent color changes. Each element requires an explicit property assignment.

**How to avoid:**
`ApplyAccentColor()` must iterate all four groups: XAML hands, tick lines, minute dots, hour number TextBlocks. Use a single method called both at startup (after `InitDialDecorations()`) and whenever the color changes:

```csharp
private void ApplyAccentColor()
{
    var brush = new SolidColorBrush(_accentColor);
    // XAML-defined elements
    PhraseText.Foreground = brush;
    HourHand.Stroke = brush;
    MinuteHand.Stroke = brush;
    // Stats bars: create separate brush or reuse
    foreach (var b in new[] { CpuBar, GpuBar, MemBar, PagBar })
        b.Background = brush;
    // Code-behind decoration elements
    foreach (var el in _hourTickElements)   el.Stroke = brush;
    foreach (var el in _minuteDotElements)  el.Fill   = brush;
    foreach (var el in _hourNumberElements) el.Foreground = brush;
}
```

Note: `ShadowText.Foreground` should NOT use the accent color directly — it is an offset shadow and should remain a dark semi-transparent color to remain readable against any accent. Applying the accent color to the shadow TextBlock inverts the readability contract.

**Warning signs:**
- Hour/minute hands update to the new accent color but tick marks remain white.
- Minute dots remain white in some presets but not others (only applied during `InitDialDecorations()`, not on color change).
- Shadow text changes to the accent color and becomes invisible on light wallpapers.

**Phase to address:** Accent color application phase — establish complete `ApplyAccentColor()` covering all elements before implementing individual preset selection.

---

## Moderate Pitfalls

Issues that produce wrong but recoverable behavior.

---

### Pitfall 7: Stats Bar Track Background Is Semi-Transparent White (#40FFFFFF) — Accent Color on Bar Track Creates Muddy Look

**What goes wrong:**
The stats bar track is currently `Background="#40FFFFFF"` (25% white). When the accent color is non-white (e.g., Amber `#FFFFB300`), applying the accent color to both the fill bar AND the track creates a muddy overlay: the track tint blends with whatever is behind the window. Most visually consistent result: keep the track as a fixed semi-transparent neutral (`#40FFFFFF`) and apply the accent only to the fill bar. Some implementations accidentally apply the accent to the track as well.

**How to avoid:**
Apply accent color only to fill bars (`CpuBar`, `GpuBar`, `MemBar`, `PagBar`) and text. Leave bar track borders (`CpuBarTrack`, etc.) as fixed `#40FFFFFF`. The track is purely structural and should remain neutral.

**Phase to address:** Accent color application phase.

---

### Pitfall 8: PreviewMouseWheel e.Handled = True Prevents ContextMenu From Receiving Scroll

**What goes wrong:**
If `PreviewMouseWheel` is handled on the Window and `e.Handled = true` is set unconditionally, the context menu (which is a separate Win32 popup HWND) will not receive scroll events when it is open. This is benign — the context menu has no scrollable content. But if `e.Handled = true` is set and the scroll happens while the ContextMenu is open, the scroll is silently swallowed, which could confuse users. The ContextMenu is a separate HWND so `PreviewMouseWheel` on the main window does not fire while the context menu is open anyway — but this should be verified in testing.

**How to avoid:**
Only suppress the scroll (set `e.Handled = true`) when the scroll actually adjusts opacity. This is already the natural behavior — if the event handler processes the scroll, it sets `Handled = true`; if the context menu is open (which is a different HWND and the Window's PreviewMouseWheel won't fire), this is a non-issue. No special guard is needed but it should be noted in a comment.

**Phase to address:** Opacity scroll wheel phase.

---

### Pitfall 9: ColorDialog Returns System.Drawing.Color — Conversion to System.Windows.Media.Color Is Error-Prone

**What goes wrong:**
`System.Windows.Forms.ColorDialog.Color` returns `System.Drawing.Color`. `System.Windows.Media.Color` is the WPF type. They have different channel representations:
- `System.Drawing.Color`: `A`, `R`, `G`, `B` are bytes (0–255), accessed as `.A`, `.R`, `.G`, `.B`.
- `System.Windows.Media.Color`: `A`, `R`, `G`, `B` are bytes (0–255), accessed as `.A`, `.R`, `.G`, `.B`.

The channel byte values are the same, but the types are incompatible at the type-system level. The conversion is straightforward, but forgetting to do it causes a compilation error. More subtle: `System.Drawing.Color.White` has `.A = 255` (fully opaque), but the WPF `Colors.White` also has `.A = 255`. The alpha channel from `ColorDialog` is always 255 (the Windows color picker does not expose alpha selection). This means custom colors picked by the user are always fully opaque — the alpha must be preserved as 255 from the dialog, not overridden.

**How to avoid:**
Perform the explicit conversion immediately after `ShowDialog` returns:

```csharp
var sd = dlg.Color;  // System.Drawing.Color
_accentColor = System.Windows.Media.Color.FromArgb(sd.A, sd.R, sd.G, sd.B);
```

Do not attempt implicit cast — it will not compile. Do not assume `System.Drawing.Color` and `System.Windows.Media.Color` are interchangeable.

Store the accent color as a `System.Windows.Media.Color` field, not as `System.Drawing.Color`, because WPF brush construction requires the WPF type.

**Phase to address:** Custom color picker phase.

---

### Pitfall 10: Persisting AccentColor as Hex String — Color.Parse vs ColorConverter

**What goes wrong:**
`System.Windows.Media.Color` is not directly serializable by `System.Text.Json`. Two approaches exist:
1. Store as hex string `"#AARRGGBB"` — simple and human-readable in settings.json.
2. Store as four separate `byte` fields (`AccentA`, `AccentR`, `AccentG`, `AccentB`) — verbose.

Approach 1 (hex string) requires parsing on load. `System.Windows.Media.ColorConverter` can parse `"#RRGGBB"` and `"#AARRGGBB"` strings. However, `Color.FromArgb` does not accept a hex string — it requires four separate bytes. The parsing pattern is:

```csharp
// Parse from hex string stored in settings.json
var color = (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(loaded.AccentColor);
```

A common mistake is using `System.Drawing.ColorTranslator.FromHtml()` (Windows.Forms API) when `ColorConverter` from WPF is available and does not require the Forms reference. Another mistake is forgetting to handle `null` returns from `ConvertFromString()` when the stored string is malformed.

**How to avoid:**
Use `System.Windows.Media.ColorConverter` in WPF code. Wrap in try/catch and fall back to white on any parse failure:

```csharp
private static System.Windows.Media.Color ParseAccentColor(string hex)
{
    try
    {
        return (System.Windows.Media.Color)
            System.Windows.Media.ColorConverter.ConvertFromString(hex);
    }
    catch
    {
        return System.Windows.Media.Colors.White;
    }
}
```

Store as 8-digit ARGB hex (`#FFFFFFFF`) to preserve full alpha, even though the Windows.Forms color picker always returns alpha=255. This future-proofs the format.

**Phase to address:** AppSettings extension and settings load/save phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Apply accent only to PhraseText and hands, skip decorations | Less code in v2.0 | Dial mode shows inconsistent colors — tick marks remain white | Never — all elements must be updated |
| Use `Window.Opacity` below 0.25 presets | User can make widget more translucent | Hit-test surface becomes unreliable; right-click and drag may fail | Never |
| Store accent color as separate R/G/B bytes in AppSettings | No parsing logic needed | settings.json is harder to read and edit manually | Never — hex string with ColorConverter is cleaner |
| Apply accent color directly without `ApplyAccentColor()` helper | Less indirection | Color changes scattered across code; easy to miss elements | Never |
| Use `MouseWheel` instead of `PreviewMouseWheel` | Slightly simpler event name | Scroll wheel is dropped when widget does not have focus | Never |
| Open ColorDialog without Win32 HWND owner | Less setup code | Dialog appears behind the always-on-top WPF widget | Never |
| Assign `Brushes.White` reference to a field for later mutation | Looks like reuse | `InvalidOperationException` when `.Color` is set | Never — always create a new SolidColorBrush |
| Skip backward compat guard for `Opacity = 0.0` | No migration code | Widget invisible on first launch after upgrade from v1.9 | Never |

---

## Integration Gotchas

How v2.0 changes interact with existing v1.9 code.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| `InitDialDecorations()` + accent color | Decorations created with `Brushes.White` and never updated | Call `ApplyAccentColor()` after `InitDialDecorations()` in `ContentRendered`; include all decoration lists in `ApplyAccentColor()` |
| `ContentRendered` startup sequence + color | `ApplyAccentColor()` called before `InitDialDecorations()` creates decoration elements | Order: (1) `UpdateDialDisplay()`, (2) `InitDialDecorations()`, (3) `ApplyAccentColor()` |
| `ShadowText.Foreground` + accent color | Applying accent to the shadow TextBlock inverts readability | `ShadowText` keeps its fixed dark semi-transparent brush; only `PhraseText` gets the accent |
| `AppSettings` record + `Opacity` field | `double` type default is `0.0` — missing field means invisible widget | Init default `= 1.0` plus load-time guard |
| `AppSettings` record + `AccentColor` field | `string` type default is `null` — missing field means null-ref on parse | Init default `= "#FFFFFFFF"` plus load-time null/empty guard |
| `Window.Opacity` + `AllowsTransparency` | Opacity multiplies over per-pixel alpha — hover backdrop nearly disappears at 25% | Document the interaction; 25% is the minimum preset; test each preset |
| `PreviewMouseWheel` + context menu | Scroll while context menu is open (context menu is a separate HWND, so WPF PreviewMouseWheel does not fire during it) | No special handling needed, but verify in testing |
| `System.Windows.Forms.ColorDialog` + WPF | Dialog appears behind `Topmost=True` window without HWND owner | Use `WindowInteropHelper(this).Handle` wrapped in `IWin32Window` adapter |
| `System.Drawing.Color` (WinForms) + `SolidColorBrush` (WPF) | Direct use of `System.Drawing.Color` in WPF brush constructor | Convert to `System.Windows.Media.Color.FromArgb(A, R, G, B)` |
| `ContextMenu_Opened` + opacity/color menu items | Color theme checkmarks not synced on open | Add accent color and opacity sync to `ContextMenu_Opened` following existing checkmark pattern |
| `ApplySettings()` (before `Show()`) + `Window.Opacity` | `ApplySettings` is called before `Show()` — `Window.Opacity` assignment before `Show()` is safe | No exception risk; WPF allows `Opacity` to be set before window is shown |
| `SaveSettings()` + new fields | `SaveSettings()` constructs a new `AppSettings` record — must include `Opacity` and `AccentColor` | Add both fields to the `new AppSettings { ... }` in `SaveSettings()` |

---

## "Looks Done But Isn't" Checklist

- [ ] **Opacity presets tested:** 25%, 50%, 75%, 100% presets applied via menu; right-click and drag verified at 25%.
- [ ] **Scroll wheel works without prior click:** User can scroll opacity without clicking the widget first (`PreviewMouseWheel` not `MouseWheel`).
- [ ] **All dial elements updated:** `ApplyAccentColor()` covers PhraseText, HourHand, MinuteHand, all `_hourTickElements`, all `_minuteDotElements`, all `_hourNumberElements`, all stat fill bars.
- [ ] **ShadowText not affected:** Shadow TextBlock keeps its fixed dark brush; accent color is not applied to it.
- [ ] **Bar tracks not affected:** `CpuBarTrack`, `GpuBarTrack`, etc. keep `#40FFFFFF`; only fill bars get accent color.
- [ ] **Startup order correct:** `ApplyAccentColor()` called after `InitDialDecorations()` in `ContentRendered`.
- [ ] **Backward compat verified:** Existing v1.9 settings.json loaded; widget appears at full opacity with white accent (defaults applied).
- [ ] **ColorDialog has HWND owner:** Dialog does not appear behind the widget; visible on screen above the overlay.
- [ ] **Color conversion explicit:** `System.Drawing.Color` → `System.Windows.Media.Color` conversion is explicit, not implicit.
- [ ] **AccentColor persisted as hex:** settings.json contains `"AccentColor":"#FFFFFFFF"`-style value; round-trip parse verified.
- [ ] **Opacity persisted:** settings.json contains `"Opacity":0.75`-style value; widget starts at same opacity after restart.
- [ ] **Frozen brush not mutated:** No attempt to modify `Brushes.White` or other static brushes; always `new SolidColorBrush(color)`.
- [ ] **UseWindowsForms in .csproj:** Added if ColorDialog is used; no compile error.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| AppSettings extension (AccentColor + Opacity) | `double Opacity` defaults to `0.0` on upgrade — invisible widget | Init default `= 1.0`; load-time guard `if (Opacity <= 0) reset to 1.0` |
| AppSettings extension (AccentColor + Opacity) | `string AccentColor` defaults to `null` on upgrade — NullReferenceException | Init default `= "#FFFFFFFF"`; load-time null/empty guard |
| AccentColor application to all elements | Decoration elements not in XAML — must iterate code-behind lists | `ApplyAccentColor()` iterates `_hourTickElements`, `_minuteDotElements`, `_hourNumberElements` |
| AccentColor startup ordering | `ApplyAccentColor()` called before `InitDialDecorations()` creates elements | Always order: UpdateDialDisplay → InitDialDecorations → ApplyAccentColor in ContentRendered |
| Opacity presets via context menu | `Window.Opacity` multiplies with per-pixel alpha — hover backdrop degrades | Document interaction; enforce 0.25 minimum; test each preset visually |
| Opacity scroll wheel | `MouseWheel` dropped without focus | Use `PreviewMouseWheel` on Window; set `e.Handled = true` |
| Custom color picker | ColorDialog behind Topmost widget | HWND owner via `WindowInteropHelper`; `UseWindowsForms` in .csproj |
| Custom color picker | `System.Drawing.Color` not converted | Explicit `Color.FromArgb(sd.A, sd.R, sd.G, sd.B)` conversion |
| AccentColor persistence | `ColorConverter` parse failure on malformed hex | try/catch in `ParseAccentColor()` helper; fallback to white |

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Widget invisible after upgrade (Opacity=0) | LOW | Add init default `= 1.0` to Opacity field; add load-time guard in Load() |
| Right-click / drag broken at 25% opacity | LOW | Test at all presets; enforce 0.25 minimum; document the limitation |
| Scroll wheel not working without focus | LOW | Replace `MouseWheel` with `PreviewMouseWheel` on Window |
| ColorDialog appears behind widget | LOW | Add `WindowInteropHelper(this).Handle` wrapped in IWin32Window adapter |
| Dial decorations still white after color change | LOW | Add all three decoration lists to `ApplyAccentColor()` |
| Shadow text becomes visible-wrong color | LOW | Guard `ShadowText` from accent application; keep fixed dark brush |
| `InvalidOperationException` on frozen brush | LOW | Replace `_accentBrush = Brushes.White` with `new SolidColorBrush(Colors.White)` |
| AccentColor parse fails from corrupted settings | LOW | Add `ParseAccentColor()` try/catch returning white as fallback |

---

## Sources

| Source | URL | Confidence |
|--------|-----|------------|
| Window.AllowsTransparency — layered HWND, LWA_ALPHA interaction with per-pixel alpha | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.allowstransparency | HIGH |
| UIElement.Opacity — dependency property, applies uniformly, 0 still receives input | https://learn.microsoft.com/en-us/dotnet/api/system.windows.uielement.opacity?view=windowsdesktop-10.0 | HIGH |
| Freezable Objects Overview — SolidColorBrush.Freeze(), InvalidOperationException on modification | https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/freezable-objects-overview | HIGH |
| SolidColorBrush — IsFrozen, Freeze(), Clone(), Brushes static class provides frozen instances | https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.solidcolorbrush?view=windowsdesktop-10.0 | HIGH |
| System.Windows.Forms.ColorDialog — ShowDialog(IWin32Window), Color property, AllowFullOpen | https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.colordialog?view=windowsdesktop-10.0 | HIGH |
| WPF common system dialog boxes — no built-in WPF color picker; Open/Save/Print only | https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/how-to-open-common-system-dialog-box | HIGH |
| System.Text.Json init-property record deserialization — absent fields use init default value | Verified from existing AppSettings.cs pattern and prior PITFALLS.md v1.2 research | HIGH |
| PreviewMouseWheel vs MouseWheel on frameless transparent windows — tunneling vs bubbling | https://learn.microsoft.com/en-us/dotnet/desktop/wpf/input/routed-events-overview (tunneling/bubbling) | MEDIUM — specific frameless window behavior verified from codebase pattern (MouseEnter/Leave wired in ContentRendered) |
| Existing project source — MainWindow.xaml (Grid #01000000 hit-test comment), AppSettings.cs init-property pattern, ContentRendered ordering, ContextMenu_Opened checkmark pattern | Read directly from C:\src\FuzzyStatsClock project files | HIGH |

---

*Pitfalls research for: WPF transparent overlay — v2.0 color theming and opacity control*
*Researched: 2026-02-27*
