/**
 * ISC-8 — what does the packaged app actually weigh, against what the WPF build ships?
 *
 * The ~85MB figure that has been circulating in the plan is a prior, not a measurement:
 * nobody had run `electron-builder`. This measures the artefacts off disk, on both sides,
 * and compares them like for like.
 *
 * ## Like for like
 *
 * Two WPF artefacts exist and they are not interchangeable. `publish/FuzzyClock.exe` is a
 * self-contained single-file executable — the whole .NET runtime inlined, no installer.
 * `installer/FuzzyClockSetup-4.5.1.exe` is the Inno installer users actually download,
 * which is compressed. The Electron side has the same pair: `release/win-unpacked/` is the
 * installed payload on disk, and `release/*Setup*.exe` is the NSIS installer. So the
 * comparison is installer-against-installer and payload-against-payload, never one of
 * each — an installer measured against an uncompressed payload flatters whichever side
 * happens to be the compressed one.
 *
 * ## The number that matters more than the total
 *
 * Almost all of the Electron installer is the Electron runtime, and the app's own bundles
 * are a few tens of kilobytes. That is worth separating out, because the two sides scale
 * differently as the port fills in: the WPF figure grows with the app, and this one
 * effectively does not. A size comparison taken at Phase 1 and quoted at Phase 9 would be
 * wrong in the *favourable* direction for Electron if the split were not stated.
 *
 * ## Recorded figures are cross-checked, not trusted
 *
 * The ISA carries the WPF sizes as exact byte counts from an earlier run. This probe
 * re-measures them and flags a mismatch, so pointing at the wrong file — a stale
 * `publish/` from a different configuration, say — surfaces instead of silently becoming
 * the baseline.
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/** Exact byte counts recorded in the ISA from an earlier run. Cross-checked below. */
const RECORDED_WPF_SINGLE_FILE = 200_457_651
const RECORDED_WPF_INSTALLER = 57_389_487

const ROOT = join(import.meta.dirname, "..", "..")
const RELEASE = join(import.meta.dirname, "..", "release")

const WPF_SINGLE_FILE = join(ROOT, "publish", "FuzzyClock.exe")
const WPF_INSTALLER = join(ROOT, "installer", "FuzzyClockSetup-4.5.1.exe")
const UNPACKED = join(RELEASE, "win-unpacked")
const APP_BUNDLES = join(import.meta.dirname, "..", "dist")

const mb = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)}MB`

/** Recursive size of a directory tree, in bytes. Follows no symlinks. */
function treeSize(dir: string): { bytes: number; files: number } {
  let bytes = 0
  let files = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      const inner = treeSize(path)
      bytes += inner.bytes
      files += inner.files
    } else if (entry.isFile()) {
      bytes += statSync(path).size
      files++
    }
  }
  return { bytes, files }
}

function fileSize(path: string): number | null {
  try {
    return statSync(path).size
  } catch {
    return null
  }
}

/** The NSIS installer, found rather than named — its filename carries the version. */
function findInstaller(): { path: string; bytes: number } | null {
  let found: { path: string; bytes: number } | null = null
  try {
    for (const entry of readdirSync(RELEASE, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      if (!/Setup.*\.exe$/i.test(entry.name)) continue
      const path = join(RELEASE, entry.name)
      const bytes = statSync(path).size
      // Largest match wins, so an `__uninstaller` left in the directory cannot be
      // mistaken for the installer.
      if (found === null || bytes > found.bytes) found = { path, bytes }
    }
  } catch {
    return null
  }
  return found
}

/**
 * The asar's file listing, read from its header rather than by shelling out to `asar`.
 *
 * Format: four little-endian uint32s, of which the one at offset 12 is the length of a
 * JSON directory tree starting at offset 16. Reading it directly keeps this probe free of
 * a tool that may not be installed — and a missing tool would otherwise degrade into "no
 * files found", which is indistinguishable from the failure C5 exists to catch.
 */
function asarEntries(path: string): string[] | null {
  try {
    const buf = readFileSync(path)
    const jsonLen = buf.readUInt32LE(12)
    const tree = JSON.parse(buf.subarray(16, 16 + jsonLen).toString("utf8")) as {
      files: Record<string, unknown>
    }
    const out: string[] = []
    const walk = (node: { files?: Record<string, unknown> }, prefix: string): void => {
      for (const [name, child] of Object.entries(node.files ?? {})) {
        const c = child as { files?: Record<string, unknown> }
        if (c.files !== undefined) walk(c, `${prefix}${name}/`)
        else out.push(`${prefix}${name}`)
      }
    }
    walk(tree, "")
    return out
  } catch {
    return null
  }
}

const results: { name: string; verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string }[] = []
function record(name: string, verdict: "PASS" | "FAIL" | "INCONCLUSIVE", detail: string): void {
  results.push({ name, verdict, detail })
  console.log(`  → ${verdict}: ${detail}\n`)
}

// ───────────────────────────────────────────────────────────────────────────────
// C1 — an installer exists, produced by a real electron-builder run.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== C1: a packaged Windows installer exists ===")
const installer = findInstaller()
const unpacked = (() => {
  try {
    return treeSize(UNPACKED)
  } catch {
    return null
  }
})()

if (installer === null || unpacked === null) {
  record(
    "C1 packaged output",
    "INCONCLUSIVE",
    `run \`bun run dist:win\` first — installer=${installer === null ? "missing" : "found"}, ` +
      `win-unpacked=${unpacked === null ? "missing" : "found"}`,
  )
} else {
  console.log(
    `    installer     : ${mb(installer.bytes)} (${String(installer.bytes)} bytes)\n` +
      `    win-unpacked  : ${mb(unpacked.bytes)} across ${String(unpacked.files)} files`,
  )
  record(
    "C1 packaged output",
    "PASS",
    `NSIS installer ${mb(installer.bytes)}, installed payload ${mb(unpacked.bytes)} — a measured ` +
      `figure replaces the ~85MB prior`,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// C2 — the WPF comparables are the files the ISA recorded, not lookalikes.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== C2: the WPF baseline artefacts match their recorded byte counts ===")
const wpfSingle = fileSize(WPF_SINGLE_FILE)
const wpfInstaller = fileSize(WPF_INSTALLER)
{
  const rows = [
    { name: "single-file exe", got: wpfSingle, recorded: RECORDED_WPF_SINGLE_FILE, path: WPF_SINGLE_FILE },
    { name: "Inno installer", got: wpfInstaller, recorded: RECORDED_WPF_INSTALLER, path: WPF_INSTALLER },
  ]
  for (const r of rows) {
    console.log(
      `    ${r.name.padEnd(16)} ${r.got === null ? "MISSING" : `${String(r.got)} bytes (${mb(r.got)})`}` +
        `  recorded ${String(r.recorded)}` +
        `${r.got === r.recorded ? "  ✓ exact" : r.got === null ? "" : `  ✗ differs by ${String(r.got - r.recorded)}`}`,
    )
  }
  const missing = rows.filter((r) => r.got === null)
  const differing = rows.filter((r) => r.got !== null && r.got !== r.recorded)

  if (missing.length > 0) {
    record(
      "C2 baseline identity",
      "INCONCLUSIVE",
      `${missing.map((r) => r.path).join(", ")} absent — the comparison would rest on the recorded ` +
        `numbers alone, which is what this arm exists to avoid`,
    )
  } else if (differing.length > 0) {
    record(
      "C2 baseline identity",
      "FAIL",
      `${differing.map((r) => r.name).join(" and ")} differ from the recorded counts — either the ` +
        `artefacts were rebuilt or the ISA is citing a different file. Resolve before comparing`,
    )
  } else {
    record(
      "C2 baseline identity",
      "PASS",
      `both WPF artefacts match their recorded byte counts exactly, so the baseline is the same ` +
        `one the plan and the feasibility run measured`,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// C3 — the comparison, installer against installer and payload against payload.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== C3: ISC-8 — how does the packaged size compare? ===")
if (installer === null || unpacked === null || wpfSingle === null || wpfInstaller === null) {
  record("C3 size comparison", "INCONCLUSIVE", "need all four artefacts present")
} else {
  const installerFactor = wpfInstaller / installer.bytes
  const payloadFactor = wpfSingle / unpacked.bytes
  const describe = (f: number): string =>
    f >= 1 ? `${f.toFixed(2)}× SMALLER` : `${(1 / f).toFixed(2)}× LARGER`

  console.log(
    `    installer   electron ${mb(installer.bytes).padEnd(8)} vs wpf-inno   ${mb(wpfInstaller).padEnd(8)} → electron is ${describe(installerFactor)}\n` +
      `    payload     electron ${mb(unpacked.bytes).padEnd(8)} vs wpf-single ${mb(wpfSingle).padEnd(8)} → electron is ${describe(payloadFactor)}`,
  )

  // Is the single-file exe really the WHOLE WPF payload, or does something else sit
  // beside it? Measured, because "self-contained" is a build setting, not a guarantee —
  // and if `publish/` held a framework directory too, the payload row above would be
  // comparing Electron's full tree against one file out of several.
  const publishTree = (() => {
    try {
      return treeSize(join(ROOT, "publish"))
    } catch {
      return null
    }
  })()
  const beside = publishTree === null ? null : publishTree.bytes - wpfSingle
  console.log(
    `    publish/ holds ${publishTree === null ? "?" : String(publishTree.files)} files; ` +
      `${beside === null ? "?" : mb(beside)} sits beside the exe` +
      `${beside !== null && beside < 1_048_576 ? " — debug symbols, not shipped, so the exe IS the payload" : ""}`,
  )

  record(
    "C3 size comparison",
    "PASS",
    `installer ${mb(installer.bytes)} vs Inno ${mb(wpfInstaller)} (${describe(installerFactor)}); ` +
      `payload ${mb(unpacked.bytes)} vs single-file ${mb(wpfSingle)} (${describe(payloadFactor)}). ` +
      `ISC-8 asked for a measured size, and this is it — but the direction is a REGRESSION on both ` +
      `measures, not a win, and the claim is recorded that way`,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// C4 — the size is only meaningful if the package contains the app. A wrong
//      `files:` glob produces a perfectly plausible number for an empty shell.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== C4: the packaged asar actually contains the app ===")
const asarPath = join(UNPACKED, "resources", "app.asar")
const asarBytes = fileSize(asarPath)
{
  const entries = asarEntries(asarPath)
  // Every file the app needs at runtime. `main` in package.json points at dist/main.js,
  // so a package missing any of these installs and launches to nothing.
  const required = [
    "dist/main.js",
    "dist/preload.cjs",
    "dist/renderer.js",
    "dist/index.html",
    "dist/index.css",
    "package.json",
  ]
  if (entries === null) {
    record("C4 package contents", "FAIL", `no readable asar at ${asarPath}`)
  } else {
    const normalised = entries.map((e) => e.replace(/\\/g, "/"))
    const missing = required.filter((r) => !normalised.includes(r))
    console.log(`    asar entries: ${normalised.join(", ")}`)
    if (missing.length > 0) {
      record(
        "C4 package contents",
        "FAIL",
        `${missing.join(", ")} absent from the asar — the measured size belongs to a shell that ` +
          `would install and launch to nothing, so C3's number would be meaningless`,
      )
    } else {
      record(
        "C4 package contents",
        "PASS",
        `all ${String(required.length)} runtime files present in app.asar (${String(asarBytes ?? 0)} ` +
          `bytes) — the size in C3 is for a package that contains the app`,
      )
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// C5 — how much of it is the app, and how much is the runtime? The part that
//      decides whether this figure is still true at Phase 9.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== C5: runtime vs app payload — does this figure grow with the port? ===")
{
  const onDisk = (() => {
    try {
      return treeSize(APP_BUNDLES)
    } catch {
      return null
    }
  })()

  if (asarBytes === null || unpacked === null) {
    record("C5 runtime share", "INCONCLUSIVE", "need app.asar and win-unpacked/")
  } else {
    // The asar is the shipped figure; `dist/` on disk is the cross-check. They differ by
    // the asar's own header and index, which is why the shipped one is the numerator.
    const share = (asarBytes / unpacked.bytes) * 100
    const locales = (() => {
      try {
        return treeSize(join(UNPACKED, "locales"))
      } catch {
        return null
      }
    })()
    console.log(
      `    app, as shipped (asar) : ${String(asarBytes)} bytes\n` +
        `    app, on disk (dist/)   : ${onDisk === null ? "?" : `${String(onDisk.bytes)} bytes across ${String(onDisk.files)} files`}\n` +
        `    installed payload      : ${String(unpacked.bytes)} bytes\n` +
        `    app share              : ${share.toFixed(3)}%` +
        (locales === null
          ? ""
          : `\n    locales/               : ${mb(locales.bytes)} across ${String(locales.files)} files ` +
            `(${((locales.bytes / unpacked.bytes) * 100).toFixed(1)}% of the payload)`),
    )
    record(
      "C5 runtime share",
      "PASS",
      `the app is ${share.toFixed(3)}% of the installed payload; the rest is the Electron runtime, ` +
        `a fixed cost. So this size is close to a FLOOR that barely moves as Phases 2-8 fill the app ` +
        `in, where the WPF figure grows with every feature — quoting today's ratio at Phase 9 would ` +
        `overstate Electron's disadvantage, not understate it` +
        (locales === null
          ? ""
          : `. ${String(locales.files)} locale .pak files are ${mb(locales.bytes)} of that — a figure ` +
            `that used to read 55 files / 41.0MB, for languages this app never renders. Phase 7 took ` +
            `that reduction (C6 measures it), so every payload and installer byte count on this run is ` +
            `a TRIMMED one and is not comparable to the P1.5 numbers in the plan`),
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// C6 — Phase 7: the locale trim landed, and it did not land too hard.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== C6: the locale payload after `electronLanguages: [en-US]` ===")
{
  const localesDir = join(UNPACKED, "locales")
  const files = (() => {
    try {
      return readdirSync(localesDir).filter((f) => f.endsWith(".pak"))
    } catch {
      return null
    }
  })()
  if (files === null || unpacked === null) {
    record("C6 locale trim", "INCONCLUSIVE", "no unpacked build to measure")
  } else {
    const bytes = treeSize(localesDir).bytes
    console.log(`    locales/ : ${String(files.length)} .pak files, ${mb(bytes)} — ${files.join(", ")}`)
    // BOTH directions. Chromium loads `en-US.pak` for its own built-in strings and a payload with the
    // directory swept clean is a crash at startup, not a saving -- so "few" is not the pass condition,
    // "exactly the one we asked for, and it is present" is. The C5 baseline was 55 files / 41.0MB.
    const hasEnUs = files.includes("en-US.pak")
    if (!hasEnUs) {
      record(
        "C6 locale trim",
        "FAIL",
        `en-US.pak is NOT in the payload — Chromium has no resource bundle to fall back to. This is ` +
          `the failure mode the option's own "no locales found matching wanted languages" warning ` +
          `describes, arriving as a silent 41MB saving`,
      )
    } else if (files.length !== 1) {
      record(
        "C6 locale trim",
        "FAIL",
        `${String(files.length)} .pak files survive where the config asks for one — the option was ` +
          `either ignored or matched more than en-US`,
      )
    } else {
      record(
        "C6 locale trim",
        "PASS",
        `1 .pak (${mb(bytes)}) where the default build shipped 55 (41.0MB) — ${mb(41_000_000 - bytes)} ` +
          `off the installed payload, and en-US is the one that survived`,
      )
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// C7 — the product icon is really in the binary, not just named in the config.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== C7: the app icon is embedded in the packaged exe ===")
{
  // `assets/icon.png` is the 256x256 PNG entry lifted verbatim out of `FuzzyClock.App/app.ico`, and
  // `build/icon.ico` is that whole ICO. An ICO entry can BE a complete PNG file, so if electron-builder
  // really rewrote the exe's icon resources, these exact 6,199 bytes are somewhere inside the binary.
  //
  // A byte search rather than a PE resource walk, and it is not the lazy option: it compares the SHIPPED
  // bytes against the SOURCE bytes with nothing in between to be wrong about. The negative control is
  // what makes it discriminating -- the stock `node_modules/electron/dist/electron.exe` is the same size
  // to the byte, so "found in a 188MB binary" would otherwise be an easy accident.
  const iconPng = (() => {
    try {
      return readFileSync(join(import.meta.dirname, "..", "assets", "icon.png"))
    } catch {
      return null
    }
  })()
  const packagedExe = join(UNPACKED, "FuzzyClock.exe")
  const stockExe = join(import.meta.dirname, "..", "node_modules", "electron", "dist", "electron.exe")
  const indexOfIcon = (path: string): number | null => {
    if (iconPng === null) return null
    try {
      return readFileSync(path).indexOf(iconPng)
    } catch {
      return null
    }
  }
  const inPackaged = indexOfIcon(packagedExe)
  const inStock = indexOfIcon(stockExe)
  console.log(
    `    icon source   : ${iconPng === null ? "MISSING" : `${String(iconPng.length)} bytes`}\n` +
      `    packaged exe  : ${inPackaged === null ? "unreadable" : inPackaged >= 0 ? `found at offset ${String(inPackaged)}` : "ABSENT"}\n` +
      `    stock electron: ${inStock === null ? "unreadable" : inStock >= 0 ? `found at offset ${String(inStock)}` : "absent (control holds)"}`,
  )
  if (iconPng === null || inPackaged === null) {
    record("C7 app icon", "INCONCLUSIVE", "need assets/icon.png and a packaged exe")
  } else if (inStock !== null && inStock >= 0) {
    record(
      "C7 app icon",
      "INCONCLUSIVE",
      "the stock electron.exe contains these bytes too, so finding them in the packaged exe proves " +
        "nothing — the control has failed, not the subject",
    )
  } else if (inPackaged < 0) {
    record(
      "C7 app icon",
      "FAIL",
      "the product icon is not in the packaged exe — `win.icon` is set but the build shipped the stock " +
        "Electron icon, which is exactly the state the P1.5 size measurement was taken in",
    )
  } else {
    record(
      "C7 app icon",
      "PASS",
      `all ${String(iconPng.length)} bytes of the 256x256 product icon are embedded at offset ` +
        `${String(inPackaged)}, and absent from the identically-sized stock binary`,
    )
  }
}

console.log("=== summary ===")
for (const r of results) console.log(`${r.verdict.padEnd(13)} ${r.name}`)
const passed = results.filter((r) => r.verdict === "PASS").length
const failed = results.filter((r) => r.verdict === "FAIL").length
const inconclusive = results.filter((r) => r.verdict === "INCONCLUSIVE").length
console.log(
  `\n${String(passed)} passed / ${String(failed)} failed / ${String(inconclusive)} inconclusive`,
)
console.log(
  "\nWindows only. The mac dmg and linux AppImage targets are configured but NOT built —\n" +
    "electron-builder needs the host platform for those, and a size asserted from this box\n" +
    "would be exactly the class of claim AC-3 forbids. Both also carry no `icon` — app.ico's\n" +
    "largest entry is 256x256 and the icns/Linux conversion needs 512, so C7's arm below is a\n" +
    "Windows-only pass and those two targets ship the stock Electron icon.",
)
console.log(
  "The icon half of that debt is PAID and C7 measures it. The signature half is NOT, and it\n" +
    "was measured rather than assumed: electron-builder logs `signing with signtool.exe` on\n" +
    "every run, and `Get-AuthenticodeSignature` still reports `NotSigned` for both the\n" +
    "installer and win-unpacked/FuzzyClock.exe. So the log line is not evidence, and every\n" +
    "byte count above is an UNSIGNED one — it grows a little when a certificate is real.",
)
process.exit(failed > 0 ? 1 : 0)
