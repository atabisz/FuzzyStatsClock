using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Tests for SettingsService.Validate(), Clamp(), and Defaults().
/// STEST-03: Validate() corrects StatsIntervalSeconds=0 to 3
/// STEST-04: Validate() corrects Opacity=0.0 to 1.0
/// STEST-05: Validate() corrects null/empty/whitespace AccentColor to "#FFFFFFFF"
/// STEST-06: Pure Clamp(MonitorPosition,...) clamps out-of-bounds positions into bounds
/// STEST-07: Pure Clamp(MonitorPosition,...) leaves already-in-bounds positions unchanged
/// STEST-08: Defaults() returns empty MonitorPositions and empty LastActiveMonitor
/// </summary>
[TestClass]
public class SettingsServiceTests
{
    // STEST-03: StatsIntervalSeconds=0 is corrected to the safe default (3).
    // A zero interval causes the DispatcherTimer to fire at max rate (CPU spike).
    [TestMethod]
    public void Validate_ZeroStatsInterval_ReturnsDefault()
    {
        var input  = new AppSettings { StatsIntervalSeconds = 0 };
        var result = SettingsService.Validate(input);
        Assert.AreEqual(3, result.StatsIntervalSeconds);
    }

    // STEST-04: Opacity=0.0 is corrected to 1.0 — prevents invisible-widget regression.
    [TestMethod]
    public void Validate_ZeroOpacity_ReturnsDefault()
    {
        var input  = new AppSettings { Opacity = 0.0 };
        var result = SettingsService.Validate(input);
        Assert.AreEqual(1.0, result.Opacity, 0.0001);
    }

    // STEST-05: Null or whitespace AccentColor is corrected to "#FFFFFFFF".
    // Three sub-cases: null, empty string, whitespace-only.
    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("   ")]
    public void Validate_NullOrWhitespaceAccentColor_ReturnsDefault(string? accentColor)
    {
        // AccentColor is non-nullable in AppSettings but we force null to test the guard
        var input  = new AppSettings { AccentColor = accentColor! };
        var result = SettingsService.Validate(input);
        Assert.AreEqual("#FFFFFFFF", result.AccentColor);
    }

    // STEST-06: Out-of-bounds MonitorPosition is clamped into the screen area.
    // Screen: 1920x1080 at origin (0,0). Window: 200x100. Bounds: Left [0..1720], Top [0..980].
    // Input Left=-100, Top=-50 — both clamped to 0.
    [TestMethod]
    public void Clamp_OutOfBounds_ClampsToScreenEdge()
    {
        var pos    = new MonitorPosition { Left = -100, Top = -50 };
        var result = SettingsService.Clamp(pos,
            windowWidth: 200, windowHeight: 100,
            bLeft: 0, bTop: 0, bWidth: 1920, bHeight: 1080);
        Assert.AreEqual(0.0, result.Left,  0.0001, "Left should be clamped to bLeft (0)");
        Assert.AreEqual(0.0, result.Top,   0.0001, "Top should be clamped to bTop (0)");
    }

    // STEST-07: Already in-bounds MonitorPosition is returned unchanged.
    // Left=500, Top=200 is well within the 1920x1080 screen for a 200x100 window.
    [TestMethod]
    public void Clamp_InBounds_ReturnsUnchanged()
    {
        var pos    = new MonitorPosition { Left = 500, Top = 200 };
        var result = SettingsService.Clamp(pos,
            windowWidth: 200, windowHeight: 100,
            bLeft: 0, bTop: 0, bWidth: 1920, bHeight: 1080);
        Assert.AreEqual(500.0, result.Left,  0.0001, "Left should be unchanged");
        Assert.AreEqual(200.0, result.Top,   0.0001, "Top should be unchanged");
    }

    [TestMethod]
    [DataRow(100.0, 50.0,  200.0, 100.0,  0.0, 0.0, 1920.0, 1080.0,  100.0, 50.0)]   // within bounds
    [DataRow(-50.0, -10.0, 200.0, 100.0,  0.0, 0.0, 1920.0, 1080.0,    0.0,  0.0)]   // off left/top — clamped
    [DataRow(1900.0, 1000.0, 200.0, 100.0, 0.0, 0.0, 1920.0, 1080.0, 1720.0, 980.0)] // off right/bottom
    public void Clamp_MonitorPosition_ClampsWithinBounds(
        double left, double top, double winW, double winH,
        double bLeft, double bTop, double bWidth, double bHeight,
        double expectedLeft, double expectedTop)
    {
        var pos = new MonitorPosition { Left = left, Top = top };
        var result = SettingsService.Clamp(pos, winW, winH, bLeft, bTop, bWidth, bHeight);
        Assert.AreEqual(expectedLeft, result.Left,  1e-9);
        Assert.AreEqual(expectedTop,  result.Top,   1e-9);
    }

    [TestMethod]
    public void Defaults_HasEmptyMonitorPositionsAndLastActiveMonitor()
    {
        var defaults = SettingsService.Defaults();
        Assert.IsNotNull(defaults.MonitorPositions);
        Assert.IsEmpty(defaults.MonitorPositions);
        Assert.AreEqual("", defaults.LastActiveMonitor);
    }

    [TestMethod]
    public void Validate_InvalidTextStyle_ResetsToClassic()
    {
        var s = new AppSettings { TextStyle = "NotAStyle" };
        var result = SettingsService.Validate(s);
        Assert.AreEqual("Classic", result.TextStyle);
    }

    [TestMethod]
    public void Validate_EmptyTextStyle_ResetsToClassic()
    {
        var s = new AppSettings { TextStyle = "" };
        var result = SettingsService.Validate(s);
        Assert.AreEqual("Classic", result.TextStyle);
    }

    [TestMethod]
    [DataRow("Classic")]
    [DataRow("Split")]
    [DataRow("Literary")]
    [DataRow("Mono")]
    public void Validate_ValidTextStyle_Preserved(string style)
    {
        var s = new AppSettings { TextStyle = style };
        var result = SettingsService.Validate(s);
        Assert.AreEqual(style, result.TextStyle);
    }

    [TestMethod]
    public void Validate_InvalidLcdStyle_ResetsToDark()
    {
        var input  = new AppSettings { LcdStyle = "Broken" };
        var result = SettingsService.Validate(input);
        Assert.AreEqual("Dark", result.LcdStyle,
            "LcdStyle 'Broken' should reset to Dark default");
    }
}
