# Phase 42: Settings Window Infrastructure - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Introduce a modeless Settings window (3 tabs: Appearance, Stats, Behavior) reachable via "Open Settings..." in the system tray. All existing widget settings are exposed in the window with live-apply (no Apply button). Tray quick toggles are retained; deep submenus are removed. New setting types (named themes, phrase styles, battery alert) are added by downstream phases into the already-present tabs.

</domain>

<decisions>
## Implementation Decisions

### Window look & feel
- Native WPF window with standard Windows chrome (title bar, close button, system fonts) — no custom styling
- Fixed size ~480×440px, non-resizable
- Centered on screen on first open; remembers last position across opens within a session (standard WPF behavior)
- Modeless — Owner=MainWindow, widget remains fully interactive while Settings is open
- Opening Settings a second time brings the existing window to front (no duplicate)

### Control choices — Appearance tab
- **Accent color**: Row of 5 clickable color swatches (matching current presets: White, Cyan, Purple, Green, Red) + [Custom...] button that opens the existing Windows Forms ColorDialog
- **Opacity**: Horizontal slider (20%–100%) with a live percentage label to the right
- **Font size**: Toggle button group: [S] [M] [L] [XL] — same four sizes as current tray menu
- **Clock style**: Toggle button group: [Phrase] [Dial]
- **Phrase style**: Dropdown with "Classic" as the only option — wired to AppSettings.PhraseStyle; Phase 45 adds Terse/Poetic/Rude to the dropdown

### Control choices — Stats tab
- **Per-row visibility**: Standard WPF CheckBox for each stat row (CPU, GPU, Memory, Paging, Battery)
- **Update interval**: Dropdown or radio buttons matching existing tray submenu options
- **Process count threshold**: Radio buttons (2% / 5% / 10%) matching existing tray submenu
- **Date visibility**: CheckBox (Show Date)
- **Date format**: Dropdown (Short / Long / Numeric / ISO) matching existing tray submenu

### Control choices — Behavior tab
- **Ghost Mode**: CheckBox
- **Auto-Contrast**: CheckBox
- **Auto-Launch at Login**: CheckBox
- Battery alert threshold placeholder reserved for Phase 44

### Tray menu pruning
- Add "Open Settings..." as the first item (separator below it)
- Remove deep submenus: Accent Color submenu, Font Size submenu, Date Format submenu, Stats per-row submenu, Update Interval submenu, Process Threshold submenu
- Retain as checkable quick toggles: Ghost Mode, Show Stats, Auto-Contrast, Auto-Launch
- Retain: Reset to Defaults, Quit
- Final tray menu structure:
  ```
  Open Settings...
  ─────────────────
  [✓] Ghost Mode
  [✓] Show Stats
  [✓] Auto-Contrast
  [✓] Auto-Launch
  ─────────────────
  Reset to Defaults
  Quit
  ```

### Tab content scope
- Phase 42 builds all three tabs fully wired (delivers SETT-01 through SETT-07)
- Downstream phases add new controls to existing tabs:
  - Phase 43 adds Theme selector to Appearance tab
  - Phase 44 adds Battery Alert threshold to Behavior tab
  - Phase 45 adds Terse/Poetic/Rude options to the already-present Phrase Style dropdown

### Live-apply wiring
- Every control change fires a SettingsChanged event (or calls a delegate) immediately
- MainWindow handles the event by calling ApplySettings() + SaveSettings()
- No Apply/OK/Cancel buttons — consistent with existing tray-menu behavior

### Claude's Discretion
- Exact WPF layout (Grid vs StackPanel vs UniformGrid per section)
- Grouping of controls within each tab (GroupBox headers or plain separators)
- Exact slider tick marks and snap behavior for opacity
- Label alignment and padding

</decisions>

<specifics>
## Specific Ideas

- Settings window tabs should mirror the tray menu's logical grouping (Appearance = visual, Stats = data rows, Behavior = interaction modes)
- The Phrase Style dropdown in Phase 42 is intentionally a no-op placeholder — just "Classic" — so Phase 45 can add options without changing the layout

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 42-settings-window-infrastructure*
*Context gathered: 2026-03-08*
