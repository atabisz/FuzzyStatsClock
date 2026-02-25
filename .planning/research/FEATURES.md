# Feature Research

**Domain:** Desktop overlay widget — drag/position-persist/font-size milestone (v1.1)
**Researched:** 2026-02-25
**Confidence:** HIGH (all claims verified against official Microsoft documentation)

---

## Scope Note

This file replaces the v1.0 FEATURES.md and focuses exclusively on the three new features
targeted in v1.1. The existing codebase is a transparent frameless always-on-top WPF window
with `AllowsTransparency="True"`, `WindowStyle="None"`, `SizeToContent="WidthAndHeight"`,
`Background="Transparent"` on the Window, and `Background="#01000000"` on the root Grid
(near-transparent, ensuring hit-testability). That setup is the foundation for all three
new features.

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are behaviors users will silently expect. Getting them wrong registers as a bug, not
a missing feature.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Left-click drag anywhere on widget moves it | How every borderless widget works; user's first instinct | LOW | `Window.DragMove()` on `MouseLeftButtonDown`; the root Grid `#01000000` background already makes the full bounding box hit-testable (confirmed in existing code) |
| Widget stays put after drag | If it snaps back, user loses trust immediately | LOW | Already set via `Window.Left`/`Window.Top` — these persist for the session; durability across restarts is the persistence feature below |
| Position saved and restored across restarts | A widget that forgets where you placed it is fundamentally broken for a persistent desktop tool | LOW | JSON file in `%LOCALAPPDATA%\FuzzyClock\settings.json`; load on startup, save on drag-end or close |
| Widget never starts off-screen | Monitor resolutions change, displays disconnect; saved position must be validated | LOW–MEDIUM | Clamp `Left`/`Top` so at least a minimum visible region (e.g., 50px square) intersects the available working area; use `SystemParameters.WorkArea` for single-monitor or `System.Windows.Forms.Screen.GetWorkingArea()` for multi-monitor |
| Font size change is immediate | Menu selection should update the live widget visually; no "apply" button | LOW | Set `FontSize` on both `PhraseText` and `ShadowText` TextBlocks; call `UpdateLayout()` then re-run position logic |
| Font size persists across restarts | Choosing a font size every launch is friction; users set it once | LOW | Store as integer in the same JSON file as position |
| Right-click menu shows current font size as selected | Standard radio/check-mark UX; without it the menu feels stateless | LOW | `IsChecked="True"` on the active size `MenuItem`; update IsChecked when size changes |

### Differentiators (Competitive Advantage)

Not required to ship v1.1, but would make the feature feel more polished.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Drag cursor feedback (grabbing hand cursor) | Communicates "this is draggable" to first-time users | LOW | Set `Cursor="SizeAll"` or `"Hand"` on the Grid during drag; use `MouseLeftButtonDown`/`MouseLeftButtonUp` events to toggle |
| Save position on drag-end (not on close) | Position is durable even if widget crashes or is killed via Task Manager | LOW | Handle `LocationChanged` event with debounce, or save in `MouseLeftButtonUp` after `DragMove()` completes |
| Snap-to-screen-edge magnetism | Reduces visual clutter; common in overlay tools | MEDIUM | Detect if `Left` or `Top` is within ~20px of a screen edge and snap; adds complexity, not required for v1.1 |
| Screen-edge snap memory | Remembers which screen edge was the home position | MEDIUM | Would need edge-identity in the JSON; skip for v1.1 |
| Undo last drag (Ctrl+Z) | Rarely needed; no desktop widget app offers this | HIGH | Anti-feature for this project; skip |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Click-through transparent areas pass mouse to desktop | "I don't want the widget to block clicks on my desktop" | Cannot be combined with dragging: if the window is WS_EX_TRANSPARENT, mouse events go to the window behind it and `DragMove()` is never reached. Also the existing `#01000000` Grid background is specifically there to ensure hit-testability | If click-through is ever needed, it must be an explicit toggle that disables drag; not compatible as a default behavior |
| Arbitrary font size text input | "I want exactly 28pt" | Adds an input field, validation, and a wider range of layout edge cases; the overlay was designed for glanceability at 3 fixed sizes | Provide three labeled options: Small (16pt), Medium (24pt), Large (32pt) |
| Font family selector | "I prefer a different font" | Introduces layout instability — different fonts have different metrics that break the shadow-offset alignment and border sizing | Keep Segoe UI Light; it is available on all modern Windows installs |
| Settings dialog / window | "A proper settings screen would be nicer" | Contradicts the product's core simplicity; adds a second WPF window, focus management, and theming concerns | Keep everything in the right-click context menu |
| Position locked / locked toggle | "Prevent accidental drags" | Niche; adds a state indicator; the right-click-to-close pattern already shows the widget is intentionally interactive | Skip for v1.1 |
| Multi-monitor position memory per-monitor | "Remember which monitor I usually put it on" | `System.Windows.Forms.Screen` enumerates monitors, but saving per-monitor position requires monitor identity (device name or bounds) which changes when monitors are rearranged | Clamp the single saved position to the nearest visible screen on restore; that is sufficient for most reconfigurations |

---

## Feature Dependencies

```
[Drag to reposition]
    └──requires──> [Hit-testable window surface]
                       (already satisfied: root Grid Background="#01000000")
    └──requires──> [Window.Left / Window.Top are writable]
                       (already satisfied: WindowStartupLocation="Manual")

[Position persistence]
    └──requires──> [Drag to reposition] (something to persist)
    └──requires──> [JSON settings file] (new: System.Text.Json, no extra NuGet needed in .NET 10)
    └──requires──> [Off-screen clamp on load]
                       (new: SystemParameters.WorkArea or Screen.GetWorkingArea)

[Font size selection]
    └──requires──> [Right-click context menu] (already exists)
    └──enhances──> [Right-click context menu] (adds a "Font Size" submenu with 3 items)
    └──requires──> [JSON settings file] (shared with position persistence)

[JSON settings file]
    └──requires──> [Known file path] (Environment.SpecialFolder.LocalApplicationData + "FuzzyClock")
    └──requires──> [Graceful missing-file handling] (first run: use defaults, no crash)
```

### Dependency Notes

- **Position persistence and font-size persistence share one file.** The settings object should hold both `Left`, `Top`, and `FontSize`. Reading/writing once is simpler and avoids partial-save issues.
- **SizeToContent interaction with font size.** The window already uses `SizeToContent="WidthAndHeight"`. Changing font size changes the window's ActualWidth/ActualHeight. After applying font size, `UpdateLayout()` must be called before re-positioning, exactly as `UpdatePhraseIfChanged()` already does. This dependency already has a working pattern in the codebase.
- **PositionTopRight() must be retired or made conditional.** Currently `ContentRendered` unconditionally calls `PositionTopRight()`. With persistence, the startup flow becomes: (1) load settings, (2) apply font size, (3) apply saved position if valid, else fall back to top-right default. The existing `PositionTopRight()` becomes a fallback, not the primary path.

---

## Drag-to-Reposition: Detailed Behavior Specification

### How DragMove Works in This Window

`Window.DragMove()` is the standard WPF approach. It:
- Requires the left mouse button to be pressed when called (throws `InvalidOperationException` otherwise)
- Delegates to Win32's `SendMessage(WM_NCLBUTTONDOWN, HTCAPTION, ...)` internally
- Takes over mouse capture for the duration of the drag
- Updates `Window.Left` and `Window.Top` continuously as the user drags
- Releases on mouse button up automatically

**Hit-test precondition (critical for this project):** `DragMove()` only fires if the mouse is over a hit-testable surface. The existing window design already handles this correctly:
- `Background="Transparent"` on `Window` would be transparent to hit-testing if not compensated
- `Background="#01000000"` on the root `Grid` (alpha=1, barely visible) makes the entire bounding box hit-testable
- The `ShadowText` TextBlock has `IsHitTestVisible="False"` (correct — shadow layer should not interfere)
- No changes to XAML are needed to support dragging the transparent area around the text

**Where to hook it:** Handle `MouseLeftButtonDown` on the root `Grid` or override `OnMouseLeftButtonDown` on the `Window`:

```csharp
protected override void OnMouseLeftButtonDown(MouseButtonEventArgs e)
{
    base.OnMouseLeftButtonDown(e);
    DragMove();
}
```

This fires for any left-click anywhere in the bounding box, including the text and the transparent-but-hit-testable padding area.

**Right-click menu conflict:** `DragMove()` is only called on `MouseLeftButtonDown`. Right-click for the context menu fires `MouseRightButtonDown` — these are separate event paths. No conflict.

### Expected Drag UX

- Widget moves fluidly with the cursor, no lag
- No visual feedback is required (users expect drag of a transparent window to just work)
- Widget can be placed anywhere on-screen, including partially off-screen
- Drag does NOT auto-clamp during the drag; clamping is only applied at startup when restoring a saved position

### Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Drag initiated on text vs. transparent area | Same behavior — the `#01000000` Grid makes both hit-testable |
| Drag toward screen edge / taskbar | Windows handles this; widget can overlap the taskbar (it is `Topmost=True`) |
| Right-click during drag | Not reachable — drag takes mouse capture; right-click events don't fire until mouse is released |
| Click on transparent padding area | Works — Grid background makes it hit-testable |
| Drag on second monitor | Works — `DragMove()` handles virtual desktop coordinates natively |

---

## Position Persistence: Detailed Behavior Specification

### What to Save

```json
{
  "left": 1420.0,
  "top": 20.0,
  "fontSize": 32
}
```

`Window.Left` and `Window.Top` are in WPF logical units (1/96th inch, i.e., device-independent pixels). These should be saved as-is — they are already in a consistent coordinate system. Do not convert to physical pixels before saving.

### When to Save

- On `LocationChanged` event (fires continuously during drag) — use a debounce or only save on `MouseLeftButtonUp` after drag to avoid write-storm
- Simplest safe option: save in a `LocationChanged` handler, but only write if the position has been stable for >500ms (timer-based debounce), OR save when the application exits (`Application.Exit` or `Window.Closing`)
- Even simpler: override `OnMouseLeftButtonUp` to save after `DragMove()` completes; since `DragMove()` blocks until button release, the next statement after `DragMove()` runs exactly when the user drops the widget

### Where to Save

```
%LOCALAPPDATA%\FuzzyClock\settings.json
```

In C#:
```csharp
var dir = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
    "FuzzyClock");
Directory.CreateDirectory(dir); // no-op if already exists
var path = Path.Combine(dir, "settings.json");
```

This location is:
- User-scoped (survives app reinstall, does not require elevation)
- Writable without UAC
- Standard Windows convention for per-user app data
- Separate from the app binary directory (avoid writing to Program Files)

### Off-Screen Clamping

**Why clamping is needed:** A saved position of `Left=3840, Top=20` is valid for a 4K monitor but renders the widget invisible after disconnecting that monitor. The user would have no way to retrieve the widget.

**What "off-screen" means:** The saved `(Left, Top)` places the widget entirely outside all connected displays' combined working area, or so far into a corner that no usable region is visible.

**Clamping strategy — minimum visible region:**

```
After loading Left/Top from file:
1. Compute the widget's would-be Rect: new Rect(left, top, ActualWidth, ActualHeight)
2. For each Screen in System.Windows.Forms.Screen.AllScreens:
   Compute intersection of widget Rect with screen.WorkingArea
3. If total intersection area >= threshold (e.g., 50×50 logical pixels):
   Position is acceptable — apply it
4. Else (widget would be off all screens or nearly so):
   Fall back to PositionTopRight() on primary screen
```

**Simpler single-monitor approach (acceptable for v1.1):**
Use `SystemParameters.WorkArea` (primary screen only) and clamp:

```csharp
var work = SystemParameters.WorkArea;
double clampedLeft = Math.Max(work.Left, Math.Min(left, work.Right - ActualWidth));
double clampedTop  = Math.Max(work.Top,  Math.Min(top,  work.Bottom - ActualHeight));
```

**Trade-off:** Simple clamp against primary screen is correct for single-monitor users and handles the most common off-screen case (monitor disconnected). Multi-monitor users who deliberately position the widget on a secondary display will have it moved to primary after a disconnect, which is the least-bad outcome (widget is always visible).

**Recommendation for v1.1:** Use `SystemParameters.WorkArea` (WPF native, no WinForms reference needed). Add multi-monitor support (via `System.Windows.Forms.Screen.GetWorkingArea`) only if it becomes a reported pain point.

### First Run (No Settings File)

Load returns null/default. Apply defaults: `FontSize=32`, position = top-right (existing `PositionTopRight()` logic). Write the defaults to file after first `ContentRendered` so subsequent launches have a file to read.

### Corrupted / Invalid Settings File

Wrap the JSON read in try/catch. On any exception (malformed JSON, missing fields, out-of-range values), silently fall back to defaults and overwrite the file with defaults. Do not surface an error dialog — the widget should always start.

---

## Font Size Selection: Detailed Behavior Specification

### The Three Sizes

| Option | Display Label | FontSize | Rationale |
|--------|---------------|----------|-----------|
| Small  | "Small (16pt)"  | 16 | Compact; good for high-density desktops |
| Medium | "Medium (24pt)" | 24 | Default for most users; readable at arm's length |
| Large  | "Large (32pt)"  | 32 | Current v1.0 default; good for high-DPI or distance viewing |

The current v1.0 code hardcodes `FontSize="32"` on both TextBlocks. v1.1 makes this a user choice with 32pt as the default on first run.

### Context Menu Structure

Extend the existing right-click `ContextMenu` on the root `Grid`:

```
[ Close ]
[ ─────────── ]
[ Font Size  ▶ ]
               [ Small (16pt)   ✓ ]   ← check mark on active size
               [ Medium (24pt)    ]
               [ Large (32pt)     ]
```

This uses WPF's native `MenuItem` → nested `MenuItem` submenu pattern:

```xml
<MenuItem Header="Font Size">
    <MenuItem x:Name="FontSmall"  Header="Small (16pt)"  IsCheckable="True" Click="FontSize_Click" Tag="16" />
    <MenuItem x:Name="FontMedium" Header="Medium (24pt)" IsCheckable="True" Click="FontSize_Click" Tag="24" />
    <MenuItem x:Name="FontLarge"  Header="Large (32pt)"  IsCheckable="True" Click="FontSize_Click" Tag="32" />
</MenuItem>
```

**Radio-style mutual exclusion:** WPF `MenuItem` does not have a built-in `GroupName` like `RadioButton`. Implement it manually: in the `FontSize_Click` handler, set `IsChecked=false` on all three items, then set `IsChecked=true` on the clicked item.

### Applying Font Size

```csharp
double size = double.Parse((string)((MenuItem)sender).Tag);
PhraseText.FontSize = size;
ShadowText.FontSize = size;
UpdateLayout();           // Required: SizeToContent makes ActualWidth stale
RepositionAfterResize();  // Re-apply stored position (or PositionTopRight if no stored position)
```

The shadow TextBlock must receive the same FontSize as the primary, or the 2px offset shadow will misalign at different sizes.

### Position After Font Size Change

When font size changes, the window resizes (`SizeToContent="WidthAndHeight"`). If the window is currently positioned at the right or bottom edge of a screen, a size increase may push it off-screen. After applying a new font size, re-clamp `Left`/`Top` using the same clamping logic used at startup.

**Do not automatically re-anchor to top-right.** The user may have dragged the widget to a custom position. Just clamp if the new size creates an off-screen condition.

### Save on Font Size Change

Save the updated settings immediately after applying the new font size. The user should not need to restart or close the app for the preference to be durable.

---

## MVP Definition

### Ship with v1.1

All four are already committed in PROJECT.md as the active milestone requirements.

- [ ] **Drag to reposition (WIN-04)** — `OnMouseLeftButtonDown` → `DragMove()`; no XAML changes needed
- [ ] **Position restored on startup, clamped if off-screen (WIN-05)** — JSON file in LocalApplicationData; single-monitor WorkArea clamp
- [ ] **Font size selector in right-click menu (DISP-05)** — "Font Size" submenu with 3 IsCheckable MenuItems; radio mutual exclusion in code-behind
- [ ] **Font size persists (DISP-06)** — stored in the same JSON file as position

### Not in v1.1 (Confirmed Deferred)

- [ ] **Auto-launch on Windows login (STRT-01)** — registry run key; explicitly deferred to v2+ in PROJECT.md
- [ ] **Animated phrase transitions** — polish; does not affect positioning or font
- [ ] **Multi-monitor smart positioning** — `Screen.GetWorkingArea`; acceptable to skip for v1.1

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Drag to reposition | HIGH | LOW (3–5 lines of code) | P1 |
| Position persistence + clamping | HIGH | LOW–MEDIUM (JSON file + clamp logic) | P1 |
| Font size selector in menu | HIGH | LOW (XAML submenu + handler) | P1 |
| Font size persistence | HIGH | LOW (reuse the same JSON write path) | P1 |
| Drag cursor feedback | LOW | LOW | P3 — nice to have |
| Save-on-drag-end (debounced) vs save-on-close | LOW | LOW | P2 — save-on-close is acceptable for v1.1 |
| Multi-monitor clamping | MEDIUM | MEDIUM | P3 — defer unless reported |

---

## Sources

- `Window.DragMove()` method: https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.dragmove (HIGH confidence — official docs, verified 2026-02-25)
- `UIElement.IsHitTestVisible` + WPF hit testing: https://learn.microsoft.com/en-us/dotnet/desktop/wpf/graphics-multimedia/hit-testing-in-the-visual-layer (HIGH confidence — official docs, verified 2026-02-25)
- `SystemParameters.WorkArea`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.systemparameters.workarea (HIGH confidence — official docs, verified 2026-02-25)
- `Screen.GetWorkingArea()` for multi-monitor: https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.screen.getworkingarea (HIGH confidence — official docs, verified 2026-02-25)
- `Window.Left` / `Window.Top` coordinate system: https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.left (HIGH confidence — official docs, verified 2026-02-25)
- `MenuItem.IsChecked` / submenu patterns: https://learn.microsoft.com/en-us/dotnet/api/system.windows.controls.menuitem.ischecked (HIGH confidence — official docs, verified 2026-02-25)
- `System.Text.Json` serialization: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/how-to (HIGH confidence — official docs, verified 2026-02-25)
- `Environment.GetFolderPath(LocalApplicationData)`: https://learn.microsoft.com/en-us/dotnet/api/system.environment.getfolderpath (HIGH confidence — official docs, verified 2026-02-25)
- Existing codebase: `C:/src/gsd1/FuzzyClock.App/MainWindow.xaml` and `MainWindow.xaml.cs` (HIGH confidence — first-party, read directly)

---
*Feature research for: Fuzzy Clock v1.1 — drag/position-persist/font-size*
*Researched: 2026-02-25*
