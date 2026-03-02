namespace FuzzyClock.Core;

public static class UptimeFormatter
{
    /// <summary>
    /// Returns a human-readable uptime string with leading-zero-unit suppression.
    /// Sub-hour: "up 45m". Hours only: "up 5h 30m". Days: "up 1d 2h 15m".
    /// </summary>
    public static string Format(TimeSpan uptime)
    {
        if (uptime.Days > 0)
            return $"up {uptime.Days}d {uptime.Hours}h {uptime.Minutes}m";
        if (uptime.Hours > 0)
            return $"up {uptime.Hours}h {uptime.Minutes}m";
        return $"up {uptime.Minutes}m";
    }
}
