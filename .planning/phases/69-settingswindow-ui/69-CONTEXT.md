# Phase 69: SettingsWindow UI — Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a proximity fade radius slider to Settings > Behavior. The slider is an indented
sub-panel directly below `ChkGhostMode` (disabled when ghost mode is off), adjusts
`GhostFadeRadiusPx` live on the widget, and persists to settings.json.

**In scope:**
- XAML: indented sub-panel below `ChkGhostMode` with slider (20–200px) + px label
- `IsEnabled` gating: panel enabled/disabled when `ChkGhostMode` toggled
- `Action<int>? GhostFadeRadiusPxChanged` event on SettingsWindow
- Live wiring in MainWindow: `GhostFadeRadiusPxChanged += v => { _ghostMode.GhostFadeRadiusPx = v; SaveSettings(); }`
- `ApplySettings()`: load `_ghostMode.GhostFadeRadiusPx = s.GhostFadeRadiusPx` (currently missing)
- `SaveSettings()`: include `GhostFadeRadiusPx = _ghostMode.GhostFadeRadiusPx` in snapshot
- `RefreshControls()`: set slider value and panel IsEnabled from snapshot

**Out of scope:**
- Any other Settings tab changes
- Tray menu changes
- Phase 68 re-work

</domain>

<decisions>
## Implementation Decisions

### Slider Placement

- **D-01:** The fade radius slider lives as an **indented sub-panel directly below
  `ChkGhostMode`** — visually grouped as a child setting of Ghost Mode. Same structural
  pattern as `WrapStylePanel` which sits directly below the Phrase Wrap checkbox with
  `IsEnabled` gating. The StackPanel wrapping slider + label should have `Margin="16,4,0,8"`
  (left indent) and its `IsEnabled` property toggled in `ChkGhostMode_Changed` and in
  `RefreshControls()`.

### Event / Wiring Pattern

- **D-02:** New event `public event Action<int>? GhostFadeRadiusPxChanged;` on
  `SettingsWindow` — consistent with every other settings event (`BackdropOpacityPercentChanged`,
  etc.). Handler fires `(int)GhostFadeRadiusSlider.Value` and updates the label.

- **D-03:** MainWindow subscribes:
  ```csharp
  _settingsWindow.GhostFadeRadiusPxChanged += v =>
  {
      _ghostMode.GhostFadeRadiusPx = v;
      SaveSettings();
  };
  ```
  This is the same shape as `BackdropOpacityPercentChanged` subscription (line ~470).

### ApplySettings Gap

- **D-04:** `ApplySettings()` currently does NOT load `GhostFadeRadiusPx` into the
  controller. Phase 69 must add:
  ```csharp
  _ghostMode.GhostFadeRadiusPx = s.GhostFadeRadiusPx;
  ```
  after `_ghostMode.IsEnabled = s.GhostModeEnabled;` (line ~297).

### SaveSettings Coverage

- **D-05:** `SaveSettings()` snapshot must include:
  ```csharp
  GhostFadeRadiusPx = _ghostMode.GhostFadeRadiusPx,
  ```
  alongside the existing `GhostModeEnabled` entry.

### Claude's Discretion

- Tick granularity: use `TickFrequency="10"` `IsSnapToTickEnabled="True"` `SmallChange="10"`
  `LargeChange="20"` — 10px steps feels right for a 20–200px range (18 positions). Matches
  the spirit of BackdropOpacitySlider's 5-unit steps on a 10–100 range.
- Label text: `"Fade Radius"` header label + `"{N} px"` value label (matching
  `BackdropOpacityLabel` pattern). No description subtext needed (already implied by
  the Ghost Mode checkbox it sits under).
- x:Name conventions: `GhostFadeRadiusSlider`, `GhostFadeRadiusLabel`,
  `GhostFadeRadiusPanel` (the indented StackPanel).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — PROX-06, PROX-07 (Phase 69 requirements)

### Roadmap
- `.planning/ROADMAP.md` §Phase 69 — success criteria SC1–SC4

### SettingsWindow (primary edit targets)
- `FuzzyClock.App/SettingsWindow.xaml` — Behavior tab (lines ~507–553); `WrapStylePanel`
  indented pattern (Appearance tab); `BackdropOpacitySlider` slider pattern (Appearance tab
  ~395–403) — both are direct reference implementations
- `FuzzyClock.App/SettingsWindow.xaml.cs` — event declarations (lines ~23–54),
  `RefreshControls()` body (lines ~70–200), `BackdropOpacitySlider_ValueChanged` handler
  (~663–668), `ChkGhostMode_Changed` handler (~578–581), `WrapStylePanel.IsEnabled` gating
  pattern (~601)

### MainWindow wiring (integration points)
- `FuzzyClock.App/MainWindow.xaml.cs`:
  - Line ~297: `_ghostMode.IsEnabled = s.GhostModeEnabled` — add GhostFadeRadiusPx load here
  - Lines ~459–470: SettingsWindow event subscription block — add GhostFadeRadiusPxChanged here
  - `SaveSettings()` / `GetCurrentSettingsSnapshot()` — add GhostFadeRadiusPx field

### AppSettings (reference only — no changes needed)
- `FuzzyClock.App/AppSettings.cs` — `GhostFadeRadiusPx { get; init; } = 80` already defined

### Controller (reference only — no changes needed)
- `FuzzyClock.App/GhostModeController.cs` — `GhostFadeRadiusPx { get; set; }` property
  already exists and ready for live assignment

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BackdropOpacitySlider` (SettingsWindow.xaml ~395): slider + label row — exact pattern
  to replicate for fade radius. Same `StackPanel Orientation="Horizontal"` layout.
- `WrapStylePanel` pattern (SettingsWindow.xaml.cs ~601): `IsEnabled` toggled from checkbox
  changed handler — directly reusable for `GhostFadeRadiusPanel`.
- `BackdropOpacitySlider_ValueChanged` (~663): `(int)Slider.Value` → label → event —
  three-line handler body to copy for `GhostFadeRadiusSlider_ValueChanged`.

### Established Patterns
- All SettingsWindow events: `public event Action<T>? XChanged;` — no `event EventHandler<T>`
- `RefreshControls(SettingsSnapshot s)` is called at open and after theme/reset — slider
  init + IsEnabled state MUST be set there (not just in the constructor)
- `IsEnabled` gating is done in code-behind via `panel.IsEnabled = condition`, never
  via XAML binding

### Integration Points
- `ChkGhostMode_Changed` (line ~578): needs `GhostFadeRadiusPanel.IsEnabled = ChkGhostMode.IsChecked == true;` added
- `RefreshControls()` (line ~156): needs `GhostFadeRadiusSlider.Value = s.GhostFadeRadiusPx;`
  + `GhostFadeRadiusLabel.Text = $"{s.GhostFadeRadiusPx} px";`
  + `GhostFadeRadiusPanel.IsEnabled = s.GhostModeEnabled;`

</code_context>

<specifics>
## Specific Ideas

- Slider layout (from user's selected preview):
  ```
  [✓] Ghost Mode — auto-hide widget on hover
      Fade Radius  [====●========]  80 px

  [✓] Auto-Contrast — WCAG luminance sampling
  [✓] Auto-Launch at Login
  ```
- The indented panel uses `Margin="16,4,0,8"` for left-indent under the checkbox.
  `Orientation="Horizontal"` with `TextBlock` label + `Slider` + `TextBlock` value label.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 69-settingswindow-ui*
*Context gathered: 2026-03-27*
