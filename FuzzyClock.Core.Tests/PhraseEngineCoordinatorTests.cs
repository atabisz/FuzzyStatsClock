using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

/// <summary>
/// Contract tests for the PhraseEngine coordinator API (SetLocale / CurrentLocale).
///
/// STATIC STATE ISOLATION: PhraseEngine is a static class; its state persists across test
/// methods in the same process. Every test method that calls SetLocale MUST have the
/// [TestCleanup] method reset the locale to "en-classic" to prevent state leaks between tests.
/// </summary>
[TestClass]
public class PhraseEngineCoordinatorTests
{
    [TestCleanup]
    public void ResetLocale()
    {
        PhraseEngine.SetLocale("en-classic");
    }

    [TestMethod]
    public void DefaultLocale_IsEnClassic()
    {
        // CurrentLocale reflects the startup default without any SetLocale call.
        // We can verify the invariant: after cleanup always resets, CurrentLocale is "en-classic".
        Assert.AreEqual("en-classic", PhraseEngine.CurrentLocale);
    }

    [TestMethod]
    public void SetLocale_KnownLocale_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-classic");

        Assert.IsTrue(result);
        Assert.AreEqual("en-classic", PhraseEngine.CurrentLocale);
    }

    [TestMethod]
    public void SetLocale_UnknownLocale_ReturnsFalse_LocaleUnchanged()
    {
        bool result = PhraseEngine.SetLocale("fr");

        Assert.IsFalse(result);
        Assert.AreEqual("en-classic", PhraseEngine.CurrentLocale);
    }

    [TestMethod]
    public void GetPhrase_DelegatesCorrectly_AfterSetLocaleRoundTrip()
    {
        PhraseEngine.SetLocale("en-classic");

        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 15, 3, 30, 0));

        Assert.AreEqual("half past three", phrase);
    }
}
