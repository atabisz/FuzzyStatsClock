using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class EnglishPhraseProviderExpandedTests
{
    // Use provider directly — avoids race on PhraseEngine._activeProvider shared static.
    private static readonly IPhraseProvider _provider = new EnglishPhraseProvider();

    [TestMethod]
    public void Classic_AllBuckets_PhraseContainsHourWord()
    {
        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

        foreach (int minute in sampleMinutes)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));
            bool hasHour = phrase.Contains("three", StringComparison.OrdinalIgnoreCase) ||
                          phrase.Contains("four", StringComparison.OrdinalIgnoreCase);
            Assert.IsTrue(hasHour, $"Minute {minute} phrase '{phrase}' should contain 'three' or 'four'");
        }
    }

    [TestMethod]
    public void Classic_Noon_ContainsNoonVariant()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        bool hasNoonVariant = phrase.Contains("noon", StringComparison.OrdinalIgnoreCase) ||
                             phrase.Contains("midday", StringComparison.OrdinalIgnoreCase) ||
                             phrase.Contains("noontime", StringComparison.OrdinalIgnoreCase);
        Assert.IsTrue(hasNoonVariant, $"Noon phrase '{phrase}' should contain noon/midday/noontime");
    }

    [TestMethod]
    public void Classic_Midnight_ContainsMidnightVariant()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.IsTrue(phrase.Contains("midnight", StringComparison.OrdinalIgnoreCase),
            $"Midnight phrase '{phrase}' should contain 'midnight'");
    }

    [TestMethod]
    public void Classic_GetSegmentKey_SameBucket_ReturnsSameKey()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 0, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        Assert.AreEqual(key1, key2, "Minutes 0 and 2 should return the same bucket key");
    }

    [TestMethod]
    public void Classic_GetSegmentKey_AdjacentBuckets_ReturnDifferentKeys()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 3, 0));
        Assert.AreNotEqual(key1, key2, "Minutes 2 and 3 should return different bucket keys");
    }

    [TestMethod]
    public void Classic_GetSegmentKey_Noon_ReturnsNoonKey()
    {
        string key = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("en-classic:noon", key);
    }

    [TestMethod]
    public void Classic_GetSegmentKey_Midnight_ReturnsMidnightKey()
    {
        string key = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.AreEqual("en-classic:midnight", key);
    }

    [TestMethod]
    public void Classic_GetStructuredPhrase_OnTheHour_HasEmphasis()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        Assert.IsFalse(string.IsNullOrEmpty(emphasis), "On-the-hour emphasis should not be empty");
        Assert.IsTrue(emphasis.Contains("three", StringComparison.OrdinalIgnoreCase),
            $"Emphasis '{emphasis}' should contain 'three'");
    }

    [TestMethod]
    public void Classic_GetStructuredPhrase_QuarterPast_SplitsCorrectly()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 15, 0));
        Assert.AreEqual("three", emphasis, "Quarter past emphasis should be 'three'");
        Assert.IsFalse(string.IsNullOrEmpty(qualifier), "Quarter past qualifier should not be empty");
    }

    [TestMethod]
    public void Classic_GetStructuredPhrase_QuarterTo_SplitsCorrectly()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 45, 0));
        Assert.AreEqual("four", emphasis, "Quarter to emphasis should be 'four' (next hour)");
        Assert.IsFalse(string.IsNullOrEmpty(qualifier), "Quarter to qualifier should not be empty");
    }

    [TestMethod]
    public void Classic_GetStructuredPhrase_Noon_EmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("", qualifier, "Noon qualifier should be empty");
        bool hasNoonVariant = emphasis.Contains("noon", StringComparison.OrdinalIgnoreCase) ||
                             emphasis.Contains("midday", StringComparison.OrdinalIgnoreCase) ||
                             emphasis.Contains("noontime", StringComparison.OrdinalIgnoreCase);
        Assert.IsTrue(hasNoonVariant, $"Noon emphasis '{emphasis}' should contain noon/midday/noontime");
    }

    [TestMethod]
    public void Classic_GetStructuredPhrase_Midnight_EmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.AreEqual("", qualifier, "Midnight qualifier should be empty");
        Assert.IsTrue(emphasis.Contains("midnight", StringComparison.OrdinalIgnoreCase),
            $"Midnight emphasis '{emphasis}' should contain 'midnight'");
    }

    [TestMethod]
    public void Classic_Randomization_ProducesVariety()
    {
        var distinctPhrases = new HashSet<string>();
        var testTime = new DateTime(2024, 1, 1, 3, 15, 0);

        for (int i = 0; i < 50; i++)
        {
            string phrase = _provider.GetPhrase(testTime);
            distinctPhrases.Add(phrase);
        }

        Assert.IsTrue(distinctPhrases.Count >= 2,
            $"Expected randomization to produce at least 2 distinct phrases, got {distinctPhrases.Count}");
    }
}
