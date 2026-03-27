namespace FuzzyClock.Core;

/// <summary>
/// Pirate-speak phrase provider (en-pirate).
/// Vocabulary: arr, yarr, avast, ahoy, shiver me timbers, blimey, Davy Jones,
/// landlubber, scallywag, kraken, heave ho, all hands on deck, blow me down.
/// Multiple candidates per bucket; one chosen randomly at runtime.
/// </summary>
public class PiratePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    // Each entry: (upperBound inclusive, candidates[]).
    // A random candidate is chosen at runtime.
    private static readonly (int UpperBound, string[] Candidates)[] Buckets =
    [
        ( 2, [
            "{h} bells, arr",
            "avast — {h} bells, yarr",
            "shiver me timbers, it's {h} o'clock",
            "ahoy, {h} bells, ye scallywag",
        ]),
        ( 7, [
            "just past {h} bells, yarr",
            "barely past {h}, arr",
            "a tick past {h} — blow me down",
            "five past {h}, ye landlubber",
        ]),
        (12, [
            "ten past {h}, arr",
            "ten past {h}, yarr — steady on",
            "ten past {h}, by Davy Jones",
            "ten past {h}, blimey",
        ]),
        (17, [
            "a quarter past {h}, yarr",
            "a quarter past {h}, arr — man the sails",
            "quarter past {h}, by the crow's nest",
            "a quarter past {h}, shiver me timbers",
        ]),
        (22, [
            "past the quarter bell of {h}",
            "twenty past {h}, yarr",
            "twenty past {h}, arr — heave ho",
            "twenty past {h}, aye aye",
        ]),
        (27, [
            "nigh on half past {h}, arr",
            "coming up on half past {h}, yarr",
            "near half past {h} — blow me down",
            "almost half past {h} — avast",
        ]),
        (32, [
            "half past {h}, arr",
            "half past {h}, yarr — steady on",
            "half past {h} — aye aye",
            "half past {h}, by the kraken",
        ]),
        (37, [
            "just past the half bell, yarr",
            "gone half past {h}, arr",
            "half past {h} and a bit — blimey",
            "past the half, ye scallywag",
        ]),
        (42, [
            "nigh on a quarter to {h1}",
            "almost quarter to {h1}, arr",
            "coming up on quarter to {h1}, yarr",
            "near a quarter to {h1} — shiver me timbers",
        ]),
        (47, [
            "a quarter to {h1}, arr",
            "a quarter to {h1}, yarr",
            "a quarter to {h1} — man the watch",
            "fifteen minutes to {h1}, ye scallywag",
        ]),
        (52, [
            "nearly {h1}, yarr",
            "ten to {h1}, arr",
            "ten to {h1} — all hands on deck",
            "ten minutes to {h1}, blimey",
        ]),
        (59, [
            "almost {h1}, shiver me timbers",
            "nearly {h1}, arr",
            "five to {h1} — yarr, almost there",
            "almost {h1}, by Davy Jones",
        ]),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "high noon at sea, arr";
        if (totalMinutes == 0)   return "the dead of night, yarr";

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
        if (totalMinutes == 720) return "en-pirate:noon";
        if (totalMinutes == 0)   return "en-pirate:midnight";
        int minute = dt.Minute;
        for (int i = 0; i < Buckets.Length; i++)
            if (minute <= Buckets[i].UpperBound) return $"en-pirate:{i}";
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }
}
