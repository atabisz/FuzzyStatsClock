using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

/// <summary>
/// Comprehensive tests for the expanded PiratePhraseProvider with multi-candidate buckets.
/// Tests bucket coverage, noon/midnight variants, nautical authenticity patterns,
/// segment key stability, and randomization variety.
/// </summary>
[TestClass]
public class PiratePhraseProviderExpandedTests
{
    private static readonly IPhraseProvider _provider = new PiratePhraseProvider();

    [TestMethod]
    public void Pirate_AllBuckets_PhraseContainsHourWord()
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
    public void Pirate_Noon_ContainsNoonVariant()
    {
        var distinctPhrases = new HashSet<string>();
        for (int i = 0; i < 30; i++)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
            distinctPhrases.Add(phrase);
            bool isNoonVariant = phrase.Contains("noon") || phrase.Contains("zenith");
            Assert.IsTrue(isNoonVariant,
                $"Noon phrase '{phrase}' should contain 'noon' or 'zenith'");
        }
        Assert.IsTrue(distinctPhrases.Count >= 2,
            $"Expected at least 2 distinct noon phrases from 30 calls, got {distinctPhrases.Count}");
    }

    [TestMethod]
    public void Pirate_Midnight_ContainsMidnightVariant()
    {
        var distinctPhrases = new HashSet<string>();
        for (int i = 0; i < 30; i++)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
            distinctPhrases.Add(phrase);
            bool isMidnightVariant = phrase.Contains("midnight") || phrase.Contains("night")
                                  || phrase.Contains("watch") || phrase.Contains("graveyard");
            Assert.IsTrue(isMidnightVariant,
                $"Midnight phrase '{phrase}' should contain midnight-related vocabulary");
        }
        Assert.IsTrue(distinctPhrases.Count >= 2,
            $"Expected at least 2 distinct midnight phrases from 30 calls, got {distinctPhrases.Count}");
    }

    [TestMethod]
    public void Pirate_AllPhrases_UseNauticalOrPirateTerminology()
    {
        string[] nauticalTerms = ["bells", "watch", "mark", "glass", "course",
            "bearing", "log", "strike", "trim", "steady", "horizon", "crow's nest"];
        string[] pirateVocab = ["arr", "yarr", "avast", "ahoy", "blimey",
            "aye", "heave"];

        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

        foreach (int minute in sampleMinutes)
        {
            for (int iteration = 0; iteration < 10; iteration++)
            {
                string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));
                bool hasNautical = nauticalTerms.Any(t =>
                    phrase.Contains(t, StringComparison.OrdinalIgnoreCase));
                bool hasPirate = pirateVocab.Any(t =>
                    phrase.Contains(t, StringComparison.OrdinalIgnoreCase));

                Assert.IsTrue(hasNautical || hasPirate,
                    $"Pirate phrase '{phrase}' at minute {minute} lacks nautical and pirate vocabulary");
            }
        }
    }

    [TestMethod]
    public void Pirate_NoPhrases_ContainShiverMeTimbers()
    {
        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

        foreach (int minute in sampleMinutes)
        {
            for (int iteration = 0; iteration < 10; iteration++)
            {
                string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));
                Assert.IsFalse(phrase.Contains("shiver me timbers"),
                    $"Pirate phrase '{phrase}' contains movie cliche 'shiver me timbers'");
            }
        }
    }

    [TestMethod]
    public void Pirate_GetSegmentKey_Noon_ReturnsNoonKey()
    {
        string key = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("en-pirate:noon", key);
    }

    [TestMethod]
    public void Pirate_GetSegmentKey_Midnight_ReturnsMidnightKey()
    {
        string key = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.AreEqual("en-pirate:midnight", key);
    }

    [TestMethod]
    public void Pirate_GetSegmentKey_SameBucket_ReturnsSameKey()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 0, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        Assert.AreEqual(key1, key2);
    }

    [TestMethod]
    public void Pirate_GetSegmentKey_AdjacentBuckets_ReturnDifferentKeys()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 3, 0));
        Assert.AreNotEqual(key1, key2);
    }

    [TestMethod]
    public void Pirate_Randomization_ProducesVariety()
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
    public void Pirate_GetStructuredPhrase_AlwaysEmptyQualifier()
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
                $"Pirate style should always return empty qualifier at {time:HH:mm}");
            Assert.IsFalse(string.IsNullOrEmpty(emphasis),
                $"Emphasis should not be empty at {time:HH:mm}");
        }
    }
}
