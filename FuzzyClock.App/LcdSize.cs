namespace FuzzyClock.App;

public enum LcdSize { Small, Medium, Large }

public static class LcdSizeMap
{
    public static double ToSegmentHeight(LcdSize size) => size switch
    {
        LcdSize.Small  => 32.0,
        LcdSize.Medium => 48.0,
        LcdSize.Large  => 64.0,
        _ => throw new System.ArgumentOutOfRangeException(nameof(size))
    };
}
