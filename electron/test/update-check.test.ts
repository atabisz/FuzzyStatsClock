/**
 * `main/update-check.ts` -- the once-per-launch GitHub Releases check.
 *
 * Every arm drives the real {@link UpdateChecker} through an injected `fetchImpl`, so the whole file runs
 * under plain `bun` with no network. That is the reason the seam exists, and it buys two things a real call
 * cannot: the failure modes (403, a draft release, a garbage tag, a thrown socket error, both deadlines) are
 * *reachable*, and the arms that assert **no call was made** are meaningful.
 *
 * `scripts/probe-update.ts` is the other half -- one real request to the real URL, to prove the coordinate
 * and the User-Agent are right. Neither file can prove the other's half:
 *
 *   - A real call cannot prove UPD-09 (a dev build does not dispatch), because the observable is an absence.
 *   - A fake cannot prove UPD-03 (GitHub 403s a request with no User-Agent), because only GitHub enforces it.
 *
 * ## The arms that carry weight
 *
 * The two with real discriminating power are **`callCount === 0`** on the disabled path and the
 * `shouldOfferUpdate` **negative control** (`5.0.0-alpha.0` is NOT offered `v4.9.0`). The prerelease clause
 * is the one piece of logic in this module that is not a 1:1 port, and a clause written slightly too wide --
 * "offer if the cores differ in either direction" -- would pass every positive arm while offering a
 * DOWNGRADE to the one user running an alpha. That case is asserted explicitly.
 */

import { describe, expect, test } from "bun:test"
import { parseTag } from "../src/core/update-version.js"
import {
  RELEASES_URL,
  TIMEOUT_MS,
  UpdateChecker,
  isPrerelease,
  parseRunningVersion,
  shouldOfferUpdate,
  updateNoticeText,
  userAgent,
  type FetchLike,
} from "../src/main/update-check.js"

/** The version this port actually ships today, which is the whole reason two of these functions exist. */
const RUNNING = "5.0.0-alpha.0"

interface FetchCall {
  readonly url: string
  readonly headers: Record<string, string>
}

/**
 * Records every request and answers with a scripted response body.
 *
 * `"body" in response` rather than `response.body ?? default`, because **`null` is one of the bodies under
 * test** and `??` would quietly substitute the default for it — an arm that reads as "a null body is
 * rejected" while actually feeding in a valid release. The same absent-versus-falsy trap the `-1` sentinel
 * carries, met here in the fixture rather than in the code.
 */
function fakeFetch(
  response: { ok?: boolean; status?: number; body?: unknown } = {},
): { impl: FetchLike; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const body = "body" in response ? response.body : { tag_name: "v5.1.0" }
  return {
    calls,
    impl: (url, init) => {
      calls.push({ url, headers: { ...init.headers } })
      return Promise.resolve({
        ok: response.ok ?? true,
        status: response.status ?? 200,
        json: () => Promise.resolve(body),
      })
    },
  }
}

/** A request that never answers, and rejects the way `fetch` does when its signal aborts. */
function hangingFetch(): { impl: FetchLike; calls: FetchCall[]; started: () => boolean } {
  const calls: FetchCall[] = []
  let entered = false
  return {
    calls,
    started: () => entered,
    impl: (url, init) => {
      calls.push({ url, headers: { ...init.headers } })
      entered = true
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const error = new Error("The operation was aborted.")
          error.name = "AbortError"
          reject(error)
        })
      })
    },
  }
}

function make(parts: { version?: string; enabled?: boolean; fetchImpl: FetchLike }): UpdateChecker {
  return new UpdateChecker({
    version: parts.version ?? RUNNING,
    enabled: parts.enabled ?? true,
    fetchImpl: parts.fetchImpl,
  })
}

describe("UPD-10: the URL is a constant", () => {
  test("it is the release feed for this repo, over https, on api.github.com", () => {
    // Asserted as a whole string rather than by parts. A settings-driven URL is the defect this rule exists
    // to prevent, and the constant is the only thing standing in for that: a user-writable update URL turns
    // "someone edited a JSON file" into "the app fetches an attacker's release feed".
    expect(RELEASES_URL).toBe("https://api.github.com/repos/atabisz/FuzzyStatsClock/releases/latest")
    expect(RELEASES_URL.startsWith("https://")).toBe(true)
  })

  test("check() requests exactly that URL and nothing else", async () => {
    const { impl, calls } = fakeFetch()
    await make({ fetchImpl: impl }).check()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(RELEASES_URL)
  })
})

describe("UPD-03: the User-Agent", () => {
  test("it is FuzzyClock/<version> and it is sent", async () => {
    const { impl, calls } = fakeFetch()
    await make({ fetchImpl: impl }).check()
    // GitHub's documented behaviour: "Requests without a User-Agent header will be rejected with a 403
    // Forbidden response." A missing header does not fail loudly -- it makes every check report "no update"
    // forever, which is why this is asserted here AND against the live API in `probe-update.ts`.
    expect(calls[0]?.headers["User-Agent"]).toBe(`FuzzyClock/${RUNNING}`)
    expect(calls[0]?.headers.Accept).toBe("application/vnd.github+json")
  })

  test("userAgent() carries the version through verbatim, prerelease suffix and all", () => {
    expect(userAgent("5.0.0-alpha.0")).toBe("FuzzyClock/5.0.0-alpha.0")
    expect(userAgent("5.1.0")).toBe("FuzzyClock/5.1.0")
  })
})

describe("UPD-09: a development build never dispatches", () => {
  test("no HTTP call is made when enabled is false", async () => {
    const { impl, calls } = fakeFetch()
    const checker = make({ enabled: false, fetchImpl: impl })
    expect(await checker.check()).toBeNull()
    // The arm that carries the weight in this file, because the observable is an ABSENCE. A returned null is
    // not enough: every failure mode also returns null, so an implementation that dispatched and then threw
    // the answer away would pass a null-only assertion while still hitting GitHub from every dev run.
    expect(calls).toHaveLength(0)
    // And the guard is not spent, so this is a skip rather than a consumed check.
    expect(checker.hasDispatched).toBe(false)
  })

  test("the positive control: the same checker with enabled true does dispatch", async () => {
    // Rule 18. Without this, the arm above passes against a fake that cannot make calls at all.
    const { impl, calls } = fakeFetch()
    expect(await make({ enabled: true, fetchImpl: impl }).check()).not.toBeNull()
    expect(calls).toHaveLength(1)
  })
})

describe("UPD-01: once per launch", () => {
  test("a second check() makes no second request", async () => {
    const { impl, calls } = fakeFetch()
    const checker = make({ fetchImpl: impl })
    expect(await checker.check()).not.toBeNull()
    expect(checker.hasDispatched).toBe(true)
    expect(await checker.check()).toBeNull()
    expect(calls).toHaveLength(1)
  })

  test("two overlapping calls cannot both dispatch", async () => {
    // The guard is set BEFORE the first await, so this holds without a lock. Asserted because the obvious
    // alternative -- setting it after the response arrives -- passes the sequential arm above and fails
    // here, and the real caller is fire-and-forget so an overlap is reachable.
    const { impl, calls } = hangingFetch()
    const checker = make({ fetchImpl: impl })
    const first = checker.check()
    const second = checker.check()
    expect(await second).toBeNull()
    expect(calls).toHaveLength(1)
    checker.cancelInFlight()
    expect(await first).toBeNull()
  })

  test("a cancelled check does NOT restore the guard", async () => {
    // `MainWindow.xaml.cs:817-819`: toggling back on mid-session is a no-op, a re-check needs a restart.
    const { impl } = hangingFetch()
    const checker = make({ fetchImpl: impl })
    const inFlight = checker.check()
    expect(checker.cancelInFlight()).toBe(true)
    expect(await inFlight).toBeNull()
    expect(checker.hasDispatched).toBe(true)
  })
})

describe("UPD-07: every failure mode answers null", () => {
  test("a non-ok status", async () => {
    for (const status of [403, 404, 429, 500]) {
      const { impl } = fakeFetch({ ok: false, status })
      expect(await make({ fetchImpl: impl }).check()).toBeNull()
    }
  })

  test("a body that is not an object", async () => {
    for (const body of [null, "a string", 42]) {
      const { impl } = fakeFetch({ body })
      expect(await make({ fetchImpl: impl }).check()).toBeNull()
    }
  })

  test("a draft or prerelease release is ignored even though the API filters both", async () => {
    // Belt and braces, and the C# says why: a future API change must not be able to surface a draft tag.
    const draft = fakeFetch({ body: { tag_name: "v9.9.9", draft: true } })
    expect(await make({ fetchImpl: draft.impl }).check()).toBeNull()

    const pre = fakeFetch({ body: { tag_name: "v9.9.9", prerelease: true } })
    expect(await make({ fetchImpl: pre.impl }).check()).toBeNull()

    // `=== true`, not truthiness -- these arrive across a process boundary. A JSON `"true"` string or a 1 is
    // not the API's contract, and treating them as draft would suppress a real release.
    const stringy = fakeFetch({ body: { tag_name: "v9.9.9", draft: "true", prerelease: 1 } })
    expect(await make({ fetchImpl: stringy.impl }).check()).not.toBeNull()
  })

  test("a missing, non-string or unparseable tag", async () => {
    for (const body of [{}, { tag_name: 5 }, { tag_name: "" }, { tag_name: "nightly" }, { tag_name: "v5.1.0-rc.1" }]) {
      const { impl } = fakeFetch({ body })
      expect(await make({ fetchImpl: impl }).check()).toBeNull()
    }
  })

  test("a thrown fetch -- DNS failure, no route, TLS error", async () => {
    const impl: FetchLike = () => Promise.reject(new TypeError("fetch failed"))
    expect(await make({ fetchImpl: impl }).check()).toBeNull()
  })

  test("a non-Error thrown value does not escape either", async () => {
    // The catch stringifies whatever it is given. A `throw "boom"` from anywhere on the path would otherwise
    // reach the startup caller, which is fire-and-forget and so would report an unhandled rejection.
    const impl: FetchLike = () => Promise.reject("boom")
    expect(await make({ fetchImpl: impl }).check()).toBeNull()
  })

  test("json() itself throwing -- a 200 with a malformed body", async () => {
    const impl: FetchLike = () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("Unexpected token")) })
    expect(await make({ fetchImpl: impl }).check()).toBeNull()
  })
})

describe("the two deadlines share one signal", () => {
  test("the budget is 5 seconds", () => {
    expect(TIMEOUT_MS).toBe(5_000)
  })

  test("the signal reaching fetch is not already aborted", async () => {
    // The negative control for the timeout arm below: if the controller were aborted at construction, every
    // arm in this file would still return null and every one of them would be testing the wrong thing.
    // Recorded into an array rather than a `let`: TS narrows a `let boolean | null = null` back to `null`
    // across a callback it cannot prove ran, so `expect(aborted).toBe(false)` is a type error. The array also
    // pins the call count, which a scalar would not.
    const seen: boolean[] = []
    const impl: FetchLike = (_url, init) => {
      seen.push(init.signal.aborted)
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ tag_name: "v5.1.0" }) })
    }
    await make({ fetchImpl: impl }).check()
    expect(seen).toEqual([false])
  })

  test("PERS-10 aborts the signal the request is holding", async () => {
    const { impl, started } = hangingFetch()
    const checker = make({ fetchImpl: impl })
    const inFlight = checker.check()
    // The fetch has been entered, so there is something to cancel. Awaiting a microtask rather than a timer:
    // the fake resolves synchronously into the promise, so one turn is enough.
    await Promise.resolve()
    expect(started()).toBe(true)
    expect(checker.cancelInFlight()).toBe(true)
    // The abort propagated into the request, the rejection was swallowed, and the answer is null.
    expect(await inFlight).toBeNull()
  })

  test("cancelInFlight() reports false when nothing is in flight -- before, and after", async () => {
    const { impl } = fakeFetch()
    const checker = make({ fetchImpl: impl })
    expect(checker.cancelInFlight()).toBe(false)
    await checker.check()
    // The `finally` clears the controller, so a `before-quit` after a completed check is not a spurious log.
    expect(checker.cancelInFlight()).toBe(false)
  })
})

describe("parseRunningVersion: our own version, not the network's", () => {
  test("it takes the numeric core", () => {
    expect(parseRunningVersion("5.0.0-alpha.0")).toEqual({ major: 5, minor: 0, build: 0, revision: -1 })
    expect(parseRunningVersion("5.0.0+build.7")).toEqual({ major: 5, minor: 0, build: 0, revision: -1 })
    expect(parseRunningVersion("5.0.0-rc.1+sha.abc")).toEqual({ major: 5, minor: 0, build: 0, revision: -1 })
    expect(parseRunningVersion("5.0.0")).toEqual({ major: 5, minor: 0, build: 0, revision: -1 })
    expect(parseRunningVersion("4.9.0.3")).toEqual({ major: 4, minor: 9, build: 0, revision: 3 })
  })

  test("an unparseable core is null rather than a throw", () => {
    // Silent-failure posture reaches our own version too: a `package.json` someone hand-edited means no
    // check, not a crash on the startup path.
    expect(parseRunningVersion("")).toBeNull()
    expect(parseRunningVersion("-alpha")).toBeNull()
    expect(parseRunningVersion("five.oh")).toBeNull()
  })

  test("parseTag still rejects the prerelease string this function accepts", () => {
    // The distinction the two functions exist to hold: same shape, opposite trust. `parseTag` reads a value
    // from the network and must refuse `v5.1.0-rc.1`; this one reads `package.json`.
    expect(parseTag("5.0.0-alpha.0")).toBeNull()
    expect(parseRunningVersion("5.0.0-alpha.0")).not.toBeNull()
  })

  test("isPrerelease is the suffix test, not a parse", () => {
    expect(isPrerelease("5.0.0-alpha.0")).toBe(true)
    expect(isPrerelease("5.0.0")).toBe(false)
    expect(isPrerelease("5.0.0+build.7")).toBe(false)
  })
})

describe("shouldOfferUpdate: UPD-02 plus the prerelease clause", () => {
  /** Reads as the API would give it, so a broken `parseTag` cannot make these vacuous. */
  function tag(value: string) {
    const parsed = parseTag(value)
    if (parsed === null) throw new Error(`fixture tag ${value} did not parse`)
    return parsed
  }

  test("a released build: strictly newer only", () => {
    expect(shouldOfferUpdate("5.0.0", tag("v5.1.0"))).toBe(true)
    expect(shouldOfferUpdate("5.0.0", tag("v6.0.0"))).toBe(true)
    expect(shouldOfferUpdate("5.0.0", tag("v5.0.1"))).toBe(true)
    // Equal is not an update, which is UPD-02's whole content.
    expect(shouldOfferUpdate("5.0.0", tag("v5.0.0"))).toBe(false)
    expect(shouldOfferUpdate("5.0.0", tag("v4.9.9"))).toBe(false)
  })

  test("a prerelease build IS offered its own final release", () => {
    // The case the C# could not have: with the core alone `5.0.0-alpha.0` compares equal to `v5.0.0`, so
    // UPD-02 alone would leave the one user running an alpha as the one user who never hears 5.0.0 shipped.
    expect(shouldOfferUpdate("5.0.0-alpha.0", tag("v5.0.0"))).toBe(true)
    expect(shouldOfferUpdate("5.0.0-alpha.0", tag("v5.1.0"))).toBe(true)
    expect(shouldOfferUpdate("5.0.0-rc.2", tag("v5.0.0"))).toBe(true)
  })

  test("THE NEGATIVE CONTROL: a prerelease is never offered an OLDER release", () => {
    // The clause requires equal cores, so it cannot promote a downgrade. A clause written one degree wider
    // -- "offer when the cores differ" or "offer any release when running a prerelease" -- passes every
    // positive arm above and sends the alpha user backwards to 4.9.0. This is the arm that separates them.
    expect(shouldOfferUpdate("5.0.0-alpha.0", tag("v4.9.0"))).toBe(false)
    expect(shouldOfferUpdate("5.0.0-alpha.0", tag("v4.9.9"))).toBe(false)
    expect(shouldOfferUpdate("5.0.0-alpha.0", tag("v1.0"))).toBe(false)
    // And the same core with a lower revision is not an offer either.
    expect(shouldOfferUpdate("5.1.0-beta.1", tag("v5.0.9"))).toBe(false)
  })

  test("an unparseable running version offers nothing", () => {
    expect(shouldOfferUpdate("", tag("v9.9.9"))).toBe(false)
    expect(shouldOfferUpdate("nightly", tag("v9.9.9"))).toBe(false)
  })

  test("absent components are promoted, matching System.Version", () => {
    // `v5.0` parses to build/revision -1, and `normalize` promotes those to 0 -- so `v5.0` and `v5.0.0` are
    // the same release. Asserted through this function because that is where the port's callers meet it.
    expect(shouldOfferUpdate("5.0.0", tag("v5.0"))).toBe(false)
    expect(shouldOfferUpdate("5.0", tag("v5.0.0"))).toBe(false)
    expect(shouldOfferUpdate("5.0", tag("v5.0.1"))).toBe(true)
  })
})

describe("updateNoticeText", () => {
  test("it is ShowUpdateNotice's string, with the v synthesised", () => {
    expect(updateNoticeText({ major: 4, minor: 5, build: 0, revision: -1 })).toBe("v4.5.0 available")
    expect(updateNoticeText({ major: 5, minor: 1, build: 2, revision: 3 })).toBe("v5.1.2.3 available")
  })

  test("absent components are omitted, not printed as -1", () => {
    // The trap in the sentinel: `-1` is ABSENT, and a naive join would show the user `v5.1.-1.-1 available`.
    expect(updateNoticeText({ major: 5, minor: 1, build: -1, revision: -1 })).toBe("v5.1 available")
    expect(updateNoticeText({ major: 5, minor: 1, build: 0, revision: -1 })).toBe("v5.1.0 available")
    expect(updateNoticeText({ major: 5, minor: 1, build: 2, revision: 0 })).toBe("v5.1.2.0 available")
  })

  test("the string it produces is what the renderer is sent", async () => {
    // End to end through the module's own two halves, so the pipeline the `update` channel carries is
    // asserted once rather than assumed from two green units.
    const { impl } = fakeFetch({ body: { tag_name: "v5.2.0" } })
    const latest = await make({ fetchImpl: impl }).check()
    expect(latest).not.toBeNull()
    expect(latest !== null && shouldOfferUpdate(RUNNING, latest)).toBe(true)
    expect(latest !== null && updateNoticeText(latest)).toBe("v5.2.0 available")
  })
})
