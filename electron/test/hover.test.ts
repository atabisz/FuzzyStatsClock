/**
 * `hover.ts` — `Window_MouseEnter` / `Window_MouseLeave`, arm by arm against
 * `MainWindow.xaml.cs:1456-1495`.
 *
 * Every expectation is from that source read as written, including the two places where it is written
 * inconsistently. The arms that pin an inconsistency say so and say what the "tidy" version would do
 * instead, because a later cleanup of this module would look correct and would change what the widget does:
 *
 * | Input | This module | The tidy version |
 * |---|---|---|
 * | enter, ghost enabled, nothing held | nothing at all | paint + fast-refresh |
 * | leave while ghost is ACTIVE | nothing at all — backdrop stays PAINTED | clear |
 * | enter with the panel collapsed | paint, no interval, flag TRUE | flag false or untouched |
 * | leave with the panel collapsed | clear, no interval, flag UNTOUCHED | flag false |
 *
 * The last two are one defect between them: hover-then-leave with the panel collapsed leaves
 * `_isHoverFastRefresh` stuck true, which in the C# stops the load-average queue accumulating. Pinned, not
 * fixed — and `test/load-average.test.ts` owns what the flag does downstream.
 */
import { describe, expect, test } from "bun:test"
import { HOVER_INTERVAL_SEC, hoverEnter, hoverLeave, type GhostHoverState } from "../src/core/hover.js"
import { DEFAULTS } from "../src/core/settings.js"

/** Ghost off entirely — the default, and the state most users are in. */
const GHOST_OFF: GhostHoverState = { enabled: false, modifierHeld: false, active: false }
/** Ghost on, cursor not near enough to have triggered anything. */
const GHOST_ON: GhostHoverState = { enabled: true, modifierHeld: false, active: false }
/** Ghost on and the escape hatch held. Unreachable on this platform; see `main/ghost.ts`. */
const GHOST_HELD: GhostHoverState = { enabled: true, modifierHeld: true, active: false }
/** Ghost on and click-through applied. Only `hoverLeave` reads this field. */
const GHOST_ACTIVE: GhostHoverState = { enabled: true, modifierHeld: false, active: true }

const CONFIGURED = DEFAULTS.statsIntervalSeconds

describe("the constant, since the arms are relative to it", () => {
  test("the hover interval is 0.5s and the configured default is 2s", () => {
    expect(HOVER_INTERVAL_SEC).toBe(0.5)
    // **2, not 1.** `_statsIntervalSeconds = 2.0` in the C# and `statsIntervalSeconds: 2.0` in `DEFAULTS`.
    // Written as an arm because `main.ts` was constructing its source with a hardcoded `intervalSec: 1` and
    // never reading the setting at all -- so the port sampled at twice the original's rate and the interval
    // setting had no reader. Found here, not by inspection.
    expect(CONFIGURED).toBe(2)
    // And the fast interval must actually be faster, or the feature is a no-op with a name. A quarter of the
    // configured cadence at the default, not a half -- the C#'s 0.5s is a literal, not a ratio.
    expect(HOVER_INTERVAL_SEC).toBeLessThan(CONFIGURED)
  })
})

describe("enter, with ghost mode off — the ordinary path", () => {
  test("paints the backdrop and drops the interval to 0.5s", () => {
    expect(hoverEnter(GHOST_OFF, true)).toEqual({
      backdrop: "paint",
      intervalSec: 0.5,
      fastRefreshFlag: true,
    })
  })

  test("with the stats panel collapsed it still paints, and STILL sets the flag", () => {
    // Two separate faithful oddities in one input. The backdrop is not tied to the panel, which is
    // reasonable. The flag being set with no cadence change is not, and it is the first half of the stuck-
    // flag defect -- `intervalSec: null` is the proof that nothing about the sampling changed.
    expect(hoverEnter(GHOST_OFF, false)).toEqual({
      backdrop: "paint",
      intervalSec: null,
      fastRefreshFlag: true,
    })
  })
})

describe("enter, with ghost mode enabled — the gate on the whole handler", () => {
  test("does NOTHING: no backdrop, no interval change, no flag", () => {
    // The arm that stops a plausible refactor. `if (modifierHeld || !enabled)` wrapping the entire body
    // reads like a guard around the ghost-specific part, and it is not -- it is the handler.
    expect(hoverEnter(GHOST_ON, true)).toEqual({
      backdrop: null,
      intervalSec: null,
      fastRefreshFlag: null,
    })
    // The negative control that makes the above mean something: the same call with ghost off does act.
    expect(hoverEnter(GHOST_OFF, true).backdrop).toBe("paint")
  })

  test("`null` is not `clear` — an ignored enter must not repaint the backdrop transparent", () => {
    // Reachable and visible: with `backdropAlwaysVisible` on, a ghost-mode enter returning "clear" would
    // wipe a backdrop the user asked to be permanent, and only a hover would ever do it.
    const effect = hoverEnter(GHOST_ON, true)
    expect(effect.backdrop).toBeNull()
    expect(effect.backdrop).not.toBe("clear")
  })

  test("holding the modifier re-opens the ordinary path", () => {
    // CTRLALT-01/02. Inert on this platform because there is no global modifier reader (`main/ghost.ts`),
    // so this arm is what keeps the logic correct for the platform that grows one.
    expect(hoverEnter(GHOST_HELD, true)).toEqual({
      backdrop: "paint",
      intervalSec: 0.5,
      fastRefreshFlag: true,
    })
  })

  test("`active` is not read by enter at all", () => {
    // The two handlers read different ghost fields, which is the easiest thing to get wrong when wiring
    // them from one state object. Same enabled/held, opposite `active`, identical answers.
    expect(hoverEnter(GHOST_ACTIVE, true)).toEqual(hoverEnter(GHOST_ON, true))
    expect(hoverEnter({ ...GHOST_OFF, active: true }, true)).toEqual(hoverEnter(GHOST_OFF, true))
  })
})

describe("leave, the ordinary path", () => {
  test("clears the backdrop and restores the configured interval", () => {
    expect(hoverLeave(GHOST_OFF, true, false, CONFIGURED)).toEqual({
      backdrop: "clear",
      intervalSec: CONFIGURED,
      fastRefreshFlag: false,
    })
  })

  test("restores the CONFIGURED interval and not a hardcoded 1s", () => {
    // A user on a 5s interval who hovers must go back to 5s, not to the default. The arm exists because
    // `intervalSec: 1` would pass every other test in this file.
    expect(hoverLeave(GHOST_OFF, true, false, 5).intervalSec).toBe(5)
    expect(hoverLeave(GHOST_OFF, true, false, 10).intervalSec).toBe(10)
  })

  test("`backdropAlwaysVisible` holds the backdrop rather than clearing it", () => {
    const effect = hoverLeave(GHOST_OFF, true, true, CONFIGURED)
    expect(effect.backdrop).toBeNull()
    // ...and the interval half is unaffected by the backdrop setting, which is the C#'s order: the two are
    // sequential statements, not an if/else.
    expect(effect.intervalSec).toBe(CONFIGURED)
    expect(effect.fastRefreshFlag).toBe(false)
  })
})

describe("leave, while ghost mode is ACTIVE", () => {
  test("does nothing — and the backdrop deliberately stays PAINTED", () => {
    // The early `if (_ghostMode.IsActive) return;`. The backdrop is cleared by the ghost controller's
    // `Restored` handler (`:249-250`) instead, so a "clear" here would be a second writer racing it.
    expect(hoverLeave(GHOST_ACTIVE, true, false, CONFIGURED)).toEqual({
      backdrop: null,
      intervalSec: null,
      fastRefreshFlag: null,
    })
    // Negative control: only `active` differs, and the same call clears.
    expect(hoverLeave(GHOST_ON, true, false, CONFIGURED).backdrop).toBe("clear")
  })

  test("an active ghost also leaves the interval fast, which the restore edge must undo", () => {
    // Worth its own arm because it is the one lasting consequence: enter set 0.5s, leave declined to
    // restore it, so nothing in the hover pair puts the cadence back. Wiring that ignores this leaves a
    // widget sampling at 2 Hz for as long as ghost mode stays active.
    expect(hoverLeave(GHOST_ACTIVE, true, false, CONFIGURED).intervalSec).toBeNull()
  })

  test("`enabled` and `modifierHeld` are not read by leave", () => {
    // The mirror of the enter arm above. Only `active` matters here, so a modifier held during a leave
    // does not change the answer -- in either direction.
    expect(hoverLeave({ enabled: false, modifierHeld: true, active: true }, true, false, CONFIGURED))
      .toEqual(hoverLeave(GHOST_ACTIVE, true, false, CONFIGURED))
    expect(hoverLeave(GHOST_HELD, true, false, CONFIGURED))
      .toEqual(hoverLeave(GHOST_OFF, true, false, CONFIGURED))
  })
})

describe("the stuck-flag defect, reproduced end to end", () => {
  test("hover and leave with the panel collapsed never clears the flag", () => {
    // The full sequence, as a user performs it: collapse the stats panel from the tray, move onto the
    // widget, move off. `true` then `null` -- and `null` means "do not assign", so whatever the flag was
    // set to on enter is still its value.
    expect(hoverEnter(GHOST_OFF, false).fastRefreshFlag).toBe(true)
    expect(hoverLeave(GHOST_OFF, false, false, CONFIGURED).fastRefreshFlag).toBeNull()
  })

  test("the backdrop half of the collapsed-panel leave still works", () => {
    // So the defect is invisible: the visual effect a user can see behaves correctly, and the thing that
    // breaks is a queue they cannot see. Which is why this is pinned by a test rather than left to be
    // noticed.
    expect(hoverLeave(GHOST_OFF, false, false, CONFIGURED)).toEqual({
      backdrop: "clear",
      intervalSec: null,
      fastRefreshFlag: null,
    })
  })

  test("with the panel visible the same pair round-trips cleanly", () => {
    // The positive control for the two arms above: the defect is specific to the collapsed panel, not a
    // property of the pair. This is what the majority of users get.
    expect(hoverEnter(GHOST_OFF, true).fastRefreshFlag).toBe(true)
    expect(hoverLeave(GHOST_OFF, true, false, CONFIGURED).fastRefreshFlag).toBe(false)
    expect(hoverEnter(GHOST_OFF, true).intervalSec).toBe(HOVER_INTERVAL_SEC)
    expect(hoverLeave(GHOST_OFF, true, false, CONFIGURED).intervalSec).toBe(CONFIGURED)
  })
})
