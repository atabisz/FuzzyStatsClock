// FuzzyClock temperature sidecar. One JSON line per interval on stdout, forever, until
// the parent closes the pipe or sends SIGTERM.
//
// The sensor priority lists and the resolution walk below are a DELIBERATE MIRROR of
// FuzzyClock.App/TemperatureService.cs:24-34 and :141-205, not an independent design.
// That file is the oracle: it is what shipped in v4.2 and what 633 tests cover, so any
// difference here is a fidelity regression rather than an improvement. The -1f sentinel
// convention comes from the same place (ITempSource.cs) and the stats panel already
// renders it as unavailable, which is why a platform with no sensors degrades through a
// path that exists and is already tested.
//
// Two things the WPF version does that this deliberately does NOT:
//   * No 5s init timeout race. The parent owns the timeout now — it can see this process
//     fail to emit a line and act, which is strictly more information than the in-process
//     version had. Computer.Open() was measured at 4272ms on the dev box
//     (TemperatureService.cs:93-96), so the parent's budget must exceed that.
//   * No silent-failure posture. D-14 kept the widget quiet on init failure; a sidecar
//     writes to stderr instead, because stderr is not the data channel and the parent can
//     log it. Silence was the right call for a UI thread and the wrong one for a process
//     whose only job is to report.

using System.Diagnostics;
using System.Globalization;
using System.Text;
using LibreHardwareMonitor.Hardware;

namespace FuzzyClock.Temps;

internal sealed class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer computer) => computer.Traverse(this);

    public void VisitHardware(IHardware hardware)
    {
        hardware.Update();
        foreach (var sub in hardware.SubHardware) sub.Accept(this);
    }

    public void VisitSensor(ISensor sensor) { }
    public void VisitParameter(IParameter parameter) { }
}

internal static class Program
{
    // Verbatim from TemperatureService.cs:24-34. Do not "improve" these without changing
    // the WPF original too, or the two report different temperatures for one machine.
    private static readonly string[] CpuSensorPriority =
        { "CPU Package", "Core (Tctl/Tdie)", "Core Max", "CPU Core #1" };
    private static readonly string[] GpuSensorPriority =
        { "GPU Core", "GPU Hot Spot", "GPU Temperature" };
    private static readonly string[] MoboSensorPriority =
        { "System", "Motherboard", "CPU", "Chipset" };
    private static readonly string[] NvmeSensorPriority =
        { "Temperature", "Composite" };

    // Mirrors TemperatureService.BackgroundLoopIntervalMs. Overridable so the probe can
    // sample faster than a 2s cadence without waiting minutes for a latency distribution.
    private const int DefaultIntervalMs = 2000;

    private static readonly IVisitor Visitor = new UpdateVisitor();

    private static int Main(string[] args)
    {
        // Invariant culture on the number formatting specifically: a comma decimal
        // separator on a German host would emit "41,5" and produce JSON that parses as
        // two values or not at all. InvariantGlobalization in the csproj covers the
        // process, and this makes the intent local to the code that depends on it.
        CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;

        var once = Array.IndexOf(args, "--once") >= 0;
        var benchIdx = Array.IndexOf(args, "--bench");
        var bench = benchIdx >= 0 && benchIdx + 1 < args.Length
            ? int.Parse(args[benchIdx + 1], CultureInfo.InvariantCulture)
            : 0;
        var intervalIdx = Array.IndexOf(args, "--interval");
        var interval = intervalIdx >= 0 && intervalIdx + 1 < args.Length
            ? int.Parse(args[intervalIdx + 1], CultureInfo.InvariantCulture)
            : DefaultIntervalMs;

        Computer computer;
        long openMs;
        try
        {
            var sw = Stopwatch.StartNew();
            computer = new Computer
            {
                // Exactly the four flags TemperatureService.cs:130-135 sets. All others
                // stay false: enabling more hardware means more to Update() every tick,
                // and Update() cost is the thing this component is built around.
                IsCpuEnabled = true,
                IsGpuEnabled = true,
                IsMotherboardEnabled = true,
                IsStorageEnabled = true,
            };
            computer.Open();
            openMs = sw.ElapsedMilliseconds;
        }
        catch (Exception e)
        {
            // Unlike the WPF version, this is reported. Exit 2 distinguishes "could not
            // open the driver" from "opened but every sensor read null" (which exits 0
            // and emits sentinels), because those need different responses from a parent:
            // the first is a broken install or a missing elevation, the second is a
            // machine without the sensors.
            Console.Error.WriteLine($"open-failed: {e.GetType().Name}: {e.Message}");
            return 2;
        }

        try
        {
            var (cpu, gpu, mobo, nvme) = ResolveAll(computer);
            Console.Error.WriteLine(
                $"ready: open={openMs}ms cpu={Describe(cpu)} gpu={Describe(gpu)} " +
                $"mobo={Describe(mobo)} nvme={Describe(nvme)}");

            if (Array.IndexOf(args, "--dump") >= 0) return RunDump(computer);
            if (bench > 0) return RunBench(computer, bench, cpu, gpu, mobo, nvme);

            while (true)
            {
                var sw = Stopwatch.StartNew();
                computer.Accept(Visitor);
                var updateMs = sw.ElapsedMilliseconds;

                // `update_ms` rides along on every line on purpose. The 608ms figure was
                // measured once on one box; a parent that receives the cost with every
                // reading can notice it drifting on a slower machine instead of assuming
                // a number from someone else's hardware.
                Console.Out.WriteLine(Line(cpu, gpu, mobo, nvme, updateMs));
                Console.Out.Flush();

                if (once) break;

                // Interval measured from the START of the update, so the cadence is the
                // requested one rather than interval-plus-update-cost. A 608ms update on
                // a 2000ms interval would otherwise drift to 2.6s per reading.
                var remaining = interval - (int)sw.ElapsedMilliseconds;
                if (remaining > 0) Thread.Sleep(remaining);
            }
            return 0;
        }
        finally
        {
            try { computer.Close(); } catch { /* releasing a driver handle on the way out */ }
        }
    }

    /// <summary>
    /// Every hardware node and temperature sensor LHM found, with its value.
    ///
    /// This exists because "sensor resolved but reads null" and "no sensor at all" are
    /// different diagnoses with different fixes, and both render as -1 through the normal
    /// output. The first says the driver refused (typically an elevation problem, since
    /// WinRing0 needs ring-0 access for CPU package temperature); the second says the
    /// machine has nothing to read. Deciding between Option A and Option D turns on
    /// exactly that distinction, so it gets its own mode rather than an inference.
    /// </summary>
    private static int RunDump(Computer computer)
    {
        Console.Out.WriteLine($"elevated: {IsElevated()}");
        foreach (var hw in computer.Hardware)
        {
            var temps = hw.Sensors.Where(s => s.SensorType == SensorType.Temperature).ToList();
            Console.Out.WriteLine(
                $"{hw.HardwareType} \"{hw.Name}\" — {temps.Count} temperature sensor(s), " +
                $"{hw.SubHardware.Length} sub");
            foreach (var s in temps)
                Console.Out.WriteLine($"    \"{s.Name}\" = {(s.Value is null ? "NULL" : s.Value.Value.ToString("F1", CultureInfo.InvariantCulture))}");
            foreach (var sub in hw.SubHardware)
            {
                var subTemps = sub.Sensors.Where(s => s.SensorType == SensorType.Temperature).ToList();
                Console.Out.WriteLine($"    sub {sub.HardwareType} \"{sub.Name}\" — {subTemps.Count} temperature sensor(s)");
                foreach (var s in subTemps)
                    Console.Out.WriteLine($"        \"{s.Name}\" = {(s.Value is null ? "NULL" : s.Value.Value.ToString("F1", CultureInfo.InvariantCulture))}");
            }
        }
        Console.Out.Flush();
        return 0;
    }

    private static bool IsElevated()
    {
        try
        {
            using var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
            return new System.Security.Principal.WindowsPrincipal(identity)
                .IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
        }
        catch { return false; }
    }

    /// <summary>
    /// Latency distribution over N reads. Percentiles rather than a mean, because the
    /// question the parent cares about is whether a read can block past its interval —
    /// and a mean of 608ms hides a worst case that a 2s cadence cannot absorb.
    /// </summary>
    private static int RunBench(
        Computer computer, int n, ISensor? cpu, ISensor? gpu, ISensor? mobo, ISensor? nvme)
    {
        var samples = new List<long>(n);
        var readings = new List<string>(n);
        for (var i = 0; i < n; i++)
        {
            var sw = Stopwatch.StartNew();
            computer.Accept(Visitor);
            samples.Add(sw.ElapsedMilliseconds);
            readings.Add(Line(cpu, gpu, mobo, nvme, sw.ElapsedMilliseconds));
        }
        samples.Sort();
        var pct = (double p) => samples[Math.Min(samples.Count - 1, (int)(samples.Count * p))];
        var sb = new StringBuilder();
        sb.Append("{\"bench\":true,\"n\":").Append(n);
        sb.Append(",\"min_ms\":").Append(samples[0]);
        sb.Append(",\"p50_ms\":").Append(pct(0.50));
        sb.Append(",\"p95_ms\":").Append(pct(0.95));
        sb.Append(",\"max_ms\":").Append(samples[^1]);
        sb.Append(",\"mean_ms\":").Append(((double)samples.Sum() / n).ToString("F1", CultureInfo.InvariantCulture));
        sb.Append('}');
        Console.Out.WriteLine(sb.ToString());
        // The readings themselves follow, so the probe can assert real values came back
        // from the same run that produced the timings — rather than trusting that a fast
        // read was also a successful one.
        foreach (var r in readings) Console.Out.WriteLine(r);
        Console.Out.Flush();
        return 0;
    }

    private static string Describe(ISensor? s) => s is null ? "none" : $"\"{s.Name}\"";

    private static string Line(ISensor? cpu, ISensor? gpu, ISensor? mobo, ISensor? nvme, long updateMs)
    {
        var sb = new StringBuilder(96);
        sb.Append("{\"cpu\":").Append(Fmt(cpu));
        sb.Append(",\"gpu\":").Append(Fmt(gpu));
        sb.Append(",\"mobo\":").Append(Fmt(mobo));
        sb.Append(",\"nvme\":").Append(Fmt(nvme));
        sb.Append(",\"update_ms\":").Append(updateMs);
        sb.Append('}');
        return sb.ToString();
    }

    // D-12 boundary translation, same as TemperatureService.ToSentinel: LHM's float? maps
    // to -1, and -1 means "no source". A real reading of 0 stays 0 and is a different
    // thing entirely — which is why null is not folded to zero here.
    private static string Fmt(ISensor? s)
    {
        var v = s?.Value;
        return v is null ? "-1" : v.Value.ToString("F1", CultureInfo.InvariantCulture);
    }

    private static (ISensor? cpu, ISensor? gpu, ISensor? mobo, ISensor? nvme) ResolveAll(Computer computer)
    {
        ISensor? cpu = null, gpu = null, mobo = null, nvme = null;
        foreach (var hw in computer.Hardware)
        {
            switch (hw.HardwareType)
            {
                case HardwareType.Cpu:
                    cpu ??= ResolveFromHardware(hw, CpuSensorPriority);
                    break;
                case HardwareType.GpuNvidia:
                case HardwareType.GpuAmd:
                case HardwareType.GpuIntel:
                    gpu ??= ResolveFromHardware(hw, GpuSensorPriority);
                    break;
                case HardwareType.Motherboard:
                    mobo ??= ResolveFromHardware(hw, MoboSensorPriority);
                    break;
                case HardwareType.Storage:
                    nvme ??= ResolveNvmeSensor(hw);
                    break;
            }
        }
        return (cpu, gpu, mobo, nvme);
    }

    // Case-insensitive priority match, falling back to the first temperature sensor on
    // the hardware (D-08). Identical to TemperatureService.ResolveFromHardware.
    private static ISensor? ResolveFromHardware(IHardware hw, string[] priority)
    {
        foreach (var name in priority)
        {
            var s = hw.Sensors.FirstOrDefault(x =>
                x.SensorType == SensorType.Temperature &&
                string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase));
            if (s is not null) return s;
        }
        return hw.Sensors.FirstOrDefault(x => x.SensorType == SensorType.Temperature);
    }

    // NVMe hangs off HardwareType.Storage: top level first, then SubHardware. The v4.2
    // spike found Storage absent entirely on this box, so a null here is expected rather
    // than a fault — and the probe reports it as such instead of failing on it.
    private static ISensor? ResolveNvmeSensor(IHardware storageHw)
    {
        var top = ResolveFromHardware(storageHw, NvmeSensorPriority);
        if (top is not null) return top;
        foreach (var sub in storageHw.SubHardware)
        {
            var nested = ResolveFromHardware(sub, NvmeSensorPriority);
            if (nested is not null) return nested;
        }
        return null;
    }
}
