namespace FuzzyClock.Core;

public static class DateFormatter
{
    /// <summary>
    /// Formats a date using the named format.
    /// "Short"   → "ddd, MMM d"    e.g. "Sat, Mar 7"
    /// "Long"    → "dddd, MMMM d"  e.g. "Saturday, March 7"
    /// "Numeric" → "M/d/yyyy"      e.g. "3/7/2026"
    /// "ISO"     → "yyyy-MM-dd"    e.g. "2026-03-07"
    /// Any other value falls back to Short.
    /// </summary>
    public static string Format(string format, DateTime date) => format switch
    {
        "Long"    => date.ToString("dddd, MMMM d"),
        "Numeric" => date.ToString("M/d/yyyy"),
        "ISO"     => date.ToString("yyyy-MM-dd"),
        _         => date.ToString("ddd, MMM d"),   // "Short" + unknown -> Short
    };
}
