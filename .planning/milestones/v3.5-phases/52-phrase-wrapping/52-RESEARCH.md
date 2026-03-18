# Phase 52: Phrase Wrapping - Research

**Researched:** 2026-03-18
**Domain:** WPF TextBlock layout, text measurement, phrase splitting logic
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WRAP-01 | In phrase mode, if rendered phrase text width exceeds stats panel width + 10%, the text splits across two lines | WPF `FormattedText` measures glyph width; split result is two `Run` inlines inside `PhraseText` separated by `LineBreak`; trigger threshold is `StatsPanel.Width * 1.1` (constant 184 × 1.1 = 202.4 px) |
| WRAP-02 | User can choose split style (Nearest Midpoint / Natural Pause) in Settings; default Nearest Midpoint | Settings event pattern in SettingsWindow is established; new `PhraseWrapStyleChanged` event fires to MainWindow; `AppSettings.PhraseWrapEnabled` + `AppSettings.PhraseWrapStyle` added; UI best placed in Appearance tab below Phrase Style |
| WRAP-03 | Phrase wrap split style persists to settings.json and restores on launch | `AppSettings` init-property record pattern handles round-trip automatically; `SettingsSnapshot` gets two matching properties; `ApplySettings()` reads them before `Show()` |
</phase_requirements>

---

## Summary

Phase 52 implements automatic two-line phrase wrapping when a phrase is too wide for the stats panel. The trigger condition is `PhraseText.ActualWidth > StatsPanel.ActualWidth * 1.1` (decided: 184 × 1.1 = 202.4 px), evaluated after every phrase update and after font-size changes. When triggered, a `PhraseWrapService` class in `FuzzyClock.Core` computes a split point using one of two strategies ("midpoint" or "natural") and returns two strings. MainWindow sets `PhraseText` content using `Inlines` (a first `Run`, a `LineBreak`, a second `Run`) rather than using `Text` assignment directly — this is how WPF TextBlock achieves a controlled line break.

The shadow effect in the current codebase is a `DropShadowEffect` on `PhraseText` itself (not a separate `ShadowText` element — that plan-era name is obsolete). The `DropShadowEffect` stays attached to `PhraseText` and moves with it; no second TextBlock needs to stay in sync. The phrase update guard (`if (newPhrase == PhraseText.Text)`) must change to compare the raw phrase string (not `PhraseText.Text`, which will contain `\n` after wrapping) — use a `_currentRawPhrase` field.

**Primary recommendation:** Implement `PhraseWrapService` as a pure static class in `FuzzyClock.Core` (testable without WPF), with a `ComputeSplit(string phrase, string style)` method returning `(string Line1, string Line2)?`. Evaluate the wrap trigger in MainWindow using `PhraseText.ActualWidth` after `UpdateLayout()`, which is already called in `UpdatePhraseIfChanged`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WPF TextBlock Inlines | .NET 10 built-in | Insert `LineBreak` for controlled mid-text line break | Only reliable way to break a single TextBlock at a specific word boundary |
| FormattedText (System.Windows.Media) | .NET 10 built-in | Measure glyph width of a string without layout pass | Exact pixel width at given font/size — used in PhraseWrapService trigger check |

### No External Dependencies
Phrase splitting is pure string logic. No new NuGet packages needed.

---

## Architecture Patterns

### Recommended Structure

```
FuzzyClock.Core/
  PhraseWrapService.cs     # NEW — pure static, testable; ComputeSplit() returns (Line1, Line2)?
FuzzyClock.App/
  MainWindow.xaml.cs       # MODIFIED — ApplyPhraseWrap(), UpdatePhraseIfChanged(), ApplySettings()
  AppSettings.cs           # MODIFIED — add PhraseWrapEnabled, PhraseWrapStyle
  SettingsSnapshot.cs      # MODIFIED — add PhraseWrapEnabled, PhraseWrapStyle
  SettingsWindow.xaml      # MODIFIED — add wrap controls in Appearance tab
  SettingsWindow.xaml.cs   # MODIFIED — add PhraseWrapEnabledChanged, PhraseWrapStyleChanged events
FuzzyClock.Core.Tests/
  PhraseWrapServiceTests.cs # NEW — unit tests for both split algorithms
```

### Pattern 1: PhraseText Inline-based Line Break

**What:** Use `TextBlock.Inlines` instead of `TextBlock.Text` to insert a `LineBreak` at the split point.

**When to use:** When wrap is active and the phrase text exceeds the width threshold.

**Example:**
```csharp
// Source: WPF official docs — Inline content model for TextBlock
// Split mode: two Runs with a LineBreak between them
PhraseText.Inlines.Clear();
PhraseText.Inlines.Add(new Run(line1));
PhraseText.Inlines.Add(new LineBreak());
PhraseText.Inlines.Add(new Run(line2));

// Single-line mode: restore plain Text assignment via Inlines
PhraseText.Inlines.Clear();
PhraseText.Inlines.Add(new Run(phrase));
```

**Critical note:** Once you use `Inlines.Add()`, reading `PhraseText.Text` no longer returns the plain string — it returns the concatenated inline content. The phrase-change guard in `UpdatePhraseIfChanged` must track `_currentRawPhrase` separately.

### Pattern 2: Width Trigger — PhraseText.ActualWidth vs StatsPanel.ActualWidth

**What:** After setting phrase text and calling `UpdateLayout()`, compare actual widths.

**When to use:** In `ApplyPhraseWrap()` called from `UpdatePhraseIfChanged` and from `ApplyFontSize`.

**Example:**
```csharp
// Source: codebase analysis — UpdatePhraseIfChanged already calls UpdateLayout()
private void ApplyPhraseWrap(string rawPhrase)
{
    if (_dialMode || !_phraseWrapEnabled)
    {
        SetPhraseTextSingleLine(rawPhrase);
        return;
    }

    // Measure after a layout pass with the single-line text set
    SetPhraseTextSingleLine(rawPhrase);
    UpdateLayout();

    double threshold = StatsPanel.ActualWidth > 0
        ? StatsPanel.ActualWidth * 1.1
        : 184.0 * 1.1;  // fallback when stats panel is collapsed

    if (PhraseText.ActualWidth > threshold)
    {
        var split = PhraseWrapService.ComputeSplit(rawPhrase, _phraseWrapStyle);
        if (split.HasValue)
        {
            PhraseText.Inlines.Clear();
            PhraseText.Inlines.Add(new Run(split.Value.Line1));
            PhraseText.Inlines.Add(new LineBreak());
            PhraseText.Inlines.Add(new Run(split.Value.Line2));
        }
    }
}
```

### Pattern 3: Stats Panel Width When Collapsed

**What:** `StatsPanel.ActualWidth` is 0 when `Visibility="Collapsed"`. Use the hardcoded `Width="184"` attribute value as fallback.

**When to use:** Always — stats panel may be hidden.

**Implementation:**
```csharp
double panelWidth = StatsPanel.Visibility == Visibility.Visible
    ? StatsPanel.ActualWidth
    : 184.0;
double threshold = panelWidth * 1.1;
```

The constant `184.0` is already known in the codebase (`StatsPanel Width="184"` in XAML; `StatsBarTrackWidth = 113.0` computed from it).

### Pattern 4: PhraseWrapService — Nearest Midpoint Algorithm

**What:** Find word boundary (space) closest to the midpoint index of the string.

```csharp
// Source: pure string logic — no external dependency
public static (string Line1, string Line2)? ComputeSplit(string phrase, string style)
{
    if (string.IsNullOrWhiteSpace(phrase)) return null;
    var words = phrase.Split(' ');
    if (words.Length < 2) return null;  // single word — cannot split

    return style == "natural"
        ? SplitNatural(phrase, words)
        : SplitMidpoint(phrase, words);
}

private static (string, string) SplitMidpoint(string phrase, string[] words)
{
    int mid = phrase.Length / 2;
    // Find all split positions (indices after each space)
    int best = -1;
    int bestDist = int.MaxValue;
    int pos = 0;
    for (int i = 0; i < words.Length - 1; i++)
    {
        pos += words[i].Length + 1;  // +1 for the space
        int dist = Math.Abs(pos - mid);
        if (dist < bestDist) { bestDist = dist; best = i; }
    }
    string line1 = string.Join(" ", words[..( best + 1)]);
    string line2 = string.Join(" ", words[(best + 1)..]);
    return (line1, line2);
}
```

### Pattern 5: PhraseWrapService — Natural Pause Algorithm

**What:** Split after the first grammatical or tonal beat in English phrases.

**Known natural pause points in the English phrase set:**
- `"just after {h}"` → split after "just after" / hour word
- `"ten past {h}"` → split after "ten past"
- `"a quarter past {h}"` → split after "a quarter past"
- `"just after quarter past {h}"` → split after "just after"
- `"almost half past {h}"` → split after "almost"
- `"half past {h}"` → split after "half past"
- `"just past half past {h}"` → split after "just past"
- `"almost a quarter before {h1}"` → split after "almost"
- `"a quarter before {h1}"` → split after "a quarter"
- `"nearly {h1}"` → falls back to midpoint (two words only)
- `"almost {h1}"` → falls back to midpoint

**Implementation approach:** The natural pause split is best expressed as a list of known phrase prefix patterns matched against the phrase string, falling back to midpoint if none match. This keeps the logic in `FuzzyClock.Core` testable against real phrase output.

```csharp
private static readonly string[] NaturalPauseMarkers = [
    "just after quarter past ",  // match longest first
    "almost a quarter before ",
    "just past half past ",
    "a quarter before ",
    "a quarter past ",
    "almost half past ",
    "just after ",
    "half past ",
    "just past ",
    "ten past ",
    "ten to ",
    "nearly ",
    "almost ",
];

private static (string, string) SplitNatural(string phrase, string[] words)
{
    foreach (var marker in NaturalPauseMarkers)
    {
        if (phrase.StartsWith(marker, StringComparison.OrdinalIgnoreCase))
        {
            string line1 = phrase[..(marker.Length - 1)].TrimEnd();  // strip trailing space
            string line2 = phrase[marker.Length..];
            if (!string.IsNullOrWhiteSpace(line2))
                return (line1, line2);
        }
    }
    // No marker matched — fall back to midpoint
    return SplitMidpoint(phrase, words);
}
```

### Pattern 6: Change Guard — Raw Phrase Tracking

**What:** `UpdatePhraseIfChanged` currently compares `newPhrase == PhraseText.Text`. After wrapping, `PhraseText.Text` may contain `\n` (from Inlines concatenation) or return the joined inline text. Store the raw phrase string independently.

```csharp
private string _currentRawPhrase = "";  // new field — tracks raw phrase before wrap

private void UpdatePhraseIfChanged()
{
    string newPhrase = PhraseEngine.GetPhrase(DateTime.Now);
    if (newPhrase == _currentRawPhrase) return;  // no change
    _currentRawPhrase = newPhrase;
    ApplyPhraseWrap(newPhrase);
    // ... split textblock updates unchanged
}
```

The same guard invalidation pattern used by `SetPhraseStyle` (`PhraseText.Text = ""`) must change to `_currentRawPhrase = ""`.

### Pattern 7: DropShadowEffect — No Second TextBlock Required

**What:** The current XAML uses `DropShadowEffect` directly on `PhraseText` (not a layered `ShadowText` element). This effect renders the shadow as a post-processing step; it moves with the element and wraps with it automatically.

**Implication:** The `ShadowText` mentioned in the phase success criteria refers to a historical design that was NOT implemented. There is no `ShadowText` in the current XAML or code. The planner can ignore the `ShadowText` synchronization concern — it is not applicable. The `DropShadowEffect` on `PhraseText` handles shadow automatically.

### Anti-Patterns to Avoid

- **TextBlock.Text assignment after Inlines manipulation:** Once you add to `Inlines`, setting `Text` clears all inlines. Pick one approach per element. Use `Inlines` throughout; set initial text via `Inlines.Add(new Run(...))`.
- **Measuring width before UpdateLayout():** `PhraseText.ActualWidth` is stale until a layout pass runs. Always call `UpdateLayout()` before reading `ActualWidth`. The codebase already does this.
- **Using StatsPanel.ActualWidth when Collapsed:** Collapsed panels report 0. Always fall back to `184.0` when collapsed.
- **Triggering wrap in Split text style:** When `_currentTextStyle == "Split"`, `PhraseText` is `Collapsed` and `SplitPhrasePanel` is visible. Wrap logic must only apply when `PhraseText` is the active display element — check `!_dialMode && _currentTextStyle != "Split"`.
- **Invalidating phrase cache with PhraseText.Text = "":** After switching to Inlines, setting `PhraseText.Text = ""` still clears inlines. But the cache variable changes to `_currentRawPhrase = ""` so the guard correctly fires on next tick. Both approaches remain compatible.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rendering shadow text | Second layered TextBlock | `DropShadowEffect` already on `PhraseText` | Already implemented; a second element would add sync complexity |
| Measuring text width at runtime | Iterating font metrics manually | `PhraseText.ActualWidth` after `UpdateLayout()` | WPF layout engine already does this accurately |
| Breaking long words | Mid-word hyphenation logic | Return `null` from `ComputeSplit` for single-word phrases | Phrase vocabulary never produces single-word output except "noon"/"midnight" — those are short enough to never trigger wrap |

---

## Common Pitfalls

### Pitfall 1: Inlines vs Text property confusion
**What goes wrong:** Setting `PhraseText.Text = "foo"` after ever calling `Inlines.Add()` may behave inconsistently — WPF's TextBlock clears inlines when Text is set, but reading `Text` after `Inlines.Add()` returns the concatenated run text (no `\n` separator visible in property, though rendered as separate lines).
**Why it happens:** TextBlock has two content models: `Text` property (simple string) and `Inlines` collection. They are mutually exclusive but there's no compile-time guard.
**How to avoid:** Commit to the Inlines approach for `PhraseText` from the start. Never assign `PhraseText.Text` directly after this phase. Use `PhraseText.Inlines.Clear(); PhraseText.Inlines.Add(new Run(text));` for single-line mode too.
**Warning signs:** `PhraseText.Text` returning empty string when you expect content.

### Pitfall 2: UpdateLayout() double-call overhead
**What goes wrong:** Calling `UpdateLayout()` twice — once to measure single-line width, then again after applying the split — causes two synchronous layout passes per tick.
**Why it happens:** The trigger check requires the single-line ActualWidth, then after splitting the text changes and another layout pass is needed for clamp.
**How to avoid:** Accept two layout passes in `ApplyPhraseWrap`. The current `UpdatePhraseIfChanged` already calls `UpdateLayout()` once for clamp purposes; restructure so the second call is the one used for clamp (not an extra call).

### Pitfall 3: Wrap triggering in dial mode or split text style
**What goes wrong:** Wrap logic fires when `PhraseText` is not visible (dial mode, or Split text style where SplitPhrasePanel is active), wasting layout work and potentially corrupting inlines state.
**Why it happens:** `ApplyPhraseWrap` is called from `UpdatePhraseIfChanged` without a mode guard.
**How to avoid:** Guard at the top of `ApplyPhraseWrap`: `if (_dialMode || _currentTextStyle == "Split") { SetPhraseTextSingleLine(rawPhrase); return; }`. Success criteria 6 explicitly requires this: "In dial mode, no wrap logic runs."

### Pitfall 4: Natural pause markers for non-English locales
**What goes wrong:** Natural pause split fires on French/Spanish/German/Japanese/Polish phrases using English-language markers, producing no match (falls back to midpoint anyway — harmless) or a wrong split.
**Why it happens:** `NaturalPauseMarkers` are English strings.
**How to avoid:** Natural pause markers work only for English locales. For non-English locales, fall back to midpoint regardless of style setting. Add a locale guard in `ComputeSplit`: if the phrase contains non-ASCII or uses a non-English locale, use midpoint.
**Alternative:** Since `PhraseWrapService` is in `FuzzyClock.Core` and doesn't know the active locale, pass `useNatural: bool` from MainWindow after checking `PhraseEngine.CurrentLocale.StartsWith("en-")`.

### Pitfall 5: Empty/single-word phrase edge cases
**What goes wrong:** "noon" and "midnight" are single words. `ComputeSplit` must return `null` for these; the caller must handle null gracefully (display single-line).
**Why it happens:** Split algorithms assume at least two words.
**How to avoid:** Guard in `ComputeSplit`: `if (words.Length < 2) return null;`. In MainWindow, if `split` is null, keep single-line display.

### Pitfall 6: Stale `_currentRawPhrase` after settings change
**What goes wrong:** `SetPhraseStyle`, `SetLanguage`, and `ResetToDefaults` all invalidate the phrase cache by clearing `PhraseText.Text`. After switching to Inlines, this must become `_currentRawPhrase = ""`.
**How to avoid:** Search and replace all `PhraseText.Text = ""` cache-invalidation calls with `_currentRawPhrase = ""`. These are distinct from `PhraseText.Inlines.Clear()` which is part of the render path.

---

## Code Examples

### Adding wrap controls to SettingsWindow Appearance tab

```xml
<!-- Phrase Wrap — add below Phrase Style row in the Grid -->
<TextBlock Grid.Row="4" Grid.Column="0"
           Text="Phrase Wrap" VerticalAlignment="Top"
           HorizontalAlignment="Right" Margin="0,8,10,0"/>
<StackPanel Grid.Row="4" Grid.Column="1" Margin="0,8,0,0">
    <CheckBox x:Name="ChkPhraseWrap" Content="Wrap long phrases"
              Checked="ChkPhraseWrap_Changed" Unchecked="ChkPhraseWrap_Changed"/>
    <StackPanel x:Name="WrapStylePanel" Orientation="Horizontal" Margin="0,6,0,0">
        <RadioButton x:Name="RbWrapMidpoint" Content="Nearest Midpoint"
                     GroupName="WrapStyle" Margin="0,0,14,0"
                     Checked="RbWrapMidpoint_Checked"/>
        <RadioButton x:Name="RbWrapNatural" Content="Natural Pause"
                     GroupName="WrapStyle" Checked="RbWrapNatural_Checked"/>
    </StackPanel>
</StackPanel>
```

Note: The Appearance tab Grid currently has 4 rows (index 0–3). Add `<RowDefinition Height="Auto"/>` and use `Grid.Row="4"`.

### AppSettings additions

```csharp
// Add to AppSettings record:
public bool   PhraseWrapEnabled { get; init; } = true;
public string PhraseWrapStyle   { get; init; } = "midpoint";  // "midpoint" | "natural"
```

### SettingsSnapshot additions

```csharp
// Add to SettingsSnapshot record:
public bool   PhraseWrapEnabled { get; init; } = true;
public string PhraseWrapStyle   { get; init; } = "midpoint";
```

### SettingsWindow new events

```csharp
public event Action<bool>?   PhraseWrapEnabledChanged;
public event Action<string>? PhraseWrapStyleChanged;
```

### MainWindow SaveSettings additions

```csharp
// In BuildCurrentSettings():
PhraseWrapEnabled = _phraseWrapEnabled,
PhraseWrapStyle   = _phraseWrapStyle,
```

### MainWindow ApplySettings additions

```csharp
// In ApplySettings(AppSettings s):
_phraseWrapEnabled = s.PhraseWrapEnabled;
_phraseWrapStyle   = s.PhraseWrapStyle;
```

### MainWindow SettingsWindow event wiring

```csharp
// In OpenSettings():
_settingsWindow.PhraseWrapEnabledChanged += enabled => SetPhraseWrapEnabled(enabled);
_settingsWindow.PhraseWrapStyleChanged   += style   => SetPhraseWrapStyle(style);
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| ShadowText layered TextBlock (design doc era) | `DropShadowEffect` on `PhraseText` directly | Current XAML uses DropShadowEffect — no ShadowText element exists |
| `PhraseText.Text = value` for all phrase updates | `PhraseText.Inlines.Clear(); Inlines.Add(...)` | Required after this phase to support LineBreak injection |

---

## Open Questions

1. **WrapStylePanel enable/disable when PhraseWrap is unchecked**
   - What we know: the radio buttons for style should be greyed out when the wrap checkbox is off
   - What's unclear: whether to use `IsEnabled` binding or set it in the Checked handler
   - Recommendation: set `WrapStylePanel.IsEnabled = enabled` in the `ChkPhraseWrap_Changed` handler — same pattern as `CmbPhraseStyle.IsEnabled` for non-English locales

2. **Width threshold when stats panel is hidden and no prior render**
   - What we know: `StatsPanel.ActualWidth` is 0 when Collapsed; fall back to `184.0`
   - What's unclear: whether the phrase text border/padding adds to measured width and affects threshold accuracy
   - Recommendation: use `184.0` as the fallback constant (matches XAML `Width="184"`); this is a conservative threshold — false negatives (not wrapping when we could) are preferable to false positives

3. **Natural pause for non-English locales**
   - What we know: NaturalPauseMarkers are English-only; non-English locale falls back to midpoint
   - Recommendation: pass a `bool allowNatural` parameter from MainWindow based on `PhraseEngine.CurrentLocale.StartsWith("en-")`

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read — `MainWindow.xaml`, `MainWindow.xaml.cs`, `AppSettings.cs`, `SettingsWindow.xaml`, `SettingsWindow.xaml.cs`, `SettingsSnapshot.cs` — all patterns verified from live source
- Codebase direct read — `PhraseEngine.cs`, `EnglishPhraseProvider.cs`, `TersePhraseProvider.cs` — complete phrase vocabulary enumerated for natural pause marker design
- `.planning/STATE.md` — locked decisions: wrap trigger `PhraseText.ActualWidth > StatsPanel.ActualWidth * 1.1`, styles "midpoint"/"natural", settings keys `PhraseWrapEnabled`/`PhraseWrapStyle`

### Secondary (MEDIUM confidence)
- WPF TextBlock Inlines model: standard .NET WPF API, stable since .NET Framework 3.0; `LineBreak`, `Run` classes are part of `System.Windows.Documents`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure WPF built-in APIs, no new dependencies
- Architecture: HIGH — extends established codebase patterns exactly (event-based settings, Inlines content model)
- Pitfalls: HIGH — identified from direct code analysis; Inlines/Text confusion is a known WPF trap
- Split algorithms: HIGH — midpoint is trivial string logic; natural pause is enumerated against the actual phrase vocabulary

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable domain — pure WPF + string logic)
