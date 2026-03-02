# Roadmap: Fuzzy Clock

## Milestones

- **v1.0 MVP** (2026-02-25) — Phrase engine, transparent WPF overlay, full integration. 3 phases, 7 plans. → [Archive](milestones/v1.0-ROADMAP.md)
- **v1.1 Position + Font Size** (2026-02-25) — Drag reposition, position persistence, font size selector. 2 phases, 3 plans. → [Archive](milestones/v1.1-ROADMAP.md)
- **v1.2 System Stats** (2026-02-26) — CPU / GPU / MEM stats panel, update interval selector, show/hide toggle, persistence. 4 phases, 5 plans. → [Archive](milestones/v1.2-ROADMAP.md)
- **v1.3 Individual Stat Visibility** (2026-02-26) — Per-row CPU/GPU/MEM visibility toggles, auto-collapse, persistence. 1 phase, 2 plans. → [Archive](milestones/v1.3-ROADMAP.md)
- **v1.4 PAG Stat Row** (2026-02-26) — Paging file % usage as fourth stat row, visibility toggle, persistence. 1 phase, 2 plans. → [Archive](milestones/v1.4-ROADMAP.md)
- **v1.5 Hover Fast-Refresh** (2026-02-26) — Mouse-hover accelerates stats to 0.5s cadence; leave restores configured rate; guarded when stats hidden. 1 phase, 1 plan. → [Archive](milestones/v1.5-ROADMAP.md)
- **v1.6 Dial Mode** (2026-02-26) — Minimal analog dial (hour + minute hands, no face) toggle via right-click menu; persisted; stats panel unaffected. 1 phase, 2 plans. → [Archive](milestones/v1.6-ROADMAP.md)
- **v1.7 Visual Polish** (2026-02-26) — Hover backdrop (semi-transparent when stats visible), drag pause. 1 phase, 1 plan. → [Archive](milestones/v1.7-ROADMAP.md)
- **v1.8 Dial Enhancement** (2026-02-26) — Unconditional hover backdrop fix; dial face decorations (tick marks, minute marks, hour numbers) with per-item toggles, persistence, and mode-conditional menu visibility. 2 phases, 3 plans. → [Archive](milestones/v1.8-ROADMAP.md)
- **v1.9 Context-Aware Menus** (2026-02-26) — Font Size submenu hidden in dial mode; reappears in phrase mode. 1 phase, 2 plans. → [Archive](milestones/v1.9-ROADMAP.md)
- ✅ **v2.0 Visual Identity** (2026-02-27) — Accent color themes (5 presets + custom picker) and window opacity control (presets + scroll wheel). 4 phases, 7 plans. → [Archive](milestones/v2.0-ROADMAP.md)
- ✅ **v2.1 Uptime** (2026-02-27) — System uptime and rolling CPU load averages (1m/5m/15m) as a compact single line below the stats panel; toggleable and persisted. 2 phases, 2 plans. → [Archive](milestones/v2.1-ROADMAP.md)
- ✅ **v2.2 System Tray** (2026-03-02) — System tray icon (analog clock face) with Reset to Defaults and Quit; clean icon removal on exit. 1 phase, 2 plans. → [Archive](milestones/v2.2-ROADMAP.md)
- ✅ **v2.3 Ghost Mode** (2026-03-02) — Phrase text centering; auto-hide on hover (Opacity=0 + click-through); Ctrl+Alt interaction modifier. 3 phases, 3 plans.

## Phases

<details>
<summary>✅ v2.2 System Tray (Phase 24) — SHIPPED 2026-03-02</summary>

- [x] **Phase 24: System Tray Icon** — NotifyIcon with tray context menu (Reset to Defaults, Quit); Reset sets White accent + 100% opacity + 16pt font + phrase mode + centered position and saves immediately; Quit exits cleanly; analog clock face icon (16×16 dark circle, white hands at 10:10); tray icon disposed on window close (completed 2026-03-02)

</details>

### ✅ v2.3 Ghost Mode (Shipped 2026-03-02)

**Milestone Goal:** The widget gets out of your way automatically — it disappears when you hover over it and reappears when you move away, with Ctrl+Alt as the opt-in interaction modifier.

- [x] **Phase 25: Centered Phrase Text** - TextAlignment=Center on PhraseText and ShadowText TextBlocks; phrase text is horizontally centered in the widget content area (completed 2026-03-02)
- [x] **Phase 26: Ghost Mode Core** - Widget becomes Opacity=0 and click-through (WS_EX_TRANSPARENT) on MouseEnter with no modifier; restores on mouse exit with all hover state cleanly reset (completed 2026-03-02)
- [x] **Phase 27: Ctrl+Alt Interaction Modifier** - Holding left Ctrl+left Alt while hovering suppresses ghost activation; all existing hover behaviors (backdrop, fast-refresh, drag, right-click, scroll) activate normally (completed 2026-03-02)

## Phase Details

### Phase 25: Centered Phrase Text
**Goal**: Phrase text is horizontally centered within the widget content area in phrase mode
**Depends on**: Phase 24 (v2.2 complete)
**Requirements**: CENTER-01
**Success Criteria** (what must be TRUE):
  1. In phrase mode, the phrase text is visually centered within the widget area rather than left-aligned
  2. The drop shadow TextBlock is also centered, maintaining correct shadow offset behind the phrase text
  3. Centering is stable across all three font sizes (16pt / 24pt / 32pt) without clipping or overflow
  4. In dial mode, the DialCanvas remains unaffected by the XAML centering change
**Plans**: 1 plan

Plans:
- [x] 25-01-PLAN.md — Add TextAlignment=Center + HorizontalAlignment=Stretch to ShadowText and PhraseText; human verify centering at all font sizes (completed 2026-03-02)

### Phase 26: Ghost Mode Core
**Goal**: Widget auto-hides when the mouse enters — becomes invisible and click-through — and restores to its configured state when the mouse leaves
**Depends on**: Phase 25
**Requirements**: GHOST-01, GHOST-02, GHOST-03
**Success Criteria** (what must be TRUE):
  1. When the mouse enters the widget, it immediately becomes fully invisible (Opacity=0) and mouse clicks pass through to windows beneath
  2. When the mouse leaves the widget area, the widget restores to its configured opacity and is fully interactive again
  3. While the widget is in ghost state, the hover backdrop does not appear and the stats timer does not switch to 0.5s fast-refresh
  4. After ghost mode restore, the widget is correctly interactive: drag, right-click, and scroll wheel all work normally
**Plans**: 1 plan

Plans:
- [x] 26-01-PLAN.md — Implement ghost mode core (P/Invoke + DispatcherTimer+GetCursorPos) and human verify activation/restore/state correctness (completed 2026-03-02)

### Phase 27: Ctrl+Alt Interaction Modifier
**Goal**: Holding left Ctrl + left Alt while hovering suppresses ghost mode and keeps the widget fully interactive
**Depends on**: Phase 26
**Requirements**: CTRLALT-01, CTRLALT-02
**Success Criteria** (what must be TRUE):
  1. When the user holds left Ctrl + left Alt before or as the mouse enters the widget, the widget stays visible at its configured opacity and does not go click-through
  2. In Ctrl+Alt mode, all existing hover behaviors activate: semi-transparent backdrop appears, stats fast-refresh switches to 0.5s cadence
  3. In Ctrl+Alt mode, the widget is fully interactive: drag repositions it, right-click opens the context menu, scroll wheel adjusts opacity
  4. Releasing Ctrl+Alt and moving the mouse away, then hovering again with no modifier, triggers ghost mode normally
**Plans**: 1 plan

Plans:
- [x] 27-01-PLAN.md — Add GetAsyncKeyState P/Invoke + Ctrl+Alt guard in Window_MouseEnter; human verify modifier suppresses ghost and activates hover behaviors (completed 2026-03-02)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–23 | v1.0–v2.1 | All | Complete | See archives |
| 24. System Tray Icon | v2.2 | 2/2 | Complete | 2026-03-02 |
| 25. Centered Phrase Text | v2.3 | Complete    | 2026-03-02 | 2026-03-02 |
| 26. Ghost Mode Core | v2.3 | Complete    | 2026-03-02 | 2026-03-02 |
| 27. Ctrl+Alt Interaction Modifier | v2.3 | Complete    | 2026-03-02 | 2026-03-02 |

---
*Last updated: 2026-03-02 — Phase 27 complete; v2.3 milestone shipped; all 6 requirements verified*
