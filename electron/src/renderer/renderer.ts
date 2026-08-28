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

// Marks this file a module. Without it TypeScript treats the bundle entry as a global
// script and rejects the `declare global` below (TS2669) — and the types here cannot
// come from `../shared.js` instead, because importing main-process code into the
// renderer bundle is what `contextIsolation` exists to prevent. They are duplicated on
// purpose; the preload bridge is the only contract between the two halves.
export {}

const UNAVAILABLE = -1

/** Bar track width, from index.html. A bar is this times the percentage. */
const TRACK_WIDTH = 113

interface Temperatures {
  cpu: number
  gpu: number
  mobo: number
  nvme: number
}

interface StatsSample {
  cpu: number
  mem: number
  gpu: number
  pag: number
  battery: number
  pluggedIn: boolean
  temps: Temperatures
  uptimeSec: number
}

interface FuzzyClockApi {
  onStats(callback: (sample: StatsSample) => void): void
  painted(): void
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
const tempsEl = element<SVGTextElement>("temps")

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

function formatUptime(seconds: number): string {
  if (seconds <= 0) return "up —"
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (days > 0) return `up ${String(days)}d ${String(hours)}h`
  if (hours > 0) return `up ${String(hours)}h ${String(minutes)}m`
  return `up ${String(minutes)}m`
}

function formatTemps(temps: Temperatures): string {
  const parts: string[] = []
  if (temps.cpu !== UNAVAILABLE) parts.push(`cpu ${String(Math.round(temps.cpu))}°`)
  if (temps.gpu !== UNAVAILABLE) parts.push(`gpu ${String(Math.round(temps.gpu))}°`)
  if (temps.mobo !== UNAVAILABLE) parts.push(`mb ${String(Math.round(temps.mobo))}°`)
  if (temps.nvme !== UNAVAILABLE) parts.push(`ssd ${String(Math.round(temps.nvme))}°`)
  return parts.join("  ")
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
  setText(
    dateEl,
    now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
  )

  renderRow(rows.cpu, sample.cpu)
  renderRow(rows.gpu, sample.gpu)
  renderRow(rows.mem, sample.mem)
  renderRow(rows.pag, sample.pag)
  renderRow(rows.batt, sample.battery)

  setText(uptimeEl, formatUptime(sample.uptimeSec))
  setText(tempsEl, formatTemps(sample.temps))

  // Acknowledged from inside a frame callback, not straight after the writes above.
  // The writes only dirty nodes; `requestAnimationFrame` runs as part of the
  // rendering steps, and Chromium stops servicing it in a renderer it considers
  // hidden or occluded. That is precisely the state that would make ISC-6 read
  // cheap for the wrong reason, so the acknowledgement has to come from the half
  // that goes quiet.
  requestAnimationFrame(() => window.fuzzyclock.painted())
}

window.fuzzyclock.onStats(render)
