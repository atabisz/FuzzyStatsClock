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
    public void SpecialCases_NoonAndMidnight(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :00 bucket (minutes 0–2) -----

    [TestMethod]
    [DataRow(3,  0, "three o'clock")]
    [DataRow(3,  1, "three o'clock")]
    [DataRow(3,  2, "three o'clock")]
    [DataRow(9,  0, "nine o'clock")]
    [DataRow(15, 0, "three o'clock")]  // 15:00 => hour12=3
    public void Bucket00_OClockBoundaries(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :05 bucket (minutes 3–7) -----

    [TestMethod]
    [DataRow(3,  3, "just after three")]
    [DataRow(3,  7, "just after three")]
    [DataRow(6,  5, "just after six")]
    public void Bucket05_JustAfterBoundaries(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :10 bucket (minutes 8–12) -----

    [TestMethod]
    [DataRow(3,  8,  "ten past three")]
    [DataRow(3,  12, "ten past three")]
    [DataRow(7,  10, "ten past seven")]
    public void Bucket10_TenPastBoundaries(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :15 bucket (minutes 13–17) -----

    [TestMethod]
    [DataRow(3,  13, "a quarter past three")]
    [DataRow(3,  17, "a quarter past three")]
    [DataRow(8,  15, "a quarter past eight")]
    public void Bucket15_QuarterPastBoundaries(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :20 bucket (minutes 18–22) -----

    [TestMethod]
    [DataRow(3,  18, "just after quarter past three")]
    [DataRow(3,  22, "just after quarter past three")]
    [DataRow(5,  20, "just after quarter past five")]
    public void Bucket20_JustAfterQuarterPastBoundaries(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :25 bucket (minutes 23–27) -----

    [TestMethod]
    [DataRow(3,  23, "almost half past three")]
    [DataRow(3,  27, "almost half past three")]
    [DataRow(10, 25, "almost half past ten")]
    public void Bucket25_AlmostHalfPastBoundaries(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :30 bucket (minutes 28–32) -----

    [TestMethod]
    [DataRow(3,  28, "half past three")]
    [DataRow(3,  32, "half past three")]
    [DataRow(11, 30, "half past eleven")]
    public void Bucket30_HalfPastBoundaries(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :35 bucket (minutes 33–37) -----

    [TestMethod]
    [DataRow(3,  33, "just past half past three")]
    [DataRow(3,  37, "just past half past three")]
    [DataRow(9,  35, "just past half past nine")]
    public void Bucket35_JustPastHalfPastBoundaries(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :40 bucket (minutes 38–42) -----

    [TestMethod]
    [DataRow(3,  38, "almost a quarter before four")]
    [DataRow(3,  42, "almost a quarter before four")]
    [DataRow(11, 40, "almost a quarter before twelve")]
    public void Bucket40_AlmostQuarterBeforeBoundaries(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :45 bucket (minutes 43–47) -----

    [TestMethod]
    [DataRow(3,  43, "a quarter before four")]
    [DataRow(3,  47, "a quarter before four")]
    [DataRow(11, 45, "a quarter before twelve")]
    public void Bucket45_QuarterBeforeBoundaries(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :50 bucket (minutes 48–52) -----

    [TestMethod]
    [DataRow(3,  48, "nearly four")]
    [DataRow(3,  52, "nearly four")]
    [DataRow(11, 50, "nearly twelve")]
    public void Bucket50_NearlyBoundaries(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :55 bucket (minutes 53–59, extended to cover 58 and 59) -----

    [TestMethod]
    [DataRow(3,  53, "almost four")]
    [DataRow(3,  57, "almost four")]
    [DataRow(3,  58, "almost four")]
    [DataRow(3,  59, "almost four")]
    [DataRow(11, 55, "almost twelve")]
    public void Bucket55_AlmostBoundariesIncluding58And59(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- Hour conversion edge cases -----

    [TestMethod]
    [DataRow(12,  5, "just after twelve")]   // noon+5: NOT noon; hour12=12
    [DataRow(0,   5, "just after twelve")]   // midnight+5: hour 0 => hour12=12
    [DataRow(12, 45, "a quarter before one")]  // nextHour12=(12%12)+1=1, not 13
    [DataRow(11, 55, "almost twelve")]          // nextHour12=(11%12)+1=12
    [DataRow(23, 55, "almost twelve")]          // hour 23 => hour12=11, nextHour12=12
    [DataRow(13,  0, "one o'clock")]            // 13:00 => hour12=1
    [DataRow(0,   1, "twelve o'clock")]         // 00:01 => hour12=12
    public void HourConversionEdgeCases(int hour, int minute, string expected)
    {
        string result = _provider.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
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
    public void GetPhrase_AcceptsDateTimeParameter_ReturnsDeterministicResult()
    {
        // Same input => same output, always (no DateTime.Now inside)
        DateTime dt = new DateTime(2024, 6, 15, 3, 30, 0);
        string first  = _provider.GetPhrase(dt);
        string second = _provider.GetPhrase(dt);
        Assert.AreEqual(first, second);
        Assert.AreEqual("half past three", first);
    }
}

// ----- GetStructuredPhrase -----

[TestClass]
public class GetStructuredPhraseTests
{
    // Use provider directly — avoids race on PhraseEngine._activeProvider shared static.
    private static readonly IPhraseProvider _provider = new EnglishPhraseProvider();

    private static DateTime T(int hour, int minute) =>
        new DateTime(2024, 1, 15, hour, minute, 0);

    [TestMethod]
    [DataRow(12, 0, "",           "noon")]
    [DataRow(0,  0, "",           "midnight")]
    public void SpecialCases_NoQualifier(int hour, int minute, string expectedQual, string expectedEmph)
    {
        var (q, e) = _provider.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual(expectedQual, q);
        Assert.AreEqual(expectedEmph, e);
    }

    [TestMethod]
    [DataRow(3,  0, "",           "three o'clock")]
    [DataRow(9,  0, "",           "nine o'clock")]
    public void OClockBucket_WholeExpressionIsEmphasis(int hour, int minute, string expectedQual, string expectedEmph)
    {
        var (q, e) = _provider.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual(expectedQual, q);
        Assert.AreEqual(expectedEmph, e);
    }

    [TestMethod]
    [DataRow(3,  5, "just after",              "three")]
    [DataRow(3, 10, "ten past",                "three")]
    [DataRow(3, 15, "a quarter past",          "three")]
    [DataRow(3, 20, "just after quarter past", "three")]
    [DataRow(3, 25, "almost half past",        "three")]
    [DataRow(3, 30, "half past",               "three")]
    [DataRow(3, 35, "just past half past",     "three")]
    public void CurrentHourTemplates_QualifierAndEmphasis(int hour, int minute, string expectedQual, string expectedEmph)
    {
        var (q, e) = _provider.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual(expectedQual, q);
        Assert.AreEqual(expectedEmph, e);
    }

    [TestMethod]
    [DataRow(3, 40, "almost a quarter before", "four")]
    [DataRow(3, 45, "a quarter before",        "four")]
    [DataRow(3, 50, "nearly",                  "four")]
    [DataRow(3, 55, "almost",                  "four")]
    public void NextHourTemplates_QualifierAndEmphasis(int hour, int minute, string expectedQual, string expectedEmph)
    {
        var (q, e) = _provider.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual(expectedQual, q);
        Assert.AreEqual(expectedEmph, e);
    }

    [TestMethod]
    [DataRow(12, 55, "almost", "one")]
    [DataRow(11, 50, "nearly", "twelve")]
    public void HourWrap_QualifierAndEmphasis(int hour, int minute, string expectedQual, string expectedEmph)
    {
        var (q, e) = _provider.GetStructuredPhrase(T(hour, minute));
        Assert.AreEqual(expectedQual, q);
        Assert.AreEqual(expectedEmph, e);
    }
}
