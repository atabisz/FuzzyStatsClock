# Phase 54: Backdrop Enhancement — Research

**Researched:** 2026-03-18
**Domain:** WPF XAML layout, border layering, settings persistence, SettingsWindow event pattern
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Coverage scope**
- BackdropBorder — a new outer `Border` (x:Name="BackdropBorder") wraps the existing main Grid in XAML. Its Background is set from code-behind (either the backdrop color or Transparent).
- Covers all rows: phrase/dial row + date row + stats panel + uptime row — the full widget footprint.
- ContentBorder backdrop logic is kept as-is — ContentBorder still gets `Background = Color.FromArgb(alpha, 0, 0, 0)` on hover. This creates an intentional double-depth effect on the phrase/dial row.
- All existing code-behind sites that set `ContentBorder.Background` remain untouched. BackdropBorder is an additive layer.

**Always-visible behavior**
- New `AppSettings.BackdropAlwaysVisible` (bool, default `false`) — preserves existing hover-only behavior for current users.
- When `true`: BackdropBorder shows the backdrop color at all times. Same opacity as hover state.
- When `false`: BackdropBorder shows backdrop only on hover.
- Surfaced in Settings window -> Appearance tab only. No tray menu entry.

**Opacity control**
- New `AppSettings.BackdropOpacityPercent` (int, default `35`) — replaces the hardcoded `0x59` alpha.
- Slider in Settings window -> Appearance tab -> Backdrop section. Range: 10-100, step 5.
- Alpha byte = `(int)(OpacityPercent / 100.0 * 255)` clamped to 25-255.
- Both ContentBorder hover backdrop and BackdropBorder use this same computed alpha.
- Slider moves update backdrop live if currently visible.

**Ghost mode interaction**
- Ghost mode sets window `Opacity = 0` — BackdropBorder disappears with the entire window. No special handling.
- Mouse-leave / ghost-enter sites that clear `ContentBorder.Background = Transparent` must also clear `BackdropBorder.Background = Transparent` (or preserve it if `AlwaysVisible`).
- Ctrl+Alt hover: existing hover path fires normally — BackdropBorder gets the backdrop color via the same hover handler. No special case.

### Claude's Discretion
- Exact XAML layout of the new Backdrop section within the Appearance tab (checkbox + slider label + slider layout)
- Whether `BackdropOpacityPercent` uses a WPF Slider with integer snapping or a numeric TextBox alongside
- Corner radius and padding on BackdropBorder (should harmonize with ContentBorder's CornerRadius="5")

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

This phase is a pure WPF code change with no new libraries or packages. The work divides into four areas: (1) a single XAML edit to wrap the inner Grid in a new `BackdropBorder`, (2) two new `AppSettings` properties, (3) code-behind changes mirroring BackdropBorder alongside every existing `ContentBorder.Background` site, and (4) a new "Backdrop" section in the Appearance tab of SettingsWindow.

All patterns exist verbatim in the codebase today. The opacity slider mirrors the existing `OpacitySlider` in SettingsWindow. The event plumbing mirrors `OpacityChanged` / `PhraseWrapEnabledChanged`. The BackdropBorder lifecycle mirrors the `ContentBorder` hover pattern with the single addition of an `AlwaysVisible` guard on the clear path.

The most important correctness constraint is ensuring every site that currently resets `ContentBorder.Background = Brushes.Transparent` is audited and updated: there are exactly four such sites (hover enter ghost-cleanup path, hover leave, ghost Restored event, ContentRendered initial state). For BackdropBorder the clear only applies when `AlwaysVisible == false`.

**Primary recommendation:** Implement as a single plan. All changes are in `MainWindow.xaml`, `MainWindow.xaml.cs`, `AppSettings.cs`, `SettingsSnapshot.cs`, `SettingsWindow.xaml`, and `SettingsWindow.xaml.cs`. No test project changes are required (this is UI/persistence logic, no Core library changes).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WPF Border | .NET 10 built-in | Full-widget backdrop layer | Standard WPF container; Background property supports SolidColorBrush with alpha |
| System.Windows.Media.Color.FromArgb | .NET 10 built-in | Alpha-composited background color | Already used at ContentBorder hover sites; identical pattern |
| AppSettings init-property record | Project pattern | Settings persistence | Existing pattern; JSON forward/backward compat is automatic with init properties |

No new packages. No NuGet changes.

---

## Architecture Patterns

### Recommended Project Structure

No directory changes. All files already exist:
```
FuzzyClock.App/
├── MainWindow.xaml           — add BackdropBorder wrapping inner Grid
├── MainWindow.xaml.cs        — add _backdropAlwaysVisible, _backdropOpacityPercent fields;
│                               update 4 ContentBorder sites; add ApplyBackdropState helper;
│                               wire SettingsWindow events; update SaveSettings; ApplySettings
├── AppSettings.cs            — add BackdropAlwaysVisible, BackdropOpacityPercent properties
├── SettingsSnapshot.cs       — add BackdropAlwaysVisible, BackdropOpacityPercent
├── SettingsWindow.xaml       — add Backdrop section to Appearance tab
└── SettingsWindow.xaml.cs    — add events + handlers + PopulateControls entries
```

### Pattern 1: BackdropBorder XAML Placement

**What:** A `Border` wrapping the inner three-row Grid, placed inside the outer hit-test Grid (Background="#01000000"), before the inner Grid.
**When to use:** Must be the outermost visual container inside the hit-test Grid so its background covers the full widget footprint.

```xml
<!-- Outer hit-test Grid — unchanged outer Grid, just add BackdropBorder inside it -->
<Grid Background="#01000000" MouseLeftButtonDown="Grid_MouseLeftButtonDown">

    <!-- NEW: Full-widget backdrop — sits behind the inner Grid in Z-order -->
    <Border x:Name="BackdropBorder"
            Background="Transparent"
            CornerRadius="5"
            IsHitTestVisible="False"/>

    <!-- Existing three-row inner Grid — unchanged -->
    <Grid>
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
        <!-- ... all existing rows ... -->
    </Grid>

</Grid>
```

`IsHitTestVisible="False"` prevents BackdropBorder from intercepting mouse events that should reach the inner Grid and its children.

### Pattern 2: Alpha Computation

**What:** Converts the integer percent setting to an alpha byte for `Color.FromArgb`.
**Source:** Derived from existing `0x59` = 89 = ~35% pattern already in MainWindow.xaml.cs.

```csharp
// In MainWindow.xaml.cs — helper to compute alpha from percent
private byte BackdropAlpha()
    => (byte)Math.Clamp((int)(_backdropOpacityPercent / 100.0 * 255), 25, 255);
```

Usage in hover path (same as ContentBorder):
```csharp
BackdropBorder.Background = new System.Windows.Media.SolidColorBrush(
    System.Windows.Media.Color.FromArgb(BackdropAlpha(), 0, 0, 0));
```

### Pattern 3: ApplyBackdropState Helper

**What:** Single method that sets BackdropBorder.Background based on current hover state and AlwaysVisible setting. Avoids duplicating the if/else across multiple call sites.
**When to use:** Called from `ApplySettings`, `ContentRendered` initial setup, and the `BackdropOpacityPercent` changed handler. The hover enter/leave handlers set the background directly (same as ContentBorder) and do not call this helper — they are performance-sensitive and already know the target state.

```csharp
private void ApplyBackdropState()
{
    if (_backdropAlwaysVisible)
        BackdropBorder.Background = new System.Windows.Media.SolidColorBrush(
            System.Windows.Media.Color.FromArgb(BackdropAlpha(), 0, 0, 0));
    else
        BackdropBorder.Background = System.Windows.Media.Brushes.Transparent;
}
```

### Pattern 4: Hover Enter BackdropBorder Logic

**What:** BackdropBorder gets backdrop color on hover (mirroring ContentBorder). No guard needed — setting it when AlwaysVisible is true is idempotent.
**Where:** `Window_MouseEnter`, both the normal-hover branch and (implicitly) the Ctrl+Alt branch (same code path).

```csharp
// In Window_MouseEnter — normal hover path (alongside existing ContentBorder line)
ContentBorder.Background = new System.Windows.Media.SolidColorBrush(
    System.Windows.Media.Color.FromArgb(BackdropAlpha(), 0, 0, 0));
BackdropBorder.Background = new System.Windows.Media.SolidColorBrush(
    System.Windows.Media.Color.FromArgb(BackdropAlpha(), 0, 0, 0));
```

Also in the ghost-mode pre-activation cleanup (Step 1 of `Window_MouseEnter` ghost path):
```csharp
// Ghost-mode cleanup path — clear BackdropBorder unless AlwaysVisible
ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
if (!_backdropAlwaysVisible)
    BackdropBorder.Background = System.Windows.Media.Brushes.Transparent;
```

### Pattern 5: Mouse Leave + Ghost Restore BackdropBorder Logic

**What:** On leave and ghost-restore, BackdropBorder clears to Transparent only when AlwaysVisible is false.

```csharp
// In Window_MouseLeave
ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
if (!_backdropAlwaysVisible)
    BackdropBorder.Background = System.Windows.Media.Brushes.Transparent;

// In Ghost Restored lambda (ContentRendered)
_ghostMode.Restored += () =>
{
    this.Opacity = _windowOpacity;
    ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
    if (!_backdropAlwaysVisible)
        BackdropBorder.Background = System.Windows.Media.Brushes.Transparent;
};
```

### Pattern 6: SettingsWindow Backdrop Section (Appearance Tab)

**What:** A "Backdrop" section appended to the Appearance tab's StackPanel, after the Phrase Wrap rows. Follows the same label + control layout as other sections.
**Discretion note:** Use a `WPF Slider` with `IsSnapToTickEnabled="True"` and `TickFrequency="5"` for integer snapping — consistent with `OpacitySlider`. Add a `TextBlock` label showing current value (e.g. "35%") alongside, matching `OpacityLabel` pattern.

```xml
<!-- Backdrop section — appended to Appearance tab StackPanel -->
<TextBlock Text="Backdrop" FontWeight="SemiBold" Margin="0,14,0,6"/>
<CheckBox x:Name="ChkBackdropAlwaysVisible"
          Content="Always visible (not just on hover)"
          Margin="0,0,0,8"
          Checked="ChkBackdropAlwaysVisible_Changed"
          Unchecked="ChkBackdropAlwaysVisible_Changed"/>
<!-- Opacity row — two-column label + slider layout matching existing Opacity row -->
<Grid>
    <Grid.ColumnDefinitions>
        <ColumnDefinition Width="90"/>
        <ColumnDefinition Width="*"/>
    </Grid.ColumnDefinitions>
    <TextBlock Grid.Column="0" Text="Opacity"
               VerticalAlignment="Center" HorizontalAlignment="Right" Margin="0,0,10,0"/>
    <StackPanel Grid.Column="1" Orientation="Horizontal">
        <Slider x:Name="BackdropOpacitySlider"
                Minimum="10" Maximum="100"
                SmallChange="5" LargeChange="10"
                TickFrequency="5" IsSnapToTickEnabled="True"
                Width="160" VerticalAlignment="Center"
                ValueChanged="BackdropOpacitySlider_ValueChanged"/>
        <TextBlock x:Name="BackdropOpacityLabel" Width="36"
                   VerticalAlignment="Center" Margin="6,0,0,0"/>
    </StackPanel>
</Grid>
```

### Pattern 7: SettingsWindow Event Wiring (MainWindow.OpenSettings)

**What:** Two new event subscriptions in `OpenSettings()`, mirroring the existing pattern.

```csharp
_settingsWindow.BackdropAlwaysVisibleChanged += v => SetBackdropAlwaysVisible(v);
_settingsWindow.BackdropOpacityPercentChanged += p => SetBackdropOpacityPercent(p);
```

`SetBackdropAlwaysVisible` sets `_backdropAlwaysVisible`, calls `ApplyBackdropState()`, calls `SaveSettings()`.

`SetBackdropOpacityPercent` sets `_backdropOpacityPercent`, updates live if backdrop is currently visible (i.e. if `_backdropAlwaysVisible || _isHoverFastRefresh`), calls `SaveSettings()`.

### Pattern 8: AppSettings + SettingsSnapshot Properties

**What:** Two new init properties on `AppSettings` (with defaults) and `SettingsSnapshot` (same names/types).

```csharp
// AppSettings.cs
public bool BackdropAlwaysVisible     { get; init; } = false;
public int  BackdropOpacityPercent    { get; init; } = 35;

// SettingsSnapshot.cs
public bool BackdropAlwaysVisible     { get; init; } = false;
public int  BackdropOpacityPercent    { get; init; } = 35;
```

### Anti-Patterns to Avoid

- **Wrapping ContentBorder in BackdropBorder:** ContentBorder must remain Row 0 of the inner Grid. BackdropBorder sits behind the inner Grid at the same level as it in the outer hit-test Grid — both are direct children of the outer Grid, stacked via WPF Z-order (later child = on top). BackdropBorder is declared first (behind), inner Grid declared second (on top).
- **Mutating frozen brushes:** Always `new SolidColorBrush(Color.FromArgb(...))` — never mutate `Brushes.Transparent` or any frozen brush static.
- **Forgetting IsHitTestVisible="False" on BackdropBorder:** Without this, BackdropBorder intercepts mouse enter/leave events before the inner Grid children can receive them, breaking drag and scroll wheel.
- **Live opacity update without visibility guard:** `SetBackdropOpacityPercent` must check whether the backdrop is currently visible before updating BackdropBorder.Background — unnecessary SolidColorBrush allocations on every slider drag tick are wasteful, but more importantly incorrect when backdrop is hidden.
- **Setting BackdropBorder in ApplySettings before ContentRendered:** `ApplySettings` is called before `Show()`. `BackdropBorder` is a named XAML element — it exists and is safe to set Background on (unlike `_statsTimer` which is constructed in ContentRendered). This is safe.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Integer-stepped slider | Manual TextBox + increment buttons | WPF Slider with IsSnapToTickEnabled="True", TickFrequency="5" | Already in codebase for OpacitySlider; handles keyboard/mouse/scroll natively |
| Alpha byte clamping | Conditional branches | `Math.Clamp((int)(...), 25, 255)` | One-liner; handles edge cases (slider at min 10% = 25 alpha, not 0) |
| Live-update debouncing | Manual timer | None needed | Slider ValueChanged fires on every tick; WPF's dispatcher is synchronous; direct Background assignment at ~60fps is fine for a single Border |

---

## Common Pitfalls

### Pitfall 1: Z-order requires BackdropBorder declared before inner Grid
**What goes wrong:** If BackdropBorder is declared after the inner Grid in XAML, it renders on top and visually occludes all widget content.
**Why it happens:** WPF renders children in declaration order; last child = topmost Z layer.
**How to avoid:** Declare `<Border x:Name="BackdropBorder" .../>` as the first child of the outer hit-test Grid; declare the inner three-row Grid as the second child.
**Warning signs:** Widget content invisible after adding BackdropBorder.

### Pitfall 2: Missing IsHitTestVisible="False" on BackdropBorder
**What goes wrong:** Mouse enter/leave on the widget targets BackdropBorder instead of the inner Grid — hover backdrop flickers or never shows because the wrong element is receiving events.
**Why it happens:** BackdropBorder fills the same bounding box as the inner Grid; it captures mouse events first.
**How to avoid:** Set `IsHitTestVisible="False"` on BackdropBorder in XAML.
**Warning signs:** Hover backdrop appears but ContentBorder never shows its darker layer; or phantom MouseLeave fires immediately after MouseEnter.

### Pitfall 3: Ghost-restore path leaves BackdropBorder in wrong state
**What goes wrong:** After ghost-mode restore, BackdropBorder is Transparent even when AlwaysVisible=true — backdrop disappears after any ghost activation.
**Why it happens:** The `_ghostMode.Restored` lambda clears ContentBorder without guarding on `_backdropAlwaysVisible`.
**How to avoid:** In the Restored lambda, only clear BackdropBorder when `!_backdropAlwaysVisible`; otherwise call `ApplyBackdropState()`.
**Warning signs:** AlwaysVisible backdrop disappears the first time ghost mode activates and restores.

### Pitfall 4: ContentBorder alpha hardcoded 0x59 survives refactor
**What goes wrong:** ContentBorder keeps `0x59` while BackdropBorder uses the computed alpha — depths are no longer proportional when opacity is changed.
**Why it happens:** ContentBorder hover sites in `Window_MouseEnter` use `0x59` today; easy to forget to update them too.
**How to avoid:** Both ContentBorder hover sites (normal-hover branch) must switch from `0x59` to `BackdropAlpha()`. The ghost-mode cleanup path already clears to Transparent so it needs no alpha update.
**Warning signs:** Changing backdrop opacity in Settings does not affect the phrase area backdrop.

### Pitfall 5: `_isHoverFastRefresh` vs `_backdropAlwaysVisible` in live-opacity update
**What goes wrong:** `SetBackdropOpacityPercent` updates the live background when it should not (e.g. stats are hidden and not hovering) or does not when AlwaysVisible=true.
**Why it happens:** Confusing the two state flags.
**How to avoid:** The guard is `if (_backdropAlwaysVisible || _isHoverFastRefresh)` — either condition means backdrop is currently visible.
**Warning signs:** Backdrop color jumps unexpectedly on slider drag, or live preview doesn't work.

### Pitfall 6: SettingsWindow Appearance tab height overflow
**What goes wrong:** Adding the Backdrop section pushes the Appearance tab StackPanel past the SettingsWindow height (600px fixed), clipping controls.
**Why it happens:** SettingsWindow has `Height="600" ResizeMode="NoResize"`.
**How to avoid:** Measure before committing. The Appearance tab currently has: Theme section (~80px), Accent Color section (~50px), two-column Grid with 5 rows (~160px). Adding a backdrop section (~60px) brings estimated total to ~350px, well within the 560px usable interior.
**Warning signs:** Backdrop section controls are clipped or partially hidden.

---

## Code Examples

### Exact Sites to Update in MainWindow.xaml.cs

**Site 1 — Normal hover enter (line ~931):**
```csharp
// Before:
ContentBorder.Background = new System.Windows.Media.SolidColorBrush(
    System.Windows.Media.Color.FromArgb(0x59, 0, 0, 0));

// After:
ContentBorder.Background = new System.Windows.Media.SolidColorBrush(
    System.Windows.Media.Color.FromArgb(BackdropAlpha(), 0, 0, 0));
BackdropBorder.Background = new System.Windows.Media.SolidColorBrush(
    System.Windows.Media.Color.FromArgb(BackdropAlpha(), 0, 0, 0));
```

**Site 2 — Ghost-mode pre-activation cleanup (line ~950):**
```csharp
// Before:
ContentBorder.Background = System.Windows.Media.Brushes.Transparent;

// After:
ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
if (!_backdropAlwaysVisible)
    BackdropBorder.Background = System.Windows.Media.Brushes.Transparent;
```

**Site 3 — Window_MouseLeave (line ~971):**
```csharp
// Before:
ContentBorder.Background = System.Windows.Media.Brushes.Transparent;

// After:
ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
if (!_backdropAlwaysVisible)
    BackdropBorder.Background = System.Windows.Media.Brushes.Transparent;
```

**Site 4 — Ghost Restored lambda (line ~152):**
```csharp
// Before:
_ghostMode.Restored += () =>
{
    this.Opacity = _windowOpacity;
    ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
};

// After:
_ghostMode.Restored += () =>
{
    this.Opacity = _windowOpacity;
    ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
    if (!_backdropAlwaysVisible)
        BackdropBorder.Background = System.Windows.Media.Brushes.Transparent;
};
```

**ApplySettings — new fields to read:**
```csharp
_backdropAlwaysVisible   = s.BackdropAlwaysVisible;
_backdropOpacityPercent  = s.BackdropOpacityPercent;
// Set initial BackdropBorder state (safe before Show — XAML element exists)
if (_backdropAlwaysVisible)
    BackdropBorder.Background = new System.Windows.Media.SolidColorBrush(
        System.Windows.Media.Color.FromArgb(BackdropAlpha(), 0, 0, 0));
```

**SaveSettings — new properties to persist:**
```csharp
BackdropAlwaysVisible    = _backdropAlwaysVisible,
BackdropOpacityPercent   = _backdropOpacityPercent,
```

**GetCurrentSettingsSnapshot — new snapshot properties:**
```csharp
BackdropAlwaysVisible    = _backdropAlwaysVisible,
BackdropOpacityPercent   = _backdropOpacityPercent,
```

**ResetToDefaults — add resets:**
```csharp
SetBackdropAlwaysVisible(false);
SetBackdropOpacityPercent(35);
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Hardcoded `0x59` alpha on ContentBorder | Computed `BackdropAlpha()` from `_backdropOpacityPercent` | Both ContentBorder and BackdropBorder use same alpha; depths stay proportional |
| ContentBorder covers only phrase row | BackdropBorder covers full widget | Visual hierarchy: time phrase area is double-dark; stats/date area is single-dark |
| Backdrop always hover-only | `BackdropAlwaysVisible` flag | Users who prefer permanent backdrop can enable it without hover |

---

## Open Questions

1. **SettingsWindow Appearance tab scroll vs fixed height**
   - What we know: Height="600", ResizeMode="NoResize". Estimated content height after Backdrop section is ~350px — fits.
   - What's unclear: Whether future phases will require additional Appearance tab space.
   - Recommendation: Do not add a ScrollViewer now; estimated content fits. If it becomes crowded, that is a separate concern.

2. **Backdrop section position within Appearance tab**
   - What we know: Phrase Wrap is the last existing section in the Appearance tab's two-column Grid (Row 4).
   - Recommendation: Add Backdrop as a new section below the two-column Grid, using a flat StackPanel layout (matching the Theme and Accent Color sections above the Grid), not a new row inside the Grid. This is cleaner and avoids Grid row count management.

---

## Sources

### Primary (HIGH confidence)
- Direct source code inspection of `MainWindow.xaml`, `MainWindow.xaml.cs`, `AppSettings.cs`, `SettingsSnapshot.cs`, `SettingsWindow.xaml`, `SettingsWindow.xaml.cs` — all patterns verified by reading exact code
- `54-CONTEXT.md` — locked decisions and canonical refs

### Secondary (MEDIUM confidence)
- WPF Z-order behavior (declaration order = render order) — well-established WPF invariant, confirmed by existing codebase structure (DialCanvas and PhraseText both in same Grid cell, Z-ordered by declaration)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all patterns exist in codebase
- Architecture: HIGH — BackdropBorder placement, alpha computation, site enumeration all verified from source
- Pitfalls: HIGH — all identified from direct code reading and known WPF behaviors

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable — no external dependencies)
