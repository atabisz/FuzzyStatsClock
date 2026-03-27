# Feature Research: Proximity Ghost Fade

**Domain:** Desktop overlay widget — proximity-based opacity fade extending existing ghost mode
**Milestone:** v4.0
**Researched:** 2026-03-27
**Confidence:** HIGH (codebase audit + official WPF/Fluent docs; no speculative claims)

---

## What Is Already Built (Do Not Re-Implement)

| Component | Status | Relevance to Proximity Fade |
|-----------|--------|-----------------------------|
| `GhostModeController` — 75ms polling via `GetCursorPos` + `GetWindowRect` | Complete | Core polling loop reuses directly for distance sampling |
| `GhostModeController.IsCtrlAltHeld()` | Complete | Ctrl+Alt suppression applies unchanged to proximity fade |
| `GhostModeController.IsEnabled` | Complete | Ghost tray toggle gates proximity fade (off = no fade) |
| `Window_MouseEnter` ghost activation path | Complete | Must be replaced/extended — proximity fade makes MouseEnter obsolete as the trigger |
| `AppSettings` init-property record | Complete | New `GhostFadeRadiusPx` field follows existing pattern |
| Settings > Behavior tab | Complete | Slider control lands here below `ChkGhostMode` |
| `SettingsWindow.GhostModeChanged` event | Complete | New `GhostFadeRadiusChanged` event follows same pattern |

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must exist for the proximity fade to feel complete and correct. Missing any of these
makes the behavior feel broken or inconsistent.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Opacity decreases as cursor nears the widget | The core behavior; without it the feature does not exist | MEDIUM | Distance = shortest distance from cursor point to widget RECT. Opacity fraction = `distance / fadeRadiusPx` clamped [0.0, 1.0]. Applied to `this.Opacity` scaled by configured widget opacity |
| Fade continues to zero on cursor entry (no snap) | A discontinuity at the boundary would look like a bug — the fade must complete smoothly | LOW | When cursor is inside the RECT, distance = 0, opacity = 0. WS_EX_TRANSPARENT applied at the same moment opacity reaches zero |
| Symmetric fade-back on retreat | Users expect the widget to re-appear the same way it disappeared; asymmetric would feel glitchy | LOW | Same distance formula on retreat. Remove WS_EX_TRANSPARENT before opacity rises above 0 (first non-zero tick) |
| Ctrl+Alt suppresses proximity fade | Consistent with existing ghost mode override; users already know this gesture | LOW | `GhostModeController.IsCtrlAltHeld()` reuses without change; proximity sampling pauses when held |
| Ghost mode tray toggle gates proximity fade | If Ghost Mode is off, proximity fade should also be off — they are the same feature family | LOW | `GhostModeController.IsEnabled` check already on proximity polling path |
| Configurable fade radius slider in Settings > Behavior | User wants a Settings slider (stated requirement) | LOW | `Slider` control, range 20–200px, step 10px. Default 80px. Placed below `ChkGhostMode` in Behavior tab. Enabled only when `ChkGhostMode` is checked |
| Radius persists across restarts | All settings persist; this one must too | LOW | `AppSettings.GhostFadeRadiusPx` init-property, `int`, default 80. `Validate()` clamps to [20, 200] |
| Opacity update driven by existing 75ms polling timer | No new timer needed; `GhostModeController`'s timer already fires at 75ms | LOW | 75ms is 13 fps — smooth enough for a fade that spans hundreds of milliseconds; no perceptible stepping at this rate with a radius of 80px |

### Differentiators (Competitive Advantage)

Features that improve the feel without being strictly required by the stated spec.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Opacity proportional to distance (linear) | Linear is the simplest and most predictable curve; users can build a mental model of it ("further = brighter") | LOW | `opacity = (distance / radius) * _windowOpacity`. Linear is the right default choice here — no easing function is needed because the cursor velocity varies continuously and the animation is driven by position, not time |
| Fade-out faster than fade-in (asymmetric speed using a floor on retreat rate) | Hiding quickly respects the user's intent to move away from the widget; revealing slowly is less startling | LOW | Achievable by capping the opacity increment per tick on the restore direction to `_windowOpacity * 0.08` per tick (roughly 750ms full fade-in at 75ms/tick) while allowing instant jumps downward. LOW priority — linear may be sufficient |
| Slider label showing current value in pixels | Users adjusting a slider need to see the number to understand what they're setting | LOW | `TextBlock` bound to slider value next to the control. "80 px from edge" |
| Slider enabled/disabled based on Ghost Mode checkbox state | Prevents confusion — if ghost mode is off the radius slider has no effect | LOW | `SldFadeRadius.IsEnabled = ChkGhostMode.IsChecked ?? false` in `PopulateControls` and in `ChkGhostMode_Changed` |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Time-based animation (DoubleAnimation / Storyboard) for the fade | WPF has built-in animation; it seems like the obvious tool | Proximity fade is position-driven, not time-driven. A Storyboard running to a fixed endpoint is wrong when the cursor can reverse direction mid-animation. A WPF animation that is cancelled and restarted every 75ms produces FillBehavior artifacts and fights with direct Opacity assignment. The existing ghost mode sets `this.Opacity = 0.0` directly — this pattern must continue | Direct assignment of `this.Opacity` in the polling tick, computed from current cursor distance each frame |
| Separate "fade speed" slider alongside the radius slider | Separating speed from radius sounds like more control | Two independent controls create confusing interactions (fast fade at small radius = invisible widget that disappears instantly; slow fade at large radius = widget that barely reaches zero before being entered). Speed and radius are coupled by the physics of cursor movement | One radius slider is sufficient; speed is implicitly controlled by how quickly the cursor moves through the zone |
| Fade to a non-zero minimum opacity (instead of zero) | "So the widget stays slightly visible even when hovered" | This breaks the core ghost-mode contract — the widget must become fully invisible and click-through on cursor entry. A non-zero minimum would block clicks to windows beneath | Fade must reach zero at boundary crossing. WS_EX_TRANSPARENT is what prevents click-blocking, not reduced opacity alone |
| Activating WS_EX_TRANSPARENT at a threshold before the widget reaches zero opacity | "Make it click-through earlier so it's less surprising" | WS_EX_TRANSPARENT at non-zero opacity would make a semi-transparent but uninteractable widget — users would see it but clicks would pass through to the desktop. Confusing. | Apply WS_EX_TRANSPARENT only when opacity reaches exactly zero (on boundary crossing), exactly as the current ghost mode does |
| Proximity fade when ghost mode tray toggle is off | "Let the fade work even without ghost mode" | Ghost mode and proximity fade are the same feature — proximity fade is the gradient version of snap-invisible ghost mode. Separating them creates two settings that interact in confusing ways | Proximity fade is strictly a sub-feature of ghost mode; off = off |
| Round distance metric (Euclidean to nearest corner) vs. rectangular distance | Euclidean feels more natural for circular fade zones | The widget is a rectangle. Rectangular distance (clamp-to-RECT then measure delta) produces a rectangular fade zone that matches the widget shape, which is more predictable. Euclidean distance produces an elliptical zone that is wider at corners — counterintuitive | Use rectangular distance (already implemented in `GhostModeController` logic — extend it to return distance instead of a boolean) |

---

## Feature Dependencies

```
[Proximity Fade Behavior]
    requires: GhostModeController polling timer (already exists — 75ms)
    requires: GetCursorPos + GetWindowRect P/Invoke (already exists in GhostModeController)
    requires: AppSettings.GhostFadeRadiusPx (new field, int, default 80)
    requires: GhostModeController refactored to return distance from cursor to RECT
              (currently returns only bool — must expose int DistanceFromRect(POINT cursor, RECT rect))
    requires: Opacity assignment on each polling tick (direct this.Opacity = computed value)
    requires: WS_EX_TRANSPARENT applied only when distance == 0 (boundary crossed) — same as today
    requires: WS_EX_TRANSPARENT removed when distance > 0 on retreat — NEW logic

    gated-by: GhostModeController.IsEnabled (GhostModeEnabled tray toggle)
    suppressed-by: GhostModeController.IsCtrlAltHeld() — same as existing snap ghost

[Settings UI]
    requires: Slider in Settings > Behavior tab below ChkGhostMode
    requires: AppSettings.GhostFadeRadiusPx field
    requires: SettingsWindow.GhostFadeRadiusChanged event (Action<int>)
    requires: PopulateControls reads GhostFadeRadiusPx into slider
    requires: SliderFadeRadius_ValueChanged fires GhostFadeRadiusChanged
    requires: Slider IsEnabled = ChkGhostMode.IsChecked — prevents active slider when ghost is off

[Window_MouseEnter refactor]
    existing behavior: MouseEnter triggers instant ghost (opacity=0, WS_EX_TRANSPARENT)
    new behavior: MouseEnter is NO LONGER the primary trigger for ghost activation
    replacement: proximity polling detects distance < radius and begins fading BEFORE cursor enters
    MouseEnter is still useful as a boundary-crossing signal (distance = 0 confirmation)
    risk: existing ghost-mode snap tests still pass if MouseEnter still applies WS_EX_TRANSPARENT
          at distance=0, but the Opacity=0 assignment moves to the polling tick

[Ctrl+Alt path in Window_MouseEnter — unchanged]
    existing: if ctrlAltHeld OR !ghostEnabled → normal hover path (backdrop, fast refresh)
    new: proximity fade polling also pauses when ctrlAltHeld
    no change needed to the ctrlAlt branch in Window_MouseEnter
```

---

## MVP Definition

### This Milestone Delivers (v4.0)

Per PROJECT.md active requirements (v4.0 Proximity Ghost Mode):

- [ ] PROX-01: Opacity decreases smoothly as cursor nears widget boundary — linear, proportional to distance / radius
- [ ] PROX-02: Fade continues to zero on boundary crossing — no snap discontinuity
- [ ] PROX-03: Opacity restores as cursor retreats — symmetric distance-proportional restore
- [ ] PROX-04: WS_EX_TRANSPARENT applied on entry (distance = 0), removed on first non-zero-distance retreat tick
- [ ] PROX-05: Ctrl+Alt held suppresses proximity fade — normal hover path activates instead
- [ ] PROX-06: Ghost Mode tray toggle gates proximity fade — off = snap-invisible fallback or full disable
- [ ] PROX-07: `AppSettings.GhostFadeRadiusPx` field (int, default 80, validate range 20–200)
- [ ] PROX-08: Slider in Settings > Behavior tab: range 20–200px, step 10px, label showing current value
- [ ] PROX-09: Slider gated on Ghost Mode checkbox (disabled when ghost is off)
- [ ] PROX-10: `GhostFadeRadiusChanged` event in SettingsWindow; wired in MainWindow

### Deferred (Not This Milestone)

- Asymmetric fade speed (fade-out faster than fade-in) — linear behavior is sufficient for v4.0
- Fade zone shape options (rectangular vs radial) — rectangular matches widget shape; correct default
- Multiple proximity zones (e.g., outer zone = 50% opacity, inner zone = begin fading to zero) — adds complexity without clear UX benefit
- Per-axis fade (horizontal vs vertical proximity radius independent) — not requested; over-engineered

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Distance-proportional opacity on polling tick | HIGH | MEDIUM (refactor GhostModeController to expose distance) | P1 |
| WS_EX_TRANSPARENT only at distance=0 | HIGH | LOW (move from MouseEnter to polling tick) | P1 |
| Restore fade on retreat | HIGH | LOW (same formula, reverse direction, remove transparency) | P1 |
| Configurable radius slider in Settings | HIGH | LOW (slider + new AppSettings field + event) | P1 |
| Ctrl+Alt suppression | HIGH | LOW (existing check, no change) | P1 |
| Ghost mode toggle gating | HIGH | LOW (existing check, no change) | P1 |
| Slider enabled/disabled state vs Ghost Mode checkbox | MEDIUM | LOW (one IsEnabled binding) | P2 |
| Slider label showing px value | MEDIUM | LOW (TextBlock next to Slider) | P2 |
| AppSettings validation for radius range | MEDIUM | LOW (one guard in Validate()) | P2 |

---

## Implementation Complexity Assessment

### Overall Milestone Complexity: MEDIUM

**Why MEDIUM:** The rendering and polling infrastructure is fully built. The primary work is:

1. Refactoring `GhostModeController`: the polling timer tick currently computes a boolean
   (cursor inside/outside RECT). It must instead compute an `int distancePx` (shortest distance
   from cursor to widget RECT, 0 when inside). This is a small arithmetic change — clamp cursor
   X to [Left, Right] and Y to [Top, Bottom], then measure delta.

2. Replacing `Window_MouseEnter` as the ghost trigger: the polling loop now owns fade onset.
   MouseEnter becomes redundant for ghost activation; it retains the Ctrl+Alt hover path.
   This is the highest-risk change because it restructures a validated interaction. The existing
   `GHOST-01` through `GHOST-03` and `CTRLALT-01` / `CTRLALT-02` tests must continue to pass.

3. Opacity assignment: `this.Opacity = (distancePx / (double)_fadeRadiusPx) * _windowOpacity`
   on each polling tick. Clamp the final value to [0.0, _windowOpacity]. Direct assignment —
   no DoubleAnimation, no Storyboard.

4. Transparency timing: `WS_EX_TRANSPARENT` is applied when `distancePx == 0` (cursor inside
   RECT) and removed when `distancePx > 0` on the next tick after exit. The existing
   `GhostModeController.Activate()` / removal path refactors to handle this.

5. Settings UI: one Slider element in SettingsWindow.xaml, one new event, one new AppSettings
   field, one Validate() guard.

**Key risk:** The transition from "MouseEnter triggers ghost instantly" to "polling loop drives
fade before cursor entry" must preserve the `ctrlAltHeld` bypass path. The bypass must still
activate the normal hover backdrop and fast-refresh on cursor entry — but now the polling loop
may have already started fading opacity before MouseEnter fires. The bypass path must reset
opacity back to `_windowOpacity` when it takes over.

---

## Radius Range and UX Reference Values

Based on analysis of the widget footprint, typical desktop resolution, and cursor movement speed:

| Radius | UX Character | Appropriate For |
|--------|-------------|-----------------|
| 20 px | Very short fade zone — almost like the current snap behavior with a brief transition | Users who want ghost mode but dislike the current abrupt snap |
| 50 px | Noticeable fade starts about one cursor-width before widget edge | Default feel |
| 80 px | Fade begins well before cursor reaches widget — forgiving, easy to approach | Recommended default (PROJECT.md confirmed: user wants a slider, not a fixed value) |
| 120 px | Wide zone — widget becomes noticeably dim at moderate cursor approach distance | Users who work near the widget frequently and want maximum warning time |
| 200 px | Maximum — widget is already at ~50% opacity when cursor is 200px away | Specialist use; not suitable as default |

**Recommended default: 80px.** This gives roughly 0.5–1 seconds of fade time at normal cursor
movement speed (~100–150px/s when deliberately approaching a target), which matches the
Microsoft Fluent "ControlNormalAnimationDuration" of 250ms for a 30px zone. The human
perception threshold for "I can see it fading" is approximately 50ms, which the 75ms polling
tick satisfies.

---

## Opacity Curve: Linear vs Easing

**Recommendation: Linear.** Confidence: HIGH.

For time-driven animations (object enters scene on a fixed timeline), easing functions are
appropriate. WPF provides QuadraticEase, CubicEase, SineEase, ExponentialEase for these cases
(confirmed in official WPF easing docs).

For position-driven proximity fade, the "animation" is not running on a clock — it is
recomputed each polling tick from cursor position. Applying a easing curve to a position-driven
value is unusual and produces unpredictable results when the cursor reverses direction. Linear
is the correct choice because:

- The user's cursor position is the independent variable, not time
- Linear means "opacity = distance / radius" — a rule the user can easily learn and predict
- Any perceived smoothness comes from the 75ms polling cadence, not from a curve shape
- Non-linear would make the widget appear to resist fading near the edge (easeIn) or lurch
  toward invisible (easeOut) — neither behavior is intuitive for a proximity effect

---

## Dependency on Existing Ghost Mode

The proximity fade feature is a direct extension of the existing ghost mode infrastructure. It
does not replace ghost mode — it replaces the *trigger mechanism* (from MouseEnter snap to
polling-based gradual fade) while keeping the same *outcome* (widget invisible and click-through
when cursor is on it).

**What must be preserved:**
- `WS_EX_TRANSPARENT` is still applied when cursor is on the widget (distance = 0)
- `WS_EX_TRANSPARENT` is still removed on cursor exit
- Ctrl+Alt bypass still activates normal hover (backdrop, fast-refresh, drag)
- Ghost Mode tray toggle still disables the entire behavior
- The restored event from `GhostModeController` still fires so `Window_MouseLeave` handler
  can clean up backdrop and timer state

**What changes:**
- `GhostModeController` polling tick computes distance, not just a boolean
- Opacity is set continuously by the polling tick (not just once in MouseEnter)
- MouseEnter no longer applies `Opacity=0` / calls `_ghostMode.Activate()` on the ghost path
  (these happen in the polling tick when distance reaches 0)
- A new `_fadeRadiusPx` field on `GhostModeController` (or passed per-tick from MainWindow)

---

## Sources

- Direct codebase audit (2026-03-27): HIGH confidence for all integration points
  - `FuzzyClock.App/GhostModeController.cs` — polling timer, distance check, P/Invoke pattern
  - `FuzzyClock.App/MainWindow.xaml.cs` — `Window_MouseEnter`, ghost activation, Ctrl+Alt path
  - `FuzzyClock.App/AppSettings.cs` — init-property record pattern for new field
  - `FuzzyClock.App/SettingsWindow.xaml` — Behavior tab layout, existing slider patterns
  - `.planning/PROJECT.md` — v4.0 milestone goals, existing validated requirements

- WPF Animation docs (official, HIGH confidence):
  - Animation Overview: https://learn.microsoft.com/en-us/dotnet/desktop/wpf/graphics-multimedia/animation-overview
  - Easing Functions: https://learn.microsoft.com/en-us/dotnet/desktop/wpf/graphics-multimedia/easing-functions
  - Conclusion: DoubleAnimation is appropriate for time-driven fade; direct Opacity assignment
    is correct for position-driven proximity fade (easing does not apply)

- Microsoft Fluent Design motion timing (official, HIGH confidence):
  - https://learn.microsoft.com/en-us/windows/apps/design/motion/timing-and-easing
  - ControlNormalAnimationDuration = 250ms; ControlFastAnimationDuration = 167ms
  - Exit easing = accelerate (cubic-bezier 1,0,1,1); Enter easing = decelerate (cubic-bezier 0,0,0,1)
  - These are reference values for timed animations; proximity fade is position-driven so
    these curves do not apply directly, but the 250ms norm validates that a 75ms polling tick
    over an 80px zone produces appropriately fast perceived response

- Rainmeter documentation (MEDIUM confidence — no proximity fade feature exists):
  - https://docs.rainmeter.net/manual/mouse-actions/
  - Conclusion: Rainmeter handles MouseOver/MouseLeave as discrete events only; no proximity
    fade primitives exist in the ecosystem. This feature must be custom-built (already the case
    with FuzzyClock's ghost mode). No reference implementation to compare against.

---

*Feature landscape for: FuzzyStatsClock v4.0 — Proximity Ghost Fade*
*Researched: 2026-03-27*
