// Source: official .NET 10 docs — System.Text.Json handles positional records
namespace FuzzyClock.App;

public record AppSettings(double Left, double Top, int FontSize);
// Left = -1 is the sentinel for "no saved position — use PositionTopRight() fallback"
