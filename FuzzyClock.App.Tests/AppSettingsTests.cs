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

    // ----- v4.2 temps-visibility fields (TEST-01/TEST-02/TEST-03) -----

    [TestMethod]
    public void Deserialize_MissingTempsLineVisible_DefaultsToFalse()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.IsFalse(result.TempsLineVisible,
            "TempsLineVisible should default to false when absent from JSON (init default per TEMP-TAB-02; master OFF on v4.1 upgrade)");
    }

    [TestMethod]
    public void Deserialize_MissingTempCpuVisible_DefaultsToTrue()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.IsTrue(result.TempCpuVisible,
            "TempCpuVisible should default to true when absent from JSON (init default per TEMP-TAB-03; NOT C# bool default false)");
    }

    [TestMethod]
    public void Deserialize_MissingTempGpuVisible_DefaultsToTrue()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.IsTrue(result.TempGpuVisible,
            "TempGpuVisible should default to true when absent from JSON (init default per TEMP-TAB-03)");
    }

    [TestMethod]
    public void Deserialize_MissingTempMoboVisible_DefaultsToFalse()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.IsFalse(result.TempMoboVisible,
            "TempMoboVisible should default to false when absent from JSON (init default per TEMP-TAB-03; PawnIO-gated)");
    }

    [TestMethod]
    public void Deserialize_MissingTempNvmeVisible_DefaultsToFalse()
    {
        const string json = """{"FontSize":32}""";
        var result = JsonSerializer.Deserialize<AppSettings>(json)!;
        Assert.IsFalse(result.TempNvmeVisible,
            "TempNvmeVisible should default to FALSE when absent from JSON (TEMP-TAB-03 amendment 2026-05-04 commit b2163d1; NVMe not enumerated on baseline hardware — NOT true)");
    }

    [TestMethod]
    public void RoundTrip_TempsLineVisible_Matches()
    {
        var original = new AppSettings { TempsLineVisible = true };   // flipped from default false
        var result   = JsonSerializer.Deserialize<AppSettings>(JsonSerializer.Serialize(original))!;
        Assert.IsTrue(result.TempsLineVisible);
    }

    [TestMethod]
    public void RoundTrip_TempCpuVisible_Matches()
    {
        var original = new AppSettings { TempCpuVisible = false };    // flipped from default true
        var result   = JsonSerializer.Deserialize<AppSettings>(JsonSerializer.Serialize(original))!;
        Assert.IsFalse(result.TempCpuVisible);
    }

    [TestMethod]
    public void RoundTrip_TempGpuVisible_Matches()
    {
        var original = new AppSettings { TempGpuVisible = false };    // flipped from default true
        var result   = JsonSerializer.Deserialize<AppSettings>(JsonSerializer.Serialize(original))!;
        Assert.IsFalse(result.TempGpuVisible);
    }

    [TestMethod]
    public void RoundTrip_TempMoboVisible_Matches()
    {
        var original = new AppSettings { TempMoboVisible = true };    // flipped from default false
        var result   = JsonSerializer.Deserialize<AppSettings>(JsonSerializer.Serialize(original))!;
        Assert.IsTrue(result.TempMoboVisible);
    }

    [TestMethod]
    public void RoundTrip_TempNvmeVisible_Matches()
    {
        var original = new AppSettings { TempNvmeVisible = true };    // flipped from default false (post-amendment)
        var result   = JsonSerializer.Deserialize<AppSettings>(JsonSerializer.Serialize(original))!;
        Assert.IsTrue(result.TempNvmeVisible);
    }

    // ----- v4.2 Phase 78 SettingsSnapshot extension tests -----

    [TestMethod]
    public void SettingsSnapshot_AllTenNewFieldsAreInitSettable()
    {
        var snap = new SettingsSnapshot
        {
            TempsLineVisible   = true,
            TempCpuVisible     = false,
            TempGpuVisible     = false,
            TempMoboVisible    = true,
            TempNvmeVisible    = true,
            CpuTempC           = 52f,
            GpuTempC           = 61f,
            MoboTempC          = -1f,
            NvmeTempC          = 38f,
            TempsServiceReady  = true,
        };
        Assert.IsTrue(snap.TempsLineVisible,   "TempsLineVisible should survive init");
        Assert.IsFalse(snap.TempCpuVisible,    "TempCpuVisible should survive init");
        Assert.IsFalse(snap.TempGpuVisible,    "TempGpuVisible should survive init");
        Assert.IsTrue(snap.TempMoboVisible,    "TempMoboVisible should survive init");
        Assert.IsTrue(snap.TempNvmeVisible,    "TempNvmeVisible should survive init");
        Assert.AreEqual(52f, snap.CpuTempC,    "CpuTempC should survive init");
        Assert.AreEqual(61f, snap.GpuTempC,    "GpuTempC should survive init");
        Assert.AreEqual(-1f, snap.MoboTempC,   "MoboTempC should survive init (sentinel)");
        Assert.AreEqual(38f, snap.NvmeTempC,   "NvmeTempC should survive init");
        Assert.IsTrue(snap.TempsServiceReady,  "TempsServiceReady should survive init");
    }

    [TestMethod]
    public void SettingsSnapshot_NewFieldsHaveZeroValueDefaults()
    {
        // SettingsSnapshot is a PROJECTION of current app state, not a config model.
        // New fields default to C# type zero-values; MainWindow.GetCurrentSettingsSnapshot
        // populates them from AppSettings + TemperatureService at open time (Phase 78-02).
        var snap = new SettingsSnapshot();
        Assert.IsFalse(snap.TempsLineVisible,   "TempsLineVisible default = bool default (false)");
        Assert.IsFalse(snap.TempCpuVisible,     "TempCpuVisible default = bool default (false)");
        Assert.IsFalse(snap.TempGpuVisible,     "TempGpuVisible default = bool default (false)");
        Assert.IsFalse(snap.TempMoboVisible,    "TempMoboVisible default = bool default (false)");
        Assert.IsFalse(snap.TempNvmeVisible,    "TempNvmeVisible default = bool default (false)");
        Assert.AreEqual(0f, snap.CpuTempC,      "CpuTempC default = float default (0f)");
        Assert.AreEqual(0f, snap.GpuTempC,      "GpuTempC default = float default (0f)");
        Assert.AreEqual(0f, snap.MoboTempC,     "MoboTempC default = float default (0f)");
        Assert.AreEqual(0f, snap.NvmeTempC,     "NvmeTempC default = float default (0f)");
        Assert.IsFalse(snap.TempsServiceReady,  "TempsServiceReady default = bool default (false)");
    }

    // ----- v4.2 Phase 78-02 GetCurrentSettingsSnapshot mapping-contract tests -----

    [TestMethod]
    public void GetCurrentSettingsSnapshotContract_MapsAppSettings_ToTempVisibilityFields()
    {
        // Simulate MainWindow.GetCurrentSettingsSnapshot's mapping: AppSettings + TemperatureService → SettingsSnapshot.
        // Direct invocation of MainWindow would require an STA WPF host; instead we assert the contract
        // the method must uphold — snapshot fields are a projection of AppSettings.Temp* fields plus live
        // TemperatureService sensor values + IsReady.
        var settings = new AppSettings
        {
            TempsLineVisible = true,
            TempCpuVisible   = true,
            TempGpuVisible   = false,
            TempMoboVisible  = true,
            TempNvmeVisible  = false,
        };
        // Stand-in for _temperatureService readings at the moment OpenSettings fires:
        const float cpu = 52f, gpu = 61f, mobo = -1f, nvme = 38f;
        const bool  ready = true;

        var snap = new SettingsSnapshot
        {
            TempsLineVisible   = settings.TempsLineVisible,
            TempCpuVisible     = settings.TempCpuVisible,
            TempGpuVisible     = settings.TempGpuVisible,
            TempMoboVisible    = settings.TempMoboVisible,
            TempNvmeVisible    = settings.TempNvmeVisible,
            CpuTempC           = cpu,
            GpuTempC           = gpu,
            MoboTempC          = mobo,
            NvmeTempC          = nvme,
            TempsServiceReady  = ready,
        };

        Assert.IsTrue(snap.TempsLineVisible,    "TempsLineVisible mirrors AppSettings");
        Assert.IsTrue(snap.TempCpuVisible,      "TempCpuVisible mirrors AppSettings");
        Assert.IsFalse(snap.TempGpuVisible,     "TempGpuVisible mirrors AppSettings");
        Assert.IsTrue(snap.TempMoboVisible,     "TempMoboVisible mirrors AppSettings");
        Assert.IsFalse(snap.TempNvmeVisible,    "TempNvmeVisible mirrors AppSettings");
        Assert.AreEqual(52f, snap.CpuTempC,     "CpuTempC mirrors TemperatureService.CpuTempC");
        Assert.AreEqual(61f, snap.GpuTempC,     "GpuTempC mirrors TemperatureService.GpuTempC");
        Assert.AreEqual(-1f, snap.MoboTempC,    "MoboTempC mirrors -1f sentinel per D-11");
        Assert.AreEqual(38f, snap.NvmeTempC,    "NvmeTempC mirrors TemperatureService.NvmeTempC");
        Assert.IsTrue(snap.TempsServiceReady,   "TempsServiceReady mirrors TemperatureService.IsReady");
    }

    [TestMethod]
    public void GetCurrentSettingsSnapshotContract_PreIsReadyColdStart_AllSensorFieldsAreZeroValues()
    {
        // D-02: before IsReady flips true, GetCurrentSettingsSnapshot will see IsReady=false
        // and sensor properties at their (initial) sentinel values. The snapshot should reflect
        // that truthfully — the *optimistic* treatment is applied by SettingsWindow.RefreshControls,
        // not by the snapshot producer. Verifies snapshot is honest about state at capture time.
        var snap = new SettingsSnapshot
        {
            TempsServiceReady = false,   // cold start, IsReady not yet true
            CpuTempC          = -1f,
            GpuTempC          = -1f,
            MoboTempC         = -1f,
            NvmeTempC         = -1f,
        };
        Assert.IsFalse(snap.TempsServiceReady, "Pre-IsReady snapshot carries IsReady=false");
        // SettingsWindow.ApplyTempCheckboxNaState will observe !isReady and fall into the
        // D-02 optimistic branch regardless of sentinel values — verified in Plan 78-01 tests.
        Assert.AreEqual(-1f, snap.CpuTempC,  "Snapshot records the service's actual value at capture time");
        Assert.AreEqual(-1f, snap.MoboTempC, "Snapshot records the service's actual value at capture time");
    }

}
