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
    public event Action<bool>?   DialModeChanged;
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

        _suppressEvents = true;
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
        SetClockStyleButtonStates(s.DialMode);

        // Phrase style combo — "Classic" is the only item; always index 0
        CmbPhraseStyle.SelectedIndex = 0;

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
        ChkAutoContrast.IsChecked = s.AutoContrastEnabled;
        ChkAutoLaunch.IsChecked   = s.AutoLaunchEnabled;
    }

    // ── Toggle button state helpers ───────────────────────────────────────
    private void SetFontSizeButtonStates(int size)
    {
        BtnFontS.FontWeight  = size == 16 ? FontWeights.Bold : FontWeights.Normal;
        BtnFontM.FontWeight  = size == 24 ? FontWeights.Bold : FontWeights.Normal;
        BtnFontL.FontWeight  = size == 32 ? FontWeights.Bold : FontWeights.Normal;
        BtnFontXL.FontWeight = size == 40 ? FontWeights.Bold : FontWeights.Normal;
    }

    private void SetClockStyleButtonStates(bool dialMode)
    {
        BtnPhrase.FontWeight = !dialMode ? FontWeights.Bold : FontWeights.Normal;
        BtnDial.FontWeight   =  dialMode ? FontWeights.Bold : FontWeights.Normal;
    }

    // ── Accent color swatches ─────────────────────────────────────────────
    private void SwatchWhite_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        AccentColorChanged?.Invoke(((SolidColorBrush)SwatchWhite.Background).Color);
    }

    private void SwatchAmber_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        AccentColorChanged?.Invoke(((SolidColorBrush)SwatchAmber.Background).Color);
    }

    private void SwatchIce_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        AccentColorChanged?.Invoke(((SolidColorBrush)SwatchIce.Background).Color);
    }

    private void SwatchGreen_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
        AccentColorChanged?.Invoke(((SolidColorBrush)SwatchGreen.Background).Color);
    }

    private void SwatchPink_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_suppressEvents) return;
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
        SetClockStyleButtonStates(false);
        DialModeChanged?.Invoke(false);
    }

    private void BtnDial_Click(object sender, RoutedEventArgs e)
    {
        if (_suppressEvents) return;
        SetClockStyleButtonStates(true);
        DialModeChanged?.Invoke(true);
    }

    // ── Phrase style combo ────────────────────────────────────────────────
    private void CmbPhraseStyle_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressEvents) return;
        if (CmbPhraseStyle.SelectedItem is ComboBoxItem item)
            PhraseStyleChanged?.Invoke((string)item.Content);
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
        GhostModeChanged?.Invoke(ChkGhostMode.IsChecked == true);
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

    // ── Win32Window adapter for WinForms dialogs ──────────────────────────
    private sealed class Win32Window : System.Windows.Forms.IWin32Window
    {
        public IntPtr Handle { get; }
        public Win32Window(IntPtr handle) => Handle = handle;
    }
}
