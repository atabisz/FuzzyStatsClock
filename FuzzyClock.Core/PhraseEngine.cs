namespace FuzzyClock.Core;

public static class PhraseEngine
{
    // Bucket table: each entry is (upperBound inclusive, template).
    // Walk in order; return the first match where minute <= upperBound.
    // {h}  = current hour in 12-hour format (1–12)
    // {h1} = next hour in 12-hour format (1–12, wraps after 12)
    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "{h} o'clock"),
        ( 7, "just after {h}"),
        (12, "ten past {h}"),
        (17, "a quarter past {h}"),
        (22, "just after quarter past {h}"),
        (27, "almost half past {h}"),
        (32, "half past {h}"),
        (37, "just past half past {h}"),
        (42, "almost a quarter before {h1}"),
        (47, "a quarter before {h1}"),
        (52, "nearly {h1}"),
        (59, "almost {h1}"),
    ];

    public static string GetPhrase(DateTime dt)
    {
        // Special cases: check exact total minutes from midnight
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "noon";      // 12:00:00
        if (totalMinutes == 0)   return "midnight";  // 00:00:00

        int minute = dt.Minute;

        // 12-hour clock: 0 and 12 both become 12; 13-23 become 1-11
        int hour12     = dt.Hour % 12;
        if (hour12 == 0) hour12 = 12;

        // Next hour wraps: 12 -> 1, others just +1
        int nextHour12 = (hour12 % 12) + 1;

        foreach (var (upperBound, template) in Buckets)
        {
            if (minute <= upperBound)
            {
                return template
                    .Replace("{h}",  hour12.ToString())
                    .Replace("{h1}", nextHour12.ToString());
            }
        }

        // Should never reach here given the :55 bucket covers minutes 0-59
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }
}
