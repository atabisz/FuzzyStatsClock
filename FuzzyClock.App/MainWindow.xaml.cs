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
    private int _statsIntervalSeconds = 3;       // default matches AppSettings.StatsIntervalSeconds default
    private double _processCountThreshold = 5.0; // default matches AppSettings.ProcessCountThresholdPercent default
    private bool _batteryAlertActive    = false;
    private int  _batteryAlertThreshold = 20;   // matches AppSettings.BatteryAlertThresholdPercent default
    private bool _isHoverFastRefresh = false;
    private readonly Queue<float> _cpuSamples = new();
    // Bounded by trim logic in UpdateUptimeDisplay(). Max 900 entries at 1s interval (~3.5KB).
    private Dictionary<int, TimeSpan> _prevProcTimes = new();
    private DateTime _prevProcSample = DateTime.MinValue;
    // StatsPanel.Width(184) - label column(35) - text column(36) = 113
    private const double StatsBarTrackWidth = 113.0;
    private int _currentFontSize = 32;
    private string _currentMonitorKey = "";      // monitor key for the screen currently hosting the window
    private AppSettings _settings = new();        // cached settings — updated on every SaveSettings call
    private bool _hasUserPosition = false;
    private ClockType _clockType = ClockType.Phrase;
    private LcdTheme _lcdTheme       = LcdTheme.Green;
    private bool     _lcdUse24Hr     = false;
    private bool     _lcdShowSeconds = true;
    private string _currentTextStyle  = "Classic";
    private string _currentPhraseStyle  = "Classic";
    private string _currentPhraseLocale = "auto";  // "auto" or explicit "en"/"fr"/"es"/"de"/"ja"/"pl"
    private bool   _showDate        = true;
    private string _dateFormat      = "Short";
    private string _currentDateText = "";   // tracks last-rendered date for midnight detection
    private bool _showHourTicks   = false;
    private bool _showMinuteDots  = false;
    private bool _showHourNumbers = false;
    private double _windowOpacity = 1.0;
    private System.Windows.Media.Color _accentColor = System.Windows.Media.Colors.White;
    private System.Windows.Forms.NotifyIcon _trayIcon = null!;
    private TrayMenuBuilder _trayMenu = null!;
    private bool _autoLaunchEnabled = false;
    private bool _isDragging = false;   // true between DragMove() start and end — freezes display color
    private GhostModeController _ghostMode = null!;
    private ContrastRefreshController _contrast = new();
    private SettingsWindow? _settingsWindow;
    private string? _currentTheme = null;  // null = no named theme active

    private readonly List<System.Windows.Shapes.Line>        _hourTickElements   = new();
    private readonly List<System.Windows.Shapes.Ellipse>     _minuteDotElements  = new();
    private readonly List<System.Windows.Controls.TextBlock> _hourNumberElements = new();

    internal static readonly System.Windows.Media.Color PresetWhite = System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0xFF, 0xFF);
    internal static readonly System.Windows.Media.Color PresetAmber = System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0xC0, 0x00);
    internal static readonly System.Windows.Media.Color PresetIce   = System.Windows.Media.Color.FromArgb(0xFF, 0x87, 0xCE, 0xEB);
    internal static readonly System.Windows.Media.Color PresetGreen = System.Windows.Media.Color.FromArgb(0xFF, 0x00, 0xC0, 0x00);
    internal static readonly System.Windows.Media.Color PresetPink  = System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0x69, 0xB4);

    public MainWindow()
    {
        InitializeComponent();
        _ghostMode = new GhostModeController();

        // Set _hasUserPosition flag after any window move (covers drag completion via LocationChanged).
        // LocationChanged fires reliably after DragMove() returns (the window has moved).
        this.LocationChanged += (_, _) => _hasUserPosition = true;

        // ContentRendered fires after the first layout pass when ActualWidth/ActualHeight are valid.
        // SizeToContent=WidthAndHeight defers measurement until after Show() is called,
        // so ActualWidth is 0 in the constructor — positioning must be deferred.
        ContentRendered += (_, _) =>
        {
            if (_hasUserPosition)
            {
                // Clamp to the monitor where the saved position was; if monitor absent, use primary.
                // ActualWidth/ActualHeight are valid after first layout pass.
                var targetScreen = FindScreenForKey(_currentMonitorKey);
                var clamped = SettingsService.Clamp(
                    new MonitorPosition { Left = Left, Top = Top },
                    ActualWidth, ActualHeight, targetScreen);
                Left = clamped.Left;
                Top  = clamped.Top;
                // If the monitor is absent, _currentMonitorKey may not match any connected screen.
                // FindScreenForKey already falls back to primary, so the clamp is correct.
                // Update _currentMonitorKey to the actual screen now hosting the window.
                _currentMonitorKey = MonitorService.GetCurrentMonitorKey(this);
            }
            else
            {
                PositionTopRight();
            }

            _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
            _timer.Tick += (_, _) =>
            {
                if (_clockType != ClockType.Lcd)
                {
                    UpdatePhraseIfChanged();
                    if (_clockType == ClockType.Dial) UpdateDialDisplay();
                }
                UpdateDateDisplay();
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

            if (_clockType == ClockType.Dial) UpdateDialDisplay();
            InitDialDecorations();
            ApplyTheme();            // must come AFTER InitDialDecorations() — decoration lists are empty before this point
            UpdateDateDisplay();     // set initial date text (timer hasn't fired yet)

            // Contrast refresh controller (500ms sampling timer)
            _contrast.ColorChanged += ApplyDisplayColor;
            _contrast.Cleared      += ApplyTheme;
            _contrast.Initialize(
                this,
                () => _ghostMode.IsActive || _windowOpacity == 0.0 || _isDragging,
                () => new RgbColor(_accentColor.R, _accentColor.G, _accentColor.B));

            // Ghost mode controller — initialize now that HWND is available
            _ghostMode.Restored += () =>
            {
                this.Opacity = _windowOpacity;
                ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
            };
            _ghostMode.Initialize(new System.Windows.Interop.WindowInteropHelper(this).Handle);

            // Tray icon
            _trayMenu = new TrayMenuBuilder(new TrayMenuCallbacks
            {
                ToggleGhostMode    = () => Dispatcher.Invoke(() => { _ghostMode.IsEnabled = !_ghostMode.IsEnabled; SaveSettings(); }),
                ToggleStatsVisible = () => Dispatcher.Invoke(() => SetStatsVisible(StatsPanel.Visibility != Visibility.Visible)),
                ToggleAutoContrast = () => Dispatcher.Invoke(() => { _contrast.SetEnabled(!_contrast.IsEnabled); SaveSettings(); }),
                ToggleAutoLaunch   = () => Dispatcher.Invoke(() =>
                {
                    _autoLaunchEnabled = !_autoLaunchEnabled;
                    string exePath = System.Diagnostics.Process.GetCurrentProcess().MainModule!.FileName;
                    if (_autoLaunchEnabled) AutoLaunchService.Enable(exePath); else AutoLaunchService.Disable();
                    SaveSettings();
                }),
                OpenSettings    = () => Dispatcher.Invoke(OpenSettings),
                ResetToDefaults = () => Dispatcher.Invoke(ResetToDefaults),
                Quit            = () => Dispatcher.Invoke(() => Application.Current.Shutdown()),
            });
            _trayIcon = _trayMenu.Build(GetCurrentTrayState(), GetCurrentTrayState);

            this.MouseEnter += Window_MouseEnter;
            this.MouseLeave += Window_MouseLeave;
        };

        this.Closed += (_, _) =>
        {
            _trayIcon?.Dispose();
            _ghostMode.Dispose();
            _contrast.Dispose();
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
        DateText.FontSize   = (int)(s.FontSize * 0.80);

        _settings = s;  // cache for SaveSettings use

        if (!string.IsNullOrEmpty(s.LastActiveMonitor) &&
            s.MonitorPositions.TryGetValue(s.LastActiveMonitor, out var savedPos))
        {
            Left = savedPos.Left;
            Top  = savedPos.Top;
            _currentMonitorKey = s.LastActiveMonitor;
            _hasUserPosition = true;
        }
        // else: no saved position — ContentRendered will call PositionTopRight()

        _statsIntervalSeconds = s.StatsIntervalSeconds;
        _processCountThreshold = s.ProcessCountThresholdPercent;
        _batteryAlertThreshold = s.BatteryAlertThresholdPercent;

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
        BattRow.Visibility = s.BatteryVisible ? Visibility.Visible : Visibility.Collapsed;
        // Direct assignment (NOT via SetUptimeRowVisible — unsafe before Show(), same invariant as other rows).
        // UptimeText is inside StatsPanel; StatsPanel.Collapsed hides it automatically.
        UptimeText.Visibility = s.UptimeVisible ? Visibility.Visible : Visibility.Collapsed;

        // Apply clock type directly (NOT via SetClockType — unsafe before Show(), same invariant as StatsPanel).
        _lcdTheme       = s.LcdTheme;
        _lcdUse24Hr     = s.LcdUse24Hr;
        _lcdShowSeconds = s.LcdShowSeconds;

        _clockType = s.ClockType;
        // Collapse all display areas first
        PhraseText.Visibility       = Visibility.Collapsed;
        SplitPhrasePanel.Visibility = Visibility.Collapsed;
        DialCanvas.Visibility       = Visibility.Collapsed;
        LcdView.Visibility          = Visibility.Collapsed;

        if (s.ClockType == ClockType.Dial)
        {
            DialCanvas.Visibility = Visibility.Visible;
        }
        else if (s.ClockType == ClockType.Lcd)
        {
            LcdView.Theme       = s.LcdTheme;
            LcdView.Use24Hr     = s.LcdUse24Hr;
            LcdView.ShowSeconds = s.LcdShowSeconds;
            LcdView.Size        = FontSizeToLcdSize(s.FontSize);
            LcdView.Visibility  = Visibility.Visible;
            // Do NOT call UpdateTime() — LcdClockView.IsVisibleChanged handles the initial render
        }
        else // Phrase — visibility set later in text style block
        {
            // PhraseText/SplitPhrasePanel visibility is set by the text style block below in ApplySettings()
        }

        _showHourTicks   = s.ShowHourTicks;
        _showMinuteDots  = s.ShowMinuteDots;
        _showHourNumbers = s.ShowHourNumbers;
        // Decoration element visibility applied in InitDialDecorations() (ContentRendered).

        _windowOpacity = s.Opacity;
        this.Opacity   = s.Opacity;
        _ghostMode.IsEnabled = s.GhostModeEnabled;

        _autoLaunchEnabled = s.AutoLaunchEnabled;
        // Restore registry entry to match persisted setting.
        // Called before ContentRendered; exe path is stable at this point.
        if (_autoLaunchEnabled)
            AutoLaunchService.Enable(
                System.Diagnostics.Process.GetCurrentProcess().MainModule!.FileName);
        else
            AutoLaunchService.Disable();

        _contrast.IsEnabled = s.AutoContrastEnabled;
        // Sampler timer is wired in ContentRendered; here we just cache the setting.
        // Initialize() reads IsEnabled to decide whether to start the timer immediately.

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

        // Apply date display directly (safe before Show — no timer yet)
        _showDate   = s.ShowDate;
        _dateFormat = s.DateFormat;
        DateText.Visibility = s.ShowDate ? Visibility.Visible : Visibility.Collapsed;
        DateText.Text = DateFormatter.Format(s.DateFormat, DateTime.Now);
        _currentDateText = DateText.Text;

        // Apply text style directly (NOT via SetTextStyle — that calls UpdateLayout()+SaveSettings() unsafe before Show())
        _currentTextStyle   = s.TextStyle;
        _currentPhraseStyle  = s.PhraseStyle;
        _currentPhraseLocale = s.PhraseLocale;

        // LANG-01: detect Windows UI language; explicit manual override takes precedence over auto-detect
        string uiLang = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        string effectiveLocale;
        if (_currentPhraseLocale is "fr" or "es" or "de" or "ja" or "pl")
        {
            // User has explicitly chosen a non-English language
            effectiveLocale = _currentPhraseLocale;
        }
        else if (_currentPhraseLocale == "en")
        {
            // User has explicitly chosen English — respect PhraseStyle
            effectiveLocale = _currentPhraseStyle.ToLowerInvariant() switch
            {
                "terse"  => "en-terse",
                "poetic" => "en-poetic",
                "rude"   => "en-rude",
                _        => "en-classic",
            };
        }
        else
        {
            // "auto" — detect from Windows UI culture
            if (uiLang is "fr" or "es" or "de" or "ja" or "pl")
                effectiveLocale = uiLang;
            else
                effectiveLocale = _currentPhraseStyle.ToLowerInvariant() switch
                {
                    "terse"  => "en-terse",
                    "poetic" => "en-poetic",
                    "rude"   => "en-rude",
                    _        => "en-classic",
                };
        }
        PhraseEngine.SetLocale(effectiveLocale);
        // LANG-04: if SetLocale returned false (unsupported), en-classic remains active (default)
        bool isSerifStyle = s.TextStyle == "Literary";
        bool isMonoStyle  = s.TextStyle == "Mono";
        string styleFontName = isSerifStyle ? "Palatino Linotype" : isMonoStyle ? "Consolas" : "Segoe UI Light";
        var styleFamily = new System.Windows.Media.FontFamily(styleFontName);
        PhraseText.FontFamily    = styleFamily;
        QualifierText.FontFamily = styleFamily;
        EmphasisText.FontFamily  = styleFamily;
        DateText.FontFamily      = styleFamily;
        QualifierText.FontSize   = (int)(s.FontSize * 0.65);
        EmphasisText.FontSize    = (int)(s.FontSize * 1.40);

        // Layout visibility — accounts for ClockType (already applied above in this method)
        if (s.ClockType == ClockType.Phrase)
        {
            bool isSplitStyle = s.TextStyle == "Split";
            PhraseText.Visibility       = isSplitStyle ? Visibility.Collapsed : Visibility.Visible;
            SplitPhrasePanel.Visibility = isSplitStyle ? Visibility.Visible   : Visibility.Collapsed;
        }
        // If s.ClockType == Dial or Lcd: phrase/split panels are already Collapsed by the ClockType block above

        // Startup theme restore: set fields only — NEVER call ApplyTheme() here.
        // _hourTickElements etc. are empty until ContentRendered; ApplyTheme() would be a no-op or throw.
        // ContentRendered calls ApplyTheme() after InitDialDecorations().
        if (s.Theme is not null && BuiltInThemes.TryGet(s.Theme) is { } savedTheme)
        {
            _currentTheme    = s.Theme;
            _accentColor     = savedTheme.AccentColor;
            _windowOpacity   = savedTheme.Opacity;
            _currentFontSize = savedTheme.FontSize;
            _clockType       = savedTheme.ClockType;
            // StatsVisible already applied earlier from s.StatsVisible
            // (the theme's StatsVisible was persisted to s.StatsVisible at save time)
        }
    }

    private SettingsSnapshot GetCurrentSettingsSnapshot() => new SettingsSnapshot
    {
        AccentColor            = _accentColor,
        Opacity                = _windowOpacity,
        FontSize               = _currentFontSize,
        ClockType              = _clockType,
        LcdTheme               = _lcdTheme,
        LcdUse24Hr             = _lcdUse24Hr,
        LcdShowSeconds         = _lcdShowSeconds,
        PhraseStyle            = _currentPhraseStyle,
        PhraseLocale           = _currentPhraseLocale,
        StatsVisible           = StatsPanel.Visibility == Visibility.Visible,
        CpuVisible             = CpuRow.Visibility     == Visibility.Visible,
        GpuVisible             = GpuRow.Visibility     == Visibility.Visible,
        MemVisible             = MemRow.Visibility     == Visibility.Visible,
        PagVisible             = PagRow.Visibility     == Visibility.Visible,
        BatteryVisible         = BattRow.Visibility    == Visibility.Visible,
        UptimeVisible          = UptimeText.Visibility == Visibility.Visible,
        StatsIntervalSeconds   = _statsIntervalSeconds,
        ProcessCountThreshold  = _processCountThreshold,
        BatteryAlertThreshold  = _batteryAlertThreshold,
        ShowDate               = _showDate,
        DateFormat             = _dateFormat,
        GhostModeEnabled       = _ghostMode.IsEnabled,
        AutoContrastEnabled    = _contrast.IsEnabled,
        AutoLaunchEnabled      = _autoLaunchEnabled,
        ActiveTheme            = _currentTheme,
    };

    private void OpenSettings()
    {
        // Must be called on the WPF Dispatcher thread.
        // Tray callback wraps this in Dispatcher.Invoke before calling.
        if (_settingsWindow is { IsVisible: true })
        {
            _settingsWindow.Activate();
            return;
        }
        _settingsWindow = new SettingsWindow(GetCurrentSettingsSnapshot());
        _settingsWindow.Owner = this;
        _settingsWindow.AccentColorChanged    += c => { ClearActiveTheme(); SetAccentColor(c); };
        _settingsWindow.OpacityChanged        += o => { ClearActiveTheme(); SetOpacity(o); };
        _settingsWindow.FontSizeChanged       += sz => { ClearActiveTheme(); ApplyFontSize(sz); SaveSettings(); };
        _settingsWindow.ClockTypeChanged      += ct => { ClearActiveTheme(); SetClockType(ct); };
        _settingsWindow.PhraseStyleChanged    += ps => SetPhraseStyle(ps);
        _settingsWindow.LanguageChanged       += locale => SetLanguage(locale);
        _settingsWindow.StatsVisibleChanged   += v => { ClearActiveTheme(); SetStatsVisible(v); };
        _settingsWindow.CpuVisibleChanged     += v => SetStatRowVisible(CpuRow, v);
        _settingsWindow.GpuVisibleChanged     += v => SetStatRowVisible(GpuRow, v);
        _settingsWindow.MemVisibleChanged     += v => SetStatRowVisible(MemRow, v);
        _settingsWindow.PagVisibleChanged     += v => SetStatRowVisible(PagRow, v);
        _settingsWindow.BatteryVisibleChanged += v => SetStatRowVisible(BattRow, v);
        _settingsWindow.UptimeVisibleChanged  += v => SetUptimeRowVisible(v);
        _settingsWindow.StatsIntervalChanged  += s => SetStatsInterval(s);
        _settingsWindow.ProcessThresholdChanged += t => SetProcessThreshold(t);
        _settingsWindow.ShowDateChanged       += v => SetDateVisible(v);
        _settingsWindow.DateFormatChanged     += fmt => SetDateFormat(fmt);
        _settingsWindow.GhostModeChanged      += v => { _ghostMode.IsEnabled = v; SaveSettings(); };
        _settingsWindow.AutoContrastChanged   += v => { _contrast.SetEnabled(v); SaveSettings(); };
        _settingsWindow.AutoLaunchChanged     += v =>
        {
            _autoLaunchEnabled = v;
            string exePath = System.Diagnostics.Process.GetCurrentProcess().MainModule!.FileName;
            if (v) AutoLaunchService.Enable(exePath); else AutoLaunchService.Disable();
            SaveSettings();
        };
        _settingsWindow.BatteryAlertThresholdChanged += t => SetBatteryAlertThreshold(t);
        _settingsWindow.ThemeSelected += name =>
        {
            if (BuiltInThemes.TryGet(name) is { } theme)
            {
                ApplyNamedTheme(theme);
                _settingsWindow?.RefreshControls(GetCurrentSettingsSnapshot());
            }
        };
        _settingsWindow.Closed += (_, _) => _settingsWindow = null;
        _settingsWindow.Show();
    }

    private TrayMenuState GetCurrentTrayState() => new TrayMenuState
    {
        GhostModeEnabled    = _ghostMode.IsEnabled,
        StatsVisible        = StatsPanel.Visibility == Visibility.Visible,
        AutoContrastEnabled = _contrast.IsEnabled,
        AutoLaunchEnabled   = _autoLaunchEnabled,
        ClockType           = _clockType,
    };

    /// <summary>
    /// Saves current window position and font size to settings.json.
    /// Called after drag, on Closing, and on SessionEnding.
    /// </summary>
    internal void SaveSettings()
    {
        // Update current monitor key at save time
        _currentMonitorKey = MonitorService.GetCurrentMonitorKey(this);

        // Build updated MonitorPositions: preserve all existing entries, upsert current monitor
        var positions = new System.Collections.Generic.Dictionary<string, MonitorPosition>(
            _settings.MonitorPositions)
        {
            [_currentMonitorKey] = new MonitorPosition { Left = Left, Top = Top }
        };

        _settings = _settings with
        {
            FontSize             = _currentFontSize,
            StatsVisible         = (StatsPanel.Visibility == Visibility.Visible),
            StatsIntervalSeconds = _statsIntervalSeconds,
            CpuVisible           = (CpuRow.Visibility    == Visibility.Visible),
            GpuVisible           = (GpuRow.Visibility    == Visibility.Visible),
            MemVisible           = (MemRow.Visibility    == Visibility.Visible),
            PagVisible           = (PagRow.Visibility    == Visibility.Visible),
            BatteryVisible       = (BattRow.Visibility   == Visibility.Visible),
            UptimeVisible        = (UptimeText.Visibility == Visibility.Visible),
            ClockType            = _clockType,
            LcdTheme             = _lcdTheme,
            LcdUse24Hr           = _lcdUse24Hr,
            LcdShowSeconds       = _lcdShowSeconds,
            ShowHourTicks        = _showHourTicks,
            ShowMinuteDots       = _showMinuteDots,
            ShowHourNumbers      = _showHourNumbers,
            AccentColor          = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}",
            Opacity              = _windowOpacity,
            GhostModeEnabled     = _ghostMode.IsEnabled,
            AutoLaunchEnabled    = _autoLaunchEnabled,
            AutoContrastEnabled  = _contrast.IsEnabled,
            ProcessCountThresholdPercent = _processCountThreshold,
            BatteryAlertThresholdPercent = _batteryAlertThreshold,
            TextStyle            = _currentTextStyle,
            PhraseStyle          = _currentPhraseStyle,
            PhraseLocale         = _currentPhraseLocale,
            ShowDate             = _showDate,
            DateFormat           = _dateFormat,
            Theme                = _currentTheme,
            MonitorPositions     = positions,
            LastActiveMonitor    = _currentMonitorKey
        };
        SettingsService.Save(_settings);
    }

    /// <summary>
    /// Called by App.xaml.cs before Show() to set the initial phrase on both TextBlocks.
    /// No UpdateLayout() or PositionTopRight() needed here — ContentRendered handles both
    /// after Show() triggers the first layout pass.
    /// </summary>
    internal void SetInitialPhrase(DateTime dt)
    {
        string fullPhrase = PhraseEngine.GetPhrase(dt);
        PhraseText.Text = fullPhrase;

        var (qualifier, emphasis) = PhraseEngine.GetStructuredPhrase(dt);
        QualifierText.Text = qualifier;
        EmphasisText.Text  = emphasis;
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
        _isDragging = true;
        DragMove();
        _isDragging = false;
        // LocationChanged fires during DragMove — _hasUserPosition is already true here.

        // Cross-monitor drag: remove source monitor's saved position (per design decision)
        string prevKey = _currentMonitorKey;
        string newKey  = MonitorService.GetCurrentMonitorKey(this);
        if (!string.IsNullOrEmpty(prevKey) && prevKey != newKey)
        {
            var updatedPos = new System.Collections.Generic.Dictionary<string, MonitorPosition>(
                _settings.MonitorPositions);
            updatedPos.Remove(prevKey);
            _settings = _settings with { MonitorPositions = updatedPos };
        }

        if (statsTimerWasRunning) _statsTimer!.Start();
        SaveSettings();
    }

    private void UpdatePhraseIfChanged()
    {
        string newPhrase = PhraseEngine.GetPhrase(DateTime.Now);
        if (newPhrase == PhraseText.Text) return;  // No change — skip layout work

        PhraseText.Text = newPhrase;

        // Always update split TextBlocks (no cost if SplitPhrasePanel is Collapsed)
        var (qualifier, emphasis) = PhraseEngine.GetStructuredPhrase(DateTime.Now);
        QualifierText.Text = qualifier;
        EmphasisText.Text  = emphasis;

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
            var screen = System.Windows.Forms.Screen.FromPoint(
                new System.Drawing.Point((int)(Left + ActualWidth / 2), (int)(Top + ActualHeight / 2)));
            var clamped = SettingsService.Clamp(
                new MonitorPosition { Left = Left, Top = Top },
                ActualWidth, ActualHeight, screen);
            Left = clamped.Left;
            Top  = clamped.Top;
        }
    }

    private void UpdateDateDisplay()
    {
        if (DateText.Visibility != Visibility.Visible) return;
        var text = DateFormatter.Format(_dateFormat, DateTime.Now);
        if (text == _currentDateText) return;  // no change (same day)
        DateText.Text = text;
        _currentDateText = text;
    }

    private void SetDateVisible(bool visible)
    {
        _showDate = visible;
        DateText.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        SaveSettings();
    }

    private void SetDateFormat(string format)
    {
        _dateFormat = format;
        _currentDateText = "";   // force redraw even if date string unchanged (same day, format switch)
        UpdateDateDisplay();
        SaveSettings();
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

        if (_statsService.BatteryPercent < 0f)
        {
            BattText.Text = "N/A";
            BattBar.Width = 0;
        }
        else
        {
            string pluggedPrefix = _statsService.IsPluggedIn ? "⚡" : "";
            BattText.Text = $"{pluggedPrefix}{_statsService.BatteryPercent:F0}%";
            BattBar.Width = StatsBarTrackWidth * (_statsService.BatteryPercent / 100.0);
        }

        UpdateBatteryAlertState();
    }

    private void UpdateBatteryAlertState()
    {
        // No battery present (desktop/VM, sentinel = -1f) — never alert
        if (_statsService.BatteryPercent < 0f)
        {
            if (_batteryAlertActive)
            {
                _batteryAlertActive = false;
                BattBar.Background = new System.Windows.Media.SolidColorBrush(_accentColor);
            }
            return;
        }

        bool shouldAlert = !_statsService.IsPluggedIn
                        && _statsService.BatteryPercent <= _batteryAlertThreshold;

        // 1% dead-band on clear — prevents flicker when battery oscillates at threshold boundary
        bool shouldClear = _statsService.IsPluggedIn
                        || _statsService.BatteryPercent > (_batteryAlertThreshold + 1f);

        if (!_batteryAlertActive && shouldAlert)
        {
            _batteryAlertActive = true;
            BattBar.Background = new System.Windows.Media.SolidColorBrush(
                System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0x44, 0x44));  // #FFFF4444
        }
        else if (_batteryAlertActive && shouldClear)
        {
            _batteryAlertActive = false;
            BattBar.Background = new System.Windows.Media.SolidColorBrush(_accentColor);
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

        // Count processes with >= _processCountThreshold% CPU utilization by comparing TotalProcessorTime deltas.
        // First tick has no prior sample — yields 0 active processes until the next tick.
        var now = DateTime.UtcNow;
        var procs = System.Diagnostics.Process.GetProcesses();
        var newProcTimes = new Dictionary<int, TimeSpan>(procs.Length);
        int procCount = 0;
        double elapsedMs = _prevProcSample == DateTime.MinValue
            ? 0
            : (now - _prevProcSample).TotalMilliseconds;
        foreach (var p in procs)
        {
            try
            {
                var cpuTime = p.TotalProcessorTime;
                newProcTimes[p.Id] = cpuTime;
                if (elapsedMs > 0 && _prevProcTimes.TryGetValue(p.Id, out var prev))
                {
                    double pct = (cpuTime - prev).TotalMilliseconds
                                 / (elapsedMs * Environment.ProcessorCount) * 100.0;
                    if (pct >= _processCountThreshold) procCount++;
                }
            }
            catch { /* process exited or access denied — skip */ }
            finally { p.Dispose(); }
        }
        _prevProcTimes = newProcTimes;
        _prevProcSample = now;

        string newText = $"{uptimeStr}   {avg1m / 100f:F2}  {avg5m / 100f:F2}  {avg15m / 100f:F2}  {procCount}p";

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

    private static System.Windows.Forms.Screen FindScreenForKey(string key)
    {
        if (!string.IsNullOrEmpty(key))
        {
            var match = System.Windows.Forms.Screen.AllScreens
                .FirstOrDefault(s => MonitorService.GetKeyForScreen(s) == key);
            if (match != null) return match;
        }
        return System.Windows.Forms.Screen.PrimaryScreen
               ?? System.Windows.Forms.Screen.AllScreens[0];
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
                var screen = System.Windows.Forms.Screen.FromPoint(
                    new System.Drawing.Point((int)(Left + ActualWidth / 2), (int)(Top + ActualHeight / 2)));
                var clamped = SettingsService.Clamp(
                    new MonitorPosition { Left = Left, Top = Top },
                    ActualWidth, ActualHeight, screen);
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

    private void SetProcessThreshold(double threshold)
    {
        _processCountThreshold = threshold;
        SaveSettings();
        UpdateStatsDisplay();
    }

    private void SetBatteryAlertThreshold(int threshold)
    {
        _batteryAlertThreshold = threshold;
        SaveSettings();
        if (_statsService.IsReady)
            UpdateBatteryAlertState();
    }

    private void Window_MouseEnter(object sender, MouseEventArgs e)
    {
        if (_ghostMode.IsCtrlAltHeld() || !_ghostMode.IsEnabled)
        {
            // Normal hover path (CTRLALT-01/02): show backdrop + activate fast-refresh.
            // WS_EX_TRANSPARENT is NOT applied — window stays fully interactive (drag, right-click, scroll).
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

        // Step 2 & 3: Start polling timer and apply WS_EX_TRANSPARENT via controller.
        _ghostMode.Activate();
        this.Opacity = 0.0;
    }

    private void Window_MouseLeave(object sender, MouseEventArgs e)
    {
        // Ghost mode guard: if ghost is active, restore is handled by GhostModeController's polling timer.
        // The hover-restore path below must NOT run during ghost state.
        if (_ghostMode.IsActive) return;

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

        // Auto-collapse: if all FIVE rows are now hidden and the stats panel is still visible,
        // collapse the entire panel. One-way trigger — re-showing a row does NOT auto-show the panel.
        if (!visible
            && CpuRow.Visibility == Visibility.Collapsed
            && GpuRow.Visibility == Visibility.Collapsed
            && MemRow.Visibility == Visibility.Collapsed
            && PagRow.Visibility == Visibility.Collapsed
            && BattRow.Visibility == Visibility.Collapsed
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
                var screen = System.Windows.Forms.Screen.FromPoint(
                    new System.Drawing.Point((int)(Left + ActualWidth / 2), (int)(Top + ActualHeight / 2)));
                var clamped = SettingsService.Clamp(
                    new MonitorPosition { Left = Left, Top = Top },
                    ActualWidth, ActualHeight, screen);
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
            var screen = System.Windows.Forms.Screen.FromPoint(
                new System.Drawing.Point((int)(Left + ActualWidth / 2), (int)(Top + ActualHeight / 2)));
            var clamped = SettingsService.Clamp(
                new MonitorPosition { Left = Left, Top = Top },
                ActualWidth, ActualHeight, screen);
            Left = clamped.Left;
            Top  = clamped.Top;
        }

        SaveSettings();
    }

    private void ApplyFontSize(int size)
    {
        _currentFontSize    = size;
        PhraseText.FontSize = size;
        QualifierText.FontSize = (int)(size * 0.65);
        EmphasisText.FontSize  = (int)(size * 1.40);
        DateText.FontSize      = (int)(size * 0.80);
        // Re-clamp: font size change resizes window (SizeToContent=WidthAndHeight).
        // Must call UpdateLayout() before Clamp() — ActualWidth/ActualHeight are stale until layout runs.
        UpdateLayout();
        if (_hasUserPosition)
        {
            var screen = System.Windows.Forms.Screen.FromPoint(
                new System.Drawing.Point((int)(Left + ActualWidth / 2), (int)(Top + ActualHeight / 2)));
            var clamped = SettingsService.Clamp(
                new MonitorPosition { Left = Left, Top = Top },
                ActualWidth, ActualHeight, screen);
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

    private void ResetToDefaults()
    {
        // Reset accent color to White (same as PresetWhite constant = #FFFFFFFF)
        SetAccentColor(PresetWhite);

        // Reset opacity to 100%
        SetOpacity(1.0);

        // Reset font size to small (16pt)
        ApplyFontSize(16);

        // Reset to phrase (text) mode — disable dial/lcd if active
        if (_clockType != ClockType.Phrase) SetClockType(ClockType.Phrase);

        // Reset LCD settings to defaults
        _lcdTheme       = LcdTheme.Green;
        _lcdUse24Hr     = false;
        _lcdShowSeconds = true;

        // Center on primary screen
        // ActualWidth/ActualHeight are valid at runtime (ContentRendered has already fired)
        Left = (SystemParameters.PrimaryScreenWidth  - ActualWidth)  / 2;
        Top  = (SystemParameters.PrimaryScreenHeight - ActualHeight) / 2;
        _hasUserPosition = true;   // treat centered position as user-set to prevent phrase-change snap
        _currentMonitorKey = MonitorService.GetPrimaryMonitorKey();
        // Clear all saved positions so reset gives a clean slate
        _settings = _settings with { MonitorPositions = new System.Collections.Generic.Dictionary<string, MonitorPosition>() };

        // Re-enable ghost mode
        _ghostMode.IsEnabled = true;

        // Reset auto-launch: disable on reset
        _autoLaunchEnabled = false;
        AutoLaunchService.Disable();

        // Reset auto-contrast: disable on reset (SetEnabled fires Cleared → ApplyTheme)
        _contrast.SetEnabled(false);

        // Reset process count threshold to default (5%)
        SetProcessThreshold(5.0);

        // Reset text style to Classic
        SetTextStyle("Classic");

        // Reset date display: show in Short format
        _showDate   = true;
        _dateFormat = "Short";
        DateText.Visibility = Visibility.Visible;
        UpdateDateDisplay();

        // Reset named theme: clear active theme so no card is highlighted after reset
        _currentTheme = null;
        _settingsWindow?.ClearActiveThemeCard();

        // Save the reset state immediately (SetAccentColor and SetOpacity each call SaveSettings(),
        // but we need to save the new position too — call once more with final state)
        SaveSettings();
    }

    private void ApplyNamedTheme(ThemeDefinition theme)
    {
        // Set _currentTheme BEFORE calling individual setters,
        // so each intermediate SaveSettings() call persists the correct theme name.
        _currentTheme = theme.Name;

        // Apply all theme properties using existing setters.
        // SetAccentColor, SetOpacity, SetClockType call SaveSettings() internally.
        // ApplyFontSize and SetStatsVisible do NOT — the final SaveSettings() below covers them.
        SetAccentColor(theme.AccentColor);
        SetOpacity(theme.Opacity);
        ApplyFontSize(theme.FontSize);
        SetClockType(theme.ClockType);
        SetStatsVisible(theme.StatsVisible);

        // Final save to persist Theme field and any unsaved property changes.
        SaveSettings();
    }

    private void ClearActiveTheme()
    {
        _currentTheme = null;
        // Use null-conditional — window may be closed when a covered property changes
        // (e.g., opacity scroll wheel while Settings window is not open).
        _settingsWindow?.ClearActiveThemeCard();
        // SaveSettings() will be called by the individual setter that triggered this — no call here.
    }


    private void SetClockType(ClockType clockType)
    {
        _clockType = clockType;

        // Collapse all display areas first
        PhraseText.Visibility       = Visibility.Collapsed;
        SplitPhrasePanel.Visibility = Visibility.Collapsed;
        DialCanvas.Visibility       = Visibility.Collapsed;
        LcdView.Visibility          = Visibility.Collapsed;

        switch (clockType)
        {
            case ClockType.Dial:
                DialCanvas.Visibility = Visibility.Visible;
                UpdateDialDisplay();
                break;
            case ClockType.Lcd:
                LcdView.Theme       = _lcdTheme;
                LcdView.Use24Hr     = _lcdUse24Hr;
                LcdView.ShowSeconds = _lcdShowSeconds;
                LcdView.Size        = FontSizeToLcdSize(_currentFontSize);
                LcdView.Visibility  = Visibility.Visible;
                // Do NOT call UpdateTime() — IsVisibleChanged fires automatically
                break;
            default: // Phrase
                bool isSplit = _currentTextStyle == "Split";
                PhraseText.Visibility       = isSplit ? Visibility.Collapsed : Visibility.Visible;
                SplitPhrasePanel.Visibility = isSplit ? Visibility.Visible   : Visibility.Collapsed;
                break;
        }

        SaveSettings();
    }

    private static LcdSize FontSizeToLcdSize(int fontSize) => fontSize switch
    {
        16 => LcdSize.Small,
        24 => LcdSize.Medium,
        32 => LcdSize.Large,
        _  => LcdSize.Large,  // 40pt caps at Large (64px); no XLarge enum value
    };

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

    private void SetPhraseStyle(string style)
    {
        // LANG-01 guard: do not override a non-English locale with an English phrase style
        if (!PhraseEngine.CurrentLocale.StartsWith("en-", StringComparison.Ordinal))
            return;

        _currentPhraseStyle = style;
        string localeKey = style.ToLowerInvariant() switch
        {
            "terse"  => "en-terse",
            "poetic" => "en-poetic",
            "rude"   => "en-rude",
            _        => "en-classic",
        };
        PhraseEngine.SetLocale(localeKey);
        PhraseText.Text = "";          // invalidate UpdatePhraseIfChanged guard cache
        UpdatePhraseIfChanged();
        SaveSettings();
    }

    private void SetLanguage(string locale)
    {
        _currentPhraseLocale = locale;

        string uiLang = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        string effectiveLocale;
        if (locale is "fr" or "es" or "de" or "ja" or "pl")
            effectiveLocale = locale;
        else if (locale == "en")
            effectiveLocale = _currentPhraseStyle.ToLowerInvariant() switch
            {
                "terse"  => "en-terse",
                "poetic" => "en-poetic",
                "rude"   => "en-rude",
                _        => "en-classic",
            };
        else  // "auto"
            effectiveLocale = (uiLang is "fr" or "es" or "de" or "ja" or "pl")
                ? uiLang
                : _currentPhraseStyle.ToLowerInvariant() switch
                  {
                      "terse"  => "en-terse",
                      "poetic" => "en-poetic",
                      "rude"   => "en-rude",
                      _        => "en-classic",
                  };

        PhraseEngine.SetLocale(effectiveLocale);
        PhraseText.Text = "";
        UpdatePhraseIfChanged();
        SaveSettings();
    }

    private void SetTextStyle(string style)
    {
        _currentTextStyle = style;

        // Font family: Palatino Linotype for Literary, Consolas for Mono, Segoe UI Light for Classic/Split
        bool isSerif = style == "Literary";
        bool isMono  = style == "Mono";
        string fontName = isSerif ? "Palatino Linotype" : isMono ? "Consolas" : "Segoe UI Light";
        var family = new System.Windows.Media.FontFamily(fontName);
        PhraseText.FontFamily    = family;
        QualifierText.FontFamily = family;
        EmphasisText.FontFamily  = family;
        DateText.FontFamily      = family;

        // Apply current font sizes to split TextBlocks
        QualifierText.FontSize = (int)(_currentFontSize * 0.65);
        EmphasisText.FontSize  = (int)(_currentFontSize * 1.40);

        // Layout visibility: split modes show SplitPhrasePanel; inline modes show PhraseText
        // (no changes when dial mode is active — dial hides all phrase elements)
        if (_clockType != ClockType.Dial)
        {
            bool isSplit = style == "Split";
            PhraseText.Visibility       = isSplit ? Visibility.Collapsed : Visibility.Visible;
            SplitPhrasePanel.Visibility = isSplit ? Visibility.Visible   : Visibility.Collapsed;
        }

        UpdateLayout();
        if (_hasUserPosition)
        {
            var screen = System.Windows.Forms.Screen.FromPoint(
                new System.Drawing.Point((int)(Left + ActualWidth / 2), (int)(Top + ActualHeight / 2)));
            var clamped = SettingsService.Clamp(
                new MonitorPosition { Left = Left, Top = Top },
                ActualWidth, ActualHeight, screen);
            Left = clamped.Left;
            Top  = clamped.Top;
        }
        SaveSettings();
    }


    private void Window_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
    {
        // e.Delta > 0: scroll up = increase opacity; e.Delta < 0: scroll down = decrease opacity
        // Math.Sign: exactly one 10% step per physical notch regardless of high-resolution wheel
        double step = Math.Sign(e.Delta) * 0.10;
        _windowOpacity = Math.Clamp(_windowOpacity + step, 0.10, 1.0);
        this.Opacity = _windowOpacity;
        ClearActiveTheme();
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
        // Full-opacity brush for EmphasisText and all other elements
        var brush = new System.Windows.Media.SolidColorBrush(_accentColor);

        // Dimmed brush for QualifierText (55% alpha of accent color)
        var qualifierColor = System.Windows.Media.Color.FromArgb(
            0x8C, _accentColor.R, _accentColor.G, _accentColor.B);
        var qualifierBrush = new System.Windows.Media.SolidColorBrush(qualifierColor);

        // Phrase mode
        PhraseText.Foreground    = brush;
        QualifierText.Foreground = qualifierBrush;
        EmphasisText.Foreground  = brush;

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
        if (!_batteryAlertActive)
            BattBar.Background = brush;

        // Stats row labels (CPU/GPU/MEM/PAG/BATT — named so auto-contrast can update them)
        CpuLabel.Foreground = brush;
        GpuLabel.Foreground = brush;
        MemLabel.Foreground = brush;
        PagLabel.Foreground = brush;
        BattLabel.Foreground = brush;

        // Stats percentage text (accent color)
        CpuText.Foreground = brush;
        GpuText.Foreground = brush;
        MemText.Foreground = brush;
        PagText.Foreground = brush;
        BattText.Foreground = brush;

        // Uptime row text (accent color)
        UptimeText.Foreground = brush;

        // Date text (dimmed accent — 55% alpha, same treatment as QualifierText)
        var dateBrush = new System.Windows.Media.SolidColorBrush(
            System.Windows.Media.Color.FromArgb(0x8C, _accentColor.R, _accentColor.G, _accentColor.B));
        DateText.Foreground = dateBrush;

        // Deliberately excluded: CpuBarTrack/GpuBarTrack/MemBarTrack/PagBarTrack/BattBarTrack,
        // ContentBorder.Background
    }

    private void ApplyDisplayColor(RgbColor rgb)
    {
        var color = System.Windows.Media.Color.FromRgb(rgb.R, rgb.G, rgb.B);
        var brush = new System.Windows.Media.SolidColorBrush(color);

        PhraseText.Foreground = brush;

        // Qualifier: same hue/saturation as display override, but dimmed to 55% alpha
        var qualifierDisplayColor = System.Windows.Media.Color.FromArgb(
            0x8C, rgb.R, rgb.G, rgb.B);
        QualifierText.Foreground = new System.Windows.Media.SolidColorBrush(qualifierDisplayColor);
        EmphasisText.Foreground  = brush;

        HourHand.Stroke       = brush;
        MinuteHand.Stroke     = brush;
        foreach (var el in _hourTickElements)   el.Stroke     = brush;
        foreach (var el in _minuteDotElements)  el.Fill       = brush;
        foreach (var el in _hourNumberElements) el.Foreground = brush;
        CpuBar.Background  = brush; GpuBar.Background  = brush;
        MemBar.Background  = brush; PagBar.Background  = brush;
        if (!_batteryAlertActive)
            BattBar.Background = brush;
        CpuLabel.Foreground = brush; GpuLabel.Foreground = brush;
        MemLabel.Foreground = brush; PagLabel.Foreground = brush; BattLabel.Foreground = brush;
        CpuText.Foreground = brush; GpuText.Foreground = brush;
        MemText.Foreground = brush; PagText.Foreground = brush; BattText.Foreground = brush;
        UptimeText.Foreground = brush;

        // Date text (dimmed display override — 55% alpha)
        var dateDisplayColor = System.Windows.Media.Color.FromArgb(0x8C, rgb.R, rgb.G, rgb.B);
        DateText.Foreground = new System.Windows.Media.SolidColorBrush(dateDisplayColor);
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
        if (_clockType != ClockType.Dial) return;

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
