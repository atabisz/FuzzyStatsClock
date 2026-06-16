// NOTE: Tests document expected behavior but cannot verify actual keypresses in CI.
// GetAsyncKeyState returns 0 when keys not pressed, so all tests will initially
// behave as if no keys are held. Manual verification required for keypress scenarios.
// Plan 83-02 implements IsModifierHeld logic; Phase 84 human verification validates end-to-end.

using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Tests for GhostModeController.IsModifierHeld() configurable modifier detection.
/// TST-03: Verify all 8 combinations (2³) including all-false = always-false.
/// </summary>
[TestClass]
public class GhostModeControllerTests
{
    [TestMethod]
    [DataRow(false, false, false, false, false)]  // all-false case (DET-02): override disabled
    [DataRow(true,  false, false, false, false)]  // Ctrl-only enabled, not held → false
    [DataRow(false, true,  false, false, false)]  // Alt-only enabled, not held → false
    [DataRow(false, false, true,  false, false)]  // Shift-only enabled, not held → false
    [DataRow(false, false, false, true,  false)]  // Win-only enabled, not held → false
    [DataRow(true,  true,  false, false, false)]  // Ctrl+Alt enabled, neither held → false
    [DataRow(true,  false, true,  false, false)]  // Ctrl+Shift enabled, neither held → false
    [DataRow(false, true,  true,  false, false)]  // Alt+Shift enabled, neither held → false
    [DataRow(false, false, true,  true,  false)]  // Shift+Win enabled, neither held → false
    [DataRow(true,  false, false, true,  false)]  // Ctrl+Win enabled, neither held → false
    [DataRow(true,  true,  true,  false, false)]  // Ctrl+Alt+Shift enabled, none held → false
    [DataRow(true,  true,  true,  true,  false)]  // All four enabled, none held → false
    public void IsModifierHeld_VariousConfigs_ReturnsExpected(
        bool useCtrl, bool useAlt, bool useShift, bool useWin, bool expected)
    {
        // Arrange: controller with config
        var controller = new GhostModeController();
        controller.UpdateModifierConfig(useCtrl, useAlt, useShift, useWin);

        // Act: call IsModifierHeld (no keys actually pressed in CI)
        // NOTE: GetAsyncKeyState returns 0 when keys not pressed
        bool result = controller.IsModifierHeld();

        // Assert: verify logic (all-false cases should return false)
        Assert.AreEqual(expected, result);
    }
}
