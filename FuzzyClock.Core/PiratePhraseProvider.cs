namespace FuzzyClock.Core;

/// <summary>
/// Pirate-speak phrase provider (en-pirate).
/// Uses nautical and pirate vocabulary: arr, yarr, shiver me timbers.
/// </summary>
public class PiratePhraseProvider : IPhraseProvider
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
        ( 2, "{h} bells, arr"),
        ( 7, "just past {h} bells, yarr"),
        (12, "ten past {h}, arr"),
        (17, "a quarter past {h}, yarr"),
        (22, "past the quarter bell of {h}"),
        (27, "nigh on half past {h}, arr"),
        (32, "half past {h}, arr"),
        (37, "just past the half bell, yarr"),
        (42, "nigh on a quarter to {h1}"),
        (47, "a quarter to {h1}, arr"),
        (52, "nearly {h1}, yarr"),
        (59, "almost {h1}, shiver me timbers"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "high noon at sea, arr";
        if (totalMinutes == 0)   return "the dead of night, yarr";

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
