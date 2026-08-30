/**
 * A minimal PNG codec — enough to read the shipped 256px icon and write a 1024px one.
 *
 * ## Why hand-rolled rather than a dependency
 *
 * `electron-builder.yml`'s header states the packaging invariant this repo runs on: **there are no
 * production dependencies at all.** Pulling `sharp` or `pngjs` in for one build-time raster would put a
 * native module (and, for sharp, a 30MB platform binary per OS) into a tree whose whole size story is
 * measured by `probe:size`. The subset needed here is small and closed: 8-bit RGBA, non-interlaced,
 * which is exactly what `assets/icon.png` is (`IHDR` bit depth 8, colour type 6, interlace 0) and
 * exactly what we emit.
 *
 * So this file deliberately does NOT implement: palettes, 16-bit channels, greyscale, interlacing,
 * ancillary chunks. Each of those throws rather than being silently mishandled — a decoder that
 * quietly returns wrong pixels is worse than one that refuses, because the icon it produces still
 * looks like an icon.
 *
 * ## The compression is `node:zlib`, and that choice is measured rather than stylistic
 *
 * PNG's `IDAT` carries a **zlib** stream (RFC1950), header bytes and Adler-32 included. `Bun.inflateSync`
 * is **raw deflate** (RFC1951): handed a real `IDAT` it reads the 0x78 zlib header as a stored-block
 * type and dies with `invalid stored block lengths`. Measured, not assumed — that is the error this file
 * threw on its first run against `assets/icon.png`. `node:zlib`'s `inflateSync`/`deflateSync` are the
 * zlib-framed pair, so they are what is used here.
 *
 * The framing is still asserted rather than trusted: `encode()`'s output is fed back through `decode()`
 * by `probe:icon` arm A1, so a framing surprise shows up as a failed round trip instead of a corrupt
 * file that some viewers tolerate.
 */
import { deflateSync, inflateSync } from "node:zlib"

/** Decoded image: straight (non-premultiplied) RGBA, 4 bytes per pixel, row-major from the top. */
export interface Raster {
  width: number
  height: number
  /** Length is exactly `width * height * 4`. */
  data: Uint8Array
}

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Standard PNG/zlib CRC-32, table built once on first use. */
const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Paeth predictor, verbatim from RFC 2083 §6.6 — the one filter that is easy to get subtly wrong. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

export function decode(file: Uint8Array): Raster {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (file[i] !== SIGNATURE[i]) throw new Error("not a PNG: signature mismatch")
  }
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  let offset = SIGNATURE.length
  let width = 0
  let height = 0
  const idat: Uint8Array[] = []

  while (offset < file.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(file[offset + 4]!, file[offset + 5]!, file[offset + 6]!, file[offset + 7]!)
    const body = file.subarray(offset + 8, offset + 8 + length)
    if (type === "IHDR") {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      const bitDepth = file[offset + 16]!
      const colourType = file[offset + 17]!
      const interlace = file[offset + 20]!
      if (bitDepth !== 8) throw new Error(`unsupported bit depth ${String(bitDepth)} (only 8)`)
      if (colourType !== 6) throw new Error(`unsupported colour type ${String(colourType)} (only 6 = RGBA)`)
      if (interlace !== 0) throw new Error("interlaced PNGs are not supported")
    } else if (type === "IDAT") {
      idat.push(body)
    } else if (type === "IEND") {
      break
    }
    offset += 12 + length
  }
  if (width === 0 || height === 0) throw new Error("no IHDR")
  if (idat.length === 0) throw new Error("no IDAT")

  const compressed = idat.length === 1 ? idat[0]! : concat(idat)
  const raw = new Uint8Array(inflateSync(compressed))
  const stride = width * 4
  if (raw.length < (stride + 1) * height) {
    throw new Error(`inflated ${String(raw.length)} bytes, need ${String((stride + 1) * height)}`)
  }

  const data = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    const src = y * (stride + 1) + 1
    const dst = y * stride
    const up = dst - stride
    for (let x = 0; x < stride; x++) {
      const value = raw[src + x]!
      const a = x >= 4 ? data[dst + x - 4]! : 0
      const b = y > 0 ? data[up + x]! : 0
      const c = x >= 4 && y > 0 ? data[up + x - 4]! : 0
      let out: number
      switch (filter) {
        case 0:
          out = value
          break
        case 1:
          out = value + a
          break
        case 2:
          out = value + b
          break
        case 3:
          out = value + ((a + b) >> 1)
          break
        case 4:
          out = value + paeth(a, b, c)
          break
        default:
          throw new Error(`unknown filter ${String(filter)} on row ${String(y)}`)
      }
      data[dst + x] = out & 0xff
    }
  }
  return { width, height, data }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

/**
 * Encode straight RGBA as an 8-bit colour-type-6 PNG.
 *
 * Every scanline is written with filter 0 (None). Filtering exists to help compression, and for flat
 * vector art zlib already finds the runs; the icon this writes lands well under the size of the 256px
 * source it replaces, so there is nothing to buy by adding four more code paths that could be wrong.
 */
export function encode(image: Raster): Uint8Array {
  const { width, height, data } = image
  if (data.length !== width * height * 4) {
    throw new Error(`data length ${String(data.length)} != ${String(width)}x${String(height)}x4`)
  }
  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, width)
  ihdrView.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  return concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))), chunk("IEND", new Uint8Array(0))])
}

/** Pixel accessor as `[r, g, b, a]`; out-of-bounds reads are fully transparent rather than throwing. */
export function pixel(image: Raster, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return [0, 0, 0, 0]
  const at = (y * image.width + x) * 4
  return [image.data[at]!, image.data[at + 1]!, image.data[at + 2]!, image.data[at + 3]!]
}

/**
 * Box-average downsample by an integer factor.
 *
 * Averaging is done in **straight** RGBA, which is wrong at hard alpha edges in general — but this is
 * used only to compare two renderings of the same artwork against each other, so both sides carry the
 * same bias and the comparison stays fair. Said out loud because a box filter on straight alpha is a
 * classic source of dark fringing, and the fringe would otherwise look like a geometry difference.
 */
export function downsample(image: Raster, factor: number): Raster {
  if (!Number.isInteger(factor) || factor < 1) throw new Error(`factor must be a positive integer`)
  if (image.width % factor !== 0 || image.height % factor !== 0) {
    throw new Error(`${String(image.width)}x${String(image.height)} is not divisible by ${String(factor)}`)
  }
  const width = image.width / factor
  const height = image.height / factor
  const data = new Uint8Array(width * height * 4)
  const area = factor * factor
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sums = [0, 0, 0, 0]
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const p = pixel(image, x * factor + dx, y * factor + dy)
          for (let c = 0; c < 4; c++) sums[c]! += p[c]!
        }
      }
      const at = (y * width + x) * 4
      for (let c = 0; c < 4; c++) data[at + c] = Math.round(sums[c]! / area)
    }
  }
  return { width, height, data }
}
