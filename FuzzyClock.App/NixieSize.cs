namespace FuzzyClock.App;

public static class NixieSizeMap
{
    public static double ToDigitHeight(LcdSize size) => size switch
    {
        LcdSize.Small  => 40.0,
        LcdSize.Medium => 56.0,
        LcdSize.Large  => 72.0,
        _ => throw new System.ArgumentOutOfRangeException(nameof(size))
    };
}
