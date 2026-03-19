namespace FuzzyClock.Core;

/// <summary>
/// Yoda-speak phrase provider (en-yoda).
/// Uses inverted Yoda syntax with characteristic affirmations: it is, hmm, yes, mmm, we are.
/// </summary>
public class YodaPhraseProvider : IPhraseProvider
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
        ( 2, "{h} o'clock, it is"),
        ( 7, "past {h}, just gone it is"),
        (12, "ten past {h}, mmm"),
        (17, "quarter past {h}, yes"),
        (22, "past the quarter of {h}, it is"),
        (27, "near half past {h}, we are"),
        (32, "half past {h}, mmm"),
        (37, "past the half, just"),
        (42, "quarter to {h1}, nearly"),
        (47, "quarter to {h1}, it is"),
        (52, "nearly {h1}, yes"),
        (59, "{h1} approaches"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "noon it is, hmm";
        if (totalMinutes == 0)   return "midnight, the dark hour, yes";

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

    public string GetSegmentKey(DateTime dt) => GetPhrase(dt);
}
