# Phase 57: Contrast Flicker Fix - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the feedback loop that causes color oscillation when `AutoContrastEnabled` or `BackdropAlwaysVisible` is active and the widget is positioned over an empty desktop (no application window beneath). Correct contrast-switching over application windows must be preserved. No new features, no structural refactors beyond what is needed.

</domain>

<decisions>
## Implementation Decisions

### Fix strategy
- HWND inspection: before sampling, walk the Z-order downward from the widget's HWND using `GetWindow(GW_HWNDNEXT)` to find windows that overlap the widget rect
- For each visible, overlapping window, check its class name via `GetClassName`
- Desktop-shell classes to treat as "empty desktop": `"Progman"`, `"WorkerW"`, `"SysListView32"`
- If only desktop-shell windows are found beneath the widget, skip the sample tick entirely (`return;`) — do not call `ContrastSamplerService.Sample`
- If any non-shell window is found, proceed with the normal BitBlt sample path

### Empty desktop behavior
- When skipping (empty desktop detected): hold current state — do not modify `_contrastState`, do not fire `ColorChanged`
- The same HWND-inspection skip covers both FIX-01 (bare desktop) and FIX-02 (`BackdropAlwaysVisible`) — no special-casing for backdrop needed

### Fix location
- Add `HasAppWindowBeneath(IntPtr hwnd, RECT widgetRect)` as a private static helper on `ContrastRefreshController`
- Add the skip guard at the top of `ContrastRefreshController.Tick`, before the `ContrastSamplerService.Sample` call
- `ContrastSamplerService` and `ContrastService` are untouched

### Change scope
- `ContrastRefreshController.cs` is the only file to modify
- `ContrastSamplerService.cs`, `ContrastService.cs`, and all test files are untouched
- No new unit tests — Win32 HWND inspection is not unit-testable without OS mocking; existing 274 tests confirm no regression; manual verification covers FIX-01/02/03

### Claude's Discretion
- Exact Win32 P/Invoke declarations needed for `GetWindow`, `GetClassName`, `GetWindowRect`, `IsWindowVisible` (may already exist or need adding)
- How to handle the widget's own HWND appearing in the Z-order walk (skip it by comparing to the known `_hwnd`)
- Whether to check `GetWindowRect` overlap or use `IntersectRect` for accuracy

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — FIX-01, FIX-02, FIX-03 acceptance criteria (the three stabilization requirements)

### Existing implementation
- `FuzzyClock.App/ContrastRefreshController.cs` — owns the 500ms timer; Z-order walk goes in `Tick()`
- `FuzzyClock.App/ContrastSamplerService.cs` — BitBlt sampler; read to understand existing P/Invoke setup but do not modify
- `FuzzyClock.Core/ContrastService.cs` — WCAG math + hysteresis state machine; read for context; do not modify

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ContrastRefreshController.Tick`: already has a `_shouldSkip` guard pattern — the new HWND check slots in right after `_shouldSkip!()`
- `ContrastSamplerService`: already has `GetDesktopWindow`, `GetDC`, `ReleaseDC` P/Invokes — `GetWindow`, `GetClassName`, `GetWindowRect`, `IsWindowVisible` are the additional Win32 calls needed (declare them in `ContrastRefreshController`)
- `_window` field on `ContrastRefreshController`: provides the WPF window reference; `_hwnd` can be obtained via `new WindowInteropHelper(_window).Handle`

### Established Patterns
- P/Invoke declarations are private static within the class that uses them (see `ContrastSamplerService` and `MainWindow`)
- `PresentationSource.FromVisual` + `TransformToDevice` for WPF-to-physical-pixel conversion (already used in `Tick` for `px, py, pw, ph`)

### Integration Points
- New guard is a 3-5 line addition inside `ContrastRefreshController.Tick`, after the existing `_shouldSkip` check
- No changes to event signatures, public interface, or MainWindow wiring

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for the Win32 Z-order walk.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 57-contrast-flicker-fix*
*Context gathered: 2026-03-19*
