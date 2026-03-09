using System.Collections.Generic;
using Color = System.Windows.Media.Color;

namespace FuzzyClock.App;

/// <summary>Immutable definition of a named theme preset.</summary>
internal record ThemeDefinition
{
    public required string Name         { get; init; }
    public required Color  AccentColor  { get; init; }
    public required double Opacity      { get; init; }
    public required int    FontSize     { get; init; }
    public required bool   DialMode     { get; init; }
    public required bool   StatsVisible { get; init; }
}

/// <summary>Registry of all built-in named themes.</summary>
internal static class BuiltInThemes
{
    public static readonly IReadOnlyDictionary<string, ThemeDefinition> All =
        new Dictionary<string, ThemeDefinition>
        {
            ["Midnight"] = new ThemeDefinition
            {
                Name         = "Midnight",
                AccentColor  = Color.FromArgb(0xFF, 0x6A, 0x7F, 0xDB),
                Opacity      = 0.85,
                FontSize     = 32,
                DialMode     = false,
                StatsVisible = false,
            },
            ["Neon"] = new ThemeDefinition
            {
                Name         = "Neon",
                AccentColor  = Color.FromArgb(0xFF, 0x00, 0xF5, 0xD4),
                Opacity      = 1.0,
                FontSize     = 32,
                DialMode     = true,
                StatsVisible = true,
            },
            ["Ghost"] = new ThemeDefinition
            {
                Name         = "Ghost",
                AccentColor  = Color.FromArgb(0xFF, 0xC0, 0xC8, 0xD8),
                Opacity      = 0.35,
                FontSize     = 24,
                DialMode     = false,
                StatsVisible = false,
            },
            ["Warm"] = new ThemeDefinition
            {
                Name         = "Warm",
                AccentColor  = Color.FromArgb(0xFF, 0xF4, 0xA2, 0x61),
                Opacity      = 0.90,
                FontSize     = 32,
                DialMode     = false,
                StatsVisible = true,
            },
            ["Terminal"] = new ThemeDefinition
            {
                Name         = "Terminal",
                AccentColor  = Color.FromArgb(0xFF, 0x39, 0xFF, 0x14),
                Opacity      = 0.95,
                FontSize     = 24,
                DialMode     = true,
                StatsVisible = true,
            },
        };

    /// <summary>Returns the named theme or null if not found or name is null.</summary>
    public static ThemeDefinition? TryGet(string? name)
        => name is not null && All.TryGetValue(name, out var def) ? def : null;
}
