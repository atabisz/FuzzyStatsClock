# Architecture Patterns

**Domain:** WPF transparent frameless always-on-top desktop clock widget
**Project:** Fuzzy Clock
**Researched:** 2026-02-25
**Confidence:** HIGH — all WPF properties verified against official Microsoft docs (windowsdesktop-10.0)

---

## Recommended Architecture

The application is a single-window WPF app with no navigation. There are four logical
components: a time source, a phrase engine, a timer, and the window/view layer.
The project deliberately has no settings screen, no tray icon, and no MVVM overhead —
it is code-behind-driven by design, keeping the total file count minimal.

```
┌─────────────────────────────────────────────────────────┐
│  MainWindow (WPF Window)                                │
│                                                         │
│  ┌───────────────┐    ┌────────────────────────────┐   │
│  │ UpdateTimer   │───>│ ClockViewModel / code-behind│  │
│  │ DispatcherTimer│    │  - PhraseText: string       │   │
│  │ Interval=30s  │    │  - reads DateTime.Now        │   │
│  └───────────────┘    └────────────┬───────────────┘   │
│                                    │                     │
│                        ┌───────────▼──────────┐         │
│                        │  PhraseEngine         │         │
│                        │  TimeToPhrase(time)   │         │
│                        │  → "almost noon"      │         │
│                        └───────────────────────┘         │
│                                                         │
│  XAML: TextBlock bound to PhraseText                    │
└─────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `MainWindow` (XAML + code-behind) | Window chrome configuration, drag-to-move, timer startup/shutdown | `PhraseEngine`, `DispatcherTimer` |
| `PhraseEngine` | Pure mapping function: `DateTime` → `string` phrase. No UI, no side effects | Called by `MainWindow` code-behind (or ViewModel) |
| `UpdateTimer` (`DispatcherTimer`) | Fires every 30 seconds on the UI thread, triggering phrase re-evaluation | Owned by `MainWindow`; calls back into code-behind via `Tick` event |
| `TextBlock` (XAML) | Renders the phrase string | Bound to `PhraseText` property or set directly in `Tick` handler |

**Why 30-second tick instead of 5 minutes:** The phrase bucket changes on 5-minute
boundaries of the clock (e.g. :00, :05, :10 ...). Polling at 30 seconds costs nothing
and guarantees the display changes within one half-minute of the boundary crossing.
A 5-minute timer aligned naively to startup time will often miss boundaries by minutes.

---

## WPF Window Settings for Transparent / Frameless / Always-On-Top

These four properties are the complete set required. All must be set before the window
is shown; some cannot be changed after the handle is created.

### Required XAML Attributes on `<Window>`

```xml
<Window x:Class="FuzzyClock.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"

        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent"
        Topmost="True"
        ResizeMode="NoResize"

        Width="400"
        Height="120"
        Left="100"
        Top="100"
        ShowInTaskbar="False">
```

### Property Explanations

| Property | Value | Why Required | Constraint |
|----------|-------|--------------|------------|
| `WindowStyle` | `None` | Removes title bar, border, and all OS chrome | **Required** when `AllowsTransparency="True"` — setting `AllowsTransparency` throws `InvalidOperationException` if `WindowStyle` is not `None` (verified: MS Docs) |
| `AllowsTransparency` | `True` | Enables per-pixel alpha compositing so the window client area can be transparent | Must be set in XAML before handle creation; cannot be changed at runtime after window is shown |
| `Background` | `Transparent` | Makes the window background color transparent; without this the window stays opaque even with `AllowsTransparency=True` | Set on the `Window` element, not on a child panel |
| `Topmost` | `True` | Puts the window in the topmost z-order group, appearing above all non-topmost windows | Among multiple `Topmost=True` windows, the currently activated one is highest. Other always-on-top apps (e.g. Task Manager) will still appear above |
| `ResizeMode` | `NoResize` | Suppresses resize grips and min/max boxes; correct for a fixed-size widget | Without `WindowStyle=None` this would hide min/max buttons; here it is belt-and-suspenders |
| `ShowInTaskbar` | `False` | Prevents the widget from cluttering the taskbar | Optional but strongly recommended for overlay widgets |

### Drag to Move (No Title Bar)

Because `WindowStyle="None"` removes the title bar, users cannot drag the window.
Restore drag with a single event handler on the window root element:

```csharp
// In MainWindow constructor or Loaded handler:
this.MouseLeftButtonDown += (s, e) => DragMove();
```

`Window.DragMove()` is the WPF built-in for this. It must be called from within a
`MouseButtonDown` handler while the left button is pressed.

---

## Data Flow

```
System Clock (DateTime.Now)
        │
        ▼
  [DispatcherTimer.Tick]  ← fires every 30 seconds on UI thread
        │
        ▼
  PhraseEngine.TimeToPhrase(DateTime.Now)
        │  pure function, no I/O
        ▼
  string phrase  (e.g. "just after half past 11")
        │
        ▼
  TextBlock.Text = phrase   (direct assignment in code-behind)
        │
        ▼
  WPF renders text onto transparent window
        │
        ▼
  User sees floating phrase on desktop
```

**Direction:** always one-way — clock → phrase → display. There is no user input
beyond drag-to-move, which does not affect the data flow.

---

## PhraseEngine: Input/Output Contract

The engine is a static class (or a class with a single static method). It receives a
`DateTime`, extracts hour and minute, maps to one of 12 five-minute buckets, and
returns a string. No dependencies, no state.

```csharp
// Signature
public static class PhraseEngine
{
    public static string TimeToPhrase(DateTime time) { ... }
}
```

**Bucket mapping (12 slots per hour):**

| Minutes | Bucket Label | Example Phrase |
|---------|--------------|----------------|
| 00–02 | on the hour | "12 o'clock" |
| 03–07 | just after | "just after 12" |
| 08–12 | ten past | "ten past 12" |
| 13–17 | quarter past | "quarter past 12" |
| 18–22 | twenty past | "twenty past 12" |
| 23–27 | almost half | "almost half past 12" |
| 28–32 | half past | "half past 12" |
| 33–37 | just after half | "just after half past 12" |
| 38–42 | twenty to | "twenty to 1" |
| 43–47 | quarter to | "quarter to 1" |
| 48–52 | ten to | "ten to 1" |
| 53–57 | almost | "almost 1" |
| 58–59 | on the hour (next) | "almost 1" / "1 o'clock" |

Hour names use 12-hour natural English ("noon", "midnight" for 12:xx and 0:xx).
The "next hour" is used for buckets 38–59.

---

## Suggested Build Order

Dependencies flow top-to-bottom. Each step is independently testable before the next.

```
Step 1: PhraseEngine (pure logic, no WPF, unit-testable)
    └── No dependencies. Build and test in isolation first.

Step 2: MainWindow shell (transparent/frameless/always-on-top window)
    └── Depends on: WPF project structure only.
    └── Verify the window appears transparent on desktop before wiring data.

Step 3: Wire DispatcherTimer + PhraseEngine into MainWindow code-behind
    └── Depends on: Step 1 (PhraseEngine), Step 2 (window exists).
    └── Tick handler calls PhraseEngine.TimeToPhrase(DateTime.Now),
        assigns result to TextBlock.Text.

Step 4: Text styling (font, size, color, drop shadow for legibility)
    └── Depends on: Step 3 (text is displaying correctly).
    └── Pure XAML changes, no logic impact.
```

**Rationale for this order:**
- Step 1 first because the phrase logic is the core value and easiest to get wrong.
  It can be verified with unit tests before any UI exists.
- Step 2 before Step 3 because the transparency/compositing setup has non-obvious
  constraints (WindowStyle must match AllowsTransparency) that fail at runtime with
  exceptions. Verify the window before adding logic.
- Step 4 last because styling has zero correctness impact; it can be iterated freely
  once behavior is correct.

---

## Project File Structure

Minimal WPF project. No MVVM framework, no extra NuGet packages.

```
FuzzyClock/
├── FuzzyClock.csproj          # <TargetFramework>net9.0-windows</TargetFramework>
│                              # <UseWPF>true</UseWPF>
├── App.xaml                   # Application entry; StartupUri="MainWindow.xaml"
├── App.xaml.cs                # Empty application class
├── MainWindow.xaml            # Window with transparency settings, TextBlock
├── MainWindow.xaml.cs         # Code-behind: timer init, Tick handler, DragMove
└── PhraseEngine.cs            # Static class: TimeToPhrase(DateTime) → string
```

Total: 5 files (3 XAML/code-behind pairs + 1 logic class). No subdirectory needed at this scale.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Setting AllowsTransparency at Runtime
**What goes wrong:** Attempting to set `AllowsTransparency = true` in code after the
window handle is created throws `InvalidOperationException`.
**Instead:** Set it in XAML declaratively before the window is shown.

### Anti-Pattern 2: Using System.Timers.Timer Instead of DispatcherTimer
**What goes wrong:** `System.Timers.Timer` fires on a thread-pool thread. Any attempt
to set `TextBlock.Text` from the `Elapsed` handler throws a cross-thread exception
(`System.InvalidOperationException: The calling thread cannot access this object
because a different thread owns it`).
**Instead:** Use `DispatcherTimer`, which fires on the UI thread directly. No
`Dispatcher.Invoke` call needed. (Verified: MS Docs — "DispatcherTimer runs on the
same thread as the Dispatcher.")

### Anti-Pattern 3: Aligning Timer Interval to 5 Minutes
**What goes wrong:** A 5-minute timer started at app launch (e.g., 11:03) will tick at
11:08, 11:13 — which may miss the 5-minute phrase boundary (11:05) by up to 4 minutes.
**Instead:** Use a 30-second interval. Cheap, always current within 30 seconds.
Alternatively, calculate the exact ms until the next 5-minute boundary and restart the
timer on each tick, but this is significantly more complex for no user-visible benefit.

### Anti-Pattern 4: Putting Phrase Logic in Code-Behind
**What goes wrong:** Hard to test without spinning up a WPF window. Phrase edge cases
(noon, midnight, boundary minutes) go unverified.
**Instead:** `PhraseEngine` is a standalone static class. The code-behind only calls it
and assigns the result. All phrase logic is unit-testable without WPF.

### Anti-Pattern 5: Using a Child Panel as the Transparency Root
**What goes wrong:** Setting `Background="Transparent"` on a `Grid` or `StackPanel`
inside the window while leaving the `Window.Background` opaque results in a solid
background appearing behind the content.
**Instead:** `Background="Transparent"` must be set on the `Window` element itself,
not on child containers.

---

## Scalability Considerations

This is a personal desktop widget. Scalability is not a concern. The architecture note
worth making is about **legibility across desktop backgrounds**:

| Concern | Solution |
|---------|---------|
| White text invisible on light desktop wallpaper | Add a `DropShadowEffect` or `OutlinedTextBlock` to the TextBlock |
| Text too small on high-DPI displays | Set `TextOptions.TextFormattingMode="Display"` and use pt-based font sizes; WPF respects system DPI |
| Window position lost on restart | Store `Left`/`Top` in `Properties.Settings.Default` (user-scoped app settings) — deferred to post-MVP |

---

## Sources

| Claim | Source | Confidence |
|-------|--------|------------|
| `AllowsTransparency` requires `WindowStyle=None`, throws `InvalidOperationException` otherwise | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.allowstransparency | HIGH |
| `Topmost=True` places window above all non-topmost windows; among topmost windows, activated one is highest | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.topmost | HIGH |
| `WindowStyle.None` removes title bar and border chrome | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.windowstyle | HIGH |
| `ResizeMode.NoResize` hides min/max boxes, no draggable border | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.resizemode | HIGH |
| `DispatcherTimer` fires on UI thread; `System.Timers.Timer` requires `Dispatcher.Invoke` | https://learn.microsoft.com/en-us/dotnet/api/system.windows.threading.dispatchertimer | HIGH |
| `Window.DragMove()` enables drag-to-move on frameless windows | WPF documentation / training data corroborated by official API surface | MEDIUM |
