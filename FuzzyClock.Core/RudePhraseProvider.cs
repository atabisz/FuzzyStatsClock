namespace FuzzyClock.Core;

/// <summary>
/// Rude-funny phrase provider (en-rude).
/// Mixed tone: bitter oracle, resigned contempt, personal offence, absurdist.
/// Multiple candidates per bucket; one is chosen randomly at runtime.
/// {h}  = current hour word (one–twelve)
/// {h1} = next hour word (wraps after twelve)
/// </summary>
public class RudePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    // Each entry: (upperBound inclusive, candidates[]).
    // A random candidate is chosen at runtime.
    private static readonly (int UpperBound, string[] Candidates)[] Buckets =
    [
        ( 2, [
            "it's {h}. still you.",
            "congratulations. it's {h}.",
            "{h} o'clock. as if that changes anything.",
            "it is {h}. you're welcome.",
            "{h} on the dot. not that it helps.",
        ]),
        ( 7, [
            "you couldn't even wait. five past {h}.",
            "barely past {h}. already desperate.",
            "five past {h}, since you need to know.",
            "just gone {h}. barely started and already checking.",
        ]),
        (12, [
            "ten past {h}. remarkable progress.",
            "ten past {h}. the day marches on without you.",
            "ten past {h}, for your records.",
            "roughly ten past {h}. precision is a luxury you've forfeited.",
        ]),
        (17, [
            "quarter past {h}. thrilling.",
            "quarter past {h}. make something of it.",
            "a quarter past {h}, in case you'd forgotten.",
            "quarter past {h}. still here, are we.",
        ]),
        (22, [
            "twenty past {h}. still going.",
            "gone quarter past {h}. congratulations.",
            "twenty past {h}. not my problem.",
            "twenty past {h}. the universe remains indifferent.",
        ]),
        (27, [
            "nearly half past {h}. almost impressive.",
            "coming up on half past {h}. brace yourself.",
            "twenty-five past {h}, though I fail to see why you care.",
            "not quite half past {h} yet. sit with that.",
        ]),
        (32, [
            "half past {h}. half the day is gone.",
            "half past {h}. you're welcome.",
            "half past {h}. still here.",
            "thirty minutes past {h}. magnificent.",
        ]),
        (37, [
            "just past half past {h}. agonizing.",
            "gone half past {h}. do something.",
            "half past {h} and change. great.",
            "thirty-something past {h}. the specifics escape me.",
        ]),
        (42, [
            "twenty to {h1}. nearly there.",
            "almost quarter to {h1}. patience.",
            "twenty minutes to {h1}, if you must know.",
            "approaching quarter to {h1}. riveting.",
        ]),
        (47, [
            "quarter to {h1}. one more time.",
            "fifteen minutes until {h1}. counting.",
            "quarter to {h1}. nearly over.",
            "fifteen to {h1}. almost done with this hour.",
        ]),
        (52, [
            "ten to {h1}. try not to expire.",
            "nearly {h1}. almost through.",
            "ten minutes to {h1}, if you can hold on.",
            "ten to {h1}. the end is near, at least for this hour.",
        ]),
        (59, [
            "five to {h1}. almost over.",
            "nearly {h1}. we're almost done here.",
            "almost {h1}. thank goodness.",
            "five minutes to {h1}. you've made it this far.",
        ]),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "noon";
        if (totalMinutes == 0)   return "midnight";

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
        if (totalMinutes == 720) return "en-rude:noon";
        if (totalMinutes == 0)   return "en-rude:midnight";
        int minute = dt.Minute;
        for (int i = 0; i < Buckets.Length; i++)
            if (minute <= Buckets[i].UpperBound) return $"en-rude:{i}";
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }
}
