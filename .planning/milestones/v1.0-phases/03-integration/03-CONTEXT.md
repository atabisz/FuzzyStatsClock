# Phase 3: Integration - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire `PhraseEngine.GetPhrase()` into the live WPF window via a `DispatcherTimer`. The widget displays the correct current phrase on launch and updates automatically at real 5-minute clock boundaries. Phase 3 completes the product — no new capabilities, just connecting the engine (Phase 1) to the window (Phase 2).

</domain>

<decisions>
## Implementation Decisions

### Phrase update transition
- **Instant snap** — no animation. Old phrase text replaced immediately with new phrase text.
- Window **resizes naturally** (`SizeToContent=WidthAndHeight` already handles this — no change needed).
- Window **anchors to top-right** on resize: when phrase length changes, the right edge stays fixed at 20px from screen edge; window grows leftward. Repositioning logic must account for new `ActualWidth` after text update.
- Both the shadow TextBlock and `PhraseText` are updated together in code when the phrase changes.

### Timer strategy
- **Poll every 10 seconds** using `DispatcherTimer`. On each tick: call `PhraseEngine.GetPhrase(DateTime.Now)`, compare to currently displayed phrase, update only if different.
- 10-second interval guarantees the update requirement ("within 30 seconds of boundary") with comfortable margin.
- No sleep/wake special handling — the 10s poll self-corrects naturally within one tick after resume.

### Launch behavior
- **Remove hardcoded placeholder** ("half past 3") from XAML — text fields left empty or set to empty string.
- **Set live phrase before `Show()`** in `App.xaml.cs` `OnStartup`: call `PhraseEngine.GetPhrase(DateTime.Now)` and assign to both TextBlocks before the window becomes visible.
- **Sequence:** Set phrase → `mainWindow.Show()` → `ContentRendered` fires → position + start timer. No flash of wrong phrase.
- **Timer started in `ContentRendered`** (same event as positioning) — consistent, no risk of timer firing before UI is ready.
- **Call site:** `PhraseEngine.GetPhrase(DateTime.Now)` called directly in `MainWindow.xaml.cs` — no wrapper/service class needed.

### Legibility
- **Add a very subtle semi-transparent dark backdrop** behind the text for legibility on light wallpapers.
- Opacity: **nearly invisible** — approximately 15-20% black. Hint of dark, not a visible widget box.
- Shape: **rounded corners** (small radius, e.g. 4-6px).
- Padding: **tight fit** — small padding around text (e.g. 4-6px).
- Backdrop must not conflict with the no-chrome philosophy — it should disappear into the wallpaper rather than frame the text.
- **Claude's Discretion:** exact opacity value, exact corner radius, exact padding — tune for legibility without visual heaviness.

### Claude's Discretion
- Exact backdrop opacity, corner radius, and padding values
- Implementation approach for the backdrop (WPF `Border` element wrapping the text stack)
- Exact `DispatcherTimer` interval (10 seconds confirmed; exact tick handler structure)
- How to handle the case where the phrase on first render matches what was already showing (no visible change needed — correct, no action)

</decisions>

<specifics>
## Specific Ideas

- The backdrop should feel like it's barely there — the goal is "floats on the wallpaper" not "widget on the wallpaper".
- The phrase should be correct from the very first frame — no placeholder flash, no loading state.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-integration*
*Context gathered: 2026-02-25*
