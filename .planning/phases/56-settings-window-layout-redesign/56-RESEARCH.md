# Phase 56: Settings Window Layout Redesign - Research

**Researched:** 2026-03-18
**Domain:** WPF XAML layout compaction — StackPanel spacing, Border sizing, Margin/Padding reduction
**Confidence:** HIGH

## Summary

The Appearance tab in SettingsWindow.xaml currently stacks content that approaches or exceeds
the available vertical space of approximately 518px inside the tab body (600px window minus
~32px title bar, ~26px tab strip, ~24px StackPanel margin). The dominant space consumers are
the five theme preset cards (each a 60×64 Border with 2px ring padding = 68px tall row, plus
14px bottom margin = 82px total), the 14px top margin on the control Grid below the swatches,
and the 14px top margin on the Backdrop section header.

The fix is purely XAML — no C# changes, no new controls, no tab reorganization. The planner
needs to know exactly which spacing values drive the overflow so the single plan (56-01) can
prescribe exact replacement values, not a vague "reduce spacing" instruction.

**Primary recommendation:** Reduce theme card height from 64 to 40, drop the bottom swatch-row
margin from 14 to 8, tighten the inter-section gaps from 14 to 8, and cut the Backdrop header
top margin from 14 to 10. Together these reclaim ~40-50px — enough to clear the 518px budget
with a small margin.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SETT-01 | All controls on the Appearance tab fully visible within 480×600 without clipping | Budget analysis below identifies which spacing values cause overflow and what reductions clear it |
| SETT-02 | Theme preset cards use a more compact form to reclaim vertical space | Card height reduction 64→40 + ring Padding reduction 2→1 documented below |
| SETT-03 | Inter-section margins and padding tightened to eliminate unnecessary whitespace | All margin values inventoried below with exact proposed reductions |
| SETT-04 | Stats and Behavior tabs remain fully visible and unaffected | Only Appearance tab XAML is touched; Stats/Behavior sections are separate TabItem elements |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WPF XAML | .NET 10 | Declarative UI layout | Already in use; no new dependency |

No new packages required. This phase is pure XAML editing.

**Installation:** none

## Architecture Patterns

### Appearance Tab Layout Inventory

The Appearance tab `<StackPanel Margin="12">` stacks these items in order:

```
[1]  TextBlock "Theme"               Margin="0,0,0,6"        ≈ 20 + 6  = 26px
[2]  StackPanel (5 theme cards)      Margin="0,0,0,14"       ≈ 68 + 14 = 82px
[3]  TextBlock "Accent Color"        Margin="0,0,0,6"        ≈ 20 + 6  = 26px
[4]  StackPanel (swatches)           (no bottom margin)      ≈ 36px
[5]  Grid (Opacity…Phrase Wrap)      Margin="0,14,0,0"       ≈ 14 + 190 = 204px
[6]  TextBlock "Backdrop"            Margin="0,14,0,6"       ≈ 20 + 14 + 6 = 40px
[7]  CheckBox BackdropAlwaysVisible  Margin="0,0,0,8"        ≈ 22 + 8  = 30px
[8]  Grid (Backdrop Opacity)                                  ≈ 30px
                                                  TOTAL      ≈ 474px
```

Available height inside tab body ≈ 518px. The margin is only ~44px — well within reach of
ordinary WPF text rendering variation and DPI scaling. At 125% DPI (common on laptops) the
effective pixel budget shrinks to ~414px, at which point overflow is near-certain.

The theme card row [2] is the single largest avoidable cost: 82px where 50px suffices.

### Current Theme Card Structure

Each of the five theme preset cards is:

```xml
<Border x:Name="RingTheme*" BorderThickness="0" CornerRadius="6"
        Padding="2" Margin="0,0,6,0">
    <Border Width="60" Height="64" Background="#FF2D2D2D"
            CornerRadius="4" Cursor="Hand" ...>
        <StackPanel VerticalAlignment="Center" HorizontalAlignment="Center">
            <Ellipse Width="20" Height="20" Fill="..." Margin="0,0,0,4"/>
            <TextBlock Text="..." FontSize="10" .../>
        </StackPanel>
    </Border>
</Border>
```

Inner height breakdown: Ellipse 20 + bottom margin 4 + TextBlock ~13 = 37px content.
Current inner Border Height=64 leaves ~27px of empty padding.

### Proposed Compact Card Structure

Reduce inner Border Height to 40 (or Width/Height to 52×40). The content (37px) fits with 3px
of breathing room. Reduce ring Padding from 2 to 1. Net saving per row: (64→40) + (2×2→2×1) =
26px.

```xml
<!-- BEFORE -->
<Border x:Name="RingTheme*" BorderThickness="0" CornerRadius="6"
        Padding="2" Margin="0,0,6,0">
    <Border Width="60" Height="64" ...>

<!-- AFTER -->
<Border x:Name="RingTheme*" BorderThickness="0" CornerRadius="4"
        Padding="1" Margin="0,0,6,0">
    <Border Width="60" Height="40" ...>
```

### Proposed Spacing Reductions

| Location in XAML | Current Value | Proposed Value | Saving |
|------------------|---------------|----------------|--------|
| Theme cards StackPanel `Margin` bottom | `0,0,0,14` | `0,0,0,8` | 6px |
| Inner Border Height (theme cards, ×5) | `Height="64"` | `Height="40"` | 24px total row |
| Ring Padding (theme cards, ×5) | `Padding="2"` | `Padding="1"` | 2px total row |
| Grid (Opacity…Wrap) top `Margin` | `0,14,0,0` | `0,8,0,0` | 6px |
| Backdrop TextBlock top `Margin` | `0,14,0,6` | `0,10,0,4` | 6px |
| Backdrop CheckBox bottom `Margin` | `0,0,0,8` | `0,0,0,6` | 2px |

Total reclaimed: ~46px. New estimated total: ~428px, well inside the 518px budget and the
414px DPI-scaled budget.

### Anti-Patterns to Avoid

- **Touching Stats or Behavior tabs:** Requirements SETT-04 forbids any change to the other two
  TabItem elements. Make no edits outside the first `<TabItem Header="Appearance">` block.
- **Removing the ring Borders:** The `x:Name="RingTheme*"` Borders are referenced in
  `SettingsWindow.xaml.cs` to show/hide the selection ring (BorderThickness and BorderBrush are
  set from code-behind). They must stay; only their size/padding shrinks.
- **Changing card Width:** Width=60 fits five cards in a 456px content area with 6px gaps
  (`5×60 + 4×6 = 324px`). Do not change Width; only reduce Height.
- **ScrollViewer:** Out of scope per requirements. Do not add a ScrollViewer.
- **Resizable window:** Out of scope. Width="480" Height="600" stays.
- **Moving controls between tabs:** Out of scope. All controls stay on their current tab.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Measuring content height | Custom measurement logic | Direct margin arithmetic (documented above) | WPF layout is deterministic for fixed sizes |
| Selection ring indicator | Custom highlight control | Existing `RingTheme*` Border with code-behind toggle | Already implemented; changing the naming would require C# edits |

## Common Pitfalls

### Pitfall 1: Breaking the Selection Ring Code-Behind References

**What goes wrong:** Renaming or removing any `x:Name="RingTheme*"` Border causes a
`NullReferenceException` or compile error in SettingsWindow.xaml.cs.
**Why it happens:** Code-behind sets `BorderThickness` and `BorderBrush` on these named
elements to indicate the active theme.
**How to avoid:** Keep all five `x:Name="RingThemeXxx"` attributes exactly as-is. Only change
`Padding`, outer `CornerRadius`, and inner Border `Height`.
**Warning signs:** Build errors referencing `RingThemeXxx` field names.

### Pitfall 2: Affecting Stats/Behavior Tabs

**What goes wrong:** An edit made inside the Appearance `TabItem` accidentally extends past its
closing `</TabItem>` tag, shifting XML nesting.
**Why it happens:** Deep nesting makes it easy to close a tag too early or too late.
**How to avoid:** After editing, verify the `</TabItem>` for Appearance closes at the correct
line. Run the app and open Stats and Behavior tabs to confirm they look unchanged.

### Pitfall 3: DPI-Unaware Sizing

**What goes wrong:** Changes that look correct at 100% DPI clip content at 125% or 150% DPI.
**Why it happens:** WPF uses device-independent pixels; at 125% DPI the physical pixel budget
is smaller relative to logical units.
**How to avoid:** Target a total Appearance tab height well under 480px (not 518px) to leave
room for DPI variance. The proposed 428px total achieves this.

### Pitfall 4: Ellipse Gets Clipped Inside Compact Card

**What goes wrong:** Reducing the inner Border Height below the content height (Ellipse 20 +
margin 4 + TextBlock ~13 = 37px) causes the ellipse or label to clip.
**Why it happens:** StackPanel inside the Border clips at the Border boundary.
**How to avoid:** Keep inner Border Height >= 40 (37px content + 3px slack). Do not go below 40.

## Code Examples

### Compact Card Pattern (after change)

```xml
<!-- Source: SettingsWindow.xaml — theme card block, all five cards follow identical pattern -->
<Border x:Name="RingThemeMidnight" BorderThickness="0" CornerRadius="4"
        Padding="1" Margin="0,0,6,0">
    <Border Width="60" Height="40" Background="#FF2D2D2D" CornerRadius="4"
            Cursor="Hand" MouseLeftButtonDown="ThemeMidnight_Click">
        <Border.Style>
            <Style TargetType="Border">
                <Style.Triggers>
                    <Trigger Property="IsMouseOver" Value="True">
                        <Setter Property="Opacity" Value="0.75"/>
                    </Trigger>
                </Style.Triggers>
            </Style>
        </Border.Style>
        <StackPanel VerticalAlignment="Center" HorizontalAlignment="Center">
            <Ellipse Width="20" Height="20" Fill="#FF6A7FDB" Margin="0,0,0,4"/>
            <TextBlock Text="Midnight" FontSize="10"
                       HorizontalAlignment="Center" Foreground="#FFD0D0D0"/>
        </StackPanel>
    </Border>
</Border>
```

### Theme Cards StackPanel (reduced bottom margin)

```xml
<!-- BEFORE -->
<StackPanel Orientation="Horizontal" Margin="0,0,0,14">

<!-- AFTER -->
<StackPanel Orientation="Horizontal" Margin="0,0,0,8">
```

### Control Grid (reduced top margin)

```xml
<!-- BEFORE -->
<Grid Margin="0,14,0,0">

<!-- AFTER -->
<Grid Margin="0,8,0,0">
```

### Backdrop Section Header (tightened top/bottom margin)

```xml
<!-- BEFORE -->
<TextBlock Text="Backdrop" FontWeight="SemiBold" Margin="0,14,0,6"/>

<!-- AFTER -->
<TextBlock Text="Backdrop" FontWeight="SemiBold" Margin="0,10,0,4"/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Right-click context menu | System tray ContextMenu | v2.4 | Not relevant here |
| Theme cards Height=64 | Theme cards Height=40 (proposed) | Phase 56 | ~26px reclaimed |

**No deprecated patterns involved.** This is a straightforward WPF XAML spacing edit.

## Open Questions

1. **Exact DPI test environment**
   - What we know: Developer machine is unknown DPI; success criteria specifies 480×600 window
   - What's unclear: Whether the success criterion "no clipping" is tested at 100% DPI only or
     also at 125%/150%
   - Recommendation: Target ≤430px total tab content height to cover 125% DPI safely; the
     proposed changes achieve ~428px.

## Sources

### Primary (HIGH confidence)
- `FuzzyClock.App/SettingsWindow.xaml` — full XAML read; all margin and size values measured
  directly from source
- WPF layout model (training knowledge, HIGH confidence for basic Box/StackPanel arithmetic)

### Secondary (MEDIUM confidence)
- Standard WPF DPI-independence model: 1 logical unit = 1/96 inch; at 125% DPI the 600px
  window uses 750 physical pixels but logical units stay the same — visual density is higher
  only on the physical screen; layout math stays in logical units. (No external source needed;
  WPF DPI model is stable and well-documented.)

## Metadata

**Confidence breakdown:**
- Current layout measurements: HIGH — read directly from XAML source
- Proposed size values: HIGH — arithmetic from measured content (Ellipse 20 + margin 4 + text ~13)
- DPI impact estimate: MEDIUM — standard WPF DPI model, no runtime measurement available

**Research date:** 2026-03-18
**Valid until:** Indefinite — pure XAML layout, no external dependencies
