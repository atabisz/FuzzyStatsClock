/**
 * Electron-side half of the Phase 6.5 settings-window probe.
 *
 * ## What is real here and what is a stand-in
 *
 * REAL: `SettingsWindowHost` itself — bundled from `src/main/settings-window.ts` by the driver and
 * `require`d here, so the create-or-focus logic, the window options, the sender check and the `closed`
 * wiring under test are the shipped ones. REAL: `dist/settings.html`, `dist/settings.css`,
 * `dist/settings.js` and `dist/preload-settings.cjs`, loaded by that module exactly as the app loads them,
 * under the shipped CSP. REAL: the form, built by the driver from `buildSettingsForm(DEFAULTS, "en")` and
 * handed over as JSON, so the shape on the wire is the shipped one rather than a hand-rolled subset.
 *
 * STAND-IN: the overlay, which is a bare `about:blank` window here. It exists for two arms that need a
 * second window — the owner relationship, and the claim that closing the settings window does not take the
 * app down with it — and for nothing else.
 *
 * STAND-IN: the three `ipcMain.on` relays. In the app they live in `main.ts` and are three lines each; here
 * they are the same three lines with a recorder in front. What that costs is stated rather than hidden: this
 * probe cannot catch a channel name typo'd in `main.ts`, because it never reads `main.ts`. What it does catch
 * is the pair those relays connect — the preload's channel names against the host module's methods — which
 * is where the name collision `preload-settings.ts` documents would have landed.
 *
 * NOT PROVEN, and deliberately so: `onSettingsEdit`'s persistence, rounding and rejection behaviour. That is
 * `applySettingsEdit`, 1536 combinations of it are in `test/settings-form.test.ts`, and re-asserting it
 * through a window would be a slower copy of a green test. This probe's question is the one no test can
 * reach: does a real Chromium, under the real policy, build the real form and get an edit back out.
 *
 * ## Output
 *
 * One `PROBE_RESULT <json>` line on stdout at the end, and nothing else that matters. The driver owns the
 * arm table — this half only reports what it observed, so a wrong expectation is a one-line fix in a file
 * that never launches Electron.
 */

const { app, BrowserWindow, ipcMain } = require("electron")
const { readFileSync } = require("node:fs")

const [, , HOST_MODULE, DIST_DIR, FORM_PATH] = process.argv

const { SettingsWindowHost } = require(HOST_MODULE)

/** Everything the driver grades. Written throughout, serialised once. */
const observed = {
  logs: [],
  /** Every `onVisibilityChange` edge, in order. The whole point of the pin is the sequence. */
  visibility: [],
  /** Every `settings-edit` payload that reached main. */
  edits: [],
  /** How many `settings-close` messages arrived. */
  closes: 0,
  /** Renderer console output at warning level or above, including CSP refusals. */
  consoleErrors: [],
  /** `#panels`' child count at the instant each `settings-ready` arrived. See arm R0. */
  readyPanelCounts: [],
  /** Did `window-all-closed` fire? In the app that calls `app.quit()`. */
  windowAllClosed: false,
  /** Filled per arm below. */
  arms: {},
  failure: null,
}

const form = JSON.parse(readFileSync(FORM_PATH, "utf8"))
/** Mutated for the refresh arms, so the second push differs from the first. */
let currentForm = form

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Poll until `probe()` returns truthy, or give up. Chromium's first paint is not on a promise we hold. */
async function until(label, probe, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await wait(25)
  }
}

/** The settings window, found by elimination — the host module does not expose its `BrowserWindow`. */
function settingsWindow(standIn) {
  return BrowserWindow.getAllWindows().find((win) => win !== standIn) ?? null
}

function main() {
  const standIn = new BrowserWindow({
    width: 232,
    height: 260,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: true,
  })
  void standIn.loadURL("about:blank")

  const host = new SettingsWindowHost({
    dir: DIST_DIR,
    log: (level, message) => observed.logs.push(`${level}: ${message}`),
    buildForm: () => currentForm,
    onVisibilityChange: (open) => observed.visibility.push(open),
    parent: () => standIn,
  })

  // `main.ts`'s three relays, verbatim in behaviour, with a recorder in front. See the header.
  ipcMain.on("settings-ready", async (event) => {
    // BEFORE `markReady`, because the claim is that the form arrives in REPLY to the handshake: if anything
    // reached the renderer earlier this count would already be non-zero. Awaiting here delays the handshake
    // by one round trip, which no arm is timing.
    try {
      observed.readyPanelCounts.push(
        await event.sender.executeJavaScript("document.getElementById('panels').children.length"),
      )
    } catch {
      observed.readyPanelCounts.push(-1)
    }
    host.markReady(event.sender)
  })
  ipcMain.on("settings-edit", (_event, payload) => {
    observed.edits.push(payload)
  })
  ipcMain.on("settings-close", () => {
    observed.closes += 1
    host.close()
  })

  // In the app this calls `app.quit()`. Recorded rather than obeyed, so the arm can read it.
  app.on("window-all-closed", () => {
    observed.windowAllClosed = true
  })

  void run(host, standIn)
}

async function run(host, standIn) {
  try {
    await arms(host, standIn)
  } catch (error) {
    observed.failure = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
  }
  process.stdout.write(`PROBE_RESULT ${JSON.stringify(observed)}\n`)
  // `exit` rather than `quit`: `quit` runs the close handlers, and one of the arms above has already
  // recorded what those do.
  app.exit(0)
}

async function arms(host, standIn) {
  const a = observed.arms

  // ---- Open, and the handshake --------------------------------------------------------------------
  host.open()
  a.openIsOpen = host.isOpen
  a.windowCountAfterOpen = BrowserWindow.getAllWindows().length

  const win = settingsWindow(standIn)
  if (win === null) throw new Error("no settings window was created")
  // The ID now, not the `webContents` reference later: reading `win.webContents` after the window has been
  // closed throws `Object has been destroyed`, and the reopen arm needs to compare against this one. The
  // first run of this probe failed exactly there and took the four arms after it down with it.
  const firstWebContentsId = win.webContents.id

  win.webContents.on("console-message", (...args) => {
    // Electron 33 passes `(event, level: number, message, line, sourceId)`; newer builds pass an object.
    // Both are handled because a probe that silently stopped collecting CSP refusals would go green on a
    // window that never built a control.
    const [second] = args.slice(1)
    if (second !== null && typeof second === "object" && "level" in second) {
      if (second.level === "warning" || second.level === "error") {
        observed.consoleErrors.push(`${second.level}: ${String(second.message)}`)
      }
      return
    }
    const [level, message] = args.slice(1)
    if (typeof level === "number" && level >= 2) {
      observed.consoleErrors.push(`${String(level)}: ${String(message)}`)
    }
  })

  await until("the form to build", async () =>
    (await win.webContents.executeJavaScript("document.getElementById('panels').children.length")) > 0,
  )

  // ---- The renderer's structure -------------------------------------------------------------------
  a.dom = await win.webContents.executeJavaScript(`(() => {
    const q = (sel) => [...document.querySelectorAll(sel)]
    const panels = q('#panels .panel')
    return {
      tabLabels: q('#tabstrip button.tab').map((b) => b.textContent),
      panelCount: panels.length,
      visiblePanels: panels.filter((p) => !p.hidden).length,
      selectedTab: q('#tabstrip button.tab').findIndex((b) => b.getAttribute('aria-selected') === 'true'),
      ctlIds: q('[id^="ctl-"]').map((n) => n.id.slice(4)),
      swatches: q('#panels button.swatch-ring').length,
      customColors: q('#panels input.custom-color').length,
      segmentGroups: q('#panels .segments').length,
      radios: q('#panels label.radio input[type=radio]').length,
      rows: q('#panels .row').length,
      hiddenRows: q('#panels .row').filter((r) => r.hidden).length,
      inlineStyleAttrs: q('#panels [style]').length,
    }
  })()`)

  // ---- A tab click actually switches the panel ----------------------------------------------------
  a.tabSwitch = await win.webContents.executeJavaScript(`(() => {
    const tabs = [...document.querySelectorAll('#tabstrip button.tab')]
    tabs[2].click()
    const panels = [...document.querySelectorAll('#panels .panel')]
    return {
      visibleIndex: panels.findIndex((p) => !p.hidden),
      visibleCount: panels.filter((p) => !p.hidden).length,
      selected: tabs.findIndex((b) => b.getAttribute('aria-selected') === 'true'),
    }
  })()`)

  // ---- An edit leaves the renderer ----------------------------------------------------------------
  // A checkbox and a slider, because they are the two kinds whose event is not `click`: the checkbox rides
  // `change` and the slider rides `input`, and a builder wired to the wrong one is silent rather than broken.
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('ctl-statsVisible').click()
    const slider = document.getElementById('ctl-opacity')
    slider.value = '0.5'
    slider.dispatchEvent(new Event('input'))
    return null
  })()`)
  await until("both edits to arrive", () => observed.edits.length >= 2)
  a.sliderReadoutAfterLocalUpdate = await win.webContents.executeJavaScript(
    "document.getElementById('ctl-opacity').parentElement.querySelector('.slider-value').textContent",
  )

  // ---- A second push refreshes in place rather than rebuilding ------------------------------------
  // Decision 1 in `settings.ts`'s header, and the arm is element IDENTITY: a tag written from here survives a
  // refresh and cannot survive a rebuild. Paired with a row that goes invisible, so the same push proves the
  // collapse path too.
  await win.webContents.executeJavaScript(
    "document.getElementById('ctl-opacity').dataset.probeTag = 'kept'",
  )
  const beforeHiddenRows = a.dom.hiddenRows
  currentForm = refreshedForm(form)
  host.push()
  await until("the refreshed form", async () =>
    (await win.webContents.executeJavaScript(
      "document.getElementById('ctl-opacity').value",
    )) === "0.42",
  )
  a.refresh = await win.webContents.executeJavaScript(`(() => {
    const slider = document.getElementById('ctl-opacity')
    return {
      tagSurvived: slider.dataset.probeTag === 'kept',
      value: slider.value,
      readout: slider.parentElement.querySelector('.slider-value').textContent,
      hiddenRows: [...document.querySelectorAll('#panels .row')].filter((r) => r.hidden).length,
      activeTabStillSelected:
        [...document.querySelectorAll('#tabstrip button.tab')]
          .findIndex((b) => b.getAttribute('aria-selected') === 'true'),
    }
  })()`)
  a.refresh.hiddenRowsBefore = beforeHiddenRows

  // ---- Create-or-focus ----------------------------------------------------------------------------
  host.open()
  a.secondOpen = {
    windowCount: BrowserWindow.getAllWindows().length,
    visibilityEdges: observed.visibility.length,
    sameWindow: settingsWindow(standIn) === win,
  }

  // ---- The sender check ---------------------------------------------------------------------------
  const logsBefore = observed.logs.length
  host.markReady(standIn.webContents)
  a.foreignReady = {
    warned: observed.logs.slice(logsBefore).some((line) => line.startsWith("warn: ")),
    stillOpen: host.isOpen,
  }

  // ---- Traits, read back off the live window ------------------------------------------------------
  // `getSize()` and not `getContentSize()`: the constructor's `width`/`height` are the OUTER size, and on a
  // framed window the content is smaller by the border and title bar. Grading the content size would be
  // grading this host's chrome. Both are recorded so the difference is visible in the output.
  const [outerWidth, outerHeight] = win.getSize()
  const [contentWidth, contentHeight] = win.getContentSize()
  a.traits = {
    outerWidth,
    outerHeight,
    resizable: win.isResizable(),
    maximizable: win.isMaximizable(),
    fullScreenable: win.isFullScreenable(),
    visible: win.isVisible(),
    alwaysOnTop: win.isAlwaysOnTop(),
    title: win.getTitle(),
    contentWidth,
    contentHeight,
    parentIsStandIn: win.getParentWindow() === standIn,
    hasParent: win.getParentWindow() !== null,
  }

  // ---- The Close button closes it, and takes nothing else down ------------------------------------
  const closedOnce = new Promise((resolve) => win.once("closed", resolve))
  await win.webContents.executeJavaScript("document.getElementById('close').click()")
  await closedOnce
  await wait(50)
  a.afterClose = {
    closeMessages: observed.closes,
    isOpen: host.isOpen,
    visibility: [...observed.visibility],
    standInAlive: !standIn.isDestroyed(),
    windowCount: BrowserWindow.getAllWindows().length,
    windowAllClosed: observed.windowAllClosed,
  }

  // ---- Reopen: a new renderer, and the ready flag reset for it ------------------------------------
  host.open()
  const reopened = settingsWindow(standIn)
  if (reopened === null) throw new Error("reopen created no window")
  await until("the form to build a second time", async () =>
    (await reopened.webContents.executeJavaScript("document.getElementById('panels').children.length")) > 0,
  )
  a.reopen = {
    isNewWebContents: reopened.webContents.id !== firstWebContentsId,
    readyHandshakes: observed.readyPanelCounts.length,
    // The refreshed form is what `buildForm` returns now, so the second window opens showing it — which is
    // also the arm that a reopen pushes CURRENT state rather than the state it last had.
    opacity: await reopened.webContents.executeJavaScript("document.getElementById('ctl-opacity').value"),
  }

  // ---- Escape closes it too ----------------------------------------------------------------------
  const closedTwice = new Promise((resolve) => reopened.once("closed", resolve))
  await reopened.webContents.executeJavaScript(
    "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), null",
  )
  await closedTwice
  a.escape = { closeMessages: observed.closes, isOpen: host.isOpen }

  // ---- destroy() on a live window ---------------------------------------------------------------
  host.open()
  const third = settingsWindow(standIn)
  host.destroy()
  a.destroy = {
    isOpen: host.isOpen,
    destroyed: third === null ? false : third.isDestroyed(),
    windowCount: BrowserWindow.getAllWindows().length,
  }

  a.visibility = [...observed.visibility]
}

/**
 * The form the second push carries: one slider moved and one row hidden.
 *
 * Hand-built rather than a second `buildSettingsForm` call, because the point is a form that DIFFERS from
 * the first in exactly two known ways — a real settings change would move several controls at once and the
 * identity arm could then not say which change the refresh honoured.
 */
function refreshedForm(base) {
  let hidWithinFirst = false
  return {
    tabs: base.tabs.map((tab) => ({
      ...tab,
      rows: tab.rows.map((row) => {
        const controls = row.controls.map((control) =>
          control.id === "opacity" ? { ...control, value: 0.42, valueLabel: "42%" } : control,
        )
        // The first visible row that carries no control we are asserting on, so the collapse is unambiguous.
        if (!hidWithinFirst && row.visible && !controls.some((c) => c.id === "opacity")) {
          hidWithinFirst = true
          return { ...row, visible: false, controls }
        }
        return { ...row, controls }
      }),
    })),
  }
}

app.whenReady().then(main, (error) => {
  process.stdout.write(`PROBE_RESULT ${JSON.stringify({ failure: String(error) })}\n`)
  app.exit(1)
})
