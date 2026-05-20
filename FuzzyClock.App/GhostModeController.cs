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

    /// <summary>
    /// Possible state transitions emitted by <see cref="OnSampleTick"/>:
    /// None - no ghost-state change; Activate - ratio reached 1.0 and ghost was inactive;
    /// RestoreNoEvent - ratio dropped below 1.0 from active ghost state, but ratio &gt; 0.0;
    /// RestoreWithEvent - ratio dropped below 1.0 from active ghost state and reached exactly 0.0
    /// (caller must invoke <see cref="Restored"/>).
    /// </summary>
    internal enum GhostTransition { None, Activate, RestoreNoEvent, RestoreWithEvent }

    /// <summary>
    /// Pure-logic outcome of a single sampler tick. Returned by <see cref="OnSampleTick"/>
    /// for the timer callback (or tests) to apply Win32/event side effects post-seam.
    /// </summary>
    internal readonly record struct SampleResult(double NewRatio, bool RatioChanged, GhostTransition Transition);

    private volatile bool _isGhostMode;                      // D-06: cross-thread reader at MainWindow.xaml.cs:165
    private IntPtr _hwnd;
    private DispatcherTimer? _restoreTimer;
    private double _lastProximityRatio = 0.0;                // D-06: sampler-thread-local — no cross-thread reader, no volatile
    private volatile int _ghostFadeRadiusPx = 80;            // D-10: cross-thread config; UI writes, sampler reads
    private volatile bool _useCtrl  = true;                  // D-10: CFG-04 default preserves Ctrl+Alt behavior from v4.2
    private volatile bool _useAlt   = true;                  // D-10: CFG-04 default preserves Ctrl+Alt behavior from v4.2
    private volatile bool _useShift = false;                 // D-10: CFG-04 default Shift disabled
    private volatile bool _isEnabled = true;                 // D-11: backing field for manual IsEnabled property

    /// <summary>Whether ghost mode is enabled. Persisted to settings.</summary>
    public bool IsEnabled { get => _isEnabled; set => _isEnabled = value; }

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
    /// Sets which modifier keys suppress ghost mode when held during hover.
    /// Called from MainWindow.ApplySettings() on startup and from Settings window
    /// event handlers when user changes checkboxes. All-false = override disabled
    /// (ghost always activates regardless of held keys per DET-02).
    /// </summary>
    public void UpdateModifierConfig(bool useCtrl, bool useAlt, bool useShift)
    {
        _useCtrl  = useCtrl;
        _useAlt   = useAlt;
        _useShift = useShift;
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
    /// Timer tick — runs every 33ms for the full session lifecycle.
    /// Gathers Win32 inputs (cursor + window rect + modifier state), delegates pure logic
    /// to <see cref="OnSampleTick"/>, then applies the resulting <see cref="SampleResult"/>:
    /// raises ProximityChanged on ratio change, calls Activate() on the Activate transition,
    /// removes WS_EX_TRANSPARENT on RestoreNoEvent / RestoreWithEvent, and additionally
    /// raises Restored on RestoreWithEvent.
    /// </summary>
    private void OnTimerTick(object? sender, EventArgs e)
    {
        if (!IsEnabled) return;   // PROX-09: no proximity computation when ghost mode is off

        // Use Win32 GetCursorPos + GetWindowRect — bypasses WPF input system which stops
        // receiving mouse messages when WS_EX_TRANSPARENT is active. Per D-05, Win32 sampling
        // stays in the timer callback; the seam (OnSampleTick) is pure-logic only.
        if (!GetCursorPos(out var cursor) || !GetWindowRect(_hwnd, out var rect)) return;

        bool modifiersHeld = IsModifierHeld();

        var result = OnSampleTick(
            cursor.X, cursor.Y,
            rect.Left, rect.Top, rect.Right, rect.Bottom,
            modifiersHeld);

        // Order is preserved from the pre-refactor body: ProximityChanged fires before
        // Activate() / WS_EX_TRANSPARENT removal / Restored.
        if (result.RatioChanged)
            ProximityChanged?.Invoke(result.NewRatio);

        switch (result.Transition)
        {
            case GhostTransition.Activate:
                Activate();
                break;

            case GhostTransition.RestoreNoEvent:
            case GhostTransition.RestoreWithEvent:
                // _isGhostMode = false was already written by OnSampleTick (single-owner per D-06).
                // Here we only perform the Win32 style mutation (WS_EX_TRANSPARENT removal).
                int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
                SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
                SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);

                // Restored fires only when cursor fully exits the proximity zone (ratio=0.0)
                // after having been in ghost state — encoded as RestoreWithEvent by the seam.
                if (result.Transition == GhostTransition.RestoreWithEvent)
                    Restored?.Invoke();
                break;

            case GhostTransition.None:
            default:
                // No UI work — steady-state inside or outside the zone with no ghost-state change.
                break;
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
    /// Returns true when all enabled modifiers are currently held.
    /// Uses GetAsyncKeyState (not Keyboard.IsKeyDown) — overlay has no keyboard focus.
    /// Uses left-side-specific VK codes (DET-05) to avoid AltGr false-positives on EU keyboards.
    /// AND logic (DET-03): ALL enabled modifiers must be held simultaneously.
    /// Public for unit testing (TST-03); called from OnTimerTick.
    /// </summary>
    public bool IsModifierHeld()
    {
        // DET-02 short-circuit: all-false = override disabled (always return false)
        if (!_useCtrl && !_useAlt && !_useShift)
            return false;

        // For each modifier: check if enabled AND currently held
        bool ctrlHeld  = _useCtrl  && (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0;
        bool altHeld   = _useAlt   && (GetAsyncKeyState(VK_LMENU)    & 0x8000) != 0;
        bool shiftHeld = _useShift && (GetAsyncKeyState(VK_LSHIFT)   & 0x8000) != 0;

        // AND logic: each enabled modifier must be held
        // If disabled (_useX is false), the modifier is automatically "satisfied"
        bool ctrlOk  = !_useCtrl  || ctrlHeld;
        bool altOk   = !_useAlt   || altHeld;
        bool shiftOk = !_useShift || shiftHeld;

        return ctrlOk && altOk && shiftOk;
    }

    /// <summary>
    /// Pure-logic seam: computes the proximity ratio, edge signal, and ghost-state transition
    /// for a single sampler tick. Inputs are plain ints + a modifier-held bool — no Win32, no
    /// dispatcher, no events. Tests exercise this directly without any Win32 machinery (D-04, D-05).
    ///
    /// State writes owned by this method (D-06):
    ///   - <c>_lastProximityRatio</c> is written only when the ratio actually changes
    ///   - <c>_isGhostMode = false</c> is written only on the restore branches
    ///   - <c>_isGhostMode = true</c> is NOT written here — <see cref="Activate"/> retains that
    ///     responsibility; this method emits <see cref="GhostTransition.Activate"/> for the
    ///     post-seam handler to translate into an <c>Activate()</c> call.
    ///
    /// Read pattern (D-10): each volatile-target config field (_useCtrl, _useAlt, _useShift,
    /// _ghostFadeRadiusPx) is read exactly once at the top of the method into a local snapshot
    /// and the locals are used for the rest of the tick. Plan 02 will add the volatile modifier
    /// to the backing fields; this plan adopts the read-once pattern now so Plan 03's threading
    /// swap inherits it without further refactor.
    /// </summary>
    internal SampleResult OnSampleTick(
        int cursorX, int cursorY,
        int rectLeft, int rectTop, int rectRight, int rectBottom,
        bool modifiersHeld)
    {
        // PROX-09 / SEM-05: when ghost mode is disabled, return a no-op result and write nothing.
        if (!IsEnabled)
            return new SampleResult(0.0, false, GhostTransition.None);

        // D-10: read each config field exactly once into locals; operate on locals below.
        bool useCtrl  = _useCtrl;
        bool useAlt   = _useAlt;
        bool useShift = _useShift;
        int  radiusPx = _ghostFadeRadiusPx;

        double ratio;
        // SEM-03 / DET-02: short-circuit when all modifiers disabled (override disabled).
        // When any modifier is enabled and modifiersHeld is true, force ratio to 0.0.
        if (useCtrl || useAlt || useShift)
        {
            if (modifiersHeld)
                ratio = 0.0;
            else
                ratio = ComputeProximityRatio(
                    cursorX, cursorY,
                    rectLeft, rectTop, rectRight, rectBottom,
                    radiusPx);
        }
        else
        {
            // All modifier flags false — modifiersHeld ignored; ghost always activates per DET-02.
            ratio = ComputeProximityRatio(
                cursorX, cursorY,
                rectLeft, rectTop, rectRight, rectBottom,
                radiusPx);
        }

        // SEM-01: edge signal — true iff ratio differs from previous tick. Captured BEFORE the
        // _lastProximityRatio write so the returned RatioChanged reflects the edge correctly.
        bool ratioChanged = ratio != _lastProximityRatio;

        // Determine the ghost-state transition based on the current ratio and the prior _isGhostMode.
        GhostTransition transition;
        if (ratio >= 1.0 && !_isGhostMode)
        {
            // SEM-02: ratio reached 1.0 from non-ghost state → activate.
            transition = GhostTransition.Activate;
        }
        else if (ratio < 1.0 && _isGhostMode)
        {
            // SEM-02: ratio dropped below 1.0 from ghost state → restore.
            // RestoreWithEvent only when ratio reaches exactly 0.0 (preserves the v4.0 P67 invariant
            // that Restored fires only at full retreat).
            transition = (ratio == 0.0) ? GhostTransition.RestoreWithEvent : GhostTransition.RestoreNoEvent;

            // D-06: single-owner write — only the seam clears _isGhostMode.
            _isGhostMode = false;
        }
        else
        {
            transition = GhostTransition.None;
        }

        // D-06: write _lastProximityRatio only on edge to mirror the original line 157 behavior.
        if (ratioChanged)
            _lastProximityRatio = ratio;

        return new SampleResult(ratio, ratioChanged, transition);
    }

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
