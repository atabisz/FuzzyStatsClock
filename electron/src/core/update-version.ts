/**
 * Release-tag parsing and version ordering, ported from FuzzyClock.Core/UpdateVersionComparer.cs.
 *
 * Two shape changes, both forced, and both measured against the real C# before being made (probe
 * output is in the ISA's Verification table row for this file).
 *
 * **1. `TryParseTag(string?, out Version)` becomes `parseTag(): Version | null`.** Not merely because
 * `out` has no counterpart here -- the C#'s only production caller is already
 * `TryParseTag(tag, out var v) ? v : null` (UpdateCheckService.cs:138), so a nullable return is the
 * shape the app actually wants. It also removes a latent trap: `Version.TryParse` writes **null** into
 * its out-parameter on failure, clobbering the `new Version(0, 0)` the C# assigns on entry, so line
 * 16's "sentinel out-value" comment is false for every rejection that reaches line 33 ("garbage", "4",
 * "4.x.0" -- measured). The out is annotated non-nullable, so a caller that trusted the sentinel and
 * skipped the bool would NRE rather than read 0.0. No caller does; the WPF app is correct today by
 * habit rather than by type. `Version | null` makes the trap unrepresentable.
 *
 * **2. `System.Version` becomes a plain object with -1 for an absent component.** The -1 is not an
 * implementation detail to be tidied away: it is the entire reason `Normalize` exists, since
 * `System.Version`'s own `operator>` sorts Build=-1 BELOW Build=0 -- measured, `4.5.0 > 4.5` is true
 * raw. Normalizing at parse time instead would make `isNewer` trivial and quietly delete that
 * distinction, along with the discriminating power of the test that covers it. It is also live: the
 * app compares a 4-component assembly version against a 3-component release tag
 * (MainWindow.xaml.cs:1321-1322), so the promotion runs in production on every check.
 *
 * **Where the port is deliberately stricter than the C#, measured not assumed.** .NET parses each
 * component with `NumberStyles.Integer`, which allows leading whitespace and a leading `+` *inside* a
 * component, so `Version.TryParse("4. 5")` returns 4.5 -- and since the `+` is caught earlier by the
 * explicit guard but a space is not, `TryParseTag("4. 5")` returns true. This port's shape check
 * rejects it. That is an accident of the number parser rather than a rule anyone wrote, it cannot
 * arise from a GitHub tag, and the direction is the safe one: rejecting a tag the C# accepted means
 * "no update offered", never a bogus update offered. The divergence is pinned by a test so it stays
 * visible.
 */

/** An absent component. `System.Version` reports -1 for Build/Revision it was not given. */
const ABSENT = -1

/** `int.MaxValue`. `Version.TryParse` rejects a component above this; measured, 4.2147483648 is false. */
const MAX_COMPONENT = 2_147_483_647

/**
 * Two to four dot-separated runs of digits, nothing else. JS `\d` is ASCII-only, which matches .NET's
 * invariant number parser -- Arabic-Indic "٤.٥" is rejected by both.
 */
const TAG_SHAPE = /^\d+(?:\.\d+){1,3}$/

/** The four components of a version, with -1 for any the tag omitted. */
export interface Version {
  readonly major: number
  readonly minor: number
  readonly build: number
  readonly revision: number
}

/**
 * `UpdateVersionComparer.TryParseTag`, as a nullable return.
 *
 * Accepts a GitHub-style tag: "v4.5.0", "4.5", "4.5.0.0". Rejects null/empty/whitespace, prerelease
 * suffixes, build metadata, and any non-numeric or over-large component.
 */
export function parseTag(tag: string | null | undefined): Version | null {
  if (tag === null || tag === undefined) return null

  const trimmed = tag.trim()
  if (trimmed.length === 0) return null

  // Strip a single leading 'v' or 'V'. Preserves the GitHub convention of "v4.5.0" tags. Not
  // "version " and not a second 'v' -- the rule stays narrow, and "vv4.5.0" is rejected.
  const bare = trimmed[0] === "v" || trimmed[0] === "V" ? trimmed.slice(1) : trimmed

  // Prerelease and build metadata are never an update. TAG_SHAPE already rejects both, so this
  // guard changes no answer today and is kept anyway: it states the RULE, independently of the
  // shape regex, which is the part most likely to be loosened later. Expect a mutation here to
  // survive -- it is equivalent by construction, not an untested branch.
  if (bare.includes("-") || bare.includes("+")) return null

  if (!TAG_SHAPE.test(bare)) return null

  // Safe after the shape check: every part is a run of ASCII digits, so Number() is finite and
  // non-negative. The `= ABSENT` defaults carry the 2- and 3-component cases; the first two are
  // unreachable, since TAG_SHAPE requires at least two components.
  const [major = ABSENT, minor = ABSENT, build = ABSENT, revision = ABSENT] = bare
    .split(".")
    .map(Number)

  if (major > MAX_COMPONENT || minor > MAX_COMPONENT) return null
  if (build > MAX_COMPONENT || revision > MAX_COMPONENT) return null

  return { major, minor, build, revision }
}

/**
 * `UpdateVersionComparer.IsNewer`. True iff `latest` is strictly greater than `running`; equal
 * returns false (UPD-02). Absent components count as 0, so "4.5", "4.5.0" and "4.5.0.0" are equal.
 */
export function isNewer(running: Version, latest: Version): boolean {
  return isGreater(normalize(latest), normalize(running))
}

/** Promote an absent component to 0, so 2-, 3- and 4-component versions compare as 4-component. */
function normalize(version: Version): Version {
  return {
    major: version.major,
    minor: version.minor,
    build: version.build < 0 ? 0 : version.build,
    revision: version.revision < 0 ? 0 : version.revision,
  }
}

/** `operator>` over normalized components: first difference decides. */
function isGreater(a: Version, b: Version): boolean {
  if (a.major !== b.major) return a.major > b.major
  if (a.minor !== b.minor) return a.minor > b.minor
  if (a.build !== b.build) return a.build > b.build
  return a.revision > b.revision
}
