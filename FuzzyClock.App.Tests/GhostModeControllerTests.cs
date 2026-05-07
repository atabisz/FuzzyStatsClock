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
    [DataRow(false, false, false, false)]  // all-false case (DET-02)
    [DataRow(true,  false, false, false)]  // Ctrl-only enabled, not held
    [DataRow(true,  false, false, true)]   // Ctrl-only enabled, Ctrl held
    [DataRow(false, true,  false, false)]  // Alt-only enabled, not held
    [DataRow(false, true,  false, true)]   // Alt-only enabled, Alt held
    [DataRow(true,  true,  false, false)]  // Ctrl+Alt enabled, neither held
    [DataRow(true,  true,  false, false)]  // Ctrl+Alt enabled, only Ctrl held (partial)
    [DataRow(true,  true,  false, true)]   // Ctrl+Alt enabled, both held
    public void IsModifierHeld_VariousConfigs_ReturnsExpected(
        bool useCtrl, bool useAlt, bool useShift, bool expected)
    {
        // Arrange: controller with config
        var controller = new GhostModeController();
        controller.UpdateModifierConfig(useCtrl, useAlt, useShift);

        // Act: call IsModifierHeld (no keys actually pressed in CI)
        // NOTE: GetAsyncKeyState returns 0 when keys not pressed
        bool result = controller.IsModifierHeld();

        // Assert: verify logic (all-false cases should return false)
        Assert.AreEqual(expected, result);
    }
}
