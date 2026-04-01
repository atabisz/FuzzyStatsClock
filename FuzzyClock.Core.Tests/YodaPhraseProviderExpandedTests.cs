using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

/// <summary>
/// Comprehensive tests for the expanded YodaPhraseProvider with multi-candidate buckets.
/// Tests OSV syntax enforcement, declarative endings, no SVO violations,
/// segment key stability, and randomization variety.
/// </summary>
[TestClass]
public class YodaPhraseProviderExpandedTests
{
    private static readonly IPhraseProvider _provider = new YodaPhraseProvider();

    [TestMethod]
    public void Yoda_AllBuckets_PhraseContainsHourWord()
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
    public void Yoda_Noon_ContainsNoonVariant()
    {
        var distinctPhrases = new HashSet<string>();
        for (int i = 0; i < 30; i++)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
            distinctPhrases.Add(phrase);
            bool isNoonVariant = phrase.Contains("noon") || phrase.Contains("midday");
            Assert.IsTrue(isNoonVariant,
                $"Noon phrase '{phrase}' should contain 'noon' or 'midday'");
        }
        Assert.IsTrue(distinctPhrases.Count >= 2,
            $"Expected at least 2 distinct noon phrases from 30 calls, got {distinctPhrases.Count}");
    }

    [TestMethod]
    public void Yoda_Midnight_ContainsMidnightVariant()
    {
        var distinctPhrases = new HashSet<string>();
        for (int i = 0; i < 30; i++)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
            distinctPhrases.Add(phrase);
            bool isMidnightVariant = phrase.Contains("midnight") || phrase.Contains("witching")
                                  || phrase.Contains("night");
            Assert.IsTrue(isMidnightVariant,
                $"Midnight phrase '{phrase}' should contain midnight-related vocabulary");
        }
        Assert.IsTrue(distinctPhrases.Count >= 2,
            $"Expected at least 2 distinct midnight phrases from 30 calls, got {distinctPhrases.Count}");
    }

    [TestMethod]
    public void Yoda_AllBuckets_NoSVOStart()
    {
        // OSV: should NOT start with subject-verb ("it is", "it's", "we are", "we're")
        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

        foreach (int minute in sampleMinutes)
        {
            for (int iteration = 0; iteration < 10; iteration++)
            {
                string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));
                Assert.IsFalse(phrase.StartsWith("it is "),
                    $"Yoda phrase '{phrase}' at minute {minute} starts with SVO 'it is'");
                Assert.IsFalse(phrase.StartsWith("it's "),
                    $"Yoda phrase '{phrase}' at minute {minute} starts with SVO 'it's'");
                Assert.IsFalse(phrase.StartsWith("we are "),
                    $"Yoda phrase '{phrase}' at minute {minute} starts with SVO 'we are'");
                Assert.IsFalse(phrase.StartsWith("we're "),
                    $"Yoda phrase '{phrase}' at minute {minute} starts with SVO 'we're'");
            }
        }
    }

    [TestMethod]
    public void Yoda_AllBuckets_UseDeclarativeEndings()
    {
        // Every phrase must end with a declarative verb phrase or affirmation
        string[] validEndings = ["it is", "we are", "it has", "we have", "yes", "hmm", "mmm"];
        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

        foreach (int minute in sampleMinutes)
        {
            for (int iteration = 0; iteration < 10; iteration++)
            {
                string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));
                bool hasDeclarativeEnd = validEndings.Any(ending => phrase.EndsWith(ending));

                Assert.IsTrue(hasDeclarativeEnd,
                    $"Yoda phrase '{phrase}' at minute {minute} doesn't end with OSV declarative: " +
                    $"expected one of [{string.Join(", ", validEndings)}]");
            }
        }
    }

    [TestMethod]
    public void Yoda_NoonMidnight_UseDeclarativeEndings()
    {
        string[] validEndings = ["it is", "we are", "it has", "we have", "yes", "hmm", "mmm"];

        for (int i = 0; i < 30; i++)
        {
            string noon = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
            string midnight = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));

            Assert.IsTrue(validEndings.Any(e => noon.EndsWith(e)),
                $"Yoda noon phrase '{noon}' doesn't end with declarative");
            Assert.IsTrue(validEndings.Any(e => midnight.EndsWith(e)),
                $"Yoda midnight phrase '{midnight}' doesn't end with declarative");
        }
    }

    [TestMethod]
    public void Yoda_GetSegmentKey_Noon_ReturnsNoonKey()
    {
        string key = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("en-yoda:noon", key);
    }

    [TestMethod]
    public void Yoda_GetSegmentKey_Midnight_ReturnsMidnightKey()
    {
        string key = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.AreEqual("en-yoda:midnight", key);
    }

    [TestMethod]
    public void Yoda_GetSegmentKey_SameBucket_ReturnsSameKey()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 0, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        Assert.AreEqual(key1, key2);
    }

    [TestMethod]
    public void Yoda_GetSegmentKey_AdjacentBuckets_ReturnDifferentKeys()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 3, 0));
        Assert.AreNotEqual(key1, key2);
    }

    [TestMethod]
    public void Yoda_Randomization_ProducesVariety()
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
    public void Yoda_GetStructuredPhrase_AlwaysEmptyQualifier()
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
                $"Yoda style should always return empty qualifier at {time:HH:mm}");
            Assert.IsFalse(string.IsNullOrEmpty(emphasis),
                $"Emphasis should not be empty at {time:HH:mm}");
        }
    }
}
