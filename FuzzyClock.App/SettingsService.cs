// Sources:
//   Environment.SpecialFolder: https://learn.microsoft.com/en-us/dotnet/api/system.environment.specialfolder
//   System.Text.Json: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview
//   SystemParameters.VirtualScreen*: https://learn.microsoft.com/en-us/dotnet/api/system.windows.systemparameters.virtualscreenwidth
//   File.Move overwrite: .NET 3.0+ BCL
using System.IO;
using System.Text.Json;
using System.Windows;

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
            var loaded = JsonSerializer.Deserialize<AppSettings>(json) ?? Defaults();
            // Guard: StatsIntervalSeconds=0 means the field was absent in an old settings
            // file or the file is corrupted. A zero-interval DispatcherTimer fires at
            // maximum rate, causing a CPU spike. Replace with the safe default.
            if (loaded.StatsIntervalSeconds <= 0)
                loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };
            // NEW: Opacity guard — prevents invisible-widget regression on v1.9 upgrade
            // (C# double type default is 0.0; "Opacity":0.0 in malformed JSON or an explicit
            // zero written by a future bug would make the widget fully transparent with no
            // way to recover without deleting settings.json)
            if (loaded.Opacity <= 0.0)
                loaded = loaded with { Opacity = Defaults().Opacity };
            // NEW: AccentColor guard — prevents NullReferenceException in ColorConverter.ConvertFromString
            // (protects against "AccentColor":null or "AccentColor":"" in a manually edited settings file)
            if (string.IsNullOrWhiteSpace(loaded.AccentColor))
                loaded = loaded with { AccentColor = Defaults().AccentColor };
            return loaded;
        }
        catch { return Defaults(); }
    }

    public static void Save(AppSettings s)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        string tempPath = FilePath + ".tmp";
        File.WriteAllText(tempPath, JsonSerializer.Serialize(s));
        File.Move(tempPath, FilePath, overwrite: true);
    }

    // Left = -1: sentinel for "no saved position"
    public static AppSettings Defaults() => new()
    {
        Left = -1, Top = 20, FontSize = 32,
        StatsVisible = false, StatsIntervalSeconds = 3,
        CpuVisible = true, GpuVisible = true, MemVisible = true,
        PagVisible = true, DialMode = false,
        AccentColor = "#FFFFFFFF",
        Opacity = 1.0
    };

    /// <summary>
    /// Clamp Left/Top so the entire window is within the virtual screen bounds.
    /// Must be called after ActualWidth/ActualHeight are valid (ContentRendered or later).
    /// </summary>
    public static AppSettings Clamp(AppSettings s, double windowWidth, double windowHeight)
    {
        double vLeft   = SystemParameters.VirtualScreenLeft;
        double vTop    = SystemParameters.VirtualScreenTop;
        double vWidth  = SystemParameters.VirtualScreenWidth;
        double vHeight = SystemParameters.VirtualScreenHeight;
        double left = Math.Clamp(s.Left, vLeft, vLeft + vWidth  - windowWidth);
        double top  = Math.Clamp(s.Top,  vTop,  vTop  + vHeight - windowHeight);
        return s with { Left = left, Top = top };
    }
}
