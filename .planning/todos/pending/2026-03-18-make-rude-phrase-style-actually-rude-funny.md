---
created: 2026-03-18T00:03:39.423Z
title: Make Rude phrase style actually rude-funny
area: general
files:
  - FuzzyClock.PhraseEngine/RudePhraseProvider.cs
---

## Problem

The "Rude" phrase style (added in Phase 45) doesn't land as rude. The phrases are too tame — they need to have genuine edge, irreverence, or dark humor to feel earned. Currently the style probably reads as mildly snarky at best, which is underwhelming for a mode explicitly called "Rude".

## Solution

Rewrite the Rude bucket tables in `RudePhraseProvider.cs` to be rude-funny — think blunt insults at the user for needing a clock, grumpy complaints about the time, or absurdist dark commentary. Aim for the tone of a clock that resents existing. Keep it funny, not offensive. Review all time buckets and replace weak entries with genuinely sharp ones. Update tests accordingly.
