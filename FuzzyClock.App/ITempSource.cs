namespace FuzzyClock.App;

/// <summary>
/// Contract for temperature sensor sources. Implementations MUST use -1f as the
/// N/A sentinel on any of the four *TempC properties (matches StatsService convention).
/// Implementations that hold unmanaged resources (e.g., LHM Computer handle) expose
/// IDisposable on the concrete class, NOT on this interface.
/// </summary>
public interface ITempSource
{
    /// <summary>True once initialization has completed (success OR failure).</summary>
    bool IsReady { get; }

    /// <summary>CPU temperature in Celsius, or -1f if unavailable.</summary>
    float CpuTempC { get; }

    /// <summary>GPU temperature in Celsius, or -1f if unavailable.</summary>
    float GpuTempC { get; }

    /// <summary>Motherboard temperature in Celsius, or -1f if unavailable.</summary>
    float MoboTempC { get; }

    /// <summary>NVMe temperature in Celsius, or -1f if unavailable.</summary>
    float NvmeTempC { get; }

    /// <summary>Refresh cached values. Safe no-op before IsReady is true.</summary>
    void Refresh();
}
