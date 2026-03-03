namespace FuzzyClock.Core;

/// <summary>Lightweight RGB color value for contrast calculations (no WPF dependency).</summary>
public readonly record struct RgbColor(byte R, byte G, byte B);

/// <summary>Auto-contrast state machine state.</summary>
public enum ContrastState
{
    /// <summary>Accent color currently meets the contrast threshold (or feature is disabled).</summary>
    Normal,
    /// <summary>Accent was replaced with an adjusted or fallback color to meet contrast threshold.</summary>
    Override
}

/// <summary>
/// Pure WCAG 2.1 contrast math and hysteresis state machine.
/// All methods are stateless; no WPF types are referenced.
/// </summary>
internal static class ContrastService
{
    // WCAG AA threshold: enter Override when ratio drops below this.
    private const double EnterThreshold = 4.5;
    // Hysteresis: exit Override only when ratio rises above this.
    private const double ExitThreshold = 5.5;

    /// <summary>
    /// Computes WCAG 2.1 relative luminance for an RGB color.
    /// Alpha is ignored (treated as fully opaque).
    /// </summary>
    public static double RelativeLuminance(RgbColor c)
    {
        double linR = Linearize(c.R);
        double linG = Linearize(c.G);
        double linB = Linearize(c.B);
        return 0.2126 * linR + 0.7152 * linG + 0.0722 * linB;
    }

    /// <summary>
    /// Computes WCAG 2.1 contrast ratio between two colors.
    /// Range: 1.0 (identical) to 21.0 (black vs white).
    /// </summary>
    public static double ContrastRatio(RgbColor a, RgbColor b)
    {
        double la = RelativeLuminance(a);
        double lb = RelativeLuminance(b);
        double lighter = Math.Max(la, lb);
        double darker = Math.Min(la, lb);
        return (lighter + 0.05) / (darker + 0.05);
    }

    /// <summary>
    /// Applies auto-contrast hysteresis logic to decide what color to display.
    /// </summary>
    /// <param name="background">Average sampled background color behind the widget.</param>
    /// <param name="accent">The configured accent color.</param>
    /// <param name="currentState">The current hysteresis state from the previous call.</param>
    /// <returns>The color to display and the new hysteresis state.</returns>
    public static (RgbColor displayColor, ContrastState newState) ComputeDisplayColor(
        RgbColor background, RgbColor accent, ContrastState currentState)
    {
        double ratio = ContrastRatio(background, accent);

        // Hysteresis exit: accent now passes exit threshold — restore it.
        if (ratio > ExitThreshold && currentState == ContrastState.Override)
            return (accent, ContrastState.Normal);

        // Accent already passes enter threshold and we are in Normal state — no change needed.
        if (ratio >= EnterThreshold && currentState == ContrastState.Normal)
            return (accent, ContrastState.Normal);

        // Need override (ratio < enter threshold, or in hysteresis band while still Override).
        // Step 1: try to adjust the accent lightness to reach threshold.
        RgbColor adjusted = AdjustAccent(background, accent);
        if (ContrastRatio(background, adjusted) >= EnterThreshold)
            return (adjusted, ContrastState.Override);

        // Step 2: fallback to pure black or white — whichever has higher contrast.
        var black = new RgbColor(0, 0, 0);
        var white = new RgbColor(255, 255, 255);
        RgbColor fallback = ContrastRatio(background, white) >= ContrastRatio(background, black)
            ? white
            : black;
        return (fallback, ContrastState.Override);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// <summary>
    /// Attempts to adjust accent lightness in HSL space to achieve >= 4.5:1 contrast
    /// against the background. Darkens on light backgrounds, lightens on dark backgrounds.
    /// Steps by 5 lightness units per iteration, up to ±40 units max.
    /// Returns the original accent if no suitable adjustment is found.
    /// </summary>
    internal static RgbColor AdjustAccent(RgbColor background, RgbColor accent)
    {
        double bgLum = RelativeLuminance(background);
        int direction = bgLum > 0.5 ? -1 : +1; // darken on light bg, lighten on dark bg

        var (h, s, l) = ColorToHsl(accent);

        for (int step = 5; step <= 40; step += 5)
        {
            double newL = Math.Clamp(l + direction * step, 0.0, 100.0);
            RgbColor candidate = HslToColor(h, s, newL);
            if (ContrastRatio(background, candidate) >= EnterThreshold)
                return candidate;
        }

        return accent; // caller falls back to black/white
    }

    /// <summary>Converts an RgbColor to HSL. Hue in [0, 360), Saturation in [0, 100], Lightness in [0, 100].</summary>
    internal static (double h, double s, double l) ColorToHsl(RgbColor c)
    {
        double r = c.R / 255.0;
        double g = c.G / 255.0;
        double b = c.B / 255.0;

        double max = Math.Max(r, Math.Max(g, b));
        double min = Math.Min(r, Math.Min(g, b));
        double delta = max - min;

        double l = (max + min) / 2.0 * 100.0;

        double s;
        if (delta == 0.0)
        {
            s = 0.0;
        }
        else
        {
            // Avoid division by zero when l is exactly 0 or 100.
            double denom = 1.0 - Math.Abs((max + min) - 1.0);
            s = denom == 0.0 ? 0.0 : delta / denom * 100.0;
        }

        double h;
        if (delta == 0.0)
        {
            h = 0.0;
        }
        else if (max == r)
        {
            h = 60.0 * (((g - b) / delta) % 6.0);
        }
        else if (max == g)
        {
            h = 60.0 * ((b - r) / delta + 2.0);
        }
        else
        {
            h = 60.0 * ((r - g) / delta + 4.0);
        }

        h = (h + 360.0) % 360.0;

        return (h, s, l);
    }

    /// <summary>Converts HSL (h in [0,360), s and l in [0,100]) back to RgbColor.</summary>
    internal static RgbColor HslToColor(double h, double s, double l)
    {
        s /= 100.0;
        l /= 100.0;

        double c = (1.0 - Math.Abs(2.0 * l - 1.0)) * s;
        double x = c * (1.0 - Math.Abs((h / 60.0) % 2.0 - 1.0));
        double m = l - c / 2.0;

        double r, g, b;
        if (h < 60.0)      { r = c; g = x; b = 0; }
        else if (h < 120.0) { r = x; g = c; b = 0; }
        else if (h < 180.0) { r = 0; g = c; b = x; }
        else if (h < 240.0) { r = 0; g = x; b = c; }
        else if (h < 300.0) { r = x; g = 0; b = c; }
        else               { r = c; g = 0; b = x; }

        return new RgbColor(
            (byte)Math.Round((r + m) * 255.0),
            (byte)Math.Round((g + m) * 255.0),
            (byte)Math.Round((b + m) * 255.0));
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private static double Linearize(byte channel)
    {
        double sRgb = channel / 255.0;
        return sRgb <= 0.04045
            ? sRgb / 12.92
            : Math.Pow((sRgb + 0.055) / 1.055, 2.4);
    }
}
