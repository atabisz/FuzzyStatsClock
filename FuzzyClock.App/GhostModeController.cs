using System.Runtime.InteropServices;
using System.Windows.Threading;

namespace FuzzyClock.App;

/// <summary>
/// Owns all Win32 ghost mode infrastructure: P/Invoke declarations, click-through style
/// management, and the 75ms cursor polling timer used to detect cursor exit under WS_EX_TRANSPARENT.
/// </summary>
internal sealed class GhostModeController : IDisposable
{
    // P/Invoke constants
    private const int  GWL_EXSTYLE       = -20;
    private const int  WS_EX_TRANSPARENT = 0x00000020;
    private const uint SWP_NOSIZE        = 0x0001;
    private const uint SWP_NOMOVE        = 0x0002;
    private const uint SWP_NOZORDER      = 0x0004;
    private const uint SWP_FRAMECHANGED  = 0x0020;
    private const int  VK_LCONTROL       = 0xA2;   // Left Ctrl only — avoids right-side ambiguity
    private const int  VK_LMENU          = 0xA4;   // Left Alt only — VK_MENU matches AltGr on EU keyboards

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(
        IntPtr hWnd, IntPtr hWndInsertAfter,
        int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    private bool _isGhostMode;
    private IntPtr _hwnd;
    private DispatcherTimer? _restoreTimer;

    /// <summary>Whether ghost mode is enabled. Persisted to settings.</summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>True while the window is in click-through ghost state (WS_EX_TRANSPARENT applied).</summary>
    public bool IsActive => _isGhostMode;

    /// <summary>
    /// Fired when the cursor polling timer determines the cursor has left the ghost window.
    /// Handler should restore Opacity and ContentBorder.Background.
    /// </summary>
    public event Action? Restored;

    /// <summary>
    /// Called once from ContentRendered after the HWND is available.
    /// Creates and wires the 75ms polling timer for cursor detection under WS_EX_TRANSPARENT.
    /// </summary>
    public void Initialize(IntPtr hwnd)
    {
        _hwnd = hwnd;
        _restoreTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(75) };
        _restoreTimer.Tick += (_, _) =>
        {
            if (!_isGhostMode) return;
            // Use Win32 GetCursorPos + GetWindowRect — bypasses WPF input system which stops
            // receiving mouse messages when WS_EX_TRANSPARENT is active (Mouse.GetPosition(this)
            // returns stale/wrong coords and causes immediate spurious restore + flicker loop).
            if (!GetCursorPos(out var cursor) || !GetWindowRect(_hwnd, out var rect)) return;
            if (cursor.X < rect.Left || cursor.X > rect.Right ||
                cursor.Y < rect.Top  || cursor.Y > rect.Bottom)
            {
                _restoreTimer!.Stop();
                _isGhostMode = false;
                int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
                SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
                SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
                Restored?.Invoke();
            }
        };
    }

    /// <summary>
    /// Starts the cursor polling timer and applies WS_EX_TRANSPARENT to make the window click-through.
    /// Called from Window_MouseEnter (ghost path only).
    /// Caller is responsible for setting window Opacity = 0 after this call.
    /// </summary>
    public void Activate()
    {
        _restoreTimer!.Start();
        _isGhostMode = true;
        int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
        SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
        SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
    }

    /// <summary>
    /// Returns true when Left-Ctrl + Left-Alt are both currently held.
    /// Uses GetAsyncKeyState (not Keyboard.IsKeyDown) — overlay has no keyboard focus.
    /// Uses left-side-specific VK codes to avoid AltGr false-positives on EU keyboards.
    /// </summary>
    public bool IsCtrlAltHeld() =>
        (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0 &&
        (GetAsyncKeyState(VK_LMENU)    & 0x8000) != 0;

    /// <summary>
    /// Pure static proximity ratio computation. Returns 0.0 (outside zone) to 1.0 (inside widget).
    /// Uses Chebyshev distance for rectangular proximity halo — matches the widget's own rectangular shape.
    /// Parameters use plain ints so tests need no Win32 machinery (avoids inaccessible POINT/RECT structs).
    /// </summary>
    internal static double ComputeProximityRatio(
        int cursorX, int cursorY,
        int rectLeft, int rectTop, int rectRight, int rectBottom,
        int radiusPx)
    {
        // Step 1: Is cursor inside (or on the edge of) the widget rect?
        if (cursorX >= rectLeft && cursorX <= rectRight &&
            cursorY >= rectTop  && cursorY <= rectBottom)
            return 1.0;

        // Step 2: Zero-radius backward compat (PROX-08/D-09).
        // Cursor is outside rect (step 1 passed), so with radius=0 nothing is in the zone.
        if (radiusPx == 0) return 0.0;

        // Step 3: Chebyshev distance from cursor to nearest rect edge.
        // dx = horizontal overshoot past the rect edge (0 if within x bounds).
        // dy = vertical overshoot past the rect edge (0 if within y bounds).
        int dx = Math.Max(rectLeft - cursorX, Math.Max(0, cursorX - rectRight));
        int dy = Math.Max(rectTop  - cursorY, Math.Max(0, cursorY - rectBottom));
        int distance = Math.Max(dx, dy);  // Chebyshev — produces square proximity halo

        // Step 4: Normalize and clamp to [0.0, 1.0].
        double ratio = 1.0 - (double)distance / radiusPx;
        return Math.Clamp(ratio, 0.0, 1.0);
    }

    public void Dispose() => _restoreTimer?.Stop();
}
