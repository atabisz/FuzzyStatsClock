using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Tests for SettingsService.Validate() and pure Clamp() overload.
/// STEST-03: Validate() corrects StatsIntervalSeconds=0 to 3
/// STEST-04: Validate() corrects Opacity=0.0 to 1.0
/// STEST-05: Validate() corrects null/empty/whitespace AccentColor to "#FFFFFFFF"
/// STEST-06: Pure Clamp() clamps out-of-bounds Left/Top into bounds
/// STEST-07: Pure Clamp() leaves already-in-bounds Left/Top unchanged
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

    // STEST-06: Out-of-bounds Left/Top are clamped into the screen area.
    // Screen: 1920x1080 at origin (0,0). Window: 200x100. Bounds: Left [0..1720], Top [0..980].
    // Input Left=-100, Top=-50 — both clamped to 0.
    [TestMethod]
    public void Clamp_OutOfBounds_ClampsToScreenEdge()
    {
        var input  = new AppSettings { Left = -100, Top = -50 };
        var result = SettingsService.Clamp(input,
            windowWidth: 200, windowHeight: 100,
            vLeft: 0, vTop: 0, vWidth: 1920, vHeight: 1080);
        Assert.AreEqual(0.0, result.Left,  0.0001, "Left should be clamped to vLeft (0)");
        Assert.AreEqual(0.0, result.Top,   0.0001, "Top should be clamped to vTop (0)");
    }

    // STEST-07: Already in-bounds Left/Top are returned unchanged.
    // Left=500, Top=200 is well within the 1920x1080 screen for a 200x100 window.
    [TestMethod]
    public void Clamp_InBounds_ReturnsUnchanged()
    {
        var input  = new AppSettings { Left = 500, Top = 200 };
        var result = SettingsService.Clamp(input,
            windowWidth: 200, windowHeight: 100,
            vLeft: 0, vTop: 0, vWidth: 1920, vHeight: 1080);
        Assert.AreEqual(500.0, result.Left,  0.0001, "Left should be unchanged");
        Assert.AreEqual(200.0, result.Top,   0.0001, "Top should be unchanged");
    }
}
