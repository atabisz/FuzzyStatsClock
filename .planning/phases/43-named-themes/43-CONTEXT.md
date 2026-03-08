# Phase 43: Named Themes - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a built-in visual theming system: 5 named presets selectable from the Settings window Appearance tab, each atomically setting accent color, opacity, clock mode, and stats visibility. Themes are a starting-point shortcut — users can deviate after applying. Custom theme creation, import/export, and user-defined presets are out of scope.

</domain>

<decisions>
## Implementation Decisions

### The 5 themes

Personality-archetype approach — each theme has a distinct character:

| Theme    | Accent    | Hex       | Opacity | Clock Mode | Stats    |
|----------|-----------|-----------|---------|------------|----------|
| Midnight | Deep indigo | #6A7FDB | 0.85    | Phrase     | Hidden   |
| Neon     | Electric teal | #00F5D4 | 1.0  | Dial       | Visible  |
| Ghost    | Blue-grey | #C0C8D8   | 0.35    | Phrase     | Hidden   |
| Warm     | Amber     | #F4A261   | 0.90    | Phrase     | Visible  |
| Terminal | Phosphor green | #39FF14 | 0.95 | Dial    | Visible  |

- Each theme uses a custom accent color (not reusing the 5 existing preset swatches)
- Font sizes: Claude's discretion — sensible defaults per archetype

### Settings UI presentation

- **Layout**: 5 swatch cards in a horizontal row, placed at the **top of the Appearance tab** — before accent color, opacity, and font controls below
- **Card anatomy**: color dot (filled circle in theme accent) + theme name label below it
- **Selection indicator**: 2px border ring in the theme's own accent color when active — matches the existing swatch ring pattern already in the Settings window
- **No active theme**: all 5 cards appear unselected (no ring) when no named theme is active

### Application timing

- Clicking a theme card **immediately updates the live widget** — real-time effect, consistent with how accent/opacity changes already behave
- Theme properties **persist to settings.json immediately** on click — no Apply/OK needed, consistent with existing settings behavior
- No transition animation — instant snap, same as existing property changes

### Theme + customization interaction

- Any manual property change made **after** applying a theme clears the active theme: the card ring disappears, no card is highlighted
- `AppSettings.Theme` (the saved theme name) is set to `null` when the user deviates — individual concrete property values (accent, opacity, etc.) remain in settings.json as the source of truth
- On app restart with `Theme == null`: individual properties restore normally, no card is highlighted in the Settings window
- On app restart with a saved `Theme` name: the named theme is re-applied and its card is highlighted

### Claude's Discretion

- Font size per theme (what size is appropriate for Neon vs Ghost vs Terminal)
- Whether stats visibility in a theme applies to all individual stat rows (CPU/GPU/MEM/PAG/BATT) or just the panel-level `StatsVisible` toggle
- `ThemeDefinition` record field names and data structure
- `BuiltInThemes` registry implementation (static class, dictionary, or enum-keyed)
- Exact card dimensions and spacing in the Appearance tab grid layout

</decisions>

<specifics>
## Specific Ideas

- The existing Settings window already uses swatch rings for accent color selection — the theme cards should visually echo that pattern for consistency
- Ghost at 0.35 opacity is intentionally barely-there; the lower-opacity aesthetic is the whole point of that theme

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 43-named-themes*
*Context gathered: 2026-03-09*
