# Domain Pitfalls: v4.1 Polish & Phrases

**Domain:** Adding backdrop padding, stats interval slider, phrase expansion, personality deepening, and theme removal to existing WPF desktop widget
**Researched:** 2026-03-31
**Confidence:** HIGH (based on existing PROJECT.md patterns + WPF knowledge)

## Critical Pitfalls

These mistakes can cause rewrites, data loss, or major regressions.

### Pitfall 1: SizeToContent Cascade on Backdrop Padding Addition
**What goes wrong:** Adding `Padding` to `BackdropBorder` (which wraps the entire widget StackPanel) breaks the established `SizeToContent=WidthAndHeight` layout invariant. Window recalculates size on every phrase change, but padding adds to the window footprint. Edge snapping calculations assume `GetWindowRect` reflects pure content bounds; padding shifts these bounds outward. Ghost mode `GetWindowRect` hit-testing becomes inaccurate (cursor-to-widget distance inflated by padding pixels). Contrast sampler `GetWindowRect` bbox now includes padding area where no widget content exists — samples wallpaper instead of widget-obscured region, breaking the "what's beneath me" semantic.

**Why it happens:** `SizeToContent=WidthAndHeight` is not the same as CSS `width: fit-content`. WPF includes all `Padding`/`Margin` in the window's `ActualWidth`/`ActualHeight`. The existing system has 66 decision entries assuming `GetWindowRect` = content footprint with zero outer chrome. Adding padding invalidates this assumption at 5+ integration points (edge snap, clamp, ghost hit-test, contrast sampling, uptime row wrap width).

**Consequences:**
- Edge snapping: Widget snaps 8px away from screen edge instead of flush (padding treated as content)
- Ghost mode: Proximity fade activates `N` px too early (where N = padding size)
- Contrast sampler: Samples padding-area wallpaper pixels, triggering false contrast switches
- Position clamping: Off-by-N-px drift on multi-monitor moves
- Phrase wrapping: Wrap width calculation includes padding, causing premature wraps

**Prevention:**
1. **Do NOT add Padding to BackdropBorder.** Instead, add `Margin` to the *inner* StackPanel children (PhraseText, DateText, StatsPanel).
2. If visual padding is required *outside* all content, add it via a nested Grid with fixed margins — not via the Border that determines window bounds.
3. Before implementing, audit all 7 call sites of `GetWindowRect`:
   - `SnapToEdge()` — edge proximity threshold
   - `Clamp()` — screen bounds validation
   - `GhostModeController.OnTimerTick()` — cursor-to-widget distance
   - `ContrastSamplerService.SampleAverageColor()` — screen capture bbox
   - `MainWindow.ContentRendered` — initial position clamp
   - `MainWindow.OnPhraseTextSizeChanged` — phrase wrap width baseline
   - Any Win32 `SetWindowPos` or `GetCursorPos` interaction
4. Add a unit test that verifies `GetWindowRect.Width == ActualWidth` after layout — if padding is added, this invariant breaks.

**Detection:** After implementation, place widget flush against screen edge. If a gap appears, padding broke edge snap. Enable contrast mode, place over solid wallpaper — if text color oscillates, padding broke sampler bbox. Check proximity fade at exactly 80px cursor distance — if fade activates too early, padding inflated hit test.

**Phase assignment:** Phase 70 (Backdrop Padding) — this is the *first* integration pitfall to validate.

---

### Pitfall 2: StatsIntervalSeconds Int→Double Migration Without Rounding Guard
**What goes wrong:** Changing `StatsIntervalSeconds` from `int` to `double` in `AppSettings` causes existing `settings.json` files (containing `"StatsIntervalSeconds": 3`) to deserialize correctly (JSON int → C# double widens automatically). However, **slider UI updates** at 0.1s granularity can produce values like `3.0000000000000004` due to floating-point accumulation. When these values serialize back to JSON, they write as `3.0000000000000004`. On next load, `DispatcherTimer.Interval = TimeSpan.FromSeconds(3.0000000000000004)` is functionally identical to `3.0`, but `SettingsWindow` slider position sync fails — slider expects exact `3.0`, receives `3.0000000000000004`, and doesn't highlight the "3s" tick mark.

Worse: if `Validate()` has a `value < 0.5` guard but no rounding, users sliding to exactly `0.5` might save `0.4999999999999999`, which rounds down in UI display but passes validation. Timer starts at 499ms, not 500ms. Over 1 hour (7200 ticks), this drifts by ~7.2 seconds — rolling CPU averages desync from their labeled time windows.

**Why it happens:** WPF `Slider` with `TickFrequency=0.1` accumulates floating-point error on drag. `System.Text.Json` serializes doubles with full precision (no implicit rounding). `DispatcherTimer` accepts sub-millisecond `TimeSpan` values but rounds internally to OS timer granularity (~15.6ms on Windows), hiding the issue until persistence.

**Consequences:**
- Settings UI shows no highlighted interval after restart (slider value != persisted value)
- Hover fast-refresh (hardcoded 0.5s) interacts incorrectly if user sets interval to 0.5s (same interval, hover no-op path fires instead of switch path)
- Rolling CPU averages drift over time if interval != exactly 0.5/1.0/3.0/10.0
- JSON file becomes unreadable to humans (`3.0000000000000004` is confusing)

**Prevention:**
1. Add `Math.Round(value, 1)` **before** assigning to `_settings.StatsIntervalSeconds` in slider change handler.
2. Add `Math.Round(settings.StatsIntervalSeconds, 1)` in `SettingsService.Validate()` after range clamping.
3. Add unit test: serialize `StatsIntervalSeconds=3.0` → deserialize → verify exactly `3.0` (not `3.0000000000000004`).
4. Add unit test: slider drag to 0.5s → save → reload → slider position == 0.5s tick mark.
5. Add guard in hover fast-refresh handler: `if (Math.Abs(_statsIntervalSeconds - 0.5) < 0.01)` instead of `if (_statsIntervalSeconds == 0.5)` — floating-point equality is unsafe.

**Detection:** After implementation, set interval to 0.5s via slider, restart app. Check `settings.json` — if it says `0.5000000000000001` or `0.4999999999999999`, rounding guard is missing. Check SettingsWindow slider — if no tick mark is highlighted, deserialized value != UI value.

**Phase assignment:** Phase 71 (Stats Interval Slider) — validate rounding before any UI testing.

---

### Pitfall 3: Theme Removal Without Field Deletion Migration
**What goes wrong:** v3.2 added `AppSettings.Theme` as `string?` (stores theme name like `"Ghost"` or custom hex color like `"#FF00AAFF"`). Removing the theme feature means deleting `BuiltInThemes` static registry and `ApplyNamedTheme()` method. However, **existing `settings.json` files still contain `"Theme": "Ghost"`**. If `AppSettings` removes the `Theme` property entirely, deserialization silently ignores the field (System.Text.Json skips unknown fields by default). Widget loads with init-default accent color (White, `#FFFFFFFF`) instead of the user's selected theme color. User's previous "Ghost" theme (which set accent color to `#FFAAAAAA`) is lost.

Worse: if any code still references `_settings.Theme` after the field is removed (e.g., forgot to delete a tray menu handler or SettingsWindow event wire), the app won't compile. If `Theme` field is kept but `BuiltInThemes` is removed, `ApplySettings()` tries to call `ApplyNamedTheme(settings.Theme)` which no longer exists — runtime `NullReferenceException` or compile error.

**Why it happens:** Settings schema evolution is not just "delete unused field." Theme was a *composite* setting — it atomically set accent color, opacity, font size, clock style, and stats visibility. Removing it requires migrating just the accent color piece (the only persisted artifact) back to `AccentColor` field. If both `Theme` and `AccentColor` exist in old settings.json, which wins? No migration logic = user loses data.

**Consequences:**
- Users upgrading from v3.5 or v3.9 lose their theme color — widget resets to white accent on first v4.1 launch
- SettingsWindow Appearance tab "Theme" card remains in XAML but has no code-behind event handlers (orphaned UI)
- Tray menu has stale "Reset to Defaults" logic that sets `Theme = null` — field no longer exists, save fails
- If `BuiltInThemes.GetAccentColor(themeName)` is deleted before migration runs, old settings.json with `"Theme": "Ghost"` has no way to resolve `"Ghost"` → `#FFAAAAAA` color

**Prevention:**
1. **Before deleting `BuiltInThemes`**, write a one-time migration in `SettingsService.Load()`:
   ```csharp
   // One-time migration: Theme → AccentColor (v4.1)
   if (!string.IsNullOrWhiteSpace(settings.Theme) &&
       settings.AccentColor == "#FFFFFFFF" /* init default, not user-set */)
   {
       if (settings.Theme.StartsWith("#"))
       {
           settings = settings with { AccentColor = settings.Theme };
       }
       else if (BuiltInThemes.TryGetAccentColor(settings.Theme, out var color))
       {
           settings = settings with { AccentColor = color };
       }
       // Clear Theme field after migration
       settings = settings with { Theme = null };
       // Persist immediately
       Save(settings);
   }
   ```
2. **Then** delete the `Theme` property from `AppSettings` in the same commit (after migration code is in place).
3. Audit all code references to `settings.Theme` before deletion:
   - `ApplyNamedTheme()`
   - `ResetToDefaults()` — was setting `Theme = null`
   - SettingsWindow `CmbTheme_SelectionChanged` event handler
   - Tray menu (legacy from v2.2, likely already removed)
4. Add unit test: old `settings.json` with `"Theme": "Ghost", "AccentColor": "#FFFFFFFF"` → Load → `AccentColor == "#FFAAAAAA"` (Ghost theme color).
5. Add unit test: old `settings.json` with `"Theme": "#FF00AAFF", "AccentColor": "#FFFFFFFF"` → Load → `AccentColor == "#FF00AAFF"`.

**Detection:** After implementation, manually create a v3.9 `settings.json` with `"Theme": "Ghost"`. Launch v4.1. If widget is white instead of gray, migration failed. Check `settings.json` after first launch — `"Theme"` field should be absent (or null).

**Phase assignment:** Phase 74 (Remove Themes) — migration code MUST be in Load() before theme-related types are deleted.

---

## Moderate Pitfalls

These cause bugs or rework but are recoverable.

### Pitfall 4: Phrase Expansion Without Bucket Coverage Verification
**What goes wrong:** Adding 30 new phrases across 10 personality providers (Terse/Poetic/Rude/Jive/Pirate/Yoda/Shakespeare/ValleyGirl/Dwarf/Classic) without systematic bucket coverage checking can create gaps. Each provider must return a phrase for all **12 five-minute buckets + noon + midnight** = 14 cases per provider. If Jive provider adds phrases for buckets 0–9 but forgets buckets 10–11, `GetPhrase(DateTime)` throws `KeyNotFoundException` at 10:50–10:54 and 10:55–10:59. This is a **runtime crash at specific times of day** — untestable via ad-hoc manual testing (you'd have to wait until 10:50 to see the crash).

Worse: if providers use random selection from candidate arrays (like `PoeticPhraseProvider`), one bucket might have 8 candidates while another has 1. Over time, users notice the 1-candidate bucket phrase repeats hourly while others feel fresh. Unbalanced expansion creates perceived repetition even though total phrase count increased.

**Why it happens:** Phrase expansion is fun creative work — developers add phrases opportunistically ("this would be funny at midnight!") without systematic bucket enumeration. Existing providers have exhaustive tests (`EnglishPhraseProviderTests` has `[DataRow(0), DataRow(1), ..., DataRow(11)]` for all buckets), but adding to 10 providers without updating tests means no coverage validation.

**Consequences:**
- Runtime crashes at specific times of day (10:50, 3:20, etc.) that weren't manually tested
- `GetSegmentKey()` returns correct key but `GetPhrase()` throws — violates interface contract
- Users perceive some hours as "stale" (repeating phrases) while others feel varied
- Unit test suites for providers drift out of sync with actual provider bucket coverage

**Prevention:**
1. **Before adding phrases**, enumerate all 14 cases per provider in a checklist (buckets 0–11, noon, midnight).
2. Add at least **2 candidate phrases per bucket** for providers that use random selection — ensures variety.
3. After expansion, run existing provider unit tests — if any `[DataRow(N)]` test fails, that bucket is missing.
4. Add a **new unit test per provider**: exhaustive bucket coverage (call `GetPhrase()` for all 14 cases, assert no exception).
5. For deepened providers (Jive/Pirate/Yoda), verify `GetSegmentKey()` still returns consistent keys after phrase array expansion (key based on bucket index, not phrase content).

**Detection:** After implementation, create a test that loops through all 24 hours * 12 five-minute buckets = 288 time points. Call `GetPhrase()` for each provider at each time. If any throw, bucket coverage is incomplete. This test must be added in Phase 72/73.

**Phase assignment:** Phase 72 (Expand All Providers) and Phase 73 (Deepen Jive/Pirate/Yoda) — add exhaustive coverage test for each touched provider.

---

### Pitfall 5: Jive/Pirate/Yoda Authenticity Drift Into Caricature
**What goes wrong:** "Deepening" personalities means adding more phrases with stronger dialect features. Jive provider currently has phrases like `"It be round 'bout {time}"`. Deepening could produce `"Yo, it be mad {time}, ya dig?"` with slang density so high it becomes unreadable parody. This crosses from "fun dialect variant" into offensive caricature. Pirate phrases like `"Arrr, it be {time}, me hearty"` can drift into `"Shiver me timbers, 'tis {time}, ye scurvy dog!"` — fun at first, but repetitive and grating after 24 hours of use.

Yoda syntax is grammatically constrained (`"{time}, it is"`), but overloading with prepositions (`"Around {time}, the time now is, hmm"`) becomes word salad. Users enable novelty providers for charm, not frustration. If deepened phrases are too dense with dialect markers, users disable them and never re-enable.

**Why it happens:** Dialect writing is entertaining for the implementer. Without user testing, it's easy to overshoot. AAVE/Jive in particular carries cultural/historical weight — caricature risks offensiveness. Pirate talk is campy fun but has diminishing returns. Yoda grammar is algorithmically tempting but human review is needed to avoid nonsense.

**Consequences:**
- Users perceive Jive provider as mocking AAVE — offensive, not fun
- Pirate/Yoda become one-note jokes — users disable after 1 hour of use
- Novelty providers feel lower-quality than Classic — hurts app's polish reputation
- GitHub issues complain about "try-hard" or "cringey" personalities

**Prevention:**
1. **Human review every deepened phrase.** Read aloud. Does it sound natural for the dialect, or like a stereotype?
2. For Jive: Limit slang density to 1–2 markers per phrase. Prefer rhythm/grammar patterns over lexical substitution.
3. For Pirate: Avoid excessive `"Arrr"` and `"me hearty"`. Focus on nautical metaphors (`"three bells"` for 3:30).
4. For Yoda: Test every phrase by reading it in Yoda's actual movie cadence. If it doesn't sound like something he'd say, revise.
5. **Add a "dial it back" safety pass**: After writing all phrases, remove 30% of the dialect markers. Less is more.
6. Consider adding a disclaimer in README: "Novelty phrase styles are for entertainment and not intended to represent real dialects."

**Detection:** After implementation, enable Jive provider and use the widget for 4 hours. Do the phrases feel charming or exhausting? Ask a second person to review phrases for offensiveness before committing.

**Phase assignment:** Phase 73 (Deepen Jive/Pirate/Yoda) — human review checkpoint BEFORE commit.

---

### Pitfall 6: Hover Fast-Refresh Interaction With User-Configured 0.5s Interval
**What goes wrong:** Hover fast-refresh is currently hardcoded to 0.5s. When stats panel is visible and mouse enters the widget, `Window_MouseEnter` sets `_statsTimer.Interval = TimeSpan.FromSeconds(0.5)`. When mouse leaves, `Window_MouseLeave` restores `_statsTimer.Interval = TimeSpan.FromSeconds(_statsIntervalSeconds)`. This works fine when `_statsIntervalSeconds` is 1s/3s/10s (discrete int values).

Phase 71 adds a continuous slider (0.5–10s). If user sets interval to exactly 0.5s, hover logic becomes a no-op: `Window_MouseEnter` sets interval to 0.5s (already 0.5s), `Window_MouseLeave` restores to 0.5s (already 0.5s). The `_isHoverFastRefresh` flag still toggles correctly, but the "this is a faster interval than normal" semantic is lost. Worse: if rolling CPU averages logic depends on `_isHoverFastRefresh` flag to skip buffer pushes during hover (decision 394), but the user's configured interval is already 0.5s, the flag is meaningless — buffer pushes should NOT be skipped, but the code skips them anyway.

**Why it happens:** Hover fast-refresh was designed when stats interval was a 3-value enum (1/3/10). Making interval continuous invalidates the "0.5s is always faster than configured interval" assumption. If configured interval ≤ 0.5s, hover logic must switch to a different mode (no-op) or use a dynamic "faster than current" threshold (e.g., `min(configuredInterval * 0.5, 0.5)`).

**Consequences:**
- Hover fast-refresh feels broken when user sets 0.5s interval (no visual speedup)
- Rolling CPU averages corrupt if user sets 0.5s interval and hover logic skips buffer pushes (decision 394 guard misfires)
- `_isHoverFastRefresh` flag no longer reliably indicates "faster than configured interval"

**Prevention:**
1. Add a guard in `Window_MouseEnter`:
   ```csharp
   if (_statsIntervalSeconds > 0.6) // Only speed up if configured interval is slower than 0.6s
   {
       _statsTimer.Interval = TimeSpan.FromSeconds(0.5);
       _isHoverFastRefresh = true;
   }
   ```
2. Update decision 394 comment: "hover fast-refresh gates buffer push" is conditional on `_isHoverFastRefresh == true` (not unconditional).
3. Add unit test: simulate hover with configured interval = 0.5s → `_isHoverFastRefresh` should be `false`, timer interval unchanged.
4. Consider adding visual feedback in SettingsWindow: if interval slider ≤ 0.6s, show a hint "Hover fast-refresh disabled (interval too fast)".

**Detection:** After implementation, set stats interval to 0.5s via slider. Hover over widget. If stats flicker or averages show wrong values, hover guard is missing.

**Phase assignment:** Phase 71 (Stats Interval Slider) — hover guard must be in the same commit as slider implementation.

---

## Minor Pitfalls

These cause cosmetic issues or minor UX degradation.

### Pitfall 7: Backdrop Padding Asymmetry Between Hover and Always-Visible Modes
**What goes wrong:** `BackdropBorder.Opacity` is controlled by two code paths: hover mode (`Window_MouseEnter` sets opacity to 0x59/255 = ~35%) and always-visible mode (`BackdropAlwaysVisible` checkbox in Settings sets opacity to `BackdropOpacityPercent / 100.0`). If padding is added to `BackdropBorder`, the visual padding distance is the same in both modes. However, if padding is implemented via inner margins on StackPanel children, those margins always apply — the backdrop edge is always inset by N pixels. This feels wrong when `BackdropAlwaysVisible = true` at 100% opacity: users expect the backdrop to fill the entire window, but there's a transparent margin between backdrop edge and window edge.

**Why it happens:** Hover mode expects padding (visual breathing room). Always-visible mode at high opacity looks like a solid window — users expect no gap. Single implementation can't satisfy both expectations without mode-specific layout.

**Consequences:**
- Always-visible backdrop at 100% opacity looks like a "floating box" instead of a "window background"
- User confusion: "Why is there a gap around my widget?"

**Prevention:**
1. Use conditional padding: `BackdropBorder.Padding = BackdropAlwaysVisible ? 0 : 8`.
2. Or: always use inner margins, but document in UI that backdrop is intentionally inset.
3. Test both hover mode and always-visible mode at 100% opacity during implementation.

**Detection:** Enable `BackdropAlwaysVisible`, set opacity to 100%. If there's a transparent gap around the backdrop, padding is unconditional.

**Phase assignment:** Phase 70 (Backdrop Padding) — test both modes during implementation.

---

### Pitfall 8: Stats Interval Slider Tick Marks at Awkward Positions
**What goes wrong:** WPF `Slider` with continuous range (0.5–10s) can place tick marks at arbitrary intervals. If `TickFrequency=0.1`, slider shows 95 tick marks (visual clutter). If `TickFrequency=1.0`, slider shows 10 tick marks, but 0.5s (the minimum) has no visible tick mark — users can't tell if they're at the minimum. If tick marks are at 1/2/3/4/5/6/7/8/9/10, the old discrete values (1/3/10) aren't visually emphasized — users who want "the old 3s setting" can't find it easily.

**Why it happens:** Continuous sliders prioritize flexibility over discrete landmarks. Replacing a 3-button radio group with a slider loses the "these are the recommended values" affordance.

**Consequences:**
- Users drag slider to 2.7s when they meant 3s (no snap-to-grid)
- 0.5s minimum is invisible on the slider track (no tick mark)
- Slider feels imprecise compared to old 1/3/10 buttons

**Prevention:**
1. Use `TickPlacement="BottomRight"` and `TickFrequency=0.5` — shows 20 tick marks (0.5, 1.0, 1.5, ..., 10.0).
2. Add `IsSnapToTickEnabled="True"` — slider snaps to 0.5s increments, preventing 2.73s values.
3. Add labels below slider at 0.5s, 1s, 3s, 10s (the old discrete values + new minimum) — visual landmarks.
4. Consider showing current value as text above slider thumb: `{Binding Value, StringFormat={}{0:F1}s}`.

**Detection:** After implementation, drag slider thumb slowly. If it lands on values like 2.73s, snap-to-tick is disabled. If 0.5s endpoint is hard to target, tick marks are missing.

**Phase assignment:** Phase 71 (Stats Interval Slider) — UI polish must be in the same commit as slider implementation.

---

### Pitfall 9: GetSegmentKey Inconsistency After Phrase Array Reordering
**What goes wrong:** `GetSegmentKey()` returns a stable identifier for each five-minute bucket so `MainWindow` can detect phrase changes without re-rendering unchanged text. Current implementation returns a string like `"bucket-0"` or `"noon"`. If phrase expansion involves reordering candidate arrays (e.g., moving "just after" phrases to the front of bucket-0 array for better random distribution), `GetSegmentKey()` still returns `"bucket-0"` — correct. However, if a provider mistakenly keys on phrase *content* instead of bucket *index* (e.g., returns `GetPhrase().GetHashCode().ToString()`), reordering the array changes the hash, and the segment key changes even though the time bucket didn't. Widget now re-renders on every 10s poll even when time is static (within the same 5-minute window).

**Why it happens:** `GetSegmentKey()` implementation varies across providers. Some use bucket index (correct), some use template placeholders (correct), some might use phrase content (wrong). Phrase expansion might reveal latent bugs in segment key logic.

**Consequences:**
- Widget text flickers every 10s even when time hasn't crossed a 5-minute boundary
- `_lastSegmentKey` cache in `MainWindow` becomes useless
- Performance: phrase rendering + SizeToContent layout runs 6× more often than needed

**Prevention:**
1. Audit all 10 provider `GetSegmentKey()` implementations before phrase expansion.
2. Verify each keys on **time bucket, not phrase content**.
3. Add unit test per provider: call `GetSegmentKey(dt1)` and `GetSegmentKey(dt2)` where dt1 and dt2 are in the same bucket but different seconds → keys must be identical.
4. Add unit test per provider: call `GetPhrase(dt)` multiple times for same `dt` → different phrases allowed (random selection), but `GetSegmentKey(dt)` must be identical every time.

**Detection:** After implementation, watch widget for 60 seconds without crossing a 5-minute boundary. If text flickers, segment key is unstable.

**Phase assignment:** Phase 72 (Expand All Providers) — add segment key stability test before expansion work begins.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 70: Backdrop Padding | SizeToContent cascade (Critical #1) | Use inner margins, not Border.Padding; audit all GetWindowRect call sites |
| Phase 71: Stats Interval Slider | Int→double migration without rounding (Critical #2); Hover fast-refresh no-op at 0.5s (Moderate #6) | Add Math.Round() in slider handler + Validate(); add hover guard for ≤0.6s intervals |
| Phase 72: Expand All Providers | Bucket coverage gaps (Moderate #4); Segment key instability (Minor #9) | Add exhaustive 14-case test per provider; audit GetSegmentKey() before expansion |
| Phase 73: Deepen Jive/Pirate/Yoda | Authenticity drift into caricature (Moderate #5) | Human review every phrase; "dial it back" pass removes 30% of dialect markers |
| Phase 74: Remove Themes | Theme removal without migration (Critical #3) | Write Theme→AccentColor migration in Load() BEFORE deleting BuiltInThemes; add unit tests for old settings.json |

## Integration Checklist (Run After All 5 Features Implemented)

- [ ] Place widget flush against screen edge → no gap (backdrop padding didn't break edge snap)
- [ ] Enable contrast mode, place over solid wallpaper → text color stable (backdrop padding didn't break sampler bbox)
- [ ] Set stats interval to 0.5s via slider, hover over widget → stats don't flicker (hover guard works)
- [ ] Set stats interval to 3.0s via slider, restart app → slider highlights 3s tick mark (rounding works)
- [ ] Create v3.9 settings.json with `"Theme": "Ghost"`, launch v4.1 → widget is gray, not white (migration works)
- [ ] Enable Jive provider, use for 4 hours → phrases feel charming, not exhausting (authenticity preserved)
- [ ] Watch widget for 60 seconds without crossing 5-minute boundary → text doesn't flicker (segment key stable)
- [ ] Loop through all 288 five-minute buckets across 24 hours, all 10 providers → no exceptions (bucket coverage complete)

## Cross-Feature Interactions

### Backdrop Padding + Stats Interval Slider
If backdrop padding adds to window bounds, and user sets stats interval to 0.5s (fastest possible), and hover fast-refresh becomes a no-op, the backdrop flashes on hover but stats don't speed up. Confusing UX: "backdrop appeared, but nothing changed." Mitigation: hover guard (Moderate #6) prevents this by making backdrop hover also a no-op when interval ≤ 0.6s.

### Theme Removal + Phrase Expansion
If theme migration fails (Critical #3) and user's accent color resets to white, but phrase expansion adds 30 new phrases with complex wrapping, the new longer phrases are white-on-light-wallpaper and unreadable. User's first impression of v4.1 is "this update broke my widget." Mitigation: theme migration MUST be validated before phrase expansion testing begins.

### Stats Interval Slider + Phrase Expansion
If stats interval slider allows 0.5s but rolling CPU averages aren't tested at that interval, and phrase expansion increases `UpdatePhraseIfChanged()` layout cost, the combined load might exceed the 0.5s budget. Stats updates start dropping frames. Mitigation: performance test stats at 0.5s interval with longest possible phrase (stress case) before shipping.

## Sources

- **HIGH confidence:** FuzzyStatsClock PROJECT.md (481 decision entries covering WPF SizeToContent, DispatcherTimer, settings migration, phrase providers)
- **HIGH confidence:** Existing v4.0 codebase patterns (66 decisions on GetWindowRect usage, 7 decisions on phrase segment keys, 4 decisions on settings migration guards)
- **MEDIUM confidence:** WPF knowledge base (SizeToContent + Padding interaction, Slider tick frequency, DispatcherTimer minimum interval ~15ms, System.Text.Json double precision serialization)

## Gaps to Address

- **Backdrop padding visual design:** No spec for exact padding amount (8px? 12px? 16px?). Phase 70 needs a design decision.
- **Stats interval slider default value:** Should the default remain 3s, or shift to 1s now that 0.5s is available? UX decision needed.
- **Phrase expansion target count:** "30 new phrases" is a rough target. Per-provider distribution (3 per provider? 5 for personalities?) needs planning.
- **Theme migration: what if user customized a named theme?** If user picked "Ghost" but then changed opacity to 75%, does migration preserve the opacity or reset it? Migration logic must decide.

---

**Overall confidence:** HIGH for critical pitfalls (based on detailed PROJECT.md context), MEDIUM for moderate pitfalls (based on WPF patterns + inference), LOW for minor pitfalls (based on UX judgment, not technical certainty).

**Recommended next step:** Validate backdrop padding approach (inner margins vs Border.Padding) with a prototype BEFORE planning Phase 70 tasks.
