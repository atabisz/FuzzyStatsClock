/**
 * Uptime formatting, ported from FuzzyClock.Core/UptimeFormatter.cs.
 *
 * Leading-zero-unit suppression, which is the whole behaviour: "up 45m" under an hour, "up 5h 30m"
 * under a day, "up 1d 2h 15m" past one. Once a larger unit appears the smaller ones are shown even
 * when zero -- "up 1d 0h 0m" -- so the string never loses a field it has already earned.
 *
 * The C# takes a `TimeSpan` and reads `.Days`, `.Hours`, `.Minutes`, which are the *components* of the
 * span rather than totals. There is no TimeSpan here, and the value the app actually has is
 * `process.uptime()` in seconds, so the components are computed instead. That arithmetic is the only
 * part that had to be written rather than translated, hence `Math.trunc`: `TimeSpan`'s components
 * truncate toward zero, and .NET reads -330s as `Minutes = -5`, not -6.
 *
 * **Where that choice is observable, measured rather than assumed.** JS `%` already keeps the sign of
 * the dividend, so `Math.floor` and `Math.trunc` agree on every positive input and on any negative one
 * whose quotient lands on an integer -- mutating the minutes line to `Math.floor` left a -300s span
 * reading "up -5m" either way. The difference appears only for a negative span with a sub-minute
 * remainder (-330s: -5m truncated, -6m floored), which is why that is the case the test pins. On the
 * days and hours lines the two are equivalent for *every* reachable input, since a negative component
 * fails the `> 0` guard identically whichever way it rounded -- so there is nothing there for a test to
 * hold, and the consistency is for the reader rather than for the output.
 *
 * No "no reading yet" case, deliberately. The C# has none, and the renderer's own copy of this used to
 * return "up —" for a non-positive value -- a claim about a sample that has not arrived, which is not a
 * formatting rule. That state is expressed where it belongs instead: `index.html` ships the literal
 * "up —" as the node's initial text, so it shows until the first sample and never comes back.
 */

const SECONDS_PER_DAY = 86_400
const SECONDS_PER_HOUR = 3_600
const SECONDS_PER_MINUTE = 60

/** `UptimeFormatter.Format(TimeSpan)`, over a count of seconds. */
export function formatUptime(totalSeconds: number): string {
  const whole = Math.trunc(totalSeconds)
  const days = Math.trunc(whole / SECONDS_PER_DAY)
  const hours = Math.trunc((whole % SECONDS_PER_DAY) / SECONDS_PER_HOUR)
  const minutes = Math.trunc((whole % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)

  if (days > 0) return `up ${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `up ${hours}h ${minutes}m`
  return `up ${minutes}m`
}
