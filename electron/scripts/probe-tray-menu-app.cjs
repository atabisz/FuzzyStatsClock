/**
 * Electron-side half of the tray-menu probe (ISC-17).
 *
 * ## What is real here
 *
 * REAL: `AppTray` and `toMenuTemplate`, bundled from `src/main/tray.ts` by the driver and `require`d here,
 * so the class under test is the shipped one. REAL: `Menu.buildFromTemplate`, `nativeImage.createFromPath`
 * and `new Tray()` — this runs inside Electron's main process, which is the only place those exist. REAL:
 * `dist/icon.png`, the file the app itself passes as `iconPath` (`main.ts:965`).
 *
 * There is no stand-in for the module under test. The two liberties taken are named below.
 *
 * ## Liberty 1: private members are read directly
 *
 * `buildMenu()`, `tray`, `state` and `pinTimer` are `private` in the TypeScript. TypeScript's `private` is a
 * compile-time rule with no runtime existence, and this file is `.cjs` with no typechecker over it, so they
 * are ordinary properties here. That is what lets the probe grade the shipped class rather than a copy: it
 * asks `AppTray` for the very `Menu` it would hand to `popUpContextMenu`, including the dispatch wrapper and
 * the two pin listeners, without opening a native menu on the user's desktop.
 *
 * ## Liberty 2: `Menu.buildFromTemplate` is observed
 *
 * Patched to count calls and keep each template, then delegating to the original and returning its real
 * `Menu` untouched. An observer, not a substitute — nothing the module receives is synthetic. It is here for
 * one claim that is otherwise invisible: on win32/darwin the constructor must build NO menu (the menu is
 * built per open), and on Linux it must build exactly one (there is no open event to hook).
 *
 * ## What this half cannot answer, and does not pretend to
 *
 * Whether Electron emits `menu-will-show` / `menu-will-close` on the `tray.popUpContextMenu` path. That is
 * the open question `src/main/tray.ts`'s own header states, and it needs a real menu opened at a real cursor
 * and a real dismissal, so it stays manual. What is graded instead is everything downstream of the event:
 * the listeners are attached to the real `Menu`, both transitions fire, each names its route, the watchdog is
 * armed and cleared, and the third close route — an item being clicked — needs no Electron event at all and
 * is driven end to end.
 *
 * Nothing here reads or writes settings, the registry, or a launch agent: `AppTray` takes a state object and
 * an action callback, and the callback is a recorder.
 *
 * ## Output
 *
 * One `PROBE_RESULT <json>` line on stdout. The driver owns the arm table, so a wrong expectation is a
 * one-line fix in a file that never launches Electron.
 */

const { app, Menu, nativeImage } = require("electron")
const { readFileSync } = require("node:fs")

const [, , HOST_MODULE, PLAN_PATH] = process.argv

const { AppTray, toMenuTemplate, MENU_PIN_WATCHDOG_MS } = require(HOST_MODULE)
const plan = JSON.parse(readFileSync(PLAN_PATH, "utf8"))

/** Everything the driver grades. Written throughout, serialised once. */
const observed = {
  /** Every log line `AppTray` emitted, in order, `level: message`. */
  logs: [],
  /** Every action a real `MenuItem.click()` dispatched, in order. Sliced by mark, never read whole. */
  actions: [],
  /** Every `onMenuOpenChange` edge, in order. The pin's whole point is the sequence. */
  pinEdges: [],
  /** Filled per arm below. */
  arms: {},
  failure: null,
}

function log(level, message) {
  observed.logs.push(`${level}: ${message}`)
}

// ---- Liberty 2: observe every Menu Electron builds -------------------------------------------------
const realBuildFromTemplate = Menu.buildFromTemplate.bind(Menu)
const builtTemplates = []
Menu.buildFromTemplate = (template) => {
  builtTemplates.push(template)
  return realBuildFromTemplate(template)
}

/**
 * A real `Menu` reduced to the five lists the driver derives from `buildTrayMenu`.
 *
 * `?? ""` and `=== true` rather than passing the values through: Electron owns these properties, and a
 * `label` that arrived `undefined` or a `checked` that arrived truthy-but-not-boolean is a difference worth
 * seeing as a normalised value in a diff rather than as a JSON type mismatch three arms wide.
 */
function census(menu) {
  const items = menu.items
  const sub = items.find((item) => item.type === "submenu")
  return {
    labels: items.map((item) => item.label ?? ""),
    types: items.map((item) => item.type),
    checked: items.map((item) => item.checked === true),
    enabled: items.map((item) => item.enabled === true),
    visible: items.map((item) => item.visible === true),
    submenu:
      sub === undefined || sub.submenu === null || sub.submenu === undefined
        ? null
        : {
            labels: sub.submenu.items.map((item) => item.label ?? ""),
            types: sub.submenu.items.map((item) => item.type),
            checked: sub.submenu.items.map((item) => item.checked === true),
          },
  }
}

/**
 * Click every actionable item, depth-first, descending into a submenu where it sits.
 *
 * Each click is caught individually. Electron replaces the `click` a template supplied with a wrapper that
 * takes `(menuItem, focusedWindow, event)`; calling it with no arguments is the only way to drive it from
 * here, and a wrapper that objected would otherwise kill the harness silently mid-walk.
 */
function clickAll(menu, failures) {
  for (const item of menu.items) {
    if (item.type === "submenu" && item.submenu !== null && item.submenu !== undefined) {
      clickAll(item.submenu, failures)
      continue
    }
    if (item.type === "separator") continue
    try {
      item.click()
    } catch (error) {
      failures.push(`${item.label ?? "?"}: ${String(error)}`)
    }
  }
}

function makeTray(iconPath, state) {
  return new AppTray({
    iconPath,
    initialState: state,
    onAction: (action) => observed.actions.push(action),
    log,
    onMenuOpenChange: (open) => observed.pinEdges.push(open),
  })
}

async function main() {
  const [stateA, stateB] = plan.states

  // ---- T0: the module we loaded is the shipped one ------------------------------------------------
  observed.arms.exports = {
    appTray: typeof AppTray,
    toMenuTemplate: typeof toMenuTemplate,
    watchdogMs: MENU_PIN_WATCHDOG_MS,
  }

  // ---- T9 / T8: construction ----------------------------------------------------------------------
  observed.arms.iconEmpty = nativeImage.createFromPath(plan.iconPath).isEmpty()
  const buildsBeforeConstruct = builtTemplates.length
  const tray = makeTray(plan.iconPath, stateA)
  observed.arms.construct = {
    buildsAtConstruct: builtTemplates.length - buildsBeforeConstruct,
    clickListeners: tray.tray.listenerCount("click"),
    rightClickListeners: tray.tray.listenerCount("right-click"),
    logs: [...observed.logs],
  }

  // ---- T1-T7: the Menu the shipped class builds for state A --------------------------------------
  observed.arms.censusA = census(tray.buildMenu())

  // ---- T11: the pin's two event routes -----------------------------------------------------------
  const pinMenu = tray.buildMenu()
  const pinMark = observed.logs.length
  pinMenu.emit("menu-will-show")
  observed.arms.pinOn = {
    isMenuOpen: tray.isMenuOpen,
    timerArmed: tray.pinTimer !== null,
    logs: observed.logs.slice(pinMark),
  }
  const closeMark = observed.logs.length
  pinMenu.emit("menu-will-close")
  observed.arms.pinOff = {
    isMenuOpen: tray.isMenuOpen,
    timerArmed: tray.pinTimer !== null,
    logs: observed.logs.slice(closeMark),
  }

  // ---- T12: the close route that needs no Electron event -----------------------------------------
  pinMenu.emit("menu-will-show")
  const clickMark = observed.logs.length
  const actionMark = observed.actions.length
  pinMenu.items[0].click()
  observed.arms.pinItemClick = {
    isMenuOpen: tray.isMenuOpen,
    timerArmed: tray.pinTimer !== null,
    logs: observed.logs.slice(clickMark),
    actions: observed.actions.slice(actionMark),
  }

  // ---- T6: every actionable item dispatches, on a menu no census has touched ----------------------
  const walkMenu = tray.buildMenu()
  const walkMark = observed.actions.length
  const clickFailures = []
  clickAll(walkMenu, clickFailures)
  observed.arms.walk = {
    actions: observed.actions.slice(walkMark),
    failures: clickFailures,
  }

  // ---- T14: setStateAndRefresh -------------------------------------------------------------------
  const buildsBeforeRefresh = builtTemplates.length
  tray.setStateAndRefresh(stateB)
  observed.arms.refresh = {
    buildsDuringRefresh: builtTemplates.length - buildsBeforeRefresh,
    state: tray.state,
  }
  observed.arms.censusB = census(tray.buildMenu())

  // ---- T10: the control for T9 — a path that cannot load -----------------------------------------
  const bogusMark = observed.logs.length
  let bogusTray = null
  try {
    bogusTray = makeTray(plan.bogusIconPath, stateA)
  } catch (error) {
    observed.arms.bogusThrew = String(error)
  }
  observed.arms.bogus = {
    empty: nativeImage.createFromPath(plan.bogusIconPath).isEmpty(),
    logs: observed.logs.slice(bogusMark),
  }
  if (bogusTray !== null) bogusTray.destroy()

  // ---- T13: destroy takes a live tray down and cancels a pending watchdog -------------------------
  tray.buildMenu().emit("menu-will-show")
  const destroyedBefore = tray.tray.isDestroyed()
  const armedBefore = tray.pinTimer !== null
  tray.destroy()
  let secondDestroyThrew = null
  try {
    tray.destroy()
  } catch (error) {
    secondDestroyThrew = String(error)
  }
  observed.arms.destroy = {
    destroyedBefore,
    armedBefore,
    destroyedAfter: tray.tray.isDestroyed(),
    timerAfter: tray.pinTimer,
    secondDestroyThrew,
  }
}

app.whenReady().then(
  async () => {
    try {
      await main()
    } catch (error) {
      observed.failure = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
    }
    process.stdout.write(`PROBE_RESULT ${JSON.stringify(observed)}\n`)
    // `exit` rather than `quit`: no window was ever created, so there is no close to wait for, and a
    // watchdog cleared by `destroy()` is exactly what this run asserts — leaving the loop to drain would
    // make a REGRESSION in that clearing look like a slow exit instead of a red arm.
    setTimeout(() => app.exit(0), 100)
  },
  (error) => {
    process.stdout.write(`PROBE_RESULT ${JSON.stringify({ ...observed, failure: String(error) })}\n`)
    setTimeout(() => app.exit(1), 100)
  },
)
