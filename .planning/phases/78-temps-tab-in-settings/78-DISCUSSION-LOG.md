# Phase 78: Temps Tab in Settings — Discussion Log

**Session date:** 2026-05-04
**Mode:** discuss (default, interactive)
**Areas selected:** All four gray areas selected by user

---

## Area 1: N/A Detection API

### Question 1 — sensor availability detection

**Q:** How should the Temps tab detect which sensors are N/A on this machine?

**Options presented:**
- **Read sentinel values directly** (Recommended) — tab calls `_temperatureService.CpuTempC/GpuTempC/MoboTempC/NvmeTempC` and treats `< 0f` as N/A. Zero new surface area. Matches Phase 75 D-11/D-12 sentinel discipline.
- Add `IsSensorAvailable(kind)` API to `ITempSource` — new public surface on Phase 75 contract.
- Add per-sensor `XxxAvailable` bool properties on `ITempSource` — most explicit; redundant with sentinel.

**User selected:** Read sentinel values directly (Recommended)

**Captured as:** D-01

### Question 2 — IsReady race policy

**Q:** Settings window may open BEFORE `TemperatureService.IsReady` flips true (up to 5s cold-start timeout). What's the N/A behavior during that window?

**Options presented:**
- **Treat all sensors as available until IsReady** (Recommended) — optimistic pre-init; evaluate sentinels once IsReady flips.
- Treat all as N/A until IsReady — pessimistic; 5s grey state on cold start looks broken.
- Block Settings tab until IsReady — shows "Probing sensors…" placeholder; feels slow.

**User selected:** Treat all sensors as available until IsReady (Recommended)

**Captured as:** D-02

---

## Area 2: Master Toggle Gates Sub-Panel

### Question 3 — sub-panel behavior when master is OFF

**Q:** When the master "Show Temps Line" checkbox is OFF, what happens to the four per-sensor checkboxes below it?

**Options presented:**
- **Sub-panel grays out** (Recommended) — `TempSensorsPanel.IsEnabled = false`. Mirrors `GhostFadeRadiusPanel` precedent (CLAUDE.md canonical gated sub-panel pattern).
- Sub-panel stays editable — per-sensor toggles usable with master off; values persist for when master returns.
- Sub-panel collapses (hidden) — `Visibility = Collapsed` causes reflow; inconsistent with existing patterns.

**User selected:** Sub-panel grays out (Recommended)

**Captured as:** D-04

---

## Area 3: N/A Checked-State Policy

### Question 4 — stored value vs N/A state interaction

**Q:** User has `TempNvmeVisible=true` in settings from a prior machine. Now on a machine where NVMe is N/A — checkbox is disabled. Does it show checked or unchecked?

**Options presented:**
- **Reflect stored value, disabled** (Recommended) — shows ✓ if stored true; stored value untouched; roaming-safe.
- Always show unchecked when N/A — cosmetically consistent but creates UI↔storage mismatch.
- Force stored value to false on N/A — destroys preference when roaming; violates non-destructive roaming.

**User selected:** Reflect stored value, disabled (Recommended)

**Captured as:** D-06 + D-07

---

## Area 4: Help Text Placement & Wording

### Question 5 — disclaimer TextBlock placement

**Q:** TEMP-TAB-03 requires the PawnIO/admin disclaimer. Where does it sit visually?

**Options presented:**
- **Below the four checkboxes, muted style** (Recommended) — `Foreground="#FF999999" FontSize="11" TextWrapping="Wrap"` matching Phrase Language and Battery Alert description patterns (SettingsWindow.xaml:389, 430).
- Above the four checkboxes — pushes interactive elements lower.
- Tooltip on each disabled checkbox — invisible to non-hoverers; screen-reader hostile.

**User selected:** Below the four checkboxes, muted style (Recommended)

**Captured as:** D-08 + D-09

---

## Deferred Ideas Captured

- `IsSensorAvailable(SensorKind)` API on `ITempSource` — rejected in D-01; revisit if future phase needs richer availability semantics.
- Live `IsReady` subscription in Settings — rejected in D-03; revisit if cold-start UX proves problematic.
- Per-sensor label customization — already out of scope per TEMP-LINE-03.
- "Open Licenses" link — already deferred to Phase 80 / Future Requirements.
- PawnIO installer prompt — already deferred to Future Requirements.

---

## Claude's Discretion (deferred to planner)

- WrapPanel vs Grid for the 4 per-sensor checkboxes (Stats tab WrapPanel Width="270" with child Width="86" is the closest precedent — likely follow suit).
- Exact named panel identifier (`TempSensorsPanel` vs `TempSensorsGroup` vs other).
- Ordering detail and spacing within the group (follow REQUIREMENTS order: CPU / GPU / Mobo / NVMe).
- Whether N/A re-evaluation in `RefreshControls` uses a private helper or inline comparisons.
- Snapshot-carries-N/A-data vs service-injected: D-01 stated preference is snapshot route (4 temp values + `TempsServiceReady` bool added to `SettingsSnapshot`); planner confirms.
- Test count and `[DataRow]` depth — planner picks; Phase 76 precedent is 5 round-trip + 5 absent-field entries per field set.

---

*Discussion complete — 4/4 gray areas resolved; 0 scope creep; CONTEXT.md written.*
