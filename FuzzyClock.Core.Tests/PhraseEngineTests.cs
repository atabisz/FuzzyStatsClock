using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class PhraseEngineTests
{
    // Helper: build a DateTime with specific hour and minute (date is arbitrary)
    private static DateTime T(int hour, int minute) =>
        new DateTime(2024, 1, 15, hour, minute, 0);

    // ----- Special cases -----

    [TestMethod]
    [DataRow(12, 0, "noon")]
    [DataRow(0,  0, "midnight")]
    public void SpecialCases_NoonAndMidnight(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :00 bucket (minutes 0–2) -----

    [TestMethod]
    [DataRow(3,  0, "3 o'clock")]
    [DataRow(3,  1, "3 o'clock")]
    [DataRow(3,  2, "3 o'clock")]
    [DataRow(9,  0, "9 o'clock")]
    [DataRow(15, 0, "3 o'clock")]  // 15:00 => hour12=3
    public void Bucket00_OClockBoundaries(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :05 bucket (minutes 3–7) -----

    [TestMethod]
    [DataRow(3,  3, "just after 3")]
    [DataRow(3,  7, "just after 3")]
    [DataRow(6,  5, "just after 6")]
    public void Bucket05_JustAfterBoundaries(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :10 bucket (minutes 8–12) -----

    [TestMethod]
    [DataRow(3,  8,  "ten past 3")]
    [DataRow(3,  12, "ten past 3")]
    [DataRow(7,  10, "ten past 7")]
    public void Bucket10_TenPastBoundaries(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :15 bucket (minutes 13–17) -----

    [TestMethod]
    [DataRow(3,  13, "a quarter past 3")]
    [DataRow(3,  17, "a quarter past 3")]
    [DataRow(8,  15, "a quarter past 8")]
    public void Bucket15_QuarterPastBoundaries(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :20 bucket (minutes 18–22) -----

    [TestMethod]
    [DataRow(3,  18, "just after quarter past 3")]
    [DataRow(3,  22, "just after quarter past 3")]
    [DataRow(5,  20, "just after quarter past 5")]
    public void Bucket20_JustAfterQuarterPastBoundaries(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :25 bucket (minutes 23–27) -----

    [TestMethod]
    [DataRow(3,  23, "almost half past 3")]
    [DataRow(3,  27, "almost half past 3")]
    [DataRow(10, 25, "almost half past 10")]
    public void Bucket25_AlmostHalfPastBoundaries(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :30 bucket (minutes 28–32) -----

    [TestMethod]
    [DataRow(3,  28, "half past 3")]
    [DataRow(3,  32, "half past 3")]
    [DataRow(11, 30, "half past 11")]
    public void Bucket30_HalfPastBoundaries(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :35 bucket (minutes 33–37) -----

    [TestMethod]
    [DataRow(3,  33, "just past half past 3")]
    [DataRow(3,  37, "just past half past 3")]
    [DataRow(9,  35, "just past half past 9")]
    public void Bucket35_JustPastHalfPastBoundaries(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :40 bucket (minutes 38–42) -----

    [TestMethod]
    [DataRow(3,  38, "almost a quarter before 4")]
    [DataRow(3,  42, "almost a quarter before 4")]
    [DataRow(11, 40, "almost a quarter before 12")]
    public void Bucket40_AlmostQuarterBeforeBoundaries(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :45 bucket (minutes 43–47) -----

    [TestMethod]
    [DataRow(3,  43, "a quarter before 4")]
    [DataRow(3,  47, "a quarter before 4")]
    [DataRow(11, 45, "a quarter before 12")]
    public void Bucket45_QuarterBeforeBoundaries(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :50 bucket (minutes 48–52) -----

    [TestMethod]
    [DataRow(3,  48, "nearly 4")]
    [DataRow(3,  52, "nearly 4")]
    [DataRow(11, 50, "nearly 12")]
    public void Bucket50_NearlyBoundaries(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- :55 bucket (minutes 53–59, extended to cover 58 and 59) -----

    [TestMethod]
    [DataRow(3,  53, "almost 4")]
    [DataRow(3,  57, "almost 4")]
    [DataRow(3,  58, "almost 4")]
    [DataRow(3,  59, "almost 4")]
    [DataRow(11, 55, "almost 12")]
    public void Bucket55_AlmostBoundariesIncluding58And59(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- Hour conversion edge cases -----

    [TestMethod]
    [DataRow(12,  5, "just after 12")]   // noon+5: NOT noon; hour12=12
    [DataRow(0,   5, "just after 12")]   // midnight+5: hour 0 => hour12=12
    [DataRow(12, 45, "a quarter before 1")]  // nextHour12=(12%12)+1=1, not 13
    [DataRow(11, 55, "almost 12")]           // nextHour12=(11%12)+1=12
    [DataRow(23, 55, "almost 12")]           // hour 23 => hour12=11, nextHour12=12
    [DataRow(13,  0, "1 o'clock")]           // 13:00 => hour12=1
    [DataRow(0,   1, "12 o'clock")]          // 00:01 => hour12=12
    public void HourConversionEdgeCases(int hour, int minute, string expected)
    {
        string result = PhraseEngine.GetPhrase(T(hour, minute));
        Assert.AreEqual(expected, result);
    }

    // ----- No "0" as hour value -----

    [TestMethod]
    public void NoPhraseContainsZeroAsHourValue()
    {
        // Verify midnight+5 uses "12" not "0"
        string result = PhraseEngine.GetPhrase(T(0, 5));
        Assert.DoesNotContain(" 0", result);
        Assert.Contains("12", result);
    }

    // ----- No DateTime.Now usage (structural test via behavior) -----

    [TestMethod]
    public void GetPhrase_AcceptsDateTimeParameter_ReturnsDeterministicResult()
    {
        // Same input => same output, always (no DateTime.Now inside)
        DateTime dt = new DateTime(2024, 6, 15, 3, 30, 0);
        string first  = PhraseEngine.GetPhrase(dt);
        string second = PhraseEngine.GetPhrase(dt);
        Assert.AreEqual(first, second);
        Assert.AreEqual("half past 3", first);
    }
}
