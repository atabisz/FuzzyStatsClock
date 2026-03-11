namespace FuzzyClock.Core;

/// <summary>
/// Internet-slang phrase provider (Rude 2.0) (en-rude).
/// Uses internet-slang vocabulary: WTF, bruh, dafaq, smh, ngl, lmao, rn, literally, tf.
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
        ( 2, "{h} o'clock, bruh"),
        ( 7, "just after {h}, tf"),
        (12, "ten past {h}, smh"),
        (17, "quarter past {h}, ngl"),
        (22, "WTF, still quarter past {h}"),
        (27, "almost half past {h}, lmao"),
        (32, "half past {h}, bruh"),
        (37, "just past half {h}, dafaq"),
        (42, "almost quarter to {h1}, rn"),
        (47, "quarter to {h1}, literally"),
        (52, "nearly {h1}, smh"),
        (59, "almost {h1}, WTF"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "noon, bruh";
        if (totalMinutes == 0)   return "midnight, wtf are you doing";

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
