using System;
using System.Windows;
using System.Windows.Shapes;
using System.Windows.Threading;
using WpfUserControl = System.Windows.Controls.UserControl;

namespace FuzzyClock.App.Controls;

public partial class NixieClockView : WpfUserControl
{
    // ---------------------------------------------------------------
    // Dependency Properties
    // ---------------------------------------------------------------

    public static readonly DependencyProperty SizeProperty =
        DependencyProperty.Register(nameof(Size), typeof(LcdSize), typeof(NixieClockView),
            new PropertyMetadata(LcdSize.Medium, OnSizePropertyChanged));

    public LcdSize Size
    {
        get => (LcdSize)GetValue(SizeProperty);
        set => SetValue(SizeProperty, value);
    }

    private static void OnSizePropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is NixieClockView view)
            view.OnSizeChanged();
    }

    // ---------------------------------------------------------------
    // Timer
    // ---------------------------------------------------------------

    private readonly DispatcherTimer _timer;

    public NixieClockView()
    {
        InitializeComponent();
        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _timer.Tick += (_, _) => UpdateTime();
        IsVisibleChanged += OnIsVisibleChanged;
        // Do NOT call UpdateTime() here — IsVisibleChanged fires automatically
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
        var now = DateTime.Now;
        int h = now.Hour % 12;
        if (h == 0) h = 12;  // 12hr: midnight/noon = 12
        int m = now.Minute;
        D0.ActiveDigit = h / 10;
        D1.ActiveDigit = h % 10;
        D2.ActiveDigit = m / 10;
        D3.ActiveDigit = m % 10;
    }

    // ---------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------

    private void OnSizeChanged()
    {
        double height  = NixieSizeMap.ToDigitHeight(Size);
        D0.DigitHeight = height;
        D1.DigitHeight = height;
        D2.DigitHeight = height;
        D3.DigitHeight = height;

        // Scale colon dots proportionally
        double dotSize = height * 0.13;
        ColonDot1.Width  = dotSize;
        ColonDot1.Height = dotSize;
        ColonDot2.Width  = dotSize;
        ColonDot2.Height = dotSize;
    }
}
