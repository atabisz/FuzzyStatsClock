namespace FuzzyClock.Core;

/// <summary>
/// German phrase provider (de).
/// Standard High German; "halb X" means half past X-1 (same as British terse).
/// Uses standard High German register: "Mittag", "Mitternacht", "Viertel nach", "halb", etc.
/// </summary>
public class GermanPhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "ein Uhr", "zwei Uhr", "drei Uhr", "vier Uhr", "fünf Uhr",
             "sechs Uhr", "sieben Uhr", "acht Uhr", "neun Uhr", "zehn Uhr",
             "elf Uhr", "zwölf Uhr"];

    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "{h}"),
        ( 7, "kurz nach {h}"),
        (12, "zehn nach {h}"),
        (17, "Viertel nach {h}"),
        (22, "zwanzig nach {h}"),
        (27, "kurz vor halb {h1}"),
        (32, "halb {h1}"),
        (37, "kurz nach halb {h1}"),
        (42, "zwanzig vor {h1}"),
        (47, "Viertel vor {h1}"),
        (52, "zehn vor {h1}"),
        (59, "kurz vor {h1}"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "Mittag";
        if (totalMinutes == 0)   return "Mitternacht";

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
