# Fuzzy Clock

## What This Is

A minimal C# desktop widget that displays the current time as a fuzzy, natural-English phrase — "just a little after 11", "almost noon", "quarter past 3". It floats on the desktop as a transparent, frameless, always-on-top overlay with no background box. The phrase refreshes every 5 minutes.

## Core Value

The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Displays current time as a fuzzy/poetic English phrase (e.g. "just a little after 11", "almost noon", "12 o'clock", "quarter past 3")
- [ ] Phrase updates on every 5-minute boundary
- [ ] Window is frameless and transparent — text floats directly on the desktop
- [ ] Window is always-on-top
- [ ] Written in C# (WPF)

### Out of Scope

- System tray icon / settings UI — keep it simple
- 24-hour format — natural English implies 12-hour
- Click-through / no interaction — user may need to move the widget

## Context

- Target: Windows desktop, personal use
- UI framework: WPF (best support for transparent/compositing windows on Windows)
- Phrasing style: fuzzy and poetic rather than strictly "quarter past / quarter to" — uses natural approximations for in-between minutes
- 5-minute buckets: 12 distinct slots per hour, each maps to a phrase

## Constraints

- **Tech stack**: C# / WPF — Windows only
- **Simplicity**: Single window, no settings screens, no installer complexity

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WPF over WinForms | Better transparency/compositing for frameless overlay | — Pending |
| 5-minute update cadence | Phrase vocabulary aligns to 5-min buckets; avoids constant changes | — Pending |
| Fuzzy phrasing over exact | More interesting and readable than "11:07" | — Pending |

---
*Last updated: 2026-02-25 after initialization*
