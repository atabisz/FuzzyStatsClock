# Pitfalls Research

**Domain:** WPF transparent frameless overlay — uptime display and rolling CPU load averages (v2.1 additions)
**Project:** Fuzzy Clock
**Researched:** 2026-02-27
**Confidence:** HIGH — all claims grounded in direct reading of existing source code and verified Windows API behavior

---

> **Scope note:** This document covers pitfalls specific to adding uptime display and rolling 1m/5m/15m CPU load averages to this existing widget. Prior milestone pitfalls (frozen brushes, AllowsTransparency rendering, DragMove, PreviewMouseWheel, ColorDialog, WinForms interop) are documented in prior PITFALLS.md versions and are not repeated here except where they directly interact with the v2.1 additions.

---

## Critical Pitfalls

Mistakes that cause silent wrong behavior, crashes, or make the feature non-functional.

---

### Pitfall 1: Rolling Average Seeded From a Cold StatsService — First N Samples Are Zeroes

**What goes wrong:**
`StatsService` initializes in `Task.Run(Initialize)` and guards all `Refresh()` calls with `if (!_initialized) return`. This means for approximately 6 seconds after startup (PDH cold-start), every call to `_statsService.Refresh()` is a silent no-op, and `CpuPercent` stays at its initialized value of `0f`. Additionally, the CPU counter itself requires one priming call that is already done in `Initialize()` — but the first `Refresh()` after `_initialized = true` returns the CPU value measured since the priming call, which may be during startup noise.

If the rolling average circular buffer starts accumulating samples immediately on `ContentRendered`, the first several seconds of samples will be `0.0f`. At a 3-second interval:
- `_initialized` becomes `true` roughly 2 clock ticks after `ContentRendered` fires the stats timer.
- The buffer will have already received 1–2 zero samples before real values start flowing.
- The 1-minute average (20 samples at 3s) will be deflated for the first ~60 seconds.
- This is a visual artifact, not a data-correctness issue — but it looks like the system is underloaded at startup.

**Why it happens:**
The async init pattern in `StatsService` is correct for preventing startup hangs (PDH category enumeration is slow). But the rolling buffer's correctness depends on every sample being a real reading, not a startup sentinel. There is no mechanism in the current code to distinguish "not initialized yet" (value = 0.0f) from "CPU is genuinely idle" (value = 0.0f).

**How to avoid:**
Do not push samples into the rolling buffer when `StatsService` is not yet initialized. The simplest approach: check `_statsService.CpuPercent` for a pre-initialization sentinel (but `0f` is also a valid idle value, so a sentinel on `StatsService._initialized` is more reliable). Alternative: expose an `IsReady` property on `StatsService` that returns `_initialized`, and skip buffer pushes when `IsReady` is false.

```csharp
// Suggested guard in UpdateStatsDisplay() before pushing to rolling buffer:
if (!_statsService.IsReady) return;  // skip until StatsService has real data
_cpuBuffer.Push(_statsService.CpuPercent);
```

**Warning signs:**
- 1m/5m/15m averages all show noticeably lower values in the first minute after launch.
- Averages jump upward after approximately 60 seconds of uptime as zeros flush out.

**Phase to address:** Rolling CPU load averages implementation phase — add the `IsReady` guard when wiring up the buffer push.

---

### Pitfall 2: GetTickCount64 Wrap-Around Is a Non-Issue But Using It Directly Produces Wrong Display on Suspended Systems

**What goes wrong:**
The three Windows APIs for uptime are:
- `GetTickCount64` (Win32) — milliseconds since last boot, `ulong`, does not wrap on modern Windows (would take ~584 million years).
- `Environment.TickCount64` (.NET) — milliseconds since last boot, `long`, same Win32 source.
- WMI `Win32_OperatingSystem.LastBootUpTime` — a `DateTime` subtracted from `DateTime.Now`.

Common mistake: using `Environment.TickCount64` or `GetTickCount64` on a system that has been suspended (sleep/hibernate). On Windows, the tick count counter **does not advance during suspend** on most hardware configurations. A machine suspended for 8 hours will report 8 fewer hours of "uptime" than the wall-clock elapsed time since boot. By contrast, `Win32_OperatingSystem.LastBootUpTime` is a UTC timestamp — it correctly anchors to the actual boot time and `DateTime.Now - bootTime` remains accurate through suspend/resume cycles.

For a "system uptime" display (user wants to know when the machine was last booted), `LastBootUpTime` via WMI or via `Environment.TickCount64` behaves differently, and the difference matters on laptops.

**Why it happens:**
`Environment.TickCount64` is the easier .NET API (no P/Invoke, no WMI query). Developers reach for it first. The suspend behavior is documented in Win32 (`GetTickCount` / `GetTickCount64` MSDN note: "The elapsed time is stored as a DWORD value. Therefore, the time will wrap around to zero if the system is run continuously for 49.7 days. To avoid this problem, use the GetTickCount64 function. Otherwise, check for an overflow condition when comparing times.") but the suspend freeze behavior is mentioned only in the extended remarks.

**How to avoid:**
Use `Environment.TickCount64` for simplicity and accept the suspend limitation — for a personal desktop widget, the difference between "time since boot" and "time the CPU was actually running" is arguably a feature, not a bug. However, if accurate wall-clock uptime is desired, use `WMI Win32_OperatingSystem.LastBootUpTime`:

```csharp
// Via WMI (accurate through suspend):
using var searcher = new ManagementObjectSearcher("SELECT LastBootUpTime FROM Win32_OperatingSystem");
foreach (ManagementObject mo in searcher.Get())
{
    string raw = mo["LastBootUpTime"].ToString()!;  // e.g. "20260215143022.500000+060"
    DateTime bootTime = ManagementDateTimeConverter.ToDateTime(raw);
    TimeSpan uptime = DateTime.Now - bootTime;
}

// Via Environment.TickCount64 (does not count suspend time):
TimeSpan uptime = TimeSpan.FromMilliseconds(Environment.TickCount64);
```

**Decision:** Make an explicit choice and document it. `Environment.TickCount64` is fine and requires no WMI overhead. The concern is choosing one and not accidentally using both or accidentally using `Environment.TickCount` (32-bit, wraps in ~24.9 days, `int`).

**Warning signs:**
- After system suspend/resume, the displayed uptime jumps backward or is significantly less than expected.
- Using `Environment.TickCount` (int, not int64) — wraps at ~24.9 days.

**Phase to address:** Uptime source selection — decide at implementation start, document the choice, never use the 32-bit `Environment.TickCount`.

---

### Pitfall 3: Rolling Average at 3s Interval — Hover Fast-Refresh (0.5s) Corrupts Average Window Sizes

**What goes wrong:**
The stats timer runs at the user-configured interval (1s, 3s, 10s) and accelerates to 0.5s during hover (Phase 12 fast-refresh). The rolling average windows are defined in terms of sample count:
- 1m average at 3s interval = 20 samples
- 5m average at 3s interval = 100 samples
- 15m average at 3s interval = 300 samples

When hover fast-refresh activates (0.5s interval), samples arrive 6x faster than at the 3s configured rate. A fixed sample-count buffer now covers a **much shorter time window** than intended:
- 300 samples at 0.5s = only 2.5 minutes of data (instead of 15 minutes).
- A 1-minute hover session pushes 120 samples into the buffer, displacing 40% of the 300-sample buffer.

When hover ends and the interval returns to 3s, the buffer contains a mix of 0.5s samples and 3s samples, making all three averages meaningless until the buffer flushes (up to 15 minutes later).

**Why it happens:**
Fixed-count circular buffers assume a fixed sampling interval. The existing hover fast-refresh code changes only the timer interval — it does not signal to any consumer that the interpretation of sample count has changed.

**How to avoid:**
Two options:

**Option A (recommended for this widget):** Do not push rolling average samples during hover fast-refresh. Only push samples to the buffer when the timer fires at the configured (non-hover) interval. The buffer remains at the correct semantic interval. Hover fast-refresh still updates the displayed CPU% bar in real time; it just does not update the rolling averages on each 0.5s tick.

```csharp
// In UpdateStatsDisplay(), only push to rolling buffer at configured interval:
if (!_isHoverFastRefresh)  // flag: true during hover
    _cpuBuffer.Push(_statsService.CpuPercent);
```

**Option B:** Use timestamp-based windowing instead of count-based. Store `(DateTime timestamp, float value)` tuples and compute the average over the past N minutes of actual wall-clock time. More accurate, but higher implementation complexity.

Option A is consistent with the widget's design philosophy (simplicity, minimal code). Option B is more correct but overkill for a personal widget.

**Warning signs:**
- 15m average drops dramatically whenever mouse hovers over the widget for more than 30 seconds.
- Averages show unusually low values immediately after a hover session.
- Averages take a long time (>15 min) to stabilize after any hover interaction.

**Phase to address:** Rolling CPU load averages implementation — add the hover-exclusion guard at implementation time, not as a patch after the fact.

---

### Pitfall 4: AppSettings Init-Default for New Bool Field — `ShowUptimeLine` Must Default `true`, Not `false`

**What goes wrong:**
The existing `AppSettings` pattern: new bool fields default to `false` (C# bool default matches the WPF Visibility.Collapsed pattern for optional UI elements). For the uptime/load line, the requirement states "visible by default" (UPT-02). If the field is declared as:

```csharp
public bool ShowUptimeLine { get; init; } = false;  // WRONG — spec says visible by default
```

...then:
1. On first launch (no settings.json), the uptime line is hidden, contradicting the spec.
2. Upgrading users from v2.0 have `ShowUptimeLine` absent in their existing `settings.json`, which deserializes as the init default `false` — uptime line never appears, and users have no way to know it exists.

**Why it happens:**
The existing pattern for all optional rows (CPU/GPU/MEM/PAG visibility) defaults to `true` (all rows visible) — the correct precedent is already in AppSettings. But the dial decorations (ShowHourTicks, ShowMinuteDots, ShowHourNumbers) default to `false` for a different reason (minimal dial on upgrade). A developer applying the decoration pattern to the uptime row gets the wrong default.

**How to avoid:**
Add the field with `= true` init default:

```csharp
public bool ShowUptimeLine { get; init; } = true;  // visible by default per UPT-02
```

No load-time guard is needed for `bool` fields (confirmed in project Key Decisions: "No zero-guard for DialMode bool in Load()"). The C# bool default is `false`, which matches the JSON-absent deserialization behavior — the init default `= true` overrides this correctly via System.Text.Json's init-property handling.

**Warning signs:**
- Uptime line is hidden on first launch.
- Upgrading users from v2.0 never see the uptime line, even though it should be on by default.

**Phase to address:** AppSettings extension phase — first thing added before any XAML or display logic.

---

### Pitfall 5: WMI Uptime Query Has Significant Latency on First Call — Blocking the UI Thread

**What goes wrong:**
WMI queries (`ManagementObjectSearcher`) execute synchronously and can take 100ms–2000ms on first call, especially on cold systems or when the WMI service is slow to respond. Calling this from the UI thread (Dispatcher thread) freezes the window for the duration of the query. On a slow machine, this produces a visible UI freeze during startup.

`Environment.TickCount64` has no such problem — it is a direct kernel call, sub-microsecond.

**Why it happens:**
WMI queries trigger COM initialization and service communication on first access. This overhead is real even for simple `Win32_OperatingSystem` queries.

**How to avoid:**
If WMI is used for uptime, query it on a background thread (same pattern as `Task.Run(Initialize)` in `StatsService`). Store the boot time as a cached `DateTime` field, updated once at startup. Compute `TimeSpan uptime = DateTime.Now - _bootTime` on each timer tick.

Alternative: use `Environment.TickCount64` exclusively — this is a single arithmetic operation with no threading concern. The suspend-time exclusion (Pitfall 2) is acceptable for this use case.

**Warning signs:**
- Widget visibly freezes for 0.5–2 seconds during startup.
- Freeze is longer on first boot after a restart (WMI cold start).

**Phase to address:** Uptime source implementation — if WMI is chosen, wrap in `Task.Run`; if `Environment.TickCount64` is chosen, no threading concern.

---

### Pitfall 6: Uptime TextBlock Inside StatsPanel Creates Auto-Collapse Logic Gap

**What goes wrong:**
The auto-collapse rule (from STAT-09/STAT-13) collapses `StatsPanel` when all four stat rows (CPU/GPU/MEM/PAG) are hidden. The current `SetStatRowVisible()` check is:

```csharp
if (CpuRow.Visibility == Visibility.Collapsed
    && GpuRow.Visibility == Visibility.Collapsed
    && MemRow.Visibility == Visibility.Collapsed
    && PagRow.Visibility == Visibility.Collapsed
    && StatsPanel.Visibility == Visibility.Visible)
{
    SetStatsVisible(false);
}
```

If the uptime row is placed inside `StatsPanel` as a fifth element, the auto-collapse condition is incomplete: all four metric rows hidden + uptime visible = StatsPanel should NOT auto-collapse (there is still content to show). But the existing condition checks only the four rows — it would collapse the panel even while the uptime row is visible.

Additionally, if the uptime row is placed outside `StatsPanel` (as a sibling row in the outer Grid), it is not subject to the `Show Stats` toggle at all, and the `StatsPanel` width constraint (180px) does not apply to it.

**Why it happens:**
The existing auto-collapse condition was written for exactly four rows. Adding a fifth element to the panel without updating the condition silently breaks the auto-collapse invariant.

**How to avoid:**
Two placement options:

**Option A:** Place the uptime row inside `StatsPanel`, add it to the auto-collapse condition, and add it to the `SetStatsVisible()` logic (start/stop the uptime timer when stats panel shows/hides — or keep it timer-driven from the existing stats timer).

**Option B:** Place the uptime row in a separate `StackPanel` or `Grid` row outside `StatsPanel`, with its own independent `Visibility` controlled by `ShowUptimeLine`. This decouples it from the stats auto-collapse logic entirely. The uptime row can be shown even when all stats rows are hidden.

Option B is more consistent with UPT-02 ("toggle via right-click, visible by default") — the uptime display is semantically different from a stats bar row. A separate placement also avoids XAML layout interactions with the fixed `Width="180"` on `StatsPanel`.

Whichever option is chosen, document the decision explicitly and update `SetStatRowVisible()` auto-collapse condition if the uptime row is inside `StatsPanel`.

**Warning signs:**
- Uptime row is visible but `StatsPanel` collapses when last stat row is hidden.
- `Show Stats` toggle hides/shows uptime in a way that contradicts UPT-02 (uptime should be independently togglable).

**Phase to address:** XAML layout phase — placement decision must be made before writing auto-collapse or toggle logic.

---

### Pitfall 7: SaveSettings() Must Include New AppSettings Fields — Omission Causes Settings Loss on Restart

**What goes wrong:**
`SaveSettings()` in `MainWindow.xaml.cs` constructs an `AppSettings` record inline:

```csharp
SettingsService.Save(new AppSettings
{
    Left = Left, Top = Top, FontSize = _currentFontSize,
    StatsVisible = ..., StatsIntervalSeconds = ...,
    CpuVisible = ..., GpuVisible = ..., MemVisible = ..., PagVisible = ...,
    DialMode = ..., ShowHourTicks = ..., ShowMinuteDots = ..., ShowHourNumbers = ...,
    Opacity = ..., AccentColor = ...
});
```

If `ShowUptimeLine` is not added to this construction call, it will serialize as the init default (`true`) on every save. The user's "off" toggle choice will be forgotten on the next restart.

**Why it happens:**
The `AppSettings` record uses init-property defaults, so omitting a field from the construction call silently substitutes the default rather than throwing a compile error. The bug is invisible at the call site.

**How to avoid:**
Immediately after adding `ShowUptimeLine` to `AppSettings`, add it to `SaveSettings()`. Treat these as an atomic pair — any AppSettings field addition requires a matching `SaveSettings()` update. Also add it to `ApplySettings()` and to `SettingsService.Defaults()`.

**Warning signs:**
- Toggle "off" via context menu, restart, uptime line reappears.
- `settings.json` always shows `"ShowUptimeLine": true` regardless of user choice.

**Phase to address:** AppSettings extension phase — update `SaveSettings()`, `ApplySettings()`, and `Defaults()` in the same commit as the AppSettings field addition.

---

## Moderate Pitfalls

Issues that produce wrong but recoverable behavior.

---

### Pitfall 8: Uptime Format Displaying Seconds — Unnecessary Precision Creates Display Churn

**What goes wrong:**
A naively formatted uptime includes seconds: `up 3d 14h 22m 17s`. On a 1s stats interval, the uptime string changes every second, forcing a TextBlock update every second regardless of the user's configured interval. On a 3s interval, it changes every tick. The string is always changing, which draws attention away from other values in the stats panel.

For a "days/hours/minutes" display, updating the minutes component every 60 seconds is sufficient. Updating every 1–3 seconds produces no visible change most of the time but wastes a `string.Format()` comparison on every timer tick.

**Why it happens:**
The simplest implementation formats all time components including seconds. "Remove seconds" is a trim step that is easy to forget.

**How to avoid:**
Format as `up {d}d {h}h {m}m` — no seconds component. The `m` component changes only once per minute. Combine with a change-guard: compare the new string to the current displayed string before assigning.

```csharp
string newUptime = FormatUptime(TimeSpan.FromMilliseconds(Environment.TickCount64));
if (UptimeText.Text != newUptime)
    UptimeText.Text = newUptime;
```

**Warning signs:**
- Uptime string includes seconds and updates every tick.
- CPU/memory usage is higher than expected for a widget doing nothing.

**Phase to address:** Uptime display formatting.

---

### Pitfall 9: Rolling Average TextBlock Needs Accent Color — Omission Creates Visual Inconsistency

**What goes wrong:**
The existing stats bars and percentage text all use the accent color via `ApplyTheme()`. The new uptime/load line contains TextBlock(s) with CPU load average values. If these TextBlocks are not added to `ApplyTheme()`, they remain hardcoded white while the rest of the stats panel uses the user's chosen color. This produces a visually inconsistent row.

**Why it happens:**
`ApplyTheme()` explicitly lists every element that receives the accent color. Adding a new TextBlock to the XAML without adding it to `ApplyTheme()` is an omission that only becomes visible when a non-white accent is active.

**How to avoid:**
Add the uptime/load TextBlock(s) to `ApplyTheme()` immediately. Use the same brush created at the top of `ApplyTheme()`:

```csharp
var brush = new System.Windows.Media.SolidColorBrush(_accentColor);
// ... existing elements ...
UptimeLoadText.Foreground = brush;  // ADD: uptime/load row text
```

Test with Amber, Ice Blue, and Green presets — the uptime row should match the stat bar colors exactly.

**Warning signs:**
- Uptime/load row text stays white when accent is Amber.
- White text row looks like a different UI element from the accent-colored stat rows.

**Phase to address:** XAML layout phase and ApplyTheme() extension — done in the same phase as adding the XAML element.

---

### Pitfall 10: ContextMenu_Opened Must Sync the New Toggle Item — Missing Sync Causes Double-Toggle

**What goes wrong:**
The existing toggle items (MenuShowStats, MenuCpuVisible, etc.) follow the "sync in Opened, never touch IsChecked in click handler" pattern. The click handler reads the current `Visibility` to determine the toggle direction; `ContextMenu_Opened` sets `IsChecked` to match the current state.

If a new `MenuShowUptimeLine` item is added as `IsCheckable="True"` without adding a matching sync line in `ContextMenu_Opened`, WPF's `IsCheckable` auto-toggle fires on the first click (correctly toggling the visual checkmark), but on the second open, the checkmark is in the state WPF left it — which may not match the actual `_showUptimeLine` field. After one click cycle, the display and the field are in sync, but the checkmark can be wrong.

**Why it happens:**
This is the established pattern from the Key Decisions table: "ContextMenu_Opened for IsChecked sync — WPF toggles IsChecked on click when IsCheckable=True; sync in Opened avoids double-toggle." Forgetting to add a new item to `ContextMenu_Opened` breaks this contract for that item.

**How to avoid:**
Add to `ContextMenu_Opened`:

```csharp
MenuShowUptimeLine.IsChecked = _showUptimeLine;
```

And write the click handler to read `_showUptimeLine` (or the row Visibility if the row is inside StatsPanel), not `IsChecked`:

```csharp
private void MenuShowUptimeLine_Click(object sender, RoutedEventArgs e)
    => SetUptimeLineVisible(!_showUptimeLine);
```

**Warning signs:**
- Checkmark in uptime menu item becomes inverted after first toggle.
- Two clicks required to toggle the uptime line on after it has been toggled off.

**Phase to address:** Context menu wiring phase — add `ContextMenu_Opened` sync immediately when adding the menu item.

---

### Pitfall 11: Uptime Row Visibility in ApplySettings() Must Follow Pre-Show() Safety Invariant

**What goes wrong:**
All previous row visibility settings (`CpuRow.Visibility`, etc.) are applied in `ApplySettings()` via direct Visibility assignment — NOT through the `SetXxx()` helper methods. This is because `SetXxx()` calls `UpdateLayout()` and `Clamp()`, which are unsafe before `Show()` when `ActualHeight == 0`. If `SetUptimeLineVisible()` is called from `ApplySettings()`, and `SetUptimeLineVisible()` calls `UpdateLayout()`, it will crash or produce incorrect clamping during startup.

**Why it happens:**
The pattern is documented in the Key Decisions table ("SetStatsVisible() separate from ApplySettings()") but is easy to overlook for new `Set...()` methods added later.

**How to avoid:**
Follow the established pattern: in `ApplySettings()`, set visibility directly:

```csharp
_showUptimeLine = s.ShowUptimeLine;
UptimeRow.Visibility = s.ShowUptimeLine ? Visibility.Visible : Visibility.Collapsed;
// Do NOT call SetUptimeLineVisible() here — unsafe before Show()
```

In `ContentRendered` (after `Show()` has run), visibility is already correctly set by `ApplySettings()`. `SetUptimeLineVisible()` is only called from the menu click handler, which fires only after `Show()`.

**Warning signs:**
- Widget position jumps on startup (Clamp called with ActualHeight=0).
- Null reference on `_statsTimer` if `SetUptimeLineVisible()` starts a timer that doesn't exist yet.

**Phase to address:** AppSettings + ApplySettings() integration phase — follow the pre-Show() safety invariant from the start.

---

### Pitfall 12: SizeToContent=WidthAndHeight — Adding the Uptime Row Changes Widget Height; Re-Clamp Required

**What goes wrong:**
The window uses `SizeToContent="WidthAndHeight"`. Adding a new `TextBlock` row below `StatsPanel` increases the window's `ActualHeight`. The re-clamp guard exists in `SetStatsVisible()` for this reason. If the uptime row is shown/hidden independently (not controlled by `SetStatsVisible()`), the height change from toggling the uptime row is not clamped — if the widget is near the bottom edge of the screen, showing the uptime row pushes it partially off-screen.

**Why it happens:**
The re-clamp pattern was added to every place where window height changes (showing stats panel, showing a stat row, font size change). A new height-changing toggle must also trigger a re-clamp.

**How to avoid:**
`SetUptimeLineVisible()` must call `UpdateLayout()` followed by `SettingsService.Clamp()` when visibility changes to `Visible` (same pattern as `SetStatRowVisible()`):

```csharp
private void SetUptimeLineVisible(bool visible)
{
    _showUptimeLine = visible;
    UptimeRow.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;

    if (visible && _hasUserPosition)
    {
        UpdateLayout();
        var clamped = SettingsService.Clamp(
            new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize },
            ActualWidth, ActualHeight);
        Left = clamped.Left; Top = clamped.Top;
    }

    SaveSettings();
}
```

**Warning signs:**
- Widget partially off-screen after showing uptime line when widget was near bottom edge.
- Position drifts downward each time uptime is toggled visible after repositioning near edge.

**Phase to address:** Uptime row toggle implementation — add re-clamp before shipping.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Always push all timer samples to rolling buffer regardless of hover state | Simpler code | Averages corrupted during hover fast-refresh; values meaningless for 5–15 min after hovering | Never — add the hover guard from the start |
| Use `Environment.TickCount` (int, 32-bit) instead of `Environment.TickCount64` | Slightly shorter name | Wraps at ~24.9 days — uptime display resets to near-zero spontaneously | Never |
| Default `ShowUptimeLine = false` | Consistent with decoration defaults | Feature invisible after upgrade; no visible path for discovery | Never — spec says visible by default |
| Skip `ApplyTheme()` extension for uptime row text | Less code to change | Uptime row stays white regardless of accent; visual inconsistency | Never |
| Hardcode buffer size to 300 regardless of configured interval | Simplest implementation | 15m window is only accurate at 3s interval; at 1s interval it's 5m; at 10s it's 50m | Acceptable only if you document clearly that averages assume 3s interval |
| Call `SetUptimeLineVisible()` from `ApplySettings()` | One code path for visibility | Crashes or corrupts position on startup (UpdateLayout before Show()) | Never |
| Skip `ContextMenu_Opened` sync for new menu item | Less typing | Checkmark inverts after one toggle | Never — established pattern |

---

## Integration Gotchas

Common mistakes when connecting the new features to the existing system.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| Rolling buffer + existing stats timer | Push samples on every tick including hover fast-refresh | Track hover state; skip buffer push during 0.5s hover ticks |
| Rolling buffer + StatsService.IsReady | Start pushing on first `UpdateStatsDisplay()` call, which may fire before `_initialized=true` | Guard with `IsReady` check; expose `_initialized` as public `bool IsReady` property |
| `AppSettings.ShowUptimeLine` init default | Mirror decoration defaults (`= false`) | Must be `= true` per UPT-02 spec |
| `ApplySettings()` + new visibility field | Call `SetUptimeLineVisible()` from `ApplySettings()` | Assign `UptimeRow.Visibility` directly; pre-Show() safety invariant |
| `SaveSettings()` + new field | Omit `ShowUptimeLine` from the inline record construction | Explicitly add `ShowUptimeLine = _showUptimeLine` to every `SaveSettings()` call |
| `ApplyTheme()` + new TextBlock | Add XAML element but not `ApplyTheme()` call | Add uptime/load TextBlock foreground assignment to `ApplyTheme()` |
| `ContextMenu_Opened` + new toggle | Skip sync for new item | Add `MenuShowUptimeLine.IsChecked = _showUptimeLine` in `ContextMenu_Opened` |
| `SetStatsVisible()` auto-collapse + uptime row inside StatsPanel | Existing 4-row check collapses panel while uptime row is visible | Either place uptime row outside StatsPanel, or extend the auto-collapse condition |
| `SizeToContent` height change + uptime row toggle | Omit re-clamp in `SetUptimeLineVisible()` | Add `UpdateLayout()` + `Clamp()` when showing the row, same pattern as `SetStatRowVisible()` |
| `Environment.TickCount64` vs WMI | Use WMI on UI thread | Use `TickCount64` (no threading issue) or cache WMI result from `Task.Run` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| WMI query on UI thread at startup | Widget freezes for 0.5–2s during startup | Use `Environment.TickCount64` or cache WMI result from background thread | Every startup if WMI is used |
| Updating uptime string every tick including sub-minute ticks | `CpuPercent:F0` + uptime reassignment on every 1s tick | Add change-guard: compare new string to current before assigning | 1s interval constantly |
| Rolling buffer allocations per sample (list instead of circular array) | Slow GC pressure over hours | Use `float[]` circular buffer with head-index; zero allocations per push | After ~1 hour of operation |
| Calling `TimeSpan.FromMilliseconds(Environment.TickCount64)` + formatting on every tick without checking if display is visible | CPU overhead while uptime row is hidden | Guard `UpdateUptimeDisplay()` with `UptimeRow.Visibility == Visibility.Visible` check | When uptime row is hidden |

---

## "Looks Done But Isn't" Checklist

- [ ] **`ShowUptimeLine` defaults to `true`:** Verify first launch (no settings.json) shows uptime line.
- [ ] **`ShowUptimeLine` persists:** Toggle off, close, reopen — uptime line stays off.
- [ ] **`SaveSettings()` includes `ShowUptimeLine`:** Inspect `settings.json` after toggle — field present with correct value.
- [ ] **`ApplyTheme()` covers uptime row text:** Switch to Amber accent — uptime/load TextBlock matches bar colors.
- [ ] **ContextMenu checkmark correct:** Toggle off via menu, reopen menu — item shows unchecked. Toggle on — shows checked.
- [ ] **Rolling averages stabilize after 1 minute:** No "startup sag" from zero samples polluting the buffer.
- [ ] **Hover does not corrupt averages:** Hover for 60 seconds; move mouse away; 15m average not dramatically changed.
- [ ] **Uptime accurate through system suspend:** Suspend machine for 30 minutes; resume; verify uptime display matches expectation (document whether `TickCount64` or WMI was chosen and what behavior is expected).
- [ ] **Re-clamp on uptime row show:** Position widget near bottom edge; hide uptime row; show uptime row — widget stays on screen.
- [ ] **Pre-Show() safety invariant:** Startup with `ShowUptimeLine = false` in settings — widget shows, no crash, uptime row hidden.
- [ ] **`Environment.TickCount64` not `Environment.TickCount`:** Verify with code review — no accidental use of 32-bit variant.
- [ ] **Auto-collapse logic correct:** Hide all four stat rows — if uptime is in StatsPanel, panel should NOT auto-collapse while uptime is visible; if uptime is outside StatsPanel, auto-collapse is unchanged.

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Rolling buffer seeded with zero samples (P1) | Rolling averages implementation | Buffer pushes guarded by `IsReady`; first sample is a real reading |
| GetTickCount64 suspend behavior (P2) | Uptime source selection | Decision documented; `TickCount64` vs WMI choice explicit in code comment |
| Hover fast-refresh corrupts averages (P3) | Rolling averages implementation | Hover 60s; averages do not change dramatically |
| ShowUptimeLine defaults to true (P4) | AppSettings extension | First-launch test shows uptime line without prior settings.json |
| WMI latency on UI thread (P5) | Uptime source implementation | If WMI used, startup has no freeze; if TickCount64, non-issue |
| Auto-collapse logic gap (P6) | XAML layout decision | Hide all 4 stat rows; verify correct collapse/no-collapse behavior |
| SaveSettings() missing new field (P7) | AppSettings extension | settings.json contains ShowUptimeLine after first toggle |
| Uptime format includes seconds (P8) | Uptime formatting | Format is `up Xd Xh Xm` — no seconds |
| ApplyTheme() not extended (P9) | XAML layout + ApplyTheme extension | Amber accent shows uptime text in amber |
| ContextMenu_Opened sync missing (P10) | Context menu wiring | Two open+close cycles; checkmark stays correct |
| Pre-Show() safety invariant (P11) | ApplySettings() integration | Cold start with ShowUptimeLine=false in settings; no crash |
| SizeToContent re-clamp missing (P12) | SetUptimeLineVisible() implementation | Toggle near bottom screen edge; widget stays on screen |

---

## Sources

| Source | Confidence |
|--------|------------|
| `MainWindow.xaml.cs` — existing `SetStatRowVisible()`, `SetStatsVisible()`, `ApplySettings()`, `ContextMenu_Opened`, `UpdateStatsDisplay()` patterns; read directly from `C:\src\FuzzyStatsClock\FuzzyClock.App\MainWindow.xaml.cs` | HIGH |
| `StatsService.cs` — `_initialized` volatile field, `Refresh()` guard, priming behavior; read directly from source | HIGH |
| `AppSettings.cs` — init-property pattern, `bool` fields default behavior; read directly from source | HIGH |
| `SettingsService.cs` — Load() guards (StatsIntervalSeconds, Opacity, AccentColor), Defaults(), Clamp(); read directly from source | HIGH |
| `MainWindow.xaml` — SizeToContent="WidthAndHeight", StatsPanel Width="180", StackPanel layout; read directly from source | HIGH |
| `PROJECT.md` Key Decisions table — all 40+ validated architectural decisions; read directly from project file | HIGH |
| `Environment.TickCount64` behavior during system suspend — documented in Windows `GetTickCount`/`GetTickCount64` remarks (high-resolution timer sources do not advance during suspend on most ACPI platforms); consistent with known Windows behavior | MEDIUM — functional knowledge; suspend behavior is platform/driver dependent |
| `ManagementObjectSearcher` / WMI startup latency — known COM initialization overhead; confirmed by common WMI performance advice in Microsoft developer documentation | MEDIUM |

---

*Pitfalls research for: WPF transparent overlay — v2.1 uptime display and rolling CPU load averages*
*Researched: 2026-02-27*
