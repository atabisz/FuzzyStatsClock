# Phase 5: Font Size Selection + Persistence - Research

**Researched:** 2026-02-25
**Domain:** WPF ContextMenu with submenu + MenuItem.IsChecked state management
**Confidence:** HIGH

## Summary

Phase 5 is a narrow, well-contained UI addition. The backbone — AppSettings with a FontSize field, SettingsService.Save/Load, ApplySettings(), SaveSettings(), and `_currentFontSize` tracking — was fully implemented in Phase 4. What remains is purely additive: add a "Font Size" submenu to the existing right-click ContextMenu with three labeled options (Small/Medium/Large), wire click handlers that update `_currentFontSize`, apply the new size to both TextBlocks immediately, clamp position (because font size change resizes the window via SizeToContent=WidthAndHeight), and call SaveSettings(). Checked state must be updated each time the menu opens (ContextMenuOpening event or MenuItem.Checked toggling).

The only genuine complexity in this phase is the IsChecked management pattern. WPF does not have a radio-button MenuItem group natively — IsChecked must be managed manually in code-behind by setting exactly one item checked and the other two unchecked on each font size change. The ContextMenu.Opened event is the clean place to synchronize checked state, removing the need to track which MenuItem is checked from each click handler.

Because SizeToContent=WidthAndHeight is already active, a font size change will resize the window. The re-clamp logic already present in UpdatePhraseIfChanged() and ContentRendered provides the model: after ApplyFontSize() sets the new size on both TextBlocks, call UpdateLayout() then SettingsService.Clamp() and reassign Left/Top. This is identical to the phrase-change re-clamp pattern and carries no new risk.

**Primary recommendation:** Add the Font Size submenu entirely in XAML (three MenuItem children under a parent MenuItem), synchronize IsChecked in a ContextMenu.Opened handler in code-behind, and apply + save the new size in three symmetric click handlers following the exact same pattern as SaveSettings() already uses.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISP-05 | User can change the phrase font size (16pt, 24pt, or 32pt) via right-click menu; current size shown as checked | WPF ContextMenu submenu + MenuItem.IsChecked pattern; ContextMenu.Opened event for synchronizing checked state |
| DISP-06 | Selected font size is restored on startup (saved to same JSON file as position) | AppSettings.FontSize already exists; SettingsService.Save/Load already handles it; ApplySettings() already reads and applies it; no new persistence code needed |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WPF ContextMenu / MenuItem | .NET 10 in-box | Right-click menu with submenu and checked state | Already used in the project; no new dependency |
| System.Text.Json | .NET 10 in-box | FontSize persisted in same settings.json | Already wired in SettingsService — zero new code |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | — | No additional libraries needed for this phase |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual IsChecked in code-behind | MenuItem with IsCheckable=True + data binding | Binding requires a ViewModel/INotifyPropertyChanged; code-behind is simpler and consistent with existing pattern in this project |
| ContextMenu.Opened for checked sync | Setting IsChecked in each click handler | Both work; Opened event is cleaner — one sync point instead of three, immune to state drift |

**Installation:** No new packages. All required APIs are in the .NET 10 WPF inbox assemblies already referenced.

## Architecture Patterns

### Recommended Project Structure

No new files. All changes are in existing files:

```
FuzzyClock.App/
├── MainWindow.xaml          # Add Font Size submenu under ContextMenu
├── MainWindow.xaml.cs       # Add ContextMenu.Opened handler + 3 font-size click handlers + ApplyFontSize()
├── AppSettings.cs           # No changes — FontSize field already exists
└── SettingsService.cs       # No changes — Load/Save already handles FontSize
```

### Pattern 1: WPF Submenu via Nested MenuItem

**What:** A MenuItem inside a ContextMenu can itself contain child MenuItems, forming a flyout submenu. No special configuration — nesting is enough.

**When to use:** Grouping related options under a single labeled parent item.

**Example (XAML):**
```xml
<!-- Source: WPF ContextMenu / MenuItem documentation, docs.microsoft.com/wpf -->
<Grid.ContextMenu>
    <ContextMenu Opened="ContextMenu_Opened">
        <MenuItem Header="Font Size">
            <MenuItem x:Name="FontSmall"  Header="Small (16pt)"  Click="FontSmall_Click"  IsCheckable="True" />
            <MenuItem x:Name="FontMedium" Header="Medium (24pt)" Click="FontMedium_Click" IsCheckable="True" />
            <MenuItem x:Name="FontLarge"  Header="Large (32pt)"  Click="FontLarge_Click"  IsCheckable="True" />
        </MenuItem>
        <MenuItem Header="Close" Click="CloseMenuItem_Click" />
    </ContextMenu>
</Grid.ContextMenu>
```

### Pattern 2: Manual IsChecked Synchronization via ContextMenu.Opened

**What:** The ContextMenu.Opened event fires each time the menu is about to become visible. Setting IsChecked on all three items in this handler guarantees the correct item is checked regardless of when the font size was last changed.

**When to use:** Any time you need radio-button-style exclusive check in a WPF ContextMenu without a ViewModel.

**Example (C#):**
```csharp
// Source: WPF ContextMenu.Opened event — fires before the menu is displayed
private void ContextMenu_Opened(object sender, RoutedEventArgs e)
{
    FontSmall.IsChecked  = (_currentFontSize == 16);
    FontMedium.IsChecked = (_currentFontSize == 24);
    FontLarge.IsChecked  = (_currentFontSize == 32);
}
```

### Pattern 3: ApplyFontSize() Helper + Re-Clamp

**What:** Centralizes the three-step operation: set `_currentFontSize`, update both TextBlock FontSize properties, force a layout pass, re-clamp position (SizeToContent=WidthAndHeight means any resize can push the widget off-screen), then save.

**When to use:** Called from all three font size click handlers and from ApplySettings() (which already does steps 1-2 manually).

**Example (C#):**
```csharp
private void ApplyFontSize(int size)
{
    _currentFontSize     = size;
    PhraseText.FontSize  = size;
    ShadowText.FontSize  = size;
    // Re-clamp: font size change resizes window (SizeToContent=WidthAndHeight)
    UpdateLayout();
    if (_hasUserPosition)
    {
        var clamped = SettingsService.Clamp(
            new AppSettings(Left, Top, _currentFontSize),
            ActualWidth, ActualHeight);
        Left = clamped.Left;
        Top  = clamped.Top;
    }
    SaveSettings();
}

private void FontSmall_Click(object sender, RoutedEventArgs e)  => ApplyFontSize(16);
private void FontMedium_Click(object sender, RoutedEventArgs e) => ApplyFontSize(24);
private void FontLarge_Click(object sender, RoutedEventArgs e)  => ApplyFontSize(32);
```

### Pattern 4: ContextMenu Opened Event Wiring in XAML

**What:** Attach the `Opened` event on the `<ContextMenu>` element itself, not on the parent Grid.

**Example (XAML):**
```xml
<ContextMenu Opened="ContextMenu_Opened">
```

The `Opened` event is a RoutedEvent on ContextMenu. It fires each time the menu opens, before any item is shown. This is the correct attachment point for synchronizing visual state.

### Anti-Patterns to Avoid

- **Setting IsChecked directly in click handlers only:** If the user changes the font size and then opens the menu again, a handler-only approach requires careful unsetting of the previously checked item. The Opened-event approach eliminates this bookkeeping.
- **Using IsCheckable=True without managing IsChecked:** WPF will toggle IsChecked on click if IsCheckable=True but you do not set it yourself. This means clicking an already-checked item would uncheck it (no checked item visible). Always manage IsChecked explicitly in the Opened handler.
- **Not calling UpdateLayout() before Clamp() after font size change:** SizeToContent=WidthAndHeight means ActualWidth/ActualHeight are stale until after layout runs. The same mistake was made in Phase 4 (fixed in deviation fix `9343668`) — replicate the known-correct pattern.
- **Calling ApplyFontSize() in the constructor before ContentRendered:** UpdateLayout() inside ApplyFontSize() before the window is shown has undefined behavior. Font size at startup is applied via ApplySettings() (which sets the values directly, no UpdateLayout needed), not ApplyFontSize().

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Radio-button menu group | Custom exclusive-check logic across handlers | IsChecked managed in single ContextMenu.Opened handler | Single sync point; impossible to get state out of sync |
| Font size persistence | New JSON file or new field | Existing AppSettings.FontSize + SettingsService | Already wired end-to-end in Phase 4; zero new code in persistence layer |

**Key insight:** Everything below the UI layer (persistence, settings loading, startup application) is already done. Phase 5 is pure UI surface.

## Common Pitfalls

### Pitfall 1: IsCheckable Toggle Side-Effect

**What goes wrong:** If `IsCheckable="True"` is set and you also set `IsChecked` in the Opened handler, a click will: (a) fire Click handler, (b) toggle IsChecked (WPF default for IsCheckable). The toggle happens after the Click handler, so if you set IsChecked=true in the click handler, WPF may then toggle it back to false.

**Why it happens:** `IsCheckable=True` enables WPF's built-in toggle behavior. It does not suppress when IsChecked is set from outside.

**How to avoid:** Use `IsCheckable="True"` for the visual appearance (checkmark glyph when checked) but rely exclusively on the `Opened` handler — not the Click handler — to set IsChecked. The Click handlers only call ApplyFontSize(). The Opened handler sets the correct checked state before the user sees the menu.

**Warning signs:** A font size item that becomes unchecked after being selected, or flickers.

### Pitfall 2: SizeToContent Window Resize After Font Change

**What goes wrong:** Changing font size increases or decreases ActualWidth/ActualHeight. If the widget is near the right or bottom edge, the resize pushes it off-screen.

**Why it happens:** SizeToContent=WidthAndHeight resizes the window to content — font size directly affects content size.

**How to avoid:** Call UpdateLayout() then SettingsService.Clamp() in ApplyFontSize(), guarded by _hasUserPosition (same pattern as the re-clamp in UpdatePhraseIfChanged()). This is already the established pattern in this codebase.

**Warning signs:** Widget partially off-screen after font size change when positioned near a screen edge.

### Pitfall 3: ApplySettings() vs ApplyFontSize() Separation

**What goes wrong:** Refactoring ApplySettings() to call ApplyFontSize() introduces UpdateLayout() and SaveSettings() during startup initialization (before ContentRendered, before window is shown), which is incorrect.

**Why it happens:** ApplyFontSize() has side effects (UpdateLayout, Clamp, SaveSettings) that are only safe after the window is visible and positioned. ApplySettings() runs before Show().

**How to avoid:** Keep ApplySettings() setting FontSize directly on PhraseText and ShadowText without calling ApplyFontSize(). ApplyFontSize() is only for runtime user-initiated changes.

### Pitfall 4: ContextMenu.Opened vs Grid.ContextMenuOpening

**What goes wrong:** Attaching to `Grid.ContextMenuOpening` (a preview event on the Grid) instead of `ContextMenu.Opened` can work but fires before the ContextMenu is fully constructed in some edge cases.

**Why it happens:** ContextMenuOpening is a tunnel event on the element that owns the ContextMenu; Opened is a bubble event on the ContextMenu itself. Both work, but ContextMenu.Opened is the conventional attachment point.

**How to avoid:** Attach `Opened="ContextMenu_Opened"` directly on the `<ContextMenu>` element in XAML.

## Code Examples

Verified patterns from official sources and established project patterns:

### Complete XAML ContextMenu Addition

```xml
<!-- MainWindow.xaml — replaces existing ContextMenu block -->
<!-- Source: WPF ContextMenu docs; IsCheckable/IsChecked: MenuItem docs -->
<Grid.ContextMenu>
    <ContextMenu Opened="ContextMenu_Opened">
        <MenuItem Header="Font Size">
            <MenuItem x:Name="FontSmall"  Header="Small (16pt)"  IsCheckable="True" Click="FontSmall_Click" />
            <MenuItem x:Name="FontMedium" Header="Medium (24pt)" IsCheckable="True" Click="FontMedium_Click" />
            <MenuItem x:Name="FontLarge"  Header="Large (32pt)"  IsCheckable="True" Click="FontLarge_Click" />
        </MenuItem>
        <MenuItem Header="Close" Click="CloseMenuItem_Click" />
    </ContextMenu>
</Grid.ContextMenu>
```

### Complete Code-Behind Additions

```csharp
// MainWindow.xaml.cs additions — all new members
// Source: established project patterns (ApplySettings, SaveSettings, re-clamp)

private void ContextMenu_Opened(object sender, RoutedEventArgs e)
{
    FontSmall.IsChecked  = (_currentFontSize == 16);
    FontMedium.IsChecked = (_currentFontSize == 24);
    FontLarge.IsChecked  = (_currentFontSize == 32);
}

private void FontSmall_Click(object sender, RoutedEventArgs e)  => ApplyFontSize(16);
private void FontMedium_Click(object sender, RoutedEventArgs e) => ApplyFontSize(24);
private void FontLarge_Click(object sender, RoutedEventArgs e)  => ApplyFontSize(32);

private void ApplyFontSize(int size)
{
    _currentFontSize    = size;
    PhraseText.FontSize = size;
    ShadowText.FontSize = size;
    UpdateLayout();
    if (_hasUserPosition)
    {
        var clamped = SettingsService.Clamp(
            new AppSettings(Left, Top, _currentFontSize),
            ActualWidth, ActualHeight);
        Left = clamped.Left;
        Top  = clamped.Top;
    }
    SaveSettings();
}
```

### What Does NOT Change

- `AppSettings.cs` — no changes; FontSize field already present
- `SettingsService.cs` — no changes; Load/Save already round-trips FontSize
- `App.xaml.cs` — no changes; ApplySettings() already applies FontSize on startup
- `ApplySettings()` in MainWindow.xaml.cs — no changes; already sets `_currentFontSize`, `PhraseText.FontSize`, `ShadowText.FontSize`
- `SaveSettings()` in MainWindow.xaml.cs — no changes; already saves `_currentFontSize`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate ViewModel + INotifyPropertyChanged for checked state | Manual IsChecked in Opened handler (code-behind, no MVVM overhead) | N/A for this project | Simpler; matches existing code-behind pattern |

**Deprecated/outdated:**
- None relevant to this phase.

## Open Questions

1. **Should selecting the already-active font size be a no-op or still call SaveSettings()?**
   - What we know: ApplyFontSize() always calls SaveSettings(); calling Save with the same values is idempotent (atomic write, same content).
   - What's unclear: Whether the user would find a re-save annoying (no observable effect).
   - Recommendation: Allow it — the atomic write is fast, and adding an early-return guard adds complexity with no user-visible benefit.

2. **Should the "Font Size" parent MenuItem show any visual indication of the current size?**
   - What we know: The success criteria only requires the submenu items to show IsChecked; no requirement for the parent header to reflect current size.
   - What's unclear: Nothing — requirements are clear.
   - Recommendation: Plain "Font Size" header with no dynamic text. Out of scope per requirements.

## Sources

### Primary (HIGH confidence)

- WPF ContextMenu docs: https://learn.microsoft.com/en-us/dotnet/api/system.windows.controls.contextmenu — ContextMenu.Opened event, confirmed available in .NET 10 WPF
- WPF MenuItem docs: https://learn.microsoft.com/en-us/dotnet/api/system.windows.controls.menuitem — IsCheckable, IsChecked properties, Click event
- Existing project code (MainWindow.xaml.cs, AppSettings.cs, SettingsService.cs) — confirmed live codebase state as of Phase 4

### Secondary (MEDIUM confidence)

- Phase 4 summaries (04-01-SUMMARY.md, 04-02-SUMMARY.md) — document all established patterns including re-clamp, ApplySettings order, SaveSettings paths

### Tertiary (LOW confidence)

- None. All claims are grounded in first-party Microsoft docs or verified codebase state.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — in-box .NET 10 WPF, no new dependencies, existing project pattern
- Architecture: HIGH — direct extension of Phase 4 patterns; all persistence infrastructure already in place
- Pitfalls: HIGH — IsCheckable toggle behavior documented in official WPF MenuItem docs; SizeToContent pitfall is a repeat of a Phase 4 deviation already fixed in codebase

**Research date:** 2026-02-25
**Valid until:** 2026-04-25 (stable — .NET WPF ContextMenu API has not changed meaningfully in years)
