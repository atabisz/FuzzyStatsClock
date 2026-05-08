using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

/// <summary>
/// Comprehensive tests for the expanded TersePhraseProvider with multi-candidate buckets.
/// Tests bucket coverage, noon/midnight variants, British idiom correctness, segment key stability,
/// randomization variety, and absence of American forms.
/// </summary>
[TestClass]
public class TersePhraseProviderExpandedTests
{
    private static readonly IPhraseProvider _provider = new TersePhraseProvider();

    [TestMethod]
    public void Terse_AllBuckets_PhraseContainsHourWord()
    {
        // Test all 11 buckets across the hour with sample minutes
        int[] sampleMinutes = [1, 5, 10, 15, 20, 30, 35, 40, 45, 50, 55];

        foreach (int minute in sampleMinutes)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));

            // Phrase must contain either "three" (current hour) or "four" (next hour)
            bool containsHourWord = phrase.Contains("three") || phrase.Contains("four");
            Assert.IsTrue(containsHourWord,
                $"Phrase '{phrase}' at minute {minute} should contain 'three' or 'four'");
        }
    }

    [TestMethod]
    public void Terse_Noon_ContainsNoonVariant()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));

        // Phrase must contain "noon" or "midday" (the 5 noon candidates)
        bool isNoonVariant = phrase.Contains("noon") || phrase.Contains("midday");
        Assert.IsTrue(isNoonVariant,
            $"Noon phrase '{phrase}' should contain 'noon' or 'midday'");
    }

    [TestMethod]
    public void Terse_Midnight_ContainsMidnightVariant()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));

        // Phrase must contain "midnight"
        Assert.IsTrue(phrase.Contains("midnight"),
            $"Midnight phrase '{phrase}' should contain 'midnight'");
    }

    [TestMethod]
    public void Terse_HalfHour_UsesBritishIdiom()
    {
        // At 3:30, British idiom says "half four" (not "half past three")
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, 30, 0));

        // Phrase must contain "four" (British "half four" idiom)
        Assert.IsTrue(phrase.Contains("four"),
            $"Half-hour phrase '{phrase}' at 3:30 should contain 'four' (British idiom)");

        // Phrase must NOT contain "three"
        Assert.IsFalse(phrase.Contains("three"),
            $"Half-hour phrase '{phrase}' at 3:30 should not contain 'three'");
    }

    [TestMethod]
    public void Terse_GetSegmentKey_SameBucket_ReturnsSameKey()
    {
        // Bucket 0 is minutes 0-2
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 0, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));

        Assert.AreEqual(key1, key2,
            "Minutes 0 and 2 are in the same bucket and should return the same segment key");
    }

    [TestMethod]
    public void Terse_GetSegmentKey_AdjacentBuckets_ReturnDifferentKeys()
    {
        // Bucket 0 is minutes 0-2; Bucket 1 is minutes 3-7
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 3, 0));

        Assert.AreNotEqual(key1, key2,
            "Minutes 2 and 3 are in adjacent buckets and should return different segment keys");
    }

    [TestMethod]
    public void Terse_GetSegmentKey_Noon_ReturnsNoonKey()
    {
        string key = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 12, 0, 0));

        Assert.AreEqual("en-terse:noon", key,
            "Noon should return the special 'en-terse:noon' segment key");
    }

    [TestMethod]
    public void Terse_GetSegmentKey_Midnight_ReturnsMidnightKey()
    {
        string key = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 0, 0, 0));

        Assert.AreEqual("en-terse:midnight", key,
            "Midnight should return the special 'en-terse:midnight' segment key");
    }

    [TestMethod]
    public void Terse_GetStructuredPhrase_AlwaysEmptyQualifier()
    {
        // Test at 3 different times
        DateTime[] testTimes = [
            new DateTime(2024, 1, 1, 3, 0, 0),   // On the hour
            new DateTime(2024, 1, 1, 3, 30, 0),  // Half hour
            new DateTime(2024, 1, 1, 3, 45, 0),  // Quarter to
        ];

        foreach (var time in testTimes)
        {
            var (qualifier, emphasis) = _provider.GetStructuredPhrase(time);

            Assert.AreEqual("", qualifier,
                $"Terse style should always return an empty qualifier at {time:HH:mm}");
            Assert.IsFalse(string.IsNullOrEmpty(emphasis),
                $"Emphasis should not be empty at {time:HH:mm}");
        }
    }

    [TestMethod]
    public void Terse_Randomization_ProducesVariety()
    {
        // Call GetPhrase 50 times for the same time and collect distinct phrases
        var distinctPhrases = new HashSet<string>();
        var testTime = new DateTime(2024, 1, 1, 3, 15, 0);

        for (int i = 0; i < 50; i++)
        {
            string phrase = _provider.GetPhrase(testTime);
            distinctPhrases.Add(phrase);
        }

        // Should see at least 2 different phrases (out of 5 candidates)
        Assert.IsTrue(distinctPhrases.Count >= 2,
            $"Expected at least 2 distinct phrases from 50 calls, got {distinctPhrases.Count}");
    }

    [TestMethod]
    public void Terse_NoAmericanForms()
    {
        // Test across all sample minutes, calling GetPhrase 10 times each
        int[] sampleMinutes = [1, 5, 10, 15, 20, 30, 35, 40, 45, 50, 55];

        foreach (int minute in sampleMinutes)
        {
            for (int iteration = 0; iteration < 10; iteration++)
            {
                string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));

                // Check for American forms: "til " (with trailing space)
                Assert.IsFalse(phrase.Contains("til "),
                    $"Phrase '{phrase}' should not contain American form 'til '");
            }
        }
    }
}
