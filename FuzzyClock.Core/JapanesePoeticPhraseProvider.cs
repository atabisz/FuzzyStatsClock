namespace FuzzyClock.Core;

/// <summary>
/// Japanese Poetic phrase provider (ja-poetic).
/// Atmospheric, imagery-based phrasing drawing on Japanese aesthetic vocabulary.
/// Provisional — native-speaker review recommended for phrase naturalness.
/// </summary>
public class JapanesePoeticPhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "一時", "二時", "三時", "四時", "五時", "六時",
              "七時", "八時", "九時", "十時", "十一時", "十二時"];

    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "{h}の刻"),
        ( 7, "{h}を過ぎた頃"),
        (12, "{h}の光の中"),
        (17, "{h}の四半刻"),
        (22, "{h}から遠ざかる"),
        (27, "{h}半へと向かう"),
        (32, "時の折り返し、{h}の半ば"),
        (37, "{h}半を越えた頃"),
        (42, "{h1}へと近づく"),
        (47, "{h1}の十五分前"),
        (52, "まもなく{h1}の刻"),
        (59, "{h1}の影が迫る"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "昼の頂";
        if (totalMinutes == 0)   return "夜の果て";

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
