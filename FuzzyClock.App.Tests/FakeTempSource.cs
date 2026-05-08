// Hardware-free ITempSource double used by downstream tests (Phases 76-79 will
// consume this in Formatter / Settings / Widget tests). Defaults match the
// documented contract:
//   - IsReady=true  (consumers need the gate semantic to flip true immediately)
//   - CpuTempC=52   (plausible steady-state reading)
//   - GpuTempC=61   (plausible steady-state reading; matches spike GPU Hot Spot)
//   - MoboTempC=-1f (TEMP-TAB-03 default OFF; mobo N/A on OEM hardware per spike)
//   - NvmeTempC=38  (plausible NVMe temp; consumer tests can flip to -1f to
//                    exercise the TEMP-LINE-04 "hide segment" path)
using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

public sealed class FakeTempSource : ITempSource
{
    public bool  IsReady    { get; set; } = true;
    public float CpuTempC   { get; set; } = 52f;
    public float GpuTempC   { get; set; } = 61f;
    public float MoboTempC  { get; set; } = -1f;
    public float NvmeTempC  { get; set; } = 38f;

    public int RefreshCallCount { get; private set; }
    public void Refresh() => RefreshCallCount++;
}
