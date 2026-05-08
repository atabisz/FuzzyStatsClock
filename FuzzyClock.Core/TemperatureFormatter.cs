namespace FuzzyClock.Core;

/// <summary>
/// Renders the temperature stats line. Segments whose value equals the -1f
/// sentinel (or any negative float), or whose visibility toggle is false,
/// are silently omitted. Output format per TEMP-LINE-02: 2-space separator,
/// integer Celsius, ° symbol only. If every segment is suppressed, returns
/// the empty string (caller collapses TextBlock). REL-03 invariant: this
/// file has zero references to the hardware-sensor package — it compiles
/// in net10.0 with no external PackageReference.
/// </summary>
public static class TemperatureFormatter
{
    /// <summary>
    /// Format a temperature line from four float readings and four visibility flags.
    /// </summary>
    /// <param name="cpu">CPU temp in °C, or -1f for N/A.</param>
    /// <param name="gpu">GPU temp in °C, or -1f for N/A.</param>
    /// <param name="mobo">Motherboard temp in °C, or -1f for N/A.</param>
    /// <param name="nvme">NVMe temp in °C, or -1f for N/A.</param>
    /// <param name="cpuVisible">Include CPU segment when reading is valid.</param>
    /// <param name="gpuVisible">Include GPU segment when reading is valid.</param>
    /// <param name="moboVisible">Include Mobo segment when reading is valid.</param>
    /// <param name="nvmeVisible">Include NVMe segment when reading is valid.</param>
    /// <returns>
    /// Compact inline line with 2-space separator, e.g. "CPU 52°  GPU 61°  NVMe 38°".
    /// Empty string when all four segments are suppressed.
    /// </returns>
    public static string Format(
        float cpu,        float gpu,        float mobo,        float nvme,
        bool  cpuVisible, bool  gpuVisible, bool  moboVisible, bool  nvmeVisible)
    {
        // List<string> + string.Join("  ", ...) — the 2-space separator is handled by
        // Join, which never leaves a trailing separator. At most 4 segments; allocation
        // is trivial. Empty list → "" by Join's contract (no extra empty-case branch).
        var segments = new List<string>(capacity: 4);
        if (cpuVisible  && cpu  >= 0f) segments.Add($"CPU {(int)Math.Round(cpu)}°");
        if (gpuVisible  && gpu  >= 0f) segments.Add($"GPU {(int)Math.Round(gpu)}°");
        if (moboVisible && mobo >= 0f) segments.Add($"Mobo {(int)Math.Round(mobo)}°");
        if (nvmeVisible && nvme >= 0f) segments.Add($"NVMe {(int)Math.Round(nvme)}°");
        return string.Join("  ", segments);   // 2-space separator per TEMP-LINE-02
    }
}
