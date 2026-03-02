using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class DialGeometryTests
{
    // ----- Cardinal hour positions (minute=0, no interpolation) -----

    [TestMethod]
    [DataRow(12, 0, 0.0,   0.0)]    // 12:00 — both hands at 0 (top)
    [DataRow(3,  0, 90.0,  0.0)]    // 3:00  — hour at 90 (right), minute at 0
    [DataRow(6,  0, 180.0, 0.0)]    // 6:00  — hour at 180 (bottom), minute at 0
    [DataRow(9,  0, 270.0, 0.0)]    // 9:00  — hour at 270 (left), minute at 0
    public void CardinalPositions_CorrectAngles(int hour, int minute, double expectedHour, double expectedMinute)
    {
        Assert.AreEqual(expectedHour,   DialGeometry.GetHourAngleDegrees(hour, minute),   1e-9);
        Assert.AreEqual(expectedMinute, DialGeometry.GetMinuteAngleDegrees(minute),       1e-9);
    }

    // ----- Minute hand interpolation at 3:15 -----

    [TestMethod]
    public void ThreeFifteen_CorrectInterpolatedAngles()
    {
        // minute hand: (15/60)*360 = 90.0
        // hour hand: ((3%12)/12.0 + 15/720.0)*360 = (0.25 + 0.020833...)*360 = 97.5
        double hourAngle   = DialGeometry.GetHourAngleDegrees(3, 15);
        double minuteAngle = DialGeometry.GetMinuteAngleDegrees(15);
        Assert.AreEqual(97.5, hourAngle,   1e-9);
        Assert.AreEqual(90.0, minuteAngle, 1e-9);
    }

    // ----- 12:30 — hour interpolation across noon -----

    [TestMethod]
    public void TwelveThirty_HourHandInterpolated()
    {
        // hour hand: ((12%12)/12.0 + 30/720.0)*360 = (0 + 0.041666...)*360 = 15.0
        // minute hand: (30/60)*360 = 180.0
        double hourAngle   = DialGeometry.GetHourAngleDegrees(12, 30);
        double minuteAngle = DialGeometry.GetMinuteAngleDegrees(30);
        Assert.AreEqual(15.0,  hourAngle,   1e-9);
        Assert.AreEqual(180.0, minuteAngle, 1e-9);
    }
}
