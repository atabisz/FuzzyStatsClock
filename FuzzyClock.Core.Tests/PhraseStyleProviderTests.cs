using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

// ---------------------------------------------------------------------------
// TersePhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class TersePhraseProviderTests
{
    // Use provider directly — avoids race on PhraseEngine._activeProvider shared static.
    private static readonly IPhraseProvider _provider = new TersePhraseProvider();

    [TestMethod]
    public void SetLocale_EnTerse_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-terse");
        PhraseEngine.SetLocale("en-classic");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Terse_OnTheHour_ContainsHourWord()
    {
        // With randomization, we check for patterns, not exact text
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        Assert.IsTrue(phrase.Contains("three"), $"On-the-hour phrase '{phrase}' should contain 'three'");
    }

    [TestMethod]
    public void Terse_QuarterPast_ContainsQuarterPast()
    {
        // With randomization, we check for patterns, not exact text
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, 15, 0));
        Assert.IsTrue(phrase.Contains("quarter") && phrase.Contains("three"),
            $"Quarter past phrase '{phrase}' should contain 'quarter' and 'three'");
    }

    [TestMethod]
    public void Terse_HalfHour_ReturnsBritishHalf()
    {
        // British "half four" means half past three (3:30)
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, 30, 0));
        Assert.IsTrue(phrase.Contains("four"), $"Half-hour phrase '{phrase}' should contain 'four' (British idiom)");
        Assert.IsFalse(phrase.Contains("three"), $"Half-hour phrase '{phrase}' should not contain 'three'");
    }

    [TestMethod]
    public void Terse_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 30, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsTrue(emphasis.Contains("four"), $"Emphasis '{emphasis}' should contain 'four' (British half-hour idiom)");
    }
}

// ---------------------------------------------------------------------------
// PoeticPhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class PoeticPhraseProviderTests
{
    // Use provider directly — avoids race on PhraseEngine._activeProvider shared static.
    private static readonly IPhraseProvider _provider = new PoeticPhraseProvider();

    [TestMethod]
    public void SetLocale_EnPoetic_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-poetic");
        PhraseEngine.SetLocale("en-classic");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Poetic_WitchingHour_ReturnsWitchingHour()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.AreEqual("the witching hour", phrase);
    }

    [TestMethod]
    public void Poetic_Noon_ReturnsHighNoon()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("high noon", phrase);
    }

    [TestMethod]
    public void Poetic_RegularTime_ReturnsNonEmpty()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, 15, 0));
        Assert.IsFalse(string.IsNullOrEmpty(phrase));
    }

    [TestMethod]
    public void Poetic_GetStructuredPhrase_EmphasisIsHourWord()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        Assert.AreEqual("three", emphasis);
        Assert.IsFalse(string.IsNullOrEmpty(qualifier));
    }

    [TestMethod]
    public void Poetic_GetStructuredPhrase_ToHalf_EmphasisIsNextHourWord()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 40, 0));
        Assert.AreEqual("four", emphasis);
        Assert.IsFalse(string.IsNullOrEmpty(qualifier));
    }

    [TestMethod]
    public void Poetic_GetStructuredPhrase_HalfPast_EmphasisIsCurrentHourWord()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 30, 0));
        Assert.AreEqual("three", emphasis);
        Assert.IsFalse(string.IsNullOrEmpty(qualifier));
    }

    [TestMethod]
    public void Poetic_GetStructuredPhrase_WitchingHour_EmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.AreEqual("", qualifier);
        Assert.AreEqual("the witching hour", emphasis);
    }

    [TestMethod]
    public void Poetic_GetStructuredPhrase_Noon_EmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("", qualifier);
        Assert.AreEqual("high noon", emphasis);
    }

    [TestMethod]
    public void Poetic_AllBuckets_PhraseContainsHourWord()
    {
        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
        foreach (int m in sampleMinutes)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, m, 0));
            bool containsThree = phrase.Contains("three");
            bool containsFour  = phrase.Contains("four");
            Assert.IsTrue(containsThree || containsFour,
                $"Minute {m}: expected 'three' or 'four' in phrase but got: {phrase}");
        }
    }

    [TestMethod]
    public void Poetic_OnTheHour_ContainsHourWord()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        StringAssert.Contains(phrase, "four");
    }

    [TestMethod]
    public void Poetic_NearlyHour_ContainsNextHourWord()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 55, 0));
        StringAssert.Contains(phrase, "five", $"Expected next-hour word in phrase but got: {phrase}");
    }
}

// ---------------------------------------------------------------------------
// RudePhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class RudePhraseProviderTests
{
    // Use provider directly — avoids race on PhraseEngine._activeProvider shared static.
    private static readonly IPhraseProvider _provider = new RudePhraseProvider();

    [TestMethod]
    public void SetLocale_EnRude_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-rude");
        PhraseEngine.SetLocale("en-classic");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Rude_OnTheHour_ContainsHourWord()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        StringAssert.Contains(phrase, "four");
    }

    [TestMethod]
    public void Rude_NearlyHour_ContainsNextHourWord()
    {
        // All :55 bucket candidates reference {h1}, so at 4:55 every possible phrase contains "five".
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 55, 0));
        StringAssert.Contains(phrase, "five", $"Expected next-hour word in phrase but got: {phrase}");
    }

    [TestMethod]
    public void Rude_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}

// ---------------------------------------------------------------------------
// JivePhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class JivePhraseProviderTests
{
    private static readonly IPhraseProvider _provider = new JivePhraseProvider();

    [TestMethod]
    public void SetLocale_EnJive_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-jive");
        PhraseEngine.SetLocale("en-classic");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Jive_OnTheHour_ContainsHourWord()
    {
        // All bucket-0 candidates reference {h}, so at 4:00 every phrase contains "four".
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        StringAssert.Contains(phrase, "four");
    }

    [TestMethod]
    public void Jive_NearlyHour_ContainsNextHourWord()
    {
        // All bucket-11 candidates reference {h1}, so at 4:55 every phrase contains "five".
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 55, 0));
        StringAssert.Contains(phrase, "five", $"Expected next-hour word but got: {phrase}");
    }

    [TestMethod]
    public void Jive_Noon_ReturnsNoonPhrase()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.IsTrue(phrase.Contains("noon") || phrase.Contains("twelve"),
            $"Noon phrase '{phrase}' should contain 'noon' or 'twelve'");
    }

    [TestMethod]
    public void Jive_Midnight_ReturnsMidnightPhrase()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.IsTrue(phrase.Contains("midnight") || phrase.Contains("witching")
                   || phrase.Contains("zero hour") || phrase.Contains("night"),
            $"Midnight phrase '{phrase}' should contain midnight-related vocabulary");
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
    public void Jive_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}

// ---------------------------------------------------------------------------
// PiratePhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class PiratePhraseProviderTests
{
    private static readonly IPhraseProvider _provider = new PiratePhraseProvider();

    [TestMethod]
    public void SetLocale_EnPirate_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-pirate");
        PhraseEngine.SetLocale("en-classic");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Pirate_OnTheHour_ContainsHourWord()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        StringAssert.Contains(phrase, "four");
    }

    [TestMethod]
    public void Pirate_NearlyHour_ContainsNextHourWord()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 55, 0));
        StringAssert.Contains(phrase, "five", $"Expected next-hour word but got: {phrase}");
    }

    [TestMethod]
    public void Pirate_Noon_ReturnsNoonPhrase()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.IsTrue(phrase.Contains("noon") || phrase.Contains("zenith"),
            $"Noon phrase '{phrase}' should contain 'noon' or 'zenith'");
    }

    [TestMethod]
    public void Pirate_Midnight_ReturnsMidnightPhrase()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.IsTrue(phrase.Contains("midnight") || phrase.Contains("night") || phrase.Contains("watch"),
            $"Midnight phrase '{phrase}' should contain midnight-related vocabulary");
    }

    [TestMethod]
    public void Pirate_GetSegmentKey_SameBucket_ReturnsSameKey()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 0, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        Assert.AreEqual(key1, key2);
    }

    [TestMethod]
    public void Pirate_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}

// ---------------------------------------------------------------------------
// DwarfPhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class DwarfPhraseProviderTests
{
    private static readonly IPhraseProvider _provider = new DwarfPhraseProvider();

    [TestMethod]
    public void SetLocale_EnDwarf_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-dwarf");
        PhraseEngine.SetLocale("en-classic");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Dwarf_OnTheHour_ContainsHourWord()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        StringAssert.Contains(phrase, "four");
    }

    [TestMethod]
    public void Dwarf_NearlyHour_ContainsNextHourWord()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 55, 0));
        StringAssert.Contains(phrase, "five", $"Expected next-hour word but got: {phrase}");
    }

    [TestMethod]
    public void Dwarf_Noon_ReturnsNoonPhrase()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("midday. eat.", phrase);
    }

    [TestMethod]
    public void Dwarf_Midnight_ReturnsMidnightPhrase()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.AreEqual("deep in the night, bah", phrase);
    }

    [TestMethod]
    public void Dwarf_GetSegmentKey_SameBucket_ReturnsSameKey()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 0, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        Assert.AreEqual(key1, key2);
    }

    [TestMethod]
    public void Dwarf_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}

// ---------------------------------------------------------------------------
// ValleyGirlPhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class ValleyGirlPhraseProviderTests
{
    private static readonly IPhraseProvider _provider = new ValleyGirlPhraseProvider();

    [TestMethod]
    public void SetLocale_EnValleyGirl_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-valleygirl");
        PhraseEngine.SetLocale("en-classic");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void ValleyGirl_OnTheHour_ContainsHourWord()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        StringAssert.Contains(phrase, "four");
    }

    [TestMethod]
    public void ValleyGirl_NearlyHour_ContainsNextHourWord()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 55, 0));
        StringAssert.Contains(phrase, "five", $"Expected next-hour word but got: {phrase}");
    }

    [TestMethod]
    public void ValleyGirl_Noon_ReturnsNoonPhrase()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("like, it's literally noon", phrase);
    }

    [TestMethod]
    public void ValleyGirl_Midnight_ReturnsMidnightPhrase()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.AreEqual("omg it's literally midnight", phrase);
    }

    [TestMethod]
    public void ValleyGirl_GetSegmentKey_SameBucket_ReturnsSameKey()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 0, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        Assert.AreEqual(key1, key2);
    }

    [TestMethod]
    public void ValleyGirl_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}

// ---------------------------------------------------------------------------
// YodaPhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class YodaPhraseProviderTests
{
    private static readonly IPhraseProvider _provider = new YodaPhraseProvider();

    [TestMethod]
    public void SetLocale_EnYoda_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-yoda");
        PhraseEngine.SetLocale("en-classic");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Yoda_OnTheHour_ContainsHourWord()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        StringAssert.Contains(phrase, "four");
    }

    [TestMethod]
    public void Yoda_NearlyHour_ContainsNextHourWord()
    {
        // All bucket-11 candidates reference {h1} directly or as "approaches" (no {h1} token
        // in "{h1} approaches" but the word "five" will appear at 4:55).
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 55, 0));
        StringAssert.Contains(phrase, "five", $"Expected next-hour word but got: {phrase}");
    }

    [TestMethod]
    public void Yoda_Noon_ReturnsNoonPhrase()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.IsTrue(phrase.Contains("noon") || phrase.Contains("midday"),
            $"Noon phrase '{phrase}' should contain 'noon' or 'midday'");
    }

    [TestMethod]
    public void Yoda_Midnight_ReturnsMidnightPhrase()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.IsTrue(phrase.Contains("midnight") || phrase.Contains("witching") || phrase.Contains("night"),
            $"Midnight phrase '{phrase}' should contain midnight-related vocabulary");
    }

    [TestMethod]
    public void Yoda_GetSegmentKey_SameBucket_ReturnsSameKey()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 0, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        Assert.AreEqual(key1, key2);
    }

    [TestMethod]
    public void Yoda_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}

// ---------------------------------------------------------------------------
// ShakespearePhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class ShakespearePhraseProviderTests
{
    private static readonly IPhraseProvider _provider = new ShakespearePhraseProvider();

    [TestMethod]
    public void SetLocale_EnShakespeare_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-shakespeare");
        PhraseEngine.SetLocale("en-classic");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Shakespeare_OnTheHour_ContainsHourWord()
    {
        // All bucket-0 candidates reference the hour (via {h} or {ho}), so "four" appears at 4:00.
        // ("fourth" is also a match since it contains "four" as a substring.)
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        StringAssert.Contains(phrase, "four");
    }

    [TestMethod]
    public void Shakespeare_NearlyHour_ContainsNextHourWord()
    {
        // All bucket-11 candidates reference {h1}, so "five" appears at 4:55.
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 4, 55, 0));
        StringAssert.Contains(phrase, "five", $"Expected next-hour word but got: {phrase}");
    }

    [TestMethod]
    public void Shakespeare_Noon_ReturnsNoonPhrase()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("Hark! 'Tis the noontide hour", phrase);
    }

    [TestMethod]
    public void Shakespeare_Midnight_ReturnsMidnightPhrase()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.AreEqual("The witching hour doth toll", phrase);
    }

    [TestMethod]
    public void Shakespeare_GetSegmentKey_SameBucket_ReturnsSameKey()
    {
        string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 0, 0));
        string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
        Assert.AreEqual(key1, key2);
    }

    [TestMethod]
    public void Shakespeare_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}
