using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class PhraseEngineTests
{
    // Use provider directly — avoids race on PhraseEngine._activeProvider shared static.
    // PhraseEngine dispatch is tested separately in PhraseEngineCoordinatorTests.
    private static readonly IPhraseProvider _provider = new EnglishPhraseProvider();

    // Helper: build a DateTime with specific hour and minute (date is arbitrary)
    private static DateTime T(int hour, int minute) =>
        new DateTime(2024, 1, 15, hour, minute, 0);

    // ----- Special cases -----

    [TestMethod]
    [DataRow(12, 0, "noon")]
    [DataRow(0,  0, "midnight")]
    public void SpecialCases_NoonAndMidnight(int hour, int minute, string keyword)
    {
        // With randomization, check that phrase contains the expected keyword
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(keyword, StringComparison.OrdinalIgnoreCase),
            $"Phrase '{result}' should contain '{keyword}'");
    }

    // ----- :00 bucket (minutes 0–2) -----

    [TestMethod]
    [DataRow(3,  0, "three")]
    [DataRow(3,  1, "three")]
    [DataRow(3,  2, "three")]
    [DataRow(9,  0, "nine")]
    [DataRow(15, 0, "three")]  // 15:00 => hour12=3
    public void Bucket00_OClockBoundaries(int hour, int minute, string hourWord)
    {
        // With randomization, check that phrase contains the hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(hourWord, StringComparison.OrdinalIgnoreCase),
            $"O'clock phrase '{result}' should contain '{hourWord}'");
    }

    // ----- :05 bucket (minutes 3–7) -----

    [TestMethod]
    [DataRow(3,  3, "three")]
    [DataRow(3,  7, "three")]
    [DataRow(6,  5, "six")]
    public void Bucket05_JustAfterBoundaries(int hour, int minute, string hourWord)
    {
        // With randomization, check that phrase contains the hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(hourWord, StringComparison.OrdinalIgnoreCase),
            $"Just-after phrase '{result}' should contain '{hourWord}'");
    }

    // ----- :10 bucket (minutes 8–12) -----

    [TestMethod]
    [DataRow(3,  8,  "three")]
    [DataRow(3,  12, "three")]
    [DataRow(7,  10, "seven")]
    public void Bucket10_TenPastBoundaries(int hour, int minute, string hourWord)
    {
        // With randomization, check that phrase contains the hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(hourWord, StringComparison.OrdinalIgnoreCase),
            $"Ten-past phrase '{result}' should contain '{hourWord}'");
    }

    // ----- :15 bucket (minutes 13–17) -----

    [TestMethod]
    [DataRow(3,  13, "three")]
    [DataRow(3,  17, "three")]
    [DataRow(8,  15, "eight")]
    public void Bucket15_QuarterPastBoundaries(int hour, int minute, string hourWord)
    {
        // With randomization, check that phrase contains the hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(hourWord, StringComparison.OrdinalIgnoreCase),
            $"Quarter-past phrase '{result}' should contain '{hourWord}'");
    }

    // ----- :20 bucket (minutes 18–22) -----

    [TestMethod]
    [DataRow(3,  18, "three")]
    [DataRow(3,  22, "three")]
    [DataRow(5,  20, "five")]
    public void Bucket20_JustAfterQuarterPastBoundaries(int hour, int minute, string hourWord)
    {
        // With randomization, check that phrase contains the hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(hourWord, StringComparison.OrdinalIgnoreCase),
            $"Twenty-past phrase '{result}' should contain '{hourWord}'");
    }

    // ----- :25 bucket (minutes 23–27) -----

    [TestMethod]
    [DataRow(3,  23, "three")]
    [DataRow(3,  27, "three")]
    [DataRow(10, 25, "ten")]
    public void Bucket25_AlmostHalfPastBoundaries(int hour, int minute, string hourWord)
    {
        // With randomization, check that phrase contains the hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(hourWord, StringComparison.OrdinalIgnoreCase),
            $"Almost-half-past phrase '{result}' should contain '{hourWord}'");
    }

    // ----- :30 bucket (minutes 28–32) -----

    [TestMethod]
    [DataRow(3,  28, "three")]
    [DataRow(3,  32, "three")]
    [DataRow(11, 30, "eleven")]
    public void Bucket30_HalfPastBoundaries(int hour, int minute, string hourWord)
    {
        // With randomization, check that phrase contains the hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(hourWord, StringComparison.OrdinalIgnoreCase),
            $"Half-past phrase '{result}' should contain '{hourWord}'");
    }

    // ----- :35 bucket (minutes 33–37) -----

    [TestMethod]
    [DataRow(3,  33, "three")]
    [DataRow(3,  37, "three")]
    [DataRow(9,  35, "nine")]
    public void Bucket35_JustPastHalfPastBoundaries(int hour, int minute, string hourWord)
    {
        // With randomization, check that phrase contains the hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(hourWord, StringComparison.OrdinalIgnoreCase),
            $"Just-past-half-past phrase '{result}' should contain '{hourWord}'");
    }

    // ----- :40 bucket (minutes 38–42) -----

    [TestMethod]
    [DataRow(3,  38, "four")]
    [DataRow(3,  42, "four")]
    [DataRow(11, 40, "twelve")]
    public void Bucket40_AlmostQuarterBeforeBoundaries(int hour, int minute, string nextHourWord)
    {
        // With randomization, check that phrase contains the NEXT hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(nextHourWord, StringComparison.OrdinalIgnoreCase),
            $"Almost-quarter-before phrase '{result}' should contain '{nextHourWord}' (next hour)");
    }

    // ----- :45 bucket (minutes 43–47) -----

    [TestMethod]
    [DataRow(3,  43, "four")]
    [DataRow(3,  47, "four")]
    [DataRow(11, 45, "twelve")]
    public void Bucket45_QuarterBeforeBoundaries(int hour, int minute, string nextHourWord)
    {
        // With randomization, check that phrase contains the NEXT hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(nextHourWord, StringComparison.OrdinalIgnoreCase),
            $"Quarter-before phrase '{result}' should contain '{nextHourWord}' (next hour)");
    }

    // ----- :50 bucket (minutes 48–52) -----

    [TestMethod]
    [DataRow(3,  48, "four")]
    [DataRow(3,  52, "four")]
    [DataRow(11, 50, "twelve")]
    public void Bucket50_NearlyBoundaries(int hour, int minute, string nextHourWord)
    {
        // With randomization, check that phrase contains the NEXT hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(nextHourWord, StringComparison.OrdinalIgnoreCase),
            $"Nearly phrase '{result}' should contain '{nextHourWord}' (next hour)");
    }

    // ----- :55 bucket (minutes 53–59, extended to cover 58 and 59) -----

    [TestMethod]
    [DataRow(3,  53, "four")]
    [DataRow(3,  57, "four")]
    [DataRow(3,  58, "four")]
    [DataRow(3,  59, "four")]
    [DataRow(11, 55, "twelve")]
    public void Bucket55_AlmostBoundariesIncluding58And59(int hour, int minute, string nextHourWord)
    {
        // With randomization, check that phrase contains the NEXT hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(nextHourWord, StringComparison.OrdinalIgnoreCase),
            $"Almost phrase '{result}' should contain '{nextHourWord}' (next hour)");
    }

    // ----- Hour conversion edge cases -----

    [TestMethod]
    [DataRow(12,  5, "twelve")]   // noon+5: NOT noon; hour12=12
    [DataRow(0,   5, "twelve")]   // midnight+5: hour 0 => hour12=12
    [DataRow(12, 45, "one")]      // nextHour12=(12%12)+1=1, not 13
    [DataRow(11, 55, "twelve")]   // nextHour12=(11%12)+1=12
    [DataRow(23, 55, "twelve")]   // hour 23 => hour12=11, nextHour12=12
    [DataRow(13,  0, "one")]      // 13:00 => hour12=1
    [DataRow(0,   1, "twelve")]   // 00:01 => hour12=12
    public void HourConversionEdgeCases(int hour, int minute, string hourWord)
    {
        // With randomization, check that phrase contains the expected hour word
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.IsTrue(result.Contains(hourWord, StringComparison.OrdinalIgnoreCase),
            $"Phrase '{result}' should contain '{hourWord}'");
    }

    // ----- No "0" as hour value -----

    [TestMethod]
    public void NoPhraseContainsZeroAsHourValue()
    {
        // Verify midnight+5 uses "twelve" not "0"
        string result = _provider.GetPhrase(T(0, 5));
        Assert.DoesNotContain(" 0", result);
        Assert.Contains("twelve", result);
    }

    // ----- No DateTime.Now usage (structural test via behavior) -----

    [TestMethod]
    public void GetPhrase_AcceptsDateTimeParameter_ReturnsValidPhrase()
    {
        // Same input => should return a valid phrase (randomized from candidates)
        DateTime dt = new DateTime(2024, 6, 15, 3, 30, 0);
        string phrase = _provider.GetPhrase(dt);
        Assert.IsFalse(string.IsNullOrEmpty(phrase), "Phrase should not be empty");
        Assert.IsTrue(phrase.Contains("three", StringComparison.OrdinalIgnoreCase) ||
                     phrase.Contains("half", StringComparison.OrdinalIgnoreCase),
            $"Phrase '{phrase}' should be a half-past variant containing 'three' or 'half'");
    }
}

// ----- GetStructuredPhrase -----

[TestClass]
[DoNotParallelize]
public class GetStructuredPhraseTests
{
    // Use provider directly — avoids race on PhraseEngine._activeProvider shared static.
    private static readonly IPhraseProvider _provider = new EnglishPhraseProvider();

    private static DateTime T(int hour, int minute) =>
        new DateTime(2024, 1, 15, hour, minute, 0);

    [TestInitialize]
    public void EnsureClassicLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    [DataRow(12, 0)]
    [DataRow(0,  0)]
    public void SpecialCases_NoQualifier(int hour, int minute)
    {
        var (q, e) = _provider.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual("", q, "Special case qualifier should be empty");
        Assert.IsFalse(string.IsNullOrEmpty(e), "Special case emphasis should not be empty");
        if (hour == 12)
            Assert.IsTrue(e.Contains("noon", StringComparison.OrdinalIgnoreCase) || e.Contains("midday", StringComparison.OrdinalIgnoreCase),
                $"Noon emphasis should contain 'noon' or 'midday', got '{e}'");
        else
            Assert.IsTrue(e.Contains("midnight", StringComparison.OrdinalIgnoreCase),
                $"Midnight emphasis should contain 'midnight', got '{e}'");
    }

    [TestMethod]
    [DataRow(3,  0, "three")]
    [DataRow(9,  0, "nine")]
    public void OClockBucket_EmphasisContainsHourWord(int hour, int minute, string hourWord)
    {
        var (q, e) = _provider.GetStructuredPhrase(T(hour, minute));
        // O'clock bucket can have empty qualifier ("three o'clock") or non-empty ("just three", "exactly three")
        Assert.IsFalse(string.IsNullOrEmpty(e), "Emphasis should not be empty");
        Assert.IsTrue(e.Contains(hourWord, StringComparison.OrdinalIgnoreCase),
            $"Emphasis should contain '{hourWord}', got '{e}'");
    }

    [TestMethod]
    [DataRow(3,  5, "three")]
    [DataRow(3, 10, "three")]
    [DataRow(3, 15, "three")]
    [DataRow(3, 20, "three")]
    [DataRow(3, 25, "three")]
    [DataRow(3, 30, "three")]
    [DataRow(3, 35, "three")]
    public void CurrentHourTemplates_EmphasisContainsCurrentHour(int hour, int minute, string hourWord)
    {
        // With randomization, emphasis may be just the hour word or a phrase containing it
        var (q, e) = _provider.GetStructuredPhrase(T(hour, minute));
        Assert.IsTrue(e.Contains(hourWord, StringComparison.OrdinalIgnoreCase),
            $"Emphasis '{e}' should contain '{hourWord}'");
        // Qualifier may be empty (e.g., "three o'clock") or non-empty (e.g., "just after three")
    }

    [TestMethod]
    [DataRow(3, 40, "four")]
    [DataRow(3, 45, "four")]
    [DataRow(3, 50, "four")]
    [DataRow(3, 55, "four")]
    public void NextHourTemplates_EmphasisIsNextHour(int hour, int minute, string expectedEmph)
    {
        var (q, e) = _provider.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual(expectedEmph, e, $"Emphasis should be '{expectedEmph}' (next hour)");
        Assert.IsFalse(string.IsNullOrEmpty(q), "Qualifier should not be empty for to-hour phrases");
    }

    [TestMethod]
    [DataRow(12, 55, "one")]
    [DataRow(11, 50, "twelve")]
    public void HourWrap_EmphasisIsNextHour(int hour, int minute, string expectedEmph)
    {
        var (q, e) = _provider.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual(expectedEmph, e, $"Emphasis should be '{expectedEmph}' (next hour with wrap)");
        Assert.IsFalse(string.IsNullOrEmpty(q), "Qualifier should not be empty for to-hour phrases");
    }
}
