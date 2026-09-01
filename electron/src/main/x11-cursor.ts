/**
 * A live global-cursor source for Linux/X11, backed by `XQueryPointer` on the root window.
 *
 * ## Why this exists
 *
 * `core/hover.ts` and `main/ghost.ts` were built on `screen.getCursorScreenPoint()` — ISC-24, "measured
 * healthy" on Windows and macOS. It is neither on Linux: Electron's Ozone/X11 backend does not run a
 * fresh `XQueryPointer`, it returns the position cached from the last mouse event delivered to one of the
 * app's own windows. The proximity halo is by definition the region *around and outside* the widget, so
 * the app receives no events there and the reading does not move during an approach or a retreat — the
 * fade never runs, and the widget snaps between full and invisible at the widget's own edge. Reproduced
 * against a real Electron 33 window: a 20-step cursor walk toward the widget produced one `onRatio`, and
 * it was `1.0`.
 *
 * `XQueryPointer` on the root window, by contrast, tracks the real pointer exactly (verified 5/5 across
 * the desktop on the same session). The `x11` package speaks the X11 wire protocol in pure JavaScript —
 * no native build, no compiled dependency — so this is one request over the socket Electron's X
 * connection already implies.
 *
 * ## Shape
 *
 * `getCursorScreenPoint()` is synchronous because that is the contract `GhostDriver` and the drag code
 * consume. An X request is a round-trip, so this class keeps a cached last-known point refreshed by an
 * internal poll faster than the 33 ms sampler, and the getter returns the cache. Until the first reply
 * lands — and forever, if the connection fails — it returns {@link X11CursorSourceOptions.fallback},
 * which `main.ts` wires to `screen.getCursorScreenPoint()`. So the worst case is exactly today's
 * behaviour plus the `main/ghost.ts` stale-cursor watchdog, never a crash and never a garbage `(0,0)`.
 *
 * No `electron` import — same rule as `platform.ts`. The DIP conversion and the fallback are both
 * injected, because both need `screen` and this module must load under Bun with no Electron on the path.
 */

import { createRequire } from "node:module"

/** ESM has no `require`; `main.js` is built `--target node` from a `"type": "module"` package. */
const nodeRequire = createRequire(import.meta.url)

/** The slice of the `x11` client this module uses. Structural, so a test passes a literal. */
export interface X11ClientLike {
  QueryPointer(
    wid: number,
    cb: (err: unknown, res: { rootX: number; rootY: number }) => void,
  ): void
  on(event: "error" | "end", handler: (err?: unknown) => void): void
  terminate?(): void
}
export interface X11DisplayLike {
  client: X11ClientLike
  screen: ReadonlyArray<{ root: number }>
}
export type CreateX11Client = (cb: (err: unknown, display: X11DisplayLike) => void) => void

export interface Point {
  x: number
  y: number
}

export interface X11CursorSourceOptions {
  /** Returned until the first `XQueryPointer` reply lands, and permanently if the connection fails. */
  readonly fallback: () => Point
  readonly log: (level: "info" | "warn" | "error", message: string) => void
  /**
   * `XQueryPointer` reports PHYSICAL pixels; `GhostDriver` compares against `win.getBounds()`, which is
   * DIP. `main.ts` passes the conversion because it needs `screen`. Omitted means identity — correct on
   * a scale-1.0 desktop, which is the common Linux case and this dev host.
   */
  readonly physicalToDip?: (p: Point) => Point
  /** Injected for the tests. Omitted uses the real `x11` package, loaded lazily. */
  readonly createClient?: CreateX11Client
  /** Poll cadence. 16 ms — faster than `SAMPLE_MS` so the sampler never reads a value a full tick old. */
  readonly pollMs?: number
  /** How long to wait for `createClient` before falling back. */
  readonly connectTimeoutMs?: number
}

const DEFAULT_POLL_MS = 16
const DEFAULT_CONNECT_TIMEOUT_MS = 2_000

export class X11CursorSource {
  readonly #options: X11CursorSourceOptions
  readonly #identity: (p: Point) => Point = (p) => p

  #client: X11ClientLike | null = null
  #root = 0
  #lastPhysical: Point | null = null
  #degraded = false
  #loggedDegraded = false
  #timer: ReturnType<typeof setInterval> | null = null
  #connectTimer: ReturnType<typeof setTimeout> | null = null
  /** A QueryPointer is in flight — don't stack a second one if a poll is slow. */
  #inFlight = false

  constructor(options: X11CursorSourceOptions) {
    this.#options = options
  }

  /** For the tests and the probe. */
  get degraded(): boolean {
    return this.#degraded
  }

  start(): void {
    if (this.#timer !== null || this.#degraded) return

    const create = this.#options.createClient ?? loadRealCreateClient(this.#options.log)
    if (create === null) {
      this.#degrade("x11 package unavailable")
      return
    }

    this.#connectTimer = setTimeout(() => {
      if (this.#client === null) this.#degrade("x11 connect timed out")
    }, this.#options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS)

    try {
      create((err, display) => {
        if (this.#connectTimer !== null) {
          clearTimeout(this.#connectTimer)
          this.#connectTimer = null
        }
        if (err !== null && err !== undefined) {
          this.#degrade(`x11 createClient failed: ${String(err)}`)
          return
        }
        if (this.#degraded) {
          display.client.terminate?.() // the timeout already fired; don't leak the socket
          return
        }
        this.#client = display.client
        this.#root = display.screen[0]?.root ?? 0
        this.#client.on("error", (e) => this.#degrade(`x11 client error: ${String(e)}`))
        this.#client.on("end", () => this.#degrade("x11 connection ended"))
        this.#options.log("info", "ghost: cursor source is XQueryPointer (Linux)")
        this.poll()
      })
    } catch (e) {
      this.#degrade(`x11 createClient threw: ${String(e)}`)
      return
    }

    // A synchronous `createClient` callback (only a fake does this) may already have degraded us; don't
    // arm a poll timer that every tick would no-op on.
    if (!this.#degraded) {
      this.#timer = setInterval(() => this.poll(), this.#options.pollMs ?? DEFAULT_POLL_MS)
    }
  }

  stop(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer)
      this.#timer = null
    }
    if (this.#connectTimer !== null) {
      clearTimeout(this.#connectTimer)
      this.#connectTimer = null
    }
    this.#client?.terminate?.()
    this.#client = null
  }

  /** One `XQueryPointer` round-trip. Public so a test drives it without a real timer. */
  poll(): void {
    if (this.#client === null || this.#degraded || this.#inFlight) return
    this.#inFlight = true
    this.#client.QueryPointer(this.#root, (err, res) => {
      this.#inFlight = false
      if (err !== null && err !== undefined) {
        this.#degrade(`x11 QueryPointer failed: ${String(err)}`)
        return
      }
      this.#lastPhysical = { x: res.rootX, y: res.rootY }
    })
  }

  /** The `CursorSourceLike` contract `GhostDriver` consumes — synchronous, from the cache. */
  getCursorScreenPoint(): Point {
    if (this.#degraded || this.#lastPhysical === null) return this.#options.fallback()
    return (this.#options.physicalToDip ?? this.#identity)(this.#lastPhysical)
  }

  #degrade(why: string): void {
    this.#degraded = true
    this.#lastPhysical = null
    if (this.#timer !== null) {
      clearInterval(this.#timer)
      this.#timer = null
    }
    if (this.#connectTimer !== null) {
      clearTimeout(this.#connectTimer)
      this.#connectTimer = null
    }
    this.#client?.terminate?.()
    this.#client = null
    if (!this.#loggedDegraded) {
      this.#loggedDegraded = true
      this.#options.log(
        "warn",
        `ghost: XQueryPointer cursor source unavailable, using screen.getCursorScreenPoint() ` +
          `(${why}). The proximity fade will not track the cursor outside the widget on this session.`,
      )
    }
  }
}

/** Lazy `require("x11").createClient`, or `null` if the package cannot be loaded. */
function loadRealCreateClient(
  log: (level: "info" | "warn" | "error", message: string) => void,
): CreateX11Client | null {
  try {
    const x11 = nodeRequire("x11") as { createClient: CreateX11Client }
    return x11.createClient
  } catch (e) {
    log("warn", `ghost: could not load the x11 package (${String(e)})`)
    return null
  }
}
