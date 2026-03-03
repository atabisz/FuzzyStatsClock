using System.Text.Json;
using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Tests for AppSettings JSON round-trip and absent-field default behavior.
/// STEST-01: Full round-trip serialization preserves all fields.
/// STEST-02: Deserializing JSON with UptimeVisible absent yields UptimeVisible=true.
/// </summary>
[TestClass]
public class AppSettingsTests
{
    // STEST-01: Full round-trip — serialize then deserialize a fully-populated instance.
    // Verifies every field survives JSON serialization intact.
    [TestMethod]
    public void RoundTrip_FullyPopulated_AllFieldsMatch()
    {
        var original = new AppSettings
        {
            Left                 = 100.5,
            Top                  = 200.5,
            FontSize             = 24,
            StatsVisible         = true,
            StatsIntervalSeconds = 5,
            CpuVisible           = false,
            GpuVisible           = false,
            MemVisible           = false,
            PagVisible           = false,
            UptimeVisible        = false,
            DialMode             = true,
            ShowHourTicks        = true,
            ShowMinuteDots       = true,
            ShowHourNumbers      = true,
            AccentColor          = "#FF123456",
            Opacity              = 0.75,
            GhostModeEnabled     = false,
        };

        string json = JsonSerializer.Serialize(original);
        var result  = JsonSerializer.Deserialize<AppSettings>(json)!;

        Assert.AreEqual(original.Left,                 result.Left,                 0.0001, "Left");
        Assert.AreEqual(original.Top,                  result.Top,                  0.0001, "Top");
        Assert.AreEqual(original.FontSize,             result.FontSize,                      "FontSize");
        Assert.AreEqual(original.StatsVisible,         result.StatsVisible,                  "StatsVisible");
        Assert.AreEqual(original.StatsIntervalSeconds, result.StatsIntervalSeconds,           "StatsIntervalSeconds");
        Assert.AreEqual(original.CpuVisible,           result.CpuVisible,                    "CpuVisible");
        Assert.AreEqual(original.GpuVisible,           result.GpuVisible,                    "GpuVisible");
        Assert.AreEqual(original.MemVisible,           result.MemVisible,                    "MemVisible");
        Assert.AreEqual(original.PagVisible,           result.PagVisible,                    "PagVisible");
        Assert.AreEqual(original.UptimeVisible,        result.UptimeVisible,                 "UptimeVisible");
        Assert.AreEqual(original.DialMode,             result.DialMode,                      "DialMode");
        Assert.AreEqual(original.ShowHourTicks,        result.ShowHourTicks,                 "ShowHourTicks");
        Assert.AreEqual(original.ShowMinuteDots,       result.ShowMinuteDots,                "ShowMinuteDots");
        Assert.AreEqual(original.ShowHourNumbers,      result.ShowHourNumbers,               "ShowHourNumbers");
        Assert.AreEqual(original.AccentColor,          result.AccentColor,                   "AccentColor");
        Assert.AreEqual(original.Opacity,              result.Opacity,              0.0001, "Opacity");
        Assert.AreEqual(original.GhostModeEnabled,     result.GhostModeEnabled,              "GhostModeEnabled");
    }

    // STEST-02: Deserialize JSON that omits the UptimeVisible field entirely.
    // AppSettings uses init properties — absent fields keep their init default (true),
    // NOT the C# type default (false). This test documents and protects that contract.
    [TestMethod]
    public void Deserialize_MissingUptimeVisible_DefaultsToTrue()
    {
        // JSON from a hypothetical older settings file that predates UptimeVisible
        const string json = """{"Left":50,"Top":50,"FontSize":32,"StatsVisible":false,"StatsIntervalSeconds":3,"CpuVisible":true,"GpuVisible":true,"MemVisible":true,"PagVisible":true,"DialMode":false,"ShowHourTicks":false,"ShowMinuteDots":false,"ShowHourNumbers":false,"AccentColor":"#FFFFFFFF","Opacity":1.0,"GhostModeEnabled":true}""";

        var result = JsonSerializer.Deserialize<AppSettings>(json)!;

        // Must be true (init default), NOT false (C# bool default)
        Assert.IsTrue(result.UptimeVisible,
            "UptimeVisible should default to true when absent from JSON (init default), not false (C# bool default)");
    }
}
