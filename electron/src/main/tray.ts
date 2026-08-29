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

export interface AppTrayOptions {
  readonly iconPath: string
  readonly initialState: TrayMenuState
  readonly onAction: (action: TrayAction) => void
  readonly log?: Logger
}

export class AppTray {
  private readonly tray: Tray
  private readonly onAction: (action: TrayAction) => void
  private readonly log: Logger
  private state: TrayMenuState

  constructor(options: AppTrayOptions) {
    this.onAction = options.onAction
    this.log = options.log ?? ((): void => {})
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
    return Menu.buildFromTemplate(toMenuTemplate(buildTrayMenu(this.state), this.onAction))
  }

  /**
   * Open the menu at the cursor. Also the RMB-01 path: a right-click on the widget shows this same
   * menu, as the C# does by reusing the one `ContextMenuStrip` instance.
   *
   * A no-op on Linux, where the desktop shell owns the popup and there is no API to trigger it. That
   * makes a widget right-click do nothing there; recorded rather than papered over with a second,
   * separately-built `Menu.popup()`, which would give Linux users a menu that looks like the tray's
   * but is a different object with its own state.
   */
  popUp(): void {
    if (IS_LINUX) return
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
    if (!this.tray.isDestroyed()) this.tray.destroy()
  }
}
