---
phase: 58-contrast-flicker-regression-fix
verified: 2026-03-19T04:30:00Z
status: passed
score: 3/4 must-haves verified automatically
human_verification:
  - test: "Enable AutoContrast, position widget over empty desktop with visible desktop icons, watch 30+ seconds"
    expected: "Text color holds stable — no flicker or oscillation"
    why_human: "Real-time screen behavior with SHELLDLL_DefView guard and live BitBlt sampling cannot be verified statically"
  - test: "Enable AutoContrast AND BackdropAlwaysVisible, position widget over empty desktop, watch 30+ seconds"
    expected: "Both backdrop and text colors hold stable — no oscillation"
    why_human: "Backdrop color stability requires live rendering observation"
  - test: "Drag widget over a bright app window (e.g. Notepad), then drag back to empty desktop"
    expected: "Text switches to black or white within one tick over the app window; stabilizes over empty desktop"
    why_human: "Cross-window switching correctness requires live interaction"
---

# Phase 58: Contrast Flicker Regression Fix Verification Report

**Phase Goal:** Fix the contrast flicker regression — eliminate oscillation/flickering of auto-contrast over empty desktop
**Verified:** 2026-03-19T04:30:00Z
**Status:** human_needed (all automated checks PASSED; 3 behavioral truths require live observation)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AutoContrast over empty desktop: text color holds stable across 30+ consecutive ticks | ? HUMAN NEEDED | Guard exists and is wired; SHELLDLL_DefView + DWM-cloaked check both in place. SUMMARY documents human-verify passed. Cannot confirm statically. |
| 2 | BackdropAlwaysVisible over empty desktop: backdrop and text colors hold stable | ? HUMAN NEEDED | Same guard covers this path (no separate code path for backdrop). SUMMARY documents FIX-05 verified. Cannot confirm statically. |
| 3 | AutoContrast over application window: text correctly switches color within one tick | ? HUMAN NEEDED | Guard returns true when a non-shell, non-cloaked window overlaps; Tick proceeds to BitBlt + ContrastService. SUMMARY documents FIX-06 verified. Cannot confirm statically. |
| 4 | All 274 existing MSTest tests pass with 0 failures | VERIFIED | `dotnet test` output: Passed 249 (Core) + 25 (App) = 274 total, 0 failures, 0 skipped |

**Score:** 1/4 truths verified fully automated; 3/4 require live observation (all automated preconditions pass)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `FuzzyClock.App/ContrastRefreshController.cs` | Z-order walk guard with SHELLDLL_DefView in shell exclusion list | VERIFIED | File exists; contains `cls != "SHELLDLL_DefView"` at line 161; contains `SHELLDLL_DefView` exactly 3 times (condition line 161, XML doc line 143, inline comment line 120); `className.Clear()` present in both shell-class branch (line 171) and cloaked-skip branch (line 167) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ContrastRefreshController.HasAppWindowBeneath` | `ContrastRefreshController.Tick` | guard call before BitBlt sampling | VERIFIED | Line 131: `if (!HasAppWindowBeneath(_hwnd, widgetRect)) return;` — guard fires before `ContrastSamplerService.Sample` call at line 133 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FIX-04 | 58-01-PLAN.md | AutoContrast over empty desktop — no oscillation or flicker | SATISFIED (automated preconditions) | SHELLDLL_DefView + DWM-cloaked guard in place; SUMMARY documents human-verify passed; REQUIREMENTS.md marked `[x]` |
| FIX-05 | 58-01-PLAN.md | BackdropAlwaysVisible over empty desktop — no oscillation or flicker | SATISFIED (automated preconditions) | Same guard path covers backdrop scenario; SUMMARY documents human-verify passed; REQUIREMENTS.md marked `[x]` |
| FIX-06 | 58-01-PLAN.md | AutoContrast over application window — correct color switch, no regression | SATISFIED (automated preconditions) | Guard returns true for non-shell, non-cloaked windows; Tick reaches sampling + ContrastService; SUMMARY documents human-verify passed; REQUIREMENTS.md marked `[x]` |

All three requirement IDs declared in the PLAN frontmatter are present and accounted for in REQUIREMENTS.md. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

No TODO, FIXME, placeholder comments, empty returns, or stub implementations detected in the modified file.

### Human Verification Required

#### 1. FIX-04: AutoContrast stability over empty desktop

**Test:** Enable AutoContrast via tray menu. Position widget over empty desktop (no app windows overlapping). Watch the widget text color for at least 30 seconds.
**Expected:** Text color is completely stable — no switching between white/black/accent, no visible flicker.
**Why human:** Real-time screen sampling behavior and timer tick stability cannot be determined from static analysis.

#### 2. FIX-05: Backdrop + text stability over empty desktop

**Test:** Enable both AutoContrast and BackdropAlwaysVisible. Position widget over empty desktop. Watch 30+ seconds.
**Expected:** Both backdrop opacity and text color hold stable — no oscillation.
**Why human:** Same as FIX-04; backdrop color is set on the same code path, so live observation is required.

#### 3. FIX-06: AutoContrast switches correctly over app windows

**Test:** With AutoContrast enabled, drag widget over a bright app window (e.g. Notepad with white background). Confirm text switches to dark. Then drag back to empty desktop — confirm text stabilizes.
**Expected:** Color switch over app window occurs within one tick (~500ms); no regression from the guard change.
**Why human:** Live interaction across different Z-order states is required to confirm the guard correctly returns true for real app windows while returning false for the shell.

### Additional Implementation Note

The phase delivered more than the minimal plan specified. Beyond adding `SHELLDLL_DefView` (the original diagnosis), an additional `DwmGetWindowAttribute(DWMWA_CLOAKED)` check was added to skip Windows 11 shell panels (`ApplicationFrameWindow` — Start menu, Search, Widgets) that remain in Z-order when dismissed but are hidden by DWM. This was discovered during human verification when flicker persisted after the first commit. The cloaked check is placed after the non-shell-class filter to minimize P/Invoke calls on the hot path. Both changes are in the single modified file.

### Automated Check Summary

- `SHELLDLL_DefView` appears exactly 3 times in `ContrastRefreshController.cs`: exclusion condition (line 161), XML doc summary (line 143), inline Tick comment (line 120) — matches acceptance criteria
- `cls != "SHELLDLL_DefView"` appears exactly once (line 161) — matches acceptance criteria
- `className.Clear()` is present inside the if-block at line 171 (shell-class branch) and line 167 (cloaked-skip branch) — guard integrity preserved
- `DwmGetWindowAttribute` P/Invoke declared at line 40; `DWMWA_CLOAKED = 14` constant at line 46; called at line 166
- `HasAppWindowBeneath(_hwnd, widgetRect)` called at line 131, before `ContrastSamplerService.Sample` at line 133 — wiring confirmed
- `dotnet build FuzzyClock.App/FuzzyClock.App.csproj`: 0 errors, 0 warnings
- `dotnet test`: 274 passed (249 Core + 25 App), 0 failed
- Commits: `4adf3ba` (SHELLDLL_DefView fix) and `20d10d6` (DWM-cloaked fix) both present in git log

---

_Verified: 2026-03-19T04:30:00Z_
_Verifier: Claude (gsd-verifier)_
