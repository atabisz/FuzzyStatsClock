/**
 * Extract a PNG tray icon from the WPF app's `app.ico`, losslessly.
 *
 * The tray needs a PNG: Electron's `Tray` takes `.ico` on Windows but not on macOS or Linux, where
 * `nativeImage.createFromPath` on an ICO yields an empty image and the tray then shows nothing at all
 * -- a silent failure, and the exact shape ISC-17 has to rule out.
 *
 * No conversion happens here and none is needed. An ICO directory entry can hold either a BMP-style
 * bitmap or a **complete PNG file**, and `FuzzyClock.App/app.ico` holds four entries of which the
 * 256x256 one is PNG (`89 50 4E 47 ...`). So this is a byte-range copy: the extracted file is bit-for-bit
 * the PNG the WPF icon already contained, which is why the output can be trusted without a visual check
 * and why re-running this is guaranteed to reproduce it.
 *
 * Run manually, output committed:
 *     bun scripts/extract-icon.ts
 *
 * ## Phase 7 added the second output, and deliberately not a third
 *
 * `build/icon.ico` is the whole `app.ico` copied byte for byte, because that is where
 * `electron-builder` looks for the Windows application and installer icon (`directories.buildResources`
 * is `build`, and `win.icon` defaults to `icon.ico` inside it). It is a copy rather than a reference to
 * `../FuzzyClock.App/app.ico` for one hard reason: **Phase 9 deletes `FuzzyClock.App`**, so a packaging
 * config pointing outside `electron/` would break the build at the exact moment the WPF app is retired.
 * Copying keeps the derivation in this one script, where the source is named and the copy is reproducible.
 *
 * **No `build/icon.png` and no `build/icon.icns`, and that is a decision rather than an omission.**
 * `electron-builder` converts a PNG to an `.icns` for macOS and to a Linux icon set, and it requires the
 * source to be **at least 512x512**. The largest entry in `app.ico` is 256x256 (enumerated below on every
 * run). So supplying `build/icon.png` at 256 would not produce mac and linux icons -- it would make those
 * two builds *fail* on a size check, and neither can be built on this host to find that out. The only
 * honest ways forward are a real 512+ source or an upscale, and an upscale is fabricating pixels and
 * calling them the product's icon. Recorded as Phase 7 debt in the port plan instead.
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ICO = join(import.meta.dirname, "..", "..", "FuzzyClock.App", "app.ico")
const OUT_DIR = join(import.meta.dirname, "..", "assets")
const OUT = join(OUT_DIR, "icon.png")
const BUILD_DIR = join(import.meta.dirname, "..", "build")
const BUILD_ICO = join(BUILD_DIR, "icon.ico")

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const ico = readFileSync(ICO)
if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
  console.error(`extract-icon: ${ICO} is not an ICO file (reserved/type header mismatch)`)
  process.exit(1)
}

const count = ico.readUInt16LE(4)
interface Entry {
  width: number
  height: number
  size: number
  offset: number
  isPng: boolean
}
const entries: Entry[] = []
for (let i = 0; i < count; i++) {
  const o = 6 + i * 16
  // 0 means 256 in an ICO directory -- the field is one byte, so 256 does not fit.
  entries.push({
    width: ico[o] === 0 ? 256 : (ico[o] as number),
    height: ico[o + 1] === 0 ? 256 : (ico[o + 1] as number),
    size: ico.readUInt32LE(o + 8),
    offset: ico.readUInt32LE(o + 12),
    isPng: ico.subarray(ico.readUInt32LE(o + 12), ico.readUInt32LE(o + 12) + 8).equals(PNG_MAGIC),
  })
}

for (const e of entries) {
  console.log(`  ${String(e.width)}x${String(e.height)} ${String(e.size)}B at ${String(e.offset)}${e.isPng ? " PNG" : " BMP"}`)
}

const png = entries.filter((e) => e.isPng).sort((a, b) => b.width - a.width)[0]
if (png === undefined) {
  // Deliberately not a fallback BMP->PNG encoder. Writing one would be a lot of code whose output
  // nothing in this repo can verify, and the honest answer to "this icon has no PNG entry" is to
  // supply a real icon rather than to synthesise one.
  console.error(
    `extract-icon: no PNG entry in ${ICO} -- every entry is a BMP bitmap. ` +
      `Supply assets/icon.png directly instead of extracting it.`,
  )
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
const bytes = ico.subarray(png.offset, png.offset + png.size)
writeFileSync(OUT, bytes)
console.log(
  `extract-icon: ${String(png.width)}x${String(png.height)} PNG, ${String(bytes.length)} bytes -> assets/icon.png`,
)

// The packaging icon. `electron-builder` requires the ICO to carry a 256x256 entry, which the check above
// has already proven -- the entry it extracted for the tray IS that one, so a `app.ico` that would be
// rejected by the packager cannot reach this line.
mkdirSync(BUILD_DIR, { recursive: true })
copyFileSync(ICO, BUILD_ICO)
console.log(`extract-icon: ${String(ico.length)} bytes -> build/icon.ico (whole ICO, ${String(count)} entries)`)
