namespace FuzzyClock.Core;

/// <summary>
/// British-idiom terse phrase provider (en-terse).
/// Uses compact forms like "three", "quarter past three", "half four" (British half = half past X-1).
/// </summary>
public class TersePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    // Bucket table: each entry is (upperBound inclusive, candidates[]).
    // Walk in order; return the first match where minute <= upperBound.
    // A random candidate is chosen at runtime.
    // {h}  = current hour in 12-hour format (1–12)
    // {h1} = next hour in 12-hour format (1–12, wraps after 12)
    // Note: bucket 5 (23-32) uses "{h1}" for the British "half X" idiom (3:30 → "half four").
    // Note: bucket 6 (33-37) uses "{h}" for "just gone half three" at 3:35.
    private static readonly (int UpperBound, string[] Candidates)[] Buckets =
    [
        ( 2, [
            "{h}",
            "{h} sharp",
            "{h} exactly",
            "dead on {h}",
            "bang on {h}",
        ]),
        ( 7, [
            "just gone {h}",
            "gone {h}",
            "just past {h}",
            "bit past {h}",
            "barely gone {h}",
        ]),
        (12, [
            "ten past {h}",
            "ten past {h} odd",
            "just past ten past {h}",
            "gone ten past {h}",
            "nearing quarter past {h}",
        ]),
        (17, [
            "quarter past {h}",
            "quarter past {h} now",
            "gone quarter past {h}",
            "just on quarter past {h}",
            "quarter gone {h}",
        ]),
        (22, [
            "twenty past {h}",
            "gone twenty past {h}",
            "coming up to half {h1}",
            "twenty past {h} odd",
            "well past quarter past {h}",
        ]),
        (32, [
            "half {h1}",
            "gone half {h1}",
            "half {h1} now",
            "just on half {h1}",
            "about half {h1}",
        ]),
        (37, [
            "just gone half {h}",
            "gone half {h}",
            "bit past half {h}",
            "just past half {h}",
            "half {h} gone",
        ]),
        (42, [
            "twenty to {h1}",
            "twenty to {h1} odd",
            "gone twenty to {h1}",
            "coming up to quarter to {h1}",
            "nearly quarter to {h1}",
        ]),
        (47, [
            "quarter to {h1}",
            "quarter to {h1} now",
            "gone quarter to {h1}",
            "just on quarter to {h1}",
            "nearing {h1}",
        ]),
        (52, [
            "ten to {h1}",
            "ten to {h1} odd",
            "gone ten to {h1}",
            "nearly {h1}",
            "coming up on {h1}",
        ]),
        (59, [
            "nearly {h1}",
            "almost {h1}",
            "not quite {h1}",
            "all but {h1}",
            "any minute now {h1}",
        ]),
    ];

    private static readonly string[] NoonCandidates =
        ["noon", "midday", "dead on noon", "noon sharp", "bang on noon"];

    private static readonly string[] MidnightCandidates =
        ["midnight", "dead on midnight", "midnight sharp", "bang on midnight", "the midnight hour"];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return NoonCandidates[Random.Shared.Next(NoonCandidates.Length)];
        if (totalMinutes == 0)   return MidnightCandidates[Random.Shared.Next(MidnightCandidates.Length)];

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
        if (totalMinutes == 720) return "en-terse:noon";
        if (totalMinutes == 0)   return "en-terse:midnight";
        int minute = dt.Minute;
        for (int i = 0; i < Buckets.Length; i++)
            if (minute <= Buckets[i].UpperBound) return $"en-terse:{i}";
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }
}
