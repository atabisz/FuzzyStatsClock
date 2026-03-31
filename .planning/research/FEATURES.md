# Feature Landscape

**Domain:** Desktop clock widget polish and phrase enhancement
**Researched:** 2026-03-31

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Adequate backdrop padding | Visual breathing room is fundamental UI design; tight backdrops feel cramped and unpolished | Low | WPF Border Padding property; existing BackdropBorder element already in place; no architectural change needed |
| Stats interval slider shows current value | Continuous sliders need value feedback; without display, users guess at the actual interval | Low | WPF Slider already has `Value` property binding; add TextBlock with binding to existing slider control |
| At least 2-3 phrase variants per time bucket | Single-phrase-per-bucket creates robotic repetition; users notice patterns within days | Medium | Requires vocabulary expansion across 10 English providers × 12 buckets = 120+ phrases; GetPhrase() already supports randomization |
| Consistent voice personality | Novelty styles (Jive/Pirate/Yoda) must stay in character across all 12 buckets or they feel like gimmicks | Medium | Voice consistency depends on linguistic rules, not just vocabulary; requires pattern analysis per provider |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Generous backdrop padding (12-20px) | Premium feel; mimics high-end design systems (Material: 16dp standard, Fluent: 12-20px component padding) | Low | Padding={12} or Padding="12,8,12,8" (left,top,right,bottom) in XAML; immediate visual lift |
| Continuous interval slider (0.5–10s) | Fine-grained control for power users who want 2.5s or 4s intervals; discrete ladder feels arbitrary | Low | WPF Slider `Minimum="0.5" Maximum="10" TickFrequency="0.5"`; StatsIntervalSeconds already exists as double field |
| 5+ variants per bucket (Terse/Classic) | Rare repetition; "Oh, I haven't seen that one before" surprise after weeks of use | High | 10 providers × 12 buckets × 5 variants = 600+ phrases; validation complexity scales; GetPhrase() Random.Next already supports it |
| Deep personality (Pirate: nautical metaphors, Yoda: syntax inversion) | Feels authentic, not cosplay; users recommend the app for the personalities alone | High | Requires linguistic research per style (Pirate: ship time bells, Yoda: object-subject-verb order); structural rules beyond vocabulary |
| Named theme removal with clean UI | Simplifies Settings window; users prefer direct control over presets (project already has 5-color palette + custom picker) | Low | Delete ThemeDefinition, BuiltInThemes, ApplyNamedTheme(); remove ComboBox from Settings; `git rm` + XAML edit |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Phrase variety toggle ("Random" vs "Consistent") | Adds UI complexity for marginal value; users who want consistency can stick with single-style providers | Keep randomization always-on; variety is the default expectation |
| Per-provider variety count settings | No user wants "Terse: 3 variants, Poetic: 7 variants" — cognitive overhead outweighs benefit | Apply uniform expansion (e.g., all providers get 3-5 variants per bucket) |
| Phrase history/rotation algorithm | Prevents repetition via LRU cache, but adds state complexity; 5+ variants per bucket naturally reduces repetition without algorithmic intervention | Rely on random selection with sufficient variety; simpler and maintenance-free |
| Theme "Favorites" or user-created themes | Project explicitly excludes custom theme authoring (see PROJECT.md Out of Scope); removing named themes moves toward direct control, not more abstraction | Persist individual settings (color, opacity, font, clock style); no theme layer |
| Backdrop padding slider | Three complexity levels is overkill; users don't micro-tune padding — they want "enough" or "not enough"; slider implies false precision | Set generous fixed padding (12-16px); zero-config polish |

## Feature Dependencies

```
Backdrop Padding → (independent, no dependencies)
Continuous Stats Slider → Stats panel already exists (v1.2), StatsIntervalSeconds field exists (v1.2)
Phrase Variety → GetPhrase() Random.Next pattern exists (v1.0), IPhraseProvider interface exists (v3.2)
Personality Deepening → Depends on Phrase Variety (vocabulary expansion), requires linguistic rule analysis
Named Theme Removal → Depends on SettingsWindow existence (v3.2), conflicts with ThemeDefinition/BuiltInThemes (v3.2)
```

## MVP Recommendation

Prioritize:
1. **Backdrop Padding** — Immediate visual lift, zero risk, 5-minute change
2. **Continuous Stats Slider** — Users already familiar with interval control; slider is natural evolution from discrete ladder
3. **Named Theme Removal** — Simplifies before expanding; avoids maintaining dead code through phrase expansion phases
4. **Phrase Variety (3 variants minimum)** — Foundation for personality depth; Terse/Classic/Poetic/Rude benefit equally

Defer:
- **Deep Personality (5+ variants, linguistic rules)** — High effort, narrow benefit (3 of 10 providers); do after foundational variety is validated

## Complexity Analysis

### Backdrop Padding (LOW)
**Effort:** 5 minutes
**Risk:** None (pure visual, no logic)
**Dependencies:** Existing BackdropBorder element (v3.5 BDROP-01)
**Implementation:** XAML Padding attribute or code-behind Padding property assignment

### Continuous Stats Slider (LOW)
**Effort:** 30 minutes (UI + validation + persistence)
**Risk:** Low (slider already used for other settings; StatsIntervalSeconds already a double)
**Dependencies:**
- Existing StatsIntervalSeconds field in AppSettings (v1.2)
- Existing SetStatsInterval() method (v1.2)
- Existing SettingsWindow Stats tab (v3.2)
**Implementation:** Replace RadioButton trio with Slider control; add TextBlock with `{Binding Value}`; validate 0.5–10 range in SettingsService.Validate()

### Phrase Variety Expansion (MEDIUM → HIGH)
**Effort:** 2-4 hours per provider for 3 variants (30+ hours for all 10 providers)
**Risk:** Medium (vocabulary validation, cultural appropriateness for non-English, test coverage scales)
**Dependencies:**
- Existing GetPhrase() randomization via Random.Next (v1.0)
- Existing IPhraseProvider interface (v3.2)
- 10 providers: English (Classic/Terse/Poetic/Rude), Jive, Pirate, Yoda, Shakespeare, ValleyGirl, Dwarf
**Scaling:**
- 3 variants: 10 providers × 12 buckets × 3 = 360 phrases (manageable)
- 5 variants: 10 providers × 12 buckets × 5 = 600 phrases (significant effort)
**Implementation:** Modify each provider's GetPhrase() to return Random.Next from 3-5 candidate arrays per bucket

### Personality Deepening (HIGH)
**Effort:** 6-10 hours per novelty provider (linguistic research + structural rules + validation)
**Risk:** High (authenticity is subjective; over-tuning can make it unreadable)
**Dependencies:**
- Phrase Variety expansion must be complete first (structural rules apply to all variants)
- Jive/Pirate/Yoda providers (v3.9 post-milestone additions)
**Specific Challenges:**
- **Pirate:** Nautical time metaphors (ship bells ring every 30min, watch system divides day into 4hr shifts), authentic maritime vocabulary beyond "arrr"
- **Jive:** 1970s AAVE patterns, avoid caricature/offense, generational authenticity (slang evolves)
- **Yoda:** Object-Subject-Verb syntax ("Nearly four it is" not "It is nearly four"), size qualifiers ("small hours", "long day"), consistency without parody
**Implementation:** Define syntax transformation rules; apply per-phrase or via template system; test for readability and consistency

### Named Theme Removal (LOW)
**Effort:** 1 hour (delete code, update Settings UI, test persistence)
**Risk:** Low (themes are purely convenience; all underlying settings remain independently accessible)
**Dependencies:**
- SettingsWindow Appearance tab (v3.2)
- Existing individual controls: accent color picker, opacity slider, font size buttons, clock style rail (v3.2–v3.9)
**Breaking Change:** Users on v4.0 with `Theme="Ghost"` in settings.json will lose theme restoration, but individual settings (color, opacity, etc.) persist independently
**Implementation:**
- `git rm` ThemeDefinition.cs, BuiltInThemes static class
- Delete ComboBox from SettingsWindow Appearance tab
- Remove `ApplyNamedTheme()` method and `_currentTheme` field from MainWindow
- Remove `Theme` field from AppSettings
- Validate settings.json migration handles absent Theme field gracefully (already true for all init-property fields)

## Architectural Dependencies

### Existing Code Patterns (Can Leverage)

| Pattern | Location | Relevance |
|---------|----------|-----------|
| `IPhraseProvider.GetPhrase(DateTime)` | FuzzyClock.Core | Returns single phrase; modify to return `phrases[Random.Next(phrases.Length)]` for multi-candidate buckets |
| `Random.Next` in phrase selection | EnglishPhraseProvider (v1.0) | Pattern already exists; scales naturally to N-candidate arrays |
| `StatsIntervalSeconds` as double | AppSettings (v1.2) | Already supports fractional seconds; slider binding is trivial |
| `SettingsService.Validate()` | SettingsService (v2.5) | Centralized validation; add slider range guard (0.5 ≤ x ≤ 10) |
| `BackdropBorder` wrapper | MainWindow.xaml (v3.5 BDROP-01) | Full-widget backdrop already exists; Padding property available |
| `SettingsWindow` modeless | SettingsWindow (v3.2) | Live-apply pattern established; slider changes flow via event |

### Code Removal Targets (Theme System)

| File/Element | Action | Impact |
|--------------|--------|--------|
| `ThemeDefinition.cs` | Delete | Remove record definition |
| `BuiltInThemes.cs` | Delete | Remove static registry of 5 themes |
| `MainWindow._currentTheme` | Delete field | No runtime theme tracking |
| `MainWindow.ApplyNamedTheme()` | Delete method | All theme application goes through individual setters |
| `AppSettings.Theme` | Delete field | No persistence of theme name |
| `SettingsWindow ComboBox (Themes)` | Delete XAML | Remove theme selector from Appearance tab |
| `SettingsWindow.CmbTheme_SelectionChanged` | Delete handler | No event handling for theme combo |

## Sources

**WPF Official Documentation (HIGH confidence):**
- https://learn.microsoft.com/en-us/dotnet/desktop/wpf/controls/how-to-create-apply-style (Padding/Margin patterns, Style setters)
- https://learn.microsoft.com/en-us/dotnet/desktop/wpf/controls/slider (Slider control capabilities, continuous vs discrete via TickFrequency)

**UX Research (MEDIUM confidence):**
- Nielsen Norman Group (https://www.nngroup.com/articles/gui-slider-controls/) — "Sliders work best when the specific value does not matter to the user" → validates 0.5–10s continuous range for stats interval (approximate values acceptable)

**Training Data Patterns (LOW confidence, flagged for validation):**
- Backdrop padding conventions: Material Design (16dp standard), Fluent Design (12-20px) — industry norms, not project-specific
- Phrase variety norms: Novelty wears off after ~20 repetitions (gamification research) → suggests 3-5 variants minimum per bucket
- Linguistic rules for Yoda syntax (OSV order), Pirate maritime vocabulary (ship bells, watch system) — derived from linguistic training, not verified against authoritative style guides

**Project-Specific Context (HIGH confidence):**
- PROJECT.md Key Decisions table confirms existing patterns (IPhraseProvider, StatsIntervalSeconds, BackdropBorder, SettingsWindow, named themes)
- PROJECT.md Out of Scope explicitly excludes user-created themes
- MEMORY.md confirms 10 phrase providers exist (Classic/Terse/Poetic/Rude/Jive/Pirate/Yoda/Shakespeare/ValleyGirl/Dwarf) post-v3.9
