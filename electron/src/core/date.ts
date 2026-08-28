/**
 * Date line formatting, ported from FuzzyClock.Core/DateFormatter.cs.
 *
 * Four named formats and a fallback, from the `DateFormat` setting (default "Short", validated to the
 * same four names by `SettingsService.cs:104-107`):
 *
 *   Short   "ddd, MMM d"    Sat, Mar 7
 *   Long    "dddd, MMMM d"  Saturday, March 7
 *   Numeric "M/d/yyyy"      3/7/2026
 *   ISO     "yyyy-MM-dd"    2026-03-07
 *
 * ## Why this is assembled field by field instead of handed to one formatter
 *
 * A .NET custom format string is placeholders plus literals, and each placeholder is resolved against
 * the current culture *independently* -- the field ORDER is fixed by the pattern and never reordered.
 * `Intl.DateTimeFormat` does the opposite: given `{weekday, month, day}` it emits the whole thing in
 * the locale's own order, so on en-AU the same options produce "Sat, 7 Mar" where the C# produces
 * "Sat, Mar 7". Asking Intl for one field at a time restores .NET's semantics exactly: the locale
 * supplies the *names*, this file supplies the order and the literals.
 *
 * That is also why only Short and Long consult a locale at all. Numeric and ISO have no name-bearing
 * fields, so they are built from the date's own components -- no formatter, nothing to reorder.
 *
 * ## The one divergence, stated rather than hidden
 *
 * In a .NET custom format string `/` is not a literal: it is replaced by the culture's `DateSeparator`,
 * so "M/d/yyyy" renders with `.` on de-DE. This port pins `/`. Every culture this app has run under
 * uses `/`, the panel is a fixed-width overlay where a stable string matters more than a separator,
 * and a per-locale separator is not something `Intl` exposes without parsing a formatted date back
 * apart. If that becomes wrong it is one line here.
 *
 * `locale` is a parameter rather than a read of the host default so a test can pin it. Left undefined
 * it *is* the host default, which is what `CurrentCulture` gives the C#.
 */

/** The four names `SettingsService` will accept. Anything else falls back to Short, as in the C#. */
export type DateFormatName = "Short" | "Long" | "Numeric" | "ISO"

/** One Intl field, as a name. Constructing per call is fine: this runs once a minute at most. */
function namePart(
  date: Date,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, options).format(date)
}

/**
 * `DateFormatter.Format(string, DateTime)`.
 *
 * Takes `string` rather than `DateFormatName` on purpose: the value arrives from a settings file that
 * can hold anything, and the C# contract is that an unrecognised name silently becomes Short. Typing
 * the parameter narrowly would move that decision to the call site, where the WPF original does not
 * have it.
 */
export function formatDate(format: string, date: Date, locale?: string): string {
  switch (format) {
    case "Long":
      return `${namePart(date, locale, { weekday: "long" })}, ${namePart(date, locale, { month: "long" })} ${date.getDate()}`
    case "Numeric":
      return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
    case "ISO":
      return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    default:
      // "Short" and every unknown value. The C# comment on this arm says the same thing.
      return `${namePart(date, locale, { weekday: "short" })}, ${namePart(date, locale, { month: "short" })} ${date.getDate()}`
  }
}
