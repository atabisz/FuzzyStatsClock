# Phase 70: Backdrop Padding - Research

**Researched:** 2026-04-01
**Domain:** WPF layout, window sizing, Win32 interop edge cases
**Confidence:** HIGH

## Summary

Phase 70 adds generous visual breathing room (12-16px) around all widget content without breaking existing features. The challenge is WPF's `SizeToContent="WidthAndHeight"` — the window auto-sizes to fit content, so padding changes affect window dimensions, which impacts five critical systems: (1) edge snapping (compares window edges to screen bounds), (2) ghost mode proximity (uses `GetWindowRect` for hit testing), (3) contrast sampling (uses `ActualWidth/ActualHeight` for BitBlt footprint), (4) position clamping (compares window bounds to monitor working area), and (5) per-monitor position memory (saves/restores `Left`/`Top` which are relative to new dimensions).

Current padding is minimal: `ContentBorder.Padding="6"` around the clock area, `Margin="0,2,0,0"` on date, `Margin="0,4,0,0"` on stats panel. Increasing to 12-16px requires careful choice between `Border.Padding` (affects hit-testing) vs inner margins (cleaner separation). The project already uses margin-based spacing successfully throughout; the same pattern should extend to backdrop padding.

**Primary recommendation:** Use inner margins on the three-row Grid children (Row 0: clock content, Row 1: date, Row 2: stats) to create 12-16px breathing room. Do NOT use `Border.Padding` on outer containers — it affects hit-test boundaries and complicates sizing calculations. Edge snapping, ghost mode, and contrast sampling all read `ActualWidth`/`ActualHeight` which automatically reflect the new dimensions; no Win32 code changes needed.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VIS-01 | Backdrop has visibly larger padding around clock text, date, stats, and uptime content | Margin-based padding on Grid children (12-16px recommended); BackdropBorder already wraps full content; no new XAML elements needed |
| VIS-02 | Backdrop padding does not break edge snapping, ghost mode hit testing, contrast sampling, or position clamping | All five systems read WPF layout properties (`ActualWidth`/`ActualHeight`, `Left`/`Top`) which auto-update with margin changes; `GetWindowRect` returns HWND dimensions which match WPF layout; edge snapping threshold (8px) and ghost proximity radius (20-200px) are external to window bounds; contrast sampling uses transformed `ActualWidth`/`ActualHeight` for BitBlt — no code changes needed |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WPF | .NET 10 | Desktop UI framework | Native Windows desktop UI; SizeToContent auto-sizing; hardware-accelerated rendering |
| System.Windows.Interop | .NET 10 | Win32 HWND access | `WindowInteropHelper` provides HWND for `GetWindowRect` calls |
| user32.dll (P/Invoke) | Windows API | Window rect queries | `GetWindowRect` used by ghost mode and contrast sampling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| System.Drawing (via UseWindowsForms) | .NET 10 | DPI transform, screen bounds | Already in project; no new dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inner margins | `Border.Padding` on BackdropBorder | Padding affects hit-test boundaries; harder to reason about nested padding; margins are WPF-idiomatic for spacing |
| Uniform margins | Non-uniform per-side margins | Uniform (e.g. `Margin="12"`) is simpler; non-uniform (e.g. `Margin="12,8,12,12"`) adds complexity without clear benefit for this use case |

**Installation:**
No new packages required. All changes are XAML + existing WPF layout primitives.

## Architecture Patterns

### Recommended XAML Structure
Current structure (simplified):
```
<Grid Background="#01000000">                    ← outer grid (hit-test surface)
  <Border x:Name="BackdropBorder" ... />          ← backdrop (behind content)
  <Grid>                                          ← inner grid (three rows)
    <Border Grid.Row="0" Padding="6"> ... </Border>     ← clock content (Padding="6")
    <TextBlock Grid.Row="1" Margin="0,2,0,0" ... />      ← date (top margin only)
    <StackPanel Grid.Row="2" Margin="0,4,0,0" ... />     ← stats panel (top margin only)
  </Grid>
</Grid>
```

**Proposed change:** Increase margins on inner Grid children (NOT on outer containers):

```xml
<!-- Row 0: clock content border — change Padding="6" to Padding="12" or "16" -->
<Border Grid.Row="0" Padding="12" ... >

<!-- Row 1: date — change Margin="0,2,0,0" to Margin="12,6,12,0" (left/right/top padding) -->
<TextBlock Grid.Row="1" Margin="12,6,12,0" ... />

<!-- Row 2: stats panel — change Margin="0,4,0,0" to Margin="12,8,12,12" (all sides padding) -->
<StackPanel Grid.Row="2" Margin="12,8,12,12" ... />
```

Bottom padding on stats panel (last element) provides breathing room at bottom edge.

### Pattern 1: Margin-Based Spacing (Existing Pattern)
**What:** Use `Margin` on child elements to create spacing, not `Padding` on parent containers.
**When to use:** All inter-element spacing in WPF layouts.
**Example:**
```xml
<!-- Existing pattern from MainWindow.xaml -->
<TextBlock Grid.Row="1" Margin="0,2,0,0" ... />        <!-- date below clock -->
<StackPanel Grid.Row="2" Margin="0,4,0,0" ... />       <!-- stats below date -->
<Grid x:Name="CpuRow" Margin="0,2,0,0"> ... </Grid>     <!-- stat rows -->
```
**Rationale:** WPF layout system measures children with their margins included; parents size to fit children + margins. This makes spacing predictable and keeps hit-test boundaries clean.

### Pattern 2: SizeToContent Auto-Sizing
**What:** `SizeToContent="WidthAndHeight"` makes window auto-size to content; `ActualWidth`/`ActualHeight` are read-only and valid only after layout pass.
**When to use:** Already in use; no change needed.
**Example:**
```csharp
// Edge snapping (MainWindow.xaml.cs line 610-636)
private void SnapToEdge()
{
    var screen = System.Windows.Forms.Screen.FromPoint(
        new System.Drawing.Point(
            (int)(Left + ActualWidth  / 2),   // ActualWidth includes all margins
            (int)(Top  + ActualHeight / 2))); // ActualHeight includes all margins
    // ... snap logic uses ActualWidth/ActualHeight for edge detection
}
```
**Impact:** Changing inner margins increases `ActualWidth`/`ActualHeight`. Edge snapping threshold (8px) is relative to screen edges, NOT window bounds — larger window does not break snapping. Example: if window grows from 200px to 224px wide (+24px from 12px left+right margins), snapping still triggers when within 8px of screen edge.

### Pattern 3: Win32 GetWindowRect for Hit Testing
**What:** Ghost mode uses `GetWindowRect` to get window bounds for cursor proximity detection.
**When to use:** Already in use by `GhostModeController`; no change needed.
**Example:**
```csharp
// GhostModeController.cs line 110-112
if (!GetCursorPos(out var cursor) || !GetWindowRect(_hwnd, out var rect)) return;
// rect.Left/Top/Right/Bottom are physical screen pixels matching WPF ActualWidth/ActualHeight
```
**Impact:** `GetWindowRect` returns HWND bounds which match WPF `ActualWidth`/`ActualHeight` (adjusted for DPI). Larger window from padding changes means larger hit-test rect — ghost mode will trigger at a slightly farther cursor distance (by the padding increase). This is the CORRECT behavior — proximity fade should be relative to the VISIBLE backdrop, not the old smaller bounds.

### Pattern 4: DPI-Aware Contrast Sampling
**What:** Contrast sampling uses `PresentationSource.CompositionTarget.TransformToDevice` to convert WPF DIU (device-independent units) to physical pixels for BitBlt.
**When to use:** Already in use by `ContrastRefreshController`; no change needed.
**Example:**
```csharp
// ContrastRefreshController.cs line 111-117
var ps = PresentationSource.FromVisual(_window!);
var t  = ps.CompositionTarget.TransformToDevice;
int px = (int)Math.Round(_window!.Left        * t.M11);
int py = (int)Math.Round(_window!.Top         * t.M22);
int pw = (int)Math.Round(_window!.ActualWidth  * t.M11);  // includes margins
int ph = (int)Math.Round(_window!.ActualHeight * t.M22);  // includes margins
```
**Impact:** Larger `ActualWidth`/`ActualHeight` means larger BitBlt footprint. This is CORRECT — contrast should sample the full visible area including the new padding. The 200px step cap (from `ContrastSamplerService.MaxSampleDim`) prevents performance degradation even with larger dimensions.

### Anti-Patterns to Avoid
- **Don't use `Border.Padding` on BackdropBorder:** BackdropBorder is the backdrop visual (sits behind content with `IsHitTestVisible="False"`). Adding padding would push the backdrop inward, creating a visual gap between backdrop edge and content. The backdrop should MATCH the full window bounds.
- **Don't use `Border.Padding` on outer Grid:** The outer Grid has `Background="#01000000"` for hit-testing (near-transparent but clickable). Adding padding would shrink the hit-test surface, breaking mouse events at the edges.
- **Don't add wrapper Border for padding:** Extra nesting complicates layout and offers no benefit over direct margins.
- **Don't use non-uniform padding without justification:** Uniform padding (e.g., `Margin="12"`) is simpler and provides consistent breathing room. Non-uniform (e.g., `Margin="12,8,12,12"`) should only be used where asymmetry is intentional (e.g., tighter vertical spacing between rows, more generous horizontal/bottom padding).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DPI scaling for Win32 rects | Manual DPI factor tracking | `PresentationSource.CompositionTarget.TransformToDevice` | WPF handles DPI changes automatically; manual scaling breaks on multi-DPI setups |
| Window dimension queries | `GetClientRect` or manual ActualWidth tracking | `ActualWidth`/`ActualHeight` directly | WPF layout system auto-updates after every layout pass; manual tracking will desync |
| Hit-test surface sizing | Nested transparent containers | Existing `Grid Background="#01000000"` | Current pattern works; adding more layers complicates hit-testing |

**Key insight:** WPF layout system auto-propagates dimension changes from child margins to parent size to HWND bounds to Win32 rect queries. Manual tracking or custom sizing breaks this chain.

## Common Pitfalls

### Pitfall 1: Using Border.Padding Instead of Child Margins
**What goes wrong:** `Border.Padding` affects hit-test boundaries and complicates nested spacing. Example: `BackdropBorder.Padding="12"` would shrink the backdrop visual by 12px on all sides, creating a gap between the backdrop edge and the window edge. When auto-contrast samples the screen, it would sample 12px OUTSIDE the visible backdrop area.

**Why it happens:** `Border.Padding` is visually similar to margins but has different layout semantics — padding is "inside" the border, margin is "outside" the element.

**How to avoid:** Use `Margin` on child elements (Row 0/1/2 content), not `Padding` on parent containers. The exception is `ContentBorder.Padding="6"` which is INTERNAL to the clock content area — this is correct and should be increased to 12-16px.

**Warning signs:** Backdrop visual smaller than window bounds; mouse events not firing at window edges; contrast sampling showing incorrect colors.

### Pitfall 2: Edge Snapping Breaking After Padding Change
**What goes wrong (hypothetical — won't actually happen):** Developer assumes edge snapping threshold is relative to window bounds and tries to adjust the 8px threshold to compensate for larger window dimensions.

**Why it happens:** Misunderstanding of the edge snapping algorithm. The 8px threshold is the distance from the window edge to the screen edge, not a distance relative to window size.

**How to avoid:** Edge snapping logic is EXTERNAL to window dimensions:
```csharp
if (Math.Abs(Left - wa.Left) <= EdgeSnapThresholdPx)  // Left edge snap
if (Math.Abs((Left + ActualWidth) - (wa.Left + wa.Width)) <= EdgeSnapThresholdPx)  // Right edge snap
```
`ActualWidth` changes with padding, but the 8px threshold stays constant. If window grows by 24px, `Left + ActualWidth` shifts by 24px, but snapping still triggers when within 8px of `wa.Left + wa.Width` (screen edge). **No code changes needed.**

**Warning signs:** Developer proposes changing `EdgeSnapThresholdPx` or adjusting snap logic.

### Pitfall 3: Ghost Mode Proximity Radius Incorrectly Adjusted
**What goes wrong (hypothetical):** Developer assumes ghost mode proximity radius should be reduced to compensate for larger window dimensions.

**Why it happens:** Misunderstanding of proximity fade semantics. The `GhostFadeRadiusPx` (default 80px, range 20-200px) is the distance from the cursor to the window EDGE where fading begins. Larger window dimensions mean the widget occupies more screen space — the fade zone should STILL extend 80px beyond that larger footprint.

**How to avoid:** `ComputeProximityRatio` uses Chebyshev distance from cursor to window rect:
```csharp
// Simplified from GhostModeController
double dx = Math.Max(0, Math.Max(rect.Left - cursor.X, cursor.X - rect.Right));
double dy = Math.Max(0, Math.Max(rect.Top  - cursor.Y, cursor.Y - rect.Bottom));
double distance = Math.Max(dx, dy);  // Chebyshev distance
```
`rect` comes from `GetWindowRect(_hwnd)` which reflects the new larger dimensions. Distance is computed from cursor to NEW larger rect. Fade radius remains 80px from that NEW rect edge. **No code changes needed.**

**Warning signs:** Developer proposes changing `GhostFadeRadiusPx` calculation or adding compensation logic.

### Pitfall 4: Contrast Sampling Footprint Mismatch
**What goes wrong (hypothetical):** Developer assumes contrast sampling footprint should be manually adjusted to exclude padding areas.

**Why it happens:** Misunderstanding of backdrop visual semantics. The backdrop (BackdropBorder) is a visual element that should MATCH the full window bounds. Contrast sampling should sample the FULL footprint including padding areas — if there's a bright window edge under the padding, contrast should detect it.

**How to avoid:** `ActualWidth`/`ActualHeight` already include margins. The DPI transform converts these to physical pixels for BitBlt:
```csharp
int pw = (int)Math.Round(_window!.ActualWidth  * t.M11);  // includes padding margins
int ph = (int)Math.Round(_window!.ActualHeight * t.M22);  // includes padding margins
ContrastSamplerService.Sample(px, py, pw, ph);  // samples full footprint
```
**No code changes needed.**

**Warning signs:** Developer proposes subtracting padding from width/height calculations or manually adjusting sampling rect.

### Pitfall 5: Position Clamping Regression
**What goes wrong:** Window grows from padding changes, pushing part of the window off-screen when near screen edge. Position clamping fails to account for new dimensions on startup.

**Why it happens:** `SettingsService.Clamp` uses saved `Left`/`Top` and CURRENT `ActualWidth`/`ActualHeight`. If padding increases after the position was saved, the saved position might place the enlarged window partially off-screen.

**How to avoid:** Position clamping already handles this correctly:
```csharp
// SettingsService.cs (existing code, no changes needed)
public static MonitorPosition Clamp(MonitorPosition pos, double actualWidth, double actualHeight, Screen screen)
{
    double clampedLeft = Math.Max(wa.Left, Math.Min(pos.Left, wa.Left + wa.Width  - actualWidth));
    double clampedTop  = Math.Max(wa.Top,  Math.Min(pos.Top,  wa.Top  + wa.Height - actualHeight));
    return new MonitorPosition { Left = clampedLeft, Top = clampedTop };
}
```
If `actualWidth` increases from padding, `wa.Left + wa.Width - actualWidth` decreases, pushing the max allowed `Left` value leftward. This keeps the right edge on-screen. **No code changes needed; existing clamping handles larger dimensions correctly.**

**Warning signs:** Widget appears partially off-screen after changing padding; saved position no longer works.

## Code Examples

Verified patterns from existing codebase:

### Current Padding/Margin Values (MainWindow.xaml)
```xml
<!-- Row 0: clock content border (line 42-46) -->
<Border x:Name="ContentBorder"
        Grid.Row="0"
        Background="Transparent"
        CornerRadius="5"
        Padding="6">       <!-- CURRENT: 6px padding around clock/dial/LCD/Nixie -->

<!-- Row 1: date text (line 130-132) -->
<TextBlock x:Name="DateText"
           Grid.Row="1"
           Margin="0,2,0,0"  <!-- CURRENT: 2px top margin only -->
           ...>

<!-- Row 2: stats panel (line 149-152) -->
<StackPanel x:Name="StatsPanel"
            Grid.Row="2"
            Width="184"
            Margin="0,4,0,0"  <!-- CURRENT: 4px top margin only -->
            ...>
```

### Proposed Padding Increase
**Option A: 12px uniform padding (conservative)**
```xml
<!-- Row 0: clock content border -->
<Border x:Name="ContentBorder"
        Grid.Row="0"
        Background="Transparent"
        CornerRadius="5"
        Padding="12">      <!-- CHANGE: 6 → 12px -->

<!-- Row 1: date text -->
<TextBlock x:Name="DateText"
           Grid.Row="1"
           Margin="12,6,12,0"   <!-- CHANGE: left/right 12px, top 6px (half of vertical) -->
           ...>

<!-- Row 2: stats panel -->
<StackPanel x:Name="StatsPanel"
            Grid.Row="2"
            Width="184"          <!-- NOTE: Width constraint remains — prevents horizontal jitter -->
            Margin="12,8,12,12"  <!-- CHANGE: all sides 12px except top 8px (tighter inter-row) -->
            ...>
```
**Visual impact:** +12px breathing room on left/right edges, +6-12px vertical spacing. Window grows from ~190-200px wide (varies by clock content) to ~214-224px wide (+24px from left+right margins).

**Option B: 16px generous padding (recommended by STATE.md open question)**
```xml
<Border x:Name="ContentBorder" Padding="16">     <!-- 16px -->
<TextBlock x:Name="DateText" Margin="16,8,16,0"> <!-- 16px sides, 8px top -->
<StackPanel x:Name="StatsPanel" Margin="16,10,16,16"> <!-- 16px sides/bottom, 10px top -->
```
**Visual impact:** +16px breathing room on left/right edges. Window grows to ~232-242px wide (+32px from left+right margins).

**Recommendation:** Start with **12px** (Option A) for Phase 70. If user testing shows 12px feels cramped, 16px can be a one-line XAML change in a follow-up phase or even a user preference (new AppSettings field + slider in Settings > Appearance).

### Edge Snapping (No Changes Needed)
```csharp
// MainWindow.xaml.cs lines 610-636 (existing code, works with larger dimensions)
private void SnapToEdge()
{
    var screen = System.Windows.Forms.Screen.FromPoint(
        new System.Drawing.Point(
            (int)(Left + ActualWidth  / 2),   // ActualWidth auto-includes new margins
            (int)(Top  + ActualHeight / 2))); // ActualHeight auto-includes new margins
    var wa = screen.WorkingArea;

    double newLeft = Left;
    double newTop  = Top;

    // Horizontal snap: 8px threshold relative to screen edges (NOT window bounds)
    if (Math.Abs(Left - wa.Left) <= EdgeSnapThresholdPx)
        newLeft = wa.Left;
    else if (Math.Abs((Left + ActualWidth) - (wa.Left + wa.Width)) <= EdgeSnapThresholdPx)
        newLeft = wa.Left + wa.Width - ActualWidth;  // ActualWidth larger from padding

    // Vertical snap: same pattern
    if (Math.Abs(Top - wa.Top) <= EdgeSnapThresholdPx)
        newTop = wa.Top;
    else if (Math.Abs((Top + ActualHeight) - (wa.Top + wa.Height)) <= EdgeSnapThresholdPx)
        newTop = wa.Top + wa.Height - ActualHeight;  // ActualHeight larger from padding

    if (newLeft != Left || newTop != Top)
    {
        Left = newLeft;
        Top  = newTop;
    }
}
```

### Ghost Mode Proximity (No Changes Needed)
```csharp
// GhostModeController.cs lines 105-130 (existing code, works with larger dimensions)
private void OnTimerTick(object? sender, EventArgs e)
{
    if (!IsEnabled) return;

    if (!GetCursorPos(out var cursor) || !GetWindowRect(_hwnd, out var rect)) return;
    // rect now includes new padding margins — larger bounds

    double ratio;
    if (IsCtrlAltHeld())
    {
        ratio = 0.0;  // Ctrl+Alt suppresses fade
    }
    else
    {
        // ComputeProximityRatio uses Chebyshev distance from cursor to rect edges
        ratio = ComputeProximityRatio(cursor.X, cursor.Y, rect, _fadeRadiusPx);
        // Distance computed from cursor to NEW larger rect — correct behavior
    }

    // ... apply ratio to opacity
}
```

### Contrast Sampling (No Changes Needed)
```csharp
// ContrastRefreshController.cs lines 106-125 (existing code, works with larger dimensions)
private void Tick(object? sender, EventArgs e)
{
    if (_shouldSkip!()) return;

    var ps = PresentationSource.FromVisual(_window!);
    if (ps?.CompositionTarget == null) return;
    var t  = ps.CompositionTarget.TransformToDevice;
    int px = (int)Math.Round(_window!.Left        * t.M11);
    int py = (int)Math.Round(_window!.Top         * t.M22);
    int pw = (int)Math.Round(_window!.ActualWidth  * t.M11);  // NEW larger width
    int ph = (int)Math.Round(_window!.ActualHeight * t.M22);  // NEW larger height

    // Sample full footprint including padding areas — correct behavior
    var bgColor = ContrastSamplerService.Sample(px, py, pw, ph);
    // ... compute contrast and apply
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Border.Padding` for spacing | `Margin` on children | WPF best practice since v1.0 | Cleaner hit-testing, predictable layout |
| Manual DPI scaling | `TransformToDevice` matrix | WPF v3.0 (2006) | Automatic per-monitor DPI support |
| `GetClientRect` for dimensions | `ActualWidth`/`ActualHeight` | WPF v1.0 (2006) | Auto-updated by layout system |

**Deprecated/outdated:**
- **`GetClientRect`:** Returns client area excluding window frame; WPF frameless windows (WindowStyle="None") have no frame, so `GetWindowRect` is correct. `ActualWidth`/`ActualHeight` are preferred in managed code.
- **Manual DPI factor tracking:** Pre-WPF approach required multiplying coordinates by DPI scale factor (96 DPI = 1.0, 120 DPI = 1.25, etc.). WPF `PresentationSource.CompositionTarget.TransformToDevice` handles this automatically, including per-monitor DPI changes.

## Open Questions

1. **12px vs 16px vs user preference?**
   - What we know: STATE.md flags "Backdrop padding amount: Research suggests 12-16px; needs design decision in Phase 70 planning" as an open question. Current padding is 6px (ContentBorder) + minimal margins (2-4px). Doubling to 12px is conservative; 16px is more generous.
   - What's unclear: User testing hasn't been done to determine which feels better. 16px might feel too spacious for users with small screens (e.g., 1366x768 laptops where widget size matters).
   - Recommendation: **Start with 12px for Phase 70.** Can increase to 16px later if user feedback requests it, or add a user preference slider (e.g., "Backdrop Padding: Compact / Standard / Generous" mapping to 8px / 12px / 16px) in a future phase. The XAML change is trivial — changing 4 numeric values.

2. **Should bottom padding be symmetric or asymmetric?**
   - What we know: Stats panel is the last element (Grid Row 2). Current pattern uses `Margin="0,4,0,0"` (top margin only, no bottom margin). Proposed change is `Margin="12,8,12,12"` (bottom margin = 12px).
   - What's unclear: Is symmetric bottom padding (12px) visually necessary, or would 6-8px bottom padding be sufficient (more compact)?
   - Recommendation: **Use symmetric 12px bottom padding** in Option A (12px uniform). The backdrop should feel balanced — unequal bottom padding would make the widget feel "bottom-heavy" or cramped.

3. **Should StatsPanel.Width constraint remain?**
   - What we know: `StatsPanel` has `Width="184"` to prevent horizontal jitter when percentage text changes (e.g., "9%" → "100%"). This constraint is INDEPENDENT of margins.
   - What's unclear: Does the 184px width still provide the correct visual proportion with 12-16px side margins, or should it increase to 200-210px?
   - Recommendation: **Keep Width="184" unchanged.** The width constraint is INTERNAL to the stats panel (prevents text-length jitter). Left/right margins are EXTERNAL (spacing around the panel). These are independent concerns. If the stats panel feels too narrow after adding side margins, that's a separate layout decision and can be adjusted in testing (e.g., increase to 200px).

## Sources

### Primary (HIGH confidence)
- Existing codebase: MainWindow.xaml (lines 1-274), MainWindow.xaml.cs (lines 25-636), GhostModeController.cs (lines 34-130), ContrastRefreshController.cs (lines 34-125), ContrastSamplerService.cs (lines 34-97)
- WPF layout documentation: `SizeToContent`, `ActualWidth`/`ActualHeight`, `Border.Padding` vs `Margin` semantics
- Project memory (MEMORY.md): Ghost mode patterns, edge snapping implementation, contrast sampling footprint
- STATE.md open question: "Backdrop padding amount: Research suggests 12-16px; needs design decision in Phase 70 planning"

### Secondary (MEDIUM confidence)
- WPF best practices: Margin-based spacing is idiomatic; Border.Padding used only for internal content spacing (not inter-element spacing)
- Win32 `GetWindowRect` documentation: Returns outer window bounds including frame (WPF frameless windows have no frame, so rect matches client area)

### Tertiary (LOW confidence)
- None (no unverified web search findings)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all dependencies already in project; no new packages needed
- Architecture: HIGH - existing patterns (margin-based spacing, SizeToContent auto-sizing, Win32 GetWindowRect) are well-established and tested
- Pitfalls: HIGH - all five interacting systems (edge snapping, ghost mode, contrast sampling, position clamping, per-monitor memory) have existing implementations that read WPF layout properties; changes propagate automatically

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (30 days — WPF layout primitives are stable; no API changes expected)
