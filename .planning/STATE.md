# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27 after v2.0 milestone started)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v2.0 Visual Identity — Phase 21: Custom Color Picker

## Current Position

Phase: 21 — Custom Color Picker
Plan: Not started
Status: Phase 20 complete; Phase 21 pending
Last activity: 2026-02-27 — Phase 20 complete; accent color presets (Theme submenu + ApplyTheme, 14 elements) human-verified

Progress: [████████░░] 75% (v2.0: 3/4 phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 21 (v1.0 through v1.9)
- Average duration: 2.8 min
- Total execution time: 56 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Phrase Engine | 2 | 4 min | 2 min |
| 2. Window Shell | 3 | 3 min | 1 min |
| 3. Integration | 2 | 7 min | 3.5 min |
| 4. Settings + Drag | 2 | 12 min | 6 min |
| 5. Font Size | 1 | 2 min | 2 min |
| 6. AppSettings Migration | 1 | 2 min | 2 min |
| 7. Stats Data Layer | 1 | 3 min | 3 min |
| 8. XAML Layout and Stats Display | 2 | 8 min | 4 min |
| 9. Controls Persistence and Edge Cases | 1 | 15 min | 15 min |
| 11. PAG Stat Row | 2 | 3 min | 1.5 min |
| 12. Hover Fast-Refresh | 1 | 2 min | 2 min |
| 13. Dial Mode | 2 | 8 min | 4 min |
| 14. Hover Backdrop + Drag Pause | 1 | 5 min | 5 min |
| 15. Unconditional Hover Backdrop | 1 | 5 min | 5 min |
| 16. Dial Face Decorations | 2 | 4 min | 2 min |
| 17. Context-Aware Font Size Menu | 2 | 2 min | 1 min |

| 18. AppSettings Schema Extension | 1 | 1 min | 1 min |
| 19. Window Opacity | 2 | 2 min | 1 min |
| 20. Accent Color Presets | 2 | 2 min | 1 min |

**Recent Trend:**
- Last 5 plans: 19-01 (2 min), 19-02 (0 min), 20-01 (2 min), 20-02 (0 min)
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions relevant to current state:

- Phase 16 DIAL-09 pattern: MenuDialFace.Visibility controlled from ContextMenu_Opened and SetDialMode in code-behind
- Phase 17 MENU-01 pattern: MenuFontSize.Visibility = inverse of DIAL-09 (dialMode ? Collapsed : Visible); synced in same two hooks
- ApplySettings() never touches menu item visibility — menus only exist post-Show(); font size preference (_currentFontSize) unchanged by mode switches
- Phase 18 complete: AccentColor as hex string ("#FFFFFFFF", 8-digit AARRGGBB) and Opacity (double, 1.0) added to AppSettings; Defaults() and Load() guards updated — schema locked for Phases 19-21
- v2.0 AppSettings additions: AccentColor as hex string (not Color struct — System.Text.Json cannot natively serialize WPF Color); Opacity as double with init default 1.0 (C# type default 0.0 would make widget invisible on upgrade)
- v2.0 ordering constraint: ApplySettings() sets _accentColor only; ContentRendered calls ApplyTheme() after InitDialDecorations() — calling ApplyTheme() before decoration lists are populated silently skips ticks/dots/numbers
- v2.0 brush pattern: always use new SolidColorBrush(_accentColor) — never mutate Brushes.* static instances (they are frozen and throw on mutation)
- v2.0 opacity scroll: use PreviewMouseWheel (not MouseWheel) on frameless transparent windows — MouseWheel is silently dropped without prior keyboard focus
- v2.0 custom picker: ColorDialog requires HWND owner via WindowInteropHelper — without it the dialog renders behind Topmost=True WPF window
- [Phase 19-window-opacity]: PreviewMouseWheel (not MouseWheel) confirmed for frameless transparent windows — MouseWheel silently dropped without keyboard focus
- [Phase 19-window-opacity]: ApplySettings() uses direct field+property assignment for opacity (not SetOpacity()) to avoid redundant SaveSettings() at startup
- [Phase 20-accent-color-presets]: ApplyTheme() called in ContentRendered AFTER InitDialDecorations() — calling before produces empty foreach loops over decoration lists
- [Phase 20-accent-color-presets]: ContextMenu_Opened() derives hex from _accentColor on the fly for checkmark sync — no secondary theme-name field needed

### Pending Todos

- ~~Settle on canonical preset color hex values before Phase 20 implementation~~ (DONE: White=#FFFFFFFF, Amber=#FFFFC000, Ice Blue=#FF87CEEB, Green=#FF00C000, Hello Kitty Pink=#FFFF69B4)
- ~~Confirm whether row label text (CPU/GPU/MEM/PAG) follows accent color or stays white~~ (DONE: row labels excluded — no x:Name, stay white always)
- ~~Confirm opacity floor behavior: scroll wheel floor = 0.10, preset menu floor = 0.25; document in Phase 19 plan~~ (DONE: Phase 19-01 implements and documents both floors)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-27
Stopped at: Completed 20-accent-color-presets/20-02-PLAN.md (human-verified)
Resume file: None
Next action: /gsd:plan-phase 21
