namespace FuzzyClock.App;

/// <summary>
/// Snapshot of current application state needed to sync tray menu checkmarks.
/// Passed to TrayMenuBuilder.Build() for initial state and supplied via Func on every Opening.
/// </summary>
internal sealed record TrayMenuState
{
    public bool   GhostModeEnabled    { get; init; }
    public bool   AutoLaunchEnabled   { get; init; }
    public bool   AutoContrastEnabled { get; init; }
    public int    FontSize            { get; init; }
    public bool   StatsVisible        { get; init; }
    public bool   CpuVisible          { get; init; }
    public bool   GpuVisible          { get; init; }
    public bool   MemVisible          { get; init; }
    public bool   PagVisible          { get; init; }
    public bool   UptimeVisible       { get; init; }
    public int    StatsIntervalSeconds { get; init; }
    public double ProcessCountThreshold { get; init; }
    public bool   DialMode            { get; init; }
    public bool   ShowHourTicks       { get; init; }
    public bool   ShowMinuteDots      { get; init; }
    public bool   ShowHourNumbers     { get; init; }
    public double WindowOpacity       { get; init; }
    public System.Windows.Media.Color AccentColor { get; init; }
    public string TextStyle  { get; init; } = "Classic";
    public bool   ShowDate   { get; init; }
    public string DateFormat { get; init; } = "Short";
}

/// <summary>
/// WPF-thread callbacks invoked by tray menu click handlers (which fire on the WinForms thread).
/// Each Action must wrap WPF-touching code in Dispatcher.Invoke — callers are responsible for this.
/// </summary>
internal sealed class TrayMenuCallbacks
{
    public required Action         ToggleGhostMode      { get; init; }
    public required Action         ToggleAutoLaunch     { get; init; }
    public required Action         ToggleAutoContrast   { get; init; }
    public required Action<int>    ApplyFontSize        { get; init; }
    public required Action         ToggleStatsVisible   { get; init; }
    public required Action         ToggleCpuVisible     { get; init; }
    public required Action         ToggleGpuVisible     { get; init; }
    public required Action         ToggleMemVisible     { get; init; }
    public required Action         TogglePagVisible     { get; init; }
    public required Action         ToggleUptimeVisible  { get; init; }
    public required Action<int>    SetStatsInterval     { get; init; }
    public required Action<double> SetProcessThreshold  { get; init; }
    public required Action         ToggleDialMode       { get; init; }
    public required Action         ToggleShowHourTicks  { get; init; }
    public required Action         ToggleShowMinuteDots { get; init; }
    public required Action         ToggleShowHourNumbers { get; init; }
    public required Action<System.Windows.Media.Color> SetAccentColor { get; init; }
    public required Action         OpenCustomColorDialog { get; init; }
    public required Action<double> SetOpacity           { get; init; }
    public required Action<string> SetTextStyle         { get; init; }
    public required Action         ResetToDefaults      { get; init; }
    public required Action         Quit                 { get; init; }
}

/// <summary>
/// Builds the system tray NotifyIcon and ContextMenuStrip.
/// Owns all 38 ToolStripMenuItem references; syncs their checkmarks via SyncCheckmarks on Opening.
/// </summary>
internal sealed class TrayMenuBuilder
{
    private readonly TrayMenuCallbacks _cb;

    // Items requiring programmatic updates (checkmarks or visibility)
    private System.Windows.Forms.ToolStripMenuItem  _ghostModeItem   = null!;
    private System.Windows.Forms.ToolStripMenuItem  _autoLaunchItem  = null!;
    private System.Windows.Forms.ToolStripMenuItem  _autoContrastItem = null!;
    private System.Windows.Forms.ToolStripMenuItem  _fontSmall       = null!;
    private System.Windows.Forms.ToolStripMenuItem  _fontMedium      = null!;
    private System.Windows.Forms.ToolStripMenuItem  _fontLarge       = null!;
    private System.Windows.Forms.ToolStripMenuItem  _fontSizeItem    = null!;
    private System.Windows.Forms.ToolStripSeparator _fontSizeSep     = null!;
    private System.Windows.Forms.ToolStripMenuItem  _showStats       = null!;
    private System.Windows.Forms.ToolStripMenuItem  _cpuVisible      = null!;
    private System.Windows.Forms.ToolStripMenuItem  _gpuVisible      = null!;
    private System.Windows.Forms.ToolStripMenuItem  _memVisible      = null!;
    private System.Windows.Forms.ToolStripMenuItem  _pagVisible      = null!;
    private System.Windows.Forms.ToolStripMenuItem  _uptimeVisible   = null!;
    private System.Windows.Forms.ToolStripMenuItem  _interval1       = null!;
    private System.Windows.Forms.ToolStripMenuItem  _interval3       = null!;
    private System.Windows.Forms.ToolStripMenuItem  _interval10      = null!;
    private System.Windows.Forms.ToolStripMenuItem  _thresh2         = null!;
    private System.Windows.Forms.ToolStripMenuItem  _thresh5         = null!;
    private System.Windows.Forms.ToolStripMenuItem  _thresh10        = null!;
    private System.Windows.Forms.ToolStripMenuItem  _dialMode        = null!;
    private System.Windows.Forms.ToolStripMenuItem  _dialFaceItem    = null!;
    private System.Windows.Forms.ToolStripMenuItem  _showHourTicks   = null!;
    private System.Windows.Forms.ToolStripMenuItem  _showMinuteDots  = null!;
    private System.Windows.Forms.ToolStripMenuItem  _showHourNumbers = null!;
    private System.Windows.Forms.ToolStripMenuItem  _themeWhite      = null!;
    private System.Windows.Forms.ToolStripMenuItem  _themeAmber      = null!;
    private System.Windows.Forms.ToolStripMenuItem  _themeIce        = null!;
    private System.Windows.Forms.ToolStripMenuItem  _themeGreen      = null!;
    private System.Windows.Forms.ToolStripMenuItem  _themePink       = null!;
    private System.Windows.Forms.ToolStripMenuItem  _styleClassic    = null!;
    private System.Windows.Forms.ToolStripMenuItem  _styleSplit      = null!;
    private System.Windows.Forms.ToolStripMenuItem  _styleLiterary   = null!;
    private System.Windows.Forms.ToolStripMenuItem  _styleMono = null!;
    private System.Windows.Forms.ToolStripMenuItem  _opacity25       = null!;
    private System.Windows.Forms.ToolStripMenuItem  _opacity50       = null!;
    private System.Windows.Forms.ToolStripMenuItem  _opacity75       = null!;
    private System.Windows.Forms.ToolStripMenuItem  _opacity100      = null!;

    public TrayMenuBuilder(TrayMenuCallbacks callbacks) => _cb = callbacks;

    /// <summary>
    /// Constructs the NotifyIcon with all menu items wired to callbacks.
    /// Registers an Opening handler that calls SyncCheckmarks via getState on every menu open.
    /// </summary>
    public System.Windows.Forms.NotifyIcon Build(TrayMenuState initialState, Func<TrayMenuState> getState)
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
        menu.Opening += (_, _) => SyncCheckmarks(getState());

        // Ghost Mode
        _ghostModeItem = new System.Windows.Forms.ToolStripMenuItem("Ghost Mode")
            { Checked = initialState.GhostModeEnabled };
        _ghostModeItem.Click += (_, _) => _cb.ToggleGhostMode();
        menu.Items.Add(_ghostModeItem);
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());

        // Auto-Launch at Login
        _autoLaunchItem = new System.Windows.Forms.ToolStripMenuItem("Auto-Launch at Login")
            { Checked = initialState.AutoLaunchEnabled };
        _autoLaunchItem.Click += (_, _) => _cb.ToggleAutoLaunch();
        menu.Items.Add(_autoLaunchItem);

        // Auto-Contrast toggle
        _autoContrastItem = new System.Windows.Forms.ToolStripMenuItem("Auto-Contrast")
            { Checked = initialState.AutoContrastEnabled };
        _autoContrastItem.Click += (_, _) => _cb.ToggleAutoContrast();
        menu.Items.Add(_autoContrastItem);
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());

        // Font Size submenu
        _fontSmall  = new System.Windows.Forms.ToolStripMenuItem("Small (16pt)");
        _fontMedium = new System.Windows.Forms.ToolStripMenuItem("Medium (24pt)");
        _fontLarge  = new System.Windows.Forms.ToolStripMenuItem("Large (32pt)");
        _fontSmall.Click  += (_, _) => _cb.ApplyFontSize(16);
        _fontMedium.Click += (_, _) => _cb.ApplyFontSize(24);
        _fontLarge.Click  += (_, _) => _cb.ApplyFontSize(32);
        _fontSizeItem = new System.Windows.Forms.ToolStripMenuItem("Font Size", null,
            _fontSmall, _fontMedium, _fontLarge);
        _fontSizeSep = new System.Windows.Forms.ToolStripSeparator();
        _fontSizeItem.Visible = !initialState.DialMode;
        _fontSizeSep.Visible  = !initialState.DialMode;
        menu.Items.Add(_fontSizeItem);
        menu.Items.Add(_fontSizeSep);

        // Stats submenu
        _showStats     = new System.Windows.Forms.ToolStripMenuItem("Show Stats");
        _cpuVisible    = new System.Windows.Forms.ToolStripMenuItem("Show CPU");
        _gpuVisible    = new System.Windows.Forms.ToolStripMenuItem("Show GPU");
        _memVisible    = new System.Windows.Forms.ToolStripMenuItem("Show MEM");
        _pagVisible    = new System.Windows.Forms.ToolStripMenuItem("Show PAG");
        _uptimeVisible = new System.Windows.Forms.ToolStripMenuItem("Show Uptime");
        _interval1     = new System.Windows.Forms.ToolStripMenuItem("1 second");
        _interval3     = new System.Windows.Forms.ToolStripMenuItem("3 seconds");
        _interval10    = new System.Windows.Forms.ToolStripMenuItem("10 seconds");
        _showStats.Click     += (_, _) => _cb.ToggleStatsVisible();
        _cpuVisible.Click    += (_, _) => _cb.ToggleCpuVisible();
        _gpuVisible.Click    += (_, _) => _cb.ToggleGpuVisible();
        _memVisible.Click    += (_, _) => _cb.ToggleMemVisible();
        _pagVisible.Click    += (_, _) => _cb.TogglePagVisible();
        _uptimeVisible.Click += (_, _) => _cb.ToggleUptimeVisible();
        _interval1.Click  += (_, _) => _cb.SetStatsInterval(1);
        _interval3.Click  += (_, _) => _cb.SetStatsInterval(3);
        _interval10.Click += (_, _) => _cb.SetStatsInterval(10);
        var intervalItem = new System.Windows.Forms.ToolStripMenuItem("Update Interval", null,
            _interval1, _interval3, _interval10);
        _thresh2  = new System.Windows.Forms.ToolStripMenuItem("Process Threshold: 2%");
        _thresh5  = new System.Windows.Forms.ToolStripMenuItem("Process Threshold: 5%");
        _thresh10 = new System.Windows.Forms.ToolStripMenuItem("Process Threshold: 10%");
        _thresh2.Click  += (_, _) => _cb.SetProcessThreshold(2.0);
        _thresh5.Click  += (_, _) => _cb.SetProcessThreshold(5.0);
        _thresh10.Click += (_, _) => _cb.SetProcessThreshold(10.0);
        var threshItem = new System.Windows.Forms.ToolStripMenuItem("Process Threshold", null,
            _thresh2, _thresh5, _thresh10);
        var statsItem = new System.Windows.Forms.ToolStripMenuItem("Stats", null,
            _showStats,
            new System.Windows.Forms.ToolStripSeparator(),
            _cpuVisible, _gpuVisible, _memVisible, _pagVisible, _uptimeVisible,
            intervalItem,
            threshItem);
        menu.Items.Add(statsItem);
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());

        // Dial Mode + Dial Face submenu
        _dialMode = new System.Windows.Forms.ToolStripMenuItem("Dial Mode");
        _dialMode.Click += (_, _) => _cb.ToggleDialMode();
        menu.Items.Add(_dialMode);

        _showHourTicks   = new System.Windows.Forms.ToolStripMenuItem("Show Hour Ticks");
        _showMinuteDots  = new System.Windows.Forms.ToolStripMenuItem("Show Minute Marks");
        _showHourNumbers = new System.Windows.Forms.ToolStripMenuItem("Show Hour Numbers");
        _showHourTicks.Click   += (_, _) => _cb.ToggleShowHourTicks();
        _showMinuteDots.Click  += (_, _) => _cb.ToggleShowMinuteDots();
        _showHourNumbers.Click += (_, _) => _cb.ToggleShowHourNumbers();
        _dialFaceItem = new System.Windows.Forms.ToolStripMenuItem("Dial Face", null,
            _showHourTicks, _showMinuteDots, _showHourNumbers);
        _dialFaceItem.Visible = initialState.DialMode;
        menu.Items.Add(_dialFaceItem);
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());

        // Theme submenu
        _themeWhite = new System.Windows.Forms.ToolStripMenuItem("White");
        _themeAmber = new System.Windows.Forms.ToolStripMenuItem("Amber");
        _themeIce   = new System.Windows.Forms.ToolStripMenuItem("Ice Blue");
        _themeGreen = new System.Windows.Forms.ToolStripMenuItem("Green");
        _themePink  = new System.Windows.Forms.ToolStripMenuItem("Hello Kitty Pink");
        var themeCustom = new System.Windows.Forms.ToolStripMenuItem("Custom...");
        _themeWhite.Click += (_, _) => _cb.SetAccentColor(MainWindow.PresetWhite);
        _themeAmber.Click += (_, _) => _cb.SetAccentColor(MainWindow.PresetAmber);
        _themeIce.Click   += (_, _) => _cb.SetAccentColor(MainWindow.PresetIce);
        _themeGreen.Click += (_, _) => _cb.SetAccentColor(MainWindow.PresetGreen);
        _themePink.Click  += (_, _) => _cb.SetAccentColor(MainWindow.PresetPink);
        themeCustom.Click += (_, _) => _cb.OpenCustomColorDialog();
        var themeItem = new System.Windows.Forms.ToolStripMenuItem("Theme", null,
            _themeWhite, _themeAmber, _themeIce, _themeGreen, _themePink,
            new System.Windows.Forms.ToolStripSeparator(),
            themeCustom);
        menu.Items.Add(themeItem);

        // Text Style submenu
        _styleClassic    = new System.Windows.Forms.ToolStripMenuItem("Classic");
        _styleSplit      = new System.Windows.Forms.ToolStripMenuItem("Split");
        _styleLiterary   = new System.Windows.Forms.ToolStripMenuItem("Literary");
        _styleMono = new System.Windows.Forms.ToolStripMenuItem("Mono");
        _styleClassic.Click    += (_, _) => _cb.SetTextStyle("Classic");
        _styleSplit.Click      += (_, _) => _cb.SetTextStyle("Split");
        _styleLiterary.Click   += (_, _) => _cb.SetTextStyle("Literary");
        _styleMono.Click += (_, _) => _cb.SetTextStyle("Mono");
        var textStyleItem = new System.Windows.Forms.ToolStripMenuItem("Text Style", null,
            _styleClassic, _styleSplit, _styleLiterary, _styleMono);
        menu.Items.Add(textStyleItem);

        // Opacity submenu
        _opacity25  = new System.Windows.Forms.ToolStripMenuItem("25%");
        _opacity50  = new System.Windows.Forms.ToolStripMenuItem("50%");
        _opacity75  = new System.Windows.Forms.ToolStripMenuItem("75%");
        _opacity100 = new System.Windows.Forms.ToolStripMenuItem("100%");
        _opacity25.Click  += (_, _) => _cb.SetOpacity(0.25);
        _opacity50.Click  += (_, _) => _cb.SetOpacity(0.50);
        _opacity75.Click  += (_, _) => _cb.SetOpacity(0.75);
        _opacity100.Click += (_, _) => _cb.SetOpacity(1.00);
        var opacityItem = new System.Windows.Forms.ToolStripMenuItem("Opacity", null,
            _opacity25, _opacity50, _opacity75, _opacity100);
        menu.Items.Add(opacityItem);

        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());

        var resetItem = new System.Windows.Forms.ToolStripMenuItem("Reset to Defaults");
        var quitItem  = new System.Windows.Forms.ToolStripMenuItem("Quit");
        resetItem.Click += (_, _) => _cb.ResetToDefaults();
        quitItem.Click  += (_, _) => _cb.Quit();
        menu.Items.Add(resetItem);

        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());

        var aboutItem = new System.Windows.Forms.ToolStripMenuItem("About");
        aboutItem.Click += (_, _) => System.Windows.Application.Current.Dispatcher.Invoke(() =>
        {
            var ver = typeof(TrayMenuBuilder).Assembly.GetName().Version;
            var versionStr = ver is null ? "2.5" : $"{ver.Major}.{ver.Minor}";
            System.Windows.MessageBox.Show(
                $"FuzzyClock v{versionStr}\n\nA fuzzy time & system stats desktop overlay.\n\nBuilt as a Claude + GSD experiment\nby Alex Tabisz.",
                "About FuzzyClock",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Information);
        });
        menu.Items.Add(aboutItem);
        menu.Items.Add(quitItem);

        return new System.Windows.Forms.NotifyIcon
        {
            Icon             = icon,
            Text             = "FuzzyClock",
            ContextMenuStrip = menu,
            Visible          = true
        };
    }

    /// <summary>
    /// Updates Dial Face / Font Size submenu visibility when dial mode changes.
    /// Called from MainWindow.SetDialMode.
    /// </summary>
    public void UpdateDialModeVisibility(bool dialMode)
    {
        _dialFaceItem.Visible = dialMode;
        _fontSizeItem.Visible = !dialMode;
        _fontSizeSep.Visible  = !dialMode;
    }

    /// <summary>
    /// Syncs all checkmarks and checked states from the supplied snapshot.
    /// Called on every ContextMenuStrip.Opening event.
    /// </summary>
    private void SyncCheckmarks(TrayMenuState s)
    {
        _ghostModeItem.Checked    = s.GhostModeEnabled;
        _autoLaunchItem.Checked   = s.AutoLaunchEnabled;
        _autoContrastItem.Checked = s.AutoContrastEnabled;

        _fontSmall.Checked  = (s.FontSize == 16);
        _fontMedium.Checked = (s.FontSize == 24);
        _fontLarge.Checked  = (s.FontSize == 32);

        _showStats.Checked     = s.StatsVisible;
        _cpuVisible.Checked    = s.CpuVisible;
        _gpuVisible.Checked    = s.GpuVisible;
        _memVisible.Checked    = s.MemVisible;
        _pagVisible.Checked    = s.PagVisible;
        _uptimeVisible.Checked = s.UptimeVisible;
        _interval1.Checked  = (s.StatsIntervalSeconds == 1);
        _interval3.Checked  = (s.StatsIntervalSeconds == 3);
        _interval10.Checked = (s.StatsIntervalSeconds == 10);
        _thresh2.Checked  = (s.ProcessCountThreshold == 2.0);
        _thresh5.Checked  = (s.ProcessCountThreshold == 5.0);
        _thresh10.Checked = (s.ProcessCountThreshold == 10.0);

        _dialMode.Checked        = s.DialMode;
        _showHourTicks.Checked   = s.ShowHourTicks;
        _showMinuteDots.Checked  = s.ShowMinuteDots;
        _showHourNumbers.Checked = s.ShowHourNumbers;

        // Opacity preset sync — exact double comparison is reliable
        _opacity25.Checked  = (s.WindowOpacity == 0.25);
        _opacity50.Checked  = (s.WindowOpacity == 0.50);
        _opacity75.Checked  = (s.WindowOpacity == 0.75);
        _opacity100.Checked = (s.WindowOpacity == 1.00);

        // Theme preset sync — derive hex from AccentColor; no secondary theme-name field needed
        string hex = $"#{s.AccentColor.A:X2}{s.AccentColor.R:X2}{s.AccentColor.G:X2}{s.AccentColor.B:X2}";
        _themeWhite.Checked = (hex == "#FFFFFFFF");
        _themeAmber.Checked = (hex == "#FFFFC000");
        _themeIce.Checked   = (hex == "#FF87CEEB");
        _themeGreen.Checked = (hex == "#FF00C000");
        _themePink.Checked  = (hex == "#FFFF69B4");
        // Custom color active: none match — no checkmark shown. Correct.

        // Text style sync
        _styleClassic.Checked    = (s.TextStyle == "Classic");
        _styleSplit.Checked      = (s.TextStyle == "Split");
        _styleLiterary.Checked   = (s.TextStyle == "Literary");
        _styleMono.Checked = (s.TextStyle == "Mono");
    }
}
