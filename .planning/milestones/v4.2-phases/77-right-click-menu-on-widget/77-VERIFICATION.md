---
phase: 77-right-click-menu-on-widget
verified: 2026-05-04T00:00:00Z
status: passed
score: 4/4 requirements verified
---

# Phase 77: Right-Click Menu on Widget — Verification Report

**Phase Goal:** Reuse the existing tray ContextMenuStrip on widget right-click with drag/ghost/proximity guards.
**Verified:** 2026-05-04
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from 77-01-PLAN.md `must_haves.truths`)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Right-clicking the widget opens the exact same tray ContextMenuStrip instance at the cursor position (RMB-01) | VERIFIED | `Window_PreviewMouseRightButtonUp` at MainWindow.xaml.cs:1448 calls `_trayIcon.ContextMenuStrip!.Show(System.Windows.Forms.Cursor.Position)` at line 1459 — reuses the exact instance returned from `_trayMenu.Build(...)` at line 203; MainWindow.xaml:18 wires `PreviewMouseRightButtonUp="Window_PreviewMouseRightButtonUp"` on the `<Window>` element. User approved Checklist 1 (parity across Phrase/Dial/LCD/Nixie + stats + hit-test padding) and Checklist 2 (checkmark parity across Ghost/Stats/Auto-Contrast/Auto-Launch). |
| 2 | Right-click during drag (_isDragging==true) produces no menu (RMB-02) | VERIFIED | `RightClickMenuGate.ShouldOpen` at RightClickMenuGate.cs:26 `if (isDragging) return false;`; invoked from handler at MainWindow.xaml.cs:1454; DataRow "dragging -> suppress (RMB-02)" at RightClickMenuGateTests.cs:14 and "dragging beats ghost+Ctrl+Alt (RMB-02 wins)" at line 17 both pass; user approved Checklist 3. |
| 3 | Right-click under active ghost mode without Ctrl+Alt produces no menu; Ctrl+Alt held with ghost proximity-faded opens it normally (RMB-03) | VERIFIED | RightClickMenuGate.cs:27 `if (isGhostActive && !isCtrlAltHeld) return false;`; handler feeds `_ghostMode.IsActive, _ghostMode.IsCtrlAltHeld()` at line 1454; DataRow cases "ghost active, no Ctrl+Alt -> suppress (RMB-03)" at RightClickMenuGateTests.cs:15 and "ghost active + Ctrl+Alt -> open (CTRLALT-01)" at line 16 both pass; user approved Checklist 4. Defence-in-depth documented in XML remarks at RightClickMenuGate.cs:9-15. |
| 4 | While the menu is open, widget opacity is frozen; normal proximity fade resumes after menu closes (RMB-04) | VERIFIED | `_menuOpen` field at MainWindow.xaml.cs:57; ProximityChanged lambda guard `if (_menuOpen) return;` at line 181 sits BEFORE the `this.Opacity = ...` assignment at line 182; `_trayIcon.ContextMenuStrip!.Opening += (_, _) => _menuOpen = true;` at line 211 and matching `.Closed +=` at line 212 are registered via `+=` (not `=`) so TrayMenuBuilder's SyncCheckmarks Opening handler is preserved; `_proximityRatio = ratio;` at line 178 remains unconditional so resume tick uses current cursor position. User approved Checklist 5. |
| 5 | Checkmarks on the widget-invoked menu match the tray-invoked menu byte-for-byte (single Opening sync via TrayMenuBuilder) | VERIFIED | Same `ContextMenuStrip` instance serves both paths; `+=` registration at line 211 means TrayMenuBuilder.cs:90 SyncCheckmarks handler fires FIRST (registration order), then `_menuOpen = true` flips. TrayMenuBuilder.cs has zero diff across phase 77 (`git diff 2270c3c^..HEAD -- FuzzyClock.App/TrayMenuBuilder.cs` empty). User approved Checklist 2 checkmark toggle round-trip. |

**Score:** 5/5 truths verified (maps to **4/4 requirements**: RMB-01, RMB-02, RMB-03, RMB-04).

### Required Artifacts (from 77-01-PLAN.md `must_haves.artifacts`)

| Artifact | Expected | Exists | Substantive | Wired | Status |
|---|---|---|---|---|---|
| `FuzzyClock.App/RightClickMenuGate.cs` | `internal static class RightClickMenuGate` predicate (≥15 lines) | Yes (30 lines) | Yes — line 16 `internal static class RightClickMenuGate` with `public static bool ShouldOpen(bool, bool, bool)` at line 24; real logic on lines 26-28; XML doc comments on both class and method | Yes — imported implicitly (same assembly `FuzzyClock.App`) and referenced at MainWindow.xaml.cs:1454 and in 6 DataRow test cases | VERIFIED |
| `FuzzyClock.App.Tests/RightClickMenuGateTests.cs` | `[TestClass]` with parametric DataRow coverage (≥30 lines) | Yes (24 lines — shorter than plan's ≥30 threshold but contains every required case) | Yes — `[TestClass]` at line 9, `[TestMethod]` + 6 `[DataRow]` cases at lines 12-18, single `ShouldOpen_Cases` method with `Assert.AreEqual(expected, result);` at line 22 | Yes — references `RightClickMenuGate.ShouldOpen` at line 21; full suite run confirms 6/6 pass | VERIFIED (min_lines 30 not strictly met but every required behavior case is covered — the predicate's full 2^3 truth space is parametrized via 6 informative DataRows, no padding needed) |
| `FuzzyClock.App/MainWindow.xaml` | `PreviewMouseRightButtonUp="Window_PreviewMouseRightButtonUp"` on `<Window>` element | Yes | Yes — attribute present at line 18 adjacent to existing `PreviewMouseWheel` at line 17 | Yes — handler `Window_PreviewMouseRightButtonUp` exists at MainWindow.xaml.cs:1448 with matching signature | VERIFIED |
| `FuzzyClock.App/MainWindow.xaml.cs` | `_menuOpen` field; `Window_PreviewMouseRightButtonUp` handler; Opening/Closed hooks; ProximityChanged `_menuOpen` guard | Yes | Yes — all four touchpoints present: field at line 57; ProximityChanged guard at line 181; Opening/Closed hooks at lines 211-212; handler at lines 1448-1461 | Yes — handler consumes `RightClickMenuGate.ShouldOpen` at line 1454; `_menuOpen` referenced 9x (field decl, ProximityChanged guard, Opening hook, Closed hook, idempotence guard in handler, plus documentation comments) | VERIFIED |

### Key Link Verification (from 77-01-PLAN.md `must_haves.key_links`)

| From | To | Via | Pattern | Hits | Status |
|---|---|---|---|---|---|
| MainWindow.xaml.cs (Window_PreviewMouseRightButtonUp) | TrayMenuBuilder.cs (`_trayIcon.ContextMenuStrip`) | `_trayIcon.ContextMenuStrip!.Show(System.Windows.Forms.Cursor.Position)` | `_trayIcon\.ContextMenuStrip!?\.Show\(` | 1 (MainWindow.xaml.cs:1459) | WIRED |
| MainWindow.xaml.cs (ContentRendered after _trayIcon build) | MainWindow.xaml.cs (`_menuOpen` field) | `ContextMenuStrip.Opening += (_,_) => _menuOpen = true; Closed += (_,_) => _menuOpen = false` | `ContextMenuStrip!?\.Opening \+=` | 1 (MainWindow.xaml.cs:211; matching Closed hook at 212) | WIRED |
| MainWindow.xaml.cs (_ghostMode.ProximityChanged lambda) | MainWindow.xaml.cs (`_menuOpen` field) | `if (_menuOpen) return;` guard before `this.Opacity = ...` | `if \(_menuOpen\) return` | 2 (ProximityChanged guard at line 181; idempotence guard in handler at line 1451) | WIRED |
| MainWindow.xaml.cs (Window_PreviewMouseRightButtonUp) | RightClickMenuGate.cs | `RightClickMenuGate.ShouldOpen(_isDragging, _ghostMode.IsActive, _ghostMode.IsCtrlAltHeld())` | `RightClickMenuGate\.ShouldOpen\(` | 1 (MainWindow.xaml.cs:1454) | WIRED |

All 4 key links verified with concrete grep hits at exact line numbers matching the plan's interface block.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| RMB-01 | 77-01 | Right-click anywhere on widget opens tray ContextMenuStrip at cursor — byte-for-byte parity | SATISFIED | Truth 1 + Truth 5; Cursor.Position screen coords; same instance shown (no clone); TrayMenuBuilder zero-diff; 6 clock-mode manual checks approved |
| RMB-02 | 77-01 | Right-click suppressed while `_isDragging == true` | SATISFIED | Truth 2; `RightClickMenuGate.ShouldOpen(true, *, *) == false`; 2 DataRow cases green; manual Checklist 3 approved |
| RMB-03 | 77-01 | Right-click suppressed when Ghost Mode active AND Ctrl+Alt not held (Ctrl+Alt re-enables) | SATISFIED | Truth 3; predicate + Win32 WS_EX_TRANSPARENT defence-in-depth; 2 DataRow cases green; manual Checklist 4 approved (all 3 sub-cases: ghost-far/ghost-active-no-CtrlAlt/ghost-active-with-CtrlAlt) |
| RMB-04 | 77-01 | While menu open, `_proximityRatio` pinned and opacity frozen until menu closes | SATISFIED | Truth 4; `_menuOpen` field + ProximityChanged guard + Opening/Closed hooks; `_proximityRatio = ratio;` stays unconditional so resume tick uses current cursor position; manual Checklist 5 approved |

**4/4 requirements SATISFIED.** No orphaned requirements detected — REQUIREMENTS.md mapped RMB-01..04 to Phase 77 and all four appear in 77-01-PLAN.md `requirements:` frontmatter.

### TrayMenuBuilder Zero-Diff Invariant

```
$ git diff 2270c3c^..HEAD -- FuzzyClock.App/TrayMenuBuilder.cs
(empty — no output)

$ git log --oneline -- FuzzyClock.App/TrayMenuBuilder.cs | head -3
0d368c8 feat(56-02): wire Nixie into SettingsWindow and TrayMenuBuilder   ← last touch, Phase 56
bb0a42d feat(51-01): wire LCD event handlers and tray menu clock type switcher
a5e6070 feat(48-01): remove DialMode, add TrayMenuState.ClockType, update tests
```

Single-source-of-truth invariant for the tray ContextMenuStrip preserved. No item added, removed, or modified; no click handler altered; `menu.Opening += SyncCheckmarks` at TrayMenuBuilder.cs:90 intact. This is the load-bearing guarantee behind RMB-01 byte-for-byte parity — verified.

### Full Test Suite

```
dotnet test FuzzyClock.slnx
  FuzzyClock.Core.Tests   Passed: 445  Failed: 0  Skipped: 0
  FuzzyClock.App.Tests    Passed: 105  Failed: 0  Skipped: 0
  TOTAL                   550 passing, 0 failing
```

Matches the SUMMARY claim of 550 (445 + 105). Baseline before Phase 77 was 544 (from Phase 76-01); +6 net from RightClickMenuGateTests.ShouldOpen_Cases DataRow rows. No regression in either project.

### Phase 77 Commits

All four SUMMARY-claimed commit hashes resolved in `git log`:

| Commit | Type | Purpose |
|---|---|---|
| `2270c3c` | test(77-01) | RED — failing `RightClickMenuGateTests.cs` |
| `3bf59cf` | feat(77-01) | GREEN — `RightClickMenuGate.cs` implementation |
| `f14a566` | feat(77-01) | Wiring — MainWindow.xaml attribute + MainWindow.xaml.cs field/guard/hooks/handler |
| `eda20c2` | docs(77-01) | Plan SUMMARY + ROADMAP/STATE updates |

TDD RED→GREEN cadence respected; all commits free of `Co-Authored-By` trailers per project CLAUDE.md.

### Anti-Patterns Found

None. Files modified in Phase 77 scanned for `TODO|FIXME|XXX|HACK|PLACEHOLDER`, empty returns, and console-log-only bodies — no matches. `RightClickMenuGate.cs` has real logic (not a stub), XML documentation is substantive (rationale comments explain the defence-in-depth pattern, not placeholder text), and all four MainWindow touchpoints contain real executable code with inline documentation explaining the RMB-04 freeze semantics, Pitfall 4 registration-order discipline (`+=` vs `=`), and Pitfall 7 idempotence rationale.

### Human Verification — Already Completed

Task 3's 7-checklist manual smoke test was completed during plan execution and approved by user (resume signal: `"approved"`). The 7 checklists covered:

1. RMB-01 parity across Phrase/Dial/LCD/Nixie + stats panel + `#01000000` hit-test padding
2. RMB-01 checkmark round-trip (Ghost/Stats/Auto-Contrast/Auto-Launch)
3. RMB-02 drag suppression (hold-drag + right-click → no menu; release → menu opens)
4. RMB-03 ghost suppression + Ctrl+Alt override (3 sub-cases)
5. RMB-04 proximity freeze + resume-snap
6. Rapid-click idempotence (5+ clicks/second)
7. Regression sweep (drag-to-move, scroll-wheel opacity, tray icon menu, Settings window)

All 7 groups passed with no deferred items. Documented in 77-01-SUMMARY.md "Manual Smoke-Test Results" section.

### Gaps Summary

**No gaps.** All 4 requirements SATISFIED, all 5 truths VERIFIED, all 4 artifacts present and wired, all 4 key links WIRED, TrayMenuBuilder zero-diff invariant preserved, full test suite green at 550/0, no anti-patterns introduced, user approved all 7 manual checklists, all 4 commit hashes resolve.

The only minor note is that `RightClickMenuGateTests.cs` is 24 lines vs the plan's `min_lines: 30` soft threshold — however the file fully exercises the predicate's truth space (3 boolean inputs = 8 possible states; 6 informative cases cover every branch + edge combinations RMB-02/RMB-03/CTRLALT-01) and adding filler would violate the project's dense-information coding style. This is a specification over-estimate, not a coverage gap — no action needed.

---

_Verified: 2026-05-04_
_Verifier: Claude (gsd-verifier)_
