# Phase 50: Installer + CI - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Create an Inno Setup per-user installer (`FuzzyClockSetup.exe`) and a GitHub Actions release workflow that produces both the bare EXE and the installer as downloadable release artifacts. The installer targets `%LOCALAPPDATA%\Programs\FuzzyClock\` (no UAC elevation), registers with Add/Remove Programs, handles upgrades and uninstalls, and preserves the auto-launch registry entry across upgrades.

</domain>

<decisions>
## Implementation Decisions

### Release trigger
- Workflow fires on git tag push (e.g., `v3.3`) — intentional release signal only
- Workflow runs tests first, then builds artifacts; cannot ship a broken build
- Creates a GitHub Release automatically as a **draft** — user reviews artifacts then clicks Publish
- Release notes are auto-drafted by the workflow

### Version sourcing
- Version comes from the git tag: strip leading `v`, pad to 3 parts → `3.3.0`
- `dotnet publish` receives `/p:Version=3.3.0` so the EXE's assembly version matches the installer
- Inno Setup script reads the version from a CI environment variable (no hardcoded constant)

### Upgrade / running app
- If FuzzyClock is already running when the installer launches: **prompt the user** ("FuzzyClock is running — close it to continue?")
- After a successful install/upgrade: finish page shows a "Launch FuzzyClock" checkbox (opt-in relaunch)
- On uninstall: show an optional **"Also remove settings"** checkbox — if unchecked, `settings.json` in `%LOCALAPPDATA%\FuzzyClock\` is preserved; if checked, it is deleted

### Artifact naming
- Installer artifact: `FuzzyClockSetup-3.3.0.exe` (version-stamped)
- Bare EXE artifact: `FuzzyClock-3.3.0.exe` (version-stamped)
- GitHub Release also includes `checksums.txt` with SHA256 hashes for both EXE files

### Claude's Discretion
- Exact Inno Setup script structure and section layout
- How to detect and signal the running process (e.g., `CloseApplications` directive vs custom Pascal script)
- GitHub Actions job/step breakdown
- .NET publish flags and self-contained vs framework-dependent choice

</decisions>

<specifics>
## Specific Ideas

- The upgrade case for auto-launch (registry entry must point to the new install path) is explicitly called out in the success criteria — the planner must handle this
- SmartScreen "More info → Run anyway" is expected and acceptable; no code signing cert is in scope
- The existing CI test gate already runs on push — the release workflow adds tests as an extra safety layer, not a replacement

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 50-installer-ci*
*Context gathered: 2026-03-18*
