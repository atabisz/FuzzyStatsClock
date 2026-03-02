# Phase 25: Centered Phrase Text - Research

**Researched:** 2026-03-02
**Domain:** WPF XAML layout — TextBlock horizontal alignment and text alignment
**Confidence:** HIGH

## Summary

Phase 25 is a minimal, surgical XAML-only change. The goal is to center the phrase text horizontally within the widget's content area. Both `PhraseText` and `ShadowText` TextBlocks currently have no explicit `HorizontalAlignment` or `TextAlignment` set, which means they default to `HorizontalAlignment="Stretch"` (as children of a Grid) and `TextAlignment="Left"`.

To achieve visual centering, two properties must be set on each TextBlock: `TextAlignment="Center"` (centers the text glyphs within the element's bounding box) and `HorizontalAlignment="Stretch"` (already the default — must remain so the element fills the available Grid cell width). Because the TextBlocks share a Grid cell (`<Grid>` inside `ContentBorder`), both will stretch to the same width and both will render centered text. No code-behind changes are required.

The `DialCanvas` sits in the same inner Grid but is a Canvas element — it is not affected by `TextAlignment`. The `DialCanvas` is mutually exclusive with PhraseText/ShadowText via `Visibility`. No changes to the canvas are needed.

**Primary recommendation:** Add `TextAlignment="Center"` and explicit `HorizontalAlignment="Stretch"` to both `PhraseText` and `ShadowText` TextBlocks in `MainWindow.xaml`. No code-behind changes. No layout helpers. No size changes. Done.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CENTER-01 | In phrase mode, the phrase text is centered horizontally within the widget content area | `TextAlignment="Center"` on PhraseText and ShadowText + `HorizontalAlignment="Stretch"` ensures glyphs are centered within the shared Grid cell; DialCanvas is unaffected |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WPF XAML | .NET 10 (in-box) | TextBlock layout properties | Built into the framework — no packages needed |

### Supporting

None. This is a pure declarative XAML property change.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `TextAlignment="Center"` | `HorizontalAlignment="Center"` on the TextBlock | `HorizontalAlignment="Center"` shrinks the element to content width and centers the *element* within the parent — text would still be left-aligned within the element. Wrong tool. `TextAlignment` centers the *glyphs* within the element's layout box. |
| `TextAlignment="Center"` | `TextBlock.TextAlignment` in a Style | Unnecessary indirection; a Style target for named elements adds complexity with no benefit. Direct attribute is correct. |

## Architecture Patterns

### Current XAML Structure (Phrase Row)

```
ContentBorder (Border, Padding="6")
  └── Grid  ← shared layout cell for all three children
       ├── ShadowText  (TextBlock, no HorizontalAlignment, no TextAlignment)
       ├── PhraseText  (TextBlock, no HorizontalAlignment, no TextAlignment)
       └── DialCanvas  (Canvas 80×80, Visibility="Collapsed" in phrase mode)
```

All three children overlap in the same Grid cell (no RowDefinitions/ColumnDefinitions). The Grid's width is driven by `SizeToContent="WidthAndHeight"` — it sizes to fit the widest child, which is `PhraseText` text content.

### Pattern: TextBlock Centering in a Shared Grid Cell

**What:** When a TextBlock is the sole width-driving element in its Grid cell, centering the text glyphs requires `TextAlignment="Center"`. The element itself must stretch (`HorizontalAlignment="Stretch"`, which is already the default for Grid children), so it spans the full available width, and then `TextAlignment` centers the glyphs within that span.

**When to use:** Any scenario where the element fills its container and you want glyph-level centering.

**Example:**
```xml
<!-- Source: WPF TextBlock documentation — TextAlignment property -->
<TextBlock x:Name="PhraseText"
           Text=""
           FontFamily="Segoe UI Light"
           FontSize="32"
           Foreground="White"
           HorizontalAlignment="Stretch"
           TextAlignment="Center" />
```

### The Shadow TextBlock

`ShadowText` is a visual-only clone of `PhraseText` offset by `TranslateTransform X="2" Y="2"`. It must receive the same `TextAlignment="Center"` so the shadow glyph positions mirror the main text positions exactly. Without this, the shadow renders left-aligned while the phrase text renders centered — the shadow appears displaced horizontally.

```xml
<TextBlock x:Name="ShadowText"
           Text=""
           FontFamily="Segoe UI Light"
           FontSize="32"
           Foreground="#BB000000"
           IsHitTestVisible="False"
           HorizontalAlignment="Stretch"
           TextAlignment="Center">
    <TextBlock.RenderTransform>
        <TranslateTransform X="2" Y="2" />
    </TextBlock.RenderTransform>
</TextBlock>
```

The `TranslateTransform` is a render-level transform applied after layout, so it does not affect the centering calculation. Shadow will appear 2px right and 2px down from the centered phrase text — exactly correct.

### Anti-Patterns to Avoid

- **`HorizontalAlignment="Center"` on the TextBlock**: This collapses the element's layout width to its content size and centers the *element* in the parent. The text remains left-aligned within a content-sized box. This is the wrong result — the text would not be truly centered relative to the widget width.
- **Setting `TextAlignment` in code-behind at runtime**: `TextAlignment` is a static layout property. There is no scenario in this phase where it needs to change at runtime. Setting it in XAML is correct and sufficient.
- **Touching `DialCanvas` or any stats element**: The centering change applies only to the two TextBlocks. DialCanvas, StatsPanel, and all child rows are unaffected.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text centering | Canvas.SetLeft math, Margin arithmetic, code-behind measure/arrange | `TextAlignment="Center"` XAML property | WPF layout engine handles all font sizes, phrase lengths, and resize events automatically |

**Key insight:** WPF's layout system handles centering automatically for all phrase lengths and font sizes (16pt/24pt/32pt). Any manual centering calculation would be fragile across text changes, font changes, and window resizes triggered by SizeToContent.

## Common Pitfalls

### Pitfall 1: Forgetting ShadowText
**What goes wrong:** Only `PhraseText` gets `TextAlignment="Center"`. The shadow renders at the left edge while the phrase is centered — the shadow is visually wrong and appears to float off to the side.
**Why it happens:** `ShadowText` is easy to overlook because it's a helper element with no display role of its own.
**How to avoid:** Always treat `PhraseText` and `ShadowText` as a synchronized pair — every layout property change to one must be mirrored on the other.
**Warning signs:** Shadow appears offset in the wrong direction relative to the phrase text.

### Pitfall 2: Using HorizontalAlignment="Center" Instead of TextAlignment="Center"
**What goes wrong:** The TextBlock element shrinks to content width and centers within the Grid. The glyphs appear centered but the shadow offset is now misaligned because the two elements have different effective layout boxes (shadow may still be Stretch, or vice versa).
**Why it happens:** Developers confuse element alignment (HorizontalAlignment) with text glyph alignment (TextAlignment).
**How to avoid:** Use `TextAlignment="Center"` for glyph centering. Keep `HorizontalAlignment="Stretch"` (the default) on both TextBlocks.
**Warning signs:** Text appears centered when short but misaligns when longer phrases appear; or shadow and text diverge.

### Pitfall 3: SizeToContent Interaction
**What goes wrong:** Concern that centering might cause SizeToContent to size to 0 or to a wrong width.
**Why it doesn't happen:** `SizeToContent="WidthAndHeight"` measures desired size from child elements. TextBlocks with `HorizontalAlignment="Stretch"` report their *content desired width* for measurement purposes (not 0). The window width is set by the maximum desired width of all children in the layout tree. Centering within that measured width is a render-time operation and does not affect the measurement pass.
**How to avoid:** No action needed — this is not actually a risk with `HorizontalAlignment="Stretch"` + `TextAlignment="Center"`.

### Pitfall 4: DialCanvas Interference
**What goes wrong:** Concern that adding centering properties to the TextBlocks might interact with DialCanvas layout.
**Why it doesn't happen:** DialCanvas is `Visibility="Collapsed"` in phrase mode and has explicit `Width="80" Height="80"`. Its layout is independent of the TextBlock properties. In dial mode, PhraseText and ShadowText are `Visibility="Collapsed"` and don't participate in layout at all.
**How to avoid:** No action needed — the XAML mutual exclusion is already correctly implemented.

## Code Examples

### Final XAML for the Inner Grid (Phrase Row)

```xml
<!-- Source: MainWindow.xaml inner grid — phrase display -->
<Grid>
    <!-- Shadow layer: manual offset copy -->
    <TextBlock x:Name="ShadowText"
               Text=""
               FontFamily="Segoe UI Light"
               FontSize="32"
               Foreground="#BB000000"
               IsHitTestVisible="False"
               HorizontalAlignment="Stretch"
               TextAlignment="Center">
        <TextBlock.RenderTransform>
            <TranslateTransform X="2" Y="2" />
        </TextBlock.RenderTransform>
    </TextBlock>

    <!-- PhraseText: live phrase text -->
    <TextBlock x:Name="PhraseText"
               Text=""
               FontFamily="Segoe UI Light"
               FontSize="32"
               Foreground="White"
               HorizontalAlignment="Stretch"
               TextAlignment="Center" />

    <!-- DialCanvas: unaffected — no changes needed -->
    <Canvas x:Name="DialCanvas"
            Width="80" Height="80"
            Visibility="Collapsed">
        ...
    </Canvas>
</Grid>
```

### What Does NOT Change

- No code-behind changes (no `.cs` files modified)
- No changes to `ApplySettings()`, `SetDialMode()`, `UpdatePhraseIfChanged()`, or any other method
- No changes to `StatsPanel`, `ContentBorder`, font size helpers, or any other XAML element
- No new fields, properties, or settings

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No alignment set (defaults: Stretch + Left) | `HorizontalAlignment="Stretch"` + `TextAlignment="Center"` | Phase 25 | Text glyphs horizontally centered in the widget area for all phrase lengths and font sizes |

## Open Questions

None. This phase is fully understood. The implementation is deterministic: two XAML attributes on two TextBlock elements.

## Sources

### Primary (HIGH confidence)

- WPF `TextBlock.TextAlignment` property — built-in .NET 10 WPF framework, behavior unchanged since WPF 3.0. `TextAlignment.Center` centers inline content within the element's layout width.
- WPF layout system — `HorizontalAlignment.Stretch` (default for Grid children) causes an element to fill available width; this is the prerequisite for `TextAlignment` to have a visible centering effect.
- Direct inspection of `MainWindow.xaml` (C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml) — confirmed current TextBlock definitions have no HorizontalAlignment or TextAlignment set.
- Direct inspection of `MainWindow.xaml.cs` — confirmed no code-behind sets `TextAlignment` or `HorizontalAlignment` on PhraseText or ShadowText at runtime.

### Secondary (MEDIUM confidence)

- None required — framework behavior is well-established and directly observable in the existing codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure in-box WPF, no new dependencies
- Architecture: HIGH — existing XAML structure fully examined; change is confined to two attributes on two named elements
- Pitfalls: HIGH — all pitfalls identified from direct codebase inspection, not speculation

**Research date:** 2026-03-02
**Valid until:** Stable indefinitely — WPF TextBlock layout behavior is unchanged since framework inception; no external dependencies
