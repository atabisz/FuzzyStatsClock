using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using FuzzyClock.Core;
// Disambiguate WinForms vs WPF type name collisions introduced by UseWindowsForms=true
using Application    = System.Windows.Application;
using MouseEventArgs = System.Windows.Input.MouseEventArgs;

namespace FuzzyClock.App;

public partial class MainWindow : Window
{
    private DispatcherTimer _timer = null!;
    private DispatcherTimer _statsTimer = null!;
    private StatsService _statsService = null!;
    private int _statsIntervalSeconds = 3;   // default matches AppSettings.StatsIntervalSeconds default
    private bool _isHoverFastRefresh = false;
    private readonly Queue<float> _cpuSamples = new();
    // Bounded by trim logic in UpdateUptimeDisplay(). Max 900 entries at 1s interval (~3.5KB).
    // StatsPanel.Width(180) - label column(35) - text column(36) = 109
    private const double StatsBarTrackWidth = 109.0;
    private int _currentFontSize = 32;
    private bool _savedPositionLoaded = false;
    private bool _hasUserPosition = false;
    private bool _dialMode;
    private bool _showHourTicks   = false;
    private bool _showMinuteDots  = false;
    private bool _showHourNumbers = false;
    private double _windowOpacity = 1.0;
    private System.Windows.Media.Color _accentColor = System.Windows.Media.Colors.White;
    private System.Windows.Forms.NotifyIcon _trayIcon = null!;
    private System.Windows.Forms.ToolStripMenuItem _ghostModeMenuItem   = null!;
    // Tray items needing programmatic updates (checkmarks or visibility)
    private System.Windows.Forms.ToolStripMenuItem  _trayFontSizeItem    = null!;
    private System.Windows.Forms.ToolStripSeparator _trayFontSizeSep    = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayFontSmall       = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayFontMedium      = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayFontLarge       = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayShowStats       = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayCpuVisible      = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayGpuVisible      = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayMemVisible      = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayPagVisible      = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayUptimeVisible   = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayInterval1       = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayInterval3       = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayInterval10      = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayDialMode        = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayDialFaceItem    = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayShowHourTicks   = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayShowMinuteDots  = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayShowHourNumbers = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayThemeWhite      = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayThemeAmber      = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayThemeIce        = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayThemeGreen      = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayThemePink       = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayOpacity25       = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayOpacity50       = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayOpacity75       = null!;
    private System.Windows.Forms.ToolStripMenuItem _trayOpacity100      = null!;

    // Ghost mode state (v2.3)
    private bool   _isGhostMode = false;
    private bool   _ghostModeEnabled = true;
    private IntPtr _hwnd;
    private DispatcherTimer? _ghostRestoreTimer;

    // Ghost mode P/Invoke constants
    private const int  GWL_EXSTYLE       = -20;
    private const int  WS_EX_TRANSPARENT = 0x00000020;
    private const uint SWP_NOSIZE        = 0x0001;
    private const uint SWP_NOMOVE        = 0x0002;
    private const uint SWP_NOZORDER      = 0x0004;
    private const uint SWP_FRAMECHANGED  = 0x0020;

    // Ghost mode P/Invoke declarations
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

    private const int VK_LCONTROL = 0xA2;   // Left Ctrl only (not VK_CONTROL=0x11 — avoids right-side ambiguity)
    private const int VK_LMENU    = 0xA4;   // Left Alt only (not VK_MENU=0x12 — VK_MENU matches AltGr on EU keyboards)

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    private readonly List<System.Windows.Shapes.Line>        _hourTickElements   = new();
    private readonly List<System.Windows.Shapes.Ellipse>     _minuteDotElements  = new();
    private readonly List<System.Windows.Controls.TextBlock> _hourNumberElements = new();

    private static readonly System.Windows.Media.Color PresetWhite = System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0xFF, 0xFF);
    private static readonly System.Windows.Media.Color PresetAmber = System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0xC0, 0x00);
    private static readonly System.Windows.Media.Color PresetIce   = System.Windows.Media.Color.FromArgb(0xFF, 0x87, 0xCE, 0xEB);
    private static readonly System.Windows.Media.Color PresetGreen = System.Windows.Media.Color.FromArgb(0xFF, 0x00, 0xC0, 0x00);
    private static readonly System.Windows.Media.Color PresetPink  = System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0x69, 0xB4);

    public MainWindow()
    {
        InitializeComponent();

        // Set _hasUserPosition flag after any window move (covers drag completion via LocationChanged).
        // LocationChanged fires reliably after DragMove() returns (the window has moved).
        this.LocationChanged += (_, _) => _hasUserPosition = true;

        // ContentRendered fires after the first layout pass when ActualWidth/ActualHeight are valid.
        // SizeToContent=WidthAndHeight defers measurement until after Show() is called,
        // so ActualWidth is 0 in the constructor — positioning must be deferred.
        ContentRendered += (_, _) =>
        {
            if (_savedPositionLoaded)
            {
                // Clamp here — ActualWidth/ActualHeight are valid after first layout pass.
                // ApplySettings() set the raw loaded position; ContentRendered adjusts it to
                // stay within virtual screen bounds (handles monitor disconnect scenarios).
                var clamped = SettingsService.Clamp(
                    new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize },
                    ActualWidth, ActualHeight);
                Left = clamped.Left;
                Top  = clamped.Top;
            }
            else
            {
                PositionTopRight();
            }

            _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
            _timer.Tick += (_, _) =>
            {
                UpdatePhraseIfChanged();
                if (_dialMode) UpdateDialDisplay();
            };
            _timer.Start();

            // Stats timer — independent from phrase timer (different interval, user-configurable)
            // StatsService constructor starts Task.Run(Initialize) immediately; Refresh() is a safe
            // no-op until initialization completes (~6s PDH cold start).
            _statsService = new StatsService();
            _statsTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromSeconds(_statsIntervalSeconds)
            };
            _statsTimer.Tick += (_, _) =>
            {
                UpdateStatsDisplay();    // calls _statsService.Refresh() internally — must run first
                UpdateUptimeDisplay();   // reads CpuPercent after Refresh() already ran — never call Refresh() again here
            };
            // Conditional timer start: ApplySettings() may have set StatsPanel to Visible
            // (restored from settings.json), but _statsTimer didn't exist then. Start it now
            // if the panel is already visible. If Collapsed, timer stays stopped.
            if (StatsPanel.Visibility == Visibility.Visible)
            {
                _statsTimer.Start();
                UpdateStatsDisplay();
            }

            if (_dialMode) UpdateDialDisplay();
            InitDialDecorations();
            ApplyTheme();            // NEW: must come AFTER InitDialDecorations() — decoration lists are empty before this point
            InitTrayIcon();

            _hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
            _ghostRestoreTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(75) };
            _ghostRestoreTimer.Tick += (_, _) =>
            {
                if (!_isGhostMode) return;
                // Use Win32 GetCursorPos + GetWindowRect — bypasses WPF input system which stops
                // receiving mouse messages when WS_EX_TRANSPARENT is active (Mouse.GetPosition(this)
                // returns stale/wrong coords and causes immediate spurious restore + flicker loop).
                if (!GetCursorPos(out var cursor) || !GetWindowRect(_hwnd, out var rect)) return;
                if (cursor.X < rect.Left || cursor.X > rect.Right ||
                    cursor.Y < rect.Top  || cursor.Y > rect.Bottom)
                {
                    _ghostRestoreTimer!.Stop();
                    _isGhostMode = false;
                    int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
                    SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
                    SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
                    this.Opacity = _windowOpacity;
                    ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
                }
            };

            this.MouseEnter += Window_MouseEnter;
            this.MouseLeave += Window_MouseLeave;
        };

        this.Closed += (_, _) =>
        {
            _trayIcon?.Dispose();
        };
    }

    /// <summary>
    /// Called by App.xaml.cs before Show() to apply saved settings.
    /// Sets font size on both TextBlocks. If a saved position exists (Left != -1),
    /// applies it to Window.Left/Top and sets both position guards to true.
    /// </summary>
    internal void ApplySettings(AppSettings s)
    {
        _currentFontSize = s.FontSize;
        PhraseText.FontSize = s.FontSize;
        ShadowText.FontSize = s.FontSize;

        if (s.Left != -1)
        {
            Left = s.Left;
            Top  = s.Top;
            _savedPositionLoaded = true;
            _hasUserPosition = true;
        }

        _statsIntervalSeconds = s.StatsIntervalSeconds;

        // Apply stats visibility directly (NOT via SetStatsVisible — that calls UpdateLayout()+Clamp()
        // which are unsafe before Show(), where ActualHeight is 0).
        // _statsTimer is null here (created in ContentRendered). Timer start is handled
        // in ContentRendered by checking panel visibility after _statsTimer is constructed.
        StatsPanel.Visibility = s.StatsVisible ? Visibility.Visible : Visibility.Collapsed;

        // Apply row visibility directly (NOT via SetStatRowVisible — unsafe before Show()).
        CpuRow.Visibility = s.CpuVisible ? Visibility.Visible : Visibility.Collapsed;
        GpuRow.Visibility = s.GpuVisible ? Visibility.Visible : Visibility.Collapsed;
        MemRow.Visibility = s.MemVisible ? Visibility.Visible : Visibility.Collapsed;
        PagRow.Visibility = s.PagVisible ? Visibility.Visible : Visibility.Collapsed;
        // Direct assignment (NOT via SetUptimeRowVisible — unsafe before Show(), same invariant as other rows).
        // UptimeText is inside StatsPanel; StatsPanel.Collapsed hides it automatically.
        UptimeText.Visibility = s.UptimeVisible ? Visibility.Visible : Visibility.Collapsed;

        // Apply dial mode directly (NOT via SetDialMode — unsafe before Show(), same invariant as StatsPanel).
        _dialMode = s.DialMode;
        PhraseText.Visibility = s.DialMode ? Visibility.Collapsed : Visibility.Visible;
        ShadowText.Visibility = s.DialMode ? Visibility.Collapsed : Visibility.Visible;
        DialCanvas.Visibility = s.DialMode ? Visibility.Visible   : Visibility.Collapsed;

        _showHourTicks   = s.ShowHourTicks;
        _showMinuteDots  = s.ShowMinuteDots;
        _showHourNumbers = s.ShowHourNumbers;
        // Decoration element visibility applied in InitDialDecorations() (ContentRendered).

        _windowOpacity = s.Opacity;
        this.Opacity   = s.Opacity;
        _ghostModeEnabled = s.GhostModeEnabled;

        // Parse AccentColor hex string to Color struct
        // SettingsService.Load() guards against null/empty; catch here for belt-and-suspenders safety
        try
        {
            _accentColor = (System.Windows.Media.Color)
                System.Windows.Media.ColorConverter.ConvertFromString(s.AccentColor);
        }
        catch
        {
            _accentColor = System.Windows.Media.Colors.White;  // fallback on any parse failure
        }
        // Do NOT call ApplyTheme() here — _hourTickElements etc. are empty until ContentRendered
    }

    /// <summary>
    /// Saves current window position and font size to settings.json.
    /// Called after drag, on Closing, and on SessionEnding.
    /// </summary>
    internal void SaveSettings()
    {
        SettingsService.Save(new AppSettings
        {
            Left = Left,
            Top = Top,
            FontSize = _currentFontSize,
            StatsVisible = (StatsPanel.Visibility == Visibility.Visible),
            StatsIntervalSeconds = _statsIntervalSeconds,
            CpuVisible = (CpuRow.Visibility == Visibility.Visible),
            GpuVisible = (GpuRow.Visibility == Visibility.Visible),
            MemVisible = (MemRow.Visibility == Visibility.Visible),
            PagVisible = (PagRow.Visibility == Visibility.Visible),
            UptimeVisible = (UptimeText.Visibility == Visibility.Visible),
            DialMode = _dialMode,
            ShowHourTicks   = _showHourTicks,
            ShowMinuteDots  = _showMinuteDots,
            ShowHourNumbers = _showHourNumbers,
            Opacity = _windowOpacity,
            AccentColor = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}",
            GhostModeEnabled = _ghostModeEnabled
        });
    }

    /// <summary>
    /// Called by App.xaml.cs before Show() to set the initial phrase on both TextBlocks.
    /// No UpdateLayout() or PositionTopRight() needed here — ContentRendered handles both
    /// after Show() triggers the first layout pass.
    /// </summary>
    internal void SetInitialPhrase(string phrase)
    {
        ShadowText.Text = phrase;
        PhraseText.Text = phrase;
    }

    private void Grid_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        // Pause stats during drag — DragMove() is a blocking Win32 modal loop.
        // Stop timer before, restart after if it was running (don't start it if stats are hidden).
        bool statsTimerWasRunning = _statsTimer?.IsEnabled ?? false;
        if (statsTimerWasRunning) _statsTimer!.Stop();

        // DragMove() is a blocking Win32 modal loop — it returns only when the mouse button
        // is released. Left and Top reflect the final dropped position immediately after return.
        // Do NOT defer with BeginInvoke or await — DragMove() throws if the left button is
        // not held down at the Win32 level at the moment of the call.
        DragMove();
        // LocationChanged fires during DragMove — _hasUserPosition is already true here.

        if (statsTimerWasRunning) _statsTimer!.Start();
        SaveSettings();
    }

    private void UpdatePhraseIfChanged()
    {
        string newPhrase = PhraseEngine.GetPhrase(DateTime.Now);
        if (newPhrase == PhraseText.Text) return;  // No change — skip layout work

        ShadowText.Text = newPhrase;
        PhraseText.Text = newPhrase;

        // Force layout pass before repositioning — ActualWidth is stale until layout runs
        // (SizeToContent=WidthAndHeight: ActualWidth reflects old phrase until layout re-measures)
        UpdateLayout();
        // Guard: do NOT call PositionTopRight() after the user has set a custom position.
        // Without this guard, every 5-minute phrase change snaps the widget to top-right.
        if (!_hasUserPosition)
        {
            PositionTopRight();
        }
        else
        {
            // Re-clamp after phrase change — SizeToContent may resize the window,
            // pushing it partially off-screen if positioned near an edge.
            var clamped = SettingsService.Clamp(
                new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize },
                ActualWidth, ActualHeight);
            Left = clamped.Left;
            Top  = clamped.Top;
        }
    }

    private void UpdateStatsDisplay()
    {
        _statsService.Refresh();

        CpuText.Text = $"{_statsService.CpuPercent:F0}%";
        CpuBar.Width = StatsBarTrackWidth * (_statsService.CpuPercent / 100.0);

        if (_statsService.GpuPercent < 0f)
        {
            GpuText.Text = "N/A";
            GpuBar.Width = 0;
        }
        else
        {
            GpuText.Text = $"{_statsService.GpuPercent:F0}%";
            GpuBar.Width = StatsBarTrackWidth * (_statsService.GpuPercent / 100.0);
        }

        MemText.Text = $"{_statsService.MemPercent:F0}%";
        MemBar.Width = StatsBarTrackWidth * (_statsService.MemPercent / 100.0);

        if (_statsService.PagPercent < 0f)
        {
            PagText.Text = "N/A";
            PagBar.Width = 0;
        }
        else
        {
            PagText.Text = $"{_statsService.PagPercent:F0}%";
            PagBar.Width = StatsBarTrackWidth * (_statsService.PagPercent / 100.0);
        }
    }

    private void UpdateUptimeDisplay()
    {
        // Early exit: UptimeText is inside StatsPanel; both must be visible.
        // StatsPanel Collapsed hides UptimeText automatically, but belt-and-suspenders guard prevents
        // _cpuSamples growth and string allocation when neither is shown.
        if (StatsPanel.Visibility  != Visibility.Visible ||
            UptimeText.Visibility  != Visibility.Visible) return;

        // Cold-start guard: StatsService takes ~6s to initialize via Task.Run(Initialize).
        // CpuPercent is 0f during init — indistinguishable from genuine idle CPU by value.
        // Skipping until IsReady prevents zeros from depressing the 1m average for ~60s at launch.
        if (!_statsService.IsReady) return;

        // Hover fast-refresh guard: at 0.5s cadence, sample density is 6x the configured rate.
        // Count-based windows (TakeLast) would represent far shorter time spans than labeled.
        // Only push samples at the configured (non-hover) interval.
        if (!_isHoverFastRefresh)
        {
            _cpuSamples.Enqueue(_statsService.CpuPercent);
            // Trim to 15-minute window at current configured interval
            int maxSamples = Math.Max(1, (15 * 60) / _statsIntervalSeconds);
            while (_cpuSamples.Count > maxSamples) _cpuSamples.Dequeue();
        }

        // Uptime string — leading zero-unit suppression applies to ALL leading zero units.
        // Uses Environment.TickCount64 (Int64, ms since boot). Never use TickCount (Int32, wraps at ~24.9 days).
        TimeSpan uptime = TimeSpan.FromMilliseconds(Environment.TickCount64); // Int64 — never TickCount (Int32)
        string uptimeStr = UptimeFormatter.Format(uptime);

        // Rolling CPU averages — interval-aware window sizing.
        // CpuPercent is 0-100; divide by 100 for load-average-style decimal display (0.52).
        float avg1m  = ComputeAvg(_cpuSamples, (int)Math.Ceiling(60.0  / _statsIntervalSeconds));
        float avg5m  = ComputeAvg(_cpuSamples, (int)Math.Ceiling(300.0 / _statsIntervalSeconds));
        float avg15m = _cpuSamples.Count > 0 ? _cpuSamples.Average() : 0f;

        string newText = $"{uptimeStr}   {avg1m / 100f:F2}  {avg5m / 100f:F2}  {avg15m / 100f:F2}";

        // Change guard: minutes component changes at most once per minute.
        // Prevents spurious TextBlock invalidation on every 1s tick.
        if (UptimeText.Text != newText)
            UptimeText.Text = newText;
    }

    private static float ComputeAvg(Queue<float> q, int count)
    {
        // Average the last `count` elements (most recent time window).
        // Math.Min guards against requesting more samples than exist (warm-up period).
        return q.Count == 0 ? 0f : q.TakeLast(Math.Min(count, q.Count)).Average();
    }

    private void PositionTopRight()
    {
        const double Padding = 20.0;
        Left = SystemParameters.PrimaryScreenWidth - ActualWidth - Padding;
        Top = Padding;
    }

    private void TrayMenu_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        // Sync all tray item checkmarks from current state — mirrors the old ContextMenu_Opened pattern.
        // Reading WPF element properties (Visibility) from WinForms thread follows the established
        // pattern in SaveSettings() which already does this safely.
        _trayFontSmall.Checked  = (_currentFontSize == 16);
        _trayFontMedium.Checked = (_currentFontSize == 24);
        _trayFontLarge.Checked  = (_currentFontSize == 32);

        _trayShowStats.Checked     = (StatsPanel.Visibility == Visibility.Visible);
        _trayCpuVisible.Checked    = (CpuRow.Visibility     == Visibility.Visible);
        _trayGpuVisible.Checked    = (GpuRow.Visibility     == Visibility.Visible);
        _trayMemVisible.Checked    = (MemRow.Visibility     == Visibility.Visible);
        _trayPagVisible.Checked    = (PagRow.Visibility     == Visibility.Visible);
        _trayUptimeVisible.Checked = (UptimeText.Visibility == Visibility.Visible);
        _trayInterval1.Checked  = (_statsIntervalSeconds == 1);
        _trayInterval3.Checked  = (_statsIntervalSeconds == 3);
        _trayInterval10.Checked = (_statsIntervalSeconds == 10);

        _trayDialMode.Checked        = _dialMode;
        _trayShowHourTicks.Checked   = _showHourTicks;
        _trayShowMinuteDots.Checked  = _showMinuteDots;
        _trayShowHourNumbers.Checked = _showHourNumbers;

        // Opacity preset sync — exact double comparison is reliable
        _trayOpacity25.Checked  = (_windowOpacity == 0.25);
        _trayOpacity50.Checked  = (_windowOpacity == 0.50);
        _trayOpacity75.Checked  = (_windowOpacity == 0.75);
        _trayOpacity100.Checked = (_windowOpacity == 1.00);

        // Theme preset sync — derive hex from _accentColor; no secondary theme-name field needed
        string currentHex = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}";
        _trayThemeWhite.Checked = (currentHex == "#FFFFFFFF");
        _trayThemeAmber.Checked = (currentHex == "#FFFFC000");
        _trayThemeIce.Checked   = (currentHex == "#FF87CEEB");
        _trayThemeGreen.Checked = (currentHex == "#FF00C000");
        _trayThemePink.Checked  = (currentHex == "#FFFF69B4");
        // Custom color active: none match — no checkmark shown. Correct.
    }

    private void SetStatsVisible(bool visible)
    {
        StatsPanel.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;

        if (visible)
        {
            _statsTimer?.Start();
            UpdateStatsDisplay();  // immediate display — no blank panel flash on first show

            // Re-clamp: showing StatsPanel increases window height by ~70px.
            // SizeToContent=WidthAndHeight: ActualHeight is stale until layout runs.
            UpdateLayout();
            if (_hasUserPosition)
            {
                var clamped = SettingsService.Clamp(
                    new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize },
                    ActualWidth, ActualHeight);
                Left = clamped.Left;
                Top  = clamped.Top;
            }
        }
        else
        {
            _statsTimer?.Stop();
        }

        SaveSettings();
    }

    private void SetStatsInterval(int seconds)
    {
        _statsIntervalSeconds = seconds;

        bool wasRunning = _statsTimer?.IsEnabled ?? false;
        _statsTimer?.Stop();
        if (_statsTimer != null)
            _statsTimer.Interval = TimeSpan.FromSeconds(seconds);
        if (wasRunning)
            _statsTimer?.Start();

        SaveSettings();
    }

    private void Window_MouseEnter(object sender, MouseEventArgs e)
    {
        // Phase 27: Ctrl+Alt modifier — suppress ghost mode if left Ctrl + left Alt are held.
        // Use GetAsyncKeyState (not Keyboard.IsKeyDown) — overlay has no keyboard focus.
        // Use VK_LCONTROL + VK_LMENU (not generic VK_CONTROL/VK_MENU) — VK_MENU matches AltGr on EU keyboards.
        // Mask with 0x8000: high bit = key currently pressed; low bit = toggled since last call (ignore).
        bool ctrlAltHeld = (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0
                        && (GetAsyncKeyState(VK_LMENU)    & 0x8000) != 0;

        if (ctrlAltHeld || !_ghostModeEnabled)
        {
            // Normal hover path (CTRLALT-01/02): show backdrop + activate fast-refresh.
            // WS_EX_TRANSPARENT is NOT applied — window stays fully interactive (drag, right-click, scroll).
            // _ghostRestoreTimer is NOT started — normal Window_MouseLeave handles cleanup.
            ContentBorder.Background = new System.Windows.Media.SolidColorBrush(
                System.Windows.Media.Color.FromArgb(0x59, 0, 0, 0));

            if (StatsPanel.Visibility == Visibility.Visible && _statsTimer != null
                && _statsTimer.IsEnabled)
            {
                _statsTimer.Stop();
                _statsTimer.Interval = TimeSpan.FromSeconds(0.5);
                _statsTimer.Start();
            }
            _isHoverFastRefresh = true;
            return;  // Skip ghost mode path — do NOT apply WS_EX_TRANSPARENT
        }

        // Ghost mode activation (v2.3 Phase 26)

        // Step 1: Run synthetic MouseLeave cleanup BEFORE going click-through.
        // WS_EX_TRANSPARENT stops WM_MOUSELEAVE delivery. Backdrop and timer state
        // must be clean before we disappear or they will be corrupted post-restore.
        ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
        if (StatsPanel.Visibility == Visibility.Visible && _statsTimer != null)
        {
            _statsTimer.Stop();
            _statsTimer.Interval = TimeSpan.FromSeconds(_statsIntervalSeconds);
            _statsTimer.Start();
        }
        _isHoverFastRefresh = false;

        // Step 2: Start DispatcherTimer polling — checks GetCursorPos vs GetWindowRect every 75ms.
        // When the cursor exits the window rectangle, the timer stops and triggers ghost restore.
        // This fallback is used instead of TrackMouseEvent because WS_EX_TRANSPARENT causes Win32
        // to deliver a synthetic WM_MOUSELEAVE immediately after the style is applied.
        _ghostRestoreTimer!.Start();

        // Step 3: Apply WS_EX_TRANSPARENT (always OR onto existing style — never replace).
        // Must preserve WS_EX_LAYERED (AllowsTransparency) and WS_EX_TOOLWINDOW (Alt+Tab hide).
        _isGhostMode = true;
        int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
        SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
        SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
        this.Opacity = 0.0;
    }

    private void Window_MouseLeave(object sender, MouseEventArgs e)
    {
        // Ghost mode guard: if _isGhostMode is true, ghost restore is handled by _ghostRestoreTimer
        // polling Mouse.GetPosition(this). The hover-restore path below must NOT run during ghost state —
        // backdrop and timer were never set by Window_MouseEnter when ghosting (Step 1 cleaned them up).
        if (_isGhostMode) return;

        // Backdrop restore (Phase 14): always clear on leave regardless of stats state
        ContentBorder.Background = System.Windows.Media.Brushes.Transparent;

        if (StatsPanel.Visibility != Visibility.Visible) return;
        // Fast-refresh restore (Phase 12): restore configured interval
        if (_statsTimer != null)
        {
            _statsTimer.Stop();
            _statsTimer.Interval = TimeSpan.FromSeconds(_statsIntervalSeconds);
            _statsTimer.Start();
        }
        _isHoverFastRefresh = false;
    }

    private void SetStatRowVisible(Grid row, bool visible)
    {
        row.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;

        // Auto-collapse: if all FOUR rows are now hidden and the stats panel is still visible,
        // collapse the entire panel. One-way trigger — re-showing a row does NOT auto-show the panel.
        if (!visible
            && CpuRow.Visibility == Visibility.Collapsed
            && GpuRow.Visibility == Visibility.Collapsed
            && MemRow.Visibility == Visibility.Collapsed
            && PagRow.Visibility == Visibility.Collapsed
            && StatsPanel.Visibility == Visibility.Visible)
        {
            SetStatsVisible(false);
        }

        // Re-clamp on show: showing a row increases StatsPanel height.
        if (visible && StatsPanel.Visibility == Visibility.Visible)
        {
            UpdateLayout();
            if (_hasUserPosition)
            {
                var clamped = SettingsService.Clamp(
                    new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize },
                    ActualWidth, ActualHeight);
                Left = clamped.Left;
                Top  = clamped.Top;
            }
        }

        SaveSettings();
    }

    private void SetUptimeRowVisible(bool visible)
    {
        UptimeText.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;

        // Re-clamp on show: UptimeRow adds ~15px; widget near bottom edge would slide off screen.
        // Only meaningful when StatsPanel is visible — UptimeText is inside it, so if stats are hidden
        // the height doesn't change regardless of UptimeText.Visibility.
        if (visible && _hasUserPosition && StatsPanel.Visibility == Visibility.Visible)
        {
            UpdateLayout();
            var clamped = SettingsService.Clamp(
                new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize },
                ActualWidth, ActualHeight);
            Left = clamped.Left;
            Top  = clamped.Top;
        }

        SaveSettings();
    }

    private void ApplyFontSize(int size)
    {
        _currentFontSize    = size;
        PhraseText.FontSize = size;
        ShadowText.FontSize = size;
        // Re-clamp: font size change resizes window (SizeToContent=WidthAndHeight).
        // Must call UpdateLayout() before Clamp() — ActualWidth/ActualHeight are stale until layout runs.
        UpdateLayout();
        if (_hasUserPosition)
        {
            var clamped = SettingsService.Clamp(
                new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize },
                ActualWidth, ActualHeight);
            Left = clamped.Left;
            Top  = clamped.Top;
        }
        SaveSettings();
    }

    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        _statsTimer?.Stop();
        _statsService?.Dispose();
        SaveSettings();
        base.OnClosing(e);
    }

    private void InitTrayIcon()
    {
        // Create a 16x16 analog clock face icon programmatically.
        // Dark circle face, white rim, hour + minute hands at 10:10.
        var bmp = new System.Drawing.Bitmap(16, 16);
        using (var g = System.Drawing.Graphics.FromImage(bmp))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.Clear(System.Drawing.Color.Transparent);

            using var faceBrush = new System.Drawing.SolidBrush(System.Drawing.Color.FromArgb(30, 30, 30));
            g.FillEllipse(faceBrush, 1, 1, 14, 14);
            using var rimPen = new System.Drawing.Pen(System.Drawing.Color.White, 1.2f);
            g.DrawEllipse(rimPen, 1, 1, 14, 14);

            double hourRad = -60.0 * Math.PI / 180.0;
            float hx = 8f + 3.5f * (float)Math.Sin(hourRad);
            float hy = 8f - 3.5f * (float)Math.Cos(hourRad);
            using var hourPen = new System.Drawing.Pen(System.Drawing.Color.White, 1.8f)
                { StartCap = System.Drawing.Drawing2D.LineCap.Round, EndCap = System.Drawing.Drawing2D.LineCap.Round };
            g.DrawLine(hourPen, 8f, 8f, hx, hy);

            double minRad = 60.0 * Math.PI / 180.0;
            float mx = 8f + 5.5f * (float)Math.Sin(minRad);
            float my = 8f - 5.5f * (float)Math.Cos(minRad);
            using var minPen = new System.Drawing.Pen(System.Drawing.Color.White, 1.2f)
                { StartCap = System.Drawing.Drawing2D.LineCap.Round, EndCap = System.Drawing.Drawing2D.LineCap.Round };
            g.DrawLine(minPen, 8f, 8f, mx, my);

            g.FillEllipse(System.Drawing.Brushes.White, 6.5f, 6.5f, 3f, 3f);
        }
        var icon = System.Drawing.Icon.FromHandle(bmp.GetHicon());

        var menu = new System.Windows.Forms.ContextMenuStrip();
        menu.Opening += TrayMenu_Opening;

        // Ghost Mode
        _ghostModeMenuItem = new System.Windows.Forms.ToolStripMenuItem("Ghost Mode")
            { Checked = _ghostModeEnabled };
        _ghostModeMenuItem.Click += (_, _) =>
        {
            _ghostModeEnabled = !_ghostModeEnabled;
            _ghostModeMenuItem.Checked = _ghostModeEnabled;
            SaveSettings();
        };
        menu.Items.Add(_ghostModeMenuItem);
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());

        // Font Size submenu
        _trayFontSmall  = new System.Windows.Forms.ToolStripMenuItem("Small (16pt)");
        _trayFontMedium = new System.Windows.Forms.ToolStripMenuItem("Medium (24pt)");
        _trayFontLarge  = new System.Windows.Forms.ToolStripMenuItem("Large (32pt)");
        _trayFontSmall.Click  += (_, _) => Dispatcher.Invoke(() => ApplyFontSize(16));
        _trayFontMedium.Click += (_, _) => Dispatcher.Invoke(() => ApplyFontSize(24));
        _trayFontLarge.Click  += (_, _) => Dispatcher.Invoke(() => ApplyFontSize(32));
        _trayFontSizeItem = new System.Windows.Forms.ToolStripMenuItem("Font Size", null,
            _trayFontSmall, _trayFontMedium, _trayFontLarge);
        _trayFontSizeSep = new System.Windows.Forms.ToolStripSeparator();
        _trayFontSizeItem.Visible = !_dialMode;
        _trayFontSizeSep.Visible  = !_dialMode;
        menu.Items.Add(_trayFontSizeItem);
        menu.Items.Add(_trayFontSizeSep);

        // Stats submenu
        _trayShowStats     = new System.Windows.Forms.ToolStripMenuItem("Show Stats");
        _trayCpuVisible    = new System.Windows.Forms.ToolStripMenuItem("Show CPU");
        _trayGpuVisible    = new System.Windows.Forms.ToolStripMenuItem("Show GPU");
        _trayMemVisible    = new System.Windows.Forms.ToolStripMenuItem("Show MEM");
        _trayPagVisible    = new System.Windows.Forms.ToolStripMenuItem("Show PAG");
        _trayUptimeVisible = new System.Windows.Forms.ToolStripMenuItem("Show Uptime");
        _trayInterval1     = new System.Windows.Forms.ToolStripMenuItem("1 second");
        _trayInterval3     = new System.Windows.Forms.ToolStripMenuItem("3 seconds");
        _trayInterval10    = new System.Windows.Forms.ToolStripMenuItem("10 seconds");
        _trayShowStats.Click     += (_, _) => Dispatcher.Invoke(() => SetStatsVisible(StatsPanel.Visibility != Visibility.Visible));
        _trayCpuVisible.Click    += (_, _) => Dispatcher.Invoke(() => SetStatRowVisible(CpuRow, CpuRow.Visibility != Visibility.Visible));
        _trayGpuVisible.Click    += (_, _) => Dispatcher.Invoke(() => SetStatRowVisible(GpuRow, GpuRow.Visibility != Visibility.Visible));
        _trayMemVisible.Click    += (_, _) => Dispatcher.Invoke(() => SetStatRowVisible(MemRow, MemRow.Visibility != Visibility.Visible));
        _trayPagVisible.Click    += (_, _) => Dispatcher.Invoke(() => SetStatRowVisible(PagRow, PagRow.Visibility != Visibility.Visible));
        _trayUptimeVisible.Click += (_, _) => Dispatcher.Invoke(() => SetUptimeRowVisible(UptimeText.Visibility != Visibility.Visible));
        _trayInterval1.Click  += (_, _) => Dispatcher.Invoke(() => SetStatsInterval(1));
        _trayInterval3.Click  += (_, _) => Dispatcher.Invoke(() => SetStatsInterval(3));
        _trayInterval10.Click += (_, _) => Dispatcher.Invoke(() => SetStatsInterval(10));
        var intervalItem = new System.Windows.Forms.ToolStripMenuItem("Update Interval", null,
            _trayInterval1, _trayInterval3, _trayInterval10);
        var statsItem = new System.Windows.Forms.ToolStripMenuItem("Stats", null,
            _trayShowStats,
            new System.Windows.Forms.ToolStripSeparator(),
            _trayCpuVisible, _trayGpuVisible, _trayMemVisible, _trayPagVisible, _trayUptimeVisible,
            intervalItem);
        menu.Items.Add(statsItem);
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());

        // Dial Mode + Dial Face submenu
        _trayDialMode = new System.Windows.Forms.ToolStripMenuItem("Dial Mode");
        _trayDialMode.Click += (_, _) => Dispatcher.Invoke(() => SetDialMode(!_dialMode));
        menu.Items.Add(_trayDialMode);

        _trayShowHourTicks   = new System.Windows.Forms.ToolStripMenuItem("Show Hour Ticks");
        _trayShowMinuteDots  = new System.Windows.Forms.ToolStripMenuItem("Show Minute Marks");
        _trayShowHourNumbers = new System.Windows.Forms.ToolStripMenuItem("Show Hour Numbers");
        _trayShowHourTicks.Click   += (_, _) => Dispatcher.Invoke(() => SetShowHourTicks(!_showHourTicks));
        _trayShowMinuteDots.Click  += (_, _) => Dispatcher.Invoke(() => SetShowMinuteDots(!_showMinuteDots));
        _trayShowHourNumbers.Click += (_, _) => Dispatcher.Invoke(() => SetShowHourNumbers(!_showHourNumbers));
        _trayDialFaceItem = new System.Windows.Forms.ToolStripMenuItem("Dial Face", null,
            _trayShowHourTicks, _trayShowMinuteDots, _trayShowHourNumbers);
        _trayDialFaceItem.Visible = _dialMode;
        menu.Items.Add(_trayDialFaceItem);
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());

        // Theme submenu
        _trayThemeWhite = new System.Windows.Forms.ToolStripMenuItem("White");
        _trayThemeAmber = new System.Windows.Forms.ToolStripMenuItem("Amber");
        _trayThemeIce   = new System.Windows.Forms.ToolStripMenuItem("Ice Blue");
        _trayThemeGreen = new System.Windows.Forms.ToolStripMenuItem("Green");
        _trayThemePink  = new System.Windows.Forms.ToolStripMenuItem("Hello Kitty Pink");
        var trayThemeCustom = new System.Windows.Forms.ToolStripMenuItem("Custom...");
        _trayThemeWhite.Click += (_, _) => Dispatcher.Invoke(() => SetAccentColor(PresetWhite));
        _trayThemeAmber.Click += (_, _) => Dispatcher.Invoke(() => SetAccentColor(PresetAmber));
        _trayThemeIce.Click   += (_, _) => Dispatcher.Invoke(() => SetAccentColor(PresetIce));
        _trayThemeGreen.Click += (_, _) => Dispatcher.Invoke(() => SetAccentColor(PresetGreen));
        _trayThemePink.Click  += (_, _) => Dispatcher.Invoke(() => SetAccentColor(PresetPink));
        trayThemeCustom.Click += (_, _) => Dispatcher.Invoke(OpenCustomColorDialog);
        var themeItem = new System.Windows.Forms.ToolStripMenuItem("Theme", null,
            _trayThemeWhite, _trayThemeAmber, _trayThemeIce, _trayThemeGreen, _trayThemePink,
            new System.Windows.Forms.ToolStripSeparator(),
            trayThemeCustom);
        menu.Items.Add(themeItem);

        // Opacity submenu
        _trayOpacity25  = new System.Windows.Forms.ToolStripMenuItem("25%");
        _trayOpacity50  = new System.Windows.Forms.ToolStripMenuItem("50%");
        _trayOpacity75  = new System.Windows.Forms.ToolStripMenuItem("75%");
        _trayOpacity100 = new System.Windows.Forms.ToolStripMenuItem("100%");
        _trayOpacity25.Click  += (_, _) => Dispatcher.Invoke(() => SetOpacity(0.25));
        _trayOpacity50.Click  += (_, _) => Dispatcher.Invoke(() => SetOpacity(0.50));
        _trayOpacity75.Click  += (_, _) => Dispatcher.Invoke(() => SetOpacity(0.75));
        _trayOpacity100.Click += (_, _) => Dispatcher.Invoke(() => SetOpacity(1.00));
        var opacityItem = new System.Windows.Forms.ToolStripMenuItem("Opacity", null,
            _trayOpacity25, _trayOpacity50, _trayOpacity75, _trayOpacity100);
        menu.Items.Add(opacityItem);

        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());

        var resetItem = new System.Windows.Forms.ToolStripMenuItem("Reset to Defaults");
        var quitItem  = new System.Windows.Forms.ToolStripMenuItem("Quit");
        resetItem.Click += (_, _) => Dispatcher.Invoke(ResetToDefaults);
        quitItem.Click  += (_, _) => Dispatcher.Invoke(() => Application.Current.Shutdown());
        menu.Items.Add(resetItem);
        menu.Items.Add(quitItem);

        _trayIcon = new System.Windows.Forms.NotifyIcon
        {
            Icon             = icon,
            Text             = "FuzzyClock",
            ContextMenuStrip = menu,
            Visible          = true
        };
    }

    private void ResetToDefaults()
    {
        // Reset accent color to White (same as PresetWhite constant = #FFFFFFFF)
        SetAccentColor(PresetWhite);

        // Reset opacity to 100%
        SetOpacity(1.0);

        // Reset font size to small (16pt)
        ApplyFontSize(16);

        // Reset to phrase (text) mode — disable dial if active
        if (_dialMode) SetDialMode(false);

        // Center on primary screen
        // ActualWidth/ActualHeight are valid at runtime (ContentRendered has already fired)
        Left = (SystemParameters.PrimaryScreenWidth  - ActualWidth)  / 2;
        Top  = (SystemParameters.PrimaryScreenHeight - ActualHeight) / 2;
        _hasUserPosition = true;   // treat centered position as user-set to prevent phrase-change snap

        // Re-enable ghost mode
        _ghostModeEnabled = true;
        _ghostModeMenuItem.Checked = true;

        // Save the reset state immediately (SetAccentColor and SetOpacity each call SaveSettings(),
        // but we need to save the new position too — call once more with final state)
        SaveSettings();
    }


    private void SetDialMode(bool dialMode)
    {
        _dialMode = dialMode;

        PhraseText.Visibility  = dialMode ? Visibility.Collapsed : Visibility.Visible;
        ShadowText.Visibility  = dialMode ? Visibility.Collapsed : Visibility.Visible;
        DialCanvas.Visibility  = dialMode ? Visibility.Visible   : Visibility.Collapsed;

        // DIAL-09: hide/show Dial Face submenu on mode switch
        _trayDialFaceItem.Visible = dialMode;

        // MENU-01: hide Font Size submenu (and its trailing separator) in dial mode
        _trayFontSizeItem.Visible = !dialMode;
        _trayFontSizeSep.Visible  = !dialMode;

        if (dialMode) UpdateDialDisplay();

        SaveSettings();
    }

    private void SetShowHourTicks(bool show)
    {
        _showHourTicks = show;
        var vis = show ? Visibility.Visible : Visibility.Collapsed;
        foreach (var el in _hourTickElements) el.Visibility = vis;
        SaveSettings();
    }

    private void SetShowMinuteDots(bool show)
    {
        _showMinuteDots = show;
        var vis = show ? Visibility.Visible : Visibility.Collapsed;
        foreach (var el in _minuteDotElements) el.Visibility = vis;
        SaveSettings();
    }

    private void SetShowHourNumbers(bool show)
    {
        _showHourNumbers = show;
        var vis = show ? Visibility.Visible : Visibility.Collapsed;
        foreach (var el in _hourNumberElements) el.Visibility = vis;
        SaveSettings();
    }

    private void SetOpacity(double opacity)
    {
        _windowOpacity = opacity;
        this.Opacity   = opacity;
        SaveSettings();
    }


    private void Window_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
    {
        // e.Delta > 0: scroll up = increase opacity; e.Delta < 0: scroll down = decrease opacity
        // Math.Sign: exactly one 10% step per physical notch regardless of high-resolution wheel
        double step = Math.Sign(e.Delta) * 0.10;
        _windowOpacity = Math.Clamp(_windowOpacity + step, 0.10, 1.0);
        this.Opacity = _windowOpacity;
        SaveSettings();
        e.Handled = true;  // prevent scroll leaking to desktop or windows below overlay
    }

    private void InitDialDecorations()
    {
        const double CenterX = 40.0;
        const double CenterY = 40.0;

        // Hour ticks: 12 short Line elements, outer R=36, inner R=31
        for (int h = 0; h < 12; h++)
        {
            double angleRad = (h / 12.0) * 2 * Math.PI;
            var tick = new System.Windows.Shapes.Line
            {
                X1 = CenterX + 31.0 * Math.Sin(angleRad),
                Y1 = CenterY - 31.0 * Math.Cos(angleRad),
                X2 = CenterX + 36.0 * Math.Sin(angleRad),
                Y2 = CenterY - 36.0 * Math.Cos(angleRad),
                Stroke = System.Windows.Media.Brushes.White,
                StrokeThickness = 1.5,
                Visibility = Visibility.Collapsed
            };
            _hourTickElements.Add(tick);
            DialCanvas.Children.Add(tick);
        }

        // Minute dots: 60 small Ellipse elements (2x2px) at R=35
        for (int m = 0; m < 60; m++)
        {
            double angleRad = (m / 60.0) * 2 * Math.PI;
            double dotCx = CenterX + 35.0 * Math.Sin(angleRad);
            double dotCy = CenterY - 35.0 * Math.Cos(angleRad);
            var dot = new System.Windows.Shapes.Ellipse
            {
                Width  = 2.0,
                Height = 2.0,
                Fill   = System.Windows.Media.Brushes.White,
                Visibility = Visibility.Collapsed
            };
            Canvas.SetLeft(dot, dotCx - 1.0);
            Canvas.SetTop(dot,  dotCy - 1.0);
            _minuteDotElements.Add(dot);
            DialCanvas.Children.Add(dot);
        }

        // Hour numbers: TextBlock "1"-"12" at R=25 (inside the tick ring)
        for (int h = 1; h <= 12; h++)
        {
            double angleRad = (h / 12.0) * 2 * Math.PI;
            double numCx = CenterX + 25.0 * Math.Sin(angleRad);
            double numCy = CenterY - 25.0 * Math.Cos(angleRad);
            var tb = new System.Windows.Controls.TextBlock
            {
                Text       = h.ToString(),
                Foreground = System.Windows.Media.Brushes.White,
                FontFamily = new System.Windows.Media.FontFamily("Segoe UI Light"),
                FontSize   = 7,
                Visibility = Visibility.Collapsed
            };
            Canvas.SetLeft(tb, numCx - 4.0);
            Canvas.SetTop(tb,  numCy - 4.5);
            _hourNumberElements.Add(tb);
            DialCanvas.Children.Add(tb);
        }

        // Apply saved visibility state — ApplySettings() set the fields before ContentRendered ran;
        // elements did not exist at that point, so we apply visibility here.
        var tickVis = _showHourTicks   ? Visibility.Visible : Visibility.Collapsed;
        var dotVis  = _showMinuteDots  ? Visibility.Visible : Visibility.Collapsed;
        var numVis  = _showHourNumbers ? Visibility.Visible : Visibility.Collapsed;
        foreach (var el in _hourTickElements)   el.Visibility = tickVis;
        foreach (var el in _minuteDotElements)  el.Visibility = dotVis;
        foreach (var el in _hourNumberElements) el.Visibility = numVis;
    }

    private void ApplyTheme()
    {
        var brush = new System.Windows.Media.SolidColorBrush(_accentColor);

        // Phrase mode
        PhraseText.Foreground = brush;
        // ShadowText deliberately excluded — stays #BB000000 always

        // Dial mode (static XAML elements)
        HourHand.Stroke   = brush;
        MinuteHand.Stroke = brush;

        // Dial decorations (code-behind lists populated by InitDialDecorations)
        // Safe here: ApplyTheme() is only called after InitDialDecorations() in ContentRendered,
        // or from SetAccentColor() at runtime (after ContentRendered has already run).
        foreach (var el in _hourTickElements)   el.Stroke     = brush;
        foreach (var el in _minuteDotElements)  el.Fill       = brush;
        foreach (var el in _hourNumberElements) el.Foreground = brush;

        // Stats fill bars (accent color)
        CpuBar.Background = brush;
        GpuBar.Background = brush;
        MemBar.Background = brush;
        PagBar.Background = brush;

        // Stats percentage text (accent color)
        CpuText.Foreground = brush;
        GpuText.Foreground = brush;
        MemText.Foreground = brush;
        PagText.Foreground = brush;

        // Uptime row text (accent color)
        UptimeText.Foreground = brush;

        // Deliberately excluded: ShadowText, CpuBarTrack/GpuBarTrack/MemBarTrack/PagBarTrack,
        // row label TextBlocks (CPU/GPU/MEM/PAG — no x:Name), ContentBorder.Background
    }

    private void SetAccentColor(System.Windows.Media.Color color)
    {
        _accentColor = color;
        ApplyTheme();
        SaveSettings();
    }

    private sealed class Win32Window : System.Windows.Forms.IWin32Window
    {
        public IntPtr Handle { get; }
        public Win32Window(IntPtr handle) => Handle = handle;
    }

    private void OpenCustomColorDialog()
    {
        var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;

        using var dlg = new System.Windows.Forms.ColorDialog
        {
            AllowFullOpen = true,
            FullOpen      = true,
            Color         = System.Drawing.Color.FromArgb(
                                _accentColor.A, _accentColor.R,
                                _accentColor.G, _accentColor.B)
        };

        if (dlg.ShowDialog(new Win32Window(hwnd)) == System.Windows.Forms.DialogResult.OK)
        {
            var c = dlg.Color;
            SetAccentColor(System.Windows.Media.Color.FromArgb(c.A, c.R, c.G, c.B));
        }
        // Cancel: no action — current accent color preserved
    }

    private void UpdateDialDisplay()
    {
        if (!_dialMode) return;

        var now    = DateTime.Now;
        int hour   = now.Hour;
        int minute = now.Minute;

        // Analog interpolation: minute hand sweeps full circle in 60 min;
        // hour hand sweeps full circle in 12 hours, with intra-hour interpolation.
        double minuteAngle = DialGeometry.GetMinuteAngleDegrees(minute);
        double hourAngle   = DialGeometry.GetHourAngleDegrees(hour, minute);

        // Convert to radians. Rotation is from 12 o'clock (top), clockwise.
        // Canvas center = (40, 40). Offset formula:
        //   X2 = 40 + length * Sin(angleRadians)   (Sin positive = rightward from 12)
        //   Y2 = 40 - length * Cos(angleRadians)   (Cos positive = upward, so subtract)
        double minuteRad = minuteAngle * Math.PI / 180.0;
        double hourRad   = hourAngle   * Math.PI / 180.0;

        const double HourLength   = 25.0;
        const double MinuteLength = 35.0;

        HourHand.X2   = 40 + HourLength   * Math.Sin(hourRad);
        HourHand.Y2   = 40 - HourLength   * Math.Cos(hourRad);
        MinuteHand.X2 = 40 + MinuteLength * Math.Sin(minuteRad);
        MinuteHand.Y2 = 40 - MinuteLength * Math.Cos(minuteRad);
    }
}
