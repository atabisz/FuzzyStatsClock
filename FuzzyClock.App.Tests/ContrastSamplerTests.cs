using FuzzyClock.App;
using FuzzyClock.Core;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Regression tests for the v4.5.4 crash fix. A transient GDI+ failure during the
/// 500ms auto-contrast tick previously crashed the app (Application Error
/// 0xe0434352 — ExternalException "A generic error occurred in GDI+" thrown from
/// ContrastSamplerService.Sample). The contract: Sample must NEVER propagate an
/// exception — every failure path returns neutral grey so a single bad tick is
/// skipped rather than fatal.
/// </summary>
[TestClass]
public class ContrastSamplerTests
{
    [TestMethod]
    public void Sample_NegativeOffScreenCoordinates_DoesNotThrow()
    {
        // Capturing far off-screen must not throw; any RgbColor is acceptable.
        _ = ContrastSamplerService.Sample(-100000, -100000, 50, 50);
    }

    [TestMethod]
    public void Sample_ZeroSize_DoesNotThrow()
    {
        // Zero dimensions are clamped to 1x1; must return without throwing.
        _ = ContrastSamplerService.Sample(0, 0, 0, 0);
    }

    [TestMethod]
    public void Sample_EnormousDimensions_DoesNotThrow()
    {
        // Huge dimensions fail GDI bitmap creation / GDI+ wrap; the failure must
        // be swallowed and neutral grey returned, never propagated as a crash.
        _ = ContrastSamplerService.Sample(0, 0, int.MaxValue, int.MaxValue);
    }

    [TestMethod]
    public void Sample_NegativeDimensions_DoesNotThrow()
    {
        // Negative width/height are clamped to 1; must not throw.
        _ = ContrastSamplerService.Sample(10, 10, -500, -500);
    }
}
