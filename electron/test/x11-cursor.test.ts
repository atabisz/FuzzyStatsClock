/**
 * `X11CursorSource` — the Linux/X11 live-cursor source, driven with a fake `x11` client.
 *
 * The class is structurally typed (`X11ClientLike`, `CreateX11Client`) so this file needs neither the
 * real `x11` package nor an X server: `fakeX11` below is an object literal whose `QueryPointer` calls
 * back synchronously with whatever pointer the arm wants. What these arms cover is everything the source
 * adds over a raw request — the sync-getter cache, the fallback before the first reply, the DIP
 * conversion, and the four ways the connection can fail (connect error, connect timeout, client
 * `error`, client `end`, and a failed `QueryPointer`), each of which must land on the injected
 * fallback and log exactly once.
 *
 * The live proof that `XQueryPointer` actually tracks the cursor where `screen.getCursorScreenPoint()`
 * does not is a probe, not a unit test — recorded in the ISA under ISC-24.1.
 */
import { describe, expect, test } from "bun:test"
import {
  X11CursorSource,
  type CreateX11Client,
  type X11ClientLike,
} from "../src/main/x11-cursor.js"

interface FakeOpts {
  readonly pointer?: { rootX: number; rootY: number }
  readonly connectErr?: unknown
  readonly queryErr?: unknown
  readonly root?: number
  /** Never invoke the createClient callback — for the connect-timeout arm. */
  readonly neverConnect?: boolean
}

function fakeX11(opts: FakeOpts = {}): {
  createClient: CreateX11Client
  fire: (event: "error" | "end", err?: unknown) => void
  terminated: () => boolean
  queryCount: () => number
} {
  const handlers: Partial<Record<"error" | "end", (err?: unknown) => void>> = {}
  let terminated = false
  let queryCount = 0

  const client: X11ClientLike = {
    QueryPointer: (_wid, cb) => {
      queryCount++
      if (opts.queryErr !== undefined) cb(opts.queryErr, { rootX: 0, rootY: 0 })
      else cb(null, opts.pointer ?? { rootX: 0, rootY: 0 })
    },
    on: (event, handler) => {
      handlers[event] = handler
    },
    terminate: () => {
      terminated = true
    },
  }

  const createClient: CreateX11Client = (cb) => {
    if (opts.neverConnect === true) return
    if (opts.connectErr !== undefined) cb(opts.connectErr, undefined as never)
    else cb(null, { client, screen: [{ root: opts.root ?? 42 }] })
  }

  return {
    createClient,
    fire: (event, err) => handlers[event]?.(err),
    terminated: () => terminated,
    queryCount: () => queryCount,
  }
}

const FALLBACK = { x: 11, y: 22 }
function make(opts: FakeOpts, extra: { physicalToDip?: (p: { x: number; y: number }) => { x: number; y: number } } = {}) {
  const logs: string[] = []
  const fake = fakeX11(opts)
  const src = new X11CursorSource({
    fallback: () => FALLBACK,
    log: (level, message) => logs.push(`${level}:${message}`),
    createClient: fake.createClient,
    connectTimeoutMs: 20,
    ...(extra.physicalToDip === undefined ? {} : { physicalToDip: extra.physicalToDip }),
  })
  return { src, fake, logs, warnings: () => logs.filter((l) => l.startsWith("warn:")) }
}

describe("X11CursorSource", () => {
  test("returns the fallback before start and before the first reply", () => {
    const { src } = make({ pointer: { rootX: 500, rootY: 600 } })
    expect(src.getCursorScreenPoint()).toEqual(FALLBACK)
  })

  test("after start, the getter returns the polled pointer position", () => {
    // `start()` fires one `poll()` immediately after the (synchronous, faked) connect, so the cache is
    // warm by the time the getter is called.
    const { src } = make({ pointer: { rootX: 500, rootY: 600 } })
    src.start()
    expect(src.degraded).toBe(false)
    expect(src.getCursorScreenPoint()).toEqual({ x: 500, y: 600 })
    src.stop()
  })

  test("physicalToDip is applied to the live reading, not to the fallback", () => {
    const { src } = make({ pointer: { rootX: 1000, rootY: 800 } }, { physicalToDip: (p) => ({ x: p.x / 2, y: p.y / 2 }) })
    src.start()
    expect(src.getCursorScreenPoint()).toEqual({ x: 500, y: 400 })
    src.stop()
    // Degrade it and confirm the conversion is NOT run on the fallback.
    const d = make({ connectErr: new Error("nope") }, { physicalToDip: (p) => ({ x: p.x / 2, y: p.y / 2 }) })
    d.src.start()
    expect(d.src.getCursorScreenPoint()).toEqual(FALLBACK)
  })

  test("a connect error degrades to the fallback and logs exactly once", () => {
    const { src, warnings } = make({ connectErr: new Error("ECONNREFUSED") })
    src.start()
    expect(src.degraded).toBe(true)
    expect(src.getCursorScreenPoint()).toEqual(FALLBACK)
    src.getCursorScreenPoint()
    src.getCursorScreenPoint()
    expect(warnings()).toHaveLength(1)
    expect(warnings()[0]).toContain("ECONNREFUSED")
  })

  test("a client 'error' event after connect degrades it", () => {
    const { src, fake } = make({ pointer: { rootX: 5, rootY: 5 } })
    src.start()
    expect(src.degraded).toBe(false)
    fake.fire("error", new Error("protocol error"))
    expect(src.degraded).toBe(true)
    expect(src.getCursorScreenPoint()).toEqual(FALLBACK)
  })

  test("a client 'end' event degrades it", () => {
    const { src, fake } = make({ pointer: { rootX: 5, rootY: 5 } })
    src.start()
    fake.fire("end")
    expect(src.degraded).toBe(true)
  })

  test("a failed QueryPointer degrades it rather than caching garbage", () => {
    const { src } = make({ queryErr: new Error("BadWindow") })
    src.start()
    expect(src.degraded).toBe(true)
    expect(src.getCursorScreenPoint()).toEqual(FALLBACK)
  })

  test("a connect that never calls back degrades on the timeout", async () => {
    const { src } = make({ neverConnect: true })
    src.start()
    expect(src.degraded).toBe(false) // still waiting
    await Bun.sleep(40)
    expect(src.degraded).toBe(true)
    expect(src.getCursorScreenPoint()).toEqual(FALLBACK)
  })

  test("stop() terminates the client and makes poll() a no-op", () => {
    const { src, fake } = make({ pointer: { rootX: 1, rootY: 2 } })
    src.start()
    const before = fake.queryCount()
    src.stop()
    expect(fake.terminated()).toBe(true)
    src.poll()
    expect(fake.queryCount()).toBe(before)
  })

  test("start() is idempotent and does not open a second connection", () => {
    const { src, fake } = make({ pointer: { rootX: 1, rootY: 2 } })
    src.start()
    const after1 = fake.queryCount()
    src.start()
    expect(fake.queryCount()).toBe(after1)
    src.stop()
  })
})
