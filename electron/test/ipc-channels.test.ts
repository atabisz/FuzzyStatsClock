/**
 * The IPC channel names as a contract between main and the two preloads.
 *
 * ## The defect this exists for is named in the plan, and nothing else on this port can see it
 *
 * `.planning/research/ELECTRON-PORT-PLAN.md`'s manual item 6 says it plainly: `probe:settings-window`
 * drives the real host module, the real `dist/` bundles and the real form under the shipped CSP, 37/37 —
 * but it **reimplements `main.ts`'s `ipcMain.on` relays with a recorder in front**, so a channel name
 * typo'd in `main.ts` is outside every arm on this port. The same is true of the overlay: `probe:display`
 * and `probe:fade` read the live DOM and the live frame clock, and both are downstream of a renderer that
 * already got its data.
 *
 * A misspelled channel is the worst shape a defect can have here, because **every layer stays silent**:
 *
 *   1. It compiles and typechecks. `ipcMain.on` takes a `string`, so `"settings-edt"` is as valid as
 *      `"settings-edit"`.
 *   2. `ipcRenderer.send` to a channel nobody handles does not throw, return an error, or log. The message
 *      is delivered to a process that has no listener for it and is dropped.
 *   3. The window still opens, the form still renders, the CSP is still satisfied. Only the one control
 *      that used the broken channel does nothing, and only when a human clicks it.
 *
 * That is the failure `preload-settings.ts`'s header describes from the *timing* direction — a push before
 * the listener exists goes nowhere silently — arrived at here from the *naming* direction.
 *
 * ## Both directions are checked, and they are not equally serious
 *
 * A **send with no handler** is the silent drop above. An **orphan handler** is milder — dead code, or a
 * sender that was renamed and left its receiver behind — but it is checked too, because it is how the first
 * one gets introduced: rename one side, and the set that used to match no longer does. Which side moved is
 * the useful half of the failure message, so the two are separate assertions rather than one set equality.
 *
 * ## The sets are PINNED, not merely compared
 *
 * Set equality alone passes on the empty set, which is exactly what a regex that stopped matching produces.
 * So each census is also pinned to its literal contents: adding a channel is then a deliberate two-line
 * act, and a parser that quietly finds nothing goes red instead of green. The parser's own assumptions are
 * policed at the bottom of the file for the same reason.
 *
 * ## Comments are stripped first, and this file already had the failure that proves it necessary
 *
 * `preload.ts:25` contains the text `ipcRenderer.on("settings", …)` **inside a docblock**, explaining the
 * timing failure. A scan over the raw source counts that as a listener registration. It happens to name a
 * channel that really is listened for, so it would not have changed a verdict — which is the point: the
 * next one might not be, and it would arrive as an unexplained red in a census nobody edited.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dirname, "..", "src")

/**
 * Block comments go, and whole-line `//` comments go. A trailing `//` after code is deliberately left
 * alone: stripping it needs to know whether the `//` is inside a string literal, and getting that wrong
 * silently removes real code. The residual risk is a phantom channel from a trailing comment, which lands
 * as an unexpected entry in a pinned set — red, not green, which is the safe direction.
 */
function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")
}

function read(...parts: string[]): string {
  return strip(readFileSync(join(SRC, ...parts), "utf8"))
}

const MAIN = read("main", "main.ts")
const SETTINGS_WINDOW = read("main", "settings-window.ts")
const PRELOAD = read("preload.ts")
const PRELOAD_SETTINGS = read("preload-settings.ts")

/** Main-side sources, as one text. Both halves of main register and send, so both are scanned. */
const MAIN_SIDE = `${MAIN}\n${SETTINGS_WINDOW}`
/** Renderer-side sources, as one text. */
const RENDERER_SIDE = `${PRELOAD}\n${PRELOAD_SETTINGS}`

/**
 * `\s*` after the paren is load-bearing: `preload.ts`'s `"ghost"` listener puts the channel name on its own
 * line, so a pattern requiring the string to follow `(` immediately misses exactly one channel — and misses
 * it silently, which is the class of bug this whole file is about.
 */
function channels(source: string, call: string): string[] {
  const pattern = new RegExp(`${call}\\(\\s*["']([^"']+)["']`, "g")
  return [...new Set([...source.matchAll(pattern)].map((m) => m[1] as string))].sort()
}

/** Renderer → main. */
const RENDERER_SENDS = channels(RENDERER_SIDE, "ipcRenderer\\.send")
/** Main's handlers for them. */
const MAIN_HANDLES = channels(MAIN_SIDE, "ipcMain\\.on")
/** Main → renderer. `webContents.send` rather than a bare `.send`, so the two directions cannot blur. */
const MAIN_SENDS = channels(MAIN_SIDE, "webContents\\.send")
/** The renderer's listeners for them. */
const RENDERER_LISTENS = channels(RENDERER_SIDE, "ipcRenderer\\.on")

describe("IPC channels: renderer → main", () => {
  test("every channel a preload sends on has a handler in main — the silent-drop defect", () => {
    const orphanSends = RENDERER_SENDS.filter((c) => !MAIN_HANDLES.includes(c))
    expect(orphanSends).toEqual([])
  })

  test("every handler in main has a preload that sends on it — the renamed-sender defect", () => {
    const orphanHandlers = MAIN_HANDLES.filter((c) => !RENDERER_SENDS.includes(c))
    expect(orphanHandlers).toEqual([])
  })

  test("the census is pinned, so adding a channel is deliberate", () => {
    expect(RENDERER_SENDS).toEqual([
      "adjust-opacity",
      "context-menu",
      "drag-end",
      "drag-move",
      "drag-start",
      "hover",
      "painted",
      "ready",
      "resize",
      "settings-close",
      "settings-edit",
      "settings-ready",
    ])
    expect(MAIN_HANDLES).toEqual(RENDERER_SENDS)
  })
})

describe("IPC channels: main → renderer", () => {
  test("every channel main pushes on has a listener in a preload", () => {
    const unheard = MAIN_SENDS.filter((c) => !RENDERER_LISTENS.includes(c))
    expect(unheard).toEqual([])
  })

  test("every preload listener has a main that pushes on it", () => {
    const unfed = RENDERER_LISTENS.filter((c) => !MAIN_SENDS.includes(c))
    expect(unfed).toEqual([])
  })

  test("the census is pinned", () => {
    expect(MAIN_SENDS).toEqual(["backdrop", "form", "ghost", "settings", "stats", "update"])
    expect(RENDERER_LISTENS).toEqual(MAIN_SENDS)
  })
})

describe("the parser's own assumptions, because a scan that finds nothing passes every arm above", () => {
  test("all four sources survived the comment strip", () => {
    // A sentinel per file that is code rather than prose, so an over-eager strip cannot leave these.
    expect(MAIN).toContain("ipcMain.on")
    expect(SETTINGS_WINDOW).toContain("webContents.send")
    expect(PRELOAD).toContain("ipcRenderer.send")
    expect(PRELOAD_SETTINGS).toContain("ipcRenderer.send")
  })

  test("the strip removes the docblock occurrence that motivated it", () => {
    const raw = readFileSync(join(SRC, "preload.ts"), "utf8")
    // Present in the prose, absent from the code: `preload.ts` explains the timing failure by quoting the
    // call, and its real listener for that channel is registered by `onSettings`, not by that sentence.
    expect(raw).toContain('before the renderer has run `ipcRenderer.on("settings"')
    expect(PRELOAD).not.toContain("before the renderer has run")
    // And the channel is still found, from the real registration.
    expect(RENDERER_LISTENS).toContain("settings")
  })

  test("both directions found a non-trivial number of channels", () => {
    // Floors rather than exact counts — the pins above own the exact contents. These exist so that a
    // regex which matched two things and stopped cannot satisfy the set comparisons by being empty.
    expect(RENDERER_SENDS.length).toBeGreaterThanOrEqual(10)
    expect(MAIN_SENDS.length).toBeGreaterThanOrEqual(5)
  })

  test("the multi-line registration is found, which a stricter pattern would miss", () => {
    // `preload.ts` puts `"ghost"` on the line after `ipcRenderer.on(`. This asserts the `\s*` in the
    // pattern is doing work, rather than being defensive punctuation nobody has tested.
    expect(PRELOAD).toMatch(/ipcRenderer\.on\(\s*\n\s*"ghost"/)
    expect(RENDERER_LISTENS).toContain("ghost")
  })
})
