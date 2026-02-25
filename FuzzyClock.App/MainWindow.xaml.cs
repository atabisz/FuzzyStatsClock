using System.Windows;
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
            _timer.Tick += (_, _) => UpdatePhraseIfChanged();
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
            StatsIntervalSeconds = _statsIntervalSeconds
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
        // DragMove() is a blocking Win32 modal loop — it returns only when the mouse button
        // is released. Left and Top reflect the final dropped position immediately after return.
        // Do NOT defer with BeginInvoke or await — DragMove() throws if the left button is
        // not held down at the Win32 level at the moment of the call.
        DragMove();
        // LocationChanged fires during DragMove — _hasUserPosition is already true here.
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
    }

    private void FontSmall_Click(object sender, RoutedEventArgs e)  => ApplyFontSize(16);
    private void FontMedium_Click(object sender, RoutedEventArgs e) => ApplyFontSize(24);
    private void FontLarge_Click(object sender, RoutedEventArgs e)  => ApplyFontSize(32);

    private void MenuShowStats_Click(object sender, RoutedEventArgs e)
        => SetStatsVisible(StatsPanel.Visibility != Visibility.Visible);

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
}
