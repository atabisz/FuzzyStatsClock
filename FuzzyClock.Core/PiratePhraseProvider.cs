namespace FuzzyClock.Core;

/// <summary>
/// Pirate-speak phrase provider (en-pirate).
/// Vocabulary: arr, yarr, avast, ahoy, blimey, aye.
/// Nautical authenticity rules:
/// - Authentic maritime terms: bells, watch, glass, mark, course, bearing, trim, log, strike
/// - No "shiver me timbers" or landlubber phrasing ("it's X o'clock")
/// - Balance pirate vocabulary (arr, yarr, avast, ahoy, blimey) with real seafaring idioms
/// - Vary intensity: some subtle nautical, some more expressive
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
            "eight bells strike {h}, arr",
            "mark {h} by the watch, yarr",
            "the glass shows {h}, steady on",
            "on the stroke of {h}, avast",
            "{h} bells true, by the log",
        ]),
        ( 7, [
            "just past {h} bells, yarr",
            "barely past {h}, arr — steady as she goes",
            "a tick past {h} on the glass",
            "five past {h}, by the watch",
            "past the bell of {h}, blimey",
        ]),
        (12, [
            "ten past {h}, arr — hold course",
            "ten past {h}, yarr — steady on",
            "ten past {h} by the log",
            "ten past {h}, blimey — mark it",
            "ten past {h} on the glass, avast",
        ]),
        (17, [
            "a quarter past {h}, yarr",
            "quarter past {h}, arr — trim the sails",
            "quarter past {h}, by the crow's nest",
            "a quarter past {h} on the watch",
            "quarter past {h}, steady on course",
        ]),
        (22, [
            "past the quarter bell of {h}, arr",
            "twenty past {h}, yarr — hold bearing",
            "twenty past {h}, arr — heave ho",
            "twenty past {h} by the glass",
            "twenty past {h}, aye — mark it",
        ]),
        (27, [
            "nigh on half past {h}, arr",
            "near half past {h}, yarr — steady",
            "comin' up on half past {h}, avast",
            "almost half past {h} by the watch",
            "near the half-glass of {h}, blimey",
        ]),
        (32, [
            "half past {h}, arr — steady as she goes",
            "half the glass of {h}, yarr",
            "gone the half-watch of {h}, avast",
            "half past {h}, trim yer course",
            "mid-watch past {h}, by the log",
        ]),
        (37, [
            "just past the half bell of {h}, yarr",
            "gone half past {h}, arr — hold course",
            "half past {h} and a tick, blimey",
            "past the half-glass of {h}, steady on",
            "beyond half past {h}, mark it",
        ]),
        (42, [
            "nigh on a quarter to {h1}, arr",
            "almost quarter to {h1}, yarr — steady",
            "near a quarter to {h1} by the watch",
            "comin' up on quarter to {h1}, avast",
            "twenty to {h1}, arr — trim course",
        ]),
        (47, [
            "a quarter to {h1}, arr",
            "a quarter to {h1}, yarr — all hands",
            "a quarter to {h1}, man the watch",
            "fifteen minutes to {h1} by the glass",
            "quarter to {h1}, arr — hold bearing",
        ]),
        (52, [
            "nearly {h1}, yarr — stand ready",
            "ten to {h1}, arr — all hands",
            "ten to {h1}, the watch nears end",
            "ten minutes to {h1}, by the log",
            "nigh on {h1}, blimey — steady on",
        ]),
        (59, [
            "almost {h1}, arr — bells soon",
            "nearly {h1}, by the watch",
            "five to {h1}, yarr — make ready",
            "the glass nears {h1}, avast",
            "{h1} on the horizon, arr",
        ]),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;

        if (totalMinutes == 720)
        {
            string[] noonCandidates = [
                "high noon at sea, arr",
                "the sun's at zenith, yarr — noon watch",
                "noon on the meridian, steady on",
                "eight bells — noon, by the log",
                "high noon, all hands — avast",
            ];
            return noonCandidates[Random.Shared.Next(noonCandidates.Length)];
        }

        if (totalMinutes == 0)
        {
            string[] midnightCandidates = [
                "the dead of night, yarr",
                "midnight watch begins, arr",
                "middle watch — the dark hours, avast",
                "eight bells — midnight, steady on",
                "the graveyard watch, blimey",
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
        if (totalMinutes == 720) return "en-pirate:noon";
        if (totalMinutes == 0)   return "en-pirate:midnight";
        int minute = dt.Minute;
        for (int i = 0; i < Buckets.Length; i++)
            if (minute <= Buckets[i].UpperBound) return $"en-pirate:{i}";
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }
}
