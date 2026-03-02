# Requirements: FuzzyClock v2.3

**Defined:** 2026-03-02
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v2.3 Requirements

### Ghost Mode

- [x] **GHOST-01**: When the mouse enters the widget area (left Ctrl+Alt not held), the widget becomes fully invisible (Opacity=0) and click-through — mouse events pass to underlying windows
- [x] **GHOST-02**: When the mouse leaves the widget area, the widget restores its configured opacity and stops being click-through
- [x] **GHOST-03**: While ghost mode is active (widget invisible), hover backdrop and hover fast-refresh do not activate

### Ctrl+Alt Modifier

- [x] **CTRLALT-01**: When the user holds left Ctrl + left Alt while hovering, ghost mode is suppressed — widget stays at its configured opacity and is fully interactive
- [x] **CTRLALT-02**: In Ctrl+Alt mode, existing hover behaviors activate normally (backdrop, fast-refresh, drag, right-click, scroll)

### Layout

- [x] **CENTER-01**: In phrase mode, the phrase text is centered horizontally within the widget content area

## Future Requirements

### Polish

- **GHOST-F01**: Animated opacity fade on ghost mode activate/restore (smooth transition instead of instant hide)
- **GHOST-F02**: User-configurable toggle to disable ghost mode entirely for users who prefer always-visible

## Out of Scope

| Feature | Reason |
|---------|--------|
| Ghost mode in dial mode | Dial mode doesn't need centering; ghost mode applies to both modes equally — no mode-specific ghost behavior needed |
| AltGr support | AltGr (Right Alt) synthesizes Left Ctrl + Right Alt — using VK_LCONTROL + VK_LMENU explicitly avoids false-positives on European keyboards |
| WM_NCHITTEST HTTRANSPARENT | Does not pass clicks to Explorer desktop (cross-thread Win32 limitation) — WS_EX_TRANSPARENT is the correct mechanism |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CENTER-01 | Phase 25 | Complete (2026-03-02) |
| GHOST-01 | Phase 26 | Complete |
| GHOST-02 | Phase 26 | Complete |
| GHOST-03 | Phase 26 | Complete |
| CTRLALT-01 | Phase 27 | Complete |
| CTRLALT-02 | Phase 27 | Complete |

**Coverage:**
- v2.3 requirements: 6 total
- Mapped to phases: 6
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 — All 6 v2.3 requirements complete and runtime verified (Phase 27)*
