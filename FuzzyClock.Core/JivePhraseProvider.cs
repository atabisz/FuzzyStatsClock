namespace FuzzyClock.Core;

/// <summary>
/// 1940s Harlem jive-speak phrase provider (en-jive).
/// Vocabulary sourced from Cab Calloway's Hepster's Dictionary (1938) and Dan Burley's
/// Original Handbook of Harlem Jive (1944): daddy-o, cat, gate, alligator, solid, dig,
/// hep cat, real gone, in the groove, blow your wig, righteous, all reet, copacetic, tick.
/// Multiple candidates per bucket; one chosen randomly at runtime.
///
/// Authenticity rules:
/// - Natural contractions: comin', blowin', hittin' (NOT standard English gerunds)
/// - Emphatic repetition: "solid, solid", "real gone, real gone"
/// - Organic vocabulary: integrated into phrasing, not appended to standard English
/// - No phrase starts with "it's" or "it is" (AAVE copula-dropping preference)
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
            "{h} on the nose, cat",
            "solid {h}, daddy-o — solid",
            "the clock's blowin' {h}, dig it",
            "{h} sharp, hep cat — all reet",
            "that's {h} right now, real gone",
        ]),
        ( 7, [
            "just past {h}, daddy-o",
            "a tick past {h}, cat — dig",
            "barely gone {h}, you hip?",
            "five past {h}, in the groove",
            "gone {h} a tick, hep cat — solid",
        ]),
        (12, [
            "ten past {h}, solid — real solid",
            "ten past {h}, righteous and true",
            "ten past {h}, in the groove, cat",
            "ten past {h} — latch on, daddy-o",
            "gone ten past {h}, dig it",
        ]),
        (17, [
            "quarter past {h}, hep cat",
            "quarter past {h}, real gone — dig",
            "a quarter past {h} — solid, solid",
            "quarter past {h}, daddy-o — righteous",
            "gone a quarter past {h}, cat",
        ]),
        (22, [
            "twenty past {h}, you hip?",
            "twenty past {h}, daddy-o — solid",
            "twenty past {h} — copacetic, cat",
            "gone twenty past {h}, all reet",
            "twenty past {h}, in the groove, dig",
        ]),
        (27, [
            "near half past {h}, blow your wig",
            "comin' up on half past {h}, daddy-o",
            "almost half past {h}, real gone",
            "twenty-five past {h} — dig it, cat",
            "nigh on half past {h}, solid — solid",
        ]),
        (32, [
            "half past {h}, in the groove",
            "half past {h}, solid — real solid",
            "half past {h}, all reet, daddy-o",
            "half past {h} — righteous, cat",
            "gone the half of {h}, dig it",
        ]),
        (37, [
            "gone half past {h}, daddy-o",
            "just past the half of {h}, cat — dig",
            "half past {h} and a tick — solid",
            "gone the half, alligator — that's {h}",
            "past the half of {h}, real gone",
        ]),
        (42, [
            "almost quarter to {h1}, dig it",
            "comin' up on quarter to {h1}, daddy-o",
            "near the quarter to {h1}, cat",
            "twenty to {h1} — solid, hep cat",
            "nigh on quarter to {h1}, blow your wig",
        ]),
        (47, [
            "quarter to {h1}, solid — dig it",
            "a quarter before {h1}, hep cat",
            "quarter to {h1} — blow your wig",
            "fifteen to {h1}, daddy-o — righteous",
            "quarter to {h1}, all reet, cat",
        ]),
        (52, [
            "ten to {h1}, blow your wig",
            "nearly {h1}, daddy-o — real gone",
            "ten to {h1}, cat — solid, solid",
            "ten to {h1} — copacetic, hep cat",
            "comin' up on {h1}, dig it",
        ]),
        (59, [
            "almost {h1}, daddy-o — real gone",
            "nearly {h1}, cat — dig it",
            "five to {h1}, solid, hep cat",
            "comin' up on {h1} — blow your wig",
            "{h1} comin' round the bend, all reet",
        ]),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;

        if (totalMinutes == 720)
        {
            string[] noonCandidates = [
                "high noon, daddy-o",
                "noon on the dot, cat — solid",
                "twelve sharp, dig it — real gone",
                "high noon, hep cat — all reet",
                "noon straight up, daddy-o — righteous",
            ];
            return noonCandidates[Random.Shared.Next(noonCandidates.Length)];
        }

        if (totalMinutes == 0)
        {
            string[] midnightCandidates = [
                "the witching hour, cat",
                "midnight, daddy-o — real gone",
                "the zero hour, dig it",
                "dead of night, hep cat — solid",
                "midnight on the nose, alligator",
            ];
            return midnightCandidates[Random.Shared.Next(midnightCandidates.Length)];
        }

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
