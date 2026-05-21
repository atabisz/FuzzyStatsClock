# Roadmap: FuzzyStatsClock

## Milestones

- ✅ **v4.4 Smooth Ghost Fade Under Load** — Phases 85–87 (shipped 2026-05-21) — [archive](./milestones/v4.4-ROADMAP.md)
- ✅ **v4.3 Configurable Ghost Override** — Phases 81–84 (shipped 2026-05-07) — [archive](./milestones/v4.3-ROADMAP.md)
- ✅ **v4.2 Temps & Menu** — Phases 75–80 (shipped 2026-05-04) — [archive](./milestones/v4.2-ROADMAP.md)
- ✅ **v4.1 Polish & Phrases** — Phases 70–74 (shipped 2026-04-01) — [archive](./milestones/v4.1-ROADMAP.md)
- ✅ **v4.0 Proximity Ghost Mode** — Phases 66–69 (shipped 2026-03-27) — [archive](./milestones/v4.0-ROADMAP.md)
- ✅ **v3.9 LCD Clock + Japanese** — Phases 61–65 (shipped 2026-03-27) — [archive](./milestones/v3.9-ROADMAP.md)
- ✅ **v3.8 Dial Settings** — Phase 60 (shipped 2026-03-23) — [archive](./milestones/v3.8-ROADMAP.md)
- ✅ **v3.7 Nixie Clock** — Phases 58–59 (shipped 2026-03-23) — [archive](./milestones/v3.7-ROADMAP.md)
- ✅ **v3.6.2 Contrast Fix** — Phase 58 (shipped 2026-03-19) — [archive](./milestones/v3.6.2-ROADMAP.md)
- ✅ **v3.5 Phrase Wrap + Installer** — Phases 48–55 (shipped 2026-03-18) — [archive](./milestones/v3.5-ROADMAP.md)
- ✅ **v3.2 Expanded Experience** — Phases 41–47 (shipped 2026-09-09) — [archive](./milestones/v3.2-ROADMAP.md)
- ✅ **v3.1 Quality + Battery** — Phases 37–40 (shipped 2026-03-08) — [archive](./milestones/v3.1-ROADMAP.md)
- ✅ **v3.0 Date Display** — Phase 36 (shipped 2026-03-07) — [archive](./milestones/v3.0-ROADMAP.md)
- ✅ Earlier milestones (v1.0 – v2.9) — see [archives](./milestones/) + [MILESTONES.md](./MILESTONES.md)

---

## Next Milestone

No active milestone. Run `/gsd-new-milestone` to begin v4.5.

**Carry-forward candidates for v4.5:**

- **WR-01 (Phase 86)** — `_previousRenderTime` not updated on convergence early-return path; first post-convergence frame measures multi-second delta clamped to 100 ms (~78% lerp jump on first re-engagement after long idle). Likely root cause of the v4.4 PERF-01 `barely-stepping` caveat.
- **WR-02 (Phase 86)** — stale RMB-04 comment in `MainWindow.xaml.cs:225-230` references the (removed) `ProximityChanged` lambda's `_menuOpen` guard. One-line doc update.
- **WR-03 (Phase 86)** — asymmetric `Closed` cleanup — explicit `CompositionTarget.Rendering -=` but no `_ghostMode.EnabledChanged -=` / `Restored -=`. Not load-bearing because `_ghostMode.Dispose()` makes the controller unreachable; closes the symmetry gap.
- **WR-04 end-to-end UAT** — the structural patch landed in v4.4; live mid-fade toggle-off recovery test is still pending observer confirmation.
- **12 carry-forward UAT items** — 5 absorbed from Phase 85 + 7 from Phase 86 (per D-CARRY-03), all `status: open` in `87-VERIFICATION.md` `human_verification:` block.
- **3 Info-level code-review findings** (IN-01..IN-03) in `87-REVIEW.md`.
