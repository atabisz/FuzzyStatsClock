namespace FuzzyClock.Core;

/// <summary>
/// Japanese Terse phrase provider (ja-terse).
/// Short, clipped colloquial Japanese. Minimal particles.
/// Provisional — native-speaker review recommended for phrase naturalness.
/// </summary>
public class JapaneseTersePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "一時", "二時", "三時", "四時", "五時", "六時",
              "七時", "八時", "九時", "十時", "十一時", "十二時"];

    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "{h}"),
        ( 7, "{h}すぎ"),
        (12, "{h}十分"),
        (17, "{h}十五分"),
        (22, "{h}二十分"),
        (27, "もうすぐ{h}半"),
        (32, "{h}半"),
        (37, "{h}半すぎ"),
        (42, "{h1}二十前"),
        (47, "{h1}十五前"),
        (52, "もうすぐ{h1}"),
        (59, "{h1}近く"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "正午";
        if (totalMinutes == 0)   return "真夜中";

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
