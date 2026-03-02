namespace FuzzyClock.Core;

public static class DialGeometry
{
    /// <summary>
    /// Returns the hour hand angle in degrees (0-360, measured clockwise from 12 o'clock).
    /// Includes intra-hour interpolation based on minutes.
    /// Formula: ((hour % 12) / 12.0 + minute / 720.0) * 360.0
    /// </summary>
    public static double GetHourAngleDegrees(int hour, int minute) =>
        ((hour % 12) / 12.0 + minute / 720.0) * 360.0;

    /// <summary>
    /// Returns the minute hand angle in degrees (0-360, measured clockwise from 12 o'clock).
    /// Formula: (minute / 60.0) * 360.0
    /// </summary>
    public static double GetMinuteAngleDegrees(int minute) =>
        (minute / 60.0) * 360.0;
}
