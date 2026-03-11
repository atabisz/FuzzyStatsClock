namespace FuzzyClock.Core;

/// <summary>
/// Shakespearean phrase provider (en-shakespeare).
/// Uses Early Modern English vocabulary: Hark, 'Tis, forsooth, methinks, anon, hath, doth.
/// Supports {ho} token for ordinal hour forms (first, second, ... twelfth).
/// </summary>
public class ShakespearePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    private static readonly string[] OrdinalHourWords =
        ["", "first", "second", "third", "fourth", "fifth", "sixth",
             "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

    // Bucket table: each entry is (upperBound inclusive, template).
    // Walk in order; return the first match where minute <= upperBound.
    // {ho} = ordinal form of current hour (first–twelfth)
    // {h}  = current hour in 12-hour format (1–12)
    // {h1} = next hour in 12-hour format (1–12, wraps after 12)
    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "Hark! The {ho} hour hath struck"),
        ( 7, "'Tis just past the {ho} hour"),
        (12, "Ten minutes past the {ho} hour"),
        (17, "A quarter past the {ho} hour"),
        (22, "Past the quarter of {h}"),
        (27, "Nigh on half past {h}"),
        (32, "Half past the {ho} hour, forsooth"),
        (37, "The half hour is spent"),
        (42, "Nigh on a quarter to {h1}"),
        (47, "A quarter to {h1}, methinks"),
        (52, "Nearly {h1}, anon"),
        (59, "Almost {h1}, forsooth"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "Hark! 'Tis the noontide hour";
        if (totalMinutes == 0)   return "The witching hour doth toll";

        int minute = dt.Minute;

        int hour12 = dt.Hour % 12;
        if (hour12 == 0) hour12 = 12;

        int nextHour12 = (hour12 % 12) + 1;

        foreach (var (upperBound, template) in Buckets)
        {
            if (minute <= upperBound)
            {
                return template
                    .Replace("{ho}", OrdinalHourWords[hour12])
                    .Replace("{h}",  HourWords[hour12])
                    .Replace("{h1}", HourWords[nextHour12]);
            }
        }

        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }

    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) =>
        ("", GetPhrase(dt));
}
