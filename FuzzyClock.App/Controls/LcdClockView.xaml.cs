using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using WpfUserControl = System.Windows.Controls.UserControl;
using WpfColor       = System.Windows.Media.Color;

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

    public static readonly DependencyProperty LitColorProperty =
        DependencyProperty.Register(nameof(LitColor), typeof(WpfColor), typeof(LcdClockView),
            new PropertyMetadata(Colors.White, OnLitColorPropertyChanged));

    public static readonly DependencyProperty BgColorProperty =
        DependencyProperty.Register(nameof(BgColor), typeof(WpfColor), typeof(LcdClockView),
            new PropertyMetadata(Colors.Transparent, OnBgColorPropertyChanged));

    public static readonly DependencyProperty GhostColorProperty =
        DependencyProperty.Register(nameof(GhostColor), typeof(WpfColor), typeof(LcdClockView),
            new PropertyMetadata(Colors.Transparent, OnGhostColorPropertyChanged));

    public static readonly DependencyProperty SizeProperty =
        DependencyProperty.Register(nameof(Size), typeof(LcdSize), typeof(LcdClockView),
            new PropertyMetadata(LcdSize.Medium, OnSizePropertyChanged));

    public static readonly DependencyProperty SegmentStyleProperty =
        DependencyProperty.Register(nameof(SegmentStyle), typeof(string), typeof(LcdClockView),
            new PropertyMetadata("Classic", OnSegmentStylePropertyChanged));

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

    public WpfColor LitColor
    {
        get => (WpfColor)GetValue(LitColorProperty);
        set => SetValue(LitColorProperty, value);
    }

    public WpfColor BgColor
    {
        get => (WpfColor)GetValue(BgColorProperty);
        set => SetValue(BgColorProperty, value);
    }

    public WpfColor GhostColor
    {
        get => (WpfColor)GetValue(GhostColorProperty);
        set => SetValue(GhostColorProperty, value);
    }

    public LcdSize Size
    {
        get => (LcdSize)GetValue(SizeProperty);
        set => SetValue(SizeProperty, value);
    }

    public string SegmentStyle
    {
        get => (string)GetValue(SegmentStyleProperty);
        set => SetValue(SegmentStyleProperty, value);
    }

    // ---------------------------------------------------------------
    // Property Changed Callbacks
    // ---------------------------------------------------------------

    private static void OnVisualPropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is LcdClockView view)
            view.UpdateTime();
    }

    private static void OnLitColorPropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is LcdClockView view)
            view.OnLitColorChanged();
    }

    private static void OnBgColorPropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is LcdClockView view)
            foreach (var digit in view.AllDigits()) digit.BgColor = view.BgColor;
    }

    private static void OnGhostColorPropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is LcdClockView view)
            foreach (var digit in view.AllDigits()) digit.GhostColor = view.GhostColor;
    }

    private static void OnSegmentStylePropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is LcdClockView view)
            foreach (var digit in view.AllDigits()) digit.SegmentStyle = view.SegmentStyle;
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

    private void OnLitColorChanged()
    {
        foreach (var digit in AllDigits()) digit.LitColor = LitColor;
    }

    private void OnSizeChanged()
    {
        double h = LcdSizeMap.ToSegmentHeight(Size);
        foreach (var digit in AllDigits()) digit.SegmentHeight = h;
    }

    private IEnumerable<SevenSegmentDigit> AllDigits()
        => new[] { D0, D1, Colon1, D2, D3, Colon2, D4, D5 };
}
