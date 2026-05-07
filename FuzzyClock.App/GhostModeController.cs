using System.Runtime.InteropServices;
using System.Windows.Threading;

namespace FuzzyClock.App;

/// <summary>
/// Owns all Win32 ghost mode infrastructure: P/Invoke declarations, click-through style
/// management, and the 75ms cursor polling timer that drives proximity detection, fade
/// gradient traversal, ghost activation at ratio=1.0, and restore on cursor retreat.
/// Timer starts in Initialize() and runs continuously until Dispose().
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
    private const int  VK_LSHIFT         = 0xA0;   // Left Shift only — consistency with left-side-only pattern

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
    private double _lastProximityRatio = 0.0;
    private int _ghostFadeRadiusPx = 80;
    private bool _useCtrl  = true;   // CFG-04: default preserves Ctrl+Alt behavior from v4.2
    private bool _useAlt   = true;   // CFG-04: default preserves Ctrl+Alt behavior from v4.2
    private bool _useShift = false;  // CFG-04: default Shift disabled

    /// <summary>Whether ghost mode is enabled. Persisted to settings.</summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>True while the window is in click-through ghost state (WS_EX_TRANSPARENT applied).</summary>
    public bool IsActive => _isGhostMode;

    /// <summary>
    /// Fired when the cursor polling timer determines the cursor has left the ghost window.
    /// Handler should restore Opacity and ContentBorder.Background.
    /// Fires only when cursor fully exits the proximity zone (ratio=0.0) after ghost activation —
    /// not on every sub-1.0 tick during cursor retreat. Phase 68 uses this for final opacity snap.
    /// </summary>
    public event Action? Restored;

    /// <summary>
    /// Fires when the proximity ratio changes. Ratio is 0.0 (outside zone) to 1.0 (inside widget).
    /// Only fires on change — no event when cursor is stationary outside the proximity zone.
    /// Phase 68 subscribes to this event to drive opacity fade.
    /// </summary>
    public Action<double>? ProximityChanged;

    /// <summary>
    /// Fade radius in pixels. Set from AppSettings.GhostFadeRadiusPx at startup.
    /// Phase 69 will update this live when the user moves the settings slider.
    /// </summary>
    public int GhostFadeRadiusPx
    {
        get => _ghostFadeRadiusPx;
        set => _ghostFadeRadiusPx = value;
    }

    /// <summary>
    /// Called once from ContentRendered after the HWND is available.
    /// Creates the 75ms polling timer and starts it immediately — timer runs for the entire session.
    /// Caller should set GhostFadeRadiusPx from AppSettings.GhostFadeRadiusPx after this call.
    /// </summary>
    public void Initialize(IntPtr hwnd)
    {
        _hwnd = hwnd;
        _restoreTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(33) };
        _restoreTimer.Tick += OnTimerTick;
        _restoreTimer.Start();   // always-running from Initialize() until Dispose() (D-01)
    }

    /// <summary>
    /// Timer tick — runs every 75ms for the full session lifecycle.
    /// Computes the proximity ratio via Win32 cursor and window rect queries, emits
    /// ProximityChanged only when the ratio changes, drives ghost activation at ratio=1.0,
    /// and removes WS_EX_TRANSPARENT immediately when ratio drops below 1.0.
    /// </summary>
    private void OnTimerTick(object? sender, EventArgs e)
    {
        if (!IsEnabled) return;   // PROX-09: no proximity computation when ghost mode is off

        // Use Win32 GetCursorPos + GetWindowRect — bypasses WPF input system which stops
        // receiving mouse messages when WS_EX_TRANSPARENT is active.
        if (!GetCursorPos(out var cursor) || !GetWindowRect(_hwnd, out var rect)) return;

        double ratio;
        if (IsCtrlAltHeld())
        {
            // D-08: Ctrl+Alt suppresses proximity fade — force ratio to 0.0 regardless of cursor position.
            ratio = 0.0;
        }
        else
        {
            ratio = ComputeProximityRatio(
                cursor.X, cursor.Y,
                rect.Left, rect.Top, rect.Right, rect.Bottom,
                _ghostFadeRadiusPx);
        }

        // D-04/D-05: Only emit ProximityChanged when ratio actually changes.
        // Prevents event storms when cursor is stationary (especially at steady-state 0.0).
        if (ratio != _lastProximityRatio)
        {
            _lastProximityRatio = ratio;
            ProximityChanged?.Invoke(ratio);
        }

        // D-06: Ghost activation — WS_EX_TRANSPARENT applied only when ratio reaches exactly 1.0.
        // ComputeProximityRatio returns exactly 1.0 for inside-rect; the >= guard is defensive only.
        if (ratio >= 1.0 && !_isGhostMode)
        {
            Activate();
        }

        // D-07: Restore — WS_EX_TRANSPARENT removed immediately when ratio drops below 1.0.
        // Widget becomes interactive again as soon as cursor retreats from the widget boundary,
        // even before opacity has fully restored (Phase 68 handles the opacity gradient).
        if (ratio < 1.0 && _isGhostMode)
        {
            _isGhostMode = false;
            int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
            SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
            SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);

            // Restored fires only when cursor fully exits the proximity zone (ratio=0.0)
            // after having been in ghost state. Phase 68 uses this for final opacity snap.
            if (ratio == 0.0)
                Restored?.Invoke();
        }
    }

    /// <summary>
    /// Applies WS_EX_TRANSPARENT to make the window click-through and sets ghost state.
    /// Called internally by the timer tick when ratio reaches 1.0 (D-06).
    /// Remains public so MainWindow's existing Activate() call compiles during the Phase 67→68
    /// transition period (D-03). Phase 68 will remove the external call site.
    /// Caller is responsible for setting window Opacity = 0 after this call.
    /// </summary>
    public void Activate()
    {
        // _restoreTimer.Start() removed — timer is always running from Initialize() (D-01)
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
