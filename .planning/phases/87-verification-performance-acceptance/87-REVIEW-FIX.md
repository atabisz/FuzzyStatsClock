---
phase: 87-verification-performance-acceptance
fixed_at: 2026-05-21T00:00:00Z
review_path: .planning/phases/87-verification-performance-acceptance/87-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 87: Code Review Fix Report

**Fixed at:** 2026-05-21
**Source review:** `.planning/phases/87-verification-performance-acceptance/87-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 Critical + 4 Warning; Info findings out of scope without `--all`)
- Fixed: 5
- Skipped: 0

All five Critical/Warning findings were applied successfully. The full `dotnet test FuzzyClock.slnx` suite reports **449 Core + 138 App = 587 passing, 0 failed** after the final commit. The App.Tests count dropped from 140 to 138 by exactly two — the WR-03 degenerate snap rows that were intentionally removed.

## Fixed Issues

### CR-01: WR-04 patch leaves WS_EX_TRANSPARENT applied when ghost is disabled mid-active-ghost

**Files modified:** `FuzzyClock.App/MainWindow.xaml.cs`
**Commit:** `a081854`
**Applied fix:** Inlined the WS_EX_TRANSPARENT clear into the existing `OnGhostEnabledChanged(false)` else-branch in `MainWindow.xaml.cs`, mirroring the `GhostModeController.OnSampleThreadTick` restore-branch idiom byte-for-byte (`GetWindowLong` -> `SetWindowLong & ~WS_EX_TRANSPARENT` -> `SetWindowPos` with `SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED`). To keep the call-site behavior parity obvious without introducing a helper method or refactoring the controller — both explicitly forbidden by the user instruction — added a private P/Invoke surface (constants + three `[DllImport]` declarations) directly to `MainWindow.xaml.cs`. The clear runs only when `_ghostMode.IsActive` is true at the moment of disable (avoiding redundant Win32 calls when the user toggles ghost off while not currently click-through), and is gated independently of the `_settingsWindow?.IsVisible` guard so click-through is always lifted regardless of the opacity-pin state. Also writes `_ghostMode._isGhostMode = false` (now reachable since `_isGhostMode` is `internal volatile bool` after Phase 87-01) so the controller's view of ghost-mode state matches the window-style truth post-disable. This UI-thread write is one-shot on the disable edge and is NOT in the sampler loop, so the Phase 85 D-06 single-owner-write contract for the SAMPLER thread is preserved. Marked **fixed: requires human verification** in spirit because the underlying defect is interaction-state behavior that the unit-test suite cannot exercise — full UAT (toggle ghost mode mid-active-ghost via tray icon and confirm the widget regains drag/right-click/scroll-wheel responsiveness) is the verifier-phase responsibility, but all 587 unit tests pass and the build is clean.

### WR-01: WR-04 reset has a sampler-thread race that can re-corrupt `_targetRatio`

**Files modified:** `FuzzyClock.App/MainWindow.xaml.cs`
**Commit:** `7daa2f9`
**Applied fix:** Added defensive `_currentRatio = 0.0; _targetRatio = 0.0;` writes at the top of the `OnGhostEnabledChanged(true)` enable branch, just after the `_previousRenderTime = null` reset and before the `Rendering += OnRenderingTick` subscription. This makes the reset symmetric with the disable-edge zero already present in the else-branch and closes the race where a sampler-queued `BeginInvoke` lambda from immediately before disable can pump after the disable-edge zero, leaving a stale ~33-ms-old `_targetRatio` that the next ghost re-enable would lerp toward for one frame (visible as a one-frame ghost flash on re-enable).

### WR-02: `LerpRatioTests` parameter ordering is inverted relative to the function under test

**Files modified:** `FuzzyClock.App.Tests/LerpRatioTests.cs`
**Commit:** `6801a44`
**Applied fix:** Reordered the test method signature and all six `[DataRow]` literals to match the SUT signature `LerpRatio(double current, double target, double alpha, double deltaSeconds)`, with `expected` trailing as the conventional final column. The `current` and `target` columns are now visually distinct in the DataRow literals (no two adjacent equal columns inviting positional confusion), and the row `DisplayName`s lead with `current=` so the meaning is self-evident.

### WR-03: `LerpRatio_TerminalStateSnap` row "target=0.0, current=0.0" provides zero diagnostic value

**Files modified:** `FuzzyClock.App.Tests/LerpRatioTests.cs`
**Commit:** `4fc95e4`
**Applied fix:** Removed the two `current == target` rows (`current=1.0, target=1.0` and `current=0.0, target=0.0`). Both rows passed whether or not the D-03 terminal-state-snap branch existed (the lerp formula naturally returns target when current equals target), so they could not distinguish the snap path from the formula path. The remaining four rows have `current != target`, so without the snap the formula returns an interpolated value strictly between current and target — these rows now exercise the snap branch exclusively. Test count dropped from 140 to 138 in `FuzzyClock.App.Tests` as expected. Added an inline comment documenting the rationale for the omission so a future contributor adding a new row knows why the obvious `current=target` cases are not present.

### WR-04: `OnSampleTickTests` deviation from PLAN cursorX is silently encoded in a comment

**Files modified:** `FuzzyClock.App.Tests/OnSampleTickTests.cs`
**Commit:** `4d9c53c`
**Applied fix:** Defined named constants for the rectangle bounds (`RectLeft`, `RectTop`, `RectRight`, `RectBottom`), the default fade radius (`DefaultRadiusPx = 80`), and each cursor position used in the DataRows (`CursorOutsideZone = 10`, `CursorMidZone = 75`, `CursorPartialZone = 50`, `CursorInsideRect = 150`, `CursorYInsideRect = 150`). Each cursor constant carries an inline comment showing the Chebyshev arithmetic that produces the asserted ratio (e.g. `|10 - 100| = 90 > 80 -> ratio clamps to 0.0`), so a future maintainer changing the radius default in `GhostModeController.cs:76` can grep for the constant name to find the test that depends on it. The DataRow literals reference the named constants instead of bare integers, and the rect bounds are passed as constants into `OnSampleTick(...)` rather than as repeated magic numbers. The corrective rationale that previously lived only in a free-text comment is now baked into the constants themselves.

## Verification Notes

- **Tier 1 (re-read after edit):** Performed for every fix. All edits landed cleanly with surrounding code intact.
- **Tier 2 (build + test):** `dotnet build FuzzyClock.App` and `dotnet test FuzzyClock.App.Tests` ran clean after each fix. Final `dotnet test FuzzyClock.slnx` reports `Passed!  Failed: 0` for both Core (449/449) and App (138/138) test projects.
- **Pre-existing flake:** A `PhraseEngineTests.SpecialCases_NoonAndMidnight (12,0,"noon")` failure appeared in the baseline run before any fix was applied (the randomized phrase provider returned "midday" instead of "noon"); this is a pre-existing flake in Core that does not touch any of the files modified by this report. The final post-fix run did not reproduce the flake — both runs of Core landed at 449/449.
- **Behavior parity for CR-01:** The unit-test suite cannot exercise interactive ghost-mode toggle, so end-to-end verification of the WS_EX_TRANSPARENT clear is deferred to the verifier phase per the existing CR-01 deferral note in the REVIEW.md summary. The code-side change mirrors the controller's existing restore-branch idiom byte-for-byte to make the parity self-evident.

---

_Fixed: 2026-05-21_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
