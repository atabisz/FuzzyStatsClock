/**
 * The instrument for `probe-fade.ts`, riding alongside the REAL preload bridge.
 *
 * ## Why an extra preload rather than CDP injection
 *
 * `probe-display.ts` records the constraint that shapes this file: **CDP cannot reach `ipcRenderer`,**
 * because the bridge lives in an isolated world the protocol's default execution context does not
 * include. So a probe that has to *push* a ghost target -- which is the only way to make the fade run
 * without moving Alex's real cursor -- cannot drive the shipped app over CDP at all. It needs a main
 * process of its own, and once it has one, the cheapest place to put the measurement is a preload: same
 * isolated world, same DOM, same `performance` time origin as the page, and not subject to the page's
 * CSP the way an injected script would be.
 *
 * ## The bridge is REQUIRED, not reimplemented
 *
 * Line one of the body loads `dist/preload.cjs` -- the shipped bundle, byte for byte, the same file the
 * real app loads. A hand-written stand-in would be a second copy of the IPC surface, free to drift from
 * the real one in exactly the direction that makes a probe pass; and the whole point of this run is that
 * the renderer under measurement is the shipped renderer, talking over the shipped channels.
 *
 * ## Two recordings, and neither is a substitute for the other
 *
 * **`frames`** is this file's own `requestAnimationFrame` loop. rAF *is* the fade pump's clock -- see
 * `core/ghost-fade.ts` on why the interpolation lives renderer-side -- so its delivery cadence under load
 * is the thing PERF-01 is actually a claim about. Measuring it directly gives a gap distribution with no
 * fade state mixed into it: a converged pump legitimately writes nothing, and a stalled one also writes
 * nothing, so a write-interval histogram alone cannot tell those two apart.
 *
 * **`writes`** is a `MutationObserver` on `#root`'s `opacity` attribute -- the shipped pump's actual
 * output, through `svg.ts`'s memo and `toFixed(4)`. It is what stops the frame recording above from being
 * a measurement of an idle renderer: frames arriving while nothing writes them would prove only that this
 * file's own loop is cheap. The two together say the pump was live AND its clock was steady.
 *
 * Both are timestamped renderer-side, which is the property that makes the whole probe valid: the drain
 * request travels through a main process that is being deliberately saturated, so anything timestamped on
 * arrival would measure main's stall and attribute it to the renderer.
 *
 * The rAF loop runs for the window's whole life rather than being started and stopped per phase. Starting
 * it is what would perturb the measurement -- the first frame after attaching a fresh loop carries the
 * attach cost -- and an unconditional `if (!recording) return` is cheaper than either.
 */

const { ipcRenderer } = require("electron")
const { join } = require("node:path")

// The shipped bridge. Everything the renderer calls on `window.fuzzyclock` comes from here.
require(join(__dirname, "..", "dist", "preload.cjs"))

/** rAF callback timestamps, in `performance.now()` milliseconds. */
let frames = []
/** `{ t, v }` per observed `opacity` attribute write on `#root`. */
let writes = []
let recording = false

function pump() {
  requestAnimationFrame((now) => {
    if (recording) frames.push(now)
    pump()
  })
}
pump()

/**
 * The observer, attached once `#root` exists.
 *
 * `attributeFilter` rather than a whole-subtree watch: the renderer rewrites text, transforms and bar
 * widths every second, and observing all of that would put the 1 Hz repaint's mutations into a recording
 * whose subject is a 60 Hz fade.
 *
 * `performance.now()` inside the callback is the callback's time, not each mutation's. That is exact
 * enough here for a reason specific to this subject: the pump writes `opacity` at most once per frame, so
 * a batch is one record, and the microtask runs immediately after the `rAF` callback that produced it.
 */
function attachObserver() {
  const root = document.getElementById("root")
  if (root === null) {
    ipcRenderer.send("probe-error", "no #root in the document -- index.html did not load")
    return
  }
  new MutationObserver((records) => {
    if (!recording) return
    const t = performance.now()
    for (const record of records) {
      if (record.attributeName === "opacity") writes.push({ t, v: root.getAttribute("opacity") })
    }
  }).observe(root, { attributes: true, attributeFilter: ["opacity"] })
  ipcRenderer.send("probe-observer-ready")
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", attachObserver)
} else {
  attachObserver()
}

ipcRenderer.on("probe-record-start", () => {
  frames = []
  writes = []
  recording = true
})

ipcRenderer.on("probe-record-stop", () => {
  recording = false
  // The current `opacity` is sent with the recording so the driver can check the pump landed somewhere
  // plausible rather than only that it moved.
  const root = document.getElementById("root")
  ipcRenderer.send("probe-record", {
    frames,
    writes,
    finalOpacity: root === null ? null : root.getAttribute("opacity"),
  })
})
