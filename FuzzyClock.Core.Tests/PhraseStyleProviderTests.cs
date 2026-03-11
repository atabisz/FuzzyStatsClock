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

// ---------------------------------------------------------------------------
// PiratePhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class PiratePhraseProviderTests
{
    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void SetLocale_EnPirate_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-pirate");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Pirate_OnTheHour_ContainsArr()
    {
        PhraseEngine.SetLocale("en-pirate");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        StringAssert.Contains(phrase, "arr");
    }

    [TestMethod]
    public void Pirate_Noon_ReturnsHighNoonAtSea()
    {
        PhraseEngine.SetLocale("en-pirate");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("high noon at sea, arr", phrase);
    }
}

// ---------------------------------------------------------------------------
// DwarfPhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class DwarfPhraseProviderTests
{
    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void SetLocale_EnDwarf_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-dwarf");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Dwarf_OnTheHour_ContainsAye()
    {
        PhraseEngine.SetLocale("en-dwarf");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        StringAssert.Contains(phrase, "aye");
    }

    [TestMethod]
    public void Dwarf_Noon_ReturnsMidday()
    {
        PhraseEngine.SetLocale("en-dwarf");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("midday. eat.", phrase);
    }
}

// ---------------------------------------------------------------------------
// JivePhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class JivePhraseProviderTests
{
    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void SetLocale_EnJive_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-jive");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Jive_OnTheHour_ContainsDaddyO()
    {
        PhraseEngine.SetLocale("en-jive");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        StringAssert.Contains(phrase, "daddy-o");
    }

    [TestMethod]
    public void Jive_Noon_ReturnsHighNoon()
    {
        PhraseEngine.SetLocale("en-jive");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("high noon, daddy-o", phrase);
    }
}

// ---------------------------------------------------------------------------
// ValleyGirlPhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class ValleyGirlPhraseProviderTests
{
    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void SetLocale_EnValleyGirl_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-valleygirl");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void ValleyGirl_OnTheHour_ReturnsNonEmpty()
    {
        PhraseEngine.SetLocale("en-valleygirl");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        Assert.IsFalse(string.IsNullOrEmpty(phrase));
    }

    [TestMethod]
    public void ValleyGirl_Noon_ReturnsLiterallyNoon()
    {
        PhraseEngine.SetLocale("en-valleygirl");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("like, it's literally noon", phrase);
    }
}

// ---------------------------------------------------------------------------
// YodaPhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class YodaPhraseProviderTests
{
    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void SetLocale_EnYoda_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-yoda");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Yoda_OnTheHour_ContainsItIs()
    {
        PhraseEngine.SetLocale("en-yoda");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        StringAssert.Contains(phrase, "it is");
    }

    [TestMethod]
    public void Yoda_Noon_ReturnsNoonItIs()
    {
        PhraseEngine.SetLocale("en-yoda");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("noon it is, hmm", phrase);
    }
}

// ---------------------------------------------------------------------------
// ShakespearePhraseProvider tests
// ---------------------------------------------------------------------------
[TestClass]
public class ShakespearePhraseProviderTests
{
    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void SetLocale_EnShakespeare_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-shakespeare");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Shakespeare_OnTheHour_ContainsHark()
    {
        PhraseEngine.SetLocale("en-shakespeare");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        StringAssert.Contains(phrase, "Hark");
    }

    [TestMethod]
    public void Shakespeare_Noon_ReturnsNoontideHour()
    {
        PhraseEngine.SetLocale("en-shakespeare");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("Hark! 'Tis the noontide hour", phrase);
    }
}
