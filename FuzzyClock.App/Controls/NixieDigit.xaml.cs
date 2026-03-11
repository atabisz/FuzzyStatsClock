using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using WpfUserControl = System.Windows.Controls.UserControl;
using WpfColor       = System.Windows.Media.Color;
using WpfRectangle   = System.Windows.Shapes.Rectangle;
using WpfFontFamily  = System.Windows.Media.FontFamily;
using WpfSize        = System.Windows.Size;

namespace FuzzyClock.App.Controls;

public partial class NixieDigit : WpfUserControl
{
    // ---------------------------------------------------------------
    // Dependency Properties
    // ---------------------------------------------------------------

    public static readonly DependencyProperty ActiveDigitProperty =
        DependencyProperty.Register(nameof(ActiveDigit), typeof(int), typeof(NixieDigit),
            new PropertyMetadata(-1, OnVisualPropertyChanged));

    public static readonly DependencyProperty DigitHeightProperty =
        DependencyProperty.Register(nameof(DigitHeight), typeof(double), typeof(NixieDigit),
            new PropertyMetadata(56.0, OnDigitHeightChanged));

    public int ActiveDigit
    {
        get => (int)GetValue(ActiveDigitProperty);
        set => SetValue(ActiveDigitProperty, value);
    }

    public double DigitHeight
    {
        get => (double)GetValue(DigitHeightProperty);
        set => SetValue(DigitHeightProperty, value);
    }

    private static void OnVisualPropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        => ((NixieDigit)d).UpdateDisplay(((NixieDigit)d).ActiveDigit);

    private static void OnDigitHeightChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        var ctrl = (NixieDigit)d;
        ctrl.RebuildGeometry();
        ctrl.UpdateDisplay(ctrl.ActiveDigit);
    }

    // ---------------------------------------------------------------
    // Fields
    // ---------------------------------------------------------------

    private TextBlock[] _ghosts = Array.Empty<TextBlock>();
    private Ellipse _glowEllipse = null!;

    // Geometry cache
    private double _builtDigitW;
    private double _builtDigitH;

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    public NixieDigit()
    {
        InitializeComponent();
        RebuildGeometry();
        UpdateDisplay(ActiveDigit);
    }

    // ---------------------------------------------------------------
    // Geometry
    // ---------------------------------------------------------------

    private void RebuildGeometry()
    {
        RootCanvas.Children.Clear();

        double digitH  = DigitHeight;
        double digitW  = digitH * 0.62;
        double canvasH = digitH + 12;
        double tubePad = 4.0;

        _builtDigitW = digitW;
        _builtDigitH = digitH;

        // 1. Glass tube border
        var tubeBorder = new WpfRectangle
        {
            Width           = digitW,
            Height          = canvasH,
            RadiusX         = 8,
            RadiusY         = 8,
            Fill            = new SolidColorBrush(WpfColor.FromArgb(0xCC, 0x1A, 0x08, 0x00)),
            Stroke          = new SolidColorBrush(WpfColor.FromArgb(0x80, 0xFF, 0x8C, 0x00)),
            StrokeThickness = 1.5
        };
        Canvas.SetLeft(tubeBorder, 0);
        Canvas.SetTop(tubeBorder, 0);
        RootCanvas.Children.Add(tubeBorder);

        // 2. Glass highlight (simulates curvature reflection)
        double highlightH = canvasH * 0.18;
        var highlight = new WpfRectangle
        {
            Width   = digitW,
            Height  = highlightH,
            RadiusX = 6,
            RadiusY = 6,
            Fill    = new SolidColorBrush(WpfColor.FromArgb(0x14, 0xFF, 0xFF, 0xFF))
        };
        Canvas.SetLeft(highlight, 0);
        Canvas.SetTop(highlight, 0);
        RootCanvas.Children.Add(highlight);

        // 3. Wire mesh overlay (thin horizontal lines inside tube area)
        for (double y = tubePad; y <= canvasH - tubePad; y += 7.0)
        {
            var wire = new System.Windows.Shapes.Line
            {
                X1              = tubePad + 2,
                X2              = digitW - tubePad - 2,
                Y1              = y,
                Y2              = y,
                Stroke          = new SolidColorBrush(WpfColor.FromArgb(0x18, 0xFF, 0x8C, 0x00)),
                StrokeThickness = 0.5
            };
            RootCanvas.Children.Add(wire);
        }

        // 4. Ghost cathode TextBlocks (10 digits, 0-9)
        _ghosts = new TextBlock[10];
        double fontSize    = digitH * 0.72;
        double baseVertical = (canvasH - digitH) / 2.0;

        for (int i = 0; i < 10; i++)
        {
            var tb = new TextBlock
            {
                Text       = i.ToString(),
                FontFamily = new WpfFontFamily("Segoe UI"),
                FontSize   = fontSize,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(WpfColor.FromArgb(0x14, 0xFF, 0x80, 0x00))
            };

            // Measure to center horizontally after adding to canvas
            tb.Measure(new WpfSize(double.PositiveInfinity, double.PositiveInfinity));
            double textW = tb.DesiredSize.Width;
            double textH = tb.DesiredSize.Height;

            double leftPos = (digitW - textW) / 2.0;
            double topPos  = baseVertical + (i * 1.5);

            Canvas.SetLeft(tb, leftPos);
            Canvas.SetTop(tb, topPos);
            RootCanvas.Children.Add(tb);
            _ghosts[i] = tb;
        }

        // 5. Active digit glow ellipse (RadialGradientBrush — NO UIElement.Effect)
        var glowBrush = new RadialGradientBrush();
        glowBrush.GradientStops.Add(new GradientStop(WpfColor.FromArgb(0xA0, 0xFF, 0x8C, 0x00), 0.0));
        glowBrush.GradientStops.Add(new GradientStop(Colors.Transparent, 1.0));

        _glowEllipse = new Ellipse
        {
            Width      = digitW * 1.1,
            Height     = digitH * 0.55,
            Fill       = glowBrush,
            Visibility = Visibility.Collapsed
        };
        RootCanvas.Children.Add(_glowEllipse);

        // 6. Set explicit canvas and control dimensions
        RootCanvas.Width  = digitW;
        RootCanvas.Height = canvasH;
        Width             = digitW;
        Height            = canvasH;
    }

    // ---------------------------------------------------------------
    // Update
    // ---------------------------------------------------------------

    public void UpdateDisplay(int activeDigit)
    {
        if (_ghosts is null || _ghosts.Length == 0) return;

        for (int i = 0; i < 10; i++)
        {
            int distance = Math.Abs(i - activeDigit);
            WpfColor color = distance switch
            {
                0 => WpfColor.FromArgb(0xFF, 0xFF, 0x8C, 0x00), // full warm orange
                1 => WpfColor.FromArgb(0x1E, 0xFF, 0x80, 0x00), // ~12%
                2 => WpfColor.FromArgb(0x18, 0xFF, 0x80, 0x00), // ~9.5%
                _ => WpfColor.FromArgb(0x14, 0xFF, 0x80, 0x00), // ~8%
            };
            _ghosts[i].Foreground = new SolidColorBrush(color);
        }

        if (activeDigit == -1)
        {
            // Blank: set all to base ghost opacity, hide glow
            foreach (var ghost in _ghosts)
                ghost.Foreground = new SolidColorBrush(WpfColor.FromArgb(0x14, 0xFF, 0x80, 0x00));
            _glowEllipse.Visibility = Visibility.Collapsed;
        }
        else
        {
            // Position glow ellipse centered behind the active TextBlock
            var activeGhost = _ghosts[activeDigit];
            double glowLeft = Canvas.GetLeft(activeGhost) + (activeGhost.DesiredSize.Width - _glowEllipse.Width) / 2.0;
            double glowTop  = Canvas.GetTop(activeGhost) + (activeGhost.DesiredSize.Height - _glowEllipse.Height) / 2.0;
            Canvas.SetLeft(_glowEllipse, glowLeft);
            Canvas.SetTop(_glowEllipse, glowTop);
            _glowEllipse.Visibility = Visibility.Visible;
        }
    }
}
