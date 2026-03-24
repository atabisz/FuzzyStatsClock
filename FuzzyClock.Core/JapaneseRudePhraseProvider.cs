namespace FuzzyClock.Core;

/// <summary>
/// Japanese Rude phrase provider (ja-rude).
/// Blunt, impatient phrasing with casual/masculine particles.
/// Provisional — native-speaker review recommended for phrase naturalness.
/// </summary>
public class JapaneseRudePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "一時", "二時", "三時", "四時", "五時", "六時",
              "七時", "八時", "九時", "十時", "十一時", "十二時"];

    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "もう{h}かよ"),
        ( 7, "{h}過ぎたじゃないか"),
        (12, "{h}十分だろ"),
        (17, "{h}十五分じゃないか"),
        (22, "{h}二十分だ、いい加減にしろ"),
        (27, "やっと{h}半になる"),
        (32, "やっと{h}半じゃないか"),
        (37, "{h}半過ぎたぞ"),
        (42, "早く{h1}になれ"),
        (47, "{h1}の十五分前だろ"),
        (52, "もうすぐ{h1}じゃないか"),
        (59, "早く{h1}になれ"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "もう昼だ";
        if (totalMinutes == 0)   return "真夜中じゃないか";

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
