namespace FuzzyClock.Core;

public interface IPhraseProvider
{
    string GetPhrase(DateTime dt);
    (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt);

    /// <summary>
    /// Returns a stable key identifying the current time bucket.
    /// Same bucket = same key. Adjacent buckets = different keys.
    /// Must NOT depend on random candidate selection.
    /// </summary>
    string GetSegmentKey(DateTime dt);
}
