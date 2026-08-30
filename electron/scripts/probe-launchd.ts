/**
 * ISC-30, the darwin half — does **real launchd** accept the plist, and does it actually launch anything?
 *
 * `probe-autolaunch.ts`'s A9 writes the mac sink for real, but against a `mkdtemp` HOME on a Windows box
 * with a runner that throws on spawn. Its own header says what that leaves open: *"whether launchd and
 * GNOME then honour the file needs a real host, and that stays open."* This is that host for darwin. The
 * linux half stays open, and this file does not pretend otherwise.
 *
 * Three questions, and only the first two were ever answerable off-platform:
 *
 *   1. Do the bytes land at the computed path? — A9 already had this.
 *   2. Is the plist *well-formed*, by Apple's own parser rather than ours? — A2/A3 here, via `plutil`.
 *   3. **Does launchd register it, and does `RunAtLoad` actually spawn the program?** — A5/A6, and A6 is
 *      the one no amount of file-content assertion can reach.
 *
 * ## The interlock
 *
 * `~/Library/LaunchAgents` on this machine is not empty. It holds six agents that are Alex's — two Google
 * updater agents, a Google keystone xpcservice, `com.interceptor.daemon`, `com.pai.pulse` and
 * `com.pai.voice-server`. Booting one of those out, or leaving this probe's own agent behind, would be a
 * probe that damages the machine it measures.
 *
 * So the file census is taken **before** anything is written, asserted to not already contain our label,
 * and re-taken at the end: A9 fails unless every pre-existing file is present with an unchanged sha256 and
 * ours is gone. The bootout is in a `finally`, so it runs even if an arm throws.
 *
 * ## The one substitution, stated rather than buried
 *
 * `ProgramArguments` points at a **marker-writing shell script in a temp dir**, not at FuzzyClock's real
 * binary. Same shape as `probe-update.ts` substituting its URL: launching the actual overlay onto Alex's
 * desktop from a probe is a side effect on his session, and a script that writes a file and exits proves
 * the launch just as well — better, since a marker file is checkable and a window on a screen is not.
 *
 * What that costs is worth being plain about: this proves *launchd spawns what the plist names*. It does
 * not prove FuzzyClock's binary starts cleanly when spawned that way, which needs a real install and a
 * real logout/login, and stays a manual arm in the port plan.
 *
 * ## Why A7 exists
 *
 * A6 sees a marker file after `launchctl bootstrap`. On its own that is not evidence for `RunAtLoad` — a
 * bootstrap might spawn regardless, and the arm would read green while measuring nothing. So A7 bootstraps
 * a second agent, under a different label, whose plist is **identical but for the omitted `RunAtLoad`**,
 * and requires that one to produce no marker. That is the mutation that gives A6 its meaning.
 *
 *     bun run probe:launchd   # darwin only; refuses to run elsewhere
 */

import { execFile } from "node:child_process"
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AutoLaunch, DARWIN_LABEL, darwinPlist, darwinPlistPath } from "../src/main/auto-launch.js"
import { fileSeam, processRunner } from "../src/main/seams.js"

if (process.platform !== "darwin") {
  console.error(
    `probe:launchd measures real launchd and only runs on darwin -- this is ${process.platform}.\n` +
      "The off-platform half of the same claim is probe-autolaunch.ts's A9.",
  )
  process.exit(2)
}

const HOME = process.env["HOME"] ?? ""
if (HOME === "") {
  console.error("HOME is unset, so there is no LaunchAgents directory to compute. Refusing to guess.")
  process.exit(2)
}

const AGENTS_DIR = `${HOME}/Library/LaunchAgents`
/** The second label, for A7's no-`RunAtLoad` control. Never written by the product. */
const CONTROL_LABEL = `${DARWIN_LABEL}.probe-norunatload`
const CONTROL_PLIST = `${AGENTS_DIR}/${CONTROL_LABEL}.plist`

const results: { name: string; verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string }[] = []
function record(name: string, verdict: "PASS" | "FAIL" | "INCONCLUSIVE", detail: string): void {
  results.push({ name, verdict, detail })
  console.log(`  [${verdict}] ${name} -- ${detail}`)
}

/** Run a command and return its status. Never throws on a non-zero exit; launchctl uses those as answers. */
async function run(command: string, args: readonly string[]): Promise<{ code: number; out: string }> {
  return await new Promise((resolve) => {
    execFile(command, [...args], { encoding: "utf8" }, (error, stdout, stderr) => {
      const code = error === null ? 0 : ((error as { code?: number }).code ?? 1)
      resolve({ code, out: `${stdout}${stderr}` })
    })
  })
}

async function sha256(path: string): Promise<string> {
  const bytes = await readFile(path)
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

/** Every file in LaunchAgents, name → sha256. The thing A9 compares against. */
async function census(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  let names: string[]
  try {
    names = await readdir(AGENTS_DIR)
  } catch {
    return out
  }
  for (const name of names.sort()) {
    const full = `${AGENTS_DIR}/${name}`
    if (!(await stat(full)).isFile()) continue
    out.set(name, await sha256(full))
  }
  return out
}

const uid = process.getuid?.() ?? -1
const domain = `gui/${String(uid)}`
const scratch = await mkdtemp(join(tmpdir(), "fzc-launchd-"))
const markerPath = `${scratch}/launched.marker`
const controlMarkerPath = `${scratch}/control.marker`
const scriptPath = `${scratch}/marker.sh`
const controlScriptPath = `${scratch}/control.sh`

console.log(`probe:launchd -- real launchd, domain ${domain}`)
console.log(`  agents dir : ${AGENTS_DIR}`)
console.log(`  scratch    : ${scratch}\n`)

const before = await census()

try {
  // ── A1 — the environment is what the interlock assumes ────────────────────────────────────────────
  {
    const ours = before.has(`${DARWIN_LABEL}.plist`)
    const control = before.has(`${CONTROL_LABEL}.plist`)
    const printed = await run("launchctl", ["print", `${domain}/${DARWIN_LABEL}`])
    // A live registration with no file would mean bootout has something to remove that the census cannot
    // see, so both readers are checked. `launchctl print` exits non-zero for an unknown label.
    record(
      "A1 our label is absent, and Alex's agents are present",
      !ours && !control && printed.code !== 0 ? "PASS" : "FAIL",
      `${String(before.size)} pre-existing agents (${[...before.keys()].join(", ")}); ` +
        `our plist present=${String(ours)}, control present=${String(control)}, ` +
        `launchctl print exit=${String(printed.code)} (non-zero means unregistered)`,
    )
    if (ours || control || printed.code === 0) {
      console.error("\nRefusing to continue: the label is already in use, so teardown could remove someone else's.")
      process.exit(1)
    }
  }

  // The marker script stands in for FuzzyClock's binary. See the header on why.
  await writeFile(scriptPath, `#!/bin/sh\ndate +%s > "${markerPath}"\n`, { mode: 0o755 })
  await writeFile(controlScriptPath, `#!/bin/sh\ndate +%s > "${controlMarkerPath}"\n`, { mode: 0o755 })

  const auto = new AutoLaunch({
    platform: "darwin",
    exePath: scriptPath,
    homeDir: HOME,
    runner: processRunner,
    fs: fileSeam,
  })

  // ── A2 — the production enable() writes where describe() says, and Apple's parser accepts it ──────
  {
    const enabled = await auto.enable()
    const path = darwinPlistPath(HOME)
    const described = auto.describe()
    const lint = await run("plutil", ["-lint", path])
    record(
      "A2 enable() writes a plist plutil calls valid",
      enabled && described === path && lint.code === 0 ? "PASS" : "FAIL",
      `enable()=${String(enabled)}, describe()=${described}, plutil -lint exit=${String(lint.code)}: ` +
        lint.out.trim(),
    )
  }

  // ── A3 — the keys launchd will read, through plutil rather than our own string ────────────────────
  {
    const printed = await run("plutil", ["-p", darwinPlistPath(HOME)])
    const has = (needle: string): boolean => printed.out.includes(needle)
    const problems: string[] = []
    if (!has(`"Label" => "${DARWIN_LABEL}"`)) problems.push("Label")
    if (!has("\"RunAtLoad\" => true")) problems.push("RunAtLoad true")
    if (!has("\"ProcessType\" => \"Interactive\"")) problems.push("ProcessType Interactive")
    if (!printed.out.includes(scriptPath)) problems.push("ProgramArguments[0] is the exe path")
    // The absence is as load-bearing as the presences: KeepAlive would resurrect the app after a Quit.
    if (has("KeepAlive")) problems.push("KeepAlive must be absent")
    record(
      "A3 the parsed keys are the four we intend, and KeepAlive is absent",
      problems.length === 0 ? "PASS" : "FAIL",
      problems.length === 0
        ? "Label, RunAtLoad=true, ProcessType=Interactive, ProgramArguments[0]=exePath; no KeepAlive"
        : `missing or wrong: ${problems.join(", ")}`,
    )
  }

  // ── A4 — isEnabled() reads presence, both ways ─────────────────────────────────────────────────────
  {
    const on = await auto.isEnabled()
    await rm(darwinPlistPath(HOME))
    const off = await auto.isEnabled()
    await auto.enable() // put it back for A5
    const onAgain = await auto.isEnabled()
    record(
      "A4 isEnabled() tracks the file, in both directions",
      on && !off && onAgain ? "PASS" : "FAIL",
      `after enable=${String(on)}, after unlink=${String(off)}, after re-enable=${String(onAgain)}`,
    )
  }

  // ── A5 — real launchd accepts it, and reads back the same label ───────────────────────────────────
  {
    const boot = await run("launchctl", ["bootstrap", domain, darwinPlistPath(HOME)])
    const printed = await run("launchctl", ["print", `${domain}/${DARWIN_LABEL}`])
    // Reported, not asserted. `launchctl print` lists the flag as a bare token in a pipe-delimited
    // `properties = inetd|runatload|...` line rather than as `runatload = 1`, and which tokens appear at all
    // varies by macOS version and by whether the job has already run. So the behavioural proof that
    // RunAtLoad is honoured is A6 with A7 as its control, and this field is a breadcrumb for a human
    // reading the transcript. An earlier draft matched on `=` and printed `false` while A6 was green --
    // an informational field contradicting a load-bearing one is worse than no field.
    const runAtLoad = /\brunatload\b/i.test(printed.out)
    record(
      "A5 launchctl bootstrap succeeds and print shows the agent",
      boot.code === 0 && printed.code === 0 && printed.out.includes(DARWIN_LABEL) ? "PASS" : "FAIL",
      `bootstrap exit=${String(boot.code)}${boot.out.trim() === "" ? "" : ` (${boot.out.trim()})`}, ` +
        `print exit=${String(printed.code)}, label found=${String(printed.out.includes(DARWIN_LABEL))}, ` +
        `runatload token in print=${String(runAtLoad)} (informational -- A6/A7 are the proof)`,
    )
  }

  // ── A6 — RunAtLoad actually spawned the program ────────────────────────────────────────────────────
  {
    // Polled rather than slept-then-checked: launchd's spawn is asynchronous, and a fixed sleep either
    // wastes the whole budget or reports a false negative on a busy machine.
    let marker: string | null = null
    for (let attempt = 0; attempt < 40 && marker === null; attempt++) {
      marker = await fileSeam.readFile(markerPath)
      if (marker === null) await Bun.sleep(100)
    }
    record(
      "A6 the program launchd was given actually ran",
      marker !== null ? "PASS" : "FAIL",
      marker === null
        ? "no marker after 4s of polling -- launchd registered the agent but did not spawn it"
        : `marker written by the spawned process, epoch ${marker.trim()}`,
    )
  }

  // ── A7 — the control: without RunAtLoad, nothing spawns ───────────────────────────────────────────
  {
    // Identical plist but for the one key, so a green A6 cannot be bootstrap's side effect.
    const stripped = darwinPlist(controlScriptPath)
      .replace(`<string>${DARWIN_LABEL}</string>`, `<string>${CONTROL_LABEL}</string>`)
      .replace("  <key>RunAtLoad</key>\n  <true/>\n", "")
    await writeFile(CONTROL_PLIST, stripped)
    const lint = await run("plutil", ["-lint", CONTROL_PLIST])
    const boot = await run("launchctl", ["bootstrap", domain, CONTROL_PLIST])
    let marker: string | null = null
    for (let attempt = 0; attempt < 40 && marker === null; attempt++) {
      marker = await fileSeam.readFile(controlMarkerPath)
      if (marker === null) await Bun.sleep(100)
    }
    const registered = (await run("launchctl", ["print", `${domain}/${CONTROL_LABEL}`])).code === 0
    record(
      "A7 control: the same plist without RunAtLoad registers but does NOT spawn",
      lint.code === 0 && boot.code === 0 && registered && marker === null ? "PASS" : "FAIL",
      `lint exit=${String(lint.code)}, bootstrap exit=${String(boot.code)}, registered=${String(registered)}, ` +
        `marker=${marker === null ? "absent (correct)" : `PRESENT -- A6 measures bootstrap, not RunAtLoad`}`,
    )
  }

  // ── A8 — disable() removes the file, and bootout deregisters ───────────────────────────────────────
  {
    const disabled = await auto.disable()
    const stillEnabled = await auto.isEnabled()
    const out = await run("launchctl", ["bootout", `${domain}/${DARWIN_LABEL}`])
    const printed = await run("launchctl", ["print", `${domain}/${DARWIN_LABEL}`])
    record(
      "A8 disable() unregisters the file and bootout unregisters the agent",
      disabled && !stillEnabled && printed.code !== 0 ? "PASS" : "FAIL",
      `disable()=${String(disabled)}, isEnabled() after=${String(stillEnabled)}, ` +
        `bootout exit=${String(out.code)}, print exit=${String(printed.code)} (non-zero means gone)`,
    )
  }
} finally {
  // Teardown runs even on a throw: a leaked LaunchAgent would start on Alex's next login.
  await run("launchctl", ["bootout", `${domain}/${DARWIN_LABEL}`])
  await run("launchctl", ["bootout", `${domain}/${CONTROL_LABEL}`])
  await rm(darwinPlistPath(HOME), { force: true })
  await rm(CONTROL_PLIST, { force: true })
  await rm(scratch, { recursive: true, force: true })
}

// ── A9 — the machine is exactly as it was found ──────────────────────────────────────────────────────
{
  const after = await census()
  const missing = [...before.keys()].filter((name) => !after.has(name))
  const changed = [...before.entries()].filter(([name, hash]) => after.get(name) !== undefined && after.get(name) !== hash)
  const added = [...after.keys()].filter((name) => !before.has(name))
  const printed = await run("launchctl", ["print", `${domain}/${DARWIN_LABEL}`])
  const controlPrinted = await run("launchctl", ["print", `${domain}/${CONTROL_LABEL}`])
  record(
    "A9 teardown left Alex's agents untouched and ours gone",
    missing.length === 0 && changed.length === 0 && added.length === 0 && printed.code !== 0 && controlPrinted.code !== 0
      ? "PASS"
      : "FAIL",
    `${String(before.size)} before / ${String(after.size)} after; missing=[${missing.join(", ")}], ` +
      `changed=[${changed.map(([n]) => n).join(", ")}], added=[${added.join(", ")}]; ` +
      `our label print exit=${String(printed.code)}, control print exit=${String(controlPrinted.code)}`,
  )
}

const passed = results.filter((r) => r.verdict === "PASS").length
const failed = results.filter((r) => r.verdict === "FAIL").length
const inconclusive = results.filter((r) => r.verdict === "INCONCLUSIVE").length
console.log(`\n${String(passed)} passed / ${String(failed)} failed / ${String(inconclusive)} inconclusive`)
console.log(
  "\nThis buys the darwin sink against real launchd: the plist parses, registers, and RunAtLoad spawns the\n" +
    "program named in it -- with A7 as the control that says A6 measures RunAtLoad rather than bootstrap.\n" +
    "Two things it deliberately does NOT buy. The program spawned is a marker script, not FuzzyClock, so\n" +
    "'the app starts cleanly at login' still needs a real install and a real logout. And the linux sink is\n" +
    "untouched here -- probe-autolaunch.ts A9 writes its file on Windows, and no host has yet had GNOME\n" +
    "read it.",
)
process.exit(failed > 0 ? 1 : 0)
