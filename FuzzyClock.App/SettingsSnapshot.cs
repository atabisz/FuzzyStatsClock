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
    public ClockType ClockType                           { get; init; } = ClockType.Phrase;
    public bool   LcdUse24Hr                             { get; init; } = false;
    public bool   LcdShowSeconds                         { get; init; } = true;
    public string LcdStyle                               { get; init; } = "Dark";
    public LcdSize LcdSize                               { get; init; } = LcdSize.Medium;
    public bool   ShowHourTicks                          { get; init; } = false;
    public bool   ShowMinuteDots                         { get; init; } = false;
    public bool   ShowHourNumbers                        { get; init; } = false;
    public string  PhraseStyle                           { get; init; } = "Classic";
    public string  PhraseLocale                          { get; init; } = "auto";
    public bool    StatsVisible                          { get; init; }
    public bool    CpuVisible                            { get; init; }
    public bool    GpuVisible                            { get; init; }
    public bool    MemVisible                            { get; init; }
    public bool    PagVisible                            { get; init; }
    public bool    BatteryVisible                        { get; init; }
    public bool    UptimeVisible                         { get; init; }
    public double  StatsIntervalSeconds                  { get; init; }
    public double  ProcessCountThreshold                 { get; init; }
    public bool    ShowDate                              { get; init; }
    public string  DateFormat                            { get; init; } = "Short";
    public bool    GhostModeEnabled                      { get; init; }
    public int     GhostFadeRadiusPx                    { get; init; } = 80;
    public bool    AutoContrastEnabled                   { get; init; }
    public bool    AutoLaunchEnabled                     { get; init; }
    public int     BatteryAlertThreshold                 { get; init; } = 20;
    public bool    PhraseWrapEnabled                     { get; init; } = true;
    public string  PhraseWrapStyle                       { get; init; } = "midpoint";

    // v4.2 Phase 78 — Temps tab snapshot fields (read-only projection of AppSettings + TemperatureService)
    // Defaults here are C# type zero-values; MainWindow.GetCurrentSettingsSnapshot populates real values at open time.
    public bool    TempsLineVisible                     { get; init; }
    public bool    TempCpuVisible                       { get; init; }
    public bool    TempGpuVisible                       { get; init; }
    public bool    TempMoboVisible                      { get; init; }
    public bool    TempNvmeVisible                      { get; init; }
    public float   CpuTempC                             { get; init; }
    public float   GpuTempC                             { get; init; }
    public float   MoboTempC                            { get; init; }
    public float   NvmeTempC                            { get; init; }
    public bool    TempsServiceReady                    { get; init; }

    // v4.3 Phase 81 (CFG-02) — modifier configuration snapshot
    public bool UseCtrl  { get; init; }
    public bool UseAlt   { get; init; }
    public bool UseShift { get; init; }
    public bool UseWin   { get; init; }

    // v4.5 Phase 88 (PERS-08) — Update checker on-launch toggle snapshot.
    // Populated from _settings.UpdateChecksEnabled by MainWindow.GetCurrentSettingsSnapshot().
    public bool UpdateChecksEnabled { get; init; }

    // v4.6 — Software-rendering toggle snapshot.
    // Populated from _settings.SoftwareRenderingEnabled by MainWindow.GetCurrentSettingsSnapshot().
    public bool SoftwareRenderingEnabled { get; init; } = true;
}
