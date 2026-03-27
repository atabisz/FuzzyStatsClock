using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using Color = System.Windows.Media.Color;

namespace FuzzyClock.App;

/// <summary>
/// Modeless settings window — populates controls from a SettingsSnapshot at open time
/// and fires per-setting events for every user change. Never writes AppSettings directly.
/// </summary>
public sealed partial class SettingsWindow : Window
{
    // ── Within-session position memory ───────────────────────────────────────
    private static double _savedLeft = double.NaN;
    private static double _savedTop  = double.NaN;

    // ── Suppress events during control population ─────────────────────────
    private bool _suppressEvents;

    // ── Per-setting events ────────────────────────────────────────────────
    public event Action<Color>?  AccentColorChanged;
    public event Action<double>? OpacityChanged;
    public event Action<int>?    FontSizeChanged;
    public event Action<ClockType>? ClockTypeChanged;
    public event Action<bool>?   LcdUse24HrChanged;
    public event Action<bool>?   LcdShowSecondsChanged;
    public event Action<string>? LcdStyleChanged;
    public event Action<bool>?   ShowHourTicksChanged;
    public event Action<bool>?   ShowMinuteDotsChanged;
    public event Action<bool>?   ShowHourNumbersChanged;
    public event Action<string>? PhraseStyleChanged;
    public event Action<bool>?   StatsVisibleChanged;
    public event Action<bool>?   CpuVisibleChanged;
    public event Action<bool>?   GpuVisibleChanged;
    public event Action<bool>?   MemVisibleChanged;
    public event Action<bool>?   PagVisibleChanged;
    public event Action<bool>?   BatteryVisibleChanged;
    public event Action<bool>?   UptimeVisibleChanged;
    public event Action<int>?    StatsIntervalChanged;
    public event Action<double>? ProcessThresholdChanged;
    public event Action<bool>?   ShowDateChanged;
    public event Action<string>? DateFormatChanged;
    public event Action<bool>?   GhostModeChanged;
    public event Action<bool>?   AutoContrastChanged;
    public event Action<bool>?   AutoLaunchChanged;
    public event Action<string>? ThemeSelected;
    public event Action<int>?    BatteryAlertThresholdChanged;
    public event Action<string>? LanguageChanged;
    public event Action<bool>?   PhraseWrapEnabledChanged;
    public event Action<string>? PhraseWrapStyleChanged;
    public event Action<bool>?   BackdropAlwaysVisibleChanged;
    public event Action<int>?    BackdropOpacityPercentChanged;
    public event Action<int>?    GhostFadeRadiusPxChanged;

    // ─────────────────────────────────────────────────────────────────────
    internal SettingsWindow(SettingsSnapshot snapshot)
    {
        _suppressEvents = true;
        InitializeComponent();

        // Restore within-session position
        if (!double.IsNaN(_savedLeft))
        {
            WindowStartupLocation = WindowStartupLocation.Manual;
            Left = _savedLeft;
            Top  = _savedTop;
        }

        PopulateControls(snapshot);
        _suppressEvents = false;

        Closing += (_, _) => { _savedLeft = Left; _savedTop = Top; };
    }

    // ── Populate ──────────────────────────────────────────────────────────
    private void PopulateControls(SettingsSnapshot s)
    {
        // Opacity
        OpacitySlider.Value = s.Opacity;
        OpacityLabel.Text   = $"{(int)(s.Opacity * 100)}%";

        // Font size / clock style toggle buttons
        SetFontSizeButtonStates(s.FontSize);
        SetClockStyleButtonStates(s.ClockType);

        // Phrase language combo
        string uiLang = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        bool nonEnglishActive = uiLang is "fr" or "es" or "de" or "ja" or "pl";
        // If AppSettings has an explicit override, show that; otherwise reflect auto-detect result
        CmbPhraseLanguage.SelectedIndex = s.PhraseLocale switch
        {
            "en" => 1,
            "fr" => 2,
            "es" => 3,
            "de" => 4,
            "ja" => 5,
            "pl" => 6,
            _    => 0,  // "auto" or unrecognized
        };

        // Style variants exist for English and Japanese only
        bool isStyleSupported = s.PhraseLocale == "ja"
            || s.PhraseLocale == "en"
            || (s.PhraseLocale == "auto" && !nonEnglishActive);
        CmbPhraseStyle.IsEnabled = isStyleSupported;
        CmbPhraseStyle.SelectedIndex = s.PhraseStyle switch
        {
            "Terse"       => 1,
            "Poetic"      => 2,
            "Rude"        => 3,
            "Jive"        => 4,
            "Pirate"      => 5,
            "Dwarf"       => 6,
            "ValleyGirl"  => 7,
            "Yoda"        => 8,
            "Shakespeare" => 9,
            _             => 0,
        };

        // Stats checkboxes
        ChkStatsVisible.IsChecked  = s.StatsVisible;
        ChkCpuVisible.IsChecked    = s.CpuVisible;
        ChkGpuVisible.IsChecked    = s.GpuVisible;
        ChkMemVisible.IsChecked    = s.MemVisible;
        ChkPagVisible.IsChecked    = s.PagVisible;
        ChkBattVisible.IsChecked   = s.BatteryVisible;
        ChkUptimeVisible.IsChecked = s.UptimeVisible;

        // Update interval combo (0=1s, 1=3s, 2=10s)
        CmbStatsInterval.SelectedIndex = s.StatsIntervalSeconds switch
        {
            1  => 0,
            10 => 2,
            _  => 1   // 3 seconds default
        };

        // Process threshold radio buttons
        RbThresh2.IsChecked  = s.ProcessCountThreshold == 2.0;
        RbThresh5.IsChecked  = s.ProcessCountThreshold == 5.0;
        RbThresh10.IsChecked = s.ProcessCountThreshold == 10.0;
        // If none matched (unusual), leave all unchecked

        // Date
        ChkShowDate.IsChecked = s.ShowDate;
        CmbDateFormat.SelectedIndex = s.DateFormat switch
        {
            "Short"   => 0,
            "Long"    => 1,
            "Numeric" => 2,
            "ISO"     => 3,
            _         => 0
        };

        // Behavior checkboxes
        ChkGhostMode.IsChecked    = s.GhostModeEnabled;
        GhostFadeRadiusSlider.Value    = s.GhostFadeRadiusPx;
        GhostFadeRadiusLabel.Text      = $"{s.GhostFadeRadiusPx} px";
        GhostFadeRadiusPanel.IsEnabled = s.GhostModeEnabled;
        ChkAutoContrast.IsChecked = s.AutoContrastEnabled;
        ChkAutoLaunch.IsChecked   = s.AutoLaunchEnabled;

        // Battery alert threshold radio buttons
        RbAlert10.IsChecked = s.BatteryAlertThreshold == 10;
        RbAlert15.IsChecked = s.BatteryAlertThreshold == 15;
        RbAlert20.IsChecked = s.BatteryAlertThreshold == 20;

        // Phrase wrap controls
        ChkPhraseWrap.IsChecked  = s.PhraseWrapEnabled;
        RbWrapMidpoint.IsChecked = s.PhraseWrapStyle == "midpoint";
        RbWrapNatural.IsChecked  = s.PhraseWrapStyle == "natural";
        WrapStylePanel.IsEnabled = s.PhraseWrapEnabled;

        // Dial face decoration checkboxes
        ChkShowHourTicks.IsChecked   = s.ShowHourTicks;
        ChkShowMinuteDots.IsChecked  = s.ShowMinuteDots;
        ChkShowHourNumbers.IsChecked = s.ShowHourNumbers;

        // LCD options
        ChkLcd24Hr.IsChecked        = s.LcdUse24Hr;
        ChkLcdShowSeconds.IsChecked = s.LcdShowSeconds;
        CmbLcdStyle.SelectedIndex   = s.LcdStyle switch
        {
            "Paper"  => 1,
            "Silver" => 2,
            _        => 0,   // "Dark" is default
        };

        // Backdrop controls
        BackdropOpacitySlider.Value = s.BackdropOpacityPercent;
        BackdropOpacityLabel.Text = $"{s.BackdropOpacityPercent}%";
        ChkBackdropAlwaysVisible.IsChecked = s.BackdropAlwaysVisible;

        // Accent swatch selection ring
        var ac = s.AccentColor;
        Border? ring =
            ac == Color.FromArgb(0xFF, 0xFF, 0xFF, 0xFF) ? RingWhite  :
            ac == Color.FromArgb(0xFF, 0xFF, 0xC0, 0x00) ? RingAmber  :
            ac == Color.FromArgb(0xFF, 0x87, 0xCE, 0xEB) ? RingIce    :
            ac == Color.FromArgb(0xFF, 0x00, 0xC0, 0x00) ? RingGreen  :
            ac == Color.FromArgb(0xFF, 0xFF, 0x69, 0xB4) ? RingPink   : null;
        SetActiveSwatch(ring);

        // Restore active theme card ring (null = no theme active → no ring shown)
        if (s.ActiveTheme is not null)
        {
            Border? themeRing = s.ActiveTheme switch
            {
                "Midnight" => RingThemeMidnight,
                "Neon"     => RingThemeNeon,
                "Ghost"    => RingThemeGhost,
                "Warm"     => RingThemeWarm,
                "Terminal" => RingThemeTerminal,
                _          => null,
            };
            Color accent = BuiltInThemes.TryGet(s.ActiveTheme)?.AccentColor ?? default;
            SetActiveThemeCard(themeRing, accent);
        }
    }

    // ── Toggle button state helpers ───────────────────────────────────────
    private void SetFontSizeButtonStates(int size)
    {
        BtnFontS.Tag  = size == 16 ? "selected" : null;
        BtnFontM.Tag  = size == 24 ? "selected" : null;
        BtnFontL.Tag  = size == 32 ? "selected" : null;
        BtnFontXL.Tag = size == 40 ? "selected" : null;
    }

    private void SetClockStyleButtonStates(ClockType ct)
    {
        BtnPhrase.Tag = ct == ClockType.Phrase ? "selected" : null;
        BtnDial.Tag   = ct == ClockType.Dial   ? "selected" : null;
        BtnNixie.Tag  = ct == ClockType.Nixie  ? "selected" : null;
        BtnLcd.Tag    = ct == ClockType.Lcd    ? "selected" : null;

        // Dial face row: visible only for Dial clock style
        var dialVis = ct == ClockType.Dial ? Visibility.Visible : Visibility.Collapsed;
        DialFaceLabel.Visibility = dialVis;
        DialFacePanel.Visibility = dialVis;

        // LCD options row: visible only for LCD clock style
        var lcdVis = ct == ClockType.Lcd ? Visibility.Visible : Visibility.Collapsed;
        LcdOptionsLabel.Visibility = lcdVis;
        LcdOptionsPanel.Visibility = lcdVis;
    }

    private void SetActiveSwatch(Border? activeRing)
    {
        var rings = new[] { RingWhite, RingAmber, RingIce, RingGreen, RingPink };
        var blue  = new SolidColorBrush(Color.FromRgb(0x00, 0x78, 0xD4));
        foreach (var r in rings)
        {
            r.BorderThickness = new Thickness(0);
            r.BorderBrush     = null;
        }
        if (activeRing is not null)
        {
            activeRing.BorderThickness = new Thickness(2);
            activeRing.BorderBrush     = blue;
        }
    }

    private void SetActiveThemeCard(Border? activeRing, Color ringColor)
    {
        var rings = new[] { RingThemeMidnight, RingThemeNeon, RingThemeGhost,
                            RingThemeWarm, RingThemeTerminal };
        foreach (var r in rings)
        {
            r.BorderThickness = new Thickness(0);
            r.BorderBrush     = null;
        }
        if (activeRing is not null)
        {
            activeRing.BorderThickness = new Thickness(2);
            activeRing.BorderBrush     = new SolidColorBrush(ringColor);
        }
    }

    /// <summary>Removes the active ring from all theme cards. Called by MainWindow when user deviates from a named theme.</summary>
    public void ClearActiveThemeCard() => SetActiveThemeCard(null, default);

    /// <summary>Re-populates all controls from a fresh snapshot. Called by MainWindow after applying a named theme.</summary>
    internal void RefreshControls(SettingsSnapshot snapshot)
    {
        _suppressEvents = true;
        PopulateControls(snapshot);
        _suppressEvents = false;
    }

    // ── Theme card click handlers ─────────────────────────────────────────
    private void ThemeMidnight_Click(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        SetActiveThemeCard(RingThemeMidnight,
            Color.FromArgb(0xFF, 0x6A, 0x7F, 0xDB));
        ThemeSelected?.Invoke("Midnight");
    }

    private void ThemeNeon_Click(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        SetActiveThemeCard(RingThemeNeon,
            Color.FromArgb(0xFF, 0x00, 0xF5, 0xD4));
        ThemeSelected?.Invoke("Neon");
    }

    private void ThemeGhost_Click(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        SetActiveThemeCard(RingThemeGhost,
            Color.FromArgb(0xFF, 0xC0, 0xC8, 0xD8));
        ThemeSelected?.Invoke("Ghost");
    }

    private void ThemeWarm_Click(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        SetActiveThemeCard(RingThemeWarm,
            Color.FromArgb(0xFF, 0xF4, 0xA2, 0x61));
        ThemeSelected?.Invoke("Warm");
    }

    private void ThemeTerminal_Click(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        SetActiveThemeCard(RingThemeTerminal,
            Color.FromArgb(0xFF, 0x39, 0xFF, 0x14));
        ThemeSelected?.Invoke("Terminal");
    }

    // ── Accent color swatches ─────────────────────────────────────────────
    private void SwatchWhite_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        SetActiveSwatch(RingWhite);
        AccentColorChanged?.Invoke(((SolidColorBrush)SwatchWhite.Background).Color);
    }

    private void SwatchAmber_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        SetActiveSwatch(RingAmber);
        AccentColorChanged?.Invoke(((SolidColorBrush)SwatchAmber.Background).Color);
    }

    private void SwatchIce_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        SetActiveSwatch(RingIce);
        AccentColorChanged?.Invoke(((SolidColorBrush)SwatchIce.Background).Color);
    }

    private void SwatchGreen_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        SetActiveSwatch(RingGreen);
        AccentColorChanged?.Invoke(((SolidColorBrush)SwatchGreen.Background).Color);
    }

    private void SwatchPink_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        SetActiveSwatch(RingPink);
        AccentColorChanged?.Invoke(((SolidColorBrush)SwatchPink.Background).Color);
    }

    private void BtnCustomColor_Click(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;

        var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        using var dlg = new System.Windows.Forms.ColorDialog
        {
            AllowFullOpen = true,
            FullOpen      = true,
        };

        if (dlg.ShowDialog(new Win32Window(hwnd)) == System.Windows.Forms.DialogResult.OK)
        {
            var c = dlg.Color;
            SetActiveSwatch(null);   // custom colour — clear any preset ring
            AccentColorChanged?.Invoke(Color.FromArgb(c.A, c.R, c.G, c.B));
        }
    }

    // ── Opacity ───────────────────────────────────────────────────────────
    private void OpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (_suppressEvents) return;
        double v = Math.Round(e.NewValue, 2);
        OpacityLabel.Text = $"{(int)(v * 100)}%";
        OpacityChanged?.Invoke(v);
    }

    // ── Font size buttons ─────────────────────────────────────────────────
    private void BtnFontS_Click(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        SetFontSizeButtonStates(16);
        FontSizeChanged?.Invoke(16);
    }

    private void BtnFontM_Click(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        SetFontSizeButtonStates(24);
        FontSizeChanged?.Invoke(24);
    }

    private void BtnFontL_Click(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        SetFontSizeButtonStates(32);
        FontSizeChanged?.Invoke(32);
    }

    private void BtnFontXL_Click(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        SetFontSizeButtonStates(40);
        FontSizeChanged?.Invoke(40);
    }

    // ── Clock style buttons ───────────────────────────────────────────────
    private void BtnPhrase_Click(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        SetClockStyleButtonStates(ClockType.Phrase);
        ClockTypeChanged?.Invoke(ClockType.Phrase);
    }

    private void BtnDial_Click(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        SetClockStyleButtonStates(ClockType.Dial);
        ClockTypeChanged?.Invoke(ClockType.Dial);
    }

    private void BtnNixie_Click(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        SetClockStyleButtonStates(ClockType.Nixie);
        ClockTypeChanged?.Invoke(ClockType.Nixie);
    }

    private void BtnLcd_Click(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        SetClockStyleButtonStates(ClockType.Lcd);
        ClockTypeChanged?.Invoke(ClockType.Lcd);
    }

    // ── Phrase style combo ────────────────────────────────────────────────
    private void CmbPhraseStyle_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressEvents) return;
        if (CmbPhraseStyle.SelectedItem is ComboBoxItem item)
            PhraseStyleChanged?.Invoke((string)item.Content);
    }

    // ── Phrase language combo ─────────────────────────────────────────────
    private void CmbPhraseLanguage_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressEvents) return;
        if (CmbPhraseLanguage.SelectedItem is ComboBoxItem item)
        {
            string locale = (string)item.Tag;
            LanguageChanged?.Invoke(locale);
            bool isStyleSupported = locale is "en" or "ja" or "auto";
            CmbPhraseStyle.IsEnabled = isStyleSupported;
        }
    }

    // ── Stats checkboxes ──────────────────────────────────────────────────
    private void ChkStatsVisible_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        StatsVisibleChanged?.Invoke(ChkStatsVisible.IsChecked == true);
    }

    private void ChkCpuVisible_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        CpuVisibleChanged?.Invoke(ChkCpuVisible.IsChecked == true);
    }

    private void ChkGpuVisible_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        GpuVisibleChanged?.Invoke(ChkGpuVisible.IsChecked == true);
    }

    private void ChkMemVisible_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        MemVisibleChanged?.Invoke(ChkMemVisible.IsChecked == true);
    }

    private void ChkPagVisible_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        PagVisibleChanged?.Invoke(ChkPagVisible.IsChecked == true);
    }

    private void ChkBattVisible_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        BatteryVisibleChanged?.Invoke(ChkBattVisible.IsChecked == true);
    }

    private void ChkUptimeVisible_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        UptimeVisibleChanged?.Invoke(ChkUptimeVisible.IsChecked == true);
    }

    // ── Stats interval combo ──────────────────────────────────────────────
    private void CmbStatsInterval_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressEvents) return;
        int[] intervals = [1, 3, 10];
        if (CmbStatsInterval.SelectedIndex >= 0 && CmbStatsInterval.SelectedIndex < intervals.Length)
            StatsIntervalChanged?.Invoke(intervals[CmbStatsInterval.SelectedIndex]);
    }

    // ── Process threshold radio buttons ───────────────────────────────────
    private void RbThresh2_Checked(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        ProcessThresholdChanged?.Invoke(2.0);
    }

    private void RbThresh5_Checked(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        ProcessThresholdChanged?.Invoke(5.0);
    }

    private void RbThresh10_Checked(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        ProcessThresholdChanged?.Invoke(10.0);
    }

    // ── Battery alert threshold radio buttons ──────────────────────────────
    private void RbAlert10_Checked(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        BatteryAlertThresholdChanged?.Invoke(10);
    }

    private void RbAlert15_Checked(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        BatteryAlertThresholdChanged?.Invoke(15);
    }

    private void RbAlert20_Checked(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        BatteryAlertThresholdChanged?.Invoke(20);
    }

    // ── Date checkboxes / combo ───────────────────────────────────────────
    private void ChkShowDate_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        ShowDateChanged?.Invoke(ChkShowDate.IsChecked == true);
    }

    private void CmbDateFormat_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressEvents) return;
        string[] formats = ["Short", "Long", "Numeric", "ISO"];
        if (CmbDateFormat.SelectedIndex >= 0 && CmbDateFormat.SelectedIndex < formats.Length)
            DateFormatChanged?.Invoke(formats[CmbDateFormat.SelectedIndex]);
    }

    // ── Behavior checkboxes ───────────────────────────────────────────────
    private void ChkGhostMode_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        bool enabled = ChkGhostMode.IsChecked == true;
        GhostFadeRadiusPanel.IsEnabled = enabled;
        GhostModeChanged?.Invoke(enabled);
    }

    private void ChkAutoContrast_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        AutoContrastChanged?.Invoke(ChkAutoContrast.IsChecked == true);
    }

    private void ChkAutoLaunch_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        AutoLaunchChanged?.Invoke(ChkAutoLaunch.IsChecked == true);
    }

    // ── Phrase wrap controls ───────────────────────────────────────────────
    private void ChkPhraseWrap_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        bool enabled = ChkPhraseWrap.IsChecked == true;
        WrapStylePanel.IsEnabled = enabled;
        PhraseWrapEnabledChanged?.Invoke(enabled);
    }

    private void RbWrapMidpoint_Checked(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        PhraseWrapStyleChanged?.Invoke("midpoint");
    }

    private void RbWrapNatural_Checked(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        PhraseWrapStyleChanged?.Invoke("natural");
    }

    // -- Dial face decoration checkboxes ------------------------------------
    private void ChkShowHourTicks_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        ShowHourTicksChanged?.Invoke(ChkShowHourTicks.IsChecked == true);
    }

    private void ChkShowMinuteDots_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        ShowMinuteDotsChanged?.Invoke(ChkShowMinuteDots.IsChecked == true);
    }

    private void ChkShowHourNumbers_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        ShowHourNumbersChanged?.Invoke(ChkShowHourNumbers.IsChecked == true);
    }

    // ── LCD options ───────────────────────────────────────────────────────
    private void ChkLcd24Hr_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        LcdUse24HrChanged?.Invoke(ChkLcd24Hr.IsChecked == true);
    }

    private void ChkLcdShowSeconds_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        LcdShowSecondsChanged?.Invoke(ChkLcdShowSeconds.IsChecked == true);
    }

    private void CmbLcdStyle_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressEvents) return;
        if (CmbLcdStyle.SelectedItem is ComboBoxItem item)
            LcdStyleChanged?.Invoke((string)item.Content);
    }

    // ── Backdrop controls ─────────────────────────────────────────────────
    private void ChkBackdropAlwaysVisible_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        BackdropAlwaysVisibleChanged?.Invoke(ChkBackdropAlwaysVisible.IsChecked == true);
    }

    private void BackdropOpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (_suppressEvents) return;
        var val = (int)BackdropOpacitySlider.Value;
        BackdropOpacityLabel.Text = $"{val}%";
        BackdropOpacityPercentChanged?.Invoke(val);
    }

    private void GhostFadeRadiusSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (_suppressEvents) return;
        var val = (int)GhostFadeRadiusSlider.Value;
        GhostFadeRadiusLabel.Text = $"{val} px";
        GhostFadeRadiusPxChanged?.Invoke(val);
    }

    // ── Win32Window adapter for WinForms dialogs ──────────────────────────
    private sealed class Win32Window : System.Windows.Forms.IWin32Window
    {
        public IntPtr Handle { get; }
        public Win32Window(IntPtr handle) => Handle = handle;
    }
}
