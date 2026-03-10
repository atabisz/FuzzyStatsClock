namespace FuzzyClock.Core;

/// <summary>
/// Maps display characters to 7-segment bitmasks.
/// Bits 0–6 map to segments a–g (bit 0 = a top-horiz, ... bit 6 = g middle-horiz).
/// Bit 7 (0x80) is the colon sentinel — the renderer special-cases it as two dots,
/// not as segment data.
/// </summary>
public static class SevenSegmentEncoder
{
    public static byte Encode(char c) => c switch
    {
        '0' => 0x3F,
        '1' => 0x06,
        '2' => 0x5B,
        '3' => 0x4F,
        '4' => 0x66,
        '5' => 0x6D,
        '6' => 0x7D,
        '7' => 0x07,
        '8' => 0x7F,
        '9' => 0x6F,
        ':' => 0x80,
        ' ' => 0x00,
        _   => throw new ArgumentException($"Unsupported character: '{c}'", nameof(c))
    };
}
