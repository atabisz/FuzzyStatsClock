namespace FuzzyClock.Core;

/// <summary>
/// Valley Girl phrase provider (en-valleygirl).
/// Uses Valley Girl slang: like, literally, totally, omg, fer sure, so, whatever.
/// </summary>
public class ValleyGirlPhraseProvider : IPhraseProvider
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
        ( 2, "{h} o'clock, like, literally"),
        ( 7, "like, just after {h}"),
        (12, "ten past {h}, totally"),
        (17, "like, quarter past {h}"),
        (22, "omg, still quarter past {h}"),
        (27, "like, almost half past {h}"),
        (32, "half past {h}, fer sure"),
        (37, "like, just past half {h}"),
        (42, "so almost quarter to {h1}"),
        (47, "quarter to {h1}, whatever"),
        (52, "like, nearly {h1}"),
        (59, "omg, almost {h1}"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "like, it's literally noon";
        if (totalMinutes == 0)   return "omg it's literally midnight";

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
