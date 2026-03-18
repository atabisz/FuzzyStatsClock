namespace FuzzyClock.Core;

public static class PhraseWrapService
{
    private static readonly string[] NaturalPauseMarkers =
    [
        "just after quarter past ",  // match longest first
        "almost a quarter before ",
        "just past half past ",
        "a quarter before ",
        "a quarter past ",
        "almost half past ",
        "just after ",
        "half past ",
        "just past ",
        "ten past ",
        "ten to ",
        "nearly ",
        "almost ",
    ];

    /// <summary>
    /// Splits a phrase into two lines for display.
    /// Returns null when the phrase cannot be split (null, empty, or single word).
    /// </summary>
    /// <param name="phrase">The phrase to split.</param>
    /// <param name="style">"natural" uses grammatical pause markers; any other value uses midpoint.</param>
    /// <param name="allowNatural">When false, always uses midpoint regardless of style. Pass false for non-English locales.</param>
    public static (string Line1, string Line2)? ComputeSplit(string phrase, string style, bool allowNatural = true)
    {
        if (string.IsNullOrWhiteSpace(phrase)) return null;
        var words = phrase.Split(' ');
        if (words.Length < 2) return null;

        return (style == "natural" && allowNatural)
            ? SplitNatural(phrase, words)
            : SplitMidpoint(phrase, words);
    }

    private static (string Line1, string Line2) SplitMidpoint(string phrase, string[] words)
    {
        int mid = phrase.Length / 2;
        int best = 0;
        int bestDist = int.MaxValue;
        int pos = 0;
        for (int i = 0; i < words.Length - 1; i++)
        {
            pos += words[i].Length + 1;  // pos = start index of next word
            int dist = Math.Abs(pos - mid);
            if (dist < bestDist)
            {
                bestDist = dist;
                best = i;
            }
        }
        string line1 = string.Join(" ", words[..(best + 1)]);
        string line2 = string.Join(" ", words[(best + 1)..]);
        return (line1, line2);
    }

    private static (string Line1, string Line2) SplitNatural(string phrase, string[] words)
    {
        foreach (var marker in NaturalPauseMarkers)
        {
            if (phrase.StartsWith(marker, StringComparison.OrdinalIgnoreCase))
            {
                string line1 = phrase[..(marker.Length - 1)].TrimEnd();  // strip trailing space
                string line2 = phrase[marker.Length..];
                if (!string.IsNullOrWhiteSpace(line2))
                    return (line1, line2);
            }
        }
        // No marker matched — fall back to midpoint
        return SplitMidpoint(phrase, words);
    }
}
