using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Tests for LcdTimeFormatHelper.FormatTime covering all 4 use24Hr/showSeconds combinations.
/// Sample time: 2026-03-11 14:05:09 (2:05:09 PM)
/// </summary>
[TestClass]
public class LcdTimeFormatHelperTests
{
    private static readonly System.DateTime _pm = new System.DateTime(2026, 3, 11, 14, 5, 9);

    [TestMethod]
    public void Format_24Hr_WithSeconds()
    {
        var result = LcdTimeFormatHelper.FormatTime(_pm, use24Hr: true, showSeconds: true);
        Assert.AreEqual("14:05:09", result);
    }

    [TestMethod]
    public void Format_24Hr_NoSeconds()
    {
        var result = LcdTimeFormatHelper.FormatTime(_pm, use24Hr: true, showSeconds: false);
        Assert.AreEqual("14:05", result);
    }

    [TestMethod]
    public void Format_12Hr_WithSeconds()
    {
        var result = LcdTimeFormatHelper.FormatTime(_pm, use24Hr: false, showSeconds: true);
        Assert.AreEqual(" 2:05:09", result);
    }

    [TestMethod]
    public void Format_12Hr_NoSeconds()
    {
        var result = LcdTimeFormatHelper.FormatTime(_pm, use24Hr: false, showSeconds: false);
        Assert.AreEqual(" 2:05", result);
    }
}
