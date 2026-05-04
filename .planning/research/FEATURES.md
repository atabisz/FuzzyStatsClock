# Feature Landscape — v4.2 Temps & Menu

**Domain:** System temperature monitoring + right-click context menu on a transparent Windows desktop widget
**Researched:** 2026-05-04
**Confidence:** MEDIUM-HIGH (LibreHardwareMonitor API surface HIGH; UX convention synthesis MEDIUM — based on well-known patterns from HWiNFO, Rainmeter, iStat Menus, Windows 11 Widgets; some LOW-confidence UX details flagged)

## Scope

This research informs the v4.2 milestone whose target features are already pinned in PROJECT.md:

1. **Right-click menu on widget** — reuse existing tray ContextMenuStrip (WinForms) when RMB is clicked on the widget itself. Suppressed while click-through/ghost-faded.
2. **Temps tab in Settings** — 4th tab; master toggle + per-sensor checkboxes (CPU / GPU / Motherboard / NVMe). Unavailable sensors disabled with "N/A".
3. **Temperature stats line** — compact one-liner below uptime (`CPU 52°  GPU 61°  NVMe 38°`). Celsius only. Uses existing stats timer.

Data source pinned: **LibreHardwareMonitorLib (MPL-2.0)** with graceful no-elevation fallback. Anything not in those three buckets is an Active Non-Goal.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Right-click opens a context menu on the widget itself** | Universal Windows convention since Windows 95; any clickable overlay without RMB feels broken | LOW | Hook `MouseRightButtonUp`/`PreviewMouseRightButtonUp` on MainWindow; reuse existing `_trayIcon.ContextMenuStrip` via `Show(Control.MousePosition)` or `Show(null, point)`. WinForms context menu can be positioned at screen coords — no re-declaration needed. |
| **Per-sensor visibility toggle (checkboxes)** | Established by HWMonitor, HWiNFO, iStat Menus, Rainmeter skins; users expect to pick what matters (not every sensor) | LOW-MED | Stats tab already has per-row checkboxes (CPU/GPU/MEM/PAG/BATT). Use the same idiom on the Temps tab. Four booleans in AppSettings mirror the existing stats-row visibility pattern. |
| **Graceful "N/A" for unavailable sensors** | Desktops have no battery; laptops have no mobo SuperIO chip exposed; without elevation some sensors fail to read. Users expect the widget to not crash and not lie | LOW | Project already established the pattern — BATT shows `N/A` on desktops (v3.1). Mirror: a sensor that returns `null`/`NaN` displays "N/A" in Settings label, disables its checkbox, or simply omits from the compact line. Prefer **disable+N/A label in Settings, omit from widget line** (dual affordance). |
| **Celsius with degree symbol** | Overwhelmingly global default for hardware monitoring outside the US-only consumer-gaming niche; matches HWiNFO, OpenHardwareMonitor, most Linux tools, and all mobile platforms | LOW | Format `"{0:F0}°"` — integer degrees suffice at widget scale. No units flag in AppSettings (see Anti-Features). |
| **Reasonable update cadence (1-5s)** | HWiNFO defaults to 2s; iStat Menus default 2s; Rainmeter skins typically 1-3s. Below 1s wastes CPU; above 10s feels stale during stress | LOW | Pin to **existing stats interval slider** (0.5-10.0s from v4.1 STAT-01). Zero new setting; temps update whenever CPU/GPU/MEM do. Mentioned explicitly in PROJECT.md Active section. |
| **Sensor labels readable by non-engineers** | "Tctl/Tdie", "Package id 0", "Socket0" terrify casual users; HWiNFO, iStat Menus, and Windows 11 Widgets all use friendly names like "CPU", "GPU", "Motherboard" | LOW | Hardcode friendly labels per category — never surface the raw LHM sensor `Name` string. See Sensor Naming Convention below. |
| **No UAC prompt on normal launch** | Consumer widgets that demand admin feel hostile; users will uninstall rather than click Yes every boot | LOW | Do NOT add `requestedExecutionLevel=requireAdministrator` to app.manifest. LHM will silently skip sensors needing ring-0 access; the widget falls back to whatever WMI/PDH/public APIs expose. Documented tradeoff: motherboard SuperIO and some detailed CPU internals may be "N/A" for non-elevated users; CPU package temp via MSR typically works; GPU temp via vendor APIs works; NVMe via SMART over StorageQuery works. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Right-click menu identical to tray menu** (not a subset) | HWiNFO sidebar and most Rainmeter skins have stripped-down or inconsistent right-click menus. Exact parity means zero discoverability gap: whatever the user learned in the tray is now on the widget | LOW | **Reuse the exact same `ContextMenuStrip` instance** — don't build a parallel menu. Single source of truth for items, checkmarks, and `Click` handlers. Existing `ContextMenu_Opened` sync pattern (v1.9 MENU-01) already handles visibility/checkmark state at open-time; just wire the widget's RMB to call `_trayIcon.ContextMenuStrip.Show()`. |
| **Curated 4-sensor list (not full sensor tree)** | HWMonitor/HWiNFO show hundreds of sensors in a tree; power users love it, casual users drown. Fuzzy Clock's personality is "readable at a glance" — curating to CPU / GPU / Motherboard / NVMe matches the stats row philosophy | LOW | Pin the four categories hard. Behind the scenes, pick one sensor per category using priority rules (see Sensor Resolution below). No "show all sensors" advanced mode in v4.2. |
| **Compact inline format** (`CPU 52°  GPU 61°  NVMe 38°`) | Rainmeter skins tend toward vertical multi-row temperature blocks; Windows 11 Widgets use tiles. A single compact line aligned with the uptime/load line feels native to this widget, not pasted in | LOW | Single `TextBlock` with accent color, matching the `UptimeText` styling. Two spaces between sensors mirrors the uptime line (`up 5h 3m   0.52  0.47  0.43`). Only checked-and-valid sensors appear — no empty placeholders. |
| **Hot-swap tolerance (NVMe disappears cleanly)** | USB NVMe enclosures, Thunderbolt drives, external GPUs can disconnect. Widgets that freeze the last reading until restart feel broken. Revalidating on each sample tick is cheap and keeps the line honest | LOW-MED | Re-query LHM on each tick (or every Nth tick for cost control). If sensor returns null, the category drops from the line silently until it returns. Auto-collapse behavior mirrors existing stat-row auto-collapse (v1.4 STAT-13). |
| **Right-click suppressed during proximity fade/click-through** | Without this, the user could trigger a menu on an invisible widget they didn't mean to click. Respects the existing ghost-mode invariant | LOW | Guard: `if (_isGhostMode \|\| _proximityRatio >= 1.0) return;` at top of RMB handler. Same pattern as the existing interaction gate — right-click only works when the widget is visible and interactive (or when Ctrl+Alt is held to suppress ghost mode). Matches PROJECT.md constraint: "Suppressed while proximity-faded/click-through (RMB requires Ghost Mode off or Ctrl+Alt held)". |

### Anti-Features (Commonly Requested, Often Problematic)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **Per-core CPU temps** (`C0 52°  C1 55°  C2 51°…`) | Enthusiasts find per-core interesting; Ryzen/Intel chips expose 8-32 core sensors | Widget is a glanceable overlay, not a diagnostic tool. 16 cores × 4 digits would blow out horizontal space. Per-core fluctuates wildly (individual cores spike to 90°+ on short bursts) producing visually noisy readings with no actionable value | **Single package/die sensor per CPU.** Use LHM's "CPU Package" or highest-available aggregate sensor. Refer users to HWiNFO for per-core detail. |
| **Fahrenheit toggle / dual-unit display** | US users request it; some engineers want both | Adds AppSettings field, Settings UI control, unit conversion, space for "°F" suffix that eats horizontal budget. Doubles test matrix. Celsius is the unambiguous scientific/industry convention. Users who need Fahrenheit can do mental math (°F ≈ °C×2+30) or check a weather app | **Celsius only.** Document choice in README. Keeps the line tight: `CPU 52°` fits; `CPU 125.6°F` does not. |
| **Free-form sensor picker ("pick any LHM sensor")** | Power users (Rainmeter crowd) love picking an obscure VRM temp sensor or chipset sensor | Exposes the LHM sensor tree (dozens to hundreds of items per machine). Names like "Tctl/Tdie" require explanation. Defeats the "readable at a glance" core value. Per-machine sensor IDs are unstable across driver updates, breaking persisted settings | **Four curated categories.** Behind the scenes, implement a priority-ordered resolution per category (see Sensor Resolution). If the pinned sensor disappears, fall back automatically — never surface the fallback logic to the user. |
| **Temperature thresholds / alerts (turn red above 80°)** | Mirror of the battery-low alert (ALERT-01) | PROJECT.md explicitly lists "No alerts/thresholds" for v4.2. Thresholds vary per CPU generation (Ryzen 7xxx runs hot by design — 90° is normal; older Intel panics at 80°). Threshold UX would require per-sensor config and education | **Defer indefinitely.** Users who want alerts run HWiNFO in the background. Our widget stays informational, not alerting. |
| **Drag-to-reorder sensors in the compact line** | Power-user request from Rainmeter skin culture | Settings tabs in this project use fixed orders (stats row order is CPU/GPU/MEM/PAG/BATT). Reordering is UI complexity for a personal widget used by one person per install | **Fixed order** matching Settings tab order: CPU, GPU, Motherboard, NVMe. Matches existing stat-row pattern (v1.2+). |
| **Fan speeds / voltages / clocks in the same line** | LHM exposes them for free; "why not show them?" | PROJECT.md explicitly scopes v4.2 to **temperatures**. Adding RPM/V/MHz would turn the widget into HWiNFO-lite. Violates the "one bite" milestone discipline established in prior milestones | **Temps only.** If a future milestone wants fan speed, that's v4.3+ — separate decision. |
| **Sensor graph / sparkline inline** | Would be visually delightful | Widget is text-based; adding canvas rendering for sparklines breaks the TextBlock-and-accent-color rhythm, adds layout complexity, and fights the existing backdrop/padding model | **Defer.** If ever added, it's its own milestone — not smuggled into v4.2. |
| **Right-click submenu for temps-specific quick actions** (e.g. "copy temps to clipboard") | Power users like HWiNFO's copy-to-clipboard | Right-click menu is the **tray menu reused verbatim**. Adding widget-only items breaks parity and creates a drift point. One menu, one source of truth | **Reuse tray menu exactly.** If a temps action is valuable, add it to the tray menu too (appears in both places). |
| **Elevate-on-demand button ("Run as admin to unlock more sensors")** | Technically would enable SuperIO/MSR sensors | Requires app restart under admin, which loses window position, breaks the per-user Inno Setup no-UAC invariant (INST-01), and creates two runtime modes to support. Not worth it for marginal sensor coverage | **Unelevated only.** If a sensor returns null unelevated, it's "N/A" forever (for that session). Document in README that some motherboards don't expose CPU package temp without admin — users can install HWiNFO as a sensor service if they want that. |

## Sensor Naming Convention

The single most important UX decision in this milestone. LibreHardwareMonitorLib exposes raw sensor `Name` strings that vary by hardware vendor, BIOS version, and driver generation. Surfacing those names directly creates a support nightmare. Instead, use **fixed friendly labels per category**:

| Widget Label | Settings Checkbox Label | LHM Source (in priority order) |
|--------------|-------------------------|-------------------------------|
| `CPU` | "CPU package temperature" | `HardwareType.Cpu` → sensor named `"CPU Package"` → `"Core (Tctl/Tdie)"` → `"Core Max"` → `"CPU Core #1"` → any `SensorType.Temperature` |
| `GPU` | "GPU temperature" | `HardwareType.GpuNvidia`/`GpuAmd`/`GpuIntel` → `"GPU Core"` → `"GPU Hot Spot"` → first `SensorType.Temperature` |
| `Mobo` | "Motherboard temperature" | `HardwareType.Motherboard` (via SuperIO subhardware) → `"System"` → `"Motherboard"` → first chipset-level `SensorType.Temperature`. **Often requires admin** — "N/A" is common on unelevated launches |
| `NVMe` | "NVMe/SSD temperature" | `HardwareType.Storage` → first device with `"Temperature"` sensor (NVMe drives expose SMART temp without elevation via `StorageQuery`; SATA SSDs may or may not) |

**Rationale for "Tctl/Tdie" decision:** AMD CPUs report Tctl (offset-adjusted control temperature, used for fan curves) on Ryzen 1xxx–3xxx; Tdie is the raw die temperature. Newer Ryzen (5xxx+) typically reports them as equal. HWiNFO exposes both; iStat Menus on Mac just shows "CPU". **Match iStat Menus: show one number labeled `CPU`.** LHM's `"Core (Tctl/Tdie)"` sensor is acceptable as a source — users see `CPU 52°`, not `Tctl 52°`.

**Fallback label discipline:** Never show "N/A" on the widget line itself (clutter). Only show it in the Settings tab beside the disabled checkbox. The widget line just silently omits unavailable sensors.

## Sensor Discovery UX (decision)

| Option | Used By | Decision |
|--------|---------|----------|
| **A. Show all LHM sensors in a tree, user picks** | HWMonitor, Rainmeter HWiNFO plugin | **Rejected.** Overwhelming; surfaces raw names; per-machine instability |
| **B. Four hardcoded categories with per-sensor toggle** | Windows 11 Widgets (Device Performance), iStat Menus default view | **✓ Chosen.** Matches project's "readable at a glance" value; mirrors existing stat-row UX (CPU/GPU/MEM/PAG/BATT toggles) |
| **C. Auto-show everything available** | CoreTemp default | Rejected — no user control; line gets noisy on multi-GPU / multi-NVMe systems |
| **D. Magic auto-curate (hide "uninteresting" sensors)** | NZXT CAM | Rejected — "magic" behavior hides state; hurts debuggability |

Option B also means: **multi-GPU systems show the first GPU's temp**, **multi-NVMe systems show the hottest (or first) NVMe's temp**. Power users who need more granularity are not the target audience.

## Display Format (decision)

| Option | Example | Pros | Cons | Decision |
|--------|---------|------|------|----------|
| Compact inline | `CPU 52°  GPU 61°  NVMe 38°` | Fits uptime-line aesthetic; one row | No labels on crowded systems if all 4 enabled | **✓ Chosen.** Matches existing uptime/load line style (two-space separator, accent color) |
| Vertical stack | `CPU: 52°`<br>`GPU: 61°` | Clear labeling | Eats vertical space; violates minimal-footprint value | Rejected |
| Bars like stats rows | `CPU [▓▓▓░░] 52°` | Matches stats panel | Temp range is non-linear (0° vs 100° both critical at different times); bars imply meaningful gradient | Rejected |
| Single combined value | `Max 61°` | Ultra-compact | Loses per-source detail; doesn't justify a new tab | Rejected |

**Precision:** Integer degrees (`52°` not `52.3°`). LHM reports decimal but widget-scale readability wins. Matches how HWiNFO sidebar gadgets display.

**Degree symbol:** Unicode `°` (U+00B0). No `C` suffix — unambiguous at widget scale and saves 4 characters across 4 sensors.

## Right-Click Menu Conventions

Research on transparent desktop overlay widgets:

| Widget | Right-Click Menu | Parity with Tray |
|--------|------------------|------------------|
| **Rainmeter skins** | Custom per-skin; some have elaborate menus, some have none | Varies wildly |
| **HWiNFO Sidebar gadget** | Has a small menu with Configure / Hide / About | Partial — gadget has its own settings dialog |
| **Windows 11 Widgets** | Size (Small/Medium/Large), Pin, Customize, Unpin, Remove | Widget-specific — no tray equivalent exists |
| **iStat Menus menubar items** | macOS menu bar native — clicking opens the detail popover | Not really right-click since it's a menu bar item |
| **Speccy / CoreTemp desktop gadgets** | Context menu with Close, Settings, About | Minimal — opens the main app on settings |

**Convention synthesis:** There is **no strong convention** either way. Projects do what feels right. Our project's existing tray menu is already the canonical surface for settings/quick-toggles; duplicating it on the widget (exact parity) is the cleanest decision — users who learned the tray transfer instantly, and maintenance is single-source.

### Menu Parity Decision

**Right-click menu = tray menu, byte-for-byte.** Use `_trayIcon.ContextMenuStrip.Show(null, new System.Drawing.Point(Cursor.Position.X, Cursor.Position.Y))` from the widget's RMB handler. Benefits:
- Single source of truth — items, icons, Click handlers, separator layout
- `ContextMenu_Opened` sync logic already fires when WinForms shows the menu, regardless of trigger source
- Zero new UI code to maintain
- Feature parity automatic in future milestones (add to tray → appears on widget)

**Suppression invariants (required):**
- If `_isGhostMode == true` and `_proximityRatio >= 1.0` → widget is invisible/click-through; RMB event won't even reach the window. No explicit guard needed (OS routes clicks past WS_EX_TRANSPARENT).
- If Ctrl+Alt is held → widget is interactive per CTRLALT-02 invariant; RMB should work normally.
- If widget is in proximity fade (0 < ratio < 1) → cursor is inside the fade zone but widget is still visible. RMB should still work (user can see and target it). Keep it simple: if mouse event reaches the handler, show the menu.
- During drag (`_isDragging == true`) → RMB should be ignored. Guard: `if (_isDragging) return;`

## Feature Dependencies

```
Right-click menu on widget
    └──requires──> existing tray ContextMenuStrip (v2.2)
    └──requires──> existing _isDragging guard (v1.7)
    └──enhanced-by──> existing Ctrl+Alt suppression (v2.3)
    └──naturally-suppressed-by──> WS_EX_TRANSPARENT under ghost (v2.3)

Temps tab in Settings
    └──requires──> SettingsWindow 3-tab infrastructure (v3.2)
    └──requires──> SettingsSnapshot/SettingsChanged event pattern (v3.2)
    └──follows-pattern──> existing per-row checkbox UX (v1.3+)

Temperature stats line
    └──requires──> LibreHardwareMonitorLib NuGet (v4.2 new)
    └──requires──> existing stats timer (v1.2)
    └──follows-pattern──> UptimeText styling (v2.1)
    └──follows-pattern──> N/A sentinel (v3.1 BATT-02)
    └──follows-pattern──> auto-collapse on all-empty (v1.4 STAT-13)

Hot-swap tolerance
    └──requires──> Temperature stats line
    └──requires──> per-tick sensor revalidation
    └──follows-pattern──> existing GPU -1f sentinel (v1.2)
```

### Dependency Notes

- **LHM library is the only new dependency.** Everything else reuses existing patterns — this is a deliberately low-risk milestone.
- **No conflict with auto-contrast** (v2.7): temps line is accent-colored text, same rules as uptime/load line — contrast sampler treats it uniformly.
- **No conflict with proximity fade** (v4.0): temps line is a child of the backdrop, fades with everything else.
- **No conflict with edge snapping** (v3.5): stats panel height grows by one row when temps are visible; existing clamp-after-phrase-change logic handles it (v1.1 WIN-05 + re-clamp in UpdatePhraseIfChanged).

## MVP Definition

### Launch With (v4.2)

- [x] **Right-click menu on widget reuses tray ContextMenuStrip** — pure WinForms menu reuse, one event handler
- [x] **Settings > Temps tab with master "Show Temps Line" toggle** — mirrors existing stats panel master toggle pattern
- [x] **Four per-sensor checkboxes (CPU / GPU / Motherboard / NVMe)** — mirrors existing stats-row visibility toggles
- [x] **Unavailable sensors rendered disabled+"N/A" in Settings** — explicit affordance; user knows why it's off
- [x] **Compact inline temps line below uptime** — `CPU 52°  GPU 61°  NVMe 38°` with 2-space separator
- [x] **Celsius integer degrees with `°` symbol only** — no °C, no °F toggle
- [x] **Driven by existing stats timer** — no new timer, no new interval setting
- [x] **Hot-swap tolerance: sensor disappears silently from line if it returns null** — re-query each tick
- [x] **No UAC / no elevation** — LHM skips admin-required sensors; "N/A" propagates to Settings label
- [x] **AppSettings persistence for: TempsLineVisible, CpuTempVisible, GpuTempVisible, MoboTempVisible, NvmeTempVisible** — five bools via existing init-property record pattern
- [x] **SettingsService.Validate() guards nothing new** (bools have no invalid values; visibility init defaults handle absent fields)
- [x] **Round-trip JSON test for the five new fields** (STEST pattern from v2.5 onward)
- [x] **Right-click suppressed during drag and during click-through** — guard at top of RMB handler

### Add After Validation (v4.3+)

- [ ] **Additional curated sensor category** (e.g. System Fan RPM or VRM) — only if user feedback shows demand
- [ ] **Per-sensor tooltip showing full LHM sensor name** — for power users who want to verify which underlying sensor they're seeing; doesn't clutter the main UI

### Future Consideration (v5+)

- [ ] **Graph/sparkline history** — big UX departure; its own milestone
- [ ] **Temperature alerts/thresholds** — probably never; HWiNFO covers this use case
- [ ] **Per-core CPU temps mode** — probably never; violates glanceability
- [ ] **Fahrenheit support** — only if there's user demand from the README feedback; currently Celsius-only is the stance

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Right-click menu reuses tray menu | HIGH | LOW | **P1** |
| Temps tab Settings UI with 4 checkboxes | HIGH | LOW-MED | **P1** |
| Temperature stats line (compact inline) | HIGH | MED | **P1** |
| LHM NuGet integration + sensor resolution | HIGH | MED | **P1** |
| Graceful N/A + hot-swap | HIGH | LOW | **P1** |
| Friendly label mapping (CPU/GPU/Mobo/NVMe not Tctl/Tdie) | HIGH | LOW | **P1** |
| Right-click suppression during drag | MED | LOW | **P1** |
| Per-sensor tooltip showing raw LHM name | LOW | LOW | **P3** (defer to v4.3 if ever) |
| Fahrenheit toggle | LOW | MED | **Anti-feature** (don't build) |
| Per-core CPU temps | LOW | HIGH | **Anti-feature** (don't build) |
| Temp thresholds/alerts | LOW | HIGH | **Anti-feature** (don't build) |

**Priority key:**
- **P1:** Required for v4.2 milestone completion
- **P3:** Deferred indefinitely; build only if strong signal emerges
- **Anti-feature:** Explicitly rejected; document so the decision isn't re-litigated

## Competitor Feature Analysis

| Feature | HWiNFO Sidebar | Rainmeter HWiNFO Skin | iStat Menus (Mac) | Windows 11 Widgets | Our Approach |
|---------|----------------|-----------------------|-------------------|--------------------| --|
| Sensor discovery | Tree of every sensor; user selects each one | Skin author hardcodes; user edits INI | Hardcoded device categories (CPU/GPU/Memory/Storage/Battery) | Device-specific tile (no user sensor selection) | Four curated categories, per-category toggle |
| Labels | Raw vendor names (`Tctl/Tdie`, `System Agent`) | Skin author's choice | Friendly: `CPU`, `GPU`, `SSD` | Friendly: `CPU`, `GPU` | Friendly: `CPU`, `GPU`, `Mobo`, `NVMe` |
| Units | Celsius with toggle to Fahrenheit | Whatever skin provides | User preference in macOS | Celsius | Celsius only, no toggle |
| Update rate | 0.5-10s, user configurable | Skin `Update=` directive | 1-2s fixed | Unclear, ~5s | Pinned to existing stats timer (0.5-10s from v4.1) |
| Missing sensor | Omitted from tree | Depends on skin — often blank | Hidden | Not applicable (widget requires supported CPU) | Disabled+"N/A" in Settings, omitted from line |
| Per-core temps | Full tree; user's choice | Usually aggregate | No | No | No (anti-feature) |
| Fahrenheit | Toggle | Skin-dependent | macOS preference | Locale-dependent | No (Celsius only) |
| Right-click on gadget | Opens main app / Settings | Varies | N/A (menubar native) | System widget chrome, not right-click | Full tray menu (exact parity) |

**Cross-pollination synthesis:** Our approach most closely matches **iStat Menus** (curated friendly-labeled categories, fixed-ish set of sensors) combined with **Windows 11 Widgets** aesthetic discipline (compact, no threshold UI, no alerts). We deliberately reject the **HWiNFO philosophy** (show everything, configure everything) because it conflicts with the "readable at a glance" core value.

## Complexity Analysis

### Right-Click Menu on Widget (LOW)
**Effort:** 30 minutes
**Risk:** Minimal. Menu already exists as WinForms control; showing at cursor is a one-liner.
**Dependencies:**
- `_trayIcon.ContextMenuStrip` (v2.2 TRAY-02)
- `System.Windows.Forms.Cursor.Position` (already referenced via UseWindowsForms=true)
- Existing `_isDragging` guard pattern (v1.7)
**Implementation sketch:**
```csharp
private void MainWindow_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
{
    if (_isDragging) return;
    // Ghost/click-through naturally suppresses — event won't fire under WS_EX_TRANSPARENT
    var screenPoint = new System.Drawing.Point(
        (int)PointToScreen(e.GetPosition(this)).X,
        (int)PointToScreen(e.GetPosition(this)).Y);
    _trayIcon.ContextMenuStrip.Show(screenPoint);
    e.Handled = true;
}
```
**Test approach:** Manual smoke test — RMB on widget → full menu appears at cursor; checkmarks correct; items Click as expected. (ContextMenuStrip WinForms behavior is outside WPF test scope.)

### Temps Tab in Settings (LOW-MED)
**Effort:** 2-3 hours (new tab XAML, checkboxes, event wiring, availability polling)
**Risk:** Low — pattern is well-established from Appearance/Stats/Behavior tabs.
**Dependencies:**
- SettingsWindow tab infrastructure (v3.2 SETT-02)
- SettingsSnapshot record pattern (v3.2)
- SettingsChanged event pattern (v3.2 SETT-06)
- `ResetToDefaults()` reset pattern (v2.2 TRAY-03, v3.5 FIX-01)
**Implementation:**
- Add `<TabItem Header="Temps">` with master toggle + 4 checkboxes in a StackPanel
- Five new `SettingsSnapshot` fields + five new `SettingsChanged` event hooks on MainWindow
- On tab open, probe LHM for each category's availability; set `CheckBox.IsEnabled` accordingly; set Content to `"CPU temperature (N/A)"` when unavailable
- `ResetToDefaults()` adds: `TempsLineVisible=false, CpuTempVisible=true, GpuTempVisible=true, MoboTempVisible=false, NvmeTempVisible=false` (conservative defaults — off by default for motherboard/NVMe which are less universally available)

### Temperature Stats Line (MED)
**Effort:** 3-4 hours (LHM integration, sensor resolution, TextBlock rendering, hot-swap)
**Risk:** Medium — LHM sensor names vary per hardware; need defensive resolution; need to handle LHM `Computer` lifecycle (open/close, `Accept(visitor)` for updates).
**Dependencies:**
- NuGet: `LibreHardwareMonitorLib` (MPL-2.0 — compatible with personal/commercial use under MPL terms; binary distribution acceptable since we're not modifying LHM itself)
- Existing `_statsTimer` in MainWindow (v1.2)
- Existing accent color pattern for `TempsText` TextBlock (mirror `UptimeText`)
**Implementation:**
- New `TemperatureService` class in FuzzyClock.Core (wrapping LHM's `Computer` object, but note: LHM requires Windows and uses WMI/drivers — so likely lives in FuzzyClock.App if it has runtime Windows dependencies; pure calculation helpers can still be in Core and unit-tested)
- `TemperatureService.Refresh()` called from existing `UpdateStatsDisplay()` tick
- Expose `float? CpuTempC { get; }`, `float? GpuTempC`, `float? MoboTempC`, `float? NvmeTempC` (nullable = unavailable)
- `UpdateTempsDisplay()` builds the compact string from enabled+non-null sensors, joined with `"  "` separator, and appends `"°"` to each integer value
- TempsText TextBlock positioned below UptimeText in the existing StackPanel — same pattern as DateText (v3.0), UptimeText (v2.1)

### Sensor Availability Detection (LOW-MED)
**Effort:** 1-2 hours (per-category resolution logic + friendly label mapping)
**Risk:** Medium — different motherboards/CPUs expose different sensor names. Priority-ordered lookup with fallback is the established pattern.
**Implementation:** Per category, walk `Computer.Hardware` filtered to `HardwareType.Cpu`/`GpuNvidia|GpuAmd|GpuIntel`/`Motherboard`/`Storage`; within each matched hardware, iterate `Sensors` filtered to `SensorType.Temperature`; apply priority-ordered name matching (see Sensor Naming Convention table above).

### Hot-Swap Tolerance (LOW)
**Effort:** Built-in if implemented correctly from the start.
**Risk:** Minimal if we re-resolve sensors every tick. LHM's visitor pattern repopulates values on each `Accept(updateVisitor)` call.
**Implementation:** Don't cache sensor references across ticks. Re-query each tick. If a sensor disappears, `Value` returns null — propagates naturally to `null` in the float? property → omits from the line.

## Architectural Dependencies

### Existing Code Patterns (Can Leverage)

| Pattern | Location | Relevance to v4.2 |
|---------|----------|-------------------|
| WinForms `ContextMenuStrip` | App.xaml.cs / MainWindow tray init (v2.2) | Reuse existing instance via `.Show(Point)` — no duplication |
| Per-row visibility toggle | MainWindow stats row handlers (v1.3-v3.1) | Five new bools follow the same init-property + event pattern |
| `SettingsSnapshot` immutable record | SettingsWindow (v3.2) | Add 5 fields; populate on open; changes flow out via events |
| `SettingsChanged` event per setting | MainWindow/SettingsWindow (v3.2) | Add 5 new events: `TempsLineVisibleChanged`, `CpuTempVisibleChanged`, etc. |
| `N/A` display for unavailable hardware | `StatsService` GPU (v1.2), BatteryService (v3.1) | Use `float?` null sentinel; UI layer omits or labels "N/A" |
| Auto-collapse when all hidden | Stats panel (v1.4 STAT-13) | Temps line hides when master-off or all 4 sensors unchecked |
| Accent-colored compact line TextBlock | `UptimeText` (v2.1) | `TempsText` mirrors this styling exactly |
| Two-space separator format | Uptime/load line (v2.1) | `CPU 52°  GPU 61°  NVMe 38°` matches aesthetic |
| Single stats timer drives everything | `_statsTimer` (v1.2) | No new timer; `UpdateTempsDisplay()` called from same tick |
| Init-property record AppSettings | `AppSettings` (v2.5+) | Five new bool fields with init defaults |
| STEST round-trip JSON tests | Tests project (v2.5 STEST-01) | New STEST case covers five new fields + absent-field defaults |
| `ResetToDefaults()` resets all fields | MainWindow (v2.2 TRAY-03) | Add the five new fields to reset target state |
| `ContextMenu_Opened` for checkmark sync | Tray menu handler (v1.9) | No changes needed — right-click reuses existing menu, existing sync fires |

### New Code Required

| File/Element | Purpose | Risk |
|--------------|---------|------|
| `FuzzyClock.App/Services/TemperatureService.cs` | Wraps LHM `Computer`; exposes four nullable floats | MED — LHM lifecycle, Dispose correctness |
| `FuzzyClock.App/MainWindow.xaml` — `TempsText` TextBlock | Renders compact temps line | LOW |
| `FuzzyClock.App/MainWindow.xaml.cs` — `UpdateTempsDisplay()` | Formats string; called from stats tick | LOW |
| `FuzzyClock.App/MainWindow.xaml.cs` — `MainWindow_MouseRightButtonUp` | Shows tray ContextMenuStrip at cursor | LOW |
| `FuzzyClock.App/SettingsWindow.xaml` — Temps tab | 5 controls + availability probe | LOW |
| `FuzzyClock.App/SettingsWindow.xaml.cs` — 5 event handlers | Wire each checkbox to a `SettingsChanged` event | LOW |
| `FuzzyClock.App/AppSettings.cs` — 5 new init-property bools | Persistence | LOW |
| `FuzzyClock.App.Tests/AppSettingsTests.cs` — STEST extension | Round-trip + absent-field test for 5 new fields | LOW |
| `packages.config`/csproj — LibreHardwareMonitorLib reference | NuGet package | LOW |

## Sensor Resolution Pseudocode (for Plan phase)

```csharp
private float? ResolveCpuTemp(Computer computer)
{
    var cpu = computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.Cpu);
    if (cpu == null) return null;

    // Priority order; first non-null wins.
    var preferred = new[] { "CPU Package", "Core (Tctl/Tdie)", "Core Max", "CPU Core #1" };
    foreach (var name in preferred)
    {
        var s = cpu.Sensors.FirstOrDefault(x =>
            x.SensorType == SensorType.Temperature && x.Name == name);
        if (s?.Value.HasValue == true) return s.Value;
    }

    // Fallback: any temperature sensor.
    var any = cpu.Sensors.FirstOrDefault(x => x.SensorType == SensorType.Temperature);
    return any?.Value;
}
// ResolveGpuTemp / ResolveMoboTemp / ResolveNvmeTemp follow the same pattern.
```

## Cross-Pollination Highlights

From the comparative research, the patterns we are adopting:

1. **From iStat Menus:** Friendly category labels ("CPU" not "Tctl/Tdie"), fixed curated set, Celsius integer
2. **From Windows 11 Widgets:** No configuration complexity; glanceable first, tweakable second
3. **From Rainmeter (rejecting):** We are NOT adopting free-form sensor picking or elaborate per-skin customization; that philosophy conflicts with our minimalism
4. **From HWiNFO (rejecting):** We are NOT adopting "every sensor visible by default" — curation is a feature
5. **From our own project:** Stats-row-style checkbox toggles, auto-collapse on empty, "N/A" fallback, accent-colored compact line, right-click = tray parity, no UAC

## Sources

**High Confidence (verified against official sources):**
- LibreHardwareMonitorLib README and HardwareType.cs source (https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) — `HardwareType` enum values: `Motherboard, SuperIO, Cpu, Memory, GpuNvidia, GpuAmd, GpuIntel, Storage, Network, Cooler, EmbeddedController, Psu, Battery, PowerMonitor`. `SensorType` includes `Temperature, Voltage, Current, Power, Clock, Load, Fan, Flow, Control, Level, Factor, Data, SmallData, Throughput, TimeSpan, Timing, Energy, Noise, Conductivity, Humidity, Frequency` (25 total). Admin note: "Some sensors require administrator privileges to access the data."
- `ISensor.cs` interface (LHM source): `Value`, `Values`, `Max`/`Min`, `Identifier`, `Index`, `Name` (user-settable), `Hardware`, `SensorType`, `IsDefaultHidden`. Confirms per-tick value updates via visitor pattern.
- MPL-2.0 license compatibility: MPL permits binary redistribution in a proprietary application provided MPL-licensed files themselves are not modified or are redistributed with source — compatible with our closed-source Inno Setup installer model (LHM DLL shipped unmodified).

**Medium Confidence (convention synthesis from multiple sources):**
- Update cadence norms (1-5s): widely observed default in HWiNFO, iStat Menus, Rainmeter examples; aligns with human perception of "live" data without wasting CPU
- Celsius-only in global hardware monitoring tools: industry convention, not a single-source claim
- Per-category curated sensor presentation (iStat Menus, Windows 11 Widgets): observed from product descriptions and community discussion

**Low Confidence (flagged — based on synthesis of training data and widely-reported community knowledge; verify during Build if specifics matter):**
- Exact LHM sensor `Name` strings per hardware vendor ("CPU Package", "Core (Tctl/Tdie)", "Core Max", "GPU Core", "GPU Hot Spot", "System") — these are commonly reported names but vary; the priority-ordered resolution with final any-Temperature fallback handles variance gracefully. Verify against actual LHM output on the developer's machine during implementation.
- "Ryzen 5xxx reports Tctl == Tdie" — widely reported but varies by BIOS/AGESA version. Doesn't affect our UX (we show one number labeled `CPU` either way).
- Rainmeter skin UX patterns (described from training data; no direct source verification). Used only as a counterpoint, not a positive pattern to adopt.
- Windows 11 Widgets Device Performance widget specifics — derived from general knowledge of the platform; widget set has evolved through Windows 11 updates. Used only as directional cross-pollination, not a concrete spec.

**Project-Specific Context (HIGH confidence, already validated):**
- PROJECT.md v4.2 section pins goals and constraints: LibreHardwareMonitorLib (MPL-2.0), no-elevation fallback, no alerts/thresholds, piggybacks existing stats timer, Celsius only
- PROJECT.md Key Decisions: 4-param PerformanceCounter (v1.4 PAG), -1f sentinel for unavailable GPU (v1.2), `N/A` pattern for absent hardware (v1.4, v3.1) — all precedent for how we handle LHM unavailable sensors
- MEMORY.md confirms current test counts, existing service patterns (StatsService, BatteryService, ContrastService), and established WPF+WinForms coexistence pattern

---
*Feature research for: FuzzyStatsClock v4.2 Temps & Menu milestone*
*Researched: 2026-05-04*
