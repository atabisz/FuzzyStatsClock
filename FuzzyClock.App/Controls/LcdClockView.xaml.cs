using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Threading;
using WpfUserControl = System.Windows.Controls.UserControl;

namespace FuzzyClock.App.Controls;

public partial class LcdClockView : WpfUserControl
{
    // ---------------------------------------------------------------
    // Dependency Properties
    // ---------------------------------------------------------------

    public static readonly DependencyProperty Use24HrProperty =
        DependencyProperty.Register(nameof(Use24Hr), typeof(bool), typeof(LcdClockView),
            new PropertyMetadata(false, OnVisualPropertyChanged));

    public static readonly DependencyProperty ShowSecondsProperty =
        DependencyProperty.Register(nameof(ShowSeconds), typeof(bool), typeof(LcdClockView),
            new PropertyMetadata(true, OnVisualPropertyChanged));

    public static readonly DependencyProperty ThemeProperty =
        DependencyProperty.Register(nameof(Theme), typeof(LcdTheme), typeof(LcdClockView),
            new PropertyMetadata(LcdTheme.Green, OnThemePropertyChanged));

    public static readonly DependencyProperty SizeProperty =
        DependencyProperty.Register(nameof(Size), typeof(LcdSize), typeof(LcdClockView),
            new PropertyMetadata(LcdSize.Medium, OnSizePropertyChanged));

    public bool Use24Hr
    {
        get => (bool)GetValue(Use24HrProperty);
        set => SetValue(Use24HrProperty, value);
    }

    public bool ShowSeconds
    {
        get => (bool)GetValue(ShowSecondsProperty);
        set => SetValue(ShowSecondsProperty, value);
    }

    public LcdTheme Theme
    {
        get => (LcdTheme)GetValue(ThemeProperty);
        set => SetValue(ThemeProperty, value);
    }

    public LcdSize Size
    {
        get => (LcdSize)GetValue(SizeProperty);
        set => SetValue(SizeProperty, value);
    }

    // ---------------------------------------------------------------
    // Property Changed Callbacks
    // ---------------------------------------------------------------

    private static void OnVisualPropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is LcdClockView view)
            view.UpdateTime();
    }

    private static void OnThemePropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is LcdClockView view)
            view.OnThemeChanged();
    }

    private static void OnSizePropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is LcdClockView view)
            view.OnSizeChanged();
    }

    // ---------------------------------------------------------------
    // Timer
    // ---------------------------------------------------------------

    private readonly DispatcherTimer _timer;

    public LcdClockView()
    {
        InitializeComponent();
        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _timer.Tick += (_, _) => UpdateTime();
        IsVisibleChanged += OnIsVisibleChanged;
    }

    private void OnIsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if ((bool)e.NewValue)
        {
            UpdateTime();   // immediate refresh before first tick
            _timer.Start();
        }
        else
        {
            _timer.Stop();
        }
    }

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------

    public void UpdateTime()
    {
        string time = LcdTimeFormatHelper.FormatTime(DateTime.Now, Use24Hr, ShowSeconds);
        // time is always 5 chars (no seconds) or 8 chars (with seconds)
        // Slots: D0=time[0], D1=time[1], Colon1=':', D2=time[3], D3=time[4]
        //        if ShowSeconds: Colon2=':', D4=time[6], D5=time[7]
        D0.Character = time[0];
        D1.Character = time[1];
        Colon1.Character = ':';
        D2.Character = time[3];
        D3.Character = time[4];

        bool showSec = ShowSeconds;
        Colon2.Visibility = showSec ? Visibility.Visible : Visibility.Collapsed;
        D4.Visibility     = showSec ? Visibility.Visible : Visibility.Collapsed;
        D5.Visibility     = showSec ? Visibility.Visible : Visibility.Collapsed;

        if (showSec)
        {
            Colon2.Character = ':';
            D4.Character = time[6];
            D5.Character = time[7];
        }
    }

    // ---------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------

    private void OnThemeChanged()
    {
        foreach (var digit in AllDigits()) digit.Theme = Theme;
    }

    private void OnSizeChanged()
    {
        double h = LcdSizeMap.ToSegmentHeight(Size);
        foreach (var digit in AllDigits()) digit.SegmentHeight = h;
    }

    private IEnumerable<SevenSegmentDigit> AllDigits()
        => new[] { D0, D1, Colon1, D2, D3, Colon2, D4, D5 };
}
