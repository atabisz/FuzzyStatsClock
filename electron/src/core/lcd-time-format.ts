/**
 * The LCD/Nixie clock face's time string, ported from FuzzyClock.App/LcdTimeFormatHelper.cs.
 *
 * Not `Intl` and not `toLocaleTimeString`, on purpose. The C# builds this from the DateTime's own
 * components with `D2` padding and a hand-written 12-hour fold, so it is culture-independent by
 * construction -- and it has to be: the string is drawn one glyph per seven-segment cell, so a locale
 * that inserted a dot, a narrow no-break space or "PM" would push characters past the cell count.
 *
 * The one detail that looks like a bug and is not: 12-hour mode pads the hour with a LEADING SPACE
 * rather than a zero, so " 2:05" and "12:05" occupy the same width and the colon never moves. A blank
 * cell is what the original does and what the segment renderer expects.
 *
 * Reads local-time components, which is what `DateTime.Now` gives the C#.
 */

/** `now.Hour:D2` and friends. */
function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/** `LcdTimeFormatHelper.FormatTime`. */
export function formatLcdTime(now: Date, use24Hr: boolean, showSeconds: boolean): string {
  const minute = pad2(now.getMinutes())
  const tail = showSeconds ? `:${pad2(now.getSeconds())}` : ""

  if (use24Hr) return `${pad2(now.getHours())}:${minute}${tail}`

  const hour12 = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12
  const hour = hour12 < 10 ? ` ${hour12}` : `${hour12}`
  return `${hour}:${minute}${tail}`
}
