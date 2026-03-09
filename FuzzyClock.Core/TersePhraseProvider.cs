namespace FuzzyClock.Core;

/// <summary>
/// British-idiom terse phrase provider (en-terse).
/// Uses compact forms like "three", "quarter past three", "half four" (British half = half past X-1).
/// </summary>
public class TersePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    // Bucket table: each entry is (upperBound inclusive, template).
    // Walk in order; return the first match where minute <= upperBound.
    // {h}  = current hour in 12-hour format (1–12)
    // {h1} = next hour in 12-hour format (1–12, wraps after 12)
    // Note: bucket 27 uses "{h1}" for the British "half X" idiom (3:30 → "half four").
    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "{h}"),
        ( 7, "just gone {h}"),
        (12, "ten past {h}"),
        (17, "quarter past {h}"),
        (22, "twenty past {h}"),
        (32, "half {h1}"),        // British: "half four" means 3:30 (half before the next hour)
        (37, "just gone half {h}"),
        (42, "twenty to {h1}"),
        (47, "quarter to {h1}"),
        (52, "ten to {h1}"),
        (59, "nearly {h1}"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "noon";
        if (totalMinutes == 0)   return "midnight";

        int minute = dt.Minute;

        int hour12 = dt.Hour % 12;
        if (hour12 == 0) hour12 = 12;

        int nextHour12 = (hour12 % 12) + 1;

        foreach (var (upperBound, template) in Buckets)
        {
            if (minute <= upperBound)
            {
                return template
                    .Replace("{h}",  HourWords[hour12])
                    .Replace("{h1}", HourWords[nextHour12]);
            }
        }

        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }

    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) =>
        ("", GetPhrase(dt));
}
