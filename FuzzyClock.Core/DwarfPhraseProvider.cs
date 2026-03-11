namespace FuzzyClock.Core;

/// <summary>
/// Dwarf-speak phrase provider (en-dwarf).
/// Uses terse, gruff vocabulary: aye, bah, by the stone, quit yer dawdlin.
/// </summary>
public class DwarfPhraseProvider : IPhraseProvider
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
        ( 2, "{h}, aye"),
        ( 7, "just past {h}, move on"),
        (12, "ten past {h}, bah"),
        (17, "a quarter past {h}"),
        (22, "past the quarter, aye"),
        (27, "near half past {h}"),
        (32, "half past {h}, get to work"),
        (37, "just past half {h}, eh"),
        (42, "near a quarter to {h1}"),
        (47, "quarter to {h1}, by the stone"),
        (52, "nearly {h1}, aye"),
        (59, "almost {h1}, quit yer dawdlin"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "midday. eat.";
        if (totalMinutes == 0)   return "deep into the night, bah";

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
