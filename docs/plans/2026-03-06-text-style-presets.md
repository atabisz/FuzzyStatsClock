# Text Style Presets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add four selectable text style presets (Classic, Split, Literary, Expressive) that control font family and single-line vs two-line typographic layout for the fuzzy phrase, selectable from a new "Text Style" tray submenu.

**Architecture:** `PhraseEngine.GetStructuredPhrase()` decomposes phrases into (qualifier, emphasis) for the split layout. Two new XAML TextBlocks (`QualifierText`, `EmphasisText`) in a `SplitPhrasePanel` handle the two-line layout. `SetTextStyle(string)` in MainWindow applies font family, sizing, and layout visibility. All four presets persist via the existing `AppSettings`/`SettingsService` pipeline.

**Tech Stack:** C# 13, WPF (.NET 10), MSTest 4.0.1, `Palatino Linotype` and `Segoe UI Light` (both built into Windows).

---

## Task 1: PhraseEngine — GetStructuredPhrase (TDD)

**Files:**
- Modify: `FuzzyClock.Core/PhraseEngine.cs`
- Modify: `FuzzyClock.Core.Tests/PhraseEngineTests.cs`

### Step 1: Write the failing tests

Add to `PhraseEngineTests.cs` after the existing test classes:

```csharp
// ----- GetStructuredPhrase -----

[TestClass]
public class GetStructuredPhraseTests
{
    private static DateTime T(int hour, int minute) =>
        new DateTime(2024, 1, 15, hour, minute, 0);

    [TestMethod]
    [DataRow(12, 0, "",           "noon")]
    [DataRow(0,  0, "",           "midnight")]
    public void SpecialCases_NoQualifier(int hour, int minute, string expectedQual, string expectedEmph)
    {
        var (q, e) = PhraseEngine.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual(expectedQual, q);
        Assert.AreEqual(expectedEmph, e);
    }

    [TestMethod]
    [DataRow(3,  0, "",           "three o'clock")]   // {h} o'clock — whole phrase is emphasis
    [DataRow(9,  0, "",           "nine o'clock")]
    public void OClockBucket_WholeExpressionIsEmphasis(int hour, int minute, string expectedQual, string expectedEmph)
    {
        var (q, e) = PhraseEngine.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual(expectedQual, q);
        Assert.AreEqual(expectedEmph, e);
    }

    [TestMethod]
    [DataRow(3,  5, "just after",              "three")]
    [DataRow(3, 10, "ten past",                "three")]
    [DataRow(3, 15, "a quarter past",          "three")]
    [DataRow(3, 20, "just after quarter past", "three")]
    [DataRow(3, 25, "almost half past",        "three")]
    [DataRow(3, 30, "half past",               "three")]
    [DataRow(3, 35, "just past half past",     "three")]
    public void CurrentHourTemplates_QualifierAndEmphasis(int hour, int minute, string expectedQual, string expectedEmph)
    {
        var (q, e) = PhraseEngine.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual(expectedQual, q);
        Assert.AreEqual(expectedEmph, e);
    }

    [TestMethod]
    [DataRow(3, 40, "almost a quarter before", "four")]
    [DataRow(3, 45, "a quarter before",        "four")]
    [DataRow(3, 50, "nearly",                  "four")]
    [DataRow(3, 55, "almost",                  "four")]
    public void NextHourTemplates_QualifierAndEmphasis(int hour, int minute, string expectedQual, string expectedEmph)
    {
        var (q, e) = PhraseEngine.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual(expectedQual, q);
        Assert.AreEqual(expectedEmph, e);
    }

    [TestMethod]
    [DataRow(12, 55, "almost", "one")]    // hour12=12, nextHour12=1
    [DataRow(11, 50, "nearly", "twelve")] // nextHour12=12
    public void HourWrap_QualifierAndEmphasis(int hour, int minute, string expectedQual, string expectedEmph)
    {
        var (q, e) = PhraseEngine.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual(expectedQual, q);
        Assert.AreEqual(expectedEmph, e);
    }
}
```

### Step 2: Run tests to verify they fail

```
dotnet test FuzzyClock.Core.Tests --filter "GetStructuredPhrase" -v n
```

Expected: FAIL — `GetStructuredPhrase` does not exist yet.

### Step 3: Implement GetStructuredPhrase

Add to `FuzzyClock.Core/PhraseEngine.cs` after `GetPhrase()`:

```csharp
/// <summary>
/// Decomposes the fuzzy time phrase into a qualifier (context) and emphasis (the key word).
/// Used by split-layout text styles to apply typographic hierarchy.
///
/// Rules:
/// - Special cases (noon, midnight): qualifier="", emphasis=full word
/// - "{h} o'clock" templates: qualifier="", emphasis=full phrase (e.g. "three o'clock")
/// - All other templates: qualifier=text before the hour word, emphasis=resolved hour word
/// </summary>
public static (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt)
{
    int totalMinutes = dt.Hour * 60 + dt.Minute;
    if (totalMinutes == 720) return ("", "noon");
    if (totalMinutes == 0)   return ("", "midnight");

    int minute = dt.Minute;
    int hour12     = dt.Hour % 12;
    if (hour12 == 0) hour12 = 12;
    int nextHour12 = (hour12 % 12) + 1;

    foreach (var (upperBound, template) in Buckets)
    {
        if (minute <= upperBound)
        {
            // "{h} o'clock" — hour word comes first; treat whole expression as emphasis, no qualifier
            if (template == "{h} o'clock")
                return ("", template.Replace("{h}", HourWords[hour12]));

            // All other templates end with {h} or {h1}
            if (template.EndsWith("{h}"))
            {
                string qualifier = template[..^"{h}".Length].TrimEnd();
                return (qualifier, HourWords[hour12]);
            }
            if (template.EndsWith("{h1}"))
            {
                string qualifier = template[..^"{h1}".Length].TrimEnd();
                return (qualifier, HourWords[nextHour12]);
            }

            // Fallback: whole phrase as emphasis (should not occur with current templates)
            return ("", template.Replace("{h}", HourWords[hour12]).Replace("{h1}", HourWords[nextHour12]));
        }
    }

    throw new InvalidOperationException($"No bucket matched minute={minute}");
}
```

### Step 4: Run tests to verify they pass

```
dotnet test FuzzyClock.Core.Tests --filter "GetStructuredPhrase" -v n
```

Expected: All 16 test cases PASS.

### Step 5: Run full suite to check no regressions

```
dotnet test --no-build -v n
```

Expected: All prior tests still pass. Count increases by 16.

### Step 6: Commit

```bash
git add FuzzyClock.Core/PhraseEngine.cs FuzzyClock.Core.Tests/PhraseEngineTests.cs
git commit -m "feat(core): add PhraseEngine.GetStructuredPhrase for typographic hierarchy"
```

---

## Task 2: AppSettings — TextStyle field + Validate guard

**Files:**
- Modify: `FuzzyClock.App/AppSettings.cs`
- Modify: `FuzzyClock.App/SettingsService.cs`
- Modify: `FuzzyClock.App.Tests/AppSettingsTests.cs` (or `SettingsServiceTests.cs`)

### Step 1: Write the failing tests

Add to `FuzzyClock.App.Tests/SettingsServiceTests.cs`:

```csharp
[TestMethod]
public void Validate_InvalidTextStyle_ResetsToClassic()
{
    var s = new AppSettings { TextStyle = "NotAStyle" };
    var result = SettingsService.Validate(s);
    Assert.AreEqual("Classic", result.TextStyle);
}

[TestMethod]
public void Validate_EmptyTextStyle_ResetsToClassic()
{
    var s = new AppSettings { TextStyle = "" };
    var result = SettingsService.Validate(s);
    Assert.AreEqual("Classic", result.TextStyle);
}

[TestMethod]
[DataRow("Classic")]
[DataRow("Split")]
[DataRow("Literary")]
[DataRow("Expressive")]
public void Validate_ValidTextStyle_Preserved(string style)
{
    var s = new AppSettings { TextStyle = style };
    var result = SettingsService.Validate(s);
    Assert.AreEqual(style, result.TextStyle);
}
```

Add to `FuzzyClock.App.Tests/AppSettingsTests.cs`:

```csharp
[TestMethod]
public void AppSettings_TextStyle_DefaultIsClassic()
{
    var s = new AppSettings();
    Assert.AreEqual("Classic", s.TextStyle);
}

[TestMethod]
public void AppSettings_TextStyle_RoundTrips()
{
    var original = new AppSettings { TextStyle = "Expressive" };
    var json = System.Text.Json.JsonSerializer.Serialize(original);
    var loaded = System.Text.Json.JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.AreEqual("Expressive", loaded.TextStyle);
}

[TestMethod]
public void AppSettings_MissingTextStyle_DefaultsToClassic()
{
    // Simulate old settings.json without TextStyle field
    var json = "{\"FontSize\":32}";
    var loaded = System.Text.Json.JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.AreEqual("Classic", loaded.TextStyle);
}
```

### Step 2: Run tests to verify they fail

```
dotnet test FuzzyClock.App.Tests -v n
```

Expected: FAIL — `TextStyle` property does not exist.

### Step 3: Add TextStyle to AppSettings.cs

Add after `ProcessCountThresholdPercent`:

```csharp
public string TextStyle { get; init; } = "Classic";  // "Classic"|"Split"|"Literary"|"Expressive"
```

### Step 4: Update SettingsService.Validate()

Add after the `ProcessCountThresholdPercent` guard (before the `MonitorPositions` null guard):

```csharp
// TextStyle guard — only the four named presets are valid
string[] validStyles = { "Classic", "Split", "Literary", "Expressive" };
if (string.IsNullOrWhiteSpace(loaded.TextStyle) || !validStyles.Contains(loaded.TextStyle))
    loaded = loaded with { TextStyle = Defaults().TextStyle };
```

### Step 5: Update SettingsService.Defaults()

Add `TextStyle = "Classic"` to the `Defaults()` return expression:

```csharp
TextStyle = "Classic",
```

### Step 6: Run tests to verify they pass

```
dotnet test FuzzyClock.App.Tests -v n
```

Expected: All new tests PASS.

### Step 7: Run full suite

```
dotnet test -v n
```

Expected: All tests pass. Count increases by 6.

### Step 8: Commit

```bash
git add FuzzyClock.App/AppSettings.cs FuzzyClock.App/SettingsService.cs FuzzyClock.App.Tests/SettingsServiceTests.cs FuzzyClock.App.Tests/AppSettingsTests.cs
git commit -m "feat(settings): add TextStyle preset field with Validate guard"
```

---

## Task 3: XAML — SplitPhrasePanel

**Files:**
- Modify: `FuzzyClock.App/MainWindow.xaml`

### Step 1: Add QualifierText and EmphasisText inside the phrase inner Grid

Locate the inner `<Grid>` that contains `PhraseText` and `DialCanvas` (lines 37–64 in the original). Add `SplitPhrasePanel` as a third sibling element after `PhraseText`:

```xml
<!-- Split layout container — visible in Split/Expressive text styles.
     QualifierText: small faded qualifier (e.g. "just after").
     EmphasisText: large prominent hour word (e.g. "three").
     Both hidden by default — SetTextStyle activates on style change. -->
<StackPanel x:Name="SplitPhrasePanel"
            Orientation="Vertical"
            HorizontalAlignment="Center"
            Visibility="Collapsed">
    <TextBlock x:Name="QualifierText"
               Text=""
               FontFamily="Segoe UI Light"
               FontSize="20"
               Foreground="White"
               Opacity="0.55"
               HorizontalAlignment="Center"
               TextAlignment="Center" />
    <TextBlock x:Name="EmphasisText"
               Text=""
               FontFamily="Segoe UI Light"
               FontSize="44"
               Foreground="White"
               HorizontalAlignment="Center"
               TextAlignment="Center" />
</StackPanel>
```

The `FontSize` values (20 and 44) are initial placeholder values — `ApplyFontSize()` will set them correctly at runtime based on `_currentFontSize`.

### Step 2: Build to verify no XAML parse errors

```
dotnet build FuzzyClock.App -v q
```

Expected: Build succeeds. `QualifierText`, `EmphasisText`, `SplitPhrasePanel` are now accessible from code-behind.

### Step 3: Commit

```bash
git add FuzzyClock.App/MainWindow.xaml
git commit -m "feat(xaml): add SplitPhrasePanel with QualifierText and EmphasisText"
```

---

## Task 4: MainWindow — SetTextStyle and phrase display logic

**Files:**
- Modify: `FuzzyClock.App/MainWindow.xaml.cs`
- Modify: `FuzzyClock.App/App.xaml.cs`

### Step 1: Add _currentTextStyle field

In the field declarations block (around line 14), add after `_dialMode`:

```csharp
private string _currentTextStyle = "Classic";
```

### Step 2: Add SetTextStyle helper method

Add after `SetOpacity()` (around line 815):

```csharp
private void SetTextStyle(string style)
{
    _currentTextStyle = style;

    // Font family: Palatino Linotype for Literary/Expressive, Segoe UI Light for Classic/Split
    bool isSerif = style == "Literary" || style == "Expressive";
    var family = new System.Windows.Media.FontFamily(isSerif ? "Palatino Linotype" : "Segoe UI Light");
    PhraseText.FontFamily    = family;
    QualifierText.FontFamily = family;
    EmphasisText.FontFamily  = family;

    // Apply current font sizes to split TextBlocks
    QualifierText.FontSize = (int)(_currentFontSize * 0.65);
    EmphasisText.FontSize  = (int)(_currentFontSize * 1.40);

    // Layout visibility: split modes hide PhraseText, show SplitPhrasePanel (unless dial mode active)
    if (!_dialMode)
    {
        bool isSplit = style == "Split" || style == "Expressive";
        PhraseText.Visibility      = isSplit ? Visibility.Collapsed : Visibility.Visible;
        SplitPhrasePanel.Visibility = isSplit ? Visibility.Visible  : Visibility.Collapsed;
    }

    UpdateLayout();
    if (_hasUserPosition)
    {
        var screen = System.Windows.Forms.Screen.FromPoint(
            new System.Drawing.Point((int)(Left + ActualWidth / 2), (int)(Top + ActualHeight / 2)));
        var clamped = SettingsService.Clamp(
            new MonitorPosition { Left = Left, Top = Top },
            ActualWidth, ActualHeight, screen);
        Left = clamped.Left;
        Top  = clamped.Top;
    }
    SaveSettings();
}
```

### Step 3: Update ApplyFontSize to also size split TextBlocks

In `ApplyFontSize()`, after `PhraseText.FontSize = size;`, add:

```csharp
QualifierText.FontSize = (int)(size * 0.65);
EmphasisText.FontSize  = (int)(size * 1.40);
```

### Step 4: Update SetInitialPhrase to take DateTime

Change the signature and body:

```csharp
internal void SetInitialPhrase(DateTime dt)
{
    string fullPhrase = PhraseEngine.GetPhrase(dt);
    PhraseText.Text = fullPhrase;

    var (qualifier, emphasis) = PhraseEngine.GetStructuredPhrase(dt);
    QualifierText.Text = qualifier;
    EmphasisText.Text  = emphasis;
}
```

### Step 5: Update App.xaml.cs call site

Change line 51 from:

```csharp
mainWindow.SetInitialPhrase(PhraseEngine.GetPhrase(DateTime.Now));
```

To:

```csharp
mainWindow.SetInitialPhrase(DateTime.Now);
```

Also remove `using FuzzyClock.Core;` if it is only used for `PhraseEngine.GetPhrase` — but keep it if used elsewhere. Check: `PhraseEngine` is still imported for `App.xaml.cs`? After this change `App.xaml.cs` no longer calls `PhraseEngine` directly. Remove the `using FuzzyClock.Core;` line from `App.xaml.cs` if it becomes unused.

### Step 6: Update UpdatePhraseIfChanged to populate split TextBlocks

Current change detection uses `PhraseText.Text`. Keep that as the canonical comparison. After the change, when the phrase updates, also update the split TextBlocks:

Replace the body of `UpdatePhraseIfChanged()`:

```csharp
private void UpdatePhraseIfChanged()
{
    string newPhrase = PhraseEngine.GetPhrase(DateTime.Now);
    if (newPhrase == PhraseText.Text) return;  // No change — skip layout work

    PhraseText.Text = newPhrase;

    // Always update split TextBlocks (no cost if SplitPhrasePanel is Collapsed)
    var (qualifier, emphasis) = PhraseEngine.GetStructuredPhrase(DateTime.Now);
    QualifierText.Text = qualifier;
    EmphasisText.Text  = emphasis;

    UpdateLayout();
    if (!_hasUserPosition)
    {
        PositionTopRight();
    }
    else
    {
        var screen = System.Windows.Forms.Screen.FromPoint(
            new System.Drawing.Point((int)(Left + ActualWidth / 2), (int)(Top + ActualHeight / 2)));
        var clamped = SettingsService.Clamp(
            new MonitorPosition { Left = Left, Top = Top },
            ActualWidth, ActualHeight, screen);
        Left = clamped.Left;
        Top  = clamped.Top;
    }
}
```

### Step 7: Update SetDialMode to respect split layout

In `SetDialMode()`, the current code is:

```csharp
PhraseText.Visibility = dialMode ? Visibility.Collapsed : Visibility.Visible;
DialCanvas.Visibility = dialMode ? Visibility.Visible   : Visibility.Collapsed;
```

Replace with:

```csharp
if (dialMode)
{
    PhraseText.Visibility      = Visibility.Collapsed;
    SplitPhrasePanel.Visibility = Visibility.Collapsed;
    DialCanvas.Visibility      = Visibility.Visible;
}
else
{
    DialCanvas.Visibility = Visibility.Collapsed;
    bool isSplit = _currentTextStyle == "Split" || _currentTextStyle == "Expressive";
    PhraseText.Visibility      = isSplit ? Visibility.Collapsed : Visibility.Visible;
    SplitPhrasePanel.Visibility = isSplit ? Visibility.Visible  : Visibility.Collapsed;
}
```

### Step 8: Build to verify no compile errors

```
dotnet build FuzzyClock.App -v q
```

Expected: Build succeeds, 0 errors.

### Step 9: Commit

```bash
git add FuzzyClock.App/MainWindow.xaml.cs FuzzyClock.App/App.xaml.cs
git commit -m "feat(main): add SetTextStyle, update phrase display for split layout"
```

---

## Task 5: MainWindow — ApplySettings, SaveSettings, ResetToDefaults

**Files:**
- Modify: `FuzzyClock.App/MainWindow.xaml.cs`

### Step 1: Update ApplySettings to restore TextStyle

In `ApplySettings()`, add after the `_accentColor` parsing block (end of method, before the closing brace), apply TextStyle directly (safe before Show() — no UpdateLayout or SaveSettings):

```csharp
// Apply text style directly (NOT via SetTextStyle — that calls UpdateLayout()+SaveSettings() unsafe before Show())
_currentTextStyle = s.TextStyle;
bool isSerifStyle = s.TextStyle == "Literary" || s.TextStyle == "Expressive";
var styleFamily = new System.Windows.Media.FontFamily(isSerifStyle ? "Palatino Linotype" : "Segoe UI Light");
PhraseText.FontFamily    = styleFamily;
QualifierText.FontFamily = styleFamily;
EmphasisText.FontFamily  = styleFamily;
QualifierText.FontSize   = (int)(s.FontSize * 0.65);
EmphasisText.FontSize    = (int)(s.FontSize * 1.40);

// Layout visibility — accounts for interaction with DialMode (already applied above)
if (!s.DialMode)
{
    bool isSplitStyle = s.TextStyle == "Split" || s.TextStyle == "Expressive";
    PhraseText.Visibility      = isSplitStyle ? Visibility.Collapsed : Visibility.Visible;
    SplitPhrasePanel.Visibility = isSplitStyle ? Visibility.Visible  : Visibility.Collapsed;
}
// If s.DialMode is true: PhraseText and SplitPhrasePanel are already Collapsed from the dial mode block above
```

### Step 2: Update SaveSettings to persist TextStyle

In `SaveSettings()`, add `TextStyle = _currentTextStyle,` to the `_settings with { ... }` block after `ProcessCountThresholdPercent`:

```csharp
TextStyle = _currentTextStyle,
```

### Step 3: Update ResetToDefaults to reset TextStyle

In `ResetToDefaults()`, add after the auto-contrast reset:

```csharp
// Reset text style to Classic
SetTextStyle("Classic");
```

### Step 4: Build and quick manual smoke-test

```
dotnet build FuzzyClock.App -v q
```

Run the app briefly: verify it launches with Classic style, phrase displays correctly.

### Step 5: Commit

```bash
git add FuzzyClock.App/MainWindow.xaml.cs
git commit -m "feat(main): persist and restore TextStyle in ApplySettings/SaveSettings/ResetToDefaults"
```

---

## Task 6: ApplyTheme and ApplyDisplayColor — cover new TextBlocks

**Files:**
- Modify: `FuzzyClock.App/MainWindow.xaml.cs`

### Step 1: Update ApplyTheme

In `ApplyTheme()`, after `PhraseText.Foreground = brush;`, add:

```csharp
// Split layout text (structural opacity on QualifierText is preserved — only color changes)
QualifierText.Foreground = brush;
EmphasisText.Foreground  = brush;
```

### Step 2: Update ApplyDisplayColor

In `ApplyDisplayColor()`, after `PhraseText.Foreground = brush;`, add:

```csharp
QualifierText.Foreground = brush;
EmphasisText.Foreground  = brush;
```

### Step 3: Build and verify

```
dotnet build FuzzyClock.App -v q
```

Expected: Build succeeds.

### Step 4: Commit

```bash
git add FuzzyClock.App/MainWindow.xaml.cs
git commit -m "feat(main): extend ApplyTheme and ApplyDisplayColor to cover split TextBlocks"
```

---

## Task 7: TrayMenuBuilder — Text Style submenu

**Files:**
- Modify: `FuzzyClock.App/TrayMenuBuilder.cs`
- Modify: `FuzzyClock.App/MainWindow.xaml.cs` (tray wiring)

### Step 1: Add TextStyle to TrayMenuState

In `TrayMenuState`, add:

```csharp
public string TextStyle { get; init; }
```

### Step 2: Add SetTextStyle to TrayMenuCallbacks

In `TrayMenuCallbacks`, add:

```csharp
public required Action<string> SetTextStyle { get; init; }
```

### Step 3: Add four style item fields to TrayMenuBuilder

In the field declarations block, after the opacity fields:

```csharp
private System.Windows.Forms.ToolStripMenuItem  _styleClassic    = null!;
private System.Windows.Forms.ToolStripMenuItem  _styleSplit      = null!;
private System.Windows.Forms.ToolStripMenuItem  _styleLiterary   = null!;
private System.Windows.Forms.ToolStripMenuItem  _styleExpressive = null!;
```

### Step 4: Add Text Style submenu to Build()

In `Build()`, after the Theme submenu block and before the Opacity submenu, add:

```csharp
// Text Style submenu
_styleClassic    = new System.Windows.Forms.ToolStripMenuItem("Classic");
_styleSplit      = new System.Windows.Forms.ToolStripMenuItem("Split");
_styleLiterary   = new System.Windows.Forms.ToolStripMenuItem("Literary");
_styleExpressive = new System.Windows.Forms.ToolStripMenuItem("Expressive");
_styleClassic.Click    += (_, _) => _cb.SetTextStyle("Classic");
_styleSplit.Click      += (_, _) => _cb.SetTextStyle("Split");
_styleLiterary.Click   += (_, _) => _cb.SetTextStyle("Literary");
_styleExpressive.Click += (_, _) => _cb.SetTextStyle("Expressive");
var textStyleItem = new System.Windows.Forms.ToolStripMenuItem("Text Style", null,
    _styleClassic, _styleSplit, _styleLiterary, _styleExpressive);
menu.Items.Add(textStyleItem);
```

### Step 5: Update SyncCheckmarks to sync style items

In `SyncCheckmarks()`, add after the theme preset sync:

```csharp
// Text style sync
_styleClassic.Checked    = (s.TextStyle == "Classic");
_styleSplit.Checked      = (s.TextStyle == "Split");
_styleLiterary.Checked   = (s.TextStyle == "Literary");
_styleExpressive.Checked = (s.TextStyle == "Expressive");
```

### Step 6: Wire callbacks and state in MainWindow

**In `GetCurrentTrayState()`**, add:

```csharp
TextStyle = _currentTextStyle,
```

**In the `TrayMenuCallbacks` construction** (find where callbacks are built — look for `new TrayMenuCallbacks {`), add:

```csharp
SetTextStyle = style => Dispatcher.Invoke(() => SetTextStyle(style)),
```

### Step 7: Build to verify

```
dotnet build FuzzyClock.App -v q
```

Expected: Build succeeds, 0 errors.

### Step 8: Run full test suite

```
dotnet test -v n
```

Expected: All tests pass. Total count matches Task 2's count.

### Step 9: Commit

```bash
git add FuzzyClock.App/TrayMenuBuilder.cs FuzzyClock.App/MainWindow.xaml.cs
git commit -m "feat(tray): add Text Style submenu with Classic/Split/Literary/Expressive presets"
```

---

## Task 8: Manual Verification

### Step 1: Build and run

```
dotnet run --project FuzzyClock.App
```

### Step 2: Verify each preset

For each style (Classic → Split → Literary → Expressive → Classic):
- Open tray → Text Style → select preset
- Verify checkmark appears on selected preset
- Verify phrase text changes font family and layout as expected:
  - Classic: single line, Segoe UI Light
  - Split: two lines, qualifier faded above, hour word large below, Segoe UI Light
  - Literary: single line, Palatino Linotype (serif)
  - Expressive: two lines, qualifier faded above, hour word large below, Palatino Linotype

### Step 3: Verify split layout edge cases

- Set to Split. Wait for or manually check a time near noon/midnight (:00 or midnight)
- At `o'clock` times: verify only one line shows (emphasis only, no blank qualifier line)
- At `noon` / `midnight`: verify single large word shows

### Step 4: Verify font size interaction

- Set to Split. Open tray → Font Size → Small (16pt)
- Verify qualifier ≈ 10pt, emphasis ≈ 22pt
- Switch to Medium (24pt): qualifier ≈ 15pt, emphasis ≈ 33pt

### Step 5: Verify Reset to Defaults restores Classic

- Set to Expressive. Tray → Reset to Defaults.
- Verify Text Style reverts to Classic (checkmark on Classic, single-line Segoe UI Light).

### Step 6: Verify persistence

- Set to Literary. Quit via tray. Relaunch.
- Verify Literary is active and checkmarked on first load.

### Step 7: Verify dial mode interaction

- Switch to Dial Mode. Text Style menu still visible (not hidden in dial mode).
- Switch Text Style while in Dial Mode — no visual change expected (dial is active).
- Switch back to Phrase Mode — correct text style applies.

### Step 8: Run final test suite

```
dotnet test -v n
```

Expected: All tests pass, 0 failures.

### Step 9: Final commit if any fixups needed

```bash
git add -A
git commit -m "fix: text style preset fixups from manual verification"
```

---

## Summary

| Task | Description | Commits |
|------|-------------|---------|
| 1 | PhraseEngine.GetStructuredPhrase (TDD, 16 tests) | 1 |
| 2 | AppSettings.TextStyle + Validate guard (6 tests) | 1 |
| 3 | XAML SplitPhrasePanel | 1 |
| 4 | MainWindow SetTextStyle + phrase display logic | 1 |
| 5 | ApplySettings / SaveSettings / ResetToDefaults | 1 |
| 6 | ApplyTheme / ApplyDisplayColor | 1 |
| 7 | TrayMenuBuilder Text Style submenu | 1 |
| 8 | Manual verification | 0–1 |

**Total: 8–9 commits, ~22 new tests, net ~200 LOC.**
