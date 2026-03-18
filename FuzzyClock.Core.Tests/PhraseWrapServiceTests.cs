using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class PhraseWrapServiceTests
{
    // ----- Null / empty / single-word guard -----

    [TestMethod]
    public void ComputeSplit_NullPhrase_ReturnsNull()
    {
        Assert.IsNull(PhraseWrapService.ComputeSplit(null!, "midpoint"));
    }

    [TestMethod]
    public void ComputeSplit_EmptyPhrase_ReturnsNull()
    {
        Assert.IsNull(PhraseWrapService.ComputeSplit("", "midpoint"));
    }

    [TestMethod]
    public void ComputeSplit_WhitespacePhrase_ReturnsNull()
    {
        Assert.IsNull(PhraseWrapService.ComputeSplit("   ", "midpoint"));
    }

    [TestMethod]
    public void ComputeSplit_SingleWord_ReturnsNull()
    {
        Assert.IsNull(PhraseWrapService.ComputeSplit("noon", "midpoint"));
    }

    [TestMethod]
    public void ComputeSplit_SingleWordMidnight_ReturnsNull()
    {
        Assert.IsNull(PhraseWrapService.ComputeSplit("midnight", "midpoint"));
    }

    // ----- Midpoint splits -----

    [TestMethod]
    public void ComputeSplit_HalfPastEleven_Midpoint_SplitsCorrectly()
    {
        // "half past eleven" — mid = 8; boundary after "half "(5) then "past "(10)
        // dist(5, 8)=3, dist(10, 8)=2 — nearest is 10 → "half past" | "eleven"
        var result = PhraseWrapService.ComputeSplit("half past eleven", "midpoint");
        Assert.IsNotNull(result);
        Assert.AreEqual("half past", result.Value.Line1);
        Assert.AreEqual("eleven", result.Value.Line2);
    }

    [TestMethod]
    public void ComputeSplit_JustALittleAfterEleven_Midpoint_SplitsAtNearestBoundary()
    {
        // "just a little after eleven" — length=26, mid=13
        // boundaries: "just "(5), "just a "(7), "just a little "(14), "just a little after "(21)
        // dist(5,13)=8, dist(7,13)=6, dist(14,13)=1, dist(21,13)=8
        // nearest boundary: pos=14 → "just a little" | "after eleven"
        var result = PhraseWrapService.ComputeSplit("just a little after eleven", "midpoint");
        Assert.IsNotNull(result);
        Assert.AreEqual("just a little", result.Value.Line1);
        Assert.AreEqual("after eleven", result.Value.Line2);
    }

    [TestMethod]
    public void ComputeSplit_TwoWords_Midpoint_SplitsAtOnlyBoundary()
    {
        var result = PhraseWrapService.ComputeSplit("ten twelve", "midpoint");
        Assert.IsNotNull(result);
        Assert.AreEqual("ten", result.Value.Line1);
        Assert.AreEqual("twelve", result.Value.Line2);
    }

    // ----- Natural splits -----

    [TestMethod]
    public void ComputeSplit_HalfPastEleven_Natural_SplitsAfterHalfPast()
    {
        // "half past " marker → "half past" | "eleven"
        var result = PhraseWrapService.ComputeSplit("half past eleven", "natural");
        Assert.IsNotNull(result);
        Assert.AreEqual("half past", result.Value.Line1);
        Assert.AreEqual("eleven", result.Value.Line2);
    }

    [TestMethod]
    public void ComputeSplit_AlmostAQuarterBefore_Natural_SplitsAfterAlmost()
    {
        // "almost a quarter before " marker → "almost a quarter before" | "twelve"
        var result = PhraseWrapService.ComputeSplit("almost a quarter before twelve", "natural");
        Assert.IsNotNull(result);
        Assert.AreEqual("almost a quarter before", result.Value.Line1);
        Assert.AreEqual("twelve", result.Value.Line2);
    }

    [TestMethod]
    public void ComputeSplit_JustAfterQuarterPast_Natural_UsesLongestMarkerFirst()
    {
        // "just after quarter past " matches before "just after " — longest first
        var result = PhraseWrapService.ComputeSplit("just after quarter past three", "natural");
        Assert.IsNotNull(result);
        Assert.AreEqual("just after quarter past", result.Value.Line1);
        Assert.AreEqual("three", result.Value.Line2);
    }

    [TestMethod]
    public void ComputeSplit_TenPastFive_Natural_SplitsAfterTenPast()
    {
        // "ten past " marker
        var result = PhraseWrapService.ComputeSplit("ten past five", "natural");
        Assert.IsNotNull(result);
        Assert.AreEqual("ten past", result.Value.Line1);
        Assert.AreEqual("five", result.Value.Line2);
    }

    [TestMethod]
    public void ComputeSplit_UnknownPhrase_Natural_FallsBackToMidpoint()
    {
        // "some unknown phrase here" — no marker match, falls back to midpoint
        var result = PhraseWrapService.ComputeSplit("some unknown phrase here", "natural");
        Assert.IsNotNull(result);
        // midpoint fallback: length=24, mid=12; bounds: "some "(5), "some unknown "(13), "some unknown phrase "(20)
        // dist(5,12)=7, dist(13,12)=1 → "some unknown" | "phrase here"
        Assert.AreEqual("some unknown", result.Value.Line1);
        Assert.AreEqual("phrase here", result.Value.Line2);
    }

    // ----- Natural marker coverage -----

    [TestMethod]
    [DataRow("a quarter past six",      "a quarter past",      "six")]
    [DataRow("almost half past two",    "almost half past",    "two")]
    [DataRow("just past half past nine","just past half past",  "nine")]
    [DataRow("a quarter before five",   "a quarter before",    "five")]
    [DataRow("just after seven",        "just after",          "seven")]
    [DataRow("nearly eight",            null,                  null)]   // 2-word fallback still works
    [DataRow("almost nine",             null,                  null)]   // 2-word: "almost" | "nine"
    public void ComputeSplit_Natural_MarkerCoverage(string phrase, string? expectedLine1, string? expectedLine2)
    {
        var result = PhraseWrapService.ComputeSplit(phrase, "natural");
        if (expectedLine1 is null)
        {
            // 2-word phrases: result is non-null (splits at only boundary)
            Assert.IsNotNull(result);
        }
        else
        {
            Assert.IsNotNull(result);
            Assert.AreEqual(expectedLine1, result.Value.Line1, $"Line1 mismatch for '{phrase}'");
            Assert.AreEqual(expectedLine2, result.Value.Line2, $"Line2 mismatch for '{phrase}'");
        }
    }

    // ----- allowNatural=false forces midpoint -----

    [TestMethod]
    public void ComputeSplit_AllowNaturalFalse_UsessMidpointEvenForNaturalStyle()
    {
        // "half past eleven" with style="natural" but allowNatural=false
        // midpoint result same as midpoint test above
        var result = PhraseWrapService.ComputeSplit("half past eleven", "natural", allowNatural: false);
        Assert.IsNotNull(result);
        // midpoint: length=16, mid=8; "half "(5), "half past "(10) — dist(5,8)=3, dist(10,8)=2 → split at 10
        Assert.AreEqual("half past", result.Value.Line1);
        Assert.AreEqual("eleven", result.Value.Line2);
    }

    [TestMethod]
    public void ComputeSplit_AllowNaturalFalse_AlmostAQuarterBefore_UsessMidpoint()
    {
        // "almost a quarter before twelve" — length=30, mid=15
        // bounds: "almost "(7), "almost a "(9), "almost a quarter "(17), "almost a quarter before "(24)
        // dist(7,15)=8, dist(9,15)=6, dist(17,15)=2, dist(24,15)=9 → split at 17
        var result = PhraseWrapService.ComputeSplit("almost a quarter before twelve", "natural", allowNatural: false);
        Assert.IsNotNull(result);
        Assert.AreEqual("almost a quarter", result.Value.Line1);
        Assert.AreEqual("before twelve", result.Value.Line2);
    }

    // ----- Style case-insensitivity / unknown style defaults to midpoint -----

    [TestMethod]
    public void ComputeSplit_UnknownStyle_DefaultsToMidpoint()
    {
        var midpointResult = PhraseWrapService.ComputeSplit("half past eleven", "midpoint");
        var unknownResult  = PhraseWrapService.ComputeSplit("half past eleven", "unknown_style");
        Assert.IsNotNull(midpointResult);
        Assert.IsNotNull(unknownResult);
        Assert.AreEqual(midpointResult.Value.Line1, unknownResult.Value.Line1);
        Assert.AreEqual(midpointResult.Value.Line2, unknownResult.Value.Line2);
    }
}
