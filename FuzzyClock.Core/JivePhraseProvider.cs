namespace FuzzyClock.Core;

/// <summary>
/// 1940s Harlem jive-speak phrase provider (en-jive).
/// Vocabulary sourced from Cab Calloway's Hepster's Dictionary (1938) and Dan Burley's
/// Original Handbook of Harlem Jive (1944): daddy-o, cat, gate, alligator, solid, dig,
/// hep cat, real gone, in the groove, blow your wig, righteous, all reet, copacetic, tick.
/// Multiple candidates per bucket; one chosen randomly at runtime.
/// </summary>
public class JivePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    // Each entry: (upperBound inclusive, candidates[]).
    // A random candidate is chosen at runtime.
    private static readonly (int UpperBound, string[] Candidates)[] Buckets =
    [
        ( 2, [
            "solid {h} o'clock, daddy-o",
            "that's {h} on the nose, cat",
            "straight-up {h} — dig it",
            "all reet, it's {h}, hep cat",
        ]),
        ( 7, [
            "just past {h}, daddy-o",
            "a tick past {h}, cat",
            "barely gone {h} — you hip?",
            "five past {h}, dig it",
        ]),
        (12, [
            "ten past {h}, solid",
            "ten past {h}, righteous",
            "ten past {h}, in the groove",
            "ten past {h} — latch on, cat",
        ]),
        (17, [
            "quarter past {h}, hep cat",
            "quarter past {h}, real gone",
            "a quarter past {h} — solid",
            "quarter past {h} — dig it, daddy-o",
        ]),
        (22, [
            "twenty past {h}, solid",
            "twenty past {h}, you hip?",
            "twenty past {h}, daddy-o",
            "twenty past {h} — copacetic, cat",
        ]),
        (27, [
            "near half past {h}, blow your wig",
            "comin' up on half past {h}, daddy-o",
            "almost half past {h}, real gone",
            "twenty-five past {h} — dig it, cat",
        ]),
        (32, [
            "half past {h}, in the groove",
            "half past {h}, solid",
            "half past {h}, all reet",
            "half past {h} — righteous, daddy-o",
        ]),
        (37, [
            "gone half past {h}, daddy-o",
            "just past half past {h}, cat",
            "half past {h} and a tick — dig",
            "gone the half, alligator — that's {h}",
        ]),
        (42, [
            "almost quarter to {h1}, dig it",
            "comin' up on quarter to {h1}, daddy-o",
            "near the quarter to {h1}, cat",
            "twenty to {h1} — solid",
        ]),
        (47, [
            "quarter to {h1}, solid",
            "a quarter before {h1}, hep cat",
            "quarter to {h1} — blow your wig",
            "fifteen to {h1} — dig it, daddy-o",
        ]),
        (52, [
            "ten to {h1}, blow your wig",
            "nearly {h1}, daddy-o",
            "ten to {h1} — real gone",
            "ten to {h1}, cat — solid",
        ]),
        (59, [
            "almost {h1}, daddy-o",
            "nearly {h1}, cat",
            "five to {h1} — solid, hep cat",
            "comin' up on {h1} — blow your wig",
        ]),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "high noon, daddy-o";
        if (totalMinutes == 0)   return "the witching hour, cat";

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
        if (totalMinutes == 720) return "en-jive:noon";
        if (totalMinutes == 0)   return "en-jive:midnight";
        int minute = dt.Minute;
        for (int i = 0; i < Buckets.Length; i++)
            if (minute <= Buckets[i].UpperBound) return $"en-jive:{i}";
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }
}
