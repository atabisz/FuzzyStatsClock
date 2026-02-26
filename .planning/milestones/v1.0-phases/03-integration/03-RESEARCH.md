# Phase 3: Integration - Research

**Researched:** 2026-02-25
**Domain:** WPF DispatcherTimer, live text update, semi-transparent backdrop, top-right repositioning
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phrase update transition**
- Instant snap — no animation. Old phrase text replaced immediately with new phrase text.
- Window resizes naturally (`SizeToContent=WidthAndHeight` already handles this — no change needed).
- Window anchors to top-right on resize: when phrase length changes, the right edge stays fixed at 20px from screen edge; window grows leftward. Repositioning logic must account for new `ActualWidth` after text update.
- Both the shadow TextBlock and `PhraseText` are updated together in code when the phrase changes.

**Timer strategy**
- Poll every 10 seconds using `DispatcherTimer`. On each tick: call `PhraseEngine.GetPhrase(DateTime.Now)`, compare to currently displayed phrase, update only if different.
- 10-second interval guarantees the update requirement ("within 30 seconds of boundary") with comfortable margin.
- No sleep/wake special handling — the 10s poll self-corrects naturally within one tick after resume.

**Launch behavior**
- Remove hardcoded placeholder ("half past 3") from XAML — text fields left empty or set to empty string.
- Set live phrase before `Show()` in `App.xaml.cs` `OnStartup`: call `PhraseEngine.GetPhrase(DateTime.Now)` and assign to both TextBlocks before the window becomes visible.
- Sequence: Set phrase → `mainWindow.Show()` → `ContentRendered` fires → position + start timer. No flash of wrong phrase.
- Timer started in `ContentRendered` (same event as positioning) — consistent, no risk of timer firing before UI is ready.
- Call site: `PhraseEngine.GetPhrase(DateTime.Now)` called directly in `MainWindow.xaml.cs` — no wrapper/service class needed.

**Legibility**
- Add a very subtle semi-transparent dark backdrop behind the text for legibility on light wallpapers.
- Opacity: nearly invisible — approximately 15-20% black. Hint of dark, not a visible widget box.
- Shape: rounded corners (small radius, e.g. 4-6px).
- Padding: tight fit — small padding around text (e.g. 4-6px).
- Backdrop must not conflict with the no-chrome philosophy — it should disappear into the wallpaper rather than frame the text.

### Claude's Discretion
- Exact backdrop opacity, corner radius, and padding values
- Implementation approach for the backdrop (WPF `Border` element wrapping the text stack)
- Exact `DispatcherTimer` interval (10 seconds confirmed; exact tick handler structure)
- How to handle the case where the phrase on first render matches what was already showing (no visible change needed — correct, no action)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISP-04 | Phrase updates at each real 5-minute clock boundary (timer aligns to clock, not 5-min interval from launch) | DispatcherTimer polling pattern + compare-and-update strategy eliminates drift; 10s interval always catches the boundary within 30s |
</phase_requirements>

---

## Summary

Phase 3 wires together the already-built engine (`PhraseEngine.GetPhrase`) and the already-built transparent WPF window. The work is three discrete tasks: (1) remove the XAML placeholder and set the live phrase before `Show()`, (2) add a `DispatcherTimer` that polls every 10 seconds and updates both TextBlocks on change, and (3) wrap the TextBlocks in a WPF `Border` with a nearly-invisible semi-transparent dark background for legibility.

All technologies in this phase are already in use in the project — no new dependencies, no new assemblies. `DispatcherTimer` is part of WPF (`System.Windows.Threading`), `Border` is a standard XAML panel element, and `PhraseEngine` is already referenced from `FuzzyClock.App` (the `.csproj` has a `ProjectReference` to `FuzzyClock.Core`). The entire implementation fits inside two files: `MainWindow.xaml` and `MainWindow.xaml.cs`, with one small change to `App.xaml.cs`.

The single non-obvious point is **repositioning after phrase change**. `SizeToContent=WidthAndHeight` means the window width changes when the phrase length changes. After updating the text, `ActualWidth` reflects the old size until the next layout pass. The fix is to call `UpdateLayout()` before `PositionTopRight()` in the timer tick handler so the new width is measured before repositioning.

**Primary recommendation:** Implement in three focused tasks — (1) remove placeholder + set initial phrase, (2) add DispatcherTimer poll-and-update, (3) add backdrop Border — each independently buildable and testable.

---

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `DispatcherTimer` | WPF built-in (net10.0-windows) | Fires ticks on the UI thread; no Dispatcher.Invoke needed | The canonical WPF timer — safe for UI property mutation without marshalling |
| `System.Windows.Threading` | net10.0-windows | Namespace containing `DispatcherTimer` | Part of WPF platform; no NuGet package required |
| `FuzzyClock.Core.PhraseEngine` | Project (Phase 1) | `GetPhrase(DateTime)` — pure static, fully tested | Already exists; already referenced in FuzzyClock.App.csproj |
| `Border` (XAML) | WPF built-in | Semi-transparent rounded backdrop wrapping text stack | Standard WPF panel for background + corner radius + padding |

### Supporting

| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| `UpdateLayout()` | WPF built-in | Forces immediate layout pass so `ActualWidth` is current | Call before `PositionTopRight()` when text changes — prevents repositioning on stale width |
| `CornerRadius` (XAML) | WPF built-in | Rounds corners of `Border` element | Set on `Border.CornerRadius`; works on any `Border` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `DispatcherTimer` (10s poll) | `Task`/`Timer` + `Dispatcher.InvokeAsync` | Async timer requires marshalling back to UI thread; DispatcherTimer eliminates this entirely |
| `DispatcherTimer` (10s poll) | Calculate ms-to-next-bucket, sleep, wake | Complex — handles daylight saving, clock jumps, and sleep/resume edge cases; poll is simpler and correct |
| WPF `Border` backdrop | Second `Rectangle` element | Border is already a layout container; wrapping elements in it is idiomatic WPF |
| `UpdateLayout()` before reposition | Binding/INotifyPropertyChanged | Overkill for a single-window app with no MVVM; direct property assignment is simpler |

**No NuGet packages needed.** Everything required is part of net10.0-windows WPF.

---

## Architecture Patterns

### Recommended Project Structure

No structural change needed. Phase 3 modifies two existing files and makes one small addition:

```
FuzzyClock.App/
├── App.xaml.cs         # CHANGE: set initial phrase on mainWindow before Show()
├── MainWindow.xaml     # CHANGE: remove placeholder text, add Border backdrop
└── MainWindow.xaml.cs  # CHANGE: add DispatcherTimer, UpdatePhrase(), update ContentRendered handler
```

### Pattern 1: DispatcherTimer Poll-and-Compare

**What:** Create a `DispatcherTimer` with `Interval = TimeSpan.FromSeconds(10)`. On each tick, call `PhraseEngine.GetPhrase(DateTime.Now)` and compare to the currently displayed phrase. Update both TextBlocks only when the phrase has changed.

**When to use:** Any WPF scenario where background polling must mutate UI elements safely. DispatcherTimer fires on the UI thread — no cross-thread concerns.

**Example:**
```csharp
// Source: WPF Platform (System.Windows.Threading.DispatcherTimer)
// In MainWindow.xaml.cs

private DispatcherTimer _timer = null!;

// In ContentRendered handler:
_timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
_timer.Tick += (_, _) => UpdatePhraseIfChanged();
_timer.Start();

private void UpdatePhraseIfChanged()
{
    string newPhrase = PhraseEngine.GetPhrase(DateTime.Now);
    if (newPhrase == PhraseText.Text) return;

    ShadowText.Text = newPhrase;
    PhraseText.Text = newPhrase;

    // Force layout pass before repositioning — ActualWidth is stale until layout runs
    UpdateLayout();
    PositionTopRight();
}
```

### Pattern 2: Set Initial Phrase Before Show()

**What:** In `App.xaml.cs` `OnStartup`, after constructing `MainWindow` but before calling `mainWindow.Show()`, set both TextBlocks to the current live phrase.

**When to use:** Whenever a WPF window must never display a placeholder — text must be correct from the first rendered frame.

**Example:**
```csharp
// Source: existing App.xaml.cs OnStartup pattern
var mainWindow = new MainWindow();
mainWindow.Owner = hiddenOwner;

// Set phrase before Show() — window is constructed but not yet visible
string initialPhrase = PhraseEngine.GetPhrase(DateTime.Now);
mainWindow.SetInitialPhrase(initialPhrase);  // or set properties directly if exposed

mainWindow.Show();
// ContentRendered will fire after the first layout pass → positions + starts timer
```

**Implementation note:** `MainWindow` needs a `SetInitialPhrase(string)` method (or `internal` property setters) so `App.xaml.cs` can set both TextBlocks before the window is shown.

### Pattern 3: Semi-Transparent Border Backdrop

**What:** Wrap the two TextBlocks inside a `Border` element in XAML. Set `Background` to a semi-transparent dark color using an 8-digit hex code (`#26000000` = 15% black), `CornerRadius` to 5, and `Padding` to 6.

**When to use:** WPF windows with `AllowsTransparency=True` where elements need a background that is not the window background.

**Example:**
```xml
<!-- Source: WPF XAML — Border element with semi-transparent background -->
<Grid Background="#01000000">
    <Grid.ContextMenu>
        <ContextMenu>
            <MenuItem Header="Close" Click="CloseMenuItem_Click" />
        </ContextMenu>
    </Grid.ContextMenu>

    <Border Background="#26000000"
            CornerRadius="5"
            Padding="6">
        <!-- Shadow TextBlock -->
        <Grid>
            <TextBlock x:Name="ShadowText"
                       Text=""
                       FontFamily="Segoe UI Light"
                       FontSize="32"
                       Foreground="#BB000000"
                       IsHitTestVisible="False">
                <TextBlock.RenderTransform>
                    <TranslateTransform X="2" Y="2" />
                </TextBlock.RenderTransform>
            </TextBlock>

            <!-- PhraseText -->
            <TextBlock x:Name="PhraseText"
                       Text=""
                       FontFamily="Segoe UI Light"
                       FontSize="32"
                       Foreground="White" />
        </Grid>
    </Border>
</Grid>
```

**Opacity guidance (Claude's Discretion):**
- `#1A000000` = ~10% black (very subtle, may be insufficient on bright white wallpaper)
- `#26000000` = ~15% black (recommended starting point — perceptible but not heavy)
- `#33000000` = ~20% black (stronger — use if 15% tests insufficient on white background)

### Anti-Patterns to Avoid

- **Starting the timer in the constructor:** `ActualWidth` is 0 before `ContentRendered`; if the timer fires immediately it will reposition to wrong coordinates. Always start in `ContentRendered`.
- **Using `System.Threading.Timer` or `Task.Delay` loops:** These fire on ThreadPool threads. Setting `PhraseText.Text` from a non-UI thread throws `InvalidOperationException`. Use `DispatcherTimer` which fires on the UI thread.
- **Calling `PositionTopRight()` without `UpdateLayout()` first:** After changing `PhraseText.Text`, `ActualWidth` reflects the old layout measurement. Skip `UpdateLayout()` and the window will jump to the wrong x-coordinate.
- **Using `this.Close()` in timer tick to handle errors:** The hidden owner window keeps the process alive. Always use `Application.Current.Shutdown()` (already established in Phase 2).
- **Animating the phrase transition:** Locked decision — instant snap only. Do not add `Storyboard`, `DoubleAnimation`, or `BeginAnimation`.
- **Naming the shadow TextBlock without an `x:Name`:** The timer tick handler must update both TextBlocks. Give the shadow TextBlock an `x:Name` (e.g. `ShadowText`) so code-behind can reference it directly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UI-thread-safe timer | `Thread` + `Dispatcher.Invoke` loop | `DispatcherTimer` | DispatcherTimer fires on UI thread by design — no marshalling, no cross-thread exception risk |
| Phrase change detection | Time-based interval recalculation | Compare `newPhrase == PhraseText.Text` | String comparison is O(1) on short strings; recalculation would re-implement bucket logic already in PhraseEngine |
| Rounded backdrop | Custom `DrawingVisual` or `OnRender` override | WPF `Border` with `CornerRadius` | Border handles hit-testing, padding, and layout automatically; custom rendering is unnecessary complexity |
| Layout measurement | P/Invoke `GetWindowRect` | `UpdateLayout()` then read `ActualWidth` | WPF's own layout system is authoritative; Win32 dimensions differ from WPF device-independent pixels |

**Key insight:** Every problem in this phase has a one-line WPF solution. The risk is over-engineering — adding MVVM bindings, services, or custom controls where direct property assignment suffices.

---

## Common Pitfalls

### Pitfall 1: Stale ActualWidth After Text Change

**What goes wrong:** `PositionTopRight()` is called immediately after updating `PhraseText.Text`. The window moves to the wrong x-coordinate because `ActualWidth` still reflects the previous phrase's layout.

**Why it happens:** WPF layout is deferred. Changing a `TextBlock.Text` marks the layout as dirty but does not immediately re-measure. `ActualWidth` is the result of the last completed layout pass, which used the old text.

**How to avoid:** Call `UpdateLayout()` between setting the new text and reading `ActualWidth`. This forces a synchronous layout pass.

**Warning signs:** Widget jumps leftward when a longer phrase appears, or rightward when a shorter phrase appears, then snaps to correct position on the next timer tick.

### Pitfall 2: Timer Fires Before ContentRendered (if started in constructor)

**What goes wrong:** Timer starts in the constructor. Before the window is shown, layout has not run — `ActualWidth` is 0. If the first tick fires before `ContentRendered`, `PositionTopRight()` sets `Left = screenWidth - 0 - 20 = screenWidth - 20`, placing the window off-screen to the right.

**Why it happens:** `SizeToContent=WidthAndHeight` defers measurement until after `Show()` is called.

**How to avoid:** Start the timer in `ContentRendered`, after `PositionTopRight()` has already run once.

**Warning signs:** Widget appears briefly in the wrong position or off-screen at launch.

### Pitfall 3: Placeholder Flash on Launch

**What goes wrong:** Window briefly shows "half past 3" (the Phase 2 placeholder) before the live phrase is set.

**Why it happens:** If the live phrase is set after `Show()` (e.g., in `ContentRendered`), the window is rendered with the placeholder for one frame before the text is updated.

**How to avoid:** Set both TextBlocks to the live phrase before calling `mainWindow.Show()`. The XAML placeholder must also be removed (set `Text=""` in XAML).

**Warning signs:** On slow machines or with a debugger attached, a brief flash of "half past 3" visible at launch.

### Pitfall 4: Shadow TextBlock Not Named (Missing x:Name)

**What goes wrong:** The `UpdatePhraseIfChanged()` method can only access `PhraseText` (which has `x:Name`). The shadow TextBlock has no name, so it cannot be updated from code-behind.

**Why it happens:** The shadow TextBlock was added in Phase 2 without a `x:Name` because it was never touched by code-behind during that phase.

**How to avoid:** Add `x:Name="ShadowText"` to the shadow TextBlock in the XAML update for Phase 3.

**Warning signs:** After a phrase change, `PhraseText` shows the new phrase but the shadow still shows the old phrase — creating a double-image effect.

### Pitfall 5: DISP-04 Requirement Misread as "5-minute DispatcherTimer"

**What goes wrong:** Developer sets `DispatcherTimer.Interval = TimeSpan.FromMinutes(5)`, which starts 5 minutes from launch, not from the next clock boundary.

**Why it happens:** DISP-04 says "timer aligns to clock, not 5-min interval from launch." A naive reading suggests a 5-minute timer.

**How to avoid:** Use a 10-second poll that compares `GetPhrase(DateTime.Now)` to the displayed phrase. The phrase only changes at bucket boundaries, so the update fires when the clock crosses a boundary — naturally aligned to the clock, not to launch time. The poll self-corrects after sleep/wake.

**Warning signs:** Widget does not update at the correct clock boundary — it updates at :00+5min from when the app launched.

---

## Code Examples

### DispatcherTimer: Complete ContentRendered Handler

```csharp
// Source: WPF Platform (System.Windows.Threading.DispatcherTimer)
// File: MainWindow.xaml.cs

private DispatcherTimer _timer = null!;

// Constructor — register ContentRendered only
public MainWindow()
{
    InitializeComponent();
    ContentRendered += (_, _) =>
    {
        PositionTopRight();
        StartTimer();
    };
}

private void StartTimer()
{
    _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
    _timer.Tick += (_, _) => UpdatePhraseIfChanged();
    _timer.Start();
}

private void UpdatePhraseIfChanged()
{
    string newPhrase = PhraseEngine.GetPhrase(DateTime.Now);
    if (newPhrase == PhraseText.Text) return;  // No change — skip layout work

    ShadowText.Text = newPhrase;
    PhraseText.Text = newPhrase;

    UpdateLayout();        // Force measurement with new text before reading ActualWidth
    PositionTopRight();    // Re-anchor right edge to 20px from screen right
}

private void PositionTopRight()
{
    const double Padding = 20.0;
    Left = SystemParameters.PrimaryScreenWidth - ActualWidth - Padding;
    Top = Padding;
}
```

### SetInitialPhrase: Called from App.xaml.cs Before Show()

```csharp
// Source: WPF code-behind pattern — method on MainWindow
// File: MainWindow.xaml.cs

// Called by App.xaml.cs before mainWindow.Show()
internal void SetInitialPhrase(string phrase)
{
    ShadowText.Text = phrase;
    PhraseText.Text = phrase;
    // No UpdateLayout() or PositionTopRight() needed here —
    // ContentRendered will do both after Show() triggers layout
}
```

```csharp
// File: App.xaml.cs — OnStartup, after constructing mainWindow
var mainWindow = new MainWindow();
mainWindow.Owner = hiddenOwner;
mainWindow.SetInitialPhrase(PhraseEngine.GetPhrase(DateTime.Now));
mainWindow.Show();
```

### XAML: Border Backdrop with Named Shadow TextBlock

```xml
<!-- File: MainWindow.xaml — full Grid content -->
<Grid Background="#01000000">
    <Grid.ContextMenu>
        <ContextMenu>
            <MenuItem Header="Close" Click="CloseMenuItem_Click" />
        </ContextMenu>
    </Grid.ContextMenu>

    <Border Background="#26000000"
            CornerRadius="5"
            Padding="6">
        <Grid>
            <!-- Shadow layer: named so code-behind can update it -->
            <TextBlock x:Name="ShadowText"
                       Text=""
                       FontFamily="Segoe UI Light"
                       FontSize="32"
                       Foreground="#BB000000"
                       IsHitTestVisible="False">
                <TextBlock.RenderTransform>
                    <TranslateTransform X="2" Y="2" />
                </TextBlock.RenderTransform>
            </TextBlock>

            <!-- Primary phrase text -->
            <TextBlock x:Name="PhraseText"
                       Text=""
                       FontFamily="Segoe UI Light"
                       FontSize="32"
                       Foreground="White" />
        </Grid>
    </Border>
</Grid>
```

**Note:** The `DropShadowEffect` on `PhraseText` from Phase 2 can be retained as belt-and-suspenders or removed — the manual shadow TextBlock (`ShadowText`) is the confirmed working approach on `AllowsTransparency=True` windows in .NET 10. Removing it reduces XAML complexity.

### Opacity Reference for Backdrop Background

```
#0D000000 =  5% black (barely perceptible — likely too subtle)
#1A000000 = 10% black (subtle — acceptable on mid-tone wallpapers)
#26000000 = 15% black (recommended — visible on most wallpapers, not heavy)
#33000000 = 20% black (stronger — use on bright white backgrounds)
```

The 8-digit hex format is `#AARRGGBB` where `AA` is the alpha channel. For pure black, RR=GG=BB=00. Alpha of `#26` = 38/255 ≈ 15%.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `System.Timers.Timer` + `Dispatcher.Invoke` | `DispatcherTimer` | WPF from the start | DispatcherTimer is idiomatic WPF — fires on UI thread, no cross-thread exception risk |
| `DropShadowEffect` on transparent WPF windows | Manual offset TextBlock shadow | .NET 5+ (GPU path change) | DropShadowEffect unreliable on AllowsTransparency windows; manual shadow always works |
| `Thread.Sleep` loop for periodic updates | `DispatcherTimer.Tick` event | WPF from the start | Sleep loops block the UI thread; DispatcherTimer is non-blocking |

**Deprecated/outdated:**
- `DropShadowEffect` on `AllowsTransparency=True` windows: Confirmed non-functional in .NET 10 on this project (Phase 2 decision). The manual offset TextBlock shadow is the working replacement. The `DropShadowEffect` currently on `PhraseText` in XAML is vestigial and can be removed.

---

## Open Questions

1. **Long phrase width and SizeToContent clipping**
   - What we know: `SizeToContent=WidthAndHeight` auto-sizes the window; a concern was noted in STATE.md
   - What's unclear: Whether the longest phrase ("just after quarter past 10" — 28 chars at FontSize=32) at `Segoe UI Light` clips or produces awkward dimensions on a 1920px screen
   - Recommendation: Test this early in the first implementation task by temporarily setting `PhraseText.Text` to the longest expected phrase. If it clips, adjust `FontSize` or `Margin`. The 1920-wide screen easily accommodates ~28 characters at FontSize=32 (~350-400px estimated) — this is likely a non-issue but worth a 30-second visual check.

2. **DropShadowEffect removal on PhraseText**
   - What we know: The current `PhraseText` TextBlock has a `DropShadowEffect` that was established as non-functional on AllowsTransparency windows. The manual shadow TextBlock is the confirmed working approach.
   - What's unclear: Whether keeping the non-functional `DropShadowEffect` adds any overhead or causes visual artifacts after the backdrop is added.
   - Recommendation: Remove the `DropShadowEffect` from `PhraseText` during the XAML update. It does not work, adds XML noise, and the manual shadow provides the actual effect.

---

## Sources

### Primary (HIGH confidence)

- WPF Platform Documentation — `DispatcherTimer` class (System.Windows.Threading): https://learn.microsoft.com/en-us/dotnet/api/system.windows.threading.dispatchertimer
- WPF Platform Documentation — `Border` element: https://learn.microsoft.com/en-us/dotnet/api/system.windows.controls.border
- WPF Platform Documentation — `UIElement.UpdateLayout()`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.uielement.updatelayout
- Project codebase (read directly): `MainWindow.xaml`, `MainWindow.xaml.cs`, `App.xaml.cs`, `PhraseEngine.cs` — ground truth on current implementation state
- `.planning/STATE.md` — confirmed Phase 2 decisions (AllowsTransparency+manual shadow, ContentRendered pattern, DropShadowEffect non-functional)

### Secondary (MEDIUM confidence)

- WPF AllowsTransparency + DropShadowEffect limitation — confirmed by Phase 2 implementation and visual verification (STATE.md entry `[02-03]`)

### Tertiary (LOW confidence)

- None — all claims in this research are supported by WPF platform documentation or direct codebase inspection.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All components are WPF built-ins; no external packages; verified against project csproj and existing code
- Architecture: HIGH — Patterns derived directly from existing codebase (Phase 2 established ContentRendered, PositionTopRight, DropShadowEffect workaround)
- Pitfalls: HIGH — Three pitfalls (stale ActualWidth, timer before ContentRendered, placeholder flash) are mechanistic consequences of WPF's deferred layout; fourth (missing x:Name) is a direct code inspection finding; fifth (DISP-04 misread) is a requirements clarity concern

**Research date:** 2026-02-25
**Valid until:** 2026-03-27 (WPF platform APIs are stable; 30-day window is conservative)
