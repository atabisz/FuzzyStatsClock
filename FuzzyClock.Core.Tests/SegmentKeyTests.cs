using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class RudeSegmentKeyTests
{
    private static readonly RudePhraseProvider _provider = new();

    [TestMethod]
    [DataRow(3, 0, 3, 1)]    // both in bucket 0 (<=2)
    [DataRow(3, 0, 3, 2)]
    [DataRow(3, 3, 3, 5)]    // both in bucket 1 (<=7)
    [DataRow(3, 15, 3, 17)]  // both in bucket 3 (<=17)
    public void SameBucket_ReturnsSameKey(int h1, int m1, int h2, int m2)
    {
        var dt1 = new DateTime(2024, 1, 1, h1, m1, 0);
        var dt2 = new DateTime(2024, 1, 1, h2, m2, 0);
        Assert.AreEqual(_provider.GetSegmentKey(dt1), _provider.GetSegmentKey(dt2));
    }

    [TestMethod]
    [DataRow(3, 2, 3, 3)]    // bucket 0 (<=2) vs bucket 1 (<=7)
    [DataRow(3, 7, 3, 8)]    // bucket 1 vs bucket 2
    [DataRow(3, 27, 3, 28)]  // bucket 5 vs bucket 6
    [DataRow(3, 52, 3, 53)]  // bucket 10 vs bucket 11
    public void AdjacentBuckets_ReturnDifferentKeys(int h1, int m1, int h2, int m2)
    {
        var dt1 = new DateTime(2024, 1, 1, h1, m1, 0);
        var dt2 = new DateTime(2024, 1, 1, h2, m2, 0);
        Assert.AreNotEqual(_provider.GetSegmentKey(dt1), _provider.GetSegmentKey(dt2));
    }

    [TestMethod]
    public void Midnight_ReturnsSpecialKey()
    {
        var dt = new DateTime(2024, 1, 1, 0, 0, 0);
        Assert.AreEqual("en-rude:midnight", _provider.GetSegmentKey(dt));
    }

    [TestMethod]
    public void Noon_ReturnsSpecialKey()
    {
        var dt = new DateTime(2024, 1, 1, 12, 0, 0);
        Assert.AreEqual("en-rude:noon", _provider.GetSegmentKey(dt));
    }
}

[TestClass]
public class PoeticSegmentKeyTests
{
    private static readonly PoeticPhraseProvider _provider = new();

    [TestMethod]
    [DataRow(3, 0, 3, 1)]    // both in bucket 0 (<=2)
    [DataRow(3, 15, 3, 17)]  // both in bucket 3 (<=17)
    public void SameBucket_ReturnsSameKey(int h1, int m1, int h2, int m2)
    {
        var dt1 = new DateTime(2024, 1, 1, h1, m1, 0);
        var dt2 = new DateTime(2024, 1, 1, h2, m2, 0);
        Assert.AreEqual(_provider.GetSegmentKey(dt1), _provider.GetSegmentKey(dt2));
    }

    [TestMethod]
    [DataRow(3, 2, 3, 3)]    // bucket 0 vs bucket 1
    [DataRow(3, 7, 3, 8)]    // bucket 1 vs bucket 2
    public void AdjacentBuckets_ReturnDifferentKeys(int h1, int m1, int h2, int m2)
    {
        var dt1 = new DateTime(2024, 1, 1, h1, m1, 0);
        var dt2 = new DateTime(2024, 1, 1, h2, m2, 0);
        Assert.AreNotEqual(_provider.GetSegmentKey(dt1), _provider.GetSegmentKey(dt2));
    }

    [TestMethod]
    public void WitchingHour_ReturnsSpecialKey()
    {
        var dt = new DateTime(2024, 1, 1, 0, 0, 0);
        Assert.AreEqual("en-poetic:witching", _provider.GetSegmentKey(dt));
    }

    [TestMethod]
    public void Noon_ReturnsSpecialKey()
    {
        var dt = new DateTime(2024, 1, 1, 12, 0, 0);
        Assert.AreEqual("en-poetic:noon", _provider.GetSegmentKey(dt));
    }

    [TestMethod]
    public void DifferentProviders_SameBucket_DifferentKeys()
    {
        // Ensures locale prefix prevents cross-provider key collision
        var rude = new RudePhraseProvider();
        var poetic = new PoeticPhraseProvider();
        var dt = new DateTime(2024, 1, 1, 3, 15, 0);
        Assert.AreNotEqual(rude.GetSegmentKey(dt), poetic.GetSegmentKey(dt));
    }
}

[TestClass]
public class TerseSegmentKeyTests
{
    private static readonly TersePhraseProvider _provider = new();

    [TestMethod]
    [DataRow(3, 0, 3, 1)]    // both in bucket 0 (<=2)
    [DataRow(3, 0, 3, 2)]
    [DataRow(3, 3, 3, 5)]    // both in bucket 1 (<=7)
    [DataRow(3, 15, 3, 17)]  // both in bucket 3 (<=17)
    public void SameBucket_ReturnsSameKey(int h1, int m1, int h2, int m2)
    {
        var dt1 = new DateTime(2024, 1, 1, h1, m1, 0);
        var dt2 = new DateTime(2024, 1, 1, h2, m2, 0);
        Assert.AreEqual(_provider.GetSegmentKey(dt1), _provider.GetSegmentKey(dt2));
    }

    [TestMethod]
    [DataRow(3, 2, 3, 3)]    // bucket 0 (<=2) vs bucket 1 (<=7)
    [DataRow(3, 7, 3, 8)]    // bucket 1 vs bucket 2
    [DataRow(3, 32, 3, 33)]  // bucket 5 vs bucket 6
    [DataRow(3, 52, 3, 53)]  // bucket 10 (last bucket)
    public void AdjacentBuckets_ReturnDifferentKeys(int h1, int m1, int h2, int m2)
    {
        var dt1 = new DateTime(2024, 1, 1, h1, m1, 0);
        var dt2 = new DateTime(2024, 1, 1, h2, m2, 0);
        Assert.AreNotEqual(_provider.GetSegmentKey(dt1), _provider.GetSegmentKey(dt2));
    }

    [TestMethod]
    public void Midnight_ReturnsSpecialKey()
    {
        var dt = new DateTime(2024, 1, 1, 0, 0, 0);
        Assert.AreEqual("en-terse:midnight", _provider.GetSegmentKey(dt));
    }

    [TestMethod]
    public void Noon_ReturnsSpecialKey()
    {
        var dt = new DateTime(2024, 1, 1, 12, 0, 0);
        Assert.AreEqual("en-terse:noon", _provider.GetSegmentKey(dt));
    }
}

[TestClass]
public class ClassicSegmentKeyTests
{
    private static readonly EnglishPhraseProvider _provider = new();

    [TestMethod]
    [DataRow(3, 0, 3, 1)]    // both in bucket 0 (<=2)
    [DataRow(3, 0, 3, 2)]
    [DataRow(3, 3, 3, 5)]    // both in bucket 1 (<=7)
    [DataRow(3, 15, 3, 17)]  // both in bucket 3 (<=17)
    public void SameBucket_ReturnsSameKey(int h1, int m1, int h2, int m2)
    {
        var dt1 = new DateTime(2024, 1, 1, h1, m1, 0);
        var dt2 = new DateTime(2024, 1, 1, h2, m2, 0);
        Assert.AreEqual(_provider.GetSegmentKey(dt1), _provider.GetSegmentKey(dt2));
    }

    [TestMethod]
    [DataRow(3, 2, 3, 3)]    // bucket 0 (<=2) vs bucket 1 (<=7)
    [DataRow(3, 7, 3, 8)]    // bucket 1 vs bucket 2
    [DataRow(3, 27, 3, 28)]  // bucket 5 vs bucket 6
    [DataRow(3, 52, 3, 53)]  // bucket 10 vs bucket 11
    public void AdjacentBuckets_ReturnDifferentKeys(int h1, int m1, int h2, int m2)
    {
        var dt1 = new DateTime(2024, 1, 1, h1, m1, 0);
        var dt2 = new DateTime(2024, 1, 1, h2, m2, 0);
        Assert.AreNotEqual(_provider.GetSegmentKey(dt1), _provider.GetSegmentKey(dt2));
    }

    [TestMethod]
    public void Midnight_ReturnsSpecialKey()
    {
        var dt = new DateTime(2024, 1, 1, 0, 0, 0);
        Assert.AreEqual("en-classic:midnight", _provider.GetSegmentKey(dt));
    }

    [TestMethod]
    public void Noon_ReturnsSpecialKey()
    {
        var dt = new DateTime(2024, 1, 1, 12, 0, 0);
        Assert.AreEqual("en-classic:noon", _provider.GetSegmentKey(dt));
    }
}
