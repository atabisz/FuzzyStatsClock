namespace FuzzyClock.Core;

/// <summary>
/// Dwarf-speak phrase provider (en-dwarf).
/// Terse, gruff, work-focused vocabulary: aye, bah, by the stone, by the hammer,
/// by the forge, blast it, quit yer dawdlin', get to work, the tunnels wait.
/// Multiple candidates per bucket; one chosen randomly at runtime.
/// </summary>
public class DwarfPhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    // Each entry: (upperBound inclusive, candidates[]).
    // A random candidate is chosen at runtime.
    private static readonly (int UpperBound, string[] Candidates)[] Buckets =
    [
        ( 2, [
            "{h}, aye",
            "by the stone, it's {h}",
            "'tis {h}, bah",
            "{h} on the mark, blast it",
        ]),
        ( 7, [
            "just past {h}, move on",
            "barely past {h}, bah",
            "a hair past {h} — get to work",
            "five past {h}, aye — no dawdlin'",
        ]),
        (12, [
            "ten past {h}, bah",
            "ten past {h}, by the forge",
            "ten past {h} — the tunnels wait",
            "ten past {h}, aye",
        ]),
        (17, [
            "a quarter past {h}",
            "a quarter past {h}, by the hammer",
            "quarter past {h} — get diggin'",
            "quarter past {h}, bah",
        ]),
        (22, [
            "past the quarter, aye",
            "twenty past {h}, blast it",
            "twenty past {h}, by the stone",
            "twenty past {h} — the forge calls",
        ]),
        (27, [
            "near half past {h}",
            "almost half past {h}, bah",
            "nigh on half past {h}, by the mountain",
            "coming up on half past {h}, aye",
        ]),
        (32, [
            "half past {h}, get to work",
            "half past {h}, bah",
            "half past {h} — by the stone",
            "'tis half past {h}, aye",
        ]),
        (37, [
            "just past half {h}, eh",
            "gone half past {h}, bah",
            "half past {h} and a bit — quit yer lollin'",
            "past the half, by the hammer",
        ]),
        (42, [
            "near a quarter to {h1}",
            "almost quarter to {h1}, aye",
            "nigh on quarter to {h1} — blast it",
            "coming up on quarter to {h1}, bah",
        ]),
        (47, [
            "quarter to {h1}, by the stone",
            "quarter to {h1}, aye",
            "a quarter before {h1} — move yerself",
            "quarter to {h1}, bah",
        ]),
        (52, [
            "nearly {h1}, aye",
            "ten to {h1}, by the hammer",
            "ten to {h1} — almost done",
            "ten to {h1}, bah",
        ]),
        (59, [
            "almost {h1}, quit yer dawdlin'",
            "nearly {h1} — aye, nearly",
            "five to {h1}, bah",
            "almost {h1}, by the stone",
        ]),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "midday. eat.";
        if (totalMinutes == 0)   return "deep in the night, bah";

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
        if (totalMinutes == 720) return "en-dwarf:noon";
        if (totalMinutes == 0)   return "en-dwarf:midnight";
        int minute = dt.Minute;
        for (int i = 0; i < Buckets.Length; i++)
            if (minute <= Buckets[i].UpperBound) return $"en-dwarf:{i}";
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }
}
