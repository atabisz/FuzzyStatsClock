using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using WpfUserControl = System.Windows.Controls.UserControl;
using WpfColor       = System.Windows.Media.Color;
using WpfRectangle   = System.Windows.Shapes.Rectangle;

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
    // Static cathode path data (30×50 coordinate space)
    // ---------------------------------------------------------------

    private static readonly string[] DigitPaths =
    {
        // 0: oval — four quarter arcs CW
        "M 15,3 A 11,22 0 0 1 26,25 A 11,22 0 0 1 15,47 A 11,22 0 0 1 4,25 A 11,22 0 0 1 15,3 Z",
        // 1: diagonal top hook + vertical stem
        "M 10,9 L 14,5 L 14,49",
        // 2: reverse-S curve
        "M 6,13 C 6,5 26,5 26,15 C 26,24 6,32 6,49 L 26,49",
        // 3: two open loops
        "M 6,10 C 6,5 26,5 26,16 C 26,23 17,27 26,30 C 26,42 6,50 6,46",
        // 4: diagonal down + horizontal bar + vertical
        "M 23,5 L 6,31 L 27,31 M 23,5 L 23,49",
        // 5: top horizontal + left vertical + curve
        "M 26,5 L 6,5 L 6,27 C 16,23 26,24 26,38 C 26,49 6,50 6,46",
        // 6: hooked descender with inner loop
        "M 24,7 C 9,2 4,15 4,29 C 4,41 9,49 17,49 C 25,49 27,41 27,33 C 27,25 21,23 15,25 C 9,27 4,34 4,45",
        // 7: top bar + diagonal
        "M 5,5 L 26,5 L 12,49",
        // 8: two stacked loops
        "M 16,27 C 6,27 6,5 16,5 C 26,5 26,27 16,27 C 6,27 6,49 16,49 C 26,49 26,27 16,27",
        // 9: upper loop + descending tail (tail originates from loop's lower-right)
        "M 5,20 C 5,9 9,4 16,4 C 23,4 27,11 27,19 C 27,27 22,31 16,30 C 10,29 5,23 5,20 C 5,17 10,15 18,17 C 24,19 27,28 25,38 C 23,46 17,50 11,49",
    };

    // Glow layer config: outermost (index 0) → core (index 3)
    private static readonly double[] GlowWidthMultipliers = { 3.6, 2.4, 1.6, 1.0 };
    private static readonly double[] GlowBaseOpacities    = { 0.04, 0.10, 0.30, 1.0 };
    private static readonly WpfColor[] GlowLayerColors =
    {
        WpfColor.FromRgb(0xFF, 0x78, 0x00),  // halo
        WpfColor.FromRgb(0xFF, 0x8C, 0x00),  // mid glow
        WpfColor.FromRgb(0xFF, 0xA0, 0x00),  // inner bloom
        WpfColor.FromRgb(0xFF, 0xB8, 0x14),  // core (warm amber-cream)
    };

    private static readonly Random _rng = new();

    // ---------------------------------------------------------------
    // Fields
    // ---------------------------------------------------------------

    private Path[]     _ghostPaths       = Array.Empty<Path>();
    private Path[]     _glowPaths        = Array.Empty<Path>();
    private Geometry[] _scaledGeometries = Array.Empty<Geometry>();

    private DispatcherTimer _flickerTimer    = null!;
    private double          _flickerCurrent  = 1.0;
    private double          _flickerTarget   = 1.0;
    private DateTime        _flickerNextChange = DateTime.MinValue;

    // Geometry cache
    private double _builtDigitW;
    private double _builtDigitH;

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    public NixieDigit()
    {
        InitializeComponent();
        _flickerTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(40) };
        _flickerTimer.Tick += OnFlickerTick;
        Unloaded += (_, _) => _flickerTimer.Stop();
        RebuildGeometry();
        UpdateDisplay(ActiveDigit);
    }

    // ---------------------------------------------------------------
    // Geometry
    // ---------------------------------------------------------------

    private void RebuildGeometry()
    {
        _flickerTimer?.Stop();
        RootCanvas.Children.Clear();

        double digitH     = DigitHeight;
        double digitW     = digitH * 0.62;
        double canvasH    = digitH + 21;
        double tubePad    = 4.0;
        double scale      = digitH / 50.0;
        double baseStroke = Math.Max(2.0, digitH * 0.05);
        double depthOffset = 1.0;
        double centerX    = (digitW - 30.0 * scale) / 2.0;
        double centerY    = (canvasH - 50.0 * scale) / 2.0;

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

        // 3. Wire mesh overlay (thin horizontal scan lines)
        for (double y = tubePad; y <= canvasH - tubePad; y += 7.0)
        {
            var wire = new Line
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

        // 4. Build scaled geometry cache — one per digit, with depth-stacking offset baked in
        _scaledGeometries = new Geometry[10];
        for (int i = 0; i < 10; i++)
        {
            var geom = Geometry.Parse(DigitPaths[i]);
            var xform = new TransformGroup();
            xform.Children.Add(new ScaleTransform(scale, scale));
            xform.Children.Add(new TranslateTransform(centerX, centerY + i * depthOffset));
            geom.Transform = xform;
            _scaledGeometries[i] = geom;
        }

        // 5. Ghost cathode paths (all 10 digits, always visible at medium alpha)
        _ghostPaths = new Path[10];
        for (int i = 0; i < 10; i++)
        {
            var p = new Path
            {
                Data            = _scaledGeometries[i],
                Stroke          = new SolidColorBrush(WpfColor.FromArgb(0x21, 0xFF, 0x78, 0x00)),
                StrokeThickness = baseStroke,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap   = PenLineCap.Round,
                StrokeLineJoin     = PenLineJoin.Round,
                Fill            = System.Windows.Media.Brushes.Transparent
            };
            RootCanvas.Children.Add(p);
            _ghostPaths[i] = p;
        }

        // 6. Active glow paths (4 concentric stroke layers, Z-order: outermost first)
        _glowPaths = new Path[4];
        for (int layer = 0; layer < 4; layer++)
        {
            var p = new Path
            {
                Stroke          = new SolidColorBrush(GlowLayerColors[layer]),
                StrokeThickness = baseStroke * GlowWidthMultipliers[layer],
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap   = PenLineCap.Round,
                StrokeLineJoin     = PenLineJoin.Round,
                Fill            = System.Windows.Media.Brushes.Transparent,
                Opacity         = GlowBaseOpacities[layer],
                Visibility      = Visibility.Collapsed
            };
            RootCanvas.Children.Add(p);
            _glowPaths[layer] = p;
        }

        // 7. Canvas and control dimensions
        RootCanvas.Width  = digitW;
        RootCanvas.Height = canvasH;
        Width             = digitW;
        Height            = canvasH;
    }

    // ---------------------------------------------------------------
    // Flicker
    // ---------------------------------------------------------------

    private void OnFlickerTick(object? sender, EventArgs e)
    {
        // Placeholder — implemented in Task 3 alongside UpdateDisplay rewrite
    }

    // ---------------------------------------------------------------
    // Update
    // ---------------------------------------------------------------

    public void UpdateDisplay(int activeDigit)
    {
        if (_glowPaths is null || _glowPaths.Length == 0) return;

        if (activeDigit == -1)
        {
            foreach (var p in _glowPaths)
                p.Visibility = Visibility.Collapsed;
            _flickerTimer?.Stop();
            return;
        }

        var geom = _scaledGeometries[activeDigit];
        foreach (var p in _glowPaths)
        {
            p.Data       = geom;
            p.Visibility = Visibility.Visible;
        }

        _flickerCurrent   = 1.0;
        _flickerTarget    = 1.0;
        _flickerTimer?.Start();
    }
}
