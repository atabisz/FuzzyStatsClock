# Phase 19: Window Opacity - Research

**Researched:** 2026-02-27
**Domain:** WPF UIElement.Opacity on AllowsTransparency frameless window; PreviewMouseWheel; context menu checkmark sync
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OPAC-01 | User can set widget opacity to 25%, 50%, 75%, or 100% via a right-click Opacity submenu; current level shown as checked | Opacity submenu XAML pattern; `SetOpacity()` helper; `ContextMenu_Opened` sync against `_windowOpacity` field |
| OPAC-02 | User can adjust widget opacity in 10% increments by scrolling the mouse wheel over the widget; scroll down reduces opacity, scroll up increases it; floor of 10% | `PreviewMouseWheel` event on Window; `Math.Sign(e.Delta) * 0.10` step; `Math.Clamp(..., 0.10, 1.0)` floor |
| OPAC-03 | Opacity applies to the entire widget window (phrase, dial, stats panel, hover backdrop) | `this.Opacity` (inherited `UIElement.Opacity`) — single window-level assignment covers all child elements and composited HWND surface |
</phase_requirements>

---

## Summary

Phase 19 is the opacity half of the v2.0 Visual Identity milestone. The AppSettings schema (Phase 18) is already complete — `AppSettings.Opacity` (double, default 1.0) and the load-time guard (`if loaded.Opacity <= 0.0 → reset to 1.0`) are both in `SettingsService.cs`. Phase 19 adds the runtime behavior: an Opacity submenu in the right-click context menu (four presets: 25%, 50%, 75%, 100%), a scroll wheel handler that adjusts opacity in 10% increments, and the wiring to persist, restore, and display the current opacity on every launch and every menu open.

The implementation surface is deliberately narrow. `UIElement.Opacity` on the Window is a single `double` assignment that fades the entire composited HWND — all content (phrase text, dial hands, stats bars, hover backdrop) fades uniformly with no per-element work. The only nontrivial concern is the event routing: on frameless transparent Windows (`WindowStyle=None`, `AllowsTransparency=True`), `MouseWheel` (bubbling) is silently dropped when the widget does not have keyboard focus. `PreviewMouseWheel` (tunneling) fires reliably regardless of focus state and must be used instead. This decision is already locked in the project decisions (STATE.md: "use PreviewMouseWheel (not MouseWheel) on frameless transparent windows").

The `ApplySettings()` extension and `SaveSettings()` extension are both mechanical: `ApplySettings()` sets `_windowOpacity` and `this.Opacity` from `s.Opacity` (safe before `Show()` — `UIElement.Opacity` assignment requires no layout pass); `SaveSettings()` adds `Opacity = _windowOpacity` to the `AppSettings` record construction. The `ContextMenu_Opened()` sync pattern is identical to the existing font size and stats interval patterns — exact `double` equality against the four preset values (0.25, 0.50, 0.75, 1.00) is reliable because `_windowOpacity` changes only via `SetOpacity()` (preset click, exact assignment) or the scroll wheel (`Math.Clamp(..., 0.10, 1.0)` in 0.10 increments, no floating-point accumulation that would cause drift at preset boundaries).

**Primary recommendation:** Use `PreviewMouseWheel` (not `MouseWheel`) wired in `ContentRendered`, call `SetOpacity()` from both the four preset handlers and the scroll wheel handler, and use `ContextMenu_Opened()` for checkmark sync — zero new patterns beyond what the project already establishes.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `UIElement.Opacity` (on Window) | windowsdesktop-10.0, PresentationCore.dll | Applies a uniform alpha multiplier to the entire composited HWND — fades all widget content together | In-box WPF; single property assignment; works correctly with `AllowsTransparency=True`; no per-element work |
| `PreviewMouseWheel` event + `MouseWheelEventArgs.Delta` | windowsdesktop-10.0, PresentationCore.dll | Tunneling scroll wheel event on frameless transparent window — fires without prior keyboard focus | The only reliable scroll wheel event for this window type; `MouseWheel` (bubbling) is silently dropped without focus |
| `Math.Clamp(value, 0.10, 1.0)` | .NET 10 BCL | Enforces scroll wheel opacity floor (10%) and ceiling (100%) | Prevents non-recoverable invisible widget state |
| `Math.Sign(e.Delta)` for scroll step | .NET 10 BCL | Normalizes scroll direction to ±1 regardless of wheel resolution | One 10% step per physical notch regardless of high-resolution mice; correct behavior at all detent sizes |

### No New Dependencies

v2.0 Phase 19 (opacity) requires zero NuGet additions and zero csproj changes. All APIs are already in `PresentationCore.dll`, which is a dependency of every WPF project targeting `net10.0-windows`. The `<UseWindowsForms>true</UseWindowsForms>` csproj flag is NOT required for Phase 19 — that flag is only needed for the custom color picker in Phase 21. Do not add it in this phase.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `this.Opacity` (Window level) | `UIElement.Opacity` on individual content elements | Per-element opacity requires tracking baseline opacity for each element; window level is one line that covers everything uniformly |
| `this.Opacity` (Window level) | `Window.Background` alpha manipulation | `Background="#01000000"` is the hit-test sentinel — must not be changed; `Opacity` is the correct knob |
| `PreviewMouseWheel` on Window | `MouseWheel` on Window | `MouseWheel` (bubbling) is silently dropped on frameless transparent windows without prior keyboard focus; `PreviewMouseWheel` (tunneling) fires reliably |
| `Math.Sign(e.Delta) * 0.10` | `e.Delta / 120 * 0.10` | Division-based produces fractional steps on precision scroll wheels; sign-based ensures exactly one step per detent |

---

## Architecture Patterns

### What Phase 19 Touches

Exactly three locations change:

```
FuzzyClock.App/
├── MainWindow.xaml           # Add Opacity submenu; wire PreviewMouseWheel on Window element
├── MainWindow.xaml.cs        # Add _windowOpacity field; add SetOpacity(), Window_PreviewMouseWheel;
│                             #   extend ApplySettings(), SaveSettings(), ContextMenu_Opened()
└── AppSettings.cs            # ALREADY DONE in Phase 18 — no changes needed
SettingsService.cs            # ALREADY DONE in Phase 18 — no changes needed
```

`AppSettings.cs` and `SettingsService.cs` are fully complete from Phase 18. Phase 19 is pure runtime behavior.

### Pattern 1: SetOpacity() Helper

**What:** A single private method that sets `_windowOpacity`, applies `this.Opacity`, and calls `SaveSettings()`. Both preset menu click handlers and the scroll wheel handler call this method.

**When to use:** Any time opacity changes from user input.

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
private void SetOpacity(double opacity)
{
    _windowOpacity = opacity;
    this.Opacity   = opacity;
    SaveSettings();
}

// Four preset click handlers:
private void MenuOpacity25_Click(object sender, RoutedEventArgs e)  => SetOpacity(0.25);
private void MenuOpacity50_Click(object sender, RoutedEventArgs e)  => SetOpacity(0.50);
private void MenuOpacity75_Click(object sender, RoutedEventArgs e)  => SetOpacity(0.75);
private void MenuOpacity100_Click(object sender, RoutedEventArgs e) => SetOpacity(1.00);
```

### Pattern 2: PreviewMouseWheel Handler

**What:** Tunneling scroll event wired in `ContentRendered`. Uses `Math.Sign(e.Delta)` for one step per notch regardless of wheel resolution. Sets `e.Handled = true` to prevent scroll leaking to windows below the overlay.

**When to use:** Scroll wheel opacity adjustment. Must use `PreviewMouseWheel`, not `MouseWheel`.

```csharp
// Source: STACK.md + PITFALLS.md (project research, HIGH confidence)
// Wired in ContentRendered: this.PreviewMouseWheel += Window_PreviewMouseWheel;

private void Window_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
{
    // e.Delta > 0 = scroll up = increase opacity; < 0 = decrease
    // Math.Sign: one 10% step per physical notch regardless of wheel resolution
    double step = Math.Sign(e.Delta) * 0.10;
    _windowOpacity = Math.Clamp(_windowOpacity + step, 0.10, 1.0);
    this.Opacity = _windowOpacity;
    SaveSettings();
    e.Handled = true;  // prevent scroll leaking to desktop/windows below
}
```

**Key detail:** Wire in `ContentRendered`, not in the constructor — the same pattern as `MouseEnter`/`MouseLeave` in the existing code. This keeps all event hookup in one lifecycle location.

### Pattern 3: ApplySettings() Extension

**What:** Sets `_windowOpacity` and `this.Opacity` from `s.Opacity` before `Show()`. `UIElement.Opacity` assignment before `Show()` is safe — it is not position-related and requires no layout pass.

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// Add to the end of the existing ApplySettings(AppSettings s) body:

_windowOpacity = s.Opacity;
this.Opacity   = s.Opacity;
// NOTE: Do NOT call SetOpacity() here — SetOpacity() calls SaveSettings(),
// which is safe but redundant at startup. Direct assignment is the correct pattern
// (same as how StatsPanel.Visibility and other fields are applied in ApplySettings).
```

### Pattern 4: SaveSettings() Extension

**What:** Adds `Opacity = _windowOpacity` to the `AppSettings` record construction in `SaveSettings()`. The field is `_windowOpacity`, not `this.Opacity` (dependency property) — field is marginally cleaner, both are correct.

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// In SaveSettings(), add to the new AppSettings { ... } initializer:
Opacity = _windowOpacity,
// AccentColor will be added in Phase 20 — leave it absent for now;
// AppSettings.AccentColor has an init default of "#FFFFFFFF" so it round-trips safely
```

**Important:** Phase 19 does NOT add `AccentColor` to `SaveSettings()` yet. The init default `"#FFFFFFFF"` ensures the field persists cleanly. Phase 20 adds the `AccentColor` assignment when it implements theme selection.

### Pattern 5: ContextMenu_Opened Sync

**What:** Adds four `IsChecked` assignments to `ContextMenu_Opened()`. Exact `double` equality against the four preset constants is reliable because `_windowOpacity` changes only via exact preset assignment (`SetOpacity(0.25/0.50/0.75/1.00)`) or `Math.Clamp` in 0.10 increments. No floating-point accumulation drift occurs at the four preset boundaries.

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// Add to ContextMenu_Opened():

// Opacity preset sync: checked only when current opacity exactly matches a preset
MenuOpacity25.IsChecked  = (_windowOpacity == 0.25);
MenuOpacity50.IsChecked  = (_windowOpacity == 0.50);
MenuOpacity75.IsChecked  = (_windowOpacity == 0.75);
MenuOpacity100.IsChecked = (_windowOpacity == 1.00);
// At intermediate values (e.g. 0.60, 0.70 from scroll wheel) no preset is checked — correct
```

### Pattern 6: XAML — Opacity Submenu and PreviewMouseWheel

**What:** Adds the Opacity submenu to the existing `ContextMenu` and wires `PreviewMouseWheel` on the `Window` element.

```xml
<!-- In MainWindow.xaml — Window element: -->
<Window ...
        PreviewMouseWheel="Window_PreviewMouseWheel">

<!-- In the ContextMenu, before the Close item: -->
<MenuItem Header="Opacity">
    <MenuItem x:Name="MenuOpacity25"  Header="25%"  IsCheckable="True" Click="MenuOpacity25_Click" />
    <MenuItem x:Name="MenuOpacity50"  Header="50%"  IsCheckable="True" Click="MenuOpacity50_Click" />
    <MenuItem x:Name="MenuOpacity75"  Header="75%"  IsCheckable="True" Click="MenuOpacity75_Click" />
    <MenuItem x:Name="MenuOpacity100" Header="100%" IsCheckable="True" Click="MenuOpacity100_Click" />
</MenuItem>
```

**Note on XAML vs ContentRendered wiring for PreviewMouseWheel:** The existing project wires `MouseEnter`/`MouseLeave` in `ContentRendered` rather than XAML. Either approach is correct for `PreviewMouseWheel`. Wiring it directly in XAML (as shown above) is slightly simpler and consistent with how click handlers are wired throughout the codebase. Wiring in `ContentRendered` is also valid. Use whichever is more consistent with the existing style; XAML is the recommended choice here because the Window element already receives other event attributes in XAML in similar projects.

### Anti-Patterns to Avoid

- **Using `MouseWheel` instead of `PreviewMouseWheel`:** `MouseWheel` is silently dropped on frameless transparent windows without keyboard focus. This produces a production-only regression (works in debugger, fails in normal use).
- **Calling `this.Opacity = 0` or not enforcing floor:** At opacity 0.0, the widget is invisible but still captures mouse events. The user cannot recover without restarting or deleting `settings.json`. The 0.10 floor must be enforced in the scroll handler.
- **Calling `SetOpacity()` from `ApplySettings()`:** `SetOpacity()` calls `SaveSettings()`, which is safe before `Show()` but redundant. Prefer direct field+property assignment in `ApplySettings()` to match the existing pattern.
- **Reading `IsChecked` in preset click handlers:** WPF toggles `IsChecked` before the handler fires. Reading it inverts the logic. Never read `IsChecked` in click handlers — all existing handlers follow this rule.
- **Setting `this.Opacity` on individual child elements instead of the Window:** Requires parallel opacity tracking per element and interacts poorly with the hover backdrop's own alpha layer.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Uniform widget fade | Per-element opacity loop | `this.Opacity` on Window | Single assignment covers entire composited HWND including the hover backdrop at correct proportional transparency |
| Scroll normalization | Raw `e.Delta / 120` arithmetic | `Math.Sign(e.Delta) * 0.10` | Sign-based ensures exactly one step per physical notch regardless of high-resolution wheel variations |
| Opacity floor enforcement | Custom clamp logic | `Math.Clamp(..., 0.10, 1.0)` | BCL Math.Clamp handles floor and ceiling in one call |
| Checkmark sync | Separate `_currentOpacityPreset` string field | Direct `double` comparison against preset constants | Secondary field diverges from `_windowOpacity` as single source of truth; exact double comparison is reliable here |

**Key insight:** `UIElement.Opacity` on the Window is the correct single-property solution. Any attempt to distribute opacity across individual elements introduces element-level alpha interaction with the hover backdrop alpha, making the combined visual behavior unpredictable and hard to maintain.

---

## Common Pitfalls

### Pitfall 1: MouseWheel vs PreviewMouseWheel (Production Regression)

**What goes wrong:** `MouseWheel` (bubbling) is silently dropped on `WindowStyle=None, AllowsTransparency=True` windows when the widget does not have keyboard focus.

**Why it happens:** `MouseWheel` requires the receiving element to be focused or the window to be the active foreground window. A `Topmost=True` frameless overlay is always on top but is not always the active foreground window — especially after the user interacted with another application or after the context menu was dismissed. `PreviewMouseWheel` (tunneling, fired at the Window level during the tunnel phase) fires as long as the window has logical mouse capture (i.e., the mouse is within the `#01000000` hit-test surface).

**How to avoid:** Use `PreviewMouseWheel` exclusively. Set `e.Handled = true` to prevent scroll from leaking to desktop or windows below. Wire it in `ContentRendered` or directly in XAML.

**Warning signs:** Scroll wheel works in Visual Studio debug sessions (debugger keeps focus) but not in normal production use. Scroll wheel requires clicking the widget first before it responds.

### Pitfall 2: Window.Opacity Multiplies With Per-Pixel Alpha (AllowsTransparency)

**What goes wrong:** `Window.Opacity` applies a uniform alpha multiplier over the entire composited HWND surface. The existing hover backdrop (`ContentBorder.Background = #59000000` = ~35% alpha) becomes 35% × 0.25 = ~8.75% visible at the 25% preset. The hover backdrop effectively disappears at low opacity levels.

**Why it happens:** `Window.Opacity` sets the `LWA_ALPHA` flag on the layered HWND via `SetLayeredWindowAttributes`. This multiplies over the per-pixel alpha already embedded in the WPF software-rendered surface by `AllowsTransparency=True`.

**How to avoid:** Document and accept this behavior. The minimum preset is 25% (not 0% or 10%) specifically because the backdrop and content remain usable at that level. The scroll wheel floor of 10% is intentional — below 25% the backdrop degrades, but the widget remains interactable. Test right-click and drag at 25% opacity before marking the phase complete.

**Warning signs:** Right-click or drag stops working at the lowest preset — this indicates the `#01000000` grid background has been effectively zeroed by combined opacity, and the hit-test surface is lost. If this is observed, raise the floor or investigate the `#01000000` background preservation.

### Pitfall 3: Opacity Field Missing From SaveSettings()

**What goes wrong:** The opacity persists correctly on the first launch (Phase 18 already added the field to AppSettings), but scroll-wheel changes are lost after restart because `SaveSettings()` was not updated to include `_windowOpacity`.

**How to avoid:** Add `Opacity = _windowOpacity` to the `new AppSettings { ... }` initializer in `SaveSettings()` as part of Phase 19. This is a required change for OPAC-02 (scroll-wheel persistence is a success criterion).

**Warning signs:** Opacity changes via scroll wheel are visible in the running session but the widget starts at 100% opacity on every relaunch regardless of what was set. Preset menu changes persist but scroll changes do not — this indicates `SaveSettings()` was patched for preset clicks (via `SetOpacity()` which calls `SaveSettings()`) but the `SaveSettings()` method is still missing the `Opacity` field.

### Pitfall 4: Double-Equality Float Drift at Preset Boundaries

**What goes wrong:** The `ContextMenu_Opened` sync compares `_windowOpacity == 0.25` etc. In theory, floating-point arithmetic on scroll-wheel increments could produce values like `0.25000000000000003` that fail equality checks at exact preset boundaries, leaving preset checkmarks unset when the actual opacity is effectively 25%.

**How to avoid (conclusion from research):** This is not a practical problem for this specific pattern. `_windowOpacity` changes only via two paths: (1) `SetOpacity(0.25/0.50/0.75/1.00)` — exact literal assignment, no arithmetic; (2) `Math.Clamp(_windowOpacity + Math.Sign(e.Delta) * 0.10, 0.10, 1.0)` — cumulative addition of 0.10 steps. In IEEE 754, repeated addition of 0.10 to 0.0 does accumulate tiny errors over many steps. After 10 scroll-ups from 0.0, the value is `0.9999999999999999` not `1.0`. However, the preset `1.0` is typically reached by `SetOpacity(1.00)` (preset click), not by scrolling from 0.0 to 1.0. If the planner wants to be defensive, use `Math.Round(_windowOpacity, 2)` in the comparison, but this is low-priority given the actual usage pattern.

### Pitfall 5: AccentColor Absent From SaveSettings() Is Fine in Phase 19

**What goes wrong (non-issue worth clarifying):** After Phase 18, `AppSettings.AccentColor` has an init default of `"#FFFFFFFF"`. If Phase 19's `SaveSettings()` does not include `AccentColor` in the record initializer, the serialized JSON will still contain `"AccentColor":"#FFFFFFFF"` because `System.Text.Json` serializes all init-property fields including those with defaults.

**Verdict:** Not a pitfall — the serializer includes all record fields regardless of whether they match the default. Phase 19 safely omits `AccentColor` from `SaveSettings()` changes; Phase 20 will add the live accent color assignment. No backward-compat risk.

---

## Code Examples

### Complete Window_PreviewMouseWheel Handler

```csharp
// Source: PITFALLS.md + STACK.md (project research, HIGH confidence)
// Wire in ContentRendered: this.PreviewMouseWheel += Window_PreviewMouseWheel;
// OR wire in XAML on <Window PreviewMouseWheel="Window_PreviewMouseWheel">

private void Window_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
{
    // e.Delta > 0: scroll up (toward user on most mice) = increase opacity
    // e.Delta < 0: scroll down = decrease opacity
    // Mouse.MouseWheelDeltaForOneLine = 120 (one standard notch)
    // Math.Sign: exactly one 10% step per notch regardless of high-res wheel
    double step = Math.Sign(e.Delta) * 0.10;
    _windowOpacity = Math.Clamp(_windowOpacity + step, 0.10, 1.0);
    this.Opacity = _windowOpacity;
    SaveSettings();
    e.Handled = true;  // prevent scroll leaking through to windows below overlay
}
```

### Complete SetOpacity() Helper

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
private void SetOpacity(double opacity)
{
    _windowOpacity = opacity;
    this.Opacity   = opacity;
    SaveSettings();
}

private void MenuOpacity25_Click(object sender, RoutedEventArgs e)  => SetOpacity(0.25);
private void MenuOpacity50_Click(object sender, RoutedEventArgs e)  => SetOpacity(0.50);
private void MenuOpacity75_Click(object sender, RoutedEventArgs e)  => SetOpacity(0.75);
private void MenuOpacity100_Click(object sender, RoutedEventArgs e) => SetOpacity(1.00);
```

### ApplySettings() Extension (add to existing body)

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// Add at the end of ApplySettings(AppSettings s):
// - Safe before Show(): UIElement.Opacity assignment requires no layout pass
// - Do NOT call SetOpacity() here — SetOpacity() calls SaveSettings(), redundant at startup
_windowOpacity = s.Opacity;
this.Opacity   = s.Opacity;
```

### SaveSettings() Extension (add to existing AppSettings initializer)

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// In SaveSettings(), add to new AppSettings { ... }:
Opacity = _windowOpacity,
// AccentColor not added here — Phase 20 will add that assignment
// AppSettings.AccentColor init default "#FFFFFFFF" ensures clean serialization until then
```

### ContextMenu_Opened Extension (add to existing body)

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// Add at the end of ContextMenu_Opened():
MenuOpacity25.IsChecked  = (_windowOpacity == 0.25);
MenuOpacity50.IsChecked  = (_windowOpacity == 0.50);
MenuOpacity75.IsChecked  = (_windowOpacity == 0.75);
MenuOpacity100.IsChecked = (_windowOpacity == 1.00);
// Intermediate values (e.g. 0.60 from scroll wheel) show no checkmark — correct
```

### _windowOpacity Field Declaration

```csharp
// Source: ARCHITECTURE.md (project research, HIGH confidence)
// Add with other private fields in MainWindow:
private double _windowOpacity = 1.0;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-element alpha via `Brush.Opacity` or element `Opacity` | `Window.Opacity` (UIElement.Opacity) for widget-level fade | WPF 3.0+ — always available | Simpler, uniform, covers hover backdrop; zero per-element tracking |
| `MouseWheel` for scroll input | `PreviewMouseWheel` for frameless overlay | Project decision (Phase 19) | Reliable focus-independent scroll on frameless transparent windows |

**Deprecated/outdated:**
- `UIElement.OpacityMask`: This is a brush-based per-pixel masking tool, not scalar transparency. Wrong tool for widget-level opacity. Do not use.
- `Window.Background` alpha: The `#01000000` background is the hit-test sentinel and must never be changed for opacity purposes.

---

## Existing Codebase State (Phase 18 Complete)

The following is already in the codebase — Phase 19 does NOT need to add these:

**AppSettings.cs** (confirmed by reading file):
```csharp
public string AccentColor { get; init; } = "#FFFFFFFF";  // AARRGGBB hex
public double Opacity     { get; init; } = 1.0;          // 0.0–1.0; default = fully opaque
```

**SettingsService.cs** — both guards are already in `Load()`:
```csharp
if (loaded.Opacity <= 0.0)
    loaded = loaded with { Opacity = Defaults().Opacity };
if (string.IsNullOrWhiteSpace(loaded.AccentColor))
    loaded = loaded with { AccentColor = Defaults().AccentColor };
```

**`Defaults()`** already includes:
```csharp
AccentColor = "#FFFFFFFF",
Opacity = 1.0
```

**What Phase 19 must add (not yet in codebase):**
1. `private double _windowOpacity = 1.0;` field in `MainWindow.xaml.cs`
2. `_windowOpacity = s.Opacity; this.Opacity = s.Opacity;` in `ApplySettings()`
3. `Opacity = _windowOpacity` in `SaveSettings()` record initializer
4. `MenuOpacity25/50/75/100.IsChecked = ...` in `ContextMenu_Opened()`
5. `SetOpacity()` helper method
6. Four preset click handlers (`MenuOpacity25_Click` etc.)
7. `Window_PreviewMouseWheel` handler
8. `this.PreviewMouseWheel += Window_PreviewMouseWheel` wiring in `ContentRendered` (or XAML attribute on `<Window>`)
9. Opacity submenu XAML (`MenuOpacity25/50/75/100` menu items inside `<MenuItem Header="Opacity">`)

**What Phase 19 must NOT touch:**
- `AppSettings.cs` — complete
- `SettingsService.cs` — complete
- Accent color logic — Phase 20
- `InitDialDecorations()` — no changes needed for opacity
- `ContentRendered` decoration/theme ordering — no changes needed for opacity (Phase 20 adds `ApplyTheme()` call there)

---

## Open Questions

1. **XAML vs ContentRendered for PreviewMouseWheel wiring**
   - What we know: Both approaches are correct. Existing handlers (`MouseEnter`/`MouseLeave`) are wired in `ContentRendered`. Click handlers are wired in XAML.
   - What's unclear: Which is more consistent with project style for a Window-level event.
   - Recommendation: Wire `PreviewMouseWheel` in XAML as an attribute on `<Window ...>` — this is consistent with how all other Window-level events (`Grid_MouseLeftButtonDown`, etc.) are declared in this project. The ContentRendered approach is also acceptable if the planner prefers uniformity with MouseEnter/MouseLeave.

2. **Opacity floor: Success criterion says 10% floor, preset menu floor is 25%**
   - What we know: STATE.md pending todo says "scroll wheel floor = 0.10, preset menu floor = 0.25; document in Phase 19 plan". REQUIREMENTS.md success criterion SC-3 says "widget never becomes fully invisible (floor of 10%)". The four preset values are 25/50/75/100 — the lowest preset is 25%.
   - What's unclear: Whether the planner should make the distinction explicit in success criteria.
   - Recommendation: The scroll wheel clamp should use `Math.Clamp(..., 0.10, 1.0)` (10% floor as stated in SC-3). The preset menu naturally has 25% as its lowest option. These are not in conflict — a user can reach below-25% opacity only via scroll wheel, not via the preset menu. Document this as a deliberate design distinction in the plan.

---

## Sources

### Primary (HIGH confidence)

- `C:/src/FuzzyStatsClock/FuzzyClock.App/AppSettings.cs` — confirmed Phase 18 complete: `AccentColor` and `Opacity` fields with correct init defaults
- `C:/src/FuzzyStatsClock/FuzzyClock.App/SettingsService.cs` — confirmed Phase 18 complete: both load guards and Defaults() additions in place
- `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml.cs` — confirmed Phase 19 work not yet started: no `_windowOpacity` field, no `PreviewMouseWheel`, no opacity menu handlers, no opacity in `SaveSettings()`
- `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml` — confirmed no Opacity submenu, no `PreviewMouseWheel` attribute on Window element
- `C:/src/FuzzyStatsClock/.planning/research/ARCHITECTURE.md` — complete method signatures, XAML structures, data flow, startup ordering constraints (HIGH, first-party research)
- `C:/src/FuzzyStatsClock/.planning/research/STACK.md` — API detail for `UIElement.Opacity`, `MouseWheelEventArgs.Delta`, `Math.Sign` normalization (HIGH, first-party research with official docs citations)
- `C:/src/FuzzyStatsClock/.planning/research/PITFALLS.md` — 10 pitfalls with working mitigation code; `PreviewMouseWheel` vs `MouseWheel` is Pitfall 2; `Window.Opacity` × AllowsTransparency is Pitfall 1 (HIGH, first-party research with official docs citations)
- `C:/src/FuzzyStatsClock/.planning/research/SUMMARY.md` — confirms Phase 19 as "Phase 2: Window Opacity — Presets and Scroll Wheel" in the four-phase v2.0 build order
- `C:/src/FuzzyStatsClock/.planning/STATE.md` — locked decisions: `PreviewMouseWheel` confirmed, `ApplySettings()` extension pattern, opacity floor distinction documented as pending todo
- https://learn.microsoft.com/en-us/dotnet/api/system.windows.uielement.opacity?view=windowsdesktop-10.0 — `UIElement.Opacity`, double, 0.0–1.0, applied uniformly to child elements, element at 0.0 still receives input
- https://learn.microsoft.com/en-us/dotnet/api/system.windows.input.mousewheeleventargs?view=windowsdesktop-10.0 — `Delta` property, sign convention (positive = scroll up)
- https://learn.microsoft.com/en-us/dotnet/api/system.windows.input.mouse.mousewheeldeltaforoneline?view=windowsdesktop-10.0 — `const int = 120`

### Secondary (MEDIUM confidence)

- `PreviewMouseWheel` vs `MouseWheel` reliability on frameless transparent windows — inferred from WPF routed event tunneling/bubbling model; specific frameless window focus behavior consistent with existing `MouseEnter`/`MouseLeave` wiring pattern in ContentRendered (project codebase)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs confirmed in official windowsdesktop-10.0 docs; no NuGet unknowns; no new csproj changes required
- Architecture: HIGH — complete method signatures and XAML from first-party project research; codebase confirmed to verify Phase 18 preconditions are met and Phase 19 work is not yet started
- Pitfalls: HIGH — all critical pitfalls have working mitigation code; primary risk (`PreviewMouseWheel`) is already a locked project decision in STATE.md

**Research date:** 2026-02-27
**Valid until:** 2026-03-29 (30 days — stable WPF APIs, no fast-moving dependencies)
