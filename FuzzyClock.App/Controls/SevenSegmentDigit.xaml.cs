using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using FuzzyClock.Core;
using WpfUserControl = System.Windows.Controls.UserControl;
using WpfRectangle = System.Windows.Shapes.Rectangle;
using WpfPoint = System.Windows.Point;

namespace FuzzyClock.App.Controls;

public partial class SevenSegmentDigit : WpfUserControl
{
    // ---------------------------------------------------------------
    // Dependency Properties
    // ---------------------------------------------------------------

    public static readonly DependencyProperty CharacterProperty =
        DependencyProperty.Register(nameof(Character), typeof(char), typeof(SevenSegmentDigit),
            new PropertyMetadata(' ', OnVisualPropertyChanged));

    public static readonly DependencyProperty ThemeProperty =
        DependencyProperty.Register(nameof(Theme), typeof(LcdTheme), typeof(SevenSegmentDigit),
            new PropertyMetadata(LcdTheme.Green, OnVisualPropertyChanged));

    public static readonly DependencyProperty SegmentHeightProperty =
        DependencyProperty.Register(nameof(SegmentHeight), typeof(double), typeof(SevenSegmentDigit),
            new PropertyMetadata(48.0, OnSegmentHeightChanged));

    public char Character
    {
        get => (char)GetValue(CharacterProperty);
        set => SetValue(CharacterProperty, value);
    }

    public LcdTheme Theme
    {
        get => (LcdTheme)GetValue(ThemeProperty);
        set => SetValue(ThemeProperty, value);
    }

    public double SegmentHeight
    {
        get => (double)GetValue(SegmentHeightProperty);
        set => SetValue(SegmentHeightProperty, value);
    }

    private static void OnVisualPropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        => ((SevenSegmentDigit)d).UpdateSegments();

    private static void OnSegmentHeightChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
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

    private SolidColorBrush _litBrush = null!;
    private SolidColorBrush _ghostBrush = null!;
    private SolidColorBrush _bgBrush = null!;
    private LcdTheme _lastTheme = (LcdTheme)(-1); // sentinel — force first rebuild

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
        double t      = h * 0.13;
        double gap    = h * 0.05;
        double pad    = h * 0.05;
        double ch     = t * 0.5;
        double bw     = h * 0.6 - 2 * pad;
        double vhalf  = (h - 3 * t - 4 * gap) / 2;
        double digitW = h * 0.6;
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

        // Colon dots
        _dot1 = new WpfRectangle { Width = t, Height = t };
        Canvas.SetLeft(_dot1, (digitW - t) / 2);
        Canvas.SetTop(_dot1, canvasH / 3 - t / 2);

        _dot2 = new WpfRectangle { Width = t, Height = t };
        Canvas.SetLeft(_dot2, (digitW - t) / 2);
        Canvas.SetTop(_dot2, 2 * canvasH / 3 - t / 2);

        RootCanvas.Children.Add(_dot1);
        RootCanvas.Children.Add(_dot2);

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

        // Rebuild brushes if theme changed
        if (Theme != _lastTheme)
        {
            var (lit, ghost, bg) = LcdPalette.Get(Theme);
            _litBrush   = new SolidColorBrush(lit);
            _ghostBrush = new SolidColorBrush(ghost);
            _bgBrush    = new SolidColorBrush(bg);
            _lastTheme  = Theme;
        }

        _backgroundRect.Fill = _bgBrush;

        double h       = SegmentHeight;
        double digitW  = h * 0.6;
        double t       = h * 0.13;
        double pad     = h * 0.05;
        double canvasH = h + 2 * pad;
        double colonW  = digitW * 0.30;

        if (Character == ':')
        {
            // Hide all 7 segment polygons; show dots as lit
            foreach (var seg in _segments)
                seg.Visibility = Visibility.Hidden;

            _dot1.Fill = _litBrush;
            _dot2.Fill = _litBrush;

            // Narrow the canvas to colon width
            _backgroundRect.Width = colonW;
            RootCanvas.Width = colonW;
            Width = colonW;
        }
        else
        {
            // Show all 7 segment polygons; dots go ghost
            foreach (var seg in _segments)
                seg.Visibility = Visibility.Visible;

            _dot1.Fill = _ghostBrush;
            _dot2.Fill = _ghostBrush;

            // Full digit width
            _backgroundRect.Width = digitW;
            RootCanvas.Width = digitW;
            Width = digitW;

            byte mask = SevenSegmentEncoder.Encode(Character);
            for (int i = 0; i < 7; i++)
                _segments[i].Fill = ((mask >> i) & 1) == 1 ? _litBrush : _ghostBrush;
        }
    }
}
