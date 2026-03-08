namespace FuzzyClock.App;

/// <summary>
/// Read-only snapshot of all current widget state.
/// Passed to SettingsWindow constructor to populate controls at open time.
/// Changes flow OUT (SettingsWindow fires events → MainWindow reacts); nothing flows back in.
/// </summary>
internal sealed record SettingsSnapshot
{
    public System.Windows.Media.Color AccentColor        { get; init; }
    public double  Opacity                               { get; init; }
    public int     FontSize                              { get; init; }
    public bool    DialMode                              { get; init; }
    public string  PhraseStyle                           { get; init; } = "Classic";
    public bool    StatsVisible                          { get; init; }
    public bool    CpuVisible                            { get; init; }
    public bool    GpuVisible                            { get; init; }
    public bool    MemVisible                            { get; init; }
    public bool    PagVisible                            { get; init; }
    public bool    BatteryVisible                        { get; init; }
    public bool    UptimeVisible                         { get; init; }
    public int     StatsIntervalSeconds                  { get; init; }
    public double  ProcessCountThreshold                 { get; init; }
    public bool    ShowDate                              { get; init; }
    public string  DateFormat                            { get; init; } = "Short";
    public bool    GhostModeEnabled                      { get; init; }
    public bool    AutoContrastEnabled                   { get; init; }
    public bool    AutoLaunchEnabled                     { get; init; }
    public string? ActiveTheme                           { get; init; } = null;
}
