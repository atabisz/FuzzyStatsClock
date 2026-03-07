// Source: official .NET 10 docs — System.Text.Json handles init-property records natively
namespace FuzzyClock.App;

/// <summary>Saved window position for a specific monitor.</summary>
public record MonitorPosition
{
    public double Left { get; init; } = 0;
    public double Top  { get; init; } = 0;
}

public record AppSettings
{
    public System.Collections.Generic.Dictionary<string, MonitorPosition> MonitorPositions { get; init; } = new();
    public string LastActiveMonitor    { get; init; } = "";
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
    public bool   GhostModeEnabled     { get; init; } = true;
    public bool   AutoLaunchEnabled    { get; init; } = false;
    public bool   AutoContrastEnabled  { get; init; } = false;
    public double ProcessCountThresholdPercent { get; init; } = 5.0;
    public string TextStyle  { get; init; } = "Classic";  // "Classic"|"Split"|"Literary"|"Mono"
    public bool   ShowDate   { get; init; } = true;
    public string DateFormat { get; init; } = "Short";   // "Short"|"Long"|"Numeric"|"ISO"
}
// LastActiveMonitor = "": sentinel for "no saved monitor — use PositionTopRight() on primary"
