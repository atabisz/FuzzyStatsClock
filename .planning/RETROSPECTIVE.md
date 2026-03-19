# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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

### Cumulative Quality

| Milestone | Tests | Notes |
|-----------|-------|-------|
| v2.5 | 73 | Core extraction baseline |
| v3.1 | 122 | Battery + DateFormatter coverage |
| v3.2 | 224 | PhraseEngine + settings coverage |
| v3.5 | 274 | Wrap, segment-key, poetic coverage |
| v3.6.1 | 274 | No new tests; existing suite confirmed no regression |

### Top Lessons (Verified Across Milestones)

1. **Static pure helpers** (UptimeFormatter, DialGeometry, DateFormatter, PhraseWrapService) are the right extraction pattern for Core — testable, zero WPF dependency
2. **AppSettings init-property records** provide forward/backward JSON compatibility with zero attributes
3. **ContextMenu_Opened for IsChecked sync** is the reliable WPF pattern — never touch IsChecked in click handlers
4. **`ApplySettings()` before `Show()`** is the safe startup invariant — any helper that calls UpdateLayout()/Clamp() must NOT be called from ApplySettings()
5. **Subagent-per-plan** with fresh 200k context windows is more reliable than extended sessions for execution-heavy phases
