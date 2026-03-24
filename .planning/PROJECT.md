# Fuzzy Clock

## What This Is

A minimal C# WPF desktop widget that displays the current time as a fuzzy, natural-English phrase — "just a little after 11", "almost noon", "quarter past 3" — or as a minimal analog dial with hour and minute hands (no face, no numbers), or as a Nixie tube clock face. It floats on the desktop as a transparent, frameless, always-on-top overlay with no background box. The phrase/dial refreshes every 10 seconds. Below the phrase or dial, an optional stats panel shows live CPU, GPU, memory, paging file, and battery charge as horizontal bars with percentage text (battery shows `⚡ 87%` when AC-connected, `N/A` on desktops/VMs), with a user-selectable update rate (1s/3s/10s). Below the phrase or dial, an optional date line shows the current date in one of four formats (Short/Long/Numeric/ISO) in a muted accent color. Below the stats panel, an optional uptime row shows system uptime and rolling 1m/5m/15m CPU load averages in a compact single line (`up 5h 3m   0.52  0.47  0.43`). Users can choose from five accent color presets (White, Amber, Ice Blue, Green, Hello Kitty Pink) or pick any custom color via the system color picker; the accent color applies consistently to phrase text, dial hands/decorations, stats bars/text, and uptime text. Widget opacity is adjustable via a right-click menu (25%/50%/75%/100%) or mouse scroll wheel (10% steps, 10% floor). The widget features ghost mode: hovering the mouse over the widget automatically hides it (Opacity=0, click-through via WS_EX_TRANSPARENT) so it never blocks the desktop; moving the mouse away restores it. Holding left Ctrl+Alt while hovering suppresses ghost mode and activates normal hover behaviors instead (semi-transparent backdrop, fast stats refresh, drag, right-click, scroll). Ghost mode can be disabled via the system tray "Ghost Mode" toggle. An optional auto-contrast mode samples the screen color under the widget footprint every 500ms and automatically switches all text to black or white (WCAG-based) when the configured accent color no longer provides sufficient contrast; it restores to the accent color when contrast is sufficient again. A system tray icon provides quick toggles (Auto-Launch, Ghost Mode, Auto-Contrast), Reset to Defaults, Quit, and "Open Settings..." which opens a modeless three-tab Settings window (Appearance / Stats / Behavior) for full configuration. Five built-in named themes (Minimal, Neon, Ghost, Warm, Ocean) apply accent color, opacity, font size, clock style, and stats visibility atomically. The English phrase vocabulary supports four styles: Classic, Terse (compact British forms like "half three"), Poetic (evocative like "the small hours"), and Rude (blunt like "nearly four, move it"). Phrases automatically display in French, Spanish, German, Japanese, or Polish based on the Windows UI language; unsupported locales fall back to English. When the battery drops below a configurable threshold while unplugged, the battery stat row shifts to red as a visual alert. The widget auto-launches at Windows login when enabled. Widget position is remembered per monitor — switching monitors restores the last-used position on each display. All preferences are saved across restarts.

## Core Value

The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## Current Milestone: v3.9 LCD Clock + Japanese Styles

**Goal:** Add a 7-segment LCD clock as the fourth clock style and add Terse/Poetic/Rude phrase personality variants for Japanese locale.

**Target features:**
- LCD clock face: WPF-drawn 7-segment digits, accent-colored, 12-hour or 24-hour switchable, blinking colon, optional toggleable seconds row
- Japanese Terse: short, clipped casual phrasing
- Japanese Poetic: atmospheric imagery-based phrasing
- Japanese Rude: brusque / impatient phrasing

## Current State

**v3.9 in progress: Phase 62 complete** — ResolveLocaleKey helper consolidates all 3 routing sites; bare "ja" key removed; SettingsWindow combo enabled for explicit Japanese; 318 tests pass; Phase 63 (SettingsWindow LCD UI) next

**v3.8 shipped: 2026-03-23** — Dial face checkboxes (Hour Ticks, Minute Dots, Hour Numbers) in Settings > Appearance with Dial-only visibility gating; `PopulateControls` + `_suppressEvents` guard pattern; 299 tests pass (262 Core + 37 App)

**v3.7 shipped: 2026-03-23** — Nixie tube clock re-introduced as a selectable clock style; `ClockType` enum replaces `DialMode bool`; SettingsWindow 3-button Clock Style rail (Phrase/Dial/Nixie); `BackdropBorder` is sole hover backdrop; 0 build errors, 299 tests pass (262 Core + 37 App)

**v3.6.2 shipped: 2026-03-19** — `HasAppWindowBeneath` extended with `SHELLDLL_DefView` shell exclusion and `DwmGetWindowAttribute(DWMWA_CLOAKED)` check; AutoContrast and BackdropAlwaysVisible stable over desktops with icons and Windows 11 shell panels

**v3.5 shipped: 2026-03-18** — Per-user Inno Setup installer with CI release pipeline, phrase wrapping (midpoint/natural pause), dark-mode Settings window redesign, edge snapping, single-instance IPC

**v3.2 shipped: 2026-03-09** — Settings window (3-tab), 5 named themes, battery low alert, English phrase personalities (Terse/Poetic/Rude), multilingual phrases (fr/es/de/ja/pl)

299 MSTest tests (262 Core + 37 App) passing. CI gate enforced.

## Requirements

### Validated

- ✓ Displays current time as a fuzzy/poetic English phrase (e.g. "just a little after 11", "almost noon", "12 o'clock", "quarter past 3") — v1.0
- ✓ Phrase updates on every 5-minute boundary — v1.0
- ✓ Window is frameless and transparent — text floats directly on the desktop — v1.0
- ✓ Window is always-on-top — v1.0
- ✓ Written in C# (WPF) — v1.0
- ✓ User can drag widget to any position on the desktop (WIN-04) — v1.1
- ✓ Widget position restored on startup, clamped if off-screen (WIN-05) — v1.1
- ✓ User can change font size (16/24/32pt) via right-click menu; current size shown as checked (DISP-05) — v1.1
- ✓ Font size selection persists across restarts (DISP-06) — v1.1
- ✓ Stats panel shows CPU, GPU, and memory usage below the time phrase (STAT-01) — v1.2
- ✓ Each stat displays as a horizontal bar + percentage text (STAT-02) — v1.2
- ✓ Update interval (1s / 3s / 10s) is user-selectable via right-click Stats submenu (STAT-03) — v1.2
- ✓ Stats panel visibility is user-toggleable via right-click Stats submenu (STAT-04) — v1.2
- ✓ Stats visibility and update interval persist to settings.json and restore on launch (STAT-05) — v1.2
- ✓ User can toggle CPU row visibility via right-click Stats submenu; checkmark reflects current state (STAT-06) — v1.3
- ✓ User can toggle GPU row visibility via right-click Stats submenu; checkmark reflects current state (STAT-07) — v1.3
- ✓ User can toggle MEM row visibility via right-click Stats submenu; checkmark reflects current state (STAT-08) — v1.3
- ✓ Hiding all three stat rows auto-collapses the stats panel (one-way trigger) (STAT-09) — v1.3
- ✓ Individual stat row visibility (CPU/GPU/MEM) persists to settings.json and restores on launch (STAT-10) — v1.3
- ✓ PAG row appears in stats panel below MEM row, showing % paging file usage as horizontal bar + percentage text (STAT-11) — v1.4
- ✓ User can toggle PAG row visibility via right-click Stats submenu; checkmark reflects actual PAG row state each time menu opens (STAT-12) — v1.4
- ✓ Hiding all four stat rows (CPU/GPU/MEM/PAG) auto-collapses the stats panel (STAT-13) — v1.4
- ✓ PAG row visibility persists to settings.json and restores on launch (STAT-14) — v1.4
- ✓ When paging file is disabled or unavailable, PAG row shows "N/A" with no exception thrown (STAT-15) — v1.4
- ✓ When the mouse enters the widget and the stats panel is visible, the stats refresh rate switches to 0.5s (HVRF-01) — v1.5
- ✓ When the mouse leaves the widget, the stats refresh rate returns to the user's configured interval (1s/3s/10s) (HVRF-02) — v1.5
- ✓ When the stats panel is hidden, mouse hover has no effect on the stats timer (HVRF-03) — v1.5
- ✓ User can switch between phrase mode and dial mode via the right-click context menu (DIAL-01) — v1.6
- ✓ In dial mode, the widget displays hour and minute hands on a transparent background (no face, no circle, no numbers — hands only) (DIAL-02) — v1.6
- ✓ Hands update every minute to accurately reflect the current hour and minute position (DIAL-03) — v1.6
- ✓ The stats panel remains visible below the dial when stats are enabled (DIAL-04) — v1.6
- ✓ The selected clock mode (phrase/dial) persists to settings.json and restores on launch (DIAL-05) — v1.6

### Validated (v1.7)

- ✓ BACK-01: When the stats panel is visible and the mouse is over the widget, a semi-transparent backdrop (~35% black alpha) appears behind the widget — v1.7
- ✓ BACK-02: When the mouse leaves the widget, the backdrop returns to fully transparent — v1.7
- ✓ BACK-03: When the stats panel is hidden, the widget background is always fully transparent regardless of hover state — v1.7 (superseded in v1.8 by BACK-04)
- ✓ DRAG-01: While dragging the widget, stats updates pause; they resume immediately when the drag completes — v1.7

### Validated (v1.8)

- ✓ BACK-04: Widget background becomes semi-transparent (~35% black) on hover regardless of stats panel visibility; always clears on mouse leave — v1.8
- ✓ DIAL-06: In dial mode, user can toggle hour tick marks (12 short lines at hour positions) via right-click submenu; persisted — v1.8
- ✓ DIAL-07: In dial mode, user can toggle minute marks (60 small dots at minute positions) via right-click submenu; persisted — v1.8
- ✓ DIAL-08: In dial mode, user can toggle hour number labels (1–12) at hour positions via right-click submenu; persisted — v1.8
- ✓ DIAL-09: Dial face decoration menu options are hidden when in phrase mode; visible only when dial mode is active — v1.8

### Validated (v1.9)

- ✓ MENU-01: Font Size submenu is hidden from the context menu when dial mode is active; reappears when switching to phrase mode — v1.9

### Validated (v2.0)

- ✓ THEME-01: User can select from preset color themes (White, Amber, Ice Blue, Green, Hello Kitty Pink) via right-click Theme submenu; current preset shown as checked — v2.0
- ✓ THEME-02: User can set a custom accent color via color picker dialog ("Custom..." entry in Theme submenu) — v2.0
- ✓ THEME-03: Active accent color applied consistently to phrase text, dial hands/decorations, and stats bars/text (14 elements) — v2.0
- ✓ THEME-04: Active theme (preset name or custom hex color) persists to settings.json and restores on launch — v2.0
- ✓ OPAC-01: User can set widget opacity to 25%/50%/75%/100% via right-click Opacity submenu; current level shown as checked — v2.0
- ✓ OPAC-02: User can adjust widget opacity in 10% increments using mouse scroll wheel (10% floor) — v2.0
- ✓ OPAC-03: Opacity applies to the entire widget window — v2.0
- ✓ OPAC-04: Opacity setting persists to settings.json and restores on launch — v2.0

### Validated (v2.1)

- ✓ UPT-01: Widget displays system uptime in `up Xd Xh Xm` format (leading zero-units suppressed) and rolling CPU load averages (1m/5m/15m) as a compact single line below the stats panel, themed in accent color — v2.1
- ✓ UPT-02: User can show or hide the uptime/load line via a right-click Stats submenu toggle; visible by default; persisted to settings.json and restored on launch — v2.1

### Validated (v2.2)

- ✓ TRAY-01: Application displays a system tray icon while running — v2.2
- ✓ TRAY-02: System tray icon shows a context menu with "Reset to Defaults" and "Quit" items — v2.2
- ✓ TRAY-03: "Reset to Defaults" sets accent color to White, opacity to 100%, font to 16pt, disables dial mode, and centers the widget — v2.2
- ✓ TRAY-04: "Reset to Defaults" saves the reset state to settings.json immediately — v2.2
- ✓ TRAY-05: "Quit" exits the application cleanly — v2.2
- ✓ TRAY-06: System tray icon is removed from the tray when the application exits — v2.2

### Validated (v2.3)

- ✓ CENTER-01: In phrase mode, the phrase text is centered horizontally within the widget content area — v2.3
- ✓ GHOST-01: When mouse enters widget (left Ctrl+Alt not held), widget becomes Opacity=0 and click-through — v2.3
- ✓ GHOST-02: When mouse leaves widget area, widget restores configured opacity and stops being click-through — v2.3
- ✓ GHOST-03: While ghost mode is active, hover backdrop and hover fast-refresh do not activate — v2.3
- ✓ CTRLALT-01: When user holds left Ctrl+Alt while hovering, ghost mode is suppressed — widget stays visible and interactive — v2.3
- ✓ CTRLALT-02: In Ctrl+Alt mode, existing hover behaviors activate normally (backdrop, fast-refresh, drag, right-click, scroll) — v2.3

### Validated (v2.5)

- ✓ EXTRACT-01: UptimeFormatter.Format(TimeSpan) extracted from MainWindow into FuzzyClock.Core; MainWindow calls it with no behavior change — v2.5
- ✓ EXTRACT-02: DialGeometry.GetHourAngleDegrees/GetMinuteAngleDegrees extracted from MainWindow into FuzzyClock.Core; MainWindow calls both with no behavior change — v2.5
- ✓ UTEST-01: UptimeFormatter tests cover sub-hour, exactly-1h, hours-only, exactly-1d, days+hours+minutes — 7 test cases, all passing — v2.5
- ✓ UTEST-02: DialGeometry tests cover 12:00, 3:00, 6:00, 9:00, 3:15 interpolation, 12:30 wrap — 6 test cases, all passing — v2.5
- ✓ TINFRA-01: FuzzyClock.App.Tests (net10.0-windows, MSTest 4.0.1, UseWPF=true) added to FuzzyClock.slnx; runs via `dotnet test` with zero failures — v2.5
- ✓ STEST-01: AppSettings JSON round-trip test passes (serialize → deserialize → all 17 fields match) — v2.5
- ✓ STEST-02: AppSettings deserialization with UptimeVisible absent returns true (init default, not C# false default) — v2.5
- ✓ STEST-03: SettingsService.Validate() corrects StatsIntervalSeconds=0 to 3 — v2.5
- ✓ STEST-04: SettingsService.Validate() corrects Opacity=0.0 to 1.0 — v2.5
- ✓ STEST-05: SettingsService.Validate() corrects null/whitespace AccentColor to "#FFFFFFFF" — v2.5
- ✓ STEST-06: SettingsService.Clamp() pure overload clamps Left/Top out-of-bounds into screen bounds — v2.5
- ✓ STEST-07: SettingsService.Clamp() pure overload leaves already-in-bounds Left/Top unchanged — v2.5
- ✓ CI-01: GitHub Actions release.yml runs dotnet test before dotnet publish; no continue-on-error; all 73 tests gate the release artifact — v2.5

### Validated (v2.6)

- ✓ STRT-01: User can toggle auto-launch at Windows login via tray context menu; toggle state shown as checkmark — v2.6
- ✓ STRT-02: Auto-launch setting persists to settings.json and restores on launch — v2.6
- ✓ STRT-03: When auto-launch is enabled, HKCU\...\CurrentVersion\Run registry entry is written; when disabled, entry is removed — v2.6
- ✓ MON-01: Widget tracks and remembers the last-used position for each connected monitor using monitor identity as key — v2.6
- ✓ MON-02: On startup, widget restores to the position last used on the currently connected monitor — v2.6
- ✓ MON-03: If the last-used monitor is not connected at startup, widget centers on the primary screen — v2.6

### Validated (v2.7)

- ✓ CONTRAST-01: User can enable/disable auto-contrast mode via tray menu; off by default; persisted to settings.json — v2.7
- ✓ CONTRAST-02: When enabled, widget samples screen color under its footprint at each timer tick — v2.7
- ✓ CONTRAST-03: When accent color vs background contrast is insufficient (WCAG threshold), widget elements switch to whichever of black or white gives better contrast against the background — v2.7
- ✓ CONTRAST-04: Widget elements restore to configured accent color when background contrast is sufficient again — v2.7

### Validated (v2.8)

- ✓ PROC-01: Uptime line shows count of active processes (pct ≥ 5.0% CPU) appended as `{N}p` at end of line (e.g. `up 5h 3m   0.52  0.47  0.43  142p`); updates on every stats tick — v2.8
- ✓ DOCS-01: README accurately describes all current app features (ghost mode, auto-contrast, tray controls, accent colors, opacity, uptime row with `142p`, auto-launch, per-monitor position memory) — v2.8
- ✓ DOCS-02: README usage section covers right-click/tray context menu, mouse interactions (drag, scroll wheel), and system tray controls in dedicated subsections — v2.8

### Validated (v2.9)

- ✓ THRESH-01: User can set the active process count threshold (2% / 5% / 10% CPU) via tray Stats submenu; current selection shown as checkmark; default 5% — v2.9
- ✓ THRESH-02: Threshold persists to settings.json and restores on launch; UpdateUptimeDisplay() uses the persisted value — v2.9

### Validated (v3.0)

- ✓ DATE-01: Date line below clock phrase or dial in muted accent color (55% alpha); toggleable via Show Date tray toggle; persisted — v3.0
- ✓ DATE-02: Four date format options (Short/Long/Numeric/ISO) selectable via Date Format tray submenu; persisted — v3.0

### Validated (v3.1)

- ✓ BATT-01: Stats panel shows battery charge % as a horizontal bar + percentage text below PAG row — v3.1
- ✓ BATT-02: Battery row shows "N/A" (no exception) when no battery is present (e.g. desktop) — v3.1
- ✓ BATT-03: User can toggle battery row visibility via tray Stats submenu; checkmark reflects state — v3.1
- ✓ BATT-04: Hiding all five stat rows (CPU/GPU/MEM/PAG/BATT) auto-collapses the stats panel — v3.1
- ✓ BATT-05: Battery row visibility persists to settings.json and restores on launch; default true — v3.1
- ✓ UTEST-03: DateFormatter logic extracted from MainWindow into FuzzyClock.Core as a pure static class with 6 unit tests covering all 4 formats — v3.1
- ✓ STEST-08: AppSettings JSON round-trip includes DateVisible and DateFormat fields; absent-field tests verify init defaults — v3.1
- ✓ DOCS-03: README documents v3.0 date display (Show Date toggle, 4 formats with corrected examples) and battery row (charge %, AC indicator, N/A on desktops) — v3.1
- ✓ CLEAN-01: DateFormatter extracted to FuzzyClock.Core; FormatDate private method deleted from MainWindow; both call sites delegate to DateFormatter.Format — v3.1

### Validated (v3.2)

- ✓ SETT-01: User can open a Settings window via "Open Settings..." in the system tray menu — v3.2
- ✓ SETT-02: Settings window has three tabs — Appearance, Stats, and Behavior — v3.2
- ✓ SETT-03: Appearance tab exposes accent color, opacity, font size, clock style, phrase style, and theme selector — v3.2
- ✓ SETT-04: Stats tab exposes per-row visibility toggles, update interval, process count threshold, and date format — v3.2
- ✓ SETT-05: Behavior tab exposes ghost mode, auto-contrast, auto-launch, and battery alert threshold — v3.2
- ✓ SETT-06: All settings changes apply immediately to the live widget (modeless; no Apply button) — v3.2
- ✓ SETT-07: Tray menu retains quick toggles (Ghost Mode, Stats, Auto-Contrast, Auto-Launch) alongside "Open Settings..." — v3.2
- ✓ THM-01: Settings window Appearance tab offers 5 named built-in themes — v3.2
- ✓ THM-02: Applying a theme atomically sets accent color, opacity, font size, clock style, and stats panel visibility — v3.2
- ✓ THM-03: Active theme name persists to settings.json and restores on launch — v3.2
- ✓ STYLE-01: User can select Terse style ("half three", "quarter past") in Settings window — v3.2
- ✓ STYLE-02: User can select Poetic style ("the small hours", "the day grows long") in Settings window — v3.2
- ✓ STYLE-03: User can select Rude style ("nearly four, move it") in Settings window — v3.2
- ✓ STYLE-04: Selected phrase style persists to settings.json and restores on launch — v3.2
- ✓ LANG-01: Widget auto-detects `CultureInfo.CurrentUICulture` and displays phrases in matching language — v3.2
- ✓ LANG-02: Supported languages: English (default fallback), French, Spanish, German, Japanese, Polish — v3.2
- ✓ LANG-03: Each supported language covers all 5-minute time buckets (verified by exhaustive tests) — v3.2
- ✓ LANG-04: Unsupported locales display phrases in English — v3.2
- ✓ ALERT-01: Battery row accent shifts to red when battery below threshold and not plugged in — v3.2
- ✓ ALERT-02: Battery row returns to normal accent color when battery rises above threshold or is plugged in — v3.2
- ✓ ALERT-03: Battery alert threshold configurable in Settings Behavior tab (10% / 15% / 20%, default 20%) — v3.2

### Validated (v3.4–v3.5)

- ✓ SETR-01: Settings window uses dark background and light foreground text matching the widget's minimal aesthetic — v3.5
- ✓ SETR-02: CheckBox, RadioButton, ComboBox, Button, and Slider controls have consistent dark-mode styling — v3.5
- ✓ SETR-03: Section groups have adequate whitespace; controls are not cramped — v3.5
- ✓ SETR-04: Settings window styling is scoped to SettingsWindow only — no style leakage to MainWindow — v3.5
- ✓ FIX-01: ResetToDefaults() also resets phrase style to Classic and phrase locale to "auto" — v3.5
- ✓ FIX-02: Second launch of the app brings the existing window to front instead of silently exiting — v3.5
- ✓ FIX-03: AbandonedMutexException is handled so the app can restart after a crash without being stuck — v3.5
- ✓ SNAP-01: Widget snaps to screen edges when drag ends within 8px of any edge — v3.5
- ✓ SNAP-02: Edge snap respects the working area (excludes taskbar) — v3.5
- ✓ SNAP-03: Edge snap fires post-DragMove() only — not during drag, not on phrase resize — v3.5
- ✓ INST-01: FuzzyClockSetup.exe installs per-user to %LOCALAPPDATA%\Programs\FuzzyClock\ with no UAC prompt — v3.5
- ✓ INST-02: Running the installer over an existing installation upgrades in-place without data loss — v3.5
- ✓ INST-03: Installer creates a Start Menu shortcut — v3.5
- ✓ INST-04: Installer registers in Add/Remove Programs with a clean uninstall path — v3.5
- ✓ INST-05: Uninstall removes app files but preserves settings.json — v3.5
- ✓ INST-06: If auto-launch was enabled, installer updates the HKCU\...\Run entry to the new install path — v3.5
- ✓ INST-07: CI workflow produces FuzzyClock-X.Y.Z.exe, FuzzyClockSetup-X.Y.Z.exe, and checksums.txt as a draft GitHub Release when a version tag is pushed — v3.5
- ✓ INST-08: Installer prompts the user to close a running FuzzyClock instance before proceeding — v3.5
- ✓ INST-09: Installer finish page offers "Launch FuzzyClock" checkbox; uninstaller offers optional settings.json removal — v3.5
- ✓ DOCS-04: README documents v3.2–v3.5 features — v3.5
- ✓ WRAP-01: In phrase mode, if rendered phrase text width exceeds stats panel width + 10%, text splits across two lines — v3.5
- ✓ WRAP-02: User can choose split style (Nearest Midpoint / Natural Pause) in Settings; default is Nearest Midpoint — v3.5
- ✓ WRAP-03: Phrase wrap split style persists to settings.json and restores on launch — v3.5
- ✓ BDROP-01: On hover, semi-transparent backdrop covers full widget footprint (phrase + date + stats + uptime) — v3.5
- ✓ BDROP-02: User can enable always-visible backdrop via Settings > Appearance > Backdrop — v3.5
- ✓ BDROP-03: Backdrop opacity is configurable via slider (10–100%, step 5) in Settings > Appearance — v3.5
- ✓ POETIC-01: Every poetic phrase names the current or approaching hour naturally via {h}/{h1} templates — v3.5

### Validated (v3.6–v3.6.1)

- ✓ FIX-01: When AutoContrast is enabled and the widget sits over an empty desktop, text color remains stable — no oscillation or flicker — v3.6.1
- ✓ FIX-02: When BackdropAlwaysVisible is enabled and the widget sits over an empty desktop, backdrop and text colors remain stable — no oscillation or flicker — v3.6.1
- ✓ FIX-03: AutoContrast correctly switches text to black/white when the widget is over an application window — no regression — v3.6.1

### Validated (v3.6.2)

- ✓ FIX-04: When AutoContrast is enabled and the widget sits over an empty desktop with visible icons, text color remains stable — no oscillation or flicker (regression fix) — v3.6.2
- ✓ FIX-05: When BackdropAlwaysVisible is enabled and the widget sits over an empty desktop, backdrop and text colors remain stable — no oscillation or flicker (regression fix) — v3.6.2
- ✓ FIX-06: AutoContrast correctly switches text to black/white when the widget is over an application window — no regression from the fix — v3.6.2

### Validated (v3.7)

- ✓ NIX-01: AppSettings and SettingsSnapshot use ClockType enum instead of DialMode bool; LCD fields added — v3.7
- ✓ NIX-02: SettingsWindow exposes a 3-button Clock Style rail (Phrase/Dial/Nixie) with ClockTypeChanged event — v3.7
- ✓ NIX-03: Selecting Nixie in Settings activates the Nixie tube clock face on the widget — v3.7
- ✓ NIX-04: Pre-existing build errors resolved (GetSegmentKey on novelty providers, stale _dialMode reference); project compiles clean — v3.7
- ✓ BACK-05: ContentBorder backdrop removed; BackdropBorder is sole hover backdrop for the widget — v3.7

### Validated (v3.8)

- ✓ DIAL-10: Settings > Appearance shows Hour Ticks, Minute Dots, and Hour Numbers checkboxes; visible only when Dial clock style is active, collapsed for Phrase/Nixie — v3.8
- ✓ DIAL-11: Each checkbox reflects persisted value on open (PopulateControls); fires existing event through _suppressEvents guard on toggle; persists to settings.json and restores on restart — v3.8

### Active

- [ ] **LCD-01**: LCD clock face (7-segment, WPF-drawn, accent-colored)
- [ ] **LCD-02**: 12-hour / 24-hour toggle in Settings
- [ ] **LCD-03**: Blinking colon (every second)
- [ ] **LCD-04**: Optional seconds row, toggleable in Settings
- ✓ **JA-01**: Japanese Terse phrase style (clipped casual phrasing) — v3.9 Phase 61
- ✓ **JA-02**: Japanese Poetic phrase style (atmospheric imagery-based) — v3.9 Phase 61
- ✓ **JA-03**: Japanese Rude phrase style (brusque / impatient) — v3.9 Phase 61

### Out of Scope

- User-created/saved themes — only built-in named presets; custom theme authoring is out of scope
- 24-hour format — natural English implies 12-hour
- Click-through / no interaction — incompatible with drag (kills DragMove() event delivery)
- Arbitrary font size input — 3-step ladder is sufficient
- Font family selector — single clean font (Segoe UI Light) is part of the design
- Reset all stats to visible via Show Stats — individual toggles are independent; simpler model
- ContrastSamplerService architecture refactor — flicker fix required only a guard in `ContrastRefreshController.Tick`; no structural changes to the sampling pipeline

## Context

- Target: Windows desktop, personal use
- UI framework: WPF (best support for transparent/compositing windows on Windows)
- Phrasing style: fuzzy and poetic rather than strictly "quarter past / quarter to"
- 5-minute buckets: 12 distinct slots per hour, each maps to a phrase
- Settings: `%LOCALAPPDATA%\FuzzyClock\settings.json` — per-user non-roaming, always writable

## Constraints

- **Tech stack**: C# / WPF — Windows only
- **Simplicity**: Minimal footprint — settings window is non-modal and lightweight
- **Distribution**: Per-user Inno Setup installer (no UAC); CI-built artifacts on git tag push

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WPF over WinForms | Better transparency/compositing for frameless overlay | ✓ Validated — AllowsTransparency + WindowStyle=None delivers pixel-perfect transparent float |
| 5-minute update cadence | Phrase vocabulary aligns to 5-min buckets; avoids constant changes | ✓ Validated — 10s poll, change-only update; phrase snaps cleanly at boundaries |
| Fuzzy phrasing over exact | More interesting and readable than "11:07" | ✓ Validated — natural English feels right; noon/midnight special cases add polish |
| dotnet 10 .slnx format | SDK generates XML solution format (.slnx) instead of .sln | ✓ Validated — all build/test/run commands work identically |
| Hidden ToolWindow owner | ShowInTaskbar=False alone does not suppress Alt+Tab entry | ✓ Validated — hidden owner with WindowStyle=ToolWindow fully suppresses taskbar and Alt+Tab |
| Manual offset TextBlock shadow | GPU rendering path disabled for layered HWNDs in .NET 10; DropShadowEffect silently fails | ✓ Validated — offset dark TextBlock (X=2 Y=2) renders reliably; visually effective |
| UpdateLayout() before PositionTopRight() | SizeToContent ActualWidth is stale until layout pass runs after text change | ✓ Validated — calling UpdateLayout() first ensures correct right-anchor position |
| SetInitialPhrase before Show() | First rendered frame must show live phrase, not placeholder | ✓ Validated — no flash; phrase visible from the very first frame |
| Border backdrop #26000000 | 15% black alpha: readable on light wallpapers without obscuring desktop | ✓ Validated — semi-transparent dark backdrop works on both light and dark wallpapers |
| Left=-1 sentinel for no-saved-position | Avoids separate bool HasSavedPosition field; flows naturally through ApplySettings() | ✓ Validated — clean pattern, zero ambiguity |
| System.Text.Json (in-box .NET 10) | No NuGet cost; handles plain positional records natively | ✓ Validated — serialize/deserialize AppSettings record with zero attributes |
| VirtualScreen* over PrimaryScreenWidth | Covers all monitors including negative-offset left-of-primary monitors | ✓ Validated — correct clamping on multi-monitor setups |
| Atomic Save via temp + File.Move(overwrite:true) | Prevents corrupt settings.json on mid-write crash | ✓ Validated — atomic on same NTFS volume |
| ApplySettings() before Show() | Setting Left/Top in constructor can be silently reset by XAML parser; before Show() is safe | ✓ Validated — reliable position assignment |
| SessionEnding backup save handler | Window.Closing not raised on Windows log-off/shutdown | ✓ Validated — belt-and-suspenders save path |
| ContentRendered for startup clamp | ActualWidth/ActualHeight are 0 until first layout pass with SizeToContent=WidthAndHeight | ✓ Validated — only safe deferral point |
| _hasUserPosition snap guard | Prevents 5-min phrase-boundary phrase changes from snapping widget to top-right | ✓ Validated — set via LocationChanged; fires reliably after DragMove() |
| Re-clamp after every phrase change | SizeToContent=WidthAndHeight resizes window on phrase update; near-edge positions shift off-screen | ✓ Validated — clamp in UpdatePhraseIfChanged() else branch fixes edge case |
| ContextMenu_Opened for IsChecked sync | WPF toggles IsChecked on click when IsCheckable=True; sync in Opened avoids double-toggle | ✓ Validated — single sync point; click handlers never touch IsChecked |
| ApplyFontSize() separate from ApplySettings() | ApplyFontSize() calls UpdateLayout()+SaveSettings() which are unsafe before Show() | ✓ Validated — startup safety invariant preserved |
| AppSettings → init-property record | Positional record breaks JSON partial-deserialization on old settings.json; init-property enables safe forward/backward compat | ✓ Validated — v1.1 settings.json loads correctly with new fields defaulting |
| StatsIntervalSeconds <= 0 guard in Load() | Zero-interval DispatcherTimer throws; corrupted settings.json could write 0 | ✓ Validated — clamped to default (3) on load |
| PDH PerformanceCounter for stats | Native Windows, available in-box; PDH vs WMI: 10–50x faster for identical data | ✓ Validated — CPU/MEM reliable; GPU `engtype_3D` filter works on development machine |
| _gpuAvailable fallback | GPU Engine PDH category absent on VMs/RDP; fallback to -1 sentinel → "N/A" display | ✓ Validated — clean fallback; no exceptions in VM environments |
| StatsBarTrackWidth geometry constant | `CpuBarTrack.ActualWidth` returns 0 while StatsPanel is Collapsed; `180-35-36=109` constant is always correct | ✓ Validated — fixed zero-width bar bug; bars immediately visible on first show |
| Two independent DispatcherTimers | Phrase timer (10s, fixed) and stats timer (1s/3s/10s, configurable) must never share an interval | ✓ Validated — independent timers; interval changes don't affect phrase updates |
| SetStatsVisible() separate from ApplySettings() | SetStatsVisible() calls UpdateLayout()+Clamp() — unsafe before Show() where ActualHeight=0 | ✓ Validated — ApplySettings() sets Visibility directly; ContentRendered owns timer start |
| Stop+set+Start for interval change | Updating DispatcherTimer.Interval on running timer only takes effect after current interval expires | ✓ Validated — immediate effect on interval change |
| Click handlers read row Visibility (not IsChecked) | WPF IsCheckable auto-toggles IsChecked before handler fires; Visibility is always correct state | ✓ Validated — same pattern as MenuShowStats_Click; reliable toggle direction |
| Visibility.Collapsed (not Hidden) for hidden rows | Hidden preserves layout space in StackPanel, leaving visible vertical gap; Collapsed collapses entirely | ✓ Validated — no layout gap on hidden rows |
| Auto-collapse is one-directional | Hiding last row collapses panel; showing a row does NOT auto-show panel — user controls panel via Show Stats | ✓ Validated — simpler model; no "Reset all stats" needed |
| SetStatRowVisible() separate from ApplySettings() | SetStatRowVisible() calls UpdateLayout()+Clamp() — unsafe before Show() where ActualHeight=0 | ✓ Validated — ApplySettings() sets row Visibility directly; startup safety invariant preserved |
| 4-param PerformanceCounter for Paging File | "Paging File" is a multi-instance PDH category; 3-param (string,string,bool) constructor throws InvalidOperationException | ✓ Validated — 4-param PerformanceCounter("Paging File","% Usage","_Total",readOnly:true) works correctly |
| No priming for PAG counter | "% Usage" is a ratio counter (PERF_RAW_FRACTION), returns valid data on first NextValue() — unlike CPU/GPU rate counters | ✓ Validated — first read returns accurate value; no priming call needed |
| Double guard for no-pagefile | PerformanceCounterCategory.Exists() may return true even when pagefile is disabled (category registered but no instances); try/catch is the essential guard | ✓ Validated — -1f sentinel correctly set when counter construction fails |
| Window_MouseEnter guard 2 checks !_statsTimer.IsEnabled | Defensive: do not interfere if timer is already stopped when panel is visible | ✓ Validated — correct behavior on panel-visible-but-timer-stopped edge case |
| Window_MouseLeave omits IsEnabled guard | If panel is visible but timer somehow stopped, restoring interval and restarting is still correct | ✓ Validated — correct recovery behavior |
| Hover handlers wire in ContentRendered (not XAML) | _statsTimer must exist before handlers can fire; ContentRendered is after construction; zero XAML changes required | ✓ Validated — no null-timer risk; no XAML touch |
| _statsIntervalSeconds read-only in hover handlers | Source of truth for user's configured rate; hover must not overwrite persistence or interval selector state | ✓ Validated — interval selector checkmarks unchanged after hover cycles |
| DialCanvas in same row 0 as PhraseText | Toggling Visibility.Collapsed/Visible on both elements swaps display mode with zero row restructuring | ✓ Validated — clean toggle; no Grid row insertion or height changes needed |
| No zero-guard for DialMode bool in Load() | Bool false has no dangerous zero-equivalent (unlike StatsIntervalSeconds=0 which spikes the timer) | ✓ Validated — bool field safe without guard; consistent with other bool AppSettings fields |
| ApplySettings() sets DialCanvas Visibility directly (not via SetDialMode) | SetDialMode() calls SaveSettings() — unsafe before Show() where settings are being applied, not changed | ✓ Validated — same pre-Show() safety invariant as StatsPanel and stat rows |
| Existing 10s phrase timer drives UpdateDialDisplay() | Hands only change visually on the minute; 10s polling is sufficient — no second timer needed | ✓ Validated — dial updates correctly at sub-minute poll rate; no extra timer complexity |
| ContentBorder named Border element | Allows code-behind to set Background dynamically without XAML binding or triggers | ✓ Validated — clean code-behind pattern; no XAML binding overhead |
| Alpha 0x59 (35%) for hover backdrop | Visible on both light and dark wallpapers without obscuring desktop content | ✓ Validated — noticeable but unobtrusive on any wallpaper |
| Window_MouseLeave clears backdrop before stats guard | Prevents stale backdrop if stats hidden while mouse is hovering | ✓ Validated — unconditional clear in MouseLeave is the correct invariant |
| Backdrop assignment before StatsPanel guard in MouseEnter | Backdrop is a general hover affordance (not stats-specific); decoupled from stats visibility | ✓ Validated — BACK-04: backdrop always shows on hover regardless of stats state |
| Decoration elements created once, Visibility-toggled | Creating/removing 84 elements per toggle is expensive; create-once-toggle pattern avoids re-layout cost | ✓ Validated — instant toggle response; no layout jitter |
| Decoration defaults false | Preserves minimal Phase 13 dial appearance for existing users when upgrading from v1.6/v1.7 | ✓ Validated — no settings migration needed; new fields JSON-default safely |
| MenuDialFace.Visibility controlled from code-behind only | XAML cannot know startup DialMode state; code-behind in ContextMenu_Opened and SetDialMode always correct | ✓ Validated — submenu correctly hidden/shown on first menu open after any mode switch |
| InitDialDecorations() in ContentRendered after UpdateDialDisplay() | Elements must exist before visibility applied; hand positions set first avoids visual flash | ✓ Validated — correct ordering; no null-element errors; no initial flash |
| MenuFontSize.Visibility inverse of DIAL-09 | Font Size is phrase-mode-only; dial mode has no use for font size since DialCanvas size is fixed | ✓ Validated — MENU-01: dialMode ? Collapsed : Visible; synced in ContextMenu_Opened and SetDialMode |
| AccentColor stored as hex string, not WPF Color | System.Text.Json cannot natively serialize/deserialize WPF Color struct | ✓ Validated — 8-digit AARRGGBB hex string; ColorConverter.ConvertFromString() for round-trip; no JSON attributes needed |
| Opacity init-default 1.0, not C# default 0.0 | C# double default 0.0 would make widget invisible on first launch with old settings.json | ✓ Validated — init default 1.0; Load() guard clamps Opacity <= 0.0 to 1.0 as safety net |
| ApplyTheme() called in ContentRendered AFTER InitDialDecorations() | InitDialDecorations() populates the decoration element lists that ApplyTheme() iterates; calling before produces empty foreach loops | ✓ Validated — locked ordering constraint; enforced via comment in ContentRendered |
| Always new SolidColorBrush(_accentColor) — never mutate Brushes.* | WPF Brushes.* static instances are frozen; mutation throws InvalidOperationException | ✓ Validated — consistent pattern across all 14 accent elements |
| PreviewMouseWheel (not MouseWheel) for opacity scroll | MouseWheel is silently dropped on frameless AllowsTransparency=True windows without prior keyboard focus | ✓ Validated — PreviewMouseWheel fires reliably; 10% step opacity scroll works immediately |
| ContextMenu_Opened derives accent hex on the fly (no theme-name field) | Computing hex from _accentColor each open avoids stale theme-name state for custom colors | ✓ Validated — single source of truth; preset checkmarks correct even after custom → preset transitions |
| Win32Window HWND adapter for ColorDialog | ColorDialog.ShowDialog() without owner renders behind Topmost=True WPF window; Win32Window : IWin32Window passes WPF HWND | ✓ Validated — WindowInteropHelper(this).Handle + Win32Window adapter; dialog always in front |
| UseWindowsForms=true WinForms/WPF collision resolved with using aliases | UseWindowsForms=true introduces Application and MouseEventArgs ambiguity; using aliases at file level cleaner than fully-qualified names at every call site | ✓ Validated — using Application = System.Windows.Application; in App.xaml.cs; using MouseEventArgs alias in MainWindow.xaml.cs |
| UptimeText inside StatsPanel StackPanel (not Grid sibling) | Originally planned as Grid.Row=2 sibling for independent control; user feedback required it to hide with stats — StackPanel child provides auto-hide with independence preserved via separate toggle | ✓ Validated — hides with stats panel; separately toggleable; accent-colored identically |
| UptimeVisible init default = true | Bool JSON-deserializes as false when field absent from old settings.json; explicit `= true` required for upgrade safety from v2.0 | ✓ Validated — v2.0 upgrades see uptime row visible by default |
| Queue<float> rolling averages with interval-aware window sizing | Windows has no native load average; `ceil(windowSeconds / _statsIntervalSeconds)` adapts to 1s/3s/10s intervals without hardcoded sample counts | ✓ Validated — 1m/5m/15m windows correctly sized at all three configured intervals |
| StatsService.IsReady guards cold-start buffer push | StatsService takes ~6s to initialize; pushing zero samples during cold-start would depress the 1m average below reality for the first minute | ✓ Validated — averages populate correctly after ~6s; no zero-depressed display on launch |
| _isHoverFastRefresh gates buffer push during hover | 0.5s hover cadence runs 6× faster than the 3s default; pushing samples at hover rate would fill the 1m window in ~10s instead of 60s, corrupting the labeled time window | ✓ Validated — hover sessions do not corrupt rolling window sizes |
| Environment.TickCount64 (Int64 ms) for uptime — never TickCount (Int32) | Int32 TickCount wraps at 24.9 days, producing negative or incorrect uptime on long-running systems | ✓ Validated — Int64 supports >292 million years; no wrap concern |
| UpdateUptimeDisplay() does NOT call Refresh() | Refresh() already called inside UpdateStatsDisplay() earlier in the same tick; calling it again would double-sample and artificially depress CPU percentages | ✓ Validated — single Refresh() per tick; uptime display reads _statsService.CpuPercent set by the prior call |

| Dispatcher.Invoke for WinForms → WPF thread marshal | WinForms ToolStripMenuItem Click fires on WinForms UI thread; WPF elements require Dispatcher thread | ✓ Validated — `Dispatcher.Invoke(ResetToDefaults)` and `Dispatcher.Invoke(Shutdown)` work reliably |
| this.Closed for tray dispose (not OnClosing) | OnClosing handles stats/settings lifecycle; Closed handles tray cleanup — keeps shutdown responsibilities separated | ✓ Validated — `_trayIcon?.Dispose()` in Closed event; icon removed from notification area on any exit path |
| Programmatic 16×16 bitmap for tray icon | No .ico file required; `System.Drawing` available via `UseWindowsForms=true` already active since v2.0 | ✓ Validated — analog clock face drawn with `System.Drawing.Graphics`; no asset file dependency |
| _hasUserPosition = true after ResetToDefaults centering | Prevents phrase-change timer from snapping widget to top-right after Reset to Defaults positions it at center | ✓ Validated — consistent with the snap guard established in v1.1 |
| Ghost mode via Opacity=0 + WS_EX_TRANSPARENT | Opacity=0 hides rendering; WS_EX_TRANSPARENT passes clicks through to windows below — both needed; Opacity=0 alone still captures mouse events | ✓ Validated — widget fully invisible and non-blocking on hover; restores correctly on mouse exit |
| DispatcherTimer+GetCursorPos+GetWindowRect for ghost restore | WS_EX_TRANSPARENT causes synthetic WM_MOUSELEAVE immediately after application; WPF Mouse.GetPosition returns stale coords under transparency; TrackMouseEvent restore path unreliable; 75ms polling of pure Win32 APIs bypasses all WPF input system issues | ✓ Validated — reliable mouse-leave detection under full click-through transparency |
| VK_LMENU not VK_MENU for Ctrl+Alt modifier | VK_MENU fires on AltGr (right-Alt) on EU keyboards where right-Alt = Ctrl+Alt in hardware; VK_LMENU matches left-Alt only — zero false-positives | ✓ Validated — Ctrl+Alt modifier works without AltGr interference on EU keyboards |
| Synthetic hover-state cleanup before applying WS_EX_TRANSPARENT | Window_MouseLeave does not fire after WS_EX_TRANSPARENT is set (synthetic MOUSELEAVE has already been delivered); backdrop, timer interval, and _isHoverFastRefresh must be reset proactively | ✓ Validated — hover state always clean on ghost activation; no stale backdrop after restore |
| TextAlignment=Center (not HorizontalAlignment=Center) for phrase centering | HorizontalAlignment=Center collapses the layout box to content size — centering relative to text width is a no-op visually; TextAlignment=Center centers glyphs within the full Stretch-width layout box | ✓ Validated — phrase text visually centered in widget area at all three font sizes |
| ctrlAltHeld \|\| !_ghostModeEnabled combined condition | Both cases (modifier held, ghost disabled via tray) route to the same normal hover path; single early-return handles both without code duplication | ✓ Validated — Ctrl+Alt suppression and tray toggle both work correctly; no regression to either path |
| GhostModeEnabled init default = true | Ghost mode is the primary UX of v2.3; users must explicitly disable if unwanted; default-true ensures ghost is active on first install and on upgrade from v2.2 | ✓ Validated — ghost mode active on fresh install and settings.json upgrade |
| Extract only angle degrees from DialGeometry (not radians/canvas) | Canvas geometry and radian conversion depend on WPF layout; only the pure angle values are testable in isolation | ✓ Validated — GetHourAngleDegrees/GetMinuteAngleDegrees are fully testable; MainWindow retains radian math |
| TimeSpan component properties in UptimeFormatter (not .TotalHours etc.) | `.TotalHours` accumulates days; component properties (Days/Hours/Minutes) match the existing MainWindow if/else logic exactly | ✓ Validated — UptimeFormatter behavior identical to pre-extraction MainWindow |
| net10.0-windows + UseWPF=true in App.Tests | FuzzyClock.App is a WinExe WPF project; plain net10.0 test project cannot resolve WPF assemblies at test runner load time | ✓ Validated — dotnet test discovers and runs App.Tests correctly |
| SettingsService.Validate() extracted from Load() | Making validation a pure static method with no file I/O allows direct unit testing; Load() delegates to Validate() — tested code is the production code path | ✓ Validated — 5 Validate/Clamp test cases pass; Load() behavior identical |
| Pure Clamp() overload with explicit screen bounds | SystemParameters.VirtualScreen* requires a running WPF dispatcher context — unavailable in test runner | ✓ Validated — existing Clamp(AppSettings) delegates to pure overload; same code path tested and deployed |
| GitHub Actions default fail-fast for CI gate | No explicit configuration needed; sequential step order with no continue-on-error means a non-zero dotnet test exit code naturally prevents publish from executing | ✓ Validated — step order verified; no bypass mechanism; local suite 73/73 green |
| AutoLaunchService static helper (not instance service) | AutoLaunch has no mutable state — just read/write registry; static class avoids constructor injection plumbing for a pure Win32 operation | ✓ Validated — `AutoLaunchService.IsEnabled()`, `Enable()`, `Disable()` work without any DI wiring |
| AutoLaunchEnabled init default = false | Auto-launch is opt-in; default true would silently add startup entries for users who never asked for it on upgrade from v2.5 | ✓ Validated — registry entry absent until user explicitly enables; upgrade-safe |
| Registry sync on ApplySettings() startup | Registry state may diverge from settings.json (e.g. user deleted Run entry manually); re-applying the persisted preference on every startup self-heals without an explicit repair flow | ✓ Validated — idempotent sync; no duplicate entries; removes stale entry when false |
| Monitor key = QueryDisplayConfig friendly name, lowercase | Human-readable (e.g. "dell u2720q") survives driver updates; GDI device name (e.g. "\\\\.\\DISPLAY1") changes on reconnect and is a poor key | ✓ Validated — friendly name stable across reboots; GDI fallback for monitors that return empty name |
| Duplicate monitor name dedup via -2/-3 suffix | Two identical monitors have no distinguishing identity; suffix by Screen.AllScreens index order provides stable differentiation within a session | ✓ Validated — "dell u2720q" and "dell u2720q-2" maintained correctly across restarts |
| Lazy _keyMap cache with length invalidation | Screen.AllScreens enumeration + QueryDisplayConfig P/Invoke is expensive; re-running on every position save would be wasteful; AllScreens.Length change is the cheapest change-detection signal | ✓ Validated — map rebuilt when monitor count changes; stable for same-count configuration |
| MonitorPositions replaces flat Left/Top | Flat Left/Top cannot represent per-monitor memory without a new parallel structure; Dictionary<string, MonitorPosition> is extensible to N monitors natively | ✓ Validated — single AppSettings field handles 1–N monitors; dictionary serializes cleanly via System.Text.Json |
| JsonDocument pre-parse migration probe | Deserializing into the new AppSettings type (without Left/Top) would silently drop old position data; pre-parse detects the old schema before deserializing, enabling a one-time migration | ✓ Validated — users upgrading from v2.5 keep their saved primary-monitor position; Left=-1 (no position) correctly skipped |
| Cross-monitor drag: clear source entry | Keeping both source and destination entries would mean the widget "appears" on both monitors at next launch depending on LastActiveMonitor; clean one-entry-at-a-time model avoids ambiguity | ✓ Validated — only the destination monitor entry survives after a cross-monitor drag |
| _settings field cached in ApplySettings | SaveSettings needs to build a new AppSettings `with` expression; without the cached _settings, it must reconstruct all fields from UI state — fragile and incomplete as fields grow | ✓ Validated — _settings with { MonitorPositions = ..., LastActiveMonitor = ... } preserves all other fields cleanly |
| ContrastService internal with InternalsVisibleTo for App + Tests | Contrast logic is Core-layer only; internal keeps API surface minimal; InternalsVisibleTo is the minimal-invasive way to expose to App and test projects without making it public | ✓ Validated — two InternalsVisibleTo entries in Core.csproj (FuzzyClock + FuzzyClock.Core.Tests); zero public surface added |
| RgbColor readonly record struct (no WPF types) | ContrastService lives in FuzzyClock.Core (net10.0, no WPF); WPF System.Windows.Media.Color cannot be referenced; lightweight record struct carries R/G/B with zero dependencies | ✓ Validated — MainWindow converts at call site; Core remains WPF-free and testable without WinForms TFM |
| Hysteresis band 4.5/5.5 for contrast override | Single threshold causes flicker at boundary (background luminance oscillates around threshold); two thresholds create stable dead band; 4.5 = WCAG AA minimum, 5.5 = comfortable margin above it | ✓ Validated — no flicker observed during human verification on mixed backgrounds |
| BitBlt step-sampling capped at 200px per dimension | Widget is small; full-resolution sampling would be fast but unnecessary; 200px cap keeps loop ≤40k iterations even on large monitors, well within 500ms budget | ✓ Validated — 500ms tick shows no UI stutter; step-sampling produces accurate average background color |
| Stats label TextBlocks must have x:Name for code-behind access | Unnamed XAML elements are not reachable from code-behind; both ApplyDisplayColor and ApplyTheme must cover the same element set; bug discovered during verification when label TextBlocks lacked names | ✓ Validated — CpuLabel/GpuLabel/MemLabel/PagLabel added; color now updates consistently on contrast change |
| _isDragging flag freezes display color during drag (not the timer) | Stopping the timer during drag and restarting it on release would reset ContrastState, causing a flash on drop; freezing the display color while leaving the timer running avoids state reset | ✓ Validated — no contrast flash when dropping widget; timer catches up on next tick after drag ends |
| Three fixed threshold values (2/5/10%) with Validate() guard | Free-entry spinner adds text-input complexity with little benefit; ladder values cover meaningful range; Validate() guards against invalid persisted values (resets to 5.0) | ✓ Validated — ladder sufficient for use case; guard protects against manually edited settings.json |
| Exact double comparison for threshold checkmark sync | Same pattern as opacity preset sync; threshold values are always set from the fixed ladder (never from arithmetic), so exact comparison is reliable | ✓ Validated — SyncCheckmarks correctly checks exactly one item across all threshold transitions |
| SetProcessThreshold() calls UpdateStatsDisplay() for immediate refresh | Without the call, visual count lags by up to one timer interval after selection — discovered during audit; mirrors SetStatsInterval() timer-restart pattern | ✓ Validated — {N}p count updates immediately on threshold change; no perceptible lag |
| DateText foreground uses 55% alpha (0x8C) of accent color | Date is secondary to the time phrase; muted accent creates visual hierarchy without introducing a new color | ✓ Validated — date visible but clearly subordinate; accent color change reflects immediately |
| SetDateFormat() clears _currentDateText to force redraw on same-day format switch | Without clear, switching formats within the same day shows stale text because UpdateDateDisplay() only writes when text changes | ✓ Validated — format switch causes immediate redraw regardless of same-day state |
| Battery data via SystemInformation.PowerStatus (WinForms, synchronous) | No PerformanceCounter overhead or multi-counter setup; synchronous call returns accurate data on first call — no priming needed | ✓ Validated — battery % and IsPluggedIn reliable on laptops; -1f sentinel returned on desktops/VMs as expected |
| DateFormatter.Format(string, DateTime) accepts explicit DateTime parameter | Injecting DateTime makes tests deterministic; production callers pass DateTime.Now; no test-time sensitivity | ✓ Validated — 6 unit tests with fixed date (2026-03-07) all pass deterministically |
| Battery AC indicator as prefix (⚡ 87%) not suffix | User intention stated explicitly; prefix more natural for reading ("plugged in at 87%") | ✓ Validated — display format ⚡ 87% confirmed in code |
| Absent-field tests use minimal JSON string for ShowDate/DateFormat | Isolates init default behavior for each field independently; full round-trip test covers the happy path separately | ✓ Validated — 2 absent-field tests + 1 round-trip test provide full coverage of STEST-08 |
| IPhraseProvider interface + provider registry | PhraseEngine becomes a static facade routing through locale-keyed providers; new styles/languages are isolated add-ons with no MainWindow changes | ✓ Validated — 9 providers registered; MainWindow untouched by phrase style/language changes |
| SettingsWindow: modeless Show() + SettingsChanged event | User can interact with both widget and settings simultaneously; MainWindow remains the source of truth for all settings state | ✓ Validated — modeless window, live-apply, singleton guard prevents duplicate windows |
| SettingsSnapshot: immutable populate-on-open record | Values shown at open time; changes flow out via events, never back in; avoids two-way sync complexity | ✓ Validated — no stale state in settings window; populate-on-open is simpler than live sync |
| Phrase style selector disabled for non-English locales | Terse/Poetic/Rude are English-only for v3.2; disabling prevents confusing English style changes while non-English provider is active | ✓ Validated — CmbPhraseStyle.IsEnabled=false when non-en locale active |
| SetPhraseStyle guard: early return if CurrentLocale !starts-with "en-" | Prevents English style from overriding active non-English locale when style setting is restored at startup | ✓ Validated — locale restoration order in ApplySettings preserves correct provider |
| Ghost theme FontSize=24 (not 28) | 24pt is the closest button in Settings Appearance tab; 28pt has no corresponding button, leaving ghost theme with no highlighted selection | ✓ Validated — 24pt button correctly highlighted after Phase 47 fix |
| [DoNotParallelize] on PhraseEngineCoordinatorTests | PhraseEngine static state is shared across tests; parallel execution causes locale contamination between test methods | ✓ Validated — test isolation restored; all 224 tests pass |

| Named-pipe IPC for single-instance bring-to-front | Mutex alone only prevents second instance; named pipe allows first instance to receive activation message | ✓ Validated — WaitForConnection/Connect flow reliable; second launch activates correctly within 500ms |
| AbandonedMutexException catch on WaitOne | Crash leaves mutex in abandoned state; AbandonedMutexException on subsequent WaitOne is the only in-process signal of prior crash | ✓ Validated — crash-restart works reliably; exception caught at startup and treated as mutex acquisition |
| Inno Setup [AppMutex] detection in installer | ISCC AppMutex checks the exact same mutex name as App.xaml.cs; installer can detect a running instance and prompt to close before installing | ✓ Validated — running instance reliably detected during installer launch |
| PhraseWrapService static class in FuzzyClock.Core | Wrap logic has no instance state; static class keeps it testable without WPF; MainWindow calls it in the Inlines rendering path | ✓ Validated — midpoint and natural pause algorithms tested in isolation; MainWindow integration works |
| Inlines-based phrase rendering for wrap | Setting PhraseText.Text collapses Run/LineBreak inlines; must use PhraseText.Inlines.Clear() + Add(Run)/Add(LineBreak)/Add(Run) to inject a mid-phrase line break | ✓ Validated — both PhraseText and ShadowText rendered identically via Inlines; wrap visible correctly |
| GetSegmentKey() added to IPhraseProvider interface | Segment identity (bucket key) must be computable without calling GetPhrase(); providers return stable keys independent of random candidate selection | ✓ Validated — phrase only changes when segment key changes; ticks within same bucket preserve displayed phrase |
| BackdropBorder covering full StackPanel footprint | Original ContentBorder only covered the phrase/dial row; full-widget backdrop requires a Border element that wraps all rows (phrase+date+stats+uptime) | ✓ Validated — backdrop covers all rows; phrase row is intentionally double-layered for darker effect |
| {h}/{h1} placeholder system in PoeticPhraseProvider | HourWords[hour12] indexed array for past-half phrasing; HourWords[(hour12 % 12) + 1] for to-half; templates evaluated at GetPhrase() call time | ✓ Validated — all 48 templates contain a placeholder; hour word correct at every minute of every hour |
| GetStructuredPhrase qualifier/emphasis split for Poetic | PoeticPhraseProvider returns (qualifier: surrounding text, emphasis: hour word) so caller can apply typographic hierarchy to the time anchor | ✓ Validated — qualifier and hourWord correctly split; 8 tests cover all buckets and special cases |
| Skip sampling when only shell windows beneath (Progman/WorkerW/SysListView32) | Z-order walk detects shell-only coverage; holding `_contrastState` stable on skip preserves hysteresis state from prior valid samples — eliminates feedback oscillation | ✓ Validated — contrast stable over empty desktop; correct switching over app windows |
| Seed Z-order walk with GetWindow(widgetHwnd, GW_HWNDNEXT) | Skipping the widget's own HWND avoids self-comparison; walking downward from next Z-peer is correct for "what's below me" semantics | ✓ Validated — `HasAppWindowBeneath` correctly returns false over empty desktop, true over app windows |
| Manual RECT overlap (4 inequalities) over IntersectRect P/Invoke | Avoids adding extra P/Invoke import; four-inequality check is logically equivalent | ✓ Validated — correct overlap detection; no extra P/Invoke surface |
| _hwnd field set in Initialize via WindowInteropHelper | Window HWND is stable post-Show; caching avoids per-tick allocation and matches GhostModeController pattern | ✓ Validated — HWND stable across sampling ticks; no allocation overhead |
| SHELLDLL_DefView added as 4th shell exclusion class | Desktop icon host window present when icons visible; omitting it caused guard to return true over empty desktop with icons, reintroducing feedback loop | ✓ Validated — flicker eliminated on desktops with visible icons |
| DwmGetWindowAttribute(DWMWA_CLOAKED) for ApplicationFrameWindow | Windows 11 UWP shell panels (Start, Search, Widgets) stay in Z-order when dismissed with IsWindowVisible=true; DWM cloaked attribute (non-zero = hidden) reliably distinguishes them from real app windows; class cannot be added to exclusion list | ✓ Validated — flicker eliminated on Windows 11 with shell panels present |
| Cloaked check after non-shell-class filter | Running cloaked P/Invoke only on windows that passed the class filter keeps the hot path lean; avoids per-tick DwmGetWindowAttribute overhead for known shell classes | ✓ Validated — no UI stutter at 500ms tick rate |
| ClockType enum replaces DialMode bool | Single source of truth for clock view selection; enum is extensible to LCD and future types; bool cannot grow without migration complexity | ✓ Validated — v3.7: 3-way selection (Phrase/Dial/Nixie) works with zero migration complexity for existing users |
| BackdropBorder as sole hover backdrop | Original ContentBorder backdrop covered only the phrase row, creating a double-layer artifact on hover; BackdropBorder wraps the full widget; ContentBorder.Background must never be set in code | ✓ Validated — BACK-05: single uniform backdrop; no visual artifact on hover |
| 6 LCD/dial-decoration events declared as stubs in SettingsWindow | MainWindow subscribes to all 7 events including LCD-specific ones; declaring stubs satisfies compilation while deferring LCD UI implementation to a future milestone | ✓ Validated — compiles clean; full LCD UI wiring deferred |
| ClockTypeChanged replaces DialModeChanged | Single Action<ClockType> event covers all current and future clock modes; no separate event per mode needed | ✓ Validated — wired via single subscription in MainWindow |
| DialFaceLabel VerticalAlignment=Top (not Center) | Column 1 of the Dial Face row contains a multi-line StackPanel of checkboxes; Top alignment matches the Phrase Wrap row pattern for label/control pairs | ✓ Validated — label aligned correctly at all font sizes |
| Visibility gating in SetClockStyleButtonStates (not a separate handler) | Both the open-time populate path and the button-click path call SetClockStyleButtonStates; centralizing gating there ensures Dial Face row hides/shows correctly in all cases | ✓ Validated — row visible on Dial, collapsed on Phrase/Nixie, at open-time and on style switch |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-24 — Phase 61 complete: Japanese Phrase Providers (Terse/Poetic/Rude)*
