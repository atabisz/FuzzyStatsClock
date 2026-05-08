// Sources:
//   Environment.SpecialFolder: https://learn.microsoft.com/en-us/dotnet/api/system.environment.specialfolder
//   System.Text.Json: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview
//   File.Move overwrite: .NET 3.0+ BCL
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Windows.Forms;

namespace FuzzyClock.App;

public static class SettingsService
{
    private static readonly string FilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FuzzyClock", "settings.json");

    public static AppSettings Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return Defaults();
            var json = File.ReadAllText(FilePath);

            // Detect old Left/Top fields for migration
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            bool hasOldLeft      = doc.RootElement.TryGetProperty("Left", out var leftEl);
            bool hasNewPositions = doc.RootElement.TryGetProperty("MonitorPositions", out _);

            var loaded = JsonSerializer.Deserialize<AppSettings>(json) ?? Defaults();

            if (hasOldLeft && !hasNewPositions)
            {
                // Migrate: put the old position under the primary monitor key
                double oldLeft = leftEl.GetDouble();
                // Only migrate if Left != -1 (old sentinel for "no saved position")
                if (oldLeft != -1)
                {
                    var topEl = doc.RootElement.GetProperty("Top");
                    double oldTop = topEl.GetDouble();
                    string primaryKey = MonitorService.GetPrimaryMonitorKey();
                    loaded = loaded with
                    {
                        MonitorPositions = new Dictionary<string, MonitorPosition>
                        {
                            [primaryKey] = new MonitorPosition { Left = oldLeft, Top = oldTop }
                        },
                        LastActiveMonitor = primaryKey
                    };
                }
            }

            // Migrate legacy "DialMode" bool to ClockType enum
            bool hasDialMode = doc.RootElement.TryGetProperty("DialMode", out var dialEl);
            if (hasDialMode && loaded.ClockType == ClockType.Phrase)
            {
                // Only migrate if the new ClockType field was absent (defaulted to Phrase)
                if (dialEl.ValueKind == System.Text.Json.JsonValueKind.True)
                    loaded = loaded with { ClockType = ClockType.Dial };
                // false → stays Phrase (already the default, no action needed)
            }

            return Validate(loaded);
        }
        catch { return Defaults(); }
    }

    /// <summary>
    /// Applies safety guards to a deserialized AppSettings instance.
    /// Pure: no file I/O, no WPF dependencies. Safe to call from unit tests.
    /// </summary>
    public static AppSettings Validate(AppSettings loaded)
    {
        // Guard: StatsIntervalSeconds must be in [0.5, 10.0] range.
        // Values outside range (including 0 from absent/corrupted fields) get the safe default.
        // Valid values are rounded to 1 decimal place to prevent floating-point noise.
        if (loaded.StatsIntervalSeconds < 0.5 || loaded.StatsIntervalSeconds > 10.0)
            loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };
        else
            loaded = loaded with { StatsIntervalSeconds = Math.Round(loaded.StatsIntervalSeconds, 1) };
        // Opacity guard — prevents invisible-widget regression on v1.9 upgrade
        // (C# double type default is 0.0; "Opacity":0.0 in malformed JSON or an explicit
        // zero written by a future bug would make the widget fully transparent with no
        // way to recover without deleting settings.json)
        if (loaded.Opacity <= 0.0)
            loaded = loaded with { Opacity = Defaults().Opacity };
        // AccentColor guard — prevents NullReferenceException in ColorConverter.ConvertFromString
        // (protects against "AccentColor":null or "AccentColor":"" in a manually edited settings file)
        if (string.IsNullOrWhiteSpace(loaded.AccentColor))
            loaded = loaded with { AccentColor = Defaults().AccentColor };
        // ProcessCountThresholdPercent guard — only 2.0, 5.0, 10.0 are valid ladder values
        // (protects against manually edited settings files with invalid values)
        double[] validThresholds = { 2.0, 5.0, 10.0 };
        if (!validThresholds.Contains(loaded.ProcessCountThresholdPercent))
            loaded = loaded with { ProcessCountThresholdPercent = Defaults().ProcessCountThresholdPercent };
        // BatteryAlertThresholdPercent guard — only 10, 15, 20 are valid ladder values
        int[] validAlertThresholds = { 10, 15, 20 };
        if (!validAlertThresholds.Contains(loaded.BatteryAlertThresholdPercent))
            loaded = loaded with { BatteryAlertThresholdPercent = Defaults().BatteryAlertThresholdPercent };
        // TextStyle guard — only the four named presets are valid
        string[] validStyles = { "Classic", "Split", "Literary", "Mono" };
        if (string.IsNullOrWhiteSpace(loaded.TextStyle) || !validStyles.Contains(loaded.TextStyle))
            loaded = loaded with { TextStyle = Defaults().TextStyle };
        // DateFormat guard — only the four named formats are valid
        string[] validDateFormats = { "Short", "Long", "Numeric", "ISO" };
        if (string.IsNullOrWhiteSpace(loaded.DateFormat) || !validDateFormats.Contains(loaded.DateFormat))
            loaded = loaded with { DateFormat = Defaults().DateFormat };
        // PhraseStyle guard — unknown values fall through to Classic in the locale switch,
        // but an explicit guard is consistent with TextStyle and DateFormat patterns.
        string[] validPhraseStyles = { "Classic", "Terse", "Poetic", "Rude",
                                        "Pirate", "Dwarf", "Jive", "ValleyGirl",
                                        "Yoda", "Shakespeare" };
        if (string.IsNullOrWhiteSpace(loaded.PhraseStyle) || !validPhraseStyles.Contains(loaded.PhraseStyle))
            loaded = loaded with { PhraseStyle = Defaults().PhraseStyle };
        // LcdStyle guard — only Dark, Paper, Silver are valid
        string[] validLcdStyles = { "Dark", "Paper", "Silver" };
        if (string.IsNullOrWhiteSpace(loaded.LcdStyle) || !validLcdStyles.Contains(loaded.LcdStyle))
            loaded = loaded with { LcdStyle = Defaults().LcdStyle };
        // GhostFadeRadiusPx guard -- valid range 20-200px per PROX-06
        if (loaded.GhostFadeRadiusPx < 20 || loaded.GhostFadeRadiusPx > 200)
            loaded = loaded with { GhostFadeRadiusPx = Defaults().GhostFadeRadiusPx };
        // MonitorPositions null guard — null can occur if someone manually edits settings.json
        // and writes "MonitorPositions":null
        if (loaded.MonitorPositions == null)
            loaded = loaded with { MonitorPositions = new Dictionary<string, MonitorPosition>() };
        return loaded;
    }

    public static void Save(AppSettings s)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        string tempPath = FilePath + ".tmp";
        File.WriteAllText(tempPath, JsonSerializer.Serialize(s));
        File.Move(tempPath, FilePath, overwrite: true);
    }

    public static AppSettings Defaults() => new()
    {
        FontSize = 32,
        StatsVisible = false, StatsIntervalSeconds = 2.0,
        CpuVisible = true, GpuVisible = true, MemVisible = true,
        PagVisible = true, BatteryVisible = true, UptimeVisible = true,
        ClockType = ClockType.Phrase,
        ShowHourTicks = false, ShowMinuteDots = false, ShowHourNumbers = false,
        AccentColor = "#FFFFFFFF",
        Opacity = 1.0,
        GhostModeEnabled = true,
        AutoLaunchEnabled = false,
        AutoContrastEnabled = false,
        ProcessCountThresholdPercent = 5.0,
        TextStyle = "Classic",
        ShowDate = true,
        DateFormat = "Short",
        MonitorPositions = new Dictionary<string, MonitorPosition>(),
        LastActiveMonitor = "",
        BatteryAlertThresholdPercent = 20,
        GhostFadeRadiusPx = 80,
        TempsLineVisible = false,
        TempCpuVisible   = true,
        TempGpuVisible   = true,
        TempMoboVisible  = false,
        TempNvmeVisible  = false
    };

    /// <summary>
    /// Clamps a MonitorPosition so the window stays within the specified screen's working area.
    /// Uses WorkingArea (not Bounds) to avoid positioning under the taskbar.
    /// </summary>
    public static MonitorPosition Clamp(MonitorPosition pos, double windowWidth, double windowHeight,
        System.Windows.Forms.Screen screen)
    {
        var b = screen.WorkingArea;
        return Clamp(pos, windowWidth, windowHeight, b.Left, b.Top, b.Width, b.Height);
    }

    /// <summary>
    /// Pure overload: clamp MonitorPosition within explicit bounds.
    /// No WPF or WinForms dependency — safe to call from unit tests.
    /// </summary>
    public static MonitorPosition Clamp(MonitorPosition pos, double windowWidth, double windowHeight,
        double bLeft, double bTop, double bWidth, double bHeight)
    {
        double left = Math.Clamp(pos.Left, bLeft, bLeft + bWidth  - windowWidth);
        double top  = Math.Clamp(pos.Top,  bTop,  bTop  + bHeight - windowHeight);
        return pos with { Left = left, Top = top };
    }
}
