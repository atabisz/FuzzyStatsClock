using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class TemperatureFormatterTests
{
    // ----- All sensors present -----

    [TestMethod]
    public void AllSensorsPresent_AllFourVisible_RendersFullLine()
    {
        string result = TemperatureFormatter.Format(
            cpu: 52f, gpu: 61f, mobo: 45f, nvme: 38f,
            cpuVisible: true, gpuVisible: true, moboVisible: true, nvmeVisible: true);
        Assert.AreEqual("CPU 52°  GPU 61°  Mobo 45°  NVMe 38°", result);
    }

    // ----- Partial N/A (visibility path) -----

    [TestMethod]
    public void PartialNA_CpuAndNvmeOnly_OmitsGpuAndMobo()
    {
        string result = TemperatureFormatter.Format(
            cpu: 52f, gpu: 61f, mobo: 45f, nvme: 38f,
            cpuVisible: true, gpuVisible: false, moboVisible: false, nvmeVisible: true);
        Assert.AreEqual("CPU 52°  NVMe 38°", result);
    }

    // ----- Partial N/A (-1f sentinel path, TEMP-LINE-04) -----

    [TestMethod]
    public void PartialNA_GpuAndMoboSensorUnavailable_OmitsSegments()
    {
        string result = TemperatureFormatter.Format(
            cpu: 52f, gpu: -1f, mobo: -1f, nvme: 38f,
            cpuVisible: true, gpuVisible: true, moboVisible: true, nvmeVisible: true);
        Assert.AreEqual("CPU 52°  NVMe 38°", result,
            "-1f sentinel must hide segment even when visibility is true (TEMP-LINE-04)");
    }

    // ----- All N/A -----

    [TestMethod]
    public void AllNA_ReturnsEmptyString()
    {
        string result = TemperatureFormatter.Format(
            -1f, -1f, -1f, -1f,
            cpuVisible: true, gpuVisible: true, moboVisible: true, nvmeVisible: true);
        Assert.AreEqual("", result,
            "All-NA must return empty string (TEMP-LINE-01 auto-hide contract); not null, not whitespace");
    }

    // ----- All hidden -----

    [TestMethod]
    public void AllHidden_ReturnsEmptyString()
    {
        string result = TemperatureFormatter.Format(
            cpu: 52f, gpu: 61f, mobo: 45f, nvme: 38f,
            cpuVisible: false, gpuVisible: false, moboVisible: false, nvmeVisible: false);
        Assert.AreEqual("", result,
            "All-hidden must return empty string; visibility false suppresses regardless of value");
    }

    // ----- Single sensor -----

    [TestMethod]
    public void SingleSensor_GpuOnly_RendersOneSegment()
    {
        string result = TemperatureFormatter.Format(
            cpu: -1f, gpu: 61f, mobo: -1f, nvme: -1f,
            cpuVisible: true, gpuVisible: true, moboVisible: true, nvmeVisible: true);
        Assert.AreEqual("GPU 61°", result,
            "Single segment must not have leading or trailing separator");
    }

    // ----- Separator discipline -----

    [TestMethod]
    public void TwoSpaceSeparator_BetweenSegments_ExactlyTwoSpaces()
    {
        string result = TemperatureFormatter.Format(
            cpu: 52f, gpu: 61f, mobo: -1f, nvme: -1f,
            cpuVisible: true, gpuVisible: true, moboVisible: true, nvmeVisible: true);
        Assert.AreEqual("CPU 52°  GPU 61°", result);
        Assert.IsTrue (result.Contains("°  GPU"),  "two spaces expected between segments");
        Assert.IsFalse(result.Contains("°   GPU"), "three spaces disallowed");
        Assert.IsFalse(result.Contains("° GPU"),   "one space disallowed");
        Assert.IsTrue (result.StartsWith("CPU"),   "no leading whitespace");
        Assert.IsTrue (result.EndsWith("°"),       "no trailing whitespace");
    }

    // ----- Integer rounding ([DataRow]) -----

    [TestMethod]
    [DataRow(52.4f, "CPU 52°")]
    [DataRow(52.6f, "CPU 53°")]
    [DataRow(52.5f, "CPU 52°")]   // banker's rounding (MidpointRounding.ToEven): 52.5 → 52
    [DataRow(52.0f, "CPU 52°")]
    [DataRow(99.9f, "CPU 100°")]
    public void IntegerRounding_RoundsToNearest(float cpu, string expected)
    {
        string result = TemperatureFormatter.Format(
            cpu, -1f, -1f, -1f,
            cpuVisible: true, gpuVisible: false, moboVisible: false, nvmeVisible: false);
        Assert.AreEqual(expected, result);
    }
}
