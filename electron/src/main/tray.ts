/**
 * The tray icon (ISC-17) -- `FuzzyClock.App/TrayMenuBuilder.cs`'s WinForms half.
 *
 * The menu's CONTENT is `core/tray-menu.ts`, which knows nothing about Electron and is fully tested.
 * This file does three things that need the real API: turn that model into a `Menu`, own the `Tray`,
 * and handle the platform differences in how a tray menu is opened at all.
 *
 * ## The Linux activation difference, and why it forces a different strategy
 *
 * Two facts read off `electron.d.ts` in this repo, not off the website:
 *
 *   - `popUpContextMenu` is **`@platform darwin,win32`** (`electron.d.ts:13846`). There is no Linux
 *     implementation, so a Linux tray cannot be given a menu at open time.
 *   - `click` "on Linux ... is emitted when the tray icon receives an activation, which might not
 *     necessarily be left mouse click" (`electron.d.ts:13228`), because the icon is an
 *     AppIndicator/StatusNotifierItem owned by the desktop shell rather than a window we control.
 *
 * So the two platforms get opposite strategies, and the reason is the API surface rather than taste:
 *
 *   - **win32 / darwin**: no attached context menu. Both click events call `popUpContextMenu(build())`,
 *     so the menu is rebuilt per open. That is `ContextMenuStrip.Opening -> SyncCheckmarks` exactly --
 *     and that handler exists in the C# because ticks went stale when a setting was changed from the
 *     settings window instead of from the menu.
 *   - **linux**: `setContextMenu(menu)` up front, and `refresh()` re-attaches a rebuilt menu on every
 *     state change. There is no open event to hook, so freshness has to be pushed rather than pulled.
 *     Callers must therefore call `refresh()` after any state change -- on Windows and macOS it is a
 *     no-op, which means forgetting it produces a Linux-only stale-tick bug. Hence
 *     `setStateAndRefresh` being the only mutation route this class offers.
 *
 * On libappindicator desktops a menu-less indicator is not clickable at all, so the Linux branch is
 * also what makes the icon do anything.
 *
 * ## RMB-04's pin, and why it is belt-and-braces rather than one event
 *
 * `MainWindow` holds `_menuOpen` and sets it from `ContextMenuStrip.Opening` / `.Closed` for two purposes:
 * it pins the ghost fade so the widget cannot fade out from under its own menu, and it makes a second
 * right-click while the menu is up a no-op instead of a re-`Show()` that repositions and flickers.
 *
 * Electron's `Menu` has the matching pair -- `menu-will-show` and `menu-will-close` (`electron.d.ts:8607-
 * 8626`) -- but read the first one's own doc: "Emitted when `menu.popup()` is called." This file opens the
 * menu with `tray.popUpContextMenu(menu)`, deliberately (see above), which is a different call, and
 * nothing in the type definitions says the events fire on that path. So the pin does not depend on them:
 *
 *   - **on** is set by {@link popUp} itself, which is the call that cannot be missed;
 *   - **off** has three independent routes -- `menu-will-close`, any menu item being clicked (which closes
 *     the menu by definition), and a {@link MENU_PIN_WATCHDOG_MS} ceiling;
 *   - every transition logs its route, so one right-click and one dismissal produce a two-line trace that
 *     answers the open question empirically on whatever platform it was run on.
 *
 * The watchdog is there because of what a stuck pin costs: the fade stops writing and the widget's
 * right-click stops working, both silently and both until the app restarts. A bounded 30 seconds of a
 * pinned fade is a far cheaper failure than that, and the log line names it.
 */

import { Menu, Tray, dialog, nativeImage } from "electron"
import type { MenuItemConstructorOptions } from "electron"
import { IS_LINUX } from "../platform.js"
import type { TrayAction, TrayMenuItem, TrayMenuState } from "../core/tray-menu.js"
import { ABOUT_TITLE, TRAY_TOOLTIP, aboutMessage, buildTrayMenu } from "../core/tray-menu.js"

type Logger = (level: "info" | "warn" | "error", message: string) => void

/** `TrayMenuItem[]` -> Electron's template. One `click` closure per item, all routed to one handler. */
export function toMenuTemplate(
  items: readonly TrayMenuItem[],
  onAction: (action: TrayAction) => void,
): MenuItemConstructorOptions[] {
  return items.map((item): MenuItemConstructorOptions => {
    switch (item.kind) {
      case "separator":
        return { type: "separator" }
      case "command":
        return { label: item.label, click: () => onAction(item.action) }
      case "checkbox":
        // `checked` is only honoured with an explicit type, and Electron infers `normal` otherwise --
        // which renders a tick-less item that silently loses the state the C# menu showed.
        return { label: item.label, type: "checkbox", checked: item.checked, click: () => onAction(item.action) }
      case "submenu":
        return { label: item.label, submenu: toMenuTemplate(item.items, onAction) }
    }
  })
}

/**
 * How long a pin may survive with no close signal. See the header.
 *
 * 30 seconds rather than something tighter because it must not fire while a menu is genuinely open, and a
 * user reading a nine-item menu with a four-item submenu can easily take ten.
 */
export const MENU_PIN_WATCHDOG_MS = 30_000

export interface AppTrayOptions {
  readonly iconPath: string
  readonly initialState: TrayMenuState
  readonly onAction: (action: TrayAction) => void
  readonly log?: Logger
  /** RMB-04: called with true when the menu opens and false when it closes. See the header. */
  readonly onMenuOpenChange?: (open: boolean) => void
}

export class AppTray {
  private readonly tray: Tray
  private readonly onAction: (action: TrayAction) => void
  private readonly log: Logger
  private readonly onMenuOpenChange: (open: boolean) => void
  private state: TrayMenuState
  private menuOpen = false
  private pinTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: AppTrayOptions) {
    this.onAction = options.onAction
    this.log = options.log ?? ((): void => {})
    this.onMenuOpenChange = options.onMenuOpenChange ?? ((): void => {})
    this.state = options.initialState

    // `createFromPath` rather than handing the path to `new Tray()`: an unreadable or unsupported
    // image yields an EMPTY nativeImage rather than an error, and an empty-image tray occupies a slot
    // showing nothing. Checking `isEmpty()` turns that into a log line instead of a mystery.
    const icon = nativeImage.createFromPath(options.iconPath)
    if (icon.isEmpty()) {
      this.log("error", `tray: icon at ${options.iconPath} loaded as an empty image -- the tray will be invisible`)
    }
    this.tray = new Tray(icon)
    this.tray.setToolTip(TRAY_TOOLTIP)

    if (IS_LINUX) {
      this.tray.setContextMenu(this.buildMenu())
      this.log("info", "tray: linux -- context menu attached up front, refreshed on every state change")
    } else {
      this.tray.on("click", () => this.popUp())
      this.tray.on("right-click", () => this.popUp())
      this.log("info", "tray: win32/darwin -- menu rebuilt per open (ContextMenuStrip.Opening equivalent)")
    }
  }

  private buildMenu(): Menu {
    // Wrapped so a click clears the pin as well as dispatching: clicking an item closes the menu, which
    // makes this the one close route that needs no event from Electron at all.
    const dispatch = (action: TrayAction): void => {
      this.setPin(false, "item clicked")
      this.onAction(action)
    }
    const menu = Menu.buildFromTemplate(toMenuTemplate(buildTrayMenu(this.state), dispatch))
    // Attached to every rebuilt menu rather than once, because on win32/darwin each open builds a new
    // `Menu` object -- listeners on a previous one would belong to a menu nobody can see any more.
    menu.on("menu-will-show", () => this.setPin(true, "menu-will-show"))
    menu.on("menu-will-close", () => this.setPin(false, "menu-will-close"))
    return menu
  }

  /** RMB-04's `_menuOpen`, for the fade guard and the re-entrant-open guard. See the header. */
  get isMenuOpen(): boolean {
    return this.menuOpen
  }

  private setPin(open: boolean, why: string): void {
    if (this.pinTimer !== null) {
      clearTimeout(this.pinTimer)
      this.pinTimer = null
    }
    if (open) {
      this.pinTimer = setTimeout(() => {
        this.pinTimer = null
        // Reaching here means no close route fired for 30s. Either the menu is genuinely still open, or
        // `popUpContextMenu` does not emit `menu-will-close` on this platform -- which is the open question
        // in the header, and this line is what answers it.
        this.setPin(false, `watchdog after ${String(MENU_PIN_WATCHDOG_MS)}ms with no close signal`)
      }, MENU_PIN_WATCHDOG_MS)
    }
    // After the timer bookkeeping, so a repeated `menu-will-show` re-arms the watchdog, and before the
    // change check, so it re-arms even when the state itself did not move.
    if (this.menuOpen === open) return
    this.menuOpen = open
    this.log("info", `tray: menu ${open ? "open" : "closed"} (${why})`)
    this.onMenuOpenChange(open)
  }

  /**
   * Open the menu at the cursor. Also the RMB-01 path: a right-click on the widget shows this same
   * menu, as the C# does by reusing the one `ContextMenuStrip` instance.
   *
   * A no-op on Linux, where the desktop shell owns the popup and there is no API to trigger it. That
   * makes a widget right-click do nothing there; recorded rather than papered over with a second,
   * separately-built `Menu.popup()`, which would give Linux users a menu that looks like the tray's
   * but is a different object with its own state.
   *
   * The pin goes on HERE and not only from `menu-will-show`, for the reason in the header -- and the
   * Linux early return is above it deliberately: no menu opens on that path, so pinning the fade would
   * freeze it for 30 seconds for nothing.
   */
  popUp(): void {
    if (IS_LINUX) return
    this.setPin(true, "popUp")
    this.tray.popUpContextMenu(this.buildMenu())
  }

  /**
   * The only way to change what the menu shows. Rebuilds and re-attaches on Linux; elsewhere the next
   * open rebuilds anyway, so this just records the state.
   */
  setStateAndRefresh(state: TrayMenuState): void {
    this.state = state
    if (IS_LINUX) this.tray.setContextMenu(this.buildMenu())
  }

  /** `MessageBox.Show(..., "About FuzzyClock")`. */
  showAbout(version: string): void {
    void dialog.showMessageBox({
      type: "info",
      title: ABOUT_TITLE,
      message: ABOUT_TITLE,
      detail: aboutMessage(version),
      buttons: ["OK"],
    })
  }

  destroy(): void {
    // The watchdog first: a pending 30s timer holds the event loop open past `before-quit`, which turns a
    // quit taken while the menu was up into a visibly slow exit.
    if (this.pinTimer !== null) {
      clearTimeout(this.pinTimer)
      this.pinTimer = null
    }
    if (!this.tray.isDestroyed()) this.tray.destroy()
  }
}
