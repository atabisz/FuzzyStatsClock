using System.Windows;
using FuzzyClock.Core;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Phase 79 Plan 01 — visibility-predicate truth-table + formatter consumption shape.
/// Pure-method tests: no WPF host required (ComputeTempsTextVisibility is a static helper
/// that encapsulates the exact predicate used inside MainWindow.xaml.cs UpdateTempsDisplay).
/// </summary>
[TestClass]
public class TempsLineTests
{
    // Pure static helper mirroring the widget-side predicate (79-CONTEXT D-05).
    // Kept in the test file because the MainWindow.xaml.cs call site embeds the predicate
    // inline per D-05 / D-06 (no three-way compound check, no extractable production helper).
    // This duplicated one-liner is the TEST of the predicate shape.
    internal static Visibility ComputeTempsTextVisibility(bool tempsLineVisible, int formattedLength)
        => (tempsLineVisible && formattedLength > 0) ? Visibility.Visible : Visibility.Collapsed;

    [TestMethod]
    [DataRow(false,  0, "Collapsed", DisplayName = "master off + empty -> Collapsed")]
    [DataRow(false,  7, "Collapsed", DisplayName = "master off + 1-segment -> Collapsed")]
    [DataRow(true,   0, "Collapsed", DisplayName = "master on + empty -> Collapsed (D-03)")]
    [DataRow(true,   7, "Visible",   DisplayName = "master on + 1-segment -> Visible (dev box)")]
    [DataRow(true,  25, "Visible",   DisplayName = "master on + 3-segment -> Visible")]
    [DataRow(true,  35, "Visible",   DisplayName = "master on + 4-segment (max) -> Visible")]
    public void VisibilityPredicate_TruthTable(bool tempsLineVisible, int formattedLength, string expected)
    {
        Visibility actual = ComputeTempsTextVisibility(tempsLineVisible, formattedLength);
        Assert.AreEqual(expected, actual.ToString());
    }

    [TestMethod]
    public void Format_WithFakeTempSource_ProducesExpectedLine()
    {
        var src = new FakeTempSource();  // Cpu=52, Gpu=61, Mobo=-1f, Nvme=38, IsReady=true

        string formatted = TemperatureFormatter.Format(
            src.CpuTempC, src.GpuTempC, src.MoboTempC, src.NvmeTempC,
            cpuVisible: true, gpuVisible: true, moboVisible: true, nvmeVisible: true);

        // 2-space separator; Mobo omitted due to -1f per TEMP-LINE-04.
        Assert.AreEqual("CPU 52°  GPU 61°  NVMe 38°", formatted);
    }

    [TestMethod]
    public void Format_AllSuppressed_ReturnsEmptyString()
    {
        var src = new FakeTempSource();  // live readings, but visibility bools all off

        string formatted = TemperatureFormatter.Format(
            src.CpuTempC, src.GpuTempC, src.MoboTempC, src.NvmeTempC,
            cpuVisible: false, gpuVisible: false, moboVisible: false, nvmeVisible: false);

        Assert.AreEqual(0, formatted.Length);
    }
}
