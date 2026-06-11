namespace FuzzyClock.App;

/// <summary>
/// Snapshot of current application state needed to sync tray menu checkmarks.
/// Passed to TrayMenuBuilder.Build() for initial state and supplied via Func on every Opening.
/// </summary>
internal sealed record TrayMenuState
{
    public bool GhostModeEnabled    { get; init; }
    public bool StatsVisible        { get; init; }
    public bool AutoContrastEnabled { get; init; }
    public bool AutoLaunchEnabled   { get; init; }
    public ClockType ClockType      { get; init; } = ClockType.Phrase;
}

/// <summary>
/// WPF-thread callbacks invoked by tray menu click handlers (which fire on the WinForms thread).
/// Each Action must wrap WPF-touching code in Dispatcher.Invoke — callers are responsible for this.
/// </summary>
internal sealed class TrayMenuCallbacks
{
    public required Action ToggleGhostMode    { get; init; }
    public required Action ToggleStatsVisible { get; init; }
    public required Action ToggleAutoContrast { get; init; }
    public required Action ToggleAutoLaunch   { get; init; }
    public required Action OpenSettings       { get; init; }
    public required Action ResetToDefaults    { get; init; }
    public required Action Quit               { get; init; }
    public required Action<ClockType> SetClockType { get; init; }
}

/// <summary>
/// Builds the system tray NotifyIcon and ContextMenuStrip.
/// Pruned to 8 items + 2 separators + About: Open Settings..., separator, 4 quick toggles, separator, Reset/About/Quit.
/// </summary>
internal sealed class TrayMenuBuilder
{
    private readonly TrayMenuCallbacks _cb;

    // Items requiring programmatic updates (checkmarks)
    private System.Windows.Forms.ToolStripMenuItem _ghostModeItem    = null!;
    private System.Windows.Forms.ToolStripMenuItem _showStatsItem    = null!;
    private System.Windows.Forms.ToolStripMenuItem _autoContrastItem = null!;
    private System.Windows.Forms.ToolStripMenuItem _autoLaunchItem   = null!;
    private System.Windows.Forms.ToolStripMenuItem _phraseClockItem  = null!;
    private System.Windows.Forms.ToolStripMenuItem _dialClockItem    = null!;
    private System.Windows.Forms.ToolStripMenuItem _lcdClockItem     = null!;
    private System.Windows.Forms.ToolStripMenuItem _nixieClockItem   = null!;

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

        // Open Settings...
        var openSettingsItem = new System.Windows.Forms.ToolStripMenuItem("Open Settings...");
        openSettingsItem.Click += (_, _) => _cb.OpenSettings();
        menu.Items.Add(openSettingsItem);
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());

        // Clock Type submenu
        var clockTypeMenu = new System.Windows.Forms.ToolStripMenuItem("Clock Type");

        _phraseClockItem = new System.Windows.Forms.ToolStripMenuItem("Phrase")
            { Checked = initialState.ClockType == ClockType.Phrase };
        _phraseClockItem.Click += (_, _) => _cb.SetClockType(ClockType.Phrase);
        clockTypeMenu.DropDownItems.Add(_phraseClockItem);

        _dialClockItem = new System.Windows.Forms.ToolStripMenuItem("Dial")
            { Checked = initialState.ClockType == ClockType.Dial };
        _dialClockItem.Click += (_, _) => _cb.SetClockType(ClockType.Dial);
        clockTypeMenu.DropDownItems.Add(_dialClockItem);

        _lcdClockItem = new System.Windows.Forms.ToolStripMenuItem("LCD")
            { Checked = initialState.ClockType == ClockType.Lcd };
        _lcdClockItem.Click += (_, _) => _cb.SetClockType(ClockType.Lcd);
        clockTypeMenu.DropDownItems.Add(_lcdClockItem);

        _nixieClockItem = new System.Windows.Forms.ToolStripMenuItem("Nixie")
            { Checked = initialState.ClockType == ClockType.Nixie };
        _nixieClockItem.Click += (_, _) => _cb.SetClockType(ClockType.Nixie);
        clockTypeMenu.DropDownItems.Add(_nixieClockItem);

        menu.Items.Add(clockTypeMenu);

        // Ghost Mode
        _ghostModeItem = new System.Windows.Forms.ToolStripMenuItem("Ghost Mode")
            { Checked = initialState.GhostModeEnabled };
        _ghostModeItem.Click += (_, _) => _cb.ToggleGhostMode();
        menu.Items.Add(_ghostModeItem);

        // Show Stats
        _showStatsItem = new System.Windows.Forms.ToolStripMenuItem("Show Stats")
            { Checked = initialState.StatsVisible };
        _showStatsItem.Click += (_, _) => _cb.ToggleStatsVisible();
        menu.Items.Add(_showStatsItem);

        // Auto-Contrast
        _autoContrastItem = new System.Windows.Forms.ToolStripMenuItem("Auto-Contrast")
            { Checked = initialState.AutoContrastEnabled };
        _autoContrastItem.Click += (_, _) => _cb.ToggleAutoContrast();
        menu.Items.Add(_autoContrastItem);

        // Auto-Launch at Login
        _autoLaunchItem = new System.Windows.Forms.ToolStripMenuItem("Auto-Launch at Login")
            { Checked = initialState.AutoLaunchEnabled };
        _autoLaunchItem.Click += (_, _) => _cb.ToggleAutoLaunch();
        menu.Items.Add(_autoLaunchItem);
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());

        // Reset to Defaults
        var resetItem = new System.Windows.Forms.ToolStripMenuItem("Reset to Defaults");
        resetItem.Click += (_, _) => _cb.ResetToDefaults();
        menu.Items.Add(resetItem);

        // About
        var aboutItem = new System.Windows.Forms.ToolStripMenuItem("About");
        aboutItem.Click += (_, _) => System.Windows.Application.Current.Dispatcher.Invoke(() =>
        {
            var ver = typeof(TrayMenuBuilder).Assembly.GetName().Version;
            var versionStr = ver is null ? "0.0.0" : $"{ver.Major}.{ver.Minor}.{ver.Build}";
            System.Windows.MessageBox.Show(
                $"FuzzyClock v{versionStr}\n\nA fuzzy time & system stats desktop overlay.\n\nBuilt as a Claude + GSD experiment\nby Alex Tabisz.",
                "About FuzzyClock",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Information);
        });
        menu.Items.Add(aboutItem);

        // Quit
        var quitItem = new System.Windows.Forms.ToolStripMenuItem("Quit");
        quitItem.Click += (_, _) => _cb.Quit();
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
    /// Syncs all checkmarks from the supplied snapshot.
    /// Called on every ContextMenuStrip.Opening event.
    /// </summary>
    private void SyncCheckmarks(TrayMenuState s)
    {
        _ghostModeItem.Checked    = s.GhostModeEnabled;
        _showStatsItem.Checked    = s.StatsVisible;
        _autoContrastItem.Checked = s.AutoContrastEnabled;
        _autoLaunchItem.Checked   = s.AutoLaunchEnabled;
        _phraseClockItem.Checked  = s.ClockType == ClockType.Phrase;
        _dialClockItem.Checked    = s.ClockType == ClockType.Dial;
        _lcdClockItem.Checked     = s.ClockType == ClockType.Lcd;
        _nixieClockItem.Checked   = s.ClockType == ClockType.Nixie;
    }
}
