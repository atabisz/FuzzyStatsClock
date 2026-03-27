namespace FuzzyClock.Core;

/// <summary>
/// Yoda-speak phrase provider (en-yoda).
/// Inverted Star Wars syntax with characteristic affirmations: hmm, yes, mmm.
/// Object-verb-subject ordering; declarative endings "it is", "we are".
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
            "it is {h}, hmm",
            "{h} — the hour, it is, yes",
            "{h} o'clock, hmm, it is",
        ]),
        ( 7, [
            "past {h}, just gone it is",
            "just past {h} it is, hmm",
            "barely past {h} — gone, it is",
            "a tick past {h}, yes",
        ]),
        (12, [
            "ten past {h}, mmm",
            "ten minutes past {h}, it is",
            "ten past {h}, yes, hmm",
            "ten past {h} it is, mmm",
        ]),
        (17, [
            "quarter past {h}, yes",
            "a quarter past {h}, it is",
            "quarter past {h}, hmm",
            "a quarter of the hour past {h}, yes",
        ]),
        (22, [
            "past the quarter of {h}, it is",
            "twenty past {h}, it is",
            "twenty past {h}, yes, hmm",
            "gone the quarter of {h}, hmm",
        ]),
        (27, [
            "near half past {h}, we are",
            "almost half past {h}, yes",
            "nigh on half past {h}, it is",
            "near half past {h}, hmm",
        ]),
        (32, [
            "half past {h}, mmm",
            "half past {h}, it is",
            "the half hour of {h}, struck it has",
            "half past {h}, hmm, yes",
        ]),
        (37, [
            "past the half, just",
            "just past half past {h}, it is",
            "beyond the half, we are",
            "past the half, yes, we are",
        ]),
        (42, [
            "quarter to {h1}, nearly",
            "near a quarter to {h1}, we are",
            "almost quarter to {h1}, hmm",
            "nearing quarter to {h1}, yes",
        ]),
        (47, [
            "quarter to {h1}, it is",
            "a quarter before {h1}, yes",
            "quarter to {h1}, hmm, it is",
            "fifteen minutes to {h1}, it is",
        ]),
        (52, [
            "nearly {h1}, yes",
            "ten to {h1}, it is",
            "ten minutes to {h1}, hmm",
            "nearly {h1} — close, we are",
        ]),
        (59, [
            "{h1} approaches",
            "almost {h1} — near it is",
            "five to {h1}, it is",
            "almost {h1}, patience",
        ]),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "noon it is, hmm";
        if (totalMinutes == 0)   return "midnight, the dark hour, yes";

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
