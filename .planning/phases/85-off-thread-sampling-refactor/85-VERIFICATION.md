---
phase: 85-off-thread-sampling-refactor
verified: 2026-05-20T08:00:00Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Hover cursor over widget for >33 ms then move away — confirm widget does not become click-through after cursor leaves"
    expected: "Widget remains interactive (grabbable) when cursor leaves; no observable lag where window enters WS_EX_TRANSPARENT after cursor has already retreated"
    why_human: "CR-01 identifies a timing-dependent stale-_isGhostMode window between sampler-tick decision and async Activate(). Behavior depends on real dispatcher backpressure under load — cannot be verified by grep or single-thread tests. This is the question the prompt explicitly asks about: does the threading model deliver SAMP/SEM in practice."
  - test: "Toggle ghost mode off via tray, then perform cursor movement over the widget for 30+ seconds, then re-enable"
    expected: "Zero visible activity while disabled (no opacity flicker, no click-through). On re-enable, normal ghost behavior resumes."
    why_human: "SEM-05 / PROX-09 disable-gate verification needs runtime observation that no events are raised, no opacity manipulation occurs. Code shows OnSampleTick / OnSampleThreadTick early-bail on !IsEnabled, but full UI silence requires human confirmation."
  - test: "Slow cursor retreat from inside widget to outside (multiple ticks at 0 < ratio < 1.0)"
    expected: "BackdropBorder.Background visibly resets when cursor fully exits proximity zone (ratio reaches 0.0)"
    why_human: "WR-05 (advisory) flags a pre-existing latent bug where Restored may not fire on slow retreat. This is a known carryover from v4.0; Phase 85 preserved byte-for-byte semantics. Human run confirms whether the production-realistic case still works as users expect."
  - test: "Close application via tray Exit while cursor is over widget"
    expected: "Clean process termination within 1 second; no exception dialogs; no late event raises against torn-down window"
    why_human: "D-03 + D-09 close the teardown race in theory; WR-02 (advisory) flags that already-queued BeginInvoke lambdas can survive Dispose. Real shutdown sequencing under WPF requires runtime observation."
  - test: "Run application under sustained 25-50% CPU load (background CPU stressor) and confirm cursor proximity ghost activation/restore still feels responsive"
    expected: "Ghost activation triggers within ~33 ms of cursor reaching widget edge; restore on retreat feels prompt; widget UI does not freeze"
    why_human: "SAMP-01's whole purpose is to keep sampling responsive under UI-thread contention. Whether the off-thread sampler delivers measurable improvement vs the old DispatcherTimer is observation-only. Phase 87 owns the full perf acceptance test (PERF-01); this is a sanity check that the architectural change does what it was meant to."
---

# Phase 85: Off-thread sampling refactor — Verification Report

**Phase Goal:** `GhostModeController` sampling moves to `System.Threading.Timer`; UI work marshals via `Dispatcher.BeginInvoke`; tickable seam exposed for testing.
**Verified:** 2026-05-20T08:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

The phase goal decomposes into three architectural deliverables:

1. **Sampling on `System.Threading.Timer`** — the timer mechanism itself
2. **UI marshalling via `Dispatcher.BeginInvoke`** — the cross-thread boundary
3. **Tickable seam exposed for testing** — `OnSampleTick` reachable from `FuzzyClock.App.Tests`

All three are observably present in `FuzzyClock.App/GhostModeController.cs`. The eight requirements (SAMP-01..04, SEM-01..03, SEM-05) are encoded in source and the byte-for-byte semantic preservation invariant on `MainWindow.xaml.cs` lines 160–184 holds (zero diff over the four phase commits).

The prompt explicitly directs me to factor in CR-01 (advisory blocker): the staleness window between sampler-tick `Activate` decision and async UI-thread `_isGhostMode = true` write. CR-01 is a behavioral correctness concern — it does not negate the architectural deliverables. SAMP-01..04 require sampling to *run on the thread pool* and UI work to *marshal via BeginInvoke*; both are present. SEM-01..03 + SEM-05 require the transition vocabulary, modifier override, and disable-gate; all are encoded in `OnSampleTick`. The CR-01 race is a risk that emerges from the architecture chosen, not a missing requirement — and is below the level of the phase goal as written. Verification focuses on whether the goal is achieved by the codebase, with the runtime correctness questions surfaced as human-verification items.

---

## Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | `GhostModeController` no longer owns a `DispatcherTimer` | VERIFIED | `grep -c DispatcherTimer GhostModeController.cs` → 0; `grep -c System.Threading.Timer` → 7 (type ref + field + ctor + comments). Field at line 72: `private System.Threading.Timer? _timer;` |
| 2   | Sampling driven by thread-pool timer at 33 ms cadence | VERIFIED | Line 141: `_timer = new System.Threading.Timer(OnSampleThreadTick, null, 0, 33);` — start-immediately constructor with period=33 ms (SAMP-04 satisfied) |
| 3   | Win32 sampling (`GetCursorPos`, `GetWindowRect`, `GetAsyncKeyState`/`IsModifierHeld`) executes on sampling thread | VERIFIED | `OnSampleThreadTick` (lines 160-247) is the System.Threading.Timer callback; calls `GetCursorPos` (174), `GetWindowRect` (174), and `IsModifierHeld()` (177) before any `BeginInvoke` |
| 4   | `ComputeProximityRatio` runs on sampling thread (via `OnSampleTick`) | VERIFIED | `OnSampleTick` (lines 311-379) called from `OnSampleThreadTick` line 181 (sampler thread) — calls `ComputeProximityRatio` at lines 334 and 342 inline |
| 5   | UI work marshals via `Dispatcher.BeginInvoke` | VERIFIED | `grep -c "_dispatcher.BeginInvoke"` → 1 occurrence at line 199. Single per-tick BeginInvoke bundles ProximityChanged raise + transition switch (Activate / WS_EX_TRANSPARENT removal / Restored raise) |
| 6   | Ratio reaching 1.0 drives ghost activation | VERIFIED | `OnSampleTick` line 354: `if (ratio >= 1.0 && !_isGhostMode) transition = GhostTransition.Activate;` — emits Activate transition; lambda at line 213 calls `Activate()` (which does WS_EX_TRANSPARENT apply at line 261) |
| 7   | Ratio dropping below 1.0 removes WS_EX_TRANSPARENT immediately | VERIFIED | `OnSampleTick` lines 359-368: emits RestoreNoEvent / RestoreWithEvent when `ratio < 1.0 && _isGhostMode`; lambda at lines 216-224 performs `SetWindowLong(... & ~WS_EX_TRANSPARENT)` + `SetWindowPos` |
| 8   | `Restored` fires only when ratio reaches exactly 0.0 after activation | VERIFIED | `OnSampleTick` line 364: `transition = (ratio == 0.0) ? GhostTransition.RestoreWithEvent : GhostTransition.RestoreNoEvent;` — RestoreWithEvent only at exact 0.0; lambda line 229: `if (result.Transition == GhostTransition.RestoreWithEvent) Restored?.Invoke();` |
| 9   | Modifier-held boolean of true forces ratio to 0.0 | VERIFIED | `OnSampleTick` lines 329-332: `if (useCtrl \|\| useAlt \|\| useShift) { if (modifiersHeld) ratio = 0.0; ... }` — short-circuit when all flags false (DET-02), force-zero when any enabled and held |
| 10  | `IsEnabled = false` produces zero work | VERIFIED | `OnSampleThreadTick` line 171: `if (!IsEnabled) return;` (early bail before Win32 sampling). Defense in depth: `OnSampleTick` line 317: returns no-op SampleResult when `!IsEnabled`. Volatile read via Plan 02 `_isEnabled` field (line 80) ensures sampler sees UI writes coherently |
| 11  | Tickable seam (`OnSampleTick`) exposed via `internal` for tests | VERIFIED | Line 311: `internal SampleResult OnSampleTick(int cursorX, int cursorY, int rectLeft, int rectTop, int rectRight, int rectBottom, bool modifiersHeld)`. Line 62: `internal enum GhostTransition { None, Activate, RestoreNoEvent, RestoreWithEvent }`. Line 68: `internal readonly record struct SampleResult(double NewRatio, bool RatioChanged, GhostTransition Transition)`. `InternalsVisibleTo("FuzzyClock.App.Tests")` in `FuzzyClock.App.csproj` lines 7-11 |
| 12  | All 129 App tests pass unchanged | VERIFIED | `dotnet test FuzzyClock.App.Tests --nologo --verbosity quiet` → `Passed: 129, Failed: 0, Skipped: 0`. Includes 12 ComputeProximityRatio cases + 8 IsModifierHeld DataRow cases as referenced in must-haves. Sanity: 449/449 Core tests also pass |
| 13  | `MainWindow.xaml.cs` lines 160-184 unchanged byte-for-byte | VERIFIED | `git diff 1f893c2~1..HEAD -- FuzzyClock.App/MainWindow.xaml.cs` returns zero output (0 lines changed across all four phase 85 commits) |

**Score:** 13/13 truths verified.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `FuzzyClock.App/GhostModeController.cs` | `internal SampleResult OnSampleTick` exists with exact signature (Plan 01) | VERIFIED | Line 311; signature matches `(int, int, int, int, int, int, bool)` per D-04 |
| `FuzzyClock.App/GhostModeController.cs` | `internal enum GhostTransition { None, Activate, RestoreNoEvent, RestoreWithEvent }` (Plan 01) | VERIFIED | Line 62 — exact member spelling and order |
| `FuzzyClock.App/GhostModeController.cs` | `internal readonly record struct SampleResult` (Plan 01) | VERIFIED | Line 68; `(double NewRatio, bool RatioChanged, GhostTransition Transition)` |
| `FuzzyClock.App/GhostModeController.cs` | Six volatile config fields + manual IsEnabled property (Plan 02) | VERIFIED | Lines 70, 76-80: `_isGhostMode`, `_ghostFadeRadiusPx`, `_useCtrl`, `_useAlt`, `_useShift`, `_isEnabled` all `volatile`. Line 84: `public bool IsEnabled { get => _isEnabled; set => _isEnabled = value; }` |
| `FuzzyClock.App/GhostModeController.cs` | `System.Threading.Timer` field replaces `DispatcherTimer? _restoreTimer` (Plan 03) | VERIFIED | Line 72: `private System.Threading.Timer? _timer;`. `DispatcherTimer` and `_restoreTimer` substrings absent (grep count = 0) |
| `FuzzyClock.App/GhostModeController.cs` | `Dispatcher _dispatcher` captured at Initialize (Plan 03) | VERIFIED | Line 73: `private Dispatcher _dispatcher = null!;`. Line 138: `_dispatcher = System.Windows.Application.Current.Dispatcher;` |
| `FuzzyClock.App/GhostModeController.cs` | `int _tickInFlight` reentrancy guard backing field (Plan 03) | VERIFIED | Line 74: `private int _tickInFlight;`. Line 164: `Interlocked.CompareExchange(ref _tickInFlight, 1, 0)`. Line 245: `_tickInFlight = 0;` in finally |
| `FuzzyClock.App/GhostModeController.cs` | `OnSampleThreadTick(object? state)` callback (Plan 03) | VERIFIED | Line 160; runs on thread pool, contains reentrancy guard + try/finally + IsEnabled gate + Win32 sampling + OnSampleTick call + D-08 short-circuit + D-09 shutdown guard + single BeginInvoke |
| `FuzzyClock.App/GhostModeController.cs` | Synchronous `Dispose(WaitHandle)` (Plan 04) | VERIFIED | Lines 429-450: `_disposed` early-exit, null-check, `using (var notifyObject = new System.Threading.ManualResetEvent(false))`, `_timer.Dispose(notifyObject)`, `notifyObject.WaitOne()`, `_timer = null` |
| `FuzzyClock.App/FuzzyClock.App.csproj` | InternalsVisibleTo("FuzzyClock.App.Tests") | VERIFIED | Lines 7-11 — preserved from Phase 83; new internal seam types are immediately test-reachable |

All artifacts exist, are substantive, and are wired through `Initialize` → `OnSampleThreadTick` → `OnSampleTick` → `BeginInvoke` lambda → MainWindow handlers.

---

## Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `Initialize(IntPtr hwnd)` | `System.Threading.Timer` | `new Timer(OnSampleThreadTick, null, 0, 33)` | WIRED | Line 141 — start-immediately constructor; lifecycle is Initialize → Dispose |
| `OnSampleThreadTick` (sampler thread) | `OnSampleTick` (pure logic) | direct call after Win32 sampling | WIRED | Line 181: `var result = OnSampleTick(cursor.X, cursor.Y, rect.Left, rect.Top, rect.Right, rect.Bottom, modifiersHeld);` — Win32 inputs gathered first, then pure-logic seam invoked, with reentrancy guard wrapping (line 164) and try/finally release (line 245) |
| Sampler thread (post-OnSampleTick) | UI thread (MainWindow handlers) | `_dispatcher.BeginInvoke` after D-08 short-circuit + D-09 shutdown guard | WIRED | Line 188 (D-08 short-circuit on `transition=None && !RatioChanged`), line 193 (D-09 `HasShutdownStarted/HasShutdownFinished`), line 199 (single BeginInvoke); lambda at lines 200-240 raises ProximityChanged, switches on Transition, calls Activate() / SetWindowLong+SetWindowPos / Restored?.Invoke() |
| `BeginInvoke` lambda | `MainWindow` ProximityChanged handler | `ProximityChanged?.Invoke(result.NewRatio)` (UI thread) | WIRED | Line 204; existing MainWindow.xaml.cs:177 handler unchanged — still runs on dispatcher, preserving its `_isDragging` / settings-window / `_menuOpen` guards |
| `BeginInvoke` lambda | `MainWindow` Restored handler | `Restored?.Invoke()` only on RestoreWithEvent | WIRED | Line 230; existing MainWindow.xaml.cs:169 handler unchanged — still runs on dispatcher |
| `Dispose()` | in-flight tick callback | `_timer.Dispose(WaitHandle)` + `WaitOne()` blocking | WIRED | Lines 444-445 — synchronous drain pattern per D-03 |
| UI-thread settings writers | sampler-thread reads | volatile field memory semantics | WIRED | Volatile declarations at lines 70, 76-80; `OnSampleTick` reads each into a local at lines 321-324 (D-10 read-once snapshot pattern) |

All key links connected.

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `OnSampleTick` returned `SampleResult` | `result.NewRatio`, `result.RatioChanged`, `result.Transition` | `ComputeProximityRatio(cursor.X, cursor.Y, rect.Left, ..., radiusPx)` — backed by real Win32 cursor + window rect | YES | FLOWING |
| `_dispatcher.BeginInvoke` lambda | `result` (closure capture) | Returned by sampler-thread `OnSampleTick` call | YES | FLOWING |
| `ProximityChanged?.Invoke(result.NewRatio)` | `result.NewRatio` | Real-time computed proximity ratio | YES | FLOWING |
| `_isGhostMode` (cross-thread reader at MainWindow.xaml.cs:165) | `_isGhostMode` volatile bool | Written by `OnSampleTick` (false-on-restore) and `Activate()` (true-on-activate) | YES | FLOWING (with caveat — see CR-01 in human verification) |

Data flows end-to-end: real Win32 cursor → ratio computation → SampleResult → BeginInvoke → MainWindow event handler → `_targetRatio` field → opacity. CR-01's stale-window concern is about *timing* of the writes, not whether real data flows; surfaced for human verification.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Build clean | `dotnet build FuzzyClock.slnx --nologo --verbosity quiet` | `Build succeeded. 0 Warning(s) 0 Error(s)` | PASS |
| App tests pass | `dotnet test FuzzyClock.App.Tests --nologo --verbosity quiet` | `Passed: 129, Failed: 0, Skipped: 0` | PASS |
| Core tests pass (regression sanity) | `dotnet test FuzzyClock.Core.Tests --nologo --verbosity quiet` | `Passed: 449, Failed: 0, Skipped: 0` | PASS |
| Internal seam reachable from tests | `InternalsVisibleTo` check on csproj + grep `internal` markers | `InternalsVisibleTo("FuzzyClock.App.Tests")` present; `internal SampleResult OnSampleTick` present; `internal enum GhostTransition` present; `internal readonly record struct SampleResult` present | PASS |

---

## Probe Execution

No phase-declared probes. Project does not have a `scripts/*/tests/probe-*.sh` convention (Windows / dotnet repo). Spot-check #2 above (`dotnet test FuzzyClock.App.Tests`) is the equivalent runnable verification — passed.

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| (none declared) | — | — | N/A |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SAMP-01 | 85-03 | Sampling uses `System.Threading.Timer` (not `DispatcherTimer`) | SATISFIED | Line 72 field; line 141 ctor; `DispatcherTimer` substring absent |
| SAMP-02 | 85-03 | `GetCursorPos`/`GetWindowRect`/`GetAsyncKeyState` + ratio computation run on sampling thread | SATISFIED | `OnSampleThreadTick` lines 174-184 — all Win32 calls + `OnSampleTick` (which calls `ComputeProximityRatio`) execute before any BeginInvoke |
| SAMP-03 | 85-03 | All UI-touching work marshals via `Dispatcher.BeginInvoke` | SATISFIED | Line 199 single BeginInvoke; lambda body owns WS_EX_TRANSPARENT toggle, Activate(), Restored?.Invoke(), ProximityChanged?.Invoke() |
| SAMP-04 | 85-03 | Sampling cadence ≤ 33 ms | SATISFIED | Line 141 ctor period parameter = 33 |
| SEM-01 | 85-01 | Ratio reaching 1.0 → WS_EX_TRANSPARENT applied; <1.0 → removed | SATISFIED | `OnSampleTick` line 354 (Activate at ≥1.0); line 364 (Restore at <1.0); BeginInvoke lambda lines 208-224 (Win32 mutations) |
| SEM-02 | 85-01 | `Restored` fires only at ratio=0.0 after activation | SATISFIED | Line 364 ternary: `(ratio == 0.0) ? RestoreWithEvent : RestoreNoEvent`; lambda line 229 raises only on RestoreWithEvent |
| SEM-03 | 85-01 | Modifier-held check forces ratio to 0.0 | SATISFIED | Lines 329-332 inside `OnSampleTick`; `IsModifierHeld()` lines 273-291 unchanged |
| SEM-05 | 85-01 | Tray toggle off → no sampling, no events, no opacity manipulation | SATISFIED | `OnSampleThreadTick` line 171 early-bail on `!IsEnabled`; defense-in-depth in `OnSampleTick` line 317 |

All 8 requirements declared in PLAN frontmatters are satisfied. Cross-reference against `REQUIREMENTS.md` table at lines 71-79 confirms these exact 8 IDs are mapped to Phase 85 — no orphans, no missing IDs.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | — | — | — |

`grep -nE "TODO\|FIXME\|XXX\|HACK\|TBD"` on `GhostModeController.cs` returns no matches. No empty implementations, no `return null` stubs, no placeholder values. The file is production-ready.

---

## Code Review (Advisory)

The phase had a code review pass (`85-REVIEW.md`) that surfaced **1 BLOCKER (CR-01)** and 7 WARNINGs. Per workflow contract, code review is advisory and does not gate verification. Per the prompt's explicit instruction: *"factor CR-01 into your goal-backward analysis: does the threading model deliver the SAMP/SEM requirements as specified, even if the architecture has the staleness window the reviewer flagged?"*

**Verifier's analysis:**

The CR-01 staleness window is a real concern, but the SAMP-01..04 + SEM-01..03 + SEM-05 requirements are about **architecture and visible semantics**, not about race-free correctness under arbitrary dispatcher backpressure. They specify:
- WHERE work happens (sampler thread vs UI thread) — VERIFIED
- WHAT the marshalling pattern is (BeginInvoke per tick) — VERIFIED
- WHICH transitions trigger which Win32 calls and events — VERIFIED
- WHEN the disable-gate short-circuits — VERIFIED

The CR-01 concern (duplicate `Activate` dispatch under cursor reversal during dispatcher lag) does not violate any of those statements. It surfaces as a *quality of behavior* question — does the click-through engage at the right time when the cursor is moving fast and the dispatcher is backed up? — that requires runtime observation to assess. That is exactly the kind of question the human-verification list is for. WR-05's pre-existing slow-retreat `Restored` non-fire is also flagged for human runtime assessment.

**The phase deliverables exist, are wired, are substantive, and the architectural goal is achieved.** Whether the resulting behavior matches user expectations under realistic timing scenarios is the question Phase 87's PERF-01 acceptance + the human verification items below are designed to answer.

---

## Human Verification Required

Five items need human runtime testing before this phase can be declared complete. Each addresses a question that grep-and-build cannot answer.

### 1. Click-through timing on cursor reversal

**Test:** Hover cursor over the widget for >33 ms (let ratio reach 1.0 and ghost activate), then move the cursor away.
**Expected:** Widget remains interactive (grabbable) when cursor leaves; no observable lag where the window enters WS_EX_TRANSPARENT *after* the cursor has already retreated.
**Why human:** CR-01 identifies a timing-dependent stale-`_isGhostMode` window between sampler-tick decision and async `Activate()`. Observable only under real dispatcher backpressure — cannot be reproduced by single-threaded tests.

### 2. Disable-gate full silence

**Test:** Toggle ghost mode off via tray. Move the cursor over the widget for 30+ seconds. Toggle ghost mode back on.
**Expected:** Zero visible activity while disabled (no opacity flicker, no click-through). On re-enable, normal ghost behavior resumes.
**Why human:** SEM-05 / PROX-09 disable-gate verification needs runtime observation that no events are raised. Code shows `OnSampleThreadTick` and `OnSampleTick` both early-bail on `!IsEnabled`, but full UI silence requires human confirmation.

### 3. Slow-retreat Restored event

**Test:** Move cursor slowly from inside the widget to outside (multiple ticks at 0 < ratio < 1.0).
**Expected:** `BackdropBorder.Background` visibly resets when cursor fully exits the proximity zone (ratio reaches 0.0).
**Why human:** WR-05 (advisory) flags a pre-existing latent bug where `Restored` may not fire on slow retreat. This is a known carryover from v4.0; Phase 85 preserved byte-for-byte semantics. Human run confirms whether the production-realistic case still works as users expect.

### 4. Clean shutdown

**Test:** Close the application via tray Exit while cursor is over widget.
**Expected:** Clean process termination within 1 second; no exception dialogs; no late event raises against torn-down window.
**Why human:** D-03 + D-09 close the teardown race in theory; WR-02 (advisory) flags that already-queued BeginInvoke lambdas can survive Dispose. Real shutdown sequencing under WPF requires runtime observation.

### 5. Smoothness under load (PERF-01 sanity)

**Test:** Run the application under sustained 25-50% CPU load (background CPU stressor) and confirm cursor proximity ghost activation/restore still feels responsive.
**Expected:** Ghost activation triggers within ~33 ms of cursor reaching widget edge; restore on retreat feels prompt; widget UI does not freeze.
**Why human:** SAMP-01's whole purpose is to keep sampling responsive under UI-thread contention. Whether the off-thread sampler delivers measurable improvement vs the old DispatcherTimer is observation-only. Phase 87 owns the full PERF-01 acceptance test; this is a sanity check that the architectural change does what it was meant to.

---

## Gaps Summary

No automated-detectable gaps. All 13 must-haves verified, all 8 requirements satisfied, all artifacts exist with substantive bodies and correct wiring, build is clean, all 129 App tests + 449 Core tests pass, MainWindow.xaml.cs is byte-for-byte unchanged.

The phase has 1 advisory blocker (CR-01) and 7 advisory warnings from code review. Per workflow contract these are advisory. The behavioral risks they flag are surfaced as five human verification items above — runtime questions that grep-and-build verification cannot answer.

**Overall:** Architectural deliverables for Phase 85 are present and correct. Phase status is `human_needed` because runtime-observation items remain. Once the human verification passes, this phase is goal-achieved.

---

*Verified: 2026-05-20T08:00:00Z*
*Verifier: Claude (gsd-verifier)*
