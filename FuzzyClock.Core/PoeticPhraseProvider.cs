namespace FuzzyClock.Core;

/// <summary>
/// Evocative time-of-day phrase provider (en-poetic).
/// Uses minute-bucket granularity with 3-4 random candidates per bucket.
/// Tone: atmospheric, lyrical, gently melancholy — suggests the passage of time without naming hours.
/// </summary>
public class PoeticPhraseProvider : IPhraseProvider
{
    // Each entry: (upperBound inclusive, candidates[]).
    // A random candidate is chosen at runtime.
    private static readonly (int UpperBound, string[] Candidates)[] Buckets =
    [
        ( 2, [  // on the hour
            "the hour turns",
            "a new hour, barely begun",
            "the clock speaks once",
            "time starts over",
        ]),
        ( 7, [  // five past
            "the hour has just begun to breathe",
            "barely past the mark",
            "a few minutes gone, already fading",
            "the first minutes slip away",
        ]),
        (12, [  // ten past
            "still near the start of things",
            "the hour stretches, unhurried",
            "ten quiet minutes gone",
            "time moves, whether you watch or not",
        ]),
        (17, [  // quarter past
            "the quarter hour stretches",
            "a quarter gone, three quarters waiting",
            "past the first quarter, drifting",
            "the hour is a quarter spent",
        ]),
        (22, [  // twenty past
            "the hour leans forward",
            "nearly half done with nothing to show",
            "twenty minutes deep",
            "time accumulates, unasked",
        ]),
        (27, [  // nearly half past
            "nearly half the hour is gone",
            "time drifts toward the half",
            "the minutes pile up, unnoticed",
            "not quite half past, and already forgetting",
        ]),
        (32, [  // half past
            "the hour splits in two",
            "half the hour behind, half ahead",
            "the midpoint passes without ceremony",
            "halfway through, halfway gone",
        ]),
        (37, [  // just past half
            "past the middle now",
            "the second half begins its quiet work",
            "more gone than remains",
            "the balance tips, unnoticed",
        ]),
        (42, [  // twenty to
            "the hour begins to close",
            "winding down, winding in",
            "twenty minutes stand between now and then",
            "the end of the hour, approaching",
        ]),
        (47, [  // quarter to
            "a quarter still to go",
            "the last quarter begins",
            "almost through, almost",
            "fifteen minutes, patient and slow",
        ]),
        (52, [  // ten to
            "the hour nears its end",
            "only minutes left now",
            "the last stretch of the hour",
            "time narrows to a point",
        ]),
        (59, [  // five to
            "the hour exhales",
            "almost over, almost beginning",
            "the final minutes dissolve",
            "one hour ends, another waits",
        ]),
    ];

    public string GetPhrase(DateTime dt)
    {
        if (dt.Hour == 0 && dt.Minute == 0) return "the witching hour";
        if (dt.Hour == 12 && dt.Minute == 0) return "high noon";

        int minute = dt.Minute;
        foreach (var (upperBound, candidates) in Buckets)
            if (minute <= upperBound)
                return candidates[Random.Shared.Next(candidates.Length)];

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

    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) =>
        ("", GetPhrase(dt));
}
