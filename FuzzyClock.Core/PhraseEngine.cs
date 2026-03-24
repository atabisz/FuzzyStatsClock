namespace FuzzyClock.Core;

public static class PhraseEngine
{
    // _providers must be declared BEFORE _activeProvider to avoid static initializer ordering issues.
    private static readonly Dictionary<string, IPhraseProvider> _providers = new()
    {
        ["en-classic"] = new EnglishPhraseProvider(),
        ["en-terse"]   = new TersePhraseProvider(),
        ["en-poetic"]  = new PoeticPhraseProvider(),
        ["en-rude"]        = new RudePhraseProvider(),
        ["en-pirate"]      = new PiratePhraseProvider(),
        ["en-dwarf"]       = new DwarfPhraseProvider(),
        ["en-jive"]        = new JivePhraseProvider(),
        ["en-valleygirl"]  = new ValleyGirlPhraseProvider(),
        ["en-yoda"]        = new YodaPhraseProvider(),
        ["en-shakespeare"] = new ShakespearePhraseProvider(),
        ["fr"]             = new FrenchPhraseProvider(),
        ["es"]         = new SpanishPhraseProvider(),
        ["de"]         = new GermanPhraseProvider(),
        ["ja-classic"]     = new JapanesePhraseProvider(),
        ["ja-terse"]       = new JapaneseTersePhraseProvider(),
        ["ja-poetic"]      = new JapanesePoeticPhraseProvider(),
        ["ja-rude"]        = new JapaneseRudePhraseProvider(),
        ["pl"]         = new PolishPhraseProvider(),
    };

    private static IPhraseProvider _activeProvider = _providers["en-classic"];

    public static string CurrentLocale { get; private set; } = "en-classic";

    /// <summary>
    /// Swaps the active provider. Returns true if locale is known and provider was swapped;
    /// false if locale is unknown (active provider and CurrentLocale are unchanged).
    /// </summary>
    public static bool SetLocale(string locale)
    {
        if (!_providers.TryGetValue(locale, out var provider))
            return false;
        _activeProvider = provider;
        CurrentLocale = locale;
        return true;
    }

    public static string GetPhrase(DateTime dt) =>
        _activeProvider.GetPhrase(dt);

    public static (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) =>
        _activeProvider.GetStructuredPhrase(dt);

    public static string GetSegmentKey(DateTime dt) =>
        _activeProvider.GetSegmentKey(dt);
}
