# Pitfalls Research

**Domain:** WPF transparent overlay — proximity fade added to existing ghost mode
**Project:** Fuzzy Clock v4.0 Proximity Ghost Mode
**Researched:** 2026-03-27
**Confidence:** HIGH — all pitfalls derived from direct source audit of GhostModeController.cs, ContrastRefreshController.cs, MainWindow.xaml.cs, AppSettings.cs, SettingsService.cs, and the PROJECT.md decision log

---

## Critical Pitfalls

Mistakes that cause data corruption, permanent opacity loss, invisible-but-interactive widgets, or silent regression of existing features.

---

### Pitfall 1: Overwriting the User's Configured Opacity With the Display Opacity

**What goes wrong:**
Proximity fade computes a "display opacity" (0.0 to `_windowOpacity`) and writes it to `this.Opacity` on every 75ms tick. If the fade code also writes `_windowOpacity`, the user's preference is silently overwritten. The next `SaveSettings()` call then persists the fade-reduced value. On next launch the widget is dimmer than the user set it.

**Why it happens:**
Every existing opacity-changing site in MainWindow (`SetOpacity()`, `ApplySettings()`, `PreviewMouseWheel_Handler`, `ResetToDefaults()`) writes `_windowOpacity` and `this.Opacity` together. A developer adding fade naturally follows that pattern and accidentally corrupts the persisted preference.

**Consequences:**
- `settings.json` `Opacity` field decreases silently over sessions
- The opacity slider in Settings shows a lower value than the user set
- The tray Opacity preset checkmarks become unchecked
- Users report "my opacity keeps changing" — very hard to diagnose after the fact

**How to avoid:**
Enforce a strict two-variable discipline at the declaration site:
- `_windowOpacity` = the user's configured preference. Only written by `SetOpacity()`, `ApplySettings()`, `PreviewMouseWheel`, `ResetToDefaults()`, and theme application. Never touched by proximity logic.
- `this.Opacity` = the display value, set freely by fade.

All fade writes go only to `this.Opacity`. All saves, slider sync, and opacity preset checkmarks read only from `_windowOpacity`. Add a comment at the `_windowOpacity` field declaration explicitly forbidding proximity code from writing it.

**Warning signs:**
- `settings.json` Opacity field is below the value the user last set via the opacity slider
- Opacity checkmark in tray or Settings shows a different level after a proximity fade cycle
- `_windowOpacity != this.Opacity` is true at steady state when the cursor is far away (should never happen at rest)

**Phase to address:**
The phase introducing the fade tick handler. The two-variable discipline must be established before any fade writes are committed.

---

### Pitfall 2: WS_EX_TRANSPARENT Applied Before Opacity Reaches Zero

**What goes wrong:**
Proximity fade drives `this.Opacity` down over time. If `WS_EX_TRANSPARENT` (click-through) is applied at any intermediate opacity value — even 0.1 — the widget becomes click-through while still visually present. The cursor passes through it but the widget is still visible on screen. More critically, once `WS_EX_TRANSPARENT` is set, WPF stops delivering mouse events to the window. The Ctrl+Alt modifier check (`GetAsyncKeyState` in `GhostModeController.IsCtrlAltHeld`) is unaffected, but `Window_MouseEnter` and `Window_MouseLeave` no longer fire. Any hover state cleanup that was meant to happen on entry is now lost.

**Why it happens:**
Developers conflate "fading out" with "going ghost". It is tempting to apply click-through early in the fade to create a smoother feel. But `WS_EX_TRANSPARENT` triggers the synthetic `WM_MOUSELEAVE` delivery immediately (the existing code already guards this), and the restore polling timer (`GhostModeController._restoreTimer`) starts looking for cursor exit — it will detect exit almost immediately because the synthetic leave happened, creating a spurious restore cycle.

**How to avoid:**
`WS_EX_TRANSPARENT` must only be applied when `this.Opacity == 0.0` — the same invariant as the existing snap-to-ghost. The proximity fade drives opacity; `GhostModeController.Activate()` is called only at the moment `this.Opacity` reaches exactly 0. This must be the only call site of `Activate()`.

**Warning signs:**
- Widget is partially visible but does not respond to right-click, drag, or Ctrl+Alt during a fade
- `_ghostMode.IsActive` becomes true before `this.Opacity == 0.0` (check in debugger)
- Ghost restore fires immediately after ghost activation during a fade (synthetic MOUSELEAVE loop)
- User report: "the widget disappears instantly instead of fading"

**Phase to address:**
The phase implementing the fade-to-zero transition at the widget boundary. The `if (this.Opacity == 0.0) { _ghostMode.Activate(); }` gate must be explicit.

---

### Pitfall 3: Ghost Restore Snaps Opacity Instead of Fading In

**What goes wrong:**
The `GhostModeController._restoreTimer` fires `Restored` when the cursor leaves the window rect. The `Restored` handler in `MainWindow` currently does `this.Opacity = _windowOpacity` — an instant snap. If proximity fade is supposed to provide a smooth fade-in as the cursor retreats, the `Restored` event fires first and snaps opacity to full, canceling the gradual fade-in. The result: instant pop-in on exit, gradual fade-out on approach. The experience is asymmetric and jarring.

**Why it happens:**
`GhostModeController` was designed for binary ghost mode. The `Restored` event is correct for that model. Adding fade does not automatically make the restore event fade-aware — it still fires and immediately assigns opacity.

**How to avoid:**
The `Restored` handler must transition the window into "fading-in" state rather than directly assigning `this.Opacity = _windowOpacity`. The `GhostModeController` still owns cursor-exit detection (that logic is sound and must not change). Its only responsibility changes from "snap opacity back" to "signal cursor has exited — start fade-in". The fade-in rate and opacity increments are owned by the proximity fade component.

**Warning signs:**
- Widget pops to full visibility instantly when the cursor leaves, despite a smooth fade-out on approach
- A fade-in timer or animation never actually increments opacity because the restore handler already set it to the target

**Phase to address:**
The phase implementing fade-in (symmetric restore). The `Restored` event handler in `MainWindow` must be updated to initiate a fade-in rather than assign opacity directly. This is a companion change to the fade-out implementation — both must ship together or the behavior is asymmetric.

---

### Pitfall 4: Auto-Contrast Sampler Runs During Fade (Feedback Flicker Regression)

**What goes wrong:**
`ContrastRefreshController` uses a `shouldSkip` predicate: `() => _ghostMode.IsActive || _windowOpacity == 0.0 || _isDragging`. During a proximity fade, `_ghostMode.IsActive` is false (click-through has not been applied yet) and `_windowOpacity` is still the user's configured value (e.g., 1.0). The predicate returns false, so the contrast sampler runs its 500ms BitBlt. It captures the screen pixels under the widget — but because the widget is partially transparent, its own dimmed rendering bleeds into the sampled pixels. The sampler then makes a contrast decision based on a blended image that includes the widget's own content, potentially re-introducing the WCAG oscillation feedback loop that required three separate fixes in v3.6, v3.6.1, and v3.6.2.

**Why it happens:**
The `shouldSkip` predicate was designed for binary ghost (either fully hidden or fully visible). It does not account for the partially-transparent state introduced by proximity fade. The careful layered fixes in v3.6.2 (`SHELLDLL_DefView` + DWM cloaked check) target steady-state sampling over an empty desktop — they do not guard against transient mid-fade sampling.

**How to avoid:**
Extend the `shouldSkip` predicate to include the "fading" state. Expose an `IsProximityFading` bool from the proximity component and wire it into the predicate:

```csharp
// In ContrastRefreshController.Initialize():
() => _ghostMode.IsActive || _windowOpacity == 0.0 || _isDragging || _proximityFade.IsActive
```

Alternatively use `this.Opacity < _windowOpacity` as the skip signal: if the display opacity is below the configured value for any reason, skip sampling.

**Warning signs:**
- Auto-contrast text color oscillates (flickers between black/white and accent) only during proximity fade transitions
- Disabling proximity fade makes the oscillation stop
- The flicker is visible only during the fade-out or fade-in animation, not at steady state

**Phase to address:**
The phase introducing proximity fade. The `shouldSkip` predicate update must be in the same commit as the fade implementation — never deferred.

---

### Pitfall 5: Hover Fast-Refresh and Backdrop Activating During Proximity Approach

**What goes wrong:**
`Window_MouseEnter` fires when the cursor crosses the window rect boundary. For the normal hover path (Ctrl+Alt or ghost disabled), `MouseEnter` activates the 0.5s fast stats refresh and shows the backdrop. Proximity fade fades the widget down before the cursor reaches the window boundary. If the fade radius is small, the cursor crosses the boundary before the widget is fully faded. `Window_MouseEnter` fires with the widget still partially visible. The ghost activation path inside `MouseEnter` cleans up hover state and calls `_ghostMode.Activate()` — this is correct. However if ghost mode is disabled but proximity fade is still somehow active, or if the Ctrl+Alt branch fires during an approach the user did not intend as an interaction, the hover behaviors (backdrop display, fast refresh) activate on a nearly-invisible widget.

**Why it happens:**
`Window_MouseEnter` is tied to the window rect boundary, not the proximity zone. The proximity zone extends `FadeRadiusPx` beyond the window edge. Events that should only trigger on deliberate hover (backdrop, fast-refresh) can trigger at the boundary crossing which is deep into the fade animation.

**How to avoid:**
The ghost activation path in `Window_MouseEnter` already suppresses fast-refresh by resetting timer interval before calling `_ghostMode.Activate()`. This path is safe. The risk is the Ctrl+Alt path: if the cursor reaches the widget boundary while it is nearly invisible and the user holds Ctrl+Alt (to interact), the backdrop appears on an almost-invisible widget. This is an acceptable edge case but document it. Proximity fade should be active only when ghost mode is enabled — so ghost disabled + proximity fade active should never be a reachable state.

**Warning signs:**
- Stats start fast-refreshing at 0.5s when the cursor approaches (but has not yet entered) the widget
- Backdrop appears before the cursor reaches the widget boundary
- `_isHoverFastRefresh` is true during proximity approach without Ctrl+Alt being held

**Phase to address:**
The phase adding proximity zone detection. Ensure proximity fade is gated on `_ghostMode.IsEnabled` — proximity fade without ghost mode enabled is meaningless and should not run.

---

### Pitfall 6: Opacity Jitter at the Outer Fade Boundary

**What goes wrong:**
Proximity fade computes opacity as a function of cursor distance. At the outer boundary (where fade begins), small cursor movements from input device jitter cause opacity to oscillate: 0.97, 1.0, 0.98, 1.0. Each 75ms tick independently evaluates distance with no memory of the previous tick. The result is visible "breathing" — a subtle but noticeable flicker when the cursor is held stationary near the fade start distance.

**Why it happens:**
A linear or eased distance-to-opacity function is continuous and sensitive. Mouse jitter from standard input devices is typically 1–3 pixels. On a 100px fade zone, 2px of jitter produces 2% opacity change per tick — imperceptible. On a 20px fade zone, 2px of jitter is 10% opacity change — clearly visible. The narrower the fade zone, the worse the jitter amplification.

**How to avoid:**
Apply hysteresis at the outer boundary — the same pattern used by `ContrastService` (4.5/5.5 WCAG thresholds for contrast switching). Use two distances:
- `FadeStartDistance` = where fade begins on approach (cursor moving inward)
- `FullOpacityDistance` = `FadeStartDistance + hysteresisBand` = where full opacity is restored on retreat (cursor moving outward)

Only begin fading when the cursor crosses `FadeStartDistance` inward; only restore full opacity when the cursor retreats past `FullOpacityDistance`. A hysteresis band of 10–15px absorbs normal mouse jitter. The band can be hardcoded (not user-configurable) since it is a jitter correction, not a preference.

**Warning signs:**
- Widget "breathes" (subtle opacity change) when cursor is held at approximately the fade start distance
- Opacity changes without intentional cursor movement
- Flicker is worse when the fade radius is set to a small value (20–30px)

**Phase to address:**
The phase implementing the distance-to-opacity calculation. Build hysteresis in from the start — retrofitting it later requires changing the fade state machine.

---

### Pitfall 7: Wrong Coordinate Space in Proximity Distance Calculation

**What goes wrong:**
Proximity fade must detect the cursor at `FadeRadiusPx` pixels from the window edge before the cursor enters the window rect. This requires comparing `GetCursorPos` output (physical screen pixels, Win32) against the window bounds. The existing `GhostModeController` correctly uses `GetWindowRect` (physical pixels, Win32) for this comparison. If proximity distance code uses `Window.Left`, `Window.Top`, `Window.ActualWidth`, or `Window.ActualHeight` (WPF device-independent units, DIPs) instead of `GetWindowRect`, the comparison produces wrong distances on non-100% DPI screens. A configured 100px fade zone appears as 125px on a 125%-DPI display, or 200px on a 200%-DPI display.

**Why it happens:**
Win32 APIs return physical pixels. WPF layout properties return DIPs. On 96 DPI (100% scaling) they are identical — the bug is invisible during development. It only surfaces on non-100% DPI settings (very common on laptops with HiDPI screens).

**How to avoid:**
Use exclusively `GetWindowRect` for the widget bounds in all proximity calculations, and compare against `GetCursorPos` exclusively. Both are in physical pixels and are DPI-consistent. The `FadeRadiusPx` setting in `AppSettings` should store physical pixels, with the conversion from DIP units happening at the point of use via `PresentationSource.CompositionTarget.TransformToDevice` if the slider label shows DIPs. Alternatively store DIPs and convert at comparison time — but be explicit and consistent.

**Warning signs:**
- Fade starts at a different visual distance on a 150% DPI laptop vs. a 100% DPI desktop
- Testing on the development machine (commonly 100% DPI) shows correct behavior; user reports the zone feels larger
- Distance calculation uses `Window.Left` + `Window.ActualWidth` instead of `GetWindowRect` output

**Phase to address:**
The phase implementing the proximity zone polling loop. The coordinate space must be decided at design time for this phase.

---

### Pitfall 8: Proximity Fade Running During Drag (Widget Goes Invisible Mid-Drag)

**What goes wrong:**
`_isDragging` is set true during `DragMove()` and false after it returns. The contrast sampler freezes the display color during drag (via the `shouldSkip` predicate). Proximity fade, if not similarly paused, computes cursor distance on every 75ms tick. During drag the cursor is always on or very near the widget (the user is holding it). This puts the cursor inside the proximity zone or inside the widget rect — the fade-to-zero logic then begins fading the widget while the user is actively dragging it, making it disappear or become very dim mid-drag.

**Why it happens:**
The `_isDragging` flag was added to the contrast sampler's skip condition but is not automatically inherited by any new component. Each new component that modifies opacity must explicitly check `_isDragging`.

**How to avoid:**
The proximity fade tick handler must check `_isDragging` before computing or applying any opacity change. When `_isDragging` is true, freeze `this.Opacity` at `_windowOpacity` and return immediately. The same pattern as `_isDragging` in `ContrastRefreshController._shouldSkip`.

**Warning signs:**
- Widget becomes semi-transparent or invisible while being dragged
- After dropping the widget, opacity snaps rather than reflecting the cursor's new distance
- User reports they "lose" the widget while dragging it

**Phase to address:**
The phase implementing the proximity fade tick handler. The `_isDragging` guard should be in the first working version of the handler.

---

### Pitfall 9: ResetToDefaults Does Not Reset Fade Radius

**What goes wrong:**
`ResetToDefaults()` is a manual enumeration of field resets. When `FadeRadiusPx` (or equivalent) is added to `AppSettings`, if it is not also added to `ResetToDefaults()` and `SettingsService.Defaults()`, users who set an extreme fade radius (e.g., 400px) cannot recover to the sensible default without manually deleting `settings.json`. This is a recurring pattern: any field added to `AppSettings` must be consciously added to all three of: init default, `SettingsService.Defaults()`, and `ResetToDefaults()`.

**Why it happens:**
`ResetToDefaults()` is a manually maintained list in `MainWindow.xaml.cs`. There is no compiler-enforced link between adding an `AppSettings` field and adding its reset. The project has a history of this category of miss (e.g., `_currentPhraseStyle` and `_currentPhraseLocale` were missing from ResetToDefaults until v3.5 FIX-01).

**How to avoid:**
When adding `FadeRadiusPx` to `AppSettings`, immediately add:
1. An `init` default at the field declaration in `AppSettings`
2. An explicit value in `SettingsService.Defaults()`
3. A `SettingsService.Validate()` guard (e.g., clamp to 0–300px range)
4. A reset in `ResetToDefaults()` in `MainWindow.xaml.cs`

All four must be in the same commit.

**Warning signs:**
- After Reset to Defaults, proximity fade still uses the user's previous custom radius
- `SettingsService.Defaults()` does not include `FadeRadiusPx`
- The fade zone size after reset is 0 (C# double default) or the old value — never the intended default

**Phase to address:**
The phase that adds `FadeRadiusPx` to `AppSettings`.

---

### Pitfall 10: Settings Slider UX Confusion — Fade Radius vs. Opacity Slider

**What goes wrong:**
A "Fade Zone" slider in Settings > Behavior sits near the existing Opacity slider in Settings > Appearance. Users conflate the two: they expect the fade zone slider to control minimum opacity at the closest approach. When the widget fades to fully invisible near them but the Opacity slider shows 75%, they conclude the Opacity slider is broken. Separately, users may interpret the Opacity slider as controlling the starting opacity of the fade, rather than the steady-state configured opacity when far away.

**Why it happens:**
Two controls that both affect "how visible is the widget" with different scopes are hard to distinguish without explicit labeling. The relationship — configured opacity is the maximum, proximity fade always goes to zero regardless — is not obvious from slider positions alone.

**How to avoid:**
- Label the fade zone slider clearly: "Proximity Fade Zone (px)" with unit shown
- Add a one-line description below the slider: "Widget fades to invisible when the cursor is within this distance"
- Use "0 = disabled" as the left end of the slider to make the off state obvious
- Do not expose a "minimum fade opacity" control — proximity fade always goes to zero (the click-through point). Anything above zero leaves a semi-visible widget that still captures mouse events until `WS_EX_TRANSPARENT` is applied, which confuses the state machine.

**Warning signs:**
- User reports: "my opacity setting keeps resetting"
- User confusion: "what's the difference between Opacity and Fade Zone?"
- Support requests for a "fade to 50% instead of 0%" option

**Phase to address:**
The phase adding the fade radius slider to SettingsWindow. Labels and description must ship with the control, not as a follow-up.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline proximity distance calculation in the ghost restore timer tick instead of a separate `ProximityFadeController` | Faster initial implementation; fewer files | Ghost controller grows beyond single responsibility; distance logic cannot be unit tested in isolation | MVP only; extract before shipping if the logic is more than 20 lines |
| `this.Opacity < _windowOpacity` as the "is fading" signal rather than a dedicated `_isProximityFading` bool | No new field needed | Other legitimate transient states (applying a theme, startup) also produce `Opacity < _windowOpacity`; skip predicates fire spuriously | Never — the explicit bool is trivially cheap and removes ambiguity |
| Skip updating the `shouldSkip` predicate in `ContrastRefreshController` during initial fade implementation | Contrast code untouched | Feedback flicker during fade transitions; undoes the v3.6.2 fix | Never — must update in the same commit as fade |
| Hardcode the jitter hysteresis band (10–15px) rather than making it configurable | One fewer slider | Band interacts with fade radius: 10px band on a 20px zone is 50% dead-band; acceptable at 200px zone. May need tuning for different fade radius values | Acceptable for v4.0; note as a future calibration point |
| Reuse the 75ms `GhostModeController` timer for proximity polling | No new timer; existing proven loop | `GhostModeController` now does two things (proximity + click-through management); consider a `ProximityFadeController` that owns proximity and delegates to `GhostModeController` only for click-through | Acceptable if proximity logic is kept small; refactor if it grows |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `GhostModeController.Restored` event | Keeping `this.Opacity = _windowOpacity` in the handler after adding fade | Change handler to initiate a fade-in; `GhostModeController` signals cursor exit, proximity fade drives the restore animation |
| `ContrastRefreshController` `shouldSkip` predicate | Not adding proximity fade state to the skip lambda at `_contrast.Initialize(...)` | Add `|| _proximityFade.IsActive` (or `|| this.Opacity < _windowOpacity`) to the existing skip lambda |
| `AppSettings.Opacity` field | Writing instantaneous fade opacity to `_windowOpacity` or serializing it to settings.json | `AppSettings.Opacity` is always the user's configured maximum; the fade tick only writes `this.Opacity`, never `_windowOpacity` |
| `GetWindowRect` vs. `Window.Left/Top` | Using WPF DIPs for the window bounds in the proximity distance calculation | Use `GetWindowRect` (physical pixels) for bounds; `GetCursorPos` (physical pixels) for cursor; never mix coordinate spaces |
| Opacity slider in SettingsWindow | Slider change fires `OpacityChanged` event → `SetOpacity()` → writes `_windowOpacity` and `this.Opacity`; if fade is active, the `this.Opacity` assignment creates a visible jump | Slider always writes `_windowOpacity`; let the next fade tick correct `this.Opacity` to the right fade-adjusted value. Or: if not currently fading, write `this.Opacity` immediately as well |
| `_isDragging` flag | Not checking it in the proximity fade tick handler | Add `if (_isDragging) { this.Opacity = _windowOpacity; return; }` at the top of the fade tick handler, same pattern as contrast sampler |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Calling `SetWindowPos(SWP_FRAMECHANGED)` on every 75ms tick during fade | Per-tick compositor round-trip; subtle jitter | `SWP_FRAMECHANGED` is only needed when changing `WS_EX_TRANSPARENT`; never call it during opacity-only ticks | Immediately visible as compositor stutter; always avoid |
| Calling `SaveSettings()` inside the fade tick handler | settings.json written at 13 Hz; excessive I/O | Save only on state transitions (fade start / ghost activation / ghost restore); never during continuous fade | Immediately visible as high disk I/O during mouse proximity |
| Using `Math.Sqrt` for Euclidean distance on every 75ms tick | Negligible on modern CPUs at 75ms interval | Use squared-distance comparison to avoid `sqrt` for boundary checks; only compute true distance if displayed in UI | Not a real bottleneck at 75ms; only matters if interval drops to <10ms |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Fade zone larger than screen / 2 (extreme radius, e.g. 800px) | Widget is always fading; cursor is always within the zone; widget is never fully visible | Add a `SettingsService.Validate()` guard clamping `FadeRadiusPx` to a sane max (e.g., 300px); slider max in Settings UI enforces the same limit |
| Fade enabled when Ghost Mode is disabled | User disables Ghost Mode expecting the widget to always be visible; proximity fade still fades it out | Proximity fade must be gated on `_ghostMode.IsEnabled`; when ghost mode is off, proximity fade is inoperative regardless of the fade radius setting |
| Fade-in speed different from fade-out speed | Widget retreats quickly but returns slowly (or vice versa) — asymmetric feel | Use the same distance-to-opacity function for both directions; hysteresis band introduces intentional asymmetry only at the outer boundary, not in the fade rate |
| No indication in Settings that fade is currently active | User does not understand why widget is semi-transparent when cursor is nearby | Label the slider with "0 = disabled"; the non-zero value is the affordance; a tooltip or description suffices — no status indicator needed |

---

## "Looks Done But Isn't" Checklist

- [ ] **Configured opacity preserved:** After a full proximity fade cycle (cursor approaches, widget goes ghost, cursor retreats, widget restores), verify `settings.json` still contains the user's original `Opacity` value — not 0.0 or any intermediate fade value.
- [ ] **WS_EX_TRANSPARENT timing:** Verify via Spy++ (or equivalent) that `WS_EX_TRANSPARENT` is present in the window extended style only when `this.Opacity == 0.0` — never at 0.05, 0.1, etc.
- [ ] **Drag immunity:** Verify full-opacity widget is maintained during drag. Slowly drag the widget toward a screen edge or another window; opacity must not change during the drag.
- [ ] **Ctrl+Alt suppression:** Verify holding Ctrl+Alt while moving toward the widget suppresses all proximity fade — widget stays at `_windowOpacity`, backdrop and hover behaviors activate normally.
- [ ] **Auto-contrast stability:** Enable Auto-Contrast, position the widget over an app window, then approach with the mouse. Verify no text color oscillation during the fade-out or fade-in transitions.
- [ ] **Hysteresis at outer boundary:** Hold the cursor stationary at approximately the fade start distance. Verify the widget's opacity is stable for at least 5 seconds with no cursor movement.
- [ ] **Ghost mode disabled:** Disable Ghost Mode via tray. Verify the widget remains fully opaque as the cursor approaches, regardless of the fade radius setting.
- [ ] **High-DPI correctness:** On a 150% DPI display, verify the fade starts at the correct physical distance (configured radius in physical pixels, not DIPs). The fade zone should look the same size as on a 100% DPI display.
- [ ] **ResetToDefaults:** After Reset to Defaults, verify `FadeRadiusPx` returns to the default value in both the Settings slider and `settings.json`.
- [ ] **Validate() guard:** Manually edit `settings.json` to set `FadeRadiusPx` to -50 or 9999. Verify the app loads and clamps to the valid range without crashing.
- [ ] **Symmetric fade:** Verify the fade-in (cursor retreating) feels visually symmetric with the fade-out (cursor approaching). No instant pop-in on exit.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Configured opacity corrupted by fade writes | LOW | Delete `settings.json` or manually edit `Opacity` back to intended value; find and fix the `_windowOpacity` write in the fade path |
| `WS_EX_TRANSPARENT` stuck on a partially-visible widget | MEDIUM | Widget is visible but click-through; user cannot interact; must kill process from Task Manager or find it in system tray and quit; fix by ensuring click-through is only applied at `Opacity == 0.0` |
| Auto-contrast feedback flicker during fade | LOW | Disable Auto-Contrast from tray; add proximity state to `shouldSkip` predicate; re-enable |
| Jitter at fade boundary | LOW | Increase hysteresis band in the distance calculation; no user-visible setting change needed |
| Drag makes widget invisible | MEDIUM | User loses the widget mid-drag; must release mouse, move cursor away, wait for restore; fix by adding `_isDragging` guard to fade tick handler |
| Extreme fade radius making widget always invisible | LOW | Open Settings > Behavior, slide Fade Zone to 0 (disabled); fix by adding `Validate()` guard |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Configured opacity corrupted (Pitfall 1) | Phase introducing fade tick handler | Confirm `_windowOpacity` is never written in fade path; confirm `settings.json` Opacity unchanged after fade cycle |
| WS_EX_TRANSPARENT before Opacity=0 (Pitfall 2) | Phase implementing fade-to-zero at boundary | Spy++ confirms `WS_EX_TRANSPARENT` only present when `Opacity == 0.0` |
| Snap restore instead of fade-in (Pitfall 3) | Phase implementing symmetric fade-in | `Restored` handler initiates fade-in; no instant opacity snap on cursor exit |
| Auto-contrast flicker during fade (Pitfall 4) | Phase introducing proximity fade — same commit | No contrast oscillation with Auto-Contrast enabled during fade transitions |
| Hover fast-refresh on proximity approach (Pitfall 5) | Phase adding proximity zone polling | `_isHoverFastRefresh` stays false during proximity approach without Ctrl+Alt |
| Jitter at outer boundary (Pitfall 6) | Phase implementing distance-to-opacity calculation | Cursor held at fade start distance for 5s; opacity stable |
| Wrong coordinate space (Pitfall 7) | Phase implementing proximity zone detection | Fade starts at correct physical distance on 150% DPI display |
| Drag makes widget invisible (Pitfall 8) | Phase implementing proximity fade tick handler | Full-opacity maintained during drag; verified by dragging near proximity zone boundary |
| ResetToDefaults missing fade radius (Pitfall 9) | Phase adding `FadeRadiusPx` to `AppSettings` | After Reset to Defaults, `FadeRadiusPx` is default in `settings.json` |
| Settings slider UX confusion (Pitfall 10) | Phase adding fade radius slider to SettingsWindow | Labels and unit (px) present; "0 = disabled" on left end; description line present |

---

## Sources

| Source | Confidence |
|--------|------------|
| `FuzzyClock.App/GhostModeController.cs` — `Activate()`, `Restored` event, 75ms polling timer, `WS_EX_TRANSPARENT` application site | HIGH |
| `FuzzyClock.App/ContrastRefreshController.cs` — `shouldSkip` predicate: `_ghostMode.IsActive \|\| _windowOpacity == 0.0 \|\| _isDragging`; 500ms sampling timer | HIGH |
| `FuzzyClock.App/MainWindow.xaml.cs` — `_windowOpacity` field; `SetOpacity()`; `Restored` handler: `this.Opacity = _windowOpacity`; `_isDragging` flag; `Window_MouseEnter` ghost activation path | HIGH |
| `FuzzyClock.App/AppSettings.cs` — `Opacity` init default 1.0; no `FadeRadiusPx` field yet | HIGH |
| `FuzzyClock.App/SettingsService.cs` — `Validate()` guard patterns; `Defaults()` structure; `ResetToDefaults()` must-update sites | HIGH |
| `.planning/PROJECT.md` decision log — `WS_EX_TRANSPARENT` invariant; synthetic MOUSELEAVE behavior; `GetCursorPos` polling rationale; `_isDragging` freeze pattern; hysteresis 4.5/5.5 for contrast (same pattern needed for distance boundary) | HIGH |
| v3.6.2 pitfall history — SHELLDLL_DefView + DWM cloaked check required to prevent contrast feedback loop; partial transparency during fade creates the same sampling risk | HIGH |

---

*Pitfalls research for: WPF proximity fade on existing ghost mode (v4.0 Proximity Ghost Mode)*
*Researched: 2026-03-27*
