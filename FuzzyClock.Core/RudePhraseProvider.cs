namespace FuzzyClock.Core;

/// <summary>
/// Blunt callout phrase provider (en-rude).
/// Uses direct phrases with attitude, including callout suffixes on selected entries.
/// </summary>
public class RudePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    // Bucket table: each entry is (upperBound inclusive, template).
    // Walk in order; return the first match where minute <= upperBound.
    // {h}  = current hour in 12-hour format (1–12)
    // {h1} = next hour in 12-hour format (1–12, wraps after 12)
    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "exactly {h}, what do you want"),
        ( 7, "just gone {h}"),
        (12, "ten past {h}, wake up"),
        (17, "quarter past {h}"),
        (22, "gone quarter past {h}"),
        (27, "nearly half past {h}"),
        (32, "half past {h}, still here?"),
        (37, "just gone half past {h}"),
        (42, "almost quarter to {h1}"),
        (47, "quarter to {h1}"),
        (52, "nearly {h1}, move it"),
        (59, "almost {h1}, get on with it"),
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
