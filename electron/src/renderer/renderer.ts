/**
 * The renderer: one clock, four faces, five stat rows, and the window size they imply.
 *
 * ## Three loops, not one
 *
 *   1. **A settings push** (`onSettings`). Rare and user-driven. Resolves the locale, rebuilds every
 *      face, repaints the theme, and re-lays the stats panel.
 *   2. **A 1 Hz clock tick** (`setInterval`). Ticks the active face, rewrites the date, measures, and
 *      asks main to resize when the measurement changed the window.
 *   3. **A stats push** (`onStats`). Five bar widths, five percentages, one uptime string.
 *
 * The clock is on its own interval rather than riding the stats push, which is also 1 Hz today. Two
 * reasons: the C# keeps them apart the same way (a `DispatcherTimer` per concern), and Phase 6 may gate
 * sampling on `statsVisible` — at which point a clock driven by the stats channel would stop.
 *
 * ## Measure, then size. Never the reverse.
 *
 * `MainWindow.xaml` is `SizeToContent="WidthAndHeight"`, so the WPF window is whatever its content
 * measures. Nothing computes that here, so `core/layout.ts` composes it from a **measured** phrase width
 * and a **measured** date width, and this file's tick order is fixed: tick the face (which measures its
 * own text), measure the date, `windowLayout()`, then resize. Sizing first passes a phrase width of 0,
 * and a phrase window with no text is legitimately 24 wide — both paddings — so the symptom is a 24px
 * sliver for a frame, not a slightly wrong window.
 *
 * The date has to be measured too, and forgetting it is a clipped date rather than a subtle one: the
 * widest reachable date row is 422.24 (Consolas at date size 32), which is a 447-wide window, wider than
 * any face.
 *
 * ## Write only what changed, and hold no geometry of your own
 *
 * Every write goes through `svg.ts`'s per-element/per-attribute memo, so the faces and this file can be
 * written as "assign everything, every tick" without that being what happens. Assigning an attribute the
 * value it already holds still dirties the element for the compositor, and this window is transparent and
 * always-on-top — the configuration where a needless repaint costs most.
 *
 * The layout is re-derived every tick and only *written* when it changed, compared as a whole rather
 * than field by field, so a field added to `WindowLayout` cannot be silently left out of the check.
 *
 * This file holds no coordinate constants. It used to hold `TRACK_WIDTH = 113`, which is the number
 * `STATS_TRACK_WIDTH` was extracted to own, and `formatDate("Short", …)` hardcoded where
 * `settings.dateFormat` belongs.
 *
 * `painted()` is what lets the ISC-6 probe tell a cheap renderer from a *throttled* one — Chromium defers
 * rendering in a renderer it thinks is occluded, and a probe measuring only CPU would read that as a win.
 * It is acknowledged from the clock tick, which is the one loop that cannot be switched off.
 */

// `StatsSample` is duplicated from `../shared.ts` rather than imported, because importing main-process
// code into the renderer bundle is what `contextIsolation` exists to prevent. The preload bridge is the
// only contract between the two halves.
//
// `../core/` is a different case and is imported directly: those modules are pure translations of
// `FuzzyClock.Core`, with no Node, Electron or IPC surface, and the WPF original calls the same code from
// its UI thread. Duplicating a formatter here instead is what left this file rendering "Sat, 7 Mar" where
// the WPF app renders "Sat, Mar 7" — and `AppSettings` crosses the bridge for the same reason it is safe:
// it is a plain data shape declared in core, not in main.
import { formatDate } from "../core/date.js"
import { formatUptime } from "../core/uptime.js"
import { FACES, FACE_CONTAINER_IDS, activeFace, type Face } from "../core/display-plan.js"
import {
  BAR_HEIGHT,
  STATS_CHILD_GAP,
  STATS_FONT_SIZE,
  STATS_LABEL_WIDTH,
  STATS_TRACK_WIDTH,
  UPTIME_FONT_SIZE,
  WINDOW_PADDING,
  statsLayout,
  windowLayout,
  windowPixelSize,
  windowPlacement,
  type WindowLayout,
} from "../core/layout.js"
import { STATS_PANEL_WIDTH, lineHeight } from "../core/text-metrics.js"
import { parseAccentColor, resolveThemeColors } from "../core/display-colors.js"
import { FadePump } from "../core/ghost-fade.js"
import { phraseEngine } from "../core/phrase/engine.js"
import { resolveLocaleKey } from "../core/phrase/locale-key.js"
import type { AppSettings } from "../core/settings.js"
import { applyTheme } from "./theme.js"
import { element, setAttr, setText, setVisible } from "./svg.js"
import { createDialFace } from "./faces/dial-face.js"
import { createLcdFace } from "./faces/lcd-face.js"
import { createNixieFace } from "./faces/nixie-face.js"
import { createPhraseFace, createSplitFace } from "./faces/phrase-face.js"
import type { ClockFace } from "./faces/face.js"

/** `_clockTimer`'s interval. One second, like the C#'s. */
const TICK_MS = 1_000

const UNAVAILABLE = -1

interface StatsSample {
  cpu: number
  mem: number
  gpu: number
  pag: number
  battery: number
  pluggedIn: boolean
  uptimeSec: number
}

/** The ghost channel's payload. Every field optional: main sends only what moved. */
interface GhostState {
  readonly ratio?: number
  readonly menuOpen?: boolean
  readonly reset?: boolean
}

interface FuzzyClockApi {
  /** Main pushes the whole settings object on every change, and once in reply to `ready()`. */
  onSettings(callback: (settings: AppSettings) => void): void
  onStats(callback: (sample: StatsSample) => void): void
  /** The fade target and its pins. See `core/ghost-fade.ts` for why the animation is on this side. */
  onGhost(callback: (state: GhostState) => void): void
  /** "I am listening" — main replies with the current settings. See `init()`. */
  ready(): void
  /** The content-measured window size. Main calls `setSize` and re-clamps to the work area. */
  resize(size: { width: number; height: number }): void
  painted(): void
  dragStart(): void
  dragMove(): void
  dragEnd(): void
  contextMenu(): void
  /** +1 brighter, -1 dimmer. Main clamps and persists; see `core/opacity-step.ts`. */
  adjustOpacity(direction: number): void
}

declare global {
  interface Window {
    fuzzyclock: FuzzyClockApi
  }
}

/** The five stat rows, in `StatsPanel`'s child order — the order `statsLayout().rows` is in. */
const STAT_KEYS = ["cpu", "gpu", "mem", "pag", "batt"] as const
type StatKey = (typeof STAT_KEYS)[number]

/** `battery` is the only field whose name differs from its row's id prefix. */
function statValue(sample: StatsSample, key: StatKey): number {
  return key === "batt" ? sample.battery : sample[key]
}

interface Row {
  readonly label: SVGTextElement
  readonly track: SVGRectElement
  readonly bar: SVGRectElement
  readonly text: SVGTextElement
}

/**
 * Render one metric.
 *
 * `-1` is "no source" and renders `--` with a zero-width bar. `0` is a real reading of zero and renders
 * `0%`, also with a zero-width bar. The bars look identical and the text does not — which is the whole
 * reason the sentinel is not folded into 0.
 */
function renderRow(row: Row, value: number): void {
  if (value === UNAVAILABLE) {
    setText(row.text, "--")
    setAttr(row.bar, "width", 0)
    return
  }
  const clamped = Math.max(0, Math.min(100, value))
  setText(row.text, `${String(Math.round(clamped))}%`)
  // One decimal place: sub-pixel widths are what make a bar animate smoothly at this size, and rounding
  // to integers makes a slow-moving metric visibly step.
  setAttr(row.bar, "width", ((clamped / 100) * STATS_TRACK_WIDTH).toFixed(1))
}

/**
 * `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName`, as the browser reports it.
 *
 * `navigator.language` is a BCP-47 tag (`en-AU`), and `ResolveLocaleKey` compares against bare two-letter
 * codes — so `en-AU` reaching it unshortened would miss every arm and take the auto path under a UI it
 * should have matched.
 */
function uiLanguage(): string {
  return navigator.language.slice(0, 2).toLowerCase()
}

function init(): void {
  const rootEl = element<SVGSVGElement>("root")
  const windowBg = element<SVGRectElement>("windowBackground")
  const contentBg = element<SVGRectElement>("contentBackground")
  const dateEl = element<SVGTextElement>("date")
  const statsEl = element<SVGGElement>("stats")
  const uptimeEl = element<SVGTextElement>("uptime")
  const updateEl = element<SVGTextElement>("update")

  const rowFor = (key: StatKey): Row => ({
    label: element<SVGTextElement>(`${key}Label`),
    track: element<SVGRectElement>(`${key}Track`),
    bar: element<SVGRectElement>(`${key}Bar`),
    text: element<SVGTextElement>(`${key}Text`),
  })
  const rows: Readonly<Record<StatKey, Row>> = {
    cpu: rowFor("cpu"),
    gpu: rowFor("gpu"),
    mem: rowFor("mem"),
    pag: rowFor("pag"),
    batt: rowFor("batt"),
  }

  // The containers are looked up here as well as inside each face, so `place()` does not have to reach
  // through the `ClockFace` interface for something that is markup rather than behaviour.
  const containers: Readonly<Record<Face, SVGGElement>> = {
    phrase: element<SVGGElement>(FACE_CONTAINER_IDS.phrase),
    split: element<SVGGElement>(FACE_CONTAINER_IDS.split),
    dial: element<SVGGElement>(FACE_CONTAINER_IDS.dial),
    lcd: element<SVGGElement>(FACE_CONTAINER_IDS.lcd),
    nixie: element<SVGGElement>(FACE_CONTAINER_IDS.nixie),
  }

  const faces: Readonly<Record<Face, ClockFace>> = {
    phrase: createPhraseFace(),
    split: createSplitFace(),
    dial: createDialFace(),
    lcd: createLcdFace(),
    nixie: createNixieFace(),
  }

  let settings: AppSettings | null = null
  /** The last layout actually written to the DOM, serialised. Null until the first tick. */
  let placed: string | null = null
  /** The last size sent to main, so a resize is one IPC message per change and not one per second. */
  let sized: string | null = null
  let dateWidth = 0
  /** Set by a settings push: the date's font may have changed, so its measured width is stale. */
  let dateDirty = true

  /**
   * Ghost mode's renderer half (PERF-01): main sends where the fade is going, this side interpolates.
   *
   * `core/ghost-fade.ts` carries the whole argument for that split and the two deviations from
   * `OnRenderingTick` that make it survivable. Only three things are left for this file, and all three are
   * things main cannot see: the frame clock, the element the opacity goes on, and whether a drag is live.
   */
  const fade = new FadePump()
  /** RMB-04's `_menuOpen`, pushed from main on the ghost channel. A pin, not a target. */
  let menuOpen = false
  /**
   * The live `requestAnimationFrame` handle, or null when the pump is detached.
   *
   * Detaching rather than spinning a no-op frame is FADE-04's counterpart: `OnGhostEnabledChanged` removes
   * the `CompositionTarget.Rendering` handler outright, so a converged or disabled fade costs the
   * compositor nothing. A loop that woke 60 times a second to compare two equal numbers would read as
   * "the fade is cheap" on a CPU probe while still keeping this renderer's frame production alive — the
   * exact confusion `painted()` exists to prevent elsewhere in this file.
   */
  let fadeFrame: number | null = null
  /**
   * The pointer id of the drag in progress, or null.
   *
   * Declared up here rather than beside its handlers because the fade pump reads it as `FadeGuards.dragging`
   * and is defined above them. The four notes that matter are on the drag block at the bottom.
   */
  let dragPointerId: number | null = null

  /**
   * The stats panel's internal geometry, in panel-local coordinates.
   *
   * Written from `statsLayout()` rather than authored in `index.html`, because Phase 6's per-row
   * visibility moves every one of these numbers and a static copy would then be a second answer. Roughly
   * 34 attribute writes the first time and none afterwards — the memo absorbs the repeats.
   */
  const layoutStats = (): void => {
    const stats = statsLayout()
    // A row is a `Grid` and its label/value are `VerticalAlignment="Center"` in it. At font size 12 the
    // row height IS the line height, so this is 0 — written anyway, because the thing that makes it
    // non-zero is a per-row font size, which is exactly what Phase 6 might add.
    const textInset = (rowHeight: number): number =>
      (rowHeight - lineHeight("Segoe UI Light", STATS_FONT_SIZE)) / 2
    for (const [index, key] of STAT_KEYS.entries()) {
      const row = stats.rows[index]
      if (row === undefined) throw new RangeError(`statsLayout() has no row ${String(index)}`)
      const el = rows[key]
      setAttr(el.label, "x", 0)
      setAttr(el.label, "y", row.top + textInset(row.height))
      setAttr(el.label, "font-size", STATS_FONT_SIZE)
      setAttr(el.track, "x", STATS_LABEL_WIDTH)
      setAttr(el.track, "y", row.barY)
      setAttr(el.track, "width", STATS_TRACK_WIDTH)
      setAttr(el.track, "height", BAR_HEIGHT)
      setAttr(el.bar, "x", STATS_LABEL_WIDTH)
      setAttr(el.bar, "y", row.barY)
      setAttr(el.bar, "height", BAR_HEIGHT)
      // `text-anchor="end"` in the markup, so the value's x is the panel's right edge — one rule for all
      // five, which the arrange fixture licenses: `BattText`'s `HorizontalAlignment="Right"` lands on the
      // same 227.63 as the other four rows' `TextAlignment="Right"`.
      setAttr(el.text, "x", STATS_PANEL_WIDTH)
      setAttr(el.text, "y", row.top + textInset(row.height))
      setAttr(el.text, "font-size", STATS_FONT_SIZE)
    }
    setAttr(uptimeEl, "x", 0)
    setAttr(uptimeEl, "y", stats.uptimeTop)
    setAttr(uptimeEl, "font-size", UPTIME_FONT_SIZE)
    // `UpdateText` is the panel's 8th child and ships `Collapsed`, so it is placed but contributes
    // nothing to `statsPanelHeight()`. Phase 7 only has to unhide it.
    setAttr(updateEl, "x", 0)
    setAttr(updateEl, "y", stats.uptimeTop + stats.uptimeHeight + STATS_CHILD_GAP)
    setAttr(updateEl, "font-size", UPTIME_FONT_SIZE)
  }

  /** Write the window's own size and where the three rows sit in it. */
  const place = (layout: WindowLayout, size: { width: number; height: number }): void => {
    const at = windowPlacement(layout)

    // `width`/`height`/`viewBox` all take the CEILED size, so one user unit stays one CSS pixel. Using
    // the fractional layout width for the viewBox and the ceiled one for the attribute would scale the
    // whole document by up to half a percent — a blur, not an offset, and much harder to spot.
    setAttr(rootEl, "width", size.width)
    setAttr(rootEl, "height", size.height)
    setAttr(rootEl, "viewBox", `0 0 ${String(size.width)} ${String(size.height)}`)
    // The black panel covers the WHOLE window, padding included; it is a child of WPF's root Grid, not
    // of the padded Border.
    setAttr(windowBg, "width", size.width)
    setAttr(windowBg, "height", size.height)

    setAttr(contentBg, "x", WINDOW_PADDING)
    setAttr(contentBg, "y", WINDOW_PADDING)
    setAttr(contentBg, "width", layout.innerWidth)
    setAttr(contentBg, "height", layout.content.height)

    for (const face of FACES) {
      // The two text faces anchor on `centerX` with their text at local `x=0` and `text-anchor: middle`;
      // the three fixed-size faces anchor on `face.x`, which `windowPlacement` has already CENTRED — an
      // 80px dial under a 184px stats panel sits at 95.63, not at the 12px padding. The two are
      // algebraically the same point for a stretched row (`face.x + content.width / 2 === centerX`), and
      // the ternary is what stops the text faces re-writing a transform every time a measurement moves.
      const centred = face === "phrase" || face === "split"
      const x = centred ? at.centerX : at.face.x
      setAttr(containers[face], "transform", `translate(${String(x)} ${String(at.face.y)})`)
    }

    setAttr(dateEl, "x", at.centerX)
    setAttr(dateEl, "y", at.dateTop)
    setAttr(statsEl, "transform", `translate(${String(at.stats.x)} ${String(at.stats.y)})`)
  }

  /**
   * The one place the window's opacity is written. Four decimal places, deliberately.
   *
   * `setAttr` stringifies a number with `String` and never rounds — its own doc says so — which makes
   * precision the call site's job, as it already is for a bar width. 1e-4 is 0.0255 of one 8-bit alpha
   * level, finer than the compositor can render, and it lets the memo collapse the tail of a fade instead
   * of writing a fresh 17-digit string every frame while the asymptote crawls.
   *
   * A presentation attribute on `#root` rather than a stylesheet rule, because the CSP ships no
   * `unsafe-inline` and a CSS declaration BEATS a presentation attribute. So `opacity` joins the colours on
   * the property list `test/renderer-ids.test.ts` forbids `index.css` from declaring: a single
   * `#root { opacity: 1 }` there would leave the fade running, the ratio moving, and nothing on screen.
   */
  const writeOpacity = (value: number): void => {
    setAttr(rootEl, "opacity", value.toFixed(4))
  }

  /**
   * One fade frame, then either another or a detach. See {@link fadeFrame} for why detaching matters.
   *
   * The stop condition is `"converged"` and nothing else, because that is the only state with no work left:
   * a guard-skipped frame has a write *owed* (deviation 2 in `core/ghost-fade.ts`), so the loop has to stay
   * attached across a menu or a drag and land it the moment the guard lifts. That means a held guard spins
   * this at frame rate, which is what WPF does too — its `Rendering` handler is not detached by `_menuOpen`
   * — and it is why the tray's pin carries a 30-second watchdog.
   *
   * `settingsOpen` is a literal `false`: there is no settings window yet (ISC-32). Passed rather than
   * omitted so the guard is a wired input with one known caller to change, instead of a hole to rediscover.
   */
  const pumpFade = (nowMs: number): void => {
    fadeFrame = null
    const frame = fade.frame(nowMs, { dragging: dragPointerId !== null, settingsOpen: false, menuOpen })
    if (frame.opacity !== null) writeOpacity(frame.opacity)
    if (frame.skipped !== "converged") fadeFrame = requestAnimationFrame(pumpFade)
  }

  const startFade = (): void => {
    if (fadeFrame !== null) return
    fadeFrame = requestAnimationFrame(pumpFade)
  }

  const stopFade = (): void => {
    if (fadeFrame === null) return
    cancelAnimationFrame(fadeFrame)
    fadeFrame = null
  }

  const tick = (): void => {
    const current = settings
    if (current === null) return
    const now = new Date()
    const face = faces[activeFace(current)]
    face.tick(now)

    if (current.showDate) {
      // Re-measured only when the string or the font changed. `getComputedTextLength()` forces a
      // synchronous layout in Blink, which is the whole cost of this tick — and the date string changes
      // once a day.
      const rewritten = setText(dateEl, formatDate(current.dateFormat, now))
      if (rewritten || dateDirty) {
        dateDirty = false
        dateWidth = dateEl.getComputedTextLength()
      }
    }

    const measured = face.measure?.() ?? { width: 0, lines: 1 }
    const layout = windowLayout(current, measured.width, measured.lines, dateWidth)
    const size = windowPixelSize(layout)

    // Compared whole rather than field by field, so a field added to `WindowLayout` is covered without
    // anyone remembering to add it here.
    const key = JSON.stringify(layout)
    if (key !== placed) {
      placed = key
      place(layout, size)
    }
    const sizeKey = `${String(size.width)}x${String(size.height)}`
    if (sizeKey !== sized) {
      sized = sizeKey
      window.fuzzyclock.resize(size)
    }

    // Acknowledged from inside a frame callback, not straight after the writes above. The writes only
    // dirty nodes; `requestAnimationFrame` runs as part of the rendering steps, and Chromium stops
    // servicing it in a renderer it considers hidden or occluded. That is precisely the state that would
    // make ISC-6 read cheap for the wrong reason, so the acknowledgement has to come from the half that
    // goes quiet.
    requestAnimationFrame(() => window.fuzzyclock.painted())
  }

  const applySettings = (next: AppSettings): void => {
    settings = next

    // `ApplySettings` :650 pushes the locale before anything repaints, so the phrase the next tick asks
    // for comes from the right table. `setLocale` returns false for an unregistered key and leaves the
    // engine where it was — which is the shipped behaviour for auto-detected Japanese, and the reason the
    // return value is deliberately not checked here.
    phraseEngine.setLocale(resolveLocaleKey(next.phraseLocale, next.phraseStyle, uiLanguage()))

    const theme = resolveThemeColors(parseAccentColor(next.accentColor), null)
    const active = activeFace(next)

    // EVERY face rebuilds, not just the visible one. `ApplyFontSize` and `SetTextStyle` assign to
    // `PhraseText`, `QualifierText` and `EmphasisText` regardless of which is on screen, so a font change
    // made while the dial is showing must still reach the phrase. The hidden faces are cheap: each one's
    // `structureGate` only rebuilds geometry when its own structure key moved, so this is a handful of
    // memoized attribute writes unless something real changed.
    for (const face of FACES) faces[face].rebuild({ settings: next, theme })
    // Then all five visibilities, including the four that go off. Driving every face rather than tracking
    // "the previous one" is what removes the first-push special case, and `setVisible`'s memo makes the
    // repeats free.
    for (const face of FACES) faces[face].activate(face === active)

    applyTheme(element, theme)
    setVisible(dateEl, next.showDate)
    setVisible(statsEl, next.statsVisible)
    layoutStats()

    // The whole opacity product lives on this side now, window alpha included — `core/ghost-fade.ts` records
    // why main stopped calling `setOpacity`. The direct write is REQUIRED and not belt-and-braces: at
    // startup and after any settings change the pump is converged, so it returns a null opacity, and the
    // user's saved opacity would never reach the DOM at all.
    fade.setWindowOpacity(next.opacity)
    writeOpacity(fade.visibleOpacity())

    dateDirty = true
    // Tick now rather than waiting up to a second: this is the push that has to complete a
    // measure-then-size cycle before `ready-to-show` fires, or the window is shown at the placeholder
    // 232x260 and snaps.
    tick()
  }

  const applyStats = (sample: StatsSample): void => {
    for (const key of STAT_KEYS) renderRow(rows[key], statValue(sample, key))
    setText(uptimeEl, formatUptime(sample.uptimeSec))
  }

  /**
   * A ghost push. Every field is optional and main sends one at a time, but any combination is handled.
   *
   * The pin is applied before the target is read, which is `OnRenderingTick`'s own order — though here it
   * genuinely cannot matter, since both only take effect in the next frame rather than in this call.
   */
  const applyGhost = (state: GhostState): void => {
    if (state.menuOpen !== undefined) menuOpen = state.menuOpen
    if (state.reset === true) {
      // Both edges that produce a reset — ghost mode disabled, and the full retreat that fires `Restored` —
      // snap rather than fade back. `SetGhostModeEnabled(false)` writes `Opacity = _windowOpacity` directly,
      // and a `Restored` means the cursor has already left the halo: animating a return to a state the user
      // is no longer near is motion nobody asked for. Snapping also means this write cannot be swallowed by
      // a guard, which is what makes the disable edge safe to take mid-drag.
      fade.restore()
      stopFade()
      writeOpacity(fade.visibleOpacity())
      return
    }
    if (state.ratio !== undefined) fade.setTarget(state.ratio)
    // Unconditional, and that covers the case a `menuOpen`-only message creates: the pump may be detached at
    // a non-zero ratio with a write owed from the instant the pin lifts. One frame that finds nothing to do
    // returns `"converged"` and detaches itself again, so the cost of being wrong here is a single frame.
    startFade()
  }

  // Listeners BEFORE `ready()`. `webContents.send` into a renderer with no listener on that channel is
  // dropped silently, so a `ready()` that raced the registration would leave the clock on null settings
  // forever — with no error anywhere.
  window.fuzzyclock.onSettings(applySettings)
  window.fuzzyclock.onStats(applyStats)
  window.fuzzyclock.onGhost(applyGhost)
  window.fuzzyclock.ready()

  setInterval(tick, TICK_MS)

  /**
   * Drag-to-move and right-click, the renderer's half.
   *
   * `MainWindow.Grid_MouseLeftButtonDown` is where the WPF app calls `DragMove()`; this is that handler,
   * except the movement itself happens in main. Four notes, each of which is a bug avoided:
   *
   *   1. **`document`, not `#root`.** SVG shapes only receive pointer events where they are painted, so
   *      binding to the `<svg>` would make the 12px transparent strip below the panel dead to a drag —
   *      and the WPF handler is on the root Grid, which covers everything.
   *   2. **Pointer capture.** Without it a fast drag outstrips the window, the cursor leaves it, and the
   *      moves stop arriving mid-gesture: the widget stalls and then jumps on the next event inside it.
   *      Capture keeps the whole gesture addressed to this document however far the cursor gets.
   *   3. **No throttle on `pointermove`.** Every move is an IPC message and a `setPosition`, and that is
   *      the point: `DragMove` is a Win32 modal loop doing exactly this per mouse message. Coalescing
   *      them would make the window lag the cursor, which is the one thing a drag must not do.
   *   4. **`pointercancel` ends the drag too.** The OS takes the pointer away on a session lock or a
   *      touch gesture being reinterpreted, and `pointerup` never arrives — leaving main convinced a drag
   *      is still in progress, which suppresses the context menu (RMB-02) until the next click.
   *
   * `dragPointerId` itself is declared with the other renderer state, because the fade pump reads it.
   */
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return
    dragPointerId = event.pointerId
    rootEl.setPointerCapture(event.pointerId)
    window.fuzzyclock.dragStart()
    // Suppresses text selection and the native image drag; neither is meaningful on an overlay, and both
    // leave the cursor in a drag state the window does not follow.
    event.preventDefault()
  })

  document.addEventListener("pointermove", () => {
    if (dragPointerId === null) return
    window.fuzzyclock.dragMove()
  })

  const endDrag = (): void => {
    if (dragPointerId === null) return
    if (rootEl.hasPointerCapture(dragPointerId)) rootEl.releasePointerCapture(dragPointerId)
    dragPointerId = null
    window.fuzzyclock.dragEnd()
  }

  document.addEventListener("pointerup", endDrag)
  document.addEventListener("pointercancel", endDrag)

  document.addEventListener("contextmenu", (event) => {
    // Chromium's own menu would appear over the widget with Reload/Inspect on it. Main decides whether
    // the tray menu opens at all (RMB-02/RMB-03).
    event.preventDefault()
    window.fuzzyclock.contextMenu()
  })

  /**
   * `Window_PreviewMouseWheel`: one notch is one 10% opacity step.
   *
   * Only the SIGN crosses the bridge, and it is inverted here rather than in `core/opacity-step.ts` — that
   * module takes a direction, while "up is negative" is a DOM fact about `WheelEvent` that WPF's `e.Delta`
   * reverses. Sending the raw delta would put a `deltaMode` and a device sensitivity on the wire for a
   * setting that moves in tenths.
   */
  document.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault()
      const direction = -Math.sign(event.deltaY)
      // A horizontal-only scroll is a real event with `deltaY === 0`, and main would treat 0 as a no-op
      // anyway. Returning here keeps a trackpad's sideways drift off the IPC channel entirely.
      if (direction === 0) return
      window.fuzzyclock.adjustOpacity(direction)
    },
    // Not passive. Chromium treats a `wheel` listener on `document` as passive by default, and
    // `preventDefault` inside a passive listener is ignored with a console warning — so without this the
    // page would scroll as well. Invisible on a document with no overflow, until a face is added that has
    // some, at which point the widget's own content would slide under the wheel.
    { passive: false },
  )
}

// The one top-level DOM access in this directory, and the reason for the rule: Bun has to be able to
// import `svg.ts`, `theme.ts` and every `faces/*.ts` for their pure exports, so nothing else here may
// touch `document` before a function is called. No test imports this file.
init()
