using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using FuzzyClock.Core;

namespace FuzzyClock.App;

public partial class MainWindow : Window
{
    private DispatcherTimer _timer = null!;
    private DispatcherTimer _statsTimer = null!;
    private StatsService _statsService = null!;
    private int _statsIntervalSeconds = 3;   // default matches AppSettings.StatsIntervalSeconds default
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
            _statsTimer.Tick += (_, _) => UpdateStatsDisplay();
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

            this.MouseEnter += Window_MouseEnter;
            this.MouseLeave += Window_MouseLeave;
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
            DialMode = _dialMode,
            ShowHourTicks   = _showHourTicks,
            ShowMinuteDots  = _showMinuteDots,
            ShowHourNumbers = _showHourNumbers,
            Opacity = _windowOpacity,
            AccentColor = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}"
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

    private void PositionTopRight()
    {
        const double Padding = 20.0;
        Left = SystemParameters.PrimaryScreenWidth - ActualWidth - Padding;
        Top = Padding;
    }

    private void CloseMenuItem_Click(object sender, RoutedEventArgs e)
    {
        // Application.Current.Shutdown() rather than this.Close() because the hidden
        // owner window keeps the process alive if only the main window is closed.
        Application.Current.Shutdown();
    }

    private void ContextMenu_Opened(object sender, RoutedEventArgs e)
    {
        FontSmall.IsChecked  = (_currentFontSize == 16);
        FontMedium.IsChecked = (_currentFontSize == 24);
        FontLarge.IsChecked  = (_currentFontSize == 32);

        MenuShowStats.IsChecked  = (StatsPanel.Visibility == Visibility.Visible);
        MenuInterval1.IsChecked  = (_statsIntervalSeconds == 1);
        MenuInterval3.IsChecked  = (_statsIntervalSeconds == 3);
        MenuInterval10.IsChecked = (_statsIntervalSeconds == 10);

        MenuCpuVisible.IsChecked = (CpuRow.Visibility == Visibility.Visible);
        MenuGpuVisible.IsChecked = (GpuRow.Visibility == Visibility.Visible);
        MenuMemVisible.IsChecked = (MemRow.Visibility == Visibility.Visible);
        MenuPagVisible.IsChecked = (PagRow.Visibility == Visibility.Visible);
        MenuDialMode.IsChecked = _dialMode;

        // MENU-01: Font Size submenu visible only in phrase mode (inverse of DIAL-09)
        MenuFontSize.Visibility = _dialMode ? Visibility.Collapsed : Visibility.Visible;

        // DIAL-09: Dial Face submenu visible only in dial mode
        MenuDialFace.Visibility       = _dialMode ? Visibility.Visible : Visibility.Collapsed;
        MenuShowHourTicks.IsChecked   = _showHourTicks;
        MenuShowMinuteDots.IsChecked  = _showMinuteDots;
        MenuShowHourNumbers.IsChecked = _showHourNumbers;

        // Opacity preset sync — exact double comparison is reliable: _windowOpacity changes
        // only via SetOpacity() (exact literal assignment) or Math.Clamp in 0.10 steps
        MenuOpacity25.IsChecked  = (_windowOpacity == 0.25);
        MenuOpacity50.IsChecked  = (_windowOpacity == 0.50);
        MenuOpacity75.IsChecked  = (_windowOpacity == 0.75);
        MenuOpacity100.IsChecked = (_windowOpacity == 1.00);
        // Intermediate scroll-wheel values (e.g. 0.60) correctly show no checkmark

        // Theme preset sync — compare hex from _accentColor to preset constants
        // Single source of truth: derive hex from _accentColor; no secondary theme-name field
        string currentHex = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}";
        MenuThemeWhite.IsChecked = (currentHex == "#FFFFFFFF");
        MenuThemeAmber.IsChecked = (currentHex == "#FFFFC000");
        MenuThemeIce.IsChecked   = (currentHex == "#FF87CEEB");
        MenuThemeGreen.IsChecked = (currentHex == "#FF00C000");
        MenuThemePink.IsChecked  = (currentHex == "#FFFF69B4");
        // When a custom color is active (Phase 21), none match — no checkmark shown. Correct.
    }

    private void FontSmall_Click(object sender, RoutedEventArgs e)  => ApplyFontSize(16);
    private void FontMedium_Click(object sender, RoutedEventArgs e) => ApplyFontSize(24);
    private void FontLarge_Click(object sender, RoutedEventArgs e)  => ApplyFontSize(32);

    private void MenuShowStats_Click(object sender, RoutedEventArgs e)
        => SetStatsVisible(StatsPanel.Visibility != Visibility.Visible);

    private void MenuCpuVisible_Click(object sender, RoutedEventArgs e)
        => SetStatRowVisible(CpuRow, CpuRow.Visibility != Visibility.Visible);

    private void MenuGpuVisible_Click(object sender, RoutedEventArgs e)
        => SetStatRowVisible(GpuRow, GpuRow.Visibility != Visibility.Visible);

    private void MenuMemVisible_Click(object sender, RoutedEventArgs e)
        => SetStatRowVisible(MemRow, MemRow.Visibility != Visibility.Visible);

    private void MenuPagVisible_Click(object sender, RoutedEventArgs e)
        => SetStatRowVisible(PagRow, PagRow.Visibility != Visibility.Visible);

    private void MenuInterval1_Click(object sender, RoutedEventArgs e)  => SetStatsInterval(1);
    private void MenuInterval3_Click(object sender, RoutedEventArgs e)  => SetStatsInterval(3);
    private void MenuInterval10_Click(object sender, RoutedEventArgs e) => SetStatsInterval(10);

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
        // Backdrop (Phase 14/15): show semi-transparent background on hover (always)
        ContentBorder.Background = new System.Windows.Media.SolidColorBrush(
            System.Windows.Media.Color.FromArgb(0x59, 0, 0, 0));

        if (StatsPanel.Visibility != Visibility.Visible) return;
        // Fast-refresh (Phase 12): accelerate stats timer — only when stats visible
        if (_statsTimer != null && _statsTimer.IsEnabled)
        {
            _statsTimer.Stop();
            _statsTimer.Interval = TimeSpan.FromSeconds(0.5);
            _statsTimer.Start();
        }
    }

    private void Window_MouseLeave(object sender, MouseEventArgs e)
    {
        // Backdrop restore (Phase 14): always clear on leave regardless of stats state
        // (stats may have been hidden while mouse was over widget — backdrop must still clear)
        ContentBorder.Background = System.Windows.Media.Brushes.Transparent;

        if (StatsPanel.Visibility != Visibility.Visible) return;
        // Fast-refresh restore (Phase 12): restore configured interval
        if (_statsTimer != null)
        {
            _statsTimer.Stop();
            _statsTimer.Interval = TimeSpan.FromSeconds(_statsIntervalSeconds);
            _statsTimer.Start();
        }
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

    private void MenuDialMode_Click(object sender, RoutedEventArgs e)
        => SetDialMode(!_dialMode);

    private void MenuShowHourTicks_Click(object sender, RoutedEventArgs e)
        => SetShowHourTicks(!_showHourTicks);

    private void MenuShowMinuteDots_Click(object sender, RoutedEventArgs e)
        => SetShowMinuteDots(!_showMinuteDots);

    private void MenuShowHourNumbers_Click(object sender, RoutedEventArgs e)
        => SetShowHourNumbers(!_showHourNumbers);

    private void SetDialMode(bool dialMode)
    {
        _dialMode = dialMode;

        PhraseText.Visibility  = dialMode ? Visibility.Collapsed : Visibility.Visible;
        ShadowText.Visibility  = dialMode ? Visibility.Collapsed : Visibility.Visible;
        DialCanvas.Visibility  = dialMode ? Visibility.Visible   : Visibility.Collapsed;

        // DIAL-09: hide/show Dial Face submenu on mode switch
        MenuDialFace.Visibility = dialMode ? Visibility.Visible : Visibility.Collapsed;

        // MENU-01: hide Font Size submenu in dial mode, restore in phrase mode
        MenuFontSize.Visibility = dialMode ? Visibility.Collapsed : Visibility.Visible;

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

    private void MenuOpacity25_Click(object sender, RoutedEventArgs e)  => SetOpacity(0.25);
    private void MenuOpacity50_Click(object sender, RoutedEventArgs e)  => SetOpacity(0.50);
    private void MenuOpacity75_Click(object sender, RoutedEventArgs e)  => SetOpacity(0.75);
    private void MenuOpacity100_Click(object sender, RoutedEventArgs e) => SetOpacity(1.00);

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

        // Deliberately excluded: ShadowText, CpuBarTrack/GpuBarTrack/MemBarTrack/PagBarTrack,
        // row label TextBlocks (CPU/GPU/MEM/PAG — no x:Name), ContentBorder.Background
    }

    private void SetAccentColor(System.Windows.Media.Color color)
    {
        _accentColor = color;
        ApplyTheme();
        SaveSettings();
    }

    private void MenuThemeWhite_Click(object sender, RoutedEventArgs e) => SetAccentColor(PresetWhite);
    private void MenuThemeAmber_Click(object sender, RoutedEventArgs e) => SetAccentColor(PresetAmber);
    private void MenuThemeIce_Click(object sender, RoutedEventArgs e)   => SetAccentColor(PresetIce);
    private void MenuThemeGreen_Click(object sender, RoutedEventArgs e) => SetAccentColor(PresetGreen);
    private void MenuThemePink_Click(object sender, RoutedEventArgs e)  => SetAccentColor(PresetPink);

    private void UpdateDialDisplay()
    {
        if (!_dialMode) return;

        var now    = DateTime.Now;
        int hour   = now.Hour;
        int minute = now.Minute;

        // Analog interpolation: minute hand sweeps full circle in 60 min;
        // hour hand sweeps full circle in 12 hours, with intra-hour interpolation.
        double minuteAngle = (minute / 60.0) * 360.0;
        double hourAngle   = ((hour % 12) / 12.0 + minute / 720.0) * 360.0;

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
