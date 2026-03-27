using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Unit tests for GhostModeController.ComputeProximityRatio.
/// Widget rect used in all parametric tests: Left=100, Top=100, Right=200, Bottom=200 (100x100 widget).
/// </summary>
[TestClass]
public class GhostModeControllerProximityTests
{
    [TestMethod]
    [DataRow(50,  150, 50, 0.0,  DisplayName = "50px left of edge, radius=50 -> 0.0 (zone boundary)")]
    [DataRow(75,  150, 50, 0.5,  DisplayName = "25px from edge, radius=50 -> 0.5")]
    [DataRow(40,  150, 50, 0.0,  DisplayName = "60px outside zone, radius=50 -> clamped 0.0")]
    [DataRow(150, 150, 50, 1.0,  DisplayName = "inside rect -> 1.0")]
    [DataRow(75,  75,  50, 0.5,  DisplayName = "diagonal 25px from corner, radius=50 -> 0.5")]
    [DataRow(150, 90,  50, 0.8,  DisplayName = "10px above top edge, radius=50 -> 0.8")]
    [DataRow(100, 150, 50, 1.0,  DisplayName = "on exact left edge -> 1.0 (inside)")]
    [DataRow(200, 150, 50, 1.0,  DisplayName = "on exact right edge -> 1.0 (inside)")]
    [DataRow(150, 100, 50, 1.0,  DisplayName = "on exact top edge -> 1.0 (inside)")]
    [DataRow(400, 150, 500, 0.5, DisplayName = "large radius 500, 250px away -> 0.5")]
    public void ComputeProximityRatio_VariousPositions(int cursorX, int cursorY, int radius, double expected)
    {
        double result = GhostModeController.ComputeProximityRatio(
            cursorX, cursorY, 100, 100, 200, 200, radius);
        Assert.AreEqual(expected, result, 0.0001);
    }

    [TestMethod]
    public void ComputeProximityRatio_ZeroRadius_InsideRect_Returns1()
    {
        double result = GhostModeController.ComputeProximityRatio(150, 150, 100, 100, 200, 200, 0);
        Assert.AreEqual(1.0, result, 0.0001);
    }

    [TestMethod]
    public void ComputeProximityRatio_ZeroRadius_OutsideRect_Returns0()
    {
        double result = GhostModeController.ComputeProximityRatio(50, 50, 100, 100, 200, 200, 0);
        Assert.AreEqual(0.0, result, 0.0001);
    }
}
