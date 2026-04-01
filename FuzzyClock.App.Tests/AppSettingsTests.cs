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
            StatsIntervalSeconds = 2.5,
            CpuVisible           = false,
            GpuVisible           = false,
            MemVisible           = false,
            PagVisible           = false,
            UptimeVisible        = false,
            ClockType            = ClockType.Dial,
            LcdUse24Hr           = true,
            LcdShowSeconds       = false,
            LcdSize              = LcdSize.Large,
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
            LcdStyle   = "Paper",
            GhostFadeRadiusPx = 120,  // non-default value to prove round-trip
        };

        string json = JsonSerializer.Serialize(original);
        var result  = JsonSerializer.Deserialize<AppSettings>(json)!;

        Assert.AreEqual(original.LastActiveMonitor,    result.LastActiveMonitor,                 "LastActiveMonitor");
        Assert.IsTrue(result.MonitorPositions.ContainsKey("dell u2720q"),                        "MonitorPositions key");
        Assert.AreEqual(100.5, result.MonitorPositions["dell u2720q"].Left, 0.0001,              "MonitorPositions Left");
        Assert.AreEqual(200.5, result.MonitorPositions["dell u2720q"].Top,  0.0001,              "MonitorPositions Top");
        Assert.AreEqual(original.FontSize,             result.FontSize,                          "FontSize");
        Assert.AreEqual(original.StatsVisible,         result.StatsVisible,                      "StatsVisible");
        Assert.AreEqual(original.StatsIntervalSeconds, result.StatsIntervalSeconds, 0.0001,        "StatsIntervalSeconds");
        Assert.AreEqual(original.CpuVisible,           result.CpuVisible,                        "CpuVisible");
        Assert.AreEqual(original.GpuVisible,           result.GpuVisible,                        "GpuVisible");
        Assert.AreEqual(original.MemVisible,           result.MemVisible,                        "MemVisible");
        Assert.AreEqual(original.PagVisible,           result.PagVisible,                        "PagVisible");
        Assert.AreEqual(original.UptimeVisible,        result.UptimeVisible,                     "UptimeVisible");
        Assert.AreEqual(original.ClockType,             result.ClockType,                         "ClockType");
        Assert.AreEqual(original.LcdUse24Hr,           result.LcdUse24Hr,                        "LcdUse24Hr");
        Assert.AreEqual(original.LcdShowSeconds,       result.LcdShowSeconds,                    "LcdShowSeconds");
        Assert.AreEqual(original.LcdSize,              result.LcdSize,                           "LcdSize");
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
        Assert.AreEqual(original.LcdStyle,   result.LcdStyle,   "LcdStyle");
        Assert.AreEqual(original.GhostFadeRadiusPx, result.GhostFadeRadiusPx, "GhostFadeRadiusPx");
    }

    // STEST-02: Deserialize JSON that omits the UptimeVisible field entirely.
    // AppSettings uses init properties — absent fields keep their init default (true),
    // NOT the C# type default (false). This test documents and protects that contract.
    [TestMethod]
    public void Deserialize_MissingUptimeVisible_DefaultsToTrue()
    {
        // JSON from a hypothetical older settings file that predates UptimeVisible.
        // "DialMode" is now a legacy field (removed in Phase 48); System.Text.Json silently ignores unknown fields.
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

    // F10 LCD absent-field defaults

    [TestMethod]
    public void Deserialize_MissingLcdUse24Hr_DefaultsToFalse()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.IsFalse(result.LcdUse24Hr,
            "LcdUse24Hr should default to false when absent from JSON");
    }

    [TestMethod]
    public void Deserialize_MissingLcdShowSeconds_DefaultsToTrue()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.IsTrue(result.LcdShowSeconds,
            "LcdShowSeconds should default to true when absent from JSON");
    }

    [TestMethod]
    public void Deserialize_MissingLcdStyle_DefaultsToDark()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.AreEqual("Dark", result.LcdStyle,
            "LcdStyle should default to Dark when absent from JSON");
    }

    [TestMethod]
    public void Deserialize_MissingLcdSize_DefaultsToMedium()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.AreEqual(LcdSize.Medium, result.LcdSize,
            "LcdSize should default to Medium when absent from JSON");
    }

    [TestMethod]
    public void Deserialize_MissingClockType_DefaultsToPhrase()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.AreEqual(ClockType.Phrase, result.ClockType,
            "ClockType should default to Phrase when absent from JSON (init default)");
    }

    [TestMethod]
    public void Deserialize_MissingGhostFadeRadiusPx_DefaultsTo80()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.AreEqual(80, result.GhostFadeRadiusPx,
            "GhostFadeRadiusPx should default to 80 when absent from JSON (init default), not 0");
    }

    [TestMethod]
    public void Deserialize_IntegerStatsInterval_DeserializesToDouble()
    {
        // Simulate v4.0 settings.json with integer StatsIntervalSeconds
        const string json = """{"StatsIntervalSeconds":3}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.AreEqual(3.0, result.StatsIntervalSeconds, 0.0001,
            "Integer 3 in JSON should deserialize to double 3.0");
    }

}
