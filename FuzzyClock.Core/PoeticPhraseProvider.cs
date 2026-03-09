namespace FuzzyClock.Core;

/// <summary>
/// Evocative time-of-day phrase provider (en-poetic).
/// Returns poetic descriptions based on hour ranges rather than per-minute buckets.
/// </summary>
public class PoeticPhraseProvider : IPhraseProvider
{
    public string GetPhrase(DateTime dt)
    {
        int h = dt.Hour;
        int m = dt.Minute;

        // Special exact cases first
        if (h == 0 && m == 0) return "the witching hour";
        if (h == 12 && m == 0) return "high noon";

        // Hour-range segments
        if (h >= 1 && h <= 5)   return "the small hours";
        if (h >= 6 && h <= 8)   return "the morning stirs";
        if (h >= 9 && h <= 11)  return "the day grows long";
        if (h == 12)             return "early afternoon";
        if (h == 13)             return "early afternoon";
        if (h >= 14 && h <= 16) return "the afternoon wanes";
        if (h >= 17 && h <= 18) return "the golden hour";
        if (h >= 19 && h <= 20) return "dusk settles";
        if (h >= 21 && h <= 22) return "the evening deepens";
        if (h == 23)             return "the night draws in";

        // Fallback for midnight range (h == 0, m > 0)
        return "the small hours";
    }

    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) =>
        ("", GetPhrase(dt));
}
