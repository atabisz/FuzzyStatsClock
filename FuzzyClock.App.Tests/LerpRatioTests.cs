using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Unit tests for GhostModeController.LerpRatio (Phase 86 D-08/D-09 pure-static helper).
/// Coverage scope per Phase 87 D-LERP-01: terminal-state snap only — convergence shape,
/// step-size bounds, and numerical edges (NaN, Infinity, alpha=0, deltaSeconds=0/negative)
/// are intentionally out of scope for this 13-line helper.
/// </summary>
[TestClass]
public class LerpRatioTests
{
    [TestMethod]
    [DataRow(1.0, 1.0, 15.0, 0.016, 1.0, DisplayName = "target=1.0, current=1.0 -> 1.0 (snap)")]
    [DataRow(1.0, 1.0, 15.0, 0.016, 0.5, DisplayName = "target=1.0, current=0.5 -> 1.0 (snap)")]
    [DataRow(1.0, 1.0, 15.0, 0.016, 0.0, DisplayName = "target=1.0, current=0.0 -> 1.0 (snap)")]
    [DataRow(0.0, 0.0, 15.0, 0.016, 0.0, DisplayName = "target=0.0, current=0.0 -> 0.0 (snap)")]
    [DataRow(0.0, 0.0, 15.0, 0.016, 0.5, DisplayName = "target=0.0, current=0.5 -> 0.0 (snap)")]
    [DataRow(0.0, 0.0, 15.0, 0.016, 1.0, DisplayName = "target=0.0, current=1.0 -> 0.0 (snap)")]
    public void LerpRatio_TerminalStateSnap(double target, double expected, double alpha, double deltaSeconds, double current)
    {
        double result = GhostModeController.LerpRatio(current, target, alpha, deltaSeconds);
        Assert.AreEqual(expected, result, 0.0001);
    }

    [TestMethod]
    public void LerpRatio_MidRangeTarget_DoesNotSnap()
    {
        // D-LERP-01 negative case: target=0.5 must NOT return 0.5. The exponential lerp
        // formula is `current + (target - current) * (1 - exp(-alpha * deltaSeconds))`.
        // Computing the expected value inline keeps this assertion robust to formula
        // re-derivation rather than depending on a hardcoded literal.
        double current = 0.0;
        double target = 0.5;
        double alpha = 15.0;
        double deltaSeconds = 0.016;
        double expected = current + (target - current) * (1.0 - Math.Exp(-alpha * deltaSeconds));

        double result = GhostModeController.LerpRatio(current, target, alpha, deltaSeconds);

        Assert.AreEqual(expected, result, 0.0001);
        Assert.AreNotEqual(0.5, result, "Mid-range target must not snap; snap is target-driven");
    }
}
