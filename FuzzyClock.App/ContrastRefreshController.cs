using System.Windows;
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

        var bgSample = ContrastSamplerService.Sample(px, py, pw, ph);
        var accent   = _getAccent!();
        var (displayColor, newState) = ContrastService.ComputeDisplayColor(bgSample, accent, _contrastState);
        _contrastState = newState;
        ColorChanged?.Invoke(displayColor);
    }

    public void Dispose() => _timer?.Stop();
}
