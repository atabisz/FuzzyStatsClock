/**
 * ISC-29 — does the update check actually reach GitHub, and does it actually give up?
 *
 * `test/update-check.test.ts` drives `main/update-check.ts` against an injected `fetchImpl` and covers every
 * failure mode there is: 403, a draft release, a garbage tag, a thrown socket error, both deadlines. What it
 * cannot cover is the part that lives outside this process, and that is exactly what this file is for:
 *
 *   - **The coordinate.** A URL constant that 404s forever is a check that silently never fires. Only a real
 *     request can tell the difference between "no release published yet" and "wrong repo path".
 *   - **The User-Agent.** GitHub documents a 403 for a request without one. Nothing local can enforce that,
 *     so a green unit test proves the header is *sent*, not that it is *needed* — or accepted.
 *   - **The deadline against a real socket.** The unit test's fake rejects the moment its signal aborts,
 *     which is the behaviour being assumed. A real connection that never answers is the thing that proves
 *     the `AbortController` and the 5-second timer are wired to something.
 *
 * And the reverse, said plainly because it is the arm most easily faked here: **no arm in this file proves
 * the notice reaches the user's screen.** `probe:fade`/`probe:pixels` own the renderer, `test/layout.test.ts`
 * owns the notice's geometry, and the wiring between them is `main.ts`'s `pendingUpdateText`.
 *
 * ## The four local arms use a real server, not a fake
 *
 * B5 and B6 stand up a `Bun.serve` that accepts the connection and never answers. That is a real TCP socket,
 * a real DNS-free connect and a real abort — the one shape a `fetchImpl` fake cannot produce, because a fake
 * chooses when to reject and the code under test is what decides that here.
 *
 * B7 and B8 are the same argument applied to the *body*. The live API answers 200 with a tag OLDER than this
 * port's version, so the branch the network exercises is `not offered` and `updateNoticeText` was never
 * reached — a green taken entirely from the negative branch. B7 serves a GitHub-shaped 200 with a newer tag
 * over a real socket, which puts a real `Response` and the platform's own `json()` in front of the parse
 * instead of a fake's `json: () => value`. **B8 is what makes B7 mean anything**: three more payloads down the
 * same code path, one of them the tag the live API actually serves, all of which must decline. The bytes on
 * the wire are the only variable between them.
 *
 * ## What it costs to run
 *
 * Three real requests to api.github.com (unauthenticated, well inside the 60/hour limit) and about six
 * seconds of waiting for B5's deadline. B7/B8's four requests are loopback and cost nothing.
 *
 *     bun run probe:update
 */

import {
  RELEASES_URL,
  TIMEOUT_MS,
  UpdateChecker,
  shouldOfferUpdate,
  updateNoticeText,
  userAgent,
  type FetchLike,
} from "../src/main/update-check.js"
import { parseTag } from "../src/core/update-version.js"

/** The version the app reports. `app.getVersion()` reads this same field from `package.json`. */
const pkg = (await import("../package.json", { with: { type: "json" } })).default as { version: string }
const RUNNING = pkg.version

const results: { name: string; verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string }[] = []
function record(name: string, verdict: "PASS" | "FAIL" | "INCONCLUSIVE", detail: string): void {
  results.push({ name, verdict, detail })
  console.log(`  → ${verdict}: ${detail}\n`)
}

/**
 * The production adapter, verbatim: `main.ts:901` is `fetchImpl: (url, init) => fetch(url, init)`.
 *
 * Wrapped in a counter, which is what makes B4's absence arm mean something at the socket layer rather than
 * at a fake's front door.
 */
let httpHits = 0
const countingFetch: FetchLike = (url, init) => {
  httpHits++
  return fetch(url, init)
}

// ───────────────────────────────────────────────────────────────────────────────
// B1 — the coordinate resolves, and a 404 is disambiguated rather than shrugged at.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== B1: the release URL is a real coordinate ===")
const REPO_URL = "https://api.github.com/repos/atabisz/FuzzyStatsClock"
let networkReachable = false
{
  const headers = { "User-Agent": userAgent(RUNNING), Accept: "application/vnd.github+json" }
  const get = async (url: string): Promise<{ status: number; body: unknown } | { error: string }> => {
    try {
      const response = await fetch(url, { headers })
      // `.json()` on a 404 still parses — GitHub answers a JSON error document, and its `message` is the
      // thing that separates "Not Found" from a rate limit wearing the same status.
      const body: unknown = await response.json().catch(() => null)
      return { status: response.status, body }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }
  const release = await get(RELEASES_URL)
  const repo = await get(REPO_URL)
  const message = (body: unknown): string =>
    typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message
      : ""
  console.log(
    `    UA               : ${headers["User-Agent"]}\n` +
      `    ${RELEASES_URL}\n` +
      `      → ${"error" in release ? `NETWORK ERROR ${release.error}` : `${String(release.status)} ${message(release.body)}`}\n` +
      `    ${REPO_URL}\n` +
      `      → ${"error" in repo ? `NETWORK ERROR ${repo.error}` : `${String(repo.status)} ${message(repo.body)}`}`,
  )
  networkReachable = !("error" in release) && !("error" in repo)
  if (!networkReachable) {
    // Not a failure of the module. Alex's corporate network blocks some hosts outright, and reporting a red
    // here would put the blame in the wrong place.
    record("B1 coordinate", "INCONCLUSIVE", `api.github.com is not reachable from this host — nothing to conclude`)
  } else if ("error" in release || "error" in repo) {
    record("B1 coordinate", "INCONCLUSIVE", "unreachable")
  } else if (release.status === 200) {
    const tag = typeof (release.body as { tag_name?: unknown }).tag_name === "string" ? (release.body as { tag_name: string }).tag_name : ""
    record(
      "B1 coordinate",
      parseTag(tag) === null ? "FAIL" : "PASS",
      parseTag(tag) === null
        ? `the endpoint answered 200 with tag_name '${tag}', which parseTag refuses — the check would report ` +
            `no update for a release that exists`
        : `200 with tag_name '${tag}', and parseTag accepts it. The URL, the UA and the parse all agree ` +
            `against the live API`,
    )
  } else if (release.status === 404 && repo.status === 200) {
    // The honest reading, and the reason the repo URL is fetched at all: GitHub returns 404 both for "this
    // repo has no releases" and for "this repo is not visible to you", and those are very different facts.
    record(
      "B1 coordinate",
      "PASS",
      `404 on /releases/latest while /repos answers 200 — the repo is public and the path is right; there ` +
        `is simply no published release yet. So the coordinate is proven and the 200 branch is NOT: the ` +
        `first real release is what exercises it, and that arm stays open`,
    )
  } else if (release.status === 404) {
    record(
      "B1 coordinate",
      "FAIL",
      `404 on /releases/latest AND ${String(repo.status)} on /repos — the repository is not publicly ` +
        `visible, so this check can never succeed for a user. Either the constant names the wrong path or ` +
        `the repo must be public before the feature ships`,
    )
  } else {
    record(
      "B1 coordinate",
      "INCONCLUSIVE",
      `unexpected status ${String(release.status)} (${message(release.body)}) — likely a rate limit or a ` +
        `proxy, neither of which says anything about the constant`,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// B2 — the User-Agent, the one thing only GitHub can adjudicate.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== B2: is the User-Agent load-bearing, or just present? ===")
if (!networkReachable) {
  record("B2 user-agent", "INCONCLUSIVE", "no network")
} else {
  // The negative control for UPD-03. If GitHub rejects this and accepts B1's request, the header is doing
  // real work and the constant is not decoration.
  const bare = await (async (): Promise<{ status: number } | { error: string }> => {
    try {
      const response = await fetch(RELEASES_URL, { headers: { "User-Agent": "" } })
      return { status: response.status }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })()
  console.log(
    `    with our UA : accepted in B1\n` +
      `    with UA ''  : ${"error" in bare ? `NETWORK ERROR ${bare.error}` : String(bare.status)}`,
  )
  if ("error" in bare) {
    record("B2 user-agent", "INCONCLUSIVE", `the bare-UA request failed at the transport: ${bare.error}`)
  } else if (bare.status === 403) {
    record(
      "B2 user-agent",
      "PASS",
      `403 with an empty User-Agent and a non-403 with ours — GitHub's documented rejection reproduced, so ` +
        `UPD-03 is a requirement rather than politeness. Dropping the header would make every check report ` +
        `"no update" forever, with no error anywhere`,
    )
  } else {
    // Do not claim enforcement that was not observed. `fetch` may be substituting its own UA for the empty
    // string, in which case the control never left this machine.
    record(
      "B2 user-agent",
      "INCONCLUSIVE",
      `an empty User-Agent got ${String(bare.status)}, not 403 — either the runtime replaced the empty ` +
        `header before it went out, or GitHub no longer enforces it. Our UA is accepted either way, which ` +
        `is what the app needs; what is unproven is that it is *required*`,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// B3 — the whole module, over the real network, end to end.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== B3: UpdateChecker against the live API, through the production adapter ===")
if (!networkReachable) {
  record("B3 end to end", "INCONCLUSIVE", "no network")
} else {
  const logs: string[] = []
  const checker = new UpdateChecker({
    version: RUNNING,
    enabled: true,
    fetchImpl: countingFetch,
    log: (level, message) => logs.push(`${level}: ${message}`),
  })
  const started = performance.now()
  const latest = await checker.check()
  const elapsed = Math.round(performance.now() - started)
  const offer = latest === null ? false : shouldOfferUpdate(RUNNING, latest)
  console.log(
    `    running     : ${RUNNING}\n` +
      `    check()     : ${latest === null ? "null" : JSON.stringify(latest)}  in ${String(elapsed)}ms\n` +
      `    offer?      : ${String(offer)}${offer && latest !== null ? `  → "${updateNoticeText(latest)}"` : ""}\n` +
      `    hasDispatched: ${String(checker.hasDispatched)}   http calls: ${String(httpHits)}\n` +
      (logs.length === 0 ? "    (no log lines)" : logs.map((l) => `    ${l}`).join("\n")),
  )
  // A `null` here is a PASS as long as it came from a dispatched request that answered. The module's whole
  // posture is silence on failure, so "null" and "broken" look identical from the outside — which is why the
  // dispatch counter and the log line are part of the assertion rather than the return value alone.
  const dispatched = checker.hasDispatched && httpHits === 1
  if (!dispatched) {
    record("B3 end to end", "FAIL", `hasDispatched=${String(checker.hasDispatched)} after ${String(httpHits)} http calls`)
  } else if (latest !== null) {
    record(
      "B3 end to end",
      "PASS",
      `a real request returned a parsed release ${JSON.stringify(latest)} in ${String(elapsed)}ms; ` +
        `shouldOfferUpdate(${RUNNING}) = ${String(offer)}` +
        (offer
          ? ` and the renderer would be sent "${updateNoticeText(latest)}" — the full path, live`
          : `. The live latest is BEHIND this port's version, so what the API exercised is the *not offered* ` +
            `branch — which is the prerelease clause's negative control firing against real data rather ` +
            `than a fixture, and it means updateNoticeText has no live input on this run. That flips on its ` +
            `own the first time a release newer than ${RUNNING} is published`),
    )
  } else {
    record(
      "B3 end to end",
      "PASS",
      `one request dispatched and answered, and the module returned null without throwing — the silent ` +
        `path, which is the correct behaviour for a repo with no published release. What this run therefore ` +
        `does NOT exercise: updateNoticeText's live input. B1 records the same gap`,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// B4 — UPD-09: a dev build makes no request. Counted at the adapter, not at a fake.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== B4: enabled=false makes zero HTTP calls ===")
{
  const before = httpHits
  const checker = new UpdateChecker({ version: RUNNING, enabled: false, fetchImpl: countingFetch })
  const result = await checker.check()
  const after = httpHits
  console.log(
    `    check() → ${result === null ? "null" : "a release"}   http calls before/after: ` +
      `${String(before)}/${String(after)}   hasDispatched: ${String(checker.hasDispatched)}`,
  )
  // The positive control is B3: the SAME adapter, incremented exactly once. Without it this arm passes
  // against an adapter that cannot make calls at all, which is the failure mode an absence arm invites.
  const ok = result === null && after === before && !checker.hasDispatched
  record(
    "B4 no dispatch when disabled",
    ok ? (networkReachable ? "PASS" : "INCONCLUSIVE") : "FAIL",
    ok
      ? networkReachable
        ? `the counter did not move, and the same adapter moved it exactly once in B3 — so this is a real ` +
            `absence, not an adapter that cannot dial. UPD-09's #if DEBUG holds at the socket`
        : `the counter did not move, but B3 could not run so there is no positive control for it — an ` +
            `absence with nothing to compare against`
      : `result=${String(result)}, calls ${String(before)}→${String(after)}, dispatched ` +
          `${String(checker.hasDispatched)}`,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// B5 + B6 — the deadline and the cancel, against a socket that really never answers.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== B5/B6: a real connection that never answers ===")
{
  let connections = 0
  const server = Bun.serve({
    port: 0,
    // Accepts, then never resolves. `server.stop(true)` is what eventually lets the process exit.
    fetch: () => {
      connections++
      return new Promise<Response>(() => {
        /* deliberately never settled */
      })
    },
  })
  const hangUrl = `http://127.0.0.1:${String(server.port)}/releases/latest`
  // The adapter ignores the module's URL and dials the local server. That substitution is the *only* thing
  // faked here: the socket, the connect, the abort and the timer are all real, and those are what B5 is
  // about. The URL constant itself is B1's arm.
  const toLocal: FetchLike = (_url, init) => fetch(hangUrl, init)
  try {
    console.log(`    local server on 127.0.0.1:${String(server.port)}, answering nothing`)

    const timeoutChecker = new UpdateChecker({ version: RUNNING, enabled: true, fetchImpl: toLocal })
    const t0 = performance.now()
    const timedOut = await timeoutChecker.check()
    const elapsed = Math.round(performance.now() - t0)
    console.log(
      `    B5 check() → ${timedOut === null ? "null" : "a release"} after ${String(elapsed)}ms ` +
        `(TIMEOUT_MS=${String(TIMEOUT_MS)}), connections: ${String(connections)}`,
    )
    // The connection count is part of the assertion: "returned null in 5s" is also what a request that never
    // left the process looks like, and those two must not be confused.
    const inWindow = elapsed >= TIMEOUT_MS - 500 && elapsed <= TIMEOUT_MS + 3_000
    record(
      "B5 the deadline is real",
      timedOut === null && connections >= 1 && inWindow ? "PASS" : "FAIL",
      timedOut === null && connections >= 1 && inWindow
        ? `the request reached the server, hung, and the ${String(TIMEOUT_MS)}ms timer aborted it at ` +
            `${String(elapsed)}ms — null returned, the AbortError swallowed, nothing thrown at the ` +
            `fire-and-forget caller`
        : `null=${String(timedOut === null)}, connections=${String(connections)}, elapsed=${String(elapsed)}ms ` +
            `against a ${String(TIMEOUT_MS)}ms budget`,
    )

    const cancelChecker = new UpdateChecker({ version: RUNNING, enabled: true, fetchImpl: toLocal })
    const c0 = performance.now()
    const inFlight = cancelChecker.check()
    // Long enough for the connect to complete, far short of the deadline.
    await Bun.sleep(150)
    const cancelled = cancelChecker.cancelInFlight()
    const cancelResult = await inFlight
    const cancelElapsed = Math.round(performance.now() - c0)
    const afterwards = cancelChecker.cancelInFlight()
    console.log(
      `    B6 cancelInFlight() → ${String(cancelled)}, check() → ${cancelResult === null ? "null" : "a release"} ` +
        `after ${String(cancelElapsed)}ms, second cancel → ${String(afterwards)}, ` +
        `hasDispatched still ${String(cancelChecker.hasDispatched)}`,
    )
    // Well under the deadline is the whole point: without a working abort this would take TIMEOUT_MS, and the
    // arm would pass on the return value alone.
    const promptly = cancelElapsed < TIMEOUT_MS - 1_000
    const ok = cancelled && cancelResult === null && promptly && !afterwards && cancelChecker.hasDispatched
    record(
      "B6 PERS-10 cancels a live socket",
      ok ? "PASS" : "FAIL",
      ok
        ? `the in-flight request was aborted at ${String(cancelElapsed)}ms rather than running to the ` +
            `${String(TIMEOUT_MS)}ms deadline, the second cancel reports false because the finally cleared ` +
            `the controller, and the once-per-launch guard is NOT restored — a re-enable mid-session still ` +
            `does nothing, which is what the C# does`
        : `cancelled=${String(cancelled)}, null=${String(cancelResult === null)}, ` +
            `elapsed=${String(cancelElapsed)}ms, second=${String(afterwards)}, ` +
            `dispatched=${String(cancelChecker.hasDispatched)}`,
    )
  } finally {
    server.stop(true)
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// B7 + B8 — the OFFERED branch, over a real socket, with the payload as the control.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== B7/B8: the offered branch, and the payload as its control ===")
{
  /** Swapped between runs. The server is otherwise identical, so the payload is the only variable. */
  let payload: Record<string, unknown> = {}
  let seenUserAgent: string | null = null
  let seenAccept: string | null = null
  const server = Bun.serve({
    port: 0,
    fetch: (req) => {
      seenUserAgent = req.headers.get("user-agent")
      seenAccept = req.headers.get("accept")
      // `Response.json` rather than a hand-built body: this gives the checker a real `Response` with a real
      // `content-type`, so `await response.json()` is the platform's parse and not a fake's `() => value`.
      return Response.json(payload)
    },
  })
  const localUrl = `http://127.0.0.1:${String(server.port)}/releases/latest`
  /** What the checker asked for, before the substitution. Asserted, so the swap cannot hide a wrong URL. */
  let requestedUrl: string | null = null
  const toLocal: FetchLike = (url, init) => {
    requestedUrl = String(url)
    return fetch(localUrl, init)
  }

  /** One full trip through the production path per payload. A fresh checker each time — UPD-01 is per-launch. */
  const run = async (
    body: Record<string, unknown>,
  ): Promise<{ tag: string | null; offered: boolean; notice: string | null }> => {
    payload = body
    const checker = new UpdateChecker({ version: RUNNING, enabled: true, fetchImpl: toLocal })
    const latest = await checker.check()
    if (latest === null) return { tag: null, offered: false, notice: null }
    const offered = shouldOfferUpdate(RUNNING, latest)
    return { tag: updateNoticeText(latest), offered, notice: offered ? updateNoticeText(latest) : null }
  }

  try {
    console.log(`    local server on 127.0.0.1:${String(server.port)}, answering GitHub-shaped JSON`)

    const offer = await run({ tag_name: "v5.0.1", draft: false, prerelease: false })
    console.log(
      `    B7 tag v5.0.1 vs running ${RUNNING} → offered=${String(offer.offered)}, notice=` +
        `${JSON.stringify(offer.notice)}, url asked for=${JSON.stringify(requestedUrl)}, ` +
        `UA on the wire=${JSON.stringify(seenUserAgent)}`,
    )
    const urlRight = requestedUrl === RELEASES_URL
    const uaOnWire = seenUserAgent === userAgent(RUNNING)
    const acceptOnWire = seenAccept === "application/vnd.github+json"
    const offerOk = offer.offered && offer.notice === "v5.0.1 available" && urlRight && uaOnWire && acceptOnWire
    record(
      "B7 the offered branch runs end to end on a real response",
      offerOk ? "PASS" : "FAIL",
      offerOk
        ? `a real 200 with a real content-type went through the production adapter, the platform's own ` +
            `\`Response.json()\`, the draft/prerelease gate, \`parseTag\` and \`shouldOfferUpdate\` and came ` +
            `out as "${String(offer.notice)}" — the first time \`updateNoticeText\` has run on bytes off a ` +
            `socket rather than on a fake's return value. The checker asked for RELEASES_URL (only the dial ` +
            `was redirected) and both headers arrived on the wire, which is the half of UPD-03 that B2 ` +
            `cannot settle: what GitHub *requires* is unproven, what we *send* is now measured at the socket`
        : `offered=${String(offer.offered)}, notice=${JSON.stringify(offer.notice)}, ` +
            `url=${String(urlRight)}, ua=${String(uaOnWire)}, accept=${String(acceptOnWire)}`,
    )

    // The control. Same server, same code, same adapter — three payloads that must all decline, including the
    // repo's actual current tag, which is the live case B3 took and the reason B7 could not exist until now.
    const live = await run({ tag_name: "v4.5.5", draft: false, prerelease: false })
    const pre = await run({ tag_name: "v5.0.1", draft: false, prerelease: true })
    const draft = await run({ tag_name: "v5.0.1", draft: true, prerelease: false })
    // The fourth is not a decline, and it is here for a failure the three above cannot see: three payloads that
    // all say "no" leave "the notice string is a constant" perfectly alive, since B7 is then the only arm that
    // ever produced one. A second, different, newer tag is what forces the digits to come off the wire.
    const other = await run({ tag_name: "v6.2.3", draft: false, prerelease: false })
    console.log(
      `    B8 v4.5.5 → offered=${String(live.offered)}; v5.0.1 prerelease → tag=${JSON.stringify(pre.tag)}; ` +
        `v5.0.1 draft → tag=${JSON.stringify(draft.tag)}; v6.2.3 → notice=${JSON.stringify(other.notice)}`,
    )
    const controlOk =
      !live.offered &&
      live.notice === null &&
      pre.tag === null &&
      draft.tag === null &&
      other.notice === "v6.2.3 available"
    record(
      "B8 control: the payload is what decides, not the code path",
      controlOk ? "PASS" : "FAIL",
      controlOk
        ? `the only thing that changed between B7 and these four is the bytes on the wire. v4.5.5 — the ` +
            `tag the live API actually serves — is declined, so B7's green is the payload rather than a code ` +
            `path that always offers; the draft/prerelease gate is now shown firing on a tag that IS newer, ` +
            `where before it was only ever exercised against one that was not; and v6.2.3 comes back as ` +
            `"${String(other.notice)}", so the digits in the notice are read off the response rather than ` +
            `being a constant that happens to match B7`
        : `live offered=${String(live.offered)}/notice=${JSON.stringify(live.notice)}, ` +
            `prerelease tag=${JSON.stringify(pre.tag)}, draft tag=${JSON.stringify(draft.tag)}, ` +
            `other notice=${JSON.stringify(other.notice)}`,
    )
  } finally {
    server.stop(true)
  }
}

console.log("=== summary ===")
for (const r of results) console.log(`${r.verdict.padEnd(13)} ${r.name}`)
const passed = results.filter((r) => r.verdict === "PASS").length
const failed = results.filter((r) => r.verdict === "FAIL").length
const inconclusive = results.filter((r) => r.verdict === "INCONCLUSIVE").length
console.log(`\n${String(passed)} passed / ${String(failed)} failed / ${String(inconclusive)} inconclusive`)
console.log(
  "\nStill unproven by anything in this file:\n" +
    "  - that GITHUB serves a newer release in the shape B7 assumes. B7 closed the offered branch over a\n" +
    "    real socket, so fetch → real `Response.json()` → gate → parse → decide → notice text is covered on\n" +
    "    bytes off the wire; what is still local is the wire itself. The repo's latest release is behind\n" +
    "    this port's version, so the LIVE decision is `false` (B3) and no live 200 has ever carried a newer\n" +
    "    tag. Closes itself the first time one is published — and if GitHub's real payload disagrees with\n" +
    "    B7's fixture, B1 is the arm that would notice, because it prints the live body's `tag_name`.\n" +
    "  - that the notice reaches the screen. `main.ts` holds the text until the renderer says ready, and\n" +
    "    the pixel arms are `probe:fade` and `probe:pixels`.",
)
process.exit(failed > 0 ? 1 : 0)
