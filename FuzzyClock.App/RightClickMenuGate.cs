namespace FuzzyClock.App;

/// <summary>
/// Pure predicate that decides whether a widget right-click should open the tray
/// <see cref="System.Windows.Forms.ContextMenuStrip"/>. Extracted to this static class so
/// RMB-02 (drag suppression) and RMB-03 (ghost-without-Ctrl+Alt suppression) can be
/// unit-tested without WPF/WinForms/Win32 infrastructure.
/// </summary>
/// <remarks>
/// RMB-03 defence-in-depth: in practice WPF does not deliver mouse events while
/// <c>WS_EX_TRANSPARENT</c> is applied (the click is routed to the window beneath),
/// so <c>Window_PreviewMouseRightButtonUp</c> typically never fires in the suppress branch.
/// The guard here is belt-and-suspenders for the narrow window between the cursor-polling
/// timer restoring interactivity and the ratio actually dropping.
/// </remarks>
internal static class RightClickMenuGate
{
    /// <summary>
    /// Returns <c>true</c> when a right-click should open the tray context menu.
    /// </summary>
    /// <param name="isDragging">MainWindow._isDragging — true during DragMove(). RMB-02.</param>
    /// <param name="isGhostActive">GhostModeController.IsActive — true when WS_EX_TRANSPARENT applied. RMB-03.</param>
    /// <param name="isCtrlAltHeld">GhostModeController.IsCtrlAltHeld() — true when both Left-Ctrl and Left-Alt are pressed.</param>
    public static bool ShouldOpen(bool isDragging, bool isGhostActive, bool isCtrlAltHeld)
    {
        if (isDragging) return false;                       // RMB-02
        if (isGhostActive && !isCtrlAltHeld) return false;  // RMB-03 (defensive; WPF wouldn't fire anyway)
        return true;
    }
}
