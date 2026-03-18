namespace FuzzyClock.Core;

/// <summary>
/// Polish phrase provider (pl).
/// Simplified Polish — nominative forms throughout for intelligibility;
/// case agreement not fully inflected.
/// </summary>
public class PolishPhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "pierwsza", "druga", "trzecia", "czwarta", "piąta",
             "szósta", "siódma", "ósma", "dziewiąta", "dziesiąta",
             "jedenasta", "dwunasta"];

    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "{h}"),
        ( 7, "chwila po {h}"),
        (12, "dziesięć po {h}"),
        (17, "kwadrans po {h}"),
        (22, "dwadzieścia po {h}"),
        (27, "prawie wpół do {h1}"),
        (32, "wpół do {h1}"),
        (37, "chwila po wpół do {h1}"),
        (42, "za dwadzieścia {h1}"),
        (47, "za kwadrans {h1}"),
        (52, "za dziesięć {h1}"),
        (59, "prawie {h1}"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "południe";
        if (totalMinutes == 0)   return "północ";

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
