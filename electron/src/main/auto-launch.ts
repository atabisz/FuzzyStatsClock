/**
 * Launch-at-login registration, ported from `FuzzyClock.App/AutoLaunchService.cs` and widened to three
 * platforms (ISC-30).
 *
 * The C# is 37 lines over one API: `Registry.CurrentUser`, key
 * `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`, value name `FuzzyClock`, data the full exe path. There
 * is no macOS or Linux half to port, so those two are written against each platform's own convention and
 * the *contract* is what stays identical: {@link AutoLaunch.enable}, {@link AutoLaunch.disable} and
 * {@link AutoLaunch.isEnabled}, with `disable()` a no-op when nothing is registered.
 *
 * ## Why not `app.setLoginItemSettings()`
 *
 * Electron ships an API for exactly this, and it is the wrong one here for three measured reasons:
 *
 * 1. **It is typed `@platform darwin,win32`** (`electron.d.ts:1634`, recorded in the port plan's evidence
 *    index). Linux would still need this file, so the choice is between one mechanism and three sinks, or
 *    two mechanisms and two sinks. One is cheaper to reason about and to probe.
 * 2. **It would import `electron`**, which puts this module out of reach of `bun test` and of any probe
 *    that is not itself an Electron app. Every other seam in this tree is arranged so the logic can be
 *    driven without a browser process, and autostart is precisely the feature whose defects are invisible
 *    until the next login -- so it is the last one that should be hard to test.
 * 3. **The Windows value name would not be `FuzzyClock`.** Electron writes the *product* name, and this
 *    port's `productName` is `FuzzyClock`, so it would agree today -- but only by coincidence, and the
 *    coincidence matters: Alex's live `HKCU\...\Run` already holds `FuzzyClock` pointing at the WPF
 *    Release build (read 2026-08-30, read-only). Writing the same value name is what makes installing v5
 *    *replace* his autostart entry rather than add a second one that launches both apps at every login.
 *    That is a parity requirement, not a detail, and it should be a constant in this file rather than a
 *    property of Electron's naming.
 *
 * `garry-desktop`'s `src/autostart.ts` reached the same three-sink shape from the same argument and is the
 * prior art for the structure; it chose a *Scheduled Task* on Windows because it needed a logon trigger
 * with no console flash. This app does not: the C#'s Run key is the behaviour being ported, and a Run
 * entry is what an uninstaller and every "startup apps" UI already know how to show the user.
 *
 * ## The seam
 *
 * One injected {@link Runner} for process execution and one injected {@link Fs} for file writes, so every
 * arm of every platform is testable on this host -- including the two that can never run here. The
 * alternative was three modules with a factory, which would have made the *contract* the thing that is
 * only asserted on one platform.
 *
 * **Windows writes through `reg.exe`, not through a Node registry binding.** There is no registry API in
 * Node and no native module in this tree by decision (§ Phase 5). `reg.exe` is in `%SystemRoot%\System32`
 * on every Windows install, takes `/f` for unattended overwrite, and `REG_SZ` is exactly what
 * `RegistryKey.SetValue(string, string)` writes -- so the value this port produces is byte-identical in
 * kind and data to the one the WPF app produces. `reg query` reads it back, and the probe asserts against
 * that reader rather than against our own writer.
 */

/** Spawn a process and return its exit status and output. Injected so no arm needs a real login. */
export interface Runner {
  run(command: string, args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }>
}

/** The three file operations the mac and linux sinks need. */
export interface Fs {
  writeFile(path: string, contents: string): Promise<void>
  readFile(path: string): Promise<string | null>
  remove(path: string): Promise<void>
}

export type AutoLaunchPlatform = "win32" | "darwin" | "linux"

export interface AutoLaunchOptions {
  readonly platform: AutoLaunchPlatform
  /** The executable to launch. `process.execPath` in production. */
  readonly exePath: string
  /** The user's home directory. Only the mac and linux sinks read it. */
  readonly homeDir: string
  readonly runner: Runner
  readonly fs: Fs
  readonly log?: (level: "info" | "warn" | "error", message: string) => void
}

/**
 * `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`.
 *
 * Backslashes, and `reg.exe` takes the hive as `HKCU\...` -- not the `HKCU:\` form PowerShell uses. Two
 * different syntaxes for one key, and the PowerShell one silently fails under `reg.exe`.
 */
export const WIN_RUN_KEY = "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"

/**
 * The Run value name, and it is `AutoLaunchService.cs:12`'s literal rather than a product-name lookup.
 *
 * See the header: this is what makes a v5 install replace the WPF entry instead of racing it.
 */
export const WIN_RUN_VALUE = "FuzzyClock"

/** The LaunchAgent label and the reverse-DNS id `electron-builder.yml` already uses for `appId`. */
export const DARWIN_LABEL = "org.tabisz.fuzzyclock"

/** The XDG autostart entry's filename. Lower-case by convention on that platform. */
export const LINUX_DESKTOP_FILE = "fuzzyclock.desktop"

/** What the mac and linux sinks write, and where. Exported for the tests and the probe. */
export function darwinPlistPath(homeDir: string): string {
  return `${homeDir}/Library/LaunchAgents/${DARWIN_LABEL}.plist`
}

export function linuxDesktopPath(homeDir: string): string {
  return `${homeDir}/.config/autostart/${LINUX_DESKTOP_FILE}`
}

/**
 * A LaunchAgent that runs at login and is not restarted if the user quits it.
 *
 * `RunAtLoad` is the login trigger; **`KeepAlive` is deliberately absent**, which is the difference between
 * "start this at login" and "keep this running" -- the second would resurrect the app seconds after the
 * user chose Quit from the tray, which no other platform does here and which the C# cannot do at all.
 */
export function darwinPlist(exePath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DARWIN_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${exePath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
`
}

/**
 * An XDG autostart entry.
 *
 * `X-GNOME-Autostart-enabled` is GNOME-specific and harmless elsewhere; without it, GNOME's own
 * "Startup Applications" UI can show the entry as disabled even though the file is present. `Terminal`
 * and `NoDisplay` are both false so the entry is visible to the user in that UI -- a hidden autostart
 * entry the user cannot find is worse than none.
 */
export function linuxDesktopEntry(exePath: string): string {
  return `[Desktop Entry]
Type=Application
Name=FuzzyClock
Comment=Fuzzy-time desktop overlay with a live stats panel
Exec=${exePath}
Terminal=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
`
}

/** The three operations, identical across platforms. `AutoLaunchService.cs`'s whole surface. */
export class AutoLaunch {
  private readonly platform: AutoLaunchPlatform
  private readonly exePath: string
  private readonly homeDir: string
  private readonly runner: Runner
  private readonly fs: Fs
  private readonly log: (level: "info" | "warn" | "error", message: string) => void

  constructor(options: AutoLaunchOptions) {
    this.platform = options.platform
    this.exePath = options.exePath
    this.homeDir = options.homeDir
    this.runner = options.runner
    this.fs = options.fs
    this.log = options.log ?? ((): void => {})
  }

  /** Where this platform's registration lives, for the log and for the probe's read-back. */
  describe(): string {
    switch (this.platform) {
      case "win32":
        return `${WIN_RUN_KEY}\\${WIN_RUN_VALUE} (REG_SZ)`
      case "darwin":
        return darwinPlistPath(this.homeDir)
      case "linux":
        return linuxDesktopPath(this.homeDir)
    }
  }

  /**
   * Register. Overwrites an existing entry rather than failing on it, which is `SetValue`'s behaviour and
   * the one an upgrade needs: the path changes between installs, and a stale path is an autostart entry
   * that launches nothing.
   */
  async enable(): Promise<boolean> {
    switch (this.platform) {
      case "win32": {
        const result = await this.runner.run("reg", [
          "add",
          WIN_RUN_KEY,
          "/v",
          WIN_RUN_VALUE,
          "/t",
          "REG_SZ",
          // `/d` last before `/f`, and the path is passed as ONE argv element -- no quoting is added here.
          // `reg.exe` receives it through the argv array, so a path with spaces needs no escaping, and
          // adding quotes would write them INTO the value, producing a Run entry Windows cannot launch.
          "/d",
          this.exePath,
          "/f",
        ])
        if (result.code !== 0) {
          this.log("error", `auto-launch: reg add failed (${String(result.code)}) — ${result.stderr.trim()}`)
          return false
        }
        this.log("info", `auto-launch: enabled — ${this.describe()} = ${this.exePath}`)
        return true
      }
      case "darwin": {
        await this.fs.writeFile(darwinPlistPath(this.homeDir), darwinPlist(this.exePath))
        this.log("info", `auto-launch: enabled — ${this.describe()}`)
        return true
      }
      case "linux": {
        await this.fs.writeFile(linuxDesktopPath(this.homeDir), linuxDesktopEntry(this.exePath))
        this.log("info", `auto-launch: enabled — ${this.describe()}`)
        return true
      }
    }
  }

  /**
   * Unregister. **A no-op when nothing is registered**, on all three platforms -- the C# passes
   * `throwOnMissingValue: false` and this is that guarantee: `reg delete` exits non-zero for an absent
   * value, and treating that as a failure would make a second Disable report an error the C# does not.
   */
  async disable(): Promise<boolean> {
    switch (this.platform) {
      case "win32": {
        const result = await this.runner.run("reg", ["delete", WIN_RUN_KEY, "/v", WIN_RUN_VALUE, "/f"])
        // Exit 1 is "the value was not there", which is success for this contract. Distinguished in the log
        // only, so a genuinely failed delete is still findable.
        if (result.code !== 0) {
          this.log("info", `auto-launch: disabled — nothing registered (reg delete exit ${String(result.code)})`)
          return true
        }
        this.log("info", `auto-launch: disabled — ${this.describe()} removed`)
        return true
      }
      case "darwin": {
        await this.fs.remove(darwinPlistPath(this.homeDir))
        this.log("info", `auto-launch: disabled — ${this.describe()} removed`)
        return true
      }
      case "linux": {
        await this.fs.remove(linuxDesktopPath(this.homeDir))
        this.log("info", `auto-launch: disabled — ${this.describe()} removed`)
        return true
      }
    }
  }

  /**
   * Is it registered?
   *
   * **Presence only, not path equality**, which is `IsEnabled()`'s own test (`is not null`). A registered
   * entry pointing at an old install is still "enabled" as far as the tick in the tray is concerned, and
   * `enable()` is what corrects the path. Reporting `false` for a stale path would put the UI out of step
   * with what Windows will actually do at the next login.
   */
  async isEnabled(): Promise<boolean> {
    switch (this.platform) {
      case "win32": {
        const result = await this.runner.run("reg", ["query", WIN_RUN_KEY, "/v", WIN_RUN_VALUE])
        // Exit code, not output parsing: `reg query` exits 1 for an absent value and 0 with the value's
        // line on stdout when it is there. The stdout check is a second condition rather than the only one,
        // because a localised `reg.exe` prints its table headers in the user's language and only the VALUE
        // NAME is invariant.
        return result.code === 0 && result.stdout.includes(WIN_RUN_VALUE)
      }
      case "darwin":
        return (await this.fs.readFile(darwinPlistPath(this.homeDir))) !== null
      case "linux":
        return (await this.fs.readFile(linuxDesktopPath(this.homeDir))) !== null
    }
  }
}
