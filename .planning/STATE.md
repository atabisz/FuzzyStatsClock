---
gsd_state_version: 1.0
milestone: v3.5
milestone_name: Phrase Wrap + Installer
status: unknown
stopped_at: Completed 54-01-PLAN.md
last_updated: "2026-03-18T06:13:53.013Z"
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 11
  completed_plans: 11
  percent: 93
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Milestone v3.5 — Phrase Wrap + Installer

## Current Position

Phase 54 complete. Full-widget BackdropBorder with configurable opacity (10-100%, default 35%) and always-visible option wired to SettingsWindow Appearance tab.
Last completed milestone: v3.4 (phases 48–49, shipped 2026-03-18).

```
Progress: [█████████░] 93%
Phase 50: Installer + CI           [ Complete — 50-01 and 50-02 done ]
Phase 51: README Docs Pass         [ Complete ]
Phase 52: Phrase Wrapping          [ Complete — 52-01 and 52-02 done ]
Phase 53: Fix Phrase Update Rate   [ Complete — 53-01 and 53-02 done ]
Phase 54: Backdrop Enhancement     [ Complete — 54-01 done ]
```

Stopped at: Completed 54-01-PLAN.md

## Accumulated Context

### Decisions (51-01)

- README test count updated to 247 (222 Core + 25 App) confirmed via dotnet test output
- Tray table pruned to 8 items matching TrayMenuBuilder.cs; removed Font Size, Dial Face, Theme, Opacity, Date Format submenus that moved to Settings window

### Decisions (52-02)

- Inlines-based TextBlock: `_currentRawPhrase` replaces `PhraseText.Text` as UpdatePhraseIfChanged guard cache; WPF clears `.Text` when Inlines are non-empty making it unreliable as a cache key
- ApplyPhraseWrap measures PhraseText.ActualWidth after UpdateLayout() on the single-line render before deciding to split
- allowNatural derived from PhraseEngine.CurrentLocale.StartsWith("en-") at the call site, keeping PhraseWrapService locale-agnostic

### Decisions (52-01)

- PhraseWrapService: NaturalPauseMarkers ordered longest-first to prevent shorter prefixes from shadowing longer template matches (e.g. "just after" must not consume "just after quarter past")
- PhraseWrapService: `allowNatural` bool parameter keeps service locale-agnostic; MainWindow caller evaluates `PhraseEngine.CurrentLocale.StartsWith("en-")` to pass the flag
- PhraseWrapService: SplitMidpoint compares start-of-next-word position to midpoint (not end-of-current-word); consistent with research algorithm

### Decisions (carried from v3.3/v3.4 + 50-02)

- CI release.yml: compile installer (ISCC) BEFORE renaming EXE — ISCC reads `publish/FuzzyClock.exe` (plain name); rename produces `FuzzyClock-X.Y.Z.exe` after ISCC completes
- CI release.yml: AssemblyVersion passed as X.Y.Z.0 (4-part) to satisfy .NET assembly version requirement
- CI release.yml: three artifacts (bare EXE, installer EXE, checksums.txt) uploaded as draft GitHub Release on v* tag push

### Decisions (carried from v3.3/v3.4)

- Installer: Inno Setup (not Velopack) — no app code changes, no custom Main(), no new NuGet packages
- Installer: per-user install to `%LOCALAPPDATA%\Programs\FuzzyClock\`, no UAC
- Installer version: from git tag, stripped + padded to X.Y.Z (e.g. v3.5 → 3.5.0); EXE stamped via /p:Version at publish time
- Installer upgrade: prompt user if app is running; relaunch checkbox on finish page; optional "remove settings" on uninstall
- Artifacts: `FuzzyClock-X.Y.Z.exe`, `FuzzyClockSetup-X.Y.Z.exe`, `checksums.txt`; CI creates draft GitHub Release on tag push
- AppId GUID `B8F2E3A1-7C4D-4E5F-9A6B-1D2E3F4A5B6C` hardcoded in FuzzyClock.iss — never change; upgrade detection depends on stable GUID
- Settings dir `{localappdata}\FuzzyClock` absent from [Dirs] in .iss — settings.json survives uninstall by default; optional Pascal checkbox for removal
- Phrase wrap trigger: PhraseText.ActualWidth > StatsPanel.ActualWidth * 1.1 (phrase mode only)
- Phrase wrap split styles: "Nearest Midpoint" (word break closest to string midpoint, default) and "Natural Pause" (split after first grammatical/tonal beat)
- Phrase wrap setting exposed in Settings window (Appearance or Behavior tab)
- AppSettings: PhraseWrapEnabled (bool, default true), PhraseWrapStyle ("midpoint"/"natural", default "midpoint")
- Shadow text (ShadowText) must wrap identically to PhraseText — both are layered in the same Grid cell

### Decisions (53-01)

- GetSegmentKey uses locale-prefixed bucket-index keys (en-rude:N, en-poetic:N) preventing cross-provider key collisions
- Deterministic providers return GetPhrase as GetSegmentKey — phrase text is stable within a bucket
- PoeticPhraseProvider rewritten from hour-range single-phrase to 12 minute-buckets with 3-4 random atmospheric candidates, mirroring RudePhraseProvider structure
- PoeticPhraseProvider witching hour (00:00) and high noon (12:00) get named keys en-poetic:witching and en-poetic:noon

### Decisions (53-02)

- Segment-key guard replaces phrase-string comparison guard in UpdatePhraseIfChanged — GetPhrase only called when bucket changes, eliminating 10s random re-roll on Rude/Poetic providers
- Dual cache clear pattern: manual refresh sites clear both _currentRawPhrase and _lastSegmentKey so explicit user actions (style change, language switch, wrap toggle) still trigger fresh phrase pick
- ResetToDefaults calls SetLanguage which handles the _lastSegmentKey clear — no separate change needed at ResetToDefaults call site

### Decisions (54-01)

- BackdropBorder declared as first child of outer hit-test Grid (behind inner Grid via Z-order), not wrapping ContentBorder — ContentBorder remains in Row 0 of inner Grid
- IsHitTestVisible=False on BackdropBorder prevents phantom hover events
- Hardcoded 0x59 ContentBorder alpha replaced by BackdropAlpha() so ContentBorder and BackdropBorder depths stay proportional when opacity is adjusted
- AlwaysVisible guard on clear paths only (ghost cleanup, mouse leave, ghost restored); hover enter sets both unconditionally (idempotent)
- Default 35% opacity and hover-only (AlwaysVisible=false) produce zero visual regression for existing users

### Roadmap Evolution

- Phase 53 added: Fix phrase update rate — only update on time segment change
- Phase 54 added: Backdrop enhancement — full-widget coverage and always-visible option with opacity setting
- Phase 55 added: Update the Poetic phrase clock to be poetic, but provide more hints to the actual time

### Pending Todos

- Japanese phrase naturalness is medium confidence; native-speaker review of 12 bucket phrases recommended (not blocking).

### Blockers/Concerns

None.
