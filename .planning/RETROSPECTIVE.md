# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v3.8 — Dial Settings

**Shipped:** 2026-03-23
**Phases:** 1 (60) | **Plans:** 1

### What Was Built
- Three dial decoration checkboxes (Hour Ticks, Minute Dots, Hour Numbers) added to Settings > Appearance as a new "Dial Face" row at Grid Row 5
- Row gated with `Visibility.Collapsed` for non-Dial clock styles; gating lives in `SetClockStyleButtonStates` so both open-time and button-click paths are covered
- `PopulateControls` reads all three from `SettingsSnapshot`; handlers fire pre-existing `HourTicksChanged`/`MinuteDotsChanged`/`HourNumbersChanged` events through the `_suppressEvents` guard — no new event infrastructure needed
- 299/299 MSTest tests pass; 6 pre-existing LCD stub warnings unchanged

### What Worked
- Backend was fully implemented in a prior milestone (Phase 59 data model + stub events); this plan was pure UI wiring — a well-scoped single-plan milestone
- The `_suppressEvents` guard + `SetClockStyleButtonStates` centralization pattern (from Phase 59) made the implementation mechanical and correct by construction
- Plan file was precise: explicit XAML row template, exact code-behind methods, clear verification checklist — executor had zero ambiguity

### What Was Inefficient
- None notable — the milestone was tiny and executed in one session (~2 min 19s execution time per summary)

### Patterns Established
- Label `VerticalAlignment=Top` for rows whose column 1 is a multi-element StackPanel — matches Phrase Wrap row pattern; should be the standard for future multi-checkbox rows
- Centralize Dial-mode visibility gating in `SetClockStyleButtonStates` (not in `PopulateControls` or individual handlers) so all entry points stay consistent

### Key Lessons
1. Pre-implementing the backend (events, AppSettings fields, SettingsSnapshot fields) in a prior milestone makes the UI wiring milestone fast and reliable — the pattern scales well for future Settings tab additions
2. Single-plan milestones with a fully-complete backend are the fastest GSD cycle: context → UI spec → plan → execute in one session

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 2 (context/planning + execution)
- Notable: ~2 min execution; smallest milestone in project history; clean scope-bounding paid off

---

## Milestone: v3.7 — Nixie Clock

**Shipped:** 2026-03-23
**Phases:** 2 (58–59) | **Plans:** 2

### What Was Built
- `ClockType` enum replaces `DialMode bool` across `AppSettings`/`SettingsSnapshot`; JSON migration preserves existing preferences; LCD fields added for future use
- SettingsWindow 3-button Clock Style rail (Phrase / Dial / Nixie) with `ClockTypeChanged` event and all 7 event declarations (6 LCD stubs)
- Nixie tube clock face selectable in Settings; `ClockType.Nixie` persists to settings.json and restores correctly
- Absent-field deserialization test (`Deserialize_MissingClockType_DefaultsToPhrase`) closes the data model verification
- BACK-05: 5 `ContentBorder.Background` assignments removed from hover handlers; `BackdropBorder` is now sole hover backdrop — no double-layer visual artifact

### What Worked
- Splitting the work into a focused data model phase (58) and a UI/build-clean phase (59) kept each plan narrow and verifiable
- The plan file for Phase 59 was exceptionally precise — exact line numbers, exact removal targets — which made the executor's job deterministic; zero ambiguity about what to delete
- Absent-field test pattern (minimal JSON string, not full round-trip) is the right isolation strategy for default-value coverage
- The existing NixieClockView/NixieDigit controls were already complete; the milestone's job was wiring, not building — scope was correctly bounded

### What Was Inefficient
- Worktree isolation caused a split-commit issue: the code change committed to the worktree branch while the docs commit went to master; required a cherry-pick to reconcile. This is a known edge case in the parallel executor pattern when the worktree is created from an older branch point
- The traceability table for NIX-04 was left with two "Pending" rows (a table update bug from the executor); caught in verification but adds minor cleanup noise

### Patterns Established
- When a plan removes specific lines, list exact line numbers AND surrounding context lines that must not be touched — eliminates deletion ambiguity for the executor
- Worktree isolation for single-file edits adds overhead; for plans that modify only one file, inline execution avoids the cherry-pick reconciliation step
- Declaring stub events in SettingsWindow satisfies compilation while deferring UI implementation — a clean "just enough" pattern for future capability plumbing

### Key Lessons
1. Precise plan files (exact line numbers, exact patterns, explicit "do not touch" callouts) are worth the upfront effort — they eliminate executor ambiguity and verification is clean
2. Worktree branch point matters: if the worktree is created from an older branch than HEAD, docs commits and code commits can land on divergent histories; check and cherry-pick after each parallel wave
3. Stub events are a valid scaffold: declaring all 7 events now means future LCD work has zero interface friction

### Cost Observations
- Model mix: ~100% sonnet
- Sessions: 2 (one for planning/context, one for execution)
- Notable: small focused milestone completed in a single execution session; precise plan files drove efficient executor output

---

## Milestone: v3.6.2 — Contrast Flicker Regression Fix

**Shipped:** 2026-03-19
**Phases:** 1 (58) | **Plans:** 1

### What Was Built
- `SHELLDLL_DefView` added to shell class exclusion list in `HasAppWindowBeneath` — desktop icon host window missing from the original v3.6.1 whitelist
- `DwmGetWindowAttribute(DWMWA_CLOAKED)` check added after the class filter: Windows 11 UWP shell panels (`ApplicationFrameWindow` — Start, Search, Widgets) stay in Z-order when dismissed with `IsWindowVisible=true`; DWM cloaked attribute (non-zero = hidden by DWM) discriminates them from real app windows
- FIX-04, FIX-05, FIX-06 human-verified; 274 tests pass, 0 regressions

### What Worked
- Two-phase fix strategy (add exclusion → human test → add DWM check) was correct: first commit fixed desktop-with-icons, second commit fixed Windows 11 shell panels; human testing caught the gap
- Human-verify checkpoint before milestone completion is essential — visual flicker cannot be unit-tested; the checkpoint proved its value by catching an incomplete fix
- DWM cloaked check is the right Win32 pattern for "window alive in Z-order but hidden from user" — avoids fragile class-name heuristics for UWP shell frames
- Surgical single-file fix maintained: `ContrastRefreshController.cs` only, no interface changes

### What Was Inefficient
- Root cause analysis at v3.6.1 was too narrow (only considered empty desktop); a broader matrix at that time might have included "desktop with icons" and "Windows 11 with shell panels" scenarios
- Two commits were needed (iterative discovery) rather than one — inherent to visual bugs but points to more thorough root cause enumeration upfront

### Patterns Established
- Shell exclusion list extension protocol: update (1) the condition, (2) the XML doc summary, and (3) the inline `Tick` comment — all three must stay in sync
- DWM cloaked-window check: `DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED=14, out uint result, 4)` — non-zero result means window is hidden by DWM; call after class filter to keep hot path lean
- `ApplicationFrameWindow` cannot be added to shell exclusion list — it hosts real UWP apps; cloaked attribute is the only reliable discriminator

### Key Lessons
1. Shell window detection on Windows 11 requires both class name filtering AND DWM cloaked state — `IsWindowVisible` returns true for dismissed UWP shell panels
2. Visual bug regression matrices should include: empty desktop, desktop with icons, Windows 11 shell panels open, Windows 11 shell panels dismissed
3. When the v3.6.1 whitelist was defined, SHELLDLL_DefView was an obvious omission — enumerate all Windows desktop-shell window classes during the original investigation, not just what's visible in the hierarchy at that moment

### Cost Observations
- Model mix: 100% sonnet
- Sessions: 1
- Notable: ~30 min end-to-end; iterative human-verify is correct process for visual correctness, not a workflow inefficiency

---

## Milestone: v3.6.1 — Contrast Flicker Fix

**Shipped:** 2026-03-19
**Phases:** 1 (57) | **Plans:** 1

### What Was Built
- `HasAppWindowBeneath` private static helper in `ContrastRefreshController`: Z-order walk from `GetWindow(widgetHwnd, GW_HWNDNEXT)`, checking `IsWindowVisible`, rect overlap, and class name against shell whitelist (Progman, WorkerW, SysListView32)
- Guard in `Tick` that skips BitBlt sampling and holds `_contrastState` stable when only shell windows are beneath — eliminates oscillation feedback loop over empty desktop
- `Overlaps` helper: four-inequality RECT intersection with no extra P/Invoke surface
- FIX-01, FIX-02, FIX-03 human-verified; 274 tests pass, 0 regressions

### What Worked
- Root cause analysis was precise: the oscillation was a feedback loop — backdrop sampling its own backdrop — resolved by detecting "no app window beneath" rather than patching sampling values
- Z-order walk seeded from the widget's next Z-peer (GW_HWNDNEXT) is the correct "what's below me" pattern and was clean to implement
- Single-file change (`ContrastRefreshController.cs`) with no interface changes or refactoring — true surgical fix
- Human-verify checkpoint confirmed all three requirements before completion

### What Was Inefficient
- None notable — small focused milestone with clear requirements and a single implementation path

### Patterns Established
- `HasAppWindowBeneath` Z-order walk pattern: seed with `GetWindow(widgetHwnd, GW_HWNDNEXT)` to skip widget; iterate via `GW_HWNDNEXT`; check `IsWindowVisible` + `Overlaps` + `GetClassName` shell whitelist
- Hold `_contrastState` stable (return without mutation) when sampling should be skipped — preserves hysteresis state from prior valid samples

### Key Lessons
1. When a feature oscillates, look for a feedback loop before tuning thresholds — the flicker was caused by the contrast sampler reading its own backdrop color
2. Shell window class whitelist (Progman, WorkerW, SysListView32) is a stable fingerprint for "empty desktop" detection on Windows
3. Z-order walk is simple and reliable for "what's beneath this window" detection — no hooking or event subscription needed

### Cost Observations
- Model mix: 100% sonnet
- Sessions: 1
- Notable: entire fix (research → plan → implement → test → human-verify) completed in under 1 hour

---

## Milestone: v3.5 — Phrase Wrap + Installer

**Shipped:** 2026-03-18
**Phases:** 8 (48–55) | **Plans:** 12

### What Was Built
- Dark-mode Settings window via WPF ThemeMode="Dark" — zero style leakage to MainWindow
- Named-pipe single-instance IPC + AbandonedMutexException crash recovery
- 8px post-DragMove edge snapping + ResetToDefaults phrase/locale fix
- Per-user Inno Setup installer (no UAC, Start Menu, upgrade-safe) + GitHub Actions CI release pipeline (version-stamped, SHA256 checksums, draft release)
- PhraseWrapService with midpoint + natural pause split algorithms; Inlines-based WPF renderer
- IPhraseProvider.GetSegmentKey() — stable bucket identity independent of random selection; phrase guards against spurious tick changes
- Full-widget BackdropBorder (phrase+date+stats+uptime); BackdropAlwaysVisible; BackdropOpacityPercent slider
- PoeticPhraseProvider rewritten: 48 templates all naming the hour via {h}/{h1}; GetStructuredPhrase splits qualifier/hour-word for typographic emphasis

### What Worked
- Wave-based parallel execution kept each plan self-contained — the executor model worked cleanly across all 12 plans
- ThemeMode="Dark" proved far simpler than manual style templates — one attribute replaced dozens of hardcoded colors
- Static class pattern (PhraseWrapService, AutoLaunchService) continued to pay off: no DI wiring, easily testable
- SUMMARY.md-as-contract pattern for subagents maintained clean handoffs with zero context bleed
- 274 tests provided high confidence throughout — no regressions discovered post-execution

### What Was Inefficient
- Phases 53/54/55 were added post-planning after v3.5 was initially scoped at phases 50-52; iterative scope additions work but require discipline to avoid milestone drift
- The ROADMAP.md became inconsistent (progress table stopped at phase 52) during execution — need to update progress table as phases complete, not just at milestone end

### Patterns Established
- `{h}`/`{h1}` placeholder system for phrase templates: evaluated at call time from a `HourWords[hour12]` indexed array
- Named-pipe IPC pattern for single-instance bring-to-front: `WaitForConnection` / `Connect` within 500ms timeout
- Inno Setup `[AppMutex]` directive for detecting running instances during install
- `GetSegmentKey()` as a required interface method on `IPhraseProvider` — decouples bucket identity from phrase randomization

### Key Lessons
1. Scope creep mid-milestone is fine when phases are small and self-contained — but update the milestone/roadmap header when scope expands
2. `ThemeMode="Dark"` is the correct WPF approach for dark-mode secondary windows — manual style overrides are fragile
3. Phase Detail sections in ROADMAP.md become stale fast; keep them in the archive and only track summary lines in the live ROADMAP
4. Test count as a health signal: 224 → 274 over v3.5 confirmed new functionality was properly covered

### Cost Observations
- Model mix: 100% sonnet (executor + verifier)
- Sessions: 1 (all 8 phases executed in a single session)
- Notable: wave-based parallel execution with fresh 200k subagent contexts kept orchestrator under 15%

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 3 | 7 | Initial GSD workflow established |
| v2.5 | 3 | 3 | CI gate + test extraction patterns |
| v3.2 | 7 | 16 | Settings window + multilingual — largest milestone to date |
| v3.5 | 8 | 12 | Installer + CI pipeline shipped; wave parallelism at scale |
| v3.6.1 | 1 | 1 | Surgical single-file fix; Z-order walk pattern established |
| v3.6.2 | 1 | 1 | Z-order walk extended: SHELLDLL_DefView + DWM cloaked check for Win11 |

### Cumulative Quality

| Milestone | Tests | Notes |
|-----------|-------|-------|
| v2.5 | 73 | Core extraction baseline |
| v3.1 | 122 | Battery + DateFormatter coverage |
| v3.2 | 224 | PhraseEngine + settings coverage |
| v3.5 | 274 | Wrap, segment-key, poetic coverage |
| v3.6.1 | 274 | No new tests; existing suite confirmed no regression |
| v3.6.2 | 274 | No new tests; existing suite confirmed no regression |

### Top Lessons (Verified Across Milestones)

1. **Static pure helpers** (UptimeFormatter, DialGeometry, DateFormatter, PhraseWrapService) are the right extraction pattern for Core — testable, zero WPF dependency
2. **AppSettings init-property records** provide forward/backward JSON compatibility with zero attributes
3. **ContextMenu_Opened for IsChecked sync** is the reliable WPF pattern — never touch IsChecked in click handlers
4. **`ApplySettings()` before `Show()`** is the safe startup invariant — any helper that calls UpdateLayout()/Clamp() must NOT be called from ApplySettings()
5. **Subagent-per-plan** with fresh 200k context windows is more reliable than extended sessions for execution-heavy phases
