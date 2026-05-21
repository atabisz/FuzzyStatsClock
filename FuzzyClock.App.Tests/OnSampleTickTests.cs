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
    // Phase 87 WR-04: encode the test geometry as named constants so the radius-dependence
    // of each cursorX value is explicit. The 100x100 widget rect at (100,100) and the
    // default fade radius (80px) together fix what counts as "inside", "mid" and "far" —
    // those classifications must remain valid if anyone changes the constants below, so
    // they are spelled out here rather than hidden in DataRow literals + a prose comment.
    private const int RectLeft   = 100;
    private const int RectTop    = 100;
    private const int RectRight  = 200;
    private const int RectBottom = 200;
    // GhostModeController._ghostFadeRadiusPx default is 80 (see GhostModeController.cs:76).
    // If that default changes, the cursorX values below stop classifying correctly and
    // the test must be updated in lockstep — the named constant makes the dependency
    // grep-discoverable.
    private const int DefaultRadiusPx = 80;
    // |10 - 100| = 90 > 80 -> Chebyshev distance exceeds radius -> ratio clamps to exactly 0.0
    // -> RestoreWithEvent transition when isGhostModePre == true.
    private const int CursorOutsideZone = 10;
    // |75 - 100| = 25 < 80 -> distance inside radius -> ratio == 1.0 - 25/80 == 0.6875 -> mid-fade.
    // From ghost-active state this is RestoreNoEvent (sub-1.0 from active ghost) per SEM-02.
    private const int CursorMidZone = 75;
    // |50 - 100| = 50 < 80 -> ratio == 1.0 - 50/80 == 0.375 -> partial-fade. From non-ghost
    // pre-state with isGhostModePre == false the transition is None (no edge crossed).
    private const int CursorPartialZone = 50;
    // 150 is inside the rect (100..200) on the X axis, with cursorY also inside the rect on Y,
    // so step 1 of ComputeProximityRatio short-circuits to 1.0 -> Activate from non-ghost.
    private const int CursorInsideRect = 150;
    private const int CursorYInsideRect = 150;

    [TestMethod]
    [DataRow(CursorPartialZone, CursorYInsideRect, false, GhostModeController.GhostTransition.None,             DisplayName = "far+!ghost -> None")]
    [DataRow(CursorInsideRect,  CursorYInsideRect, false, GhostModeController.GhostTransition.Activate,         DisplayName = "inside+!ghost -> Activate")]
    [DataRow(CursorMidZone,     CursorYInsideRect, true,  GhostModeController.GhostTransition.RestoreNoEvent,   DisplayName = "mid+ghost -> RestoreNoEvent")]
    // CursorOutsideZone (10): Chebyshev distance (90px) exceeds DefaultRadiusPx (80) -> ratio
    // clamps to exactly 0.0, producing RestoreWithEvent. Plan's CONTEXT.md <specifics> proposed
    // cursorX=50 for this row but at default radius=80 that yields ratio=0.375 (RestoreNoEvent),
    // not 0.0 — see the named-constant arithmetic above for why.
    [DataRow(CursorOutsideZone, CursorYInsideRect, true,  GhostModeController.GhostTransition.RestoreWithEvent, DisplayName = "far+ghost -> RestoreWithEvent")]
    public void OnSampleTick_TransitionClasses_ReturnsExpected(
        int cursorX, int cursorY, bool isGhostModePre, GhostModeController.GhostTransition expectedTransition)
    {
        // Arrange: fresh controller, drive ghost-mode pre-state directly via D-SEAM-02b internal field write
        var controller = new GhostModeController();
        controller._isGhostMode = isGhostModePre;

        // Act: invoke the pure-logic seam with the standard 100x100 widget rect at (100,100), no modifiers held
        var result = controller.OnSampleTick(cursorX, cursorY, RectLeft, RectTop, RectRight, RectBottom, modifiersHeld: false);

        // Assert: only the transition class is asserted; ratio and RatioChanged are out of D-SEAM-01 scope
        Assert.AreEqual(expectedTransition, result.Transition);
    }
}
