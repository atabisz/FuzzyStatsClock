using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

/// <summary>
/// Contract tests for the five new multilingual phrase providers.
/// Four test methods per language (20 total):
///   1. Noon special case
///   2. Midnight special case
///   3. All 12 five-minute bucket probes return non-empty strings
///   4. GetStructuredPhrase returns empty qualifier
///
/// STATIC STATE ISOLATION: tests that call SetLocale reset locale in [TestCleanup].
/// </summary>

// ─── French ─────────────────────────────────────────────────────────────────

[TestClass]
public class FrenchPhraseProviderTests
{
    private static readonly IPhraseProvider Provider = new FrenchPhraseProvider();

    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void French_Noon_ReturnsMidi()
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 12, 0, 0));
        Assert.AreEqual("midi", phrase);
    }

    [TestMethod]
    public void French_Midnight_ReturnsMinuit()
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 0, 0, 0));
        Assert.AreEqual("minuit", phrase);
    }

    [TestMethod]
    [DataRow(0)]
    [DataRow(1)]
    [DataRow(5)]
    [DataRow(10)]
    [DataRow(15)]
    [DataRow(20)]
    [DataRow(25)]
    [DataRow(30)]
    [DataRow(35)]
    [DataRow(40)]
    [DataRow(45)]
    [DataRow(50)]
    [DataRow(55)]
    public void French_AllBuckets_ReturnNonEmpty(int minute)
    {
        // Use hour=3 (avoids noon/midnight special case, covers all bucket probes)
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 3, minute, 0));
        Assert.IsFalse(string.IsNullOrEmpty(phrase), $"Expected non-empty phrase for minute={minute}");
    }

    [TestMethod]
    public void French_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = Provider.GetStructuredPhrase(new DateTime(2024, 1, 15, 3, 30, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}

// ─── Spanish ─────────────────────────────────────────────────────────────────

[TestClass]
public class SpanishPhraseProviderTests
{
    private static readonly IPhraseProvider Provider = new SpanishPhraseProvider();

    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void Spanish_Noon_ReturnsMediodia()
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 12, 0, 0));
        Assert.AreEqual("mediodía", phrase);
    }

    [TestMethod]
    public void Spanish_Midnight_ReturnsMedianoche()
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 0, 0, 0));
        Assert.AreEqual("medianoche", phrase);
    }

    [TestMethod]
    [DataRow(0)]
    [DataRow(1)]
    [DataRow(5)]
    [DataRow(10)]
    [DataRow(15)]
    [DataRow(20)]
    [DataRow(25)]
    [DataRow(30)]
    [DataRow(35)]
    [DataRow(40)]
    [DataRow(45)]
    [DataRow(50)]
    [DataRow(55)]
    public void Spanish_AllBuckets_ReturnNonEmpty(int minute)
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 3, minute, 0));
        Assert.IsFalse(string.IsNullOrEmpty(phrase), $"Expected non-empty phrase for minute={minute}");
    }

    [TestMethod]
    public void Spanish_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = Provider.GetStructuredPhrase(new DateTime(2024, 1, 15, 3, 30, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}

// ─── German ──────────────────────────────────────────────────────────────────

[TestClass]
public class GermanPhraseProviderTests
{
    private static readonly IPhraseProvider Provider = new GermanPhraseProvider();

    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void German_Noon_ReturnsMittag()
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 12, 0, 0));
        Assert.AreEqual("Mittag", phrase);
    }

    [TestMethod]
    public void German_Midnight_ReturnsMitternacht()
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 0, 0, 0));
        Assert.AreEqual("Mitternacht", phrase);
    }

    [TestMethod]
    [DataRow(0)]
    [DataRow(1)]
    [DataRow(5)]
    [DataRow(10)]
    [DataRow(15)]
    [DataRow(20)]
    [DataRow(25)]
    [DataRow(30)]
    [DataRow(35)]
    [DataRow(40)]
    [DataRow(45)]
    [DataRow(50)]
    [DataRow(55)]
    public void German_AllBuckets_ReturnNonEmpty(int minute)
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 3, minute, 0));
        Assert.IsFalse(string.IsNullOrEmpty(phrase), $"Expected non-empty phrase for minute={minute}");
    }

    [TestMethod]
    public void German_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = Provider.GetStructuredPhrase(new DateTime(2024, 1, 15, 3, 30, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}

// ─── Japanese ────────────────────────────────────────────────────────────────

[TestClass]
public class JapanesePhraseProviderTests
{
    private static readonly IPhraseProvider Provider = new JapanesePhraseProvider();

    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void Japanese_Noon_ReturnsShogo()
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 12, 0, 0));
        Assert.AreEqual("正午", phrase);
    }

    [TestMethod]
    public void Japanese_Midnight_ReturnsMayonaka()
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 0, 0, 0));
        Assert.AreEqual("真夜中", phrase);
    }

    [TestMethod]
    [DataRow(0)]
    [DataRow(1)]
    [DataRow(5)]
    [DataRow(10)]
    [DataRow(15)]
    [DataRow(20)]
    [DataRow(25)]
    [DataRow(30)]
    [DataRow(35)]
    [DataRow(40)]
    [DataRow(45)]
    [DataRow(50)]
    [DataRow(55)]
    public void Japanese_AllBuckets_ReturnNonEmpty(int minute)
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 3, minute, 0));
        Assert.IsFalse(string.IsNullOrEmpty(phrase), $"Expected non-empty phrase for minute={minute}");
    }

    [TestMethod]
    public void Japanese_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = Provider.GetStructuredPhrase(new DateTime(2024, 1, 15, 3, 30, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}

// ─── Polish ──────────────────────────────────────────────────────────────────

[TestClass]
public class PolishPhraseProviderTests
{
    private static readonly IPhraseProvider Provider = new PolishPhraseProvider();

    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void Polish_Noon_ReturnsPoudnie()
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 12, 0, 0));
        Assert.AreEqual("południe", phrase);
    }

    [TestMethod]
    public void Polish_Midnight_ReturnPolnoc()
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 0, 0, 0));
        Assert.AreEqual("północ", phrase);
    }

    [TestMethod]
    [DataRow(0)]
    [DataRow(1)]
    [DataRow(5)]
    [DataRow(10)]
    [DataRow(15)]
    [DataRow(20)]
    [DataRow(25)]
    [DataRow(30)]
    [DataRow(35)]
    [DataRow(40)]
    [DataRow(45)]
    [DataRow(50)]
    [DataRow(55)]
    public void Polish_AllBuckets_ReturnNonEmpty(int minute)
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 3, minute, 0));
        Assert.IsFalse(string.IsNullOrEmpty(phrase), $"Expected non-empty phrase for minute={minute}");
    }

    [TestMethod]
    public void Polish_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = Provider.GetStructuredPhrase(new DateTime(2024, 1, 15, 3, 30, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}
