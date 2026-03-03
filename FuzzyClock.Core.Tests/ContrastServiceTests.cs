using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class ContrastServiceTests
{
    // ----- RelativeLuminance -----

    [TestMethod]
    public void RelativeLuminance_Black_ReturnsZero()
    {
        double lum = ContrastService.RelativeLuminance(new RgbColor(0, 0, 0));
        Assert.AreEqual(0.0, lum, 0.001);
    }

    [TestMethod]
    public void RelativeLuminance_White_ReturnsOne()
    {
        double lum = ContrastService.RelativeLuminance(new RgbColor(255, 255, 255));
        Assert.AreEqual(1.0, lum, 0.001);
    }

    [TestMethod]
    [DataRow((byte)128, (byte)128, (byte)128, 0.216)]
    public void RelativeLuminance_MidGray_ApproximatesExpected(byte r, byte g, byte b, double expected)
    {
        double lum = ContrastService.RelativeLuminance(new RgbColor(r, g, b));
        Assert.AreEqual(expected, lum, 0.01);
    }

    // ----- ContrastRatio -----

    [TestMethod]
    public void ContrastRatio_BlackVsWhite_Returns21()
    {
        double ratio = ContrastService.ContrastRatio(
            new RgbColor(0, 0, 0),
            new RgbColor(255, 255, 255));
        Assert.AreEqual(21.0, ratio, 0.1);
    }

    [TestMethod]
    public void ContrastRatio_IdenticalColors_ReturnsOne()
    {
        double ratio = ContrastService.ContrastRatio(
            new RgbColor(255, 255, 255),
            new RgbColor(255, 255, 255));
        Assert.AreEqual(1.0, ratio, 0.001);
    }

    // ----- ComputeDisplayColor — Normal path (no override needed) -----

    [TestMethod]
    public void ComputeDisplayColor_WhiteBgBlackAccent_ReturnsNormal()
    {
        // black on white has ~21:1 ratio — well above 5.5, Normal state stays Normal
        var (displayColor, newState) = ContrastService.ComputeDisplayColor(
            background: new RgbColor(255, 255, 255),
            accent: new RgbColor(0, 0, 0),
            currentState: ContrastState.Normal);

        Assert.AreEqual(ContrastState.Normal, newState);
        Assert.AreEqual(new RgbColor(0, 0, 0), displayColor);
    }

    // ----- ComputeDisplayColor — Override entry -----

    [TestMethod]
    public void ComputeDisplayColor_LightBgWhiteAccent_EntersOverride()
    {
        // white on white: ratio=1.0 < 4.5 → must enter override
        var (displayColor, newState) = ContrastService.ComputeDisplayColor(
            background: new RgbColor(255, 255, 255),
            accent: new RgbColor(255, 255, 255),
            currentState: ContrastState.Normal);

        Assert.AreEqual(ContrastState.Override, newState);
        // Returned color must NOT be white (must have sufficient contrast against white)
        Assert.AreNotEqual(new RgbColor(255, 255, 255), displayColor);
        double ratio = ContrastService.ContrastRatio(new RgbColor(255, 255, 255), displayColor);
        Assert.IsGreaterThanOrEqualTo(4.5, ratio, $"Expected ratio >= 4.5 but got {ratio:F2}");
    }

    [TestMethod]
    public void ComputeDisplayColor_DarkBgBlackAccent_EntersOverride()
    {
        // black on black: ratio=1.0 < 4.5 → must enter override
        var (displayColor, newState) = ContrastService.ComputeDisplayColor(
            background: new RgbColor(0, 0, 0),
            accent: new RgbColor(0, 0, 0),
            currentState: ContrastState.Normal);

        Assert.AreEqual(ContrastState.Override, newState);
        Assert.AreNotEqual(new RgbColor(0, 0, 0), displayColor);
        double ratio = ContrastService.ContrastRatio(new RgbColor(0, 0, 0), displayColor);
        Assert.IsGreaterThanOrEqualTo(4.5, ratio, $"Expected ratio >= 4.5 but got {ratio:F2}");
    }

    // ----- ComputeDisplayColor — Hysteresis -----

    [TestMethod]
    public void ComputeDisplayColor_HysteresisRetainsOverride_WhenRatioBetween4_5And5_5()
    {
        // #FFFFFF bg + #767676 accent ≈ 4.54:1 (inside hysteresis band 4.5–5.5).
        // When currentState=Override, must stay Override even though ratio passes 4.5.
        var bg = new RgbColor(255, 255, 255);
        var accent = new RgbColor(0x76, 0x76, 0x76);
        double ratio = ContrastService.ContrastRatio(bg, accent);

        // Confirm test precondition: ratio must be in hysteresis band.
        Assert.IsGreaterThanOrEqualTo(4.5, ratio, $"Precondition: ratio={ratio:F2} must be >= 4.5");
        Assert.IsLessThanOrEqualTo(5.5, ratio, $"Precondition: ratio={ratio:F2} must be <= 5.5");

        var (_, newState) = ContrastService.ComputeDisplayColor(bg, accent, ContrastState.Override);
        Assert.AreEqual(ContrastState.Override, newState,
            $"Expected Override to be retained (ratio={ratio:F2} in hysteresis band 4.5–5.5)");
    }

    [TestMethod]
    public void ComputeDisplayColor_HysteresisExitsAbove5_5()
    {
        // When currentState=Override and ratio > 5.5 → exits to Normal, returns accent as-is
        // White bg + #595959 is approximately 7.0:1 — above 5.5
        var bg = new RgbColor(255, 255, 255);
        var accent = new RgbColor(0x59, 0x59, 0x59);
        double ratio = ContrastService.ContrastRatio(bg, accent);
        Assert.IsGreaterThan(5.5, ratio, $"Test setup: expected ratio > 5.5, got {ratio:F2}");

        var (displayColor, newState) = ContrastService.ComputeDisplayColor(bg, accent, ContrastState.Override);

        Assert.AreEqual(ContrastState.Normal, newState);
        Assert.AreEqual(accent, displayColor);
    }
}
