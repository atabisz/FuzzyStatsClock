/**
 * Phase 4 — ISC-21, ISC-22, ISC-23: the faces, measured off the LIVE DOM of a running app.
 *
 * ## Why this reads the DOM back over CDP instead of testing the renderer directly
 *
 * There is no DOM test library in this project (`electron/package.json` devDeps are five packages and
 * none of them is jsdom or happy-dom), and that is a deliberate choice rather than a gap: the failures
 * worth catching here are ones a fake DOM cannot have. A `<use>` whose target is missing renders nothing
 * with no console error. A CSS declaration silently beats a presentation attribute, so `applyTheme`
 * writing `fill="rgb(255 140 0)"` and the element painting white are the same source. An `<svg>` is a
 * replaced inline element, so a missing `#root { display: block }` costs four pixels nobody wrote. All
 * three need Chromium's own cascade, which means the real app.
 *
 * So this launches `dist/main.js` five times -- once per face -- with `--remote-debugging-port`, seeds a
 * settings file into a throwaway profile, waits for the app's own `PROBE-READY`, and reads computed
 * styles and attributes back out of the live document.
 *
 * ## Five launches, not fifteen, and the reduction is stated rather than hidden
 *
 * One launch per settings combination is the only route: `main.ts` does not watch the settings file, and
 * CDP cannot reach `ipcRenderer` (the bridge lives in an isolated world the protocol's default execution
 * context does not include). Five faces times three accents would be fifteen launches for a probe whose
 * accent path is one function -- `applyTheme` -- already unit-tested over all 26 targets in
 * `test/theme.test.ts`. So each face gets its own distinct accent instead: every face is seen, and every
 * accent still travels the whole path from the settings file to a computed `fill`. What that drops is
 * accent x face interaction, and there is none to drop -- no face reads the accent except the LCD, whose
 * skin derivation is its own tested function. The reduction is `log()`ed at the top of the run.
 *
 * ## The dial cannot be frame-scrubbed, and the plan's wording says it can
 *
 * `ELECTRON-PORT-PLAN.md` exits Phase 4 on "a frame scrub shows the dial hands moving via `transform`
 * only". The first half of that is not measurable: `dialPlan()` reads hours and minutes and nothing
 * finer, so the hands move once a MINUTE and a three-second scrub sees two identical frames. Scrubbing
 * anyway would produce a green that means "the dial did not change in 3s", which is true of a completely
 * broken dial as well.
 *
 * The replacement is stronger than the scrub in both halves. Position: the hands' `transform` attribute
 * is compared against `handTransform(dialPlan(now))` computed here from the same wall clock, so the
 * probe checks the ANGLE and not merely that something changed. Mechanism: `x1`/`y1`/`x2`/`y2` are
 * asserted unchanged from their authored values and `element.style.transform` asserted empty, which is
 * what "via `transform` only" actually claims -- no endpoint arithmetic, and no CSS transform that the
 * project's CSP would refuse to apply anyway.
 *
 * The genuine animation arms move to the two faces that do animate per frame: the LCD colon dots repaint
 * every second, and the Nixie glow `opacity` every 40 ms. The sample schedule below covers both.
 *
 * ## The negative half: three faces must NOT change
 *
 * `svg.ts`'s write-only-what-changed memo is the reason the app can hold a 1 Hz tick at ISC-6's cost
 * ceiling, and it is invisible when it works. So the sample schedule is read both ways: the LCD and
 * Nixie faces must produce several distinct DOM states across three seconds, and the phrase, split and
 * dial faces must produce exactly ONE. A phrase face that rewrites identical text every second passes
 * every other arm in this file.
 *
 * ## Alex's live settings file is never read and never written
 *
 * Each launch gets `--user-data-dir` on a fresh temp directory with a complete settings file already in
 * it, so the store loads from the profile and the WPF import path -- which is what would reach
 * `%LOCALAPPDATA%\FuzzyClock\settings.json` -- never runs. That file is `probe-shell.ts`'s business (arm
 * S6, read-only) and none of this probe's.
 *
 * ## What this does NOT prove
 *
 * Nothing here compares a rendered pixel to WPF. The vertical offset between SVG's
 * `dominant-baseline: text-before-edge` and WPF's `FontFamily.Baseline` is a recorded, unmeasured
 * residual; arm D10 reports `#date`'s box against its own `y` so the number exists on the record, and it
 * is diagnostic because there is no WPF measurement on this host to compare it to. Fonts are also
 * host-dependent: every text width here is Segoe UI Light as this machine has it.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  DIAL_CENTER_X,
  DIAL_CENTER_Y,
  HOUR_HAND_LENGTH,
  MINUTE_HAND_LENGTH,
  handTransform,
  hourNumbers,
  hourTicks,
  minuteDots,
} from "../src/core/dial-geometry.js"
import {
  ACCENT_TARGET_IDS,
  DIM_TARGET_IDS,
  NEVER_THEMED_IDS,
  PHASE_7_ACCENT_TARGET_IDS,
  STRUCTURAL_IDS,
  cssColor,
  parseAccentColor,
  resolveThemeColors,
} from "../src/core/display-colors.js"
import { DIGIT_PATHS, GLOW_LAYER_COLORS } from "../src/core/nixie-geometry.js"
import { FACES, FACE_CONTAINER_IDS, activeFace, dialPlan, type Face } from "../src/core/display-plan.js"
import { DEFAULTS, type AppSettings } from "../src/core/settings.js"
import { LCD_SLOT_COUNTS } from "../src/renderer/faces/lcd-face.js"
import { NIXIE_COLON_GRADIENT_ID, NIXIE_GLYPH_IDS } from "../src/renderer/faces/nixie-face.js"
import { PHRASE_LINE_CLASS } from "../src/renderer/faces/phrase-face.js"
import { SETTINGS_FILENAME } from "../src/main/settings-store.js"
import { THEME_TARGETS, paintPropertyFor } from "../src/renderer/theme.js"
import { fontStackFor } from "../src/core/text-metrics.js"
import { spawnElectron } from "./lib/electron-launch.js"

const HERE = import.meta.dirname
const MAIN = join(HERE, "..", "dist", "main.js")

const READY_TIMEOUT_MS = 25_000
const CDP_TIMEOUT_MS = 15_000
/** The base debugging port. Each case adds its index, so a socket in TIME_WAIT cannot stall the next. */
const BASE_PORT = 9455

/** Seven segments, a..g -- `buildSevenSegmentDigit` builds one polygon per segment in every slot. */
const SEGMENTS_PER_SLOT = 7
/** Both colon dots exist in every slot, digit or colon: `RebuildGeometry` builds them unconditionally. */
const DOTS_PER_SLOT = 2

/**
 * The whole id contract, assembled from the seven sets that own it rather than written out here.
 *
 * `test/renderer-ids.test.ts` proves this sums to 46 and that the sets are disjoint. Re-listing the ids
 * in this file would be a second copy that keeps passing after the first one moves.
 */
const CONTRACT_IDS: readonly string[] = [
  ...ACCENT_TARGET_IDS,
  ...DIM_TARGET_IDS,
  ...NEVER_THEMED_IDS,
  ...PHASE_7_ACCENT_TARGET_IDS,
  ...STRUCTURAL_IDS,
  ...NIXIE_GLYPH_IDS,
  NIXIE_COLON_GRADIENT_ID,
]

/** `performance.now()` offsets to sample at: 40 ms apart for the Nixie flicker, then across two seconds. */
const SAMPLE_TIMES = [0, 40, 80, 120, 160, 200, 300, 500, 1_100, 2_100, 3_100]

interface ProbeCase {
  readonly name: string
  readonly face: Face
  readonly overrides: Partial<AppSettings>
}

/**
 * One case per face, each at its own accent.
 *
 * Two of the overrides are load-bearing beyond selecting the face:
 *  - the dial case sets all three `show*` decoration flags, which DEFAULT FALSE. Without them
 *    `dial-face.ts` leaves the tick, dot and number groups `display="none"` and a probe reading an empty
 *    dial would call it correct.
 *  - the LCD case sets `textStyle: "Literary"`, which no LCD pixel depends on. It is there to measure the
 *    renderer's decision that ALL FIVE faces rebuild on a settings push and not just the active one: if
 *    only the LCD rebuilt, `#phrase`'s computed font-family would still be Segoe UI Light.
 * The Nixie case's accent is semi-transparent, which is the alpha path through `cssColor`.
 */
const CASES: readonly ProbeCase[] = [
  {
    name: "phrase",
    face: "phrase",
    overrides: { clockType: "phrase", textStyle: "Classic", accentColor: "#FFFF8C00" },
  },
  {
    name: "split",
    face: "split",
    overrides: { clockType: "phrase", textStyle: "Split", accentColor: "#FF00BFFF" },
  },
  {
    name: "dial",
    face: "dial",
    overrides: {
      clockType: "dial",
      accentColor: "#FF7FFF00",
      showHourTicks: true,
      showMinuteDots: true,
      showHourNumbers: true,
    },
  },
  {
    name: "lcd",
    face: "lcd",
    overrides: {
      clockType: "lcd",
      lcdStyle: "Silver",
      lcdShowSeconds: true,
      textStyle: "Literary",
      accentColor: "#FFFF1493",
    },
  },
  {
    name: "nixie",
    face: "nixie",
    overrides: { clockType: "nixie", accentColor: "#80FFFFFF" },
  },
]

// ---------------------------------------------------------------------------------------------------
// Arms. The blocking-vs-diagnostic split and the exit-code rule are `probe-shell.ts`'s, unchanged.
// ---------------------------------------------------------------------------------------------------

type Verdict = "PASS" | "FAIL" | "INCONCLUSIVE"
const results: { name: string; verdict: Verdict; detail: string; blocking: boolean }[] = []

function record(name: string, verdict: Verdict, detail: string, blocking = false): void {
  results.push({ name, verdict, detail, blocking })
  console.log(`  → ${verdict}${blocking ? " (blocking)" : ""}: ${detail}`)
}

function log(message: string): void {
  console.log(message)
}

// ---------------------------------------------------------------------------------------------------
// The in-page harvest. One `Runtime.evaluate`, one round trip, everything every arm needs.
// ---------------------------------------------------------------------------------------------------

interface Sample {
  t: number
  faceHash: number
  faceLen: number
  hourHand: string | null
  glow: string
  lcdDots: string
  root: string
}

interface AttrMap {
  [name: string]: string | null
}

interface Harvest {
  ids: string[]
  faces: Record<string, { display: string | null; children: number } | null>
  root: AttrMap | null
  inner: { width: number; height: number; dpr: number }
  paints: Record<string, string | null>
  fonts: Record<string, string | null>
  texts: Record<string, string | null>
  decorations: Record<string, string | null>
  hands: Record<string, (AttrMap & { inline: string | null }) | null>
  counts: Record<string, number>
  uses: { href: string | null; resolved: boolean }[]
  date: { y: string | null; bbox: { x: number; y: number; width: number; height: number } | null; length: number }
  statsDisplay: string | null
  bars: Record<string, string | null>
  samples: Sample[]
}

/**
 * Built as a string because it runs in the page, not here.
 *
 * Deliberately no template literals inside the page code: this file is already inside one, and the
 * nesting is the kind of thing that produces a probe that measures a syntax error. String concatenation
 * costs nothing at this size.
 */
function harvestExpression(activeId: string, themed: { id: string; prop: string }[]): string {
  const constants = JSON.stringify({
    ids: CONTRACT_IDS,
    faceIds: FACE_CONTAINER_IDS,
    themed,
    times: SAMPLE_TIMES,
    activeId,
    lineClass: PHRASE_LINE_CLASS,
  })
  return `(() => {
  const K = ${constants}
  const q = (id) => document.getElementById(id)
  const count = (sel) => document.querySelectorAll(sel).length
  const all = (sel) => Array.from(document.querySelectorAll(sel))
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) { h = ((h * 33) ^ s.charCodeAt(i)) | 0 } return h }
  const attrs = (id, names) => {
    const el = q(id)
    if (el === null) return null
    const out = {}
    for (const n of names) out[n] = el.getAttribute(n)
    return out
  }
  const attrOf = (id, name) => { const el = q(id); return el === null ? null : el.getAttribute(name) }
  const textOf = (id) => { const el = q(id); return el === null ? null : el.textContent }
  const styleOf = (id, prop) => {
    const el = q(id)
    if (el === null) return null
    return window.getComputedStyle(el).getPropertyValue(prop)
  }
  const handOf = (id) => {
    const el = q(id)
    if (el === null) return null
    const out = attrs(id, ["transform", "x1", "y1", "x2", "y2"])
    out.inline = el.style.transform
    return out
  }

  const paints = {}
  for (const t of K.themed) paints[t.id + ":" + t.prop] = styleOf(t.id, t.prop)

  const faces = {}
  for (const face of Object.keys(K.faceIds)) {
    const el = q(K.faceIds[face])
    faces[face] = el === null ? null : { display: el.getAttribute("display"), children: el.childElementCount }
  }

  let bbox = null
  try {
    const el = q("date")
    if (el !== null) { const b = el.getBBox(); bbox = { x: b.x, y: b.y, width: b.width, height: b.height } }
  } catch (e) { bbox = null }
  let textLength = 0
  try { const el = q("date"); if (el !== null) textLength = el.getComputedTextLength() } catch (e) { textLength = 0 }

  const activeEl = q(K.activeId)
  const sample = () => ({
    t: Math.round(performance.now()),
    faceHash: activeEl === null ? 0 : hash(activeEl.outerHTML),
    faceLen: activeEl === null ? 0 : activeEl.outerHTML.length,
    hourHand: attrOf("hourHand", "transform"),
    glow: all(".nixieGlow").map((e) => e.getAttribute("opacity")).join(","),
    lcdDots: all(".lcdDot").map((e) => e.getAttribute("fill")).join(","),
    root: String(attrOf("root", "width")) + "x" + String(attrOf("root", "height")),
  })

  const statics = {
    ids: all("[id]").map((e) => e.id),
    faces,
    root: attrs("root", ["width", "height", "viewBox"]),
    inner: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    paints,
    fonts: {
      phrase: styleOf("phrase", "font-family"),
      qualifier: styleOf("qualifier", "font-family"),
      emphasis: styleOf("emphasis", "font-family"),
      date: styleOf("date", "font-family"),
      root: styleOf("root", "font-family"),
    },
    texts: {
      phrase: textOf("phrase"),
      qualifier: textOf("qualifier"),
      emphasis: textOf("emphasis"),
      date: textOf("date"),
      uptime: textOf("uptime"),
      cpuText: textOf("cpuText"),
      battText: textOf("battText"),
    },
    decorations: {
      hourTicks: attrOf("hourTicks", "display"),
      minuteDots: attrOf("minuteDots", "display"),
      hourNumbers: attrOf("hourNumbers", "display"),
    },
    hands: { hour: handOf("hourHand"), minute: handOf("minuteHand") },
    counts: {
      phraseLine: count("." + K.lineClass),
      dialTick: count(".dialTick"),
      dialDot: count(".dialDot"),
      dialNumber: count(".dialNumber"),
      lcdSlot: count(".lcdSlot"),
      lcdSeg: count(".lcdSeg"),
      lcdDot: count(".lcdDot"),
      nixieTube: count(".nixieTube"),
      nixieGlow: count(".nixieGlow"),
      nixieGhost: count(".nixieGhost"),
      nixieColonDot: count(".nixieColonDot"),
      use: count("use"),
    },
    uses: all("use").map((u) => {
      const href = u.getAttribute("href")
      return {
        href,
        resolved: href !== null && href.charAt(0) === "#" && document.getElementById(href.slice(1)) !== null,
      }
    }),
    date: { y: attrOf("date", "y"), bbox, length: textLength },
    statsDisplay: attrOf("stats", "display"),
    bars: {
      cpu: attrOf("cpuBar", "width"),
      gpu: attrOf("gpuBar", "width"),
      mem: attrOf("memBar", "width"),
      pag: attrOf("pagBar", "width"),
      batt: attrOf("battBar", "width"),
    },
    samples: [],
  }

  return new Promise((resolve) => {
    let i = 0
    const step = () => {
      statics.samples.push(sample())
      i++
      if (i >= K.times.length) { resolve(statics); return }
      setTimeout(step, K.times[i] - K.times[i - 1])
    }
    step()
  })
})()`
}

// ---------------------------------------------------------------------------------------------------
// CDP: the smallest client that can run one expression. No dependency, and none is warranted.
// ---------------------------------------------------------------------------------------------------

interface CdpTarget {
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

async function pageTarget(port: number, deadline: number): Promise<CdpTarget | null> {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/json/list`)
      const list = (await response.json()) as CdpTarget[]
      const page = list.find((t) => t.type === "page" && typeof t.webSocketDebuggerUrl === "string")
      if (page !== undefined) return page
    } catch {
      // The endpoint is not up yet. Chromium binds it lazily, so a connection refusal here is normal.
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return null
}

/**
 * One expression, one socket, closed after.
 *
 * `awaitPromise` is on because the harvest returns a Promise -- the sample schedule needs three seconds
 * of wall clock inside the page, and resolving it here rather than by polling from Bun keeps the sample
 * intervals on the renderer's own clock instead of the round-trip latency.
 */
function evaluate(wsUrl: string, expression: string): Promise<{ value?: unknown; error?: string }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl)
    let settled = false
    const finish = (outcome: { value?: unknown; error?: string }): void => {
      if (settled) return
      settled = true
      try {
        ws.close()
      } catch {
        // Closing a socket that never opened throws on some paths; the result is already in hand.
      }
      resolve(outcome)
    }
    const timer = setTimeout(() => finish({ error: `no CDP reply within ${String(CDP_TIMEOUT_MS)}ms` }), CDP_TIMEOUT_MS)
    ws.onopen = (): void => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      )
    }
    ws.onerror = (): void => {
      clearTimeout(timer)
      finish({ error: "the CDP websocket errored -- if this is a 403, --remote-allow-origins is missing" })
    }
    ws.onmessage = (event: MessageEvent): void => {
      let message: {
        id?: number
        result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } }
        error?: { message?: string }
      }
      try {
        message = JSON.parse(String(event.data)) as typeof message
      } catch (e) {
        clearTimeout(timer)
        finish({ error: `unparseable CDP frame: ${String(e)}` })
        return
      }
      if (message.id !== 1) return
      clearTimeout(timer)
      if (message.error !== undefined) {
        finish({ error: `CDP error: ${message.error.message ?? "(no message)"}` })
        return
      }
      const details = message.result?.exceptionDetails
      if (details !== undefined) {
        finish({ error: `the page threw: ${details.exception?.description ?? details.text ?? "(no description)"}` })
        return
      }
      finish({ value: message.result?.result?.value })
    }
  })
}

// ---------------------------------------------------------------------------------------------------
// A launch: seed the profile, start the app, wait for its own ready line, harvest, kill.
// ---------------------------------------------------------------------------------------------------

interface Launch {
  profileDir: string
  stdout: string
  stderr: string
  ready: boolean
  harvest: Harvest | null
  error: string | null
  /** The wall clock immediately before the harvest returned -- what `dialPlan` is compared against. */
  harvestedAt: Date
}

async function launch(probeCase: ProbeCase, port: number): Promise<Launch> {
  const profileDir = mkdtempSync(join(tmpdir(), "fc-display-profile-"))
  const settings: AppSettings = { ...DEFAULTS, ...probeCase.overrides, statsVisible: true, showDate: true }
  writeFileSync(join(profileDir, SETTINGS_FILENAME), JSON.stringify(settings, null, 2), "utf8")

  const proc = spawnElectron(MAIN, [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${String(port)}`,
    // Chromium 111+ rejects a DevTools websocket handshake carrying an unlisted `Origin`. Bun's client
    // may or may not send one depending on version, and a 403 here looks exactly like "the app did not
    // start" -- so the switch is unconditional rather than a thing to debug later.
    "--remote-allow-origins=*",
  ])
  const out: Launch = {
    profileDir,
    stdout: "",
    stderr: "",
    ready: false,
    harvest: null,
    error: null,
    harvestedAt: new Date(),
  }
  proc.stdout.on("data", (c: Buffer) => {
    out.stdout += c.toString()
  })
  proc.stderr.on("data", (c: Buffer) => {
    out.stderr += c.toString()
  })

  out.ready = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), READY_TIMEOUT_MS)
    const check = setInterval(() => {
      if (/^PROBE-READY /m.test(out.stdout)) {
        clearInterval(check)
        clearTimeout(timer)
        resolve(true)
      }
    }, 100)
    proc.on("exit", () => {
      clearInterval(check)
      clearTimeout(timer)
      resolve(/^PROBE-READY /m.test(out.stdout))
    })
  })

  if (out.ready) {
    // `PROBE-READY` is printed inside `ready-to-show`, which is main's view of the window. The renderer's
    // first tick, its `resize` and main's `setContentSize` all follow it, so a harvest taken immediately
    // would read a document mid-startup and blame the faces for it.
    await new Promise((r) => setTimeout(r, 1_200))
    const target = await pageTarget(port, Date.now() + CDP_TIMEOUT_MS)
    if (target === null) {
      out.error = `no CDP page target on port ${String(port)} within ${String(CDP_TIMEOUT_MS)}ms`
    } else {
      const themed = THEME_TARGETS.map((t) => ({ id: t.id, prop: paintPropertyFor(t.id) }))
      const outcome = await evaluate(target.webSocketDebuggerUrl as string, harvestExpression(FACE_CONTAINER_IDS[probeCase.face], themed))
      out.harvestedAt = new Date()
      if (outcome.error !== undefined) out.error = outcome.error
      else out.harvest = outcome.value as Harvest
    }
  }

  proc.kill()
  await new Promise<void>((resolve) => {
    proc.on("exit", () => resolve())
    setTimeout(resolve, 3_000)
  })
  return out
}

/** Chromium's GPU and renderer children outlive the main process and hold the profile lock. */
async function cleanup(dir: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch (e) {
      if (attempt >= 6) {
        console.log(`  note: could not remove ${dir} (${String(e)}) -- left for the OS to reap`)
        return
      }
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Comparators.
// ---------------------------------------------------------------------------------------------------

/**
 * A computed colour reduced to four numbers.
 *
 * `cssColor` emits CSS Color 4 space-separated `rgb(r g b / a)`; Chromium's computed style hands back
 * legacy `rgb(r, g, b)` or `rgba(r, g, b, a)`. Comparing the strings would fail on every semi-transparent
 * accent for a reason that is not a defect, so both sides are parsed to channels instead.
 */
function channels(text: string | null): [number, number, number, number] | null {
  if (text === null) return null
  const numbers = [...text.matchAll(/[\d.]+/g)].map((m) => Number(m[0]))
  if (numbers.length < 3) return null
  const [r, g, b, a] = numbers as [number, number, number, number?]
  return [r, g, b, a === undefined ? 1 : a]
}

function sameColor(a: string | null, b: string | null): boolean {
  const left = channels(a)
  const right = channels(b)
  if (left === null || right === null) return false
  for (let i = 0; i < 3; i++) if (Math.round(left[i] as number) !== Math.round(right[i] as number)) return false
  // 0.549 vs 0.5490196…: the byte is the source of truth on our side and Chromium rounds to three places.
  return Math.abs((left[3] as number) - (right[3] as number)) < 0.005
}

/** Quoting and inter-item spacing differ between what we author and what Chromium reports back. */
function sameFontStack(a: string | null, b: string | null): boolean {
  const normalise = (s: string | null): string =>
    s === null ? "" : s.replace(/["']/g, "").replace(/\s*,\s*/g, ",").trim().toLowerCase()
  return normalise(a) === normalise(b) && normalise(a) !== ""
}

// ---------------------------------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------------------------------

if (!existsSync(MAIN)) {
  console.log(`  ${MAIN} is missing -- run \`bun run build\` first.`)
  process.exit(1)
}

log("=== Phase 4 face probe: five launches, one per face, DOM read back over CDP ===")
log(
  `  Coverage bound, stated rather than implied: ${String(CASES.length)} launches for ${String(FACES.length)} ` +
    `faces x 1 accent each, NOT ${String(FACES.length * 3)} for three accents. Every accent still travels ` +
    `settings file -> applyTheme -> computed fill; what is untested here is accent x face interaction, of\n` +
    `  which there is none -- only the LCD reads the accent, through its own tested skin function.`,
)
log(
  `  Also not covered: any comparison against a WPF pixel, and any font this host does not have.\n` +
    `  Per-second animation is measured on the LCD and Nixie faces only; the dial's hands move once a\n` +
    `  MINUTE, so they are checked by angle against dialPlan() instead of by scrub. See the header.\n`,
)

const expectedCounts = {
  phraseLine: 2,
  dialTick: hourTicks().length,
  dialDot: minuteDots().length,
  dialNumber: hourNumbers().length,
  nixieTube: NIXIE_GLYPH_IDS.length,
  nixieGlow: NIXIE_GLYPH_IDS.length * GLOW_LAYER_COLORS.length,
  nixieGhost: NIXIE_GLYPH_IDS.length * DIGIT_PATHS.length,
  nixieColonDot: 2,
}

for (const [index, probeCase] of CASES.entries()) {
  const port = BASE_PORT + index
  log(`--- ${probeCase.name}: ${JSON.stringify(probeCase.overrides)} on port ${String(port)} ---`)
  const r = await launch(probeCase, port)
  const accent = parseAccentColor(probeCase.overrides.accentColor ?? DEFAULTS.accentColor)
  const theme = resolveThemeColors(accent, null)
  const expectedFace = activeFace({ ...DEFAULTS, ...probeCase.overrides })

  // ─────────────────────────────────────────────────────────────────────────────
  // D1 — the app started and its DOM is reachable. The denominator for the rest.
  // ─────────────────────────────────────────────────────────────────────────────
  if (!r.ready || r.harvest === null) {
    for (const line of r.stdout.split("\n").filter((l) => l.trim() !== "")) log(`    ${line}`)
    if (r.stderr.trim() !== "") log(`    stderr: ${r.stderr.slice(0, 600)}`)
    record(
      `D1 ${probeCase.name} reachable`,
      "FAIL",
      r.ready
        ? `the app started but the DOM could not be read: ${r.error ?? "(no reason)"}`
        : `no PROBE-READY within ${String(READY_TIMEOUT_MS / 1000)}s -- see the output above`,
      true,
    )
    await cleanup(r.profileDir)
    continue
  }
  const h = r.harvest
  record(
    `D1 ${probeCase.name} reachable`,
    "PASS",
    `app up, DOM harvested over CDP: ${String(h.ids.length)} ids, ${String(h.samples.length)} samples`,
    true,
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // D2 — the id contract holds in the LIVE document, both directions.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const live = new Set(h.ids)
    const declared = new Set(CONTRACT_IDS)
    const missing = CONTRACT_IDS.filter((id) => !live.has(id))
    const extra = h.ids.filter((id) => !declared.has(id))
    const badUse = h.uses.filter((u) => !u.resolved)
    if (missing.length > 0 || extra.length > 0 || badUse.length > 0) {
      record(
        `D2 ${probeCase.name} id contract`,
        "FAIL",
        [
          missing.length > 0 ? `${String(missing.length)} declared ids absent from the DOM: ${missing.join(", ")}` : "",
          extra.length > 0 ? `${String(extra.length)} ids in the DOM declared nowhere: ${extra.join(", ")}` : "",
          badUse.length > 0
            ? `${String(badUse.length)} <use> elements resolve to nothing (${badUse
                .map((u) => String(u.href))
                .join(", ")}) -- an unresolvable <use> renders NOTHING with no console error`
            : "",
        ]
          .filter((s) => s !== "")
          .join("; "),
        true,
      )
    } else {
      record(
        `D2 ${probeCase.name} id contract`,
        "PASS",
        `all ${String(CONTRACT_IDS.length)} contract ids present with no strays, and all ` +
          `${String(h.uses.length)} <use> elements resolve to a real target`,
        true,
      )
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D3 — exactly one face is visible, and it is the one activeFace() names.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const visible = FACES.filter((face) => h.faces[face]?.display !== "none")
    const shown = h.faces[expectedFace]
    if (visible.length !== 1 || visible[0] !== expectedFace) {
      record(
        `D3 ${probeCase.name} active face`,
        "FAIL",
        `expected only ${expectedFace} visible; visible = [${visible.join(", ")}]. ` +
          FACES.map((f) => `${f}=${String(h.faces[f]?.display)}`).join(" "),
        true,
      )
    } else if (shown === null || shown === undefined || shown.children === 0) {
      record(
        `D3 ${probeCase.name} active face`,
        "FAIL",
        `${expectedFace} is the only visible container but it has no children -- a visible empty <g> is ` +
          `pixel-identical to a working overlay on a dark desktop`,
        true,
      )
    } else {
      record(
        `D3 ${probeCase.name} active face`,
        "PASS",
        `${expectedFace} alone is display="inline" with ${String(shown.children)} children; the other ` +
          `${String(FACES.length - 1)} are display="none"`,
        true,
      )
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D4 — every face BUILT its geometry, which is the all-five-rebuild decision measured.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const slots = probeCase.overrides.lcdShowSeconds ?? DEFAULTS.lcdShowSeconds
      ? LCD_SLOT_COUNTS.withSeconds
      : LCD_SLOT_COUNTS.withoutSeconds
    const want: Record<string, number> = {
      ...expectedCounts,
      lcdSlot: slots,
      lcdSeg: slots * SEGMENTS_PER_SLOT,
      lcdDot: slots * DOTS_PER_SLOT,
    }
    const bad = Object.entries(want).filter(([key, value]) => h.counts[key] !== value)
    if (bad.length > 0) {
      record(
        `D4 ${probeCase.name} all faces built`,
        "FAIL",
        `${String(bad.length)} element counts are wrong: ` +
          bad.map(([key, value]) => `${key}=${String(h.counts[key])} want ${String(value)}`).join(", "),
        true,
      )
    } else {
      record(
        `D4 ${probeCase.name} all faces built`,
        "PASS",
        `all five faces built their geometry while ${expectedFace} was the visible one ` +
          `(${Object.entries(want)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(" ")}), each count derived from its own generator rather than hardcoded`,
        true,
      )
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D5 — the accent reached every themed element's COMPUTED paint. The CSS-shadowing arm.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const bad: string[] = []
    for (const target of THEME_TARGETS) {
      const prop = paintPropertyFor(target.id)
      const expected = cssColor(target.role === "accent" ? theme.accent : theme.dim)
      const got = h.paints[`${target.id}:${prop}`] ?? null
      if (!sameColor(got, expected)) bad.push(`${target.id}.${prop} is ${String(got)}, want ${expected}`)
    }
    if (bad.length > 0) {
      record(
        `D5 ${probeCase.name} theme`,
        "FAIL",
        `${String(bad.length)} of ${String(THEME_TARGETS.length)} themed elements compute the wrong paint. ` +
          `A CSS declaration BEATS a presentation attribute, so index.css declaring one of these is ` +
          `indistinguishable from applyTheme never running: ${bad.slice(0, 6).join("; ")}`,
        true,
      )
    } else {
      record(
        `D5 ${probeCase.name} theme`,
        "PASS",
        `all ${String(THEME_TARGETS.length)} themed elements COMPUTE the accent ${probeCase.overrides.accentColor ?? ""} ` +
          `(${cssColor(theme.accent)}, dim ${cssColor(theme.dim)}) -- so nothing in index.css shadowed a ` +
          `presentation attribute`,
        true,
      )
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D6 — the font stack reached the DOM, written on #phrase and INHERITED by #date.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const style = probeCase.overrides.textStyle ?? DEFAULTS.textStyle
    const stack = fontStackFor(style)
    const written = sameFontStack(h.fonts["phrase"] ?? null, stack)
    // `#date` takes no font-family of its own -- it inherits #root's. On a Literary or Mono case that
    // makes the two DIFFER legitimately, and asserting equality would be asserting a bug.
    const inherited = sameFontStack(h.fonts["date"] ?? null, h.fonts["root"] ?? null)
    if (!written || !inherited) {
      record(
        `D6 ${probeCase.name} font stack`,
        "FAIL",
        `#phrase computes ${JSON.stringify(h.fonts["phrase"])} (want fontStackFor("${style}") = ` +
          `${JSON.stringify(stack)}); #date computes ${JSON.stringify(h.fonts["date"])} and #root ` +
          `${JSON.stringify(h.fonts["root"])}, which must match because #date inherits`,
        true,
      )
    } else {
      record(
        `D6 ${probeCase.name} font stack`,
        "PASS",
        `#phrase computes fontStackFor("${style}") even though ${expectedFace} is the visible face -- ` +
          `the all-five-rebuild path measured; #date inherits #root's stack as authored`,
        true,
      )
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D7 — the OS window followed the content the renderer measured.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const rootW = Number(h.root?.["width"] ?? NaN)
    const rootH = Number(h.root?.["height"] ?? NaN)
    const sizes = [...r.stdout.matchAll(/^PROBE-SIZE (\d+) (\d+)$/gm)].map((m) => [Number(m[1]), Number(m[2])])
    const last = sizes[sizes.length - 1]
    const viewBox = `0 0 ${String(rootW)} ${String(rootH)}`
    // CSS pixels ARE DIPs at zoom factor 1, which is the unit setContentSize takes, so these compare
    // directly -- converting by devicePixelRatio here would double-scale on a HiDPI display.
    const innerOk = Math.abs(h.inner.width - rootW) <= 1 && Math.abs(h.inner.height - rootH) <= 1
    const boxOk = h.root?.["viewBox"] === viewBox
    const sizeOk = last === undefined || (last[0] === rootW && last[1] === rootH)
    if (!Number.isFinite(rootW) || !innerOk || !boxOk || !sizeOk) {
      record(
        `D7 ${probeCase.name} window follows content`,
        "FAIL",
        `#root ${String(rootW)}x${String(rootH)} viewBox ${JSON.stringify(h.root?.["viewBox"])} (want ` +
          `${JSON.stringify(viewBox)}); window inner ${String(h.inner.width)}x${String(h.inner.height)} at ` +
          `dpr ${String(h.inner.dpr)}; last PROBE-SIZE ${last === undefined ? "(none)" : last.join("x")}`,
        true,
      )
    } else {
      record(
        `D7 ${probeCase.name} window follows content`,
        "PASS",
        `#root ${String(rootW)}x${String(rootH)}, viewBox matches, window inner ` +
          `${String(h.inner.width)}x${String(h.inner.height)} at dpr ${String(h.inner.dpr)}` +
          (last === undefined
            ? ` -- NOTE: no PROBE-SIZE line, so the measured content happened to equal the creation size ` +
              `and main never resized. The renderer->main->OS round trip is UNEXERCISED on this case`
            : `, and main's own PROBE-SIZE agrees (${last.join("x")}) across ${String(sizes.length)} resizes`),
        true,
      )
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D8 — the dial's hands, by angle. Only meaningful on the dial case.
  // ─────────────────────────────────────────────────────────────────────────────
  if (probeCase.face === "dial") {
    const now = r.harvestedAt
    const before = new Date(now.getTime() - 60_000)
    const wantNow = dialPlan(now)
    const wantBefore = dialPlan(before)
    const hour = h.hands["hour"]
    const minute = h.hands["minute"]
    const okNow =
      hour?.["transform"] === handTransform(wantNow.hourAngle) &&
      minute?.["transform"] === handTransform(wantNow.minuteAngle)
    // A minute boundary between the renderer's last tick and this harvest is not a defect. Accepting the
    // previous minute as well is the difference between a probe and a flaky probe.
    const okBefore =
      hour?.["transform"] === handTransform(wantBefore.hourAngle) &&
      minute?.["transform"] === handTransform(wantBefore.minuteAngle)
    const endpoints =
      Number(hour?.["x1"]) === DIAL_CENTER_X &&
      Number(hour?.["y1"]) === DIAL_CENTER_Y &&
      Number(hour?.["x2"]) === DIAL_CENTER_X &&
      Number(hour?.["y2"]) === DIAL_CENTER_Y - HOUR_HAND_LENGTH &&
      Number(minute?.["x1"]) === DIAL_CENTER_X &&
      Number(minute?.["y1"]) === DIAL_CENTER_Y &&
      Number(minute?.["x2"]) === DIAL_CENTER_X &&
      Number(minute?.["y2"]) === DIAL_CENTER_Y - MINUTE_HAND_LENGTH
    const noInline = hour?.inline === "" && minute?.inline === ""
    if ((!okNow && !okBefore) || !endpoints || !noInline) {
      record(
        "D8 dial hands rotate",
        "FAIL",
        `hour ${JSON.stringify(hour?.["transform"])} minute ${JSON.stringify(minute?.["transform"])}; want ` +
          `${handTransform(wantNow.hourAngle)} / ${handTransform(wantNow.minuteAngle)} (or the previous ` +
          `minute's ${handTransform(wantBefore.hourAngle)} / ${handTransform(wantBefore.minuteAngle)}). ` +
          `Endpoints unchanged: ${String(endpoints)}. Inline style.transform empty: ${String(noInline)} ` +
          `(hour ${JSON.stringify(hour?.inline)})`,
        true,
      )
    } else {
      record(
        "D8 dial hands rotate",
        "PASS",
        `both hands carry the rotate() the plan computed for ${okNow ? "this" : "the previous"} minute ` +
          `(${String(hour?.["transform"])}, ${String(minute?.["transform"])}); endpoints still ` +
          `(${String(DIAL_CENTER_X)},${String(DIAL_CENTER_Y)})->y2 ${String(DIAL_CENTER_Y - HOUR_HAND_LENGTH)}/` +
          `${String(DIAL_CENTER_Y - MINUTE_HAND_LENGTH)}, and element.style.transform is empty -- the ` +
          `transform ATTRIBUTE is doing the work, which is what the CSP allows`,
        true,
      )
    }
    const decorations = Object.entries(h.decorations).filter(([, value]) => value !== "inline")
    record(
      "D8b dial decorations",
      decorations.length === 0 ? "PASS" : "FAIL",
      decorations.length === 0
        ? `ticks, dots and numbers are all display="inline" with the three show* flags set (they DEFAULT ` +
          `FALSE, so a probe that left them alone would read an empty dial as correct)`
        : `${String(decorations.length)} decoration groups are not visible with their flag set: ` +
          decorations.map(([k, v]) => `${k}=${String(v)}`).join(", "),
      true,
    )
  } else {
    // The other side of the same control: with the flags at their false defaults the groups must be hidden.
    const shown = Object.entries(h.decorations).filter(([, value]) => value !== "none")
    record(
      `D8b ${probeCase.name} decorations hidden`,
      shown.length === 0 ? "PASS" : "FAIL",
      shown.length === 0
        ? `ticks, dots and numbers are display="none" with the three show* flags at their false defaults ` +
          `-- the negative control for the dial case's positive one`
        : `${String(shown.length)} decoration groups are visible with their flag false: ` +
          shown.map(([k, v]) => `${k}=${String(v)}`).join(", "),
      true,
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D9 — animation, and its negative half: the memo means three faces must NOT change.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const distinct = new Set(h.samples.map((s) => s.faceHash)).size
    const span = (h.samples[h.samples.length - 1]?.t ?? 0) - (h.samples[0]?.t ?? 0)
    const animated = probeCase.face === "lcd" || probeCase.face === "nixie"
    const channel =
      probeCase.face === "nixie"
        ? `glow opacity, ${String(new Set(h.samples.map((s) => s.glow)).size)} distinct`
        : probeCase.face === "lcd"
          ? `colon dot fills, ${String(new Set(h.samples.map((s) => s.lcdDots)).size)} distinct`
          : `hand transform, ${String(new Set(h.samples.map((s) => s.hourHand)).size)} distinct`
    if (animated && distinct < 2) {
      record(
        `D9 ${probeCase.name} animation`,
        "FAIL",
        `the ${probeCase.face} face produced ONE DOM state across ${String(span)}ms of sampling ` +
          `(${String(h.samples.length)} samples; ${channel}). This face is supposed to repaint ` +
          `${probeCase.face === "nixie" ? "every 40ms" : "every second"}`,
        true,
      )
    } else if (animated) {
      record(
        `D9 ${probeCase.name} animation`,
        "PASS",
        `${String(distinct)} distinct DOM states across ${String(span)}ms (${channel}) -- the face is ` +
          `genuinely animating, not merely present`,
        true,
      )
    } else if (distinct !== 1) {
      record(
        `D9 ${probeCase.name} memo holds`,
        "FAIL",
        `the ${probeCase.face} face changed ${String(distinct - 1)} time(s) across ${String(span)}ms. It ` +
          `updates ${probeCase.face === "dial" ? "once a minute" : "on a phrase segment change"}, so this is ` +
          `svg.ts's write-only-what-changed memo failing -- which costs ISC-6's paint budget silently. ` +
          `Legitimately non-zero if the sampling crossed that boundary: ${channel}`,
        true,
      )
    } else {
      record(
        `D9 ${probeCase.name} memo holds`,
        "PASS",
        `exactly one DOM state across ${String(span)}ms and ${String(h.samples.length)} samples -- the ` +
          `${probeCase.face} face rewrote nothing while ticking at 1 Hz (${channel})`,
        true,
      )
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D11 — the visible face has WORDS in it, and the hidden ones do not.
  //
  // D3 cannot cover this: `#phrase` is a child of `#phraseFace` whether or not it holds any text, so a
  // phrase engine that returned "" would pass every arm above it. The negative half is the same claim
  // from the other side -- `renderer.ts` ticks ONLY the active face, so on a dial/lcd/nixie case the two
  // text faces must still be empty. That is what makes the positive half discriminating rather than a
  // restatement of "the DOM exists".
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const filled = (id: string): boolean => (h.texts[id] ?? "").trim() !== ""
    const dateOk = filled("date")
    const textFaceActive = expectedFace === "phrase" || expectedFace === "split"
    const want = expectedFace === "phrase" ? ["phrase"] : expectedFace === "split" ? ["qualifier", "emphasis"] : []
    const missing = want.filter((id) => !filled(id))
    // On a non-text face, `#phrase`/`#qualifier`/`#emphasis` are the ones that must be blank.
    const leaked = textFaceActive ? [] : ["phrase", "qualifier", "emphasis"].filter((id) => filled(id))
    if (missing.length > 0 || leaked.length > 0 || !dateOk) {
      record(
        `D11 ${probeCase.name} text content`,
        "FAIL",
        [
          missing.length > 0
            ? `the visible ${expectedFace} face has empty text in ${missing.join(", ")} -- a visible face ` +
              `with no words passes every geometry arm above`
            : "",
          leaked.length > 0
            ? `${leaked.join(", ")} carry text while ${expectedFace} is active, so a hidden face ticked`
            : "",
          dateOk ? "" : `#date is empty with showDate true`,
        ]
          .filter((s) => s !== "")
          .join("; "),
        true,
      )
    } else {
      record(
        `D11 ${probeCase.name} text content`,
        "PASS",
        textFaceActive
          ? `${want.map((id) => `${id}=${JSON.stringify(h.texts[id])}`).join(" ")}, date=` +
            `${JSON.stringify(h.texts["date"])} -- real words, from the phrase engine through the live DOM`
          : `date=${JSON.stringify(h.texts["date"])}, and #phrase/#qualifier/#emphasis are all empty as ` +
            `they must be -- only the active face ticks, so the three built-but-hidden text elements were ` +
            `never written`,
        true,
      )
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D10 — recorded, not asserted: the baseline residual and the stats panel's state.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const box = h.date.bbox
    record(
      `D10 ${probeCase.name} text box`,
      "INCONCLUSIVE",
      `#date y=${String(h.date.y)} bbox=${
        box === null ? "(unavailable)" : `${box.x.toFixed(2)},${box.y.toFixed(2)} ${box.width.toFixed(2)}x${box.height.toFixed(2)}`
      } textLength=${h.date.length.toFixed(2)} text=${JSON.stringify(h.texts["date"])}. Recorded, not ` +
        `asserted: the offset between SVG dominant-baseline="text-before-edge" and WPF's ` +
        `FontFamily.Baseline is the phase's unmeasured residual and there is no WPF number on this host ` +
        `to compare it to`,
    )
    record(
      `D10b ${probeCase.name} stats panel`,
      "INCONCLUSIVE",
      `stats display=${String(h.statsDisplay)}, bars w=[${Object.entries(h.bars)
        .map(([k, v]) => `${k}:${String(v)}`)
        .join(" ")}], cpu=${JSON.stringify(h.texts["cpuText"])} batt=${JSON.stringify(
        h.texts["battText"],
      )} uptime=${JSON.stringify(h.texts["uptime"])}. Diagnostic by design: Phase 6 owns the sources, so ` +
        `on this platform the rows carry whatever the shipped sampler produces -- a panel of "--" is the ` +
        `correct Phase 4 state, not a failure`,
    )
    log(
      `    face texts: phrase=${JSON.stringify(h.texts["phrase"])} qualifier=${JSON.stringify(
        h.texts["qualifier"],
      )} emphasis=${JSON.stringify(h.texts["emphasis"])}`,
    )
  }

  await cleanup(r.profileDir)
  log("")
}

log("=== summary ===")
for (const x of results) {
  log(`${x.verdict.padEnd(13)} ${x.blocking ? "[blocking] " : "[diagnostic]"} ${x.name}`)
}
const passed = results.filter((x) => x.verdict === "PASS").length
const failed = results.filter((x) => x.verdict === "FAIL").length
const inconclusive = results.filter((x) => x.verdict === "INCONCLUSIVE").length
const blockingBad = results.filter((x) => x.blocking && x.verdict !== "PASS")
log(
  `\n${String(passed)} passed / ${String(failed)} failed / ${String(inconclusive)} inconclusive` +
    ` -- ${String(blockingBad.length)} blocking`,
)
log(
  "\nBound: this host, this desk, at this display scale, with the fonts this machine has. NOT proven:\n" +
    "any comparison against a WPF-rendered pixel; the text-before-edge / FontFamily.Baseline offset\n" +
    "(D10 records it, nothing checks it); accent x face interaction (see the header's five-launch note);\n" +
    "and the macOS and Linux appearance of any of it -- ISC-10's carried debt, no host.",
)
process.exit(blockingBad.length > 0 ? 1 : 0)
