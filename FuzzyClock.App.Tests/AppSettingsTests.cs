using System.Collections.Generic;
using System.Text.Json;
using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Tests for AppSettings JSON round-trip and absent-field default behavior.
/// STEST-01: Full round-trip serialization preserves all fields.
/// STEST-02: Deserializing JSON with UptimeVisible absent yields UptimeVisible=true.
/// STEST-03: Deserializing JSON with MonitorPositions absent yields empty dict.
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
            MonitorPositions     = new Dictionary<string, MonitorPosition>
            {
                ["dell u2720q"] = new MonitorPosition { Left = 100.5, Top = 200.5 }
            },
            LastActiveMonitor    = "dell u2720q",
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
            TextStyle            = "Mono",
            ProcessCountThresholdPercent = 2.0,
            ShowDate   = false,
            DateFormat = "ISO",
        };

        string json = JsonSerializer.Serialize(original);
        var result  = JsonSerializer.Deserialize<AppSettings>(json)!;

        Assert.AreEqual(original.LastActiveMonitor,    result.LastActiveMonitor,                 "LastActiveMonitor");
        Assert.IsTrue(result.MonitorPositions.ContainsKey("dell u2720q"),                        "MonitorPositions key");
        Assert.AreEqual(100.5, result.MonitorPositions["dell u2720q"].Left, 0.0001,              "MonitorPositions Left");
        Assert.AreEqual(200.5, result.MonitorPositions["dell u2720q"].Top,  0.0001,              "MonitorPositions Top");
        Assert.AreEqual(original.FontSize,             result.FontSize,                          "FontSize");
        Assert.AreEqual(original.StatsVisible,         result.StatsVisible,                      "StatsVisible");
        Assert.AreEqual(original.StatsIntervalSeconds, result.StatsIntervalSeconds,               "StatsIntervalSeconds");
        Assert.AreEqual(original.CpuVisible,           result.CpuVisible,                        "CpuVisible");
        Assert.AreEqual(original.GpuVisible,           result.GpuVisible,                        "GpuVisible");
        Assert.AreEqual(original.MemVisible,           result.MemVisible,                        "MemVisible");
        Assert.AreEqual(original.PagVisible,           result.PagVisible,                        "PagVisible");
        Assert.AreEqual(original.UptimeVisible,        result.UptimeVisible,                     "UptimeVisible");
        Assert.AreEqual(original.DialMode,             result.DialMode,                          "DialMode");
        Assert.AreEqual(original.ShowHourTicks,        result.ShowHourTicks,                     "ShowHourTicks");
        Assert.AreEqual(original.ShowMinuteDots,       result.ShowMinuteDots,                    "ShowMinuteDots");
        Assert.AreEqual(original.ShowHourNumbers,      result.ShowHourNumbers,                   "ShowHourNumbers");
        Assert.AreEqual(original.AccentColor,          result.AccentColor,                       "AccentColor");
        Assert.AreEqual(original.Opacity,              result.Opacity,              0.0001,       "Opacity");
        Assert.AreEqual(original.GhostModeEnabled,     result.GhostModeEnabled,                  "GhostModeEnabled");
        Assert.AreEqual(original.TextStyle,             result.TextStyle,                          "TextStyle");
        Assert.AreEqual(original.ProcessCountThresholdPercent, result.ProcessCountThresholdPercent, 0.0001, "ProcessCountThresholdPercent");
        Assert.AreEqual(original.ShowDate,   result.ShowDate,   "ShowDate");
        Assert.AreEqual(original.DateFormat, result.DateFormat, "DateFormat");
    }

    // STEST-02: Deserialize JSON that omits the UptimeVisible field entirely.
    // AppSettings uses init properties — absent fields keep their init default (true),
    // NOT the C# type default (false). This test documents and protects that contract.
    [TestMethod]
    public void Deserialize_MissingUptimeVisible_DefaultsToTrue()
    {
        // JSON from a hypothetical older settings file that predates UptimeVisible.
        // Left/Top are ignored (unknown fields are silently skipped by System.Text.Json).
        const string json = """{"FontSize":32,"StatsVisible":false,"StatsIntervalSeconds":3,"CpuVisible":true,"GpuVisible":true,"MemVisible":true,"PagVisible":true,"DialMode":false,"ShowHourTicks":false,"ShowMinuteDots":false,"ShowHourNumbers":false,"AccentColor":"#FFFFFFFF","Opacity":1.0,"GhostModeEnabled":true}""";

        var result = JsonSerializer.Deserialize<AppSettings>(json)!;

        // Must be true (init default), NOT false (C# bool default)
        Assert.IsTrue(result.UptimeVisible,
            "UptimeVisible should default to true when absent from JSON (init default), not false (C# bool default)");
    }

    [TestMethod]
    public void AppSettings_TextStyle_DefaultIsClassic()
    {
        var s = new AppSettings();
        Assert.AreEqual("Classic", s.TextStyle);
    }

    [TestMethod]
    public void AppSettings_TextStyle_RoundTrips()
    {
        var original = new AppSettings { TextStyle = "Mono" };
        var json = System.Text.Json.JsonSerializer.Serialize(original);
        var loaded = System.Text.Json.JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.AreEqual("Mono", loaded.TextStyle);
    }

    [TestMethod]
    public void AppSettings_MissingTextStyle_DefaultsToClassic()
    {
        // Simulate old settings.json without TextStyle field
        var json = "{\"FontSize\":32}";
        var loaded = System.Text.Json.JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.AreEqual("Classic", loaded.TextStyle);
    }

    // STEST-08: ShowDate absent → defaults to true
    [TestMethod]
    public void Deserialize_MissingShowDate_DefaultsToTrue()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.IsTrue(result.ShowDate,
            "ShowDate should default to true when absent from JSON (init default), not false (C# bool default)");
    }

    // STEST-08: DateFormat absent → defaults to "Short"
    [TestMethod]
    public void Deserialize_MissingDateFormat_DefaultsToShort()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.AreEqual("Short", result.DateFormat,
            "DateFormat should default to Short when absent from JSON (init default), not null/empty");
    }

    // STEST-03: Deserialize JSON with MonitorPositions absent yields empty dictionary, not null.
    [TestMethod]
    public void Deserialize_MissingMonitorPositions_DefaultsToEmptyDict()
    {
        const string json = """{"FontSize":32,"StatsVisible":false,"StatsIntervalSeconds":3}""";

        var result = JsonSerializer.Deserialize<AppSettings>(json)!;

        Assert.IsNotNull(result.MonitorPositions, "MonitorPositions should not be null when absent from JSON");
        Assert.IsEmpty(result.MonitorPositions, "MonitorPositions should be empty when absent from JSON");
        Assert.AreEqual("", result.LastActiveMonitor, "LastActiveMonitor should default to empty string");
    }
}
