namespace FuzzyClock.Core;

public interface IPhraseProvider
{
    string GetPhrase(DateTime dt);
    (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt);
}
