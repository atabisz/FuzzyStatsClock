/**
 * `main/auto-launch.ts` -- launch-at-login over three sinks.
 *
 * Every arm here drives the real code through a fake {@link Runner}/{@link Fs}, which is the whole reason
 * those two are injected: **a login item cannot be verified by a unit test on any platform**. The thing that
 * matters is what happens at the next logon, and no assertion in this file can reach it. So the division of
 * labour is explicit:
 *
 *   - This file pins the **command and the file contents** -- the exact argv `reg.exe` receives, the exact
 *     plist and `.desktop` bytes, and the answer each contract returns for each exit code. That is the part
 *     a reader can check against `AutoLaunchService.cs` and against each platform's documentation.
 *   - `scripts/probe-autolaunch.ts` pins the **read-back through a different reader**: it runs the real
 *     `reg.exe` and then asks `reg query` whether the value is there, under a probe-scoped value name.
 *   - Nothing in either proves the app actually starts at login. That is a manual arm, and it is named as
 *     one in the port plan rather than implied by a green suite.
 *
 * ## The negative controls, which is where the discriminating power is
 *
 * A test that only asserts "enable() calls reg add" passes an implementation that writes the WRONG VALUE
 * NAME, the wrong type, or a quoted path -- three defects that each produce a Run entry that exists and does
 * nothing. So the argv is asserted **element by element in order**, `WIN_RUN_VALUE` is asserted to be the
 * literal `FuzzyClock` (see the module header: that is what makes a v5 install replace the WPF entry rather
 * than race it), and a path with spaces is asserted to arrive UNQUOTED.
 */

import { describe, expect, test } from "bun:test"
import {
  AutoLaunch,
  DARWIN_LABEL,
  LINUX_DESKTOP_FILE,
  WIN_RUN_KEY,
  WIN_RUN_VALUE,
  darwinPlist,
  darwinPlistPath,
  linuxDesktopEntry,
  linuxDesktopPath,
  type AutoLaunchPlatform,
  type Fs,
  type Runner,
} from "../src/main/auto-launch.js"

/** A Windows exe path WITH A SPACE in it, which is what a default install produces. */
const WIN_EXE = "C:\\Program Files\\FuzzyClock\\FuzzyClock.exe"
const POSIX_EXE = "/Applications/FuzzyClock.app/Contents/MacOS/FuzzyClock"
const HOME = "/Users/alex"

interface RunCall {
  readonly command: string
  readonly args: readonly string[]
}

/** Records every spawn and answers with a scripted exit code. */
function fakeRunner(result: { code: number; stdout?: string; stderr?: string } = { code: 0 }): {
  runner: Runner
  calls: RunCall[]
} {
  const calls: RunCall[] = []
  return {
    calls,
    runner: {
      run: (command, args) => {
        calls.push({ command, args: [...args] })
        return Promise.resolve({ code: result.code, stdout: result.stdout ?? "", stderr: result.stderr ?? "" })
      },
    },
  }
}

/** An in-memory filesystem. `readFile` answers null for a missing path, like the real seam. */
function fakeFs(initial: Record<string, string> = {}): { fs: Fs; files: Map<string, string> } {
  const files = new Map<string, string>(Object.entries(initial))
  return {
    files,
    fs: {
      writeFile: (path, contents) => {
        files.set(path, contents)
        return Promise.resolve()
      },
      readFile: (path) => Promise.resolve(files.get(path) ?? null),
      remove: (path) => {
        files.delete(path)
        return Promise.resolve()
      },
    },
  }
}

function make(
  platform: AutoLaunchPlatform,
  parts: { runner?: Runner; fs?: Fs; exePath?: string } = {},
): AutoLaunch {
  return new AutoLaunch({
    platform,
    exePath: parts.exePath ?? (platform === "win32" ? WIN_EXE : POSIX_EXE),
    homeDir: HOME,
    runner: parts.runner ?? fakeRunner().runner,
    fs: parts.fs ?? fakeFs().fs,
  })
}

describe("the Windows Run key", () => {
  test("the value name is the literal FuzzyClock, which is what replaces the WPF entry", () => {
    // Not `productName`, not `app.getName()`. `AutoLaunchService.cs:12` and the live HKCU entry this port
    // has to take over both say `FuzzyClock`; a rename here silently produces two autostart entries.
    expect(WIN_RUN_VALUE).toBe("FuzzyClock")
    expect(WIN_RUN_KEY).toBe("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run")
    // `HKCU\`, never PowerShell's `HKCU:\` -- `reg.exe` rejects the second form.
    expect(WIN_RUN_KEY).not.toContain(":")
  })

  test("enable() runs the exact reg add argv, with the spaced path unquoted", async () => {
    const { runner, calls } = fakeRunner()
    expect(await make("win32", { runner }).enable()).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe("reg")
    // Element by element and in order. A `/t REG_EXPAND_SZ`, a missing `/f` (which makes the write
    // interactive and therefore hung), or a re-ordered `/d` all fail here.
    expect(calls[0]?.args).toEqual([
      "add",
      WIN_RUN_KEY,
      "/v",
      "FuzzyClock",
      "/t",
      "REG_SZ",
      "/d",
      WIN_EXE,
      "/f",
    ])
    // The negative control that matters most: no quotes were added. They would be written INTO the value.
    expect(calls[0]?.args).toContain(WIN_EXE)
    expect(calls[0]?.args.some((arg) => arg.includes('"'))).toBe(false)
  })

  test("enable() reports failure when reg add fails, and does not pretend", async () => {
    const { runner } = fakeRunner({ code: 1, stderr: "ERROR: Access is denied." })
    expect(await make("win32", { runner }).enable()).toBe(false)
  })

  test("disable() deletes the value, and a MISSING value is still success", async () => {
    const ok = fakeRunner()
    expect(await make("win32", { runner: ok.runner }).disable()).toBe(true)
    expect(ok.calls[0]?.args).toEqual(["delete", WIN_RUN_KEY, "/v", "FuzzyClock", "/f"])

    // `throwOnMissingValue: false`. `reg delete` exits 1 for an absent value, and a second Disable must not
    // report an error the C# does not have. This is the arm that makes the exit code NOT the return value.
    const missing = fakeRunner({ code: 1, stderr: "ERROR: The system was unable to find the specified value." })
    expect(await make("win32", { runner: missing.runner }).disable()).toBe(true)
  })

  test("isEnabled() needs BOTH exit 0 and the value name on stdout", async () => {
    const present = fakeRunner({
      code: 0,
      stdout: `\r\nHKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    FuzzyClock    REG_SZ    ${WIN_EXE}\r\n\r\n`,
    })
    expect(await make("win32", { runner: present.runner }).isEnabled()).toBe(true)
    expect(present.calls[0]?.args).toEqual(["query", WIN_RUN_KEY, "/v", "FuzzyClock"])

    // Absent: `reg query` exits 1 and prints its error on stderr.
    const absent = fakeRunner({ code: 1, stderr: "ERROR: The system was unable to find the specified value" })
    expect(await make("win32", { runner: absent.runner }).isEnabled()).toBe(false)

    // The negative control for the stdout half: exit 0 with someone else's value listed. Reachable if the
    // `/v` argument were ever dropped, which turns the query into "dump the whole key" -- and every machine
    // has something in Run, so an exit-code-only test would report `true` on a machine with no FuzzyClock
    // entry at all.
    const otherApp = fakeRunner({ code: 0, stdout: "    OneDrive    REG_SZ    C:\\OneDrive.exe\r\n" })
    expect(await make("win32", { runner: otherApp.runner }).isEnabled()).toBe(false)
  })

  test("describe() names the key, the value and the type", () => {
    expect(make("win32").describe()).toBe(`${WIN_RUN_KEY}\\FuzzyClock (REG_SZ)`)
  })
})

describe("the macOS LaunchAgent", () => {
  test("the path is ~/Library/LaunchAgents/<label>.plist", () => {
    expect(darwinPlistPath(HOME)).toBe(`${HOME}/Library/LaunchAgents/${DARWIN_LABEL}.plist`)
    // The reverse-DNS id `electron-builder.yml` uses for `appId`, so the LaunchAgent and the bundle agree.
    expect(DARWIN_LABEL).toBe("org.tabisz.fuzzyclock")
  })

  test("the plist has RunAtLoad and DELIBERATELY no KeepAlive", () => {
    const plist = darwinPlist(POSIX_EXE)
    expect(plist).toContain("<key>RunAtLoad</key>")
    expect(plist).toContain(`<string>${POSIX_EXE}</string>`)
    expect(plist).toContain(`<string>${DARWIN_LABEL}</string>`)
    // The arm with real discriminating power. `KeepAlive` is one line to add and it would resurrect the app
    // seconds after the user chose Quit from the tray -- a behaviour no other platform here has and one the
    // C# cannot express at all. Asserted absent so adding it has to be a deliberate act.
    expect(plist).not.toContain("KeepAlive")
    // Well-formed enough to be parsed by `launchctl`: the declaration, the DOCTYPE and a closing tag.
    expect(plist.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(plist).toContain("<!DOCTYPE plist PUBLIC")
    expect(plist.trimEnd().endsWith("</plist>")).toBe(true)
  })

  test("enable() writes the plist, disable() removes it, isEnabled() reads presence", async () => {
    const { fs, files } = fakeFs()
    const service = make("darwin", { fs })

    expect(await service.isEnabled()).toBe(false)
    expect(await service.enable()).toBe(true)
    expect(files.get(darwinPlistPath(HOME))).toBe(darwinPlist(POSIX_EXE))
    expect(await service.isEnabled()).toBe(true)

    expect(await service.disable()).toBe(true)
    expect(files.has(darwinPlistPath(HOME))).toBe(false)
    expect(await service.isEnabled()).toBe(false)
    // A second disable is a no-op, matching the Windows arm above and `throwOnMissingValue: false`.
    expect(await service.disable()).toBe(true)
  })

  test("no process is spawned on darwin -- the sink is a file", async () => {
    const { runner, calls } = fakeRunner()
    const { fs } = fakeFs()
    await make("darwin", { runner, fs }).enable()
    // `launchctl load` is deliberately NOT run: a LaunchAgent with `RunAtLoad` is picked up at the next
    // login, and loading it here would start a second copy of the app the moment the user ticked the box.
    expect(calls).toHaveLength(0)
  })
})

describe("the Linux XDG autostart entry", () => {
  test("the path is ~/.config/autostart/fuzzyclock.desktop", () => {
    expect(linuxDesktopPath(HOME)).toBe(`${HOME}/.config/autostart/${LINUX_DESKTOP_FILE}`)
    expect(LINUX_DESKTOP_FILE).toBe("fuzzyclock.desktop")
  })

  test("the entry is a visible, non-terminal Application", () => {
    const entry = linuxDesktopEntry(POSIX_EXE)
    // The group header is mandatory and must be first, per the Desktop Entry Specification.
    expect(entry.startsWith("[Desktop Entry]\n")).toBe(true)
    expect(entry).toContain("Type=Application")
    expect(entry).toContain(`Exec=${POSIX_EXE}`)
    // `Terminal=false` or the desktop opens a terminal window to host it. `NoDisplay=false` so the entry is
    // visible in GNOME's Startup Applications -- an autostart the user cannot find is worse than none.
    expect(entry).toContain("Terminal=false")
    expect(entry).toContain("NoDisplay=false")
    expect(entry).toContain("X-GNOME-Autostart-enabled=true")
  })

  test("enable() / disable() / isEnabled() over the file seam", async () => {
    const { fs, files } = fakeFs()
    const service = make("linux", { fs })

    expect(await service.isEnabled()).toBe(false)
    expect(await service.enable()).toBe(true)
    expect(files.get(linuxDesktopPath(HOME))).toBe(linuxDesktopEntry(POSIX_EXE))
    expect(await service.isEnabled()).toBe(true)
    expect(await service.disable()).toBe(true)
    expect(await service.isEnabled()).toBe(false)
  })
})

describe("the contract is identical across the three sinks", () => {
  // The point of one class over three: the same call sequence must give the same answers everywhere, or the
  // tray tick means something different per platform. Driven as a table so a fourth platform inherits it.
  const platforms: readonly AutoLaunchPlatform[] = ["win32", "darwin", "linux"]

  test("enable() then isEnabled() is true, disable() then isEnabled() is false, on all three", async () => {
    for (const platform of platforms) {
      const { fs } = fakeFs()
      // The Windows sink is stateless in the fake, so its `reg query` has to be scripted to agree with the
      // `reg add` that preceded it. Stated rather than hidden: this arm proves the CONTRACT's shape on
      // win32, and `probe-autolaunch.ts` is what proves the registry actually round-trips.
      const enabled = fakeRunner({ code: 0, stdout: `    ${WIN_RUN_VALUE}    REG_SZ    ${WIN_EXE}` })
      const service = make(platform, { fs, runner: enabled.runner })
      expect(await service.enable()).toBe(true)
      expect(await service.isEnabled()).toBe(true)
    }

    for (const platform of platforms) {
      const { fs } = fakeFs()
      const absent = fakeRunner({ code: 1 })
      const service = make(platform, { fs, runner: absent.runner })
      expect(await service.disable()).toBe(true)
      expect(await service.isEnabled()).toBe(false)
    }
  })

  test("describe() answers a non-empty location on all three", () => {
    for (const platform of platforms) {
      expect(make(platform).describe().length).toBeGreaterThan(0)
    }
  })

  test("enable() is idempotent -- registering twice is not two entries", async () => {
    // `reg add /f` overwrites and the file sinks write the same path, so this holds by construction on all
    // three. Asserted because the failure mode differs per platform and is invisible on two of them: a
    // second Run VALUE cannot exist under the same name, but an implementation that appended a suffix
    // (`FuzzyClock`, `FuzzyClock (1)`) would launch the app twice at every login.
    const { fs, files } = fakeFs()
    const posix = make("linux", { fs })
    await posix.enable()
    await posix.enable()
    expect(files.size).toBe(1)

    const win = fakeRunner()
    await make("win32", { runner: win.runner }).enable()
    await make("win32", { runner: win.runner }).enable()
    expect(win.calls[0]?.args).toEqual(win.calls[1]?.args)
  })
})
