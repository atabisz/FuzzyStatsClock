---
status: diagnosed
phase: 85-off-thread-sampling-refactor
source: [85-VERIFICATION.md]
started: 2026-05-20T08:00:00Z
updated: 2026-05-20T08:30:00Z
---

## Current Test

[failed — see Gaps]

## Tests

### 1. Click-through timing on cursor reversal
expected: Widget remains interactive (grabbable) when cursor leaves; no observable lag where the window enters WS_EX_TRANSPARENT after the cursor has already retreated.
result: [pending]
why_human: CR-01 staleness window between sampler-tick decision and async Activate(). Observable only under real dispatcher backpressure.

### 2. Disable-gate full silence
expected: Toggle ghost mode off via tray. Move cursor over widget for 30+ seconds. Zero visible activity while disabled (no opacity flicker, no click-through). On re-enable, normal ghost behavior resumes.
result: failed
detail: With ghost mode disabled, widget stays click-through (cannot drag/move, cannot open context menu directly on the clock). Systray menu still works. Reproducer: toggle ghost mode off while widget is currently ghosted (WS_EX_TRANSPARENT applied, Opacity=0) — the sampler early-bails on !IsEnabled at GhostModeController.cs:171, so the WS_EX_TRANSPARENT removal path at lines 216-224 never runs. Widget stays click-through forever until ghost mode is re-enabled.
why_human: SEM-05 / PROX-09 disable-gate verification needs runtime observation that no events are raised.

### 3. Slow-retreat Restored event
expected: Move cursor slowly from inside widget to outside (multiple ticks at 0 < ratio < 1.0). BackdropBorder.Background visibly resets when cursor fully exits proximity zone (ratio reaches 0.0).
result: [pending]
why_human: WR-05 (advisory) flags a pre-existing latent bug where Restored may not fire on slow retreat. Phase 85 preserved byte-for-byte semantics; human run confirms production behavior.

### 4. Clean shutdown
expected: Close application via tray Exit while cursor is over widget. Clean process termination within 1 second; no exception dialogs; no late event raises against torn-down window.
result: [pending]
why_human: D-03 + D-09 close teardown race in theory; WR-02 (advisory) flags already-queued BeginInvoke lambdas can survive Dispose. Real shutdown sequencing under WPF requires runtime observation.

### 5. Smoothness under load (PERF-01 sanity)
expected: Run application under sustained 25-50% CPU load. Ghost activation triggers within ~33 ms of cursor reaching widget edge; restore on retreat feels prompt; widget UI does not freeze.
result: [pending]
why_human: SAMP-01's purpose is to keep sampling responsive under UI-thread contention. Phase 87 owns full PERF-01 acceptance test; this is a sanity check that the architectural change does what it was meant to.

## Summary

total: 5
passed: 0
issues: 1
pending: 4
skipped: 0
blocked: 0

## Gaps

### G1. Disable-gate fails to restore widget when toggled while ghosted
status: failed
source_test: 2
requirement: SEM-05
description: When ghost mode is toggled off via tray while the widget is currently in ghost state (WS_EX_TRANSPARENT applied, Opacity=0), the widget stays click-through and invisible-or-faded forever until ghost mode is re-enabled. The sampler early-bails on !IsEnabled at GhostModeController.cs:171, so neither the WS_EX_TRANSPARENT removal nor the Restored event fires.
impact: User cannot drag/move the widget or open the context menu directly on it after disabling ghost mode while ghosted. Tray menu still works (recovery path), so the issue is interaction lockout rather than total dataloss. SEM-05's "tray toggle off → widget fully restored, no further sampling" is violated.
fix_direction: On IsEnabled true→false edge, if `_isGhostMode == true`, perform a one-time UI restore: remove WS_EX_TRANSPARENT, clear `_isGhostMode`, raise Restored (so MainWindow resets Opacity and BackdropBorder.Background). Two implementation options:
  (a) Setter-driven: detect the edge in the IsEnabled property setter, marshal a one-shot restore via _dispatcher.BeginInvoke. Simple, no extra timer pass needed.
  (b) Sampler-driven: replace `if (!IsEnabled) return;` with a path that, when ghosted-but-disabled, emits a synthetic RestoreWithEvent transition then bails. Keeps all UI work in one BeginInvoke site.
recommendation: Option (a) — the setter is the natural place for an edge-triggered side effect, and it avoids coupling the disable-gate cleanup to the timer cadence.

