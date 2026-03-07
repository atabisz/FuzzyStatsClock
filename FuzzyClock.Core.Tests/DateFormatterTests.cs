using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class DateFormatterTests
{
    // Fixed test date: Saturday, March 7, 2026
    private static readonly DateTime TestDate = new DateTime(2026, 3, 7);

    // ----- Short format -----

    [TestMethod]
    public void Short_ReturnsAbbreviatedDayAndMonth()
    {
        Assert.AreEqual("Sat, Mar 7", DateFormatter.Format("Short", TestDate));
    }

    // ----- Long format -----

    [TestMethod]
    public void Long_ReturnsFullDayAndMonth()
    {
        Assert.AreEqual("Saturday, March 7", DateFormatter.Format("Long", TestDate));
    }

    // ----- Numeric format -----

    [TestMethod]
    public void Numeric_ReturnsMSlashDSlashYYYY()
    {
        Assert.AreEqual("3/7/2026", DateFormatter.Format("Numeric", TestDate));
    }

    // ----- ISO format -----

    [TestMethod]
    public void ISO_ReturnsYYYYDashMMDashDD()
    {
        Assert.AreEqual("2026-03-07", DateFormatter.Format("ISO", TestDate));
    }

    // ----- Fallback: unknown values default to Short -----

    [TestMethod]
    [DataRow("",        "Sat, Mar 7")]
    [DataRow("unknown", "Sat, Mar 7")]
    public void UnknownFormat_FallsBackToShort(string format, string expected)
    {
        Assert.AreEqual(expected, DateFormatter.Format(format, TestDate));
    }
}
