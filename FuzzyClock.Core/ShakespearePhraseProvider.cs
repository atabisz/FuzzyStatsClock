namespace FuzzyClock.Core;

/// <summary>
/// Shakespearean phrase provider (en-shakespeare).
/// Early Modern English vocabulary: Hark, 'Tis, forsooth, methinks, anon, verily,
/// prithee, hath, doth, nigh, ere.
/// Supports {ho} token for ordinal hour forms (first–twelfth).
/// Multiple candidates per bucket; one chosen randomly at runtime.
/// </summary>
public class ShakespearePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    private static readonly string[] OrdinalHourWords =
        ["", "first", "second", "third", "fourth", "fifth", "sixth",
             "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

    // Each entry: (upperBound inclusive, candidates[]).
    // A random candidate is chosen at runtime.
    // {ho} = ordinal form of current hour (first–twelfth)
    // {h}  = current hour word (one–twelve)
    // {h1} = next hour word
    private static readonly (int UpperBound, string[] Candidates)[] Buckets =
    [
        ( 2, [
            "Hark! The {ho} hour hath struck",
            "'Tis {h} o'clock, forsooth",
            "The {ho} hour is upon us, verily",
            "Hark! 'Tis the {ho} hour",
        ]),
        ( 7, [
            "'Tis just past the {ho} hour",
            "The {ho} hour hath barely passed, forsooth",
            "Just past {h}, verily",
            "Just past the {ho} hour, methinks",
        ]),
        (12, [
            "Ten minutes past the {ho} hour",
            "'Tis ten past {h}, forsooth",
            "Ten past {h}, verily",
            "Ten minutes hence from {h}, methinks",
        ]),
        (17, [
            "A quarter past the {ho} hour",
            "'Tis a quarter past {h}, forsooth",
            "A quarter past {h}, verily",
            "A quarter hence past {h}, methinks",
        ]),
        (22, [
            "Past the quarter of {h}",
            "Twenty minutes past {h}, forsooth",
            "'Tis twenty past {h}, verily",
            "Past the quarter of {h}, prithee heed",
        ]),
        (27, [
            "Nigh on half past {h}",
            "Near the half past {h}, forsooth",
            "Nigh on half past {h}, verily",
            "'Tis almost half past {h}, methinks",
        ]),
        (32, [
            "Half past the {ho} hour, forsooth",
            "'Tis half past {h}, verily",
            "Half past {h}, methinks",
            "The half hour of {h} hath struck, forsooth",
        ]),
        (37, [
            "The half hour is spent",
            "Past the half, forsooth",
            "The half hour is spent, verily",
            "Gone is the half past {h}, methinks",
        ]),
        (42, [
            "Nigh on a quarter to {h1}",
            "Almost a quarter ere {h1}, forsooth",
            "Nigh on quarter to {h1}, verily",
            "'Tis nigh on a quarter to {h1}, methinks",
        ]),
        (47, [
            "A quarter to {h1}, methinks",
            "'Tis a quarter ere {h1}, forsooth",
            "A quarter to {h1}, verily",
            "A quarter before {h1}, prithee",
        ]),
        (52, [
            "Nearly {h1}, anon",
            "Ten minutes ere {h1}, forsooth",
            "Ten to {h1}, methinks",
            "Nearly {h1}, verily",
        ]),
        (59, [
            "Almost {h1}, forsooth",
            "'Tis nigh upon {h1}, verily",
            "Almost {h1}, methinks",
            "Five minutes ere {h1}, forsooth",
        ]),
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

        foreach (var (upperBound, candidates) in Buckets)
        {
            if (minute <= upperBound)
            {
                string template = candidates[Random.Shared.Next(candidates.Length)];
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

    public string GetSegmentKey(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "en-shakespeare:noon";
        if (totalMinutes == 0)   return "en-shakespeare:midnight";
        int minute = dt.Minute;
        for (int i = 0; i < Buckets.Length; i++)
            if (minute <= Buckets[i].UpperBound) return $"en-shakespeare:{i}";
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }
}
