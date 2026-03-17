# Requirements: FuzzyStatsClock v3.3

**Defined:** 2026-03-17
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v3.3 Requirements

### Settings Window Redesign

- [ ] **SETR-01**: Settings window uses a dark background and light foreground text matching the widget's minimal aesthetic
- [ ] **SETR-02**: CheckBox, RadioButton, ComboBox, Button, and Slider controls have consistent dark-mode styling
- [ ] **SETR-03**: Section groups have adequate whitespace; controls are not cramped
- [ ] **SETR-04**: Settings window styling is scoped to SettingsWindow only — no style leakage to MainWindow

### Bug Fixes

- [ ] **FIX-01**: ResetToDefaults() also resets phrase style to Classic and phrase locale to "auto"
- [ ] **FIX-02**: Second launch of the app brings the existing window to front instead of silently exiting
- [ ] **FIX-03**: AbandonedMutexException is handled so the app can restart after a crash without being stuck

### Edge Snapping

- [ ] **SNAP-01**: Widget snaps to screen edges when drag ends within 8px of any edge (left / right / top / bottom)
- [ ] **SNAP-02**: Edge snap respects the working area (excludes taskbar)
- [ ] **SNAP-03**: Edge snap fires post-DragMove() only — not during drag, not on phrase resize

### Installer

- [ ] **INST-01**: FuzzyClockSetup.exe installs per-user to %LOCALAPPDATA%\Programs\FuzzyClock\ with no UAC prompt
- [ ] **INST-02**: Running the installer over an existing installation upgrades in-place without data loss
- [ ] **INST-03**: Installer creates a Start Menu shortcut
- [ ] **INST-04**: Installer registers in Add/Remove Programs with a clean uninstall path
- [ ] **INST-05**: Uninstall removes app files but preserves settings.json
- [ ] **INST-06**: If auto-launch was enabled, installer updates the HKCU\...\Run entry to the new install path
- [ ] **INST-07**: FuzzyClockSetup.exe is produced as a CI artifact alongside FuzzyClock.exe

### Docs

- [ ] **DOCS-04**: README documents v3.2 features: Settings window, named themes, phrase styles, and language selection

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
| SETR-01 | Phase 48 | Pending |
| SETR-02 | Phase 48 | Pending |
| SETR-03 | Phase 48 | Pending |
| SETR-04 | Phase 48 | Pending |
| FIX-01 | Phase 49 | Pending |
| FIX-02 | Phase 49 | Pending |
| FIX-03 | Phase 49 | Pending |
| SNAP-01 | Phase 49 | Pending |
| SNAP-02 | Phase 49 | Pending |
| SNAP-03 | Phase 49 | Pending |
| INST-01 | Phase 50 | Pending |
| INST-02 | Phase 50 | Pending |
| INST-03 | Phase 50 | Pending |
| INST-04 | Phase 50 | Pending |
| INST-05 | Phase 50 | Pending |
| INST-06 | Phase 50 | Pending |
| INST-07 | Phase 50 | Pending |
| DOCS-04 | Phase 51 | Pending |

**Coverage:**
- v3.3 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after initial definition*
