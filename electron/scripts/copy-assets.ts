/**
 * Copy the renderer's static assets into `dist/`.
 *
 * A script rather than a shell one-liner because the three platforms disagree on
 * `cp` (and Windows has no `cp` at all outside a POSIX shell), and the build has to
 * run identically on all of them.
 *
 * It also verifies the bundles are present. `main.ts` loads `dist/index.html`, and
 * Electron's failure mode for a missing file is a blank transparent window with
 * nothing on stderr — indistinguishable from a renderer that ran and drew nothing,
 * which is the exact confusion the ISC-6 paint counter exists to avoid. Failing here
 * is cheaper than diagnosing it there.
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const DIST = join(ROOT, "dist")

/** Copied verbatim from `src/renderer/` — no transform, so no build step can alter them. */
const ASSETS = ["index.html", "index.css"]

/**
 * Copied from `assets/` — the tray icon, resolved by `main.ts` as `join(HERE, "icon.png")`.
 *
 * Verified for existence like everything else here, and for the same reason: `nativeImage.createFromPath`
 * on a missing file returns an EMPTY image rather than throwing, `new Tray(empty)` succeeds, and the
 * result is a tray slot showing nothing. `main/tray.ts` logs that case, but a build that cannot produce
 * a tray icon should fail at the build rather than at the user.
 */
const ROOT_ASSETS = ["icon.png"]

/** Written by the `build:*` bundle steps that must have run before this one. */
const REQUIRED_BUNDLES = ["main.js", "preload.cjs", "renderer.js"]

mkdirSync(DIST, { recursive: true })

for (const name of ASSETS) {
  const from = join(ROOT, "src", "renderer", name)
  if (!existsSync(from)) {
    console.error(`copy-assets: ${name} missing from src/renderer/`)
    process.exit(1)
  }
  copyFileSync(from, join(DIST, name))
}

for (const name of ROOT_ASSETS) {
  const from = join(ROOT, "assets", name)
  if (!existsSync(from)) {
    console.error(`copy-assets: ${name} missing from assets/ — run \`bun scripts/extract-icon.ts\``)
    process.exit(1)
  }
  copyFileSync(from, join(DIST, name))
}

const missing = REQUIRED_BUNDLES.filter((name) => !existsSync(join(DIST, name)))
if (missing.length > 0) {
  console.error(
    `copy-assets: dist/ is missing ${missing.join(", ")} — run the build:* steps first ` +
      `(a missing bundle renders as an empty transparent window with no error)`,
  )
  process.exit(1)
}

console.log(`copy-assets: ${[...ASSETS, ...ROOT_ASSETS].join(", ")} → dist/, bundles present`)
