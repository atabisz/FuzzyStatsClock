using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;
using FuzzyClock.Core;

namespace FuzzyClock.App;

/// <summary>
/// Owns the 500ms auto-contrast refresh loop: timer lifecycle, hysteresis state,
/// pixel sampling, and contrast computation. MainWindow wires ColorChanged and
/// Cleared to update the UI; all internal logic is self-contained here.
/// </summary>
internal sealed class ContrastRefreshController : IDisposable
{
    private DispatcherTimer? _timer;
    private ContrastState _contrastState = ContrastState.Normal;

    // Dependencies injected via Initialize (not constructor — HWND/layout not ready yet)
    private Window? _window;
    private Func<bool>? _shouldSkip;
    private Func<RgbColor>? _getAccent;
    private IntPtr _hwnd;

    // P/Invoke for Z-order walk guard
    [DllImport("user32.dll")]
    private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    private const uint GW_HWNDNEXT = 2;

    /// <summary>
    /// Whether auto-contrast is enabled. Safe to set before Initialize() is called.
    /// Initialize() reads this to decide whether to start the timer immediately.
    /// </summary>
    public bool IsEnabled { get; set; }

    /// <summary>
    /// Fired on each tick with the computed display color.
    /// Handler should call ApplyDisplayColor (or equivalent).
    /// </summary>
    public event Action<RgbColor>? ColorChanged;

    /// <summary>
    /// Fired when auto-contrast is disabled (via SetEnabled or Reset).
    /// Handler should restore the accent-based theme (call ApplyTheme or equivalent).
    /// </summary>
    public event Action? Cleared;

    /// <summary>
    /// Wires up the 500ms sampling timer. Called from ContentRendered once the window
    /// is fully rendered and <paramref name="window"/> has a valid layout.
    /// </summary>
    /// <param name="window">The WPF window to sample; used for position/size and PresentationSource.</param>
    /// <param name="shouldSkip">Returns true when sampling should be skipped this tick (ghost active, dragging, opacity=0).</param>
    /// <param name="getAccent">Returns the current accent color as RgbColor for contrast computation.</param>
    public void Initialize(Window window, Func<bool> shouldSkip, Func<RgbColor> getAccent)
    {
        _window    = window;
        _shouldSkip = shouldSkip;
        _getAccent  = getAccent;
        _hwnd = new WindowInteropHelper(window).Handle;

        _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
        _timer.Tick += Tick;
        if (IsEnabled) _timer.Start();
    }

    /// <summary>
    /// Enables or disables auto-contrast and starts/stops the timer accordingly.
    /// Resets hysteresis state on both transitions.
    /// When disabling, fires <see cref="Cleared"/> so the caller can restore the accent theme.
    /// </summary>
    public void SetEnabled(bool enabled)
    {
        IsEnabled = enabled;
        if (enabled)
        {
            _contrastState = ContrastState.Normal;
            _timer?.Start();
        }
        else
        {
            _timer?.Stop();
            _contrastState = ContrastState.Normal;
            Cleared?.Invoke();
        }
    }

    private void Tick(object? sender, EventArgs e)
    {
        if (_shouldSkip!()) return;

        // Get physical pixel coordinates via DPI transform
        var ps = PresentationSource.FromVisual(_window!);
        if (ps?.CompositionTarget == null) return;
        var t  = ps.CompositionTarget.TransformToDevice;
        int px = (int)Math.Round(_window!.Left        * t.M11);
        int py = (int)Math.Round(_window!.Top         * t.M22);
        int pw = (int)Math.Round(_window!.ActualWidth  * t.M11);
        int ph = (int)Math.Round(_window!.ActualHeight * t.M22);

        // Skip sampling over empty desktop to prevent feedback-loop flicker.
        // When only desktop-shell windows (Progman, WorkerW, SysListView32, SHELLDLL_DefView) are beneath
        // the widget, the BitBlt would capture the widget's own rendered colors and cause
        // ContrastService to oscillate across the WCAG threshold each tick.
        var widgetRect = new RECT
        {
            Left   = px,
            Top    = py,
            Right  = px + pw,
            Bottom = py + ph
        };
        if (!HasAppWindowBeneath(_hwnd, widgetRect)) return;

        var bgSample = ContrastSamplerService.Sample(px, py, pw, ph);
        var accent   = _getAccent!();
        var (displayColor, newState) = ContrastService.ComputeDisplayColor(bgSample, accent, _contrastState);
        _contrastState = newState;
        ColorChanged?.Invoke(displayColor);
    }

    /// <summary>
    /// Walks the Z-order downward from the widget's HWND and returns true if any visible,
    /// overlapping window is NOT a desktop-shell class (Progman, WorkerW, SysListView32, SHELLDLL_DefView).
    /// Returns false when only the shell (empty desktop) is beneath the widget.
    /// </summary>
    private static bool HasAppWindowBeneath(IntPtr widgetHwnd, RECT widgetRect)
    {
        var className = new StringBuilder(256);
        IntPtr candidate = GetWindow(widgetHwnd, GW_HWNDNEXT);
        while (candidate != IntPtr.Zero)
        {
            if (IsWindowVisible(candidate) &&
                GetWindowRect(candidate, out RECT r) &&
                Overlaps(widgetRect, r))
            {
                GetClassName(candidate, className, 256);
                string cls = className.ToString();
                if (cls != "Progman" && cls != "WorkerW" &&
                    cls != "SysListView32" && cls != "SHELLDLL_DefView")
                    return true;
                className.Clear();
            }
            candidate = GetWindow(candidate, GW_HWNDNEXT);
        }
        return false;
    }

    private static bool Overlaps(RECT a, RECT b) =>
        a.Left < b.Right && a.Right > b.Left &&
        a.Top < b.Bottom && a.Bottom > b.Top;

    public void Dispose() => _timer?.Stop();
}
