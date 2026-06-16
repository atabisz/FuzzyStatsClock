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
    public double StatsIntervalSeconds { get; init; } = 2.0;
    public bool   CpuVisible           { get; init; } = true;
    public bool   GpuVisible           { get; init; } = true;
    public bool   MemVisible           { get; init; } = true;
    public bool   PagVisible           { get; init; } = true;
    public bool   BatteryVisible       { get; init; } = true;
    public bool   UptimeVisible        { get; init; } = true;
    public bool   ShowHourTicks        { get; init; } = false;
    public bool   ShowMinuteDots       { get; init; } = false;
    public bool   ShowHourNumbers      { get; init; } = false;
    public ClockType ClockType         { get; init; } = ClockType.Phrase;
    public bool   LcdUse24Hr           { get; init; } = false;
    public bool   LcdShowSeconds       { get; init; } = true;
    public string LcdStyle             { get; init; } = "Dark";
    public LcdSize LcdSize             { get; init; } = LcdSize.Medium;
    public string AccentColor          { get; init; } = "#FFFFFFFF";  // AARRGGBB hex; default = White (matches existing Foreground="White" in XAML)
    public double Opacity              { get; init; } = 1.0;          // 0.0–1.0; default = fully opaque
    public bool   GhostModeEnabled     { get; init; } = true;
    public bool   AutoLaunchEnabled    { get; init; } = false;
    public bool   AutoContrastEnabled  { get; init; } = false;
    public double ProcessCountThresholdPercent { get; init; } = 5.0;
    public string TextStyle   { get; init; } = "Classic";  // "Classic"|"Split"|"Literary"|"Mono"
    public string PhraseStyle  { get; init; } = "Classic";
    public string PhraseLocale { get; init; } = "auto";     // "auto" = detect from CultureInfo.CurrentUICulture; or explicit "en"/"fr"/"es"/"de"/"ja"/"pl"
    public bool   ShowDate    { get; init; } = true;
    public string DateFormat  { get; init; } = "Short";   // "Short"|"Long"|"Numeric"|"ISO"
    public int    BatteryAlertThresholdPercent { get; init; } = 20;
    public bool   PhraseWrapEnabled            { get; init; } = true;
    public string PhraseWrapStyle              { get; init; } = "midpoint";  // "midpoint" | "natural"
    public bool   BackdropAlwaysVisible        { get; init; } = false;
    public int    BackdropOpacityPercent       { get; init; } = 35;
    public int    GhostFadeRadiusPx            { get; init; } = 80;  // 20-200px; default 80px per PROX-06/PROX-07
    // v4.2 — temperature line visibility (master toggle + per-sensor)
    // Defaults per REQUIREMENTS.md TEMP-TAB-02/-03 (NVMe amended ON→OFF on 2026-05-04 commit b2163d1 post-spike).
    public bool   TempsLineVisible             { get; init; } = false;   // master OFF
    public bool   TempCpuVisible               { get; init; } = true;    // per-sensor ON
    public bool   TempGpuVisible               { get; init; } = true;    // per-sensor ON
    public bool   TempMoboVisible              { get; init; } = false;   // per-sensor OFF (PawnIO-gated)
    public bool   TempNvmeVisible              { get; init; } = false;   // per-sensor OFF (spike amendment — NVMe not enumerated on baseline hardware)

    // v4.3 — configurable ghost override modifiers (Phase 81 CFG-01)
    // Defaults preserve Ctrl+Alt behavior for v4.2 upgrades (CFG-04).
    // Explicit init defaults required: bool JSON-deserializes as false when field absent;
    // UseCtrl/UseAlt MUST be true on upgrade, not C# bool default false.
    public bool UseCtrl  { get; init; } = true;   // Left-Ctrl enabled by default
    public bool UseAlt   { get; init; } = true;   // Left-Alt enabled by default
    public bool UseShift { get; init; } = false;  // Left-Shift disabled by default
    public bool UseWin   { get; init; } = false;  // Left-Windows-key disabled by default (C# bool default = absent-field default, no upgrade hazard)

    // v4.5 Phase 88 — Update checker on-launch toggle (PERS-01).
    // Default = true: explicit init mandatory so v4.4 users upgrading via JSON
    // round-trip don't silently lose update checks (mirrors UptimeVisible /
    // GhostModeEnabled / UseCtrl pattern).
    public bool UpdateChecksEnabled { get; init; } = true;

    // v4.6 — Force WPF software rendering (RenderMode.SoftwareOnly) for this window.
    // Default = true: on the GPU (hardware) render path, this per-pixel-transparent
    // always-on-top layered overlay can silently drop its glyph layer under heavy
    // GPU/memory pressure — text vanishes while vector bars keep painting, and only a
    // window move forces a re-composite. Software rendering eliminates that class of
    // bug at the root for negligible CPU cost on a widget this small. Explicit init
    // default true mirrors the GhostModeEnabled / UpdateChecksEnabled upgrade pattern.
    public bool SoftwareRenderingEnabled { get; init; } = true;
}
// LastActiveMonitor = "": sentinel for "no saved monitor — use PositionTopRight() on primary"
