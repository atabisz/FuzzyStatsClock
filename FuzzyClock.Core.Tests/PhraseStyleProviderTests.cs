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
    public void Terse_OnTheHour_ReturnsJustHourWord()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        Assert.AreEqual("three", phrase);
    }

    [TestMethod]
    public void Terse_QuarterPast_ReturnsQuarterPast()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, 15, 0));
        Assert.AreEqual("quarter past three", phrase);
    }

    [TestMethod]
    public void Terse_HalfHour_ReturnsBritishHalf()
    {
        // British "half four" means half past three (3:30)
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, 30, 0));
        Assert.AreEqual("half four", phrase);
    }

    [TestMethod]
    public void Terse_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 30, 0));
        Assert.AreEqual("", qualifier);
        Assert.AreEqual("half four", emphasis);
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
    public void Poetic_SmallHours_ReturnsSmallHours()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        Assert.IsFalse(string.IsNullOrEmpty(phrase));
        StringAssert.Contains(phrase, "small hours");
    }

    [TestMethod]
    public void Poetic_Noon_ReturnsHighNoon()
    {
        string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("high noon", phrase);
    }

    [TestMethod]
    public void Poetic_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
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
