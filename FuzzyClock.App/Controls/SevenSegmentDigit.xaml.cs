using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using FuzzyClock.Core;
using WpfUserControl = System.Windows.Controls.UserControl;
using WpfRectangle   = System.Windows.Shapes.Rectangle;
using WpfColor       = System.Windows.Media.Color;
using WpfPoint       = System.Windows.Point;

namespace FuzzyClock.App.Controls;

public partial class SevenSegmentDigit : WpfUserControl
{
    // ---------------------------------------------------------------
    // Dependency Properties
    // ---------------------------------------------------------------

    public static readonly DependencyProperty CharacterProperty =
        DependencyProperty.Register(nameof(Character), typeof(char), typeof(SevenSegmentDigit),
            new PropertyMetadata(' ', OnVisualPropertyChanged));

    public static readonly DependencyProperty LitColorProperty =
        DependencyProperty.Register(nameof(LitColor), typeof(WpfColor), typeof(SevenSegmentDigit),
            new PropertyMetadata(Colors.White, OnVisualPropertyChanged));

    public static readonly DependencyProperty BgColorProperty =
        DependencyProperty.Register(nameof(BgColor), typeof(WpfColor), typeof(SevenSegmentDigit),
            new PropertyMetadata(WpfColor.FromRgb(0x0F, 0x0F, 0x0F), OnVisualPropertyChanged));

    // Transparent = auto-compute ghost from LitColor (15% formula)
    public static readonly DependencyProperty GhostColorProperty =
        DependencyProperty.Register(nameof(GhostColor), typeof(WpfColor), typeof(SevenSegmentDigit),
            new PropertyMetadata(Colors.Transparent, OnVisualPropertyChanged));

    public static readonly DependencyProperty SegmentHeightProperty =
        DependencyProperty.Register(nameof(SegmentHeight), typeof(double), typeof(SevenSegmentDigit),
            new PropertyMetadata(48.0, OnSegmentHeightChanged));

    // "Classic" (default) = slender segments with gaps; "Bold" = thick segments, minimal gaps
    public static readonly DependencyProperty SegmentStyleProperty =
        DependencyProperty.Register(nameof(SegmentStyle), typeof(string), typeof(SevenSegmentDigit),
            new PropertyMetadata("Classic", OnSegmentStyleChanged));

    // For colon digits: true = dots lit, false = dots ghost (blink-off state). Width never changes.
    public static readonly DependencyProperty ColonOnProperty =
        DependencyProperty.Register(nameof(ColonOn), typeof(bool), typeof(SevenSegmentDigit),
            new PropertyMetadata(true, OnVisualPropertyChanged));

    public char Character
    {
        get => (char)GetValue(CharacterProperty);
        set => SetValue(CharacterProperty, value);
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

    public double SegmentHeight
    {
        get => (double)GetValue(SegmentHeightProperty);
        set => SetValue(SegmentHeightProperty, value);
    }

    public string SegmentStyle
    {
        get => (string)GetValue(SegmentStyleProperty);
        set => SetValue(SegmentStyleProperty, value);
    }

    public bool ColonOn
    {
        get => (bool)GetValue(ColonOnProperty);
        set => SetValue(ColonOnProperty, value);
    }

    private static void OnVisualPropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        => ((SevenSegmentDigit)d).UpdateSegments();

    private static void OnSegmentHeightChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        var ctrl = (SevenSegmentDigit)d;
        ctrl.RebuildGeometry();
        ctrl.UpdateSegments();
    }

    private static void OnSegmentStyleChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        var ctrl = (SevenSegmentDigit)d;
        ctrl.RebuildGeometry();
        ctrl.UpdateSegments();
    }

    // ---------------------------------------------------------------
    // Fields
    // ---------------------------------------------------------------

    private Polygon[] _segments = Array.Empty<Polygon>();
    private WpfRectangle _dot1 = null!;
    private WpfRectangle _dot2 = null!;
    private WpfRectangle _backgroundRect = null!;

    private SolidColorBrush _litBrush   = null!;
    private SolidColorBrush _ghostBrush = null!;
    private SolidColorBrush _bgBrush    = null!;
    private WpfColor _lastLitColor   = WpfColor.FromArgb(0, 0, 0, 0); // sentinel — force first brush rebuild
    private WpfColor _lastBgColor    = WpfColor.FromArgb(0, 0, 0, 0);
    private WpfColor _lastGhostColor = WpfColor.FromArgb(0, 0, 0, 0);

    // Geometry cache — set by RebuildGeometry(), consumed by UpdateSegments()
    private double _builtDigitW;
    private double _builtColonW;
    private double _builtCanvasH;

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    public SevenSegmentDigit()
    {
        InitializeComponent();
        RebuildGeometry();
        UpdateSegments();
    }

    // ---------------------------------------------------------------
    // Geometry
    // ---------------------------------------------------------------

    private void RebuildGeometry()
    {
        RootCanvas.Children.Clear();

        double h = SegmentHeight;

        // Classic: slender segments, visible gaps, standard proportions
        // Bold:    thick segments, minimal gaps, wider digit (Bodet-style display)
        double t, gap, pad, ch, digitW;
        if (SegmentStyle == "Bold")
        {
            t      = h * 0.19;
            gap    = h * 0.012;
            pad    = h * 0.04;
            ch     = t * 0.25;
            digitW = h * 0.70;
        }
        else // "Classic"
        {
            t      = h * 0.10;
            gap    = h * 0.05;
            pad    = h * 0.05;
            ch     = t * 0.50;
            digitW = h * 0.60;
        }

        double bw     = digitW - 2 * pad;
        double vhalf  = (h - 3 * t - 4 * gap) / 2;
        double canvasH = h + 2 * pad;

        // Background
        _backgroundRect = new WpfRectangle { Width = digitW, Height = canvasH };
        Canvas.SetLeft(_backgroundRect, 0);
        Canvas.SetTop(_backgroundRect, 0);
        RootCanvas.Children.Add(_backgroundRect);

        // 7 segments
        _segments = new Polygon[7];

        // Segment origins: (index, type, x, y)
        // 0 = a (top horiz)
        _segments[0] = MakePolygon(HorizontalSegment(pad, pad, bw, t, ch));
        // 1 = b (top-right vert)
        _segments[1] = MakePolygon(VerticalSegment(pad + bw - t + gap, pad + t + gap, vhalf, t, ch));
        // 2 = c (bot-right vert)
        _segments[2] = MakePolygon(VerticalSegment(pad + bw - t + gap, pad + t + gap + vhalf + t + 2 * gap, vhalf, t, ch));
        // 3 = d (bottom horiz)
        _segments[3] = MakePolygon(HorizontalSegment(pad, pad + 2 * t + 2 * vhalf + 4 * gap, bw, t, ch));
        // 4 = e (bot-left vert)
        _segments[4] = MakePolygon(VerticalSegment(pad + gap, pad + t + gap + vhalf + t + 2 * gap, vhalf, t, ch));
        // 5 = f (top-left vert)
        _segments[5] = MakePolygon(VerticalSegment(pad + gap, pad + t + gap, vhalf, t, ch));
        // 6 = g (middle horiz)
        _segments[6] = MakePolygon(HorizontalSegment(pad, pad + t + vhalf + 2 * gap, bw, t, ch));

        foreach (var seg in _segments)
            RootCanvas.Children.Add(seg);

        // Colon dots — sized to fit within the narrow colon slot (t * 3 gives 1t padding each side)
        double colonW = t * 3.0;
        _dot1 = new WpfRectangle { Width = t, Height = t };
        Canvas.SetLeft(_dot1, (colonW - t) / 2);
        Canvas.SetTop(_dot1, canvasH / 3 - t / 2);

        _dot2 = new WpfRectangle { Width = t, Height = t };
        Canvas.SetLeft(_dot2, (colonW - t) / 2);
        Canvas.SetTop(_dot2, 2 * canvasH / 3 - t / 2);

        RootCanvas.Children.Add(_dot1);
        RootCanvas.Children.Add(_dot2);

        _builtDigitW = digitW;
        _builtColonW = colonW;
        _builtCanvasH = canvasH;

        RootCanvas.Width = digitW;
        RootCanvas.Height = canvasH;
        Width = digitW;
        Height = canvasH;
    }

    private static Polygon MakePolygon(PointCollection points)
        => new Polygon { Points = points };

    private static PointCollection HorizontalSegment(double x, double y, double barWidth, double thickness, double ch)
        => new PointCollection
        {
            new WpfPoint(x + ch, y),
            new WpfPoint(x + barWidth - ch, y),
            new WpfPoint(x + barWidth, y + ch),
            new WpfPoint(x + barWidth - ch, y + thickness),
            new WpfPoint(x + ch, y + thickness),
            new WpfPoint(x, y + ch)
        };

    private static PointCollection VerticalSegment(double x, double y, double barHeight, double thickness, double ch)
        => new PointCollection
        {
            new WpfPoint(x + ch, y),
            new WpfPoint(x + thickness, y + ch),
            new WpfPoint(x + thickness, y + barHeight - ch),
            new WpfPoint(x + ch, y + barHeight),
            new WpfPoint(x, y + barHeight - ch),
            new WpfPoint(x, y + ch)
        };

    // ---------------------------------------------------------------
    // Update
    // ---------------------------------------------------------------

    private void UpdateSegments()
    {
        if (_segments is null || _segments.Length == 0) return;

        // Compute effective ghost: Transparent sentinel means auto-compute from LitColor
        var effectiveGhost = GhostColor.A == 0
            ? WpfColor.FromRgb(
                (byte)(LitColor.R * 15 / 100),
                (byte)(LitColor.G * 15 / 100),
                (byte)(LitColor.B * 15 / 100))
            : GhostColor;

        // Rebuild brushes if any color changed
        if (LitColor != _lastLitColor || BgColor != _lastBgColor || effectiveGhost != _lastGhostColor)
        {
            _litBrush       = new SolidColorBrush(LitColor);
            _ghostBrush     = new SolidColorBrush(effectiveGhost);
            _bgBrush        = new SolidColorBrush(BgColor);
            _lastLitColor   = LitColor;
            _lastBgColor    = BgColor;
            _lastGhostColor = effectiveGhost;
        }

        _backgroundRect.Fill = _bgBrush;

        if (Character == ':')
        {
            // Hide all 7 segment polygons; dots lit or ghost based on ColonOn (blink state)
            foreach (var seg in _segments)
                seg.Visibility = Visibility.Hidden;

            var dotBrush = ColonOn ? _litBrush : _ghostBrush;
            _dot1.Fill = dotBrush;
            _dot2.Fill = dotBrush;

            // Narrow the canvas to colon width (never changes — no layout shift)
            _backgroundRect.Width = _builtColonW;
            RootCanvas.Width = _builtColonW;
            Width = _builtColonW;
        }
        else
        {
            // Show all 7 segment polygons; dots go ghost
            foreach (var seg in _segments)
                seg.Visibility = Visibility.Visible;

            _dot1.Fill = _ghostBrush;
            _dot2.Fill = _ghostBrush;

            // Full digit width
            _backgroundRect.Width = _builtDigitW;
            RootCanvas.Width = _builtDigitW;
            Width = _builtDigitW;

            byte mask = SevenSegmentEncoder.Encode(Character);
            for (int i = 0; i < 7; i++)
                _segments[i].Fill = ((mask >> i) & 1) == 1 ? _litBrush : _ghostBrush;
        }
    }
}
