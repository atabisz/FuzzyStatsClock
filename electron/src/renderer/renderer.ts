/**
 * Renderer: turn a StatsSample into the SVG panel, once per push.
 *
 * The per-second cost of this port lives here, so two choices matter and both are
 * about *not* doing work:
 *
 *   1. **Write only what changed.** Assigning an identical string to `textContent`
 *      or an identical value to an attribute still dirties the node and schedules
 *      layout in Blink. `mem` and `pag` barely move between ticks, so most of the
 *      ten writes per second are avoidable, and the WPF original avoids them too
 *      (`UpdatePhraseIfChanged`).
 *   2. **Only `width` and `textContent` change, never geometry that reflows.** Bar
 *      width on a `rect` is a composited attribute change; changing `x`/`y` or the
 *      text's length in a way that moves siblings would re-rasterise the panel. The
 *      fixed 36px percentage column is what keeps the strings from doing that.
 *
 * `painted()` is called after each update. It is what lets the ISC-6 probe tell a
 * cheap renderer from a *throttled* one — Chromium defers rendering in a renderer it
 * thinks is occluded, and a probe that only measured CPU would read that as a win.
 */

// The `StatsSample` shape below is duplicated from `../shared.ts` rather than imported,
// because importing main-process code into the renderer bundle is what `contextIsolation`
// exists to prevent. The preload bridge is the only contract between the two halves.
//
// `../core/` is a different case and is imported directly: those modules are pure
// translations of `FuzzyClock.Core`, with no Node, Electron or IPC surface, and the WPF
// original calls the same code from its UI thread. Duplicating a formatter here instead
// is what left this file rendering "Sat, 7 Mar" where the WPF app renders "Sat, Mar 7".
import { formatDate } from "../core/date.js"
import { formatUptime } from "../core/uptime.js"

const UNAVAILABLE = -1

/** Bar track width, from index.html. A bar is this times the percentage. */
const TRACK_WIDTH = 113

interface StatsSample {
  cpu: number
  mem: number
  gpu: number
  pag: number
  battery: number
  pluggedIn: boolean
  uptimeSec: number
}

interface FuzzyClockApi {
  onStats(callback: (sample: StatsSample) => void): void
  painted(): void
  dragStart(): void
  dragMove(): void
  dragEnd(): void
  contextMenu(): void
}

declare global {
  interface Window {
    fuzzyclock: FuzzyClockApi
  }
}

function element<T extends Element>(id: string): T {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`missing element #${id}`)
  return found as unknown as T
}

interface Row {
  bar: SVGRectElement
  text: SVGTextElement
}

const rows: Record<"cpu" | "gpu" | "mem" | "pag" | "batt", Row> = {
  cpu: { bar: element("cpuBar"), text: element("cpuText") },
  gpu: { bar: element("gpuBar"), text: element("gpuText") },
  mem: { bar: element("memBar"), text: element("memText") },
  pag: { bar: element("pagBar"), text: element("pagText") },
  batt: { bar: element("battBar"), text: element("battText") },
}

const phraseEl = element<SVGTextElement>("phrase")
const dateEl = element<SVGTextElement>("date")
const uptimeEl = element<SVGTextElement>("uptime")

/** Last value written to each node, so an unchanged write can be skipped. */
const written = new Map<Element, string>()

function setText(node: Element, value: string): void {
  if (written.get(node) === value) return
  written.set(node, value)
  node.textContent = value
}

function setWidth(node: SVGRectElement, width: string): void {
  if (written.get(node) === width) return
  written.set(node, width)
  node.setAttribute("width", width)
}

/**
 * Render one metric.
 *
 * `-1` is "no source" and renders `--` with a zero-width bar. `0` is a real reading
 * of zero and renders `0%`, also with a zero-width bar. The bars look identical and
 * the text does not — which is the whole reason the sentinel is not folded into 0.
 */
function renderRow(row: Row, value: number): void {
  if (value === UNAVAILABLE) {
    setText(row.text, "--")
    setWidth(row.bar, "0")
    return
  }
  const clamped = Math.max(0, Math.min(100, value))
  setText(row.text, `${String(Math.round(clamped))}%`)
  // One decimal place: sub-pixel widths are what make a bar animate smoothly at
  // this size, and rounding to integers makes a slow-moving metric visibly step.
  setWidth(row.bar, ((clamped / 100) * TRACK_WIDTH).toFixed(1))
}

/**
 * Placeholder for the fuzzy phrase engine, which is Phase 2.
 *
 * Not a cost concern: the real engine is a lookup against 18 phrase providers that
 * runs when the 5-minute bucket changes, and the text node is rewritten at most once
 * a minute either way. It is here so the panel has a phrase of realistic length to
 * lay out and shadow.
 */
function placeholderPhrase(now: Date): string {
  const bucket = Math.round(now.getMinutes() / 5) * 5
  return bucket === 0 || bucket === 60 ? "about five" : `${String(bucket)} past five`
}

function render(sample: StatsSample): void {
  const now = new Date()
  setText(phraseEl, placeholderPhrase(now))
  // "Short" is `AppSettings.DateFormat`'s default (AppSettings.cs:42). Reading it from settings is
  // Phase 6; the format NAME is the only thing that will change here, not the call.
  setText(dateEl, formatDate("Short", now))

  renderRow(rows.cpu, sample.cpu)
  renderRow(rows.gpu, sample.gpu)
  renderRow(rows.mem, sample.mem)
  renderRow(rows.pag, sample.pag)
  renderRow(rows.batt, sample.battery)

  setText(uptimeEl, formatUptime(sample.uptimeSec))

  // Acknowledged from inside a frame callback, not straight after the writes above.
  // The writes only dirty nodes; `requestAnimationFrame` runs as part of the
  // rendering steps, and Chromium stops servicing it in a renderer it considers
  // hidden or occluded. That is precisely the state that would make ISC-6 read
  // cheap for the wrong reason, so the acknowledgement has to come from the half
  // that goes quiet.
  requestAnimationFrame(() => window.fuzzyclock.painted())
}

window.fuzzyclock.onStats(render)

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
 */
const rootEl = element<SVGSVGElement>("root")
let dragPointerId: number | null = null

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

function endDrag(): void {
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
