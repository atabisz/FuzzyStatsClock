using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class SevenSegmentEncoderTests
{
    [TestMethod]
    [DataRow('0', (byte)0x3F)]
    [DataRow('1', (byte)0x06)]
    [DataRow('2', (byte)0x5B)]
    [DataRow('3', (byte)0x4F)]
    [DataRow('4', (byte)0x66)]
    [DataRow('5', (byte)0x6D)]
    [DataRow('6', (byte)0x7D)]
    [DataRow('7', (byte)0x07)]
    [DataRow('8', (byte)0x7F)]
    [DataRow('9', (byte)0x6F)]
    [DataRow(':', (byte)0x80)]
    [DataRow(' ', (byte)0x00)]
    public void Encode_KnownCharacter_ReturnsExpectedMask(char c, byte expected)
    {
        Assert.AreEqual(expected, SevenSegmentEncoder.Encode(c));
    }

    [TestMethod]
    public void Encode_UnsupportedCharacter_ThrowsArgumentException()
    {
        Assert.Throws<ArgumentException>(() => SevenSegmentEncoder.Encode('X'));
    }
}
