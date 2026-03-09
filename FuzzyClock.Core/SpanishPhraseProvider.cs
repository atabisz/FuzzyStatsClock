namespace FuzzyClock.Core;

/// <summary>
/// Spanish phrase provider (es).
/// Uses standard Spanish clock idioms: "mediodía", "medianoche", "y cuarto", "y media", etc.
/// </summary>
public class SpanishPhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "la una", "las dos", "las tres", "las cuatro", "las cinco",
             "las seis", "las siete", "las ocho", "las nueve", "las diez",
             "las once", "las doce"];

    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "{h} en punto"),
        ( 7, "{h} y pico"),
        (12, "{h} y diez"),
        (17, "{h} y cuarto"),
        (22, "{h} y veinte"),
        (27, "{h} y casi media"),
        (32, "{h} y media"),
        (37, "pasada la media {h}"),
        (42, "casi veinte para {h1}"),
        (47, "cuarto para {h1}"),
        (52, "diez para {h1}"),
        (59, "casi {h1}"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "mediodía";
        if (totalMinutes == 0)   return "medianoche";

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
