# Requirements: Fuzzy Clock

**Defined:** 2026-03-03
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v2.5 Requirements

Requirements for v2.5 Unit Tests. Each maps to roadmap phases.

### Logic Extraction

Pure functions extracted from MainWindow into FuzzyClock.Core for independent testability.

- [x] **EXTRACT-01**: UptimeFormatter.Format(TimeSpan) is extracted from MainWindow into FuzzyClock.Core; MainWindow calls it with no behavior change
- [x] **EXTRACT-02**: DialGeometry hand-angle calculation is extracted from MainWindow into FuzzyClock.Core; MainWindow calls it with no behavior change

### Unit Tests — Core Logic

- [x] **UTEST-01**: UptimeFormatter tests cover sub-hour (≥1m), exactly-1h boundary, hours-only (≥1h <1d), exactly-1d boundary, and days+hours+minutes
- [x] **UTEST-02**: DialGeometry tests cover 12:00 (both hands at 0°/360°), 6:00, 3:00, 3:15 (minute hand interpolation), and at least one intermediate hour position

### Test Infrastructure

- [ ] **TINFRA-01**: FuzzyClock.App.Tests project (net10.0-windows, MSTest) is added to FuzzyClock.slnx and runs via `dotnet test` with zero failures

### Unit Tests — Settings

Tests for AppSettings JSON round-trip, upgrade safety, and SettingsService validation logic. SettingsService is refactored minimally (Validate method + pure Clamp overload) to enable these without touching file I/O.

- [ ] **STEST-01**: AppSettings JSON round-trip test: serialize a fully-populated AppSettings → deserialize → all fields match original
- [ ] **STEST-02**: AppSettings deserialization from JSON with UptimeVisible field absent returns UptimeVisible=true (init default), not false (C# bool default) — validates the absent-field-as-init-default pattern
- [ ] **STEST-03**: SettingsService.Validate() (extracted pure method) returns StatsIntervalSeconds=3 when input is 0
- [ ] **STEST-04**: SettingsService.Validate() returns Opacity=1.0 when input Opacity is 0.0
- [ ] **STEST-05**: SettingsService.Validate() returns AccentColor="#FFFFFFFF" when input is null or whitespace
- [ ] **STEST-06**: SettingsService.Clamp() pure overload (explicit screen bounds) clamps Left/Top to keep window fully within bounds
- [ ] **STEST-07**: SettingsService.Clamp() pure overload does not modify Left/Top when already within bounds

### CI Integration

- [ ] **CI-01**: GitHub Actions release.yml runs `dotnet test` before `dotnet publish`; workflow fails fast if any test fails — release is never created from a broken build

## v3+ Requirements

Deferred from prior milestones.

### Platform

- **STRT-01**: Auto-launch on Windows login (registry key)
- **WIN-06**: Widget position persists per monitor (multi-monitor identity via screen handle)
- **WIN-07**: Widget snaps to screen edges when dragged near them

## Out of Scope

| Feature | Reason |
|---------|--------|
| MainWindow event handler tests | Requires WPF STA thread + HWND; cost > benefit without full MVVM refactor |
| StatsService unit tests | Direct PDH PerformanceCounter construction; no DI seam; would require significant refactor |
| Integration / UI automation tests | Overkill for a personal tool; manual verification sufficient |
| Full MVVM refactor | Would touch every event handler; out of scope for this milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXTRACT-01 | Phase 28 | Complete |
| EXTRACT-02 | Phase 28 | Complete |
| UTEST-01 | Phase 28 | Complete |
| UTEST-02 | Phase 28 | Complete |
| TINFRA-01 | Phase 29 | Pending |
| STEST-01 | Phase 29 | Pending |
| STEST-02 | Phase 29 | Pending |
| STEST-03 | Phase 29 | Pending |
| STEST-04 | Phase 29 | Pending |
| STEST-05 | Phase 29 | Pending |
| STEST-06 | Phase 29 | Pending |
| STEST-07 | Phase 29 | Pending |
| CI-01 | Phase 30 | Pending |

**Coverage:**
- v2.5 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 — traceability confirmed during roadmap creation; phases 28/29/30 assigned*
