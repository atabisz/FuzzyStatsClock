namespace FuzzyClock.App;

public enum LcdTheme { Green, Amber, Blue, Teal, Red }

public static class LcdPalette
{
    public static (System.Windows.Media.Color Lit, System.Windows.Media.Color Ghost, System.Windows.Media.Color Background)
        Get(LcdTheme theme) => theme switch
    {
        LcdTheme.Green => (Color(0x00,0xFF,0x41), Color(0x00,0x33,0x10), Color(0x00,0x1A,0x00)),
        LcdTheme.Amber => (Color(0xFF,0xAA,0x00), Color(0x3D,0x28,0x00), Color(0x1A,0x0A,0x00)),
        LcdTheme.Blue  => (Color(0x00,0xCF,0xFF), Color(0x00,0x2A,0x35), Color(0x00,0x00,0x1A)),
        LcdTheme.Teal  => (Color(0x00,0xB4,0xB4), Color(0x00,0x25,0x25), Color(0x00,0x10,0x10)),
        LcdTheme.Red   => (Color(0xFF,0x22,0x00), Color(0x38,0x08,0x00), Color(0x1A,0x00,0x00)),
        _ => throw new System.ArgumentOutOfRangeException(nameof(theme))
    };
    private static System.Windows.Media.Color Color(byte r, byte g, byte b)
        => System.Windows.Media.Color.FromRgb(r, g, b);
}
