---
phase: 50-installer-ci
verified: 2026-03-18T00:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 50: Installer + CI Verification Report

**Phase Goal:** Produce a signed per-user Windows installer and a CI pipeline that compiles and releases it automatically on git tag push.
**Verified:** 2026-03-18
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | FuzzyClock.iss compiles with ISCC and produces a FuzzyClockSetup EXE | VERIFIED | File exists at repo root; `OutputBaseFilename=FuzzyClockSetup-{#AppVersion}`; `OutputDir=installer`; structurally complete Inno Setup script |
| 2 | Installer targets per-user location with no UAC elevation | VERIFIED | `PrivilegesRequired=lowest`; `DefaultDirName={localappdata}\Programs\FuzzyClock` |
| 3 | Running installer detects an active FuzzyClock process via AppMutex | VERIFIED | `AppMutex=FuzzyClock_SingleInstance_v1` matches `App.xaml.cs` mutex name exactly (line 21: `new Mutex(... "FuzzyClock_SingleInstance_v1" ...)`) |
| 4 | Finish page offers a Launch FuzzyClock checkbox (checked by default) | VERIFIED | `[Run]` entry has `Flags: postinstall nowait skipifsilent`; no `unchecked` flag present |
| 5 | Uninstall preserves settings.json by default; optional checkbox removes it | VERIFIED | No `[Dirs]` section for `{localappdata}\FuzzyClock`; `RemoveSettingsCheckbox.Checked := False`; `DelTree` only fires when checkbox is ticked |
| 6 | Upgrade rewrites HKCU Run entry if auto-launch was previously enabled | VERIFIED | `CurStepChanged` on `ssPostInstall` calls `RegValueExists(HKEY_CURRENT_USER, ..., 'FuzzyClock')` then `RegWriteStringValue`; matches `AutoLaunchService.cs` key path and value name exactly |
| 7 | Pushing a v* tag triggers the release workflow | VERIFIED | `on: push: tags: ['v*']` present in release.yml |
| 8 | Tests run before any artifacts are built | VERIFIED | Step order: Test (line 36) precedes Publish (line 39) and Compile installer (line 54) |
| 9 | Version is extracted from the git tag and injected into dotnet publish and ISCC | VERIFIED | `id: version` step strips `refs/tags/v`, pads to X.Y.Z; injected as `-p:Version`, `-p:AssemblyVersion`, `-p:FileVersion` in Publish step; passed as `/DAppVersion=` and `/DSourceDir=publish` to ISCC |
| 10 | Three artifacts appear in the draft GitHub Release: FuzzyClock-X.Y.Z.exe, FuzzyClockSetup-X.Y.Z.exe, checksums.txt | VERIFIED | `files:` block lists all three; EXE renamed after ISCC compilation so ISCC finds `publish/FuzzyClock.exe` unversioned; checksums generated via PowerShell `Get-FileHash` SHA256 |
| 11 | The release is created as a draft (not published automatically) | VERIFIED | `draft: true` in `softprops/action-gh-release@v2` step |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `FuzzyClock.iss` | Complete Inno Setup installer script | VERIFIED | 87 lines; all required sections present: `[Setup]`, `[Languages]`, `[Files]`, `[Icons]`, `[Run]`, `[Code]`; contains `PrivilegesRequired=lowest` |
| `.github/workflows/release.yml` | Complete CI release pipeline with installer compilation | VERIFIED | 86 lines; 8-step pipeline; `draft: true` present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `FuzzyClock.iss` | `FuzzyClock.App/App.xaml.cs` | AppMutex directive matching named mutex | VERIFIED | Both use exact string `FuzzyClock_SingleInstance_v1`; App.xaml.cs line 21, FuzzyClock.iss line 25 |
| `FuzzyClock.iss` | `FuzzyClock.App/AutoLaunchService.cs` | Pascal CurStepChanged rewrites same HKCU Run key | VERIFIED | Both use key path `SOFTWARE\Microsoft\Windows\CurrentVersion\Run` and value name `FuzzyClock`; .iss lines 51-54, AutoLaunchService.cs lines 11-12 |
| `.github/workflows/release.yml` | `FuzzyClock.iss` | ISCC compilation step with /DAppVersion and /DSourceDir flags | VERIFIED | `"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /DAppVersion=... /DSourceDir=publish FuzzyClock.iss`; step uses `shell: cmd` |
| `.github/workflows/release.yml` | `softprops/action-gh-release@v2` | Draft release upload with three artifact files | VERIFIED | `draft: true`, `generate_release_notes: true`, three-file `files:` block |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INST-01 | 50-01 | Per-user install to %LOCALAPPDATA%\Programs\FuzzyClock\ with no UAC prompt | SATISFIED | `PrivilegesRequired=lowest`, `DefaultDirName={localappdata}\Programs\FuzzyClock` |
| INST-02 | 50-01 | Upgrade in-place without data loss | SATISFIED | Stable `AppId={{B8F2E3A1-7C4D-4E5F-9A6B-1D2E3F4A5B6C}`; no `[Dirs]` for settings dir ensures data survives |
| INST-03 | 50-01 | Installer creates a Start Menu shortcut | SATISFIED | `[Icons]` section: `Name: "{group}\FuzzyClock"; Filename: "{app}\FuzzyClock.exe"` |
| INST-04 | 50-01 | Registers in Add/Remove Programs with clean uninstall | SATISFIED | `AppName`, `AppPublisher`, `UninstallDisplayName`, stable `AppId` all present; Inno Setup standard uninstall behavior |
| INST-05 | 50-01 | Uninstall removes app files but preserves settings.json | SATISFIED | No `[Dirs]` for `{localappdata}\FuzzyClock`; `RemoveSettingsCheckbox.Checked := False` (opt-in removal only) |
| INST-06 | 50-01 | Installer updates HKCU\...\Run entry to new install path | SATISFIED | `CurStepChanged(ssPostInstall)` checks and rewrites `RegValueExists(HKEY_CURRENT_USER, ..., 'FuzzyClock')` |
| INST-07 | 50-02 | CI produces FuzzyClock-X.Y.Z.exe, FuzzyClockSetup-X.Y.Z.exe, checksums.txt as draft release on v* tag | SATISFIED | All three artifacts in `files:` block; `draft: true`; tag trigger `'v*'` |
| INST-08 | 50-01 | Installer prompts user to close a running FuzzyClock instance | SATISFIED | `AppMutex=FuzzyClock_SingleInstance_v1` triggers Inno Setup's built-in running-instance detection dialog |
| INST-09 | 50-01 | Finish page "Launch FuzzyClock" checkbox; uninstaller optional settings.json removal | SATISFIED | `[Run]` `postinstall nowait skipifsilent` (no `unchecked`); `InitializeUninstallProgressForm` creates `RemoveSettingsCheckbox` (Checked=False); `CurUninstallStepChanged` calls `DelTree` conditionally |

All 9 INST-xx requirements satisfied. No orphaned requirements for this phase.

---

### Anti-Patterns Found

None. No TODO/FIXME/HACK markers, no placeholder implementations, no empty handlers in either artifact.

---

### Human Verification Required

#### 1. Installer compilation on local machine

**Test:** Install Inno Setup 6, run `ISCC FuzzyClock.iss` from repo root after a `dotnet publish` to `publish/`
**Expected:** Produces `installer/FuzzyClockSetup-0.0.0-dev.exe` without errors
**Why human:** Cannot invoke ISCC.exe in this environment; syntax correctness is inferred from structural inspection only

#### 2. Running-instance detection dialog

**Test:** Launch FuzzyClock, then run the installer
**Expected:** Inno Setup displays a dialog saying FuzzyClock is running and must be closed before continuing
**Why human:** Requires both a running FuzzyClock process and the compiled installer EXE

#### 3. Auto-launch path rewrite on upgrade

**Test:** Enable auto-launch in FuzzyClock, then run a newer installer over it
**Expected:** After install, the HKCU Run entry still points to the (new) install path
**Why human:** Requires registry state inspection across two installer runs

#### 4. CI pipeline execution

**Test:** Push a `v3.5` tag to the GitHub repo
**Expected:** Actions workflow runs; draft release appears with three versioned artifacts; checksums.txt lists SHA256 hashes for both EXEs
**Why human:** Requires GitHub Actions runner with ISCC pre-installed; cannot verify remotely

---

### Gaps Summary

No gaps. All automated checks passed across both artifacts and all key links. Phase goal fully achieved by the two planned deliverables: `FuzzyClock.iss` and the updated `.github/workflows/release.yml`.

---

_Verified: 2026-03-18_
_Verifier: Claude (gsd-verifier)_
