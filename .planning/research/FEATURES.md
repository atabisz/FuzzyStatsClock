# Feature Landscape

**Domain:** Fuzzy / natural-language clock desktop widget
**Researched:** 2026-02-25
**Confidence:** MEDIUM (training-data knowledge of existing apps; no live web access available during this session)

---

## Table Stakes

Features users expect from any fuzzy clock. Missing = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Fuzzy English phrase for current time | Core promise of the product | Low | e.g. "quarter past 3", "almost midnight" |
| Correct 12-hour phrasing (AM/PM awareness) | Natural English does not use 24-hour; "3 in the morning" vs "3 in the afternoon" is optional, but the hour number must be right | Low | 12-hour hour (1-12), not 24-hour |
| Phrase updates at predictable boundaries | Users learn the cadence; stale text breaks trust | Low | 5-minute boundary updates are the standard cadence |
| Always-visible overlay / desktop presence | Why use a widget at all? If it hides, it's just a clock app | Low–Med | WPF transparent frameless window; always-on-top |
| Readable typography | Glanceable at desktop distance | Low | Font size, contrast, drop shadow or halo so text is visible on any wallpaper |
| Correct handling of noon and midnight | Special-cased in natural English — "noon", "midnight", not "12 o'clock PM" | Low | "noon" at 12:00, "midnight" at 0:00 |
| Correct handling of the top of the hour | "X o'clock" or "on the dot" expected at :00 | Low | "three o'clock", not "zero minutes past three" |

## Differentiators

Features that set one fuzzy clock apart from another. Not expected by default, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Poetic / varied phrasing beyond strict quarter-past vocabulary | More interesting than rote "quarter past / half past"; feels like a person speaking | Low–Med | e.g. "just gone half past", "nearly quarter to", "just a little after 11" — the project specifically wants this style |
| Multiple phrase styles / personalities | Users can match the widget's voice to their taste (formal, casual, poetic) | Med | macOS Fuzzy Clock offers multiple "fuzziness levels" |
| Draggable positioning | User places widget where it doesn't interfere with desktop icons | Low | Click-and-drag window move without a title bar |
| Configurable font / size / color | Wallpaper changes mean contrast needs change | Med | Registry or config file; settings dialog adds scope |
| Opacity / transparency control | Blends into desktop without completely hiding | Low–Med | WPF makes this straightforward |
| Click-through mode (optional toggle) | Advanced users want the widget to be non-interactive | Low | WS_EX_TRANSPARENT extended window style |
| System tray icon with right-click menu | Standard Windows widget UX: exit, move, settings | Med | Adds scope but expected by Windows users |
| Startup with Windows (auto-launch) | Persistent desktop presence requires this | Low | Registry run key or startup folder shortcut |
| Second-level granularity option | "about twenty past" vs exact "twenty-two past" — optional precision toggle | Med | Rarely needed for fuzzy clock; mostly anti-feature |
| Locale / language variants | Spanish, French, German fuzzy phrases | High | Out of scope for a personal English widget |
| Animated transitions between phrases | Fade old phrase out, fade new phrase in | Low–Med | Polished feel; WPF animations are straightforward |

## Anti-Features

Features to explicitly NOT build for this project.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Settings / preferences screen | Adds UI complexity, WPF forms, state management — kills the "minimal" goal | Hard-code sensible defaults; accept a plain config file if needed |
| 24-hour mode | Contradicts natural English; "fifteen hundred hours" is not conversational | Always use 12-hour |
| Date display | Scope creep; changes the product from "time widget" to "info widget" | Keep it time-only |
| Exact digital time display | Defeats the purpose; users who want exact time have a taskbar clock | Never show HH:MM |
| Multiple clock instances | Adds IPC/session complexity for negligible gain | Single window only |
| Network time sync / NTP | OS already handles this; duplicating it adds failure modes | Use `DateTime.Now` directly |
| Notification / alarm system | Completely different product category | Out of scope |
| Second-by-second updates | Meaningless for fuzzy phrases; wastes CPU on pointless redraws | 5-minute boundary timer only |
| Per-monitor DPI awareness UI scaling controls | Handle automatically via WPF DPI awareness; don't expose as a user setting | Mark app as per-monitor DPI aware in manifest |

---

## Phrase Bucket Patterns

### How Fuzzy Clocks Divide the Hour

The standard approach divides the 60-minute hour into 12 buckets of 5 minutes each. Each bucket maps to a canonical English phrase. The exact bucket boundaries vary by implementation:

**Strict 5-minute alignment (most common in simple apps)**

Minutes are rounded to the nearest 5-minute mark:

```
:00–:02   → "[hour] o'clock"
:03–:07   → "five past [hour]"
:08–:12   → "ten past [hour]"
:13–:17   → "quarter past [hour]"
:18–:22   → "twenty past [hour]"
:23–:27   → "twenty-five past [hour]"
:28–:32   → "half past [hour]"
:33–:37   → "twenty-five to [next hour]"
:38–:42   → "twenty to [next hour]"
:43–:47   → "quarter to [next hour]"
:48–:52   → "ten to [next hour]"
:53–:57   → "five to [next hour]"
:58–:59   → "[next hour] o'clock"  (or "almost [next hour]")
```

This gives 12 slots. Some apps fire exactly at :00, :05, :10, etc. and hold for 5 minutes, so the update boundary is a 5-minute mark rather than a midpoint.

**Poetic / approximation style (this project's target)**

Rather than mechanical "five past / ten past" throughout, the interesting buckets (those that fall between the named landmarks) can use approximation language:

```
:00        → "[hour] o'clock"  /  "exactly [hour]"
:01–:04    → "just gone [hour]"  /  "just after [hour]"
:05        → "five past [hour]"
:06–:09    → "a little after five past [hour]"  /  "just gone five past"
:10        → "ten past [hour]"
:11–:14    → "almost quarter past [hour]"
:15        → "quarter past [hour]"
:16–:19    → "just gone quarter past [hour]"
:20        → "twenty past [hour]"
:21–:24    → "a little after twenty past [hour]"
:25        → "twenty-five past [hour]"
:26–:29    → "almost half past [hour]"
:30        → "half past [hour]"
:31–:34    → "just gone half past [hour]"
:35        → "twenty-five to [next hour]"
:36–:39    → "almost twenty to [next hour]"
:40        → "twenty to [next hour]"
:41–:44    → "a little after twenty to [next hour]"
:45        → "quarter to [next hour]"
:46–:49    → "just gone quarter to [next hour]"
:50        → "ten to [next hour]"
:51–:54    → "almost five to [next hour]"
:55        → "five to [next hour]"
:56–:59    → "almost [next hour]"
```

**This project's stated design** uses 5-minute buckets updating at boundaries, so 12 distinct phrases per hour cycle. Based on PROJECT.md examples ("just a little after 11", "almost noon", "quarter past 3"), the vocabulary blends both the named landmarks AND the approximation language:

```
Bucket 0  (:00–:04)  → "[hour] o'clock"  /  "just gone [hour]"
Bucket 1  (:05–:09)  → "five past [hour]"  /  "just a little after [hour]"
Bucket 2  (:10–:14)  → "ten past [hour]"
Bucket 3  (:15–:19)  → "quarter past [hour]"
Bucket 4  (:20–:24)  → "twenty past [hour]"
Bucket 5  (:25–:29)  → "twenty-five past [hour]"  /  "almost half past [hour]"
Bucket 6  (:30–:34)  → "half past [hour]"
Bucket 7  (:35–:39)  → "twenty-five to [next hour]"
Bucket 8  (:40–:44)  → "twenty to [next hour]"
Bucket 9  (:45–:49)  → "quarter to [next hour]"
Bucket 10 (:50–:54)  → "ten to [next hour]"
Bucket 11 (:55–:59)  → "five to [next hour]"  /  "almost [next hour]"
```

### Special Cases

| Time | Phrase | Rationale |
|------|--------|-----------|
| 12:00 | "noon" or "twelve o'clock" | Natural English landmark |
| 0:00 / 24:00 | "midnight" | Natural English landmark |
| 12:30 | "half past noon" or "half past twelve" | Either is natural |
| 11:55–11:59 | "almost noon" | PROJECT.md explicitly uses this |
| Any :00 | "[hour] o'clock" | Universal English convention |

### Phrase Vocabulary by Named Apps (training data, MEDIUM confidence)

**macOS "Fuzzy Clock" (by Anders Borum / similar apps in Mac App Store)**
- Offers multiple "fuzziness" levels: exact (shows HH:MM), fuzzy (5-min buckets), very fuzzy (hour-only)
- Standard English vocabulary: "quarter past", "half past", "quarter to", "five past", "ten past", etc.
- Some variants use "around X" for the hour-only level

**Word Clock apps (various platforms)**
- Display all words on a grid; illuminate the words that form the current phrase
- Always 5-minute granularity (physical constraint of the grid layout)
- Vocabulary locked to the grid: "IT IS", "HALF", "TEN", "QUARTER", "TWENTY", "FIVE", "MINUTES", "TO", "PAST", plus hour words
- Not draggable overlay widgets — full-screen or screensaver format

**KDE Plasma "Fuzzy Clock" widget (open source)**
- Source: `plasma-desktop` package, `fuzzy-clock` applet
- Configurable fuzziness: 1 min, 5 min, 10 min, 15 min, 30 min, 1 hour
- Uses KDE i18n strings for phrases; English defaults are the standard "X past Y" / "X to Y" patterns
- No approximation vocabulary — strictly uses the named landmarks

**GNOME "Fuzzy Clock" extension**
- Similar to KDE: 5-minute buckets, standard "past/to" vocabulary
- Single phrase per bucket, no variation or personality

---

## Feature Dependencies

```
Correct phrase buckets → Everything else (core engine)
Phrase bucket engine → Phrase update timer
Phrase update timer → Always-on-top overlay window
Always-on-top overlay → Readable typography (contrast/shadow)
Readable typography → Draggable positioning (so user can avoid conflicts)
Draggable positioning → Startup persistence (position must survive restart)
```

---

## MVP Recommendation

Prioritize for the first working build:

1. Phrase bucket engine with all 12 slots and special cases (noon, midnight, o'clock)
2. Transparent, frameless, always-on-top WPF window with text rendered at desktop
3. 5-minute boundary timer driving phrase refresh
4. Readable typography with drop shadow / outline so phrase is visible on any wallpaper
5. Draggable window (mouse drag without title bar)

Defer to a later iteration:
- Startup with Windows — useful but not needed to validate the core experience
- Animated fade transitions — polish, not function
- System tray icon — adds scope; right-click "Exit" via task manager is acceptable for MVP
- Config file for font/color — hard-code sensible defaults first; wait to see what users actually want to change

---

## Sources

- Project context: `C:/src/gsd1/.planning/PROJECT.md` (HIGH confidence — first-party)
- macOS Fuzzy Clock feature set: training data (MEDIUM confidence — apps may have changed since training)
- KDE Plasma fuzzy-clock applet behavior: training data from open-source codebase knowledge (MEDIUM confidence)
- GNOME fuzzy clock extension: training data (MEDIUM confidence)
- Word Clock apps: training data (MEDIUM confidence)
- English phrase vocabulary / bucket patterns: training data cross-referenced with project examples (HIGH confidence for the vocabulary itself — natural English time expressions are stable)

> Note: Live web access was unavailable during this research session. Claims about specific app feature sets are marked MEDIUM confidence and should be verified against current app store listings or source code before treating as authoritative.
