# Phase 54: Backdrop Enhancement — Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the hover backdrop to cover the full widget (all rows: phrase/dial + date + stats + uptime), add an always-visible option so the backdrop can be permanently shown without requiring hover, and make backdrop opacity user-configurable via a slider in the Settings window.

</domain>

<decisions>
## Implementation Decisions

### Coverage scope
- **BackdropBorder** — a new outer `Border` (x:Name="BackdropBorder") wraps the existing main Grid in XAML. Its Background is set from code-behind (either the backdrop color or Transparent).
- Covers all rows: phrase/dial row + date row + stats panel + uptime row — the full widget footprint.
- **ContentBorder backdrop logic is kept as-is** — ContentBorder still gets `Background = Color.FromArgb(alpha, 0, 0, 0)` on hover. This creates an intentional double-depth effect on the phrase/dial row: phrase area is slightly darker than the stats/date area beneath it, emphasizing the time at a glance.
- All existing code-behind sites that set `ContentBorder.Background` remain untouched. BackdropBorder is an additive layer.

### Always-visible behavior
- New `AppSettings.BackdropAlwaysVisible` (bool, default `false`) — preserves existing hover-only behavior for current users.
- When `true`: BackdropBorder shows the backdrop color at all times (including when mouse is not hovering). Same opacity as the hover state — one value controls both.
- When `false`: BackdropBorder shows backdrop only on hover (existing behavior extended to the outer border).
- Surfaced in Settings window -> Appearance tab only. No tray menu entry. Appearance tab gets a "Backdrop" section with an "Always Visible" checkbox and an opacity slider.

### Opacity control
- New `AppSettings.BackdropOpacityPercent` (int, default `35`) — replaces the hardcoded `0x59` alpha.
- Slider in Settings window -> Appearance tab -> Backdrop section. Range: 10-100, step 5.
- Alpha byte = `(int)(OpacityPercent / 100.0 * 255)` clamped to 25-255 (corresponding to 10%-100%).
- Both ContentBorder hover backdrop and BackdropBorder use this same computed alpha so the depths stay proportional.
- When the slider is moved, the backdrop updates live (if currently visible) — same immediate-feedback pattern as other Settings sliders.

### Ghost mode interaction
- Ghost mode sets window `Opacity = 0` — BackdropBorder disappears with the entire window. No special handling required; ghost mode fully wins.
- Code-behind sites that clear `ContentBorder.Background = Transparent` on mouse-leave / ghost-enter must also clear `BackdropBorder.Background = Transparent` (or preserve it if `AlwaysVisible`).
- Ctrl+Alt hover (suppresses ghost, activates normal hover): existing hover path fires normally — BackdropBorder gets the backdrop color via the same hover handler. No special case.

### Claude's Discretion
- Exact XAML layout of the new Backdrop section within the Appearance tab (checkbox + slider label + slider layout)
- Whether `BackdropOpacityPercent` uses a WPF Slider with integer snapping or a numeric TextBox alongside
- Corner radius and padding on BackdropBorder (should harmonize with ContentBorder's CornerRadius="5")

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing backdrop logic (to extend)
- `FuzzyClock.App/MainWindow.xaml.cs` — All sites that set `ContentBorder.Background`: hover enter (~line 931), hover leave (~line 950), ghost restore (~line 971), ghost cleanup path (~line 152). BackdropBorder must mirror each site.
- `FuzzyClock.App/MainWindow.xaml` — ContentBorder definition (Grid.Row="0", CornerRadius="5"); main Grid structure; all rows to be covered by BackdropBorder.

### Settings + persistence (to extend)
- `FuzzyClock.App/AppSettings.cs` — Init-property record; add `BackdropAlwaysVisible` (bool, default false) and `BackdropOpacityPercent` (int, default 35).
- `FuzzyClock.App/SettingsWindow.xaml` + `FuzzyClock.App/SettingsWindow.xaml.cs` — Appearance tab where the new Backdrop section (checkbox + slider) must be added. Follow existing tab layout patterns.

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ContentBorder` backdrop pattern: `ContentBorder.Background = new SolidColorBrush(Color.FromArgb(0x59, 0, 0, 0))` on hover enter; `Brushes.Transparent` on leave. BackdropBorder follows the identical pattern with `Color.FromArgb(computedAlpha, 0, 0, 0)`.
- `AppSettings` init-property record: add two new properties with defaults; JSON forward/backward compat is automatic.
- `SettingsWindow` Appearance tab: has existing slider (window opacity) — the new backdrop opacity slider follows the same Slider control pattern.

### Established Patterns
- Alpha byte: existing hardcoded `0x59` = 89 decimal = ~35% of 255. New formula: `(int)(BackdropOpacityPercent / 100.0 * 255)`.
- Settings live-update: other settings call the relevant update helper from the SettingsChanged event. BackdropOpacityPercent must do the same — if backdrop is currently visible, update `BackdropBorder.Background` immediately.
- `_isHoverFastRefresh`: the field that guards the hover path. BackdropBorder logic sits in the same hover enter/leave handlers — no new field needed.

### Integration Points
- `Window_MouseEnter` (hover enter): add `BackdropBorder.Background = new SolidColorBrush(Color.FromArgb(alpha, 0, 0, 0))` alongside ContentBorder line.
- `Window_MouseLeave` / ghost-enter cleanup: add `if (!AlwaysVisible) BackdropBorder.Background = Brushes.Transparent` alongside ContentBorder clear.
- `ContentRendered` / `ApplySettings`: set initial BackdropBorder state based on `AlwaysVisible` and current opacity.
- SettingsWindow: add Backdrop group with `AlwaysVisibleCheckBox` + `BackdropOpacitySlider` to Appearance tab.

</code_context>

<specifics>
## Specific Ideas

- Phrase row intentionally darker: double-layer is a feature. The phrase area (ContentBorder + BackdropBorder) will be noticeably darker than the stats/date area (BackdropBorder only). This reinforces visual hierarchy — clock face is the primary element.
- Default 35% backdrop opacity preserves the exact current hover appearance for existing users — zero visual regression on first upgrade.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 54-backdrop-enhancement-full-widget-coverage-and-always-visible-option-with-opacity-setting*
*Context gathered: 2026-03-18*
