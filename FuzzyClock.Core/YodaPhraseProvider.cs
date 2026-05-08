namespace FuzzyClock.Core;

/// <summary>
/// Yoda-speak phrase provider (en-yoda).
/// Inverted Star Wars syntax with characteristic affirmations: hmm, yes, mmm.
/// OSV syntax rules (strictly enforced):
/// - Object-Verb-Subject: "{h} o'clock, it is" NOT "it is {h} o'clock"
/// - No phrase starts with SVO: "it is", "it's", "we are", "we're"
/// - Every phrase ends with declarative: "it is", "we are", "it has", "we have", "yes", "hmm", "mmm"
/// - Affirmations (hmm, yes, mmm) as bookends only, never mid-sentence
/// Multiple candidates per bucket; one chosen randomly at runtime.
/// </summary>
public class YodaPhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    // Each entry: (upperBound inclusive, candidates[]).
    // A random candidate is chosen at runtime.
    private static readonly (int UpperBound, string[] Candidates)[] Buckets =
    [
        ( 2, [
            "{h} o'clock, it is",
            "the hour of {h}, upon us it is",
            "{h}, the time it is, hmm",
            "hmm, {h} o'clock it is, yes",
            "{h} — struck, the hour it has",
        ]),
        ( 7, [
            "just past {h}, it is",
            "past {h}, just gone it has, hmm",
            "barely past {h}, it is, yes",
            "a tick past {h}, we are",
            "gone past {h}, it has, mmm",
        ]),
        (12, [
            "ten past {h}, it is, mmm",
            "ten minutes past {h}, it is",
            "ten past {h}, reached we have, yes",
            "ten past {h} it is, hmm",
            "past {h} by ten, it is",
        ]),
        (17, [
            "quarter past {h}, it is, yes",
            "a quarter past {h}, reached we have",
            "quarter past {h}, it is, hmm",
            "a quarter of the hour past {h}, it is",
            "past the quarter of {h}, we are, mmm",
        ]),
        (22, [
            "twenty past {h}, it is",
            "past the quarter of {h}, gone we have, hmm",
            "twenty past {h}, it is, yes",
            "gone twenty past {h}, it has",
            "twenty past {h}, reached we have, mmm",
        ]),
        (27, [
            "near half past {h}, we are",
            "almost half past {h}, it is, yes",
            "nigh on half past {h}, it is",
            "approaching half past {h}, we are, hmm",
            "near the half of {h}, it is, mmm",
        ]),
        (32, [
            "half past {h}, it is, mmm",
            "the half hour of {h}, passed it has",
            "hmm, half past {h} we are, yes",
            "half past {h}, reached we have",
            "gone the half of {h}, it has",
        ]),
        (37, [
            "just past the half of {h}, we are",
            "beyond half past {h}, it is, hmm",
            "past the half of {h}, gone we have, yes",
            "beyond the half of {h}, we are, mmm",
            "just past half past {h}, it is",
        ]),
        (42, [
            "near a quarter to {h1}, we are",
            "almost quarter to {h1}, it is, hmm",
            "nearing quarter to {h1}, we are, yes",
            "close to quarter to {h1}, it is",
            "approaching {h1}, we are, mmm",
        ]),
        (47, [
            "quarter to {h1}, it is",
            "a quarter before {h1}, reached we have, yes",
            "quarter to {h1}, it is, hmm",
            "fifteen minutes to {h1}, it is",
            "a quarter to {h1}, we are, mmm",
        ]),
        (52, [
            "ten to {h1}, it is, yes",
            "nearly {h1}, it is, hmm",
            "ten minutes to {h1}, it is",
            "close to {h1}, we are, mmm",
            "nearing {h1}, it is, yes",
        ]),
        (59, [
            "almost {h1}, it is, hmm",
            "near {h1}, it is, yes",
            "five to {h1}, it is",
            "approaching {h1}, we are, mmm",
            "{h1}, almost upon us it is, yes",
        ]),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;

        if (totalMinutes == 720)
        {
            string[] noonCandidates = [
                "noon it is, hmm",
                "the noon hour, upon us it is",
                "hmm, high noon it is, yes",
                "noon, arrived it has",
                "the midday hour, reached we have",
            ];
            return noonCandidates[Random.Shared.Next(noonCandidates.Length)];
        }

        if (totalMinutes == 0)
        {
            string[] midnightCandidates = [
                "midnight, the dark hour it is, yes",
                "the witching hour, upon us it is",
                "hmm, midnight it is",
                "the deepest night, reached we have",
                "midnight, arrived it has, mmm",
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
        if (totalMinutes == 720) return "en-yoda:noon";
        if (totalMinutes == 0)   return "en-yoda:midnight";
        int minute = dt.Minute;
        for (int i = 0; i < Buckets.Length; i++)
            if (minute <= Buckets[i].UpperBound) return $"en-yoda:{i}";
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }
}
