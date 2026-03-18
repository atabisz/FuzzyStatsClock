namespace FuzzyClock.Core;

/// <summary>
/// Evocative time-of-day phrase provider (en-poetic).
/// Every phrase names the current or approaching hour.
/// Uses minute-bucket granularity with 4 random candidate templates per bucket.
/// {h}  = current hour word (one–twelve)
/// {h1} = next hour word (wraps after twelve)
/// </summary>
public class PoeticPhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    // Each entry: (upperBound inclusive, candidates[]).
    // A random candidate is chosen at runtime.
    // Buckets 0-7: templates end with {h}  (current hour)
    // Buckets 8-11: templates end with {h1} (next hour)
    private static readonly (int UpperBound, string[] Candidates)[] Buckets =
    [
        ( 2, [  // on the hour
            "the hour turns to {h}",
            "a new hour begins with {h}",
            "the clock whispers {h}",
            "the moment settles into {h}",
        ]),
        ( 7, [  // five past
            "barely past {h}",
            "just into {h}",
            "a breath beyond {h}",
            "the first minutes drift past {h}",
        ]),
        (12, [  // ten past
            "ten quiet minutes into {h}",
            "still near the start of {h}",
            "the hour stretches, unhurried, past {h}",
            "settling into {h}",
        ]),
        (17, [  // quarter past
            "a quarter of the hour past {h}",
            "fifteen minutes deep into {h}",
            "past the first quarter of {h}",
            "the hour unfolds beyond {h}",
        ]),
        (22, [  // twenty past
            "twenty minutes into {h}",
            "drifting further from {h}",
            "well past {h}",
            "the hour of {h} leans forward",
        ]),
        (27, [  // nearly half past
            "nearly half of {h} spent",
            "drifting toward the midpoint of {h}",
            "the minutes gather, still {h}",
            "approaching the halfway mark of {h}",
        ]),
        (32, [  // half past
            "half the hour behind, still {h}",
            "the midpoint passes for {h}",
            "the hour splits in two around {h}",
            "halfway through {h}",
        ]),
        (37, [  // just past half
            "past the middle of {h}",
            "more of the hour behind than ahead for {h}",
            "the balance tips past {h}",
            "the second half begins for {h}",
        ]),
        (42, [  // twenty to
            "twenty minutes left before {h1}",
            "the hour winds toward {h1}",
            "the minutes narrow toward {h1}",
            "drawing closer to {h1}",
        ]),
        (47, [  // quarter to
            "a quarter hour remains before {h1}",
            "fifteen minutes until {h1}",
            "the hour leans toward {h1}",
            "not long now before {h1}",
        ]),
        (52, [  // ten to
            "the hour narrows toward {h1}",
            "only minutes now before {h1}",
            "the last stretch before {h1}",
            "time closes in on {h1}",
        ]),
        (59, [  // five to / nearly
            "the clock exhales toward {h1}",
            "nearly {h1}",
            "the hour dissolves into {h1}",
            "moments away from {h1}",
        ]),
    ];

    public string GetPhrase(DateTime dt)
    {
        if (dt.Hour == 0 && dt.Minute == 0) return "the witching hour";
        if (dt.Hour == 12 && dt.Minute == 0) return "high noon";

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

    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt)
    {
        if (dt.Hour == 0 && dt.Minute == 0) return ("", "the witching hour");
        if (dt.Hour == 12 && dt.Minute == 0) return ("", "high noon");

        int minute = dt.Minute;

        int hour12 = dt.Hour % 12;
        if (hour12 == 0) hour12 = 12;

        int nextHour12 = (hour12 % 12) + 1;

        foreach (var (upperBound, candidates) in Buckets)
        {
            if (minute <= upperBound)
            {
                string template = candidates[Random.Shared.Next(candidates.Length)];

                if (template.EndsWith("{h}"))
                {
                    string qualifier = template[..^"{h}".Length].TrimEnd();
                    return (qualifier, HourWords[hour12]);
                }
                if (template.EndsWith("{h1}"))
                {
                    string qualifier = template[..^"{h1}".Length].TrimEnd();
                    return (qualifier, HourWords[nextHour12]);
                }

                // Fallback: should never hit if all templates end with a placeholder
                string resolved = template
                    .Replace("{h}",  HourWords[hour12])
                    .Replace("{h1}", HourWords[nextHour12]);
                return ("", resolved);
            }
        }

        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }

    public string GetSegmentKey(DateTime dt)
    {
        if (dt.Hour == 0 && dt.Minute == 0) return "en-poetic:witching";
        if (dt.Hour == 12 && dt.Minute == 0) return "en-poetic:noon";
        int minute = dt.Minute;
        for (int i = 0; i < Buckets.Length; i++)
            if (minute <= Buckets[i].UpperBound) return $"en-poetic:{i}";
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }
}
