/**
 * The once-per-launch GitHub Releases check, ported from `FuzzyClock.App/UpdateCheckService.cs` (ISC-29).
 *
 * The C# is 194 lines of `HttpClient` lifetime management around one GET. Most of that does not survive
 * the port because it has no counterpart here -- there is no `SocketsHttpHandler` to give a
 * `PooledConnectionLifetime`, no static-client-versus-injected-client split, and no three-tier dispose,
 * because `fetch` owns its own connection pool and the process exit reaps it. What survives is every
 * *behavioural* rule, and those are numbered in the original:
 *
 * - **UPD-10** the URL is a hard-coded constant and is NEVER read from settings. That is a security rule,
 *   not a tidiness one: a settings file is user-writable, and a redirectable update URL turns "someone
 *   edited a JSON file" into "the app fetches an attacker's release feed". {@link RELEASES_URL} is the
 *   only URL this module knows.
 * - **UPD-03** the `User-Agent` header is REQUIRED. GitHub's own words: "Requests without a User-Agent
 *   header will be rejected with a 403 Forbidden response." The C# sends `FuzzyClock/{version}` and so
 *   does this.
 * - **UPD-02** strictly newer only; equal is not an update.
 * - **UPD-09** a development build never dispatches the call at all, so a dev screenshot cannot show a
 *   nonsense notice. The C# gets this from `#if DEBUG`; the port takes {@link UpdateCheckOptions.enabled}
 *   from `app.isPackaged`, which is the same intent through the only signal Electron has.
 * - **UPD-07 / silent-failure posture** every failure mode returns `null`. A missed update check is
 *   invisible by design; a dialog about a failed one would be worse than the thing it reports.
 * - **PERS-10** a mid-session toggle OFF cancels an in-flight call ({@link UpdateChecker.cancelInFlight}).
 *
 * ## Two things the C# could not need, both measured on this tree
 *
 * **1. The running version is not parseable by the comparer.** The C# reads
 * `Assembly.GetName().Version`, which is always four numeric components. `app.getVersion()` returns
 * `package.json`'s version, which is **`5.0.0-alpha.0`** today -- and `parseTag` rejects a prerelease
 * suffix outright (`core/update-version.ts`, deliberately). Feeding it straight in yields `null` and a
 * check that can never offer anything. {@link parseRunningVersion} takes the numeric core.
 *
 * **2. A prerelease has to be superseded by its own final release.** With the core alone, a `5.0.0-alpha.0`
 * build compares EQUAL to a released `v5.0.0`, and UPD-02 says equal is not an update -- so the one user
 * running an alpha is the one user who never hears that 5.0.0 shipped. {@link shouldOfferUpdate} adds
 * exactly one rule to `isNewer`: a prerelease is superseded by its own release. It lives here rather than
 * in `core/update-version.ts` on purpose -- that file is a 1:1 port with a C#-parity suite behind it, and
 * teaching it about prereleases would make it diverge from the thing it is a port of.
 */

import { isNewer, parseTag, type Version } from "../core/update-version.js"

/**
 * UPD-10: the only URL, hard-coded. Verified against `git remote get-url origin` -- the repo is
 * `atabisz/FuzzyStatsClock`, and the C# carries the same coordinate at `UpdateCheckService.cs:26-27`.
 */
export const RELEASES_URL = "https://api.github.com/repos/atabisz/FuzzyStatsClock/releases/latest"

/** UPD-03. Format matches the C#'s `FuzzyClock/{version}` so GitHub's logs read the same for both apps. */
export function userAgent(version: string): string {
  return `FuzzyClock/${version}`
}

/** The 5-second budget, from `UpdateCheckService.cs:110`. */
export const TIMEOUT_MS = 5_000

/** What `/releases/latest` gives us, narrowed to the three fields the C# deserialises. */
interface GitHubRelease {
  readonly tag_name?: unknown
  readonly draft?: unknown
  readonly prerelease?: unknown
}

/**
 * The numeric core of a semver-ish version string, for the RUNNING version only.
 *
 * `5.0.0-alpha.0` -> `5.0.0`; `5.0.0+build.7` -> `5.0.0`; `5.0.0` unchanged. Returns null for anything
 * whose core still will not parse, which keeps the silent-failure posture: an unparseable own version
 * means no check rather than a crash at startup.
 *
 * **Not `parseTag`'s job.** `parseTag` reads a value from the network and rejecting a prerelease TAG is
 * correct there -- GitHub `/releases/latest` already filters prereleases server-side, and a `v5.1.0-rc.1`
 * that reached us anyway must not be offered. This function reads a value from our own `package.json`.
 * Same shape, opposite trust, so they are separate functions.
 */
export function parseRunningVersion(version: string): Version | null {
  const core = version.split("-")[0]?.split("+")[0] ?? ""
  return parseTag(core)
}

/** True when a version string carried a prerelease suffix -- `-alpha.0`, `-rc.1`, `-beta`. */
export function isPrerelease(version: string): boolean {
  return version.includes("-")
}

/**
 * UPD-02, plus the one rule the C# could not need.
 *
 * `isNewer` decides every ordinary case. The extra clause is narrow on purpose: it fires only when the
 * running build is a prerelease AND the latest release has the same numeric core, i.e. exactly "the final
 * release of the very version I am an alpha of". `5.0.0-alpha.0` is offered `v5.0.0` and `v5.1.0`, and is
 * NOT offered `v4.9.0` -- the clause cannot promote an older release, because it requires equal cores.
 */
export function shouldOfferUpdate(runningVersion: string, latest: Version): boolean {
  const running = parseRunningVersion(runningVersion)
  if (running === null) return false
  if (isNewer(running, latest)) return true
  return isPrerelease(runningVersion) && sameCore(running, latest)
}

/**
 * Equal on all four components, with an absent component counting as 0.
 *
 * Derived from `isNewer` rather than re-implemented: equal is exactly "neither is newer". Writing the
 * four comparisons out again here would duplicate `normalize`'s absent-component promotion -- the one
 * piece of that file with a C#-behaviour subtlety behind it (`System.Version` sorts Build=-1 BELOW
 * Build=0) -- and a duplicate of it could drift out of step with the original while both still passed.
 */
function sameCore(a: Version, b: Version): boolean {
  return !isNewer(a, b) && !isNewer(b, a)
}

/** The one network call, injected. `globalThis.fetch` in production; a fake in every test. */
export type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
}>

export interface UpdateCheckOptions {
  /** `app.getVersion()`. */
  readonly version: string
  /**
   * UPD-09. `app.isPackaged` in production: false in a dev run, which must not dispatch at all.
   *
   * Note what this does NOT include: the user's `updateChecksEnabled` setting. The caller gates on that,
   * exactly as `MainWindow.xaml.cs:207-210` does -- the service is constructed unconditionally there so
   * the dispose tiers never see a null, and the *kickoff* is what the setting controls.
   */
  readonly enabled: boolean
  readonly fetchImpl: FetchLike
  readonly log?: (level: "info" | "warn" | "error", message: string) => void
}

/**
 * One check per launch, cancellable, silent on every failure.
 *
 * Not a free function because two pieces of state outlive the call: the once-per-launch guard and the
 * in-flight controller PERS-10 needs. The C# holds the same two in the same place.
 */
export class UpdateChecker {
  private readonly version: string
  private readonly enabled: boolean
  private readonly fetchImpl: FetchLike
  private readonly log: (level: "info" | "warn" | "error", message: string) => void

  /** UPD-01: once per launch. Set before the await, so two synchronous calls cannot both dispatch. */
  private dispatched = false
  private controller: AbortController | null = null

  constructor(options: UpdateCheckOptions) {
    this.version = options.version
    this.enabled = options.enabled
    this.fetchImpl = options.fetchImpl
    this.log = options.log ?? ((): void => {})
  }

  /** True once {@link check} has dispatched, so a re-enable mid-session correctly does nothing. */
  get hasDispatched(): boolean {
    return this.dispatched
  }

  /**
   * The check. Returns the version to offer, or null -- and null is the answer for every failure, for
   * "no newer release", and for a dev build.
   */
  async check(): Promise<Version | null> {
    if (!this.enabled) {
      // UPD-09. Logged rather than silent: a dev run that seems to be ignoring the setting should say why.
      this.log("info", "update: skipped — development build (UPD-09)")
      return null
    }
    if (this.dispatched) {
      this.log("info", "update: skipped — already checked this launch (UPD-01)")
      return null
    }
    this.dispatched = true

    const controller = new AbortController()
    this.controller = controller
    // A timer rather than `AbortSignal.timeout`, because the same signal has to serve BOTH deadlines: the
    // 5-second budget and PERS-10's mid-session cancel. `AbortSignal.timeout` cannot be aborted early by
    // us, and `AbortSignal.any` would need two objects to reason about at every failure site.
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await this.fetchImpl(RELEASES_URL, {
        headers: {
          // UPD-03. Without this GitHub answers 403 and every check silently reports "no update".
          "User-Agent": userAgent(this.version),
          Accept: "application/vnd.github+json",
        },
        signal: controller.signal,
      })
      if (!response.ok) {
        // 403 / 404 / 429 all land here. Rate limiting is the common one and it is not an error worth
        // surfacing -- the check runs once per launch, so the next launch tries again.
        this.log("warn", `update: HTTP ${String(response.status)} — no notice shown`)
        return null
      }
      const body = (await response.json()) as GitHubRelease | null
      if (body === null || typeof body !== "object") {
        this.log("warn", "update: response body was not an object")
        return null
      }
      // `/releases/latest` filters draft and prerelease server-side. Checked anyway, and the C# says why:
      // a future API change must not be able to surface a draft tag to the user. `=== true` rather than
      // truthiness, because these arrive from a process boundary.
      if (body.draft === true || body.prerelease === true) {
        this.log("info", "update: latest release is a draft or prerelease — ignored")
        return null
      }
      const tag = typeof body.tag_name === "string" ? body.tag_name : null
      const parsed = parseTag(tag)
      if (parsed === null) {
        this.log("warn", `update: unparseable tag ${JSON.stringify(tag)}`)
        return null
      }
      this.log("info", `update: latest release is ${String(tag)}`)
      return parsed
    } catch (error) {
      // The C#'s six narrow catches collapse to one here, and the width is not carelessness: `fetch`
      // rejects with a `TypeError` for a network failure and an `AbortError` for both deadlines, and
      // neither is distinguishable by type in a way that changes the answer. The answer is null for all of
      // them, which is the posture UPD-07 encodes.
      this.log("warn", `update: check failed — ${error instanceof Error ? error.message : String(error)}`)
      return null
    } finally {
      clearTimeout(timer)
      this.controller = null
    }
  }

  /**
   * PERS-10: cancel an in-flight call without disposing anything.
   *
   * Returns whether there was a call to cancel, so the caller can log honestly. Does NOT clear the
   * once-per-launch guard -- the C# does not either, and the reason is stated at
   * `MainWindow.xaml.cs:817-819`: toggling back ON mid-session is a no-op, so a re-check needs a restart.
   */
  cancelInFlight(): boolean {
    const controller = this.controller
    if (controller === null) return false
    controller.abort()
    this.controller = null
    this.log("info", "update: in-flight check cancelled (PERS-10)")
    return true
  }
}

/** `v4.5.0 available` -- `ShowUpdateNotice`'s string, with the leading `v` synthesised (UI-02). */
export function updateNoticeText(version: Version): string {
  const parts = [version.major, version.minor]
  if (version.build >= 0) parts.push(version.build)
  if (version.revision >= 0) parts.push(version.revision)
  return `v${parts.join(".")} available`
}
