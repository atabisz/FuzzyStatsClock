---
status: partial
phase: 85-off-thread-sampling-refactor
source: [85-VERIFICATION.md]
started: 2026-05-20T08:00:00Z
updated: 2026-05-20T08:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Click-through timing on cursor reversal
expected: Widget remains interactive (grabbable) when cursor leaves; no observable lag where the window enters WS_EX_TRANSPARENT after the cursor has already retreated.
result: [pending]
why_human: CR-01 staleness window between sampler-tick decision and async Activate(). Observable only under real dispatcher backpressure.

### 2. Disable-gate full silence
expected: Toggle ghost mode off via tray. Move cursor over widget for 30+ seconds. Zero visible activity while disabled (no opacity flicker, no click-through). On re-enable, normal ghost behavior resumes.
result: [pending]
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
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
