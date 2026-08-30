/**
 * The settings window's lifetime — `OpenSettings` (`MainWindow.xaml.cs:725-865`) minus its 47 event wires.
 *
 * The C# spends 140 lines here because each control gets its own `+=`. This file is 1/10th of that for a
 * structural reason rather than a stylistic one: the port sends a form model down one channel and receives
 * `{id, value}` back up another, so there is one route in and one route out regardless of how many controls
 * exist. What is left is the part that is genuinely about a *window* — create-or-focus, drop the reference on
 * close, and tell the overlay it is open.
 *
 * ## `Owner = this` is not decoration, and it changes the z-order answer
 *
 * `MainWindow.xaml.cs:734` sets `_settingsWindow.Owner = this`. An owned window is kept above its owner in
 * the z-order, and Win32 propagates topmost-ness to owned windows — so in the original the settings window
 * appears **above** the `Topmost` widget rather than under it. I had assumed the opposite (widget floats over
 * settings, overlap unlikely, leave it) and that assumption was wrong; reading the line is what corrected it.
 *
 * Electron's `parent` is the same Win32 owner relationship, so it is what the port uses — **except on
 * macOS**, where `parent` adds a behaviour Win32 owners do not have: the child keeps its position relative
 * to the parent when the parent moves (documented on `BrowserWindowConstructorOptions.parent`). The widget is
 * drag-to-move, so on macOS a `parent` would make the settings window chase the widget around the screen
 * while you drag it — which is exactly the case a user hits when repositioning the widget to see a setting's
 * effect. Taking `parent` on win32/linux and omitting it on darwin ports the behaviour rather than the
 * mechanism; the residual is that on macOS the always-on-top widget can cover the settings window, which is
 * a real divergence, named in the ISA, and cheaper than the alternative.
 *
 * ## The three things about the settings window that the overlay has to know
 *
 * Only one is obvious. `core/ghost-fade.ts`'s {@link FadeGuards.settingsOpen} has carried the comment
 * "always false until Phase 6.5 exists to set it" since Phase 5, and this is the phase — the widget must not
 * fade out from under a settings window, exactly as it must not fade out from under a drag or its own menu.
 * The other two came out of the same read and neither was on the plan's list:
 *
 *   1. `OnRenderingTick`'s guard chain has THREE members and the middle one is this window
 *      (`MainWindow.xaml.cs:407`, between the drag freeze and the menu pin). Wired via `onVisibilityChange`.
 *   2. `SetOpacity` writes the opacity **unfaded** while this window is visible (`:1775-1778`, "settings
 *      window open means user is actively adjusting opacity"). That one lives in the renderer's settings
 *      push, because that is where `SetOpacity` landed.
 *   3. `SetGhostModeEnabled`'s disable edge guards its opacity write on this window too (`:366-367`) — and
 *      that one is a no-op in the original: it writes `_windowOpacity` after zeroing `_currentRatio`, which
 *      is the same value the pin holds. The port's reset path already writes exactly that. Recorded here
 *      because "the C# guards it and we do not" is a question worth answering once instead of twice.
 */

import { BrowserWindow } from "electron"
import type { WebContents } from "electron"
import { join } from "node:path"
import { IS_MAC } from "../platform.js"
import { SETTINGS_WINDOW_HEIGHT, SETTINGS_WINDOW_TITLE, SETTINGS_WINDOW_WIDTH } from "../core/settings-form.js"
import type { SettingsForm } from "../core/settings-form.js"

type Logger = (level: "info" | "warn" | "error", message: string) => void

export interface SettingsWindowDeps {
  /** `dist/`, where `settings.html` and `preload-settings.cjs` are. Main's `HERE`; see its note. */
  readonly dir: string
  readonly log: Logger
  /** The current form, rebuilt per push. Main owns `settings`, so it owns this. */
  readonly buildForm: () => SettingsForm
  /**
   * Open or closed, on every edge.
   *
   * Main turns this into the overlay's fade pin. A callback rather than a getter main polls, because the
   * pin is an edge — the renderer holds a boolean and only a message changes it.
   */
  readonly onVisibilityChange: (open: boolean) => void
  /**
   * The overlay, for the owner relationship. Null is tolerated so this can be constructed before the
   * window exists without the order becoming load-bearing.
   */
  readonly parent: () => BrowserWindow | null
}

export class SettingsWindowHost {
  #win: BrowserWindow | null = null
  /**
   * Whether THIS window's renderer has registered its listeners.
   *
   * Per-window and reset in {@link open}, not a module flag: a close-then-reopen is a new `webContents`
   * with no listeners on it, and a flag that survived the close would have main pushing a form into a
   * renderer that is not listening yet — the silent-drop failure `preload-settings.ts` documents, arrived at
   * from the other direction.
   */
  #ready = false

  constructor(private readonly deps: SettingsWindowDeps) {}

  get isOpen(): boolean {
    return this.#win !== null && !this.#win.isDestroyed()
  }

  /**
   * `OpenSettings`: focus the existing window, or build one.
   *
   * The C# tests `_settingsWindow is { IsVisible: true }` and calls `Activate()` + `RefreshControls(...)` on
   * the hit — so a second click on a tray item that is already open re-pushes the current state rather than
   * doing nothing. Both halves are here, and the re-push is not redundant: the tray can change settings
   * (clock type, ghost mode, stats, auto-contrast, auto-launch, reset) while this window sits open.
   */
  open(): void {
    if (this.isOpen) {
      const win = this.#win
      if (win !== null) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      }
      this.push()
      return
    }

    this.#ready = false
    const parent = this.deps.parent()
    const win = new BrowserWindow({
      width: SETTINGS_WINDOW_WIDTH,
      height: SETTINGS_WINDOW_HEIGHT,
      title: SETTINGS_WINDOW_TITLE,
      // `WindowStartupLocation="CenterScreen"`. Electron centres on the display holding the cursor, WPF on
      // the one holding the mouse too (`CenterScreen` is primary-relative in theory and cursor-relative in
      // practice via `SystemParameters`), and either way it is the right screen for a window opened from a
      // tray click.
      center: true,
      // `ResizeMode="NoResize"`. Also drops the maximise button, as WPF's does.
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      // `ShowInTaskbar="False"`.
      skipTaskbar: true,
      // Shown once the renderer has painted, so the window does not flash the background colour before the
      // form arrives. `show: true` with an empty body is a visible white-then-dark blink on Windows.
      show: false,
      // `ThemeMode="Dark"`'s window ground. Set here as well as in `settings.css` because this is the colour
      // the frame paints before the document exists, and it is the one thing CSS cannot get in front of.
      backgroundColor: "#2b2b2b",
      // Owner semantics — see the header for why this is platform-conditional rather than unconditional.
      ...(parent !== null && !IS_MAC ? { parent } : {}),
      webPreferences: {
        preload: join(this.deps.dir, "preload-settings.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    // Electron gives a framed window the default File/Edit/View menu bar on win32 and linux. The overlay is
    // frameless so it never showed one and the app never needed to think about it; a normal window does.
    // `@platform linux,win32` on the method, and on macOS the menu belongs to the app rather than the window
    // — where this app is an accessory (`hideFromAppSwitcher`) and has no visible menu to remove.
    if (!IS_MAC) win.removeMenu()

    // The same loud failure the overlay has, and for a sharper reason here: a settings window whose document
    // failed to load is an empty 480x600 dark rectangle, which is indistinguishable from a form that loaded
    // and received no data. `dist/dist/index.html` was found this way once already; see main's `HERE`.
    win.webContents.on("did-fail-load", (_e, code, description, url) => {
      this.deps.log("error", `settings window failed to load ${url}: ${description} (${String(code)})`)
    })

    // `show()` and nothing else, on every platform. There was an `app.focus({ steal: true })` here for macOS,
    // on the reasoning that an accessory app is not activated merely by showing a window — so the form would
    // sit in front while the typing went somewhere else. `probe:mac-focus` measured that on a real host and it
    // is not true: `show()` is `makeKeyAndOrderFront`, and it activates the app and takes key focus by itself,
    // from a genuinely deactivated accessory app, on this path and on the create-or-focus one above. The call
    // was also not a working fallback for the case it was written for — with `show()` cut back to ordering-only,
    // it activated the app but handed key focus to the OVERLAY, which has nothing to type into.
    //
    // The arms that keep this honest are F5-F9 there; F7 is the control that proves they can see a window
    // which appears and never takes focus. If those go red, this is the comment to come back to.
    win.once("ready-to-show", () => {
      win.show()
    })

    // `_settingsWindow.Closed += (_, _) => _settingsWindow = null`, plus the pin's falling edge.
    //
    // `closed` rather than `close`: `close` is cancellable and fires before the window is gone, so a
    // reference dropped there would leave `isOpen` false with a live window still on screen.
    win.on("closed", () => {
      this.#win = null
      this.#ready = false
      this.deps.onVisibilityChange(false)
      this.deps.log("info", "settings window: closed")
    })

    this.#win = win
    void win.loadFile(join(this.deps.dir, "settings.html"))
    // The rising edge now rather than in `ready-to-show`: the pin must be up before the user can touch
    // anything, and the fade is the thing being pinned — a widget that fades during the load is the defect.
    this.deps.onVisibilityChange(true)
    this.deps.log("info", `settings window: opened${parent !== null && !IS_MAC ? " (owned by the overlay)" : ""}`)
  }

  /**
   * The renderer said `settings-ready`. See `preload-settings.ts` for why the channel is not called `ready`.
   *
   * The sender is checked rather than trusted, and it is not ceremony: close-then-reopen quickly enough and
   * the dying renderer's message can arrive after the new window exists, which would mark a renderer ready
   * that has not registered a listener — and the form it is then sent is dropped silently. Comparing
   * `webContents` identity makes that unrepresentable instead of unlikely.
   */
  markReady(sender: WebContents): void {
    if (this.#win === null || this.#win.isDestroyed() || sender !== this.#win.webContents) {
      this.deps.log("warn", "settings window: settings-ready from an unknown renderer — ignored")
      return
    }
    this.#ready = true
    this.push()
  }

  /** Send the current form, if there is a window listening for one. Safe to call on every settings change. */
  push(): void {
    if (!this.#ready || this.#win === null || this.#win.isDestroyed()) return
    this.#win.webContents.send("form", this.deps.buildForm())
  }

  /** The Close button and the Escape key. Main owns the lifetime, which is why this is not `window.close()`. */
  close(): void {
    if (this.#win === null || this.#win.isDestroyed()) return
    this.#win.close()
  }

  /** Teardown. `destroy` rather than `close`, because `before-quit` is past the point of a cancellable close. */
  destroy(): void {
    if (this.#win === null || this.#win.isDestroyed()) return
    this.#win.destroy()
  }
}
