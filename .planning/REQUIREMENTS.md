# Requirements: FuzzyStatsClock v3.5

**Defined:** 2026-03-17 (v3.3), updated 2026-03-18 (v3.5)
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v3.5 Requirements

### Phrase Wrapping

- [x] **WRAP-01**: In phrase mode, if the rendered phrase text width exceeds the stats panel width + 10%, the text splits across two lines
- [ ] **WRAP-02**: User can choose the split style (Nearest Midpoint / Natural Pause) in Settings; default is Nearest Midpoint
- [ ] **WRAP-03**: Phrase wrap split style persists to settings.json and restores on launch

## Carried from v3.3 (completed in v3.4)

### Settings Window Redesign

- [x] **SETR-01**: Settings window uses a dark background and light foreground text matching the widget's minimal aesthetic
- [x] **SETR-02**: CheckBox, RadioButton, ComboBox, Button, and Slider controls have consistent dark-mode styling
- [x] **SETR-03**: Section groups have adequate whitespace; controls are not cramped
- [x] **SETR-04**: Settings window styling is scoped to SettingsWindow only — no style leakage to MainWindow

### Bug Fixes

- [x] **FIX-01**: ResetToDefaults() also resets phrase style to Classic and phrase locale to "auto"
- [x] **FIX-02**: Second launch of the app brings the existing window to front instead of silently exiting
- [x] **FIX-03**: AbandonedMutexException is handled so the app can restart after a crash without being stuck

### Edge Snapping

- [x] **SNAP-01**: Widget snaps to screen edges when drag ends within 8px of any edge (left / right / top / bottom)
- [x] **SNAP-02**: Edge snap respects the working area (excludes taskbar)
- [x] **SNAP-03**: Edge snap fires post-DragMove() only — not during drag, not on phrase resize

### Installer

- [x] **INST-01**: FuzzyClockSetup.exe installs per-user to %LOCALAPPDATA%\Programs\FuzzyClock\ with no UAC prompt
- [x] **INST-02**: Running the installer over an existing installation upgrades in-place without data loss
- [x] **INST-03**: Installer creates a Start Menu shortcut
- [x] **INST-04**: Installer registers in Add/Remove Programs with a clean uninstall path
- [x] **INST-05**: Uninstall removes app files but preserves settings.json
- [x] **INST-06**: If auto-launch was enabled, installer updates the HKCU\...\Run entry to the new install path
- [x] **INST-07**: CI workflow produces `FuzzyClock-X.Y.Z.exe`, `FuzzyClockSetup-X.Y.Z.exe`, and `checksums.txt` as a draft GitHub Release when a version tag is pushed
- [x] **INST-08**: Installer prompts the user to close a running FuzzyClock instance before proceeding
- [x] **INST-09**: Installer finish page offers a "Launch FuzzyClock" checkbox; uninstaller offers optional settings.json removal

### Docs

- [ ] **DOCS-04**: README documents v3.2–v3.4 features: Settings window, named themes, phrase styles, language selection, dark mode, edge snapping, single-instance IPC, and phrase wrapping

## Future Requirements

### Distribution

- **DIST-01**: Auto-update check on launch (background, non-blocking) — deferred to v3.4+
- **DIST-02**: Code signing for SmartScreen bypass — deferred; requires certificate purchase

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-update (Velopack/Squirrel) | Requires WPF Main() refactor; disproportionate for "download new installer" upgrade model |
| MSIX packaging | Sandboxed; conflicts with %LOCALAPPDATA% settings path and registry auto-launch |
| Custom window chrome for Settings | Disproportionate effort; dark styling of standard controls is sufficient |
| Snap margin as user setting | Adds Settings complexity for near-zero demand; hardcoded constant is correct model |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETR-01 | Phase 48 | Complete |
| SETR-02 | Phase 48 | Complete |
| SETR-03 | Phase 48 | Complete |
| SETR-04 | Phase 48 | Complete |
| FIX-01 | Phase 49 | Complete |
| FIX-02 | Phase 49 | Complete |
| FIX-03 | Phase 49 | Complete |
| SNAP-01 | Phase 49 | Complete |
| SNAP-02 | Phase 49 | Complete |
| SNAP-03 | Phase 49 | Complete |
| INST-01 | Phase 50 | Complete |
| INST-02 | Phase 50 | Complete |
| INST-03 | Phase 50 | Complete |
| INST-04 | Phase 50 | Complete |
| INST-05 | Phase 50 | Complete |
| INST-06 | Phase 50 | Complete |
| INST-07 | Phase 50 | Complete |
| INST-08 | Phase 50 | Complete |
| INST-09 | Phase 50 | Complete |
| DOCS-04 | Phase 51 | Pending |
| WRAP-01 | Phase 52 | Complete |
| WRAP-02 | Phase 52 | Pending |
| WRAP-03 | Phase 52 | Pending |

**Coverage:**
- v3.5 requirements: 13 total (INST-01–09, DOCS-04, WRAP-01–03)
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-18 — traceability updated for v3.5 roadmap (phases 50–52)*
