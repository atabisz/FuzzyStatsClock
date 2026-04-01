namespace FuzzyClock.Core;

public class EnglishPhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    // Bucket table: each entry is (upperBound inclusive, candidates[]).
    // Walk in order; return the first match where minute <= upperBound.
    // A random candidate is chosen at runtime.
    // {h}  = current hour in 12-hour format (1–12)
    // {h1} = next hour in 12-hour format (1–12, wraps after 12)
    private static readonly (int UpperBound, string[] Candidates)[] Buckets =
    [
        ( 2, ["{h} o'clock", "it's {h} o'clock", "exactly {h}", "{h} on the dot", "just {h}"]),
        ( 7, ["just after {h}", "a little after {h}", "five past {h}", "five after {h}", "just past {h}"]),
        (12, ["ten past {h}", "ten after {h}", "ten minutes past {h}", "ten minutes after {h}", "a little past {h}"]),
        (17, ["a quarter past {h}", "quarter past {h}", "quarter after {h}", "fifteen past {h}", "fifteen after {h}"]),
        (22, ["just after quarter past {h}", "twenty past {h}", "twenty after {h}", "twenty minutes past {h}", "a little past quarter past {h}"]),
        (27, ["almost half past {h}", "nearly half past {h}", "coming up on half past {h}", "approaching half past {h}", "about twenty-five past {h}"]),
        (32, ["half past {h}", "half past {h} exactly", "thirty past {h}", "thirty minutes past {h}", "it's half past {h}"]),
        (37, ["just past half past {h}", "a little after half past {h}", "just after half past {h}", "thirty-five past {h}", "a bit past half past {h}"]),
        (42, ["almost a quarter before {h1}", "twenty to {h1}", "twenty minutes to {h1}", "almost quarter to {h1}", "about twenty to {h1}"]),
        (47, ["a quarter before {h1}", "quarter to {h1}", "fifteen minutes to {h1}", "fifteen to {h1}", "a quarter to {h1}"]),
        (52, ["nearly {h1}", "ten to {h1}", "ten minutes to {h1}", "about ten to {h1}", "coming up on {h1}"]),
        (59, ["almost {h1}", "nearly {h1}", "just about {h1}", "a few minutes to {h1}", "not quite {h1}"]),
    ];

    private static readonly string[] NoonCandidates = ["noon", "twelve noon", "midday", "noontime", "twelve o'clock noon"];
    private static readonly string[] MidnightCandidates = ["midnight", "twelve midnight", "the midnight hour", "twelve o'clock midnight", "dead of midnight"];

    public string GetPhrase(DateTime dt)
    {
        // Special cases: check exact total minutes from midnight
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return NoonCandidates[Random.Shared.Next(NoonCandidates.Length)];      // 12:00:00
        if (totalMinutes == 0)   return MidnightCandidates[Random.Shared.Next(MidnightCandidates.Length)];  // 00:00:00

        int minute = dt.Minute;

        // 12-hour clock: 0 and 12 both become 12; 13-23 become 1-11
        int hour12     = dt.Hour % 12;
        if (hour12 == 0) hour12 = 12;

        // Next hour wraps: 12 -> 1, others just +1
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

        // Should never reach here given the :55 bucket covers minutes 0-59
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }

    /// <summary>
    /// Decomposes the fuzzy time phrase into a qualifier (context) and emphasis (the key word).
    /// Used by split-layout text styles to apply typographic hierarchy.
    /// Rules:
    /// - noon/midnight: qualifier="", emphasis=full word
    /// - "{h} o'clock": qualifier="", emphasis=full phrase ("three o'clock")
    /// - All other templates: qualifier=text before hour token (trimmed), emphasis=resolved hour word
    /// </summary>
    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720)
        {
            string noonCandidate = NoonCandidates[Random.Shared.Next(NoonCandidates.Length)];
            return ("", noonCandidate);
        }
        if (totalMinutes == 0)
        {
            string midnightCandidate = MidnightCandidates[Random.Shared.Next(MidnightCandidates.Length)];
            return ("", midnightCandidate);
        }

        int minute = dt.Minute;
        int hour12     = dt.Hour % 12;
        if (hour12 == 0) hour12 = 12;
        int nextHour12 = (hour12 % 12) + 1;

        foreach (var (upperBound, candidates) in Buckets)
        {
            if (minute <= upperBound)
            {
                string template = candidates[Random.Shared.Next(candidates.Length)];

                if (template == "{h} o'clock")
                    return ("", template.Replace("{h}", HourWords[hour12]));

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

                return ("", template.Replace("{h}", HourWords[hour12]).Replace("{h1}", HourWords[nextHour12]));
            }
        }

        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }

    public string GetSegmentKey(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "en-classic:noon";
        if (totalMinutes == 0)   return "en-classic:midnight";
        int minute = dt.Minute;
        for (int i = 0; i < Buckets.Length; i++)
            if (minute <= Buckets[i].UpperBound) return $"en-classic:{i}";
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }
}
