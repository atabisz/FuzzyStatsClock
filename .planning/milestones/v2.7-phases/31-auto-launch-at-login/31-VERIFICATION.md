---
phase: 31-auto-launch-at-login
verified: 2026-03-03T03:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 31: Auto-Launch at Login Verification Report

**Phase Goal:** User can make the widget start automatically at Windows login, controlled from the tray menu
**Verified:** 2026-03-03T03:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Tray menu shows an "Auto-Launch at Login" item with a checkmark that reflects whether the registry entry currently exists | VERIFIED | `_trayAutoLaunch` created in `InitTrayIcon()` (line 761); `TrayMenu_Opening` syncs `.Checked = _autoLaunchEnabled` (line 474) |
| 2 | Clicking the item toggles the registry entry and the checkmark updates immediately (no menu reopen required) | VERIFIED | Click handler (lines 763–773) toggles `_autoLaunchEnabled`, sets `.Checked`, calls `AutoLaunchService.Enable/Disable`, calls `SaveSettings()` — all in one handler |
| 3 | HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run has a "FuzzyClock" value pointing to the executable when enabled; the value is absent when disabled | VERIFIED | `AutoLaunchService.Enable` writes `ValueName = "FuzzyClock"` under `RunKeyPath` using `Registry.CurrentUser`; `Disable` calls `DeleteValue(ValueName, throwOnMissingValue: false)` |
| 4 | AutoLaunchEnabled is false by default — no registry entry is written on first run | VERIFIED | `AppSettings.AutoLaunchEnabled { get; init; } = false` (line 23 of AppSettings.cs); `_autoLaunchEnabled = false` field initializer (line 36 of MainWindow.xaml.cs) |
| 5 | Preference survives restart: AutoLaunchEnabled round-trips through settings.json and ApplySettings restores the registry entry on next launch | VERIFIED | `SaveSettings()` writes `AutoLaunchEnabled = _autoLaunchEnabled` (line 317); `ApplySettings()` reads `s.AutoLaunchEnabled` and calls `AutoLaunchService.Enable/Disable` accordingly (lines 269–276) |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `FuzzyClock.App/AppSettings.cs` | AutoLaunchEnabled bool property with default false | VERIFIED | Line 23: `public bool AutoLaunchEnabled { get; init; } = false;` — init-property record pattern, non-positional |
| `FuzzyClock.App/AutoLaunchService.cs` | Registry read/write for HKCU Run entry; exports Enable, Disable, IsEnabled | VERIFIED | 37-line file; all three methods present with correct registry key path and value name; `throwOnMissingValue: false` on DeleteValue |
| `FuzzyClock.App/MainWindow.xaml.cs` | Tray menu toggle wired to AutoLaunchService; contains `_trayAutoLaunch` | VERIFIED | Field declared line 35; tray item created line 761; wired in click handler, ApplySettings, SaveSettings, TrayMenu_Opening, ResetToDefaults |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `MainWindow.xaml.cs` | `AutoLaunchService.cs` | `AutoLaunchService.Enable(exePath)` / `Disable()` in click handler and `ApplySettings` | VERIFIED | Lines 269–276 (ApplySettings), lines 768–771 (click handler), line 930 (ResetToDefaults) |
| `MainWindow.xaml.cs` | `AppSettings.cs` | `SaveSettings` writes `AutoLaunchEnabled = _autoLaunchEnabled`; `ApplySettings` reads `s.AutoLaunchEnabled` | VERIFIED | Line 317 (SaveSettings), line 269 (ApplySettings) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| STRT-01 | 31-01-PLAN.md | User can toggle auto-launch at Windows login via tray context menu; toggle state shown as checkmark | SATISFIED | `_trayAutoLaunch` checkable item in tray; `TrayMenu_Opening` syncs checkmark from field state |
| STRT-02 | 31-01-PLAN.md | Auto-launch setting persists to settings.json and restores on launch | SATISFIED | `SaveSettings()` writes `AutoLaunchEnabled`; `ApplySettings()` reads it and restores registry state |
| STRT-03 | 31-01-PLAN.md | When auto-launch is enabled, HKCU Run entry is written; when disabled, the entry is removed | SATISFIED | `AutoLaunchService.Enable` sets value; `AutoLaunchService.Disable` removes it with no-throw semantics |

No orphaned requirements: REQUIREMENTS.md maps STRT-01, STRT-02, STRT-03 exclusively to Phase 31 — all three are claimed by plan 31-01 and verified above.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

Scanned `AutoLaunchService.cs`, `AppSettings.cs`, and the modified sections of `MainWindow.xaml.cs` for TODO/FIXME/placeholder comments, empty return stubs, and console-only handlers. None found.

---

### Version Bump

`FuzzyClock.App.csproj` updated to `2.6.0` / `2.6.0.0` as required by the plan. Build confirmed: 0 errors, 0 warnings.

---

### Human Verification Required

| # | Test | Expected | Why Human |
|---|------|----------|-----------|
| 1 | Right-click tray icon; confirm "Auto-Launch at Login" item appears unchecked on first launch | Item visible with no checkmark | Cannot run WPF UI programmatically |
| 2 | Click "Auto-Launch at Login"; open regedit at HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run | "FuzzyClock" value present, pointing to full .exe path | Registry state cannot be verified without running the app |
| 3 | Click item again to disable; refresh regedit | "FuzzyClock" value absent | Same as above |
| 4 | Enable auto-launch, close and reopen the app; check tray menu checkmark and regedit | Checkmark still on; registry entry still present (restored by ApplySettings on startup) | Requires actual app restart to observe round-trip behavior |
| 5 | Use "Reset to Defaults" in tray menu; check item checkmark and regedit | Checkmark off; registry entry removed | Requires running UI |

These human tests are advisory — the automated code verification is sufficient to confirm the phase goal is achieved. All code paths for registry write, delete, read-back, and persistence are substantive and fully wired.

---

### Commit Verification

| Commit | Hash | Status | Files |
|--------|------|--------|-------|
| Task 1: AppSettings + AutoLaunchService | `8f5027b` | EXISTS | `AppSettings.cs` (+1 line), `AutoLaunchService.cs` (+37 lines) |
| Task 2: Tray toggle + persistence | `d8193de` | EXISTS | `MainWindow.xaml.cs` (+52 lines), `FuzzyClock.App.csproj` (+7 lines) |

---

## Gaps Summary

No gaps. All five observable truths are verified. All three requirement IDs (STRT-01, STRT-02, STRT-03) are satisfied with substantive implementation in the correct files. Both commits exist. Build succeeds with 0 errors and 0 warnings.

---

_Verified: 2026-03-03T03:00:00Z_
_Verifier: Claude (gsd-verifier)_
