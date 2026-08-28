/**
 * Platform seam.
 *
 * Same contract as `~/code/garry-desktop/src/platform.ts`, which is the shipped
 * precedent on this machine for a three-platform Electron overlay: **no Electron
 * import, not even a type one.** Every signature below is structural. That is
 * what lets `bun` load this module — and everything that depends on only this
 * module — with no Electron on the path, which in turn is what makes the platform
 * and parsing layers testable on any OS. Break that rule and the fixture-driven
 * test strategy for macOS and Linux sources dies with it.
 */

export const IS_WIN = process.platform === "win32"
export const IS_MAC = process.platform === "darwin"
/** Everything that is not Windows or macOS — the X11 / Wayland desktops. */
export const IS_LINUX = !IS_WIN && !IS_MAC

export type PlatformName = "win32" | "darwin" | "linux"

export const PLATFORM: PlatformName = IS_WIN ? "win32" : IS_MAC ? "darwin" : "linux"

type Logger = (level: "info" | "warn" | "error", message: string) => void

interface DockLike {
  hide(): void
  isVisible(): boolean
}
interface AppLike {
  dock?: DockLike
}
interface WindowLike {
  setVisibleOnAllWorkspaces(visible: boolean): void
}

/**
 * The subset of `BrowserWindow` options that differs by platform.
 *
 * `type: "toolbar"` is the Win32 / Linux ex-style that keeps the overlay out of
 * Alt-Tab. macOS has no such window type — the value is ignored there — and the
 * app-switcher exclusion happens instead via `hideFromAppSwitcher()`.
 */
export function platformWindowOptions(): { type?: "toolbar" } {
  return IS_MAC ? {} : { type: "toolbar" }
}

/**
 * Keep the process out of the OS task / application switcher.
 *
 * Win32 / Linux: nothing to do — `skipTaskbar: true` plus the `toolbar` type
 * already handle it at construction. macOS: the accessory activation policy
 * removes the Dock tile and the Cmd-Tab entry in one call. The menu-bar tray
 * survives it. Must run after `app.whenReady()`.
 */
export function hideFromAppSwitcher(app: AppLike, log: Logger): void {
  if (!IS_MAC || !app.dock) return
  app.dock.hide()
  log("info", `macOS: dock hidden, dockVisible=${app.dock.isVisible()} — accessory app, no Cmd-Tab entry`)
}

/**
 * Window traits that only apply on macOS.
 *
 * Present on every Space and parked over a fullscreen app — the macOS shape of
 * "visible over a maximised window" that Win32 gets from the `screen-saver`
 * always-on-top level. Linux WMs vary too much to assert this, and Win32 needs
 * nothing extra, so it is a no-op on both.
 */
export function applyPlatformWindowTraits(win: WindowLike, log: Logger): void {
  if (!IS_MAC) return
  try {
    win.setVisibleOnAllWorkspaces(true)
    log("info", "macOS: window set visible on all workspaces")
  } catch (err) {
    log("warn", `macOS: setVisibleOnAllWorkspaces failed: ${String(err)}`)
  }
}

/**
 * Force XWayland on Linux.
 *
 * Wayland breaks three things this overlay is built on, and all three are
 * protocol-level rather than bugs: a client cannot set its own absolute window
 * position (the compositor owns placement, so per-monitor position memory and
 * drag-to-move have nothing to write to), a client cannot query the pointer
 * outside its own surface (which is exactly what ghost mode's cursor poll does),
 * and there is no equivalent of capture self-exclusion. Under XWayland all three
 * behave as they do on X11.
 *
 * UNPROBED on this machine — no Linux host was available when this was written.
 * Must run before `app.whenReady()`.
 */
export function forceX11OnLinux(
  commandLine: { appendSwitch(name: string, value?: string): void },
  log: Logger,
): void {
  if (!IS_LINUX) return
  commandLine.appendSwitch("ozone-platform", "x11")
  log("info", "linux: ozone-platform=x11 — XWayland under a Wayland session")
}
