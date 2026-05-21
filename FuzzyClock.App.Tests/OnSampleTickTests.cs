// NOTE: Direct-write `controller._isGhostMode = isGhostModePre;` setup arranges the seam
// pre-state for RestoreNoEvent / RestoreWithEvent rows. This does NOT violate the Phase 85
// D-06 single-owner ownership rule on `_isGhostMode`: production-side writes remain owned
// by `OnSampleTick` (writes false) and `Activate()` (writes true). The test code is the only
// new writer and only for arrange-act-assert setup, never as part of a production code path.
// Visibility relaxation from `private` to `internal` lands in the same plan (Phase 87
// D-SEAM-02b) and is reachable via the existing `InternalsVisibleTo("FuzzyClock.App.Tests")`
// declaration in FuzzyClock.App.csproj.

using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Tests for the four GhostTransition values returned by GhostModeController.OnSampleTick.
/// D-SEAM-01 scope: None / Activate / RestoreNoEvent / RestoreWithEvent only.
/// Modifier-force-zero (SEM-03), !IsEnabled disable-gate (SEM-05), and the RatioChanged flag
/// are intentionally out of scope (covered elsewhere or below TEST-03's stated goal).
/// Widget rect convention matches GhostModeControllerProximityTests: 100x100 widget at (100,100).
/// </summary>
[TestClass]
internal class OnSampleTickTests
{
    [TestMethod]
    [DataRow(50,  150, false, GhostModeController.GhostTransition.None,             DisplayName = "far+!ghost -> None")]
    [DataRow(150, 150, false, GhostModeController.GhostTransition.Activate,         DisplayName = "inside+!ghost -> Activate")]
    [DataRow(75,  150, true,  GhostModeController.GhostTransition.RestoreNoEvent,   DisplayName = "mid+ghost -> RestoreNoEvent")]
    // Note: Plan's CONTEXT.md <specifics> proposed cursorX=50 for this row, but with the default
    // radius of 80px the distance from rect-left=100 is only 50px, yielding ratio=0.375 (not 0.0)
    // and producing RestoreNoEvent. Using cursorX=10 (distance 90px > radius 80px) gives ratio=0.0
    // as the row's behavior assertion requires for RestoreWithEvent.
    [DataRow(10,  150, true,  GhostModeController.GhostTransition.RestoreWithEvent, DisplayName = "far+ghost -> RestoreWithEvent")]
    public void OnSampleTick_TransitionClasses_ReturnsExpected(
        int cursorX, int cursorY, bool isGhostModePre, GhostModeController.GhostTransition expectedTransition)
    {
        // Arrange: fresh controller, drive ghost-mode pre-state directly via D-SEAM-02b internal field write
        var controller = new GhostModeController();
        controller._isGhostMode = isGhostModePre;

        // Act: invoke the pure-logic seam with the standard 100x100 widget rect at (100,100), no modifiers held
        var result = controller.OnSampleTick(cursorX, cursorY, 100, 100, 200, 200, modifiersHeld: false);

        // Assert: only the transition class is asserted; ratio and RatioChanged are out of D-SEAM-01 scope
        Assert.AreEqual(expectedTransition, result.Transition);
    }
}
