using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class UptimeFormatterTests
{
    // ----- Sub-hour: only minutes shown (Days=0, Hours=0) -----

    [TestMethod]
    [DataRow(45, "up 45m")]   // typical sub-hour
    [DataRow(59, "up 59m")]   // sub-hour ceiling
    public void SubHour_OnlyMinutesShown(int totalMinutes, string expected)
    {
        var uptime = TimeSpan.FromMinutes(totalMinutes);
        Assert.AreEqual(expected, UptimeFormatter.Format(uptime));
    }

    // ----- Exactly 1 hour boundary -----

    [TestMethod]
    public void ExactlyOneHour_ShowsHoursAndMinutes()
    {
        // new TimeSpan(hours, minutes, seconds): Days=0, Hours=1, Minutes=0
        var uptime = new TimeSpan(1, 0, 0);
        Assert.AreEqual("up 1h 0m", UptimeFormatter.Format(uptime));
    }

    // ----- Hours only (>= 1h, < 24h) -----

    [TestMethod]
    public void FiveHoursThirtyMinutes_ShowsHoursAndMinutes()
    {
        var uptime = new TimeSpan(5, 30, 0);
        Assert.AreEqual("up 5h 30m", UptimeFormatter.Format(uptime));
    }

    // ----- Exactly 1 day boundary -----

    [TestMethod]
    public void ExactlyOneDay_ShowsDaysHoursMinutes()
    {
        // new TimeSpan(hours, minutes, seconds) with hours=24 normalizes to Days=1, Hours=0, Minutes=0
        var uptime = new TimeSpan(24, 0, 0);
        Assert.AreEqual("up 1d 0h 0m", UptimeFormatter.Format(uptime));
    }

    // ----- Days + hours + minutes -----

    [TestMethod]
    [DataRow(26, 15, "up 1d 2h 15m")]   // 26h 15m = 1d 2h 15m
    [DataRow(48,  0, "up 2d 0h 0m")]    // 48h = 2d 0h 0m
    public void DaysPresent_ShowsDaysHoursMinutes(int totalHours, int extraMinutes, string expected)
    {
        var uptime = new TimeSpan(totalHours, extraMinutes, 0);
        Assert.AreEqual(expected, UptimeFormatter.Format(uptime));
    }
}
