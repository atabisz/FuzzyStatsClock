using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

/// <summary>
/// Comprehensive tests for the expanded JivePhraseProvider with multi-candidate buckets.
/// Tests bucket coverage, noon/midnight variants, AAVE authenticity patterns,
/// segment key stability, and randomization variety.
/// </summary>
[TestClass]
public class JivePhraseProviderExpandedTests
{
    private static readonly IPhraseProvider _provider = new JivePhraseProvider();

    [TestMethod]
    public void Jive_AllBuckets_PhraseContainsHourWord()
    {
        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

        foreach (int minute in sampleMinutes)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));
            bool containsHourWord = phrase.Contains("three") || phrase.Contains("four");
            Assert.IsTrue(containsHourWord,
                $"Phrase '{phrase}' at minute {minute} should contain 'three' or 'four'");
        }
    }

    [TestMethod]
    public void Jive_Noon_ContainsNoonVariant()
    {
        // Run 30 times to hit multiple candidates
        var distinctPhrases = new HashSet<string>();
        for (int i = 0; i < 30; i++)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
            distinctPhrases.Add(phrase);
            bool isNoonVariant = phrase.Contains("noon") || phrase.Contains("twelve");
            Assert.IsTrue(isNoonVariant,
                $"Noon phrase '{phrase}' should contain 'noon' or 'twelve'");
        }
        Assert.IsTrue(distinctPhrases.Count >= 2,
            $"Expected at least 2 distinct noon phrases from 30 calls, got {distinctPhrases.Count}");
    }

    [TestMethod]
    public void Jive_Midnight_ContainsMidnightVariant()
    {
        var distinctPhrases = new HashSet<string>();
        for (int i = 0; i < 30; i++)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
            distinctPhrases.Add(phrase);
            bool isMidnightVariant = phrase.Contains("midnight") || phrase.Contains("witching")
                                  || phrase.Contains("zero hour") || phrase.Contains("dead of night");
            Assert.IsTrue(isMidnightVariant,
                $"Midnight phrase '{phrase}' should contain midnight-related vocabulary");
        }
        Assert.IsTrue(distinctPhrases.Count >= 2,
            $"Expected at least 2 distinct midnight phrases from 30 calls, got {distinctPhrases.Count}");
    }

    [TestMethod]
    public void Jive_AllBuckets_AvoidStandardEnglishCopula()
    {
        // Jive phrases should not start with "it's " or "it is " (AAVE copula preference)
        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

        foreach (int minute in sampleMinutes)
        {
            for (int iteration = 0; iteration < 10; iteration++)
            {
                string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));
                Assert.IsFalse(phrase.StartsWith("it's "),
                    $"Jive phrase '{phrase}' at minute {minute} starts with standard 'it's'");
                Assert.IsFalse(phrase.StartsWith("it is "),
                    $"Jive phrase '{phrase}' at minute {minute} starts with standard 'it is'");
            }
        }
    }

    [TestMethod]
    public void Jive_GetSegmentKey_Noon_ReturnsNoonKey()
    {
        string key = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("en-jive:noon", key);
    }

    [TestMethod]
    public void Jive_GetSegmentKey_Midnight_ReturnsMidnightKey()
    {
        string key = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.AreEqual("en-jive:midnight", key);
    }

    [TestMethod]
    public void Jive_GetSegmentKey_SameBucket_ReturnsSameKey()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 0, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        Assert.AreEqual(key1, key2);
    }

    [TestMethod]
    public void Jive_GetSegmentKey_AdjacentBuckets_ReturnDifferentKeys()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 3, 0));
        Assert.AreNotEqual(key1, key2);
    }

    [TestMethod]
    public void Jive_Randomization_ProducesVariety()
    {
        var distinctPhrases = new HashSet<string>();
        var testTime = new DateTime(2024, 1, 1, 3, 15, 0);

        for (int i = 0; i < 50; i++)
        {
            string phrase = _provider.GetPhrase(testTime);
            distinctPhrases.Add(phrase);
        }

        Assert.IsTrue(distinctPhrases.Count >= 2,
            $"Expected at least 2 distinct phrases from 50 calls, got {distinctPhrases.Count}");
    }

    [TestMethod]
    public void Jive_GetStructuredPhrase_AlwaysEmptyQualifier()
    {
        DateTime[] testTimes = [
            new DateTime(2024, 1, 1, 3, 0, 0),
            new DateTime(2024, 1, 1, 3, 30, 0),
            new DateTime(2024, 1, 1, 3, 45, 0),
        ];

        foreach (var time in testTimes)
        {
            var (qualifier, emphasis) = _provider.GetStructuredPhrase(time);
            Assert.AreEqual("", qualifier,
                $"Jive style should always return empty qualifier at {time:HH:mm}");
            Assert.IsFalse(string.IsNullOrEmpty(emphasis),
                $"Emphasis should not be empty at {time:HH:mm}");
        }
    }

    [TestMethod]
    public void Jive_AllPhrases_ContainJiveVocabulary()
    {
        // Every phrase should have at least one Jive vocabulary marker
        string[] jiveTerms = ["daddy-o", "cat", "solid", "dig", "hep cat",
            "real gone", "groove", "blow your wig", "righteous", "all reet",
            "copacetic", "alligator", "hip", "gone"];

        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

        foreach (int minute in sampleMinutes)
        {
            for (int iteration = 0; iteration < 10; iteration++)
            {
                string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));
                bool hasJiveTerm = jiveTerms.Any(term =>
                    phrase.Contains(term, StringComparison.OrdinalIgnoreCase));
                Assert.IsTrue(hasJiveTerm,
                    $"Jive phrase '{phrase}' at minute {minute} lacks jive vocabulary");
            }
        }
    }
}
