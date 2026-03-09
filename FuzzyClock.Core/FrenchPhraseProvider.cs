namespace FuzzyClock.Core;

/// <summary>
/// French phrase provider (fr).
/// Uses standard French clock idioms: "midi", "minuit", "et quart", "et demie", etc.
/// </summary>
public class FrenchPhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "une heure", "deux heures", "trois heures", "quatre heures",
             "cinq heures", "six heures", "sept heures", "huit heures",
             "neuf heures", "dix heures", "onze heures", "douze heures"];

    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "{h}"),
        ( 7, "{h} passé"),
        (12, "dix minutes passé {h}"),
        (17, "et quart {h}"),
        (22, "vingt minutes passé {h}"),
        (27, "presque la demie {h}"),
        (32, "{h} et demie"),
        (37, "passé la demie {h}"),
        (42, "presque vingt minutes avant {h1}"),
        (47, "moins le quart {h1}"),
        (52, "bientôt {h1}"),
        (59, "presque {h1}"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "midi";
        if (totalMinutes == 0)   return "minuit";

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
