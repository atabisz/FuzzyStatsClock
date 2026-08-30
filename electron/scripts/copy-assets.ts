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
 * The settings window's pair, from `src/renderer/settings/` — FLATTENED into `dist/` rather than mirrored
 * into `dist/settings/`.
 *
 * Flat because `main/settings-window.ts` resolves `join(dir, "settings.html")` against `HERE`, the same way
 * the overlay resolves `index.html`, and because both files' own internal references are bare names
 * (`href="settings.css"`, `src="settings.js"`). A mirrored subdirectory would work for the CSS and the
 * script — they are relative to the document — but the preload is resolved by main against `HERE`, so the
 * layout would then be split across two conventions for one window.
 *
 * The source directory is separate all the same: `settings.ts` and `renderer.ts` are two different bundles
 * with two different globals, and keeping them in one folder is how the wrong `window.fuzzyclock` gets
 * imported.
 */
const SETTINGS_ASSETS = ["settings.html", "settings.css"]

/**
 * Copied from `assets/` — the tray icon, resolved by `main.ts` as `join(HERE, "icon.png")`.
 *
 * Verified for existence like everything else here, and for the same reason: `nativeImage.createFromPath`
 * on a missing file returns an EMPTY image rather than throwing, `new Tray(empty)` succeeds, and the
 * result is a tray slot showing nothing. `main/tray.ts` logs that case, but a build that cannot produce
 * a tray icon should fail at the build rather than at the user.
 */
const ROOT_ASSETS = ["icon.png"]

/**
 * Written by the `build:*` bundle steps that must have run before this one.
 *
 * `preload-settings.cjs` is the one whose absence is hardest to read at runtime, which is why it is checked
 * here: a missing preload does not fail the `loadFile`, so the window opens, the CSS applies, `settings.js`
 * runs, and then `required()` throws on the first control because `window.fuzzyclock` was never injected —
 * a form-shaped error for a build-shaped cause.
 */
const REQUIRED_BUNDLES = ["main.js", "preload.cjs", "renderer.js", "preload-settings.cjs", "settings.js"]

mkdirSync(DIST, { recursive: true })

for (const name of ASSETS) {
  const from = join(ROOT, "src", "renderer", name)
  if (!existsSync(from)) {
    console.error(`copy-assets: ${name} missing from src/renderer/`)
    process.exit(1)
  }
  copyFileSync(from, join(DIST, name))
}

for (const name of SETTINGS_ASSETS) {
  const from = join(ROOT, "src", "renderer", "settings", name)
  if (!existsSync(from)) {
    console.error(`copy-assets: ${name} missing from src/renderer/settings/`)
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

console.log(
  `copy-assets: ${[...ASSETS, ...SETTINGS_ASSETS, ...ROOT_ASSETS].join(", ")} → dist/, bundles present`,
)
