// Source: RESEARCH.md §4 (skeleton); behavior contract in PLAN.md
using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class UpdateVersionComparerTests
{
    // ----- TryParseTag happy path -----
    [TestMethod]
    [DataRow("v4.5.0",        4,  5,  0, -1)]
    [DataRow("V4.5.0",        4,  5,  0, -1)]
    [DataRow("4.5.0",         4,  5,  0, -1)]
    [DataRow("4.5",           4,  5, -1, -1)]
    [DataRow("4.5.0.0",       4,  5,  0,  0)]
    [DataRow("v10.20.30.40", 10, 20, 30, 40)]
    public void TryParseTag_ValidTag_ParsesCorrectly(
        string tag, int expectedMajor, int expectedMinor, int expectedBuild, int expectedRevision)
    {
        Assert.IsTrue(UpdateVersionComparer.TryParseTag(tag, out var v));
        Assert.AreEqual(expectedMajor, v.Major);
        Assert.AreEqual(expectedMinor, v.Minor);
        Assert.AreEqual(expectedBuild, v.Build);
        Assert.AreEqual(expectedRevision, v.Revision);
    }

    // ----- TryParseTag reject path -----
    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("   ")]
    [DataRow("v")]
    [DataRow("garbage")]
    [DataRow("v4.5.0-beta")]
    [DataRow("4.5.0-rc1")]
    [DataRow("v4.5.0-alpha.2")]
    [DataRow("4.5.0+sha.abc")]
    [DataRow("v4.x.0")]
    public void TryParseTag_InvalidTag_ReturnsFalse(string? tag)
    {
        Assert.IsFalse(UpdateVersionComparer.TryParseTag(tag, out _));
    }

    // ----- IsNewer ordering -----
    [TestMethod]
    public void IsNewer_LatestStrictlyGreater_ReturnsTrue()
        => Assert.IsTrue(UpdateVersionComparer.IsNewer(new Version(4, 5, 0), new Version(4, 6, 0)));

    [TestMethod]
    public void IsNewer_RunningEqualsLatest_ReturnsFalse()
        => Assert.IsFalse(UpdateVersionComparer.IsNewer(new Version(4, 5, 0), new Version(4, 5, 0)));

    [TestMethod]
    public void IsNewer_RunningGreaterThanLatest_ReturnsFalse()
        => Assert.IsFalse(UpdateVersionComparer.IsNewer(new Version(4, 6, 0), new Version(4, 5, 0)));

    [TestMethod]
    public void IsNewer_TwoComponentVsThreeComponent_TreatedEqual()
    {
        // System.Version semantic: absent components compare as 0.
        Assert.IsFalse(UpdateVersionComparer.IsNewer(new Version("4.5"), new Version("4.5.0")));
        Assert.IsFalse(UpdateVersionComparer.IsNewer(new Version("4.5.0"), new Version("4.5.0.0")));
    }
}
