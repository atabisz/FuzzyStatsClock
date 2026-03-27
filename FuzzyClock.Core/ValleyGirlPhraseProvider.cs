namespace FuzzyClock.Core;

/// <summary>
/// Valley Girl phrase provider (en-valleygirl).
/// 1980s Southern California slang: like, literally, totally, omg, fer sure,
/// whatever, I can't even, as if, to the max, grody, gnarly, for real.
/// Multiple candidates per bucket; one chosen randomly at runtime.
/// </summary>
public class ValleyGirlPhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    // Each entry: (upperBound inclusive, candidates[]).
    // A random candidate is chosen at runtime.
    private static readonly (int UpperBound, string[] Candidates)[] Buckets =
    [
        ( 2, [
            "{h} o'clock, like, literally",
            "omg it's literally {h}",
            "like, {h} exactly — so weird",
            "{h} o'clock? fer sure",
        ]),
        ( 7, [
            "like, just after {h}",
            "like, barely past {h} — whatever",
            "omg, barely past {h}",
            "like, five past {h}, totally",
        ]),
        (12, [
            "ten past {h}, totally",
            "like, ten past {h} — whatever",
            "ten past {h}, fer sure",
            "like, ten past {h}, I can't even",
        ]),
        (17, [
            "like, quarter past {h}",
            "quarter past {h}, totally",
            "like, quarter past {h} — omg",
            "quarter past {h}, fer sure",
        ]),
        (22, [
            "omg, still going past {h}",
            "like, twenty past {h} — whatever",
            "twenty past {h}, totally",
            "twenty past {h}, fer sure, like",
        ]),
        (27, [
            "like, almost half past {h}",
            "omg, nearly half past {h}",
            "like, almost half past {h} — I'm like dying",
            "almost half past {h}, totally",
        ]),
        (32, [
            "half past {h}, fer sure",
            "like, half past {h} — totally",
            "half past {h}, omg",
            "half past {h} — like, fer sure",
        ]),
        (37, [
            "like, just past half past {h}",
            "omg, gone past half past {h}",
            "like, past the half — whatever",
            "like, half past {h} and then some",
        ]),
        (42, [
            "so almost quarter to {h1}",
            "like, nearly quarter to {h1}",
            "omg, almost quarter to {h1}",
            "like, almost quarter to {h1} — totally",
        ]),
        (47, [
            "quarter to {h1}, whatever",
            "like, quarter to {h1} — totally",
            "quarter to {h1}, omg",
            "like, quarter to {h1}, fer sure",
        ]),
        (52, [
            "like, nearly {h1}",
            "omg, nearly {h1} already",
            "like, ten to {h1} — whatever",
            "ten to {h1}, I can't even",
        ]),
        (59, [
            "omg, almost {h1}",
            "like, almost {h1} — fer sure",
            "almost {h1}, totally",
            "like, nearly {h1}, omg",
        ]),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "like, it's literally noon";
        if (totalMinutes == 0)   return "omg it's literally midnight";

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
        if (totalMinutes == 720) return "en-valleygirl:noon";
        if (totalMinutes == 0)   return "en-valleygirl:midnight";
        int minute = dt.Minute;
        for (int i = 0; i < Buckets.Length; i++)
            if (minute <= Buckets[i].UpperBound) return $"en-valleygirl:{i}";
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }
}
