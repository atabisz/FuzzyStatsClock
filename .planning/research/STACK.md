# Stack Research

**Domain:** WPF desktop overlay — proximity-based opacity fade (v4.0 Proximity Ghost Mode)
**Researched:** 2026-03-27
**Confidence:** HIGH — all findings grounded in existing validated project code and Win32/WPF BCL APIs

---

## Summary Statement

No new libraries or frameworks are needed. The proximity fade is implementable entirely from APIs
the project already uses: the existing `GetCursorPos` + `GetWindowRect` P/Invokes already declared
in `GhostModeController`, the existing 75ms `DispatcherTimer`, and direct assignment to
`Window.Opacity`. The existing `GhostModeController` is extended in-place rather than replaced.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `GetCursorPos` + `GetWindowRect` (user32.dll) | Win32 (stable since XP) | Distance calculation every 75ms tick | Already declared in `GhostModeController`. The only reliable source for cursor and window coordinates when `WS_EX_TRANSPARENT` is active — WPF `Mouse.GetPosition` stops working under click-through transparency (validated in project history, key decision logged in PROJECT.md). |
| `DispatcherTimer` (WPF BCL) | .NET 10 | Drive proximity polling and opacity steps | Already exists at 75ms in `GhostModeController._restoreTimer`. Repurpose the same timer for both proximity fade and the existing exit detection; no second timer needed. 75ms = ~13 fps for the fade — visually smooth for the ambient use case. |
| `Window.Opacity` (WPF) | .NET 10 | Apply computed fade value directly | Already used by ghost mode (`this.Opacity = 0.0` / `this.Opacity = _windowOpacity`). Direct assignment on every tick is correct and sufficient — no animation framework needed (see Alternatives section). |
| `Math.Clamp` (.NET BCL) | .NET 10 | Clamp computed opacity to [0.0, 1.0] | Zero-cost utility. Prevents floating-point edge cases from producing out-of-range opacity values. |

### Supporting Libraries

None needed. All required functionality is in the .NET BCL and Win32 APIs already used by the project.

| Library | Status | Why Not Needed |
|---------|--------|----------------|
| `System.Windows.Media.Animation` (Storyboard / DoubleAnimation) | Available in WPF but NOT recommended | Cannot reliably synchronize `WS_EX_TRANSPARENT` at exact `Opacity==0`; seizes DP ownership away from `_windowOpacity` field (see Alternatives) |
| Any third-party easing/animation library | Not applicable | Over-engineering for a distance-to-opacity mapping computed per-tick |

### Development Tools

No additions needed. Existing MSTest suite, CI pipeline, and dotnet build are sufficient.

---

## Distance-from-Rect Calculation

The fade depends on the cursor's distance to the nearest edge of the window RECT, not inside/outside.
Both `GetCursorPos` and `GetWindowRect` return physical screen pixels — no DPI conversion is needed.

**Euclidean clamped formula:**

```csharp
// cursor: POINT from GetCursorPos
// rect:   RECT  from GetWindowRect (physical pixels)
// Returns pixels from cursor to nearest rect edge.
// Returns 0 when cursor is inside or touching the rect.
static int DistanceToRect(POINT cursor, RECT rect)
{
    int dx = Math.Max(0, Math.Max(rect.Left - cursor.X, cursor.X - rect.Right));
    int dy = Math.Max(0, Math.Max(rect.Top  - cursor.Y, cursor.Y - rect.Bottom));
    return (int)Math.Sqrt(dx * dx + dy * dy);
}
```

This uses Euclidean distance, producing a rounded-corner proximity zone that matches the natural
mental model of "distance from widget edge." Chebyshev (max of dx, dy) is a valid alternative that
produces a rectangular zone; no architectural difference either way.

**Opacity mapping (linear interpolation):**

```csharp
// proximityRadiusPx: user-configured fade start distance in physical pixels
// distance:          result of DistanceToRect above
// configuredOpacity: _windowOpacity (the user's saved opacity setting)
double FadeOpacity(int distance, int proximityRadiusPx, double configuredOpacity)
{
    if (distance >= proximityRadiusPx) return configuredOpacity;   // outside fade zone
    if (distance <= 0)                 return 0.0;                  // inside window (ghost)
    double t = (double)distance / proximityRadiusPx;               // 0.0 at edge, 1.0 at radius
    return Math.Clamp(t * configuredOpacity, 0.0, configuredOpacity);
}
```

Linear (`t`) is the correct default for a subtle ambient fade. A quadratic ease-out (`t * t`) can be
added later as a one-line swap inside `FadeOpacity` with no architectural implications.

---

## Timer Strategy: Manual Stepping vs WPF Storyboard/DoubleAnimation

**Recommendation: manual stepping via the existing 75ms DispatcherTimer. Do NOT use Storyboard.**

### Why NOT Storyboard / DoubleAnimation

1. **WS_EX_TRANSPARENT synchronization is impossible.** WS_EX_TRANSPARENT must be applied at
   exactly `Opacity == 0.0` and removed the moment `Opacity > 0.0`. `DoubleAnimation` runs
   asynchronously; the only completion callback (`Completed`) fires at the *end* of the animation,
   not at intermediate values. Applying WS_EX_TRANSPARENT at the right moment requires the exact
   per-tick opacity knowledge that polling already provides.

2. **Directional reversal mid-fade.** When the cursor retreats before fade-out completes, the fade
   must reverse immediately. Cancelling a running `DoubleAnimation` and starting a reverse requires:
   (a) `BeginAnimation(OpacityProperty, null)` to release DP ownership, (b) read `this.Opacity` for
   the current mid-fade value, (c) start a new animation `From: current` with `_windowOpacity` as
   the destination. These three steps still do not solve the WS_EX_TRANSPARENT synchronization
   problem. The polling approach reverses in one line: `this.Opacity = FadeOpacity(distance, ...)`.

3. **`_windowOpacity` field ownership.** The project invariant is that `_windowOpacity` is the
   authoritative configured opacity and `this.Opacity` is always set from it. A running
   `DoubleAnimation` seizes ownership of `Window.Opacity` via the WPF property system, making
   `_windowOpacity` stale mid-animation. The contrast controller, drag freeze, and ghost restore
   paths in `MainWindow` all reference `_windowOpacity` or set `this.Opacity` directly — all three
   would need auditing for mid-animation correctness.

4. **75ms is smooth enough.** A cursor moving at 300px/second (moderate desktop mouse speed) crosses
   a 100px fade zone in ~330ms = ~4 ticks. Opacity changes by ~25% per tick — visible but not
   jarring. At 100px/second there are ~13 ticks across the zone, providing smooth gradation.
   This is appropriate for a subtle ambient desktop widget; film-quality animation is not the goal.

### Why Manual Stepping Works Cleanly

The existing `_restoreTimer.Tick` handler already reads `GetCursorPos` + `GetWindowRect` every 75ms.
Extending that handler to compute distance, call `FadeOpacity`, assign `this.Opacity`, and manage
the WS_EX_TRANSPARENT transition at `Opacity == 0.0` is a straightforward extension of existing
logic. `DispatcherTimer.Tick` fires on the WPF UI thread — `Window.Opacity` can be assigned directly
with no thread marshalling.

---

## Integration Points with the Existing 75ms Timer

The current `GhostModeController._restoreTimer` has one mode today:

| Mode | When Active | What Timer Does |
|------|-------------|-----------------|
| Exit detection | After `Activate()` (cursor inside, `WS_EX_TRANSPARENT` on, `Opacity == 0`) | Polls until cursor leaves HWND rect; fires `Restored` event; stops timer |

With proximity fade, the timer needs to be always-on (or start when cursor approaches the proximity
zone) and cover three states:

| State | Condition | Timer Action |
|-------|-----------|--------------|
| Outside zone | `distance >= ProximityFadeRadiusPx` | Ensure `this.Opacity == _windowOpacity`; stop timer if no ghost active |
| Proximity zone | `0 < distance < ProximityFadeRadiusPx` | `this.Opacity = FadeOpacity(distance, ...)`; ensure `WS_EX_TRANSPARENT` is OFF |
| Inside window | `distance == 0` | Apply `WS_EX_TRANSPARENT`, `this.Opacity = 0`, set `_isGhostMode = true` |

**Tick pseudocode:**

```
Tick:
  if (!IsEnabled) return
  GetCursorPos(out cursor); GetWindowRect(_hwnd, out rect)
  distance = DistanceToRect(cursor, rect)

  if (IsCtrlAltHeld()):
    // Ctrl+Alt: suppress proximity and ghost; ensure fully opaque
    if (_isGhostMode): remove WS_EX_TRANSPARENT, _isGhostMode=false, Restored?.Invoke()
    this.Opacity = _windowOpacity
    return

  if (distance == 0):
    // Cursor is inside; activate ghost if not already active
    if (!_isGhostMode):
      [synthetic hover cleanup — backdrop, stats timer, _isHoverFastRefresh]
      apply WS_EX_TRANSPARENT, _isGhostMode = true, this.Opacity = 0
  elif (distance < ProximityFadeRadiusPx):
    // In proximity zone — apply fade
    if (_isGhostMode):
      remove WS_EX_TRANSPARENT, _isGhostMode = false, Restored?.Invoke()
    this.Opacity = FadeOpacity(distance, ProximityFadeRadiusPx, _windowOpacity)
  else:
    // Outside zone — restore full opacity
    if (_isGhostMode):
      remove WS_EX_TRANSPARENT, _isGhostMode = false, Restored?.Invoke()
    if (this.Opacity != _windowOpacity):
      this.Opacity = _windowOpacity
    // Optionally stop timer here to avoid polling overhead when cursor is far away
```

**Timer always-on vs start/stop:** Continuous polling at 75ms has negligible CPU impact (~two
P/Invoke calls per tick at 13 Hz). Always-on after `Initialize()` avoids the start/stop edge cases.
If start/stop is preferred, start on `Window_MouseEnter` (which fires before `WS_EX_TRANSPARENT`
is active, so WPF mouse events still work) and stop when distance exceeds `ProximityFadeRadiusPx`
for multiple consecutive ticks.

The `Restored` event that clears backdrop in `MainWindow` continues to fire on the ghost→non-ghost
transition, same as today. No change to the `Restored` handler in `MainWindow.ContentRendered` is
needed.

---

## New AppSettings Fields

Two new fields added to `AppSettings` (init-property record, JSON forward-compat pattern):

```csharp
public bool ProximityFadeEnabled  { get; init; } = true;
public int  ProximityFadeRadiusPx { get; init; } = 100;
```

`ProximityFadeEnabled = true` is the correct default — proximity fade is the primary new behavior of
this milestone. `ProximityFadeRadiusPx = 100` is a reasonable default (roughly one standard icon
width on a 100% DPI display).

**Validation guard in `SettingsService.Validate()`** (following the existing ladder-value guard
pattern):

```csharp
if (loaded.ProximityFadeRadiusPx < 10 || loaded.ProximityFadeRadiusPx > 500)
    loaded = loaded with { ProximityFadeRadiusPx = 100 };
```

The range 10–500 is permissive enough for the slider range (50–200px in Settings > Behavior) while
guarding against manually edited invalid values.

**Settings UI:** Slider in Settings > Behavior tab alongside the existing Ghost Mode toggle. Range
50–200px, step 10. Label in physical pixels is fine because the value is stored and used in physical
pixel space (matching the Win32 P/Invoke coordinate system).

---

## DPI Consideration

`GetCursorPos` and `GetWindowRect` return physical screen pixels. `ProximityFadeRadiusPx` is stored
in physical pixels consistently. No DPI conversion is needed within `GhostModeController`.

At 150% DPI: 100 physical px = ~67 logical px = approximately one standard icon width. At 100% DPI:
100 physical px = 100 logical px. The difference is perceptible but acceptable for an ambient fade
radius set by a user-controlled slider.

If per-DPI radius correction becomes a requirement, the conversion at the `GhostModeController`
boundary is: `physicalPx = logicalPx * source.CompositionTarget.TransformToDevice.M11`. This is a
one-line addition that does not affect the core design. Recommended to defer until explicitly
requested.

---

## Ctrl+Alt Suppression

The existing `IsCtrlAltHeld()` check in `Window_MouseEnter` suppresses ghost mode when the user
holds Ctrl+Alt. The same check must suppress proximity fade. In the unified tick approach, checking
`IsCtrlAltHeld()` at the top of the tick handler handles this automatically — both ghost and proximity
fade are bypassed, and opacity is restored to `_windowOpacity`, consistent with the existing contract.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Manual `this.Opacity` per 75ms tick | WPF `DoubleAnimation` on `Window.Opacity` | Cannot reliably synchronize `WS_EX_TRANSPARENT` at `Opacity==0`; mid-fade directional reversal requires three non-trivial steps; seizes ownership of the opacity DP away from `_windowOpacity` field |
| Extend existing `GhostModeController._restoreTimer` | New separate `DispatcherTimer` for proximity | Two overlapping timers at 75ms both calling `GetCursorPos`/`GetWindowRect` is wasteful and introduces timing edge cases; one timer owns all ghost+proximity logic |
| Euclidean distance for proximity zone | Chebyshev (max of dx, dy) | Both are correct; Euclidean produces a rounded-corner zone matching user mental model of "distance from widget"; Chebyshev is marginally cheaper (no sqrt). Either can be used; Euclidean is recommended. |
| Store radius in physical pixels | Store radius in logical pixels | Physical pixels are consistent with the Win32 coordinate space already in use; no DPI query needed within `GhostModeController`; logical pixels require a `PresentationSource` call at the boundary |
| Timer always-on after `Initialize()` | Start/stop timer on proximity entry/exit | Start/stop adds state management complexity; 75ms continuous at 13 Hz is negligible CPU overhead |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `Window.BeginAnimation(OpacityProperty, ...)` | Seizes WPF DP ownership; conflicts with direct `_windowOpacity` assignment; `WS_EX_TRANSPARENT` sync not achievable | Direct `this.Opacity = value` in `DispatcherTimer.Tick` |
| `Storyboard` in XAML | Same DP ownership problem; XAML-driven animation cannot respond to per-tick proximity distance | Manual tick computation |
| A second `DispatcherTimer` for fade stepping | Duplicates `GetCursorPos`/`GetWindowRect` already in existing timer | Extend existing `_restoreTimer` tick |
| WPF `MouseMove` event for proximity detection | Not delivered when `WS_EX_TRANSPARENT` is active; misses the symmetric restore case | `GetCursorPos` polling already used |
| `SetTimer` (Win32) on a background thread | Requires `Dispatcher.Invoke` to write `Window.Opacity`; unnecessary marshalling overhead | `DispatcherTimer` fires on WPF UI thread natively |

---

## Version Compatibility

| Component | Version in Use | Notes |
|-----------|---------------|-------|
| `GetCursorPos` / `GetWindowRect` | Win32 (stable) | P/Invoke signatures already validated in project; no version concern |
| `DispatcherTimer` | .NET 10 (WPF) | Already in use; no version concern |
| `Window.Opacity` | .NET 10 (WPF) | Already in use; `double` 0.0–1.0 range |
| `Math.Clamp` | .NET Core 2.0+ | Available in .NET 10; no concern |
| `AppSettings` init-property record | Existing pattern | New fields JSON-deserialize to their init defaults when loading old settings.json — no migration needed |

---

## Sources

- `GhostModeController.cs` (project source, direct read) — existing P/Invoke declarations, 75ms timer,
  `WS_EX_TRANSPARENT` synchronization pattern; HIGH confidence
- `AppSettings.cs` + `SettingsService.cs` (project source, direct read) — init-property record pattern,
  `Validate()` guard pattern for new fields; HIGH confidence
- `MainWindow.xaml.cs` (project source, direct read) — `_windowOpacity` field, ghost activate/restore
  flow, Ctrl+Alt check, contrast controller freeze guard that also reads `_windowOpacity`; HIGH confidence
- WPF `DoubleAnimation` / `Storyboard` behavior — animated DP ownership and `BeginAnimation(null)`
  detach behavior is well-established WPF animation system behavior; MEDIUM confidence (not verified
  via Context7 since it is the non-recommended path; sufficient for rationale)
- PROJECT.md key decisions (project source, direct read) — validated rationale for Win32 polling over
  WPF mouse events under WS_EX_TRANSPARENT; HIGH confidence

---

*Stack research for: WPF proximity ghost mode fade (v4.0)*
*Researched: 2026-03-27*
