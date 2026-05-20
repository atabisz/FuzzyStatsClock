using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Threading;

namespace FuzzyClock.App;

/// <summary>
/// Owns all Win32 ghost mode infrastructure: P/Invoke declarations, click-through style
/// management, and the 33 ms thread-pool sampling timer (System.Threading.Timer) that
/// drives proximity detection, fade gradient traversal, ghost activation at ratio=1.0,
/// and restore on cursor retreat. Timer starts in Initialize() and runs continuously
/// until Dispose(). Sampling executes off the UI thread (SAMP-01..03); UI work marshals
/// via a single Dispatcher.BeginInvoke per tick (D-07), with reentrancy guard (D-02) and
/// dispatcher-shutdown guard (D-09).
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
    private System.Threading.Timer? _timer;                  // D-01: thread-pool sampling timer
    private Dispatcher _dispatcher = null!;                  // D-09: captured once at Initialize for UI marshalling
    private int _tickInFlight;                               // D-02: Interlocked reentrancy guard (0=idle, 1=tick running)
    private double _lastProximityRatio = 0.0;                // D-06: sampler-thread-local — no cross-thread reader, no volatile
    private volatile int _ghostFadeRadiusPx = 80;            // D-10: cross-thread config; UI writes, sampler reads
    private volatile bool _useCtrl  = true;                  // D-10: CFG-04 default preserves Ctrl+Alt behavior from v4.2
    private volatile bool _useAlt   = true;                  // D-10: CFG-04 default preserves Ctrl+Alt behavior from v4.2
    private volatile bool _useShift = false;                 // D-10: CFG-04 default Shift disabled
    private volatile bool _isEnabled = true;                 // D-11: backing field for manual IsEnabled property
    private bool _disposed;                                  // D-03: idempotency guard for Dispose()

    /// <summary>
    /// Whether ghost mode is enabled. Persisted to settings.
    /// <para>
    /// The setter performs change-detection (D-04): when the assigned value equals the
    /// existing backing-field value, the setter returns early without writing the field
    /// and without raising <see cref="EnabledChanged"/>. On an actual transition the
    /// new value is written to the volatile <c>_isEnabled</c> backing field (preserves
    /// the Phase 85 D-11 cross-thread coherence contract) and <see cref="EnabledChanged"/>
    /// is raised synchronously on the calling thread (D-05).
    /// </para>
    /// <para>
    /// UI-thread-write contract (D-05): all writers must invoke this setter from the UI
    /// thread. Current writers all satisfy this — the tray toggle uses
    /// <c>Dispatcher.Invoke</c>, <c>ApplySettings</c> runs on the UI thread, and the
    /// settings-window callback runs on the UI thread. The setter does not marshal to the
    /// dispatcher itself, so subscribers of <see cref="EnabledChanged"/> always observe
    /// the event on the UI thread.
    /// </para>
    /// </summary>
    public bool IsEnabled
    {
        get => _isEnabled;
        set
        {
            // D-04: change-detect — early-return when the assigned value matches the
            // existing field value (settings.json restore that writes the existing default
            // produces zero events). Read once into a local for the comparison; this
            // matches the Phase 85 D-10 read-once-into-locals snapshot pattern, even though
            // the setter is UI-thread-only.
            bool current = _isEnabled;
            if (current == value) return;

            // D-04 / Phase 85 D-11: on actual transition, write through to the volatile
            // backing field, then raise EnabledChanged synchronously on the calling thread
            // (D-05 — no Dispatcher.BeginInvoke inside the setter).
            _isEnabled = value;
            EnabledChanged?.Invoke(value);
        }
    }

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
    /// Raised when <see cref="IsEnabled"/> actually transitions (D-04). The setter performs
    /// change-detection: when the assigned value equals the existing backing-field value, the
    /// setter returns early and this event is NOT raised. On an actual change the event is
    /// raised synchronously on the calling thread (D-05) with the new value as the argument.
    /// <para>
    /// UI-thread-write contract: all writers of <see cref="IsEnabled"/> must invoke the setter
    /// from the UI thread. The tray toggle uses <c>Dispatcher.Invoke</c>; <c>ApplySettings</c>
    /// and the settings-window callback already run on the UI thread. Subscribers can therefore
    /// safely touch UI elements (e.g. attach/detach <c>CompositionTarget.Rendering</c>) inside
    /// the handler without additional marshalling.
    /// </para>
    /// <para>
    /// Phase 86 Plan 02 wires <c>MainWindow</c> to this event via <c>+=</c> to subscribe and
    /// detach the per-frame render pump in lockstep with the user's ghost-mode toggle.
    /// </para>
    /// </summary>
    public event Action<bool>? EnabledChanged;

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
    /// Captures the UI dispatcher (D-09) and creates the 33 ms System.Threading.Timer (D-01),
    /// which starts immediately and runs for the entire session — sampling executes on the
    /// thread pool, UI work marshals via Dispatcher.BeginInvoke. Caller should set
    /// GhostFadeRadiusPx from AppSettings.GhostFadeRadiusPx after this call.
    /// </summary>
    public void Initialize(IntPtr hwnd)
    {
        _hwnd = hwnd;
        // D-09: capture the UI dispatcher once at Initialize for shutdown-guarded BeginInvoke
        _dispatcher = System.Windows.Application.Current.Dispatcher;
        // D-01: System.Threading.Timer at 33 ms cadence (SAMP-04). Always-running for the
        // session lifecycle (P67 invariant) — start-immediately constructor, no Change() calls.
        _timer = new System.Threading.Timer(OnSampleThreadTick, null, 0, 33);
    }

    /// <summary>
    /// Thread-pool timer callback — fires every 33 ms for the full session lifecycle.
    /// Runs on a System.Threading.Timer worker thread (SAMP-01..03): Win32 sampling
    /// (GetCursorPos / GetWindowRect / GetAsyncKeyState) and the pure OnSampleTick call
    /// all execute off the UI thread; only Win32 window-style mutations and event raises
    /// marshal back to the UI via a single Dispatcher.BeginInvoke per tick (D-07), and
    /// only when work is required (D-08 short-circuits steady state).
    ///
    /// Reentrancy guard (D-02): Interlocked.CompareExchange ensures at most one thread
    /// inside the tick body. Late ticks skip when a previous tick is still in flight —
    /// self-throttling under load. The try/finally pair releases the guard on every path.
    ///
    /// Shutdown guard (D-09): _dispatcher.HasShutdownStarted/HasShutdownFinished checked
    /// before BeginInvoke to defend against teardown races (Application.Current.Shutdown
    /// running concurrently with a tick).
    /// </summary>
    private void OnSampleThreadTick(object? state)
    {
        // D-02: skip-if-busy reentrancy guard. Non-zero return ⇒ a previous tick is still
        // running on another thread-pool worker; this tick skips entirely.
        if (Interlocked.CompareExchange(ref _tickInFlight, 1, 0) != 0) return;

        try
        {
            // PROX-09 / SEM-05: when ghost mode is disabled, no Win32 work, no events,
            // no BeginInvoke. Volatile read (Plan 02 _isEnabled) ensures sampler sees
            // UI-thread writes coherently.
            if (!IsEnabled) return;

            // Win32 sampling on the thread-pool thread (SAMP-02).
            if (!GetCursorPos(out var cursor) || !GetWindowRect(_hwnd, out var rect)) return;

            // GetAsyncKeyState on the sampler thread (SAMP-02).
            bool modifiersHeld = IsModifierHeld();

            // Pure-logic seam (Plan 01) — no Win32, no dispatcher, no events. Owns
            // _isGhostMode and _lastProximityRatio writes on the sampler thread.
            var result = OnSampleTick(
                cursor.X, cursor.Y,
                rect.Left, rect.Top, rect.Right, rect.Bottom,
                modifiersHeld);

            // D-08: zero dispatcher pressure at steady state. When transition is None and
            // the ratio is unchanged there is no UI work to do, so no BeginInvoke is issued.
            if (result.Transition == GhostTransition.None && !result.RatioChanged) return;

            // D-09: belt-and-braces against teardown races. If the dispatcher is shutting
            // down or has shut down, do not enqueue more work — Plan 04's synchronous
            // disposal will close the rest of the window.
            if (_dispatcher.HasShutdownStarted || _dispatcher.HasShutdownFinished) return;

            // D-07: exactly one BeginInvoke per tick bundles all UI side effects. The
            // lambda runs on the UI thread; from MainWindow's perspective the existing
            // ProximityChanged / Restored handlers still fire on the dispatcher thread,
            // preserving WPF affinity for Opacity / Background mutations there.
            _dispatcher.BeginInvoke(() =>
            {
                // Order preserved from the pre-refactor body: ProximityChanged fires
                // before the WS_EX_TRANSPARENT mutation / Restored raise.
                if (result.RatioChanged)
                    ProximityChanged?.Invoke(result.NewRatio);

                switch (result.Transition)
                {
                    case GhostTransition.Activate:
                        // Existing Activate() retained (option (a) per plan): performs
                        // SetWindowLong + SetWindowPos plus an idempotent _isGhostMode = true
                        // re-write (already set by OnSampleTick on the sampler thread —
                        // volatile bool, atomic, harmless).
                        Activate();
                        break;

                    case GhostTransition.RestoreNoEvent:
                    case GhostTransition.RestoreWithEvent:
                        // _isGhostMode = false was already written by OnSampleTick on the
                        // sampler thread (single-owner per D-06). Here we only perform the
                        // Win32 style mutation (WS_EX_TRANSPARENT removal).
                        int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
                        SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
                        SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
                            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);

                        // Restored fires only when cursor fully exits the proximity zone
                        // (ratio=0.0) after having been in ghost state — encoded as
                        // RestoreWithEvent by the seam.
                        if (result.Transition == GhostTransition.RestoreWithEvent)
                            Restored?.Invoke();
                        break;

                    case GhostTransition.None:
                    default:
                        // Reachable here only when RatioChanged is true with Transition == None
                        // (D-08 short-circuited the pure None && !RatioChanged case before
                        // BeginInvoke). The only UI work is the ProximityChanged raise above.
                        break;
                }
            });
        }
        finally
        {
            // D-02: release the reentrancy guard on every path (success, return, throw).
            _tickInFlight = 0;
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
        // Timer is always running from Initialize() (D-01); no per-call start needed.
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
    /// Public for unit testing (TST-03); called from OnSampleThreadTick.
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
    /// Pure static helper for the per-frame opacity lerp pump (Phase 86 / FADE-03 / D-08, D-09, D-03).
    /// Returns the next current-ratio value given the current value, target value, lerp rate
    /// constant <paramref name="alpha"/>, and per-frame elapsed seconds.
    /// <para>
    /// Body shape (D-09 + D-03 — order is load-bearing):
    /// <list type="number">
    /// <item><description>
    /// Terminal-state snap (D-03): when <paramref name="target"/> equals exactly
    /// <c>1.0</c> or exactly <c>0.0</c>, return <paramref name="target"/> directly without
    /// running the exponential. Exact-equality on <c>double</c> is intentional and safe — the
    /// only writers of <c>_targetRatio</c> in the consuming MainWindow are <c>ProximityChanged</c>
    /// lambdas where the sampler's <see cref="OnSampleTick"/> produces <c>0.0</c> and <c>1.0</c>
    /// as exact values (Phase 85 D-06 / SEM-01 / SEM-02). The snap closes the loop and preserves
    /// crisp ghost activation and the v4.0 P67 invariant that <c>Restored</c> fires when the
    /// ratio reaches exactly <c>0.0</c>.
    /// </description></item>
    /// <item><description>
    /// Otherwise, apply the time-stable / frame-rate-independent exponential lerp from CONTEXT.md
    /// <c>&lt;specifics&gt;</c>: <c>current + (target - current) * (1.0 - Math.Exp(-alpha * deltaSeconds))</c>.
    /// <c>1/alpha</c> is the time-to-1/e (~63%) and <c>2.3/alpha</c> is the time-to-90%; at the
    /// planned <c>alpha = 15.0</c>, time-to-90% is approximately 153 ms, masking frame-rate
    /// variation under CPU load while keeping ghost activation visibly responsive.
    /// </description></item>
    /// </list>
    /// </para>
    /// <para>
    /// Purity (D-09): the body has no field reads, no event raises, no <see cref="GhostModeController"/>
    /// instance dependencies, and no clamping on the result (the formula is naturally bounded
    /// between <paramref name="current"/> and <paramref name="target"/> for the planned
    /// alpha/deltaSeconds ranges; <c>deltaSeconds</c> clamping is the consumer's responsibility).
    /// </para>
    /// <para>
    /// Test reachability (D-08): declared <c>internal static</c> so <c>FuzzyClock.App.Tests</c>
    /// can call it directly via the existing <c>InternalsVisibleTo</c> plumbing
    /// (<c>FuzzyClock.App.csproj</c> lines 7-11). Phase 87 owns the unit-test bodies.
    /// </para>
    /// </summary>
    internal static double LerpRatio(double current, double target, double alpha, double deltaSeconds)
    {
        // D-03: terminal-state snap. Exact-equality compare on double is intentional —
        // _targetRatio in the consumer is only ever set from values produced by OnSampleTick,
        // which emits exact 0.0 and 1.0 at the SEM-01 / SEM-02 transitions.
        if (target == 1.0 || target == 0.0) return target;

        // D-09: time-stable exponential lerp. Frame-rate independent — same visual feel at
        // 60 Hz as at 144 Hz. Result is naturally bounded between current and target for the
        // planned alpha/deltaSeconds ranges, so no Math.Clamp on the output (consumer clamps
        // deltaSeconds upstream).
        return current + (target - current) * (1.0 - Math.Exp(-alpha * deltaSeconds));
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

    /// <summary>
    /// Synchronous disposal (D-03): blocks until any in-flight tick callback fully completes
    /// before returning. Combined with the dispatcher-shutdown guard (D-09 in OnSampleThreadTick),
    /// this closes both directions of the teardown race — ticks already running drain before
    /// Dispose() returns; ticks that started but reach BeginInvoke after dispatcher shutdown bail
    /// at the guard.
    ///
    /// Mechanism: <see cref="System.Threading.Timer.Dispose(WaitHandle)"/> signals the supplied
    /// WaitHandle when all callbacks have completed; this method waits on the handle to make
    /// disposal effectively synchronous. Bounded by the 33 ms tick period plus the bounded
    /// callback body — no risk of unbounded wait given the current tick implementation.
    ///
    /// Idempotency: the <c>_disposed</c> early-exit guard plus <c>_timer = null</c> after
    /// disposal ensures that calling <c>Dispose()</c> twice does not throw. If <c>Initialize</c>
    /// was never called (so <c>_timer</c> is null), the method returns after setting
    /// <c>_disposed = true</c> without touching anything else.
    /// </summary>
    public void Dispose()
    {
        // D-03 idempotency: second call is a no-op.
        if (_disposed) return;
        _disposed = true;

        // Initialize() never ran — nothing to dispose.
        if (_timer == null) return;

        // D-03: WaitHandle form of Timer.Dispose. The timer signals notifyObject when all
        // callbacks have completed; WaitOne() blocks until that signal, making disposal
        // effectively synchronous. The using block ensures notifyObject is disposed once
        // WaitOne() returns.
        using (var notifyObject = new System.Threading.ManualResetEvent(false))
        {
            _timer.Dispose(notifyObject);
            notifyObject.WaitOne();
        }

        // Defensive: any resurrected reference observes null after disposal.
        _timer = null;
    }
}
