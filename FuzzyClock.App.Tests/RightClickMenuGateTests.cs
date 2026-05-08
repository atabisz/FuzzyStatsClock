using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Unit tests for RightClickMenuGate.ShouldOpen (RMB-02 drag-suppress + RMB-03 ghost-suppress logic).
/// Pure predicate — no WPF/WinForms/Win32 dependencies so these run headless.
/// </summary>
[TestClass]
public class RightClickMenuGateTests
{
    [TestMethod]
    [DataRow(false, false, false, true,  DisplayName = "normal state -> open")]
    [DataRow(true,  false, false, false, DisplayName = "dragging -> suppress (RMB-02)")]
    [DataRow(false, true,  false, false, DisplayName = "ghost active, no Ctrl+Alt -> suppress (RMB-03)")]
    [DataRow(false, true,  true,  true,  DisplayName = "ghost active + Ctrl+Alt -> open (CTRLALT-01)")]
    [DataRow(true,  true,  true,  false, DisplayName = "dragging beats ghost+Ctrl+Alt (RMB-02 wins)")]
    [DataRow(false, false, true,  true,  DisplayName = "Ctrl+Alt alone (no ghost) -> open (no-op guard)")]
    public void ShouldOpen_Cases(bool isDragging, bool isGhostActive, bool isCtrlAltHeld, bool expected)
    {
        var result = RightClickMenuGate.ShouldOpen(isDragging, isGhostActive, isCtrlAltHeld);
        Assert.AreEqual(expected, result);
    }
}
