using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

// ---------------------------------------------------------------------------
// TersePhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class TersePhraseProviderTests
{
    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void SetLocale_EnTerse_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-terse");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Terse_OnTheHour_ReturnsJustHourWord()
    {
        PhraseEngine.SetLocale("en-terse");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        Assert.AreEqual("three", phrase);
    }

    [TestMethod]
    public void Terse_QuarterPast_ReturnsQuarterPast()
    {
        PhraseEngine.SetLocale("en-terse");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 3, 15, 0));
        Assert.AreEqual("quarter past three", phrase);
    }

    [TestMethod]
    public void Terse_HalfHour_ReturnsBritishHalf()
    {
        // British "half four" means half past three (3:30)
        PhraseEngine.SetLocale("en-terse");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 3, 30, 0));
        Assert.AreEqual("half four", phrase);
    }

    [TestMethod]
    public void Terse_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        PhraseEngine.SetLocale("en-terse");
        var (qualifier, emphasis) = PhraseEngine.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 30, 0));
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
    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void SetLocale_EnPoetic_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-poetic");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Poetic_SmallHours_ReturnsSmallHours()
    {
        PhraseEngine.SetLocale("en-poetic");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        Assert.IsFalse(string.IsNullOrEmpty(phrase));
        StringAssert.Contains(phrase, "small hours");
    }

    [TestMethod]
    public void Poetic_Noon_ReturnsHighNoon()
    {
        PhraseEngine.SetLocale("en-poetic");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("high noon", phrase);
    }

    [TestMethod]
    public void Poetic_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        PhraseEngine.SetLocale("en-poetic");
        var (qualifier, emphasis) = PhraseEngine.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
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
    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void SetLocale_EnRude_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-rude");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Rude_OnTheHour_ContainsHourWord()
    {
        PhraseEngine.SetLocale("en-rude");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        StringAssert.Contains(phrase, "four");
    }

    [TestMethod]
    public void Rude_NearlyHour_ContainsInternetSlang()
    {
        PhraseEngine.SetLocale("en-rude");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 4, 55, 0));
        bool hasSlang = phrase.Contains("smh") || phrase.Contains("WTF") || phrase.Contains("bruh");
        Assert.IsTrue(hasSlang, $"Expected internet slang but got: {phrase}");
    }

    [TestMethod]
    public void Rude_Noon_ReturnsBruh()
    {
        PhraseEngine.SetLocale("en-rude");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("noon, bruh", phrase);
    }

    [TestMethod]
    public void Rude_Midnight_ReturnsMidnightWtf()
    {
        PhraseEngine.SetLocale("en-rude");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
        Assert.AreEqual("midnight, wtf are you doing", phrase);
    }

    [TestMethod]
    public void Rude_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        PhraseEngine.SetLocale("en-rude");
        var (qualifier, emphasis) = PhraseEngine.GetStructuredPhrase(new DateTime(2024, 1, 1, 4, 0, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}
