using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Unit tests for NixieSizeMap.ToDigitHeight — verifies the three LcdSize tiers return the
/// expected pixel heights used by NixieClockView to size its NixieDigit UserControls.
/// </summary>
[TestClass]
public class NixieSizeMapTests
{
    [TestMethod]
    [DataRow(LcdSize.Small,  40.0)]
    [DataRow(LcdSize.Medium, 56.0)]
    [DataRow(LcdSize.Large,  72.0)]
    public void ToDigitHeight_ReturnsExpectedHeight(LcdSize size, double expected)
    {
        Assert.AreEqual(expected, NixieSizeMap.ToDigitHeight(size));
    }
}
