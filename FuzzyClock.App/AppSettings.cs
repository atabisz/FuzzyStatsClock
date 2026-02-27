// Source: official .NET 10 docs — System.Text.Json handles init-property records natively
namespace FuzzyClock.App;

public record AppSettings
{
    public double Left                 { get; init; } = -1;
    public double Top                  { get; init; } = 20;
    public int    FontSize             { get; init; } = 32;
    public bool   StatsVisible         { get; init; } = false;
    public int    StatsIntervalSeconds { get; init; } = 3;
    public bool   CpuVisible           { get; init; } = true;
    public bool   GpuVisible           { get; init; } = true;
    public bool   MemVisible           { get; init; } = true;
    public bool   PagVisible           { get; init; } = true;
    public bool   UptimeVisible        { get; init; } = true;
    public bool   DialMode             { get; init; } = false;
    public bool   ShowHourTicks        { get; init; } = false;
    public bool   ShowMinuteDots       { get; init; } = false;
    public bool   ShowHourNumbers      { get; init; } = false;
    public string AccentColor          { get; init; } = "#FFFFFFFF";  // AARRGGBB hex; default = White (matches existing Foreground="White" in XAML)
    public double Opacity              { get; init; } = 1.0;          // 0.0–1.0; default = fully opaque
}
// Left = -1 is the sentinel for "no saved position — use PositionTopRight() fallback"
