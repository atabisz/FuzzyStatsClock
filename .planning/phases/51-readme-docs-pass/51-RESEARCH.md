# Phase 51: README Docs Pass - Research

**Researched:** 2026-03-18
**Domain:** Technical documentation — README accuracy pass for v3.2–v3.5 features
**Confidence:** HIGH

## Summary

This is a pure documentation phase. No code changes required. The goal is to bring README.md up to date with all features shipped since the last README accuracy pass (Phase 34, v2.8). That covers roughly nine months of shipped milestones: v3.2 (Settings window, named themes, phrase styles, multilingual), v3.3/v3.4 (dark-mode Settings redesign, edge snapping, single-instance IPC), and v3.5 (installer, phrase wrapping).

The current README.md (136 lines) documents features through approximately v2.8. It mentions the tray menu but makes no mention of the Settings window, named themes, phrase styles, language selection, edge snapping, single-instance behavior, the installer artifact, or phrase wrapping. The Features list and Usage sections are the primary targets.

**Primary recommendation:** Update README.md in place — add new Feature bullet points, update the tray menu table to reference Settings, add a Settings window section, add an Installation section, and update the test count.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCS-04 | README documents v3.2–v3.4 features: Settings window, named themes, phrase styles, language selection, dark mode, edge snapping, single-instance IPC, and phrase wrapping | All feature details sourced directly from source files — HIGH confidence |
</phase_requirements>

## Gap Analysis: Current README vs. Required Coverage

### What the current README already has (do not duplicate)
- Phrase mode, Dial mode, Stats panel, Battery row, Uptime row, Date display
- Ghost mode, Auto-contrast, Accent colors, Window opacity, Hover fast-refresh
- Auto-launch, Per-monitor position memory, Drag anywhere, Font size, Persistence
- Tray menu table (8 items) and Mouse interactions table
- Build / Run / Test sections
- Settings File section, Project Structure section, Planning Docs section

### What is MISSING (must be added per DOCS-04)

| Topic | Required by | Source of truth |
|-------|-------------|-----------------|
| Settings window (how to open, three tabs) | DOCS-04 SC1 | SettingsWindow.xaml — TabItems: Appearance / Stats / Behavior |
| Named themes (5 presets) | DOCS-04 SC1 | AppSettings.cs Theme field; SettingsWindow Appearance tab cards: Midnight / Neon / Ghost / Warm / Terminal |
| English phrase style personalities | DOCS-04 SC2 | AppSettings.cs PhraseStyle: "Classic" / "Terse" / "Poetic" / "Rude" |
| Language selection | DOCS-04 SC2 | SettingsWindow Behavior tab CmbPhraseLanguage: Auto / English / French / Spanish / German / Japanese / Polish |
| Installation section (FuzzyClockSetup.exe) | DOCS-04 SC3 | FuzzyClock.iss OutputBaseFilename=FuzzyClockSetup-{AppVersion}; CI produces FuzzyClockSetup-X.Y.Z.exe |
| SmartScreen workaround | DOCS-04 SC3 | Standard Windows behavior; unsigned EXE from GitHub Releases triggers SmartScreen |
| Edge snapping | DOCS-04 SC4 | MainWindow.xaml.cs EdgeSnapThresholdPx=8.0; snaps to all 4 edges, respects working area |
| Single-instance behavior | DOCS-04 SC4 | App.xaml.cs: Mutex + named pipe; second launch brings first window to front |
| Dark-mode Settings window styling | DOCS-04 SC4 | SettingsWindow.xaml ThemeMode="Dark"; SETR-01–04 requirements |
| Phrase wrapping | DOCS-04 SC5 | PhraseWrapService.cs; AppSettings PhraseWrapEnabled/PhraseWrapStyle; trigger = ActualWidth > StatsPanel * 1.1 |

## Feature Detail Reference (verified from source)

### Settings Window
- Opened from tray menu (a "Settings..." item must exist in TrayMenuBuilder — confirm during plan)
- Window: 480x600, NoResize, CenterScreen, ThemeMode="Dark", ShowInTaskbar="False"
- **Tab 1 — Appearance:** Named themes, accent color swatches + Custom, Opacity slider, Font Size (S/M/L/XL), Clock Style (Phrase/Dial), Phrase Style dropdown, Phrase Wrap checkbox + style radio buttons
- **Tab 2 — Stats:** Show Stats Panel, row visibility checkboxes (CPU/GPU/Memory/Paging/Battery/Uptime), Update Interval, Process Threshold (2%/5%/10%), Show Date, Date Format
- **Tab 3 — Behavior:** Phrase Language, Ghost Mode, Auto-Contrast, Auto-Launch at Login, Battery Alert threshold (10%/15%/20%)

### Named Themes (Appearance tab)
Five theme cards in SettingsWindow Appearance tab:
- **Midnight** — dark background, accent #6A7FDB (blue-purple)
- **Neon** — accent #00F5D4 (cyan-green)
- **Ghost** — accent #C0C8D8 (cool grey, FontSize=24)
- **Warm** — accent #F4A261 (amber-orange)
- **Terminal** — accent #39FF14 (electric green)

### English Phrase Styles
Four options in Appearance tab "Phrase Style" ComboBox:
- **Classic** — default natural English ("just a little after 11", "almost noon")
- **Terse** — compact/abbreviated
- **Poetic** — literary register
- **Rude** — irreverent personality
Style selector is enabled for English locales only; ComboBox reflects this constraint.

### Language Selection
Behavior tab "Phrase Language" ComboBox. Tag values used internally:
- `auto` — detects from Windows display language (CultureInfo.CurrentUICulture)
- `en`, `fr`, `es`, `de`, `ja`, `pl`
Note in XAML: "Auto-detects from Windows display language. Override here."
Natural Pause wrap style is disabled for non-English locales (PhraseWrapService `allowNatural` param).

### Installer
- Artifact name: `FuzzyClockSetup-X.Y.Z.exe` (from FuzzyClock.iss OutputBaseFilename)
- Also produced: `FuzzyClock-X.Y.Z.exe` (bare portable EXE), `checksums.txt`
- Installs per-user to `%LOCALAPPDATA%\Programs\FuzzyClock\` — no UAC prompt
- In-place upgrade: prompts to close running instance; "Launch FuzzyClock" checkbox on finish page
- Uninstall: removes app files; offers optional settings.json removal
- SmartScreen workaround: unsigned binary from GitHub Releases — user clicks "More info" → "Run anyway"
- CI produces draft GitHub Release on `v*` tag push

### Edge Snapping
- Snaps to left / right / top / bottom screen edge
- Threshold: 8px from edge
- Respects working area (excludes taskbar)
- Fires only after drag ends (not during drag, not on phrase resize)

### Single-Instance Behavior
- Mutex name: `FuzzyClock_SingleInstance_v1`
- Second launch signals first instance via named pipe (`FuzzyClock_Activate_v1`), then exits
- First instance brings itself to front (Activate() on dispatcher)
- AbandonedMutexException handled: app can restart cleanly after a crash

### Phrase Wrapping
- Trigger: `PhraseText.ActualWidth > StatsPanel.ActualWidth * 1.1` (phrase mode only)
- Two split styles:
  - **Nearest Midpoint** (default): splits at word boundary closest to string midpoint
  - **Natural Pause**: splits after first grammatical beat (e.g. "just after" / "quarter past") — English only
- Non-English locales always use Nearest Midpoint regardless of style setting
- AppSettings: `PhraseWrapEnabled` (bool, default true), `PhraseWrapStyle` ("midpoint"/"natural", default "midpoint")
- Configured in Settings window Appearance tab under "Phrase Wrap"

## What the Tray Menu Table Needs

The current tray table lists 8 items. It should be updated to add/modify:
- Add **Settings** item (opens SettingsWindow — confirm exact label from TrayMenuBuilder)
- The Theme item currently says "Pick a color preset (White / Amber / Ice Blue / Green / Hello Kitty Pink) or open the custom color picker" — this is now also accessible through Settings > Appearance tab. The tray Theme item may still exist; verify in TrayMenuBuilder.

## Project Structure Section

PhraseWrapService.cs lives in FuzzyClock.Core. The project structure tree should be updated to include it. Also SettingsWindow.xaml(.cs) and PhraseWrapService.cs are new since the last README update.

## Test Count

Current README states: "122 unit tests". Per MEMORY.md the count as of v3.2 is 224. Confirm actual current count by running `dotnet test` or checking recent test output.

## Architecture Patterns

This phase involves only Markdown editing. No code patterns apply.

### README Structure (existing, preserve)
1. Title + intro
2. Features (bullet list)
3. Requirements
4. Build / Run / Test
5. Usage (tray table + mouse table + system tray section)
6. Project Structure
7. Settings File
8. Planning Docs

### Additions needed
- New **Installation** section (between Requirements and Build, or after Build)
- New **Settings Window** section (after the tray menu table in Usage, or as its own section)
- New Feature bullets for: Settings window, named themes, phrase styles, language selection, edge snapping, single-instance, phrase wrapping
- Update existing Feature bullet for Accent colors to mention named themes
- Update test count in Test section

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| SmartScreen description | Custom technical explanation | Standard "More info → Run anyway" language familiar to Windows users |
| Feature table formatting | Custom HTML | Standard GFM Markdown tables (consistent with rest of README) |

## Common Pitfalls

### Pitfall 1: Stale test count
**What goes wrong:** README says "122 unit tests" but current count is higher (224 per MEMORY.md, may have changed with v3.5 phrase wrap tests).
**How to avoid:** Run `dotnet test FuzzyClock.slnx` and report actual passing count.

### Pitfall 2: Theme names vs. accent color preset names
**What goes wrong:** Confusing the 5 accent color presets (White/Amber/Ice Blue/Green/Hello Kitty Pink — tray-only) with the 5 named themes (Midnight/Neon/Ghost/Warm/Terminal — Settings window). These are distinct features.
**How to avoid:** The tray Theme submenu has accent presets. The Settings > Appearance tab has named theme cards. Both exist; document both clearly.

### Pitfall 3: Describing Settings window access path incorrectly
**What goes wrong:** Saying "right-click widget" when all settings moved to the system tray in v2.4.
**How to avoid:** Settings window is opened from the system tray right-click menu. Confirm exact menu item label in TrayMenuBuilder.cs before writing.

### Pitfall 4: Phrase wrap trigger condition
**What goes wrong:** Saying wrap triggers "when text is too long" without specifics.
**How to avoid:** "Wrap triggers when the phrase is more than 10% wider than the stats panel."

### Pitfall 5: Natural Pause availability
**What goes wrong:** Saying Natural Pause works for all languages.
**How to avoid:** Explicitly note Natural Pause is English only; other locales always use Nearest Midpoint.

## Open Questions

1. **Exact tray menu label for Settings window**
   - What we know: SettingsWindow exists and is opened from the tray
   - What's unclear: The exact menu item text (e.g., "Settings..." vs "Open Settings")
   - Recommendation: Read TrayMenuBuilder.cs during plan execution to confirm before writing

2. **Current test count**
   - What we know: Was 224 at v3.2; phrase wrap tests added in v3.5
   - What's unclear: Exact count after phase 52
   - Recommendation: Run `dotnet test` or check test output files during plan execution

3. **Whether tray Theme submenu still exists alongside Settings theme cards**
   - What we know: Theme was in tray, now also in Settings Appearance tab
   - What's unclear: Was the tray Theme submenu removed or does it still exist?
   - Recommendation: Read TrayMenuBuilder.cs to confirm current tray menu shape

## Sources

### Primary (HIGH confidence)
- `FuzzyClock.App/SettingsWindow.xaml` — tab structure, controls, named theme cards, phrase style options, language options
- `FuzzyClock.App/AppSettings.cs` — all settings fields, defaults, valid values
- `FuzzyClock.App/App.xaml.cs` — single-instance Mutex + named pipe IPC implementation
- `FuzzyClock.App/MainWindow.xaml.cs` — EdgeSnapThresholdPx=8.0, SnapToEdge() logic
- `FuzzyClock.Core/PhraseWrapService.cs` — wrap split styles, Natural Pause markers, allowNatural param
- `FuzzyClock.iss` — installer artifact name, install path, UAC setting
- `README.md` — current state of documentation (what exists vs. gaps)
- `.planning/REQUIREMENTS.md` — DOCS-04 success criteria

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — accumulated decisions from phases 48–52
- Project MEMORY.md — test count 224 as of v3.2; may be higher after v3.5

## Metadata

**Confidence breakdown:**
- Feature inventory: HIGH — sourced directly from source files
- Gap analysis: HIGH — direct comparison of README vs. source
- Test count: MEDIUM — number from MEMORY.md; verify with dotnet test
- Tray menu shape: MEDIUM — requires TrayMenuBuilder.cs read to confirm exact labels

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable; no new features planned before next milestone)
