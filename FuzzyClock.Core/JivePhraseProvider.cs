namespace FuzzyClock.Core;

/// <summary>
/// 1940s Harlem jive-speak phrase provider (en-jive).
/// Uses jazz-era slang: daddy-o, dig it, solid, cat, real gone, in the groove, blow your wig.
/// </summary>
public class JivePhraseProvider : IPhraseProvider
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
        ( 2, "{h} on the nose, daddy-o"),
        ( 7, "just past {h}, dig it"),
        (12, "ten past {h}, solid"),
        (17, "quarter past {h}, you hip?"),
        (22, "past the quarter, cat"),
        (27, "near half past {h}, real gone"),
        (32, "half past {h}, in the groove"),
        (37, "just past half {h}, daddy-o"),
        (42, "almost quarter to {h1}, dig"),
        (47, "quarter to {h1}, solid"),
        (52, "nearly {h1}, blow your wig"),
        (59, "almost {h1}, that's the deal"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "high noon, daddy-o";
        if (totalMinutes == 0)   return "the witching hour, cat";

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
